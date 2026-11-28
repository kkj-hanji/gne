/** Next-only, private-at-rest exam seating assignments backed by CONTENT KV. */

const INDEX_KEY = "seating:v1:plans";
const AUDIT_KEY = "seating:v1:audit";
const MAX_PLANS = 100;
const MAX_SEATS_PER_PLAN = 3000;
const MAX_TOTAL_SEATS = 12000;
const MAX_STORE_CHARS = 3_000_000;
const LOOKUP_LIMIT = 300;
const LOOKUP_WINDOW_MS = 60 * 60 * 1000;
const MAX_LOOKUP_CLIENTS = 2048;
const lookupAttempts = new Map();

export class SeatingStoreError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "SeatingStoreError";
    this.status = status;
  }
}

function clean(value, limit = 180) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function dateOnly(value) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

function normalizeCrn(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{6,12}$/.test(digits) ? digits : "";
}

function planId(value, fallback) {
  const requested = clean(value, 80).toLowerCase();
  const result = requested || fallback;
  return /^[a-z0-9][a-z0-9._-]{2,79}$/.test(result) ? result : "";
}

function validatePlan(raw = {}) {
  const title = clean(raw.title, 220);
  const subject = clean(raw.subject, 120);
  const date = dateOnly(raw.date);
  const sourceName = clean(raw.sourceName, 140);
  const start = raw.start == null || raw.start === "" ? null : Number(raw.start);
  const end = raw.end == null || raw.end === "" ? null : Number(raw.end);
  if (!title || !subject || !date || !sourceName) throw new SeatingStoreError("A sitting plan needs its title, subject, exam date, and source filename.");
  if ((start == null) !== (end == null) || (start != null && (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || end <= start))) {
    throw new SeatingStoreError("Enter a valid published exam time window, or leave both times empty.");
  }
  if (!Array.isArray(raw.seats) || raw.seats.length < 1 || raw.seats.length > MAX_SEATS_PER_PLAN) {
    throw new SeatingStoreError(`The plan needs 1 to ${MAX_SEATS_PER_PLAN} seat assignments.`);
  }
  const seen = new Set();
  const seats = raw.seats.map((entry) => {
    const crn = normalizeCrn(entry?.crn);
    const room = clean(entry?.room, 120);
    const section = clean(entry?.section, 60);
    const rowLabel = clean(entry?.rowLabel, 24);
    const row = entry?.row == null || entry.row === "" ? null : Number(entry.row);
    if (!crn || !room) throw new SeatingStoreError("Each seat row needs a valid CRN and room.");
    if (row != null && (!Number.isInteger(row) || row < 1 || row > 999)) throw new SeatingStoreError("A seat row number must be between 1 and 999.");
    if (rowLabel && !/^Row-[IVX]+$/i.test(rowLabel)) throw new SeatingStoreError("A seating row label is not valid.");
    if (seen.has(crn)) throw new SeatingStoreError("A CRN appears more than once in this sitting plan.");
    seen.add(crn);
    return { crn, room, ...(row != null ? { row } : {}), ...(rowLabel ? { rowLabel } : {}), ...(section ? { section } : {}) };
  });
  const fallback = `${clean(raw.category, 40)}-${subject}-${date}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = planId(raw.id, fallback);
  if (!id) throw new SeatingStoreError("The sitting plan identifier is not valid.");
  const category = clean(raw.category, 50) || "Exam";
  const sourceUrl = clean(raw.sourceUrl, 700);
  if (sourceUrl && (!/^https:\/\//i.test(sourceUrl) || sourceUrl.length > 700)) throw new SeatingStoreError("The source link must use HTTPS.");
  return {
    id, title, subject, date, start, end, category, sourceName,
    sourceUrl, seats, published: raw.published !== false,
    revision: Math.max(0, Number(raw.revision) || 0) + 1
  };
}

async function readPlans(env) {
  if (!env?.CONTENT?.get || !env?.CONTENT?.put) throw new SeatingStoreError("The private content store is not configured.", 503);
  const value = await env.CONTENT.get(INDEX_KEY, "json");
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
}

async function writeAudit(env, entry) {
  try {
    const current = await env.CONTENT.get(AUDIT_KEY, "json");
    const rows = Array.isArray(current) ? current : [];
    await env.CONTENT.put(AUDIT_KEY, JSON.stringify([{ at: new Date().toISOString(), ...entry }, ...rows].slice(0, 100)));
  } catch { /* audit writes never make a valid plan publish fail */ }
}

function summary(plan) {
  return {
    id: plan.id, title: plan.title, subject: plan.subject, date: plan.date,
    start: plan.start, end: plan.end, category: plan.category,
    sourceName: plan.sourceName, sourceUrl: plan.sourceUrl,
    rows: Array.isArray(plan.seats) ? plan.seats.length : 0,
    published: plan.published !== false, revision: plan.revision || 0
  };
}

export async function listPublicSeatingPlans(env) {
  const plans = await readPlans(env);
  return plans.filter((plan) => plan.published !== false).map(summary).sort((a, b) => a.date.localeCompare(b.date));
}

export async function listAdminSeatingPlans(env) {
  const plans = await readPlans(env);
  return plans.map(summary).sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveSeatingPlan(env, raw, { actor = "owner" } = {}) {
  const current = await readPlans(env);
  const nextPlan = validatePlan(raw);
  const existing = current.find((row) => row.id === nextPlan.id);
  if (existing && Number(raw.revision) !== Number(existing.revision || 0)) {
    throw new SeatingStoreError("This plan changed in another admin session. Refresh before saving.", 409);
  }
  if (!existing && current.length >= MAX_PLANS) throw new SeatingStoreError("The sitting-plan store is full. Remove an old plan first.", 409);
  const otherSeatCount = current.filter((row) => row.id !== nextPlan.id).reduce((sum, row) => sum + (Array.isArray(row.seats) ? row.seats.length : 0), 0);
  if (otherSeatCount + nextPlan.seats.length > MAX_TOTAL_SEATS) throw new SeatingStoreError("The private sitting-plan store has reached its seat-row limit.", 413);
  const now = new Date().toISOString();
  nextPlan.revision = Number(existing?.revision || 0) + 1;
  nextPlan.createdAt = existing?.createdAt || now;
  nextPlan.updatedAt = now;
  nextPlan.updatedBy = clean(actor, 80) || "owner";
  const next = existing ? current.map((row) => row.id === nextPlan.id ? nextPlan : row) : [...current, nextPlan];
  const serialized = JSON.stringify(next);
  if (serialized.length > MAX_STORE_CHARS) throw new SeatingStoreError("The sitting-plan data is larger than the private store limit.", 413);
  await env.CONTENT.put(INDEX_KEY, serialized);
  await writeAudit(env, { action: existing ? "update" : "publish", planId: nextPlan.id, actor: nextPlan.updatedBy });
  return summary(nextPlan);
}

export async function deleteSeatingPlan(env, id, { actor = "owner" } = {}) {
  const current = await readPlans(env);
  const key = clean(id, 80);
  if (!current.some((plan) => plan.id === key)) throw new SeatingStoreError("That sitting plan does not exist.", 404);
  await env.CONTENT.put(INDEX_KEY, JSON.stringify(current.filter((plan) => plan.id !== key)));
  await writeAudit(env, { action: "delete", planId: key, actor: clean(actor, 80) || "owner" });
  return { deleted: key };
}

async function allowLookup(request) {
  const ip = clean(request.headers.get("CF-Connecting-IP") || "unknown", 100);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const token = [...new Uint8Array(digest)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  const prior = lookupAttempts.get(token);
  const current = prior && now - prior.startedAt < LOOKUP_WINDOW_MS ? prior : { startedAt: now, count: 0 };
  if (current.count >= LOOKUP_LIMIT) return false;
  lookupAttempts.delete(token);
  lookupAttempts.set(token, { startedAt: current.startedAt, count: current.count + 1 });
  if (lookupAttempts.size > MAX_LOOKUP_CLIENTS) {
    for (const [key, value] of lookupAttempts) {
      if (now - value.startedAt >= LOOKUP_WINDOW_MS || lookupAttempts.size > MAX_LOOKUP_CLIENTS) lookupAttempts.delete(key);
      if (lookupAttempts.size <= MAX_LOOKUP_CLIENTS) break;
    }
  }
  return true;
}

/** Returns one student's assignment only; the full CRN-to-room table is never public. */
export async function lookupPublishedSeat(env, { planId: id, crn }, request) {
  const key = planId(id, "");
  const normalized = normalizeCrn(crn);
  if (!key || !normalized) throw new SeatingStoreError("Select a published exam and a roster-verified student.");
  if (!await allowLookup(request)) throw new SeatingStoreError("Too many seat lookups from this connection. Try again later.", 429);
  const plans = await readPlans(env);
  const plan = plans.find((row) => row.id === key && row.published !== false);
  if (!plan) throw new SeatingStoreError("No published sitting plan matches that exam.", 404);
  const seat = (plan.seats || []).find((row) => row.crn === normalized);
  return lookupResult(plan, seat);
}

function lookupResult(plan, seat) {
  return {
    plan: summary(plan),
    seat: seat ? { room: seat.room, ...(seat.row != null ? { row: seat.row } : {}), ...(seat.rowLabel ? { rowLabel: seat.rowLabel } : {}), ...(seat.section ? { section: seat.section } : {}) } : null
  };
}

/** Returns one student's assignments for several published papers in one request. */
export async function lookupPublishedSeats(env, { planIds: ids, crn }, request) {
  const normalized = normalizeCrn(crn);
  const keys = Array.isArray(ids) ? [...new Set(ids.map((id) => planId(id, "")).filter(Boolean))] : [];
  if (!normalized || !keys.length || keys.length > 40 || keys.length !== new Set(ids).size) {
    throw new SeatingStoreError("Select one student and between 1 and 40 valid published exams.");
  }
  if (!await allowLookup(request)) throw new SeatingStoreError("Too many seat lookups from this connection. Try again later.", 429);
  const plans = await readPlans(env);
  const results = keys.map((key) => {
    const plan = plans.find((row) => row.id === key && row.published !== false);
    if (!plan) return null;
    const seat = (plan.seats || []).find((row) => row.crn === normalized);
    return lookupResult(plan, seat);
  }).filter(Boolean);
  return { results };
}

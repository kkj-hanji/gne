/**
 * Compass content store — admin-published notices, datesheets, papers, syllabus
 * links, announcements and holiday overrides.
 *
 * Design rules
 *  - KV is the only store. No D1 migration, no external service.
 *  - Every write is validated, bounded and recorded in an audit log.
 *  - The previous value of a collection is kept so a single write can be undone.
 *  - Owner token comes from the ADMIN_API_TOKEN secret. Editor tokens are
 *    SHA-256 hashes stored in KV, so a friend can be added without a redeploy.
 *  - Nothing in this module trusts client input, and nothing is served from a
 *    collection that fails validation.
 */

export const COLLECTIONS = Object.freeze({
  notices: "notices",
  datesheets: "datesheets",
  papers: "papers",
  syllabus: "syllabus",
  announcements: "announcements",
  holidays: "holidays",
  links: "links"
});

const COLLECTION_NAMES = Object.values(COLLECTIONS);
const MAX_ITEMS = 400;
const MAX_TEXT = 4000;
const MAX_TITLE = 220;
const MAX_URL = 700;
const MAX_FILE_BYTES = 1_600_000;
const AUDIT_LIMIT = 120;

const KEY = {
  collection: (name) => `content:v1:${name}`,
  previous: (name) => `content:v1:${name}:previous`,
  meta: "content:v1:meta",
  editors: "content:v1:editors",
  audit: "content:v1:audit",
  file: (id) => `file:v1:${id}`
};

export class ContentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ContentError";
    this.status = status;
  }
}

function clean(value, max = MAX_TEXT) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return "";
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function safeUrl(value, { allowRelative = true } = {}) {
  const raw = clean(value, MAX_URL);
  if (!raw) return "";
  if (allowRelative && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new ContentError("Only https links can be published.");
    return url.toString();
  } catch (error) {
    if (error instanceof ContentError) throw error;
    throw new ContentError("A published link must be a full https URL or a site-relative path.");
  }
}

function slug(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function itemId(prefix, item) {
  const given = clean(item?.id, 80);
  if (given && /^[a-zA-Z0-9._:-]+$/.test(given)) return given;
  return `${prefix}-${slug(item?.title || item?.label || item?.name || "item")}-${Date.now().toString(36)}`;
}

function hasKv(env) {
  return Boolean(env?.CONTENT && typeof env.CONTENT.get === "function" && typeof env.CONTENT.put === "function");
}

function requireKv(env) {
  if (!hasKv(env)) {
    throw new ContentError("The content store is not configured. Add the CONTENT KV binding.", 503);
  }
}

async function readJson(env, key, fallback) {
  const raw = await env.CONTENT.get(key, "json");
  return raw == null ? fallback : raw;
}

async function writeJson(env, key, value) {
  await env.CONTENT.put(key, JSON.stringify(value));
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

/* ── Validation ─────────────────────────────────────────────────────────── */

function validateNotice(raw) {
  const title = clean(raw?.title, MAX_TITLE);
  if (!title) throw new ContentError("A notice needs a title.");
  const url = safeUrl(raw?.url || raw?.link);
  const body = clean(raw?.body);
  if (!url && !body) throw new ContentError("A notice needs an official link or body text.");
  const date = isoDate(raw?.date) || new Date().toISOString().slice(0, 10);
  const category = clean(raw?.category, 40) || "General";
  return {
    title,
    url,
    body,
    date,
    category,
    author: clean(raw?.author, 80) || "Compass admin",
    pinned: Boolean(raw?.pinned),
    published: raw?.published !== false,
    attachments: Array.isArray(raw?.attachments)
      ? raw.attachments.slice(0, 8).map((item) => ({
          label: clean(item?.label, 120) || "Attachment",
          url: safeUrl(item?.url)
        })).filter((item) => item.url)
      : []
  };
}

function validateDatesheet(raw) {
  const title = clean(raw?.title, MAX_TITLE);
  if (!title) throw new ContentError("A date sheet needs a title.");
  const url = safeUrl(raw?.url);
  const body = clean(raw?.body);
  if (!url && !body) throw new ContentError("A date sheet needs a link or transcribed rows.");
  return {
    title,
    url,
    body,
    date: isoDate(raw?.date),
    scope: clean(raw?.scope, 60) || "General",
    department: clean(raw?.department, 80),
    published: raw?.published !== false
  };
}

function validatePaper(raw) {
  const url = safeUrl(raw?.url);
  if (!url) throw new ContentError("A paper needs an official PDF link.");
  if (!/^https:/.test(url)) throw new ContentError("A paper must link to an https PDF.");
  return {
    url,
    subject: clean(raw?.subject, 120),
    code: clean(raw?.code, 40),
    department: clean(raw?.department, 80),
    semester: clean(raw?.semester, 12),
    year: clean(raw?.year, 12),
    type: clean(raw?.type, 40) || "question-bank",
    published: raw?.published !== false
  };
}

function validateSyllabus(raw) {
  const url = safeUrl(raw?.url);
  if (!url) throw new ContentError("A syllabus entry needs an official PDF link.");
  return {
    url,
    label: clean(raw?.label, MAX_TITLE) || "Syllabus document",
    department: clean(raw?.department, 80),
    semester: clean(raw?.semester, 12),
    published: raw?.published !== false
  };
}

function validateAnnouncement(raw) {
  const title = clean(raw?.title, MAX_TITLE);
  const body = clean(raw?.body);
  if (!title || !body) throw new ContentError("An announcement needs a title and a message.");
  const level = ["info", "warning", "critical"].includes(raw?.level) ? raw.level : "info";
  return {
    title,
    body,
    level,
    url: safeUrl(raw?.url),
    published: raw?.published !== false,
    expiresAt: isoDate(raw?.expiresAt)
  };
}

function validateHoliday(raw) {
  const date = isoDate(raw?.date);
  if (!date) throw new ContentError("A holiday override needs a date in YYYY-MM-DD.");
  const name = clean(raw?.name, 160);
  if (!name) throw new ContentError("A holiday override needs a name.");
  const allowed = ["holiday", "working", "restricted", "half-day"];
  const type = allowed.includes(String(raw?.type || "")) ? String(raw.type) : (raw?.off === false ? "working" : "holiday");
  return { date, name, type, off: type !== "working", published: raw?.published !== false };
}

function validateLink(raw) {
  const url = safeUrl(raw?.url);
  if (!url) throw new ContentError("A link needs a URL.");
  return {
    label: clean(raw?.label, 160) || "Official link",
    url,
    group: clean(raw?.group, 60) || "Official",
    published: raw?.published !== false
  };
}

const VALIDATORS = Object.freeze({
  notices: validateNotice,
  datesheets: validateDatesheet,
  papers: validatePaper,
  syllabus: validateSyllabus,
  announcements: validateAnnouncement,
  holidays: validateHoliday,
  links: validateLink
});

function collectionName(value) {
  const name = clean(value, 40).toLowerCase();
  if (!COLLECTION_NAMES.includes(name)) throw new ContentError("Unknown content collection.");
  return name;
}

/* ── Auth ───────────────────────────────────────────────────────────────── */

export async function ownerTokenConfigured(env) {
  return Boolean(clean(env?.ADMIN_API_TOKEN, 400));
}

async function editorRecords(env) {
  if (!hasKv(env)) return [];
  const rows = await readJson(env, KEY.editors, []);
  return Array.isArray(rows) ? rows : [];
}

function bearerToken(request) {
  const header = String(request?.headers?.get?.("Authorization") || "");
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

/** Resolve the caller. Returns { ok, role, actor } and never throws. */
export async function authorize(env, request) {
  const token = bearerToken(request);
  if (!token) return { ok: false, role: "", actor: "" };
  const owner = clean(env?.ADMIN_API_TOKEN, 400);
  if (owner && constantTimeEqual(token, owner)) return { ok: true, role: "owner", actor: "owner" };
  if (!hasKv(env)) return { ok: false, role: "", actor: "" };
  const hash = await sha256(token);
  const editors = await editorRecords(env);
  const match = editors.find((editor) => editor?.active !== false && constantTimeEqual(String(editor?.hash || ""), hash));
  if (match) return { ok: true, role: "editor", actor: clean(match.name, 80) || "editor" };
  return { ok: false, role: "", actor: "" };
}

export async function addEditor(env, { name, token } = {}) {
  requireKv(env);
  const label = clean(name, 80);
  const secret = String(token || "");
  if (!label) throw new ContentError("Give the editor a name.");
  if (secret.length < 16) throw new ContentError("An editor token must be at least 16 characters.");
  const rows = await editorRecords(env);
  const hash = await sha256(secret);
  if (rows.some((editor) => editor.hash === hash)) throw new ContentError("That token already exists.");
  if (rows.length >= 20) throw new ContentError("The editor list is full. Remove an editor first.");
  const next = [...rows, { name: label, hash, createdAt: new Date().toISOString(), active: true }];
  await writeJson(env, KEY.editors, next);
  return next.map(publicEditor);
}

export async function removeEditor(env, { name } = {}) {
  requireKv(env);
  const label = clean(name, 80).toLowerCase();
  const rows = await editorRecords(env);
  const next = rows.filter((editor) => clean(editor.name, 80).toLowerCase() !== label);
  await writeJson(env, KEY.editors, next);
  return next.map(publicEditor);
}

export async function listEditors(env) {
  const rows = await editorRecords(env);
  return rows.map(publicEditor);
}

function publicEditor(editor) {
  return { name: clean(editor?.name, 80), createdAt: clean(editor?.createdAt, 40), active: editor?.active !== false };
}

/* ── Reads and writes ───────────────────────────────────────────────────── */

export async function readCollection(env, name) {
  const collection = collectionName(name);
  if (!hasKv(env)) return [];
  const rows = await readJson(env, KEY.collection(collection), []);
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [];
}

export async function readAll(env) {
  if (!hasKv(env)) {
    return { configured: false, collections: Object.fromEntries(COLLECTION_NAMES.map((name) => [name, []])), meta: null };
  }
  const entries = await Promise.all(COLLECTION_NAMES.map(async (name) => [name, await readCollection(env, name)]));
  return {
    configured: true,
    collections: Object.fromEntries(entries),
    meta: await readJson(env, KEY.meta, null)
  };
}

async function audit(env, entry) {
  try {
    const rows = await readJson(env, KEY.audit, []);
    const next = [{ ...entry, at: new Date().toISOString() }, ...(Array.isArray(rows) ? rows : [])].slice(0, AUDIT_LIMIT);
    await writeJson(env, KEY.audit, next);
  } catch { /* the audit log must never block a write */ }
}

export async function readAudit(env, limit = 40) {
  if (!hasKv(env)) return [];
  const rows = await readJson(env, KEY.audit, []);
  return (Array.isArray(rows) ? rows : []).slice(0, Math.max(1, Number(limit) || 40));
}

export async function upsertItem(env, name, rawItem, { actor = "owner" } = {}) {
  requireKv(env);
  const collection = collectionName(name);
  const validate = VALIDATORS[collection];
  const valid = validate(rawItem || {});
  const current = await readCollection(env, collection);
  if (current.length >= MAX_ITEMS && !current.some((item) => item.id === rawItem?.id)) {
    throw new ContentError("This collection is full. Remove an entry first.", 409);
  }
  const id = itemId(collection.replace(/s$/, ""), { ...valid, id: rawItem?.id });
  const now = new Date().toISOString();
  const existing = current.find((item) => item.id === id);
  const item = {
    ...valid,
    id,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    updatedBy: clean(actor, 80) || "owner"
  };
  const next = existing ? current.map((row) => (row.id === id ? item : row)) : [...current, item];
  await writeJson(env, KEY.previous(collection), current);
  await writeJson(env, KEY.collection(collection), next);
  await writeJson(env, KEY.meta, {
    revision: Number((await readJson(env, KEY.meta, {}))?.revision || 0) + 1,
    updatedAt: now,
    updatedBy: item.updatedBy
  });
  await audit(env, { action: existing ? "update" : "create", collection, id, actor: item.updatedBy });
  return item;
}

export async function deleteItem(env, name, id, { actor = "owner" } = {}) {
  requireKv(env);
  const collection = collectionName(name);
  const key = clean(id, 90);
  if (!key) throw new ContentError("A delete needs an item id.");
  const current = await readCollection(env, collection);
  const next = current.filter((item) => item.id !== key);
  if (next.length === current.length) throw new ContentError("That item does not exist.", 404);
  await writeJson(env, KEY.previous(collection), current);
  await writeJson(env, KEY.collection(collection), next);
  await writeJson(env, KEY.meta, {
    revision: Number((await readJson(env, KEY.meta, {}))?.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: clean(actor, 80) || "owner"
  });
  await audit(env, { action: "delete", collection, id: key, actor: clean(actor, 80) || "owner" });
  return { deleted: key };
}

/** Undo the most recent write to one collection. */
export async function restorePrevious(env, name, { actor = "owner" } = {}) {
  requireKv(env);
  const collection = collectionName(name);
  const previous = await readJson(env, KEY.previous(collection), null);
  if (!Array.isArray(previous)) throw new ContentError("There is no previous version to restore.", 404);
  const current = await readCollection(env, collection);
  await writeJson(env, KEY.collection(collection), previous);
  await writeJson(env, KEY.previous(collection), current);
  await audit(env, { action: "restore", collection, actor: clean(actor, 80) || "owner" });
  return { restored: previous.length };
}

/* ── Files ──────────────────────────────────────────────────────────────── */

const ALLOWED_FILE_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

export async function putFile(env, { bytes, type, name } = {}) {
  requireKv(env);
  const contentType = String(type || "").toLowerCase().split(";")[0].trim();
  if (!ALLOWED_FILE_TYPES.includes(contentType)) {
    throw new ContentError("Only PNG, JPEG, WebP, GIF or PDF uploads are accepted.", 415);
  }
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!data.byteLength) throw new ContentError("The uploaded file is empty.");
  if (data.byteLength > MAX_FILE_BYTES) throw new ContentError("The upload is larger than 1.5 MB.", 413);
  const id = `${Date.now().toString(36)}-${slug(name || "file").slice(0, 40) || "file"}`;
  await env.CONTENT.put(KEY.file(id), data, {
    metadata: { type: contentType, name: clean(name, 120), size: data.byteLength },
    expirationTtl: 60 * 60 * 24 * 365
  });
  return { id, url: `/api/content/file/${id}`, type: contentType, size: data.byteLength };
}

export async function getFile(env, id) {
  requireKv(env);
  const key = clean(id, 80);
  if (!/^[a-z0-9-]{4,80}$/i.test(key)) return null;
  const entry = await env.CONTENT.getWithMetadata(KEY.file(key), "arrayBuffer");
  if (!entry || entry.value == null) return null;
  return {
    bytes: entry.value,
    type: String(entry.metadata?.type || "application/octet-stream"),
    name: String(entry.metadata?.name || key)
  };
}

/** Public payload: only published items, plus the active announcements. */
export function publicPayload(all, nowISO = new Date().toISOString()) {
  const collections = all?.collections || {};
  const published = (rows) => (Array.isArray(rows) ? rows.filter((row) => row?.published !== false) : []);
  const today = String(nowISO).slice(0, 10);
  return {
    configured: Boolean(all?.configured),
    meta: all?.meta || null,
    notices: published(collections.notices),
    datesheets: published(collections.datesheets),
    papers: published(collections.papers),
    syllabus: published(collections.syllabus),
    holidays: published(collections.holidays),
    links: published(collections.links),
    announcements: published(collections.announcements).filter((item) => !item.expiresAt || item.expiresAt >= today)
  };
}

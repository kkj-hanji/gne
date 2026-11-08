// Official GNDEC tentative end-semester examination datesheet.
//
// The Controller of Examination publishes this as a public Google Sheet and
// links it from the ERP noticeboard. The sheet is the source of truth: every
// tab is a department/programme, and every date/subject cell is copied from
// that tab. We intentionally do not invent rooms, reporting times, or a
// morning/evening sitting when the sheet itself does not assign one.
import seed from "./data/datesheet-seed.json" with { type: "json" };

export const ESE_SPREADSHEET_ID = "1scMqukyMApsKyemMTbmm9FNUHWv2weZpj1ZGZe-SUfc";
export const ESE_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${ESE_SPREADSHEET_ID}`;
export const ESE_HTMLVIEW_URL = `${ESE_SPREADSHEET_URL}/htmlview`;
export const ESE_REGISTRY_KEY = "gndec-compass:ese-datesheet:v1";

// The htmlview page is the discovery source. This verified list is only a
// bootstrap/fallback for the first request or a temporary Google outage.
export const KNOWN_ESE_TABS = Object.freeze([
  { id: "applied-sciences", label: "Applied Sciences", gid: "927569471" },
  { id: "ce", label: "CE", gid: "1316315913" },
  { id: "cse", label: "CSE", gid: "772399723" },
  { id: "ee", label: "EE", gid: "1948849421" },
  { id: "ece", label: "ECE", gid: "1643528018" },
  { id: "it", label: "IT", gid: "726898590" },
  { id: "me", label: "ME", gid: "1138608011" },
  { id: "rai", label: "RAI", gid: "2135911947" },
  { id: "bba", label: "BBA", gid: "317475533" },
  { id: "mba", label: "MBA", gid: "1354584652" },
  { id: "bcom", label: "B.Com", gid: "619696405" },
  { id: "bca", label: "BCA", gid: "1377532834" },
  { id: "mca", label: "MCA", gid: "419001169" },
  { id: "bvoc", label: "B.VOC", gid: "703120724" },
  { id: "mtech-ce", label: "M.Tech(CE)", gid: "586805038" },
  { id: "mtech-cse", label: "M.TECH(CSE)", gid: "1165023433" },
  { id: "mtech-ece", label: "M.TEch(ECE)", gid: "1660171489" },
  { id: "mtech-ee", label: "M.Tech(EE)", gid: "600255347" }
]);

const MONTHS = Object.freeze({
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
});
const ROMAN = Object.freeze({ i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 });

export function cleanCell(value) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ").replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text == null ? "" : text).replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === "\"") {
        if (source[index + 1] === "\"") { field += "\""; index += 1; }
        else quoted = false;
      } else field += character;
      continue;
    }
    if (character === "\"") { quoted = true; continue; }
    if (character === ",") { row.push(field); field = ""; continue; }
    if (character === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (character === "\r") continue;
    field += character;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows.at(-1).every((cell) => !cleanCell(cell))) rows.pop();
  return rows;
}

export function parseSheetDate(raw) {
  const text = cleanCell(raw).replace(/,$/, "");
  if (!text) return "";
  let match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) return date.toISOString().slice(0, 10);
  }
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  }
  match = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/i);
  if (match && MONTHS[match[2].toLowerCase()] != null) {
    const date = new Date(Date.UTC(Number(match[3] || new Date().getUTCFullYear()), MONTHS[match[2].toLowerCase()], Number(match[1])));
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  }
  return "";
}

export function romanToNumber(value) {
  const text = cleanCell(value).toLowerCase();
  if (/^\d{1,2}$/.test(text)) return Number(text);
  return ROMAN[text] || 0;
}

function slug(value = "") {
  return cleanCell(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "tab";
}

function decodeJsString(raw) {
  const value = String(raw == null ? "" : raw);
  try { return decodeEntities(JSON.parse(value.startsWith("\"") ? value : `"${value}"`)); }
  catch { return decodeEntities(value.replace(/^"|"$/g, "").replace(/\\\//g, "/").replace(/\\x3d/gi, "=").replace(/\\"/g, "\"")); }
}

export function parseSpreadsheetTabs(html) {
  const tabs = [];
  const seen = new Set();
  const pattern = /items\.push\(\{\s*name:\s*("(?:[^"\\]|\\.)*")\s*,\s*pageUrl:\s*("(?:[^"\\]|\\.)*")\s*,\s*gid:\s*"(\d+)"/g;
  for (const match of String(html || "").matchAll(pattern)) {
    const label = cleanCell(decodeJsString(match[1]));
    const gid = match[3];
    if (!label || !gid || seen.has(gid)) continue;
    seen.add(gid);
    tabs.push({ id: slug(label), label, gid });
  }
  return tabs;
}

export function parseSemesterHeader(raw) {
  const label = cleanCell(raw);
  if (!label || /^date\b/i.test(label) || /^semester\s*\/\s*session$/i.test(label)) return null;
  const match = label.match(/^([IVXLC]+|\d{1,2})\b/i);
  if (!match) return null;
  const semester = match[1].toUpperCase();
  const rest = label.slice(match[0].length).trim();
  const codeMatch = rest.match(/\(([ME])\)|\b([ME])\b\s*$/i);
  const sessionCode = codeMatch ? String(codeMatch[1] || codeMatch[2] || "").toUpperCase() : "";
  const qualifier = rest
    .replace(/\(([ME])\)/gi, " ")
    .replace(/\b([ME])\b\s*$/i, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { label, semester, semesterNumber: romanToNumber(semester), qualifier, sessionCode };
}

function timeToMinutes(hour, minute, period = "") {
  let value = Number(hour);
  const minutes = Number(minute || 0);
  if (!Number.isFinite(value) || !Number.isFinite(minutes)) return null;
  if (value > 12) return value * 60 + minutes;
  // Session windows are published as 9:00-12:00 and 1:00-4:00. In that
  // context 12 means noon, not midnight; only 1..11 need a morning/evening
  // shift. Treating 12 % 12 as 0 silently dropped every morning window.
  if (value === 12) return 12 * 60 + minutes;
  const lower = String(period).toLowerCase();
  if (lower.includes("evening") || lower.includes("afternoon")) value += 12;
  return value * 60 + minutes;
}

export function parseSessionWindows(rows) {
  // Some tabs place the "Sessions" label one column to the left of the
  // Date/Semester header (RAI does this), so locate the label itself instead
  // of assuming it sits in the date column.
  let sessionRow = null;
  let sessionColumn = -1;
  for (const row of rows || []) {
    const index = (row || []).findIndex((cell) => /^sessions?$/i.test(cleanCell(cell)));
    if (index >= 0) { sessionRow = row; sessionColumn = index; break; }
  }
  const byColumn = new Map();
  const windows = [];
  if (!sessionRow) return { byColumn, windows };
  for (let column = sessionColumn + 1; column < sessionRow.length; column += 1) {
    const raw = cleanCell(sessionRow[column]);
    if (!raw) continue;
    const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*[-\u2013\u2014]\s*(\d{1,2})(?::(\d{2}))?\s*(?:\(([^)]+)\))?/);
    if (!match) continue;
    const label = cleanCell(match[5] || "");
    const start = timeToMinutes(match[1], match[2], label);
    const end = timeToMinutes(match[3], match[4], label);
    if (start == null || end == null || end <= start) continue;
    const session = { label, start, end, raw };
    byColumn.set(column, session);
    if (!windows.some((item) => item.start === start && item.end === end && item.label === label)) windows.push(session);
  }
  windows.sort((left, right) => left.start - right.start || left.end - right.end);
  return { byColumn, windows };
}

function sessionKind(session) {
  if (!session) return "";
  const label = String(session.label || "").toLowerCase();
  if (label.includes("morning")) return "M";
  if (label.includes("evening") || label.includes("afternoon")) return "E";
  return session.start < 12 * 60 ? "M" : "E";
}

export function parseEseCsv(csv, tab = {}) {
  const rows = parseCsv(csv).map((row) => row.map(cleanCell));
  let department = "";
  for (const row of rows) {
    for (const cell of row) {
      const match = cell.match(/^department\s*:\s*(.+)$/i);
      if (match) { department = cleanCell(match[1]); break; }
    }
    if (department) break;
  }
  const headerIndex = rows.findIndex((row) => row.some((cell) => /^date\s*\/\s*semester$/i.test(cell)));
  if (headerIndex < 0) {
    return { id: tab.id || slug(tab.label), label: cleanCell(tab.label), gid: String(tab.gid || ""), department: department || cleanCell(tab.label), headers: [], sessions: [], entries: [], sessionAssignmentReliable: false };
  }
  const headerRow = rows[headerIndex];
  const dateColumn = headerRow.findIndex((cell) => /^date\s*\/\s*semester$/i.test(cell));
  // M.Tech tabs publish two programme columns but repeat the same semester
  // header (for example I(E), III(M), I(E)). The merged title row above the
  // header is the only place that names those programmes, so carry the
  // nearest title cell into every column instead of collapsing the entries.
  const programmeRow = (rows[headerIndex - 2] || rows[headerIndex - 1] || []).map(cleanCell);
  const hasProgrammeRow = programmeRow.some((cell) => /(?:M\.?\s*Tech|M\.?\s*E\.?\b)/i.test(cell) && !/^department\s*:/i.test(cell))
    && !programmeRow.some((cell) => /^semester\s*\/\s*session$/i.test(cell));
  const programmeForColumn = (column) => {
    if (!hasProgrammeRow) return "";
    for (let index = Math.min(column, programmeRow.length - 1); index >= 0; index -= 1) {
      const cell = programmeRow[index];
      if (cell && !/^date\s*\/\s*semester$/i.test(cell)) return cell;
    }
    return "";
  };
  const headers = [];
  for (let column = dateColumn + 1; column < headerRow.length; column += 1) {
    const parsed = parseSemesterHeader(headerRow[column]);
    if (parsed) headers.push({ ...parsed, column, programme: programmeForColumn(column) });
  }
  const { windows } = parseSessionWindows(rows, dateColumn);
  // The "Sessions" row is a two-cell legend (morning, evening), not a
  // per-column map. The (M)/(E) suffix on each semester header is the
  // authoritative sitting; attach the matching legend window by kind.
  const sessionByKind = new Map();
  for (const window of windows) {
    const kind = sessionKind(window);
    if (kind && !sessionByKind.has(kind)) sessionByKind.set(kind, window);
  }
  const sessionAssignmentReliable = headers.every((header) => !header.sessionCode || sessionByKind.has(header.sessionCode));
  const entries = [];
  const seen = new Set();
  for (const row of rows.slice(headerIndex + 1)) {
    const date = parseSheetDate(row[dateColumn]);
    if (!date) continue;
    for (const header of headers) {
      const subject = cleanCell(row[header.column]);
      if (!subject || /^[-\u2013\u2014\s]+$/.test(subject)) continue;
      if (/^(?:sessions?|date\s*\/\s*semester)$/i.test(subject)) continue;
      const session = sessionAssignmentReliable && header.sessionCode ? sessionByKind.get(header.sessionCode) || null : null;
      const entry = {
        date,
        subject,
        semester: header.semester,
        semesterNumber: header.semesterNumber,
        header: header.label,
        qualifier: header.qualifier,
        programme: header.programme,
        session: session?.label || "",
        sessionStart: session?.start ?? null,
        sessionEnd: session?.end ?? null,
        sessionRaw: session?.raw || ""
      };
      const key = [entry.date, entry.subject.toLowerCase(), entry.header, entry.programme, entry.session].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }
  const id = tab.id || slug(department || tab.label);
  const label = cleanCell(tab.label);
  // Applied Sciences prints both group headers with an (E) suffix, while the
  // published session row places Chemistry in the morning window and Physics
  // in the evening window. The sheet contradicts itself, so leave each
  // subject's sitting unset instead of presenting a guess as verified.
  const ambiguousSessions = id === "applied-sciences" || /^applied\s+sciences?$/i.test(label);
  const sessionNote = ambiguousSessions
    ? "The official sheet labels both the Chemistry and Physics group headers with (E), while its session legend and the noticeboard copy place Chemistry in the morning window and Physics in the evening window. Verify the sitting on the official notice before travelling; Compass does not guess a session here."
    : "";
  if (ambiguousSessions) {
    for (const entry of entries) {
      entry.session = "";
      entry.sessionStart = null;
      entry.sessionEnd = null;
      entry.sessionRaw = "";
      entry.sessionNote = sessionNote;
    }
  }
  return {
    id,
    label,
    gid: String(tab.gid || ""),
    department: department || label,
    headers: headers.map(({ column, ...header }) => header),
    sessions: windows,
    entries,
    sessionAssignmentReliable: ambiguousSessions ? false : sessionAssignmentReliable,
    sessionNote
  };
}

export function csvUrl(gid) {
  return `${ESE_SPREADSHEET_URL}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(gid)}`;
}

export function tabSourceUrl(gid) {
  return `${ESE_SPREADSHEET_URL}/edit#gid=${encodeURIComponent(gid)}`;
}

export async function buildDatesheet({ fetchImpl = fetch } = {}) {
  let tabs = [];
  let discoveryError = "";
  try {
    const response = await fetchImpl(ESE_HTMLVIEW_URL, { headers: { Accept: "text/html", "User-Agent": "GNDEC-Compass" } });
    if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}`);
    tabs = parseSpreadsheetTabs(await response.text());
  } catch (error) { discoveryError = error.message || "Tab discovery failed"; }
  if (!tabs.length) tabs = KNOWN_ESE_TABS.map((tab) => ({ ...tab }));
  const parsed = await Promise.all(tabs.map(async (tab) => {
    try {
      const response = await fetchImpl(csvUrl(tab.gid), { headers: { Accept: "text/csv" } });
      if (!response.ok) throw new Error(`CSV returned HTTP ${response.status}`);
      const result = parseEseCsv(await response.text(), tab);
      return { ...result, sourceUrl: tabSourceUrl(tab.gid), error: "" };
    } catch (error) {
      return { ...tab, department: tab.label, headers: [], sessions: [], entries: [], sessionAssignmentReliable: false, sourceUrl: tabSourceUrl(tab.gid), error: error.message || "CSV could not be read" };
    }
  }));
  const readable = parsed.filter((tab) => tab.entries.length);
  if (!readable.length) throw new Error(discoveryError || "No official ESE datesheet tab could be read.");
  return {
    title: "Tentative End Semester Examination Date Sheet \u00b7 November\u2013December 2026",
    source: {
      title: "Tentative Date Sheet for Regular End Semester Examinations \u2013 November 2026",
      url: ESE_SPREADSHEET_URL,
      spreadsheetId: ESE_SPREADSHEET_ID,
      publishedBy: "Controller of Examination, GNDEC",
      provenance: "Published as a public Google Sheet linked from the official GNDEC ERP noticeboard. Tabs are department/programme datesheets. The sheet prints session windows but not rooms, seats, or reporting times; no such facts are inferred."
    },
    checkedAt: new Date().toISOString(),
    tabs: parsed,
    totals: {
      tabs: parsed.length,
      readableTabs: readable.length,
      entries: readable.reduce((sum, tab) => sum + tab.entries.length, 0)
    },
    unavailableTabs: parsed.filter((tab) => !tab.entries.length).map((tab) => ({ label: tab.label, gid: tab.gid, error: tab.error || "No dated entries" })),
    discoveryError
  };
}

function identityOf(value) {
  return JSON.stringify({
    tabs: (value?.tabs || []).map((tab) => [tab.gid, tab.label, tab.department, tab.entries]),
    totals: value?.totals
  });
}

export async function refreshDatesheet(env, options = {}) {
  if (!env?.SOURCE_REGISTRY) return null;
  const previous = await env.SOURCE_REGISTRY.get(ESE_REGISTRY_KEY, "json");
  const discovered = await buildDatesheet(options);
  const previousTabs = new Map((previous?.tabs || []).map((tab) => [String(tab.gid), tab]));
  discovered.tabs = discovered.tabs.map((tab) => {
    if (tab.entries.length || !previousTabs.has(String(tab.gid))) return tab;
    return { ...previousTabs.get(String(tab.gid)), stale: true, error: tab.error || "Retained last verified tab" };
  });
  discovered.totals = {
    tabs: discovered.tabs.length,
    readableTabs: discovered.tabs.filter((tab) => tab.entries.length).length,
    entries: discovered.tabs.reduce((sum, tab) => sum + tab.entries.length, 0)
  };
  discovered.unavailableTabs = discovered.tabs.filter((tab) => !tab.entries.length).map((tab) => ({ label: tab.label, gid: tab.gid, error: tab.error || "No dated entries" }));
  discovered.updatedAt = previous && identityOf(previous) === identityOf(discovered) ? previous.updatedAt : new Date().toISOString();
  await env.SOURCE_REGISTRY.put(ESE_REGISTRY_KEY, JSON.stringify(discovered));
  return discovered;
}

export function fallbackDatesheet() {
  return { ...seed, stale: true };
}

export async function readDatesheet(env) {
  if (env?.SOURCE_REGISTRY) {
    try {
      const stored = await env.SOURCE_REGISTRY.get(ESE_REGISTRY_KEY, "json");
      if (stored?.tabs?.length) return stored;
    } catch { /* use the bundled verified snapshot */ }
  }
  return null;
}

export async function datesheetResponse(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/datesheet") return null;
  if (request.method !== "GET") return Response.json({ error: "Use GET." }, { status: 405, headers: { "Cache-Control": "no-store" } });
  let data = await readDatesheet(env);
  let stale = false;
  if (!data) {
    data = fallbackDatesheet();
    stale = true;
    if (env?.SOURCE_REGISTRY && ctx) ctx.waitUntil(refreshDatesheet(env).catch(() => {}));
  }
  return Response.json({ ...data, stale: stale || data.stale === true }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}

export async function datesheetMeta(env) {
  const data = await readDatesheet(env);
  if (!data) return { label: "Tentative End Semester Date Sheet", url: ESE_SPREADSHEET_URL, checkedAt: null, tabs: 0, entries: 0, stale: true };
  return {
    label: data.title || "Tentative End Semester Date Sheet",
    url: data.source?.url || ESE_SPREADSHEET_URL,
    checkedAt: data.checkedAt || null,
    updatedAt: data.updatedAt || null,
    tabs: data.totals?.readableTabs || 0,
    entries: data.totals?.entries || 0,
    stale: data.stale === true
  };
}

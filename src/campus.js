// Official GNDEC campus directory.
//
// Everything in this module is discovered from public GNDEC pages:
//   - ERP noticeboard notices and their published dates
//   - department homepages for the current Head of Department and contact
//   - department academics pages for published study schemes and syllabi
//
// The crawler is deliberately conservative. A department whose page cannot be
// read keeps its previous verified record; nothing is inferred from a name,
// room number, or an unrelated page.
import seed from "./data/campus-seed.json" with { type: "json" };

export const CAMPUS_REGISTRY_KEY = "gndec-compass:campus:v1";
export const NOTICEBOARD_URL = "https://erp.gndec.ac.in/noticeboard";
export const FACULTY_DIRECTORY_URL = "https://gndec.ac.in/faculty/";

export const CAMPUS_DEPARTMENTS = Object.freeze([
  { id: "ce", name: "Civil Engineering", short: "CE", homepage: "https://ce.gndec.ac.in/", academics: ["https://ce.gndec.ac.in/?q=node/2"] },
  { id: "cse", name: "Computer Science & Engineering", short: "CSE", homepage: "https://cse.gndec.ac.in/", academics: ["https://cse.gndec.ac.in/?q=node/14", "https://cse.gndec.ac.in/?q=node/2"] },
  { id: "ece", name: "Electronics & Communication Engineering", short: "ECE", homepage: "https://ece.gndec.ac.in/", academics: ["https://ece.gndec.ac.in/?q=node/2", "https://ece.gndec.ac.in/?q=node/9"] },
  { id: "ee", name: "Electrical Engineering", short: "EE", homepage: "https://ee.gndec.ac.in/", academics: ["https://ee.gndec.ac.in/?q=node/2"] },
  { id: "it", name: "Information Technology", short: "IT", homepage: "https://it.gndec.ac.in/", academics: ["https://it.gndec.ac.in/?q=node/2"] },
  { id: "me", name: "Mechanical & Production Engineering", short: "ME", homepage: "https://me.gndec.ac.in/", academics: ["https://me.gndec.ac.in/?q=node/2", "https://me.gndec.ac.in/?q=node/21"] },
  { id: "mba", name: "Business Administration", short: "MBA", homepage: "https://mba.gndec.ac.in/", academics: ["https://mba.gndec.ac.in/?q=node/11", "https://mba.gndec.ac.in/?q=node/2"] },
  { id: "mca", name: "Computer Applications", short: "MCA", homepage: "https://mca.gndec.ac.in/", academics: ["https://mca.gndec.ac.in/?q=node/12", "https://mca.gndec.ac.in/?q=node/2"] },
  { id: "applied", name: "Applied Sciences", short: "AS", homepage: "https://appsc.gndec.ac.in/", academics: ["https://appsc.gndec.ac.in/academics", "https://appsc.gndec.ac.in/node/27"] },
  { id: "architecture", name: "School of Architecture", short: "ARCH", homepage: "https://architecture.gndec.ac.in/website1/", academics: ["https://architecture.gndec.ac.in/website1/node/4"], contact: "https://architecture.gndec.ac.in/website1/node/5", facultyDirectory: "https://gndec.ac.in/faculty/?deptt=99" }
]);

const MONTHS = Object.freeze({
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
});

export function cleanText(value) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(value = "") {
  return cleanText(String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " "));
}

function slug(value = "") {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

export function parsePublishedDate(raw) {
  const text = cleanText(raw);
  let match = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[1])) return date.toISOString().slice(0, 10);
  }
  match = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (match && MONTHS[match[1].toLowerCase()] != null) {
    const date = new Date(Date.UTC(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2])));
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  }
  match = text.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?),?\s+(20\d{2})\b/i);
  if (match && MONTHS[match[2].toLowerCase()] != null) {
    const date = new Date(Date.UTC(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1])));
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  }
  return "";
}

function noticeCategory(title = "") {
  const text = cleanText(title).toLowerCase();
  if (/date\s*-?\s*sheet|datesheet|examination|exam\b|ese\b|mst|mse/.test(text)) return "Examination";
  if (/admission|document|counsel|fee|scholarship/.test(text)) return "Admissions";
  if (/training|internship|placement|recruit|viva/.test(text)) return "Training & placement";
  if (/holiday|calendar|attendance|readmission/.test(text)) return "Academic";
  if (/notice|reminder|circular|id card/.test(text)) return "Notice";
  return "General";
}

export function parseNoticeboard(html, base = "https://erp.gndec.ac.in/") {
  const source = String(html || "");
  const notices = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']*noticeboard\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const href = cleanText(match[1]);
    const title = stripHtml(match[2]);
    if (!href || !title || seen.has(href)) continue;
    // The published author/date paragraph sits immediately before the title.
    const before = source.slice(Math.max(0, match.index - 700), match.index);
    const paragraphs = [...before.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((item) => stripHtml(item[1])).filter(Boolean);
    const stamp = paragraphs.reverse().find((text) => parsePublishedDate(text));
    if (!stamp) continue;
    const publishedAt = parsePublishedDate(stamp);
    const author = cleanText(stamp.replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/gi, " ").replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ").replace(/\s+/g, " ").trim());
    let url = "";
    try { url = new URL(href, base).toString(); } catch { continue; }
    if (!/^https?:\/\//i.test(url)) continue;
    seen.add(href);
    notices.push({
      id: slug(title),
      title,
      url,
      author: author || "GNDEC",
      publishedAt,
      category: noticeCategory(title),
      source: NOTICEBOARD_URL
    });
  }
  return notices
    .sort((left, right) => String(right.publishedAt).localeCompare(String(left.publishedAt)) || left.title.localeCompare(right.title))
    .slice(0, 120);
}

function phoneFrom(text = "") {
  const match = cleanText(text).match(/\b(?:0?161[-\s]?\d{3}[-\s]?\d{3,4}|0?161[-\s]?\d{7}|\+91[-\s]?\d{5}[-\s]?\d{5})\b/);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function emailFrom(html = "") {
  const matches = [...String(html).matchAll(/href\s*=\s*["']mailto:([^"'?]+)[^"']*["']/gi)].map((match) => decodeURIComponent(match[1]).trim()).filter(Boolean);
  return matches.find((email) => /@gndec\.ac\.in$/i.test(email)) || matches[0] || "";
}

function plausibleHodName(value = "") {
  const name = cleanText(value).replace(/\s*[,;:]+$/, "");
  if (!name || name.length < 5 || name.length > 80) return "";
  if (/department|engineering|college|university|professor|associate|assistant|head|email|phone|contact|address|ludhiana|punjab/i.test(name)) return "";
  if (!/^(?:Dr|Prof|Ar|Pf|Mr|Ms|Mrs)\.?\s*/i.test(name)) return "";
  return name;
}

const HOD_NAME = String.raw`(?<![A-Za-z])((?:Dr|DR|Prof|PROF|Ar|AR|Pf|PF|Mr|MR|Ms|MS|Mrs|MRS)\.?\s*[A-Z][A-Za-z.'-]+(?:\s+(?!(?:Professor|Associate|Assistant|Head|Department|Contact|Email|Phone|Guru|Ludhiana|Punjab)\b)[A-Z][A-Za-z.'-]+){0,4})`;

export function parseHodFromDepartmentPage(html) {
  const raw = String(html || "");
  const text = stripHtml(raw);
  const headingPattern = /\b(?:head\s+of\s+(?:the\s+)?department|hod\s+message|hod\s+profile|head\s+of\s+the\s+department)\b/gi;
  const headings = [...text.matchAll(headingPattern)].map((match) => match.index || 0);
  const explicit = text.match(new RegExp(`${HOD_NAME}\\s+is\\s+[Hh]ead\\s+of\\s+(?:the\\s+)?[Dd]epartment`));
  if (explicit) {
    const name = plausibleHodName(explicit[1]);
    if (name) return { name, email: emailFrom(raw), phone: phoneFrom(text) };
  }
  for (const index of headings) {
    const after = text.slice(index, index + 2200);
    const before = text.slice(Math.max(0, index - 700), index);
    for (const window of [after, before]) {
      const candidate = window.match(new RegExp(`${HOD_NAME}\\s*(?:,)?\\s*(?:Professor|Associate\\s+Professor|Assistant\\s+Professor|Head\\s+of\\s+Department)`))?.[1];
      const name = plausibleHodName(candidate);
      if (name) return { name, email: emailFrom(raw), phone: phoneFrom(window) || phoneFrom(text) };
    }
  }
  return null;
}

export function parseFacultyHead(html) {
  for (const row of String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripHtml(match[1]));
    if (cells.length < 4) continue;
    if (!/head/i.test(cells[1])) continue;
    const name = plausibleHodName(cells[0]);
    if (name) return { name, email: (cells[2].match(/[\w.+-]+@[\w.-]+/)?.[0] || "").trim(), phone: phoneFrom(cells.join(" ")) };
  }
  return null;
}

export function parseSyllabusLinks(html, pageUrl, department) {
  const documents = [];
  const seen = new Set();
  for (const match of String(html || "").matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = stripHtml(match[2]);
    const href = cleanText(match[1]);
    if (!label || !href || /^javascript:/i.test(href)) continue;
    let url = "";
    try { url = new URL(href, pageUrl).toString(); } catch { continue; }
    if (!/^https?:\/\//i.test(url)) continue;
    if (!/\.(?:pdf|docx?|html?)(?:[?#].*)?$/i.test(url)) continue;
    const haystack = `${label} ${decodeURIComponent(url)}`;
    if (!/\b(?:syllab(?:us|i)|study\s*scheme|scheme\s*(?:&|and)?\s*syllabus|curriculum|course\s*(?:scheme|structure)|programme\s*(?:scheme|structure))\b/i.test(haystack)) continue;
    const key = `${department.id}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    documents.push({
      id: slug(`${department.short}-${label}`),
      label: label.slice(0, 180),
      url,
      department: department.name,
      departmentId: department.id,
      sourcePage: pageUrl,
      external: !/^https?:\/\/(?:[^/]+\.)?gndec\.ac\.in\//i.test(url)
    });
  }
  return documents;
}

async function fetchText(fetchImpl, url, accept = "text/html") {
  const response = await fetchImpl(url, { headers: { Accept: accept, "User-Agent": "GNDEC-Compass" } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function readDepartment(fetchImpl, department, previous) {
  let page = "";
  let hod = null;
  let error = "";
  try {
    page = await fetchText(fetchImpl, department.homepage);
    hod = parseHodFromDepartmentPage(page);
    if (!hod && department.facultyDirectory) {
      const facultyHtml = await fetchText(fetchImpl, department.facultyDirectory);
      hod = parseFacultyHead(facultyHtml);
    }
    if (hod && department.contact) {
      try {
        const contactHtml = await fetchText(fetchImpl, department.contact);
        hod.email = hod.email || emailFrom(contactHtml);
        hod.phone = hod.phone || phoneFrom(stripHtml(contactHtml));
      } catch { /* the homepage contact still stands */ }
    }
  } catch (cause) {
    error = cause.message || "Department page could not be read";
  }
  const record = previous || {};
  return {
    ...department,
    hod: hod ? { ...hod, sourceUrl: department.homepage, verified: true } : (record.hod || null),
    error: hod ? "" : (error || record.error || "No Head of Department block was found on the official page"),
    checkedAt: new Date().toISOString()
  };
}

async function readSyllabus(fetchImpl, department, previous) {
  const documents = [];
  const errors = [];
  for (const pageUrl of department.academics || []) {
    try {
      const html = await fetchText(fetchImpl, pageUrl);
      documents.push(...parseSyllabusLinks(html, pageUrl, department));
    } catch (error) { errors.push(error.message || `${pageUrl} could not be read`); }
  }
  const unique = [...new Map(documents.map((document) => [document.url, document])).values()];
  if (unique.length) return { documents: unique, errors };
  const previousDocuments = (previous?.syllabus || []).filter((document) => document.departmentId === department.id);
  return { documents: previousDocuments, errors: previousDocuments.length ? [] : errors };
}

export async function buildCampus({ fetchImpl = fetch, previous = null } = {}) {
  const previousDepartments = new Map((previous?.departments || []).map((department) => [department.id, department]));
  const [noticeResult, departmentResults] = await Promise.all([
    (async () => {
      try { return { notices: parseNoticeboard(await fetchText(fetchImpl, NOTICEBOARD_URL)), error: "" }; }
      catch (error) { return { notices: [], error: error.message || "Noticeboard could not be read" }; }
    })(),
    Promise.all(CAMPUS_DEPARTMENTS.map(async (department) => {
      const record = await readDepartment(fetchImpl, department, previousDepartments.get(department.id));
      const syllabus = await readSyllabus(fetchImpl, department, previous);
      return { ...record, syllabus: syllabus.documents, syllabusErrors: syllabus.errors };
    }))
  ]);
  const notices = noticeResult.notices.length ? noticeResult.notices : (previous?.notices || []);
  const departments = departmentResults.map(({ syllabus, ...department }) => department);
  const syllabus = departmentResults.flatMap((department) => department.syllabus);
  if (!notices.length && !departments.some((department) => department.hod)) throw new Error(noticeResult.error || "No official campus record could be read.");
  return {
    title: "GNDEC campus directory",
    source: {
      noticeboard: NOTICEBOARD_URL,
      facultyDirectory: FACULTY_DIRECTORY_URL,
      provenance: "Department names, Heads of Department, contact details, notices, and syllabus documents are read from public GNDEC pages. A missing value stays missing; Compass does not infer an appointment or a document."
    },
    checkedAt: new Date().toISOString(),
    departments,
    notices,
    syllabus: [...new Map(syllabus.map((document) => [document.url, document])).values()],
    coverage: {
      departments: departments.length,
      departmentsWithHod: departments.filter((department) => department.hod?.name).length,
      notices: notices.length,
      syllabusDocuments: syllabus.length
    },
    noticeboardError: noticeResult.error,
    unavailableDepartments: departments.filter((department) => !department.hod?.name).map((department) => ({ id: department.id, name: department.name, error: department.error }))
  };
}

function identityOf(value) {
  return JSON.stringify({
    departments: (value?.departments || []).map((department) => [department.id, department.hod, department.syllabus]),
    notices: value?.notices,
    syllabus: value?.syllabus
  });
}

export async function refreshCampus(env, options = {}) {
  if (!env?.SOURCE_REGISTRY) return null;
  const previous = await env.SOURCE_REGISTRY.get(CAMPUS_REGISTRY_KEY, "json");
  const discovered = await buildCampus({ ...options, previous });
  discovered.updatedAt = previous && identityOf(previous) === identityOf(discovered) ? previous.updatedAt : new Date().toISOString();
  await env.SOURCE_REGISTRY.put(CAMPUS_REGISTRY_KEY, JSON.stringify(discovered));
  return discovered;
}

export function fallbackCampus() {
  return { ...seed, stale: true };
}

export async function readCampus(env) {
  if (env?.SOURCE_REGISTRY) {
    try {
      const stored = await env.SOURCE_REGISTRY.get(CAMPUS_REGISTRY_KEY, "json");
      if (stored?.departments?.length) return stored;
    } catch { /* use the bundled snapshot */ }
  }
  return null;
}

export async function campusResponse(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/campus") return null;
  if (request.method !== "GET") return Response.json({ error: "Use GET." }, { status: 405, headers: { "Cache-Control": "no-store" } });
  let data = await readCampus(env);
  let stale = false;
  if (!data) {
    data = fallbackCampus();
    stale = true;
    if (env?.SOURCE_REGISTRY && ctx) ctx.waitUntil(refreshCampus(env).catch(() => {}));
  }
  return Response.json({ ...data, stale: stale || data.stale === true }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}

export async function campusMeta(env) {
  const data = await readCampus(env);
  if (!data) return { label: "Campus directory", checkedAt: null, departments: 0, notices: 0, syllabusDocuments: 0, stale: true };
  return {
    label: data.title || "Campus directory",
    checkedAt: data.checkedAt || null,
    updatedAt: data.updatedAt || null,
    departments: data.coverage?.departmentsWithHod || 0,
    notices: data.coverage?.notices || 0,
    syllabusDocuments: data.coverage?.syllabusDocuments || 0,
    stale: data.stale === true
  };
}

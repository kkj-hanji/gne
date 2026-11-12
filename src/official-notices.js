import seed from "./data/official-notices-seed.json" with { type: "json" };

export const OFFICIAL_NOTICES_URL = "https://erp.gndec.ac.in/notice";
export const OFFICIAL_NOTICES_KEY = "gndec-next:official-notices:v1";
const ERP_ORIGIN = "https://erp.gndec.ac.in";
const REFRESH_MS = 4 * 60 * 60 * 1000;
const MAX_INDEX_BYTES = 20_000_000;
const MAX_NOTICES = 80;
const DETAIL_COUNT = 20;

function decode(value = "") {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function text(value = "") {
  return decode(String(value).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function publishedDate(value = "") {
  const raw = text(value);
  let match = raw.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[1])) return date.toISOString().slice(0, 10);
  }
  match = raw.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (!match) return "";
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].findIndex((name) => match[1].toLowerCase().startsWith(name));
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
  return month >= 0 && date.getUTCMonth() === month && date.getUTCDate() === Number(match[2]) ? date.toISOString().slice(0, 10) : "";
}

function safeNoticeUrl(raw, base = ERP_ORIGIN) {
  try {
    const url = new URL(decode(raw), base);
    if (url.protocol !== "https:" || url.hostname !== "erp.gndec.ac.in") return "";
    if (!/^\/noticeboard\/[a-z0-9%._–-]+\/?$/i.test(url.pathname) && !/^\/files\/[a-z0-9%._ -]+\.(?:pdf|docx?|xlsx?|pptx?|png|jpe?g)$/i.test(url.pathname)) return "";
    return url.toString();
  } catch { return ""; }
}

function safeAttachmentUrl(raw, base = ERP_ORIGIN) {
  try {
    const url = new URL(decode(raw), base);
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    const officialCollege = host === "gndec.ac.in" || host.endsWith(".gndec.ac.in");
    const supportedDocument = /\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|csv|txt|rtf|odt|ods|odp|zip|png|jpe?g)$/i.test(url.pathname);
    const googleSheet = (host === "docs.google.com" && /\/(?:spreadsheets|document|presentation)\//i.test(url.pathname)) || (host === "drive.google.com" && /\/file\//i.test(url.pathname));
    if (!(officialCollege && supportedDocument || googleSheet)) return "";
    if (host === "docs.google.com") {
      const sheet = url.pathname.match(/^(\/spreadsheets\/d\/[\w-]+(?:\/(?:edit|htmlview))?)/i);
      const document = url.pathname.match(/^(\/document\/d\/[\w-]+(?:\/edit)?)/i);
      const presentation = url.pathname.match(/^(\/presentation\/d\/[\w-]+(?:\/edit)?)/i);
      url.pathname = (sheet || document || presentation)?.[1] || url.pathname;
      url.search = "";
    }
    return url.toString();
  } catch { return ""; }
}

function category(title) {
  if (/date\s*sheet|datesheet|examination|exam|mse|mst|ese/i.test(title)) return "Examination";
  if (/admission|document|counsel|fee|scholarship/i.test(title)) return "Admissions";
  if (/holiday|calendar|attendance|readmission/i.test(title)) return "Academic";
  return "Notice";
}

function isSensitiveNotice(title, body = "") {
  return /struck[-_ ]?off|student.{0,20}(?:list|detail|record)|merit list|defaulter|disciplin|attendance shortage|result list/i.test(`${title} ${body}`);
}

export function parseOfficialNoticeIndex(html, base = OFFICIAL_NOTICES_URL) {
  const source = String(html || "");
  if (!source || source.length > MAX_INDEX_BYTES) return [];
  const out = [];
  const seen = new Set();
  const anchor = /<a\b[^>]*href\s*=\s*["']([^"']*noticeboard\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchor)) {
    const url = safeNoticeUrl(match[1], base);
    const title = text(match[2]);
    if (!url || !title || seen.has(url)) continue;
    const priorDivider = Math.max(source.lastIndexOf("<hr", match.index), source.lastIndexOf("<hr ", match.index));
    const block = source.slice(Math.max(priorDivider + 4, match.index - 1800), match.index);
    const dateMatches = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((item) => text(item[1]));
    const stamp = [...dateMatches].reverse().find((item) => publishedDate(item));
    const date = publishedDate(stamp);
    if (!date) continue;
    const author = stamp.replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/gi, "").trim() || "GNDEC";
    const id = url.split("/").filter(Boolean).at(-1).toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(url); seen.add(id);
    const sensitive = isSensitiveNotice(title);
    out.push({
      id, title: title.slice(0, 220), url, date, publishedAt: date, author: author.slice(0, 80),
      category: category(title), source: OFFICIAL_NOTICES_URL, attachments: [], body: "",
      privacyNote: sensitive ? "This notice may list student-identifying details. Compass shows the official source link and does not copy names, roll numbers, parent names, or individual reasons into the app." : "",
      sensitive, origin: "campus"
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title)).slice(0, MAX_NOTICES);
}

export function summarizeOfficialNotice(notice, detailHtml = "") {
  if (isSensitiveNotice(notice.title, detailHtml)) {
    return {
      body: /struck[-_ ]?off/i.test(notice.title)
        ? "GNDEC has posted a struck-off notice. The attached official document may contain student names, college and university roll numbers, parent names, and individual reasons. Compass does not copy those personal details; open the source if you need to check your own record."
        : "GNDEC has posted a student-specific notice. The official document may contain personal student records. Compass shows the source link and does not copy those details into the app.",
      privacyNote: "Student-identifying information may be present in the official attachment. Compass does not use your saved profile to search or disclose it."
    };
  }
  const plain = text(detailHtml.replace(/<footer\b[\s\S]*$/i, "").replace(/<nav\b[\s\S]*?<\/nav>/gi, " "));
  const withoutHeader = plain.replace(/^NOTICE\s*/i, "").replace(notice.title, "").replace(/\b\w+\s*\|\s*[A-Za-z]+\s+\d{1,2},?\s+20\d{2}\b/, "").replace(/Dear Students,?\s*/i, "").replace(/Click on the link below to see the notice:?/i, "").replace(/Notice link:?/i, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  if (/\b(?:roll|crn|registration|father|mother|parent|student name|dob|date of birth|mobile|phone number|address)\b/i.test(withoutHeader)) {
    return { body: `${notice.category}: ${notice.title}. Open the official source for the original document.`, privacyNote: "The source may include personal student information. Compass keeps this notice summary general and does not copy record details." };
  }
  return { body: withoutHeader.slice(0, 420), privacyNote: "" };
}

export function parseOfficialNoticeDetail(html, notice) {
  const source = String(html || "");
  const attachments = [];
  const seen = new Set();
  const anchor = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchor)) {
    const url = safeAttachmentUrl(match[1], notice.url);
    const key = url ? attachmentKey(url) : "";
    if (!url || seen.has(key) || !attachmentMatchesNotice(notice, url)) continue;
    seen.add(key);
    attachments.push({ label: attachmentLabel(text(match[2]), url), url });
    if (attachments.length >= 8) break;
  }
  for (const match of source.matchAll(/https:\/\/(?:erp\.gndec\.ac\.in\/files\/[^\s<>"']+|docs\.google\.com\/(?:spreadsheets|document|presentation)\/[^\s<>"']+|drive\.google\.com\/file\/[^\s<>"']+)/gi)) {
    const url = safeAttachmentUrl(match[0].replace(/[),.;]+$/, ""), notice.url);
    const key = url ? attachmentKey(url) : "";
    if (!url || seen.has(key) || !attachmentMatchesNotice(notice, url)) continue;
    seen.add(key);
    attachments.push({ label: attachmentLabel("", url), url });
    if (attachments.length >= 8) break;
  }
  const pageContent = source.match(/<div\b[^>]*class\s*=\s*["'][^"']*page_content[^"']*["'][^>]*>([\s\S]*?)<\/main>/i)?.[1] || source;
  const summary = summarizeOfficialNotice(notice, pageContent);
  return { ...notice, ...summary, attachments };
}

function attachmentMatchesNotice(notice, url) {
  if (!/struck[-_ ]?off/i.test(notice?.title || "")) return true;
  const titleNumber = String(notice.title).match(/notice[_\s-]*(\d+)/i)?.[1];
  const fileName = decode(new URL(url).pathname.split("/").at(-1) || "");
  const fileNumber = fileName.match(/notice[_\s-]*(\d+)/i)?.[1];
  return !titleNumber || !fileNumber || titleNumber === fileNumber;
}

function attachmentKey(url) {
  const parsed = new URL(url);
  if (parsed.hostname === "docs.google.com") return `${parsed.origin}${parsed.pathname}${parsed.hash}`;
  return parsed.toString();
}

function attachmentLabel(label, url) {
  const file = decode(new URL(url).pathname.split("/").at(-1) || "").replace(/\?.*$/, "");
  if (/docs\.google\.com/i.test(url)) return label || "Official Google Sheets document";
  const extension = file.match(/\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|rtf|odt|ods|odp|zip|png|jpe?g)$/i)?.[0] || "";
  const base = label || file;
  return extension && !new RegExp(`${extension.replace(".", "\\.")}\\s*$`, "i").test(base) ? `${base}${extension}` : base.slice(0, 120);
}

async function fetchText(fetchImpl, url, limit = MAX_INDEX_BYTES) {
  const response = await fetchImpl(url, { headers: { Accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`GNDEC notice source returned HTTP ${response.status}.`);
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (declared > limit) throw new Error("GNDEC notice source is larger than the safe import limit.");
  const body = await response.text();
  if (body.length > limit) throw new Error("GNDEC notice source is larger than the safe import limit.");
  return body;
}

export async function fetchOfficialNotices({ fetchImpl = fetch, previous = [] } = {}) {
  const html = await fetchText(fetchImpl, OFFICIAL_NOTICES_URL);
  const latest = parseOfficialNoticeIndex(html);
  if (!latest.length) throw new Error("No dated official GNDEC notices could be verified.");
  const oldByUrl = new Map((Array.isArray(previous) ? previous : []).map((notice) => [notice.url, notice]));
  const selected = latest.slice(0, DETAIL_COUNT);
  const enriched = await Promise.all(selected.map(async (notice) => {
    try {
      const detail = await fetchText(fetchImpl, notice.url, 1_000_000);
      return parseOfficialNoticeDetail(detail, notice);
    } catch {
      const prior = oldByUrl.get(notice.url);
      return prior ? { ...notice, body: prior.body, attachments: prior.attachments, privacyNote: prior.privacyNote } : { ...notice, body: `${notice.category}: ${notice.title}. Open the official notice for its full details.`, privacyNote: notice.sensitive ? "Student-identifying details may appear in the original document. Compass does not copy them into the app." : "" };
    }
  }));
  const byUrl = new Map(enriched.map((notice) => [notice.url, notice]));
  for (const notice of latest.slice(DETAIL_COUNT)) {
    const prior = oldByUrl.get(notice.url);
    byUrl.set(notice.url, prior ? { ...notice, body: prior.body, attachments: prior.attachments, privacyNote: prior.privacyNote } : notice);
  }
  return {
    source: OFFICIAL_NOTICES_URL,
    checkedAt: new Date().toISOString(),
    notices: [...byUrl.values()].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title)).slice(0, MAX_NOTICES)
  };
}

export async function readOfficialNotices(env) {
  try {
    const saved = await env?.CONTENT?.get(OFFICIAL_NOTICES_KEY, "json");
    if (saved?.notices?.length) return saved;
  } catch { /* use the checked-in official bootstrap */ }
  return seed;
}

export async function refreshOfficialNotices(env, { fetchImpl = fetch } = {}) {
  if (!env?.CONTENT?.put) throw new Error("The official notice content store is not configured.");
  const previous = await readOfficialNotices(env);
  const fresh = await fetchOfficialNotices({ fetchImpl, previous: previous.notices });
  await env.CONTENT.put(OFFICIAL_NOTICES_KEY, JSON.stringify(fresh), { expirationTtl: 60 * 60 * 24 * 30 });
  return fresh;
}

export async function officialNoticesResponse(request, env, ctx, deps = {}) {
  if (new URL(request.url).pathname !== "/api/official-notices") return null;
  if (request.method !== "GET" && request.method !== "HEAD") return Response.json({ error: "Use GET." }, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  const value = await readOfficialNotices(env);
  const checkedAt = Date.parse(value.checkedAt || "");
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > REFRESH_MS) {
    const refresh = deps.refresh || refreshOfficialNotices;
    if (ctx?.waitUntil) ctx.waitUntil(refresh(env, deps.options || {}).catch(() => {}));
  }
  return Response.json(value, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300", "X-Content-Type-Options": "nosniff" } });
}

export { seed as officialNoticeSeed };

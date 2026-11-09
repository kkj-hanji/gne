/**
 * Subject question banks and previous-year papers.
 *
 * Every record points at the official PDF. Compass indexes the link and the
 * subject printed in the file name; it never hosts a copy, never claims a
 * solution exists and never guesses an examination year.
 */

const CODE_PATTERN = /\b([A-Z]{2,7}[-\s_]?\d{2,5}[A-Z]?)\b/;

export function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

export function fileNameFromUrl(value) {
  const raw = cleanText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const last = url.pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last);
  } catch {
    return raw.split("/").filter(Boolean).pop() || raw;
  }
}

/** "Data Structures (PCIT-101).pdf" → subject + code. */
export function parsePaperTitle(value) {
  const file = fileNameFromUrl(value).replace(/\.pdf$/i, "");
  const text = cleanText(file.replace(/[_]+/g, " "));
  if (!text) return { subject: "Question bank", code: "" };
  const match = CODE_PATTERN.exec(text.toUpperCase());
  const code = match ? match[1].replace(/\s+/g, "-") : "";
  let subject = code ? text.replace(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "") : text;
  subject = subject.replace(/[()_\-–—]+\s*$/, "").replace(/^\s*[()_\-–—]+/, "").replace(/\s{2,}/g, " ").trim();
  if (!subject) subject = text;
  return { subject: subject.slice(0, 120), code };
}

export function paperId(url) {
  return cleanText(url).toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

export function normalizePaper(raw) {
  const url = cleanText(raw?.url);
  if (!url) return null;
  const parsed = parsePaperTitle(url);
  const subject = cleanText(raw?.subject) || parsed.subject;
  const code = cleanText(raw?.code) || parsed.code;
  const department = cleanText(raw?.department);
  return {
    id: cleanText(raw?.id) || paperId(url),
    title: cleanText(raw?.title) || (code ? `${subject} (${code})` : subject),
    subject,
    code,
    department,
    semester: cleanText(raw?.semester),
    year: cleanText(raw?.year),
    type: cleanText(raw?.type) || "question-bank",
    url,
    source: cleanText(raw?.source),
    addedAt: cleanText(raw?.addedAt)
  };
}

export function buildPaperIndex(records = []) {
  const seen = new Set();
  const items = [];
  for (const raw of Array.isArray(records) ? records : []) {
    const paper = normalizePaper(raw);
    if (!paper) continue;
    const key = paper.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(paper);
  }
  items.sort((a, b) => a.department.localeCompare(b.department) || a.subject.localeCompare(b.subject));
  return items;
}

export function searchPapers(list = [], query = "", { department = "", limit = 60 } = {}) {
  const q = cleanText(query).toLowerCase();
  const tokens = q.split(/\s+/).filter((token) => token.length > 1).slice(0, 8);
  return (Array.isArray(list) ? list : [])
    .filter((paper) => !department || paper.department === department)
    .filter((paper) => {
      if (!tokens.length) return true;
      const haystack = `${paper.subject} ${paper.code} ${paper.department} ${paper.semester} ${paper.year} ${paper.title}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    })
    .slice(0, Math.max(1, Number(limit) || 60));
}

export function groupPapers(list = []) {
  const buckets = new Map();
  for (const paper of Array.isArray(list) ? list : []) {
    const key = paper.department || "General";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(paper);
  }
  return [...buckets.entries()]
    .map(([label, papers]) => ({ label, count: papers.length, papers }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function paperStats(list = []) {
  const items = Array.isArray(list) ? list : [];
  return {
    total: items.length,
    departments: new Set(items.map((paper) => paper.department).filter(Boolean)).size,
    subjects: new Set(items.map((paper) => paper.subject.toLowerCase())).size
  };
}

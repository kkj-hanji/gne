/**
 * Syllabus documents, grouped by department and matched to a semester when the
 * official document label or file name prints one. Compass links the official
 * PDF and never re-types its contents.
 */

export function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

const SEMESTER_PATTERNS = [
  [/\b(?:sem(?:ester)?\s*[-–]?\s*1|1st\s*sem(?:ester)?|first\s*sem(?:ester)?)\b/i, "1"],
  [/\b(?:sem(?:ester)?\s*[-–]?\s*2|2nd\s*sem(?:ester)?|second\s*sem(?:ester)?)\b/i, "2"],
  [/\b(?:sem(?:ester)?\s*[-–]?\s*3|3rd\s*sem(?:ester)?|third\s*sem(?:ester)?)\b/i, "3"],
  [/\b(?:sem(?:ester)?\s*[-–]?\s*4|4th\s*sem(?:ester)?|fourth\s*sem(?:ester)?)\b/i, "4"],
  [/\b(?:sem(?:ester)?\s*[-–]?\s*5|5th\s*sem(?:ester)?|fifth\s*sem(?:ester)?)\b/i, "5"],
  [/\b(?:sem(?:ester)?\s*[-–]?\s*6|6th\s*sem(?:ester)?|sixth\s*sem(?:ester)?)\b/i, "6"],
  [/\b(?:sem(?:ester)?\s*[-–]?\s*7|7th\s*sem(?:ester)?|seventh\s*sem(?:ester)?)\b/i, "7"],
  [/\b(?:sem(?:ester)?\s*[-–]?\s*8|8th\s*sem(?:ester)?|eighth\s*sem(?:ester)?)\b/i, "8"]
];

export function semesterFromLabel(label = "", url = "") {
  const text = `${cleanText(label)} ${String(url || "")}`;
  for (const [pattern, value] of SEMESTER_PATTERNS) {
    if (pattern.test(text)) return value;
  }
  return "";
}

export function normalizeSyllabus(raw) {
  const url = cleanText(raw?.url);
  if (!url) return null;
  const label = cleanText(raw?.label || raw?.title) || "Syllabus document";
  return {
    id: cleanText(raw?.id) || url.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 90),
    label,
    url,
    department: cleanText(raw?.department) || "General",
    departmentId: cleanText(raw?.departmentId),
    sourcePage: cleanText(raw?.sourcePage),
    semester: cleanText(raw?.semester) || semesterFromLabel(label, url),
    external: Boolean(raw?.external),
    type: "syllabus"
  };
}

export function buildSyllabusIndex(records = []) {
  const seen = new Set();
  const items = [];
  for (const raw of Array.isArray(records) ? records : []) {
    const doc = normalizeSyllabus(raw);
    if (!doc) continue;
    const key = doc.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(doc);
  }
  return items.sort((a, b) => a.department.localeCompare(b.department) || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function groupSyllabus(list = []) {
  const buckets = new Map();
  for (const doc of Array.isArray(list) ? list : []) {
    if (!buckets.has(doc.department)) buckets.set(doc.department, []);
    buckets.get(doc.department).push(doc);
  }
  return [...buckets.entries()]
    .map(([label, docs]) => ({
      label,
      count: docs.length,
      semesters: [...new Set(docs.map((doc) => doc.semester).filter(Boolean))].sort((a, b) => Number(a) - Number(b)),
      docs
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function searchSyllabus(list = [], query = "", { department = "", limit = 40 } = {}) {
  const q = cleanText(query).toLowerCase();
  const tokens = q.split(/\s+/).filter((token) => token.length > 1).slice(0, 8);
  return (Array.isArray(list) ? list : [])
    .filter((doc) => !department || doc.department === department)
    .filter((doc) => {
      if (!tokens.length) return true;
      const haystack = `${doc.label} ${doc.department} ${doc.semester} ${doc.url}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    })
    .slice(0, Math.max(1, Number(limit) || 40));
}

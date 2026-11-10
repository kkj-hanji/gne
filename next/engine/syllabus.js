/**
 * Syllabus documents, grouped by department and matched to a semester when the
 * official document label or file name prints one. Compass links the official
 * PDF and never re-types its contents.
 */

export function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

/** Parse course blocks from the official indexed first-year PDF text. */
export function parseFirstYearSyllabus(pages = []) {
  const text = (Array.isArray(pages) ? pages : []).map((page) => String(page?.text || "")).join("\n");
  const starts = [...text.matchAll(/\bCourse\s+Code\s*:\s*([A-Z][A-Z\s]{1,8}\d[\d\s]*)\b/gi)];
  const courses = [];
  for (let index = 0; index < starts.length; index += 1) {
    const block = text.slice(starts[index].index, starts[index + 1]?.index || text.length);
    const code = starts[index][1].replace(/\s+/g, "").toUpperCase();
    const title = cleanText(block.match(/Course\s+Title\s*:\s*([\s\S]*?)(?=\s+(?:Programme|Semester|L\s*:|Credits\s*:)|$)/i)?.[1] || "")
      .replace(/\bEng\s+ineering\b/gi, "Engineering").replace(/\bP\s+rogramming\b/gi, "Programming");
    if (!title) continue;
    const contentsStart = block.search(/\bContents\b/i);
    const contents = contentsStart >= 0 ? block.slice(contentsStart) : "";
    const units = [...contents.matchAll(/U\s*ni\s*t\s*-\s*(\d+)\s+([\s\S]*?)(?=\s*U\s*ni\s*t\s*-\s*\d+|\s*(?:Laboratory Work|Text Books|Reference Books|Online Learning)|$)/gi)]
      .map((match) => {
        const raw = cleanText(match[2]);
        const hours = raw.match(/\b\d+\s*\(L\)(?:\s*\+\s*\d+\s*\([PT]\))*\s*hrs?\b/i);
        const titleEnd = hours?.index ?? raw.length;
        const detailStart = hours ? titleEnd + hours[0].length : raw.length;
        return { number: match[1], title: raw.slice(0, titleEnd).trim(), details: raw.slice(detailStart).trim().slice(0, 1200) };
      }).filter((unit) => unit.title);
    if (!units.length) continue;
    courses.push({ code, title, semester: cleanText(block.match(/Semester\s*:\s*([^\n]{1,30}?)(?=\s+(?:Theory\s*\/\s*Practical|Teaching Hours|Total Max|Course Type)|$)/i)?.[1] || ""), units });
  }
  return [...new Map(courses.map((course) => [course.code, course])).values()];
}

/** Answer a syllabus query only from the extracted official first-year PDF text. */
export function answerFirstYearSyllabus(question = "", courses = [], previousCourse = "") {
  if (!Array.isArray(courses) || !courses.length) return null;
  const normalized = cleanText(question).toLowerCase();
  const aliases = [
    ["programming for problem solving", ["pps", "programming", "problem solving"]],
    ["engineering drawing and graphics", ["edg", "drawing", "graphics"]],
    ["manufacturing practices", ["workshop", "mp", "manufacturing"]],
    ["mathematics", ["math", "maths", "mathematics"]],
    ["physics", ["physics", "phy"]], ["chemistry", ["chemistry", "chem"]],
    ["professional english communication", ["english", "pec"]], ["economics", ["economics", "eco"]],
    ["basic electrical and electronics engineering", ["bee", "beee", "electrical"]]
  ];
  const explicitCode = courses.find((course) => new RegExp(`\\b${course.code}\\b`, "i").test(normalized));
  const mathLevel = normalized.match(/\b(?:math(?:ematics)?|maths)\s*[- ]?\s*(i{1,3}|1|2)\b/)?.[1];
  const mathRoman = mathLevel === "1" ? "i" : mathLevel === "2" ? "ii" : mathLevel;
  const explicit = explicitCode || courses.find((course) => {
    const title = course.title.toLowerCase();
    if (mathRoman && title.includes("mathematics")) return title.endsWith(` ${mathRoman}`);
    return normalized.includes(title) || aliases.some(([canonical, words]) => title.includes(canonical) && words.some((word) => new RegExp(`\\b${word}\\b`, "i").test(normalized)));
  });
  const course = explicit || courses.find((item) => item.code === previousCourse);
  if (!course) return null;
  const asksSyllabus = /syllabus|unit|units|chapter|chapters|topic|topics|contents|course outline/i.test(normalized);
  if (!asksSyllabus) return null;
  const unitMatch = normalized.match(/\b(?:unit|u)\s*(?:-|number|no\.?\s*)?([1-9])\b/)
    || normalized.match(/\b(unit|chapter)\s+(one|two|three|four|five|six|seven|eight|nine)\b/);
  const unitNumber = unitMatch ? (Number(unitMatch[1]) || { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }[unitMatch[2]]) : 0;
  const units = unitNumber ? course.units.filter((unit) => Number(unit.number) === unitNumber) : course.units;
  if (!units.length) return null;
  return {
    course,
    html: `<p><strong>${escapeHtml(course.title)} · ${escapeHtml(course.code)}${course.semester ? ` · Semester ${escapeHtml(course.semester)}` : ""}</strong></p><ol>${units.map((unit) => `<li><strong>Unit ${escapeHtml(unit.number)}: ${escapeHtml(unit.title)}</strong>${unit.details ? `<p>${escapeHtml(unit.details)}</p>` : ""}</li>`).join("")}</ol><p class="answer-source">Extracted from the official GNDEC first-year syllabus. <a href="https://appsc.gndec.ac.in/sites/default/files/2026-03/ss%20and%20Syllabus%20sem1%2C2%20Dec%202025%20unsigned.pdf" target="_blank" rel="noopener noreferrer">Open the source PDF</a> to verify the full wording.</p>`,
    intent: "SYLLABUS_CONTENT", confidence: 0.92,
    plan: ["match the official indexed course", "read the requested unit from extracted PDF text", "include the official source limitation"],
    entities: { syllabusCourseCode: course.code }
  };
}

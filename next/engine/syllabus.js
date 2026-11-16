/**
 * Syllabus documents, grouped by department and matched to a semester when the
 * official document label or file name prints one. Compass links the official
 * PDF and never re-types its contents.
 */

import { examGroupForSection } from "./exams.js";
import { ACADEMIC_PERIODS } from "./calendar.js";
import { canonicalize, tokenSimilar } from "./language.js";

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
function cleanFirstYearPdfText(value) {
  return String(value == null ? "" : value)
    // Remove repeating PDF page furniture, including OCR's joined page count.
    .replace(/\b\d+\s+of\s+30\s+Scheme\s+Code\s*[-–—]?\s*2024\b/gi, " ")
    .replace(/\bScheme\s+Code\s*[-–—]?\s*2024\b/gi, " ")
    .replace(/Guru\s+Nanak\s+Dev\s+Engineering\s+College,?\s+Ludhiana\s+An\s+Autonomous\s+College\s+under\s+UGC\s+Act\s+1956\s+(?:st\s+)?B\.?\s*Tech\.?\s+1\s+Year\s*\(Common\s+for\s+all\s+Branches\)/gi, " ")
    .replace(/\bPart\s*[-–—]\s*[AB]\b/gi, " ")
    // Repair known line-wrap OCR splits from this source PDF.
    .replace(/\bPol\s+ar\b/gi, "Polar")
    .replace(/\bcontinuo\s+us\b/gi, "continuous")
    .replace(/\bconst\s+ants\b/gi, "constants")
    .replace(/\bcooli\s+ng\b/gi, "cooling")
    .replace(/\bcorrel\s+ation\b/gi, "correlation")
    .replace(/\bsolutio\s+n\b/gi, "solution")
    .replace(/\bhy\s+perbolic\b/gi, "hyperbolic")
    .replace(/\bprac\s+tice\b/gi, "practice")
    .replace(/\s+/g, " ").trim();
}

export function parseFirstYearSyllabus(pages = []) {
  const text = cleanFirstYearPdfText((Array.isArray(pages) ? pages : []).map((page) => String(page?.text || "")).join("\n"));
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
export function answerFirstYearSyllabus(question = "", courses = [], previousCourse = "", { semester = "" } = {}) {
  if (!Array.isArray(courses) || !courses.length) return null;
  const normalized = cleanText(question).toLowerCase()
    .replace(/\bsyl+ab(?:u|o)s\b/g, "syllabus")
    .replace(/\bsyllab(?:u|o)s\b/g, "syllabus");
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
  // A semester-2 student who types only "maths syllabus" gets Mathematics-II,
  // never the semester-1 course that happens to come first in the PDF.
  const wantedMath = mathRoman || (semester === "2" ? "ii" : semester === "1" ? "i" : "");
  const explicit = explicitCode || courses.find((course) => {
    const title = course.title.toLowerCase();
    if (wantedMath && title.includes("mathematics")) return new RegExp(`(?:^|\\s)${wantedMath}$`).test(title.trim());
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

/* ── First-year study scheme (official Applied Sciences PDF) ────────────── */

export const FIRST_YEAR_SCHEME_SOURCE = "https://appsc.gndec.ac.in/sites/default/files/2026-03/ss%20and%20Syllabus%20sem1%2C2%20Dec%202025%20unsigned.pdf";

/**
 * Fixed nickname table. A student may type the code, the printed title, the
 * college shortform ("edg", "pps", "workshop") or a typo; matching is bounded
 * and deterministic.
 */
const SCHEME_ALIASES = Object.freeze({
  BSC101: ["physics", "phy"],
  BSC102: ["mathematics-i", "mathematics 1", "math 1", "maths 1", "math-i", "maths-i", "m1"],
  BSC103: ["chemistry", "chem"],
  BSC104: ["mathematics-ii", "mathematics 2", "math 2", "maths 2", "math-ii", "maths-ii", "m2"],
  ESC101: ["bee", "beee", "basic electrical", "electrical", "electronics"],
  ESC102: ["edg", "engineering drawing", "drawing", "graphics"],
  ESC103: ["pps", "programming for problem solving", "problem solving", "c programming", "programming"],
  ESC105: ["python", "programming fundamentals", "programming fundamentals using python", "programming"],
  HSMC101: ["english", "professional english", "communication", "pec"],
  HSMC102: ["economics", "eco"],
  LESC104: ["workshop", "manufacturing", "manufacturing practices", "mp"],
  MPD101: ["mpd", "mentoring", "professional development", "mentoring and professional development"]
});

const SCHEME_TOPIC = /\b(?:scheme|syllabus structure|course structure|credits?|marks?|marking|assessment|internal|external|continuous assessment|ca|ese|mse|mst|mid semester|mid sem|weightage|distribution|total|passing|pass|minimum|duration|prerequisites?|practical|theory|ltp)\b/i;

function groupName(value = "") {
  const text = cleanText(value).toLowerCase();
  if (text.includes("chemistry")) return "Chemistry";
  if (text.includes("physics")) return "Physics";
  return "";
}

function schemeCourseList(scheme) {
  return Array.isArray(scheme?.courses) ? scheme.courses.filter((course) => course && course.code) : [];
}

function courseScore(course, text, tokens) {
  const aliases = [course.title, ...(SCHEME_ALIASES[course.code] || [])];
  let score = 0;
  for (const alias of aliases) {
    const normalized = canonicalize(alias);
    if (!normalized) continue;
    if (normalized.includes(" ")) {
      if (` ${text} `.includes(` ${normalized} `)) score = Math.max(score, 1);
      continue;
    }
    if (tokens.includes(normalized)) {
      score = Math.max(score, 1);
      continue;
    }
    if (normalized.length < 3 || /\d/.test(normalized)) continue;
    for (const token of tokens) {
      if (token.length < 3) continue;
      const similarity = tokenSimilar(token, normalized);
      if (similarity > score) score = similarity;
    }
  }
  return score;
}

/**
 * Resolve a course from any spelling. Math-I and Math-II are disambiguated from
 * an explicit level first, then from the student's semester. When neither is
 * known both are returned so the answer can show them side by side.
 */
export function resolveFirstYearSchemeCourse(question = "", scheme = null, { semester = "", previousCourse = "" } = {}) {
  const courses = schemeCourseList(scheme);
  if (!courses.length) return { course: null, candidates: [] };
  const raw = String(question || "").toLowerCase();
  const text = canonicalize(question);
  const tokens = text.split(" ").filter(Boolean);

  const explicitCode = courses.find((course) => new RegExp(`\\b${String(course.code).toLowerCase()}\\b`).test(text));
  if (explicitCode) return { course: explicitCode, candidates: [] };

  const level = text.match(/\b(?:math|maths|mathematics)\s*[- ]?\s*(ii|2|i|1)\b/)?.[1]
    || raw.match(/\bm\s*[- ]?(ii|2|i|1)\b/)?.[1];
  const mathMentioned = /\b(?:math|maths|mathematics)\b/.test(text) || Boolean(raw.match(/\bm\s*[- ]?[12]\b/));
  if (mathMentioned) {
    const byCode = (code) => courses.find((course) => course.code === code) || null;
    if (level && /^(?:ii|2)$/i.test(level)) return { course: byCode("BSC104"), candidates: [] };
    if (level) return { course: byCode("BSC102"), candidates: [] };
    if (semester === "2") return { course: byCode("BSC104"), candidates: [] };
    if (semester === "1") return { course: byCode("BSC102"), candidates: [] };
    return { course: null, candidates: [byCode("BSC102"), byCode("BSC104")].filter(Boolean), ambiguousMath: true };
  }

  const ranked = courses
    .map((course) => ({ course, score: courseScore(course, text, tokens) }))
    .filter((entry) => entry.score >= 0.82)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) {
    const previous = courses.find((course) => course.code === previousCourse);
    return { course: previous || null, candidates: [] };
  }
  if (ranked.length > 1 && semester) {
    const inSemester = ranked.filter((entry) => (entry.course.semesters || []).includes(Number(semester)));
    if (inSemester.length === 1) return { course: inSemester[0].course, candidates: [] };
  }
  if (ranked.length === 1 || ranked[0].score - (ranked[1]?.score || 0) >= 0.08) {
    return { course: ranked[0].course, candidates: [] };
  }
  return { course: null, candidates: ranked.slice(0, 4).map((entry) => entry.course) };
}

/**
 * Infer the student's first-year semester and group without inventing data.
 * The section name is a published first-year section, and the timetable
 * section identifies the first-year cohort and the published academic period
 * identifies its current semester. Section-wide timetables can contain mixed,
 * stale, or next-semester subjects, so their subject names are never allowed
 * to override an applicable official first-year calendar period.
 */
export function inferFirstYearContext({ section = "", schedule = [], now = null } = {}) {
  const subjects = (Array.isArray(schedule) ? schedule : [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.subject || entry?.title || ""))
    .filter(Boolean)
    .join(" ");
  const text = subjects.toLowerCase();
  const sectionGroup = groupName(examGroupForSection(section));

  let group = sectionGroup;
  let groupSource = sectionGroup ? "section" : "";
  if (!group) {
    if (/\b(?:chemistry|chem|bsc103)\b/.test(text)) {
      group = "Chemistry";
      groupSource = "timetable";
    } else if (/\b(?:physics|phy|bsc101)\b/.test(text)) {
      group = "Physics";
      groupSource = "timetable";
    }
  }

  let dateISO = "";
  if (typeof now === "string") dateISO = now.slice(0, 10);
  else if (now instanceof Date && Number.isFinite(now.getTime())) dateISO = now.toISOString().slice(0, 10);
  else if (now?.dateISO) dateISO = String(now.dateISO).slice(0, 10);

  let semester = "";
  let semesterSource = "";
  // The first-year academic calendar is the authoritative current-term signal.
  // This prevents a shared timetable that includes MATH II/Python/mentoring
  // from silently changing a first-year user's current semester.
  const academicPeriod = ACADEMIC_PERIODS.find((period) => period.kind === "first"
    && dateISO >= period.start && dateISO < period.examsStart);
  if (sectionGroup && academicPeriod) {
    semester = "1";
    semesterSource = "academic-calendar";
  } else if (sectionGroup && dateISO) {
    // Seasonal estimate only when no published first-year period covers today.
    // Keep this labelled as estimated; do not infer from timetable subjects.
    const month = Number(dateISO.slice(5, 7)) - 1;
    if (Number.isFinite(month) && month >= 0 && month <= 11) {
      semester = month >= 6 ? "1" : "2";
      semesterSource = "academic-calendar-estimate";
    }
  }

  return { section: cleanText(section), group, groupSource, semester, semesterSource, subjects };
}

function schemeCourseLabel(course) {
  return `${course.title || course.code} · ${course.code}`;
}

function schemeMarks(course) {
  const ca = course.caMarks ?? course.internalMarks;
  const ese = course.eseMarks ?? course.externalMarks;
  return {
    ca: Number.isFinite(Number(ca)) ? Number(ca) : null,
    ese: Number.isFinite(Number(ese)) ? Number(ese) : null,
    total: Number.isFinite(Number(course.totalMarks)) ? Number(course.totalMarks) : null
  };
}

function schemeCourseHtml(course, { semester = "", group = "", asksMse = false } = {}) {
  const marks = schemeMarks(course);
  const semesters = (course.semesters || []).map(String);
  const groups = course.groups || [];
  const context = [
    semesters.length ? `semester ${semesters.join(" and ")}` : "",
    groups.length ? `${groups.join(" / ")} group` : ""
  ].filter(Boolean).join(" · ");
  const selected = semester && semesters.includes(String(semester));
  const facts = [
    ["Credits", course.credits == null ? "Not printed" : String(course.credits)],
    ["L / T / P", [course.lectureHours, course.tutorialHours, course.practicalHours].every((value) => value != null)
      ? `${course.lectureHours} / ${course.tutorialHours} / ${course.practicalHours}` : "Not printed"],
    ["Course type", course.courseType || "Not printed"],
    ["Theory / practical", course.theoryPractical || "Not printed"],
    ["ESE duration", course.eseDurationHours ? `${course.eseDurationHours} hours` : (course.eseDurationNote || "Not printed")],
    ["Minimum numerical %", course.minNumericalPercent == null
      ? (course.minNumericalNote ? `Printed as ${course.minNumericalNote}` : "Not printed")
      : `${course.minNumericalPercent}% of the ESE paper`],
    ["Prerequisites", course.prerequisites || "Not printed"],
    ["Material allowed in ESE", course.additionalMaterial || "Not printed"]
  ];
  return `<p><strong>${escapeHtml(schemeCourseLabel(course))}</strong></p>
    <p class="answer-meta">${escapeHtml(context || "First year")}${selected ? " · this matches your semester" : ""}${group ? ` · your group is ${escapeHtml(group)}` : ""}</p>
    <div class="scheme-marks">
      <div class="scheme-mark"><span>Continuous Assessment (CA · internal)</span><strong>${marks.ca == null ? "NIL" : `${marks.ca} marks`}</strong></div>
      <div class="scheme-mark"><span>End Semester Examination (ESE · external)</span><strong>${marks.ese == null ? "NIL" : `${marks.ese} marks`}</strong></div>
      <div class="scheme-mark is-total"><span>Total maximum</span><strong>${marks.total == null ? "Not printed" : `${marks.total} marks`}</strong></div>
    </div>
    <dl class="scheme-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
    ${course.assessmentNote ? `<p class="answer-meta"><strong>Official assessment note:</strong> ${escapeHtml(course.assessmentNote)}</p>` : ""}
    <p class="answer-meta"><strong>MSE-1 / MSE-2:</strong> the official study scheme prints one Continuous Assessment total${marks.ca == null ? "" : ` (${marks.ca} marks)`} and does <strong>not</strong> publish how it is split between MSE-1, MSE-2 or any later MSE. Compass will not invent a split.${asksMse ? " Ask the Applied Sciences department or check the current MSE notice for the sitting pattern." : ""}</p>
    <p class="answer-source">Official source: Applied Sciences study scheme &amp; syllabus, B.Tech. first year (Semester 1 and 2, Dec 2025). <a href="${FIRST_YEAR_SCHEME_SOURCE}" target="_blank" rel="noopener noreferrer">Open the PDF</a> to verify.</p>`;
}

function schemeListingHtml(semester, groups, scheme, { activeSemester = "", activeGroup = "" } = {}) {
  const blocks = groups.map((group) => {
    const bucket = scheme?.semesters?.[semester]?.[group];
    if (!bucket?.courses?.length) return "";
    const rows = bucket.courses.map((code) => schemeCourseList(scheme).find((course) => course.code === code)).filter(Boolean);
    return `<h4 class="scheme-group-title">${escapeHtml(group)} group${activeGroup === group ? " · your group" : ""} · ${escapeHtml(String(bucket.credits))} credits</h4>
      <div class="table-wrap"><table class="scheme-table">
        <thead><tr><th>Code</th><th>Course</th><th>Credits</th><th>CA</th><th>ESE</th><th>Total</th></tr></thead>
        <tbody>${rows.map((course) => {
          const marks = schemeMarks(course);
          return `<tr><td>${escapeHtml(course.code)}</td><td>${escapeHtml(course.title)}</td><td>${course.credits ?? "—"}</td><td>${marks.ca ?? "NIL"}</td><td>${marks.ese ?? "NIL"}</td><td>${marks.total ?? "—"}</td></tr>`;
        }).join("")}</tbody>
        <tfoot><tr><th colspan="2">Semester total</th><th>${bucket.credits}</th><th>${bucket.internalMarks}</th><th>${bucket.externalMarks}</th><th>${bucket.totalMarks}</th></tr></tfoot>
      </table></div>`;
  }).filter(Boolean).join("");
  if (!blocks) return "";
  return `<p><strong>Semester ${escapeHtml(semester)} · official study scheme</strong>${activeSemester === String(semester) ? " · your semester" : ""}</p>${blocks}`;
}

/**
 * Answer credits, marks, assessment, MSE, L/T/P and semester-scheme questions
 * only from the verified scheme bundle. Returns null for unit/chapter requests
 * so the syllabus-content answer keeps handling those.
 */
export function answerFirstYearScheme(question = "", scheme = null, { semester = "", group = "", section = "", now = null, previousCourse = "" } = {}) {
  if (!schemeCourseList(scheme).length) return null;
  const text = canonicalize(question);
  const raw = String(question || "").toLowerCase();

  // Unit/chapter requests belong to the syllabus-content answer.
  if (/\b(?:unit|units|chapter|chapters|topic|topics|contents|course outline)\b/.test(text)) return null;

  const asksMse = /\b(?:mse\s*-?\s*\d?|mst\s*-?\s*\d?|mid\s*sem(?:ester)?|continuous assessment|\bca\b)\b/i.test(raw);
  const identity = /\b(?:my (?:group|semester)|which (?:group|semester)|what (?:group|semester)|mera group|meri group|mera semester|meri semester|kaun sa group|konsa group|kaunsi semester|konsi semester|which sem am i)\b/i.test(raw);
  if (identity) {
    const inferred = inferFirstYearContext({ section, now });
    const resolvedGroup = group || inferred.group;
    const resolvedSemester = semester || inferred.semester;
    if (!resolvedGroup && !resolvedSemester) return null;
    return {
      html: `<p><strong>Your first-year group and semester</strong></p>
        <dl class="scheme-facts">
          <div><dt>Section</dt><dd>${escapeHtml(section || "Not selected")}</dd></div>
          <div><dt>Group</dt><dd>${escapeHtml(resolvedGroup || "Not printed for this section")}</dd></div>
          <div><dt>Semester</dt><dd>${resolvedSemester ? `Semester ${escapeHtml(resolvedSemester)}` : "Not known"}</dd></div>
        </dl>
        <p class="answer-meta">Compass reads your group from the selected first-year section. During a published first-year academic period, it uses that calendar period for the current semester; timetable subject names cannot override it. Outside a published period, the semester is only a seasonal estimate. Nothing is stored on the server.</p>
        <p class="answer-source">Group names come from the official first-year study scheme. <a href="${FIRST_YEAR_SCHEME_SOURCE}" target="_blank" rel="noopener noreferrer">Open the PDF</a>.</p>`,
      intent: "FIRST_YEAR_IDENTITY", confidence: 0.9,
      plan: ["read the selected first-year section", "use the published first-year academic period when available", "never promote the semester from mixed timetable subjects"],
      entities: { firstYearSemester: resolvedSemester, firstYearGroup: resolvedGroup }
    };
  }

  const resolved = resolveFirstYearSchemeCourse(question, scheme, { semester, previousCourse });
  if (resolved.course) {
    return {
      html: schemeCourseHtml(resolved.course, { semester, group, asksMse }),
      intent: "FIRST_YEAR_SCHEME_COURSE", confidence: 0.94,
      plan: ["match the official course code, title or shortform", "read credits and marks from the verified scheme bundle", "state the published MSE limitation"],
      entities: { syllabusCourseCode: resolved.course.code, firstYearSemester: semester, firstYearGroup: group }
    };
  }
  if (resolved.candidates?.length) {
    return {
      html: `<p><strong>${resolved.ambiguousMath ? "Mathematics-I and Mathematics-II are two different courses" : "That shortform matches more than one course"}</strong></p>
        ${resolved.ambiguousMath ? `<p>Mathematics-I (BSC102) is the semester 1 course and Mathematics-II (BSC104) is the semester 2 course. Your semester is not known here, so both are shown.${semester ? "" : " Select your section/subgroup in Timetable or tell me your semester."}</p>` : ""}
        ${resolved.candidates.map((course) => schemeCourseHtml(course, { semester, group, asksMse })).join("")}`,
      intent: "FIRST_YEAR_SCHEME_AMBIGUOUS", confidence: 0.8,
      plan: ["match both published courses", "show each official course instead of guessing", "ask for the semester when needed"],
      entities: { firstYearSemester: semester, firstYearGroup: group }
    };
  }

  const wantsList = /\b(?:scheme|study scheme|course structure|subjects|papers|courses)\b/.test(text)
    || (SCHEME_TOPIC.test(text) && /\bsemester\b/.test(text));
  if (!wantsList) return null;

  const semesterMatch = text.match(/\bsem(?:ester)?\s*[- ]?\s*([12])\b/)
    || raw.match(/\b([12])(?:st|nd)?\s*sem(?:ester)?\b/);
  const groupMatch = /\bchemistry\b|\bchem\b/.test(text) ? "Chemistry"
    : /\bphysics\b|\bphy\b/.test(text) ? "Physics" : "";
  const wantedSemesters = semesterMatch ? [semesterMatch[1]] : (semester ? [semester] : ["1", "2"]);
  const wantedGroups = groupMatch ? [groupMatch]
    : (group && (scheme?.semesters?.[wantedSemesters[0]]?.[group]) ? [group] : Object.keys(scheme?.semesters?.[wantedSemesters[0]] || {}));
  const blocks = wantedSemesters.map((sem) => schemeListingHtml(sem, wantedGroups, scheme, {
    activeSemester: semester, activeGroup: group
  })).filter(Boolean).join("");
  if (!blocks) return null;
  return {
    html: `<p><strong>B.Tech. first-year study scheme · Scheme Code 2024</strong></p>
      <p class="answer-meta">Published by the Department of Applied Sciences for semester 1 and 2 (Dec 2025). CA is the internal component and ESE is the external component.</p>
      ${blocks}
      <p class="answer-meta"><strong>MSE-1 / MSE-2:</strong> the PDF publishes one Continuous Assessment total per course. It does not publish an MSE-1/MSE-2 split, so no split is shown.</p>
      <p class="answer-source">Official source: <a href="${FIRST_YEAR_SCHEME_SOURCE}" target="_blank" rel="noopener noreferrer">Study Scheme &amp; Syllabus, first year, Dec 2025</a>. Verify any later revision with the department.</p>`,
    intent: "FIRST_YEAR_SCHEME", confidence: 0.93,
    plan: ["read the verified first-year scheme bundle", "group by published semester and group", "state the published assessment limitation"],
    entities: { firstYearSemester: semester, firstYearGroup: group }
  };
}


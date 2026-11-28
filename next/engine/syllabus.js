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
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*1|1st\s*sem(?:ester)?s?|first\s*sem(?:ester)?s?)\b/i, "1"],
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*2|2nd\s*sem(?:ester)?s?|second\s*sem(?:ester)?s?)\b/i, "2"],
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*3|3rd\s*sem(?:ester)?s?|third\s*sem(?:ester)?s?)\b/i, "3"],
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*4|4th\s*sem(?:ester)?s?|fourth\s*sem(?:ester)?s?)\b/i, "4"],
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*5|5th\s*sem(?:ester)?s?|fifth\s*sem(?:ester)?s?)\b/i, "5"],
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*6|6th\s*sem(?:ester)?s?|sixth\s*sem(?:ester)?s?)\b/i, "6"],
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*7|7th\s*sem(?:ester)?s?|seventh\s*sem(?:ester)?s?)\b/i, "7"],
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*8|8th\s*sem(?:ester)?s?|eighth\s*sem(?:ester)?s?)\b/i, "8"],
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*9|9th\s*sem(?:ester)?s?|ninth\s*sem(?:ester)?s?)\b/i, "9"],
  [/\b(?:sem(?:ester)?s?\s*[-–]?\s*10|10th\s*sem(?:ester)?s?|tenth\s*sem(?:ester)?s?)\b/i, "10"]
];

const SEMESTER_WORD_PATTERNS = [
  [/\bsem(?:ester)?s?\s*[-–]?\s*(one|two|three|four|five|six|seven|eight|nine|ten|i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/i],
  [/\b(one|two|three|four|five|six|seven|eight|nine|ten|i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*sem(?:ester)?s?\b/i]
];
const SEMESTER_WORD_VALUES = Object.freeze({ one: "1", i: "1", two: "2", ii: "2", three: "3", iii: "3", four: "4", iv: "4", five: "5", v: "5", six: "6", vi: "6", seven: "7", vii: "7", eight: "8", viii: "8", nine: "9", ix: "9", ten: "10", x: "10" });

const DEPARTMENT_ALIASES = Object.freeze({
  "Civil Engineering": ["civil engineering", "civil", "ce"],
  "Computer Science & Engineering": ["computer science and engineering", "computer science", "cse"],
  "Electronics & Communication Engineering": ["electronics and communication engineering", "electronics and communication", "ece"],
  "Electrical Engineering": ["electrical engineering", "electrical", "ee"],
  "Mechanical & Production Engineering": ["mechanical and production engineering", "mechanical engineering", "mechanical", "production engineering", "me"],
  "Business Administration": ["business administration", "mba", "bba"],
  "Computer Applications": ["computer applications", "mca", "bca"],
  "Applied Sciences": ["applied sciences", "applied science", "app sciences", "appsc", "first year", "first-year"],
  "Information Technology": ["information technology", "information tech", "it"],
  "School of Architecture": ["school of architecture", "architecture", "barch", "b arch", "b.arch"]
});

const PROGRAM_ALIASES = Object.freeze({
  "B.Tech. Robotics and Artificial Intelligence": ["robotics and artificial intelligence", "robotics and ai", "rai"],
  "B.Tech. Mechanical Engineering": ["mechanical engineering", "mechanical"],
  "BBA": ["bba", "bachelor of business administration"],
  "B.Com. Entrepreneurship": ["bcom", "b com", "commerce entrepreneurship"],
  "B.Arch.": ["b.arch", "b arch", "bachelor of architecture"],
  "BCA": ["bca", "bachelor of computer applications"],
  "MCA": ["mca", "master of computer applications"]
});

function escapedPattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function officialGndecPdfUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && (parsed.hostname === "gndec.ac.in" || parsed.hostname.endsWith(".gndec.ac.in"));
  } catch {
    return false;
  }
}

function trustedSyllabusPdfUrl(source = {}) {
  if (officialGndecPdfUrl(source.sourceUrl)) return true;
  return source.department === "School of Architecture"
    && source.sourcePage === "https://architecture.gndec.ac.in/website1/node/4"
    && source.sourceUrl === "https://ptu.ac.in/wp-content/uploads/2022/03/Syllabus-of-B.Arch_.-1st-2nd-Sem.-Batch-2021-onwards.pdf";
}

function minimumIndexedCourseCount(source = {}, semester = "") {
  const program = String(source.program || "");
  if (/^B\.Tech\./i.test(program)) return String(semester) === "8" ? 2 : 4;
  if (program === "BCA") return 4;
  if (program === "MCA") return 3;
  if (program === "BBA" || program.startsWith("B.Com")) return 4;
  return 3;
}

function indexedCourseCountFor(source = {}, semester = "") {
  const counts = source.courseCountsBySemester;
  if (counts && typeof counts === "object") return Number(counts[String(semester)]) || 0;
  return Number(source.courseCount) || 0;
}

function isCompleteSyllabusSemester(source = {}, semester = "") {
  return indexedCourseCountFor(source, semester) >= minimumIndexedCourseCount(source, semester);
}

function departmentAliasMatches(text, department) {
  const aliases = DEPARTMENT_ALIASES[department] || [department];
  return aliases.some((alias) => {
    const normalized = alias.toLowerCase();
    if (normalized === "it" && /\b(?:is|was|will|can|could|does|do|has|have|had)\s+it\b/.test(text)) return false;
    if (normalized === "me" && /\b(?:show|tell|give|send|find|help|remind)\s+me\b/.test(text)) return false;
    return new RegExp(`(?:^|\\b)${escapedPattern(alias).replace(/\s+/g, "\\s+")}(?:\\b|$)`, "i").test(text);
  });
}

export function syllabusDepartmentFromText(text = "", documents = []) {
  let query = cleanText(text).toLowerCase().replace(/&/g, "and");
  for (const aliases of Object.values(DEPARTMENT_ALIASES)) {
    for (const alias of aliases) {
      const escaped = escapedPattern(alias).replace(/\s+/g, "\\s+");
      query = query.replace(new RegExp(`(^|[^a-z0-9])(${escaped})((?:10|[1-9]))(?=$|[^0-9])`, "gi"), "$1$2 $3");
      query = query.replace(new RegExp(`(^|[^0-9])((?:10|[1-9]))(${escaped})(?=$|[^a-z0-9])`, "gi"), "$1$2 $3");
    }
  }
  const departments = [...new Set((Array.isArray(documents) ? documents : []).map((doc) => doc.department).filter(Boolean))];
  const knownDepartments = departments.length ? departments : Object.keys(DEPARTMENT_ALIASES);
  return knownDepartments.find((department) => departmentAliasMatches(query, department)) || "";
}

export function syllabusProgramFromText(text = "", documents = []) {
  const programs = [...new Set((Array.isArray(documents) ? documents : []).map((doc) => doc.program).filter(Boolean))];
  let query = cleanText(text).toLowerCase().replace(/&/g, "and");
  for (const program of programs) {
    for (const alias of [program, ...(PROGRAM_ALIASES[program] || [])]) {
      const escaped = escapedPattern(alias.toLowerCase().replace(/&/g, "and")).replace(/\s+/g, "\\s+");
      query = query.replace(new RegExp(`(^|[^a-z0-9])(${escaped})((?:10|[1-9]))(?=$|[^0-9])`, "gi"), "$1$2 $3");
      query = query.replace(new RegExp(`(^|[^0-9])((?:10|[1-9]))(${escaped})(?=$|[^a-z0-9])`, "gi"), "$1$2 $3");
    }
  }
  return programs.find((program) => {
    const aliases = [program, ...(PROGRAM_ALIASES[program] || [])];
    return aliases.some((alias) => {
      const normalized = alias.toLowerCase().replace(/&/g, "and");
      return new RegExp(`(?:^|\\b)${escapedPattern(normalized).replace(/\s+/g, "\\s+")}(?:\\b|$)`, "i").test(query);
    });
  }) || "";
}

export function semesterFromQuestion(text = "") {
  const explicit = semesterFromLabel(text);
  if (explicit) return explicit;
  const query = cleanText(text).toLowerCase().replace(/&/g, "and");
  // Common compact student shorthand: CSE3, ECE 5, CE-4 or "3 CSE".
  // Only branch aliases participate, so "Math 2" remains a course query.
  for (const aliases of Object.values(DEPARTMENT_ALIASES)) {
    for (const alias of aliases) {
      const escaped = escapedPattern(alias).replace(/\s+/g, "\\s+");
      const afterBranch = new RegExp(`(?:^|[^a-z0-9])${escaped}\\s*[-:]?\\s*((?:10|[1-9]))(?=$|[^0-9])`, "i").exec(query);
      const beforeBranch = new RegExp(`(?:^|[^0-9])((?:10|[1-9]))\\s*${escaped}(?=$|[^a-z0-9])`, "i").exec(query);
      const match = afterBranch?.[1] || beforeBranch?.[1];
      if (match) return match;
    }
  }
  for (const aliases of Object.values(PROGRAM_ALIASES)) {
    for (const alias of aliases) {
      const escaped = escapedPattern(alias).replace(/\s+/g, "\\s+");
      const afterProgram = new RegExp(`(?:^|[^a-z0-9])${escaped}\\s*[-:]?\\s*((?:10|[1-9]))(?=$|[^0-9])`, "i").exec(query);
      const beforeProgram = new RegExp(`(?:^|[^0-9])((?:10|[1-9]))\\s*${escaped}(?=$|[^a-z0-9])`, "i").exec(query);
      const match = afterProgram?.[1] || beforeProgram?.[1];
      if (match) return match;
    }
  }
  const compactSyllabus = /(?:^|[^a-z0-9])(?:syllabus|syllabi|subjects?)\s*((?:10|[1-9]))(?=$|[^0-9])|(?:^|[^0-9])((?:10|[1-9]))\s*(?:syllabus|syllabi|subjects?)(?=$|[^a-z0-9])/i.exec(query);
  if (compactSyllabus) return compactSyllabus[1] || compactSyllabus[2] || "";
  const compactSemester = /(?:^|[^a-z0-9])((?:10|[1-9]))\s*sem(?:ester)?s?(?=$|[^a-z0-9])|(?:^|[^a-z0-9])sem(?:ester)?s?\s*[-:]?\s*((?:10|[1-9]))(?=$|[^0-9])/i.exec(query);
  return compactSemester?.[1] || compactSemester?.[2] || "";
}

export function semestersFromLabel(label = "", url = "") {
  const text = `${cleanText(label)} ${String(url || "")}`.toLowerCase();
  const found = new Set();
  for (const [pattern, value] of SEMESTER_PATTERNS) {
    const global = new RegExp(pattern.source, "gi");
    if (global.test(text)) found.add(value);
  }
  for (const [pattern] of SEMESTER_WORD_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) found.add(SEMESTER_WORD_VALUES[match[1].toLowerCase()]);
  }
  const ranges = [
    /\b(?:sem(?:ester)?s?\s*)?((?:10|[1-9]))(?:st|nd|rd|th)?\s*(?:&|and|,|–|-|to)\s*((?:10|[1-9]))(?:st|nd|rd|th)?\s*sem(?:ester)?s?\b/gi,
    /\bsem(?:ester)?s?\s*((?:10|[1-9]))\s*(?:&|and|,|–|-|to)\s*((?:10|[1-9]))\b/gi
  ];
  for (const pattern of ranges) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[1]);
      found.add(match[2]);
    }
  }
  return [...found].sort((a, b) => Number(a) - Number(b));
}

export function semesterFromLabel(label = "", url = "") {
  return semestersFromLabel(label, url)[0] || "";
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
    program: cleanText(raw?.program),
    departmentId: cleanText(raw?.departmentId),
    sourcePage: cleanText(raw?.sourcePage),
    semester: cleanText(raw?.semester) || semesterFromLabel(label, url),
    semesters: Array.isArray(raw?.semesters) && raw.semesters.length
      ? [...new Set(raw.semesters.map(String).filter((value) => /^(?:10|[1-9])$/.test(value)))]
      : semestersFromLabel(label, url),
    external: Boolean(raw?.external),
    maxSemester: Number(raw?.maxSemester) || 0,
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

export function searchSyllabus(list = [], query = "", { department = "", program = "", semester = "", limit = 40 } = {}) {
  const q = cleanText(query).toLowerCase().replace(/&/g, "and");
  const selectedDepartment = department || syllabusDepartmentFromText(q, list);
  const selectedSemester = String(semester || semesterFromQuestion(q) || "");
  let searchText = q;
  if (selectedDepartment) {
    for (const alias of DEPARTMENT_ALIASES[selectedDepartment] || [selectedDepartment]) {
      searchText = searchText.replace(new RegExp(`(?:^|\\b)${escapedPattern(alias).replace(/\s+/g, "\\s+")}(?=\\b|$)`, "ig"), " ");
    }
  }
  searchText = searchText
    .replace(/\b(?:sem(?:ester)?s?\s*[-–]?\s*(?:10|[1-9])|(?:10|[1-9])(?:st|nd|rd|th)\s*sem(?:ester)?s?|(?:first|second|third|fourth|fifth|sixth|seventh|eighth)\s+sem(?:ester)?s?)\b/gi, " ")
    .replace(/\b(?:syllabus|syllabi|scheme|study|document|documents|show|list|all|the|for|branch|semester|sem)\b/gi, " ");
  const tokens = searchText.split(/\s+/).filter((token) => token.length > 1).slice(0, 8);
  return (Array.isArray(list) ? list : [])
    .filter((doc) => !selectedDepartment || doc.department === selectedDepartment)
    .filter((doc) => !program || !doc.program || doc.program === program)
    .filter((doc) => !selectedSemester || (doc.semesters || [doc.semester]).map(String).includes(selectedSemester))
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
    .replace(/\bO\s+bject\s+O\s+riented\b/gi, "Object Oriented")
    .replace(/\s+/g, " ").trim();
}

export function parseFirstYearSyllabus(pages = []) {
  const text = cleanFirstYearPdfText((Array.isArray(pages) ? pages : []).map((page) => String(page?.text || "")).join("\n"));
  const starts = [...text.matchAll(/\bCourse\s+Code\s*:\s*([A-Z][A-Z\s-]{1,10}\s*\d[\d\s]*)\b/gi)];
  const courses = [];
  for (let index = 0; index < starts.length; index += 1) {
    const block = text.slice(starts[index].index, starts[index + 1]?.index || text.length);
    const code = starts[index][1].replace(/[\s-]+/g, "").toUpperCase();
    const title = cleanText(block.match(/Course\s+(?:Title|Name)\s*:\s*([\s\S]*?)(?=\s+(?:Programme|Semester|L\s*:|Credits\s*:)|$)/i)?.[1] || "")
      .replace(/\bEng\s+ineering\b/gi, "Engineering").replace(/\bP\s+rogramming\b/gi, "Programming");
    if (!title) continue;
    const contentsStart = block.search(/\bContents?\b/i);
    const contents = contentsStart >= 0 ? block.slice(contentsStart) : "";
    const units = [...contents.matchAll(/U\s*ni\s*t\s*[-–—]?\s*(\d+)\b\s*[:.-]?\s*([\s\S]*?)(?=\s*U\s*ni\s*t\s*[-–—]?\s*\d+\b|\s*(?:Laboratory Work|Text Books|Reference Books|Online Learning)|$)/gi)]
      .map((match) => {
        const raw = cleanText(match[2]);
        const hours = raw.match(/\b\d+\s*\(L\)(?:\s*\+\s*\d+\s*\([PT]\))*\s*hrs?\b/i);
        const titleEnd = hours?.index ?? raw.length;
        const detailStart = hours ? titleEnd + hours[0].length : raw.length;
        return { number: match[1], title: raw.slice(0, titleEnd).trim(), details: raw.slice(detailStart).trim().slice(0, 1200) };
      }).filter((unit) => unit.title);
    if (!units.length) continue;
    const printedSemester = cleanText(block.match(/Semester\s*:\s*([^\n]{1,30}?)(?=\s+(?:Theory\s*\/\s*Practical|Teaching Hours|Total Max|Course Type)|$)/i)?.[1] || "");
    const semester = printedSemester.match(/^(?:10|[1-9])(?:st|nd|rd|th)?(?:\s*(?:&|and|,|to|-)\s*(?:10|[1-9])(?:st|nd|rd|th)?)?/i)?.[0] || "";
    courses.push({ code, title, semester, units });
  }
  return [...new Map(courses.map((course) => [course.code, course])).values()];
}

const TABLE_SEMESTER_NAMES = Object.freeze({
  first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6", seventh: "7", eighth: "8", ninth: "9", tenth: "10",
  i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10"
});

// The current BCA 2025 PDF has multiline table cells whose reading order can
// merge neighboring course names. These table entries were checked against
// the official PDF; it does not provide unit text in its selectable layer.
const BCA_2025_COURSES = Object.freeze([
  ["1", "BCA101", "Mathematics Foundations to Computer Science"],
  ["1", "BCA104", "Programming for Problem Solving"],
  ["1", "BCA102", "Fundamentals of Computer and IT"],
  ["1", "BCA103", "Web Designing"],
  ["1", "BCA106", "Environmental Science and Sustainability"],
  ["1", "BCA105", "General English"],
  ["1", "NEMPD101", "Mentoring and Professional Development"],
  ["2", "BCA107", "Probability and Statistics"],
  ["2", "BCA108", "Digital Electronics and Computer Architecture"],
  ["2", "BCA109", "Software Engineering"],
  ["2", "BCA110", "Artificial Intelligence"],
  ["2", "BCA111", "Object Oriented Programming Using C++"],
  ["2", "UGNE101", "Indian Constitution"],
  ["2", "NEMPD101", "Mentoring and Professional Development"],
  ["3", "BCA112", "Data Structures - I"],
  ["3", "BCA113", "Introduction to Cloud Computing"],
  ["3", "BCA116", "Computer Networks"],
  ["3", "BCA114", "Basics of Python Programming"],
  ["3", "BCA115", "Machine Learning"],
  ["3", "NEMPD102", "Mentoring and Professional Development"],
  ["4", "BCA117", "Operating System"],
  ["4", "EBCAXXX", "Professional Elective - I"],
  ["4", "BCA118", "Data Structures - II"],
  ["4", "BCA119", "Database Management System - I"],
  ["4", "BCA120", "Cryptography and Network Security"],
  ["4", "UGNE102", "Indian Knowledge System"],
  ["4", "NEMPD102", "Mentoring and Professional Development"],
  ["5", "BCA121", "Database Management System - II"],
  ["5", "EBCAXXX", "Professional Elective - II"],
  ["5", "FSCA101", "Professional Skills and Aptitude Development"],
  ["5", "BCA122", "Java Programming"],
  ["5", "PRBCA101", "Minor Project"],
  ["5", "TRBCA101", "Training"],
  ["5", "NEMPD301", "Mentoring and Professional Development"],
  ["6", "OBCE101", "Entrepreneurship Development"],
  ["6", "BCA123", "Android Programming"],
  ["6", "BCA124", "Cyber Law and IPR"],
  ["6", "BCA125", "Disaster Management and Preparedness"],
  ["6", "EBCAXXX", "Professional Elective - III"],
  ["6", "PRBCA102", "Major Project"],
  ["6", "NEMPD103", "Mentoring and Professional Development"]
].map(([semester, code, title]) => ({ code, title, semester, units: [], staticCourseList: true })));

// The current GNDEC RAI PDF prints its scheme across tightly packed table
// cells. These verified title rows preserve every listed subject without
// relying on broken PDF reading order. Unit text still comes only from parsed
// course pages in the same official PDF.
const RAI_2025_COURSES = Object.freeze([
  ["3", "CRA101", "Elements of Mechanical Engineering"],
  ["3", "ERA101", "Introduction to Unmanned Aerial Vehicles"],
  ["3", "BSRA101", "Mathematics-III"],
  ["3", "CRA102", "Introduction to Artificial Intelligence"],
  ["3", "CRA103", "Kinematics of Robotics-I"],
  ["3", "CRA104", "Engineering Materials"],
  ["3", "MCRA101", "Environmental Sciences and Sustainability"],
  ["3", "SMRA101", "Seminar and Technical Report Writing for Engineers"],
  ["3", "MPD102", "MPD"],
  ["3", "TRRA101", "Training I (after 1st Year)"],
  ["4", "CAR105", "Machine Drawing and CAD"],
  ["4", "CRA106", "Strength of Materials"],
  ["4", "CRA107", "Kinematics of Robotics-II"],
  ["4", "CRA108", "Industrial Engineering"],
  ["4", "ERA10X", "Elective-I"],
  ["4", "HSMC103", "Business Essentials for Engineers"],
  ["4", "HSMC104", "Universal Human Values: Understanding Harmony"],
  ["4", "MC101", "Indian Constitution"],
  ["4", "MPD102", "MPD"],
  ["5", "CRA109", "Robotics Actuators and Sensors"],
  ["5", "CRA110", "Machine Learning"],
  ["5", "CRA111", "Hydraulic and Pneumatic Systems"],
  ["5", "CRA112", "Analogue and Digital Electronics"],
  ["5", "ERA10X", "Elective-II"],
  ["5", "ESRA102", "Design Thinking"],
  ["5", "MC102", "Essence of Indian Knowledge"],
  ["5", "MPD103", "MPD"],
  ["5", "TRME102", "Training-II (after 2nd year)"],
  ["6", "CRA113", "Microprocessors and Micro Controllers"],
  ["6", "CRA114", "Mechatronics"],
  ["6", "CRA115", "Computer Integrated Manufacturing"],
  ["6", "ERA10X", "Elective-III"],
  ["6", "ESRA101", "Program Specific Course (Artificial Intelligence in Robotics)"],
  ["6", "ESC106", "Entrepreneurship and Startups"],
  ["6", "MOC101", "Organizational Behavior"],
  ["6", "PRRA101", "Minor Project"],
  ["6", "FSRA101", "Professional Skills for Engineers"],
  ["6", "MPD103", "MPD"],
  ["7", "PEC-MOOCS", "MOOCS Elective-IV"],
  ["7", "OEC-MOOCS-I", "MOOCS Open Elective-I"],
  ["7", "OEC-MOOCS-II", "MOOCS Open Elective-II"],
  ["7", "OEC-MOOCS-III", "MOOCS Open Elective-III"],
  ["7", "PRRA102", "Major Project"],
  ["7", "MPD104", "MPD"],
  ["8", "TRRA103", "Industrial Training (Training-III)"],
  ["8", "MPD104", "MPD"]
].map(([semester, code, title]) => ({ code, title, semester, units: [], staticCourseList: true })));

const ME_2024_COURSES = Object.freeze([
  ["3", "CME101", "Strength of Materials"],
  ["3", "CME102", "Applied Thermodynamics-I"],
  ["3", "CME103", "Machine Drawing and CAD"],
  ["3", "CME104", "Manufacturing Processes"],
  ["3", "CME105", "Engineering. Materials & Metallurgy"],
  ["3", "MCME101", "Environment Sciences & Sustainability"],
  ["3", "SMME101", "Seminar and Technical Report Writing for Engineers"],
  ["3", "MPD102", "MPD"],
  ["3", "TRME101", "Training 1 (after 1st Year) 1"],
  ["4", "CME106", "Theory of Machines"],
  ["4", "CME107", "Applied Thermodynamics-II"],
  ["4", "CME108", "Fluid Mechanics"],
  ["4", "BSME101", "Maths III"],
  ["4", "EME10X", "Elective-I (NCER/M. Sc./CM)*"],
  ["4", "HSMC103", "Business Essentials for Engineers"],
  ["4", "HSMC104", "Universal Human Values: Understanding Harmony"],
  ["4", "MC101", "Indian Constitution"],
  ["4", "MPD102", "MPD"],
  ["5", "CME109", "Design of Machine Elements"],
  ["5", "CME110", "Heat Transfer"],
  ["5", "CME111", "Mechanical Measurement and Control"],
  ["5", "CME112", "Industrial Automation and Robotics"],
  ["5", "EME10X", "Elective-II"],
  ["5", "ESME102", "Design Thinking"],
  ["5", "MC102", "Essence of Indian Knowledge Tradition"],
  ["5", "MPD103", "MPD"],
  ["5", "TRME102", "Training-II (after 2nd year) 1"],
  ["6", "CME113", "Refrigeration and Air Conditioning"],
  ["6", "CME114", "Operations Research"],
  ["6", "CME115", "Industrial Engineering"],
  ["6", "EME10X", "Elective-III (FMC/M.M P../CAD)*"],
  ["6", "ESME101", "Program Specific Course (MV)"],
  ["6", "ESC106", "Entrepreneurship and Startups"],
  ["6", "MC103", "Disaster Management and Preparedness"],
  ["6", "PRME101", "Minor Project"],
  ["6", "FSME101", "Professional Skills for Engineers"],
  ["6", "MPD103", "MPD"],
  ["7", "", "MOOCS Elective-IV"],
  ["7", "", "MOOCS OE-I"],
  ["7", "", "MOOCS OE-II"],
  ["7", "", "MOOCS OE-III"],
  ["7", "PRME102", "Major Project"],
  ["7", "MPD104", "MPD"],
  ["8", "TRME103", "Industrial Training (Trg-III)"],
  ["8", "MPD104", "MPD"]
].map(([semester, code, title]) => ({ code, title, semester, units: [], staticCourseList: true })));

function semesterInTableHeading(line = "") {
  const text = cleanText(line).toLowerCase().replace(/\./g, "");
  const explicit = text.match(/\bsemester\s*[-:]?\s*(10th|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|(?:10|[1-9])|i{1,3}|iv|v|vi{0,2}|viii|ix|x)\b/)
    || text.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+semester\b/)
    || text.match(/\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+sem(?:ester)?\b/);
  if (!explicit) return "";
  const rawToken = explicit[1].toLowerCase();
  const token = /^\d/.test(rawToken) ? rawToken.replace(/(?:st|nd|rd|th)$/, "") : rawToken;
  return TABLE_SEMESTER_NAMES[token] || (/^(?:10|[1-9])$/.test(token) ? token : "");
}

function normalizeTableCourseCode(value = "") {
  const code = String(value).replace(/[\s-]+/g, "").toUpperCase();
  return /^[A-Z]{2,8}(?:\d{1,4}[A-Z]?|B\d|X{3,5})$/.test(code) ? code : "";
}

function parsePositionedCourseRows(page) {
  if (!Array.isArray(page?.rows) || !/DEPARTMENT OF COMPUTER APPLICATIONS|MCA\s+Batch\s+2022\s+Onwards|Study Scheme\s+2025/i.test(String(page?.text || ""))) return [];
  const rows = page.rows.map((row) => ({
    y: Number(row.y) || 0,
    items: Array.isArray(row.items) ? row.items.filter((item) => item && Number.isFinite(Number(item.x)) && item.text).map((item) => ({ x: Number(item.x), text: cleanText(item.text) })) : []
  })).sort((a, b) => b.y - a.y);
  const codes = [];
  let semester = "";
  for (const row of rows) {
    semester = semesterInTableHeading(row.items.map((item) => item.text).join(" ")) || semester;
    row.semester = semester;
    if (!semester || row.y < 330) continue;
    // Computer Applications PDFs place the course code in a narrow, fixed
    // column. Restrict extraction to that column so footnotes and neighboring
    // module labels cannot become phantom course codes.
    const left = row.items.filter((item) => item.x >= 140 && item.x < 220).map((item) => item.text).join("");
    const compact = left.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const pattern = /(?:PR\s*BCA|TR\s*BCA|PG\s*CA|OB\s*CA|EB\s*CA|BCA|NEMPD|UGNE|FSCA|OBCE)\s*-?\s*(?:\d{3,4}|[A-Z]\s*\d|X{3,5})/gi;
    for (const match of compact.matchAll(pattern)) {
      const code = normalizeTableCourseCode(match[0]);
      if (code && !codes.some((entry) => entry.code === code && entry.y === row.y)) {
        codes.push({ code, y: row.y, x: Math.min(...row.items.filter((item) => item.x >= 140 && item.x < 220).map((item) => item.x)), semester });
      }
    }
  }
  if (!codes.length) return [];
  const pageCodes = [...new Map(codes.map((entry) => [`${entry.semester}|${entry.code}`, entry])).values()];
  return pageCodes.map(({ code, semester, y, x }) => {
    const sameSemesterCodes = pageCodes.filter((entry) => entry.semester === semester).sort((a, b) => b.y - a.y);
    const position = sameSemesterCodes.findIndex((entry) => entry.code === code && entry.y === y);
    const titleItems = rows.flatMap((row) => row.items
      .filter((item) => item.x >= x + 50 && item.x < Math.min(x + 150, 310))
      .map((item) => ({ y: row.y, x: item.x, text: item.text, semester: row.semester })));
    // In these tables the first title line is near its code anchor, while
    // several following lines may wrap well below it. Assign start lines to
    // the nearest code first; this prevents a tightly-spaced mentoring row
    // from being mistaken for the preceding course's title start.
    const startFor = (anchor) => titleItems.filter((item) => {
      if (item.semester !== semester || Math.abs(item.y - anchor.y) > 18) return false;
      const closest = sameSemesterCodes.reduce((best, candidate) =>
        Math.abs(candidate.y - item.y) < Math.abs(best.y - item.y) ? candidate : best, sameSemesterCodes[0]);
      return closest === anchor;
    }).sort((a, b) => b.y - a.y)[0]?.y;
    const titleStart = startFor(sameSemesterCodes[position]);
    if (!Number.isFinite(titleStart)) return null;
    const nextTitleStart = sameSemesterCodes[position + 1] ? startFor(sameSemesterCodes[position + 1]) : y - 40;
    const lowerLimit = Number.isFinite(nextTitleStart) ? nextTitleStart : y - 40;
    const fragments = titleItems.filter((item) => item.semester === semester && item.y <= titleStart && item.y > lowerLimit
        && !/^(?:course\s+title|course\s+code|theory|practical|total|marks|credits?|l|t|p|ca|ese)$/i.test(item.text))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const title = [...new Map(fragments.map((item) => [`${item.y}|${item.x}|${canonicalize(item.text)}`, item.text])).values()]
      .join(" ").replace(/\s+/g, " ").replace(/[|,;\s-]+$/, "").trim();
    if (!title || title.length > 140 || /^(?:course|subject|module|title|code|total|credit|marks|theory|practical)\b/i.test(title)) return null;
    return { code, title, semester, units: [] };
  }).filter(Boolean);
}

function parseCourseNamePages(pages = []) {
  const parsed = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    const lines = String(page?.text || "").split(/\r?\n/).map((line) => cleanText(line)).filter(Boolean);
    const courseLine = lines.find((line) => /\bcourse\s*nam\s*e?\s*:/i.test(line));
    if (!courseLine || !/\b(?:scheme\s+and\s+syllabus\s+of\s+mca|batch\s+2022\s+onwards)\b/i.test(String(page?.text || ""))) continue;
    const title = cleanText(courseLine.replace(/^.*?\bcourse\s*nam\s*e?\s*:\s*/i, ""));
    const codeLine = lines.find((line) => /\bcourse\s*code\s*:/i.test(line)) || "";
    const codeText = cleanText(codeLine.replace(/^.*?\bcourse\s*code\s*:\s*/i, ""));
    const code = normalizeTableCourseCode(codeText);
    const semesterLine = lines.find((line) => /^semester\s*:/i.test(line)) || "";
    const semester = semesterInTableHeading(semesterLine);
    if (!title || title.length > 140 || !semester) continue;
    parsed.push({ code, title, semester, units: [] });
  }
  return parsed;
}

/**
 * Read course rows printed in official scheme tables. This supplies exact
 * subject names and semester placement when the PDF also contains unit pages,
 * and keeps table-only/scanned-outline courses selectable without inventing
 * their unit text.
 */
export function parseSyllabusTableCourses(pages = []) {
  const courses = new Map();
  let semester = "";
  const documentText = (Array.isArray(pages) ? pages : []).map((page) => String(page?.text || "")).join("\n");
  for (const page of Array.isArray(pages) ? pages : []) {
    const lines = String(page?.text || "").split(/\r?\n/).map((line) => cleanText(line)).filter(Boolean);
    const pageCourses = new Map();
    for (const line of lines) {
      const headingSemester = semesterInTableHeading(line);
      if (headingSemester) semester = headingSemester;
      if (!semester) continue;
      const rowPrefix = /^\s*(\d{1,2})\s+(?:PCC|BSC|HSS|HSMC|MNC|MPD|PEC|OEC|ESC|PW\s*&\s*S|PW&S|BS|Core\s+Course|Ability\s+Enhancement|Skill\s+Enhancement|Value\s+Added)\b/i;
      if (!rowPrefix.test(line)) continue;
      const trailingValues = /\s+(?:[-–—]|\d+(?:\.\d+)?)(?:\s+(?:[-–—]|\d+(?:\.\d+)?)){2,6}\s*$/;
      const prefix = rowPrefix.exec(line);
      const body = line.slice(prefix[0].length);
      let code = "";
      let title = "";
      const coded = /^\s*((?:[A-Z]\s*){2,8}(?:\d\s*){1,3}[A-Z]?)\s+/i.exec(body);
      if (coded) {
        code = normalizeTableCourseCode(coded[1]);
        title = body.slice(coded[0].length).replace(trailingValues, "").trim();
      } else {
        title = body.replace(trailingValues, "").trim();
      }
      title = title.replace(/\s+/g, " ").replace(/[|,;\s-]+$/, "").trim();
      if (!title || title.length > 140 || /^(?:course|subject|module|title|code|total|credit|marks|theory|practical)\b/i.test(title)) continue;
      const key = `${semester}|${code || canonicalize(title)}`;
      if (!courses.has(key)) courses.set(key, { code, title, semester, units: [] });
    }
    for (const course of parsePositionedCourseRows(page)) {
      const key = `${course.semester}|${course.code}`;
      pageCourses.set(key, course);
    }
    for (const [key, course] of pageCourses) courses.set(key, course);
  }
  for (const course of parseCourseNamePages(pages)) {
    const key = `${course.semester}|${course.code || canonicalize(course.title)}`;
    courses.set(key, course);
  }
  if (/DEPARTMENT OF COMPUTER APPLICATIONS/i.test(documentText)
    && /STUDY SCHEME\s+2025/i.test(documentText)
    && /FIRST SEMESTER/i.test(documentText)
    && /SIXTH SEMESTER/i.test(documentText)) return [...BCA_2025_COURSES];
  if (/B\.?\s*TECH\.?\s*\(ROBOTICS AND ARTIFICIAL INTELLIGENCE\)/i.test(documentText)
    && /THIRD SEMESTER/i.test(documentText)
    && /EIGHTH SEMESTER/i.test(documentText)) return [...RAI_2025_COURSES];
  if (/B\.?\s*TECH\.?\s*\(MECHANICAL ENGINEERING\)/i.test(documentText)
    && /THIRD SEMESTER/i.test(documentText)
    && /EIGHTH SEMESTER/i.test(documentText)) return [...ME_2024_COURSES];
  return [...courses.values()].map((course) => course.code === "CCS104"
    && /database management systems/i.test(course.title)
    ? { ...course, title: "Database Management Systems" }
    : course);
}

/** Answer a syllabus query only from the extracted official first-year PDF text. */
export function answerFirstYearSyllabus(question = "", courses = [], previousCourse = "", { semester = "" } = {}) {
  if (!Array.isArray(courses) || !courses.length) return null;
  const normalized = cleanText(question).toLowerCase()
    .replace(/\bsyl+ab(?:u|o)s\b/g, "syllabus")
    .replace(/\bsyllab(?:u|o)s\b/g, "syllabus");
  const asksSyllabus = /syllabus|unit|units|chapter|chapters|topic|topics|contents|course outline/i.test(normalized);
  const aliases = [
    ["programming for problem solving", ["pps", "programming", "problem solving"]],
    ["programming fundamentals using python", ["python", "programming fundamentals", "programming"]],
    ["engineering drawing and graphics", ["edg", "drawing", "graphics"]],
    ["manufacturing practices", ["workshop", "mp", "manufacturing"]],
    ["mathematics", ["math", "maths", "mathematics"]],
    ["physics", ["physics", "phy"]], ["chemistry", ["chemistry", "chem"]],
    ["professional english communication", ["english", "pec"]], ["economics", ["economics", "eco"]],
    ["basic electrical and electronics engineering", ["bee", "beee", "electrical"]]
  ];
  const explicitCode = courses.find((course) => new RegExp(`\\b${course.code}\\b`, "i").test(normalized));
  const ppsSemesterTwo = isPpsSemesterTwoShorthand(question)
    ? courses.find((course) => course.code === "ESC105")
    : null;
  const explicitSemester = semesterNumberInQuestion(question);
  const malformedMathLevel = /\b(?:maths?|mathematics)\s*[- ]?(?:11|12|21)\b/i.test(question);
  if (asksSyllabus && malformedMathLevel) {
    const candidates = ["BSC102", "BSC104"].map((code) => courses.find((course) => course.code === code)).filter(Boolean);
    if (candidates.length === 2) {
      return {
        html: `<p><strong>I couldn't tell which Mathematics course you meant by that number.</strong></p><p>Choose Mathematics-I or Mathematics-II to see its official syllabus.</p>`,
        intent: "SYLLABUS_COURSE_AMBIGUOUS",
        confidence: 1,
        plan: ["recognize an unclear mathematics level", "offer both official course titles", "wait for the user's choice"],
        entities: {},
        suggestions: candidates.map((course) => `${firstYearCourseTitle(course)} semester ${course.semester} syllabus`)
      };
    }
  }
  const mathLevel = normalized.match(/\b(?:math(?:ematics)?|maths)\s*[- ]?\s*(i{1,3}|1|2)\b/)?.[1];
  const mathRoman = mathLevel === "1" ? "i" : mathLevel === "2" ? "ii" : mathLevel;
  const asksMath = /\b(?:math(?:ematics)?|maths)\b/.test(normalized);
  // Apply the semester default only to an ambiguous math request. Otherwise
  // unit-only follow-ups such as "unit 6" must reuse the previous course,
  // rather than being silently captured by Mathematics for the active term.
  const syllabusSemester = explicitSemester || semester;
  const wantedMath = mathRoman || (asksMath && asksSyllabus ? (syllabusSemester === "2" ? "ii" : syllabusSemester === "1" ? "i" : "") : "");
  const explicitTitleMatches = courses.filter((course) => {
    const title = canonicalize(course.title);
    return title.length >= 7 && ` ${canonicalize(normalized)} `.includes(` ${title} `);
  });
  const explicit = explicitCode
    || ppsSemesterTwo
    || (wantedMath ? courses.find((course) => {
      const title = course.title.toLowerCase();
      return title.includes("mathematics") && new RegExp(`(?:^|\\s)${wantedMath}$`).test(title.trim());
    }) : null)
    || (explicitTitleMatches.length === 1 ? explicitTitleMatches[0] : null);
  const aliasCandidates = explicit ? [] : courses.filter((course) => {
    const title = course.title.toLowerCase();
    return aliases.some(([canonical, words]) => title.includes(canonical)
      && words.some((word) => new RegExp(`\\b${word}\\b`, "i").test(normalized)));
  });
  const requestedSemester = explicitSemester || semester;
  const semesterCandidates = requestedSemester
    ? aliasCandidates.filter((course) => courseSemesterStatus(course, requestedSemester) !== false)
    : aliasCandidates;
  const aliasMatch = semesterCandidates.length === 1 ? semesterCandidates[0]
    : !requestedSemester && aliasCandidates.length === 1 ? aliasCandidates[0]
      : null;
  if (!explicit && !aliasMatch && (semesterCandidates.length > 1 || explicitTitleMatches.length > 1)) {
    const candidates = (explicitTitleMatches.length > 1 ? explicitTitleMatches : semesterCandidates).slice(0, 3);
    return {
      html: `<p><strong>“${escapeHtml(question)}” matches more than one course in the official first-year syllabus.</strong></p><p>Choose the exact course to see its syllabus.</p>`,
      intent: "SYLLABUS_COURSE_AMBIGUOUS",
      confidence: 0.85,
      plan: ["match the requested words against official course titles and aliases", "keep multiple course matches separate", "ask the user to choose a course"],
      entities: {},
      suggestions: candidates.map((course) => `${course.title}${course.semester ? ` semester ${course.semester}` : ""} syllabus`)
    };
  }
  const course = explicit || aliasMatch || courses.find((item) => item.code === previousCourse);
  if (!course) return null;
  if (explicitSemester && courseSemesterStatus(course, explicitSemester) === false) return null;
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

function semesterNumberInQuestion(question = "") {
  const raw = String(question || "").toLowerCase();
  const wordSemesters = { one: "1", first: "1", i: "1", two: "2", second: "2", ii: "2", three: "3", third: "3", iii: "3", four: "4", fourth: "4", iv: "4", five: "5", fifth: "5", v: "5", six: "6", sixth: "6", vi: "6", seven: "7", seventh: "7", vii: "7", eight: "8", eighth: "8", viii: "8" };
  const explicit = raw.match(/\b(?:semester|sem)\s*[-:]?\s*((?:10|[1-9])|one|two|three|four|five|six|seven|eight|first|second|third|fourth|fifth|sixth|seventh|eighth|i{1,3}|iv|v|vi{0,2}|viii)\b/)
    || raw.match(/\b((?:10|[1-9]))(?:st|nd|rd|th)\s*sem(?:ester)?\b/)
    || raw.match(/\b(one|two|three|four|five|six|seven|eight|first|second|third|fourth|fifth|sixth|seventh|eighth|i{1,3}|iv|v|vi{0,2}|viii)\s*sem(?:ester)?\b/);
  if (explicit) return wordSemesters[explicit[1]] || explicit[1];
  const ppsShortSemester = raw.match(/\b(?:pps|esc103|programming\s+for\s+problem\s+solving)\s+(ii|i|[12]|one|two|first|second)\b/);
  if (!ppsShortSemester) return "";
  return wordSemesters[ppsShortSemester[1]] || (/^(?:ii|2)$/i.test(ppsShortSemester[1]) ? "2" : /^(?:i|1)$/i.test(ppsShortSemester[1]) ? "1" : ppsShortSemester[1]);
}

function isPpsSemesterTwoShorthand(question = "") {
  return /\bpps\s*(?:(?:semester|sem)\s*(?:ii|2|two|second)|(?:ii|2|two|second)(?:\s*(?:semester|sem))?)\b/i.test(String(question || ""));
}

function courseSemesterNumbers(course = {}) {
  if (Array.isArray(course.semesters)) return course.semesters.map(Number).filter((value) => Number.isInteger(value) && value > 0);
  const printed = String(course.semester || "");
  return [...new Set((printed.match(/\b(?:10|[1-9])\b/g) || []).map(Number))];
}

function courseSemesterStatus(course, semester) {
  if (!semester) return null;
  const semesters = courseSemesterNumbers(course);
  return semesters.length ? semesters.includes(Number(semester)) : null;
}

function firstYearCourseTitle(course = {}) {
  if (course.code === "BSC102") return "Mathematics-I";
  if (course.code === "BSC104") return "Mathematics-II";
  return cleanText(course.title || course.code);
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
  const explicitSemester = semesterNumberInQuestion(question);
  const requestedSemester = explicitSemester || semester;
  const selectCourse = (course) => {
    if (!course) return { course: null, candidates: [] };
    if (explicitSemester && courseSemesterStatus(course, explicitSemester) === false) {
      return { course: null, candidates: [], mismatchCourse: course, requestedSemester: explicitSemester };
    }
    return { course, candidates: [] };
  };

  const explicitCode = courses.find((course) => new RegExp(`\\b${String(course.code).toLowerCase()}\\b`).test(text));
  if (explicitCode) return selectCourse(explicitCode);

  if (isPpsSemesterTwoShorthand(question)) {
    return selectCourse(courses.find((course) => course.code === "ESC105") || null);
  }

  const level = text.match(/\b(?:math|maths|mathematics)\s*[- ]?\s*(ii|2|i|1)\b/)?.[1]
    || raw.match(/\bm\s*[- ]?(ii|2|i|1)\b/)?.[1];
  const mathMentioned = /\b(?:math|maths|mathematics)\b/.test(text) || Boolean(raw.match(/\bm\s*[- ]?[12]\b/));
  if (mathMentioned) {
    const byCode = (code) => courses.find((course) => course.code === code) || null;
    if (/\b(?:maths?|mathematics)\s*[- ]?(?:11|12|21)\b/i.test(raw)) {
      return { course: null, candidates: [byCode("BSC102"), byCode("BSC104")].filter(Boolean), ambiguousMath: true, malformedMath: true };
    }
    if (level && /^(?:ii|2)$/i.test(level)) return selectCourse(byCode("BSC104"));
    if (level) return selectCourse(byCode("BSC102"));
    if (requestedSemester === "2") return selectCourse(byCode("BSC104"));
    if (requestedSemester === "1") return selectCourse(byCode("BSC102"));
    return { course: null, candidates: [byCode("BSC102"), byCode("BSC104")].filter(Boolean), ambiguousMath: true };
  }

  // A complete course title or multiword course alias is stronger evidence
  // than a shared single-word alias such as "programming". Check that exact
  // identity before filtering candidates to the requested semester, otherwise
  // PPS can silently become the separate Python course in semester 2.
  const exactNames = courses.filter((course) => {
    const names = [course.title, ...(SCHEME_ALIASES[course.code] || [])]
      .map(canonicalize)
      .filter((name) => name.length >= 7 && name.split(" ").length > 1);
    return names.some((name) => ` ${text} `.includes(` ${name} `));
  });
  if (exactNames.length === 1) return selectCourse(exactNames[0]);
  if (exactNames.length > 1) {
    const inSemester = explicitSemester
      ? exactNames.filter((course) => courseSemesterStatus(course, explicitSemester) !== false)
      : [];
    if (inSemester.length === 1) return selectCourse(inSemester[0]);
    return { course: null, candidates: (inSemester.length ? inSemester : exactNames).slice(0, 4) };
  }

  const ranked = courses
    .map((course) => ({ course, score: courseScore(course, text, tokens) }))
    .filter((entry) => entry.score >= 0.82)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) {
    const previous = courses.find((course) => course.code === previousCourse);
    return selectCourse(previous || null);
  }
  if (explicitSemester) {
    const inSemester = ranked.filter((entry) => courseSemesterStatus(entry.course, explicitSemester) !== false);
    if (inSemester.length === 1) return selectCourse(inSemester[0].course);
    if (inSemester.length > 1 && inSemester[0].score - (inSemester[1]?.score || 0) >= 0.08) {
      return selectCourse(inSemester[0].course);
    }
    if (!inSemester.length && ranked.length === 1) {
      return { course: null, candidates: [], mismatchCourse: ranked[0].course, requestedSemester: explicitSemester };
    }
    if (inSemester.length > 1) return { course: null, candidates: inSemester.slice(0, 4).map((entry) => entry.course) };
    return { course: null, candidates: ranked.slice(0, 4).map((entry) => entry.course) };
  }
  if (ranked.length > 1 && semester) {
    const inSemester = ranked.filter((entry) => (entry.course.semesters || []).includes(Number(semester)));
    if (inSemester.length === 1) return selectCourse(inSemester[0].course);
  }
  if (ranked.length === 1 || ranked[0].score - (ranked[1]?.score || 0) >= 0.08) {
    return selectCourse(ranked[0].course);
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
  const asksCourseFacts = SCHEME_TOPIC.test(text)
    || /\b(?:credits?|marks?|marking|assessment|internal|external|continuous assessment|ca|ese|mse|mst|weightage|distribution|total|passing|pass|minimum|duration|prerequisites?|practical|theory|ltp)\b/i.test(raw);
  if (resolved.course && asksCourseFacts) {
    return {
      html: schemeCourseHtml(resolved.course, { semester, group, asksMse }),
      intent: "FIRST_YEAR_SCHEME_COURSE", confidence: 0.94,
      plan: ["match the official course code, title or shortform", "read credits and marks from the verified scheme bundle", "state the published MSE limitation"],
      entities: { syllabusCourseCode: resolved.course.code, firstYearSemester: semester, firstYearGroup: group }
    };
  }
  if (resolved.candidates?.length && asksCourseFacts) {
    if (resolved.malformedMath) {
      return {
        html: `<p><strong>I couldn't tell whether “math ${escapeHtml(String(question).match(/\b(?:maths?|mathematics)\s*[- ]?(11|12|21)\b/i)?.[1] || "11")}” means Mathematics-I or Mathematics-II.</strong></p><p>Choose the exact course before I show its marks.</p>`,
        intent: "FIRST_YEAR_COURSE_DISAMBIGUATION",
        confidence: 1,
        plan: ["detect an invalid or unclear course number", "offer the two verified mathematics courses", "do not choose one from the timetable alias"],
        entities: { firstYearSemester: semester, firstYearGroup: group },
        suggestions: resolved.candidates.map((course) => `${course.title} semester ${(course.semesters || []).join("/")} marks`)
      };
    }
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

export function answerFirstYearSyllabusList(question = "", scheme = null, { semester = "", group = "", courses: syllabusCourses = [] } = {}) {
  if (!schemeCourseList(scheme).length) return null;
  const text = canonicalize(question);
  const asksForCount = /\b(?:how many|count|total|number of)\b/.test(text)
    && /\b(?:subjects?|courses?|units?|chapters?)\b/.test(text);
  if (!/\b(?:syllabus|syllabi|subjects?|courses?|papers?)\b/.test(text) && !asksForCount
    || /\b(?:unit|units|chapter|chapters|topic|topics)\b/.test(text) && !asksForCount
    || (!/\b(?:chemistry|physics)\s+group\b/.test(text)
      && resolveFirstYearSchemeCourse(question, scheme, { semester }).course)) return null;

  const requestedSemester = semesterNumberInQuestion(question);
  const semesterChoice = requestedSemester || (["1", "2"].includes(String(semester)) ? String(semester) : "");
  const asksAllBranches = /\b(?:all|every)\s+(?:branches?|departments?)\b|\b(?:branches?|departments?)\s+(?:all|every)\b/i.test(text);
  const explicitGroup = groupName(text);
  const selectedGroup = asksAllBranches ? "" : explicitGroup || groupName(group);
  const semesters = semesterChoice ? [semesterChoice] : ["1", "2"];
  const groups = selectedGroup ? [selectedGroup] : ["Chemistry", "Physics"];
  const sections = [];
  const syllabusByCode = new Map((Array.isArray(syllabusCourses) ? syllabusCourses : []).map((course) => [course.code, course]));
  let numberedOptions = null;
  for (const sem of semesters) {
    for (const courseGroup of groups) {
      const bucket = scheme?.semesters?.[sem]?.[courseGroup];
      if (!bucket?.courses?.length) continue;
      const courses = bucket.courses
        .map((code) => schemeCourseList(scheme).find((course) => course.code === code))
        .filter(Boolean);
      if (!courses.length) continue;
      const topicRows = courses.map((course) => {
        const outline = syllabusByCode.get(course.code);
        if (!outline?.units?.length) return "";
        const topics = outline.units.slice(0, 3).map((unit) => escapeHtml(unit.title)).join(" · ");
        return "<li><strong>" + escapeHtml(course.title) + "</strong>: " + topics + "</li>";
      }).filter(Boolean).join("");
      if (topicRows) sections.push("<section class=\"syllabus-topic-preview\"><h4>Quick topic preview · Semester " + escapeHtml(sem) + " · " + escapeHtml(courseGroup) + " group</h4><ul>" + topicRows + "</ul></section>");
      if (semesters.length === 1 && groups.length === 1) numberedOptions = courses.map((course) => course.code);
      sections.push(`<section class="syllabus-subject-section"><h4>Semester ${escapeHtml(sem)} · ${escapeHtml(courseGroup)} group</h4><ol>${courses.map((course) => `<li><strong>${escapeHtml(course.title)}</strong> <span class="answer-meta">· ${escapeHtml(course.code)}</span></li>`).join("")}</ol></section>`);
    }
  }
  if (asksForCount) {
    const countUnits = /\b(?:units?|chapters?)\b/.test(text);
    const byGroup = [];
    for (const sem of semesters) {
      for (const courseGroup of groups) {
        const bucket = scheme?.semesters?.[sem]?.[courseGroup];
        if (!bucket?.courses?.length) continue;
        const subjects = bucket.courses.map((code) => schemeCourseList(scheme).find((course) => course.code === code)).filter(Boolean);
        const unitTotal = subjects.reduce((sum, course) => sum + (syllabusByCode.get(course.code)?.units?.length || 0), 0);
        const allUnitsIndexed = subjects.every((course) => syllabusByCode.get(course.code)?.units?.length);
        byGroup.push({ semester: sem, group: courseGroup, subjects: subjects.length, units: unitTotal, allUnitsIndexed });
      }
    }
    if (byGroup.length) {
      const label = countUnits ? "indexed units/chapters" : "subjects";
      const lines = byGroup.map((entry) => "Semester " + entry.semester + " · " + entry.group + " group: <strong>"
        + (countUnits ? entry.units : entry.subjects) + " " + label + "</strong>" + (countUnits ? " across " + entry.subjects + " subjects" : ""));
      const incompleteUnits = countUnits && byGroup.some((entry) => !entry.allUnitsIndexed);
      return {
        html: "<p><strong>Current first-year scheme counts</strong></p><ul><li>" + lines.join("</li><li>") + "</li></ul>"
          + (incompleteUnits ? "<p class=\"answer-meta\">Unit totals count only course outlines indexed from the official PDF; some subjects do not have searchable unit text yet.</p>" : "")
          + "<p class=\"answer-source\">Official Applied Sciences scheme and syllabus (Dec 2025). <a href=\"" + FIRST_YEAR_SCHEME_SOURCE + "\" target=\"_blank\" rel=\"noopener noreferrer\">Open the source PDF</a>.</p>",
        intent: "SYLLABUS_COUNT",
        confidence: 0.98,
        plan: ["resolve the requested or profile semester and group", "count verified first-year subjects or indexed units", "label incomplete unit-text coverage"],
        entities: { firstYearSemester: semesterChoice, firstYearGroup: selectedGroup, firstYearCountsByGroup: byGroup, syllabusCountScope: countUnits ? "units" : "subjects" }
      };
    }
  }
  if (!sections.length) return null;
  const exactChoice = Boolean(numberedOptions);
  return {
    html: `<p><strong>B.Tech. first-year subjects · Scheme 2024</strong></p>
      <p class="answer-meta">${exactChoice ? `Semester ${escapeHtml(semesterChoice)} · ${escapeHtml(selectedGroup)} group, based on your selection.` : "The official scheme lists separate Chemistry and Physics groups; choose the group and semester that apply to you."}</p>
      ${sections.join("")}
      <p>Reply with a subject number to open its official unit outline, then ask for a unit number for more detail.</p>
      <p class="answer-source">Official Applied Sciences scheme &amp; syllabus (Dec 2025). <a href="${FIRST_YEAR_SCHEME_SOURCE}" target="_blank" rel="noopener noreferrer">Open the source PDF</a>.</p>`,
    intent: "FIRST_YEAR_SYLLABUS_LIST",
    confidence: 0.94,
    plan: ["resolve the requested or profile semester", "read subjects from the verified first-year scheme", "keep Chemistry and Physics group lists separate"],
    entities: exactChoice ? {
      firstYearCourseOptions: numberedOptions,
      firstYearSemester: semesterChoice,
      firstYearGroup: selectedGroup
    } : { firstYearSemester: semesterChoice, firstYearGroup: selectedGroup },
    suggestions: exactChoice ? numberedOptions.slice(0, 6).map((_, index) => `subject ${index + 1}`) : semesters.flatMap((sem) => ["Chemistry", "Physics"].map((name) => "semester " + sem + " " + name + " group syllabus"))
  };
}

export function answerFirstYearSyllabusSelection(question = "", courses = [], options = [], { semester = "" } = {}) {
  const selection = /^\s*(?:(?:subject|course|number|no\.?)\s*)?([1-9]\d?)(?:st|nd|rd|th)?(?:\s*(?:subject|course))?\s*$/i.exec(question);
  if (!selection || !Array.isArray(options)) return null;
  const code = options[Number(selection[1]) - 1];
  if (!code) return null;
  const answer = answerFirstYearSyllabus("syllabus", courses, code, { semester });
  return answer ? {
    ...answer,
    entities: { ...answer.entities, firstYearSemester: semester, syllabusCourseCode: code }
  } : null;
}

export function answerIndexedSyllabus(question = "", courses = [], {
  department = "",
  program = "",
  semester = "",
  previousCourseId = "",
  previousOptions = [],
  sources = []
} = {}) {
  if (!Array.isArray(courses) || !courses.length) return null;
  const text = canonicalize(question);
  const countIntent = /\b(?:how many|count|total|number of)\b/.test(text)
    && /\b(?:branches?|departments?|semesters?|subjects?|courses?|units?|chapters?)\b/.test(text);
  const asksSyllabus = /\b(?:syllabus|syllabi|subjects?|courses?|course outline|curriculum|topics?|units?|chapters?|semesters?)\b/.test(text) || countIntent;
  const countKind = /\b(?:units?|chapters?)\b/.test(text) ? "units"
    : /\bsemesters?\b/.test(text) && !/\bsubjects?|courses?\b/.test(text) ? "semesters"
      : /\bbranches?|departments?\b/.test(text) && !/\bsubjects?|courses?\b/.test(text) ? "branches" : "subjects";
  const numbered = /^\s*(?:(?:choose|select)\s+)?(?:(?:(?:subject|course|option)\s+(?:(?:number|no\.?)\s*)?)|(?:number|no\.?)\s*)?(?:the\s*)?([1-9]\d?)(?:st|nd|rd|th)?(?:\s+(?:subject|course|one|please))?\s*$/i.exec(question)
    || (/^\s*(?:subject|course|option)\s*(\d{1,2})\s*$/i.exec(question))
    || (/^\s*(\d{1,2})\s*(?:subject|course|option)\s*$/i.exec(question))
    || /^\s*(?:(?:choose|select)\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*(?:one|subject|course)?\s*$/i.exec(question);
  if (!asksSyllabus && !previousCourseId && !numbered) return null;

  const sourceList = Array.isArray(sources) ? sources : [];
  const records = [...courses, ...sourceList];
  const explicitProgram = syllabusProgramFromText(question, records);
  const explicitDepartment = syllabusDepartmentFromText(question, records);
  const allBranches = /\b(?:all|every)\s+(?:branches?|departments?)|\b(?:branches?|departments?)\s+(?:all|every)\b/i.test(question);
  const allSemesters = /\b(?:all|every)\s+semesters?\b/i.test(question);
  const selectedProgram = explicitProgram || (allBranches ? "" : program);
  const selectedDepartment = (explicitProgram && records.find((item) => item.program === explicitProgram)?.department)
    || explicitDepartment || (allBranches ? "" : department);
  const compactSubjectChoice = Array.isArray(previousOptions) && previousOptions.length > 0
    && /^\s*(?:(?:subject|course|option)\s*\d{1,2}|\d{1,2}\s*(?:subject|course|option))\s*$/i.test(question);
  const explicitSemester = compactSubjectChoice ? "" : semesterFromQuestion(question);
  const selectedSemester = explicitSemester || (allSemesters ? "" : String(semester || ""));
  const asksUnitFollowup = /\b(?:unit|units|chapter|chapters|topic|topics)\b/.test(text);
  const branchNames = [...new Set([...courses, ...sourceList].map((item) => item.department).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const mentionsCourse = courses.some((item) => {
    const normalized = canonicalize(question);
    const title = canonicalize(item.title);
    return (item.code && new RegExp(`\\b${escapedPattern(item.code)}\\b`, "i").test(normalized))
      || (title.length >= 12 && title.split(/\s+/).length >= 2 && normalized.includes(title));
  });
  const needsBranch = asksSyllabus && !countIntent && countKind !== "branches" && !numbered
    && !mentionsCourse && !asksUnitFollowup && !selectedDepartment && !allBranches;
  const needsSemester = asksSyllabus && !countIntent && !numbered && !mentionsCourse && !asksUnitFollowup && selectedDepartment && !selectedSemester && !allSemesters;
  if (needsBranch || needsSemester) {
    const prompt = needsBranch
      ? "Which branch or programme should I use? I can also use your saved profile branch if you add it in Settings."
      : `Which semester should I use for ${selectedDepartment}? I could not read a semester from your profile.`;
    const suggestions = needsBranch
      ? branchNames.slice(0, 12).map((name) => `${name} syllabus`)
      : [...new Set(courses.filter((item) => item.department === selectedDepartment).flatMap((item) => item.semesters || []))]
        .sort((a, b) => Number(a) - Number(b)).slice(0, 8)
        .map((value) => `${selectedDepartment} semester ${value} syllabus`);
    return {
      html: `<p><strong>${escapeHtml(prompt)}</strong></p><p class="answer-meta">Choose a verified branch and semester so I return the correct official subject list.</p>${suggestions.length ? `<div class="syllabus-choice-list">${suggestions.map((choice) => `<button type="button" class="chip" data-ask-question="${escapeHtml(choice)}">${escapeHtml(choice.replace(/ syllabus$/i, ""))}</button>`).join("")}</div>` : ""}`,
      intent: needsBranch ? "SYLLABUS_BRANCH_CLARIFICATION" : "SYLLABUS_SEMESTER_CLARIFICATION",
      confidence: 1,
      plan: ["check active profile context", "identify the missing branch or semester", "offer published syllabus choices instead of guessing"],
      entities: { department: selectedDepartment, firstYearSemester: selectedSemester },
      suggestions
    };
  }
  const listed = courses.filter((course) => (!selectedDepartment || course.department === selectedDepartment)
    && (!selectedProgram || course.program === selectedProgram)
    && (!selectedSemester || allSemesters || (course.semesters || []).map(String).includes(selectedSemester))
    && (!selectedSemester || sourceList.filter((source) => source.department === course.department
      && source.program === course.program && (source.semesters || []).map(String).includes(selectedSemester)).length === 0
      || sourceList.some((source) => source.department === course.department && source.program === course.program
        && (source.semesters || []).map(String).includes(selectedSemester) && isCompleteSyllabusSemester(source, selectedSemester))));
  if (countIntent && countKind === "branches") {
    const branchCount = new Set([...courses, ...sourceList].map((item) => item.department).filter(Boolean)).size;
    return {
      html: `<p>Compass has current official syllabus sources for <strong>${branchCount} GNDEC branches/departments</strong>.</p><p class="answer-meta">Superseded schemes are excluded; a branch is counted only when it has a current source in the bundled official catalogue.</p>`,
      intent: "SYLLABUS_COUNT",
      confidence: 0.98,
      plan: ["read the current official source catalogue", "count unique branches and departments", "exclude superseded documents"],
      entities: { syllabusBranchCount: branchCount }
    };
  }
  if (countIntent && countKind === "semesters") {
    const semesterValues = new Set([
      ...courses.filter((item) => (!selectedDepartment || item.department === selectedDepartment)
        && (!selectedProgram || item.program === selectedProgram)).flatMap((item) => item.semesters || []),
      ...sourceList.filter((item) => (!selectedDepartment || item.department === selectedDepartment)
        && (!selectedProgram || !item.program || item.program === selectedProgram)).flatMap((item) => item.semesters || [])
    ].map(String));
    const semesters = [...semesterValues].filter((value) => /^(?:10|[1-9])$/.test(value)).sort((a, b) => Number(a) - Number(b));
    const label = selectedProgram || selectedDepartment || "GNDEC programmes";
    return {
      html: `<p><strong>${escapeHtml(label)}</strong> has current official syllabus sources for <strong>${semesters.length} semester${semesters.length === 1 ? "" : "s"}</strong>${semesters.length ? `: ${semesters.map((value) => `Semester ${value}`).join(", ")}` : ""}.</p><p class="answer-meta">This reports current GNDEC source coverage only; superseded schemes are not used to fill gaps.</p>`,
      intent: "SYLLABUS_COUNT",
      confidence: 0.98,
      plan: ["resolve the current branch or programme", "collect semesters with current official files", "exclude superseded sources"],
      entities: { department: selectedDepartment, program: selectedProgram, syllabusSemesterCount: semesters.length, syllabusSemesters: semesters }
    };
  }
  let course = null;
  if (numbered && Array.isArray(previousOptions)) {
    const ordinal = numbered[1].toLowerCase();
    const optionNumber = Number(numbered[1]) || ({ first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 })[ordinal];
    const id = previousOptions[optionNumber - 1];
    course = listed.find((item) => item.id === id) || courses.find((item) => item.id === id) || null;
  }
  if (!course && previousCourseId && /\b(?:unit|units|chapter|chapters|topic|topics)\b/.test(text)) {
    course = courses.find((item) => item.id === previousCourseId) || null;
  }
  if (!course && asksUnitFollowup) {
    const options = Array.isArray(previousOptions) ? previousOptions : [];
    const selectable = options.map((id) => courses.find((item) => item.id === id)).filter(Boolean);
    return {
      html: `<p><strong>Which subject should I use for that unit?</strong></p><p>Choose a subject from the previous list first, then ask for its unit number.</p>${selectable.length ? `<div class="syllabus-choice-list">${selectable.slice(0, 12).map((item, index) => `<button type="button" class="chip" data-ask-question="subject ${index + 1}">${escapeHtml(item.title)}</button>`).join("")}</div>` : ""}`,
      intent: "SYLLABUS_COURSE_CLARIFICATION",
      confidence: 1,
      plan: ["check the previous syllabus selection", "ask which course owns the requested unit", "avoid assigning a unit to an unrelated course"],
      entities: { indexedSyllabusOptions: selectable.map((item) => item.id), department: selectedDepartment, firstYearSemester: selectedSemester }
    };
  }
  if (!course && asksSyllabus) {
    const normalized = canonicalize(question);
    const matches = listed.filter((item) => {
      const code = String(item.code || "").toLowerCase();
      const title = canonicalize(item.title || "");
      return (code && new RegExp(`\\b${escapedPattern(code)}\\b`, "i").test(normalized))
        || (title.length > 4 && normalized.includes(title));
    });
    if (matches.length === 1) course = matches[0];
    else if (matches.length > 1) {
      return {
        html: `<p><strong>That subject appears in more than one indexed programme or semester.</strong></p><p>Choose the branch, programme or semester before opening its syllabus.</p>`,
        intent: "SYLLABUS_AMBIGUOUS",
        confidence: 0.9,
        plan: ["match the subject against official indexed courses", "preserve branch and semester distinctions", "ask for a narrower selection"],
        entities: { department: selectedDepartment, semester: selectedSemester }
      };
    }
  }

  if (course) {
    if (countIntent) {
      const unitCount = course.units.length;
      const statement = unitCount
        ? `The indexed official outline contains <strong>${unitCount} unit${unitCount === 1 ? "" : "s"}</strong>.`
        : "No unit count is available in the indexed text for this subject.";
      return {
        html: "<p><strong>" + escapeHtml(course.title) + " · " + escapeHtml(course.code) + "</strong></p><p>" + statement
          + "</p><p class=\"answer-source\">Counted from verified GNDEC syllabus text. <a href=\"" + escapeHtml(course.sourceUrl)
          + "\" target=\"_blank\" rel=\"noopener noreferrer\">Open the source PDF</a>.</p>",
        intent: "SYLLABUS_COUNT",
        confidence: 0.98,
        plan: ["resolve the exact course and semester", "count only indexed official units", "link the source document"],
        entities: { syllabusCourseId: course.id, syllabusCourseCode: course.code, subject: course.title, department: course.department, syllabusUnitCount: unitCount }
      };
    }
    const unitMatch = text.match(/\b(?:unit|u|chapter)\s*(?:-|number|no\.?\s*)?(10|[1-9])\b/)
      || text.match(/\b(?:unit|chapter)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    const unitNumber = unitMatch
      ? Number(unitMatch[1]) || ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[unitMatch[1]]
      : 0;
    const units = unitNumber ? course.units.filter((unit) => Number(unit.number) === unitNumber) : course.units;
    if (!units.length) {
      if (!course.sourceUrl) return null;
      return {
        html: `<p><strong>${escapeHtml(course.title)} · ${escapeHtml(course.code)}</strong></p><p>The official GNDEC document lists this subject, but Compass does not have verified unit text for it yet. I will not invent the outline.</p><p class="answer-source"><a href="${escapeHtml(course.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(course.sourceTitle || "the official syllabus PDF")}</a></p>`,
        intent: "SYLLABUS_SOURCE_ONLY",
        confidence: 1,
        plan: ["resolve the selected course from the numbered official list", "check the indexed course outline", "provide the source PDF when unit text is unavailable"],
        entities: { syllabusCourseId: course.id, syllabusCourseCode: course.code, subject: course.title, department: course.department, firstYearSemester: selectedSemester || String(course.semesters?.[0] || "") }
      };
    }
    const title = `${course.title} · ${course.code}`;
    return {
      html: `<p><strong>${escapeHtml(title)} · ${escapeHtml(course.program)}${course.semesters?.length ? ` · Semester${course.semesters.length === 1 ? "" : "s"} ${escapeHtml(course.semesters.join(", "))}` : ""}</strong></p>
        <ol>${units.map((unit) => `<li><strong>Unit ${escapeHtml(unit.number)}: ${escapeHtml(unit.title)}</strong>${unit.details ? `<p>${escapeHtml(unit.details)}</p>` : ""}</li>`).join("")}</ol>
        <p class="answer-source">Extracted from the official GNDEC syllabus document. <a href="${escapeHtml(course.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open the source PDF</a> · <a href="${escapeHtml(course.sourcePage)}" target="_blank" rel="noopener noreferrer">department page</a>.</p>`,
      intent: "SYLLABUS_CONTENT",
      confidence: 0.92,
      plan: ["match the verified department course and semester", "read the requested unit outline from indexed official text", "include its source PDF"],
      entities: {
        syllabusCourseId: course.id,
        syllabusCourseCode: course.code,
        subject: course.title,
        department: course.department,
        firstYearSemester: selectedSemester || String(course.semesters?.[0] || "")
      }
    };
  }
  if (!asksSyllabus) return null;

  let queryText = text
    .replace(/\b(?:cse|ece|ee|ce|it|me|mba|bba|mca|bca|appsc|arch)\s*[-:]?\s*(?:10|[1-9])(?:st|nd|rd|th)?\b/gi, " ")
    .replace(/\b(?:syllabus|syllabi|subjects)(?:(?:10|[1-9])|\s+(?:10|[1-9]))\b|\b(?:10|[1-9])(?:syllabus|syllabi|subjects)\b/gi, " ");
  if (selectedDepartment) {
    for (const alias of DEPARTMENT_ALIASES[selectedDepartment] || [selectedDepartment]) {
      queryText = queryText.replace(new RegExp(`(?:^|\\b)${escapedPattern(canonicalize(alias)).replace(/\s+/g, "\\s+")}(?=\\b|$)`, "ig"), " ");
    }
  }
  if (selectedProgram) {
    for (const alias of [selectedProgram, ...(PROGRAM_ALIASES[selectedProgram] || [])]) {
      queryText = queryText.replace(new RegExp(`(?:^|\\b)${escapedPattern(canonicalize(alias)).replace(/\s+/g, "\\s+")}(?=\\b|$)`, "ig"), " ");
    }
  }
  queryText = queryText.replace(/\b(?:sem(?:ester)?s?\s*[-–]?\s*(?:10|[1-9])|(?:10|[1-9])(?:st|nd|rd|th)\s*sem(?:ester)?s?|first|second|third|fourth|fifth|sixth|seventh|eighth)\b/gi, " ");
  queryText = queryText.replace(/\b(?:sem(?:ester)?s?\s*[-–]?\s*(?:one|two|three|four|five|six|seven|eight|i{1,3}|iv|v|vi{0,2}|viii)|(?:one|two|three|four|five|six|seven|eight|i{1,3}|iv|v|vi{0,2}|viii)\s*sem(?:ester)?s?)\b/gi, " ");
  queryText = queryText.replace(/\b(?:all|every|branch(?:es)?|department|semester|sem|syllabus|syllabi|subjects?|courses?|course|outline|curriculum|topics?|units?|chapters?|show|list|give|tell|please|full|for|the|my|of|in|and|ka|ki|ke|kya|dikhao|dikha|batao|bata|chahiye|konsa|konsi|mujhe|mera|meri|how|many|count|total|number|there|are|is|what|much|indexed|across|available|published|official)\b/gi, " ");
  const queryCourseTokens = queryText.split(/\s+/).filter((token) => token.length > 2
    && !["syllabus", "syllabi", "subjects", "subject", "courses", "course", "outline", "curriculum", "semester", "sem", "branch", "department", "show", "list", "all", "the", "for", "and", "how", "many", "count", "total", "number", "there", "are", "is", "what", "much"].includes(token));
  const filtered = queryCourseTokens.length
    ? listed.filter((item) => {
      const searchable = canonicalize(`${item.title} ${item.code} ${item.program} ${item.department} ${item.units.map((unit) => `${unit.title} ${unit.details}`).join(" ")}`);
      return queryCourseTokens.every((token) => searchable.includes(token));
    })
    : listed;
  const sourceMatches = sourceList.filter((source) => (!selectedDepartment || source.department === selectedDepartment)
    && (!selectedProgram || !source.program || source.program === selectedProgram)
    && (!selectedSemester || allSemesters || (source.semesters || []).map(String).includes(selectedSemester)));
  const unindexedSources = sourceMatches.filter((source) => {
    const semestersToCheck = selectedSemester ? [selectedSemester] : (source.semesters || []).map(String);
    if (!semestersToCheck.length) return !Number(source.courseCount);
    return semestersToCheck.some((semester) => !sourceMatches.some((candidate) =>
      candidate.department === source.department && candidate.program === source.program
      && (candidate.semesters || []).map(String).includes(String(semester))
      && isCompleteSyllabusSemester(candidate, semester)));
  });
  const visible = filtered.slice(0, 40);
  if (countIntent && visible.length) {
    const subjectCount = new Set(filtered.map((item) => `${item.program}|${item.code}|${item.semesters?.join(",")}`)).size;
    const unitCount = filtered.reduce((sum, item) => sum + item.units.length, 0);
    const count = countKind === "units" ? unitCount : subjectCount;
    const label = countKind === "units" ? "indexed units/chapters" : "indexed subjects/courses";
    const caveat = unindexedSources.length
      ? ` <span class="answer-meta">${unindexedSources.length} matching official PDF${unindexedSources.length === 1 ? " is" : "s are"} listed, but its subject text is not parsed; the count covers indexed records only.</span>`
      : "";
    return {
      html: `<p><strong>${escapeHtml([selectedProgram || selectedDepartment, selectedSemester ? `Semester ${selectedSemester}` : allSemesters ? "all semesters" : ""].filter(Boolean).join(" · ") || "GNDEC")}</strong></p><p>Compass can verify <strong>${count} ${label}</strong> in the current official text index.${countKind === "units" ? ` This is across ${subjectCount} indexed subjects.` : ""}</p>${caveat}<p class="answer-meta">This count includes only subjects/units whose text could be extracted and checked. It does not treat an unparsed PDF as an empty curriculum.</p>`,
      intent: "SYLLABUS_COUNT",
      confidence: 0.98,
      plan: ["resolve the requested branch and semester", "count unique indexed courses or units", "separate source PDFs whose text is not indexed"],
      entities: { department: selectedDepartment, program: selectedProgram, firstYearSemester: selectedSemester, syllabusSubjectCount: subjectCount, syllabusUnitCount: unitCount, syllabusCountScope: countKind }
    };
  }
  if (!visible.length) {
    const sourceMatches = sourceList.filter((source) => (!selectedDepartment || source.department === selectedDepartment)
      && (!selectedProgram || !source.program || source.program === selectedProgram)
      && (!selectedSemester || allSemesters || (source.semesters || []).map(String).includes(selectedSemester)));
    const scope = [selectedProgram || selectedDepartment, selectedSemester ? `Semester ${selectedSemester}` : allSemesters ? "all semesters" : ""].filter(Boolean).join(" · ");
    const sourceRows = (unindexedSources.length ? unindexedSources : sourceMatches).slice(0, 5).map((source) => {
      const url = escapeHtml(source.sourceUrl);
      const title = escapeHtml(source.sourceTitle || `${source.program || source.department} official syllabus`);
      const preview = trustedSyllabusPdfUrl(source)
        ? `<details class="syllabus-pdf-preview"><summary>Preview official PDF here</summary><iframe src="${url}#view=FitH" title="${title} preview" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe><p class="answer-meta">If the embedded preview is unavailable, <a href="${url}" target="_blank" rel="noopener noreferrer">open the official file</a>.</p></details>`
        : "";
      return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>${preview}</li>`;
    }).join("");
    return {
      html: `<p><strong>No indexed subject outline matched${scope ? ` ${escapeHtml(scope)}` : " that request"}.</strong></p><p>${sourceMatches.length
        ? unindexedSources.length
          ? "I found an official document for this branch and semester, but its subject/unit text is not indexed. Preview the source below; I will not invent its contents."
          : "No matching subject phrase was found in the current text index. The latest official PDF is linked below so you can check its exact wording."
        : "Compass can only list subjects and topics found in a verified document. No matching source is present in the current GNDEC catalogue, so choose another branch or semester."}</p>${sourceRows ? `<ul>${sourceRows}</ul>` : ""}`,
      intent: "SYLLABUS_NOT_INDEXED",
      confidence: 1,
      plan: ["check verified indexed course outlines", "report the missing match", "avoid substituting another branch or semester"],
      entities: { department: selectedDepartment, program: selectedProgram, firstYearSemester: selectedSemester }
    };
  }
  const exactScope = Boolean(selectedDepartment && selectedSemester);
  const sections = [...new Set(visible.map((item) => `${item.department} · ${item.program} · Semester${item.semesters?.length === 1 ? "" : "s"} ${item.semesters?.join(", ") || "not stated"}`))];
  let nextSubjectNumber = 1;
  return {
    html: `<p><strong>Indexed syllabus subjects${selectedProgram ? ` · ${escapeHtml(selectedProgram)}` : selectedDepartment ? ` · ${escapeHtml(selectedDepartment)}` : ""}${selectedSemester ? ` · Semester ${escapeHtml(selectedSemester)}` : ""}</strong></p>
      <p class="answer-meta">${exactScope ? "Subjects below match the selected branch and semester." : "Showing indexed official course outlines. Select a branch and semester to narrow results."}${visible.length < filtered.length ? ` Showing ${visible.length} of ${filtered.length}.` : ""}</p>
      ${sections.map((section) => {
        const sectionCourses = visible.filter((item) => `${item.department} · ${item.program} · Semester${item.semesters?.length === 1 ? "" : "s"} ${item.semesters?.join(", ") || "not stated"}` === section);
        const start = nextSubjectNumber;
        nextSubjectNumber += sectionCourses.length;
        return `<section class="syllabus-subject-section"><h4>${escapeHtml(section)}</h4><ol start="${start}">${sectionCourses.map((item, index) => {
          const option = start + index;
          const topics = item.units.slice(0, 3).map((unit) => escapeHtml(unit.title)).join(" · ");
          return `<li><strong>${escapeHtml(item.title)}</strong> <span class="answer-meta">· ${escapeHtml(item.code)} · ${item.units.length ? `${item.units.length} indexed units` : "unit text not indexed"}</span>${topics ? `<p class="answer-meta">Topics: ${topics}</p>` : ""}<button type="button" class="answer-suggestion-chip syllabus-open-course" data-ask-question="subject ${option}">Open full syllabus</button></li>`;
        }).join("")}</ol></section>`;
      }).join("")}
      ${unindexedSources.length ? `<section class="syllabus-unindexed-sources"><h4>Official documents not yet parsed into subject records</h4><ul>${unindexedSources.slice(0, 8).map((source) => {
        const title = escapeHtml(source.sourceTitle || `${source.program || source.department} syllabus`);
        const url = escapeHtml(source.sourceUrl || "");
        return url ? `<li>${escapeHtml(source.program || source.department)}${source.semesters?.length ? ` · Semester${source.semesters.length === 1 ? "" : "s"} ${escapeHtml(source.semesters.join(", "))}` : ""} · <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a> <span class="answer-meta">The official PDF is available; subject text has not been indexed.</span></li>` : "";
      }).join("")}</ul></section>` : ""}
      <p>Reply with a subject number to open its full indexed outline, then ask for a unit number.</p>
      <p class="answer-source">Course titles and units are extracted from published GNDEC documents; unparseable PDF pages are never filled in.</p>`,
    intent: "SYLLABUS_LIST",
    confidence: 0.92,
    plan: ["filter extracted official course data by branch and semester", "list only verified course titles", "preserve numbering for follow-up questions"],
    entities: {
      indexedSyllabusOptions: visible.map((item) => item.id),
      department: selectedDepartment,
      program: selectedProgram,
      firstYearSemester: selectedSemester
    },
    suggestions: visible.slice(0, 12).map((_, index) => `subject ${index + 1}`)
  };
}

/** Refuse to pass off one semester's verified course as another's. */
export function answerFirstYearSemesterMismatch(question = "", scheme = null) {
  const requestedSemester = semesterNumberInQuestion(question);
  if (!requestedSemester) return null;
  const resolved = resolveFirstYearSchemeCourse(question, scheme, { semester: "" });
  const course = resolved.course || resolved.mismatchCourse;
  if (!course || courseSemesterStatus(course, requestedSemester) !== false) return null;
  const publishedSemesters = courseSemesterNumbers(course);
  if (!publishedSemesters.length) return null;
  const asksSyllabus = /\b(?:syllabus|unit|units|chapter|chapters|topic|topics|course outline|contents)\b/i.test(question);
  const asksMarks = /\b(?:credits?|marks?|marking|assessment|internal|external|weightage|distribution|ca|ese|mse|mst|ltp)\b/i.test(question);
  const requestedFact = asksSyllabus ? "syllabus" : asksMarks ? "marks" : "";
  const relatedCourses = schemeCourseList(scheme).filter((candidate) => candidate.code !== course.code
    && courseSemesterStatus(candidate, requestedSemester) === true
    && courseScore(candidate, canonicalize(course.title), canonicalize(course.title).split(" ")) >= 0.82);
  const suggestions = requestedFact
    ? [
      `${course.title} semester ${publishedSemesters[0]} ${requestedFact}`,
      ...relatedCourses.slice(0, 2).map((candidate) => `${candidate.title} semester ${requestedSemester} ${requestedFact}`)
    ]
    : [
      `${course.title} semester ${publishedSemesters[0]} marks`,
      `${course.title} semester ${publishedSemesters[0]} syllabus`,
      `All teachers for ${course.title}`
    ];
  return {
    html: `<p><strong>${escapeHtml(course.title || course.code)} is not listed for Semester ${escapeHtml(requestedSemester)} in the verified first-year scheme.</strong></p><p>The source lists this course for Semester ${publishedSemesters.map(escapeHtml).join(" and ")}. I have not substituted that entry for your Semester ${escapeHtml(requestedSemester)} request.${relatedCourses.length ? ` A separate related course, ${escapeHtml(relatedCourses[0].title)} (${escapeHtml(relatedCourses[0].code)}), is listed for Semester ${escapeHtml(requestedSemester)}.` : ""}</p><p>Choose a verified option below.</p><p class="answer-source">Official source: <a href="${FIRST_YEAR_SCHEME_SOURCE}" target="_blank" rel="noopener noreferrer">Applied Sciences study scheme &amp; syllabus</a>.</p>`,
    intent: "FIRST_YEAR_SEMESTER_MISMATCH",
    confidence: 1,
    plan: ["match the requested course", "compare its printed semester with the requested semester", "decline to return a different semester's data"],
    entities: { syllabusCourseCode: course.code, requestedSemester, publishedSemesters },
    suggestions: [...new Set(suggestions)].slice(0, 3)
  };
}

function subjectOptionsForCourse(course) {
  const semester = String(course.semester || "");
  const semesterLabel = semester ? ` semester ${semester}` : "";
  const title = firstYearCourseTitle(course);
  return {
    html: `<p><strong>${escapeHtml(title)} &middot; ${escapeHtml(course.code)}${semesterLabel ? ` &middot; Semester ${escapeHtml(semester)}` : ""}</strong></p><p>What would you like to know? Choose a verified option below.</p>`,
    intent: "SUBJECT_OPTIONS",
    confidence: 0.96,
    plan: ["resolve the exact first-year course from the published scheme", "offer marks and syllabus without assuming which was requested"],
    entities: { subject: title, syllabusCourseCode: course.code, requestedSemester: semester },
    suggestions: [`${title}${semesterLabel} marks`, `${title}${semesterLabel} syllabus`, `All teachers for ${title}`]
  };
}
/** Interpret standalone course shorthand only when it identifies a verified course. */
export function answerFirstYearCourseOptions(question = "", courses = [], { semester = "" } = {}) {
  if (!Array.isArray(courses) || !courses.length) return null;
  const raw = String(question || "").toLowerCase().replace(/[?!.,]+$/g, "").replace(/\s+/g, " ").trim();
  if (/\b(?:syllabus|unit|units|chapter|chapters|topic|topics|marks?|credits?|assessment|teacher|teachers|faculty|who|where|when|class|timetable|schedule|room|exam)\b/i.test(raw)) return null;

  const exactTitle = courses.find((course) => canonicalize(course.title) === canonicalize(raw));
  if (exactTitle) return subjectOptionsForCourse(exactTitle);

  // Explicit shorthand defined by the student: PPS 2 / PPS sem 2 means the
  // published second-semester Python course ESC105.
  if (isPpsSemesterTwoShorthand(raw)) {
    const python = courses.find((course) => course.code === "ESC105");
    return python ? subjectOptionsForCourse(python) : null;
  }

  const mathPrefix = /^(?:maths?|mathematics)/i;
  if (!mathPrefix.test(raw)) return null;
  const first = courses.find((course) => course.code === "BSC102");
  const second = courses.find((course) => course.code === "BSC104");
  const malformed = /^(?:maths?|mathematics)\s*[- ]?(?:11|12|21)(?:\s+(?:semester|sem)\s*(?:[12]|one|two|first|second))?$/i.test(raw);
  const level = /^(?:maths?|mathematics)\s*[- ]?(ii|i|2|1)$/i.exec(raw)?.[1]?.toLowerCase() || "";
  const semesterMatch = /^(?:maths?|mathematics)\s+(?:semester|sem)\s*[- ]?(1|2|one|two|first|second)$/i.exec(raw)
    || /^(?:maths?|mathematics)\s+(first|second)\s+semester$/i.exec(raw);
  if (malformed || !level && !semesterMatch && !["1", "2"].includes(String(semester))) {
    const candidates = [first, second].filter(Boolean);
    if (candidates.length !== 2) return null;
    return {
      html: `<p><strong>I couldn't tell which Mathematics course you meant${malformed ? " by that number" : ""}.</strong></p><p>Choose Mathematics-I or Mathematics-II below.</p>`,
      intent: "COURSE_DISAMBIGUATION",
      confidence: 1,
      plan: ["recognize an unclear course number", "offer the two verified mathematics courses", "wait for the user's selection"],
      entities: {},
      suggestions: candidates.map((course) => `${firstYearCourseTitle(course)} semester ${course.semester}`)
    };
  }
  const semValue = semesterMatch?.[1]?.toLowerCase() || "";
  const semesterFromWord = { one: "1", first: "1", two: "2", second: "2" }[semValue];
  const requestedSemester = semesterFromWord || (/^[12]$/.test(semValue) ? semValue : "")
    || (level ? (/^(?:ii|2)$/.test(level) ? "2" : "1") : String(semester));
  const course = requestedSemester === "2" ? second : first;
  return course ? subjectOptionsForCourse(course) : null;
}

/** Ask for the missing subject/action when a user only types “sem 2”. */
export function answerBareSemesterOptions(question = "") {
  const raw = String(question || "").toLowerCase().replace(/[?!.,]+$/g, "").replace(/\s+/g, " ").trim();
  const match = /^(?:sem(?:ester)?\s*[- ]?(1|2|one|two|first|second)|(1|2|one|two|first|second)(?:st|nd)?\s*sem(?:ester)?|(first|second)\s+semester)$/.exec(raw);
  if (!match) return null;
  const semesterToken = match[1] || match[2] || match[3];
  const semester = { one: "1", first: "1", two: "2", second: "2" }[semesterToken] || semesterToken;
  const suggestions = semester === "2"
    ? ["Semester 2 subjects", "Mathematics-II semester 2 syllabus", "PPS semester 2 syllabus"]
    : ["Semester 1 subjects", "Mathematics-I semester 1 syllabus", "PPS semester 1 syllabus"];
  return {
    html: `<p><strong>Semester ${semester}.</strong> What do you want to see: the subject list, or a particular course's syllabus?</p>`,
    intent: "SEMESTER_OPTIONS",
    confidence: 1,
    plan: ["understand sem as semester", "ask for the course or information type", "offer published semester-specific choices"],
    entities: { firstYearSemester: semester },
    suggestions
  };
}


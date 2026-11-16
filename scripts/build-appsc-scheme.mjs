/**
 * Build the verified first-year study scheme from the official Applied Sciences
 * PDF (study scheme + syllabus, semester 1 and 2).
 *
 * The PDF is the only source. If it is unreachable the last committed bundle is
 * kept, exactly like the other daily builders. Nothing is inferred: the scheme
 * table prints credits, internal marks, external marks and L/T/P; the course
 * pages print the ESE duration, the minimum numerical percentage and the course
 * type. MSE-1/MSE-2 weightage is not printed in this document, so it is never
 * invented.
 */
import { mkdir } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readJsonIfPresent, writeJsonWhenChanged } from "./lib/stable-json.mjs";

const SOURCE = "https://appsc.gndec.ac.in/sites/default/files/2026-03/ss%20and%20Syllabus%20sem1%2C2%20Dec%202025%20unsigned.pdf";
const INDEX = "public/data/first-year-syllabus-index.json";
const OUTPUT = "next/data/appsc-first-year-scheme-2025.json";
const previous = readJsonIfPresent(OUTPUT);

const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
const codeOf = (value) => String(value || "").replace(/\s+/g, "").toUpperCase();

function cleanTitle(value) {
  return clean(value)
    .replace(/\bP\s+rogramming\b/gi, "Programming")
    .replace(/\bEng\s+ineering\b/gi, "Engineering")
    .replace(/\bPractice\s+s\b/gi, "Practices")
    .replace(/\bP\s+ractical\b/gi, "Practical")
    .replace(/\bMathemati\s+cs\b/gi, "Mathematics")
    .replace(/\s*-\s*/g, "-");
}

function numericOrNull(value) {
  const text = clean(value);
  if (!text || /^(?:nil|na|n\/a|none|-)$/i.test(text)) return null;
  const number = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : null;
}

async function readPages() {
  try {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Unable to download the scheme PDF (HTTP ${response.status}).`);
    const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), disableWorker: true }).promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const content = await (await pdf.getPage(number)).getTextContent();
      const rows = new Map();
      for (const item of content.items) {
        if (!item.str) continue;
        const y = Math.round((item.transform?.[5] || 0) * 10) / 10;
        const x = item.transform?.[4] || 0;
        rows.set(y, [...(rows.get(y) || []), { x, text: item.str }]);
      }
      const text = [...rows.entries()].sort(([a], [b]) => b - a)
        .map(([, items]) => items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
        .join("\n").replace(/\s+/g, " ").trim();
      pages.push({ number, text });
    }
    return pages;
  } catch (error) {
    const cached = readJsonIfPresent(INDEX);
    if (cached?.pages?.length) {
      console.warn(`Scheme PDF unavailable (${error.message}); using the verified syllabus index text.`);
      return cached.pages;
    }
    throw error;
  }
}

/** Page 1 prints one row per course offering: title, code, marks, credits, L/T/P. */
export function parseSchemeRows(pages = []) {
  const page = (Array.isArray(pages) ? pages : []).find((entry) => Number(entry?.number) === 1)
    || (Array.isArray(pages) ? pages : [])[0];
  const text = String(page?.text || "");
  const rowPattern = /\b([A-Z]{2,6}\d{3,4})\s+(\d{5})(?:\s+(\d{5}))?\s+(\d)\s+([TP])\s+(Compulsory|Elective)\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,2})\s+(\d{4})\s+(Full Time|Part Time)\s+AICTE\s+(\w+)\s+([NY])\s+([NY])\s+(\d+)\s+(\d+)\s+(\d+)/g;
  const rows = [];
  let previousEnd = 0;
  let match;
  while ((match = rowPattern.exec(text))) {
    // The title wraps around the Sr-No columns, so take the text since the
    // previous row and drop the row-number noise ("5 1 14").
    let prefix = text.slice(previousEnd, match.index);
    const headerEnd = prefix.lastIndexOf("(Practical)");
    if (headerEnd >= 0) prefix = prefix.slice(headerEnd + "(Practical)".length);
    const title = cleanTitle(prefix.replace(/\b\d+\s+\d+\s+14\b/g, " "));
    previousEnd = match.index + match[0].length;
    const internalMarks = Number(match[7]);
    const externalMarks = Number(match[8]);
    rows.push({
      courseCode: match[1],
      title,
      paperId: match[2],
      mCode: match[3] || "",
      semester: Number(match[4]),
      type: match[5],
      elective: match[6],
      internalMarks,
      externalMarks,
      totalMarks: internalMarks + externalMarks,
      credits: Number(match[9]),
      schemeYear: Number(match[10]),
      scheduleType: match[11],
      group: match[12],
      lectureHours: Number(match[15]),
      tutorialHours: Number(match[16]),
      practicalHours: Number(match[17])
    });
  }
  return rows;
}

/** Course pages print the exam rules that the scheme table does not. */
export function parseCourseDetails(pages = []) {
  const details = new Map();
  for (const page of Array.isArray(pages) ? pages : []) {
    const text = String(page?.text || "");
    if (!/Course\s*Code\s*:/i.test(text)) continue;
    const codeMatch = text.match(/Course\s*Code\s*:?\s*([A-Z][A-Z\s]{0,10}\d[\d\s]*?)\s+Course\s*Title\s*:/i);
    const titleMatch = text.match(/Course\s*Title\s*:\s*([\s\S]*?)\s+Programme\s*:/i);
    if (!codeMatch) continue;
    const code = codeOf(codeMatch[1]);
    if (!code) continue;
    const compact = text.replace(/\s+/g, "");
    const ltp = compact.match(/L:(\d+)T:(\d+)P:(\d+)/i);
    const credits = compact.match(/Credits:(\d+)/i);
    const semester = compact.match(/Semester:([0-9/]+)/i);
    const totalMax = compact.match(/TotalMax\.?Marks:(?:ContinuousAssessment)?(?:EndSemesterExamination\(ESE\))?(\d+)/i)
      || compact.match(/TotalMax\.?Marks:(\d+)/i);
    const assessment = compact.slice(0, compact.search(/MinimumPercentage|DurationofEndSemester/i) + 1);
    const assessmentMarks = [...assessment.matchAll(/Marks:(\d+|NIL|NA)/gi)].map((match) => numericOrNull(match[1]));
    const duration = compact.match(/DurationofEndSemesterExamination\(ESE\):(\d+)hours?/i);
    const theoryPractical = compact.match(/Theory\/Practical:([A-Za-z+]+)TeachingHours/i);
    const minNumerical = compact.match(/MinimumPercentageof[^:]*:(\d+)%/i);
    const courseType = compact.match(/CourseType:([A-Za-z]+)CoursePrerequisites/i);
    const prerequisites = text.match(/Course\s*Prerequisites(?:\s*\(if\s*any\))?\s*:\s*([\s\S]*?)(?=Add\s*itional|On\s*completion)/i);
    const additionalMaterial = text.match(/Add\s*itional\s*Material\s+Allowed\s+in\s+ESE\s*:\s*([\s\S]*?)(?=NOTE\s*:|On\s*completion|$)/i);
    const assessmentNote = text.match(/NOTE\s*:\s*([\s\S]*?)(?=On\s*completion|$)/i);
    const readable = (value) => clean(value)
      .replace(/\bAdd\s+itional\b/gi, "Additional")
      .replace(/\bN\s+IL\b/g, "NIL")
      .replace(/\bC\s+alculator\b/gi, "Calculator")
      .replace(/\bCalc\s+ulator\b/gi, "Calculator")
      .replace(/\bCalcu\s+lator\b/gi, "Calculator")
      .replace(/\bDrafte\s+r\b/gi, "Drafter")
      .replace(/\bNon\s*-\s*scientific\b/gi, "Non-scientific")
      .replace(/\bMini\s*-\s*Drafter\b/gi, "Mini-Drafter")
      .replace(/\s*NOTE\s*:\s*/gi, " NOTE: ")
      .replace(/\bUnit\s*-\s*(\d)/gi, "Unit-$1")
      .replace(/\s+([,.;:])/g, "$1");
    details.set(code, {
      title: cleanTitle(titleMatch?.[1] || ""),
      lectureHours: ltp ? Number(ltp[1]) : null,
      tutorialHours: ltp ? Number(ltp[2]) : null,
      practicalHours: ltp ? Number(ltp[3]) : null,
      credits: credits ? Number(credits[1]) : null,
      printedSemester: semester?.[1] || "",
      totalMaxMarks: totalMax ? Number(totalMax[1]) : null,
      theoryPractical: theoryPractical?.[1] || "",
      caMarks: assessmentMarks.slice(-2)[0] ?? null,
      eseMarks: assessmentMarks.slice(-2)[1] ?? null,
      eseDurationHours: duration ? Number(duration[1]) : null,
      eseDurationNote: /DurationofEndSemesterExamination\(ESE\):NA/i.test(compact) ? "NA" : "",
      minNumericalPercent: minNumerical ? Number(minNumerical[1]) : null,
      minNumericalNote: /MinimumPercentageof[^:]*:(?:NIL|NA)/i.test(compact) ? "NIL" : "",
      courseType: courseType ? clean(courseType[1]) : "",
      prerequisites: prerequisites ? readable(prerequisites[1]) : "",
      additionalMaterial: additionalMaterial ? readable(additionalMaterial[1]) : "",
      assessmentNote: assessmentNote ? readable(assessmentNote[1]) : "",
      sourcePage: Number(page?.number) || null
    });
  }
  return details;
}

function fallbackTitle(pages, code) {
  const page = (Array.isArray(pages) ? pages : []).find((entry) => Number(entry?.number) === 1);
  const row = parseSchemeRows([page])?.find((entry) => entry.courseCode === code);
  return row?.title || "";
}

export function buildScheme(pages = []) {
  const rows = parseSchemeRows(pages);
  const details = parseCourseDetails(pages);
  if (rows.length < 20) throw new Error(`The scheme table produced only ${rows.length} rows.`);
  if (details.size < 10) throw new Error(`The course pages produced only ${details.size} courses.`);

  const byCode = new Map();
  for (const row of rows) {
    const entry = byCode.get(row.courseCode) || {
      code: row.courseCode,
      title: row.title || details.get(row.courseCode)?.title || fallbackTitle(pages, row.courseCode) || row.courseCode,
      rows: []
    };
    // The same course can be offered to both first-year groups; keep one row per
    // semester and group, and never duplicate an identical row.
    const key = `${row.semester}|${row.group}`;
    if (!entry.rows.some((existing) => `${existing.semester}|${existing.group}` === key)) entry.rows.push(row);
    byCode.set(row.courseCode, entry);
  }

  const courses = [...byCode.values()].map((entry) => {
    const detail = details.get(entry.code) || {};
    const semesters = [...new Set(entry.rows.map((row) => row.semester))].sort((a, b) => a - b);
    const groups = [...new Set(entry.rows.map((row) => row.group))].sort();
    const primary = entry.rows[0];
    return {
      code: entry.code,
      title: entry.title,
      credits: primary.credits,
      lectureHours: primary.lectureHours,
      tutorialHours: primary.tutorialHours,
      practicalHours: primary.practicalHours,
      internalMarks: primary.internalMarks,
      externalMarks: primary.externalMarks,
      totalMarks: primary.totalMarks,
      caMarks: detail.sourcePage ? detail.caMarks : primary.internalMarks,
      eseMarks: detail.sourcePage ? detail.eseMarks : primary.externalMarks,
      courseType: detail.courseType || "",
      theoryPractical: /Theory\+Practical/i.test(detail.theoryPractical || "")
        || (primary.lectureHours > 0 && primary.practicalHours > 0)
        ? "Theory + Practical"
        : primary.lectureHours > 0 ? "Theory" : primary.practicalHours > 0 ? "Practical" : "Not stated",
      eseDurationHours: detail.eseDurationHours ?? null,
      eseDurationNote: detail.eseDurationNote || "",
      minNumericalPercent: detail.minNumericalPercent ?? null,
      minNumericalNote: detail.minNumericalNote || "",
      prerequisites: detail.prerequisites || "",
      additionalMaterial: detail.additionalMaterial || "",
      assessmentNote: detail.assessmentNote || (entry.code === "ESC102"
        ? "End semester examination shall be set from Unit-1 to Unit-4 only, whereas Unit-5 and Unit-6 shall be evaluated through Continuous Assessment (CA) carrying 10% weightage."
        : ""),
      printedSemester: detail.printedSemester || "",
      semesters,
      groups,
      rows: entry.rows.sort((a, b) => a.semester - b.semester || a.group.localeCompare(b.group))
    };
  }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const semesters = {};
  for (const row of rows) {
    const key = String(row.semester);
    semesters[key] = semesters[key] || {};
    const bucket = semesters[key][row.group] = semesters[key][row.group] || { courses: [], credits: 0, internalMarks: 0, externalMarks: 0, totalMarks: 0 };
    if (!bucket.courses.includes(row.courseCode)) {
      bucket.courses.push(row.courseCode);
      bucket.credits += row.credits;
      bucket.internalMarks += row.internalMarks;
      bucket.externalMarks += row.externalMarks;
      bucket.totalMarks += row.totalMarks;
    }
  }
  for (const groups of Object.values(semesters)) {
    for (const bucket of Object.values(groups)) {
      bucket.courses.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
  }

  return {
    source: SOURCE,
    sourceTitle: "Study Scheme & Syllabus, B.Tech. first year 2024 (semester 1 and 2, Dec 2025)",
    sourceNote: "Scheme Code - 2024. The PDF prints the continuous-assessment (CA) total, the end-semester examination (ESE) marks, credits and L/T/P. MSE-1/MSE-2 weightage is not printed in this document and is never inferred.",
    assessmentNote: "Published assessment: Continuous Assessment (CA) marks form the internal component and the End Semester Examination (ESE) forms the external component. The document does not publish an MSE-1/MSE-2 split, so Compass does not invent one.",
    generatedAt: new Date().toISOString(),
    schemeYear: 2024,
    courses,
    semesters
  };
}

let pages;
try {
  pages = await readPages();
} catch (error) {
  if (!previous?.courses?.length) throw error;
  console.warn(`Scheme source unavailable (${error.message}); keeping the last verified bundle.`);
  process.exit(0);
}

let bundle;
try {
  bundle = buildScheme(pages);
} catch (error) {
  if (!previous?.courses?.length) throw error;
  console.warn(`Scheme parse failed (${error.message}); keeping the last verified bundle.`);
  process.exit(0);
}

if (!bundle.courses.length) {
  console.warn("The scheme produced no courses; keeping the last verified bundle.");
  process.exit(0);
}

await mkdir("next/data", { recursive: true });
const written = writeJsonWhenChanged(OUTPUT, bundle);
console.log(`${written ? "Wrote" : "Checked"} ${bundle.courses.length} first-year courses (${bundle.semesters ? Object.keys(bundle.semesters).length : 0} semesters).`);

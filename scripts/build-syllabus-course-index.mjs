import { mkdir, readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseFirstYearSyllabus, parseSyllabusTableCourses } from "../next/engine/syllabus.js";
import { writeJsonWhenChanged } from "./lib/stable-json.mjs";

const sourcePath = "next/data/syllabus-course-sources.json";
const outputPath = "next/data/syllabus-course-index.json";
const maxPdfBytes = 16_000_000;
const sources = JSON.parse(await readFile(sourcePath, "utf8"));
const indexed = new Map();
const sourceResults = [];

for (const source of sources) {
  const response = await fetch(source.sourceUrl, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${source.sourceUrl} returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxPdfBytes) throw new Error(`${source.sourceUrl} exceeded the ${maxPdfBytes}-byte PDF limit.`);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error(`${source.sourceUrl} did not return a PDF.`);
  const pdf = await getDocument({ data: bytes, disableWorker: true }).promise;
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
      .join("\n").replace(/[\t\f\v ]+/g, " ").trim();
    pages.push({
      number,
      text,
      rows: [...rows.entries()].map(([y, items]) => ({
        y,
        items: items.sort((a, b) => a.x - b.x).map((item) => ({ x: item.x, text: item.text }))
      }))
    });
  }
  const detailed = parseFirstYearSyllabus(pages);
  const table = parseSyllabusTableCourses(pages);
  const hasAuthoritativeCourseTable = table.some((row) => row.staticCourseList === true);
  const tableByCode = new Map();
  for (const row of table) {
    if (!row.code) continue;
    tableByCode.set(row.code, [...(tableByCode.get(row.code) || []), row]);
  }
  const parsed = [...table];
  for (const course of detailed) {
    const matchingTableRows = tableByCode.get(course.code) || [];
    if (matchingTableRows.length) {
      for (const row of matchingTableRows) {
        const existing = parsed.find((item) => item.code === row.code && item.semester === row.semester);
        if (existing) {
          if (!existing.units.length) existing.units = course.units;
        }
      }
      continue;
    }
    if (!hasAuthoritativeCourseTable) parsed.push(course);
  }
  const uniqueParsed = [...new Map(parsed.map((course) => [`${course.semester}|${course.code || course.title}`, course])).values()];
  if (!uniqueParsed.length) {
    console.warn(`No selectable course-unit text was found in ${source.sourceUrl}; it remains available as an official PDF only.`);
    sourceResults.push({
      ...source,
      semesters: [...new Set((source.semesters || []).map(String))].sort((a, b) => Number(a) - Number(b)),
      courseCount: 0,
      courseCountsBySemester: {},
      pageCount: pages.length
    });
    continue;
  }
  for (const course of uniqueParsed) {
    const printedSemesters = [...new Set([...course.semester.matchAll(/\b(10|[1-9])(?:st|nd|rd|th)?\b/g)].map((match) => match[1]))];
    const semesters = (printedSemesters.length ? printedSemesters : course.semester ? [course.semester] : source.semesters || []).map(String).sort((a, b) => Number(a) - Number(b));
    const code = course.code || "";
    const title = source.departmentId === "cse" && code === "CCS104" && semesters.includes("4")
      ? "Database Management Systems"
      : course.title;
    const id = `${source.departmentId}:${source.program.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${code || course.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${semesters.join("-") || "unknown"}`;
    const item = {
      id,
      department: source.department,
      departmentId: source.departmentId,
      program: source.program,
      code,
      title,
      semester: course.semester,
      semesters,
      units: course.units,
      sourceTitle: source.sourceTitle,
      sourceUrl: source.sourceUrl,
      sourcePage: source.sourcePage,
      priority: Number(source.priority) || 0
    };
    const key = `${source.departmentId}|${source.program}|${code || title}|${semesters.join(",")}`;
    const existing = indexed.get(key);
    if (!existing || existing.priority < item.priority || (existing.units.length < item.units.length && existing.priority === item.priority)) indexed.set(key, item);
  }
  const parsedSemesters = [...new Set(uniqueParsed.flatMap((course) => [...String(course.semester || "").matchAll(/\b(10|[1-9])(?:st|nd|rd|th)?\b/g)].map((match) => match[1])))]
    .sort((a, b) => Number(a) - Number(b));
  const courseCountsBySemester = Object.fromEntries([...new Set(uniqueParsed.map((course) => String(course.semester || "")))]
    .filter((semester) => /^\d+$/.test(semester))
    .map((semester) => [semester, uniqueParsed.filter((course) => String(course.semester || "") === semester).length]));
  sourceResults.push({
    ...source,
    semesters: [...new Set([...(source.semesters || []), ...parsedSemesters].map(String))].sort((a, b) => Number(a) - Number(b)),
    courseCount: uniqueParsed.length,
    courseCountsBySemester,
    pageCount: pages.length
  });
  console.log(`Indexed ${parsed.length} courses from ${source.sourceTitle}.`);
}

const courses = [...indexed.values()].sort((a, b) => a.department.localeCompare(b.department)
  || a.program.localeCompare(b.program) || Number(a.semesters[0] || 99) - Number(b.semesters[0] || 99)
  || a.title.localeCompare(b.title));
await mkdir("next/data", { recursive: true });
const written = writeJsonWhenChanged(outputPath, {
  generatedAt: new Date().toISOString(),
  sources: sourceResults,
  courses
});
console.log(`${written ? "Wrote" : "Checked"} ${courses.length} verified courses from ${sourceResults.length} official PDFs.`);

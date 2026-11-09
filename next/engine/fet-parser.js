/**
 * FET timetable parser for Compass Next.
 *
 * This is a faithful, independently tested port of the legacy app's parser.
 * It reads the official GNDEC FET HTML export in the browser and supports both
 * the semantic export (`.subject`, `.teacher`, `.room`, `.studentsset`) and the
 * low-detail export that only uses line breaks.
 *
 * The parser never invents a teacher, room, subject or cohort. A cell that
 * cannot be read completely is reported through `unparsedCells`, and the
 * caller must refuse to replace a verified release.
 */

import { DAY_NAMES, minutesFromTime } from "./datetime.js";

export function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function directCells(row) {
  const cells = row ? (row.cells ? [...row.cells] : [...row.children]) : [];
  return cells.filter((cell) => cell.tagName === "TD");
}

function makeEntry({ group, day, start, duration, subject, teacher, room, type, cohorts }) {
  if (!subject) return null;
  const safeCohorts = cleanText(cohorts);
  return {
    id: `${group}-${day}-${start}-${subject}-${room}-${safeCohorts}`,
    group,
    day,
    start,
    end: start + duration,
    subject,
    teacher: teacher || "Teacher not listed",
    room: room || "Room not listed",
    type: cleanText(type),
    cohorts: safeCohorts
  };
}

function readNestedCell(cell, selector) {
  const node = cell.querySelector(selector);
  return cleanText(node ? node.textContent : "");
}

function parseDetailedCell(cell, group, day, start, duration, view) {
  const table = cell.querySelector("table.detailed");
  if (!table) return [];
  const cohortCells = directCells(table.querySelector("tr.studentsset"));
  const subjectRow = [...table.querySelectorAll("tr")].find((row) => row.querySelector(".subject"));
  const subjectCells = directCells(subjectRow || (view === "subjects" ? table.querySelector("tr.line0") : null));
  const teacherCells = directCells(table.querySelector("tr.teacher"));
  const roomCells = directCells(table.querySelector("tr.room"));
  return subjectCells.map((subjectCell, index) => makeEntry({
    group, day, start, duration,
    subject: readNestedCell(subjectCell, ".subject") || (view === "subjects" ? group : ""),
    teacher: cleanText(teacherCells[index]?.textContent || "") || (view === "teachers" ? group : ""),
    room: cleanText(roomCells[index]?.textContent || "") || (view === "rooms" ? group : ""),
    type: readNestedCell(subjectCell, ".activitytag"),
    cohorts: cleanText(cohortCells[index]?.textContent || "")
  })).filter(Boolean);
}

function plainFetLines(cell) {
  const copy = cell.cloneNode(true);
  copy.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return copy.textContent.split(/\n/).map(cleanText).filter(Boolean);
}

function plainFetSubject(value, subjects) {
  const tagged = cleanText(value).match(/^(.+?)\s+([LTP])$/);
  if (tagged) return { subject: tagged[1], type: tagged[2] };
  return subjects.has(cleanText(value)) ? { subject: cleanText(value), type: "" } : null;
}

function plainFetTail(fields, catalog) {
  if (!fields.length) return { teacher: "", room: "" };
  if (fields.length === 2) return { teacher: fields[0], room: fields[1] };
  if (fields.length !== 1) return null;
  const value = fields[0];
  if (!value) return { teacher: "", room: "" };
  const room = catalog.rooms.has(value)
    || /\b(?:LAB|LABORATORY|WORKSHOPS?|HALL)\b/i.test(value)
    || /^[A-Z]\d{1,3}(?:\s*\([^)]*\))?$/.test(value);
  const teacher = catalog.teachers.has(value) || /^(?:DR|ER|MS|MR|MRS|PROF(?:ESSOR)?)\b/i.test(value);
  if (room === teacher) return null;
  return { teacher: teacher ? value : "", room: room ? value : "" };
}

function plainFetFields(lines, group, view, catalog) {
  if (!lines.length || lines.every((line) => !line || /^[-–—]+$/.test(line))) return null;
  if (view === "subjects") {
    if (!/^[LTP]?$/.test(lines[0]) || lines.length < 2) return null;
    const tail = plainFetTail(lines.slice(2), catalog);
    return tail && { subject: group, type: lines[0], cohorts: lines[1], ...tail };
  }
  const index = lines.findIndex((line) => plainFetSubject(line, catalog.subjects));
  if (index < 0) return null;
  const subject = plainFetSubject(lines[index], catalog.subjects);
  const before = lines.slice(0, index);
  const after = lines.slice(index + 1);
  if (view === "teachers") {
    if (before.length < 1 || before.length > 2 || after.length > 1) return null;
    return { ...subject, cohorts: before.at(-1), teacher: before.length === 2 ? before[0] : group, room: after[0] || "" };
  }
  if (view === "rooms") {
    if (before.length < 1 || before.length > 2 || after.length) return null;
    return { ...subject, cohorts: before[0], teacher: before[1] || "", room: group };
  }
  if (before.length > 1) return null;
  const tail = plainFetTail(after, catalog);
  return tail && { ...subject, cohorts: before[0] || "", ...tail };
}

function plainFetCatalog(doc) {
  const catalog = { subjects: new Set(), teachers: new Set(), rooms: new Set() };
  doc.querySelectorAll("td").forEach((cell) => {
    if (cell.querySelector("table")) return;
    for (const line of plainFetLines(cell)) {
      const tagged = line.match(/^(.+?)\s+[LTP]$/);
      if (tagged) catalog.subjects.add(tagged[1]);
    }
  });
  doc.querySelectorAll("table.detailed").forEach((table) => {
    const rows = [...table.querySelectorAll("tr")]
      .filter((row) => row.closest("table") === table)
      .map((row) => directCells(row).map((cell) => cleanText(cell.textContent)));
    if (rows.length !== 4) return;
    rows[2].filter(Boolean).forEach((value) => catalog.teachers.add(value));
    rows[3].filter(Boolean).forEach((value) => catalog.rooms.add(value));
  });
  return catalog;
}

function parsePlainFetCell(cell, group, day, start, duration, view, catalog) {
  const table = cell.querySelector("table.detailed");
  let columns;
  if (table) {
    const rows = [...table.querySelectorAll("tr")]
      .filter((row) => row.closest("table") === table)
      .map((row) => directCells(row).map((item) => cleanText(item.textContent)));
    const width = rows[0]?.length || 0;
    if (!width || rows.some((row) => row.length !== width)) return [];
    columns = Array.from({ length: width }, (_, index) => rows.map((row) => row[index]));
  } else {
    columns = [plainFetLines(cell)];
  }
  const entries = columns.map((lines) => {
    const fields = plainFetFields(lines, group, view, catalog);
    return fields ? makeEntry({ group, day, start, duration, ...fields }) : null;
  });
  return entries.every(Boolean) ? entries : [];
}

function parseCell(cell, group, day, start, duration, view, catalog) {
  if (cell.classList.contains("empty") || cleanText(cell.textContent) === "") return [];
  const detailedEntries = parseDetailedCell(cell, group, day, start, duration, view);
  if (detailedEntries.length) return detailedEntries;
  if (!cell.querySelector(".subject, .activitytag")) return parsePlainFetCell(cell, group, day, start, duration, view, catalog);
  return [makeEntry({
    group, day, start, duration,
    subject: readNestedCell(cell, ".subject") || (view === "subjects" && cell.querySelector(".activitytag") ? group : ""),
    teacher: readNestedCell(cell, ".teacher") || (view === "teachers" ? group : ""),
    room: readNestedCell(cell, ".room") || (view === "rooms" ? group : ""),
    type: readNestedCell(cell, ".activitytag"),
    cohorts: readNestedCell(cell, ".studentsset")
  })].filter(Boolean);
}

/**
 * Parse a FET export.
 * @param {string} html
 * @param {"groups"|"subgroups"|"teachers"|"rooms"|"subjects"} view
 * @param {{DOMParser?: typeof DOMParser}} options
 * @returns {Array<object> & {unparsedCells:number}}
 */
export function parseFetTimetable(html, view = "groups", options = {}) {
  const Parser = options.DOMParser || globalThis.DOMParser;
  if (typeof Parser !== "function") throw new Error("A DOMParser implementation is required to read the official timetable.");
  if (typeof html !== "string" || html.length < 100) throw new Error("The official timetable response was empty.");
  const doc = new Parser().parseFromString(html, "text/html");
  const schedule = [];
  const catalog = plainFetCatalog(doc);
  let unparsedCells = 0;

  [...doc.querySelectorAll("table")].forEach((table) => {
    const group = cleanText(table.querySelector("caption .name")?.textContent || "");
    const headers = [...table.querySelectorAll("thead .xAxis")].map((header) => cleanText(header.textContent));
    const body = table.querySelector("tbody");
    const rows = body ? (body.rows ? [...body.rows] : [...body.querySelectorAll("tr")].filter((row) => row.closest("table") === table)) : [];
    if (!group || headers.length < 5 || !rows.length) return;
    const activeSpans = Array(headers.length).fill(0);
    const rowTimes = rows.map((row) => minutesFromTime(cleanText(row.querySelector("th.yAxis")?.textContent || "")));

    rows.forEach((row, rowIndex) => {
      const start = rowTimes[rowIndex];
      if (!start) return;
      const cells = directCells(row);
      let nextCell = 0;
      for (let column = 0; column < headers.length; column += 1) {
        if (activeSpans[column] > 0) {
          activeSpans[column] -= 1;
          continue;
        }
        const cell = cells[nextCell++];
        if (!cell) continue;
        const rowSpan = Number(cell.getAttribute("rowspan") || 1);
        const nextStart = rowTimes[rowIndex + rowSpan];
        const duration = nextStart && nextStart > start ? nextStart - start : 50 * rowSpan;
        const entries = parseCell(cell, group, headers[column], start, duration, view, catalog);
        const text = cleanText(cell.textContent);
        if (!entries.length && text && !/^[-–—]+$/.test(text) && !cell.classList.contains("empty") && !cell.classList.contains("break")) unparsedCells += 1;
        schedule.push(...entries);
        const columnSpan = Number(cell.getAttribute("colspan") || 1);
        for (let span = 0; span < columnSpan; span += 1) {
          if (rowSpan > 1) activeSpans[column + span] = rowSpan - 1;
        }
        column += columnSpan - 1;
      }
    });
  });

  const unique = new Map(schedule.map((item) => [item.id, item]));
  const result = [...unique.values()].sort((a, b) =>
    a.group.localeCompare(b.group)
    || DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day)
    || a.start - b.start
  );
  Object.defineProperty(result, "unparsedCells", { value: unparsedCells, enumerable: false });
  return result;
}

export function isValidScheduleEntry(item) {
  return Boolean(item && typeof item.group === "string" && item.group
    && typeof item.day === "string" && DAY_NAMES.includes(item.day)
    && typeof item.subject === "string" && item.subject
    && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);
}

export function sanitizeSchedule(schedule) {
  return (Array.isArray(schedule) ? schedule : []).filter(isValidScheduleEntry).map((item) => ({
    ...item,
    teacher: typeof item.teacher === "string" && item.teacher ? item.teacher : "Teacher not listed",
    room: typeof item.room === "string" && item.room ? item.room : "Room not listed",
    cohorts: typeof item.cohorts === "string" ? item.cohorts : ""
  }));
}

/** Parse and validate a release. Throws on any unreadable cell. */
export function readVerifiedFetTimetable(html, view = "groups", options = {}) {
  const schedule = parseFetTimetable(html, view, options);
  if (!schedule.length || schedule.unparsedCells) {
    throw new Error(`The official ${view} timetable could not be read completely. The saved timetable has not been replaced.`);
  }
  return sanitizeSchedule(schedule);
}

export function mergeSchedules(...schedules) {
  const seen = new Set();
  const merged = [];
  for (const schedule of schedules) {
    for (const entry of sanitizeSchedule(schedule)) {
      const key = entry.id || `${entry.group}|${entry.day}|${entry.start}|${entry.end}|${entry.subject}|${entry.cohorts}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
  }
  return merged.sort((a, b) =>
    a.group.localeCompare(b.group)
    || DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day)
    || a.start - b.start
  );
}

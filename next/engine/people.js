/** Deterministic, privacy-limited student and faculty name routing for Ask. */

import { escapeHtml } from "./answer.js";
import { humanTime } from "./datetime.js";
import { findProfileRosterMatches, normalizeRosterName } from "./profile-lookup.js";

const NAME_STOP_WORDS = new Set([
  "all", "about", "after", "am", "and", "are", "before", "class", "classes", "college", "course", "day", "directory",
  "evening", "exam", "faculty", "find", "free", "good", "hello", "hey", "hi", "how", "in", "is", "it", "list", "math",
  "maths", "mathematics", "morning", "my", "next", "notice", "of", "on", "paper", "physics", "chemistry", "pps", "problem",
  "profile", "room", "schedule", "semester", "show", "sitting", "solving", "student", "students", "subject", "syllabus", "teacher",
  "teachers", "today", "timetable", "tomorrow", "who", "what", "when", "where", "which", "year"
]);

function looksLikeName(value) {
  const words = normalizeRosterName(value).split(" ").filter(Boolean);
  return words.length >= 2 && words.length <= 5
    && words.every((word) => /^[a-z]{2,}$/.test(word) && !NAME_STOP_WORDS.has(word));
}

function stripRosterScope(value) {
  let name = normalizeRosterName(value);
  let subsection = "";
  let section = "";
  const subMatch = /\s+(?:subsection|subgroup)\s+([a-z0-9]+)$/.exec(name);
  if (subMatch) {
    subsection = subMatch[1];
    name = name.slice(0, subMatch.index).trim();
  }
  const sectionMatch = /\s+(?:in\s+)?section\s+([a-z0-9]+)$/.exec(name);
  if (sectionMatch) {
    section = sectionMatch[1];
    name = name.slice(0, sectionMatch.index).trim();
  }
  return { name, section, subsection };
}

function result(html, intent, personRole, personName, { suggestions = [], plan = [] } = {}) {
  return {
    html,
    intent,
    confidence: 1,
    plan,
    entities: { personRole, personName },
    suggestions
  };
}

/** Identify an explicit student/faculty role or a bare person-name query. */
export function parsePersonQuestion(question = "") {
  const raw = String(question || "").trim();
  if (!raw || raw.length > 180) return null;
  const explicit = /^(?:(?:please\s+)?(?:find|show|search(?:\s+for)?|look\s+up)\s+(?:me\s+)?(?:a\s+|the\s+)?(student|students|faculty|teacher|teachers|professor|professors)\s+|(student|students|faculty|teacher|teachers|professor|professors)\s+)(.+)$/i.exec(raw);
  if (explicit) {
    const rawName = explicit[3].trim();
    const role = (explicit[1] || explicit[2]).toLowerCase();
    const identifier = /^(?:crn|registration(?:\s+(?:number|no))?|serial(?:\s+(?:number|no))?)\s*[:#]?\s*(\d{2,12})$/i.exec(rawName);
    const scoped = stripRosterScope(identifier?.[1] || rawName);
    const isStudentIdentifier = role.startsWith("student") && /^\d{6,12}$/.test(scoped.name);
    if (!looksLikeName(scoped.name) && !isStudentIdentifier) return null;
    const displayName = identifier?.[1] || rawName.replace(/\s+(?:in\s+)?section\s+[a-z0-9]+(?:\s+(?:subsection|subgroup)\s+[a-z0-9]+)?$/i, "").trim();
    return {
      role: role.startsWith("student") ? "student" : "faculty",
      name: displayName,
      rawName: scoped.name,
      section: scoped.section,
      subsection: scoped.subsection
    };
  }
  const name = raw.replace(/^(?:who\s+is|tell\s+me\s+about|find|search\s+for|look\s+up)\s+/i, "").trim();
  if (!looksLikeName(name)) return null;
  return { role: "ambiguous", name, rawName: normalizeRosterName(name), section: "", subsection: "" };
}

function disambiguationAnswer(person) {
  const name = person.name.trim();
  return result(
    `<p><strong>Which record are you looking for?</strong></p><p>Choose a student roster lookup or a faculty/timetable teacher lookup for ${escapeHtml(name)}.</p>`,
    "PERSON_DISAMBIGUATION",
    "ambiguous",
    name,
    {
      suggestions: [`Student ${name}`, `Faculty ${name}`],
      plan: ["recognize a name without assigning a role", "ask the user to choose the record type"]
    }
  );
}

function studentAnswer(person, students) {
  const candidates = findProfileRosterMatches(students, person.rawName)
    .filter((record) => !person.section || normalizeRosterName(record?.section) === person.section)
    .filter((record) => !person.subsection || normalizeRosterName(record?.subsection) === person.subsection);
  const identifierQuery = /^\d+$/.test(String(person.rawName || ""));
  const requested = normalizeRosterName(person.rawName);
  const matches = identifierQuery
    ? candidates.filter((record) => [record?.crn, record?.registrationNo, record?.serialNo, record?.currentSerialNo, record?.newSerialNo, ...(Array.isArray(record?.oldSerialNos) ? record.oldSerialNos : [])]
      .some((value) => String(value || "").replace(/\D/g, "") === person.rawName))
    : candidates.filter((record) => normalizeRosterName(record?.name) === requested);
  if (matches.length === 1) {
    const record = matches[0];
    const details = [
      ["Name", record.name],
      ["CRN", record.crn],
      ["Registration number", record.registrationNo],
      ["Serial number", record.currentSerialNo || record.newSerialNo || record.serialNo],
      ["Group / branch", record.branch],
      ["Section", record.section],
      ["Subgroup", record.subsection],
      ["Mentor", record.mentor],
      ["Mentor phone", record.mentorPhone],
      ["Venue", record.mentorVenue || record.venue],
      ["Mentoring group", record.academicGroup]
    ];
    const detailHtml = details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value || "Not listed"))}</dd></div>`).join("");
    return result(
      `<p><strong>Verified student roster match</strong></p><dl class="person-detail-grid">${detailHtml}</dl><p class="answer-meta">These details come from the published roster and are handled on this device. This lookup did not change your saved profile.</p>`,
      "STUDENT_LOOKUP",
      "student",
      record.name,
      { plan: ["match the requested name or identifier to the local verified roster", "show the published student profile fields", "leave the active profile unchanged"] }
    );
  }
  if (candidates.length > 1 || candidates.length === 1 && matches.length === 0) {
    const descriptions = candidates.map((record) => {
      const section = String(record.section || "").trim();
      const subsection = String(record.subsection || "").trim();
      const base = `Student ${record.name}${section ? ` in section ${section}` : ""}${subsection ? ` subsection ${subsection}` : ""}`;
      return { record, base };
    });
    const baseCounts = new Map();
    for (const { base } of descriptions) baseCounts.set(base.toLowerCase(), (baseCounts.get(base.toLowerCase()) || 0) + 1);
    const suggestions = [...new Set(descriptions.map(({ record, base }) => {
      const identifier = [record.crn, record.registrationNo, record.currentSerialNo || record.serialNo, record.newSerialNo].find(Boolean);
      if (identifierQuery) return identifier ? `Student ${identifier}` : "";
      if ((baseCounts.get(base.toLowerCase()) || 0) > 1) return record.crn ? `Student CRN ${record.crn}` : "";
      return base;
    }).filter(Boolean))].slice(0, 4);
    return result(
      `<p><strong>I found ${candidates.length === 1 ? "a possible" : "multiple possible"} roster match${candidates.length === 1 ? "" : "es"} for ${escapeHtml(person.rawName)}.</strong></p><p>${suggestions.length ? "Choose the exact student record below before I show its profile details." : "Use the Students directory to distinguish these records; I will not guess."}</p>`,
      "STUDENT_LOOKUP_AMBIGUOUS",
      "student",
      person.rawName,
      { suggestions, plan: ["keep partial or duplicate roster matches unconfirmed", "ask the user to choose an exact record", "show profile details only after selection"] }
    );
  }
  return result(
    `<p><strong>I could not verify ${escapeHtml(person.name || person.rawName)} in the student roster loaded on this device.</strong></p><p>Check the spelling or search the Students directory. I did not substitute a timetable teacher.</p>`,
    "STUDENT_LOOKUP_NOT_FOUND",
    "student",
    person.rawName,
    { plan: ["search only the verified student roster", "refuse an unverified match", "do not fall through to teacher matching"] }
  );
}
function facultyRecords(faculty = [], name = "") {
  const target = normalizeRosterName(name);
  const records = Array.isArray(faculty) ? faculty : [];
  const exact = records.filter((record) => normalizeRosterName(record?.name) === target);
  if (exact.length) return exact;
  const tokens = target.split(" ").filter(Boolean);
  if (tokens.length < 2) return [];
  return records.filter((record) => {
    const normalized = normalizeRosterName(record?.name);
    return tokens.every((token) => normalized.includes(token));
  });
}

function timetableTeacherRows(schedule = [], name = "", group = "", subgroup = "") {
  const target = normalizeRosterName(name);
  const rows = (Array.isArray(schedule) ? schedule : []).filter((entry) => normalizeRosterName(entry?.teacher) === target);
  const active = rows.filter((entry) => {
    if (entry.group !== group) return false;
    if (!subgroup) return true;
    const cohorts = String(entry.cohorts || "").split(/\s*,\s*/).filter(Boolean).map(normalizeRosterName);
    return !cohorts.length || cohorts.includes(normalizeRosterName(group)) || cohorts.includes(normalizeRosterName(subgroup));
  });
  return { rows, active };
}

function facultyAnswer(person, { faculty = [], schedule = [], group = "", subgroup = "" } = {}) {
  const records = facultyRecords(faculty, person.rawName);
  if (records.length === 1) {
    const record = records[0];
    const facts = [record.designation, record.department].map((value) => String(value || "").trim()).filter(Boolean);
    return result(
      `<p><strong>${escapeHtml(record.name)}</strong></p>${facts.length ? `<p>${facts.map(escapeHtml).join(" · ")}</p>` : "<p>The public faculty directory does not list a designation or department for this record.</p>"}`,
      "FACULTY_LOOKUP",
      "faculty",
      record.name,
      { plan: ["match the explicit faculty name to the public directory", "show only published professional details"] }
    );
  }
  if (records.length > 1) {
    return result(
      `<p><strong>More than one faculty profile matches ${escapeHtml(person.rawName)}.</strong></p><p>Add the department or another part of the name so I can select the correct public profile.</p>`,
      "FACULTY_LOOKUP_AMBIGUOUS",
      "faculty",
      person.rawName,
      { plan: ["match the explicit faculty name", "preserve multiple directory matches", "ask for a department instead of guessing"] }
    );
  }

  const { rows, active } = timetableTeacherRows(schedule, person.rawName, group, subgroup);
  if (rows.length) {
    const shown = active.length ? active.slice(0, 8) : rows.slice(0, 8);
    const items = shown.map((entry) => {
      const time = `${humanTime(entry.start, "12h")}–${humanTime(entry.end, "12h")}`;
      const scope = active.length ? "" : `${entry.group || "Published section"} · `;
      return `<li>${escapeHtml(scope)}${escapeHtml(entry.subject)} · ${escapeHtml(entry.day)} · ${escapeHtml(time)}${entry.room ? ` · ${escapeHtml(entry.room)}` : ""}</li>`;
    }).join("");
    return result(
      `<p><strong>${escapeHtml(rows[0].teacher)}</strong> is listed ${active.length ? "in your selected timetable" : "in the published timetable, but not in your selected timetable"}.</p><ul>${items}</ul>${shown.length < (active.length || rows.length) ? `<p class="answer-meta">Showing ${shown.length} published timetable entries.</p>` : ""}`,
      "FACULTY_TIMETABLE_LOOKUP",
      "faculty",
      rows[0].teacher,
      { plan: ["match the requested teacher name exactly", "check the active timetable selection first", "show only published class rows"] }
    );
  }

  return result(
    `<p><strong>I could not verify ${escapeHtml(person.name || person.rawName)} as a faculty profile or exact timetable teacher.</strong></p><p>Check the spelling or search the Faculty directory. I did not substitute a teacher with a similar surname.</p>`,
    "FACULTY_LOOKUP_NOT_FOUND",
    "faculty",
    person.rawName,
    { plan: ["search the public faculty directory and exact timetable names", "refuse a similar-name substitution"] }
  );
}

/** Resolve an explicit role locally; bare names always get clickable role choices. */
export function answerPersonQuestion(person, context = {}) {
  if (!person || typeof person !== "object") return null;
  if (person.role === "ambiguous") return disambiguationAnswer(person);
  if (person.role === "student") return studentAnswer(person, context.students);
  if (person.role === "faculty") return facultyAnswer(person, context);
  return null;
}

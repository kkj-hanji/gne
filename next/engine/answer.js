/**
 * Deterministic local answer engine for Compass Next.
 *
 * This layer is the safety net and the factual core: it only reads verified
 * timetable, room, profile and datesheet data. It never guesses a teacher, a
 * room, a section, a date or a syllabus fact. When it cannot verify something
 * it returns `null` and the caller may offer a careful refusal or hand an
 * open-ended, non-factual question to the optional AI relay.
 *
 * Input handling is deliberately forgiving: the same routing works for plain
 * English, Hinglish, romanised Hindi/Punjabi, Devanagari, Gurmukhi, SMS
 * shortforms, subject codes and ordinary typos. See `language.js`.
 */

import {
  DAY_NAMES,
  STUDY_DAYS,
  addDays,
  formatDuration,
  getIndiaNow,
  humanTime,
  isHappeningNow,
  parseTimeExpression,
  relativeStartLabel,
  resolveQuestionDay,
  weekdayIndex
} from "./datetime.js";
import { computeFreeRooms, formatFreeWindow, groupRooms, isRoomFree, zoneFromQuestion } from "./free-rooms.js";
import { academicPeriodFor, dayOfWeek, holidayOn, upcomingHolidays } from "./calendar.js";
import { filterNotices, noticeStats } from "./notices.js";
import { searchPapers } from "./papers.js";
import { searchSyllabus } from "./syllabus.js";
import { examsOnDate, importantExamEventsForSelection } from "./exams.js";
import {
  bestMatch,
  canonicalize,
  contentTokens,
  mentions,
  tokenSimilar,
  VOCAB
} from "./language.js";

export const BELL_SLOTS = Object.freeze([
  { start: 510, end: 570 }, { start: 570, end: 630 }, { start: 630, end: 690 }, { start: 690, end: 750 },
  { start: 750, end: 810 }, { start: 810, end: 870 }, { start: 870, end: 930 }, { start: 930, end: 980 }
]);

export const MONTHS = Object.freeze({
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
});

/** Subject-code and nickname expansions used only for matching real subjects. */
const SUBJECT_ALIASES = Object.freeze({
  pps: ["programming", "problem", "solving"],
  pp: ["programming", "problem"],
  c: ["programming"],
  m1: ["math"], math1: ["math"], m2: ["math"], m3: ["math"], m4: ["math"],
  maths: ["math"], mathematics: ["math"], calculus: ["math"], algebra: ["math"],
  numerics: ["math"], numerical: ["math"], fym: ["math"], fymath: ["math"],
  phy: ["physics"], phys: ["physics"], physic: ["physics"],
  phyjics: ["physics"], phijiks: ["physics"], fiziks: ["physics"], fyziqs: ["physics"],
  bhautiki: ["physics"], phijics: ["physics"], fyp: ["physics"], fyphys: ["physics"],
  chem: ["chemistry"], chemisty: ["chemistry"], kemistry: ["chemistry"],
  rasayan: ["chemistry"], rasaayan: ["chemistry"], fyc: ["chemistry"], fychem: ["chemistry"],
  eg: ["drawing"], ed: ["drawing"], edg: ["drawing"], drawing: ["drawing"], graphics: ["drawing"],
  mp: ["manufacturing"], workshop: ["manufacturing"], wshop: ["manufacturing"], mfg: ["manufacturing"],
  mechanical: ["mechanical"],
  eco: ["economics"], econ: ["economics"],
  mcpd: ["mentoring"], mentoring: ["mentoring"],
  pec: ["english"], english: ["english"], communication: ["english"],
  fye: ["english"], fyenglish: ["english"],
  bee: ["electrical"], beee: ["electrical"], beeee: ["electrical"], eee: ["electrical"],
  electrical: ["electrical"], elec: ["electrical"],
  ece: ["electronics"], ec: ["electronics"], electronics: ["electronics"],
  cse: ["computer"], cs: ["computer"], computer: ["computer"],
  ce: ["civil"], civil: ["civil"],
  env: ["environment"], envt: ["environment"], envsci: ["environment"],
  ds: ["data"], dsa: ["data"], dsaa: ["data"],
  os: ["operating"],
  dbms: ["database"],
  cn: ["network"], ntwk: ["network"],
  hm: ["humanities"], humnt: ["humanities"],
  pns: ["probability"], prob: ["probability"], stats: ["statistics"], statistics: ["statistics"],
  appl: ["app"], app: ["app"], applied: ["app"],
  business: ["business"], essentials: ["business"],
  thermd: ["thermodynamics"], thermo: ["thermodynamics"], td: ["thermodynamics"],
  fluid: ["fluid"], fm: ["fluid"], hydraulics: ["fluid"],
  strength: ["strength"], som: ["strength"], mechanics: ["mechanics"], mech: ["mechanics"],
  signals: ["signals"], dsp: ["signals"], digital: ["digital"],
  microprocessor: ["microprocessor"], mp8085: ["microprocessor"], mpu: ["microprocessor"],
  embedded: ["embedded"], iot: ["iot"],
  compiler: ["compiler"], automata: ["automata"], toc: ["automata"],
  crypto: ["cryptography"], security: ["cryptography"],
  ml: ["machine"], ai: ["artificial"], dl: ["deep"],
  biomedical: ["biomedical"], bme: ["biomedical"],
  textile: ["textile"], tex: ["textile"],
  industrial: ["industrial"], ie: ["industrial"],
  production: ["production"], pe: ["production"],
  material: ["material"],
  mcq: ["quiz"],
  lab: ["practical"],
  elective: ["elective"]
});

const ORDINALS = Object.freeze({
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
  "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8
});

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeQuestion(question = "") {
  return canonicalize(question);
}

/** Meaningful words, including short subject codes such as "pps" and "bee". */
export function keywordsOf(question = "") {
  return contentTokens(question);
}

function classTypeLabel(value) {
  const type = String(value || "").trim().toUpperCase();
  if (type === "L") return "Lecture";
  if (type === "T") return "Tutorial";
  if (type === "P") return "Practical";
  return type;
}

/** Classes for one section and day, respecting cohort sub-groups. */
export function classesFor(schedule, group, day, subgroup = "") {
  return (Array.isArray(schedule) ? schedule : [])
    .filter((entry) => entry && entry.group === group && (day ? entry.day === day : true))
    .filter((entry) => {
      if (!subgroup) return true;
      const cohorts = String(entry.cohorts || "").split(/\s*,\s*/).filter(Boolean);
      return !cohorts.length || cohorts.includes(group) || cohorts.includes(subgroup);
    })
    .sort((a, b) => a.start - b.start);
}

export function currentAndNext(classes, minutes) {
  const sorted = [...classes].sort((a, b) => a.start - b.start);
  const current = sorted.find((entry) => isHappeningNow(entry, minutes)) || null;
  const next = sorted.find((entry) => entry.start > minutes) || null;
  return { current, next };
}

/* ── exam-day awareness ───────────────────────────────────────────────── */

function importantExams(ctx) {
  return importantExamEventsForSelection({
    datesheet: ctx.datesheet,
    group: ctx.group,
    branch: ctx.profile?.branch || ""
  });
}

function examsForDate(ctx, dateISO) {
  return dateISO ? examsOnDate(importantExams(ctx), dateISO) : [];
}

/** Next calendar date for a weekday name; today counts as offset 0. */
function dateForWeekday(day, now) {
  const target = DAY_NAMES.indexOf(day);
  const base = DAY_NAMES.indexOf(now?.day);
  if (target < 0 || base < 0) return now?.dateISO || "";
  return addDays(now, (target - base + 7) % 7).dateISO;
}

function shortDate(iso) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
}

function examTimeLine(exam, clock = "12h") {
  if (exam.start != null && exam.end != null) return `${humanTime(exam.start, clock)}–${humanTime(exam.end, clock)}`;
  if (exam.start != null) return humanTime(exam.start, clock);
  return exam.sessionRaw || "Time not listed";
}

function examCard(exam, ctx) {
  const clock = ctx.clock || "12h";
  const meta = [exam.category, exam.tab, exam.sessionNote].filter(Boolean).join(" · ");
  return `<div class="answer-class">
    <div class="answer-class-time">${escapeHtml(examTimeLine(exam, clock))}</div>
    <div class="answer-class-body"><strong>${escapeHtml(exam.title)}</strong>${meta ? `<div class="answer-class-meta">${escapeHtml(meta)}</div>` : ""}</div>
  </div>`;
}

function examDayResult(exams, ctx, { label = "", dateISO = "" } = {}) {
  if (!exams.length) return null;
  return {
    html: `<p><strong>${escapeHtml(label || "Exam day")}${dateISO ? ` · ${escapeHtml(shortDate(dateISO))}` : ""}</strong></p>
      ${exams.map((exam) => examCard(exam, ctx)).join("")}
      <p class="answer-meta">The published exam date sheet replaces the class timetable on this day, so no lecture is listed. Confirm the sitting and venue on the official notice before travelling.</p>`,
    intent: "EXAM_DAY",
    confidence: 0.97,
    plan: ["read the selected section's published date sheet", "match the asked date", "show only the verified sitting", "do not invent a lecture or venue"],
    entities: { exams: exams.map((exam) => exam.title), dateISO }
  };
}

/** First day at or after today that has an unexpired published paper. */
function nextExamDay(ctx, now, horizon = 21) {
  for (let offset = 0; offset <= horizon; offset += 1) {
    const candidate = addDays(now, offset);
    const exams = examsForDate(ctx, candidate.dateISO);
    const live = offset > 0 ? exams : exams.filter((exam) => exam.end == null || exam.end > now.minutes);
    if (live.length) return { ...candidate, exams: live };
  }
  return null;
}

export function freeBellSlots(classes) {
  return BELL_SLOTS
    .filter((slot) => !classes.some((entry) => entry.start < slot.end && entry.end > slot.start))
    .map((slot) => ({ ...slot, duration: slot.end - slot.start }));
}

function sourceLine(ctx, extra = "") {
  const version = ctx.metadata?.version ? ` · release ${ctx.metadata.version}` : "";
  const freshness = ctx.metadata?.checkedAt ? ` · checked ${ctx.metadata.checkedAt.slice(0, 10)}` : "";
  return `<p class="answer-source">Official GNDEC weekly timetable${version}${freshness}${extra ? ` · ${extra}` : ""}.</p>`;
}

function classCard(entry, ctx, { highlight = false } = {}) {
  const clock = ctx.clock || "12h";
  const tags = [];
  if (ctx.showCode !== false && entry.type) tags.push(`<span class="tag">${escapeHtml(classTypeLabel(entry.type))}</span>`);
  if (ctx.showTeacher !== false && entry.teacher) tags.push(`<span>${escapeHtml(entry.teacher)}</span>`);
  if (ctx.showRoom !== false && entry.room) tags.push(`<span>${escapeHtml(entry.room)}</span>`);
  return `<div class="answer-class${highlight ? " is-now" : ""}">
    <div class="answer-class-time">${escapeHtml(humanTime(entry.start, clock))} – ${escapeHtml(humanTime(entry.end, clock))}</div>
    <div class="answer-class-body"><strong>${escapeHtml(entry.subject)}</strong>${tags.length ? `<div class="answer-class-meta">${tags.join(" · ")}</div>` : ""}</div>
  </div>`;
}

function dayList(classes, ctx, emptyText) {
  if (!classes.length) return `<p>${escapeHtml(emptyText)}</p>`;
  return classes.map((entry) => classCard(entry, ctx)).join("");
}

function selectionLabel(ctx) {
  return `${ctx.group || "your section"}${ctx.subgroup ? ` · ${ctx.subgroup}` : ""}`;
}

/* ── scope, day, time and section helpers ─────────────────────────────── */

/**
 * Detect a published section or subsection the student named explicitly.
 * Only exact tokens from the loaded release are accepted, so no section is
 * ever invented. Returns `{ group, subgroup, label }` or null.
 */
function sectionScope(text, ctx) {
  const schedule = Array.isArray(ctx.schedule) ? ctx.schedule : [];
  const tokens = canonicalize(text).split(" ").filter(Boolean);
  if (!tokens.length) return null;
  const subgroups = new Map();
  const groups = new Set();
  for (const entry of schedule) {
    if (!entry) continue;
    if (entry.group) groups.add(entry.group);
    for (const cohort of String(entry.cohorts || "").split(/\s*,\s*/)) {
      if (!cohort) continue;
      if (!subgroups.has(cohort)) subgroups.set(cohort, entry.group);
    }
  }
  // A subsection is more specific, so test it first.
  for (const [subgroup, group] of subgroups) {
    if (tokens.includes(subgroup.toLowerCase())) return { group, subgroup, label: subgroup };
  }
  for (const group of groups) {
    if (group.length >= 3 && tokens.includes(group.toLowerCase())) return { group, subgroup: "", label: group };
  }
  return null;
}

/** Requested bell slot from "3rd period", "period 3" or "slot 3". */
export function requestedPeriod(question = "") {
  const text = canonicalize(question);
  const match = /\b(?:period|slot|bell|lecture|p)\s*[-#]?\s*(\d{1,2}|first|second|third|fourth|fifth|sixth|seventh|eighth)\b/.exec(text)
    || /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:period|slot|bell|lecture)\b/.exec(text);
  if (!match) return null;
  const raw = match[1];
  const index = ORDINALS[raw] || Number(raw);
  if (!Number.isFinite(index) || index < 1 || index > BELL_SLOTS.length) return null;
  return { ...BELL_SLOTS[index - 1], index };
}

/** Requested duration such as "for 2 hours" or "next 30 minutes". */
export function requestedDuration(question = "", fallback = 60) {
  const text = canonicalize(question);
  const match = /\b(?:for|next|agle|agli)?\s*(\d{1,3})\s*(minutes?|mins?|min|hours?|hrs?|hr)\b/.exec(text);
  if (!match) {
    if (/\b(?:one|ek)\s+hour\b/.test(text)) return 60;
    if (/\b(?:half|aadha|adha)\s+hour\b/.test(text)) return 30;
    return fallback;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const minutes = /^h/i.test(match[2]) ? amount * 60 : amount;
  return Math.min(300, Math.max(10, minutes));
}

function windowFor(question, ctx) {
  const period = requestedPeriod(question);
  const parsed = parseTimeExpression(question);
  const minutes = period ? period.start : (parsed ?? ctx.now.minutes);
  return { minutes, duration: requestedDuration(question, Number(ctx.roomDuration) || 60), period };
}

function wants(question, terms) {
  return mentions(question, terms);
}

/* ── results ──────────────────────────────────────────────────────────── */

function nextClassResult(ctx) {
  const { schedule, group, subgroup, now } = ctx;
  if (!schedule?.length || !group) return null;
  const todayExams = examsForDate(ctx, now.dateISO);
  if (todayExams.length) return examDayResult(todayExams, ctx, { label: "Today is an exam day", dateISO: now.dateISO });
  const today = classesFor(schedule, group, now.day, subgroup);
  const { current, next } = currentAndNext(today, now.minutes);
  if (current && !next) {
    return {
      html: `<p><strong>You are in class now.</strong></p>${classCard(current, ctx, { highlight: true })}
        <p class="answer-meta">Ends in ${escapeHtml(formatDuration(current.end - now.minutes))}.</p>${sourceLine(ctx)}`,
      intent: "CURRENT_CLASS",
      confidence: 0.97,
      plan: ["read the active section", "filter today's official classes", "match the current time window", "never guess a room or teacher"],
      entities: { subject: current.subject, room: current.room, teacher: current.teacher, day: now.day }
    };
  }
  if (next) {
    const label = relativeStartLabel(next.start, now.minutes);
    return {
      html: `<p><strong>${current ? "Current class" : "Next class"} · ${escapeHtml(selectionLabel(ctx))}</strong></p>
        ${current ? classCard(current, ctx, { highlight: true }) : ""}
        ${current ? `<p class="answer-meta">Then:</p>` : ""}
        ${classCard(next, ctx)}
        <p class="answer-meta">Starts ${escapeHtml(humanTime(next.start, ctx.clock || "12h"))}${label ? ` · ${escapeHtml(label)}` : ""}.</p>${sourceLine(ctx)}`,
      intent: "NEXT_CLASS",
      confidence: 0.96,
      plan: ["read the active section", "sort today's official classes", "find the next start time", "do not infer an unpublished venue"],
      entities: { subject: next.subject, room: next.room, teacher: next.teacher, day: now.day }
    };
  }
  // No more classes today. The next verified event may be an exam, not a lecture.
  const examNext = nextExamDay(ctx, now);
  const future = nextStudyDayWithClasses(schedule, group, subgroup, now, ctx);
  if (examNext && (!future || examNext.dateISO <= future.dateISO)) {
    const classDay = future ? classesFor(schedule, group, future.day, subgroup)[0] : null;
    const tail = classDay
      ? `<p class="answer-meta">Next published class after that: <strong>${escapeHtml(classDay.subject)}</strong> on ${escapeHtml(future.day)} at ${escapeHtml(humanTime(classDay.start, ctx.clock || "12h"))}.</p>`
      : "";
    const answer = examDayResult(examNext.exams, ctx, { label: `No more classes today · next is an exam on ${examNext.day}`, dateISO: examNext.dateISO });
    return {
      ...answer,
      html: `${answer.html}${tail}`,
      entities: { ...answer.entities, subject: classDay?.subject || "", room: classDay?.room || "", teacher: classDay?.teacher || "", day: future?.day || "" }
    };
  }
  if (future) {
    const dayClasses = classesFor(schedule, group, future.day, subgroup);
    const first = dayClasses[0];
    return {
      html: `<p><strong>No more classes today.</strong></p>
        <p>The next published class is <strong>${escapeHtml(first.subject)}</strong> on ${escapeHtml(future.day)} at ${escapeHtml(humanTime(first.start, ctx.clock || "12h"))}.</p>
        ${classCard(first, ctx)}${sourceLine(ctx)}`,
      intent: "NEXT_CLASS_LATER",
      confidence: 0.93,
      plan: ["read the active section", "today has no remaining class", "skip published exam days", "report only published entries"],
      entities: { subject: first.subject, room: first.room, teacher: first.teacher, day: future.day }
    };
  }
  return {
    html: `<p>No upcoming class is published for <strong>${escapeHtml(selectionLabel(ctx))}</strong> in the loaded release.</p>${sourceLine(ctx)}`,
    intent: "NO_CLASSES",
    confidence: 0.9,
    plan: ["read the active section", "check the published weekly pattern"]
  };
}

function nextStudyDayWithClasses(schedule, group, subgroup, now, ctx = null) {
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = addDays(now, offset);
    if (!STUDY_DAYS.includes(candidate.day)) continue;
    // A published exam day has no lecture to report.
    if (ctx && examsForDate(ctx, candidate.dateISO).length) continue;
    if (classesFor(schedule, group, candidate.day, subgroup).length) return candidate;
  }
  return null;
}

function dayResult(day, ctx, label = "") {
  const dateISO = dateForWeekday(day, ctx.now);
  const exams = examsForDate(ctx, dateISO);
  if (exams.length) return examDayResult(exams, ctx, { label: label || day, dateISO });
  const classes = classesFor(ctx.schedule, ctx.group, day, ctx.subgroup);
  const header = `<p><strong>${escapeHtml(label || day)} · ${escapeHtml(selectionLabel(ctx))}</strong></p>`;
  if (!classes.length) {
    return {
      html: `${header}<p>No class is published for ${escapeHtml(day)}.</p>${sourceLine(ctx)}`,
      intent: "DAY_SCHEDULE",
      confidence: 0.94,
      plan: ["read the active section", `filter ${day}`, "report an empty published day"],
      entities: { day }
    };
  }
  const free = freeBellSlots(classes);
  return {
    html: `${header}${dayList(classes, ctx, "")}
      ${free.length ? `<p class="answer-meta">Free bell slots: ${free.map((slot) => `${humanTime(slot.start, ctx.clock || "12h")}–${humanTime(slot.end, ctx.clock || "12h")}`).join(", ")}</p>` : `<p class="answer-meta">No free bell slot in the published grid.</p>`}
      ${sourceLine(ctx)}`,
    intent: "DAY_SCHEDULE",
    confidence: 0.96,
    plan: ["read the active section", `filter ${day}`, "sort by start time", "derive free slots from published bells"],
    entities: { day }
  };
}

function weekResult(ctx) {
  const blocks = STUDY_DAYS.map((day) => {
    const dateISO = dateForWeekday(day, ctx.now);
    const exams = examsForDate(ctx, dateISO);
    if (exams.length) {
      return `<div class="answer-day"><p><strong>${escapeHtml(day)}</strong> <span class="badge">Exam</span></p>${exams.map((exam) => examCard(exam, ctx)).join("")}</div>`;
    }
    const classes = classesFor(ctx.schedule, ctx.group, day, ctx.subgroup);
    if (!classes.length) return "";
    return `<div class="answer-day"><p><strong>${escapeHtml(day)}</strong></p>${classes.map((entry) => classCard(entry, ctx)).join("")}</div>`;
  }).filter(Boolean);
  if (!blocks.length) {
    return {
      html: `<p>No class is published for <strong>${escapeHtml(selectionLabel(ctx))}</strong> this week.</p>${sourceLine(ctx)}`,
      intent: "WEEK_SCHEDULE", confidence: 0.9, plan: ["read the active section", "check every published weekday"]
    };
  }
  return {
    html: `<p><strong>${escapeHtml(selectionLabel(ctx))} · weekly pattern</strong></p>${blocks.join("")}${sourceLine(ctx)}`,
    intent: "WEEK_SCHEDULE", confidence: 0.96,
    plan: ["read the active section", "group entries by weekday", "sort each day", "skip empty days"],
    entities: {}
  };
}

function firstLastResult(question, ctx) {
  const wantsFirst = wants(question, VOCAB.first);
  const wantsLast = wants(question, VOCAB.last) || wants(question, ["what time", "when do i finish", "when do we finish", "what time do we"]);
  if (!wantsFirst && !wantsLast) return null;
  const target = resolveQuestionDay(question, ctx.now);
  const day = target?.day || ctx.now.day;
  const dateISO = target?.date?.dateISO || dateForWeekday(day, ctx.now);
  const exams = examsForDate(ctx, dateISO);
  if (exams.length) return examDayResult(exams, ctx, { label: target?.label || day, dateISO });
  const classes = classesFor(ctx.schedule, ctx.group, day, ctx.subgroup);
  if (!classes.length) return dayResult(day, ctx, target?.label || "Today");
  const entry = wantsFirst ? classes[0] : classes[classes.length - 1];
  const label = wantsFirst ? "First" : "Last";
  return {
    html: `<p><strong>${label} class on ${escapeHtml(day)}</strong></p>${classCard(entry, ctx)}
      ${wantsLast ? `<p class="answer-meta">You finish at ${escapeHtml(humanTime(entry.end, ctx.clock || "12h"))}.</p>` : ""}${sourceLine(ctx)}`,
    intent: wantsFirst ? "FIRST_CLASS" : "LAST_CLASS",
    confidence: 0.96,
    plan: ["read the active section", `filter ${day}`, wantsFirst ? "take the earliest start" : "take the latest end"],
    entities: { subject: entry.subject, room: entry.room, teacher: entry.teacher, day }
  };
}

function freePeriodResult(question, ctx) {
  if (!wants(question, VOCAB.freePeriod)) return null;
  if (!wants(question, VOCAB.period)) return null;
  const target = resolveQuestionDay(question, ctx.now);
  const day = target?.day || ctx.now.day;
  const dateISO = target?.date?.dateISO || dateForWeekday(day, ctx.now);
  const exams = examsForDate(ctx, dateISO);
  if (exams.length) return examDayResult(exams, ctx, { label: target?.label || day, dateISO });
  const classes = classesFor(ctx.schedule, ctx.group, day, ctx.subgroup);
  const free = freeBellSlots(classes);
  const period = requestedPeriod(question);
  if (period) {
    const busy = classes.find((entry) => entry.start < period.end && entry.end > period.start);
    return {
      html: `<p><strong>Period ${period.index} · ${escapeHtml(humanTime(period.start, ctx.clock || "12h"))}–${escapeHtml(humanTime(period.end, ctx.clock || "12h"))} on ${escapeHtml(day)}</strong></p>
        ${busy ? `<p>You have <strong>${escapeHtml(busy.subject)}</strong> in ${escapeHtml(busy.room)}.</p>${classCard(busy, ctx)}` : `<p>You have no published class in this bell slot.</p>`}${sourceLine(ctx)}`,
      intent: "FREE_PERIODS",
      confidence: 0.95,
      plan: ["read the active section", `filter ${day}`, "resolve the requested bell", "report only published entries"],
      entities: { day, subject: busy?.subject, room: busy?.room, teacher: busy?.teacher }
    };
  }
  return {
    html: `<p><strong>Free slots on ${escapeHtml(day)} · ${escapeHtml(selectionLabel(ctx))}</strong></p>
      ${free.length ? `<p>${free.map((slot) => `<strong>${escapeHtml(humanTime(slot.start, ctx.clock || "12h"))} – ${escapeHtml(humanTime(slot.end, ctx.clock || "12h"))}</strong>`).join("<br />")}</p>` : "<p>Every published bell slot has a class. There is no free bell slot in the grid.</p>"}
      <p class="answer-meta">Free means no official class overlaps that bell. Notices and events can still change a room.</p>${sourceLine(ctx)}`,
    intent: "FREE_PERIODS",
    confidence: 0.95,
    plan: ["read the active section", `filter ${day}`, "compare each official bell with published classes"],
    entities: { day }
  };
}

/** Subject vocabulary for the active section, with publish-safe labels. */
function subjectEntries(ctx) {
  return (ctx.schedule || []).filter((entry) => entry && entry.group === ctx.group);
}

function subjectWords(subject) {
  return canonicalize(subject).split(" ").filter(Boolean);
}

function subjectScore(token, subject) {
  const words = subjectWords(subject);
  if (!words.length) return 0;
  if (words.includes(token)) return 1;
  const aliases = SUBJECT_ALIASES[token] || [];
  for (const alias of aliases) {
    if (words.includes(alias)) return 0.99;
    if (words.some((word) => tokenSimilar(alias, word) >= 0.86)) return 0.9;
  }
  if (token.length >= 3) {
    for (const word of words) {
      if (word.startsWith(token) && token.length >= 3) return 0.92;
      if (token.length >= 4) {
        const score = tokenSimilar(token, word);
        if (score >= 0.84) return score;
      }
    }
  }
  return 0;
}

/** Best-scoring published subjects for a question. */
export function matchSubjects(question, entries = []) {
  const tokens = contentTokens(question);
  if (!tokens.length) return [];
  const scores = new Map();
  for (const entry of entries) {
    if (!entry?.subject) continue;
    let score = 0;
    for (const token of tokens) score = Math.max(score, subjectScore(token, entry.subject));
    if (score >= 0.84) {
      const key = entry.subject;
      const current = scores.get(key);
      if (!current || score > current.score) scores.set(key, { subject: key, score });
    }
  }
  const best = Math.max(0, ...scores.values().map((item) => item.score));
  return [...scores.values()].filter((item) => item.score >= best - 0.05 && best >= 0.84);
}

function subjectResult(question, ctx, dayTarget = null) {
  const tokens = contentTokens(question);
  if (!tokens.length || !ctx.schedule?.length) return null;
  const entries = subjectEntries(ctx);
  const matched = matchSubjects(question, entries);
  if (!matched.length) return null;
  const subjects = matched.map((item) => item.subject);
  const all = entries.filter((entry) => subjects.includes(entry.subject));
  const target = dayTarget || resolveQuestionDay(question, ctx.now);
  const unique = (target ? all.filter((entry) => entry.day === target.day) : all)
    .sort((a, b) => DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day) || a.start - b.start);

  if (target && !unique.length) {
    return {
      html: `<p><strong>${escapeHtml(subjects.join(", "))}</strong> has no published class on ${escapeHtml(target.label || target.day)} for ${escapeHtml(selectionLabel(ctx))}.</p>${sourceLine(ctx)}`,
      intent: "SUBJECT_SCHEDULE",
      confidence: 0.93,
      plan: ["match the subject", "filter the requested day", "report an empty published day"],
      entities: { subject: subjects[0], day: target.day }
    };
  }

  const wantsWhere = wants(question, ["where", "room", "venue", "location"]);
  const wantsWho = wants(question, ["who", "teacher", "faculty", "sir", "maam", "mam", "professor", "department"]);
  const wantsWhen = wants(question, ["when", "what time", "timing", "kab", "time"]);

  if (wantsWhere) {
    const rooms = [...new Set(unique.map((entry) => entry.room).filter(Boolean))];
    return {
      html: `<p><strong>${escapeHtml(subjects.join(", "))}</strong> is published in: ${escapeHtml(rooms.join(", ") || "no room listed")}.</p>
        ${unique.map((entry) => classCard(entry, ctx)).join("")}${sourceLine(ctx)}`,
      intent: "SUBJECT_ROOMS", confidence: 0.93,
      plan: ["match the subject tokens", "filter the active section", "collect published rooms only"],
      entities: { subject: subjects[0], room: rooms[0], day: target?.day }
    };
  }
  if (wantsWho) {
    const teachers = [...new Set(unique.map((entry) => entry.teacher).filter((name) => name && !/not listed/i.test(name)))];
    return {
      html: `<p><strong>${escapeHtml(subjects.join(", "))}</strong>${teachers.length ? ` is taught by ${escapeHtml(teachers.join(", "))}.` : " does not list a teacher in the official release."}</p>
        ${unique.map((entry) => classCard(entry, ctx)).join("")}${sourceLine(ctx)}`,
      intent: "SUBJECT_TEACHERS", confidence: 0.93,
      plan: ["match the subject tokens", "filter the active section", "collect published teacher names only"],
      entities: { subject: subjects[0], teacher: teachers[0], day: target?.day }
    };
  }
  if (wantsWhen) {
    const first = unique[0];
    return {
      html: `<p><strong>${escapeHtml(subjects.join(", "))} · published timing</strong></p>
        ${unique.map((entry) => classCard(entry, ctx)).join("")}
        <p class="answer-meta">The earliest published slot is ${escapeHtml(first.day)} at ${escapeHtml(humanTime(first.start, ctx.clock || "12h"))}.</p>${sourceLine(ctx)}`,
      intent: "SUBJECT_TIMING", confidence: 0.93,
      plan: ["match the subject", "filter the active section", "sort by weekday and start"],
      entities: { subject: subjects[0], room: first.room, teacher: first.teacher, day: first.day }
    };
  }
  return {
    html: `<p><strong>${escapeHtml(subjects.join(", "))} · ${escapeHtml(selectionLabel(ctx))}</strong></p>
      ${unique.map((entry) => classCard(entry, ctx)).join("")}${sourceLine(ctx)}`,
    intent: "SUBJECT_SCHEDULE", confidence: 0.94,
    plan: ["match the subject tokens", "filter the active section", "sort by weekday and start"],
    entities: { subject: subjects[0], room: unique[0]?.room, teacher: unique[0]?.teacher, day: target?.day }
  };
}

function teacherResult(question, ctx) {
  if (!wants(question, ["teacher", "faculty", "professor", "sir", "maam", "mam", "who", "teaches", "padhata", "padhta"])) return null;
  const tokens = contentTokens(question);
  if (!tokens.length) return null;
  const scoped = subjectEntries(ctx);
  const allEntries = Array.isArray(ctx.allSchedule) ? ctx.allSchedule : Array.isArray(ctx.schedule) ? ctx.schedule : [];
  const names = [...new Set(allEntries.map((entry) => entry.teacher).filter((name) => name && !/not listed/i.test(name)))];
  const scored = names
    .map((name) => {
      let score = 0;
      for (const token of tokens) {
        for (const word of canonicalize(name).split(" ").filter(Boolean)) {
          if (word.length < 3) continue;
          score = Math.max(score, tokenSimilar(token, word));
        }
      }
      return { name, score };
    })
    .filter((item) => item.score >= 0.84)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const matches = scored.filter((item) => item.score >= scored[0].score - 0.04).map((item) => item.name);
  const inSection = scoped.filter((entry) => matches.includes(entry.teacher));
  const entries = inSection.length ? inSection : allEntries.filter((entry) => matches.includes(entry.teacher));
  if (!entries.length) return null;
  const elsewhere = !inSection.length;
  return {
    html: `<p><strong>${escapeHtml(matches.join(", "))}</strong> ${elsewhere ? "is published in the official timetable:" : "teaches your section:"}</p>
      ${entries.slice(0, 16).map((entry) => classCard(entry, ctx)).join("")}
      ${elsewhere ? `<p class="answer-meta">This teacher is not in the active section. Showing the published entries across sections.</p>` : ""}
      ${entries.length > 16 ? `<p class="answer-meta">Showing the first 16 published entries.</p>` : ""}${sourceLine(ctx)}`,
    intent: "TEACHER_SCHEDULE", confidence: 0.93,
    plan: ["match a published teacher name", "filter the timetable", "never add an unpublished subject or room"],
    entities: { teacher: matches[0], subject: entries[0]?.subject, day: entries[0]?.day }
  };
}

/**
 * Words that look like a one/two-letter room prefix but are ordinary grammar.
 * Without this, "at 2 pm" would become room "AT2".
 */
const ROOM_PREFIX_BLOCKLIST = new Set([
  "a", "an", "am", "at", "be", "by", "do", "he", "hi", "hr", "if", "in", "is", "it", "me", "my",
  "no", "of", "on", "or", "pm", "so", "to", "up", "us", "we", "as", "di", "da", "de", "ki", "ka",
  "ko", "nu", "te", "na", "ta", "th", "st", "nd", "rd"
]);

/** Parse a room code like "F-101", "f 101", "S201" from a question. */
export function roomCodeOf(question = "") {
  const text = canonicalize(question);
  const pattern = /(?:^|\s)([a-z]{1,2})[\s-]*(\d{1,3})(?:\s*(am|pm))?\b/g;
  let match = pattern.exec(text);
  while (match) {
    const prefix = match[1];
    const number = Number(match[2]);
    // Reject clock times ("at 2 pm") and grammar words ("to 10").
    if (match[3] || ROOM_PREFIX_BLOCKLIST.has(prefix)) {
      match = pattern.exec(text);
      continue;
    }
    if (!Number.isFinite(number) || number < 1 || number > 399) {
      match = pattern.exec(text);
      continue;
    }
    return `${prefix}${number}`.toUpperCase();
  }
  return "";
}

function matchRoom(question, entries) {
  const code = roomCodeOf(question);
  const rooms = [...new Set(entries.map((entry) => entry.room).filter(Boolean))];
  const compact = (value) => canonicalize(value).replace(/[\s-]/g, "").toUpperCase();
  if (code) {
    // A typed room code is matched exactly; never fuzzy-matched to another room.
    return rooms.filter((room) => {
      const label = compact(room);
      return label === code || label.startsWith(code) || code.startsWith(label);
    });
  }
  const tokens = contentTokens(question).filter((token) => !["lab", "labs", "block", "floor"].includes(token));
  for (const token of tokens) {
    const best = bestMatch(token, rooms, { minScore: 0.86 });
    if (best) return [best.value];
  }
  return [];
}

function roomResult(question, ctx) {
  const allEntries = Array.isArray(ctx.schedule) ? ctx.schedule : [];
  const scopedEntries = subjectEntries(ctx);
  const matches = matchRoom(question, scopedEntries.length ? [...scopedEntries, ...allEntries] : allEntries);
  const code = roomCodeOf(question);
  if (!matches.length) {
    if (!code) return null;
    const exists = (ctx.roomSchedule || []).some((entry) => canonicalize(entry.room).replace(/[\s-]/g, "").toUpperCase() === code);
    if (!exists) return null;
    return {
      html: `<p><strong>${escapeHtml(code)}</strong> appears in the official room timetable, but no published class for <strong>${escapeHtml(selectionLabel(ctx))}</strong> uses it.</p>
        <p class="answer-meta">Compass does not load a building map, so it will not invent directions.</p>`,
      intent: "ROOM_INFO", confidence: 0.9,
      plan: ["verify the room in the official release", "check the active section", "refuse to invent directions"],
      entities: { room: code }
    };
  }
  const compactMatch = (room) => canonicalize(room).replace(/[\s-]/g, "").toUpperCase();
  const scoped = allEntries.filter((entry) => matches.some((room) => compactMatch(entry.room).includes(compactMatch(room))));
  if (!scoped.length) return null;
  const entries = scoped
    .sort((a, b) => DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day) || a.start - b.start)
    .slice(0, 14);
  return {
    html: `<p><strong>${escapeHtml(matches.join(", "))} · published classes</strong></p>
      ${entries.map((entry) => `<div class="answer-class"><div class="answer-class-time">${escapeHtml(entry.day.slice(0, 3))} · ${escapeHtml(humanTime(entry.start, ctx.clock || "12h"))}</div><div class="answer-class-body"><strong>${escapeHtml(entry.subject)}</strong><div class="answer-class-meta">${escapeHtml(entry.group)} · ${escapeHtml(entry.teacher)}</div></div></div>`).join("")}
      ${scoped.length > 14 ? `<p class="answer-meta">Showing the first 14 published entries.</p>` : ""}${sourceLine(ctx)}`,
    intent: "ROOM_SCHEDULE", confidence: 0.92,
    plan: ["match a published room label", "filter the official release", "sort before display"],
    entities: { room: matches[0] }
  };
}

function freeRoomsResult(question, ctx) {
  const code = roomCodeOf(question);
  if (!wants(question, VOCAB.freeRoom)) return null;
  if (!wants(question, VOCAB.room) && !code) return null;
  if (!ctx.roomSchedule?.length) {
    return {
      html: `<p>The official room timetable is still loading. I will not guess which rooms are free.</p>`,
      intent: "FREE_ROOMS_UNAVAILABLE", confidence: 0.9,
      plan: ["check the room release", "refuse instead of guessing"]
    };
  }
  const target = resolveQuestionDay(question, ctx.now);
  const day = target?.day || ctx.now.day;
  const { minutes, duration } = windowFor(question, ctx);
  const zone = zoneFromQuestion(question);
  const onlyLabs = wants(question, ["lab", "labs", "practical"]);
  const onlyHalls = wants(question, ["lecture hall", "classroom", "lecture"]);
  const result = computeFreeRooms({
    roomSchedule: ctx.roomSchedule, day, minutes, duration, zone,
    includeLabs: onlyLabs ? true : (onlyHalls ? false : ctx.includeLabs !== false),
    includeLectureHalls: onlyHalls ? true : (onlyLabs ? false : ctx.includeLectureHalls !== false)
  });
  if (result.error) {
    return {
      html: `<p>${escapeHtml(result.error)}</p>`,
      intent: "FREE_ROOMS", confidence: 0.9, plan: ["read the room release", "refuse an unverifiable window"]
    };
  }

  // "Is F101 free?" answers for that exact room instead of listing everything.
  if (code) {
    const compact = (value) => canonicalize(value).replace(/[\s-]/g, "").toUpperCase();
    const room = [...new Set(ctx.roomSchedule.map((entry) => entry.room))]
      .find((value) => compact(value) === code || compact(value).startsWith(code));
    if (room) {
      const free = isRoomFree(ctx.roomSchedule, room, day, minutes, duration);
      return {
        html: `<p><strong>${escapeHtml(room)} is ${free ? "free" : "not free"}</strong> on ${escapeHtml(day)} at ${escapeHtml(humanTime(minutes, ctx.clock || "12h"))} for ${escapeHtml(formatDuration(duration))}.</p>
          ${free ? "" : "<p>A published class overlaps this window.</p>"}
          <p class="answer-source">Calculated from the official room timetable.</p>`,
        intent: "ROOM_AVAILABILITY", confidence: 0.94,
        plan: ["read the room release", `filter ${day}`, "check the requested room and window"],
        entities: { room, day }
      };
    }
    return {
      html: `<p><strong>${escapeHtml(code)}</strong> is not in the loaded official room release, so Compass cannot verify whether it is free.</p>`,
      intent: "ROOM_AVAILABILITY", confidence: 0.9,
      plan: ["read the room release", "refuse an unknown room"],
      entities: { room: code, day }
    };
  }

  const groups = groupRooms(result.rooms.map((item) => item.room)).groups;
  return {
    html: `<p><strong>${result.rooms.length} room${result.rooms.length === 1 ? "" : "s"} free on ${escapeHtml(day)} at ${escapeHtml(humanTime(minutes, ctx.clock || "12h"))} for ${escapeHtml(formatDuration(duration))}</strong></p>
      ${groups.map((group) => `<p><strong>${escapeHtml(group.label)}</strong> · ${group.rooms.map(escapeHtml).join(", ")}</p>`).join("")}
      ${result.rooms.some((item) => item.freeUntil) ? `<p class="answer-meta">Some rooms have a class later; the Rooms page shows the exact “free until” time.</p>` : ""}
      <p class="answer-source">Calculated from the official room timetable. Use the Rooms page before travelling.</p>`,
    intent: "FREE_ROOMS", confidence: 0.94,
    plan: ["read the room release", `filter ${day}`, "check overlap with the requested window", "group by published block"],
    entities: { day }
  };
}

function profileResult(question, ctx) {
  const text = canonicalize(question);
  if (!wants(question, ["my", "mine", "mera", "meri", "mere"]) && !/\bwho am i\b/.test(text)) return null;
  if (!wants(question, VOCAB.profile) && !wants(question, ["name", "who am i"]) && !/\b(?:mentoring|academic)\s+group\b/.test(text)) return null;
  const profile = ctx.profile || {};
  if (!profile.section) {
    return {
      html: `<p>No verified profile is saved on this device yet. Open <strong>Settings → Profile</strong> to choose your section and subsection; personalised answers use that selection.</p>`,
      intent: "PROFILE_EMPTY", confidence: 0.9, plan: ["read the device profile", "offer setup", "never assume a student"]
    };
  }
  const venue = profile.mentorVenue || profile.venue;
  // A targeted sub-question answers with exactly the requested saved field.
  if (/\b(?:mentor\s+)?phone|mobile|contact\b/.test(text)) {
    return {
      html: profile.mentorPhone
        ? `<p><strong>Mentor phone:</strong> ${escapeHtml(profile.mentorPhone)}${profile.mentor ? ` · ${escapeHtml(profile.mentor)}` : ""}</p><p class="answer-meta">Saved on this device only.</p>`
        : `<p>No mentor phone is saved on this device. Add it in <strong>Settings → Profile</strong>; Compass will never guess a number.</p>`,
      intent: "PROFILE_MENTOR_PHONE", confidence: 0.95, plan: ["read the saved device profile", "never query a server"], entities: {}
    };
  }
  if (/\b(?:venue|room|place)\b/.test(text)) {
    return {
      html: venue
        ? `<p><strong>Mentor venue:</strong> ${escapeHtml(venue)}${profile.mentor ? ` · ${escapeHtml(profile.mentor)}` : ""}</p><p class="answer-meta">Saved on this device only. The official timetable always wins when it prints a room.</p>`
        : `<p>No mentoring venue is saved on this device. Add it in <strong>Settings → Profile</strong>; Compass will never guess a room.</p>`,
      intent: "PROFILE_MENTOR_VENUE", confidence: 0.95, plan: ["read the saved device profile", "never overwrite printed timetable details"], entities: {}
    };
  }
  if (/\b(?:mentoring|academic)\s+group\b/.test(text)) {
    return {
      html: profile.academicGroup
        ? `<p><strong>Mentoring group:</strong> ${escapeHtml(profile.academicGroup)}</p><p class="answer-meta">Saved on this device. It selects your official subgroup rows when the college publishes them.</p>`
        : `<p>No mentoring group is saved on this device. Add it in <strong>Settings → Profile</strong>; Compass will never guess a group.</p>`,
      intent: "PROFILE_ACADEMIC_GROUP", confidence: 0.95, plan: ["read the saved device profile", "never infer a group"], entities: {}
    };
  }
  const parts = [
    profile.name ? `<strong>${escapeHtml(profile.name)}</strong>` : "",
    profile.section ? `Section ${escapeHtml(profile.section)}${profile.subsection ? ` · ${escapeHtml(profile.subsection)}` : ""}` : "",
    profile.branch ? escapeHtml(profile.branch) : "",
    profile.mentor ? `Mentor: ${escapeHtml(profile.mentor)}` : "",
    profile.mentorPhone ? `Mentor phone: ${escapeHtml(profile.mentorPhone)}` : "",
    profile.academicGroup ? `Mentoring group: ${escapeHtml(profile.academicGroup)}` : "",
    venue ? `Mentor venue: ${escapeHtml(venue)}` : ""
  ].filter(Boolean);
  return {
    html: `<p>${parts.join(" · ")}</p><p class="answer-meta">Saved on this device only. You can change it in Settings → Profile.</p>`,
    intent: "PROFILE", confidence: 0.97, plan: ["read the saved device profile", "never query a server"],
    entities: {}
  };
}

function parseDateQuestion(question, defaultYear = 2026) {
  const text = canonicalize(question);
  const monthNames = Object.keys(MONTHS).filter((name) => name.length > 2);
  const monthPattern = monthNames.join("|");
  let match = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\b`).exec(text);
  if (!match) match = new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(text);
  if (match) {
    const day = Number(match[1].match(/\d/) ? match[1] : match[2]);
    const monthName = match[1].match(/\d/) ? match[2] : match[1];
    const month = MONTHS[monthName];
    if (month) return `${defaultYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  match = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function relativeExamDate(question, ctx) {
  const target = resolveQuestionDay(question, ctx.now);
  if (!target || target.explicit) return null;
  if (typeof target.date?.dateISO === "string") return target.date.dateISO;
  return addDays(ctx.now, Number(target.offset) || 0).dateISO;
}

function datesheetResult(question, ctx) {
  if (!wants(question, VOCAB.exam)) return null;
  const data = ctx.datesheet;
  if (!data || !Array.isArray(data.tabs)) return null;
  const date = parseDateQuestion(question) || relativeExamDate(question, ctx);
  const entries = data.tabs.flatMap((tab) => (tab.entries || []).map((entry) => ({ ...entry, tabLabel: tab.label, sourceUrl: tab.sourceUrl })));
  let matched = entries;
  if (date) matched = matched.filter((entry) => entry.date === date);
  const subjectMatches = matchSubjects(question, entries);
  if (subjectMatches.length) {
    const subjects = subjectMatches.map((item) => item.subject);
    matched = matched.filter((entry) => subjects.includes(entry.subject));
  } else if (!date) {
    // With no date and no subject, show only upcoming sittings.
    const today = ctx.now?.dateISO || new Date().toISOString().slice(0, 10);
    matched = matched.filter((entry) => entry.date >= today);
  }
  if (!matched.length) {
    if (date) {
      return {
        html: `<p>No published ESE entry matches <strong>${escapeHtml(date)}</strong> in the loaded datesheet. Compass will not guess a date or sitting.</p>${datesheetSource(data)}`,
        intent: "DATESHEET_NONE", confidence: 0.9, plan: ["read the loaded datesheet", "match the requested date", "refuse an unpublished sitting"]
      };
    }
    if (subjectMatches.length) {
      return {
        html: `<p><strong>${escapeHtml(subjectMatches.map((item) => item.subject).join(", "))}</strong> has no published ESE entry in the loaded datesheet. Compass will not guess a date.</p>${datesheetSource(data)}`,
        intent: "DATESHEET_NONE", confidence: 0.9, plan: ["read the loaded datesheet", "match the subject", "refuse an unpublished sitting"]
      };
    }
    return null;
  }
  const grouped = [...new Map(matched.map((entry) => [`${entry.date}|${entry.subject}|${entry.tabLabel}`, entry])).values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject))
    .slice(0, 30);
  return {
    html: `<p><strong>Published end-semester entries</strong>${subjectMatches.length ? ` · ${escapeHtml(subjectMatches.map((item) => item.subject).join(", "))}` : ""}${date ? ` · ${escapeHtml(date)}` : ""}</p>
      <div class="answer-table">${grouped.map((entry) => `<div class="answer-class"><div class="answer-class-time">${escapeHtml(entry.date)}</div><div class="answer-class-body"><strong>${escapeHtml(entry.subject)}</strong><div class="answer-class-meta">${escapeHtml(entry.tabLabel)}${entry.qualifier ? ` · ${escapeHtml(entry.qualifier)}` : ""}${entry.sessionRaw ? ` · ${escapeHtml(entry.sessionRaw)}` : ""}</div></div></div>`).join("")}</div>
      ${data.tabs.some((tab) => tab.sessionAssignmentReliable === false) ? `<p class="answer-meta">The official sheet does not reliably assign every sitting to a session or room. Check the notice before travelling.</p>` : ""}
      ${datesheetSource(data)}`,
    intent: "DATESHEET", confidence: 0.93,
    plan: ["read the loaded official datesheet", "filter by date and subject", "never infer rooms or reporting times"],
    entities: { subject: subjectMatches[0]?.subject }
  };
}

function datesheetSource(data) {
  const url = data?.source?.url;
  return `<p class="answer-source">${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Official tentative ESE datesheet</a>` : "Official tentative ESE datesheet"}${data?.checkedAt ? ` · checked ${escapeHtml(String(data.checkedAt).slice(0, 10))}` : ""}.</p>`;
}

/* Admin-published date sheets. They are transcribed from a notice, so they are
 * surfaced only when the question actually names one, and the original notice
 * link stays attached. The official ESE sheet remains the default source. */

const SHEET_WORDS = Object.freeze([
  "datesheet", "date sheet", "date-sheet", "datasheet", "data sheet",
  "exam schedule", "exam dates", "examination schedule", "examination dates",
  "paper schedule", "paper dates", "test schedule", "mse schedule",
  "kada paper", "paper kado", "pariksha", "imtihan", "datesheet kado"
]);

const RAW_QUESTION_WORDS = Object.freeze(new Set([
  "the", "and", "for", "with", "what", "when", "where", "which", "who", "how", "why",
  "is", "are", "was", "were", "do", "does", "did", "can", "could", "will", "would",
  "my", "our", "your", "his", "her", "their", "this", "that", "these", "those",
  "show", "tell", "give", "list", "find", "please", "kindly", "about", "any", "all",
  "me", "there", "here", "of", "in", "on", "at", "to", "from", "by", "a", "an",
  "gndec", "college", "compass"
]));

function publishedDatesheetResult(question, ctx) {
  const text = canonicalize(question);
  const list = Array.isArray(ctx.publishedDatesheets) ? ctx.publishedDatesheets : [];
  if (!list.length) return null;
  const mentionsSheet = wants(text, SHEET_WORDS);
  const mentionsExam = wants(text, VOCAB.exam);
  if (!mentionsSheet && !mentionsExam) return null;

  const query = contentQuery(text);
  const tokens = canonicalize(question)
    .split(" ")
    .filter((token) => token.length >= 3 && !RAW_QUESTION_WORDS.has(token));
  const genericSheetQuery = tokens.length > 0 && tokens.every((token) => ["date", "sheet", "datesheet", "datasheet"].includes(token));
  const scored = list
    .map((item) => {
      const hay = canonicalize([item.title, item.scope, item.department, item.body].filter(Boolean).join(" "));
      const words = hay.split(/\s+/).filter((word) => word.length >= 3);
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score += 2;
        else if (token.length >= 4 && words.some((word) => tokenSimilar(token, word) >= 0.84)) score += 1;
      }
      return { item, score };
    })
    .filter((row) => tokens.length && row.score > 0)
    .sort((a, b) => b.score - a.score || String(b.item.date || "").localeCompare(String(a.item.date || "")));
  if (!scored.length) {
    if (!genericSheetQuery) return null;
    if (!mentionsSheet) return null;
  }

  const matched = (scored.length ? scored.slice(0, 4).map((row) => row.item) : list.slice(0, 4));
  return {
    html: `<p><strong>Published date sheet${matched.length === 1 ? "" : "s"}</strong>${query ? ` · matching “${escapeHtml(query)}”` : ""}</p>
      <div class="answer-table">${matched.map((item) => `<div class="answer-class"><div class="answer-class-time">${escapeHtml(item.date || "Published")}</div><div class="answer-class-body"><strong>${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || "Date sheet")}</a>` : escapeHtml(item.title || "Date sheet")}</strong><div class="answer-class-meta">${escapeHtml(item.scope || "Examination")}${item.department ? ` · ${escapeHtml(item.department)}` : ""}${item.body ? ` · transcribed from the official notice` : ""}</div>${item.body ? `<div class="answer-class-meta">${escapeHtml(String(item.body).slice(0, 400)).replace(/\n/g, "<br />")}</div>` : ""}</div></div>`).join("")}</div>
      <p class="answer-meta">These rows are transcribed from an official notice by the college admin. Open the linked notice before travelling; Compass never fills a missing date.</p>`,
    intent: "PUBLISHED_DATESHEET", confidence: 0.9,
    plan: ["read admin-published date sheets", "match the requested words", "keep the official notice link", "never invent a date"],
    entities: { query }
  };
}

/* ── Content results: notices, papers, syllabus, calendar, mentoring ───── */

const CONTENT_STOPWORDS = Object.freeze([
  "notice", "notices", "latest", "new", "news", "update", "updates", "college", "gndec",
  "kya", "hai", "hain", "what", "which", "about", "show", "tell", "give", "any", "the",
  "for", "from", "with", "and", "today", "aaj", "please", "kindly", "bata", "batao",
  "question", "questions", "bank", "banks", "paper", "papers", "previous", "year", "years",
  "old", "past", "sample", "pyq", "pyqs", "sqb", "subject", "subjects", "document", "documents",
  "syllabus", "syllabi", "link", "links", "list", "find", "search"
]);

function contentQuery(text) {
  return contentTokens(text)
    .filter((token) => token.length > 1 && !CONTENT_STOPWORDS.includes(token))
    .slice(0, 6)
    .join(" ");
}

function contentSource(href, label) {
  return href
    ? `<p class="answer-source"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></p>`
    : "";
}

function noticesResult(question, ctx) {
  const text = canonicalize(question);
  if (!wants(text, ["notice", "notices", "noticeboard", "notice board", "circular", "suchna", "soochna", "news", "update", "updates"])) return null;
  const list = Array.isArray(ctx.notices) ? ctx.notices : [];
  const today = ctx.now?.dateISO || new Date().toISOString().slice(0, 10);
  if (!list.length) {
    return {
      html: `<p><strong>No verified notice is loaded on this device right now.</strong></p>
        <p>Compass will not invent a notice or a date. The official GNDEC notice board always has the latest circulars.</p>
        ${contentSource("https://erp.gndec.ac.in/notice", "Open the official GNDEC notice board")}`,
      intent: "NOTICES_EMPTY", confidence: 0.9,
      plan: ["check the loaded notice sources", "refuse to invent a notice", "point to the official board"]
    };
  }
  const query = contentQuery(text);
  const stats = noticeStats(list, today);
  const matched = (query ? filterNotices(list, { query }) : list).slice(0, 6);
  if (!matched.length) {
    return {
      html: `<p>No published notice matches <strong>${escapeHtml(query)}</strong>. ${stats.total} notices are loaded, but none mention that.</p>
        <p>Open Notices to search the full list, or check the official board.</p>
        ${contentSource("https://erp.gndec.ac.in/notice", "Official GNDEC notice board")}`,
      intent: "NOTICES_NONE", confidence: 0.9,
      plan: ["read the merged notice sources", "match the requested words", "refuse to invent a notice"]
    };
  }
  return {
    html: `<p><strong>${stats.total} published notice${stats.total === 1 ? "" : "s"}</strong>${stats.fresh ? ` · ${stats.fresh} new in the last 14 days` : ""}${query ? ` · matching “${escapeHtml(query)}”` : " · newest first"}</p>
      <div class="answer-table">${matched.map((notice) => `<div class="answer-class"><div class="answer-class-time">${escapeHtml(notice.date || "Undated")}</div><div class="answer-class-body"><strong>${notice.url ? `<a href="${escapeHtml(notice.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(notice.title)}</a>` : escapeHtml(notice.title)}</strong><div class="answer-class-meta">${escapeHtml(notice.category)}${notice.author ? ` · ${escapeHtml(notice.author)}` : ""} · ${escapeHtml(notice.admin ? "admin" : notice.transcribed ? "transcribed" : "official")}</div></div></div>`).join("")}</div>
      <p class="answer-meta">Every entry links its source. Compass never rewrites a notice.</p>`,
    intent: "NOTICES", confidence: 0.93,
    plan: ["merge admin, transcribed and official notices", "de-duplicate by source URL", "filter by the requested words", "link the original"],
    entities: { query }
  };
}

function papersResult(question, ctx) {
  const text = canonicalize(question);
  if (!wants(text, ["question bank", "question banks", "question paper", "question papers", "previous year", "previous years", "pyq", "pyqs", "past paper", "old paper", "sample paper", "sqb", "syllabus paper"])) return null;
  const list = Array.isArray(ctx.papers) ? ctx.papers : [];
  if (!list.length) return null;
  const query = contentQuery(text);
  const matched = searchPapers(list, query, { limit: 8 });
  if (!matched.length) {
    return {
      html: `<p>No verified question bank matches <strong>${escapeHtml(query || "that")}</strong>. ${list.length} official documents are indexed.</p>
        <p>Open Papers to search every indexed subject, or ask your department for the paper.</p>`,
      intent: "PAPERS_NONE", confidence: 0.9,
      plan: ["read the official question-bank index", "match subject or code", "refuse to invent a paper"]
    };
  }
  return {
    html: `<p><strong>Official question banks</strong>${query ? ` · matching “${escapeHtml(query)}”` : ` · ${list.length} indexed`}</p>
      <div class="answer-table">${matched.map((paper) => `<div class="answer-class"><div class="answer-class-time">${escapeHtml(paper.code || paper.semester || "PDF")}</div><div class="answer-class-body"><strong><a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(paper.subject)}</a></strong><div class="answer-class-meta">${escapeHtml(paper.department || "GNDEC")}${paper.semester ? ` · semester ${escapeHtml(paper.semester)}` : ""} · official PDF</div></div></div>`).join("")}</div>
      <p class="answer-meta">Compass indexes the official link and never hosts or rewrites a paper.</p>`,
    intent: "PAPERS", confidence: 0.93,
    plan: ["read the official question-bank index", "match subject, code or department", "link the official PDF"],
    entities: { query }
  };
}

function syllabusResult(question, ctx) {
  const text = canonicalize(question);
  if (!wants(text, VOCAB.syllabus)) return null;
  const list = Array.isArray(ctx.syllabus) ? ctx.syllabus : [];
  if (!list.length) return null;
  const query = contentQuery(text);
  const matched = searchSyllabus(list, query, { limit: 8 });
  if (!matched.length) {
    return {
      html: `<p>No published syllabus document matches <strong>${escapeHtml(query || "that")}</strong>. ${list.length} official documents are indexed.</p>
        <p>Open Syllabus to browse by department and batch.</p>`,
      intent: "SYLLABUS_NONE", confidence: 0.9,
      plan: ["read the official syllabus index", "match department or batch", "refuse to invent contents"]
    };
  }
  return {
    html: `<p><strong>Official syllabus documents</strong>${query ? ` · matching “${escapeHtml(query)}”` : ""}</p>
      <div class="answer-table">${matched.map((doc) => `<div class="answer-class"><div class="answer-class-time">${escapeHtml(doc.semester ? `Sem ${doc.semester}` : "PDF")}</div><div class="answer-class-body"><strong><a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(doc.label)}</a></strong><div class="answer-class-meta">${escapeHtml(doc.department)} · official PDF</div></div></div>`).join("")}</div>
      <p class="answer-meta">Compass links the document; it never re-types a syllabus or invents a unit.</p>`,
    intent: "SYLLABUS", confidence: 0.93,
    plan: ["read the official syllabus index", "match department, batch or semester", "link the official PDF"],
    entities: { query }
  };
}

function academicCalendarResult(question, ctx) {
  const text = canonicalize(question);
  if (!wants(text, ["academic calendar", "semester", "session", "preparatory", "vacation"])) return null;
  const periods = academicPeriodFor(text);
  if (!periods.length) return null;
  return {
    html: `<p><strong>Published academic periods</strong></p>
      <div class="answer-table">${periods.map((period) => `<div class="answer-class"><div class="answer-class-time">${escapeHtml(period.start)}</div><div class="answer-class-body"><strong>${escapeHtml(period.scope)}</strong><div class="answer-class-meta">Semester starts ${escapeHtml(period.start)} · preparatory leave ${escapeHtml(period.prepStart)} → ${escapeHtml(period.prepEnd)} · examinations from ${escapeHtml(period.examsStart)}</div></div></div>`).join("")}</div>
      <p class="answer-meta">These are published academic periods, not individual subject sittings. Check the official datesheet before travelling.</p>
      ${contentSource("https://gndec.ac.in/sites/default/files/acjul-dec26.pdf", "Official academic calendar PDF")}`,
    intent: "ACADEMIC_CALENDAR", confidence: 0.92,
    plan: ["read the published academic calendar", "filter the requested programme", "never infer a subject sitting"]
  };
}

function mentoringResult(question, ctx) {
  const text = canonicalize(question);
  if (!wants(text, ["mentor", "mentoring", "mentorship"])) return null;
  // Only a question about *my* mentor uses the device profile. A bare mention
  // ("section and mentor") belongs to the profile answer and must not split.
  if (!wants(text, ["my", "mine", "mera", "meri", "mere"])) return null;
  const profile = ctx.profile || {};
  if (!profile.mentor) {
    return {
      html: `<p><strong>No mentor is saved on this device.</strong></p>
        <p>Add your mentor in <strong>Settings → Profile</strong>. Compass then fills the mentoring class teacher and venue only when the official timetable leaves them blank.</p>`,
      intent: "MENTOR_EMPTY", confidence: 0.9,
      plan: ["read the device profile", "refuse to guess a mentor", "offer profile setup"]
    };
  }
  const venue = profile.mentorVenue || profile.venue;
  const contact = [
    profile.mentorPhone ? `Phone: ${escapeHtml(profile.mentorPhone)}` : "",
    profile.academicGroup ? `Mentoring group: ${escapeHtml(profile.academicGroup)}` : "",
    venue ? `Venue: ${escapeHtml(venue)}` : ""
  ].filter(Boolean);
  return {
    html: `<p><strong>Your saved mentor:</strong> ${escapeHtml(profile.mentor)}${contact.length ? ` · ${contact.join(" · ")}` : ""}</p>
      <p class="answer-meta">Saved on this device and applied only to your selected section and sub-group. The official timetable always wins when it prints a teacher or room.</p>`,
    intent: "MENTOR", confidence: 0.95,
    plan: ["read the saved device profile", "match the selected section", "never overwrite printed timetable details"]
  };
}

function departmentResult(question, ctx) {
  const text = canonicalize(question);
  if (!wants(text, ["hod", "head of department", "department", "dept", "branch"])) return null;
  const departments = Array.isArray(ctx.departments) ? ctx.departments : [];
  if (!departments.length) return null;
  const lower = text;
  const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = departments.find((dept) => dept?.name && lower.includes(String(dept.name).toLowerCase()))
    || departments.find((dept) => dept?.short && new RegExp(`\\b${escapeRe(String(dept.short).toLowerCase())}\\b`).test(lower));
  if (!match) return null;
  const hod = match.hod || {};
  if (!hod.name) {
    return {
      html: `<p><strong>${escapeHtml(match.name)}</strong></p><p>No verified head-of-department detail is published for this department right now.</p>${contentSource(match.homepage, "Official department page")}`,
      intent: "DEPARTMENT_NO_HOD", confidence: 0.85,
      plan: ["read the official campus directory", "refuse to invent a name", "link the department page"]
    };
  }
  return {
    html: `<p><strong>${escapeHtml(match.name)}</strong> · Head of Department: <strong>${escapeHtml(hod.name)}</strong></p>
      <p class="answer-meta">${hod.email ? `${escapeHtml(hod.email)} · ` : ""}${hod.phone ? `${escapeHtml(hod.phone)} · ` : ""}${hod.verified === false ? "not verified" : "verified from the official department page"}</p>
      ${contentSource(hod.sourceUrl || match.homepage, "Official department page")}`,
    intent: "DEPARTMENT", confidence: 0.92,
    plan: ["read the official campus directory", "match the department", "link the department page"]
  };
}

function holidayResult(question, ctx) {
  const text = canonicalize(question);
  if (!wants(text, VOCAB.holiday) && !wants(text, ["college open", "college closed", "classes off", "chutti", "chhutti", "off day"])) return null;
  const overrides = Array.isArray(ctx.holidays) ? ctx.holidays : [];
  const today = ctx.now?.dateISO || new Date().toISOString().slice(0, 10);
  const explicit = parseDateQuestion(text);
  if (explicit) {
    const item = holidayOn(explicit, overrides);
    if (item) {
      const kind = item.type === "working" ? "a working day" : item.type === "restricted" ? "a restricted holiday" : item.type === "half-day" ? "a half-day" : "a closed holiday";
      return {
        html: `<p><strong>${escapeHtml(explicit)} (${escapeHtml(dayOfWeek(explicit))}) is ${kind}: ${escapeHtml(item.name)}.</strong></p>
          <p class="answer-meta">${item.overridden ? "This date is an admin-confirmed override." : "From the official GNDEC holiday list."} Your weekly timetable still applies to working days.</p>`,
        intent: "HOLIDAY", confidence: 0.95,
        plan: ["read the official holiday list", "merge admin overrides", "answer the requested date"]
      };
    }
    return {
      html: `<p>No published holiday or override is recorded for <strong>${escapeHtml(explicit)}</strong>.</p>
        <p>Compass will not guess a holiday. Check the official notice board before assuming a day off.</p>
        ${contentSource("https://gndec.ac.in/?q=holidays", "Official GNDEC holiday list")}`,
      intent: "HOLIDAY_NONE", confidence: 0.9,
      plan: ["read the official holiday list", "check admin overrides", "refuse to guess"]
    };
  }
  const upcoming = upcomingHolidays(today, { overrides, limit: 6 });
  if (!upcoming.length) {
    return {
      html: `<p>No further published holiday remains in this academic year. Compass will not invent one.</p>
        ${contentSource("https://gndec.ac.in/?q=holidays", "Official GNDEC holiday list")}`,
      intent: "HOLIDAY_NONE", confidence: 0.9,
      plan: ["read the official holiday list", "filter dates after today", "refuse to guess"]
    };
  }
  return {
    html: `<p><strong>Next published holidays</strong></p>
      <div class="answer-table">${upcoming.map((item) => `<div class="answer-class"><div class="answer-class-time">${escapeHtml(item.date)}</div><div class="answer-class-body"><strong>${escapeHtml(item.name)}</strong><div class="answer-class-meta">${escapeHtml(dayOfWeek(item.date))}${item.type !== "holiday" ? ` · ${escapeHtml(item.type)}` : ""}${item.overridden ? " · admin override" : " · official list"}</div></div></div>`).join("")}</div>
      ${contentSource("https://gndec.ac.in/sites/default/files/LoH26.pdf", "Official holiday list PDF")}`,
    intent: "HOLIDAY", confidence: 0.94,
    plan: ["read the official holiday list", "merge admin overrides", "list the next published dates"]
  };
}

function calculationResult(question) {
  const text = canonicalize(question);
  // CGPA to percentage (PTU formula: CGPA × 9.5)
  const cgpaMatch = text.match(/(?:cgpa|cg\s*pa|grade\s*point)[\s:=]*(?:of|is|hai|h)?[\s:=]*(\d+(?:\.\d+)?)/)
    || text.match(/(\d+(?:\.\d+)?)[\s:]*(?:cgpa|cg\s*pa)/);
  if (cgpaMatch && (mentions(question, ["cgpa", "grade point", "cumulative"]) || /cgpa/i.test(question))) {
    const cgpa = parseFloat(cgpaMatch[1]);
    if (cgpa >= 0 && cgpa <= 10) {
      const pct = (cgpa * 9.5).toFixed(2);
      return {
        html: `<p><strong>CGPA ${cgpa} → ${pct}%</strong></p>
          <ul style="margin:6px 0 6px 18px;font-size:.92em">
            <li>PTU formula: CGPA × 9.5</li>
            <li>Grade: ${cgpa >= 9 ? "Outstanding" : cgpa >= 8 ? "Excellent" : cgpa >= 7 ? "Very Good" : cgpa >= 6 ? "Good" : cgpa >= 5 ? "Average" : "Below Average"}</li>
            <li>Equivalent percentage: <strong>${pct}%</strong></li>
          </ul>
          <p class="answer-meta">PTU/IKGPTU standard formula. Actual marksheet may differ slightly.</p>`,
        intent: "CGPA_CALC", confidence: 0.97,
        plan: ["read CGPA value from query", "apply PTU formula ×9.5", "return result"],
        entities: { cgpa, percentage: parseFloat(pct) }
      };
    }
  }
  // SGPA to percentage
  const sgpaMatch = text.match(/(?:sgpa|s\.?g\.?p\.?a|semester\s*grade)[\s:=]*(?:of|is|hai|h)?[\s:=]*(\d+(?:\.\d+)?)/)
    || text.match(/(\d+(?:\.\d+)?)[\s:]*(?:sgpa|s\.?g\.?p\.?a)/);
  if (sgpaMatch && /sgpa|s\.?g\.?p\.?a|semester grade/i.test(question)) {
    const sgpa = parseFloat(sgpaMatch[1]);
    if (sgpa >= 0 && sgpa <= 10) {
      const pct = (sgpa * 9.5).toFixed(2);
      return {
        html: `<p><strong>SGPA ${sgpa} → ${pct}%</strong> (PTU formula: SGPA × 9.5)</p>
          <p class="answer-meta">This is the SGPA for a single semester. For overall percentage, use your CGPA.</p>`,
        intent: "SGPA_CALC", confidence: 0.96,
        plan: ["read SGPA value from query", "apply PTU formula ×9.5", "return result"],
        entities: { sgpa, percentage: parseFloat(pct) }
      };
    }
  }
  // "How many classes can I miss / bunk?" (75% rule)
  const bunkMatch = text.match(/(\d+)\s*(?:total|out\s+of|mein\s+se|classes?|lectures?)/);
  const totalText = text.match(/(?:total|out\s+of|mein|me)\s*(\d+)/);
  if (
    /(?:bunk|miss|skip|absent|how\s+many.*(?:bunk|miss|skip|leave)|kitne.*(?:bunk|chhod|miss))/i.test(text) ||
    mentions(question, ["how many classes can i miss", "how many can i bunk", "kitne classes bunk", "75 percent"]) ||
    (/\battendance\b/i.test(text) && /\d+\s*(?:%|percent)/.test(text))
  ) {
    const total = parseInt((bunkMatch || totalText || [])[1] || "0", 10);
    if (total > 0 && total <= 500) {
      const minPresent = Math.ceil(total * 0.75);
      const canMiss = total - minPresent;
      return {
        html: `<p><strong>75% attendance rule:</strong> Out of <strong>${total}</strong> classes, you must attend at least <strong>${minPresent}</strong>.</p>
          <p>You can miss at most <strong>${canMiss}</strong> classes and still be eligible.</p>
          <p class="answer-meta">Formula: required = ⌈total × 0.75⌉. Verify with your department — some teachers have stricter rules.</p>`,
        intent: "ATTENDANCE_CALC", confidence: 0.95,
        plan: ["read total classes from query", "apply 75% rule", "return safe result"],
        entities: { total, minPresent, canMiss }
      };
    }
    // "If I have X% attendance, can I miss more?" — percentage-based query
    // Matches: "65% attendance", "attendance 65%", "meri 65 percent attendance", "65 percent hai"
    const currentPctMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per\s*cent)\s*(?:attendance|attend)/)
      || text.match(/(?:attendance|attend)\s*(?:is|hai|hain|meri|mera|h|=)?\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/)
      || ((/\battendance\b/i.test(text) || /\battend\b/i.test(text)) ? text.match(/(\d{2,3}(?:\.\d+)?)\s*(?:%|percent)/) : null);
    if (currentPctMatch) {
      const curPct = parseFloat(currentPctMatch[1]);
      // Exactly 75 with "rule" context = explaining the rule, not personal attendance
      const isRuleQuery = /\b(?:rule|law|policy|kya\s*hai|what\s*is|explain|matlab|means?)\b/i.test(text) && curPct === 75;
      if (!isRuleQuery && curPct >= 0 && curPct <= 100 && curPct !== 75) {
        const canMissMore = curPct > 75;
        const deficit = curPct < 75 ? (75 - curPct).toFixed(1) : 0;
        const buffer = curPct > 75 ? (curPct - 75).toFixed(1) : 0;
        return {
          html: `<p><strong>Your current attendance: ${curPct}%</strong></p>
            <p>${canMissMore
              ? `You are <strong>${buffer}%</strong> above the 75% minimum — you have some buffer.`
              : `You are <strong>${deficit}%</strong> below the 75% requirement — you cannot miss any more classes.`
            }</p>
            <p class="answer-meta">To get an exact "how many classes can I miss" answer, tell me your total class count. Example: "I have 80 classes total and 65% attendance, how many can I miss?"</p>`,
          intent: "ATTENDANCE_PCT", confidence: 0.93,
          plan: ["read current attendance %", "compare to 75% threshold", "advise on buffer/deficit"],
          entities: { currentPercentage: curPct }
        };
      }
    }
    // Generic rule without a number
    return {
      html: `<p><strong>75% attendance is mandatory</strong> at GNDEC (PTU/IKGPTU rule).</p>
        <ul style="margin:6px 0 6px 18px;font-size:.92em">
          <li>Must attend ≥ 75% of total classes each semester</li>
          <li>60–74%: Medical/exceptional grounds (with proof)</li>
          <li>Below 60%: Debarred from End-Semester exam</li>
        </ul>
        <p>Try: <em>"I have 80 classes total, how many can I miss?"</em></p>`,
      intent: "ATTENDANCE_RULE", confidence: 0.92,
      plan: ["explain 75% rule", "add PTU tiers", "invite follow-up with specific number"],
      entities: {}
    };
  }
  return null;
}

function attendanceResult(question, ctx) {
  if (!wants(question, VOCAB.attendance)) return null;
  // Don't intercept teacher queries - "miss" is a title (ma'am/miss)
  const text = canonicalize(question);
  if (wants(text, ["who", "teacher", "faculty", "padhata", "teaches", "kaun"])) return null;
  // Don't intercept subject queries - "skip" / "miss" might appear near a subject name
  if (wants(text, VOCAB.subject) && !wants(text, ["absent", "attendance", "bunk", "shortage"])) return null;
  return {
    html: `<p><strong>Attendance is not tracked in Compass.</strong></p>
      <p>The timetable only describes when classes are published; it does not record who attended. Use the official college attendance system for your attendance percentage.</p>`,
    intent: "ATTENDANCE_UNAVAILABLE", confidence: 0.9,
    plan: ["recognise an unsupported data request", "never fabricate attendance"],
    entities: {}
  };
}

function smalltalkResult(question, ctx) {
  const text = canonicalize(question);
  const compact = text.replace(/\s+/g, " ").trim();
  if (/^(?:hi+|hello+|hey+|namaste|good\s+morning|good\s+afternoon|good\s+evening|good\s+night|hello\s*ji|hi\s*ji|yo|hola|jai\s+hind|vande\s+mataram|sat\s+sri\s+akal|ram\s+ram|radhe\s+radhe|namaskar|waheguru|waheguru\s+ji)(?: there| ji| bhai| bro| yaar| dost)?$/.test(compact)) {
    return {
      html: `<p><strong>Hello! 👋</strong> I'm Compass — your GNDEC timetable assistant.</p>
        <p>Ask me anything about your schedule, like:</p>
        <ul style="margin:8px 0;padding-left:18px;line-height:1.9">
          <li>🕐 <em>"What is my next class?"</em></li>
          <li>🏫 <em>"Which rooms are free now?"</em></li>
          <li>📅 <em>"Kal ka timetable dikha"</em></li>
          <li>👨‍🏫 <em>"Physics ka teacher kaun hai?"</em></li>
          <li>📋 <em>"When is my ESE exam?"</em></li>
        </ul>
        <p class="answer-meta">I answer from verified GNDEC data only — no guessing, ever. Hinglish, Punjabi, Hindi and typos are fine!</p>`,
      intent: "GREETING", confidence: 0.99, plan: ["recognise a greeting", "offer verified topics"]
    };
  }
  if (/^(?:thanks|thank you|thx|ty|dhanyavad|shukriya|shukria|thanx)(?: so much| a lot| bhai)?$/.test(compact)) {
    return { html: `<p>You're welcome! 😊 Ask anything else about your timetable, rooms, teachers or exams.</p>`, intent: "THANKS", confidence: 0.99, plan: ["recognise thanks"] };
  }
  if (/^(?:bye|goodbye|see you|ok bye|chalo bye|phir milde|phir milte)$/.test(compact)) {
    return { html: `<p>See you. Your saved section and settings stay on this device.</p>`, intent: "BYE", confidence: 0.99, plan: ["recognise goodbye"] };
  }
  if (wants(question, VOCAB.capabilities) || /\bhow are you\b|\bwhat is your name\b|\bare you real\b|\bare you a bot\b/.test(compact)) {
    return {
      html: `<p><strong>I'm Compass 🧭</strong> — GNDEC's verified timetable assistant.</p>
        <p>I run a deterministic engine over official GNDEC data. I'm <strong>not an LLM</strong> — I never guess.</p>
        <p><strong>What I can do:</strong></p>
        <ul style="margin:8px 0;padding-left:18px;line-height:1.9">
          <li>📅 Timetable: today, tomorrow, any day, any section</li>
          <li>🕐 Next/current class with time, room and teacher</li>
          <li>🏫 Free rooms right now or at any time</li>
          <li>👨‍🏫 Who teaches any subject</li>
          <li>📋 Exam datesheets (ESE, MSE)</li>
          <li>📢 College notices and past papers</li>
          <li>🧮 CGPA → %, attendance bunk calculator</li>
        </ul>
        <p class="answer-meta">Accepts: English, Hinglish, Punjabi, Hindi, SMS shortforms, Devanagari, Gurmukhi.</p>`,
      intent: "CAPABILITIES", confidence: 0.98, plan: ["describe the verified engine", "list supported topics", "state the limitation honestly"]
    };
  }
  return null;
}

/* ── follow-up memory and compound questions ──────────────────────────── */

const PRONOUNS = ["it", "its", "it's", "that", "this", "uska", "uski", "uske", "wo", "woh", "same", "there", "wahan"];

function isFollowUp(text) {
  const tokens = canonicalize(text).split(" ").filter(Boolean);
  if (!tokens.length) return false;
  if (tokens.length <= 3) return true;
  if (/^(?:and|what about|aur|fer|phir|also|then|uska|uski|uske|wo|woh|that|it|its)\b/.test(canonicalize(text))) return true;
  return tokens.some((token) => PRONOUNS.includes(token));
}

/**
 * Expand a short follow-up with the subject/day/room of the previous answer.
 * Only entities that were actually published are reused.
 */
function applyMemory(text, memory) {
  if (!memory || !isFollowUp(text)) return text;
  let expanded = text;
  const hasSubject = Boolean(matchSubjects(text, memory.subjectEntries || []).length);
  const explicitDay = Boolean(resolveQuestionDay(text));
  if (memory.subject && !hasSubject && wants(text, ["where", "room", "who", "teacher", "when", "time", "which", "kaun", "kab", "kahan", "kithe"])) {
    expanded = `${memory.subject} ${expanded}`;
  } else if (memory.subject && !hasSubject && /^(?:and|what about|aur|uska|uski|uske)\b/.test(text) && !explicitDay) {
    expanded = `${memory.subject} ${expanded}`;
  }
  if (memory.day && !explicitDay && /\b(?:and|what about|us din|that day|then|phir|fer)\b/.test(text)) {
    expanded = `${expanded} ${memory.day}`;
  }
  return expanded;
}

function splitClauses(text) {
  const pieces = canonicalize(text)
    .split(/\s+(?:and|aur|plus|also|then|&)\s+|[,;]\s*/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length >= 3);
  return [...new Set(pieces)].slice(0, 3);
}

function combineAnswers(answers) {
  const valid = answers.filter(Boolean);
  if (valid.length < 2) return null;
  const intents = new Set(valid.map((answer) => answer.intent));
  if (intents.size < 2) return null;
  return {
    html: `<div class="answer-multi">${valid.map((answer) => `<div class="answer-part">${answer.html}</div>`).join("")}</div>`,
    intent: "MULTI",
    confidence: Math.min(...valid.map((answer) => answer.confidence)),
    plan: [...new Set(valid.flatMap((answer) => answer.plan))].slice(0, 8),
    entities: Object.assign({}, ...valid.map((answer) => answer.entities || {}))
  };
}

/* ── suggestions ──────────────────────────────────────────────────────── */

const SUGGESTIONS = Object.freeze({
  NEXT_CLASS: ["Show tomorrow's timetable", "Which rooms are free now?", "When does my day end?"],
  CURRENT_CLASS: ["What is my next class?", "Show today's free periods", "Where is this class?"],
  DAY_SCHEDULE: ["What is my next class?", "Which rooms are free now?", "When is my ESE exam?"],
  WEEK_SCHEDULE: ["What is my first class on Monday?", "Show my timetable for tomorrow", "Find a free room at 2 PM"],
  SUBJECT_SCHEDULE: ["Who teaches it?", "Where is it?", "When is its exam?"],
  SUBJECT_ROOMS: ["Who teaches it?", "Show its full weekly schedule", "Which rooms are free now?"],
  SUBJECT_TEACHERS: ["Where is the class?", "Show its full weekly schedule", "When is the exam?"],
  SUBJECT_TIMING: ["Where is it?", "Who teaches it?", "Show tomorrow's timetable"],
  TEACHER_SCHEDULE: ["Who else teaches this subject?", "Show my weekly timetable", "Which rooms are free now?"],
  ROOM_SCHEDULE: ["Is it free now?", "Which other rooms are free?", "Show my next class"],
  FREE_ROOMS: ["Show labs only", "Which rooms are free at 2 PM?", "What is my next class?"],
  ROOM_AVAILABILITY: ["Show all free rooms", "What is my next class?", "When does my day end?"],
  FREE_PERIODS: ["Which rooms are free now?", "Show my next class", "Show tomorrow's timetable"],
  FIRST_CLASS: ["What is my last class?", "Show the full day", "Which rooms are free now?"],
  LAST_CLASS: ["What is my first class?", "Show the full day", "Show tomorrow's timetable"],
  DATESHEET: ["Show the full datesheet", "When is my next exam?", "Show my timetable"],
  PROFILE: ["Show my timetable", "Change my section", "Which rooms are free now?"],
  DEFAULT: ["What is my next class?", "Show my timetable for tomorrow", "Which rooms are free now?", "When is my ESE exam?"]
});

export function suggestionsFor(intent = "") {
  return (SUGGESTIONS[intent] || SUGGESTIONS.DEFAULT).slice(0, 3);
}

/* ── main entry ───────────────────────────────────────────────────────── */

function answerOnce(question, ctx, memory, rawQuestion) {
  const text = canonicalize(question);
  if (!text) return null;

  const greeting = smalltalkResult(text, ctx);
  if (greeting) return greeting;

  const profile = profileResult(text, ctx);
  if (profile) return profile;

  // Content answers work before the timetable loads: notices, papers,
  // syllabus links, mentors, departments, the calendar and the datesheet all
  // come from their own verified source.
  const contentAnswer = noticesResult(text, ctx)
    || papersResult(text, ctx)
    || syllabusResult(text, ctx)
    || mentoringResult(text, ctx)
    || departmentResult(text, ctx);
  if (contentAnswer) return contentAnswer;

  const academic = academicCalendarResult(text, ctx);
  if (academic) return academic;

  const holidayEarly = holidayResult(text, ctx);
  if (holidayEarly) return holidayEarly;

  // ESE (End Semester Exam) is official – skip published admin datesheets for it.
  // ESE (End Semester Exam) is official – skip admin-published datesheets for it.
  const _rawQ = rawQuestion || question;
  const publishedSheet = /\bese\b|end.?semester/i.test(_rawQ) ? null : publishedDatesheetResult(text, ctx);
  if (publishedSheet) return publishedSheet;

  // Normalize 'mse' queries: mid-sem exam → check datesheet
  const mseText = /\bmse\b/i.test(question) ? text.replace(/\bmse\b/g, 'exam') : text;
  const datesheetEarly = datesheetResult(mseText, ctx);
  if (datesheetEarly) return datesheetEarly;

  // ── Hostel / Fees / Result / Admit card — polite not-available (before schedule check) ─
  const _rawQ2 = rawQuestion || question;
  if (/\b(?:hostel|accommodation|mess|mess\s*food|dhaba|canteen|cafeteria)\b/i.test(_rawQ2)) {
    return {
      html: `<p><strong>Hostel &amp; mess information</strong> is not available in Compass.</p>
<p>For hostel queries, contact the Hostel Warden or visit <a href="https://gndec.ac.in" target="_blank" rel="noopener noreferrer">gndec.ac.in</a>.</p>`,
      intent: "HOSTEL_INFO", confidence: 0.88,
      plan: ["detect hostel/mess query", "return polite not-available", "provide college website link"]
    };
  }
  if (/\b(?:fees?|tuition|fee\s*structure|semester\s*fees?|how\s*much\s*(?:is|are)\s*(?:the\s*)?fees?)\b/i.test(_rawQ2)) {
    return {
      html: `<p><strong>Fee information</strong> is not available in Compass.</p>
<p>For fee details, visit the <a href="https://gndec.ac.in" target="_blank" rel="noopener noreferrer">GNDEC official website</a> or contact the Accounts branch.</p>`,
      intent: "FEES_INFO", confidence: 0.88,
      plan: ["detect fees query", "return polite not-available", "direct to official source"]
    };
  }
  if (/\b(?:result|marksheet|mark\s*sheet|marks?\s*card|grade\s*card|semester\s*result|result\s*kab|score\s*card)\b/i.test(_rawQ2)) {
    return {
      html: `<p><strong>Exam results and marksheets</strong> are published on the PTU portal.</p>
<p>Check your result at <a href="https://ptu.ac.in" target="_blank" rel="noopener noreferrer">ptu.ac.in</a> or the official GNDEC notice board. Compass cannot access your personal marks.</p>`,
      intent: "RESULT_INFO", confidence: 0.88,
      plan: ["detect result/marksheet query", "return polite not-available", "direct to PTU portal"]
    };
  }
  if (/\b(?:admit\s*card|hall\s*ticket|roll\s*slip|roll\s*number\s*slip|admit\s*slip)\b/i.test(_rawQ2)) {
    return {
      html: `<p><strong>Admit cards</strong> are issued by PTU and distributed through GNDEC.</p>
<p>Contact your class teacher, department office, or check the official notice board for admit card distribution. Compass does not store admit card data.</p>`,
      intent: "ADMIT_CARD_INFO", confidence: 0.88,
      plan: ["detect admit card query", "return polite not-available", "provide contact guidance"]
    };
  }
  if (/\b(?:scholarship|stipend|financial\s*aid|merit\s*scholarship|post\s*matric|pre\s*matric)\b/i.test(_rawQ2)) {
    return {
      html: `<p><strong>Scholarship information</strong> is managed by the Student Welfare branch at GNDEC.</p>
<p>Contact the Student Welfare office or visit <a href="https://gndec.ac.in" target="_blank" rel="noopener noreferrer">gndec.ac.in</a> for details.</p>`,
      intent: "SCHOLARSHIP_INFO", confidence: 0.85,
      plan: ["detect scholarship query", "return polite not-available", "direct to student welfare"]
    };
  }
  if (/\b(?:library|book\s*issue|return\s*book|library\s*card|librarian)\b/i.test(_rawQ2)
    && !/\bclass\b/i.test(_rawQ2)) {
    return {
      html: `<p><strong>Library</strong> queries are outside Compass's scope.</p>
<p>Visit the GNDEC Library directly or contact the librarian. Library hours: typically 9 AM – 5 PM on working days.</p>`,
      intent: "LIBRARY_INFO", confidence: 0.82,
      plan: ["detect library query", "return polite not-available", "provide timing hint"]
    };
  }

  // ── Calculation answers that work without a schedule ───────────────────
  const calcEarly = calculationResult(text);
  if (calcEarly) return calcEarly;

  if (!ctx.schedule?.length) {
    return {
      html: `<p>The official timetable has not loaded yet, so I cannot verify a class, room or teacher. Open Timetable and try again.</p>`,
      intent: "NO_DATA", confidence: 0.9, plan: ["check the local release", "refuse instead of guessing"]
    };
  }

  // An explicitly named published section is a factual public selection.
  const scope = sectionScope(text, ctx);
  const scopedCtx = scope ? { ...ctx, group: scope.group, subgroup: scope.subgroup } : ctx;
  if (!scopedCtx.group) {
    return {
      html: `<p>Choose your section in Timetable first. Without a section I cannot verify a personalised answer.</p>`,
      intent: "NO_SECTION", confidence: 0.9, plan: ["check the active selection", "refuse instead of guessing"]
    };
  }

  const attendance = attendanceResult(text, scopedCtx);
  if (attendance) return attendance;

  const freeRooms = freeRoomsResult(text, scopedCtx);
  if (freeRooms) return freeRooms;

  const firstLast = firstLastResult(text, scopedCtx);
  if (firstLast) return firstLast;

  const freePeriod = freePeriodResult(text, scopedCtx);
  if (freePeriod) return freePeriod;

  const nextIntent = wants(text, VOCAB.next) || /\bwhat class (?:do i have|is there)\b|\bdo i have (?:a )?class\b/.test(text);
  // If tomorrow/kal/parso is explicit, prefer dayResult over nextClassResult
  const hasExplicitDay = wants(text, ["tomorrow", "kal", "parso", "day after tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  if (nextIntent && wants(text, ["class", "lecture", "period", "slot"]) && !hasExplicitDay) return nextClassResult(scopedCtx);

  // Single-word "free" → free rooms (most common student intent)
  if (/^free$/.test(text.trim())) return freeRoomsResult("which rooms are free now", scopedCtx);

  if (wants(text, VOCAB.week)) return weekResult(scopedCtx);

  const day = resolveQuestionDay(text, scopedCtx.now);
  if (day) {
    const dateISO = day.date?.dateISO || dateForWeekday(day.day, scopedCtx.now);
    const exams = examsForDate(scopedCtx, dateISO);
    if (exams.length) return examDayResult(exams, scopedCtx, { label: day.label || day.day, dateISO });
    // "Physics tomorrow?" should answer the subject, not the whole day.
    const subjectOnDay = subjectResult(text, scopedCtx, day);
    if (subjectOnDay && contentTokens(text).length) return subjectOnDay;
    return dayResult(day.day, scopedCtx, day.label);
  }

  const teacher = teacherResult(text, scopedCtx);
  if (teacher) return teacher;

  const room = roomResult(text, scopedCtx);
  if (room) return room;

  const subject = subjectResult(text, scopedCtx);
  if (subject) return subject;

  if (wants(text, ["timetable", "schedule"])) return weekResult(scopedCtx);
  // "50 classes" is a quantity reference, not a schedule request
  if (wants(text, ["classes", "class", "lecture", "period"]) && !/\b\d+\s+class/i.test(text)) return dayResult(scopedCtx.now.day, scopedCtx, "Today");

  // Calculation answers (CGPA, 75% rule) — only when explicitly requested
  // Guard: must have explicit CGPA keyword OR explicit bunk/miss + how many + number
  const hasExplicitCgpa = /\bcgpa\b/i.test(question) || mentions(question, ["cgpa", "grade point", "cumulative grade"]);
  const hasExplicitBunk = /\b(?:how\s+many.*(?:bunk|miss|skip|leave)|kitne.*(?:bunk|chhod|miss))\b/i.test(text)
    && /\d/.test(text);
  if (hasExplicitCgpa || hasExplicitBunk) {
    const calc = calculationResult(question);
    if (calc) return calc;
  }

  // ── Practical / lab query catch (when no specific subject matched)
  if (mentions(question, ["practical", "practicals", "lab work", "prac"])) {
    const labClasses = (scopedCtx.schedule || []).filter((e) =>
      e.group === scopedCtx.group && e.day === scopedCtx.now.day &&
      (e.type === "P" || /lab/i.test(e.subject))
    );
    if (labClasses.length) {
      return {
        html: `<p><strong>Practicals today:</strong></p>${labClasses.map((e) => classCard(e, scopedCtx)).join("")}`,
        intent: "PRACTICAL_SCHEDULE", confidence: 0.88,
        plan: ["find practical/lab entries for today", "return verified list"],
        entities: {}
      };
    }
    return {
      html: `<p>No practicals or lab sessions found for today in the loaded timetable.</p>`,
      intent: "PRACTICAL_SCHEDULE", confidence: 0.75,
      plan: ["look for practicals", "none found today"],
      entities: {}
    };
  }

  return null;
}

/**
 * Answer a question from verified local data.
 *
 * @param {string} question
 * @param {object} ctx
 * @param {{subject?:string,day?:string,room?:string,teacher?:string,intent?:string,subjectEntries?:Array}} [memory]
 * @returns {null | {html:string,intent:string,confidence:number,plan:string[],entities?:object,suggestions?:string[]}}
 */
export function answerLocally(question, ctx = {}, memory = null) {
  // Bound the raw input before any normalisation can collapse it.
  if (String(question || "").trim().length > 800) {
    return {
      html: `<p>That question is too long for the local engine. Please shorten it to one topic.</p>`,
      intent: "TOO_LONG", confidence: 0.9, plan: ["bound the input"]
    };
  }
  const text = canonicalize(question);
  if (!text) return null;

  // Compound questions get one verified section each, never a merged guess.
  const clauses = splitClauses(text);
  if (clauses.length >= 2) {
    const combined = combineAnswers(clauses.map((clause) => answerOnce(clause, ctx, memory, question)));
    if (combined) {
      combined.suggestions = suggestionsFor(combined.intent);
      return withSuggestion(combined);
    }
  }

  const expanded = applyMemory(text, memory);
  const answer = answerOnce(expanded, ctx, memory, question)
    || (expanded !== text ? answerOnce(text, ctx, memory, question) : null);
  if (!answer) return null;
  return withSuggestion(answer);
}

function withSuggestion(answer) {
  if (!answer) return answer;
  const entities = answer.entities || {};
  return {
    ...answer,
    suggestions: answer.suggestions || suggestionsFor(answer.intent),
    memory: {
      intent: answer.intent,
      subject: entities.subject || "",
      day: entities.day || "",
      room: entities.room || "",
      teacher: entities.teacher || ""
    }
  };
}

/** Build the context object used by the local engine and the Brain adapter. */
export function buildAnswerContext({
  schedule = [],
  allSchedule = null,
  roomSchedule = [],
  group = "",
  subgroup = "",
  profile = {},
  now = getIndiaNow(),
  metadata = null,
  datesheet = null,
  publishedDatesheets = [],
  notices = [],
  papers = [],
  syllabus = [],
  holidays = [],
  departments = [],
  clock = "12h",
  showTeacher = true,
  showRoom = true,
  showCode = true,
  roomDuration = 60,
  includeLabs = true,
  includeLectureHalls = true
} = {}) {
  return {
    schedule, allSchedule: Array.isArray(allSchedule) ? allSchedule : schedule, roomSchedule, group, subgroup, profile, now, metadata, datesheet,
    publishedDatesheets: Array.isArray(publishedDatesheets) ? publishedDatesheets : [],
    notices, papers, syllabus, holidays, departments,
    clock, showTeacher, showRoom, showCode, roomDuration, includeLabs, includeLectureHalls
  };
}

export const FALLBACK_REFUSAL = `<p><strong>I cannot verify that from the data loaded on this device.</strong></p>
<p>I can help with your published timetable, rooms, teachers, free rooms and the official exam datesheet. I will not guess a class, room, date or person.</p>`;

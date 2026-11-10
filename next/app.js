/**
 * GNDEC Compass Next — application shell.
 *
 * Single small module, no framework. The verified Brain engines are loaded
 * lazily from the frozen legacy build; if they are unavailable the local
 * deterministic engine still answers every factual question.
 */

import {
  APP_VERSION, CATEGORIES, FLAGS, PRESETS, SETTINGS_KEY,
  getFlag, isMapFlagEnabled
} from "./settings-registry.js";
import {
  applyPreset, coerceValue, defaultValues, exportBundle, importBundle,
  isFlagAvailable, loadProfile, loadUserValues, resetValues, resolveValues,
  saveProfile, saveUserValues
} from "./settings-store.js";
import {
  DAY_NAMES, STUDY_DAYS, addDays, formatDuration, freeGapsBetweenClasses, getIndiaNow, humanTime,
  nextStudyDay, relativeStartLabel, resolveQuestionDay, shouldLookAheadAtFive
} from "./engine/datetime.js";
import { mergeSchedules, readVerifiedFetTimetable } from "./engine/fet-parser.js";
import { computeFreeRooms, formatFreeWindow, groupRooms, roomZone, zoneFromQuestion } from "./engine/free-rooms.js";
import { answerLocally, buildAnswerContext, escapeHtml, FALLBACK_REFUSAL, classesFor } from "./engine/answer.js";
import { brainSuggestions, loadBrainScripts, runBrain } from "./engine/brain-bridge.js";
import {
  clearAppCaches, clearSnapshots, deleteSnapshot, getSnapshot, listSnapshots,
  pruneSnapshots, requestPersistentStorage, saveSnapshot, storageEstimate, formatBytes
} from "./engine/storage.js";
import { digestCopy, dueReminder, isQuietTime, notificationCopy } from "./engine/reminders.js";
import { ROUTES as SEO_ROUTES, headTags, routeFromPath } from "./seo-meta.js";
import { academicOverlayFromSchedule, applyMentoringOverride, classesWithOverlay, MENTORING_SUBJECT, profileAppliesToSelection } from "./engine/mentoring.js";
import {
  NOTICE_CATEGORIES, TRANSCRIBED_NOTICES, filterNotices, isRecent, mergeNotices, noticeStats, slugify
} from "./engine/notices.js";
import { buildPaperIndex, groupPapers, paperStats, searchPapers } from "./engine/papers.js";
import { answerFirstYearSyllabus, buildSyllabusIndex, groupSyllabus, parseFirstYearSyllabus, searchSyllabus } from "./engine/syllabus.js";
import { findProfileRosterMatches, matchProfileRecord } from "./engine/profile-lookup.js";
import { examEventsForSelection, examsOnDate, examTimeLabel, nextUpcomingExam } from "./engine/exams.js";
import {
  ACADEMIC_PERIODS, CALENDAR_SOURCE, HOLIDAYS_2026, HOLIDAY_SOURCE, academicPeriodFor,
  dayOfWeek, holidayOn, holidaySummary, isOffDay, upcomingHolidays
} from "./engine/calendar.js";

const CHAT_KEY = "gndec-compass-next-chat-v1";
const SELECTION_KEY = "gndec-compass-next-selection-v1";
const LEGACY_GROUP_KEY = "gndec-compass-group-v3";
const LEGACY_SUBGROUP_KEY = "gndec-compass-subgroup-v3";
const DEVICE_KEY = "gndec-compass-next-device-v1";
const ADMIN_MODE_KEY = "gndec-compass-next-admin-mode-v1";
const GROUP_USAGE_KEY = "gndec-compass-next-group-usage-v1";
const REMINDER_KEY = "gndec-compass-next-reminders-v1";
const DIGEST_KEY = "gndec-compass-next-digest-v1";
const THEME_ORDER = ["system", "light", "dark", "oled"];

const BRANCHES = Object.freeze([
  ["BARCH", "Architecture"], ["BBA", "Business Administration"], ["BCA", "Computer Applications"],
  ["BCOM", "Commerce"], ["BVOC", "Vocational Studies"], ["MCA", "Master of Computer Applications"],
  ["RAI", "Robotics and Artificial Intelligence"], ["CS", "Computer Science Engineering"],
  ["EC", "Electronics and Communication Engineering"], ["EE", "Electrical Engineering"],
  ["IT", "Information Technology"], ["CE", "Civil Engineering"], ["ME", "Mechanical Engineering"]
]);

const state = {
  route: "today",
  schedule: [],
  roomSchedule: [],
  subgroupSchedule: [],
  academicOverlay: [],
  academicOverlayGroup: "",
  groups: [],
  group: "",
  subgroup: "",
  metadata: null,
  profile: {},
  values: {},
  sources: {},
  adminValues: {},
  version: null,
  datesheet: null,
  notices: [],
  noticesStatus: "idle",
  content: { notices: [], announcements: [], holidays: [], papers: [], syllabus: [], datesheets: [], links: [], configured: false, meta: null },
  contentStatus: "idle",
  campus: { notices: [], syllabus: [], departments: [], checkedAt: "" },
  campusStatus: "idle",
  papers: { records: [], loadedAt: "", sources: [] },
  papersStatus: "idle",
  noticeQuery: "",
  noticeCategory: "",
  calendarMonth: "",
  paperQuery: "",
  paperDepartment: "",
  syllabusQuery: "",
  syllabusDepartment: "",
  adminToken: "",
  adminStatus: "idle",
  adminData: null,
  adminError: "",
  adminAiSession: null,
  adminTab: "notices",
  adminEditing: null,
  adminBusy: false,
  directoryTab: "faculty",
  directoryQuery: "",
  directoryStatus: "idle",
  faculty: [],
  students: [],
  rosterGeneratedAt: "",
  profileLookupQuery: "",
  profileLookupMessage: "",
  profileLookupMatches: [],
  profileLookupTimer: 0,
  syllabus: null,
  firstYearSyllabusCourses: [],
  firstYearSyllabusPromise: null,
  compareA: "",
  compareB: "",
  compareDay: "",
  compareStatus: "idle",
  chat: [],
  busy: false,
  brainState: "idle",
  dataStatus: "loading",
  dataFallback: false,
  lastSync: "",
  online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  day: "",
  settingsCategory: "overview",
  settingsQuery: "",
  roomDay: "",
  roomTime: "",
  roomZone: "",
  teacherQuery: "",
  teacherSelected: "",
  debug: { attempts: [], last: null },
  installPrompt: null,
  notified: new Set(),
  legacyUrl: "https://gndec-compass.koush3069.workers.dev",
  refreshTimer: 0,
  reminderTimer: 0,
  renderedAt: 0,
  snapshots: [],
  reloading: false,
  listening: false,
  searchTimer: 0
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* private mode */ }
}

function toast(message, kind = "") {
  const root = $("#toast-root");
  if (!root) return;
  const node = document.createElement("div");
  node.className = `toast${kind ? ` is-${kind}` : ""}`;
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  template.content.querySelectorAll("script,iframe,object,embed,style,form,input,textarea,select,link,meta,video,audio").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) node.removeAttribute(attribute.name);
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name);
      if (name === "style" && /expression|url\s*\(/i.test(attribute.value)) node.removeAttribute(attribute.name);
    }
  });
  return template.innerHTML;
}

function subjectColor(subject) {
  if (!state.values["appearance.timetableColors"]) return "";
  let hash = 0;
  const text = String(subject || "");
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) % 360;
  return `style="--subject-color: hsl(${hash} 62% 58%)"`;
}

function branchForGroup(group) {
  const base = String(group || "").replace(/^D[23]/, "");
  return BRANCHES.find(([prefix]) => base.startsWith(prefix))?.[1] || "Programme timetable";
}

function groupLabel(group) {
  return `${group} · ${branchForGroup(group)}`;
}

function selectionLabel() {
  return `${state.group || "No section"}${state.subgroup ? ` · ${state.subgroup}` : ""}`;
}

function now() {
  return getIndiaNow();
}

function subgroupsFor(group) {
  return [...new Set(state.schedule
    .filter((entry) => entry.group === group)
    .flatMap((entry) => String(entry.cohorts || "").split(/\s*,\s*/).filter(Boolean))
    .filter((cohort) => cohort !== group && String(cohort).startsWith(group)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Groups that only exist in the official subgroup (academic/mentoring) file. */
function academicGroups() {
  return [...new Set(state.subgroupSchedule.map((entry) => entry.group).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function academicOverlayForProfile(schedule, profile = state.profile) {
  return academicOverlayFromSchedule(schedule, profile);
}

/**
 * Mirrors the legacy Compass timetable: the official section file is the base
 * timetable, and the official subgroup file contributes the student's academic
 * (mentoring) group rows. Those extra rows receive mentor overrides; printed
 * base rows never do.
 */
function refreshAcademicOverlay() {
  const academicGroup = String(state.profile?.academicGroup || "").replace(/\s+/g, " ").trim();
  state.academicOverlay = academicOverlayForProfile(state.subgroupSchedule, state.profile);
  state.academicOverlayGroup = academicGroup;
}

function overlayApplies() {
  const academicGroup = String(state.profile?.academicGroup || "").replace(/\s+/g, " ").trim();
  return Boolean(academicGroup)
    && state.academicOverlayGroup === academicGroup
    && profileAppliesToSelection(state.profile, state.group, state.subgroup);
}

/**
 * The verified schedule an answer should read: the base section timetable plus
 * the student's official academic-group rows, de-duplicated and mentor-filled.
 */
function effectiveSchedule() {
  if (!overlayApplies()) return state.schedule;
  const existing = new Set(state.schedule
    .filter((entry) => entry.group === state.group)
    .map((entry) => `${entry.day}|${entry.start}|${entry.end}|${entry.subject}`));
  const extra = state.academicOverlay
    .filter((entry) => !existing.has(`${entry.day}|${entry.start}|${entry.end}|${entry.subject}`))
    .map((entry) => ({ ...applyMentoringOverride(entry, state.profile), group: state.group, cohorts: "" }));
  return [...state.schedule, ...extra];
}

function classesForDay(day) {
  const base = classesFor(state.schedule, state.group, day, state.subgroup);
  if (!overlayApplies()) return base;
  return classesWithOverlay(base, state.academicOverlay, day, state.profile);
}

function preferredGroup(groups) {
  return groups.find((group) => /^ECB(?:\d|$)/.test(group))
    || groups.find((group) => /^EC(?:\d|[A-Z])/.test(group))
    || groups[0] || "";
}

function isOpenQuestion(question) {
  const text = String(question || "").toLowerCase();
  if (/\b(?:class|timetable|schedule|room|teacher|faculty|section|exam|datesheet|syllabus|result|attendance|mentor|profile)\b/.test(text)) return false;
  return /\b(?:explain|why|how|write|summar|translate|plan|help me|study|understand|difference|example|essay|email|letter)\b/.test(text) || text.split(/\s+/).length > 14;
}

/* ── Settings ──────────────────────────────────────────────────────────── */

function v(id) {
  return state.values[id];
}

function loadAllSettings() {
  const loaded = loadUserValues(localStorage);
  const user = loaded && loaded.values ? loaded.values : loaded;
  const attendanceTarget = loaded?.attendanceTarget;
  const resolved = resolveValues({ user, admin: state.adminValues, search: location.search });
  state.values = resolved.values;
  state.sources = resolved.sources;
  state.profile = loadProfile(localStorage);
  // Auto is the default for every student. Only the verified owner can opt
  // into the local-only diagnostic path from the advanced settings.
  if (!hasAdminMode()) state.values["ask.engine"] = "auto";
  if (state.profile.migratedFromLegacy) delete state.profile.migratedFromLegacy;
  if (attendanceTarget && state.profile.attendanceTarget === 76) state.profile.attendanceTarget = attendanceTarget;
  if (loaded?.migratedFromLegacy) {
    saveUserValues(localStorage, state.values);
    saveProfile(localStorage, state.profile);
    toast("Imported your legacy Compass settings. Nothing was deleted.");
  }
  applyAppearance();
}

function persistSettings() {
  saveUserValues(localStorage, state.values);
}

function applyAppearance() {
  const root = document.documentElement;
  const theme = v("appearance.theme") === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : v("appearance.theme");
  root.dataset.theme = theme;
  root.dataset.accent = v("appearance.accent");
  root.dataset.palette = v("appearance.palette");
  root.dataset.background = v("appearance.background");
  root.dataset.density = v("appearance.density");
  root.dataset.experience = v("experience.mode");
  root.dataset.bottomItems = v("nav.bottomItems");
  const scale = v("a11y.largeText") ? Math.max(125, v("appearance.fontScale")) : v("appearance.fontScale");
  root.style.setProperty("--font-scale", (scale / 100).toFixed(2));
  root.classList.toggle("is-reduced-motion", Boolean(v("appearance.reduceMotion")) || v("experience.mode") === "safe");
  root.classList.toggle("is-high-contrast", Boolean(v("appearance.highContrast")));
  root.classList.toggle("is-colorblind", Boolean(v("appearance.colorBlindPalette")));
  root.classList.toggle("is-square", !v("appearance.rounded"));
  root.classList.toggle("is-glassless", !v("appearance.glass") || v("experience.mode") === "safe");
  root.classList.toggle("is-dyslexic", Boolean(v("a11y.dyslexiaFont")));
  root.classList.toggle("is-strong-focus", Boolean(v("a11y.strongFocus")));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f2f6f8" : theme === "oled" ? "#000000" : "#0d1219");
}

function setFlag(id, raw) {
  const flag = getFlag(id);
  if (!flag) return;
  state.values[id] = coerceValue(flag, raw);
  persistSettings();
  applyAppearance();
}

/* ── Data loading ──────────────────────────────────────────────────────── */

async function fetchJson(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-cache" });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const text = await response.text();
    if (!text || text.length < 100) throw new Error("The official timetable response was empty.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function resolveSelection() {
  const saved = (() => {
    try { return JSON.parse(storageGet(SELECTION_KEY) || "null"); } catch { return null; }
  })();
  const candidates = [
    state.profile.section,
    saved?.group,
    saved?.branchSelections?.[groupBranchCode(saved?.group)]?.group,
    storageGet(LEGACY_GROUP_KEY),
    new URLSearchParams(location.search).get("section")
  ].filter(Boolean);
  state.group = candidates.find((value) => state.groups.includes(value)) || preferredGroup(state.groups);
  const subgroups = subgroupsFor(state.group);
  const branchSaved = saved?.branchSelections?.[groupBranchCode(state.group)];
  const subgroupCandidates = [state.profile.subsection, saved?.group === state.group ? saved?.subgroup : "", branchSaved?.group === state.group ? branchSaved?.subgroup : "", storageGet(LEGACY_SUBGROUP_KEY)].filter(Boolean);
  state.subgroup = subgroupCandidates.find((value) => subgroups.includes(value)) || "";
  persistSelection();
}

function persistSelection() {
  let saved = {};
  try { saved = JSON.parse(storageGet(SELECTION_KEY) || "{}") || {}; } catch { saved = {}; }
  const branchSelections = saved.branchSelections && typeof saved.branchSelections === "object" ? saved.branchSelections : {};
  const branch = groupBranchCode(state.group);
  if (branch && state.group) branchSelections[branch] = { group: state.group, subgroup: state.subgroup || "" };
  storageSet(SELECTION_KEY, JSON.stringify({ group: state.group, subgroup: state.subgroup, branchSelections }));
}

function applySchedule(schedule, roomSchedule, metadata, subgroupSchedule = [], { fromCache = false } = {}) {
  state.schedule = Array.isArray(schedule) ? schedule : [];
  state.roomSchedule = Array.isArray(roomSchedule) ? roomSchedule : [];
  state.subgroupSchedule = Array.isArray(subgroupSchedule) ? subgroupSchedule : [];
  state.groups = [...new Set(state.schedule.map((entry) => entry.group))].sort((a, b) => a.localeCompare(b));
  state.metadata = metadata || state.metadata;
  state.dataStatus = fromCache ? "cached" : "ready";
  resolveSelection();
  refreshAcademicOverlay();
}

async function loadSnapshots() {
  try {
    state.snapshots = await listSnapshots();
    return state.snapshots;
  } catch {
    state.snapshots = [];
    return [];
  }
}

async function loadCachedData() {
  const snapshots = await loadSnapshots();
  if (!snapshots.length) return false;
  const latest = await getSnapshot(snapshots[0].id);
  if (!latest?.schedule?.length) return false;
  applySchedule(latest.schedule, latest.roomSchedule, {
    version: latest.version,
    checkedAt: latest.checkedAt,
    source: "device snapshot"
  }, latest.subgroupSchedule || [], { fromCache: true });
  state.lastSync = latest.createdAt;
  return true;
}

function isTimetableDocument(text) {
  return /<table[\s>]/i.test(text) && /<td[\s>]/i.test(text);
}

async function fetchTimetableSource(source, bundledPath, timeout = 12000) {
  try {
    return { text: await fetchText(`/api/legacy/api/timetable?source=${source}`, timeout), bundled: false };
  } catch (error) {
    if (!bundledPath) throw error;
    const text = await fetchText(bundledPath, timeout);
    if (!isTimetableDocument(text)) throw new Error(`The bundled ${source} timetable is not available.`);
    return { text, bundled: true };
  }
}

async function loadLiveData({ manual = false } = {}) {
  if (manual) toast("Checking the official GNDEC sources…");
  state.dataStatus = state.dataStatus === "ready" ? "ready" : "loading";
  try {
    const [groups, rooms, subgroup] = await Promise.all([
      fetchTimetableSource("groups", "/data/timetable-groups.html"),
      fetchTimetableSource("rooms", "/data/timetable-rooms.html"),
      fetchTimetableSource("subgroups", "/data/timetable-subgroups.html", 10000).catch(() => ({ text: "", bundled: false }))
    ]);
    const schedule = readVerifiedFetTimetable(groups.text, "groups");
    const roomSchedule = readVerifiedFetTimetable(rooms.text, "rooms");
    // The academic-group overlay is optional. A missing or unreadable subgroup
    // document must never stop the verified section and room timetables loading.
    let subgroupSchedule = [];
    if (subgroup.text && isTimetableDocument(subgroup.text)) {
      try {
        subgroupSchedule = readVerifiedFetTimetable(subgroup.text, "subgroups");
      } catch {
        subgroupSchedule = [];
      }
    }
    const bundled = groups.bundled || rooms.bundled;
    const metadata = { ...(await loadSourceMetadata()), source: bundled ? "bundled verified release" : "official source" };
    state.dataFallback = bundled;
    applySchedule(schedule, roomSchedule, metadata, subgroupSchedule);
    state.lastSync = new Date().toISOString();
    const releaseKey = snapshotReleaseKey(metadata, schedule, roomSchedule, subgroupSchedule);
    await saveSnapshot({
      id: releaseKey,
      releaseKey,
      createdAt: state.lastSync,
      version: metadata?.version || "unknown",
      checkedAt: metadata?.checkedAt || "",
      groups: state.groups.length,
      schedule,
      roomSchedule,
      subgroupSchedule
    });
    await pruneSnapshots(v("data.snapshots"));
    state.snapshots = await listSnapshots();
    state.dataStatus = "ready";
    if (bundled) toast(`The official GNDEC source is unreachable. Showing the bundled verified ${metadata?.version || "published"} release.`);
    if (manual && !bundled) toast("Official timetable verified and refreshed.", "success");
    render();
    return true;
  } catch (error) {
    state.dataStatus = state.schedule.length ? "cached" : "error";
    if (manual) toast(error?.message || "Could not refresh the official timetable.", "error");
    render();
    return false;
  }
}

function snapshotReleaseKey(metadata, schedule, roomSchedule, subgroupSchedule) {
  const sourceRevision = (metadata?.sources || []).map((source) => `${source?.id || ""}:${source?.contentHash || source?.sourceFooter || ""}`).sort();
  const payload = JSON.stringify([metadata?.version || "unknown", sourceRevision, schedule, roomSchedule, subgroupSchedule]);
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) hash = Math.imul(hash ^ payload.charCodeAt(index), 16777619);
  return `release-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function loadSourceMetadata() {
  try {
    const data = await fetchJson("/api/legacy/api/sources", {}, 15000);
    return {
      version: data.version || "",
      checkedAt: data.checkedAt || "",
      updatedAt: data.updatedAt || "",
      sources: Array.isArray(data.sources) ? data.sources : []
    };
  } catch {
    return state.metadata;
  }
}

async function loadVersion() {
  try {
    const data = await fetchJson("/api/version", {}, 8000);
    state.version = data;
    if (data?.legacy?.url) state.legacyUrl = data.legacy.url;
    updateLegacyCards();
  } catch {
    state.version = null;
  }
}

async function loadDatesheet() {
  try {
    state.datesheet = await fetchJson("/api/legacy/data/end-sem-datesheet.json", {}, 20000);
  } catch {
    state.datesheet = null;
  }
}

async function loadNotices() {
  state.noticesStatus = "loading";
  try {
    const data = await fetchJson("/api/legacy/data/notices.json", {}, 12000);
    state.notices = Array.isArray(data?.value) ? data.value : Array.isArray(data) ? data : [];
    state.noticesStatus = "ready";
  } catch {
    state.notices = [];
    state.noticesStatus = "error";
  }
}

/* ── Live content: admin overlay + campus directory + papers ───────────── */

async function loadContent() {
  state.contentStatus = "loading";
  try {
    const data = await fetchJson("/api/content", {}, 12000);
    state.content = {
      notices: Array.isArray(data?.notices) ? data.notices : [],
      announcements: Array.isArray(data?.announcements) ? data.announcements : [],
      holidays: Array.isArray(data?.holidays) ? data.holidays : [],
      papers: Array.isArray(data?.papers) ? data.papers : [],
      syllabus: Array.isArray(data?.syllabus) ? data.syllabus : [],
      datesheets: Array.isArray(data?.datesheets) ? data.datesheets : [],
      links: Array.isArray(data?.links) ? data.links : [],
      configured: Boolean(data?.configured),
      meta: data?.meta || null
    };
    state.contentStatus = "ready";
  } catch {
    state.contentStatus = "error";
  }
}

async function loadCampus() {
  state.campusStatus = "loading";
  try {
    const data = await fetchJson("/api/legacy/data/campus.json", {}, 20000);
    state.campus = {
      notices: Array.isArray(data?.notices) ? data.notices : [],
      syllabus: Array.isArray(data?.syllabus) ? data.syllabus : [],
      departments: Array.isArray(data?.departments) ? data.departments : [],
      checkedAt: String(data?.checkedAt || "")
    };
    state.campusStatus = "ready";
  } catch {
    state.campusStatus = "error";
  }
}

async function loadPapers() {
  state.papersStatus = "loading";
  try {
    const data = await fetchJson("/data/papers-index.json", {}, 20000);
    state.papers = {
      records: Array.isArray(data?.papers) ? data.papers : [],
      loadedAt: String(data?.builtAt || ""),
      sources: Array.isArray(data?.sources) ? data.sources : []
    };
    state.papersStatus = "ready";
  } catch {
    state.papers = { records: [], loadedAt: "", sources: [] };
    state.papersStatus = "error";
  }
}

/** Every notice source, merged once per render. */
function allNotices() {
  const admin = [
    ...state.content.notices,
    ...publishedDatesheets().map((sheet) => ({
      title: sheet.title || "Date sheet",
      date: sheet.date || "",
      category: "Examination",
      author: sheet.department || "Admin",
      url: sheet.url || "",
      body: sheet.body || "",
      admin: true
    }))
  ];
  return mergeNotices({
    admin,
    transcribed: transcribedNotices(),
    campus: state.campus.notices,
    curated: state.notices
  });
}

function transcribedNotices() {
  return state.values["data.transcribedNotices"] === false ? [] : TRANSCRIBED_NOTICES;
}

function allSyllabus() {
  return buildSyllabusIndex([...state.campus.syllabus, ...state.content.syllabus]);
}

function allPapers() {
  return buildPaperIndex([...state.papers.records, ...state.content.papers]);
}

function holidayOverrides() {
  return [...state.content.holidays, ...state.content.datesheets.filter((item) => String(item.scope || "").toLowerCase() === "holiday")];
}

/** Admin-published date sheets, newest first. Holiday overrides stay in the calendar. */
function publishedDatesheets() {
  return state.content.datesheets
    .filter((item) => String(item.scope || "").toLowerCase() !== "holiday")
    .filter((item) => item.published !== false)
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.title || "").localeCompare(String(b.title || "")));
}

function activeAnnouncements() {
  const today = now().dateISO;
  return state.content.announcements.filter((item) => !item.expiresAt || item.expiresAt >= today);
}

async function ensureLiveContent() {
  const jobs = [];
  if (state.contentStatus === "idle") jobs.push(loadContent());
  if (state.campusStatus === "idle") jobs.push(loadCampus());
  if (state.noticesStatus === "idle") jobs.push(loadNotices());
  if (state.papersStatus === "idle") jobs.push(loadPapers());
  if (!jobs.length) return;
  await Promise.allSettled(jobs);
  if (["notices", "papers", "syllabus", "calendar", "today", "admin"].includes(state.route)) render();
}

/* ── Directory data (faculty, students, syllabus) ──────────────────────── */

function ensureDirectoryData() {
  const tab = state.directoryTab;
  const loaded = tab === "faculty" ? state.faculty.length > 0 : (tab === "students" || tab === "mentoring") ? state.students.length > 0 : Boolean(state.syllabus);
  if (loaded) {
    if (state.directoryStatus !== "ready") {
      state.directoryStatus = "ready";
      render();
    }
    return;
  }
  if (state.directoryStatus !== "idle") return;
  if (tab === "faculty") loadFaculty();
  else if (tab === "students" || tab === "mentoring") loadStudents();
  else loadSyllabusIndex();
}

async function loadFaculty() {
  state.directoryStatus = "loading";
  render();
  try {
    let records = [];
    try {
      const data = await fetchJson("/api/legacy/data/faculty-directory-index.json", {}, 20000);
      records = Array.isArray(data?.records) ? data.records : [];
    } catch { /* fall back to the smaller live endpoint */ }
    if (!records.length) {
      const data = await fetchJson("/api/legacy/api/faculty", {}, 20000);
      records = Array.isArray(data?.records) ? data.records : [];
    }
    state.faculty = records.filter((record) => record && record.name);
    state.directoryStatus = "ready";
  } catch {
    state.faculty = [];
    state.directoryStatus = "error";
  }
  if (state.route === "directory" && state.directoryTab === "faculty") render();
}

async function loadStudents({ quiet = false } = {}) {
  state.directoryStatus = "loading";
  if (!quiet) render();
  try {
    const data = await fetchJson("/api/legacy/data/student-roster-index.json", {}, 25000);
    state.students = Array.isArray(data?.records) ? data.records : [];
    state.rosterGeneratedAt = String(data?.generatedAt || data?.schemaVersion || "");
    state.directoryStatus = "ready";
    syncProfileFromRoster({ silent: quiet || state.route !== "directory", renderOnChange: !quiet });
  } catch {
    state.students = [];
    state.directoryStatus = "error";
  }
  if (!quiet && state.route === "directory" && (state.directoryTab === "students" || state.directoryTab === "mentoring")) render();
}

function rosterIdentity() {
  const crn = String(state.profile?.crn || "").replace(/\D/g, "");
  const registration = String(state.profile?.registrationNo || "").replace(/\D/g, "");
  const serial = String(state.profile?.serialNo || "").replace(/\D/g, "");
  return { crn, registration, serial };
}

/** Use exact identifiers first; a name auto-fills only when it is an exact unique match. */
function rosterRecordForProfile() {
  return matchProfileRecord(state.students, state.profile);
}

async function lookupProfileFromSettings() {
  const query = $("[data-profile-lookup-query]")?.value.trim() || "";
  state.profileLookupQuery = query;
  state.profileLookupMatches = [];
  if (query.length < 2) {
    state.profileLookupMessage = "Type at least 2 characters to see roster suggestions.";
    render();
    return;
  }
  if (!state.students.length) {
    state.profileLookupMessage = "Checking the published student roster…";
    render();
    await loadStudents({ quiet: true });
  }
  if (!state.students.length) {
    state.profileLookupMessage = "The published roster could not be loaded. Your saved profile was not changed.";
    render();
    return;
  }
  const matches = findProfileRosterMatches(state.students, query);
  if (!matches.length) {
    state.profileLookupMessage = "No match in the currently published roster. Check the spelling or CRN; your profile was not changed.";
  } else if (matches.length === 1) {
    applyRosterRecordToProfile(matches[0]);
    state.profileLookupQuery = matches[0].name || query;
    state.profileLookupMessage = "Profile matched to the published roster. Review the section and subgroup below.";
  } else {
    state.profileLookupMatches = matches;
    state.profileLookupMessage = `${matches.length} possible matches. Choose your record to fill your profile.`;
  }
  render();
}

function renderProfileLookupResults() {
  const root = $("[data-profile-lookup-results]");
  if (!root) return;
  root.innerHTML = `${state.profileLookupMessage ? `<p class="profile-lookup-message" role="status">${escapeHtml(state.profileLookupMessage)}</p>` : ""}${state.profileLookupMatches.length ? `<div class="profile-match-list" aria-label="Choose your matching student profile">${state.profileLookupMatches.map((record, index) => `<button class="profile-match" data-action="choose-profile-match" data-profile-index="${index}"><strong>${escapeHtml(record.name || "Student")}</strong><span>${escapeHtml([record.branch, record.section, record.subsection].filter(Boolean).join(" · "))}</span><small>CRN ${escapeHtml(record.crn || "not published")}</small></button>`).join("")}</div>` : ""}`;
}

function queueProfileSuggestions(query) {
  state.profileLookupQuery = String(query || "").trim();
  state.profileLookupMatches = [];
  clearTimeout(state.profileLookupTimer);
  const currentQuery = state.profileLookupQuery;
  if (currentQuery.length < 2) {
    state.profileLookupMessage = "Start typing your name, CRN, registration number, or serial number.";
    renderProfileLookupResults();
    return;
  }
  state.profileLookupMessage = "Searching the published roster on this device…";
  renderProfileLookupResults();
  state.profileLookupTimer = setTimeout(async () => {
    if (!state.students.length) await loadStudents({ quiet: true });
    const input = $("[data-profile-lookup-query]");
    if (!input || input.value.trim() !== currentQuery) return;
    if (!state.students.length) {
      state.profileLookupMessage = "The published roster could not be loaded. You can retry with Find my profile.";
      renderProfileLookupResults();
      return;
    }
    state.profileLookupMatches = findProfileRosterMatches(state.students, currentQuery);
    state.profileLookupMessage = state.profileLookupMatches.length
      ? "Choose your name from the suggestions to fill your profile."
      : "No suggestions yet. Try another name or enter your full CRN.";
    renderProfileLookupResults();
  }, 180);
}

function applyRosterRecordToProfile(record) {
  if (!record) return false;
  state.profile = saveProfile(localStorage, {
    ...state.profile,
    name: record.name || "",
    crn: record.crn || "",
    registrationNo: record.registrationNo || "",
    serialNo: record.currentSerialNo || record.serialNo || "",
    branch: record.branch || "",
    section: record.section || state.profile.section,
    subsection: record.subsection || "",
    mentor: record.mentor || "",
    mentorPhone: record.mentorPhone || "",
    academicGroup: record.academicGroup || "",
    mentorVenue: record.mentorVenue || record.venue || "",
    rosterVersion: state.rosterGeneratedAt || "published"
  }) || state.profile;
  if (state.profile.section && state.groups.includes(state.profile.section)) {
    state.group = state.profile.section;
    state.subgroup = subgroupsFor(state.group).includes(state.profile.subsection) ? state.profile.subsection : "";
    persistSelection();
  }
  refreshAcademicOverlay();
  return true;
}

/**
 * Mirrors the legacy profile refresh: the published roster is the authority for
 * section, sub-group, mentor and mentoring group once CRN/registration matches.
 * A name-only profile is never guessed; a manual profile is left untouched.
 */
function syncProfileFromRoster({ silent = true, renderOnChange = true } = {}) {
  if (!state.students.length) return false;
  const record = rosterRecordForProfile();
  if (!record) return false;
  const version = state.rosterGeneratedAt || "published";
  const next = {
    ...state.profile,
    name: record.name || state.profile.name,
    crn: record.crn || state.profile.crn,
    registrationNo: record.registrationNo || state.profile.registrationNo,
    serialNo: record.currentSerialNo || record.serialNo || state.profile.serialNo,
    branch: record.branch || state.profile.branch,
    section: record.section || state.profile.section,
    subsection: record.subsection || state.profile.subsection,
    mentor: record.mentor || state.profile.mentor,
    mentorPhone: record.mentorPhone || state.profile.mentorPhone,
    academicGroup: record.academicGroup || state.profile.academicGroup,
    mentorVenue: record.mentorVenue || record.venue || state.profile.mentorVenue,
    rosterVersion: version
  };
  const changed = Object.keys(next).some((key) => String(next[key] ?? "") !== String(state.profile?.[key] ?? ""));
  const saved = saveProfile(localStorage, next);
  if (!saved) return false;
  state.profile = saved;
  if (saved.section && state.groups.includes(saved.section)) {
    state.group = saved.section;
    state.subgroup = subgroupsFor(saved.section).includes(saved.subsection) ? saved.subsection : "";
    persistSelection();
  }
  refreshAcademicOverlay();
  if (changed && !silent) toast(`Profile verified against the current official roster: ${saved.name || saved.crn}.`, "success");
  if (changed && renderOnChange) render();
  return changed;
}

async function loadSyllabusIndex() {
  state.directoryStatus = "loading";
  render();
  try {
    const data = await fetchJson("/api/legacy/data/first-year-syllabus-index.json", {}, 25000);
    state.syllabus = data && Array.isArray(data.pages) ? data : null;
    state.directoryStatus = state.syllabus ? "ready" : "error";
  } catch {
    state.syllabus = null;
    state.directoryStatus = "error";
  }
  if (state.route === "directory" && state.directoryTab === "syllabus") render();
}

/* ── Calendar / exam helpers ───────────────────────────────────────────── */

function nextExam() {
  return nextUpcomingExam(importantExamEvents(), now());
}

function examsForDate(dateISO) {
  return examsOnDate(importantExamEvents(), dateISO);
}

function importantExamEvents() {
  return examEventsForSelection({ datesheet: state.datesheet, group: state.group }).filter((exam) => {
    const label = `${exam.category || ""} ${exam.title || ""}`.toLowerCase();
    if (/workshop|practical|lab/.test(label)) return false;
    return /\bmse\b|end[- ]?sem(?:ester)?|\bfinal\b|\btentative\b|\bese\b/.test(label);
  });
}

function nextClassInfo() {
  const clock = now();
  const classes = classesForDay(clock.day);
  const current = classes.find((entry) => entry.start <= clock.minutes && clock.minutes < entry.end) || null;
  const next = classes.find((entry) => entry.start > clock.minutes) || null;
  if (current) return { kind: "current", entry: current, clock };
  if (next) return { kind: "next", entry: next, clock };
  // Match the legacy app's five PM look-ahead: keep today's plan selected
  // until 17:00 when today has a timetable, then move the dashboard forward.
  if (classes.length && !shouldLookAheadAtFive(clock.minutes, true)) return { kind: "none", clock };
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addDays(clock, offset);
    if (!STUDY_DAYS.includes(candidate.day)) continue;
    const future = classesForDay(candidate.day);
    if (future.length) return { kind: "later", entry: future[0], clock, day: candidate };
  }
  return { kind: "none", clock };
}

/* ── Rendering: shell + shared ─────────────────────────────────────────── */

const ROUTES = {
  today: { title: "Today", eyebrow: "Verified college data" },
  timetable: { title: "Timetable", eyebrow: "Official weekly pattern" },
  rooms: { title: "Rooms", eyebrow: "Published room timetable" },
  teachers: { title: "Teachers", eyebrow: "Faculty-wise timetable" },
  ask: { title: "Ask Compass", eyebrow: "Deterministic, never guesses" },
  notices: { title: "Notices", eyebrow: "Official college updates" },
  papers: { title: "Papers", eyebrow: "Official subject question banks" },
  syllabus: { title: "Syllabus", eyebrow: "Published department documents" },
  calendar: { title: "Calendar", eyebrow: "Academic periods and holidays" },
  directory: { title: "Directory", eyebrow: "Faculty, students and syllabus" },
  compare: { title: "Compare", eyebrow: "Two sections, side by side" },
  settings: { title: "Settings", eyebrow: "Controls, data and rollback" },
  admin: { title: "Admin", eyebrow: "Publish to Compass" }
};

function parseRoute() {
  const resolved = routeFromPath(location.pathname, location.hash);
  const raw = String(location.hash || "").replace(/^#\/?/, "");
  const [, category] = raw.split("/");
  if (resolved.route === "settings" && category) state.settingsCategory = CATEGORIES.some((item) => item.id === category) ? category : state.settingsCategory;
  // A legacy hash route always wins over the path so old links keep working.
  if (ROUTES[resolved.route]) return resolved.route;
  return v("nav.landing") || "today";
}

/** Clean path navigation on the web, hash navigation for file:// previews. */
function supportsPathRouting() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function navigate(route, { replace = false } = {}) {
  const target = ROUTES[route] ? route : "today";
  const path = `/${target}`;
  const usingPath = supportsPathRouting() && location.pathname !== "/index.html";
  if (usingPath) {
    if (location.pathname === path && !location.hash) {
      state.route = target;
      render();
      return;
    }
    if (replace) history.replaceState({ route: target }, "", path);
    else history.pushState({ route: target }, "", path);
    state.route = target;
    render();
    return;
  }
  const hash = `#/${target}`;
  if (location.hash === hash) {
    state.route = target;
    render();
    return;
  }
  if (replace) history.replaceState({ route: target }, "", hash);
  else location.hash = hash;
}

/**
 * Keep the document head in sync after client-side navigation. The Worker
 * already injects the same tags for a cold crawler request; this keeps the
 * title, canonical and JSON-LD correct for share sheets and history.
 */
function syncSeoHead() {
  if (typeof document === "undefined") return;
  const route = ROUTES[state.route] ? state.route : "today";
  const section = route === "timetable" ? state.group || "" : "";
  const origin = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)
    ? location.origin
    : undefined;
  const tags = headTags({ origin, route, section, query: new URLSearchParams(location.search).get("q") || "" });
  const head = document.head;
  if (!head) return;
  const start = [...head.childNodes].find((node) => node.nodeType === 8 && node.data === "COMPASS_SEO");
  const end = [...head.childNodes].find((node) => node.nodeType === 8 && node.data === "/COMPASS_SEO");
  if (start && end) {
    let node = start.nextSibling;
    while (node && node !== end) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
    const template = document.createElement("template");
    template.innerHTML = tags;
    [...template.content.childNodes].forEach((child) => head.insertBefore(child, end));
    return;
  }
  document.title = SEO_ROUTES[route]?.title || document.title;
  const description = head.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", SEO_ROUTES[route]?.description || "");
}

function updateChrome() {
  const meta = ROUTES[state.route] || ROUTES.today;
  $("#topbar-title").textContent = meta.title;
  $("#topbar-eyebrow").textContent = meta.eyebrow;
  document.title = `${meta.title} · GNDEC Compass`;
  $$(".nav-item, .bottom-item").forEach((item) => {
    const active = item.dataset.route === state.route;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  const initials = (state.profile.name || "G").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "G";
  $("#avatar-initials").textContent = initials;
  $("#build-line").textContent = `v${state.version?.app?.version || APP_VERSION} · ${state.version?.app?.channel || "stable"}`;
  $("#build-line").hidden = !v("experience.showBuildChannel") && state.route !== "settings";
  syncSeoHead();
}

function render() {
  state.route = parseRoute();
  updateChrome();
  const view = $("#view");
  if (!view) return;
  const skeleton = $("#boot-skeleton");
  if (skeleton) skeleton.remove();
  let html = "";
  switch (state.route) {
    case "timetable": html = renderTimetable(); break;
    case "rooms": html = renderRooms(); break;
    case "teachers": html = renderTeachers(); break;
    case "ask": html = renderAsk(); break;
    case "notices": html = renderNotices(); break;
    case "papers": html = renderPapers(); break;
    case "syllabus": html = renderSyllabus(); break;
    case "calendar": html = renderCalendar(); break;
    case "directory": html = renderDirectory(); break;
    case "compare": html = renderCompare(); break;
    case "settings": html = renderSettings(); break;
    case "admin": html = renderAdmin(); break;
    default: html = renderToday();
  }
  view.innerHTML = html;
  ensureRouteData();
  state.renderedAt = Date.now();
  if (state.route === "ask") {
    renderChatMessages();
    const input = $("#question-input");
    const prefill = new URLSearchParams(location.search).get("q");
    if (input && prefill && !input.value) input.value = prefill.slice(0, 500);
    if (input && window.matchMedia?.("(min-width: 981px)").matches) input.focus({ preventScroll: true });
  }
  if (state.route === "settings") refreshStorageSummary();
}

function ensureRouteData() {
  if (["notices", "papers", "syllabus", "calendar", "today", "admin"].includes(state.route)) {
    ensureLiveContent();
  }
  if (state.route === "admin" && state.adminToken && state.adminStatus === "idle") {
    state.adminStatus = "loading";
    adminLoad().catch(() => {});
  }
  if (state.route === "directory") ensureDirectoryData();
}

function dataChip() {
  if (state.dataStatus === "ready" && state.dataFallback) return `<span class="sync-dot is-stale" aria-hidden="true"></span> Bundled verified ${escapeHtml(state.metadata?.version || "release")}`;
  if (state.dataStatus === "ready") return `<span class="sync-dot" aria-hidden="true"></span> Verified ${escapeHtml(shortDate(state.metadata?.checkedAt || state.lastSync))}`;
  if (state.dataStatus === "cached") return `<span class="sync-dot is-stale" aria-hidden="true"></span> Cached release ${escapeHtml(state.metadata?.version || "")}`;
  if (state.dataStatus === "error") return `<span class="sync-dot is-offline" aria-hidden="true"></span> No verified data`;
  return `<span class="sync-dot is-stale" aria-hidden="true"></span> Loading official data…`;
}

function shortDate(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Short day + month for dense timelines, without a timezone shift. */
function dayMonth(value) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return String(value).slice(0, 10);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

/** Calendar-date only, without a timezone shift on a YYYY-MM-DD value. */
function dateOnly(value) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (match) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function emptyState(icon, title, text, action = "") {
  return `<div class="empty"><div class="empty-icon" aria-hidden="true">${icon}</div><p class="empty-title">${escapeHtml(title)}</p><p class="empty-text">${escapeHtml(text)}</p>${action ? `<p style="margin-top:14px">${action}</p>` : ""}</div>`;
}

function classCard(entry, clock = v("timetable.clock"), { highlight = false } = {}) {
  const tags = [];
  if (v("timetable.showCode") && entry.type) tags.push(`<span class="tag">${escapeHtml(entry.type === "L" ? "Lecture" : entry.type === "P" ? "Practical" : entry.type === "T" ? "Tutorial" : entry.type)}</span>`);
  const meta = [];
  if (v("timetable.showTeacher")) meta.push(escapeHtml(entry.teacher));
  if (v("timetable.showRoom")) meta.push(escapeHtml(entry.room));
  return `<article class="class-card${highlight ? " is-now" : ""}" data-subject ${subjectColor(entry.subject)}>
    <div class="class-time">${escapeHtml(humanTime(entry.start, clock))}<br />${escapeHtml(humanTime(entry.end, clock))}</div>
    <div class="class-body">
      <div class="class-subject">${escapeHtml(entry.subject)}</div>
      ${meta.length ? `<div class="class-meta">${meta.join(" · ")}</div>` : ""}
      ${tags.length ? `<div class="class-tags">${tags.join("")}</div>` : ""}
    </div>
  </article>`;
}

/* ── Today ─────────────────────────────────────────────────────────────── */

function renderToday() {
  const clock = now();
  const info = nextClassInfo();
  const exam = nextExam();
  const examAgenda = examsForDate(clock.dateISO);
  const free = computeFreeRooms({
    roomSchedule: state.roomSchedule,
    day: clock.day,
    minutes: clock.minutes,
    duration: 60,
    includeLabs: v("rooms.includeLabs"),
    includeLectureHalls: v("rooms.includeLectureHalls")
  });
  const today = classesForDay(clock.day);
  const lookAhead = info.kind === "later" && shouldLookAheadAtFive(clock.minutes, today.length > 0);
  const timelineDay = lookAhead ? info.day.day : clock.day;
  const timelineClasses = lookAhead ? classesForDay(timelineDay) : today;
  const greeting = clock.hour < 12 ? "Good morning" : clock.hour < 17 ? "Good afternoon" : "Good evening";
  const name = state.profile.name ? `, ${state.profile.name.split(/\s+/)[0]}` : "";
  const hero = renderHero(info, clock, greeting + name);
  const freeRooms = v("today.freeRoomsCard") ? renderFreeRoomsCard(free, clock) : "";
  const timelineClock = lookAhead ? { ...clock, day: timelineDay, minutes: 0 } : clock;
  const timeline = v("today.hero") === "timeline" ? "" : examAgenda.length
    ? renderExamDayCard(examAgenda, clock.dateISO)
    : renderTodayTimeline(timelineClasses, timelineClock, { lookAhead });
  const notices = v("today.noticesCard") ? renderNoticesCard() : "";
  const examCard = v("today.examCountdown") && exam ? renderExamCard(exam) : "";
  const announcements = v("today.noticesCard") ? activeAnnouncements() : [];
  const holiday = v("today.holidayBanner") ? holidayOn(clock.dateISO, holidayOverrides()) : null;

  return `<div class="page page-today">
    ${hero}
    ${holiday ? `<div class="announcement ${holiday.type === "working" ? "is-warning" : "is-info"}"><strong>${escapeHtml(holiday.type === "working" ? "Working day" : holiday.type === "restricted" ? "Restricted holiday" : holiday.type === "half-day" ? "Half day" : "Holiday")} · ${escapeHtml(dateOnly(holiday.date))}</strong><p>${escapeHtml(holiday.name)}${holiday.overridden ? " · admin-confirmed override" : " · from the official GNDEC holiday list"}</p></div>` : ""}
    ${announcements.length ? `<section class="announcement-stack">${announcements.map((item) => `<div class="announcement is-${escapeHtml(item.level)}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div>`).join("")}</section>` : ""}
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Classes today</div><div class="stat-value">${today.length}</div><div class="stat-sub">${escapeHtml(clock.day)}</div></div>
      <div class="stat"><div class="stat-label">Free rooms now</div><div class="stat-value">${free.error ? "—" : free.rooms.length}</div><div class="stat-sub">${free.error ? "Room data loading" : `for the next hour`}</div></div>
      <div class="stat"><div class="stat-label">Next exam</div><div class="stat-value">${exam ? escapeHtml(shortExamDate(exam.date)) : "—"}</div><div class="stat-sub">${exam ? escapeHtml(exam.subject) : "No published date"}</div></div>
    </div>
    <div class="dashboard-grid">
      <div class="stack">
        ${timeline}
        ${examCard}
        ${notices}
      </div>
      <div class="stack">
        ${freeRooms}
        ${v("today.quickAsk") ? renderQuickAsk() : ""}
      </div>
    </div>
  </div>`;
}

function renderHero(info, clock, greeting) {
  if (v("today.hero") === "minimal") {
    return `<section class="hero-card">
      <div class="hero-top"><span class="hero-eyebrow">${escapeHtml(greeting)}</span><span class="badge">${escapeHtml(clock.date)}</span></div>
      <h2 class="hero-title">${escapeHtml(selectionLabel())}</h2>
      <p class="hero-meta">${todaySummary(info)}</p>
      <div class="hero-actions">${heroActions()}</div>
      <div class="hero-side">${dataChip()}</div>
    </section>`;
  }
  if (v("today.hero") === "timeline") {
    return `<section class="hero-card">
      <div class="hero-top"><span class="hero-eyebrow">${escapeHtml(greeting)}</span><span class="badge">${escapeHtml(clock.date)}</span></div>
      <h2 class="hero-title">${escapeHtml(selectionLabel())}</h2>
      <p class="hero-meta">${todaySummary(info)}</p>
      <div class="hero-actions">${heroActions()}</div>
      <div class="hero-side">${dataChip()}</div>
    </section>`;
  }
  if (!state.schedule.length) {
    return `<section class="hero-card">
      <div class="hero-top"><span class="hero-eyebrow">${escapeHtml(greeting)}</span></div>
      <h2 class="hero-title">Loading your verified timetable…</h2>
      <p class="hero-meta">Compass is reading the official GNDEC release. It will never show a guessed class.</p>
      <div class="hero-actions"><button class="btn" data-action="refresh-data">Check now</button><button class="btn btn-ghost" data-route="settings">Open settings</button></div>
      <div class="hero-side">${dataChip()}</div>
    </section>`;
  }

  let eyebrow = "Next class";
  let title = "";
  let meta = "";
  let actions = heroActions();
  if (info.kind === "current") {
    eyebrow = "In class now";
    title = info.entry.subject;
    meta = `${humanTime(info.entry.start, v("timetable.clock"))} – ${humanTime(info.entry.end, v("timetable.clock"))} · ${info.entry.room} · ${info.entry.teacher} · ends in ${formatDuration(info.entry.end - info.clock.minutes)}`;
  } else if (info.kind === "next") {
    const delta = info.entry.start - info.clock.minutes;
    eyebrow = delta <= 15 ? "Starting soon" : "Next class";
    title = info.entry.subject;
    meta = `${humanTime(info.entry.start, v("timetable.clock"))} – ${humanTime(info.entry.end, v("timetable.clock"))} · ${info.entry.room} · ${info.entry.teacher}`;
    if (v("today.leaveNow") && delta <= 25 && !/not listed/i.test(info.entry.room)) meta += ` · leave in ${formatDuration(delta)}`;
  } else if (info.kind === "later") {
    eyebrow = "No more classes today";
    title = `${info.entry.subject} on ${info.day.day}`;
    meta = `${humanTime(info.entry.start, v("timetable.clock"))} · ${info.entry.room} · ${info.entry.teacher}`;
  } else if (info.kind === "none") {
    eyebrow = "No more classes today";
    title = "Your schedule stays on today";
    meta = "Compass looks ahead to your next study day at 5:00 PM.";
  } else {
    eyebrow = "No classes published";
    title = "A clear day";
    meta = "No class is published for your section in the loaded release.";
  }
  if (v("today.leaveNow") && info.kind === "next" && info.entry.start - info.clock.minutes <= 25) {
    actions = `<button class="btn btn-primary" data-action="open-rooms">Find a room nearby</button>${actions}`;
  }
  return `<section class="hero-card">
    <div class="hero-top"><span class="hero-eyebrow">${escapeHtml(greeting)}</span><span class="badge badge-accent">${escapeHtml(eyebrow)}</span><span class="badge">${escapeHtml(clock.date)}</span></div>
    <h2 class="hero-title">${escapeHtml(title)}</h2>
    <p class="hero-meta">${escapeHtml(meta)}</p>
    <div class="hero-actions">${actions}</div>
    <div class="hero-side">${v("today.freshnessBadge") ? dataChip() : ""}<span>·</span><span>${escapeHtml(selectionLabel())}</span></div>
  </section>`;
}

function todaySummary(info) {
  if (info.kind === "current") return `You are in ${info.entry.subject} until ${humanTime(info.entry.end)}.`;
  if (info.kind === "next") return `${info.entry.subject} at ${humanTime(info.entry.start)} in ${info.entry.room}.`;
  if (info.kind === "later") return `Next published class is on ${info.day.day}.`;
  if (info.kind === "none") return "No more class is listed today. Compass looks ahead at 5:00 PM.";
  return "No class is published for your section today.";
}

function heroActions() {
  return `<button class="btn btn-primary" data-route="ask">Ask Compass</button>
    <button class="btn" data-route="timetable">Timetable</button>
    <button class="btn btn-ghost" data-route="rooms">Free rooms</button>`;
}

function renderTodayTimeline(classes, clock, { lookAhead = false } = {}) {
  const rows = [];
  const slots = classes.map((entry) => ({ ...entry, free: false }));
  if (v("timetable.showEmpty")) {
    const bells = [
      { start: 510, end: 570 }, { start: 570, end: 630 }, { start: 630, end: 690 }, { start: 690, end: 750 },
      { start: 750, end: 810 }, { start: 810, end: 870 }, { start: 870, end: 930 }, { start: 930, end: 980 }
    ];
    for (const bell of bells) {
      if (!classes.some((entry) => entry.start < bell.end && entry.end > bell.start)) slots.push({ ...bell, free: true, subject: "Free", id: `free-${bell.start}` });
    }
  }
  slots.sort((a, b) => a.start - b.start);
  const visible = slots.filter((entry) => entry.end > clock.minutes).slice(0, 8);
  const list = visible.length ? visible : slots.slice(0, 8);
  if (!list.length) return `<section class="card"><div class="card-head"><div><h2 class="card-title">Today</h2><p class="card-sub">No class published for ${escapeHtml(clock.day)}.</p></div></div>${emptyState("☕", "Nothing scheduled", "The official weekly timetable has no class for your section today.", `<button class="btn btn-sm" data-route="timetable">Open timetable</button>`)}</section>`;
  for (const entry of list) {
    const isNow = entry.start <= clock.minutes && clock.minutes < entry.end;
    rows.push(`<div class="timeline-item${isNow ? " is-now" : ""}${entry.free ? " is-free" : ""}">
      <div class="timeline-time">${escapeHtml(humanTime(entry.start, v("timetable.clock")))}</div>
      <span class="timeline-dot" aria-hidden="true"></span>
      <div class="timeline-body">
        <div class="timeline-subject">${escapeHtml(entry.subject)}</div>
        <div class="timeline-meta">${entry.free ? "Free slot" : `${escapeHtml(entry.room)} · ${escapeHtml(entry.teacher)}`}</div>
      </div>
    </div>`);
  }
  return `<section class="card">
    <div class="card-head"><div><h2 class="card-title">${lookAhead ? "Next study day" : "Today"} · ${escapeHtml(clock.day)}</h2><p class="card-sub">${classes.length} published class${classes.length === 1 ? "" : "es"} · ${escapeHtml(selectionLabel())}${lookAhead ? " · automatic look-ahead after 5:00 PM" : ""}</p></div><div class="card-actions"><button class="btn btn-sm" data-route="timetable">Full view</button></div></div>
    <div class="timeline">${rows.join("")}</div>
  </section>`;
}

function renderFreeRoomsCard(result, clock) {
  if (result.error) {
    return `<section class="card"><div class="card-head"><div><h2 class="card-title">Free rooms</h2><p class="card-sub">${escapeHtml(result.error)}</p></div></div>${emptyState("🚪", "Room data not ready", "Compass needs the official room timetable before it can show free rooms.", `<button class="btn btn-sm" data-route="rooms">Open rooms</button>`)}</section>`;
  }
  const top = result.rooms.slice(0, 6);
  return `<section class="card">
    <div class="card-head"><div><h2 class="card-title">Free rooms right now</h2><p class="card-sub">${result.rooms.length} published room${result.rooms.length === 1 ? "" : "s"} free for the next hour</p></div><div class="card-actions"><button class="btn btn-sm" data-route="rooms">All rooms</button></div></div>
    ${top.length ? `<div class="room-grid">${top.map((item) => `<article class="room-card"><div class="room-name">${escapeHtml(item.room)}</div><div class="room-zone">${escapeHtml(item.zone)}</div><div class="room-free">${escapeHtml(formatFreeWindow(item, v("timetable.clock")))}</div></article>`).join("")}</div>` : emptyState("⌛", "All rooms are busy", `Every published room has a class at ${humanTime(clock.minutes)}.`)}
  </section>`;
}

function renderExamCard(exam) {
  const action = exam.sourceUrl
    ? `<a class="btn btn-sm" href="${escapeHtml(exam.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open date sheet</a>`
    : `<button class="btn btn-sm" data-ask-question="Show my next exam date sheet">Ask Compass</button>`;
  return `<section class="card">
    <div class="card-head"><div><h2 class="card-title">Next published exam</h2><p class="card-sub">${escapeHtml(exam.category)} · ${escapeHtml(exam.sourceLabel || "published date sheet")}</p></div><div class="card-actions">${action}</div></div>
    <div class="timeline-item"><div class="timeline-time">${escapeHtml(shortExamDate(exam.date))}</div><span class="timeline-dot" aria-hidden="true"></span><div class="timeline-body"><div class="timeline-subject">${escapeHtml(exam.title)}</div><div class="timeline-meta">${escapeHtml(exam.tab || exam.sourceNote || "")}${exam.sessionRaw ? ` · ${escapeHtml(exam.sessionRaw)}` : exam.start != null ? ` · ${escapeHtml(examTimeLabel(exam, humanTime))}` : ""}</div></div></div>
  </section>`;
}

function renderExamDayCard(exams, dateISO) {
  const sources = [...new Map(exams.filter((exam) => exam.sourceUrl).map((exam) => [exam.sourceUrl, exam])).values()];
  return `<section class="card exam-day-card">
    <div class="card-head"><div><h2 class="card-title">Today's exam date sheet</h2><p class="card-sub">${escapeHtml(shortExamDate(dateISO))} · ${escapeHtml(selectionLabel())} · use this published schedule for today</p></div><div class="card-actions">${sources.map((exam) => `<a class="btn btn-sm" href="${escapeHtml(exam.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(exam.category.includes("workshop") ? "Workshop sheet" : exam.category.includes("MSE") ? "MSE-II sheet" : "Official sheet")}</a>`).join("")}</div></div>
    <div class="timeline">${exams.map((exam) => `<div class="timeline-item"><div class="timeline-time">${escapeHtml(examTimeLabel(exam, humanTime))}</div><span class="timeline-dot" aria-hidden="true"></span><div class="timeline-body"><div class="timeline-subject">${escapeHtml(exam.title)}</div><div class="timeline-meta">${escapeHtml(exam.category)}${exam.tab ? ` · ${escapeHtml(exam.tab)}` : ""}${exam.sessionNote ? ` · ${escapeHtml(exam.sessionNote)}` : ""}</div></div></div>`).join("")}</div>
  </section>`;
}

function shortExamDate(iso) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
}

function renderNoticesCard() {
  const notices = allNotices().slice(0, 4);
  if (!notices.length) return "";
  return `<section class="card">
    <div class="card-head"><div><h2 class="card-title">Latest notices</h2><p class="card-sub">Official, transcribed and admin updates · newest first</p></div><div class="card-actions"><button class="btn btn-sm" data-route="notices">All notices</button></div></div>
    <div class="timeline">${notices.map((notice) => `<div class="timeline-item"><div class="timeline-time">${escapeHtml(dayMonth(notice.date))}</div><span class="timeline-dot" aria-hidden="true"></span><div class="timeline-body"><div class="timeline-subject">${notice.url ? `<a href="${escapeHtml(notice.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(notice.title)}</a>` : escapeHtml(notice.title)}</div><div class="timeline-meta">${escapeHtml(notice.category)}${notice.admin ? " · admin" : notice.transcribed ? " · transcribed" : " · official"}</div></div></div>`).join("")}</div>
  </section>`;
}

function renderQuickAsk() {
  const chips = suggestedQuestions().slice(0, 6);
  return `<section class="card">
    <div class="card-head"><div><h2 class="card-title">Ask Compass</h2><p class="card-sub">Verified answers from your active section and timetable.</p></div></div>
    <div class="chip-row">${chips.map((chip) => `<button class="chip" data-ask-question="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`).join("")}</div>
  </section>`;
}

function suggestedQuestions() {
  const info = nextClassInfo();
  const list = [];
  if (info.kind === "current") list.push("Where is my current class?");
  else list.push("What is my next class?");
  list.push("Which rooms are free now?");
  list.push("Show tomorrow's timetable");
  if (nextExam()) list.push("When is my next exam?");
  const subjects = [...new Set(classesForDay(now().day).map((entry) => entry.subject))].slice(0, 2);
  subjects.forEach((subject) => list.push(`When is ${subject}?`));
  list.push("Show latest notices");
  list.push("When is the next holiday?");
  if (subjects[0]) list.push(`Question bank for ${subjects[0]}`);
  return [...new Set(list)];
}

/* ── Timetable ─────────────────────────────────────────────────────────── */

function renderTimetable() {
  const clock = now();
  const days = v("timetable.showWeekends") ? [...STUDY_DAYS, "Saturday", "Sunday"] : STUDY_DAYS;
  if (!state.day || !days.includes(state.day)) state.day = days.includes(clock.day) ? clock.day : days[0];
  const view = v("timetable.view");
  const branches = timetableBranches();
  const activeBranch = groupBranchCode(state.group) || branches[0] || "";
  const sections = rankedGroups(state.groups.filter((group) => groupBranchCode(group) === activeBranch));
  const todayExamSittings = state.day === clock.day ? examsForDate(clock.dateISO) : [];
  const dayContent = view === "week" ? renderWeekGrid(clock)
    : view === "agenda" ? renderAgenda()
      : todayExamSittings.length ? renderExamDayCard(todayExamSittings, clock.dateISO)
        : renderDayView(state.day, clock);
  return `<div class="page page-timetable">
    <div class="page-head">
      <div class="page-head-text">
        <h2 class="page-title">Timetable</h2>
        <p class="page-sub">Official FET release${state.metadata?.version ? ` · ${escapeHtml(state.metadata.version)}` : ""}. Choose a section once; Today and Ask Compass follow it.</p>
      </div>
      <div class="page-actions">
        <select class="btn btn-sm" data-select-branch aria-label="Branch">${branches.map((branch) => `<option value="${escapeHtml(branch)}" ${branch === activeBranch ? "selected" : ""}>${escapeHtml(branchLabel(branch))}</option>`).join("")}</select>
        <select class="btn btn-sm" data-select-cohort aria-label="Section or subsection">
          <optgroup label="Sections">${sections.map((group) => `<option value="${escapeHtml(group)}|" ${group === state.group && !state.subgroup ? "selected" : ""}>${escapeHtml(sectionDisplay(group, activeBranch))} · whole section</option>`).join("")}</optgroup>
          ${sections.some((group) => subgroupsFor(group).length) ? `<optgroup label="Subsections">${sections.flatMap((group) => rankedSubgroups(group).map((subgroup) => `<option value="${escapeHtml(group)}|${escapeHtml(subgroup)}" ${group === state.group && subgroup === state.subgroup ? "selected" : ""}>${escapeHtml(subgroupDisplay(group, subgroup))}</option>`)).join("")}</optgroup>` : ""}
        </select>
      </div>
    </div>
    ${!state.schedule.length ? emptyState("▦", "Timetable not loaded", "Pull the verified official release to see your week.", `<button class="btn btn-primary" data-action="refresh-data">Load timetable</button>`) : `
    <div class="card" style="padding:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">
        <div class="segmented" role="tablist" aria-label="Timetable view">
          <button class="segment ${view === "day" ? "is-active" : ""}" data-action="tt-view" data-view="day" role="tab" aria-selected="${view === "day"}">Day</button>
          <button class="segment ${view === "week" ? "is-active" : ""}" data-action="tt-view" data-view="week" role="tab" aria-selected="${view === "week"}">Week</button>
          <button class="segment ${view === "agenda" ? "is-active" : ""}" data-action="tt-view" data-view="agenda" role="tab" aria-selected="${view === "agenda"}">Agenda</button>
        </div>
        <span class="badge badge-accent">${escapeHtml(selectionLabel())}</span>
      </div>
      <div class="day-tabs" style="margin-top:12px" role="tablist" aria-label="Day">
        ${days.map((day) => `<button class="day-tab ${day === state.day ? "is-active" : ""} ${day === clock.day ? "is-today" : ""}" data-action="tt-day" data-day="${day}" role="tab" aria-selected="${day === state.day}">${escapeHtml(day.slice(0, 3))}<small>${classesForDay(day).length} class${classesForDay(day).length === 1 ? "" : "es"}</small></button>`).join("")}
      </div>
      <div style="margin-top:14px">${dayContent}</div>
    </div>`}
  </div>`;
}

function renderDayView(day, clock) {
  const classes = classesForDay(day).slice().sort((a, b) => a.start - b.start || a.end - b.end);
  if (!classes.length) return emptyState("☕", `No class on ${day}`, "The official release has no class for this section on this day.", `<button class="btn btn-sm" data-route="rooms">Find a free room</button>`);
  const gaps = new Map(freeGapsBetweenClasses(classes).map((gap) => [gap.start, gap]));
  let blocks = classes.map((entry) => {
    const next = classes.find((candidate) => candidate.start > entry.start && candidate.start >= entry.end);
    const gap = next ? gaps.get(entry.end) : null;
    const card = classCard(entry, v("timetable.clock"), { highlight: v("timetable.highlightNow") && day === clock.day && entry.start <= clock.minutes && clock.minutes < entry.end });
    const breakCard = gap ? `<div class="schedule-gap" role="note"><span class="schedule-gap-mark" aria-hidden="true">·</span><span><strong>Break / free time</strong><small>${escapeHtml(humanTime(gap.start, v("timetable.clock")))} – ${escapeHtml(humanTime(gap.end, v("timetable.clock")))} · no class is listed</small></span></div>` : "";
    return `${card}${breakCard}`;
  }).join("");
  if (v("timetable.showEmpty")) {
    const bells = [
      { start: 510, end: 570 }, { start: 570, end: 630 }, { start: 630, end: 690 }, { start: 690, end: 750 },
      { start: 750, end: 810 }, { start: 810, end: 870 }, { start: 870, end: 930 }, { start: 930, end: 980 }
    ];
    const free = bells.filter((bell) => !classes.some((entry) => entry.start < bell.end && entry.end > bell.start));
    if (free.length) blocks += `<div class="card" style="margin-top:12px;padding:12px"><p class="card-sub">Free bell slots</p><div class="chip-row" style="margin-top:8px">${free.map((slot) => `<span class="chip">${escapeHtml(humanTime(slot.start, v("timetable.clock")))} – ${escapeHtml(humanTime(slot.end, v("timetable.clock")))}</span>`).join("")}</div></div>`;
  }
  return blocks;
}

function renderAgenda() {
  return STUDY_DAYS.map((day) => {
    const classes = classesForDay(day);
    if (!classes.length) return "";
    return `<div class="answer-day"><p><strong>${escapeHtml(day)}</strong> <span class="badge">${classes.length}</span></p>${classes.map((entry) => classCard(entry, v("timetable.clock"))).join("")}</div>`;
  }).join("") || emptyState("▦", "No classes published", "The official release has no class for this section.");
}

function renderWeekGrid(clock) {
  const days = v("timetable.showWeekends") ? [...STUDY_DAYS, "Saturday", "Sunday"] : STUDY_DAYS;
  const starts = [...new Set([510, 570, 630, 690, 750, 810, 870, 930, ...state.schedule.filter((entry) => entry.group === state.group).map((entry) => entry.start)])].sort((a, b) => a - b);
  const rows = starts.map((start) => {
    const end = start + 60;
    return `<tr><th scope="row">${escapeHtml(humanTime(start, v("timetable.clock")))}</th>${days.map((day) => {
      const dayClasses = classesForDay(day);
      const entries = dayClasses.filter((entry) => entry.start < end && entry.end > start);
      const betweenClasses = !entries.length && dayClasses.some((entry) => entry.end <= start) && dayClasses.some((entry) => entry.start >= end);
      const gap = betweenClasses ? `<div class="week-gap">Break / no class listed</div>` : "";
      return `<td>${entries.map((entry) => `<div class="week-slot"><strong>${escapeHtml(entry.subject)}</strong><span>${escapeHtml(entry.room)}</span></div>`).join("")}${gap}</td>`;
    }).join("")}</tr>`;
  }).join("");
  return `<div class="week-wrap"><table class="week-table"><caption class="visually-hidden">Weekly timetable for ${escapeHtml(selectionLabel())}</caption><thead><tr><th scope="col">Time</th>${days.map((day) => `<th scope="col">${escapeHtml(day)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ── Rooms ─────────────────────────────────────────────────────────────── */

function renderRooms() {
  const clock = now();
  if (!state.roomDay) state.roomDay = clock.day;
  const minutes = state.roomTime ? timeToMinutes(state.roomTime) : clock.minutes;
  const duration = Number(v("rooms.defaultDuration")) || 60;
  const result = computeFreeRooms({
    roomSchedule: state.roomSchedule,
    day: state.roomDay,
    minutes,
    duration,
    zone: state.roomZone,
    includeLabs: v("rooms.includeLabs"),
    includeLectureHalls: v("rooms.includeLectureHalls")
  });
  const groups = result.error ? [] : groupRooms(result.rooms.map((item) => item.room)).groups;
  const zoneOptions = ["", "F block", "G block", "S block", "A block", "Labs and named rooms", "Other published rooms"];
  return `<div class="page page-rooms">
    <div class="page-head">
      <div class="page-head-text">
        <h2 class="page-title">Free rooms</h2>
        <p class="page-sub">Computed from the official room timetable. “Free” means no published class overlaps the window.</p>
      </div>
      <div class="page-actions"><span class="badge">${escapeHtml(state.roomSchedule.length ? `${new Set(state.roomSchedule.map((entry) => entry.group)).size} published rooms` : "Room data loading")}</span></div>
    </div>
    <div class="card">
      <div class="rooms-toolbar">
        <div class="field"><label for="room-day">Day</label><select id="room-day" data-room-day>${STUDY_DAYS.map((day) => `<option value="${day}" ${day === state.roomDay ? "selected" : ""}>${day}</option>`).join("")}</select></div>
        <div class="field"><label for="room-time">From</label><input id="room-time" type="time" value="${escapeHtml(state.roomTime || `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`)}" data-room-time /></div>
        <div class="field"><label for="room-duration">For</label><select id="room-duration" data-room-duration>${[30, 60, 90, 120].map((value) => `<option value="${value}" ${String(duration) === String(value) ? "selected" : ""}>${formatDuration(value)}</option>`).join("")}</select></div>
        <button class="btn btn-sm" data-action="room-now">Now</button>
      </div>
      <div class="chip-row" style="margin-top:12px">
        ${zoneOptions.map((zone) => `<button class="chip ${state.roomZone === zone ? "is-active" : ""}" data-action="room-zone" data-zone="${escapeHtml(zone)}">${escapeHtml(zone || "All areas")}</button>`).join("")}
      </div>
      <p class="card-sub" style="margin-top:12px">${result.error ? escapeHtml(result.error) : `${result.rooms.length} free room${result.rooms.length === 1 ? "" : "s"} on ${escapeHtml(state.roomDay)} at ${escapeHtml(humanTime(minutes, v("timetable.clock")))} for ${escapeHtml(formatDuration(duration))}.`}</p>
    </div>
    ${result.error ? emptyState("🚪", "No verified availability", result.error, `<button class="btn btn-sm" data-action="refresh-data">Load room data</button>`) : groups.length ? `<div class="stack" style="margin-top:14px">${groups.map((group) => `<section class="card"><div class="card-head"><div><h2 class="card-title">${escapeHtml(group.label)}</h2><p class="card-sub">${group.count} free room${group.count === 1 ? "" : "s"}</p></div></div><div class="room-grid">${group.rooms.map((room) => {
      const item = result.rooms.find((entry) => entry.room === room);
      return `<article class="room-card"><div style="display:flex;align-items:flex-start"><div class="room-name">${escapeHtml(room)}</div></div><div class="room-zone">${escapeHtml(roomZone(room))}</div>${v("rooms.showFreeUntil") ? `<div class="room-free">${escapeHtml(formatFreeWindow(item, v("timetable.clock")))}</div>` : ""}${v("rooms.showNextClass") && item?.nextClass ? `<div class="room-next">Next: ${escapeHtml(item.nextClass.subject)} at ${escapeHtml(humanTime(item.nextClass.start, v("timetable.clock")))}</div>` : ""}</article>`;
    }).join("")}</div></section>`).join("")}</div>` : emptyState("✅", "No free room in this window", "Every published room in this area has a class. Try a shorter window or another area.")}
    ${v("rooms.heatmap") ? renderHeatmap() : ""}
  </div>`;
}

function timeToMinutes(value) {
  const [hours, mins] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

function renderHeatmap() {
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const rows = hours.map((hour) => {
    const result = computeFreeRooms({
      roomSchedule: state.roomSchedule, day: state.roomDay, minutes: hour * 60, duration: 60,
      includeLabs: v("rooms.includeLabs"), includeLectureHalls: v("rooms.includeLectureHalls")
    });
    const ratio = result.checked ? Math.round((result.rooms.length / result.checked) * 100) : 0;
    return `<div class="timeline-item"><div class="timeline-time">${escapeHtml(humanTime(hour * 60, v("timetable.clock")))}</div><span class="timeline-dot" aria-hidden="true"></span><div class="timeline-body"><div class="timeline-subject">${result.rooms.length} free</div><div class="timeline-meta">${ratio}% of published rooms</div></div></div>`;
  }).join("");
  return `<section class="card" style="margin-top:14px"><div class="card-head"><div><h2 class="card-title">Hour-by-room heatmap</h2><p class="card-sub">Free room counts per hour. Computed locally.</p></div></div><div class="timeline">${rows}</div></section>`;
}

/* ── Teachers ──────────────────────────────────────────────────────────── */

function teacherNames() {
  return [...new Set(state.schedule
    .map((entry) => String(entry?.teacher || "").trim())
    .filter((name) => name && !/not listed/i.test(name)))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function teacherEntries(name) {
  return state.schedule
    .filter((entry) => String(entry?.teacher || "").trim() === name)
    .sort((a, b) => STUDY_DAYS.indexOf(a.day) - STUDY_DAYS.indexOf(b.day) || a.start - b.start);
}

function renderTeachers() {
  const clock = now();
  if (state.teacherSelected && !state.schedule.some((entry) => entry.teacher === state.teacherSelected)) state.teacherSelected = "";
  const query = state.teacherQuery.trim().toLowerCase();
  const all = teacherNames();
  const matches = query ? all.filter((name) => name.toLowerCase().includes(query)) : all;
  const selected = state.teacherSelected;
  const entries = selected ? teacherEntries(selected) : [];
  const days = v("timetable.showWeekends") ? [...STUDY_DAYS, "Saturday", "Sunday"] : STUDY_DAYS;
  const dayRows = selected ? days.map((day) => {
    const dayEntries = entries.filter((entry) => entry.day === day);
    if (!dayEntries.length) return "";
    return `<section class="card" style="margin-top:12px"><div class="card-head"><div><h2 class="card-title">${escapeHtml(day)}</h2><p class="card-sub">${dayEntries.length} published class${dayEntries.length === 1 ? "" : "es"}</p></div></div>${dayEntries.map((entry) => `<div class="answer-class"><div class="answer-class-time">${escapeHtml(humanTime(entry.start, v("timetable.clock")))} – ${escapeHtml(humanTime(entry.end, v("timetable.clock")))}</div><div class="answer-class-body"><strong>${escapeHtml(entry.subject)}</strong><div class="answer-class-meta">${escapeHtml(entry.group)} · ${escapeHtml(entry.room || "Room not listed")}</div></div></div>`).join("")}</section>`;
  }).join("") : "";
  return `<div class="page page-teachers">
    <div class="page-head">
      <div class="page-head-text">
        <h2 class="page-title">Teacher timetable</h2>
        <p class="page-sub">Every teacher printed in the official FET release, with their published classes across all sections. No teacher, subject or room is invented.</p>
      </div>
      <div class="page-actions"><span class="badge">${escapeHtml(state.schedule.length ? `${all.length} published teachers` : "Timetable loading")}</span></div>
    </div>
    <div class="card">
      <div class="field"><label for="teacher-search">Search a teacher</label><input id="teacher-search" type="search" value="${escapeHtml(state.teacherQuery)}" placeholder="Type a teacher name, e.g. Sharma…" data-teacher-search autocomplete="off" /></div>
      <p class="card-sub" style="margin-top:8px">${query ? `${matches.length} of ${all.length} teachers match “${escapeHtml(state.teacherQuery)}”.` : "Choose a teacher to open their full weekly timetable."}</p>
    </div>
    ${selected ? `<div class="card" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h2 class="card-title">${escapeHtml(selected)}</h2><p class="card-sub">${entries.length} published class${entries.length === 1 ? "" : "es"} across ${new Set(entries.map((entry) => entry.group)).size} section${new Set(entries.map((entry) => entry.group)).size === 1 ? "" : "s"}</p></div><button class="btn btn-sm btn-ghost" data-action="clear-teacher">Clear</button></div>${dayRows || emptyState("▦", "No classes published", "The official release has no class for this teacher.")}` : ""}
    ${!selected && !state.schedule.length ? emptyState("▦", "Timetable not loaded", "Pull the verified official release to see teacher timetables.", `<button class="btn btn-primary" data-action="refresh-data">Load timetable</button>`) : ""}
    ${!selected && state.schedule.length ? (matches.length ? `<div class="directory-grid" style="margin-top:14px">${matches.slice(0, 120).map((name) => {
      const count = teacherEntries(name).length;
      return `<button class="card directory-card" data-teacher="${escapeHtml(name)}" style="text-align:left"><div class="directory-card-head"><span class="directory-initials" aria-hidden="true">${escapeHtml(name.replace(/^(?:DR|ER|MS|MR|MRS|PROF)\.?\s+/i, "").split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span><div><h3 class="directory-name">${escapeHtml(name)}</h3><p class="directory-meta">${count} published class${count === 1 ? "" : "es"}</p></div></div></button>`;
    }).join("")}</div>${matches.length > 120 ? `<p class="card-sub" style="margin-top:10px">Showing the first 120 teachers. Narrow the search to see more.</p>` : ""}` : emptyState("🔎", "No matching teacher", `No published teacher name contains “${escapeHtml(state.teacherQuery)}”.`)) : ""}
  </div>`;
}

/* ── Notices ───────────────────────────────────────────────────────────── */

function noticeCard(notice, { dense = false } = {}) {
  const fresh = isRecent(notice.date, now().dateISO, 14);
  const sourceLabel = notice.admin ? "Compass admin" : notice.transcribed ? "Transcribed" : "Official";
  const href = notice.url || "";
  const title = href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(notice.title)}</a>`
    : escapeHtml(notice.title);
  const body = notice.body
    ? `<p class="notice-body">${escapeHtml(notice.body.slice(0, dense ? 180 : 420))}${notice.body.length > (dense ? 180 : 420) ? "…" : ""}</p>`
    : "";
  return `<article class="notice-card${notice.pinned ? " is-pinned" : ""}">
    <div class="notice-top">
      <span class="badge">${escapeHtml(notice.category)}</span>
      ${fresh ? `<span class="badge badge-warn">New</span>` : ""}
      ${notice.pinned ? `<span class="badge">Pinned</span>` : ""}
      <span class="notice-source">${escapeHtml(sourceLabel)}</span>
    </div>
    <h3 class="notice-title">${title}</h3>
    <p class="notice-meta">${notice.date ? `<time datetime="${escapeHtml(notice.date)}">${escapeHtml(dateOnly(notice.date))}</time>` : "Undated"}${notice.author ? ` · ${escapeHtml(notice.author)}` : ""}</p>
    ${body}
    ${notice.attachments?.length ? `<div class="chip-row">${notice.attachments.map((file) => `<a class="chip" href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(file.label)}</a>`).join("")}</div>` : ""}
  </article>`;
}

function renderNotices() {
  const list = allNotices();
  const stats = noticeStats(list, now().dateISO);
  const filtered = filterNotices(list, { query: state.noticeQuery, category: state.noticeCategory });
  const announcements = activeAnnouncements();
  const nextHoliday = upcomingHolidays(now().dateISO, { overrides: holidayOverrides(), limit: 1 })[0] || null;
  const categories = NOTICE_CATEGORIES.filter((name) => stats.byCategory[name]);
  return `<div class="page page-notices">
    <div class="page-head">
      <div class="page-head-text">
        <h2 class="page-title">Notices and updates</h2>
        <p class="page-sub">Official college notices, transcribed exam sheets and admin updates. Compass links the source and never rewrites a notice.</p>
      </div>
      <div class="page-actions">
        <span class="badge">${stats.total} published</span>
        ${stats.fresh ? `<span class="badge badge-warn">${stats.fresh} new</span>` : ""}
        <a class="btn btn-sm" href="/calendar">Calendar</a>
      </div>
    </div>
    ${announcements.length ? `<section class="announcement-stack">${announcements.map((item) => `<div class="announcement is-${escapeHtml(item.level)}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div>`).join("")}</section>` : ""}
    ${nextHoliday ? `<section class="card calendar-teaser"><div class="card-head"><div><h2 class="card-title">Next published holiday</h2><p class="card-sub">${escapeHtml(nextHoliday.name)}</p></div><strong class="teaser-date">${escapeHtml(dateOnly(nextHoliday.date))} · ${escapeHtml(dayOfWeek(nextHoliday.date))}</strong></div></section>` : ""}
    <div class="filter-bar">
      <input type="search" value="${escapeHtml(state.noticeQuery)}" placeholder="Search notices, subjects, dates…" data-notice-search aria-label="Search notices" />
      <div class="chip-row" role="group" aria-label="Filter by category">
        <button class="chip chip-button ${state.noticeCategory ? "" : "is-active"}" data-action="notice-category" data-category="">All ${stats.total}</button>
        ${categories.map((name) => `<button class="chip chip-button ${state.noticeCategory === name ? "is-active" : ""}" data-action="notice-category" data-category="${escapeHtml(name)}">${escapeHtml(name)} ${stats.byCategory[name]}</button>`).join("")}
      </div>
    </div>
    ${state.contentStatus === "error" && state.campusStatus === "error" ? emptyState("⚠", "Notice sources unavailable", "Neither the campus directory nor the content store answered. Nothing was guessed.", `<button class="btn btn-primary" data-action="retry-notices">Try again</button>`) : ""}
    ${filtered.length ? `<div class="notice-list">${filtered.slice(0, 120).map((notice) => noticeCard(notice)).join("")}</div>` : `<section class="card">${emptyState("📌", "No matching notice", state.noticeQuery || state.noticeCategory ? `Nothing matches this filter. Clear the search to see all ${stats.total} notices.` : "The verified notice feed is empty right now. The official college site still has every notice.", `<a class="btn" href="https://erp.gndec.ac.in/notice" target="_blank" rel="noopener noreferrer">Open the official notice board ↗</a>`)}</section>`}
    <p class="card-sub" style="margin-top:14px">Sources: GNDEC campus directory, ERP notice board, the published notice list and user-supplied transcriptions. Newest first. Nothing is generated.</p>
  </div>`;
}

/* ── Papers ─────────────────────────────────────────────────────────────── */

function renderPapers() {
  const papers = allPapers();
  const stats = paperStats(papers);
  const departments = [...new Set(papers.map((paper) => paper.department).filter(Boolean))].sort();
  const results = searchPapers(papers, state.paperQuery, { department: state.paperDepartment, limit: 150 });
  const grouped = groupPapers(results);
  const loading = state.papersStatus === "loading" || (state.papersStatus === "idle" && !papers.length);
  return `<div class="page page-papers">
    <div class="page-head">
      <div class="page-head-text"><h2 class="page-title">Question banks</h2><p class="page-sub">Subject question banks published by GNDEC departments. Every link opens the official PDF; Compass never hosts or rewrites a paper.</p></div>
      <div class="page-actions"><span class="badge">${stats.total} papers</span><span class="badge">${stats.departments} department${stats.departments === 1 ? "" : "s"}</span></div>
    </div>
    <div class="filter-bar">
      <input type="search" value="${escapeHtml(state.paperQuery)}" placeholder="Search subject, code or semester…" data-paper-search aria-label="Search question banks" />
      <select data-paper-department aria-label="Filter by department">
        <option value="">All departments</option>
        ${departments.map((name) => `<option value="${escapeHtml(name)}" ${state.paperDepartment === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
      </select>
    </div>
    ${loading ? `<section class="card"><p class="card-sub">Loading the official question-bank index…</p></section>` : ""}
    ${state.papersStatus === "error" ? emptyState("⚠", "Question-bank index unavailable", "The published index could not be loaded. Nothing was invented.", `<button class="btn btn-primary" data-action="retry-papers">Try again</button>`) : ""}
    ${!loading && results.length ? grouped.map((group) => `<section class="card" style="margin-bottom:14px"><div class="card-head"><div><h2 class="card-title">${escapeHtml(group.label)}</h2><p class="card-sub">${group.count} document${group.count === 1 ? "" : "s"} · official GNDEC PDF</p></div></div><div class="paper-grid">${group.papers.map((paper) => `<a class="paper-card" href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(paper.subject)}</strong>${paper.code ? `<span class="paper-code">${escapeHtml(paper.code)}</span>` : ""}<small>Open official PDF ↗</small></a>`).join("")}</div></section>`).join("") : ""}
    ${!loading && !results.length && state.papersStatus !== "error" ? `<section class="card">${emptyState("📄", "No matching question bank", papers.length ? "Try a shorter subject name or clear the department filter." : "No department currently publishes a question bank that Compass can verify. Ask an admin to upload one from Settings → Admin.")}</section>` : ""}
    <p class="card-sub" style="margin-top:12px">Sources are recorded when the index is built. Only official <code>*.gndec.ac.in</code> PDFs are indexed automatically. ${state.papers.loadedAt ? `Index built ${escapeHtml(shortDate(state.papers.loadedAt))}.` : ""}</p>
  </div>`;
}

/* ── Syllabus ───────────────────────────────────────────────────────────── */

function renderSyllabus() {
  const docs = allSyllabus();
  const groups = groupSyllabus(docs);
  const departments = groups.map((group) => group.label);
  const active = state.syllabusDepartment || "";
  const results = searchSyllabus(docs, state.syllabusQuery, { department: active, limit: 120 });
  const visibleGroups = groupSyllabus(results);
  const loading = state.campusStatus === "loading" || (state.campusStatus === "idle" && !docs.length);
  return `<div class="page page-syllabus">
    <div class="page-head">
      <div class="page-head-text"><h2 class="page-title">Syllabus</h2><p class="page-sub">Every syllabus document published by a GNDEC department. Compass links the official PDF and never re-types its contents.</p></div>
      <div class="page-actions"><span class="badge">${docs.length} documents</span><span class="badge">${groups.length} departments</span></div>
    </div>
    <div class="filter-bar">
      <input type="search" value="${escapeHtml(state.syllabusQuery)}" placeholder="Search department, batch, semester…" data-syllabus-search aria-label="Search syllabus" />
      <div class="chip-row" role="group" aria-label="Filter by department">
        <button class="chip chip-button ${active ? "" : "is-active"}" data-action="syllabus-department" data-department="">All</button>
        ${departments.map((name) => `<button class="chip chip-button ${active === name ? "is-active" : ""}" data-action="syllabus-department" data-department="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}
      </div>
    </div>
    ${loading ? `<section class="card"><p class="card-sub">Loading the published syllabus index…</p></section>` : ""}
    ${state.campusStatus === "error" && !docs.length ? emptyState("⚠", "Syllabus index unavailable", "The department syllabus index could not be loaded. Nothing was invented.", `<button class="btn btn-primary" data-action="retry-syllabus">Try again</button>`) : ""}
    ${visibleGroups.map((group) => `<section class="card syllabus-group" style="margin-bottom:14px">
      <div class="card-head"><div><h2 class="card-title">${escapeHtml(group.label)}</h2><p class="card-sub">${group.count} document${group.count === 1 ? "" : "s"}${group.semesters.length ? ` · semesters ${group.semesters.join(", ")}` : ""}</p></div></div>
      <ul class="doc-list">${group.docs.map((doc) => `<li><a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(doc.label)}</a>${doc.semester ? `<span class="badge">Sem ${escapeHtml(doc.semester)}</span>` : ""}${doc.external ? `<span class="badge">External</span>` : ""}</li>`).join("")}</ul>
    </section>`).join("")}
    ${!loading && !visibleGroups.length && state.campusStatus !== "error" ? `<section class="card">${emptyState("📚", "No matching syllabus document", "Try a department name, batch year or semester.")}</section>` : ""}
  </div>`;
}

/* ── Calendar ───────────────────────────────────────────────────────────── */

function calendarMonthLabel(month) {
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, index - 1, 1)));
}

function renderCalendar() {
  const overrides = holidayOverrides();
  const today = now().dateISO;
  const upcoming = upcomingHolidays(today, { overrides, limit: 8 });
  const months = {};
  for (const item of HOLIDAYS_2026) {
    const key = item.date.slice(0, 7);
    if (!months[key]) months[key] = [];
    months[key].push({ ...item, overridden: false });
  }
  for (const item of overrides) {
    const key = String(item.date || "").slice(0, 7);
    if (!key) continue;
    if (!months[key]) months[key] = [];
    const existing = months[key].findIndex((row) => row.date === item.date);
    const type = item.type || (item.off === false ? "working" : "holiday");
    const row = { date: item.date, name: item.name, type, overridden: true };
    if (existing >= 0) months[key][existing] = row;
    else months[key].push(row);
  }
  const monthKeys = Object.keys(months).sort();
  return `<div class="page page-calendar">
    <div class="page-head">
      <div class="page-head-text"><h2 class="page-title">Academic calendar</h2><p class="page-sub">Published academic periods, the official 2026 holiday list and any date the college changes through a notice.</p></div>
      <div class="page-actions"><a class="btn btn-sm" href="/notices">Notices</a></div>
    </div>
    ${upcoming.length ? `<section class="card"><div class="card-head"><div><h2 class="card-title">Coming up</h2><p class="card-sub">Next published off days from today.</p></div></div><div class="holiday-row">${upcoming.map((item) => `<div class="holiday-pill"><strong>${escapeHtml(dateOnly(item.date))}</strong><span>${escapeHtml(dayOfWeek(item.date))}</span><small>${escapeHtml(item.name)}</small></div>`).join("")}</div></section>` : ""}
    ${publishedDatesheets().length ? `<section class="card" style="margin-top:14px"><div class="card-head"><div><h2 class="card-title">Published date sheets</h2><p class="card-sub">Transcribed by the college admin from an official notice. The original link is always kept.</p></div><a class="btn btn-sm" href="/notices">All notices</a></div>
      <ul class="doc-list">${publishedDatesheets().map((item) => `<li><div>${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || "Date sheet")}</a>` : `<strong>${escapeHtml(item.title || "Date sheet")}</strong>`}<span class="badge">${escapeHtml(item.scope || "Examination")}</span>${item.department ? `<span class="badge">${escapeHtml(item.department)}</span>` : ""}<div class="card-sub" style="margin-top:6px">${escapeHtml(item.date ? shortDate(item.date) : "Undated")}${item.body ? ` · ${escapeHtml(String(item.body).slice(0, 400)).replace(/\n/g, " ")}` : ""}</div></div></li>`).join("")}</ul>
    </section>` : ""}
    <section class="card" style="margin-top:14px"><div class="card-head"><div><h2 class="card-title">Academic periods</h2><p class="card-sub">From the official academic calendar; these are periods, not subject exam sittings.</p></div><a class="btn btn-sm" href="${escapeHtml(CALENDAR_SOURCE.url)}" target="_blank" rel="noopener noreferrer">Official PDF ↗</a></div>
      <div class="period-grid">${ACADEMIC_PERIODS.map((period) => `<div class="period-card"><h3>${escapeHtml(period.scope)}</h3><dl><dt>Semester starts</dt><dd>${escapeHtml(dateOnly(period.start))}</dd><dt>Preparatory leave</dt><dd>${escapeHtml(dateOnly(period.prepStart))} → ${escapeHtml(dateOnly(period.prepEnd))}</dd><dt>Examinations</dt><dd>From ${escapeHtml(dateOnly(period.examsStart))}</dd></dl></div>`).join("")}</div>
    </section>
    <section class="card" style="margin-top:14px"><div class="card-head"><div><h2 class="card-title">Holidays 2026</h2><p class="card-sub">${HOLIDAYS_2026.length} published entries. Restricted and half-day holidays are labelled.</p></div><a class="btn btn-sm" href="${escapeHtml(HOLIDAY_SOURCE.url)}" target="_blank" rel="noopener noreferrer">Official list ↗</a></div>
      ${monthKeys.map((key) => `<div class="month-block"><h3>${escapeHtml(calendarMonthLabel(key))}</h3><ul class="holiday-list">${months[key].sort((a, b) => a.date.localeCompare(b.date)).map((item) => `<li class="holiday-item is-${escapeHtml(item.type)}"><time datetime="${escapeHtml(item.date)}">${escapeHtml(dateOnly(item.date))}</time><span class="holiday-day">${escapeHtml(dayOfWeek(item.date))}</span><span class="holiday-name">${escapeHtml(item.name)}</span>${item.type !== "holiday" ? `<span class="badge">${escapeHtml(item.type)}</span>` : ""}${item.overridden ? `<span class="badge badge-warn">Admin override</span>` : ""}</li>`).join("")}</ul></div>`).join("")}
    </section>
  </div>`;
}

/* ── Directory: faculty, students, syllabus ────────────────────────────── */

const ADMIN_TOKEN_KEY = "gndec-compass-next-admin-token-v1";
const ADMIN_MAX_FILE = 1_500_000;

const ADMIN_SCHEMAS = Object.freeze({
  notices: {
    title: "Notices",
    hint: "Publish an official update. A notice needs a title and either an official https link or the transcribed text. Nothing is invented.",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, wide: true, placeholder: "MSE-II date sheet · November 2026" },
      { name: "date", label: "Notice date", type: "date" },
      { name: "category", label: "Category", type: "select", options: NOTICE_CATEGORIES, default: "General" },
      { name: "author", label: "Issued by", type: "text", placeholder: "Exam Office" },
      { name: "url", label: "Official link", type: "url", placeholder: "https://erp.gndec.ac.in/…" },
      { name: "body", label: "Body or transcription", type: "textarea", wide: true },
      { name: "pinned", label: "Pin to the top", type: "checkbox" },
      { name: "published", label: "Published", type: "checkbox", default: true }
    ]
  },
  datesheets: {
    title: "Date sheets",
    hint: "Exam date sheets and transcribed schedules. Link the official PDF or paste the rows. A holiday can also be published here by choosing the holiday scope.",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, wide: true },
      { name: "date", label: "Published on", type: "date" },
      { name: "scope", label: "Scope", type: "select", options: ["General", "Examination", "MSE", "End semester", "Holiday", "Academic"], default: "Examination" },
      { name: "department", label: "Department or programme", type: "text" },
      { name: "url", label: "Official PDF", type: "url" },
      { name: "body", label: "Transcribed rows", type: "textarea", wide: true },
      { name: "published", label: "Published", type: "checkbox", default: true }
    ]
  },
  holidays: {
    title: "Calendar overrides",
    hint: "Override the official holiday list only when the college publishes a change. Every override is labelled in the Calendar.",
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "name", label: "Reason", type: "text", required: true, wide: true, placeholder: "Holiday in lieu of working Saturday" },
      { name: "type", label: "Day type", type: "select", options: ["holiday", "working", "restricted", "half-day"], default: "holiday" },
      { name: "published", label: "Published", type: "checkbox", default: true }
    ]
  },
  papers: {
    title: "Question banks",
    hint: "Add a verified question bank or previous paper. Only an official https PDF link is accepted.",
    fields: [
      { name: "url", label: "Official PDF", type: "url", required: true, wide: true },
      { name: "subject", label: "Subject", type: "text", wide: true },
      { name: "code", label: "Subject code", type: "text", placeholder: "PCIT-101" },
      { name: "department", label: "Department", type: "text", placeholder: "Information Technology" },
      { name: "semester", label: "Semester", type: "text" },
      { name: "year", label: "Year", type: "text" },
      { name: "type", label: "Document type", type: "select", options: ["question-bank", "previous-paper", "sample-paper"], default: "question-bank" },
      { name: "published", label: "Published", type: "checkbox", default: true }
    ]
  },
  syllabus: {
    title: "Syllabus links",
    hint: "Link an official syllabus PDF. Compass never re-types the document.",
    fields: [
      { name: "url", label: "Official PDF", type: "url", required: true, wide: true },
      { name: "label", label: "Document label", type: "text", required: true, wide: true, placeholder: "B.Tech (Batch 2024 & Onwards)" },
      { name: "department", label: "Department", type: "text" },
      { name: "semester", label: "Semester", type: "text" },
      { name: "published", label: "Published", type: "checkbox", default: true }
    ]
  },
  announcements: {
    title: "Announcements",
    hint: "A short message shown above notices and on Today. Use it for admin notes, never for invented college facts.",
    fields: [
      { name: "title", label: "Heading", type: "text", required: true, wide: true },
      { name: "body", label: "Message", type: "textarea", required: true, wide: true },
      { name: "level", label: "Tone", type: "select", options: ["info", "warning", "critical"], default: "info" },
      { name: "url", label: "More information link", type: "url" },
      { name: "expiresAt", label: "Hide after", type: "date" },
      { name: "published", label: "Published", type: "checkbox", default: true }
    ]
  },
  links: {
    title: "Official links",
    hint: "Curated official links shown to students. Only https URLs are accepted.",
    fields: [
      { name: "label", label: "Label", type: "text", required: true, wide: true },
      { name: "url", label: "https URL", type: "url", required: true, wide: true },
      { name: "group", label: "Group", type: "text", placeholder: "Examination" },
      { name: "published", label: "Published", type: "checkbox", default: true }
    ]
  }
});

const ADMIN_TABS = Object.freeze([
  ...Object.keys(ADMIN_SCHEMAS).map((id) => ({ id, title: ADMIN_SCHEMAS[id].title })),
  { id: "editors", title: "Editors" },
  { id: "audit", title: "Audit" }
]);

function adminStoredToken() {
  try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ""; } catch { return ""; }
}

function setAdminToken(token) {
  state.adminToken = String(token || "");
  try {
    if (state.adminToken) sessionStorage.setItem(ADMIN_TOKEN_KEY, state.adminToken);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch { /* private mode: the token stays in memory for this tab */ }
}

async function adminRequest(path, { method = "GET", body = null } = {}) {
  const headers = { Authorization: `Bearer ${state.adminToken}` };
  if (body !== null) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    cache: "no-store"
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

async function adminLoad({ silent = false } = {}) {
  if (!state.adminToken) {
    state.adminStatus = "signed-out";
    state.adminData = null;
    if (!silent) render();
    return;
  }
  if (!silent) {
    state.adminStatus = "loading";
    state.adminError = "";
    render();
  }
  try {
    const data = await adminRequest("/api/admin/content");
    state.adminData = data;
    state.adminStatus = "ready";
    state.adminError = "";
  } catch (error) {
    state.adminError = String(error.message || "The admin API did not answer.");
    state.adminStatus = "error";
    if (/token|unauthor/i.test(state.adminError)) setAdminToken("");
  }
  render();
}

function adminItems(collection) {
  const rows = state.adminData?.collections?.[collection];
  return Array.isArray(rows) ? [...rows] : [];
}

function adminItemTitle(collection, item = {}) {
  if (collection === "links") return item.label || item.url || "Official link";
  if (collection === "papers") return [item.subject || "Question bank", item.code ? `(${item.code})` : ""].join(" ").trim();
  if (collection === "syllabus") return item.label || item.url || "Syllabus";
  if (collection === "holidays") return item.name || item.date || "Calendar override";
  return item.title || item.id || "Untitled";
}

function adminItemMeta(collection, item = {}) {
  const parts = [];
  if (collection === "holidays") parts.push(item.date, item.type || "holiday");
  else if (collection === "papers") parts.push(item.department, item.semester ? `Sem ${item.semester}` : "", item.type);
  else if (collection === "syllabus") parts.push(item.department, item.semester ? `Sem ${item.semester}` : "");
  else parts.push(item.date, item.category || item.scope || item.group);
  if (item.url) parts.push(item.url.replace(/^https?:\/\//, "").slice(0, 52));
  if (item.body && !item.url) parts.push(`${item.body.slice(0, 70)}…`);
  return parts.filter(Boolean).join(" · ");
}

function adminFieldValue(item, field) {
  const raw = item?.[field.name];
  if (raw === undefined || raw === null || raw === "") return field.default ?? "";
  return raw;
}

function adminFieldHtml(field, item) {
  const id = `admin-field-${field.name}`;
  const value = adminFieldValue(item, field);
  const wide = field.wide ? " field-wide" : "";
  const label = `<label for="${id}">${escapeHtml(field.label)}${field.required ? " *" : ""}</label>`;
  if (field.type === "textarea") {
    return `<div class="field${wide}">${label}<textarea id="${id}" data-admin-field="${field.name}" rows="4" placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(value)}</textarea></div>`;
  }
  if (field.type === "select") {
    return `<div class="field${wide}">${label}<select id="${id}" data-admin-field="${field.name}">${field.options.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></div>`;
  }
  if (field.type === "checkbox") {
    return `<label class="check-field${wide}"><input type="checkbox" id="${id}" data-admin-field="${field.name}" ${value ? "checked" : ""} /><span>${escapeHtml(field.label)}</span></label>`;
  }
  return `<div class="field${wide}">${label}<input id="${id}" data-admin-field="${field.name}" type="${field.type === "url" ? "url" : field.type === "date" ? "date" : "text"}" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || "")}" ${field.type === "url" ? 'inputmode="url"' : ""} /></div>`;
}

function renderAdminForm() {
  const editing = state.adminEditing;
  if (!editing) return "";
  const schema = ADMIN_SCHEMAS[editing.collection];
  if (!schema) return "";
  const item = editing.item || {};
  const isEdit = Boolean(item.id);
  return `<section class="card admin-form-card">
    <div class="card-head"><div><h2 class="card-title">${isEdit ? "Edit" : "New"} ${escapeHtml(schema.title.replace(/s$/, "").toLowerCase())}</h2><p class="card-sub">${escapeHtml(schema.hint)}</p></div><button class="btn btn-sm btn-ghost" data-action="admin-cancel">Cancel</button></div>
    <form id="admin-form" class="admin-form" novalidate>
      <div class="admin-form-grid">${schema.fields.map((field) => adminFieldHtml(field, item)).join("")}</div>
      <div class="admin-upload-row">
        <label class="btn btn-sm admin-file-label">Upload image, PDF or text<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,.txt,.md,.csv" data-admin-file /></label>
        <span class="card-sub" id="admin-upload-status">The uploaded file is linked into the URL field. Maximum 1.5 MB.</span>
      </div>
      <div class="chip-row" style="margin-top:14px">
        <button type="button" class="btn btn-primary btn-sm" data-action="admin-save" ${state.adminBusy ? "disabled" : ""}>${isEdit ? "Save changes" : "Publish"}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="admin-cancel">Cancel</button>
      </div>
    </form>
  </section>`;
}

function renderAdminList() {
  const tab = state.adminTab;
  if (tab === "editors") return renderAdminEditors();
  if (tab === "audit") return renderAdminAudit();
  const schema = ADMIN_SCHEMAS[tab];
  if (!schema) return "";
  const items = adminItems(tab);
  return `<section class="card">
    <div class="card-head">
      <div><h2 class="card-title">${escapeHtml(schema.title)}</h2><p class="card-sub">${items.length} item${items.length === 1 ? "" : "s"} · ${items.filter((item) => item.published !== false).length} published</p></div>
      <div class="card-actions">
        <button class="btn btn-sm" data-action="admin-restore" data-collection="${tab}">Undo last change</button>
        <button class="btn btn-primary btn-sm" data-action="admin-new" data-collection="${tab}">New</button>
      </div>
    </div>
    ${items.length ? `<div class="admin-list">${items.slice().sort((a, b) => String(b.updatedAt || b.date || "").localeCompare(String(a.updatedAt || a.date || ""))).map((item) => `<div class="admin-item">
      <div class="admin-item-text">
        <strong>${escapeHtml(adminItemTitle(tab, item))}</strong>
        <span>${escapeHtml(adminItemMeta(tab, item))}</span>
      </div>
      <span class="badge ${item.published === false ? "" : "badge-accent"}">${item.published === false ? "Draft" : "Live"}</span>
      ${item.pinned ? `<span class="badge badge-warn">Pinned</span>` : ""}
      <div class="admin-item-actions">
        ${item.url ? `<a class="btn btn-sm btn-ghost" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}
        <button class="btn btn-sm" data-action="admin-toggle" data-collection="${tab}" data-id="${escapeHtml(item.id)}">${item.published === false ? "Publish" : "Unpublish"}</button>
        <button class="btn btn-sm" data-action="admin-edit" data-collection="${tab}" data-id="${escapeHtml(item.id)}">Edit</button>
        <button class="btn btn-sm btn-danger" data-action="admin-delete" data-collection="${tab}" data-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </div>`).join("")}</div>` : `<p class="card-sub">Nothing published in this collection yet. Use “New” to add the first verified entry.</p>`}
  </section>`;
}

function renderAdminEditors() {
  const editors = Array.isArray(state.adminData?.editors) ? state.adminData.editors : [];
  const owner = state.adminData?.role === "owner";
  return `<section class="card">
    <div class="card-head"><div><h2 class="card-title">Editor access</h2><p class="card-sub">${owner ? "Add a friend without a redeploy. Their token is stored only as a SHA-256 hash." : "Only the owner token can manage editors."}</p></div></div>
    ${owner ? `<div class="admin-form-grid">
      <div class="field"><label for="admin-editor-name">Editor name</label><input id="admin-editor-name" placeholder="Friend or classmate" autocomplete="off" /></div>
      <div class="field"><label for="admin-editor-token">Editor token (16+ characters)</label><input id="admin-editor-token" type="password" autocomplete="new-password" /></div>
    </div>
    <div class="chip-row" style="margin-top:12px"><button class="btn btn-primary btn-sm" data-action="admin-editor-add">Add editor</button><span class="card-sub">Share the token privately. It is never shown again.</span></div>` : ""}
    <div class="admin-list" style="margin-top:14px">
      ${editors.length ? editors.map((editor) => `<div class="admin-item"><div class="admin-item-text"><strong>${escapeHtml(editor.name)}</strong><span>Added ${escapeHtml(shortDate(editor.createdAt))}${editor.active === false ? " · disabled" : ""}</span></div><div class="admin-item-actions">${owner ? `<button class="btn btn-sm btn-danger" data-action="admin-editor-remove" data-name="${escapeHtml(editor.name)}">Remove</button>` : ""}</div></div>`).join("") : `<p class="card-sub">No editor tokens yet. The owner token alone can publish.</p>`}
    </div>
  </section>`;
}

function renderAdminAudit() {
  const rows = Array.isArray(state.adminData?.audit) ? state.adminData.audit : [];
  return `<section class="card">
    <div class="card-head"><div><h2 class="card-title">Audit log</h2><p class="card-sub">The last ${rows.length} writes. Kept in the content store, capped at 120 entries.</p></div></div>
    ${rows.length ? `<div class="week-wrap"><table class="week-table" style="min-width:620px"><thead><tr><th>When</th><th>Action</th><th>Collection</th><th>Item</th><th>By</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(shortDate(row.at))}</td><td>${escapeHtml(row.action || "")}</td><td>${escapeHtml(row.collection || "")}</td><td>${escapeHtml(row.id || "")}</td><td>${escapeHtml(row.actor || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="card-sub">No writes recorded yet.</p>`}
  </section>`;
}

function renderAdmin() {
  if (!state.adminToken) {
    return `<div class="page page-admin">
      <div class="page-head">
        <div class="page-head-text"><h2 class="page-title">Admin</h2><p class="page-sub">Publish notices, date sheets, question banks, syllabus links and announcements. Changes go live immediately and feed Ask Compass.</p></div>
        <div class="page-actions"><a class="btn btn-sm" href="/settings">Settings</a></div>
      </div>
      <section class="card admin-signin">
        <div class="card-head"><div><h2 class="card-title">Sign in to publish</h2><p class="card-sub">Use the admin token for this deployment. The token stays in this browser tab only.</p></div></div>
        <div class="field"><label for="admin-token">Admin token</label><input id="admin-token" data-admin-token type="password" autocomplete="current-password" placeholder="Paste the owner or editor token" /></div>
        <div class="chip-row" style="margin-top:12px"><button class="btn btn-primary" data-action="admin-sign-in">Sign in</button></div>
        ${state.adminError ? `<p class="card-sub admin-error">${escapeHtml(state.adminError)}</p>` : ""}
        <p class="card-sub" style="margin-top:14px">The owner token is set as the <code>ADMIN_API_TOKEN</code> secret on the Worker. Only an authenticated admin can write; reading the public site never needs a token.</p>
      </section>
    </div>`;
  }

  if (state.adminStatus === "error") {
    return `<div class="page page-admin">
      <div class="page-head"><div class="page-head-text"><h2 class="page-title">Admin</h2><p class="page-sub">The admin API did not accept this session.</p></div><div class="page-actions"><button class="btn btn-sm" data-action="admin-sign-out">Sign out</button></div></div>
      <section class="card">${emptyState("🔐", "Admin session expired", state.adminError || "Sign in again with a valid token. Nothing was changed.", `<button class="btn btn-primary" data-action="admin-sign-out">Sign in again</button>`)}</section>
    </div>`;
  }

  if (state.adminStatus === "loading" || !state.adminData) {
    return `<div class="page page-admin"><div class="page-head"><div class="page-head-text"><h2 class="page-title">Admin</h2><p class="page-sub">Checking the content store…</p></div></div><section class="card"><p class="card-sub">Loading the admin workspace…</p></section></div>`;
  }

  const tabs = ADMIN_TABS.filter((tab) => tab.id !== "editors" || state.adminData?.role === "owner");
  const active = tabs.find((tab) => tab.id === state.adminTab) || tabs[0];
  const meta = state.adminData?.meta;
  return `<div class="page page-admin">
    <div class="page-head">
      <div class="page-head-text"><h2 class="page-title">Admin</h2><p class="page-sub">Signed in as <strong>${escapeHtml(state.adminData?.role || "editor")}</strong>. Published content appears on the site and in Ask Compass immediately.</p></div>
      <div class="page-actions">
        <span class="badge">Revision ${escapeHtml(String(meta?.revision || 0))}</span>
        <span class="badge ${state.adminData?.configured ? "badge-accent" : "badge-warn"}">${state.adminData?.configured ? "Store connected" : "Store not configured"}</span>
        <button class="btn btn-sm" data-action="admin-refresh">Refresh</button>
        <button class="btn btn-sm" data-action="admin-sign-out">Sign out</button>
      </div>
    </div>
    <div class="filter-bar">
      <div class="chip-row" role="tablist" aria-label="Admin sections">
        ${tabs.map((tab) => `<button class="chip chip-button ${active.id === tab.id ? "is-active" : ""}" data-action="admin-tab" data-tab="${tab.id}" role="tab" aria-selected="${active.id === tab.id}">${escapeHtml(tab.title)}${ADMIN_SCHEMAS[tab.id] ? ` ${adminItems(tab.id).length}` : ""}</button>`).join("")}
      </div>
    </div>
    ${renderAdminForm()}
    ${renderAdminList()}
    <section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2 class="card-title">Upload a file</h2><p class="card-sub">PNG, JPEG, WebP, GIF or PDF up to 1.5 MB. Files are stored in the content store and served from this Worker.</p></div></div>
      <div class="admin-upload-row">
        <label class="btn btn-sm admin-file-label">Choose file<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,.txt,.md,.csv" data-admin-file data-standalone="true" /></label>
        <span class="card-sub" id="admin-upload-status">Nothing uploaded in this session.</span>
      </div>
    </section>
    <p class="card-sub" style="margin-top:12px">Every write is validated, bounded and recorded. Undo restores the previous version of a collection. The public site only ever reads published items.</p>
  </div>`;
}

async function adminUpload(file, input) {
  if (!file) return;
  const status = $("#admin-upload-status");
  if (file.size > ADMIN_MAX_FILE) {
    toast("Choose a file smaller than 1.5 MB.", "error");
    if (status) status.textContent = "That file is larger than 1.5 MB.";
    return;
  }
  if (status) status.textContent = `Uploading ${file.name}…`;
  try {
    const response = await fetch(`/api/admin/upload?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.adminToken}`, "Content-Type": file.type || "application/octet-stream" },
      body: file
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Upload failed.");
    const absolute = new URL(data.url, location.origin).toString();
    const form = input?.closest("form");
    const urlField = form?.querySelector('[data-admin-field="url"]');
    if (urlField) urlField.value = absolute;
    if (status) {
      status.innerHTML = `Uploaded · <a href="${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer">open file ↗</a> · ${Math.max(1, Math.round(Number(data.size || file.size) / 1024))} KB`;
    }
    toast("File uploaded. Paste the link into any item.", "success");
  } catch (error) {
    const message = String(error.message || "Upload failed.");
    if (status) status.textContent = message;
    toast(message, "error");
  } finally {
    if (input) input.value = "";
  }
}

async function adminSave() {
  const editing = state.adminEditing;
  const form = $("#admin-form");
  if (!editing || !form) return;
  const item = { ...(editing.item || {}) };
  for (const field of $$("[data-admin-field]", form)) {
    item[field.dataset.adminField] = field.type === "checkbox" ? field.checked : field.value.trim();
  }
  state.adminBusy = true;
  try {
    await adminRequest("/api/admin/content", {
      method: "POST",
      body: { action: "upsert", collection: editing.collection, item }
    });
    state.adminEditing = null;
    toast("Saved. It is live on Compass.", "success");
    await adminLoad({ silent: true });
  } catch (error) {
    toast(String(error.message || "Could not save."), "error");
  } finally {
    state.adminBusy = false;
    render();
  }
}

async function adminDelete(collection, id) {
  const item = adminItems(collection).find((row) => row.id === id);
  if (!item) return;
  if (!window.confirm(`Delete “${adminItemTitle(collection, item)}” from ${ADMIN_SCHEMAS[collection]?.title || collection}? This can be undone with Undo last change.`)) return;
  try {
    await adminRequest("/api/admin/content", { method: "POST", body: { action: "delete", collection, id } });
    toast("Deleted. Undo is available.", "success");
    await adminLoad({ silent: true });
  } catch (error) {
    toast(String(error.message || "Could not delete."), "error");
  }
}

async function adminToggle(collection, id) {
  const item = adminItems(collection).find((row) => row.id === id);
  if (!item) return;
  try {
    await adminRequest("/api/admin/content", {
      method: "POST",
      body: { action: "upsert", collection, item: { ...item, published: item.published === false } }
    });
    toast(item.published === false ? "Published." : "Unpublished.", "success");
    await adminLoad({ silent: true });
  } catch (error) {
    toast(String(error.message || "Could not update."), "error");
  }
}

async function adminRestore(collection) {
  if (!window.confirm(`Undo the last change to ${ADMIN_SCHEMAS[collection]?.title || collection}?`)) return;
  try {
    await adminRequest("/api/admin/content", { method: "POST", body: { action: "restore", collection } });
    toast("Previous version restored.", "success");
    await adminLoad({ silent: true });
  } catch (error) {
    toast(String(error.message || "Nothing to restore."), "error");
  }
}

function directoryMatches() {
  const query = state.directoryQuery.trim().toLowerCase();
  if (state.directoryTab === "faculty") {
    const records = state.faculty.filter((record) => !query || [record.name, record.designation, record.department, record.email, record.qualifications].some((value) => String(value || "").toLowerCase().includes(query)));
    return { records, total: state.faculty.length, query };
  }
  if (state.directoryTab === "students") {
    if (query.length < 2) return { records: [], total: state.students.length, query };
    const records = state.students.filter((record) => [record.name, record.crn, record.registrationNo, record.section, record.subsection, record.mentor, record.serialNo, record.currentSerialNo].some((value) => String(value || "").toLowerCase().includes(query)));
    return { records, total: state.students.length, query };
  }
  if (state.directoryTab === "mentoring") {
    const groups = mentoringGroups();
    const records = groups.filter((group) => !query || [group.academicGroup, group.section, group.subsection, group.branch, group.mentor, group.venue, group.mentorPhone].some((value) => String(value || "").toLowerCase().includes(query)));
    return { records, total: groups.length, query };
  }
  return { records: [], total: 0, query };
}

/** One row per verified mentoring group, from the published student roster. */
function mentoringGroups() {
  const map = new Map();
  for (const record of state.students) {
    if (!record) continue;
    const academicGroup = String(record.academicGroup || "").trim();
    const mentor = String(record.mentor || "").trim();
    if (!academicGroup && !mentor) continue;
    const venue = String(record.mentorVenue || record.venue || "").trim();
    const key = [academicGroup, record.section || "", mentor, venue, record.mentorPhone || ""].join("|");
    const entry = map.get(key) || {
      academicGroup,
      section: record.section || "",
      subsection: record.subsection || "",
      branch: record.branch || "",
      mentor,
      mentorPhone: record.mentorPhone || "",
      venue,
      students: 0
    };
    entry.students += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => (a.academicGroup || "").localeCompare(b.academicGroup || "", undefined, { numeric: true })
    || (a.section || "").localeCompare(b.section || "")
    || (a.mentor || "").localeCompare(b.mentor || ""));
}

function facultyCard(record) {
  const meta = [record.designation, record.department].filter(Boolean).join(" · ");
  return `<article class="card directory-card">
    <div class="directory-card-head">
      ${record.photoUrl && record.profileId ? `<img class="directory-photo" src="/api/legacy/api/faculty/photo?id=${encodeURIComponent(record.profileId)}" alt="" loading="lazy" width="48" height="48" referrerpolicy="no-referrer" />` : `<span class="directory-initials" aria-hidden="true">${escapeHtml(String(record.name || "?").replace(/^DR\.?\s+/i, "").split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span>`}
      <div><h3 class="directory-name">${escapeHtml(record.name)}</h3><p class="directory-meta">${escapeHtml(meta || "GNDEC faculty")}</p></div>
    </div>
    ${record.qualifications ? `<p class="directory-detail">${escapeHtml(String(record.qualifications).replace(/\s+/g, " ").slice(0, 180))}${String(record.qualifications).length > 180 ? "…" : ""}</p>` : ""}
    <div class="chip-row">
      ${record.email ? `<a class="chip" href="mailto:${escapeHtml(record.email)}">${escapeHtml(record.email)}</a>` : ""}
      ${record.experience ? `<span class="chip">${escapeHtml(record.experience)} experience</span>` : ""}
      ${record.profileUrl ? `<a class="chip" href="${escapeHtml(record.profileUrl)}" target="_blank" rel="noopener noreferrer">Official profile ↗</a>` : ""}
    </div>
  </article>`;
}

function studentRow(record) {
  const key = record.crn || record.registrationNo || record.name || "";
  return `<tr>
    <td><strong>${escapeHtml(record.name || "")}</strong><br /><small>${escapeHtml(record.crn || record.registrationNo || "")}</small></td>
    <td>${escapeHtml(record.section || "")}${record.subsection ? ` · ${escapeHtml(record.subsection)}` : ""}</td>
    <td>${escapeHtml(record.branch || "")}</td>
    <td>${escapeHtml(record.mentor || "—")}${record.mentorVenue || record.venue ? `<br /><small>${escapeHtml(record.mentorVenue || record.venue)}</small>` : ""}</td>
    <td><button class="btn btn-sm" data-action="use-student" data-student="${escapeHtml(key)}">Use</button></td>
  </tr>`;
}

function syllabusResults() {
  const query = state.directoryQuery.trim().toLowerCase();
  if (!state.syllabus || query.length < 3) return [];
  return state.syllabus.pages
    .map((page) => {
      const text = String(page.text || "").replace(/\s+/g, " ");
      const index = text.toLowerCase().indexOf(query);
      if (index < 0) return null;
      const from = Math.max(0, index - 160);
      return { number: page.number, excerpt: `${from > 0 ? "…" : ""}${text.slice(from, index + 260)}${index + 260 < text.length ? "…" : ""}` };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function renderDirectory() {
  const tab = state.directoryTab;
  const loading = state.directoryStatus === "loading";
  const failed = state.directoryStatus === "error";
  const { records, total, query } = directoryMatches();
  const placeholder = tab === "faculty" ? "Search name, department, designation or email…" : tab === "students" ? "Type at least 2 letters of a name, CRN or registration number…" : tab === "mentoring" ? "Search a mentoring group, section or mentor…" : "Search the first-year syllabus, e.g. Mathematics, ESC101, credits…";
  const tabs = [["faculty", "Faculty", state.faculty.length], ["students", "Students", state.students.length], ["mentoring", "Mentoring", state.students.length ? mentoringGroups().length : 0], ["syllabus", "Syllabus", state.syllabus?.pages?.length || 0]];
  return `<div class="page page-directory">
    <div class="page-head">
      <div class="page-head-text">
        <h2 class="page-title">College directory</h2>
        <p class="page-sub">Faculty, student sections, mentoring groups and the published first-year syllabus. Searches run on this device only.</p>
      </div>
      <div class="page-actions"><span class="badge">${escapeHtml(total ? `${total} published records` : "On-device search")}</span></div>
    </div>
    <div class="tabs" role="tablist" aria-label="Directory section">
      ${tabs.map(([id, label, count]) => `<button class="tab ${tab === id ? "is-active" : ""}" role="tab" aria-selected="${tab === id}" data-directory-tab="${id}">${escapeHtml(label)}${count ? ` <small>${count}</small>` : ""}</button>`).join("")}
    </div>
    <div class="card" style="margin-top:12px">
      <div class="field"><label for="directory-search" class="visually-hidden">Search ${escapeHtml(tab)}</label>
        <input id="directory-search" type="search" value="${escapeHtml(state.directoryQuery)}" placeholder="${escapeHtml(placeholder)}" data-directory-search autocomplete="off" />
      </div>
      <p class="card-sub" style="margin-top:8px">${tab === "faculty" ? "Names and public contact details come from the official GNDEC faculty directory." : tab === "students" ? "Student records stay in this browser. Compass never uploads a name, CRN or registration number." : tab === "mentoring" ? "Every mentoring group and mentor published in the student roster, grouped with its section and venue." : "Text is extracted from the official first-year syllabus PDF. Always confirm the authoritative PDF before relying on a page."}</p>
    </div>
    ${loading ? `<section class="card" style="margin-top:14px"><p class="card-sub">Loading the verified ${escapeHtml(tab)} data…</p></section>` : ""}
    ${failed ? emptyState("⚠", "Directory unavailable", "The official record could not be loaded. Nothing was guessed or stored.", `<button class="btn btn-primary" data-action="retry-directory">Try again</button>`) : ""}
    ${!loading && !failed && tab === "faculty" ? `<p class="card-sub" style="margin:14px 0 8px">${records.length} of ${total} faculty${query ? ` matching “${escapeHtml(state.directoryQuery)}”` : ""}.</p><div class="directory-grid">${records.slice(0, 60).map(facultyCard).join("")}</div>${records.length > 60 ? `<p class="card-sub" style="margin-top:10px">Showing the first 60. Narrow the search to see more.</p>` : ""}` : ""}
    ${!loading && !failed && tab === "students" ? (query.length < 2 ? emptyState("🔎", "Search a student", "Enter at least 2 letters of a name, CRN or registration number. Results are computed on this device and never sent anywhere.") : records.length ? `<section class="card" style="margin-top:14px"><div class="card-head"><div><h2 class="card-title">${records.length} match${records.length === 1 ? "" : "es"}</h2><p class="card-sub">Showing at most 50 records from the published roster. Mentor details are published by the college.</p></div></div><div class="table-wrap"><table class="week-table directory-table"><thead><tr><th>Student</th><th>Section</th><th>Branch</th><th>Mentor</th><th>Profile</th></tr></thead><tbody>${records.slice(0, 50).map(studentRow).join("")}</tbody></table></div></section>` : emptyState("🗂", "No matching student", `Nothing in the published roster matches “${state.directoryQuery}”. Check the CRN or spelling.`)) : ""}
    ${!loading && !failed && tab === "mentoring" ? (records.length ? `<section class="card" style="margin-top:14px"><div class="card-head"><div><h2 class="card-title">${records.length} mentoring group${records.length === 1 ? "" : "s"}</h2><p class="card-sub">Grouped from ${state.students.length} published roster records. Venue and phone are printed by the college.</p></div></div><div class="table-wrap"><table class="week-table directory-table"><thead><tr><th>Mentoring group</th><th>Section</th><th>Mentor</th><th>Contact</th><th>Students</th></tr></thead><tbody>${records.map(mentoringRow).join("")}</tbody></table></div></section>` : emptyState("🧑‍🏫", "No matching mentoring group", `Nothing in the published roster matches “${state.directoryQuery}”.`)) : ""}
    ${!loading && !failed && tab === "syllabus" ? (state.syllabus ? `<section class="card" style="margin-top:14px"><div class="card-head"><div><h2 class="card-title">First-year syllabus</h2><p class="card-sub">${state.syllabus.pages.length} extracted pages · <a href="${escapeHtml(state.syllabus.source)}" target="_blank" rel="noopener noreferrer">official PDF ↗</a></p></div></div>${query.length < 3 ? `<p class="card-sub">Type at least 3 characters to search inside the published syllabus text.</p>` : syllabusResults().length ? syllabusResults().map((page) => `<article class="syllabus-hit"><h3>Page ${page.number}</h3><p>${escapeHtml(page.excerpt)}</p></article>`).join("") : `<p class="card-sub">No page contains “${escapeHtml(state.directoryQuery)}”. Try a subject name or code such as ESC101.</p>`}</section>` : "") : ""}
  </div>`;
}

function mentoringRow(record) {
  return `<tr>
    <td><strong>${escapeHtml(record.academicGroup || "—")}</strong></td>
    <td>${escapeHtml(record.section || "")}${record.subsection ? ` · ${escapeHtml(record.subsection)}` : ""}<br /><small>${escapeHtml(record.branch || "")}</small></td>
    <td>${escapeHtml(record.mentor || "—")}</td>
    <td>${record.mentorPhone ? `<a href="tel:${escapeHtml(record.mentorPhone)}">${escapeHtml(record.mentorPhone)}</a>` : "—"}${record.venue ? `<br /><small>${escapeHtml(record.venue)}</small>` : ""}</td>
    <td>${record.students}</td>
  </tr>`;
}

/* ── Compare two sections ──────────────────────────────────────────────── */

function sectionDayEntries(group, day) {
  return classesFor(state.schedule, group, day, "", { includeWeekends: true });
}

function freeBounds(entries, start = 8 * 60, end = 17 * 60) {
  const busy = [...entries].sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = start;
  for (const entry of busy) {
    if (entry.start > cursor) gaps.push([cursor, Math.min(entry.start, end)]);
    cursor = Math.max(cursor, entry.end);
  }
  if (cursor < end) gaps.push([cursor, end]);
  return gaps.filter(([from, to]) => to - from >= 20);
}

function intersection(a, b) {
  const out = [];
  for (const [fromA, toA] of a) {
    for (const [fromB, toB] of b) {
      const from = Math.max(fromA, fromB);
      const to = Math.min(toA, toB);
      if (to - from >= 20) out.push([from, to]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
}

function compareDay() {
  const days = v("timetable.showWeekends") ? [...STUDY_DAYS, "Saturday", "Sunday"] : STUDY_DAYS;
  if (!state.compareDay || !days.includes(state.compareDay)) state.compareDay = days.includes(now().day) ? now().day : days[0];
  return state.compareDay;
}

function compareColumn(group, entries, label) {
  return `<section class="card compare-column">
    <div class="card-head"><div><h2 class="card-title">${escapeHtml(group)}</h2><p class="card-sub">${entries.length} published class${entries.length === 1 ? "" : "es"} · ${escapeHtml(label)}</p></div><a class="btn btn-sm" href="/timetable?section=${encodeURIComponent(group)}">Open</a></div>
    ${entries.length ? `<div class="stack">${entries.map((entry) => `<article class="compare-class"><time>${escapeHtml(humanTime(entry.start, v("timetable.clock")))}–${escapeHtml(humanTime(entry.end, v("timetable.clock")))}</time><div><strong>${escapeHtml(entry.subject)}</strong><small>${escapeHtml(entry.teacher || "")}${entry.room ? ` · ${escapeHtml(entry.room)}` : ""}</small></div></article>`).join("")}</div>` : `<p class="card-sub">No class is published for this section on ${escapeHtml(label)}.</p>`}
  </section>`;
}

function renderCompare() {
  const groups = state.groups;
  if (!groups.length) return `<div class="page page-compare"><div class="page-head"><div class="page-head-text"><h2 class="page-title">Compare sections</h2><p class="page-sub">Load the verified timetable to compare any two sections.</p></div></div>${emptyState("⚖", "Timetable not loaded", "Compare needs the official section timetable. It is loaded from the verified release.", `<button class="btn btn-primary" data-action="refresh-data">Load timetable</button>`)}</div>`;
  if (!groups.includes(state.compareA)) state.compareA = state.group && groups.includes(state.group) ? state.group : groups[0];
  if (!groups.includes(state.compareB)) state.compareB = groups.find((group) => group !== state.compareA) || state.compareA;
  const day = compareDay();
  const a = sectionDayEntries(state.compareA, day);
  const b = sectionDayEntries(state.compareB, day);
  const sharedSubjects = [...new Set(a.map((entry) => entry.subject))].filter((subject) => b.some((entry) => entry.subject === subject));
  const sharedTeachers = [...new Set(a.map((entry) => entry.teacher).filter(Boolean))].filter((teacher) => b.some((entry) => entry.teacher === teacher));
  const common = state.compareA === state.compareB ? [] : intersection(freeBounds(a), freeBounds(b));
  const sameSubject = state.compareA === state.compareB;
  return `<div class="page page-compare">
    <div class="page-head">
      <div class="page-head-text"><h2 class="page-title">Compare sections</h2><p class="page-sub">Two official section timetables, the free windows both share, and the subjects or teachers they have in common. Nothing is estimated.</p></div>
    </div>
    <div class="card">
      <div class="rooms-toolbar">
        <div class="field"><label for="compare-a">Section A</label><select id="compare-a" data-compare-a>${groups.map((group) => `<option value="${escapeHtml(group)}" ${group === state.compareA ? "selected" : ""}>${escapeHtml(group)}</option>`).join("")}</select></div>
        <div class="field"><label for="compare-b">Section B</label><select id="compare-b" data-compare-b>${groups.map((group) => `<option value="${escapeHtml(group)}" ${group === state.compareB ? "selected" : ""}>${escapeHtml(group)}</option>`).join("")}</select></div>
        <div class="field"><label for="compare-day">Day</label><select id="compare-day" data-compare-day>${(v("timetable.showWeekends") ? [...STUDY_DAYS, "Saturday", "Sunday"] : STUDY_DAYS).map((name) => `<option value="${name}" ${name === day ? "selected" : ""}>${name}</option>`).join("")}</select></div>
        <button class="btn btn-sm" data-action="swap-compare">Swap</button>
      </div>
    </div>
    ${sameSubject ? `<p class="card-sub" style="margin-top:10px">Both selectors show ${escapeHtml(state.compareA)}. Pick a different section to see shared free time.</p>` : ""}
    <div class="compare-grid" style="margin-top:14px">
      ${compareColumn(state.compareA, a, day)}
      ${compareColumn(state.compareB, b, day)}
    </div>
    <div class="dashboard-grid" style="margin-top:14px">
      <section class="card"><div class="card-head"><div><h2 class="card-title">Both free</h2><p class="card-sub">Windows of at least 20 minutes with no published class in either section.</p></div></div>
        ${common.length ? `<div class="chip-row">${common.map(([from, to]) => `<span class="chip">${escapeHtml(humanTime(from, v("timetable.clock")))} – ${escapeHtml(humanTime(to, v("timetable.clock")))}</span>`).join("")}</div>` : `<p class="card-sub">No shared free window was found on ${escapeHtml(day)} between 8:00 AM and 5:00 PM.</p>`}
      </section>
      <section class="card"><div class="card-head"><div><h2 class="card-title">Shared on ${escapeHtml(day)}</h2><p class="card-sub">Only subjects and teachers published for both sections.</p></div></div>
        <p class="card-sub"><strong>Subjects:</strong> ${sharedSubjects.length ? sharedSubjects.map(escapeHtml).join(", ") : "none on this day"}</p>
        <p class="card-sub" style="margin-top:6px"><strong>Teachers:</strong> ${sharedTeachers.length ? sharedTeachers.map(escapeHtml).join(", ") : "none on this day"}</p>
      </section>
    </div>
  </div>`;
}

/* ── Ask Compass ───────────────────────────────────────────────────────── */

function renderAsk() {
  const adminMode = hasAdminMode();
  return `<div class="page page-ask">
    <div class="chat-shell">
      <div class="chat-head">
        <span class="brand-mark" style="width:36px;height:36px;border-radius:11px" aria-hidden="true"><svg viewBox="0 0 48 48" width="22" height="22"><path d="M24 4 31 24 24 44 17 24Z" fill="currentColor"/><circle cx="24" cy="24" r="4.5" fill="var(--bg)"/></svg></span>
        <div class="chat-head-title"><strong>Ask Compass</strong>${adminMode ? `<small>${escapeHtml(engineBadge())}</small>` : ""}</div>
        <div class="chat-head-actions">
          ${adminMode ? `<button class="btn btn-sm" data-action="toggle-engine" title="Switch engine">${v("ask.engine") === "auto" ? "Auto" : "Local"}</button>` : ""}
          <button class="btn btn-sm" data-action="clear-chat">Clear</button>
        </div>
      </div>
      <div class="chat-window" id="chat-window" aria-live="polite" aria-label="Conversation"></div>
      <div class="composer">
        <div class="composer-row">
          <textarea class="composer-input" id="question-input" rows="1" placeholder="Ask about your next class, a room, a teacher, free rooms or exams…" aria-label="Question"></textarea>
          ${v("ask.voice") ? `<button class="mic-button" id="mic-button" data-action="voice" aria-label="Dictate a question"><svg viewBox="0 0 24 24" width="20" height="20"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>` : ""}
          <button class="send-button" id="send-button" data-action="send" aria-label="Send question"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 12 20 4l-4 16-4-6-8-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
        </div>
        <div class="composer-hint"><span>Enter to send · Shift+Enter for a new line</span><span>Use a follow-up like “unit 2” or “what about tomorrow?”</span></div>
      </div>
    </div>
    ${state.chat.length ? "" : `<div style="margin-top:14px" class="chip-row">${suggestedQuestions().map((question) => `<button class="chip" data-ask-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join("")}</div>`}
  </div>`;
}

function engineBadge() {
  if (v("privacy.localOnly")) return "Local-only mode · no external calls";
  if (v("ask.engine") === "local") return "Local deterministic engine";
  if (state.brainState === "ready") return "Brain 2.2 + 1.2 + local fallback";
  if (state.brainState === "loading") return "Loading verified Brain…";
  return "Deterministic Brain + local fallback";
}

function renderChatMessages() {
  const windowEl = $("#chat-window");
  if (!windowEl) return;
  if (!state.chat.length) {
    state.chat.push(welcomeMessage());
    saveChat();
  }
  windowEl.innerHTML = state.chat.map((message, index) => chatMessageHtml(message, index)).join("");
  if (v("ask.autoScroll")) windowEl.scrollTop = windowEl.scrollHeight;
}

function welcomeMessage() {
  return {
    role: "assistant",
    html: `<p><strong>Ask me anything about your college day.</strong></p><p>I read the official timetable, room release, your saved section and the published datesheet. I answer from that data only — I never guess a class, teacher, room or date.</p>`,
    createdAt: new Date().toISOString(),
    meta: { intent: "WELCOME", confidence: 1, engine: "local", source: "" }
  };
}

function chatMessageHtml(message, index) {
  const meta = message.meta || {};
  const showDiagnostics = hasAdminMode();
  const badges = [];
  if (showDiagnostics && meta.engine && meta.engine !== "welcome") badges.push(`<span class="badge">${escapeHtml(engineLabel(meta.engine))}</span>`);
  if (showDiagnostics && v("ask.confidence") && Number.isFinite(meta.confidence) && meta.confidence < 1) badges.push(`<span class="badge">${Math.round(meta.confidence * 100)}% confidence</span>`);
  if (showDiagnostics && meta.cached) badges.push(`<span class="badge">cached</span>`);
  const why = showDiagnostics && v("ask.why") && Array.isArray(meta.plan) && meta.plan.length
    ? `<details class="answer-meta"><summary>Why this answer</summary><ol>${meta.plan.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></details>` : "";
  return `<article class="msg ${message.role}" data-message-index="${index}">
    <div class="msg-bubble">${sanitizeHtml(message.html)}</div>
    <div class="msg-meta">${badges.join("")}<time>${escapeHtml(messageTime(message.createdAt))}</time></div>
    ${why}
    <div class="msg-actions">${message.role === "assistant" ? `<button class="msg-action" data-action="copy-message" data-index="${index}">Copy</button>` : ""}<button class="msg-action" data-action="ask-again" data-index="${index}">Ask again</button></div>
  </article>`;
}

function engineLabel(engine) {
  if (engine === "brain-2.2") return "Brain 2.2";
  if (engine === "brain-1.2") return "Brain 1.2";
  if (engine === "brain-2.0") return "Brain 2.0";
  if (engine === "ai") return "AI relay · open-ended";
  return "Local engine";
}

function messageTime(iso) {
  const date = new Date(iso || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function saveChat() {
  if (!v("ask.history")) { storageRemove(CHAT_KEY); return; }
  try {
    storageSet(CHAT_KEY, JSON.stringify(state.chat.slice(-40)));
  } catch { /* storage full */ }
}

function loadChat() {
  try {
    const saved = JSON.parse(storageGet(CHAT_KEY) || "[]");
    if (!Array.isArray(saved)) return;
    state.chat = saved
      .filter((message) => message && typeof message.html === "string" && ["user", "assistant"].includes(message.role))
      .slice(-40)
      .map((message) => ({ ...message, html: sanitizeHtml(message.html) }));
  } catch { state.chat = []; }
}

/** Bounded wait so a question typed during the first load can still be answered. */
async function waitForVerifiedSchedule(maxMs = 4000) {
  if (state.schedule.length) return true;
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (state.schedule.length) return true;
    if (state.dataStatus === "error") return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return state.schedule.length > 0;
}

async function sendQuestion(rawQuestion) {
  const question = String(rawQuestion || "").trim().slice(0, 800);
  if (!question || state.busy) return;
  state.busy = true;
  state.chat.push({ role: "user", html: `<p>${escapeHtml(question)}</p>`, createdAt: new Date().toISOString() });
  saveChat();
  const thinking = { role: "assistant", html: `<div class="thinking"><span class="dots"><span></span><span></span><span></span></span> Checking verified data…</div>`, createdAt: new Date().toISOString(), meta: { intent: "THINKING", engine: "local" } };
  state.chat.push(thinking);
  renderChatMessages();
  const thinkingIndex = state.chat.length - 1;

  try {
    if (question.toUpperCase() === "KKJ") {
      const answer = await unlockAdminMode();
      state.chat[thinkingIndex] = {
        role: "assistant",
        html: textToHtml(answer),
        createdAt: new Date().toISOString(),
        meta: { intent: "ADMIN_MODE", confidence: 1, plan: ["verify owner profile, device and network", "keep publishing behind Admin token"], engine: "local" }
      };
      return;
    }
    if (!state.schedule.length) await waitForVerifiedSchedule();
    if (/\b(?:syllabus|syllabi|unit|units|chapter|chapters|course outline)\b/i.test(question)) await loadFirstYearSyllabusKnowledge();
    const ctx = currentAnswerContext();
    let answer = null;
    let engine = "local";

    const previousSyllabusCode = [...state.chat.slice(0, thinkingIndex)].reverse()
      .find((message) => message.role === "assistant" && message.meta?.entities?.syllabusCourseCode)?.meta.entities.syllabusCourseCode || "";
    const syllabusAnswer = answerFirstYearSyllabus(question, state.firstYearSyllabusCourses, previousSyllabusCode);
    if (syllabusAnswer) {
      answer = syllabusAnswer;
      engine = "local";
    }

    if (!answer && v("ask.engine") === "auto" && !v("privacy.localOnly")) {
      if (state.brainState !== "ready") {
        state.brainState = "loading";
        updateChatHead();
        const loaded = await loadBrainScripts();
        state.brainState = loaded ? "ready" : "failed";
        updateChatHead();
      }
      if (state.brainState === "ready") {
        const brain = runBrain(question, ctx);
        state.debug.attempts = brain.attempts;
        if (brain.result) {
          answer = { html: brain.result.answer, intent: brain.result.intent, confidence: brain.result.confidence, plan: brain.result.plan || [], source: "" };
          engine = brain.result.engine;
        }
      }
    }

    if (!answer) {
      const local = answerLocally(question, ctx);
      if (local) answer = local;
    }

    if (!answer && isOpenQuestion(question) && canUseExternalAi()) {
      const ai = await askExternalAi(question, thinkingIndex);
      if (ai) {
        answer = ai.answer;
        engine = "ai";
      }
    }

    if (!answer) {
      answer = {
        html: FALLBACK_REFUSAL + `<div class="chip-row" style="margin-top:10px">${suggestedQuestions().slice(0, 3).map((chip) => `<button class="chip" data-ask-question="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`).join("")}</div>`,
        intent: "REFUSAL",
        confidence: 0,
        plan: ["no verified local match", "no factual guess", "offer supported topics"]
      };
    }

    state.chat[thinkingIndex] = {
      role: "assistant",
      html: answer.html,
      createdAt: new Date().toISOString(),
      meta: {
        intent: answer.intent,
        confidence: answer.confidence,
        plan: answer.plan,
        entities: answer.entities || {},
        engine,
        source: answer.source || "",
        cached: Boolean(answer.cached)
      }
    };
    state.debug.last = state.chat[thinkingIndex].meta;
  } catch (error) {
    state.chat[thinkingIndex] = {
      role: "assistant",
      html: `<p><strong>Something went wrong while preparing the answer.</strong></p><p>Your saved data is unchanged. Please try again or use the legacy build.</p>`,
      createdAt: new Date().toISOString(),
      meta: { intent: "ERROR", engine: "local", confidence: 0 }
    };
    console.error("[Compass] answer failed", error);
  } finally {
    state.busy = false;
    saveChat();
    renderChatMessages();
    updateChatHead();
  }
}

function updateChatHead() {
  const small = $(".chat-head-title small");
  if (small) small.textContent = engineBadge();
}

function currentAnswerContext() {
  const context = buildAnswerContext({
    schedule: effectiveSchedule(),
    allSchedule: state.schedule,
    roomSchedule: state.roomSchedule,
    group: state.group,
    subgroup: state.subgroup,
    profile: state.profile,
    now: now(),
    metadata: state.metadata,
    datesheet: state.datesheet,
    publishedDatesheets: publishedDatesheets(),
    notices: allNotices(),
    papers: allPapers(),
    syllabus: allSyllabus(),
    holidays: holidayOverrides(),
    departments: state.campus.departments,
    clock: v("timetable.clock"),
    showTeacher: v("timetable.showTeacher"),
    showRoom: v("timetable.showRoom"),
    showCode: v("timetable.showCode"),
    roomDuration: Number(v("rooms.defaultDuration")) || 60,
    includeLabs: v("rooms.includeLabs"),
    includeLectureHalls: v("rooms.includeLectureHalls")
  });
  context.conversation = {
    recentTurns: state.chat.slice(-10).filter((message) => message && ["user", "assistant"].includes(message.role)).map((message) => ({
      role: message.role,
      text: String(message.html || "").replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|#39);/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
      intent: message.meta?.intent || ""
    }))
  };
  return context;
}

async function loadFirstYearSyllabusKnowledge() {
  if (state.firstYearSyllabusCourses.length) return state.firstYearSyllabusCourses;
  if (!state.firstYearSyllabusPromise) state.firstYearSyllabusPromise = (async () => {
    try {
      const data = await fetchJson("/api/legacy/data/first-year-syllabus-index.json", {}, 12000);
      state.firstYearSyllabusCourses = parseFirstYearSyllabus(data?.pages || []);
    } catch {
      state.firstYearSyllabusCourses = [];
    }
    return state.firstYearSyllabusCourses;
  })();
  return state.firstYearSyllabusPromise;
}

function canUseExternalAi() {
  if (v("privacy.localOnly") || !v("ask.externalAi")) return false;
  if (!state.online) return false;
  const limit = Number(storageGet("gndec-compass-next-ai-day") || "");
  const used = Number(storageGet("gndec-compass-next-ai-count") || "");
  return !(limit === todayKey() && used >= 12);
}

function todayKey() {
  return now().dateISO;
}

function aiContextPayload() {
  const clock = now();
  return {
    profileLabel: selectionLabel(),
    datasetVersion: state.metadata?.version || "",
    now: { day: clock.day, minutes: clock.minutes, date: clock.date, dateISO: clock.dateISO, time: humanTime(clock.minutes, v("timetable.clock")) },
    classes: classesForDay(clock.day).slice(0, 12).map((entry) => ({
      subject: entry.subject, teacher: entry.teacher, room: entry.room,
      day: entry.day, start: humanTime(entry.start), end: humanTime(entry.end), type: entry.type
    }))
  };
}

async function askExternalAi(question, thinkingIndex) {
  const device = compassDeviceId();
  try {
    const response = await fetch("/api/legacy/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Compass-Device": device },
      body: JSON.stringify({ question, context: aiContextPayload(), ...(hasAdminMode() ? { adminProfile: state.profile, selection: { group: state.group, subgroup: state.subgroup } } : {}), stream: true, heavy: false })
    });
    if (!response.ok) return null;
    const count = Number(storageGet("gndec-compass-next-ai-count") || 0);
    storageSet("gndec-compass-next-ai-day", todayKey());
    storageSet("gndec-compass-next-ai-count", String(limitReset(count) + 1));
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/event-stream")) {
      const data = await response.json().catch(() => null);
      if (!data?.answer) return null;
      return { answer: { html: textToHtml(data.answer), intent: "AI", confidence: 0.7, plan: ["open-ended question", "verified timetable context only", "no student identifiers"] } };
    }
    return await consumeSse(response, thinkingIndex);
  } catch {
    return null;
  }
}

function limitReset(count) {
  const day = storageGet("gndec-compass-next-ai-day");
  return day === todayKey() ? count : 0;
}

function textToHtml(text) {
  return String(text || "").split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`).join("");
}

async function consumeSse(response, thinkingIndex) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let model = "";
  const bubble = document.querySelector(`[data-message-index="${thinkingIndex}"] .msg-bubble`);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      let payload;
      try { payload = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (payload.model) model = payload.model;
      if (payload.error) return null;
      if (typeof payload.delta === "string") text += payload.delta;
      else if (typeof payload.answer === "string") text = payload.answer;
      else if (typeof payload.token === "string") text += payload.token;
      if (bubble && text) bubble.innerHTML = sanitizeHtml(textToHtml(text));
    }
  }
  if (!text.trim()) return null;
  return {
    answer: {
      html: textToHtml(text) + `<p class="answer-source">Open-ended answer from the college AI relay${model ? ` · ${escapeHtml(model.split("/").pop())}` : ""}. Factual timetable answers always use the deterministic engine.</p>`,
      intent: "AI",
      confidence: 0.7,
      plan: ["open-ended question", "redacted context", "factual data never delegated"]
    }
  };
}

function compassDeviceId() {
  let id = storageGet(DEVICE_KEY);
  if (!id) {
    id = `nx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    storageSet(DEVICE_KEY, id);
  }
  return id;
}

function hasAdminMode() {
  try {
    const saved = JSON.parse(storageGet(ADMIN_MODE_KEY) || "null");
    const profileMatches = Boolean(saved && isKaushikAdminProfile()
      && saved.profileFingerprint === adminModeFingerprint()
      && Date.parse(saved.expiresAt || "") > Date.now());
    const active = Boolean(profileMatches && state.adminAiSession?.active
      && state.adminAiSession.expiresAt === saved.expiresAt
      && state.adminAiSession.profileFingerprint === saved.profileFingerprint);
    if (saved && (!isKaushikAdminProfile() || saved.profileFingerprint !== adminModeFingerprint() || Date.parse(saved.expiresAt || "") <= Date.now())) {
      storageRemove(ADMIN_MODE_KEY);
      state.adminAiSession = null;
    }
    return active || (state.adminStatus === "ready" && Boolean(state.adminData));
  } catch {
    storageRemove(ADMIN_MODE_KEY);
    return state.adminStatus === "ready" && Boolean(state.adminData);
  }
}

function isKaushikAdminProfile() {
  const profile = state.profile || {};
  const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const crn = String(profile.crn || "").replace(/[^a-z0-9]+/gi, "").toUpperCase();
  const branch = normalize(profile.branch);
  return normalize(profile.name) === "kaushik jain" && crn === "2617070"
    && (branch === "ec" || branch === "electronics and communication engineering" || branch === "electronics and communication engineering ec")
    && String(profile.section || "").toUpperCase() === "ECB"
    && String(profile.subsection || "").toUpperCase() === "ECB1"
    && String(state.group || "").toUpperCase() === "ECB"
    && String(state.subgroup || "").toUpperCase() === "ECB1";
}

function adminModeFingerprint() {
  const profile = state.profile || {};
  const identity = [profile.name, profile.crn, profile.registrationNo, profile.branch, profile.section, profile.subsection, state.group, state.subgroup]
    .map((value) => String(value || "").trim().toLowerCase()).join("|");
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  return `profile-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function unlockAdminMode() {
  if (!isKaushikAdminProfile()) {
    return "Admin AI mode is available only for the verified owner profile with its matching timetable section and subgroup selected.";
  }
  try {
    const profileFingerprint = adminModeFingerprint();
    const response = await fetch("/api/admin/ai/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Compass-Device": compassDeviceId() },
      body: JSON.stringify({ profile: state.profile, selection: { group: state.group, subgroup: state.subgroup } }),
      cache: "no-store"
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Admin enrollment was rejected.");
    const expiresAt = String(payload?.expiresAt || "");
    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) throw new Error("The server did not return a valid admin session.");
    storageSet(ADMIN_MODE_KEY, JSON.stringify({ expiresAt, profileFingerprint }));
    state.adminAiSession = { active: true, expiresAt, profileFingerprint };
    if (state.route === "settings") render();
    return `Admin AI mode is active on this device until ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(expiresAt))}. It unlocks advanced settings and the owner AI allowance for this verified profile, device, and current network. Publishing and content changes still require the separate Admin token.`;
  } catch (error) {
    return `Admin AI enrollment failed: ${error?.message || "Check the saved profile and try again."}`;
  }
}

async function restoreAdminAiSession() {
  let saved;
  try { saved = JSON.parse(storageGet(ADMIN_MODE_KEY) || "null"); } catch { saved = null; }
  if (!saved || !isKaushikAdminProfile() || saved.profileFingerprint !== adminModeFingerprint() || Date.parse(saved.expiresAt || "") <= Date.now()) {
    if (saved) storageRemove(ADMIN_MODE_KEY);
    state.adminAiSession = null;
    return false;
  }
  try {
    const response = await fetch("/api/admin/ai/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Compass-Device": compassDeviceId() },
      body: JSON.stringify({ profile: state.profile, selection: { group: state.group, subgroup: state.subgroup } }),
      cache: "no-store"
    });
    const payload = await response.json();
    if (!response.ok || !payload?.active || payload.expiresAt !== saved.expiresAt) throw new Error("Admin session is no longer active.");
    state.adminAiSession = { active: true, expiresAt: saved.expiresAt, profileFingerprint: saved.profileFingerprint };
    return true;
  } catch {
    storageRemove(ADMIN_MODE_KEY);
    state.adminAiSession = null;
    return false;
  }
}

function groupBranchCode(group) {
  const code = String(group || "").replace(/^D[23]/, "").toUpperCase();
  const prefixes = [...BRANCHES.map(([prefix]) => prefix), "CS", "EC"].sort((a, b) => b.length - a.length);
  return prefixes.find((prefix) => code.startsWith(prefix)) || "";
}

function branchLabel(code) {
  if (code === "EC") return "ECE · Electronics and Communication Engineering";
  if (code === "CS") return "CSE · Computer Science Engineering";
  const branch = BRANCHES.find(([prefix]) => prefix === code);
  return branch ? `${code} · ${branch[1]}` : code;
}

function sectionUsage() {
  try {
    const saved = JSON.parse(storageGet(GROUP_USAGE_KEY) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

function rankedGroups(groups) {
  const usage = sectionUsage();
  return [...groups].sort((a, b) => (Number(usage[b]) || 0) - (Number(usage[a]) || 0) || a.localeCompare(b));
}

function rankedSubgroups(group) {
  const usage = sectionUsage();
  return subgroupsFor(group).sort((a, b) => (Number(usage[`sub:${group}:${b}`]) || 0) - (Number(usage[`sub:${group}:${a}`]) || 0) || a.localeCompare(b, undefined, { numeric: true }));
}

function recordGroupSelection(group) {
  const usage = sectionUsage();
  usage[group] = Math.min(999, (Number(usage[group]) || 0) + 1);
  storageSet(GROUP_USAGE_KEY, JSON.stringify(usage));
}

function recordSubgroupSelection(group, subgroup) {
  if (!subgroup) return;
  const usage = sectionUsage();
  const key = `sub:${group}:${subgroup}`;
  usage[key] = Math.min(999, (Number(usage[key]) || 0) + 1);
  storageSet(GROUP_USAGE_KEY, JSON.stringify(usage));
}

function branchUsage(code) {
  const usage = sectionUsage();
  return state.groups.filter((group) => groupBranchCode(group) === code).reduce((total, group) => total + (Number(usage[group]) || 0), 0);
}

function timetableBranches() {
  return [...new Set(state.groups.map(groupBranchCode).filter(Boolean))]
    .sort((a, b) => branchUsage(b) - branchUsage(a) || branchLabel(a).localeCompare(branchLabel(b)));
}

function sectionDisplay(group, branch) {
  const code = String(group || "").replace(/^D[23]/, "").toUpperCase();
  if (branch === "EC") return code;
  const suffix = code.slice(branch.length);
  return suffix ? `Section ${suffix} (${code})` : code;
}

function subgroupDisplay(group, subgroup) {
  const value = String(subgroup || "").toUpperCase();
  return groupBranchCode(group) === "EC" ? value.replace(/^EC/, "ECE") : value;
}

/* ── Settings ──────────────────────────────────────────────────────────── */

function renderSettings() {
  const query = state.settingsQuery.trim().toLowerCase();
  const matches = (flag) => !query || `${flag.title} ${flag.description} ${flag.keywords} ${flag.id} ${flag.category}`.toLowerCase().includes(query);
  const adminMode = hasAdminMode();
  const adminOnly = new Set(["data", "privacy", "labs"]);
  const allowedCategories = CATEGORIES.filter((category) => adminMode || !adminOnly.has(category.id));
  const visibleCategories = allowedCategories.filter((category) => !query || FLAGS.some((flag) => flag.category === category.id && matches(flag)));
  const overview = !query && state.settingsCategory === "overview";
  const accessDenied = !adminMode && adminOnly.has(state.settingsCategory);
  const active = accessDenied ? null : visibleCategories.find((category) => category.id === state.settingsCategory) || visibleCategories[0];
  const askDiagnostics = new Set(["ask.engine", "ask.confidence", "ask.why"]);
  const flags = FLAGS.filter((flag) => (adminMode || (!adminOnly.has(flag.category) && !askDiagnostics.has(flag.id))) && (query ? matches(flag) : flag.category === active?.id));
  const everydayIds = ["appearance.theme", "appearance.accent", "appearance.palette", "appearance.background", "appearance.density", "timetable.view", "timetable.clock", "ask.language"];
  const everydayFlags = everydayIds.map((id) => FLAGS.find((flag) => flag.id === id)).filter(Boolean);

  return `<div class="page page-settings">
    <div class="page-head">
      <div class="page-head-text"><h2 class="page-title">Settings</h2><p class="page-sub">Personalise Compass, verify your student profile, or open the classic app.</p></div>
      <div class="page-actions"><input type="search" class="btn btn-sm" style="min-width:220px;text-align:left" placeholder="Search all settings…" value="${escapeHtml(state.settingsQuery)}" data-settings-search aria-label="Search all settings" /></div>
    </div>
    ${overview ? `<div class="settings-overview">
      ${renderProfileCard()}
      <section class="card quick-settings"><div class="card-head"><div><h2 class="card-title">Everyday preferences</h2><p class="card-sub">Theme, colours, timetable and language.</p></div></div>${everydayFlags.map(renderFlagRow).join("")}</section>
      <details class="card settings-advanced"><summary><span><strong>More settings</strong><small>Optional controls and additional app tools</small></span><span aria-hidden="true">＋</span></summary>
        <div class="preset-row">${PRESETS.map((preset) => `<button class="preset" data-action="preset" data-preset="${preset.id}"><strong>${escapeHtml(preset.title)}</strong><small>${escapeHtml(preset.description)}</small></button>`).join("")}</div>
        ${!adminMode ? `<p class="settings-admin-hint">Privacy, Data & offline, and Advanced & Labs appear after the verified owner unlocks Admin AI mode with <code>KKJ</code> in Ask Compass. Publishing still requires a separate token.</p>` : `<p class="settings-admin-hint is-active">Admin mode active · privileged settings are visible on this device.</p>`}
        <nav class="settings-category-grid" aria-label="Additional settings">${allowedCategories.map((category) => `<button class="settings-nav-item" data-action="settings-category" data-category="${category.id}">${escapeHtml(category.title)} <span aria-hidden="true">›</span></button>`).join("")}</nav>
        <details class="settings-special"><summary>Special option · App versions & backups</summary>${renderVersionCard()}</details>
      </details>
    </div>` : `<div class="settings-layout">
      <nav class="settings-side" aria-label="Settings sections">
        <button class="settings-nav-item" data-action="settings-category" data-category="overview">Settings home</button>
        ${visibleCategories.map((category) => `<button class="settings-nav-item ${category.id === active?.id ? "is-active" : ""}" data-action="settings-category" data-category="${category.id}">${escapeHtml(category.title)}</button>`).join("")}
      </nav>
      <div class="settings-content">
        <div class="preset-row">${PRESETS.map((preset) => `<button class="preset" data-action="preset" data-preset="${preset.id}"><strong>${escapeHtml(preset.title)}</strong><small>${escapeHtml(preset.description)}</small></button>`).join("")}</div>
        ${query ? `<p class="card-sub">${flags.length} matching control${flags.length === 1 ? "" : "s"}</p>` : ""}
        ${active ? `<section class="setting-section card" id="settings-${active.id}">
          <div class="setting-section-head"><div><h2>${escapeHtml(active.title)}</h2><p>${escapeHtml(active.description)}</p></div><button class="btn btn-sm" data-action="reset-section" data-category="${active.id}">Reset section</button></div>
          ${active.id === "data" ? renderStorageCard() : ""}
          ${flags.length ? flags.map((flag) => renderFlagRow(flag)).join("") : `<p class="card-sub">No control matches “${escapeHtml(query)}”.</p>`}
          ${active.id === "labs" && v("labs.flagInspector") ? renderFlagInspector() : ""}
          ${active.id === "labs" ? renderDangerZone() : ""}
        </section>` : accessDenied ? `<div class="card">${emptyState("🔒", "Admin mode required", `Send KKJ in Ask Compass from the verified owner profile to open ${escapeHtml(CATEGORIES.find((category) => category.id === state.settingsCategory)?.title || "this section")}.`)}</div>` : `<div class="card">${emptyState("⚙", "No matching setting", `Nothing matches “${escapeHtml(state.settingsQuery)}”.`)}</div>`}
      </div>
    </div>`}
  </div>`;
}

function renderFlagRow(flag) {
  if (flag.type === "action") {
    return `<div class="setting-row" id="setting-${flag.id}">
      <div class="setting-text"><div class="setting-label">${escapeHtml(flag.title)}${flag.badge ? ` <span class="badge">${escapeHtml(flag.badge)}</span>` : ""}</div><div class="setting-desc">${escapeHtml(flag.description)}</div></div>
      <div class="setting-control"><button class="btn btn-sm ${flag.risk === "high" ? "btn-danger" : ""}" data-action="flag-action" data-flag="${flag.id}">Run</button></div>
    </div>`;
  }
  const available = isFlagAvailable(flag, state.values);
  const value = state.values[flag.id];
  const source = state.sources[flag.id];
  let control = "";
  if (flag.type === "boolean") {
    control = `<label class="switch"><input type="checkbox" data-setting="${flag.id}" ${value ? "checked" : ""} ${available ? "" : "disabled"} aria-label="${escapeHtml(flag.title)}" /><span class="switch-track"></span></label>`;
  } else if (flag.type === "select") {
    control = `<select data-setting="${flag.id}" ${available ? "" : "disabled"} aria-label="${escapeHtml(flag.title)}">${flag.values.map((option) => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
  } else if (flag.type === "range") {
    control = `<div class="range-wrap"><input type="range" data-setting="${flag.id}" data-range="${flag.id}" min="${flag.min}" max="${flag.max}" step="${flag.step}" value="${value}" ${available ? "" : "disabled"} aria-label="${escapeHtml(flag.title)}" /><output id="out-${flag.id}">${value} ${escapeHtml(flag.unit || "")}</output></div>`;
  }
  const managed = source === "admin" ? `<div class="setting-note">Managed by the college admin. Your device value is kept but overridden.</div>` : "";
  return `<div class="setting-row${available ? "" : " is-disabled"}" id="setting-${flag.id}">
    <div class="setting-text">
      <div class="setting-label">${escapeHtml(flag.title)}${flag.badge ? ` <span class="badge${flag.status === "experimental" ? " badge-warn" : ""}">${escapeHtml(flag.badge)}</span>` : ""}${flag.requiresRestart ? ` <span class="badge">Restart</span>` : ""}</div>
      <div class="setting-desc">${escapeHtml(flag.description)}</div>
      ${flag.note ? `<div class="setting-note">${escapeHtml(flag.note)}</div>` : ""}
      ${managed}
    </div>
    <div class="setting-control">${control}</div>
  </div>`;
}

function renderVersionCard() {
  const version = state.version;
  const uniqueSnapshots = new Map();
  for (const snapshot of state.snapshots || []) {
    const key = snapshot.releaseKey || `older:${snapshot.version || "release"}`;
    const previousSnapshot = uniqueSnapshots.get(key);
    if (!previousSnapshot || String(snapshot.createdAt) > String(previousSnapshot.createdAt)) uniqueSnapshots.set(key, snapshot);
  }
  const snapshots = [...uniqueSnapshots.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const previous = version?.previous || null;
  return `<div class="card version-card" style="margin:14px 0">
    <div class="card-head"><div><h2 class="card-title">App versions & backups</h2><p class="card-sub">Open the classic app if you prefer it, or restore a saved timetable for offline use.</p></div></div>
    <div class="build-switch">
      <div class="build-card is-current">
        <span class="badge badge-accent">Current</span>
        <strong>Compass Next · v${escapeHtml(version?.app?.version || APP_VERSION)}</strong>
        <small>This is the app you are using now.</small>
      </div>
      <button class="build-card" data-action="open-previous" ${v("experience.previousBuild") ? "" : "hidden"}>
        <span class="badge">Previous</span>
        <strong>${escapeHtml(previous?.label || "Previous generation")}</strong>
        <small>${escapeHtml(previous?.note || "Opens separately; its saved settings are not shared.")}</small>
      </button>
      <button class="build-card" data-action="open-legacy">
        <span class="badge">Classic app</span>
        <strong>GNDEC Compass</strong>
        <small>Opens the classic site separately. It has its own saved data.</small>
      </button>
    </div>
    <div class="chip-row" style="margin-top:14px">
      <button class="btn btn-sm" data-action="refresh-data">Check for updates</button>
      <button class="btn btn-sm" data-action="export-data">Export data</button>
      <button class="btn btn-sm" data-action="import-data">Import data</button>
      <button class="btn btn-sm" data-action="open-admin" ${v("experience.adminLink") ? "" : "hidden"}>Admin & publishing</button>
    </div>
    <details class="version-details"><summary>Technical details</summary><div class="version-grid">
      <dl class="version-cell"><dt>Build date</dt><dd>${escapeHtml(version?.app?.build || "not available")}</dd></dl>
      <dl class="version-cell"><dt>Timetable revision</dt><dd>${escapeHtml(state.metadata?.version || "not loaded")}</dd></dl>
      <dl class="version-cell"><dt>Last verified</dt><dd>${escapeHtml(shortDate(state.metadata?.checkedAt || state.lastSync))}</dd></dl>
      <dl class="version-cell"><dt>Shared content</dt><dd>${version?.content?.store ? "Available" : "Not configured"}</dd></dl>
      <dl class="version-cell"><dt>Admin service</dt><dd>${version?.content?.admin ? "Available" : "Not configured"}</dd></dl>
    </div><p class="card-sub">Classic app address: <code>${escapeHtml(state.legacyUrl)}</code></p></details>
    <div class="snapshot-list">
      <strong class="snapshot-heading">Offline timetable backups</strong>
      ${snapshots.length ? snapshots.map((snapshot) => `<div class="snapshot-row"><span><strong>Revision ${escapeHtml(snapshot.version || "unknown")}</strong> <time>saved ${escapeHtml(shortDate(snapshot.createdAt))}</time> · ${snapshot.entries || snapshot.scheduleCount || 0} classes</span><button class="btn btn-sm" data-action="restore-snapshot" data-id="${escapeHtml(snapshot.id)}">Restore</button><button class="btn btn-sm btn-ghost" data-action="delete-snapshot" data-id="${escapeHtml(snapshot.id)}" aria-label="Delete backup saved ${escapeHtml(shortDate(snapshot.createdAt))}">Delete</button></div>`).join("") : `<p class="card-sub">No offline backup yet. Compass saves a verified timetable here when it updates.</p>`}
    </div>
  </div>`;
}

function renderProfileCard() {
  const profile = state.profile;
  return `<div class="card" style="margin:14px 0">
    <div class="card-head"><div><h2 class="card-title">Find your student profile</h2><p class="card-sub">Start typing your name, CRN, registration number, or serial number. Choose a roster suggestion to fill your section, subgroup and mentor on this device.</p></div></div>
    <div class="profile-lookup"><label class="visually-hidden" for="profile-lookup">Your name, CRN, registration, or serial number</label><input id="profile-lookup" data-profile-lookup-query value="${escapeHtml(state.profileLookupQuery || profile.name || profile.crn || "")}" placeholder="Start with your name, CRN, registration, or serial" autocomplete="off" /><button class="btn btn-primary" data-action="lookup-profile">Find my profile</button></div>
    <div data-profile-lookup-results aria-live="polite">${state.profileLookupMessage ? `<p class="profile-lookup-message" role="status">${escapeHtml(state.profileLookupMessage)}</p>` : ""}${state.profileLookupMatches.length ? `<div class="profile-match-list" aria-label="Choose your matching student profile">${state.profileLookupMatches.map((record, index) => `<button class="profile-match" data-action="choose-profile-match" data-profile-index="${index}"><strong>${escapeHtml(record.name || "Student")}</strong><span>${escapeHtml([record.branch, record.section, record.subsection].filter(Boolean).join(" · "))}</span><small>CRN ${escapeHtml(record.crn || "not published")}</small></button>`).join("")}</div>` : ""}</div>
    ${profile.rosterVersion ? `<p class="profile-verified"><span class="badge badge-accent">Roster matched</span> ${escapeHtml(profile.name || "Student")} · ${escapeHtml([profile.section, profile.subsection].filter(Boolean).join(" / ") || "Section not listed")}${profile.mentor ? ` · Mentor ${escapeHtml(profile.mentor)}` : ""}${state.rosterGeneratedAt ? ` · roster ${escapeHtml(shortDate(state.rosterGeneratedAt))}` : ""}</p>` : `<p class="profile-verified">Your profile stays on this device. A name is applied only when the roster match is unambiguous.</p>`}
    <div class="profile-grid profile-main-grid">
      <div class="field"><label for="profile-name">Name</label><input id="profile-name" data-profile="name" value="${escapeHtml(profile.name || "")}" autocomplete="name" /></div>
      <div class="field"><label for="profile-crn">CRN</label><input id="profile-crn" data-profile="crn" value="${escapeHtml(profile.crn || "")}" inputmode="numeric" /></div>
      <div class="field"><label for="profile-registration">Registration no.</label><input id="profile-registration" data-profile="registrationNo" value="${escapeHtml(profile.registrationNo || "")}" /></div>
      <div class="field"><label for="profile-serial">Serial number</label><input id="profile-serial" value="${escapeHtml(profile.serialNo || "Not published")}" readonly aria-readonly="true" /></div>
      <div class="field"><label for="profile-section">Section</label><select id="profile-section" data-profile="section"><option value="">Not set</option>${rankedGroups(state.groups).map((group) => `<option value="${escapeHtml(group)}" ${group === profile.section ? "selected" : ""}>${escapeHtml(sectionDisplay(group, groupBranchCode(group)))}</option>`).join("")}</select></div>
      <div class="field"><label for="profile-subsection">Sub-group</label><select id="profile-subsection" data-profile="subsection"><option value="">Whole section</option>${rankedSubgroups(profile.section || state.group).map((subgroup) => `<option value="${escapeHtml(subgroup)}" ${subgroup === profile.subsection ? "selected" : ""}>${escapeHtml(subgroupDisplay(profile.section || state.group, subgroup))}</option>`).join("")}</select></div>
    </div>
    <section class="profile-mentoring" aria-labelledby="profile-mentoring-title">
      <div class="profile-mentoring-head"><h3 id="profile-mentoring-title">Mentoring details</h3><p>Official roster details take priority.</p></div>
      <div class="profile-grid">
      <div class="field"><label for="profile-mentor">Mentor</label><input id="profile-mentor" data-profile="mentor" value="${escapeHtml(profile.mentor || "")}" /></div>
      <div class="field"><label for="profile-mentor-phone">Mentor phone</label><input id="profile-mentor-phone" data-profile="mentorPhone" value="${escapeHtml(profile.mentorPhone || "")}" inputmode="tel" /></div>
      <div class="field"><label for="profile-mentor-venue">Mentoring venue</label><input id="profile-mentor-venue" data-profile="mentorVenue" value="${escapeHtml(profile.mentorVenue || "")}" /></div>
      <div class="field"><label for="profile-academic-group">Mentoring group</label><input id="profile-academic-group" data-profile="academicGroup" list="academic-group-options" value="${escapeHtml(profile.academicGroup || "")}" placeholder="e.g. ECB1-M1" /><datalist id="academic-group-options">${academicGroups().map((group) => `<option value="${escapeHtml(group)}"></option>`).join("")}</datalist></div>
      </div>
    </section>
    <p class="card-sub" style="margin-top:10px">Manual mentor details apply only when the official timetable leaves those fields blank. Verified roster details take precedence.</p>
    <div class="chip-row" style="margin-top:12px"><button class="btn btn-primary btn-sm" data-action="save-profile">Save profile</button><button class="btn btn-sm" data-action="use-profile-section">Use profile section</button></div>
  </div>`;
}

function renderStorageCard() {
  return `<div class="card" style="margin:14px 0">
    <div class="card-head"><div><h2 class="card-title">Device storage</h2><p class="card-sub" id="storage-summary">Checking…</p></div></div>
    <div class="chip-row">
      <button class="btn btn-sm" data-action="persist-storage">Make offline storage persistent</button>
      <button class="btn btn-sm" data-action="clear-cache">Clear app cache</button>
      <button class="btn btn-sm" data-action="download-offline">Download offline data</button>
    </div>
  </div>`;
}

function renderFlagInspector() {
  const rows = FLAGS.filter((flag) => flag.type !== "action").slice(0, 40).map((flag) => `<tr><td>${escapeHtml(flag.id)}</td><td>${escapeHtml(String(state.values[flag.id]))}</td><td>${escapeHtml(state.sources[flag.id] || "default")}</td></tr>`).join("");
  return `<div class="card" style="margin-top:14px"><div class="card-head"><div><h2 class="card-title">Flag inspector</h2><p class="card-sub">Effective value and source for every control.</p></div></div><div class="week-wrap"><table class="week-table" style="min-width:520px"><thead><tr><th>Flag</th><th>Value</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderDangerZone() {
  return `<div class="card danger-zone" style="margin-top:14px">
    <div class="card-head"><div><h2 class="card-title">Danger zone</h2><p class="card-sub">These actions only touch this device.</p></div></div>
    <div class="chip-row">
      <button class="btn btn-sm btn-danger" data-action="delete-all">Delete everything</button>
      <button class="btn btn-sm" data-action="reset-all">Reset all settings</button>
    </div>
  </div>`;
}

/* ── Command palette ───────────────────────────────────────────────────── */

function commandItems() {
  const items = [
    ...Object.entries(ROUTES).map(([route, meta]) => ({ label: `Go to ${meta.title}`, kind: "page", action: () => navigate(route) })),
    { label: "Open legacy build", kind: "action", action: openLegacy },
    { label: "Check for official updates", kind: "action", action: () => loadLiveData({ manual: true }) },
    { label: "Toggle light / dark theme", kind: "action", action: toggleTheme },
    { label: "Export timetable as .ics", kind: "action", action: exportIcs },
    { label: "Clear app cache", kind: "action", action: clearCache },
    { label: "Ask: What is my next class?", kind: "ask", action: () => askFromAnywhere("What is my next class?") },
    { label: "Find a teacher timetable", kind: "page", action: () => navigate("teachers") },
    ...CATEGORIES.map((category) => ({ label: `Settings · ${category.title}`, kind: "setting", action: () => navigate(`settings/${category.id}`) }))
  ];
  return items;
}

function goToDirectory(tab, query) {
  state.directoryTab = tab;
  state.directoryQuery = query;
  navigate("directory");
}

function selectTimetable(group, subgroup = "") {
  if (!state.groups.includes(group)) return;
  state.group = group;
  state.subgroup = subgroupsFor(group).includes(subgroup) ? subgroup : "";
  persistSelection();
  navigate("timetable");
}

function renderCommandResults(query = "") {
  const root = $("#command-results");
  if (!root) return;
  const text = query.trim().toLowerCase();
  const items = commandItems().filter((item) => !text || item.label.toLowerCase().includes(text));
  // Universal find: one palette over timetable entities, sections, notices,
  // papers, syllabus and the faculty/student directory. Every result is
  // verified data already loaded from an official source.
  const entityItems = [];
  if (text.length >= 2) {
    const seen = new Set();
    const push = (label, kind, action) => {
      const key = `${kind}:${label}`.toLowerCase();
      if (seen.has(key) || entityItems.length >= 10) return;
      seen.add(key);
      entityItems.push({ label, kind, action });
    };
    const ask = (label, question) => push(label, "find", () => askFromAnywhere(question));
    for (const entry of state.schedule) {
      if (!entry) continue;
      if (entry.subject && entry.subject.toLowerCase().includes(text)) ask(`Ask: where is ${entry.subject}?`, `where is ${entry.subject}`);
      if (entry.teacher && entry.teacher.toLowerCase().includes(text)) ask(`Ask: ${entry.teacher} timetable`, `${entry.teacher} timetable`);
      if (entry.group && entry.group.toLowerCase().includes(text)) push(`${entry.group} timetable`, "section", () => selectTimetable(entry.group));
      if (entry.cohorts && entry.cohorts.toLowerCase().includes(text)) {
        const cohort = String(entry.cohorts).split(/\s*,\s*/).find((value) => value.toLowerCase().includes(text));
        if (cohort && cohort !== entry.group) push(`${cohort} timetable`, "subsection", () => selectTimetable(entry.group, cohort));
      }
    }
    for (const entry of state.roomSchedule) {
      if (entry?.room && entry.room.toLowerCase().includes(text)) ask(`Ask: is ${entry.room} free now?`, `is ${entry.room} free now`);
    }
    for (const name of teacherNames()) {
      if (name.toLowerCase().includes(text)) {
        push(`Teacher: ${name}`, "teacher", () => { state.teacherSelected = name; state.teacherQuery = ""; navigate("teachers"); });
      }
    }
    for (const notice of allNotices()) {
      if (notice.title && notice.title.toLowerCase().includes(text)) {
        push(`Notice: ${notice.title}`, "notice", () => { state.noticeQuery = notice.title; navigate("notices"); });
      }
    }
    for (const paper of allPapers()) {
      const haystack = `${paper.subject} ${paper.code} ${paper.department} ${paper.title}`;
      if (haystack.toLowerCase().includes(text)) {
        push(`Paper: ${paper.title}`, "paper", () => { state.paperQuery = paper.subject || paper.title; navigate("papers"); });
      }
    }
    for (const doc of allSyllabus()) {
      const haystack = `${doc.label} ${doc.department} ${doc.semester}`;
      if (haystack.toLowerCase().includes(text)) {
        push(`Syllabus: ${doc.label}`, "syllabus", () => { state.syllabusQuery = doc.label; navigate("syllabus"); });
      }
    }
    for (const sheet of publishedDatesheets()) {
      const haystack = `${sheet.title || ""} ${sheet.scope || ""} ${sheet.department || ""} ${sheet.body || ""}`;
      if (haystack.toLowerCase().includes(text)) {
        push(`Date sheet: ${sheet.title || "published sheet"}`, "datesheet", () => navigate("calendar"));
      }
    }
    for (const faculty of state.faculty) {
      if (faculty?.name && `${faculty.name} ${faculty.department || ""}`.toLowerCase().includes(text)) {
        push(`Faculty: ${faculty.name}`, "faculty", () => goToDirectory("faculty", faculty.name));
      }
    }
    for (const student of state.students) {
      const haystack = `${student?.name || ""} ${student?.crn || ""} ${student?.registrationNo || ""}`;
      if (student?.name && haystack.toLowerCase().includes(text)) {
        push(`Student: ${student.name}`, "student", () => goToDirectory("students", student.name));
      }
    }
    for (const group of mentoringGroups()) {
      if (`${group.academicGroup} ${group.section} ${group.mentor}`.toLowerCase().includes(text)) {
        push(`Mentoring: ${group.academicGroup || group.section} · ${group.mentor}`, "mentoring", () => goToDirectory("mentoring", group.academicGroup || group.section));
      }
    }
  }
  const visible = [...items, ...entityItems].slice(0, 14);
  root.dataset.active = "0";
  root.innerHTML = visible.length ? visible.map((item, index) => `<button class="command-item ${index === 0 ? "is-active" : ""}" data-command-index="${index}"><span>${escapeHtml(item.label)}</span><span class="cmd-kind">${escapeHtml(item.kind)}</span></button>`).join("") : `<div class="empty" style="padding:24px"><p class="empty-text">No command matches that.</p></div>`;
  root._items = visible;
}

function toggleCommand(open = undefined) {
  const palette = $("#command-palette");
  if (!palette) return;
  const shouldOpen = open ?? palette.hidden;
  palette.hidden = !shouldOpen;
  $("#scrim").hidden = !shouldOpen;
  if (shouldOpen) {
    renderCommandResults("");
    const input = $("#command-input");
    if (input) { input.value = ""; input.focus(); }
  }
}

/* ── Actions ───────────────────────────────────────────────────────────── */

function openLegacy() {
  const url = state.legacyUrl;
  if (v("experience.legacyNewTab")) window.open(url, "_blank", "noopener,noreferrer");
  else location.href = url;
}

function openPreviousBuild() {
  const url = state.version?.previous?.url;
  if (!url) { toast("The previous build URL was not published by the Worker.", "error"); return; }
  window.open(url, "_blank", "noopener,noreferrer");
}

function toggleTheme() {
  const current = v("appearance.theme");
  const index = THEME_ORDER.indexOf(current);
  const next = THEME_ORDER[(index + 1) % THEME_ORDER.length];
  setFlag("appearance.theme", next);
  render();
  toast(`Theme: ${next}`);
}

async function clearCache() {
  const removed = await clearAppCaches();
  toast(`Cleared ${removed} cache${removed === 1 ? "" : "s"}. Your settings and profile are unchanged.`, "success");
}

async function refreshStorageSummary() {
  const summary = $("#storage-summary");
  if (!summary) return;
  const estimate = await storageEstimate();
  const snapshots = state.snapshots.length;
  summary.textContent = estimate.supported
    ? `${formatBytes(estimate.usage)} used of ${formatBytes(estimate.quota)} available · ${snapshots} snapshot${snapshots === 1 ? "" : "s"}`
    : `${snapshots} snapshot${snapshots === 1 ? "" : "s"} stored on this device`;
}

function askFromAnywhere(question) {
  toggleCommand(false);
  toggleSidebar(false);
  if (state.route !== "ask") navigate("ask");
  setTimeout(() => sendQuestion(question), 60);
}

async function handleAction(action, element) {
  switch (action) {
    case "retry-notices":
      state.noticesStatus = "idle";
      state.contentStatus = "idle";
      state.campusStatus = "idle";
      render();
      ensureLiveContent();
      break;
    case "retry-papers":
      state.papersStatus = "idle";
      render();
      ensureLiveContent();
      break;
    case "retry-syllabus":
      state.contentStatus = "idle";
      state.campusStatus = "idle";
      render();
      ensureLiveContent();
      break;
    case "notice-category":
      state.noticeCategory = element.dataset.category || "";
      render();
      break;
    case "syllabus-department":
      state.syllabusDepartment = element.dataset.department || "";
      render();
      break;
    case "open-admin":
      navigate("admin");
      break;
    case "open-previous":
      openPreviousBuild();
      break;
    case "admin-sign-in": {
      const token = ($("[data-admin-token]")?.value || "").trim();
      if (!token) { toast("Paste the admin token first.", "error"); break; }
      setAdminToken(token);
      await adminLoad();
      break;
    }
    case "admin-sign-out":
      setAdminToken("");
      state.adminData = null;
      state.adminStatus = "signed-out";
      state.adminEditing = null;
      state.adminError = "";
      render();
      toast("Signed out of admin.");
      break;
    case "admin-refresh":
      await adminLoad();
      break;
    case "admin-tab":
      state.adminTab = element.dataset.tab || "notices";
      state.adminEditing = null;
      render();
      break;
    case "admin-new":
      state.adminTab = element.dataset.collection || state.adminTab;
      state.adminEditing = { collection: state.adminTab, item: {} };
      render();
      break;
    case "admin-edit": {
      const collection = element.dataset.collection;
      const item = adminItems(collection).find((row) => row.id === element.dataset.id);
      if (!item) { toast("That item is no longer in the store.", "error"); break; }
      state.adminTab = collection;
      state.adminEditing = { collection, item: { ...item } };
      render();
      break;
    }
    case "admin-cancel":
      state.adminEditing = null;
      render();
      break;
    case "admin-save":
      await adminSave();
      break;
    case "admin-delete":
      await adminDelete(element.dataset.collection, element.dataset.id);
      break;
    case "admin-toggle":
      await adminToggle(element.dataset.collection, element.dataset.id);
      break;
    case "admin-restore":
      await adminRestore(element.dataset.collection);
      break;
    case "admin-editor-add": {
      const name = ($("#admin-editor-name")?.value || "").trim();
      const token = $("#admin-editor-token")?.value || "";
      try {
        await adminRequest("/api/admin/editors", { method: "POST", body: { name, token } });
        toast(`Editor “${name}” added.`, "success");
        await adminLoad({ silent: true });
      } catch (error) {
        toast(String(error.message || "Could not add the editor."), "error");
      }
      break;
    }
    case "admin-editor-remove": {
      const name = element.dataset.name || "";
      if (!window.confirm(`Remove editor “${name}”? Their token stops working immediately.`)) break;
      try {
        await adminRequest("/api/admin/editors", { method: "DELETE", body: { name } });
        toast("Editor removed.", "success");
        await adminLoad({ silent: true });
      } catch (error) {
        toast(String(error.message || "Could not remove the editor."), "error");
      }
      break;
    }
    case "retry-directory":
      state.directoryStatus = "idle";
      render();
      break;
    case "swap-compare": {
      const first = state.compareA;
      state.compareA = state.compareB;
      state.compareB = first;
      render();
      break;
    }
    case "refresh-data":
      await loadLiveData({ manual: true });
      await loadSnapshots();
      break;
    case "tt-view":
      setFlag("timetable.view", element.dataset.view);
      render();
      break;
    case "tt-day":
      state.day = element.dataset.day;
      render();
      break;
    case "room-zone":
      state.roomZone = element.dataset.zone || "";
      render();
      break;
    case "room-now":
      state.roomTime = "";
      state.roomDay = now().day;
      render();
      break;
    case "open-rooms":
      navigate("rooms");
      break;
    case "open-legacy":
      openLegacy();
      break;
    case "preset": {
      const preset = element.dataset.preset;
      state.values = applyPreset(state.values, preset);
      persistSettings();
      applyAppearance();
      render();
      toast(`Preset applied: ${preset.replace(/-/g, " ")}`, "success");
      break;
    }
    case "settings-category":
      state.settingsCategory = element.dataset.category;
      history.replaceState(null, "", `#/settings/${state.settingsCategory}`);
      state.route = "settings";
      render();
      break;
    case "reset-section":
      state.values = resetValues(state.values, element.dataset.category);
      persistSettings();
      applyAppearance();
      render();
      toast("Section reset to defaults.");
      break;
    case "reset-all":
      state.values = defaultValues();
      persistSettings();
      applyAppearance();
      render();
      toast("All settings reset.");
      break;
    case "toggle-engine":
      setFlag("ask.engine", v("ask.engine") === "auto" ? "local" : "auto");
      render();
      break;
    case "clear-chat":
      state.chat = [];
      saveChat();
      render();
      toast("Conversation cleared.");
      break;
    case "copy-message": {
      const message = state.chat[Number(element.dataset.index)];
      if (message) {
        const text = message.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        navigator.clipboard?.writeText(text).then(() => toast("Copied.")).catch(() => toast("Copy failed.", "error"));
      }
      break;
    }
    case "ask-again": {
      const message = state.chat[Number(element.dataset.index)];
      if (message) sendQuestion(message.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300));
      break;
    }
    case "send": {
      const input = $("#question-input");
      const question = input?.value || "";
      if (input) input.value = "";
      sendQuestion(question);
      break;
    }
    case "voice":
      startVoice();
      break;
    case "export-data":
      exportData();
      break;
    case "import-data":
      importData();
      break;
    case "save-profile":
      saveProfileFromForm();
      break;
    case "lookup-profile":
      await lookupProfileFromSettings();
      break;
    case "choose-profile-match": {
      const record = state.profileLookupMatches[Number(element.dataset.profileIndex)];
      if (!record) { toast("That roster match is no longer available. Search again.", "error"); break; }
      applyRosterRecordToProfile(record);
      state.profileLookupQuery = record.name || "";
      state.profileLookupMatches = [];
      state.profileLookupMessage = "Profile matched to the published roster. Review the section and subgroup below.";
      render();
      toast(`Profile filled from the official roster: ${record.name || "student"}.`, "success");
      break;
    }
    case "clear-teacher":
      state.teacherSelected = "";
      state.teacherQuery = "";
      render();
      break;
    case "use-student": {
      const key = element.dataset.student;
      const record = state.students.find((row) => [row.crn, row.registrationNo, row.name].filter(Boolean).map(String).includes(key));
      if (!record) { toast("That roster record is no longer available.", "error"); break; }
      state.profile = saveProfile(localStorage, {
        ...state.profile,
        name: record.name || "",
        crn: record.crn || "",
        registrationNo: record.registrationNo || "",
        branch: record.branch || "",
        section: record.section || state.profile.section,
        subsection: record.subsection || "",
        mentor: record.mentor || "",
        mentorPhone: record.mentorPhone || "",
        academicGroup: record.academicGroup || "",
        mentorVenue: record.mentorVenue || record.venue || "",
        rosterVersion: state.rosterGeneratedAt || "published"
      }) || state.profile;
      if (state.profile.section && state.groups.includes(state.profile.section)) {
        state.group = state.profile.section;
        state.subgroup = subgroupsFor(state.group).includes(state.profile.subsection) ? state.profile.subsection : "";
        persistSelection();
      }
      refreshAcademicOverlay();
      render();
      toast(`Profile set from the published roster: ${record.name || key}.`, "success");
      break;
    }
    case "use-profile-section":
      if (state.profile.section && state.groups.includes(state.profile.section)) {
        state.group = state.profile.section;
        state.subgroup = subgroupsFor(state.group).includes(state.profile.subsection) ? state.profile.subsection : "";
        persistSelection();
        refreshAcademicOverlay();
        render();
        toast("Timetable selection updated.");
      } else toast("Set a section in your profile first.", "error");
      break;
    case "restore-snapshot":
      restoreSnapshot(element.dataset.id);
      break;
    case "delete-snapshot":
      {
        const selected = state.snapshots.find((snapshot) => snapshot.id === element.dataset.id);
        const key = selected ? (selected.releaseKey || `older:${selected.version || "release"}`) : "";
        const duplicates = selected ? state.snapshots.filter((snapshot) => (snapshot.releaseKey || `older:${snapshot.version || "release"}`) === key) : [];
        for (const snapshot of duplicates.length ? duplicates : [{ id: element.dataset.id }]) await deleteSnapshot(snapshot.id);
      }
      state.snapshots = await listSnapshots();
      render();
      toast("Snapshot deleted.");
      break;
    case "persist-storage": {
      const ok = await requestPersistentStorage();
      toast(ok ? "Offline storage is persistent." : "The browser did not grant persistent storage.", ok ? "success" : "error");
      break;
    }
    case "clear-cache":
      await clearCache();
      await refreshStorageSummary();
      break;
    case "download-offline": {
      if (!state.schedule.length) { toast("Load the timetable first.", "error"); break; }
      await requestPersistentStorage();
      const releaseKey = snapshotReleaseKey(state.metadata, state.schedule, state.roomSchedule, state.subgroupSchedule);
      await saveSnapshot({ id: releaseKey, releaseKey, createdAt: new Date().toISOString(), version: state.metadata?.version || "unknown", checkedAt: state.metadata?.checkedAt || "", schedule: state.schedule, roomSchedule: state.roomSchedule, subgroupSchedule: state.subgroupSchedule });
      toast("Offline data saved on this device.", "success");
      break;
    }
    case "delete-all":
      if (window.confirm("Delete settings, profile, chat history and snapshots from this device? The legacy build stays untouched.")) {
        storageRemove(SETTINGS_KEY);
        storageRemove(CHAT_KEY);
        storageRemove(SELECTION_KEY);
        storageRemove("gndec-compass-next-profile-v1");
        await clearSnapshots();
        await clearAppCaches();
        state.chat = [];
        state.values = defaultValues();
        state.profile = { name: "", crn: "", registrationNo: "", serialNo: "", branch: "", section: "", subsection: "", mentor: "", mentorPhone: "", mentorVenue: "", batch: "2026", attendanceTarget: 76 };
        applyAppearance();
        render();
        toast("Deleted from this device.", "success");
      }
      break;
    case "flag-action":
      await handleFlagAction(element.dataset.flag);
      break;
    case "test-notification":
      await testNotification();
      break;
    default:
      break;
  }
}

async function handleFlagAction(flagId) {
  if (flagId === "notifications.test") { await testNotification(); return; }
  if (flagId === "privacy.export") { exportData(); return; }
  if (flagId === "privacy.clearData") { await clearCache(); return; }
  if (flagId === "privacy.deleteAll") { await handleAction("delete-all", document.body); return; }
}

async function saveProfileFromForm() {
  const profile = { ...state.profile };
  $$("[data-profile]").forEach((input) => {
    profile[input.dataset.profile] = input.value;
  });
  if (profile.section && state.groups.includes(profile.section)) profile.branch = groupBranchCode(profile.section);
  state.profile = saveProfile(localStorage, profile) || profile;
  state.profileLookupQuery = state.profile.name || state.profile.crn || "";
  if (!state.students.length && (state.profile.name || state.profile.crn || state.profile.registrationNo)) await loadStudents();
  const verified = Boolean(rosterRecordForProfile());
  if (verified) {
    syncProfileFromRoster({ silent: true });
    state.profileLookupMessage = "Profile matched to the published roster.";
  } else if (state.profile.name || state.profile.crn || state.profile.registrationNo) {
    state.profileLookupMessage = "No unique match was found. Use Find my profile to choose a matching roster record.";
  }
  if (state.profile.section && state.groups.includes(state.profile.section)) {
    state.group = state.profile.section;
    state.subgroup = subgroupsFor(state.profile.section).includes(state.profile.subsection) ? state.profile.subsection : "";
    persistSelection();
  }
  refreshAcademicOverlay();
  render();
  toast(verified ? "Profile saved and matched to the published roster." : "Profile saved on this device. Enter your name or CRN to check the published roster.", "success");
}

function exportData() {
  const bundle = exportBundle({ values: state.values, profile: state.profile, snapshots: state.snapshots, chat: state.chat });
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gndec-compass-export-${now().dateISO}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("Export downloaded.", "success");
}

function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const bundle = importBundle(payload);
      if (!bundle) throw new Error("This file is not a Compass export.");
      state.values = bundle.values;
      persistSettings();
      if (bundle.profile) { state.profile = saveProfile(localStorage, bundle.profile) || bundle.profile; }
      applyAppearance();
      render();
      toast("Import complete.", "success");
    } catch (error) {
      toast(error.message || "Import failed.", "error");
    }
  };
  input.click();
}

async function restoreSnapshot(id) {
  const snapshot = await getSnapshot(id);
  if (!snapshot?.schedule?.length) { toast("Snapshot is missing.", "error"); return; }
  applySchedule(snapshot.schedule, snapshot.roomSchedule, { version: snapshot.version, checkedAt: snapshot.checkedAt, source: "device snapshot" }, snapshot.subgroupSchedule || [], { fromCache: true });
  state.lastSync = snapshot.createdAt;
  render();
  toast(`Restored release ${snapshot.version || ""}.`, "success");
}

async function testNotification() {
  if (!("Notification" in window)) { toast("This browser does not support notifications.", "error"); return; }
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") { toast("Notification permission was not granted.", "error"); return; }
  const copy = { title: "Compass notifications work", body: "You will get class reminders when they are enabled." };
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration?.showNotification) await registration.showNotification(copy.title, { body: copy.body, icon: "./icons/icon-192.png", badge: "./icons/icon-192.png" });
  else new Notification(copy.title, { body: copy.body });
  toast("Test notification sent.", "success");
}

/* ── Voice ─────────────────────────────────────────────────────────────── */

function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { toast("Voice input is not available in this browser.", "error"); return; }
  if (state.listening) return;
  try {
    const recognition = new Recognition();
    recognition.lang = v("ask.language") === "hi" ? "hi-IN" : v("ask.language") === "pa" ? "pa-IN" : "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      state.listening = true;
      $("#mic-button")?.classList.add("is-listening");
    };
    recognition.onend = () => {
      state.listening = false;
      $("#mic-button")?.classList.remove("is-listening");
    };
    recognition.onerror = () => {
      state.listening = false;
      $("#mic-button")?.classList.remove("is-listening");
      toast("Voice input stopped.", "error");
    };
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript || "";
      const input = $("#question-input");
      if (input && text) { input.value = text; input.focus(); }
    };
    recognition.start();
  } catch {
    toast("Voice input could not start.", "error");
  }
}

/* ── Reminders ─────────────────────────────────────────────────────────── */

async function checkReminders() {
  if (!v("notifications.classReminders") || !("Notification" in window) || Notification.permission !== "granted") return;
  const clock = now();
  if (v("notifications.quietHours") && isQuietTime(clock.minutes, v("notifications.quietStart"), v("notifications.quietEnd"))) return;
  const classes = classesForDay(clock.day);
  const entry = dueReminder(classes, clock, Number(v("notifications.leadMinutes")), state.notified);
  if (!entry) return;
  state.notified.add(entry.id);
  const copy = notificationCopy(entry, Number(v("notifications.leadMinutes")));
  const registration = await navigator.serviceWorker?.getRegistration();
  const options = { body: copy.body, icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", tag: entry.id, silent: !v("notifications.sound") };
  if (registration?.showNotification) await registration.showNotification(copy.title, options);
  else new Notification(copy.title, options);
}

async function checkDigest() {
  if (!v("notifications.dailyDigest") || !("Notification" in window) || Notification.permission !== "granted") return;
  const clock = now();
  const target = timeToMinutes(v("notifications.digestTime")) ?? 480;
  if (clock.minutes < target || clock.minutes > target + 5) return;
  if (storageGet(DIGEST_KEY) === clock.dateISO) return;
  storageSet(DIGEST_KEY, clock.dateISO);
  if (v("notifications.quietHours") && isQuietTime(clock.minutes, v("notifications.quietStart"), v("notifications.quietEnd"))) return;
  const copy = digestCopy(classesForDay(clock.day), clock.day);
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration?.showNotification) await registration.showNotification(copy.title, { body: copy.body, icon: "./icons/icon-192.png", tag: "digest" });
}

/* ── PWA ───────────────────────────────────────────────────────────────── */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).then((registration) => {
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(worker);
      });
    });
  }).catch(() => { /* offline shell still works from HTTP cache */ });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (state.reloading) return;
    state.reloading = true;
    location.reload();
  });
}

function showUpdateBanner(worker) {
  const banner = $("#update-banner");
  if (!banner) return;
  banner.hidden = false;
  $("#update-reload").onclick = () => worker.postMessage({ type: "SKIP_WAITING" });
  $("#update-dismiss").onclick = () => { banner.hidden = true; };
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    $("#install-button")?.removeAttribute("hidden");
    $("#install-side")?.removeAttribute("hidden");
  });
  const install = async () => {
    if (!state.installPrompt) { toast("Use your browser menu → Install app."); return; }
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    $("#install-button")?.setAttribute("hidden", "");
    $("#install-side")?.setAttribute("hidden", "");
  };
  $("#install-button")?.addEventListener("click", install);
  $("#install-side")?.addEventListener("click", install);
}

/* ── Sidebar / mobile ──────────────────────────────────────────────────── */

function toggleSidebar(open = undefined) {
  const sidebar = $("#sidebar");
  if (!sidebar) return;
  const shouldOpen = open ?? !sidebar.classList.contains("is-open");
  sidebar.classList.toggle("is-open", shouldOpen);
  $("#scrim").hidden = !shouldOpen;
  $("#menu-button")?.setAttribute("aria-expanded", String(shouldOpen));
}

/* ── Boot ──────────────────────────────────────────────────────────────── */

function bindEvents() {
  document.addEventListener("click", (event) => {
    const routeTarget = event.target.closest("[data-route]");
    if (routeTarget) {
      toggleSidebar(false);
      navigate(routeTarget.dataset.route);
      return;
    }
    const directoryTab = event.target.closest("[data-directory-tab]");
    if (directoryTab) {
      const nextTab = directoryTab.dataset.directoryTab;
      if (nextTab !== state.directoryTab) {
        state.directoryTab = nextTab;
        state.directoryQuery = "";
        state.directoryStatus = "idle";
        render();
      }
      return;
    }
    const askChip = event.target.closest("[data-ask-question]");
    if (askChip) {
      askFromAnywhere(askChip.dataset.askQuestion);
      return;
    }
    const teacherButton = event.target.closest("[data-teacher]");
    if (teacherButton) {
      state.teacherSelected = teacherButton.dataset.teacher;
      state.teacherQuery = "";
      render();
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      handleAction(actionTarget.dataset.action, actionTarget);
      return;
    }
    if (event.target.closest("#menu-button")) { toggleSidebar(); return; }
    if (event.target.closest("#command-button")) { toggleCommand(true); return; }
    if (event.target.closest("#scrim")) { toggleSidebar(false); toggleCommand(false); return; }
    if (event.target.closest("#avatar-button")) { navigate("settings"); return; }
    if (event.target.closest("#install-button") || event.target.closest("#install-side")) return;
    if (event.target.closest("#close-command")) { toggleCommand(false); return; }
    if (event.target.closest("#update-dismiss")) { $("#update-banner").hidden = true; return; }
    if (event.target.closest("#update-reload")) return;
    if (event.target.closest("#open-legacy-side")) { openLegacy(); return; }
  });

  document.addEventListener("change", (event) => {
    const paperDepartment = event.target.closest("[data-paper-department]");
    if (paperDepartment) {
      state.paperDepartment = paperDepartment.value;
      render();
      return;
    }
    const adminFile = event.target.closest("[data-admin-file]");
    if (adminFile) {
      adminUpload(adminFile.files?.[0], adminFile);
      return;
    }
    const setting = event.target.closest("[data-setting]");
    if (setting) {
      const flag = getFlag(setting.dataset.setting);
      setFlag(flag.id, flag.type === "boolean" ? setting.checked : setting.value);
      if (flag.id === "labs.experiments" || flag.id === "experience.mode") render();
      else if (flag.category === "timetable" || flag.category === "rooms" || flag.category === "today") render();
      return;
    }
    const profileSection = event.target.closest('[data-profile="section"]');
    if (profileSection) {
      const subsection = $("#profile-subsection");
      const group = profileSection.value;
      const current = subsection?.value || "";
      const choices = group ? subgroupsFor(group) : [];
      if (subsection) {
        subsection.innerHTML = '<option value="">Whole section</option>' + rankedSubgroups(group).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(subgroupDisplay(group, value))}</option>`).join("");
        subsection.value = choices.includes(current) ? current : "";
      }
      return;
    }
    const branch = event.target.closest("[data-select-branch]");
    if (branch) {
      const candidates = rankedGroups(state.groups.filter((group) => groupBranchCode(group) === branch.value));
      if (candidates.length && groupBranchCode(state.group) !== branch.value) {
        const saved = (() => { try { return JSON.parse(storageGet(SELECTION_KEY) || "{}"); } catch { return {}; } })();
        const branchChoice = saved?.branchSelections?.[branch.value];
        const nextGroup = candidates.includes(branchChoice?.group) ? branchChoice.group : candidates[0];
        state.group = nextGroup;
        state.subgroup = subgroupsFor(nextGroup).includes(branchChoice?.subgroup) ? branchChoice.subgroup : "";
        recordGroupSelection(state.group);
        recordSubgroupSelection(state.group, state.subgroup);
        persistSelection();
        state.day = "";
      }
      render();
      return;
    }
    const cohort = event.target.closest("[data-select-cohort]");
    if (cohort) {
      const [group, subgroup = ""] = cohort.value.split("|");
      if (!state.groups.includes(group)) return;
      if (state.group !== group) recordGroupSelection(group);
      if (state.group !== group || state.subgroup !== subgroup) recordSubgroupSelection(group, subgroup);
      state.group = group;
      state.subgroup = subgroupsFor(group).includes(subgroup) ? subgroup : "";
      persistSelection();
      state.day = "";
      render();
      return;
    }
    const roomDay = event.target.closest("[data-room-day]");
    if (roomDay) { state.roomDay = roomDay.value; render(); return; }
    const roomDuration = event.target.closest("[data-room-duration]");
    if (roomDuration) { setFlag("rooms.defaultDuration", roomDuration.value); render(); return; }
    const roomTime = event.target.closest("[data-room-time]");
    if (roomTime) { state.roomTime = roomTime.value; render(); return; }
    const compareA = event.target.closest("[data-compare-a]");
    if (compareA) { state.compareA = compareA.value; render(); return; }
    const compareB = event.target.closest("[data-compare-b]");
    if (compareB) { state.compareB = compareB.value; render(); return; }
    const compareDaySelect = event.target.closest("[data-compare-day]");
    if (compareDaySelect) { state.compareDay = compareDaySelect.value; render(); return; }
  });

  document.addEventListener("input", (event) => {
    const profileLookup = event.target.closest("[data-profile-lookup-query]");
    if (profileLookup) {
      queueProfileSuggestions(profileLookup.value);
      return;
    }
    const range = event.target.closest("[data-range]");
    if (range) {
      const output = document.getElementById(`out-${range.dataset.range}`);
      const flag = getFlag(range.dataset.range);
      if (output) output.textContent = `${range.value} ${flag?.unit || ""}`;
      return;
    }
    const search = event.target.closest("[data-settings-search]");
    if (search) {
      state.settingsQuery = search.value;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        render();
        const input = $("[data-settings-search]");
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }, 220);
      return;
    }
    const directorySearch = event.target.closest("[data-directory-search]");
    if (directorySearch) {
      state.directoryQuery = directorySearch.value;
      const caret = directorySearch.selectionStart;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        render();
        const input = $("[data-directory-search]");
        if (input) { input.focus(); input.setSelectionRange(caret, caret); }
      }, 200);
      return;
    }
    const noticeSearch = event.target.closest("[data-notice-search]");
    if (noticeSearch) {
      state.noticeQuery = noticeSearch.value;
      const caret = noticeSearch.selectionStart;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        render();
        const input = $("[data-notice-search]");
        if (input) { input.focus(); input.setSelectionRange(caret, caret); }
      }, 200);
      return;
    }
    const teacherSearch = event.target.closest("[data-teacher-search]");
    if (teacherSearch) {
      state.teacherQuery = teacherSearch.value;
      state.teacherSelected = "";
      const caret = teacherSearch.selectionStart;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        render();
        const input = $("[data-teacher-search]");
        if (input) { input.focus(); input.setSelectionRange(caret, caret); }
      }, 200);
      return;
    }
    const paperSearch = event.target.closest("[data-paper-search]");
    if (paperSearch) {
      state.paperQuery = paperSearch.value;
      const caret = paperSearch.selectionStart;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        render();
        const input = $("[data-paper-search]");
        if (input) { input.focus(); input.setSelectionRange(caret, caret); }
      }, 200);
      return;
    }
    const syllabusSearch = event.target.closest("[data-syllabus-search]");
    if (syllabusSearch) {
      state.syllabusQuery = syllabusSearch.value;
      const caret = syllabusSearch.selectionStart;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        render();
        const input = $("[data-syllabus-search]");
        if (input) { input.focus(); input.setSelectionRange(caret, caret); }
      }, 200);
      return;
    }
    const commandInput = event.target.closest("#command-input");
    if (commandInput) renderCommandResults(commandInput.value);
    const question = event.target.closest("#question-input");
    if (question) {
      question.style.height = "auto";
      question.style.height = `${Math.min(160, question.scrollHeight)}px`;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.closest("[data-profile-lookup-query]")) {
      event.preventDefault();
      lookupProfileFromSettings();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      toggleCommand();
      return;
    }
    if (event.key === "Escape") {
      toggleCommand(false);
      toggleSidebar(false);
      return;
    }
    const commandInput = event.target.closest("#command-input");
    if (commandInput) {
      const root = $("#command-results");
      const items = root?._items || [];
      if (!items.length) return;
      let active = Number(root.dataset.active || 0);
      if (event.key === "ArrowDown") { event.preventDefault(); active = (active + 1) % items.length; }
      else if (event.key === "ArrowUp") { event.preventDefault(); active = (active - 1 + items.length) % items.length; }
      else if (event.key === "Enter") { event.preventDefault(); items[active]?.action(); return; }
      else return;
      root.dataset.active = String(active);
      $$(".command-item", root).forEach((item, index) => item.classList.toggle("is-active", index === active));
      return;
    }
    const question = event.target.closest("#question-input");
    if (question && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const value = question.value;
      question.value = "";
      sendQuestion(value);
    }
  });

  window.addEventListener("hashchange", () => render());
  window.addEventListener("popstate", () => render());
  window.addEventListener("online", () => { state.online = true; toast("Back online."); });
  window.addEventListener("offline", () => { state.online = false; toast("Offline. Showing the last verified release."); });
  window.addEventListener("storage", (event) => {
    if (event.key === SETTINGS_KEY) { loadAllSettings(); render(); }
  });
}

function startTimers() {
  clearInterval(state.reminderTimer);
  state.reminderTimer = setInterval(() => {
    checkReminders();
    checkDigest();
    if (state.route === "today") render();
  }, 30000);

  clearInterval(state.refreshTimer);
  const minutes = Number(v("data.autoRefreshMinutes")) || 0;
  if (v("data.autoUpdate") && minutes > 0) {
    state.refreshTimer = setInterval(() => {
      if (!document.hidden) loadLiveData({ manual: false });
    }, minutes * 60000);
  }
}

async function init() {
  loadAllSettings();
  loadChat();
  setAdminToken(adminStoredToken());
  state.adminStatus = state.adminToken ? "idle" : "signed-out";
  state.day = "";
  bindEvents();
  setupInstallPrompt();
  registerServiceWorker();
  bindStaticActions();

  const route = parseRoute();
  state.route = route;
  updateChrome();

  const cached = await loadCachedData();
  if (cached) render();

  await loadVersion();
  render();

  loadDatesheet().then(() => { if (["ask", "today", "notices"].includes(state.route)) render(); });
  loadNotices().then(() => { if (state.route === "today" || state.route === "notices") render(); });

  await loadLiveData();
  if (rosterIdentity().crn || rosterIdentity().registration || rosterIdentity().serial || state.profile.name) {
    await loadStudents({ quiet: true }).catch(() => {});
  }
  await restoreAdminAiSession();
  await loadSnapshots();
  updateLegacyCards();
  startTimers();
  if (state.route === "settings") render();
}

function bindStaticActions() {
  $("#open-legacy-side")?.addEventListener("click", openLegacy);
  $("#update-dismiss")?.addEventListener("click", () => { $("#update-banner").hidden = true; });
  $("#update-reload")?.addEventListener("click", () => {
    navigator.serviceWorker?.getRegistration().then((registration) => registration?.waiting?.postMessage({ type: "SKIP_WAITING" }));
  });
  const banner = $("#update-banner");
  if (banner) banner.hidden = true;
}

function updateLegacyCards() {
  $("#open-legacy-side")?.toggleAttribute("hidden", !v("experience.legacyCard") || !state.legacyUrl);
  const install = $("#install-side");
  if (install) install.hidden = !state.installPrompt;
}

init().catch((error) => {
  console.error("[Compass] boot failed", error);
  const view = $("#view");
  if (view) view.innerHTML = `<div class="card" style="margin-top:24px">${emptyState("⚠", "Compass could not start", "The verified data could not be loaded. Your legacy build is still available.", `<button class="btn btn-primary" data-action="open-legacy">Open legacy build</button>`)}</div>`;
});

// Expose a tiny diagnostic surface for tests and the Labs panel.
globalThis.CompassNext = Object.freeze({
  version: APP_VERSION,
  state,
  settings: { FLAGS, CATEGORIES, PRESETS },
  answer: answerLocally,
  mapEnabled: () => isMapFlagEnabled(state.values)
});

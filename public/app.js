const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_IDS = DAY_NAMES.map((day) => day.toLowerCase());
const STORAGE_KEY = "gndec-compass-timetable-v2";
const GROUP_STORAGE_KEY = "gndec-compass-group-v3";
const SUBGROUP_STORAGE_KEY = "gndec-compass-subgroup-v3";
const STUDENT_STORAGE_KEY = "gndec-compass-student-v1";
const CHAT_STORAGE_KEY = "gndec-compass-chat-v1";
const GROUP_USAGE_KEY = "gndec-compass-group-usage-v1";
const STUDENT_HISTORY_KEY = "gndec-compass-student-history-v1";
const SYLLABUS_STORAGE_KEY = "gndec-compass-syllabus-v2";
const SYLLABUS_CONVERSATION_KEY = "gndec-compass-syllabus-conversation-v1";
const BRAIN_V2_STORAGE_KEY = "gndec-compass-brain-v2-enabled-v1";
const BRAIN_CONTEXT_STORAGE_KEY = "gndec-compass-brain-context-v1";
const FACULTY_DIRECTORY_STORAGE_KEY = "gndec-compass-faculty-directory-v2";
const FACULTY_DIRECTORY_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const SYLLABUS_INDEX_URL = "/data/first-year-syllabus-index.json";
const DEVICE_STORAGE_KEY = "gndec-compass-device-v1";
const SETTINGS_STORAGE_KEY = "gndec-compass-settings-v1";
const TIMETABLE_UPDATE_STORAGE_KEY = "gndec-compass-timetable-update-v1";
const AI_ADMIN_VIEW_STORAGE_KEY = "gndec-compass-ai-admin-view-v1";
const ADMIN_AI_MODE_STORAGE_KEY = "gndec-compass-admin-ai-mode-v1";
const ADMIN_OWNER_CRN = "2617070";
const ROSTER_SCHEMA_VERSION = 3;
const MAX_CHAT_MESSAGES = 60;
const MAX_CHAT_MESSAGE_HTML = 30000;
const SECTION_LIST_BRANCHES = ["CE", "CS", "EC", "EE", "IT", "ME", "RAI"];
const OFFICIAL_PROGRAMS_URL = "https://academics.gndec.ac.in/programs/";
const BRANCHES = [
  ["BARCH", "Architecture"], ["BBA", "Business Administration"], ["BCA", "Computer Applications"], ["BCOM", "Commerce"], ["BVOC", "Vocational Studies"], ["MCA", "Master of Computer Applications"],
  ["RAI", "Robotics and Artificial Intelligence"], ["CS", "Computer Science Engineering"], ["EC", "Electronics and Communication Engineering"], ["EE", "Electrical Engineering"], ["IT", "Information Technology"], ["CE", "Civil Engineering"], ["ME", "Mechanical Engineering"]
];
const EMPTY_PROFILE = Object.freeze({
  name: "", crn: "", registrationNo: "", serialNo: "", currentSerialNo: "", newSerialNo: "", oldSerialNos: [],
  branch: "", section: "", subsection: "", mentor: "", mentorPhone: "", academicGroup: "", mentorVenue: "", venue: "", rosterVersion: "", rosterRevision: "", rosterSchemaVersion: 0
});
const AI_MODELS = Object.freeze({
  "nvidia/nemotron-3.5-lightning-30b-a3b": "NVIDIA Nemotron 3.5 Lightning",
  "openai/gpt-oss-120b": "OpenAI GPT-OSS 120B",
  "meta/muse-glimmer-30b": "Meta Muse Glimmer 30B"
});
const COLLEGE_DAY_END_MINUTES = 17 * 60;

function defaultSettings() {
  return {
    brainMode: "v22",
    clockMode: "12h",
    themeAccent: "emerald",
    compactTimetable: false,
    timetableGridView: true,
    timetableSwapAxes: false,
    reduceMotion: false,
    attendanceTarget: 76,
    attendanceAlerts: true,
    holidayAlerts: true,
    roomLocations: true,
    preferredLanguage: "hinglish",
    showHinglishChips: true,
    showDynamicChips: true,
    showRestrictedHolidays: true,
    cgpaFormula: "autonomous",
    showFreshnessTag: true,
    aiSuggestions: true
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    return { ...defaultSettings(), ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return defaultSettings();
  }
}

const state = {
  schedule: [],
  academicOverlay: [],
  academicOverlayGroup: "",
  groups: [],
  index: { byGroupDay: new Map(), bySubject: new Map(), byTeacher: new Map() },
  selectedGroup: localStorage.getItem(GROUP_STORAGE_KEY) || "",
  selectedSubgroup: localStorage.getItem(SUBGROUP_STORAGE_KEY) || "",
  metadata: null,
  syllabus: [],
  syllabusPages: [],
  syllabusMetadata: null,
  syllabusLoading: null,
  syllabusConversation: null,
  brainConversation: null,
  lastBrainDiagnostic: null,
  student: null,
  settings: loadSettings(),
  sourceRegistry: null,
  timetableUpdate: null,
  sourceSyncing: false,
  profileSyncing: false,
  profileSyncStatus: "",
  lastTimetableSubject: "",
  timetableViews: new Map(),
  timetableViewLoading: new Map(),
  rosterCache: null,
  rosterLookupConversation: null,
  facultyCache: null,
  collegeEventsCache: null,
  noticesCache: null,
  timetablesCache: null,
  activeFacultyAiContext: null,
  nowOverride: null,
  dayPlanOverride: "",
  questionSuggestionIndex: -1
};
let facultyDirectoryLoading = null;
const facultyProfileLoading = new Map();

const $ = (id) => document.getElementById(id);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const cleanText = (value = "") => value.replace(/\s+/g, " ").replace(/---/g, "").trim();

function minutesFromTime(value) {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function timeFromMinutes(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function humanTime(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function compassReferenceDate() {
  const overridden = state.nowOverride ? new Date(state.nowOverride) : null;
  return overridden && !Number.isNaN(overridden.getTime()) ? overridden : new Date();
}

function getIndiaNow() {
  const reference = compassReferenceDate();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(reference);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minutes = Number(lookup.hour) * 60 + Number(lookup.minute);
  const time24 = `${lookup.hour}:${lookup.minute}`;
  return { day: lookup.weekday, minutes, time: humanTime(minutes), time24, time12: humanTime(minutes), date: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(reference) };
}

function readNestedCell(cell, selector) {
  const node = cell.querySelector(selector);
  return cleanText(node ? node.textContent : "");
}

function directCells(row) {
  const cells = row ? (row.cells ? [...row.cells] : [...row.children]) : [];
  // Real browsers include <th> (the FET time column) in row.cells;
  // keep only data cells so weekday columns line up with the header.
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
    type,
    cohorts: safeCohorts
  };
}

function parseDetailedCell(cell, group, day, start, duration) {
  const table = cell.querySelector("table.detailed");
  if (!table) return [];
  const cohortCells = directCells(table.querySelector("tr.studentsset"));
  const subjectCells = directCells(table.querySelector("tr.line1"));
  const teacherCells = directCells(table.querySelector("tr.teacher"));
  const roomCells = directCells(table.querySelector("tr.room"));

  return subjectCells.map((subjectCell, index) => makeEntry({
    group,
    day,
    start,
    duration,
    subject: readNestedCell(subjectCell, ".subject"),
    teacher: cleanText(teacherCells[index]?.textContent || ""),
    room: cleanText(roomCells[index]?.textContent || ""),
    type: readNestedCell(subjectCell, ".activitytag"),
    cohorts: cleanText(cohortCells[index]?.textContent || "")
  })).filter(Boolean);
}

function parseCell(cell, group, day, start, duration) {
  if (cell.classList.contains("empty") || cleanText(cell.textContent) === "") return [];
  const detailedEntries = parseDetailedCell(cell, group, day, start, duration);
  if (detailedEntries.length) return detailedEntries;
  return [makeEntry({
    group,
    day,
    start,
    duration,
    subject: readNestedCell(cell, ".subject"),
    teacher: readNestedCell(cell, ".teacher"),
    room: readNestedCell(cell, ".room"),
    type: readNestedCell(cell, ".activitytag"),
    cohorts: readNestedCell(cell, ".studentsset")
  })].filter(Boolean);
}

// FET renders the first column as time and uses rowspans for practicals.
// This builds a visual row before extracting each weekday cell.
function parseFetTimetable(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const schedule = [];
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
        schedule.push(...parseCell(cell, group, headers[column], start, duration));
        const columnSpan = Number(cell.getAttribute("colspan") || 1);
        for (let span = 0; span < columnSpan; span += 1) {
          if (rowSpan > 1) activeSpans[column + span] = rowSpan - 1;
        }
        column += columnSpan - 1;
      }
    });
  });
  const unique = new Map(schedule.map((item) => [item.id, item]));
  return [...unique.values()].sort((a, b) => a.group.localeCompare(b.group) || DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day) || a.start - b.start);
}

function isValidScheduleEntry(item) {
  return Boolean(item && typeof item.group === "string" && item.group && typeof item.day === "string" && DAY_NAMES.includes(item.day)
    && typeof item.subject === "string" && item.subject && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);
}

function sanitizeSchedule(schedule) {
  return (Array.isArray(schedule) ? schedule : []).filter(isValidScheduleEntry).map((item) => ({
    ...item,
    teacher: typeof item.teacher === "string" && item.teacher ? item.teacher : "Teacher not listed",
    room: typeof item.room === "string" && item.room ? item.room : "Room not listed",
    cohorts: typeof item.cohorts === "string" ? item.cohorts : ""
  }));
}

function persistTimetableCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schedule: state.schedule,
      academicOverlay: state.academicOverlay,
      academicOverlayGroup: state.academicOverlayGroup,
      metadata: state.metadata
    }));
  } catch { /* browser storage is an optional offline cache */ }
}

function loadPendingTimetableUpdate() {
  try {
    const saved = JSON.parse(localStorage.getItem(TIMETABLE_UPDATE_STORAGE_KEY));
    if (!saved || typeof saved !== "object" || !saved.id || !Array.isArray(saved.changes)) return null;
    return saved;
  } catch {
    localStorage.removeItem(TIMETABLE_UPDATE_STORAGE_KEY);
    return null;
  }
}

function persistTimetableUpdate(update) {
  state.timetableUpdate = update || null;
  try {
    if (update) localStorage.setItem(TIMETABLE_UPDATE_STORAGE_KEY, JSON.stringify(update));
    else localStorage.removeItem(TIMETABLE_UPDATE_STORAGE_KEY);
  } catch { /* local update notices are optional in private browsing */ }
}

function timetableComparisonEntries(schedule, overlay = []) {
  const entries = new Map();
  [...sanitizeSchedule(schedule), ...sanitizeSchedule(overlay)].forEach((item) => {
    // A cohort belongs in the identity: two verified lab batches can share a
    // time slot without being the same class.
    const key = [item.group, item.day, item.start, item.end, cleanText(item.cohorts)].join("|");
    entries.set(key, item);
  });
  return entries;
}

function compareTimetableReleases(previousSchedule, previousOverlay, nextSchedule, nextOverlay) {
  const previous = timetableComparisonEntries(previousSchedule, previousOverlay);
  const next = timetableComparisonEntries(nextSchedule, nextOverlay);
  const changes = [];
  const keys = new Set([...previous.keys(), ...next.keys()]);
  keys.forEach((key) => {
    const before = previous.get(key) || null;
    const after = next.get(key) || null;
    const base = after || before;
    if (!base) return;
    if (!before) {
      changes.push({ kind: "added", group: base.group, day: base.day, start: base.start, end: base.end, after });
      return;
    }
    if (!after) {
      changes.push({ kind: "removed", group: base.group, day: base.day, start: base.start, end: base.end, before });
      return;
    }
    const fields = ["subject", "teacher", "room"].filter((field) => cleanText(before[field]) !== cleanText(after[field]));
    if (fields.length) changes.push({ kind: "changed", group: base.group, day: base.day, start: base.start, end: base.end, before, after, fields });
  });
  return changes.sort((left, right) => left.group.localeCompare(right.group) || DAY_NAMES.indexOf(left.day) - DAY_NAMES.indexOf(right.day) || left.start - right.start);
}

function detectedTimetableUpdate({ source, sourceInfo, previousSchedule, previousOverlay, previousMetadata, nextSchedule, nextOverlay }) {
  const revision = timetableSourceRevision(sourceInfo);
  const previousRevision = cleanText(previousMetadata?.sourceRevision || "");
  // Imports and temporary fallback reads must never create a misleading
  // "official change" notice. Only two independently verified releases are
  // compared here.
  if (source !== "Official GNDEC group timetable" || sourceInfo?.fallback || !revision || !previousRevision || revision === previousRevision || !previousSchedule.length) return null;
  const changes = compareTimetableReleases(previousSchedule, previousOverlay, nextSchedule, nextOverlay);
  if (!changes.length) return null;
  const groups = [...new Set(changes.map((change) => change.group).filter(Boolean))];
  const primary = (sourceInfo.sources || []).find((item) => item.id === "groups") || {};
  return {
    id: `${previousRevision}->${revision}`,
    detectedAt: new Date().toISOString(),
    oldVersion: cleanText(previousMetadata?.version || "Previously loaded release"),
    newVersion: cleanText(sourceInfo.version || "New verified release"),
    oldFooter: cleanText(previousMetadata?.sourceFooter || "Not published"),
    newFooter: cleanText(primary.sourceFooter || "Not published"),
    sourceUrl: cleanText(primary.url || ""),
    selectedGroup: cleanText(state.selectedGroup),
    selectedSubgroup: cleanText(state.selectedSubgroup),
    selectedAffected: Boolean(state.selectedGroup && groups.includes(state.selectedGroup)),
    affectedGroups: groups.slice(0, 12),
    totalAffectedGroups: groups.length,
    totalChanges: changes.length,
    changes: changes.slice(0, 18)
  };
}

function saveData(schedule, source, sourceInfo = {}, academicOverlay = []) {
  const previousSchedule = state.schedule;
  const previousOverlay = state.academicOverlay;
  const previousMetadata = state.metadata;
  const nextSchedule = sanitizeSchedule(schedule);
  const nextOverlay = sanitizeSchedule(academicOverlay);
  const update = detectedTimetableUpdate({ source, sourceInfo, previousSchedule, previousOverlay, previousMetadata, nextSchedule, nextOverlay });
  state.schedule = nextSchedule;
  state.timetableViews.clear();
  state.academicOverlay = nextOverlay;
  state.academicOverlayGroup = cleanText(activeStudentProfile().academicGroup);
  state.groups = [...new Set(schedule.map((entry) => entry.group))].sort((a, b) => a.localeCompare(b));
  buildScheduleIndex();
  renderTimetableSearchSuggestions();
  const primarySource = Array.isArray(sourceInfo?.sources) ? sourceInfo.sources.find((item) => item.id === "groups") : null;
  state.metadata = {
    source,
    version: sourceInfo.version || "",
    // GNDEC can revise a file without changing its visible effective date.
    // Persist the verified group-file hash so that this device reloads it.
    sourceRevision: timetableSourceRevision(sourceInfo),
    checkedAt: sourceInfo.checkedAt || null,
    // This is copied verbatim from the official FET file footer. It is not
    // converted to a local date because GNDEC does not label its numeric date
    // order. The official effective date remains the primary timetable date.
    sourceFooter: cleanText(primarySource?.sourceFooter || "").slice(0, 100),
    sourceGenerator: cleanText(primarySource?.sourceGenerator || "").slice(0, 40),
    fallback: sourceInfo.fallback || null,
    updatedAt: new Date().toISOString()
  };
  persistTimetableCache();
  if (update && state.timetableUpdate?.id !== update.id) persistTimetableUpdate(update);
  if (!state.groups.includes(state.selectedGroup)) state.selectedGroup = preferredGroup(state.groups);
  localStorage.setItem(GROUP_STORAGE_KEY, state.selectedGroup);
  hydrateGroupControls();
  renderEverything();
}

function restoreData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.schedule?.length) {
      state.schedule = sanitizeSchedule(saved.schedule);
      if (!state.schedule.length) throw new Error("Cached timetable is invalid.");
      state.academicOverlay = sanitizeSchedule(saved.academicOverlay);
      state.academicOverlayGroup = cleanText(saved.academicOverlayGroup);
      state.groups = [...new Set(state.schedule.map((entry) => entry.group))].sort((a, b) => a.localeCompare(b));
      state.metadata = saved.metadata;
      buildScheduleIndex();
      renderTimetableSearchSuggestions();
    }
  } catch { localStorage.removeItem(STORAGE_KEY); }
  state.timetableUpdate = loadPendingTimetableUpdate();
  try {
    const savedStudent = JSON.parse(localStorage.getItem(STUDENT_STORAGE_KEY));
    if (savedStudent?.name && savedStudent?.section && savedStudent?.subsection) state.student = normalizeStudentRecord(savedStudent);
  } catch { localStorage.removeItem(STUDENT_STORAGE_KEY); }
  try {
    const savedSyllabus = JSON.parse(localStorage.getItem(SYLLABUS_STORAGE_KEY));
    if (Array.isArray(savedSyllabus?.courses) && savedSyllabus.courses.length) {
      state.syllabus = savedSyllabus.courses;
      state.syllabusPages = Array.isArray(savedSyllabus.pages) ? savedSyllabus.pages : [];
      state.syllabusMetadata = savedSyllabus.metadata || null;
    }
  } catch { localStorage.removeItem(SYLLABUS_STORAGE_KEY); }
  try {
    const savedConversation = JSON.parse(localStorage.getItem(SYLLABUS_CONVERSATION_KEY));
    if (["subjects", "course"].includes(savedConversation?.kind) && Array.isArray(savedConversation.courseCodes)) state.syllabusConversation = savedConversation;
  } catch { localStorage.removeItem(SYLLABUS_CONVERSATION_KEY); }
  try {
    const savedBrainContext = JSON.parse(localStorage.getItem(BRAIN_CONTEXT_STORAGE_KEY));
    if (savedBrainContext && typeof savedBrainContext === "object" && Array.isArray(savedBrainContext.recentTurns)) state.brainConversation = savedBrainContext;
  } catch { localStorage.removeItem(BRAIN_CONTEXT_STORAGE_KEY); }
}

function activeStudentProfile() {
  return state.student || EMPTY_PROFILE;
}

function hasStudentProfile() {
  return Boolean(state.student?.name && state.student?.section);
}

function savedProfileLookupValue(profile = activeStudentProfile()) {
  return cleanText(profile.name) || cleanText(profile.crn) || cleanText(profile.registrationNo) || cleanText(profile.currentSerialNo || profile.serialNo);
}

function populateStudentLookupInput(force = false) {
  const input = $("student-name-input");
  const value = savedProfileLookupValue();
  if (input && value && (force || !input.value.trim())) input.value = value;
}

function profileMatchesTimetableSelection(profile = activeStudentProfile(), group = state.selectedGroup, subgroup = state.selectedSubgroup) {
  const profileSection = cleanText(profile.section).toUpperCase();
  const profileSubgroup = cleanText(profile.subsection || profile.subgroup).toUpperCase();
  return Boolean(profileSection && profileSubgroup
    && profileSection === cleanText(group).toUpperCase()
    && profileSubgroup === cleanText(subgroup).toUpperCase());
}

function compassDeviceId() {
  let id = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (id) return id;
  id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem(DEVICE_STORAGE_KEY, id); } catch { /* private browsing can block storage */ }
  return id;
}

function isKaushikAdminProfile() {
  const profile = activeStudentProfile();
  return normalizeStudentName(profile.name) === "kaushik jain" && normalizeStudentIdentifier(profile.crn) === ADMIN_OWNER_CRN && /^(ec|electronics and communication engineering)/i.test(String(profile.branch || "")) && String(profile.section || "").toUpperCase() === "ECB" && String(profile.subsection || profile.subgroup || "").toUpperCase() === "ECB1" && state.selectedGroup.toUpperCase() === "ECB" && state.selectedSubgroup.toUpperCase() === "ECB1";
}

function adminProfileFingerprint(profile = activeStudentProfile()) {
  const identity = [
    normalizeStudentName(profile.name),
    normalizeStudentIdentifier(profile.crn),
    normalizeStudentIdentifier(profile.registrationNo),
    normalizeStudentName(profile.branch),
    String(profile.section || "").trim().toUpperCase(),
    String(profile.subsection || profile.subgroup || "").trim().toUpperCase(),
    String(state.selectedGroup || "").trim().toUpperCase(),
    String(state.selectedSubgroup || "").trim().toUpperCase()
  ].join("|");
  // This is a local change detector, not an authentication secret. The actual
  // enrollment remains bound to the Worker-side hashed device and network.
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `profile-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function revokeAdminAiView() {
  localStorage.removeItem(AI_ADMIN_VIEW_STORAGE_KEY);
  localStorage.removeItem(ADMIN_AI_MODE_STORAGE_KEY);
  const windowEl = $("chat-window");
  if (windowEl) windowEl.querySelectorAll(".answer-model, .answer-source").forEach((element) => {
    if (element.classList.contains("answer-model") || /(nvidia|meta\/|openai\/|muse|nemotron|gpt-oss)/i.test(element.textContent || "")) element.remove();
  });
  const modelName = $("chat-model-name");
  if (modelName) modelName.textContent = "AI model";
}

function hasAdminAiView() {
  try {
    const saved = JSON.parse(localStorage.getItem(AI_ADMIN_VIEW_STORAGE_KEY));
    if (!saved) return false;
    const valid = isKaushikAdminProfile()
      && saved.profileFingerprint === adminProfileFingerprint()
      && saved.expiresAt
      && Date.parse(saved.expiresAt) > Date.now();
    if (!valid) revokeAdminAiView();
    return Boolean(valid);
  } catch { revokeAdminAiView(); return false; }
}

function adminAiMode() {
  const allowed = new Set(["local-first", "local-only", "muse", "gpt-oss"]);
  const saved = localStorage.getItem(ADMIN_AI_MODE_STORAGE_KEY) || "local-first";
  return hasAdminAiView() && allowed.has(saved) ? saved : "local-first";
}

function adminRequestedModel() {
  return ({ muse: "meta/muse-glimmer-30b", "gpt-oss": "openai/gpt-oss-120b" })[adminAiMode()] || "";
}

function adminForcesActualAi() {
  return hasAdminAiView() && Boolean(adminRequestedModel());
}

function renderAdminAiVisibility() {
  const badge = $("chat-model-badge");
  const control = $("admin-ai-control");
  const select = $("admin-ai-mode");
  const htmlImport = $("admin-html-import");
  const dashboard = $("admin-dashboard-panel");
  const visible = hasAdminAiView();
  if (badge) badge.hidden = !visible;
  if (control) control.hidden = !visible;
  if (htmlImport) htmlImport.hidden = !visible;
  if (dashboard) dashboard.style.display = visible ? "block" : "none";
  if (select) select.value = adminAiMode();
}

function aiAnswerMarkup(answer, model = "", fallback = false) {
  if (!hasAdminAiView()) return `<p>${formatAiAnswer(answer)}</p>`;
  return `<p class="answer-model">AI response${fallback ? " (fallback model)" : ""}</p><p>${formatAiAnswer(answer)}</p><p class="answer-source">${escapeHtml(model)}</p>`;
}

function verifiedAiAnswerOverride(question, answer = "") {
  const branchAnswer = engineeringBranchesAnswer(question);
  if (!branchAnswer) return "";
  const text = stripThinkingPrefix(String(answer));
  const statesVerifiedCount = /\b7\b/.test(text) && /\b(?:branch|branches)\b/i.test(text);
  return statesVerifiedCount ? "" : branchAnswer;
}

function preferredGroup(groups) {
  return groups.find((group) => /^ECB(?:\d|$)/.test(group)) || groups.find((group) => /^EC(?:\d|[A-Z])/.test(group)) || groups[0] || "";
}

function groupLabel(group) {
  const base = group.replace(/^D[23]/, "");
  const branch = BRANCHES.find(([prefix]) => base.startsWith(prefix))?.[1] || "Programme timetable";
  return `${group} - ${branch}`;
}

function engineeringBranchCatalog() {
  return SECTION_LIST_BRANCHES.map((code) => ({ code, name: BRANCHES.find(([prefix]) => prefix === code)?.[1] || code }));
}

function engineeringBranchesAnswer(question = "") {
  const q = canonicalTimetableQuestion(question);
  if (/\b(?:my|mine|mera|meri|mere)\s+branch\b/.test(q)) return "";
  const mentionsBranch = /\b(?:branch|branches|brances|brnches|barnches|braches)\b/.test(q);
  const asksCatalogue = /\b(?:how many|count|total|list|show|which|what|name|have|offer|available)\b/.test(q);
  if (!mentionsBranch || !asksCatalogue) return "";
  const branches = engineeringBranchCatalog();
  return `<p><strong>GNDEC has <u>${branches.length} current B.Tech engineering branches</u> in Compass:</strong></p><ol>${branches.map((branch) => `<li><strong>${escapeHtml(branch.code)}</strong> · ${escapeHtml(branch.name)}</li>`).join("")}</ol><p>This count is specifically for B.Tech engineering branches, not every UG/PG programme offered by the college.</p><p class="answer-source"><a href="${OFFICIAL_PROGRAMS_URL}" target="_blank" rel="noopener noreferrer">Official GNDEC programme catalogue ↗</a></p>`;
}

function teacherNames(value) {
  return String(value || "").split(/\s*,\s*|\s+&\s+/).map((teacher) => teacher.trim()).filter((teacher) => teacher && !/not listed/i.test(teacher));
}

function classTypeLabel(value) {
  const type = String(value || "").trim().toUpperCase();
  if (type === "L") return "Lecture (L)";
  if (type === "T") return "Tutorial (T)";
  if (type === "P") return "Practical/Lab (P)";
  return type || "Class";
}

function expandRoomLocation(room) {
  if (!room) return "";
  let r = room;
  // Expand common lab abbreviations
  r = r.replace(/\bCOMP LAB\b/gi, "Computer Lab");
  r = r.replace(/\bMECH LAB\b/gi, "Mechanical Lab");
  r = r.replace(/\bCHEM LAB\b/gi, "Chemistry Lab");
  r = r.replace(/\bPHY LAB\b/gi, "Physics Lab");
  r = r.replace(/\bCIVIL LAB\b/gi, "Civil Lab");
  r = r.replace(/\bELEC LAB\b/gi, "Electrical Lab");
  r = r.replace(/\bWORKSHOP\b/gi, "Workshop");
  return r;
}

function buildScheduleIndex() {
  state.index = { byGroupDay: new Map(), bySubject: new Map(), byTeacher: new Map() };
  state.schedule.forEach((item) => {
    if (!isValidScheduleEntry(item)) return;
    const add = (map, key) => map.set(key, [...(map.get(key) || []), item]);
    add(state.index.byGroupDay, `${item.group}|${item.day}`);
    add(state.index.bySubject, item.subject.toLowerCase());
    const teachers = teacherNames(item.teacher);
    if (!teachers.length) add(state.index.byTeacher, "teacher not listed");
    else teachers.forEach((teacher) => add(state.index.byTeacher, teacher.toLowerCase()));
  });
}

function recordGroupUsage(group) {
  if (!group) return;
  let usage = {};
  try { usage = JSON.parse(localStorage.getItem(GROUP_USAGE_KEY)) || {}; } catch { /* ignore */ }
  usage[group] = (usage[group] || 0) + 1;
  try { localStorage.setItem(GROUP_USAGE_KEY, JSON.stringify(usage)); } catch { /* ignore */ }
}

function sortedGroups() {
  let usage = {};
  try { usage = JSON.parse(localStorage.getItem(GROUP_USAGE_KEY)) || {}; } catch { /* ignore */ }
  return [...state.groups].sort((a, b) => (usage[b] || 0) - (usage[a] || 0) || a.localeCompare(b));
}

function hydrateGroupControls() {
  const options = sortedGroups();
  [$("group-select"), $("timetable-group")].forEach((select) => {
    select.innerHTML = options.length ? options.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(groupLabel(group))}</option>`).join("") : "<option>Load timetable data first</option>";
    select.disabled = !options.length;
    select.value = state.selectedGroup;
  });
  hydrateSubgroupControl();
}

function cohortTokens(value = "") {
  return cleanText(value).split(/\s*,\s*/).filter(Boolean);
}

function subgroupsFor(group) {
  return [...new Set(state.schedule
    .filter((item) => item.group === group)
    .flatMap((item) => cohortTokens(item.cohorts))
    .filter((cohort) => cohort !== group && cohort.startsWith(group)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function hydrateSubgroupControl() {
  const select = $("subgroup-select");
  const subgroups = subgroupsFor(state.selectedGroup);
  if (!subgroups.includes(state.selectedSubgroup)) state.selectedSubgroup = subgroups[0] || "";
  localStorage.setItem(SUBGROUP_STORAGE_KEY, state.selectedSubgroup);
  select.disabled = !state.groups.length;
  select.innerHTML = `<option value="">All students</option>${subgroups.map((subgroup) => `<option value="${escapeHtml(subgroup)}">${escapeHtml(subgroup)}</option>`).join("")}`;
  select.value = state.selectedSubgroup;
}

function isMissingTimetableDetail(value, label) {
  const detail = cleanText(value);
  return !detail || new RegExp(`^${label}\\s+not\\s+listed$`, "i").test(detail);
}

function mentoringDetailsFromProfile(item, profile) {
  if (cleanText(item.subject).toUpperCase() !== "MENTORING CLASS & PROFESSIONAL DEVELOPMENT") return item;
  const mentor = cleanText(profile.mentor);
  const venue = cleanText(profile.mentorVenue || profile.venue);
  const teacher = isMissingTimetableDetail(item.teacher, "teacher") && mentor ? mentor : item.teacher;
  const room = isMissingTimetableDetail(item.room, "room") && venue ? venue : item.room;
  return teacher === item.teacher && room === item.room ? item : { ...item, teacher, room };
}

function classFor(group, day, subgroup = state.selectedSubgroup) {
  const base = [...(state.index.byGroupDay.get(`${group}|${day}`) || [])].filter((item) => {
    const cohorts = cohortTokens(item.cohorts);
    if (!subgroup) return true;
    return !cohorts.length || cohorts.includes(group) || cohorts.includes(subgroup);
  });
  const profile = activeStudentProfile();
  const appliesToActiveSelection = group === state.selectedGroup
    && String(group || "").toUpperCase() === String(profile.section || "").toUpperCase()
    && String(subgroup || "").toUpperCase() === String(profile.subsection || profile.subgroup || "").toUpperCase()
    && state.academicOverlayGroup === cleanText(profile.academicGroup);
  if (!appliesToActiveSelection) return base.sort((a, b) => a.start - b.start);
  const existing = new Set(base.map((item) => `${item.day}|${item.start}|${item.end}|${item.subject}`));
  const extra = state.academicOverlay
    .filter((item) => item.day === day && !existing.has(`${item.day}|${item.start}|${item.end}|${item.subject}`))
    .map((item) => mentoringDetailsFromProfile(item, profile));
  return [...base, ...extra].sort((a, b) => a.start - b.start);
}

const MENTORING_CLASS_SUBJECT = "MENTORING CLASS & PROFESSIONAL DEVELOPMENT";

function mentoringClassAnswer(question = "") {
  const q = canonicalTimetableQuestion(question);
  const explicitlyMentoring = /\bmentoring\b|\bmentor\s+(?:class|period|lecture)\b|\bprofessional\s+development\b/i.test(q);
  const locationFollowup = /^\s*(?:where|location|room|venue|place)\s*\??\s*$/i.test(q)
    && state.lastTimetableSubject === MENTORING_CLASS_SUBJECT;
  if (!explicitlyMentoring && !locationFollowup) return "";
  if (!state.schedule.length || !state.selectedGroup) return "";
  // An explicitly named section/subsection owns the question even when a
  // different timetable is active ("ecb1 mentoring class" while ECB2 is
  // selected). A code-like token that matches no loaded selection must not
  // silently degrade to the active selection's data.
  const namedSelection = requestedTimetableSelection(q);
  const codeStopwords = new Set(["A", "AN", "THE", "AND", "OR", "OF", "FOR", "TO", "IN", "ON", "AT", "IS", "ARE", "AM", "DO", "DOES", "MY", "ME", "OUR", "US", "WE", "YOU", "YOUR", "HIS", "HER", "THEIR", "ITS", "WHAT", "WHICH", "WHO", "WHEN", "WHERE", "HOW", "SHOW", "TELL", "GIVE", "LIST", "NAME", "ALL", "ANY", "PLEASE", "NOW", "NEXT", "LAST", "THIS", "THAT", "THERE", "HERE", "TODAY", "TOMORROW", "YESTERDAY", "FREE", "KA", "KI", "KE", "DA", "DI", "DE", "HAI", "AAJ", "AJJ", "KAL", "BATAO", "DIKHAO", "DHUNDO", "KHOJO", "DASSO"]);
  // True code shapes only: 2–3 letter codes (EC, CSA, IT) or digit-bearing
  // codes (ECB1, CSD2). Ordinary words like CLASS or VENUE never match.
  const unknownCode = (q.toUpperCase().match(/\b(?:[A-Z]{2,3}|[A-Z]{2,4}\d{1,2}[A-Z]?)\b/g) || [])
    .some((token) => !codeStopwords.has(token) && !requestedTimetableSelection(token));
  if (!namedSelection && unknownCode) return "";
  const group = namedSelection?.group || state.selectedGroup;
  const subgroup = namedSelection ? namedSelection.subgroup : state.selectedSubgroup;
  const label = subgroup || group;
  const entries = DAY_NAMES.flatMap((day) => classFor(group, day, subgroup))
    .filter((item) => cleanText(item.subject).toUpperCase() === MENTORING_CLASS_SUBJECT);
  if (!entries.length) {
    return `<p><strong><u>Mentoring class not listed</u></strong></p><p>The verified timetable does not list a mentoring class for ${escapeHtml(label)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
  }
  state.lastTimetableSubject = MENTORING_CLASS_SUBJECT;
  return scheduleAnswer(entries, `${label} · Mentoring class & professional development`);
}

const OFFICIAL_TIMETABLE_VIEWS = Object.freeze({
  teachers: { label: "Faculty timetable", noun: "faculty member" },
  rooms: { label: "Room timetable", noun: "room" },
  subjects: { label: "Subject timetable", noun: "subject" },
  years: { label: "Programme timetable", noun: "programme" },
  groups: { label: "Section timetable", noun: "section" },
  subgroups: { label: "Subsection timetable", noun: "subsection" }
});

function isTimetableComparisonQuestion(question = "") {
  const q = canonicalTimetableQuestion(question);
  return /\b(?:compare|comparison|vs|versus|difference|different)\b/.test(q)
    && /\b(?:time\s*table|timetable|schedule|class(?:es)?|lectures?|periods?)\b/.test(q);
}

function requestedOfficialTimetableView(question = "") {
  const q = canonicalTimetableQuestion(question);
  if (isTimetableComparisonQuestion(q)) return "";
  const timetableWords = /\b(?:time\s*table|timetable|schedule|class(?:es)?)\b/i.test(q);
  if (!timetableWords) return "";
  if (/\b(?:faculty|teacher)\b/.test(q)) return "teachers";
  if (/\b(?:room|venue|location)\b/.test(q)) return "rooms";
  if (/\b(?:subject|course)\b/.test(q)) return "subjects";
  if (/\b(?:program|programme|year)\b/.test(q)) return "years";
  if (/\b(?:subsection|subgroup|sub section)\b/.test(q)) return "subgroups";
  if (/\b(?:section|group)\b/.test(q)) return "groups";
  return "";
}

function viewCaptionForQuestion(question, schedule) {
  const q = normalizeStudentName(canonicalTimetableQuestion(question));
  const captions = [...new Set(schedule.map((item) => cleanText(item.group)).filter(Boolean))];
  const normalized = (value) => normalizeStudentName(value).replace(/^(?:dr|er|prof|professor)\s+/, "");
  const direct = captions.filter((caption) => {
    const full = normalizeStudentName(caption);
    const withoutTitle = normalized(caption);
    return (full.length >= 2 && q.includes(full)) || (withoutTitle.length >= 3 && q.includes(withoutTitle));
  });
  if (direct.length === 1) return direct[0];
  const words = q.split(" ").filter((word) => word.length >= 3);
  const fuzzy = captions.filter((caption) => {
    const pieces = normalized(caption).split(" ").filter((word) => word.length >= 3);
    return pieces.length && pieces.filter((piece) => words.some((word) => word === piece || editDistance(word, piece) <= (piece.length >= 7 ? 2 : 1))).length >= Math.min(2, pieces.length);
  });
  return fuzzy.length === 1 ? fuzzy[0] : "";
}

function officialTimetableViewAnswer(question = "") {
  const id = requestedOfficialTimetableView(question);
  const view = OFFICIAL_TIMETABLE_VIEWS[id];
  const loaded = state.timetableViews.get(id)?.schedule || [];
  if (!view || !loaded.length) return "";
  const caption = viewCaptionForQuestion(question, loaded);
  if (!caption) {
    // A comparison request owns two codes; a single-code view must not steal it.
    if (/\b(?:vs|versus)\b/i.test(canonicalTimetableQuestion(question))) return "";
    const available = [...new Set(loaded.map((item) => cleanText(item.group)).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return `<p><strong><u>${escapeHtml(view.label)}</u></strong></p><p>Name a verified ${escapeHtml(view.noun)} to see its weekly schedule.</p>${available.length ? `<p><strong>Available:</strong> ${escapeHtml(available.slice(0, 30).join(", "))}${available.length > 30 ? " …" : ""}</p>` : ""}<p class="answer-source">Official GNDEC ${escapeHtml(view.label.toLowerCase())}.</p>`;
  }
  const day = requestedWeekday(question);
  const entries = loaded.filter((item) => item.group === caption && (!day || item.day === day));
  return scheduleAnswer(entries, `${caption} · ${view.label}${day ? ` · ${day}` : ""}`);
}

async function loadOfficialTimetableView(id) {
  const view = OFFICIAL_TIMETABLE_VIEWS[id];
  if (!view) return [];
  const source = (state.sourceRegistry?.sources || []).find((item) => item.id === id);
  if (!source?.url) throw new Error(`The current official ${view.label.toLowerCase()} is unavailable.`);
  const current = state.timetableViews.get(id);
  if (current?.revision === source.contentHash && current.schedule.length) return current.schedule;
  if (state.timetableViewLoading.has(id)) return state.timetableViewLoading.get(id);
  const loading = (async () => {
    const response = await fetch(`/api/timetable?source=${encodeURIComponent(id)}`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`The official ${view.label.toLowerCase()} could not be loaded.`);
    const schedule = sanitizeSchedule(parseFetTimetable(await response.text()));
    if (!schedule.length) throw new Error(`The official ${view.label.toLowerCase()} could not be read.`);
    state.timetableViews.set(id, { revision: source.contentHash || source.url, schedule });
    return schedule;
  })();
  state.timetableViewLoading.set(id, loading);
  try { return await loading; }
  finally { state.timetableViewLoading.delete(id); }
}

function requestedTimetableSelection(question = "") {
  const q = canonicalTimetableQuestion(question);
  const groups = [...new Set(state.schedule.map((item) => cleanText(item.group)).filter(Boolean))];
  const selections = [
    ...groups.flatMap((group) => subgroupsFor(group).map((subgroup) => ({ group, subgroup, code: subgroup }))),
    ...groups.map((group) => ({ group, subgroup: "", code: group }))
  ].sort((left, right) => right.code.length - left.code.length || Number(Boolean(right.subgroup)) - Number(Boolean(left.subgroup)) || left.code.localeCompare(right.code));
  return selections.find((selection) => new RegExp(`(?:^|[^a-z0-9])${selection.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLowerCase()}(?:$|[^a-z0-9])`, "i").test(q)) || null;
}

function explicitTimetableSelectionAnswer(question = "") {
  const q = canonicalTimetableQuestion(question);
  if (!/\b(?:time\s*table|timetable|schedule|class(?:es)?|lectures?)\b/i.test(q)) return "";
  // A comparison request owns two codes; a single-code route must not steal it.
  if (isTimetableComparisonQuestion(q)) return "";
  const selection = requestedTimetableSelection(q);
  if (!selection) return "";
  // Relative-day words must scope the view exactly like the personal
  // timetable route: "ECB1 timetable today" is a one-day answer, not a week.
  const asksToday = /\btoday\b/.test(q);
  const asksTomorrow = /\btomorrow\b/.test(q);
  const window = requestedTimetableWindow(q);
  const dateRequest = requestedTimetableDate(q);
  const futureStudyDay = asksTomorrow ? nextStudyDayInfo(false) : null;
  const day = requestedWeekday(q)
    || dateRequest?.day
    || (futureStudyDay ? futureStudyDay.day : "")
    || (asksToday || window ? getIndiaNow().day : "");
  const entries = day
    ? classFor(selection.group, day, selection.subgroup)
    : DAY_NAMES.flatMap((weekday) => classFor(selection.group, weekday, selection.subgroup));
  const label = selection.subgroup || selection.group;
  if (window) return timetableWindowAnswer(entries, `${label}${day ? ` · ${day}` : ""}`, window);
  return scheduleAnswer(entries, `${label} timetable${day ? ` · ${day}` : ""}`);
}

function activeTimetableLabel() {
  return state.selectedSubgroup || state.selectedGroup || "Your timetable";
}

function renderClassDetails(item) {
  return `<h2>${escapeHtml(item.subject)}</h2><div class="class-details"><span><strong>${escapeHtml(classTypeLabel(item.type))}</strong></span><span>${escapeHtml(item.teacher)}</span><span>${escapeHtml(expandRoomLocation(item.room))}</span></div>`;
}

function indiaCalendarDate(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(compassReferenceDate());
  const value = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  const date = new Date(Date.UTC(value("year"), value("month") - 1, value("day") + offset));
  return {
    date,
    day: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date),
    label: new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date),
    compactLabel: new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(date)
  };
}

function nextStudyDayInfo(includeToday = false) {
  const firstOffset = includeToday ? 0 : 1;
  for (let offset = firstOffset; offset <= 14; offset += 1) {
    const candidate = indiaCalendarDate(offset);
    if (classFor(state.selectedGroup, candidate.day).length) return { ...candidate, offset };
  }
  return null;
}

function renderLive() {
  const now = getIndiaNow();
  const timeFormatted = now.time12;
  $("clock").textContent = timeFormatted;
  $("clock").dateTime = compassReferenceDate().toISOString();
  $("header-date").textContent = now.date;
  const hour = Math.floor(now.minutes / 60);
  $("greeting").textContent = hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
  const profile = [state.selectedGroup, state.selectedSubgroup].filter(Boolean).join(" / ");
  $("intro-copy").textContent = profile ? `${now.date} · ${profile} · Your timetable is live.` : "Set up this device to see your own timetable.";
  const heroEyebrow = $("hero-eyebrow");
  if (heroEyebrow) heroEyebrow.textContent = profile ? activeTimetableLabel().toUpperCase() : "GNDEC COMPASS";
  const heroGroup = $("hero-group");
  if (heroGroup) heroGroup.textContent = profile || "Choose your timetable";
  const heroDate = $("hero-date");
  if (heroDate) heroDate.textContent = now.date;
  const topbarGroup = $("topbar-group");
  if (topbarGroup) topbarGroup.textContent = profile || "Choose your timetable";
  $("now-label").textContent = "LIVE STATUS";

  // Holiday Alert Banner rendering (Full-day / Gazetted holidays only, within 5 days before holiday till that specific holiday)
  const holidayBanner = $("holiday-banner");
  if (holidayBanner) {
    const todayIso = indiaCalendarDate(0).date.toISOString().slice(0, 10);
    const kernel = globalThis.CompassBrainKernel;
    const fullDayHolidays = kernel?.OFFICIAL_HOLIDAYS_2026
      ? kernel.OFFICIAL_HOLIDAYS_2026.filter((h) => h.type !== "Restricted" && h.closed !== false && h.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date))
      : [];
    const nextHoli = fullDayHolidays[0] || null;

    let diffDays = -1;
    if (nextHoli) {
      const [y1, m1, d1] = todayIso.split("-").map(Number);
      const [y2, m2, d2] = nextHoli.date.split("-").map(Number);
      const utc1 = Date.UTC(y1, m1 - 1, d1);
      const utc2 = Date.UTC(y2, m2 - 1, d2);
      diffDays = Math.round((utc2 - utc1) / (24 * 60 * 60 * 1000));
    }

    if (state.settings?.holidayAlerts !== false && nextHoli && diffDays >= 0 && diffDays <= 5) {
      holidayBanner.hidden = false;
      holidayBanner.setAttribute("role", "button");
      holidayBanner.setAttribute("tabindex", "0");
      holidayBanner.dataset.holidayName = nextHoli.name;
      holidayBanner.dataset.holidayDate = nextHoli.date;

      if (diffDays === 0) {
        holidayBanner.className = "holiday-banner active-holiday";
        holidayBanner.setAttribute("aria-label", `Today is a holiday: ${nextHoli.name}. Tap to ask Compass details.`);
        holidayBanner.innerHTML = `<span class="holiday-icon" aria-hidden="true">🎉</span><div class="holiday-text"><strong>Today is a Holiday: ${escapeHtml(nextHoli.name)}</strong><p>${escapeHtml(nextHoli.description || "College teaching is suspended.")} · Full-day Gazetted Holiday</p></div><div class="holiday-action"><span>Ask Compass</span> <span aria-hidden="true">→</span></div>`;
      } else if (diffDays === 1) {
        holidayBanner.className = "holiday-banner upcoming-holiday";
        holidayBanner.setAttribute("aria-label", `Tomorrow is a holiday: ${nextHoli.name}. Tap to ask Compass details.`);
        holidayBanner.innerHTML = `<span class="holiday-icon" aria-hidden="true">📅</span><div class="holiday-text"><strong>Tomorrow is a Holiday: ${escapeHtml(nextHoli.name)}</strong><p>${escapeHtml(nextHoli.date)} (${escapeHtml(nextHoli.day)}) · Full-day Gazetted Holiday</p></div><div class="holiday-action"><span>Ask Compass</span> <span aria-hidden="true">→</span></div>`;
      } else {
        holidayBanner.className = "holiday-banner info-holiday";
        holidayBanner.setAttribute("aria-label", `Upcoming holiday in ${diffDays} days: ${nextHoli.name}. Tap to ask Compass details.`);
        holidayBanner.innerHTML = `<span class="holiday-icon" aria-hidden="true">🏖️</span><div class="holiday-text"><strong>Upcoming Holiday: ${escapeHtml(nextHoli.name)} (in ${diffDays} days)</strong><p>${escapeHtml(nextHoli.date)} (${escapeHtml(nextHoli.day)}) · Full-day Gazetted Holiday</p></div><div class="holiday-action"><span>Ask Compass</span> <span aria-hidden="true">→</span></div>`;
      }
    } else {
      holidayBanner.hidden = true;
      delete holidayBanner.dataset.holidayName;
      delete holidayBanner.dataset.holidayDate;
    }
  }

  if (!state.schedule.length) return;
  const classes = classFor(state.selectedGroup, now.day);
  const current = classes.find((item) => item.start <= now.minutes && item.end > now.minutes);
  const upcoming = classes.filter((item) => item.start > now.minutes);
  const next = upcoming[0];
  const after = upcoming[1];
  const afterCollegeHours = now.minutes >= COLLEGE_DAY_END_MINUTES;
  const nextStudyDay = afterCollegeHours ? nextStudyDayInfo(false) : null;
  if (afterCollegeHours && !current) {
    $("current-state").textContent = "Classes are finished for today.";
    const nextClasses = nextStudyDay ? classFor(state.selectedGroup, nextStudyDay.day) : [];
    $("current-class").innerHTML = nextClasses[0] ? `<strong>${escapeHtml(activeTimetableLabel())} · ${escapeHtml(nextStudyDay.compactLabel)}</strong><p>Your next study day starts with ${escapeHtml(nextClasses[0].subject)} at ${humanTime(nextClasses[0].start)}.</p>` : "<strong>No upcoming class is listed.</strong><p>Check the weekly timetable for updates.</p>";
    $("progress-start").textContent = "--:--";
    $("progress-end").textContent = "--:--";
    $("class-progress").style.width = "0%";
    renderAgendaSlot($("next-class"), nextClasses[0], nextStudyDay ? `Next study day · ${nextStudyDay.compactLabel}` : "Next study day");
    renderAgendaSlot($("after-next-class"), nextClasses[1], "Then");
    return;
  }
  if (!DAY_NAMES.includes(now.day)) {
    $("current-state").textContent = "No scheduled classes today.";
    const nextWeekendStudyDay = nextStudyDayInfo(true);
    const nextClasses = nextWeekendStudyDay ? classFor(state.selectedGroup, nextWeekendStudyDay.day) : [];
    $("current-class").innerHTML = nextClasses[0] ? `<strong>${escapeHtml(activeTimetableLabel())} · ${escapeHtml(nextWeekendStudyDay.compactLabel)}</strong><p>Weekend break. Your next study day starts with ${escapeHtml(nextClasses[0].subject)} at ${humanTime(nextClasses[0].start)}.</p>` : "<strong>Enjoy your weekend.</strong><p>Your next scheduled study day is shown in the timetable.</p>";
    renderAgendaSlot($("next-class"), nextClasses[0], nextWeekendStudyDay ? `Next study day · ${nextWeekendStudyDay.compactLabel}` : "Next study day");
    renderAgendaSlot($("after-next-class"), nextClasses[1], "Then");
    $("progress-start").textContent = "--:--";
    $("progress-end").textContent = "--:--";
    $("class-progress").style.width = "0%";
    return;
  } else if (current) {
    $("current-state").textContent = "You are in class now.";
    $("current-class").innerHTML = renderClassDetails(current);
  } else if (next) {
    $("current-state").textContent = now.minutes < next.start ? "Your next class is coming up." : "Classes are finished for today.";
    $("current-class").innerHTML = now.minutes < next.start ? `<strong>${escapeHtml(next.subject)}</strong><p>Starts at ${humanTime(next.start)} in ${escapeHtml(next.room)}.</p>` : "<strong>No more classes today.</strong><p>Check tomorrow's plan when you are ready.</p>";
  } else {
    $("current-state").textContent = "Classes are finished for today.";
    $("current-class").innerHTML = "<strong>Nothing else is scheduled.</strong><p>Use the timetable to look ahead.</p>";
  }
  $("progress-start").textContent = current ? humanTime(current.start) : "--:--";
  $("progress-end").textContent = current ? humanTime(current.end) : "--:--";
  $("class-progress").style.width = current ? `${Math.max(0, Math.min(100, ((now.minutes - current.start) / (current.end - current.start)) * 100))}%` : "0%";
  renderAgendaSlot($("next-class"), next, current ? "After this" : "Next class");
  renderAgendaSlot($("after-next-class"), after, "Then");
}

function renderAgendaSlot(element, item, prefix) {
  element.innerHTML = item ? `<strong>${escapeHtml(item.subject)}</strong><span>${prefix} · ${humanTime(item.start)} · ${escapeHtml(item.room)}</span>` : "<strong>Nothing else listed</strong><span>Enjoy the open time</span>";
}

function nextScheduledDay(day) {
  const start = DAY_NAMES.indexOf(day);
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = DAY_NAMES[(Math.max(start, -1) + offset) % DAY_NAMES.length];
    if (classFor(state.selectedGroup, candidate).length) return candidate;
  }
  return "";
}

// These are the official timetable bell starts.  A slot is called free only
// when no official class overlaps it; longer practicals therefore cover every
// bell that they occupy instead of producing a false free lecture halfway
// through a lab.
const BELL_STARTS = [510, 570, 630, 690, 750, 810, 870, 930];
// The FET grid has one-hour starts through 3:30 PM; its final period ends at
// 4:20 PM. Keep this separate from the 5 PM “look ahead” product threshold.
const BELL_ENDS = [570, 630, 690, 750, 810, 870, 930, 980];

function officialFreeLectureSlots(classes) {
  return BELL_STARTS
    .map((start, index) => ({ start, end: BELL_ENDS[index] }))
    .filter((slot) => !classes.some((item) => item.start < slot.end && item.end > slot.start))
    .map((slot) => ({ id: `free-${slot.start}`, ...slot, free: true }));
}

function dayPlanEntries(classes) {
  return [...classes, ...officialFreeLectureSlots(classes)]
    .sort((left, right) => left.start - right.start || Number(Boolean(left.free)) - Number(Boolean(right.free)));
}

function renderDaySchedule() {
  const now = getIndiaNow();
  const afterCollegeHours = now.minutes >= COLLEGE_DAY_END_MINUTES;
  const todayClasses = classFor(state.selectedGroup, now.day);
  const nextStudyDay = nextStudyDayInfo(false);
  // Outside teaching days (Saturday/Sunday) the useful plan is always the
  // next real study day. After a weekday ends, it does the same.
  const shouldLookAhead = afterCollegeHours || !todayClasses.length;
  const showNextDay = shouldLookAhead && state.dayPlanOverride !== "today" && Boolean(nextStudyDay);
  const day = showNextDay ? nextStudyDay.day : now.day;
  const classes = classFor(state.selectedGroup, day);
  const plan = dayPlanEntries(classes);
  const profile = activeTimetableLabel();
  $("day-eyebrow").textContent = showNextDay ? (nextStudyDay.offset === 1 ? "TOMORROW'S PLAN" : "NEXT STUDY DAY PLAN") : "TODAY'S PLAN";
  $("day-heading").textContent = state.selectedGroup ? (showNextDay ? `${profile} · ${nextStudyDay.compactLabel}` : `${profile} schedule`) : "Your schedule";
  $("day-schedule").innerHTML = classes.length ? plan.map((item) => item.free
    ? `<article class="schedule-item free-slot"><div class="schedule-time">${humanTime(item.start)}<br /><span>${humanTime(item.end)}</span></div><div><div class="schedule-name">Free lecture</div><div class="schedule-sub">No class listed in the official timetable</div></div><div class="schedule-teacher">Open study time</div><div class="schedule-room">Available</div></article>`
    : `<article class="schedule-item ${!showNextDay && item.start <= now.minutes && item.end > now.minutes ? "current" : ""}"><div class="schedule-time">${humanTime(item.start)}<br /><span>${humanTime(item.end)}</span></div><div><div class="schedule-name">${escapeHtml(item.subject)}</div><div class="schedule-sub">${escapeHtml(classTypeLabel(item.type))}</div></div><div class="schedule-teacher">${escapeHtml(item.teacher)}</div><div class="schedule-room">${escapeHtml(expandRoomLocation(item.room))}</div></article>`).join("") : "<div class=\"empty-list\">No classes are listed for this day.</div>";
  const toggle = $("day-plan-toggle");
  if (toggle) {
    toggle.hidden = !afterCollegeHours || !todayClasses.length || !nextStudyDay;
    toggle.dataset.planTarget = showNextDay ? "today" : "next";
    toggle.textContent = showNextDay ? "Show today's completed plan" : `Show ${nextStudyDay?.compactLabel || "next study day"}`;
  }
}

function renderWeek() {
  const group = $("timetable-group").value || state.selectedGroup;
  const search = $("timetable-search").value.trim().toLowerCase();
  const weekTable = $("week-table");
  const weekGridView = $("week-grid-view");
  const classes = DAY_NAMES.flatMap((day) => classFor(group, day))
    .filter((item) => !search || `${item.subject} ${item.teacher} ${item.room} ${item.type}`.toLowerCase().includes(search));
  const resultStatus = $("timetable-result-status");
  if (!classes.length) {
    if (weekTable) {
      weekTable.hidden = false;
      weekTable.innerHTML = "<div class=\"empty-list\">No matching classes found.</div>";
    }
    if (weekGridView) {
      weekGridView.hidden = true;
      weekGridView.innerHTML = "";
    }
    if (resultStatus) resultStatus.textContent = search ? `No classes match “${$("timetable-search").value.trim()}”.` : "No timetable classes are available for this selection.";
    return;
  }
  const activeDays = DAY_NAMES.filter((day) => classes.some((item) => item.day === day));
  if (resultStatus) resultStatus.textContent = `${classes.length} ${classes.length === 1 ? "class" : "classes"} across ${activeDays.length} ${activeDays.length === 1 ? "day" : "days"}${search ? ` matching “${$("timetable-search").value.trim()}”` : ""}.`;
  const listMarkup = `<div class="week-list">${DAY_NAMES.map((day) => {
    const dayEntries = classes.filter((item) => item.day === day).sort((left, right) => left.start - right.start || left.subject.localeCompare(right.subject));
    const dayClasses = classFor(group, day);
    const freeSlots = search ? 0 : officialFreeLectureSlots(dayClasses).length;
    const classCountStr = `${dayEntries.length} ${dayEntries.length === 1 ? "class" : "classes"}`;
    const freeCountStr = freeSlots ? `, ${freeSlots} free` : "";
    return `<section class="week-list-day"><div class="week-list-head"><h3>${day}</h3><span>${classCountStr}${freeCountStr}</span></div>${dayEntries.length
      ? `<div class="week-list-cards">${dayEntries.map((item) => `<article class="week-list-card"><div class="week-list-time"><strong>${humanTime(item.start)}</strong><span>${humanTime(item.end)}</span></div><div class="week-list-body"><strong>${escapeHtml(item.subject)}</strong><span>${escapeHtml(item.teacher)}</span><span>${escapeHtml(expandRoomLocation(item.room))}${item.type ? ` · ${escapeHtml(classTypeLabel(item.type))}` : ""}</span></div></article>`).join("")}</div>`
      : "<div class=\"week-list-empty\">No class listed for this day.</div>"}</section>`;
  }).join("")}</div>`;
  // Always keep every official bell row visible, including rows that are free
  // for all five days. Preserve any verified non-standard start published by
  // a future timetable instead of forcing it into a fabricated slot.
  const times = [...new Set([...BELL_STARTS, ...classes.map((item) => item.start)])].sort((a, b) => a - b);
  // Spatial Canvas (Google Calendar style)
  const earliestStart = Math.min(...times, 510); // Default to 8:30 AM
  const latestEnd = Math.max(...classes.map(c => c.end), earliestStart + 480);
  const totalMinutes = latestEnd - earliestStart;
  
  let spatialMarkup = `<div style="overflow-x:auto;"><div class="spatial-canvas glass-panel" style="display:flex; min-width:800px; padding:16px;">
    <div style="width:64px; position:relative; border-right:1px solid var(--line); margin-right:12px;">`; 
  for (let m = earliestStart; m <= latestEnd; m += 60) {
     const topPercent = ((m - earliestStart) / totalMinutes) * 100;
     spatialMarkup += `<div style="position:absolute; top:calc(${topPercent}% + 32px); font-size:11px; color:var(--muted); font-family:'JetBrains Mono', monospace; transform:translateY(-50%);">${humanTime(m)}</div>`;
  }
  spatialMarkup += `</div>`; // end time axis
  
  DAY_NAMES.forEach(day => {
     spatialMarkup += `<div style="flex:1; position:relative; border-right:1px dotted var(--line-soft); padding:0 6px;">
        <div style="text-align:center; padding-bottom:8px; font-weight:800; color:var(--text); font-size:13px; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">${day}</div>`;
        
     const dayClasses = classes.filter(c => c.day === day);
     dayClasses.forEach(c => {
        const top = ((c.start - earliestStart) / totalMinutes) * 100;
        const height = ((c.end - c.start) / totalMinutes) * 100;
        spatialMarkup += `<div class="spatial-block" style="top:calc(${top}% + 36px); height:calc(${height}% - 4px); left:6px; right:6px;">
           <strong style="margin-bottom:2px; font-size:14px; line-height:1.2; text-overflow:ellipsis; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(c.subject)}</strong>
           <span class="spatial-room">${escapeHtml(c.room || "TBA")} · ${escapeHtml(c.teacher)}</span>
           <span class="spatial-time" style="font-size:11px; margin-top:auto;">${humanTime(c.start)}</span>
        </div>`;
     });
     spatialMarkup += `</div>`;
  });
  spatialMarkup += `</div></div>`;
  
  // Swapped axes (Days as rows, Time as columns)
  const officialSlotEnds = (start) => {
    const idx = BELL_STARTS.indexOf(start);
    if (idx >= 0 && BELL_ENDS[idx]) return BELL_ENDS[idx];
    const verifiedEnds = classes.filter((item) => item.start === start && item.end > start).map((item) => item.end).sort((a, b) => a - b);
    return verifiedEnds[0] || (start + 60);
  };

  const standardGridMarkup = `<div class="week-grid">
    ${["Time", ...DAY_NAMES].map((day) => `<div class="week-head">${escapeHtml(day)}</div>`).join("")}
    ${times.map((start) => {
      const end = officialSlotEnds(start);
      const label = `<div class="week-time"><span class="week-time-start">${humanTime(start)}</span><span class="week-time-end">${humanTime(end)}</span></div>`;
      const cells = DAY_NAMES.map((day) => {
        const dayClasses = classes.filter((item) => item.day === day && item.start === start);
        const continuing = dayClasses.length ? [] : classes.filter((item) => item.day === day && item.start < start && item.end > start);
        const cellClasses = dayClasses.map((item) => `<div class="week-class"><strong>${escapeHtml(item.subject)}</strong><span>${escapeHtml(item.room)} · ${escapeHtml(item.teacher)}</span></div>`).join("");
        const continuationNotice = continuing.map((item) => `<div class="week-class continuation"><strong>${escapeHtml(item.subject)}</strong><span>Continues (${escapeHtml(item.room)})</span></div>`).join("");
        return `<div class="week-cell">${cellClasses || continuationNotice || ""}</div>`;
      }).join("");
      return `${label}${cells}`;
    }).join("")}
  </div>`;

  const transposedMarkup = `<div class="transposed-grid" style="grid-template-columns: 104px repeat(${times.length}, minmax(145px, 1fr));">
    <div class="transposed-head-cell day-col">DAY \\ TIME</div>
    ${times.map((t) => {
      const end = officialSlotEnds(t);
      return `<div class="transposed-head-cell"><span class="transposed-time-start">${humanTime(t)}</span><span class="transposed-time-end">${humanTime(end)}</span></div>`;
    }).join("")}
    ${DAY_NAMES.map((day) => {
      const dayClasses = classes.filter((item) => item.day === day);
      const freeSlots = officialFreeLectureSlots(dayClasses).length;
      const classCountStr = `${dayClasses.length} ${dayClasses.length === 1 ? "class" : "classes"}`;
      const freeCountStr = freeSlots ? `, ${freeSlots} free` : "";
      const dayLabel = `<div class="transposed-day-label"><strong class="transposed-day-name">${day}</strong><span class="transposed-day-count">${classCountStr}${freeCountStr}</span></div>`;
      const cells = times.map((t) => {
        const starts = dayClasses.filter((item) => item.start === t);
        const continuing = starts.length ? [] : dayClasses.filter((item) => item.start < t && item.end > t);
        if (starts.length) {
          const contents = starts.map((item) => `
            <div class="week-class">
              <strong>${escapeHtml(item.subject)}</strong>
              <span>${escapeHtml(item.room || "TBA")} · ${escapeHtml(item.teacher)}</span>
            </div>
          `).join("");
          return `<div class="transposed-cell occupied">${contents}</div>`;
        }
        if (continuing.length) {
          const contents = continuing.map((item) => `
            <div class="week-class continuation">
              <strong>${escapeHtml(item.subject)}</strong>
              <span>Continues (${escapeHtml(item.room || "TBA")})</span>
            </div>
          `).join("");
          return `<div class="transposed-cell continuation">${contents}</div>`;
        }
        return `<div class="transposed-cell empty-slot"><span class="transposed-free">—</span></div>`;
      }).join("");
      return `${dayLabel}${cells}`;
    }).join("")}
  </div>`;

  const showGrid = state.settings?.timetableGridView !== false;
  const swapAxes = showGrid && state.settings?.timetableSwapAxes === true;
  const activeMarkup = !showGrid ? listMarkup : (swapAxes ? transposedMarkup : standardGridMarkup);

  if (weekTable) {
    weekTable.hidden = false;
    weekTable.innerHTML = activeMarkup;
  }
  if (weekGridView) {
    weekGridView.hidden = true;
    weekGridView.innerHTML = "";
  }
}

function renderTimetableSearchSuggestions() {
  const datalist = $("timetable-search-suggestions");
  if (!datalist) return;
  const group = $("timetable-group")?.value || state.selectedGroup;
  const classes = DAY_NAMES.flatMap((day) => classFor(group, day));
  const options = [
    ...new Set(classes.map((item) => item.subject).filter(Boolean)).values()
  ].sort().map((value) => ({ value, label: "Subject" }));
  const seen = new Set(options.map((item) => item.value.toLowerCase()));
  [
    ...classes.map((item) => ({ value: item.teacher, label: "Teacher" })),
    ...classes.map((item) => ({ value: item.room, label: "Room" }))
  ].filter((item) => item.value && !/not listed/i.test(item.value)).sort((a, b) => a.value.localeCompare(b.value)).forEach((item) => {
    const key = item.value.toLowerCase();
    if (!seen.has(key)) { seen.add(key); options.push(item); }
  });
  datalist.innerHTML = options.slice(0, 80).map((item) => `<option value="${escapeHtml(item.value)}" label="${escapeHtml(item.label)}"></option>`).join("");
}

// A small, human-readable catalogue makes suggestions useful immediately on a
// new device.  The full official 33-page index is still the source used for
// answers; this only avoids making students wait for its background preload.
const SYLLABUS_COURSE_HINTS = [
  { title: "Physics", aliases: ["physics", "phyiscs", "fiziks", "bhautik"] },
  { title: "Mathematics - I", aliases: ["math", "maths", "mathematics", "ganit"] },
  { title: "Mathematics - II", aliases: ["math 2", "math ii", "mathematics 2", "mathematics ii"] },
  { title: "Chemistry", aliases: ["chemistry", "chemestry", "rasayan"] },
  { title: "Professional English Communication", aliases: ["english", "communication"] },
  { title: "Economics", aliases: ["economics", "economy"] },
  { title: "Basic Electrical and Electronics Engineering", aliases: ["electrical", "electronics", "bee"] },
  { title: "Engineering Drawing and Graphics", aliases: ["drawing", "graphics", "engineering drawing"] },
  { title: "Programming for Problem Solving", aliases: ["programming", "programing", "pps", "problem solving"] },
  { title: "Manufacturing Practices", aliases: ["manufacturing", "workshop"] },
  { title: "Programming Fundamentals using Python", aliases: ["python", "programming fundamentals"] }
];

function syllabusHintTitles(question) {
  const words = normalizeStudentName(canonicalTimetableQuestion(question));
  return SYLLABUS_COURSE_HINTS.filter((course) => course.aliases.some((alias) => words.includes(normalizeStudentName(alias)))).map((course) => course.title);
}

function syllabusQuestionSuggestions(question) {
  const typed = cleanText(question);
  if (typed.length < 3) return [];
  const q = canonicalTimetableQuestion(typed);
  const matchedCourses = state.syllabus.length ? syllabusCoursesForQuestion(typed) : [];
  const asksSyllabus = /units?|syllabus|course|topics?|chapters?|outcomes?|credits?|marks?|total|how\s+many|kitne|kinne|subjects?|list|show/.test(q);
  const courseNames = matchedCourses.map((course) => cleanText(course.title));
  const names = courseNames.length ? courseNames : syllabusHintTitles(typed);
  const courses = names.length ? names : (asksSyllabus && state.syllabus.length ? state.syllabus.slice(0, 8).map((course) => course.title) : []);
  const suggestions = [];
  courses.forEach((title) => {
    const unitNumber = q.match(/\bunit\s*(\d{1,2})\b/)?.[1];
    if (unitNumber) suggestions.push(`${title} unit ${unitNumber} details`);
    if (/total|how\s+many|kitne|kinne|units?/.test(q)) suggestions.push(`How many units are in ${title}?`);
    suggestions.push(`${title} syllabus`, `${title} course outcomes`, `${title} credits`);
    if (/marks?|assessment|exam/.test(q)) suggestions.push(`${title} assessment marks`, `${title} exam duration`);
    if (/labs?|laboratory|experiments?|practicals?/.test(q)) suggestions.push(`List ${title} laboratory experiments`);
  });
  if (/total|how\s+many|kitne|kinne|subjects?/.test(q)) suggestions.push("How many official subjects are in the syllabus?", "List all official subjects");
  return [...new Set(suggestions)].filter((suggestion) => suggestion.toLowerCase() !== typed.toLowerCase()).slice(0, 6);
}

const CORE_QUESTION_SUGGESTIONS = Object.freeze([
  "What is my next class?",
  "Aaj ka timetable batao",
  "Free lectures today",
  "Show all official holidays",
  "Who is my mentor?",
  "Math units",
  "Where is my next class?",
  "Is my timetable verified?",
  "Check for official updates",
  "What can you do?",
  "Kal ka timetable batao",
  "Parson ka timetable batao",
  "When is the next holiday?",
  "How many holidays in August?",
  "Is on 15 August holiday?",
  "Where and when is my mentoring class?",
  "Faculty timetable",
  "Room timetable",
  "Subject timetable",
  "Section timetable",
  "Subsection timetable",
  "Show my full profile",
  "Physics syllabus",
  "What is the marking scheme for Physics?",
  "What date is day after tomorrow?",
  "What time is it in India?",
  "When was the official timetable source generated?",
  "What changed in my timetable?",
  "Show tomorrow as a simple card",
  "What should I do in my next free period?",
  "Which classes are in the same building today?",
  "Make a 45-minute study plan before my next class",
  "Show all official sources used for this answer",
  "Is this from timetable, roster, syllabus, or general advice?",
  "Compare my timetable with last week's verified release",
  "What do I need for tomorrow?",
  "Explain my next class with room, teacher, and syllabus unit",
  "2nd next class",
  "Solve 2x + 3 = 11",
  "Calculate 25% of 240"
]);

function normalizeQuestionSuggestion(value = "") {
  return canonicalTimetableQuestion(value)
    .replace(/\b(?:aaj|ajj)\b/g, "today")
    .replace(/\bkal\b/g, "tomorrow")
    .replace(/\b(?:nxt|agla|agli|agle)\b/g, "next")
    .replace(/\b(?:clas+|lectur+)\b/g, "class")
    .replace(/\b(?:kaha|kahaan|kidhar|kithe|kithhe)\b/g, "where")
    .replace(/\b(?:techer|techers|taecher|faculity)\b/g, "teacher")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionSuggestionScore(candidate, input) {
  const value = normalizeQuestionSuggestion(candidate);
  const query = normalizeQuestionSuggestion(input);
  if (!value) return -1;
  if (!query) return 1;
  if (value === query) return -1;
  const ordinalPenalty = /\b(?:2nd|second|3rd|third|4th|fourth|5th|fifth)\b/.test(value)
    && !/\b(?:2nd|second|3rd|third|4th|fourth|5th|fifth)\b/.test(query) ? 180 : 0;
  if (value.startsWith(query)) return 1600 - value.length - ordinalPenalty;
  if (value.includes(query)) return 1450 - value.length - ordinalPenalty;

  const candidateWords = value.split(" ").filter(Boolean);
  const queryWords = query.split(" ").filter(Boolean);
  let score = 0;
  for (const queryWord of queryWords) {
    let wordScore = 0;
    for (const candidateWord of candidateWords) {
      if (candidateWord === queryWord) wordScore = Math.max(wordScore, 90);
      else if (candidateWord.startsWith(queryWord)) wordScore = Math.max(wordScore, 76 - Math.min(20, candidateWord.length - queryWord.length));
      else if (queryWord.length >= 3 && candidateWord.startsWith(queryWord.slice(0, -1))) wordScore = Math.max(wordScore, 45);
      else if (queryWord.length >= 3 && queryWord.startsWith(candidateWord)) wordScore = Math.max(wordScore, 52);
      else if (queryWord.length >= 4) {
        const allowance = queryWord.length >= 7 ? 2 : 1;
        const distance = editDistance(queryWord, candidateWord);
        if (distance <= allowance) wordScore = Math.max(wordScore, 42 - distance * 8);
      }
    }
    if (!wordScore) return -1;
    score += wordScore;
  }
  return score + (queryWords.length > 1 ? 120 : 0) - Math.min(40, value.length / 3) - ordinalPenalty;
}

function rankQuestionSuggestions(input, candidates, limit = 8) {
  const seen = new Set();
  return candidates.map((candidate, index) => ({ candidate: cleanText(candidate), index }))
    .filter(({ candidate }) => {
      const key = normalizeQuestionSuggestion(candidate);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((entry) => ({ ...entry, score: questionSuggestionScore(entry.candidate, input) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index || left.candidate.localeCompare(right.candidate))
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

// Brain 1's suggestions stay fully independent of Brain 2. They use only the
// active device profile and its verified timetable, and remain intentionally
// bounded so every keystroke is cheap on older phones.
function localQuestionSuggestions(input) {
  const classes = state.selectedGroup ? DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day)) : [];
  const profile = activeStudentProfile();
  const subjects = [...new Set(classes.map((item) => cleanText(item.subject)).filter(Boolean))].slice(0, 24);
  const teachers = [...new Set(classes.flatMap((item) => teacherNames(item.teacher)).map(cleanText).filter(Boolean))].slice(0, 8);
  const rooms = [...new Set(classes.map((item) => cleanText(item.room)).filter((room) => room && !/not listed/i.test(room)))].slice(0, 8);
  const profileSuggestions = hasStudentProfile()
    ? [
      "Who is my mentor?",
      "Where and when is my mentoring class?",
      "Show my full profile",
      "What is my current serial number?",
      ...(profile.mentor ? [`Faculty timetable ${profile.mentor}`] : [])
    ]
    : [];
  const officialViewSuggestions = [
    "Faculty timetable",
    "Room timetable",
    "Subject timetable",
    "Programme timetable",
    "Section timetable",
    "Subsection timetable"
  ];
  const verifiedDataSuggestions = [
    "Is my timetable verified?",
    "When was the official timetable source generated?",
    "Check for official updates",
    "What official data updates automatically?",
    "What changed in my timetable?",
    "Compare my timetable with last week's verified release",
    "Show all official sources used for this answer",
    "Is this from timetable, roster, syllabus, or general advice?",
    ...(hasStudentProfile() ? ["Which current official roster is my profile using?"] : [])
  ];
  const compassWorkflowSuggestions = [
    "Show tomorrow as a simple card",
    "What should I do in my next free period?",
    "Which classes are in the same building today?",
    "Make a 45-minute study plan before my next class",
    "What do I need for tomorrow?",
    "Explain my next class with room, teacher, and syllabus unit"
  ];
  const calendarSuggestions = [
    "What time is it in India?",
    "What date is day after tomorrow?",
    "Parson ka timetable batao",
    "What day is 17 August 2026?"
  ];
  const timetableSuggestions = subjects.flatMap((subject) => [
    `Who teaches ${subject}?`,
    `Where is ${subject}?`,
    `When is ${subject}?`,
    `${subject} weekly schedule`,
    `${subject} syllabus`
  ]);
  const pool = [
    ...CORE_QUESTION_SUGGESTIONS,
    ...profileSuggestions,
    ...verifiedDataSuggestions,
    ...compassWorkflowSuggestions,
    ...officialViewSuggestions,
    ...calendarSuggestions,
    ...timetableSuggestions,
    ...teachers.map((teacher) => `Which subjects does ${teacher} teach?`),
    ...rooms.map((room) => `What classes are in ${room}?`)
  ];
  return rankQuestionSuggestions(input, pool, 8);
}

function questionSuggestionKind(suggestion) {
  const q = normalizeQuestionSuggestion(suggestion);
  if (/official|verified|source|updates?|roster.*using/.test(q)) return "Verified data";
  if (/solve|calculate|sqrt|percentage|percent/.test(q)) return "Calculation";
  if (/date|day after tomorrow|parson|parso|time is it/.test(q)) return "Date & time";
  if (/syllabus|unit|outcome|credit|assessment|exam|textbook|laboratory/.test(q)) return "Syllabus";
  if (/mentor|mentoring|profile|crn|registration|serial/.test(q)) return "Profile";
  if (/programme|program|section|subsection/.test(q)) return "Timetable view";
  if (/teacher|teaches|faculty/.test(q)) return "Teacher";
  if (/where|room|classes are in/.test(q)) return "Room";
  if (/student/.test(q)) return "Student";
  return "Schedule";
}

function updateQuestionSuggestions() {
  const input = $("question-input");
  const list = $("question-live-suggestions");
  const ghostWrap = $("ghost-text-wrap");
  if (!input || !list) return;
  
  if (ghostWrap) {
    if (input.value.trim() === "") {
      const now = getIndiaNow();
      const h = Number(now.time24.split(":")[0]);
      let ghostMsg = "Where is my first class?";
      if (h >= 10 && h < 14) ghostMsg = "Where is my next class?";
      else if (h >= 14 && h < 17) ghostMsg = "When is my last class?";
      else if (h >= 17) ghostMsg = "What classes do I have tomorrow?";
      ghostWrap.textContent = ghostMsg;
    } else {
      ghostWrap.textContent = "";
    }
  }

  let brainSuggestions = [];
  try { brainSuggestions = globalThis.CompassBrainV2?.suggest?.(input.value, compassBrainContext()) || []; } catch { /* suggestions are optional */ }
  const suggestions = rankQuestionSuggestions(input.value, [
    ...localQuestionSuggestions(input.value),
    ...syllabusQuestionSuggestions(input.value),
    ...brainSuggestions
  ], 8);
  list.hidden = !suggestions.length;
  input.setAttribute("aria-expanded", String(Boolean(suggestions.length)));
  input.removeAttribute("aria-activedescendant");
  state.questionSuggestionIndex = -1;
  list.innerHTML = suggestions.map((suggestion, index) => `<button type="button" class="question-suggestion" id="question-suggestion-${index}" role="option" aria-selected="false" data-question-suggestion="${escapeHtml(suggestion)}"><span>${escapeHtml(suggestion)}</span><small>${escapeHtml(questionSuggestionKind(suggestion))}</small></button>`).join("");
}

function closeQuestionSuggestions() {
  const input = $("question-input");
  const list = $("question-live-suggestions");
  if (list) list.hidden = true;
  input?.setAttribute("aria-expanded", "false");
  input?.removeAttribute("aria-activedescendant");
  state.questionSuggestionIndex = -1;
}

function moveQuestionSuggestion(direction) {
  const input = $("question-input");
  const list = $("question-live-suggestions");
  if (!input || !list || list.hidden) return false;
  const options = [...list.querySelectorAll("[data-question-suggestion]")];
  if (!options.length) return false;
  const nextIndex = state.questionSuggestionIndex < 0
    ? (direction > 0 ? 0 : options.length - 1)
    : (state.questionSuggestionIndex + direction + options.length) % options.length;
  options.forEach((option, index) => option.setAttribute("aria-selected", String(index === nextIndex)));
  state.questionSuggestionIndex = nextIndex;
  input.setAttribute("aria-activedescendant", options[nextIndex].id);
  options[nextIndex].scrollIntoView?.({ block: "nearest" });
  return true;
}

function chooseQuestionSuggestion(button) {
  if (!button) return false;
  $("question-input").value = button.dataset.questionSuggestion || "";
  closeQuestionSuggestions();
  $("question-input").focus();
  return true;
}

function activateQuestionSuggestion(button) {
  if (!chooseQuestionSuggestion(button)) return false;
  submitQuestionForm();
  return true;
}

function submitQuestionForm() {
  const form = $("question-form");
  if (!form) return;
  if (typeof form.requestSubmit === "function") form.requestSubmit();
  else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function renderStatus() {
  const loaded = state.schedule.length > 0;
  const subgroupCount = subgroupsFor(state.selectedGroup).length;
  $("data-status").innerHTML = `<span class="status-dot ${loaded ? "" : "warning"}"></span><span>${loaded ? `${state.groups.length} sections loaded${subgroupCount ? ` · ${subgroupCount} subsections` : ""}` : "No timetable loaded"}</span>`;
  const version = state.metadata?.version ? ` · Effective ${state.metadata.version}` : "";
  const sourceFooter = cleanText(state.metadata?.sourceFooter || currentTimetableSourceFooter()).slice(0, 100);
  const footer = sourceFooter ? ` · Official FET footer ${sourceFooter}` : "";
  const fallback = state.metadata?.fallback;
  const registryCheckedAt = state.sourceRegistry?.checkedAt ? new Date(state.sourceRegistry.checkedAt) : null;
  const checked = registryCheckedAt && !Number.isNaN(registryCheckedAt.valueOf()) ? ` · Official links verified ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(registryCheckedAt)} IST` : "";
  const fallbackNotice = fallback ? ` · Serving ${fallback.version || "the previous verified timetable"} while the newer file is unavailable` : "";
  $("refresh-meta").textContent = state.metadata ? `Loaded on this device ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(state.metadata.updatedAt))} IST${version}${footer}${checked}${fallbackNotice}. Compass checks again when this tab returns and every 15 minutes.` : "Not loaded yet";
  const sourceButton = $("source-status-button");
  const sourceText = $("source-status-text");
  if (sourceButton && sourceText) {
    const officialSources = state.sourceRegistry?.sources || [];
    const rosterSources = state.sourceRegistry?.studentSectionSources || [];
    const verified = loaded && officialSources.length >= 6 && officialSources.every((source) => source.verified) && rosterSources.length >= SECTION_LIST_BRANCHES.length && rosterSources.every((source) => source.verified);
    sourceButton.classList.toggle("verified", verified && !fallback);
    sourceButton.classList.toggle("warning", Boolean(state.sourceRegistry) && (!verified || fallback));
    sourceText.textContent = fallback
      ? `Previous verified timetable · ${fallback.version || "retrying latest"}`
      : verified ? `Official data verified · ${state.sourceRegistry.version || "current"}` : state.sourceRegistry ? "Official data needs attention" : "Checking official data";
    sourceButton.title = fallback
      ? "The newer official timetable could not be read. Compass is temporarily using the previous verified release and will retry automatically."
      : sourceFooter ? `Verified official FET footer: ${sourceFooter}` : "Open official GNDEC timetable page";
  }
}

function setSourceError(message = "") {
  const error = $("source-error");
  if (!error) return;
  error.hidden = !message;
  error.textContent = message;
}
function renderQuestionChips() {
  const containers = [...document.querySelectorAll(".question-chips")];
  if (!containers.length) return;
  const lang = state.settings?.preferredLanguage || "hinglish";
  const showHinglish = state.settings?.showHinglishChips !== false;
  const showDynamic = state.settings?.showDynamicChips !== false;
  
  let chips = [];
  if (lang === "hinglish" || (lang === "english" && showHinglish)) {
    chips = [
      { text: "Next class?", query: "What is my next class?" },
      { text: "Aaj ka timetable", query: "Aaj ka timetable batao" },
      { text: "Physics kahan hai?", query: "Physics kahan hai?" },
      { text: "Kal ka timetable", query: "Kal ka timetable batao" },
      { text: "Free lectures today", query: "Free lectures today" },
      { text: "Next holiday kab hai?", query: "When is the next holiday?" },
      { text: "My mentor", query: "Who is my mentor?" },
      { text: "Physics syllabus", query: "Physics syllabus" }
    ];
  } else if (lang === "punjabi") {
    chips = [
      { text: "ਅਗਲੀ ਕਲਾਸ?", query: "ਅਗਲੀ ਕਲਾਸ ਕਿੱਥੇ ਹੈ?" },
      { text: "ਅੱਜ ਦਾ ਟਾਈਮਟੇਬਲ", query: "ਅੱਜ ਦਾ ਟਾਈਮ ਟੇਬਲ ਦੱਸੋ" },
      { text: "ਕੱਲ੍ਹ ਦਾ ਟਾਈਮਟੇਬਲ", query: "ਕੱਲ੍ਹ ਦਾ ਟਾਈਮ ਟੇਬਲ ਦੱਸੋ" },
      { text: "ਫਿਜ਼ਿਕਸ ਕਿੱਥੇ ਹੈ?", query: "ਫਿਜ਼ਿਕਸ ਕਲਾਸ ਕਿੱਥੇ ਹੈ?" },
      { text: "ਅਗਲੀ ਛੁੱਟੀ ਕਦੋਂ ਹੈ?", query: "ਅਗਲੀ ਛੁੱਟੀ ਕਦੋਂ ਹੈ?" },
      { text: "ਮੇਰਾ ਮੈਂਟਰ", query: "ਮੇਰਾ ਮੈਂਟਰ ਕੌਣ ਹੈ?" }
    ];
  } else if (lang === "hindi") {
    chips = [
      { text: "अगली क्लास?", query: "मेरी अगली क्लास कौन सी है?" },
      { text: "आज का टाइमटेबल", query: "आज का टाइमटेबल बताओ" },
      { text: "कल का टाइमटेबल", query: "कल का टाइमटेबल बताओ" },
      { text: "फिजिक्स कहाँ है?", query: "फिजिक्स की क्लास कहाँ है?" },
      { text: "अगली छुट्टी कब है?", query: "अगली छुट्टी कब है?" },
      { text: "मेरे मेंटर", query: "मेरे मेंटर कौन हैं?" }
    ];
  } else {
    chips = [
      { text: "Next class?", query: "What is my next class?" },
      { text: "Today's schedule", query: "Today's schedule" },
      { text: "Where is Physics?", query: "Where is Physics?" },
      { text: "Tomorrow's schedule", query: "Tomorrow's schedule" },
      { text: "Free periods today", query: "Free lectures today" },
      { text: "Next holiday", query: "When is the next holiday?" },
      { text: "My mentor", query: "Who is my mentor?" },
      { text: "Physics syllabus", query: "Physics syllabus" }
    ];
  }
  if (state.timetableUpdate?.id) chips.push({ text: "What changed?", query: "What changed in my timetable?" });
  else chips.push({ text: "Tomorrow card", query: "Show tomorrow as a simple card" });
  if (showDynamic && state.selectedGroup) {
    const now = getIndiaNow();
    const todayClasses = classFor(state.selectedGroup, now.day);
    const liveClass = todayClasses.find((item) => item.start <= now.minutes && item.end > now.minutes) || null;
    const nextClass = todayClasses.find((item) => item.start > now.minutes)
      || (() => {
        const upcomingDay = nextStudyDayInfo(false);
        return upcomingDay ? classFor(state.selectedGroup, upcomingDay.day)[0] : null;
      })();
    const dynamicChips = [];
    if (liveClass) {
      dynamicChips.push(
        { text: `${liveClass.subject} room`, query: `Where is ${liveClass.subject}?` },
        { text: `${liveClass.subject} teacher`, query: `Who teaches ${liveClass.subject}?` }
      );
    }
    if (nextClass) {
      dynamicChips.push(
        { text: `${nextClass.subject} next`, query: `When is my next ${nextClass.subject} class?` },
        { text: `${nextClass.subject} syllabus`, query: `${nextClass.subject} syllabus` }
      );
    }
    const seenQueries = new Set(chips.map((chip) => chip.query.toLowerCase()));
    dynamicChips.forEach((chip) => {
      const key = chip.query.toLowerCase();
      if (!seenQueries.has(key)) {
        seenQueries.add(key);
        chips.push(chip);
      }
    });
  }
  const markup = chips.map((chip) => `<button type="button" data-quick="${escapeHtml(chip.query)}">${escapeHtml(chip.text)}</button>`).join("");
  containers.forEach((container) => { container.innerHTML = markup; });
}

function updateChangeMarkup(change) {
  const before = change.before || {};
  const after = change.after || {};
  const current = after.subject ? after : before;
  const cohort = cleanText(current.cohorts || "");
  const slot = `${change.day} ${humanTime(change.start)}-${humanTime(change.end)}`;
  let detail = "";
  if (change.kind === "added") detail = `${after.subject || "Class"} · ${after.room || "Room not listed"} · ${after.teacher || "Teacher not listed"}`;
  else if (change.kind === "removed") detail = `${before.subject || "Class"} · ${before.room || "Room not listed"} · ${before.teacher || "Teacher not listed"}`;
  else {
    const fields = (change.fields || []).map((field) => `${field[0].toUpperCase()}${field.slice(1)}: ${before[field] || "Not listed"} → ${after[field] || "Not listed"}`);
    detail = fields.join(" · ");
  }
  const kind = change.kind === "added" ? "Added" : change.kind === "removed" ? "Removed" : "Changed";
  return `<li class="timetable-update-change"><span class="timetable-update-kind ${change.kind}">${kind}</span><div><strong>${escapeHtml(change.group)}${cohort ? ` / ${escapeHtml(cohort)}` : ""} · ${escapeHtml(slot)}</strong><p>${escapeHtml(detail)}</p></div></li>`;
}

function renderTimetableUpdateCenter() {
  const update = state.timetableUpdate;
  const hasUpdate = Boolean(update?.id && Array.isArray(update.changes) && update.changes.length);
  const card = $("timetable-update-card");
  const empty = $("timetable-update-empty");
  if (card) card.hidden = !hasUpdate;
  if (empty) empty.hidden = hasUpdate;
  const profileNotice = $("profile-timetable-update");
  if (profileNotice) profileNotice.hidden = !hasUpdate;
  if (!hasUpdate) return;
  const selectedLabel = [update.selectedGroup, update.selectedSubgroup].filter(Boolean).join(" / ");
  const affectedGroups = Array.isArray(update.affectedGroups) ? update.affectedGroups : [];
  const affectedText = update.selectedAffected && selectedLabel
    ? `Your selected timetable (${selectedLabel}) is affected.`
    : `Affected group${update.totalAffectedGroups === 1 ? "" : "s"}: ${affectedGroups.join(", ") || "listed in the change details"}.`;
  const summary = $("timetable-update-summary");
  if (summary) summary.textContent = `${update.totalChanges || update.changes.length} verified class change${(update.totalChanges || update.changes.length) === 1 ? "" : "s"} found. ${affectedText}`;
  const profileText = $("profile-timetable-update-text");
  if (profileText) profileText.textContent = `New timetable detected · ${update.selectedAffected ? "your selected group is affected" : `${update.totalChanges || update.changes.length} verified class changes`}.`;
  const oldFooter = $("timetable-update-old-footer");
  const newFooter = $("timetable-update-new-footer");
  const oldVersion = $("timetable-update-old-version");
  const newVersion = $("timetable-update-new-version");
  if (oldFooter) oldFooter.textContent = update.oldFooter || "Not published";
  if (newFooter) newFooter.textContent = update.newFooter || "Not published";
  if (oldVersion) oldVersion.textContent = update.oldVersion || "Previously loaded release";
  if (newVersion) newVersion.textContent = update.newVersion || "New verified release";
  const detected = $("timetable-update-detected-at");
  if (detected) {
    const date = new Date(update.detectedAt);
    detected.textContent = Number.isNaN(date.valueOf()) ? "Just detected" : `Detected ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date)} IST`;
  }
  const changes = $("timetable-update-changes");
  if (changes) changes.innerHTML = update.changes.map(updateChangeMarkup).join("");
  const source = $("timetable-update-source");
  if (source) {
    source.hidden = !update.sourceUrl;
    if (update.sourceUrl) source.href = update.sourceUrl;
  }
}

function markTimetableUpdateSeen() {
  if (!state.timetableUpdate) return;
  persistTimetableUpdate(null);
  renderTimetableUpdateCenter();
  showToast("Timetable update marked as seen. A new notice will appear only after another verified change.");
}

function renderEverything() { applySettings(); renderStatus(); renderLive(); renderDaySchedule(); renderWeek(); renderQuestionChips(); renderProfileSummary(); renderReferenceLinks(); renderSettingsPage(); renderTimetableUpdateCenter(); renderAdminAiVisibility(); }

function renderProfileSummary() {
  const profile = activeStudentProfile();
  if (!$("profile-name")) return;
  const configured = hasStudentProfile();
  $("profile-name").textContent = configured ? profile.name : "Set up this device";
  $("profile-serial").textContent = configured ? (profile.currentSerialNo || profile.serialNo || (profile.rosterVersion ? "Not published in current roster" : "Not provided")) : "—";
  $("profile-old-serials").textContent = configured ? ((profile.oldSerialNos || []).join(", ") || "No previous serial in saved history") : "—";
  $("profile-crn").textContent = configured ? (profile.crn || (profile.rosterVersion ? "Not published in current roster" : "Not provided")) : "—";
  $("profile-registration").textContent = configured ? (profile.registrationNo || (profile.rosterVersion ? "Not published in current roster" : "Not provided")) : "—";
  $("profile-section").textContent = configured ? [profile.section, profile.subsection].filter(Boolean).join(" / ") : "Not selected";
  $("profile-mentor").textContent = configured ? (profile.mentor || "Not listed") : "—";
  $("profile-mentor-phone").textContent = configured ? (profile.mentorPhone || "Not listed") : "—";
  $("profile-academic-group").textContent = configured ? (profile.academicGroup || "Not listed") : "Choose a group below";
  $("profile-venue").textContent = configured ? (profile.mentorVenue || profile.venue || "Not listed") : "—";
  const syncStatus = $("profile-sync-status");
  if (syncStatus) {
    syncStatus.className = `profile-sync-status${state.profileSyncStatus.startsWith("Verified") ? " verified" : state.profileSyncStatus ? " warning" : ""}`;
    syncStatus.textContent = state.profileSyncStatus || (configured && profile.rosterVersion ? "Verified roster" : "");
  }
  const tagline = $("profile-tagline");
  if (tagline) tagline.textContent = configured ? `${profile.branch} / ${[profile.section, profile.subsection].filter(Boolean).join(" / ")}` : "Your name, group, and timetable remain only in this browser.";
  const onboarding = $("onboarding-note");
  if (onboarding) onboarding.hidden = configured;
  const profileStep = $("onboarding-step-profile");
  const timetableStep = $("onboarding-step-timetable");
  const nextStep = $("onboarding-step-next");
  const groupSelected = Boolean(state.selectedGroup);
  if (profileStep) profileStep.classList.toggle("complete", configured);
  if (timetableStep) timetableStep.classList.toggle("complete", groupSelected);
  if (nextStep) nextStep.classList.toggle("complete", configured && groupSelected);
  const timetableStepText = $("onboarding-step-timetable-text");
  if (timetableStepText) timetableStepText.textContent = groupSelected ? `Selected: ${[state.selectedGroup, state.selectedSubgroup].filter(Boolean).join(" / ")}.` : "Choose the section and subgroup that should be used on this device.";
}

function currentAndNext(dayOffset = 0) {
  const now = getIndiaNow();
  const calendarDays = ["Sunday", ...DAY_NAMES, "Saturday"];
  const todayIndex = Math.max(0, calendarDays.indexOf(now.day));
  const dayIndex = (todayIndex + Math.max(0, dayOffset)) % calendarDays.length;
  let day = calendarDays[dayIndex];
  let classes = classFor(state.selectedGroup, day);
  const current = day === now.day && dayOffset === 0 ? classes.find((item) => item.start <= now.minutes && item.end > now.minutes) : null;
  let future = day === now.day && dayOffset === 0 ? classes.filter((item) => item.start > now.minutes) : classes;
  // Roll forward to the next day that has classes when the chosen day has none,
  // or when today's classes are already finished — asking "next class?" at night
  // should point at tomorrow morning, not silently fall through to the AI.
  if (dayOffset >= 0 && !current && !future.length) {
    for (let shift = 1; shift <= 7; shift += 1) {
      const nextDay = calendarDays[(dayIndex + shift) % calendarDays.length];
      const nextClasses = classFor(state.selectedGroup, nextDay);
      if (nextClasses.length) { day = nextDay; classes = nextClasses; future = classes; break; }
    }
  }
  // Keep a small, chronological queue so “2nd next class” remains correct
  // even when the queue crosses into the next study day.
  const upcoming = [...future];
  const resolvedDayIndex = calendarDays.indexOf(day);
  for (let shift = 1; shift <= 7 && upcoming.length < 5; shift += 1) {
    const nextDay = calendarDays[(resolvedDayIndex + shift) % calendarDays.length];
    upcoming.push(...classFor(state.selectedGroup, nextDay));
  }
  return { now, day, current, next: upcoming[0], afterNext: upcoming[1], upcoming: upcoming.slice(0, 5), classes };
}

function profileResponse(label, details) {
  const profile = activeStudentProfile();
  const source = profile.rosterVersion ? "Verified GNDEC roster" : "Profile details saved on this device";
  return `<p><strong><u>${escapeHtml(label)}</u></strong></p><p>${details}</p><p class="answer-source">${escapeHtml(source)}.</p>`;
}

function answerProfileQuestion(input) {
  const q = canonicalTimetableQuestion(input);
  const profile = activeStudentProfile();
  const asksBranch = /(?:my|which|what)\s+branch|branch\s+(?:am|do)|mer[ai]\s+branch|मेरी\s+ब्रांच|ਮੇਰੀ\s+ਬ੍ਰਾਂਚ/.test(q);
  const asksMentor = /mentor|मेंटर|ਮੈਂਟਰ/.test(q);
  const asksMentorPhone = /mentor(?:'s)?\s*(?:phone|mobile|contact)(?:\s*(?:number|no\.?))?|(?:phone|mobile|contact)(?:\s*(?:number|no\.?))?\s*(?:of|for)?\s*(?:my\s+)?mentor/.test(q);
  const asksCrn = /\bcrn\b|college\s*roll\s*(?:no|number)?/.test(q);
  const asksRegistration = /\b(?:registration|reg(?:istration)?\s*(?:no|number)?)\b|रजिस्ट्रेशन|ऋजिस्ट्रेस्नी/.test(q);
  const asksOldSerial = /(?:old|previous|former|purana|pichla)\s+serial|serial\s+(?:history|old|previous)/.test(q);
  const asksNewSerial = /(?:new|latest)\s+serial|serial\s+(?:new|latest)/.test(q);
  const asksSerial = /serial\s*(?:no|number)?|\bsr\.?\s*(?:no|number)\b|क्रमांक|ਸੀਰੀਅਲ/.test(q) && !asksOldSerial && !asksNewSerial;
  const asksSubsection = /sub.?section|subgroup|उप.?सेक्शन|ਸਬ.?ਸੈਕਸ਼ਨ/.test(q);
  const asksSection = /section|सेक्शन|ਸੈਕਸ਼ਨ/.test(q.replace(/sub.?section|subgroup|उप.?सेक्शन|ਸਬ.?ਸੈਕਸ਼ਨ/g, " "));
  const asksAcademicGroup = /academic group|physics group|study scheme|स्टडी स्कीम|ਫਿਜਿਕਸ ਗਰੁੱਪ/.test(q);
  const asksVenue = /\bmy\s+(?:profile\s+)?venue\b|mentor(?:ing)?\s+(?:room|venue)|profile\s+(?:room|venue)/.test(q);
  const asksName = /what(?:'s| is) my name|(?:show|tell) my name|student name/.test(q);
  const asksFullProfile = /my profile|full profile|profile details|who am i|mera profile|मेरा प्रोफाइल|ਮੇਰੀ ਪ੍ਰੋਫਾਈਲ/.test(q) && !/private|privacy|safe/.test(q);
  const hasProfileIntent = asksBranch || asksMentor || asksMentorPhone || asksCrn || asksRegistration || asksSerial || asksOldSerial || asksNewSerial || asksSubsection || asksSection || asksAcademicGroup || asksVenue || asksName || asksFullProfile;
  if (!hasProfileIntent) return "";
  if (!hasStudentProfile()) return "<p><strong><u>Set up this device first.</u></strong></p><p>Open Profile and find your official group, or choose your section and subsection manually.</p>";

  const fields = [];
  const addField = (label, value, missing = "Not listed") => fields.push({ label, value: value || missing });
  if (asksFullProfile || asksName) addField("Student name", profile.name);
  if (asksFullProfile || asksBranch) addField("Branch", profile.branch);
  if (asksFullProfile || asksCrn) addField("CRN", profile.crn);
  if (asksFullProfile || asksSerial) addField("Current serial", profile.currentSerialNo || profile.serialNo);
  // The live Permanent Sections roster labels this field S.No. Treat that
  // verified current value as the latest/new serial unless a future source
  // explicitly publishes a separate new-serial column.
  if (asksNewSerial) addField("Current/new serial", profile.newSerialNo || profile.currentSerialNo || profile.serialNo);
  if (asksFullProfile || asksOldSerial) addField("Previous serials", (profile.oldSerialNos || []).join(", "), "No previous serial in saved history");
  if (asksFullProfile || asksRegistration) addField("Registration No.", profile.registrationNo, profile.rosterVersion ? "Not published in current roster" : "Not provided");
  if (asksFullProfile || asksSection) addField("Section", profile.section);
  if (asksFullProfile || asksSubsection) addField("Subsection", profile.subsection || profile.subgroup);
  if (asksFullProfile || asksAcademicGroup) addField("Academic group", profile.academicGroup);
  if (asksFullProfile || asksMentor) addField("Mentor", profile.mentor);
  if (asksFullProfile || asksMentorPhone) addField("Mentor phone", profile.mentorPhone);
  if (asksFullProfile || asksVenue) addField("Mentor venue", profile.mentorVenue || profile.venue);

  const singleLabels = { "Student name": "Student name", Branch: "Branch", Section: "Section", Subsection: "Subsection", "Current serial": "Current serial", "Current/new serial": "Current/new serial", "Previous serials": "Previous serials", CRN: "CRN", "Registration No.": "Registration No.", Mentor: "Mentor", "Mentor phone": "Mentor phone", "Academic group": "Academic group", "Mentor venue": "Mentor venue" };
  const title = asksFullProfile ? "Student profile" : fields.length === 1 ? singleLabels[fields[0].label] : "Student details";
  const details = fields.map((field) => `<strong>${escapeHtml(field.label)}</strong><br />${escapeHtml(field.value)}`).join("<br /><br />");
  return profileResponse(title, details);
}

function findReferencedClasses(q) {
  const matchesProfile = (item) => item.group === state.selectedGroup && (!state.selectedSubgroup || !item.cohorts || cohortTokens(item.cohorts).includes(state.selectedGroup) || cohortTokens(item.cohorts).includes(state.selectedSubgroup));
  const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const genericWords = new Set(["class", "classes", "lecture", "lectures", "period", "periods", "timetable", "schedule", "today", "tomorrow", "next", "current", "now", "where", "room", "teacher", "faculty", "my", "what", "which", "when", "all", "subject", "subjects", "course", "courses", "list", "show", "tell", "them", "name", "names", "and", "or", "if", "yes", "there", "any", "location", "place", "details", "have", "has"]);
  const words = normalizeStudentName(q).split(" ").filter((word) => !genericWords.has(word));
  const fuzzyWordMatch = (value, minimum = 4) => normalizeStudentName(value).split(" ").filter((word) => word.length >= minimum).some((part) => words.some((word) => word.length >= minimum && (word === part || word.startsWith(part) || part.startsWith(word) || editDistance(word, part) <= (part.length >= 8 ? 2 : 1))));
  const subjectMatches = [...state.index.bySubject.entries()].filter(([subject]) => q.includes(subject) || subject.split(/\s+/).filter((word) => word.length >= 3 && !genericWords.has(normalizeStudentName(word))).some((word) => new RegExp(`\\b${escaped(word)}\\b`, "i").test(q)) || fuzzyWordMatch(subject, 3)).flatMap(([, entries]) => entries);
  const teacherMatches = [...state.index.byTeacher.entries()].filter(([teacher]) => q.includes(teacher) || fuzzyWordMatch(teacher, 4)).flatMap(([, entries]) => entries);
  const unique = new Map([...subjectMatches, ...teacherMatches].filter(matchesProfile).map((item) => [item.id, item]));
  return [...unique.values()].sort((a, b) => DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day) || a.start - b.start || a.subject.localeCompare(b.subject));
}

function findReferencedClass(q) {
  return findReferencedClasses(q)[0] || null;
}

function scheduleAnswer(entries, heading) {
  if (!entries.length) return `<p><strong><u>No matching classes are listed.</u></strong></p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
  return `<p><strong><u>${escapeHtml(heading)}</u></strong></p>${entries.map((item) => `<p><strong>${escapeHtml(item.day)} ${humanTime(item.start)}:</strong> ${escapeHtml(item.subject)}<br /><span>${escapeHtml(item.room)} · ${escapeHtml(item.teacher)}</span></p>`).join("")}<p class="answer-source">Official GNDEC weekly timetable.</p>`;
}

function isTeacherSubjectRelationshipQuestion(question) {
  const q = canonicalTimetableQuestion(question);
  const hasTeacher = /\b(?:teachers?|techers?|faculty)\b|शिक्षक|टीचर|अध्यापक|ਅਧਿਆਪਕ|ਟੀਚਰ/u.test(q);
  const hasSubject = /\b(?:subjects?|subjets?|courses?)\b|विषय|ਵਿਸ਼ੇ/u.test(q);
  return hasTeacher && hasSubject && /\b(?:list|show|tell|name|all|my|with|and|their|there|for|of|mapping|wise|which|aur|unke)\b|और|उनके|ਅਤੇ|ਉਹਨਾਂ/u.test(q);
}

function teacherSubjectRelationshipAnswer(question) {
  if (!isTeacherSubjectRelationshipQuestion(question) || !state.selectedGroup) return "";
  const q = canonicalTimetableQuestion(question);
  const classes = DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day));
  if (!classes.length) return "";
  const teachers = [...new Set(classes.flatMap((item) => teacherNames(item.teacher)))].sort((left, right) => left.localeCompare(right));
  const rows = teachers.map((teacher) => {
    const teaching = classes.filter((item) => teacherNames(item.teacher).includes(teacher));
    const subjects = [...new Set(teaching.map((item) => item.subject))].sort((left, right) => left.localeCompare(right));
    const assignments = subjects.map((subject) => {
      const entries = teaching.filter((item) => item.subject === subject);
      const typeCounts = new Map();
      entries.forEach((item) => { const label = classTypeLabel(item.type); typeCounts.set(label, (typeCounts.get(label) || 0) + 1); });
      const types = [...typeCounts.entries()].map(([label, value]) => `${value} ${label}${value === 1 ? "" : "s"}`).join(" · ");
      const rooms = [...new Set(entries.map((item) => item.room).filter((room) => room && !/not listed/i.test(room)))].sort((left, right) => left.localeCompare(right));
      return `${escapeHtml(subject)} — ${escapeHtml(types)}${rooms.length ? ` · ${escapeHtml(rooms.join(", "))}` : ""}`;
    });
    return `<li><strong>${escapeHtml(teacher)}:</strong> ${assignments.join("<br />")}</li>`;
  }).join("");
  const count = /\b(?:how many|count|total|kitne|kinne|kitni|kinni)\b/.test(q)
    ? `<p>You have <strong>${teachers.length}</strong> teachers listed in <strong>${escapeHtml(activeTimetableLabel())}</strong>.</p>`
    : "";
  return `${count}<p><strong><u>Teachers and their subjects in ${escapeHtml(activeTimetableLabel())}</u></strong></p><ul>${rows}</ul><p class="answer-source">Official GNDEC weekly timetable.</p>`;
}

function isActiveTimetableSubjectQuestion(question) {
  const q = canonicalTimetableQuestion(question);
  if (!/\b(?:subjects?|subjets?|courses?)\b/.test(q) || /\b(?:syllabus|official|first year|1st year|study scheme)\b/.test(q)) return false;
  return /\b(?:my|i have|do i|current semester|this semester|my timetable|my schedule|my branch|my section)\b/.test(q);
}

function activeCatalogueCountAnswer(question) {
  const q = canonicalTimetableQuestion(question);
  if (!/\b(?:how many|count|total|kitne|kinne)\b/.test(q) || !state.selectedGroup) return "";
  const classes = DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day));
  if (!classes.length) return "";
  const label = activeTimetableLabel();
  if (/\b(?:teachers?|techers?|faculty)\b/.test(q)) {
    const values = [...new Set(classes.flatMap((item) => teacherNames(item.teacher)))];
    return `<p>You have <strong>${values.length}</strong> teachers listed in <strong>${escapeHtml(label)}</strong>.</p><p class="answer-source">Calculated from your active official timetable.</p>`;
  }
  if (/\b(?:rooms?|locations?|places?)\b/.test(q)) {
    const values = [...new Set(classes.map((item) => item.room).filter((value) => value && !/not listed/i.test(value)))];
    return `<p>You use <strong>${values.length}</strong> rooms or locations in <strong>${escapeHtml(label)}</strong>.</p><p class="answer-source">Calculated from your active official timetable.</p>`;
  }
  if (isActiveTimetableSubjectQuestion(q)) {
    const values = [...new Set(classes.map((item) => item.subject).filter(Boolean))];
    return `<p>You have <strong>${values.length}</strong> subjects listed in <strong>${escapeHtml(label)}</strong>.</p><p class="answer-source">Calculated from your active official timetable.</p>`;
  }
  return "";
}

function referencedTeacherName(question) {
  const q = normalizeStudentName(canonicalTimetableQuestion(question));
  const activeClasses = DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day));
  const selectedGroupClasses = state.schedule.filter((item) => item.group === state.selectedGroup);
  const teachers = [...new Set([...activeClasses, ...selectedGroupClasses].flatMap((item) => teacherNames(item.teacher)))];
  const exact = teachers.find((teacher) => {
    const full = normalizeStudentName(teacher);
    const withoutTitle = normalizeStudentName(String(teacher).replace(/\([^)]*\)/g, " ")).replace(/^(?:dr|er|prof|professor)\s+/, "").trim();
    return q.includes(full) || (withoutTitle.length >= 5 && q.includes(withoutTitle));
  });
  if (exact) return exact;
  const words = q.split(" ").filter((word) => word.length >= 5);
  const candidates = teachers.filter((teacher) => normalizeStudentName(teacher).split(" ").some((part) => part.length >= 5 && words.some((word) => word === part || editDistance(word, part) <= (part.length >= 7 ? 2 : 1))));
  return candidates.length === 1 ? candidates[0] : "";
}

function teacherReferenceAnswer(question) {
  if (!state.selectedGroup) return "";
  const teacher = referencedTeacherName(question);
  if (!teacher) return "";
  const q = canonicalTimetableQuestion(question);
  const teacherParts = normalizeStudentName(String(teacher).replace(/\([^)]*\)/g, " ")).replace(/^(?:dr|er|prof|professor)\s+/, "").split(" ").filter((word) => word.length >= 3);
  const exactTeacherParts = teacherParts.filter((part) => new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(q)).length;
  if (exactTeacherParts < 2 && !/\b(?:teacher|faculty|sir|mam|maam|madam|teach|teaches|teaching)\b/.test(q)) return "";
  const day = requestedWeekday(q);
  const all = DAY_NAMES.flatMap((dayName) => classFor(state.selectedGroup, dayName)).filter((item) => teacherNames(item.teacher).includes(teacher));
  const entries = day ? all.filter((item) => item.day === day) : all;
  const asksDetails = /\b(?:full|complete|all|every)\b.*\b(?:details?|profile|information|info)\b|\b(?:details?|profile|information|info)\b.*\b(?:of|about)\b/.test(q);
  const requestedFacts = [
    /\b(?:subjects?|courses?)\b/.test(q),
    /\b(?:rooms?|locations?|places?|where)\b/.test(q),
    /\b(?:when|class(?:es)?|schedule|timetable|timings?|days?)\b/.test(q),
    /\b(?:phone|mobile|contact)\b/.test(q)
  ].filter(Boolean).length;
  if (asksDetails || requestedFacts >= 2) {
    const subjects = [...new Set(all.map((item) => item.subject))].sort((left, right) => left.localeCompare(right));
    const types = [...new Set(all.map((item) => classTypeLabel(item.type)))].sort((left, right) => left.localeCompare(right));
    const rooms = [...new Set(all.map((item) => item.room).filter((room) => room && !/not listed/i.test(room)))].sort((left, right) => left.localeCompare(right));
    const profile = activeStudentProfile();
    const isMentor = normalizeStudentName(profile.mentor) === normalizeStudentName(teacher);
    const contact = isMentor && profile.mentorPhone
      ? `<p><strong>Verified mentor phone:</strong> ${escapeHtml(profile.mentorPhone)}</p>`
      : `<p><strong>Phone/contact:</strong> Not published in the active timetable.</p>`;
    return `<p><strong><u>${escapeHtml(teacher)} · verified timetable details</u></strong></p><p><strong>Subjects:</strong> ${escapeHtml(subjects.join(", ") || "Not listed")}<br /><strong>Class types:</strong> ${escapeHtml(types.join(", ") || "Not listed")}<br /><strong>Rooms:</strong> ${escapeHtml(rooms.join(", ") || "Not listed")}</p>${all.length ? `<p><strong>Weekly schedule</strong></p>${scheduleAnswer(all, teacher)}` : ""}${contact}<p class="answer-source">Official GNDEC weekly timetable${isMentor && profile.mentorPhone ? " and verified active roster" : ""}.</p>`;
  }
  if (/\b(?:which|what|list|show)\b.*\b(?:subjects?|courses?)\b|\b(?:subjects?|courses?)\b.*\b(?:teach|teaches|taught|by)\b/.test(q)) {
    const subjects = [...new Set(all.map((item) => item.subject))].sort((left, right) => left.localeCompare(right));
    return `<p><strong>${escapeHtml(teacher)}</strong> teaches <strong>${escapeHtml(subjects.join(", "))}</strong> in ${escapeHtml(activeTimetableLabel())}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
  }
  if (/\b(?:when|where|rooms?|locations?|class(?:es)?|schedule|timetable|teach|teaches|teaching)\b/.test(q) || day) {
    if (!entries.length) return `<p><strong>${escapeHtml(teacher)}</strong> has no class listed${day ? ` on ${escapeHtml(day)}` : " in your timetable"}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
    return scheduleAnswer(entries, `${teacher}${day ? ` · ${day}` : ""}`);
  }
  return "";
}

function roomReferenceAnswer(question) {
  if (!state.selectedGroup) return "";
  const q = canonicalTimetableQuestion(question);
  if (!/\b(?:where|room|venue|location|place|reach|directions?|navigate|way)\b/.test(q)) return "";
  const classes = DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day));
  const profile = activeStudentProfile();
  const mentorVenue = String(profile.mentorVenue || profile.venue || "").trim();
  const rooms = [...new Set([...classes.map((item) => item.room), mentorVenue].filter((room) => room && !/not listed/i.test(room)))].sort((left, right) => right.length - left.length);
  const compactQuestion = q.replace(/\s+/g, "");
  const room = rooms.find((value) => q.includes(value.toLowerCase()) || compactQuestion.includes(value.toLowerCase().replace(/\s+/g, "")));
  if (!room) return "";
  const entries = classes.filter((item) => item.room === room);
  const mentorNote = mentorVenue && room.toLowerCase() === mentorVenue.toLowerCase()
    ? `<p><strong>${escapeHtml(room)}</strong> is your mentor's verified venue.</p>`
    : `<p><strong>${escapeHtml(room)}</strong> is an official timetable room/location label.</p>`;
  const uses = entries.length ? `<p>It is used by these classes in ${escapeHtml(activeTimetableLabel())}:</p><ol>${entries.slice(0, 8).map((item) => `<li><strong>${escapeHtml(item.day)} ${humanTime(item.start)}</strong> · ${escapeHtml(item.subject)} · ${escapeHtml(item.teacher)}</li>`).join("")}</ol>` : "";
  const directions = /\b(?:reach|directions?|navigate|way|how\s+(?:do|can)\s+i\s+(?:get|go))\b/.test(q)
    ? "<p>Exact walking directions are not published in the timetable or roster, so Compass will not guess them. Use the campus map or ask the department/help desk.</p>"
    : "";
  return `${mentorNote}${uses}${directions}<p class="answer-source">Verified from the active GNDEC timetable/profile; no unverified campus directions added.</p>`;
}

// Room-schedule view: "G6 timetable", "which classes are in COMP LAB EC?".
// Reads only rooms that appear in the active verified timetable.
function roomScheduleAnswer(question) {
  if (!state.selectedGroup) return "";
  const q = canonicalTimetableQuestion(question);
  if (!/\b(?:time\s*table|timetable|schedule|class(?:es)?|lectures?)\b/i.test(q)) return "";
  const classes = DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day));
  const rooms = [...new Set(classes.map((item) => item.room).filter((room) => room && !/not listed/i.test(room)))].sort((left, right) => right.length - left.length);
  const compactQuestion = q.replace(/\s+/g, "");
  const room = rooms.find((value) => new RegExp(`(?:^|[^a-z0-9])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLowerCase()}(?:$|[^a-z0-9])`, "i").test(q)
    || compactQuestion.includes(value.toLowerCase().replace(/\s+/g, "")));
  if (!room) return "";
  const day = requestedWeekday(q);
  const entries = (day ? classes.filter((item) => item.day === day) : classes).filter((item) => item.room === room);
  return scheduleAnswer(entries, `${room}${day ? ` · ${day}` : " · whole week"}`);
}

function subjectAvailabilityAnswer(subjects, day, allMatches) {
  const rows = subjects.map((subject) => {
    const matches = allMatches.filter((item) => item.subject === subject && item.day === day);
    if (!matches.length) return `<p><strong>No — ${escapeHtml(subject)}</strong> is not listed on ${escapeHtml(day)}.</p>`;
    return matches.map((item) => `<p><strong>Yes — ${escapeHtml(subject)}</strong><br />${humanTime(item.start)} - ${humanTime(item.end)} · ${escapeHtml(item.room)} · ${escapeHtml(item.teacher)}</p>`).join("");
  }).join("");
  return `<p><strong><u>${escapeHtml(activeTimetableLabel())} · ${escapeHtml(day)}</u></strong></p>${rows}<p class="answer-source">Official GNDEC weekly timetable.</p>`;
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const saved = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return previous[right.length];
}

// Convert common Hindi and Punjabi timetable words to the same small
// vocabulary used by the local engine. Subject, teacher, and room names stay
// untouched, so mixed-language questions still match official data exactly.
function canonicalTimetableQuestion(question = "") {
  const replacements = [
    // Day-after-tomorrow aliases must be rewritten BEFORE the plain
    // tomorrow/today words, otherwise "ਕਲ੍ਹ ਪਿੱਛੋਂ" collapses to "tomorrow".
    [/day\s+after\s+tomorrow|day-after-tomorrow|\bparso\b|\bparson\b|\u092a\u0930\u0938\u094b\u0902|\u0a15(?:\u0a71)?\u0a32\u0a4d\u0a39\s*\u0a2a\u0a3f\u0a71\u0a1b\u0a4b\u0a02/gu, " day after tomorrow "],
    [/\u0906\u091c|\u0a05\u0a71\u0a1c/gu, " today "], [/\u0915\u0932|\u0a15\u0a71\u0a32|\u0a15\u0a32\u0a4d\u0a39/gu, " tomorrow "],
    [/\u0905\u0917\u0932\u093e|\u0905\u0917\u0932\u0940|\u0a05\u0a17\u0a32\u0a3e|\u0a05\u0a17\u0a32\u0a40/gu, " next "], [/\u0905\u092d\u0940|\u0a39\u0a41\u0a23/gu, " current "],
    [/\u091f\u093e\u0907\u092e\u091f\u0947\u092c\u0932|\u0938\u092e\u092f\s*\u0938\u093e\u0930\u0923\u0940|\u0a1f\u0a3e\u0a08\u0a2e\u0a1f\u0a47\u0a2c\u0a32|\u0a38\u0a2e\u0a3e\u0a02\s*\u0a38\u0a3e\u0a30\u0a23\u0a40/gu, " timetable "],
    [/\u0915\u094d\u0932\u093e\u0938|\u0932\u0947\u0915\u094d\u091a\u0930|\u0a15\u0a32\u0a3e\u0a38|\u0a32\u0a48\u0a15\u0a1a\u0a30/gu, " class "], [/\u0930\u0942\u092e|\u0915\u092e\u0930\u093e|\u0a30\u0a42\u0a2e|\u0a15\u0a2e\u0a30\u0a3e/gu, " room "],
    [/\u0915\u0939\u093e\u0901|\u0915\u0939\u093e|\u0915\u093f\u0927\u0930|\u0a15\u0a3f\u0a71\u0a25\u0a47|\u0a15\u0a3f\u0a25\u0a47/gu, " where "], [/\u0936\u093f\u0915\u094d\u0937\u0915|\u091f\u0940\u091a\u0930|\u0905\u0927\u094d\u092f\u093e\u092a\u0915|\u0a05\u0a27\u0a3f\u0a06\u0a2a\u0a15|\u0a1f\u0a40\u0a1a\u0a30/gu, " teacher "],
    [/\u0916\u093e\u0932\u0940|\u0a16\u0a3e\u0a32\u0940/gu, " free "],
    [/\u092a\u093e\u0920\u094d\u092f\u0915\u094d\u0930\u092e|\u0a38\u0a3f\u0a32\u0a47\u0a2c\u0a38/gu, " syllabus "], [/\u0917\u0923\u093f\u0924|\u0a17\u0a23\u0a3f\u0a24/gu, " maths "],
    [/\u092d\u094c\u0924\u093f\u0915|\u092b\u093f\u091c\u093f\u0915\u094d\u0938|\u0a2d\u0a4c\u0a24\u0a3f\u0a15|\u0a2b\u0a3f\u0a1c\u0a3c\u0a3f\u0a15\u0a38/gu, " physics "],
    [/\u0928\u093e\u092e|\u0a28\u0a3e\u0a2e/gu, " name "], [/\u0914\u0930|\u0a05\u0a24\u0a47/gu, " and "],
    [/\u092a\u0922\u093c\u093e\u0924\u093e|\u092a\u0922\u093c\u093e\u0924\u0940|\u092a\u0922\u093c\u093e\u0924\u0947|\u0a2a\u0a5c\u0a4d\u0a39\u0a3e\u0a09\u0a02\u0a26\u0a3e|\u0a2a\u0a5c\u0a4d\u0a39\u0a3e\u0a09\u0a02\u0a26\u0a40/gu, " teaches "],
    [/\u092a\u094d\u0930\u094b\u092b\u093c\u093e\u0907\u0932|\u092a\u094d\u0930\u094b\u092b\u093e\u0907\u0932|\u0a2a\u0a4d\u0a30\u0a4b\u0a2b\u0a3c\u0a3e\u0a08\u0a32/gu, " profile "],
    [/\u092e\u0947\u0902\u091f\u0930\u093f\u0902\u0917|\u0a2e\u0a48\u0a02\u0a1f\u0a30\u0a3f\u0a70\u0a17/gu, " mentoring "],
    [/\u0907\u0915\u093e\u0908|\u0a2f\u0a42\u0a28\u0a3f\u0a1f/gu, " unit "],
    [/(?:कितने|कितनी|ਕਿੰਨੇ|ਕਿੰਨੀਆਂ)/gu, " how many "], [/(?:पहला|पहली|ਪਹਿਲਾ|ਪਹਿਲੀ)/gu, " first "],
    [/(?:आखिरी|अंतिम|ਆਖਰੀ)/gu, " last "], [/(?:कब|ਕਦੋਂ)/gu, " when "], [/(?:विषय|ਵਿਸ਼ੇ)/gu, " subject "],
    [/(?:शनिवार|ਸ਼ਨੀਵਾਰ)/gu, " saturday "], [/(?:रविवार|ਐਤਵਾਰ)/gu, " sunday "], [/(?:बताओ|दिखाओ|ਦੱਸੋ|ਦਿਖਾਓ)/gu, " show "],
    [/(?:विद्यार्थी|छात्र|स्टूडेंट|ਵਿਦਿਆਰਥੀ|ਸਟੂਡੈਂਟ)/gu, " student "], [/(?:विवरण|जानकारी|ਜਾਣਕਾਰੀ|ਵੇਰਵਾ)/gu, " details "],
    [/(?:उप[- ]?अनुभाग|सबसेक्शन|ਸਬਸੈਕਸ਼ਨ)/gu, " subsection "], [/(?:अनुभाग|सेक्शन|ਸੈਕਸ਼ਨ)/gu, " section "],
    [/(?:शाखा|ब्रांच|ਬ੍ਰਾਂਚ)/gu, " branch "], [/(?:पंजीकरण|रजिस्ट्रेशन|ਰਜਿਸਟ੍ਰੇਸ਼ਨ)/gu, " registration "],
    [/(?:क्रमांक|सीरियल|ਸੀਰੀਅਲ)/gu, " serial "], [/(?:पुराना|पिछला|ਪੁਰਾਣਾ|ਪਿਛਲਾ)/gu, " previous "],
    [/(?:मेंटर|मार्गदर्शक|ਮੈਂਟਰ)/gu, " mentor "], [/(?:फ़ोन|फोन|मोबाइल|ਫ਼ੋਨ|ਫੋਨ|ਮੋਬਾਈਲ)/gu, " phone "],
    [/(?:सभी|सारी|पूरी|ਸਾਰੇ|ਸਾਰੀ|ਪੂਰੀ)/gu, " all "], [/(?:कौन|ਕੌਣ)/gu, " who "],
    [/(?:मेरा|मेरी|मेरे|ਮੇਰਾ|ਮੇਰੀ|ਮੇਰੇ)/gu, " my "],
    [/(?:का|की|के)/gu, " ka "], [/(?:ਦਾ|ਦੀ|ਦੇ)/gu, " da "],
    [/(?:तारीख|ਤਾਰੀਖ)/gu, " date "], [/(?:दिन|ਦਿਨ)/gu, " day "],
    [/(?:फैकल्टी|ਸਟਾਫ|ਫੈਕਲਟੀ)/gu, " faculty "], [/(?:योग्यता|शिक्षा|ਯੋਗਤਾ|ਸਿੱਖਿਆ)/gu, " qualification "],
    [/(?:अनुभव|तजुर्बा|ਤਜਰਬਾ|ਅਨੁਭਵ)/gu, " experience "], [/(?:ई[- ]?मेल|ਈਮੇਲ)/gu, " email "],
    [/(?:अनुसंधान|शोध|रिसर्च|ਖੋਜ|ਰਿਸਰਚ)/gu, " research "], [/(?:प्रकाशन|ਪ੍ਰਕਾਸ਼ਨ)/gu, " publication "],
    [/(?:पदनाम|पद|ਅਹੁਦਾ)/gu, " designation "],
    [/\u0938\u094b\u092e\u0935\u093e\u0930|\u0a38\u0a4b\u0a2e\u0a35\u0a3e\u0a30/gu, " monday "], [/\u092e\u0902\u0917\u0932\u0935\u093e\u0930|\u0a2e\u0a70\u0a17\u0a32\u0a35\u0a3e\u0a30/gu, " tuesday "],
    [/\u092c\u0941\u0927\u0935\u093e\u0930|\u0a2c\u0a41\u0a71\u0a27\u0a35\u0a3e\u0a30/gu, " wednesday "], [/\u0917\u0941\u0930\u0941\u0935\u093e\u0930|\u0935\u0940\u0930\u0935\u093e\u0930|\u0a35\u0a40\u0a30\u0a35\u0a3e\u0a30/gu, " thursday "],
    [/\u0936\u0941\u0915\u094d\u0930\u0935\u093e\u0930|\u0a38\u0a3c\u0a41\u0a71\u0a15\u0a30\u0a35\u0a3e\u0a30/gu, " friday "]
  ];
  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), String(question).normalize("NFKC").toLowerCase())
    .replace(/\b(?:timetabel|timetble|timetabl|time tabel)\b/g, "timetable")
    .replace(/\b(?:loacation|locaton|locatoin|palce|plcae)\b/g, "location")
    .replace(/\b(?:techer|techers|taecher|faculity)\b/g, "teacher")
    .replace(/\b(?:naam|nam)\b/g, "name")
    .replace(/\b(?:pehla|pehli|pahila|pahili)\b/g, "first")
    .replace(/\b(?:akhri|aakhri|aakhiri|antim)\b/g, "last")
    .replace(/\b(?:padhata|padhati|padhate|padhaata|padhaati|padhaunda|padhaundi|padhonda|padhondi)\b/g, "teaches")
    .replace(/\b(?:aur|atte)\b/g, "and")
    .replace(/\b(?:syllbus|sylabus|syllubus)\b/g, "syllabus")
    .replace(/\b(?:subjet|subjets|subect)\b/g, "subject")
    .replace(/\s+/g, " ").trim();
}

function isFactualTimetableQuestion(question) {
  const q = canonicalTimetableQuestion(question);
  if (requestedWeekday(q) || requestedTime(q) !== null) return true;
  if (/free\s*(lecture|lectures|period|periods|class|classes|slots?|time)|empty\s*(period|lecture|slot)|breaks?\s*(today|tomorrow|on|for)?|\bgaps?\b(?:\s*(?:between|in)\s*classes)?/.test(q)) return true;
  if (/free\s+time|time\s*pass|ideas?|suggest|advice|tips?|explain|how\s+to/.test(q) && !/timetable|time\s*table|schedule|class|lecture|period|room|teacher|subject|today|tomorrow|next|current/.test(q)) return false;
  return /timetable|time\s*table|schedule|class(?:es)?|lectures?|periods?|next|current|now|today|tomorrow|room|venue|location|place|teacher|faculty|where|kahan|kahaan|kithe|subject|mentor|section|registration/.test(q);
}

function freePeriodAnswer(day) {
  const classes = classFor(state.selectedGroup, day);
  const free = officialFreeLectureSlots(classes);
  const profile = activeTimetableLabel();
  if (!free.length) return `<p><strong><u>${escapeHtml(profile)} · ${escapeHtml(day)}</u></strong></p><p>No free lectures are listed in the official timetable.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
  const minutes = free.reduce((sum, slot) => sum + Math.max(0, slot.end - slot.start), 0);
  const duration = `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} hr ` : ""}${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();
  return `<p><strong><u>${escapeHtml(profile)} · ${escapeHtml(day)} free lectures</u></strong></p><p>Total free timetable slots: <strong>${free.length}</strong>.</p>${free.map((slot) => `<p><strong>${humanTime(slot.start)} - ${humanTime(slot.end)}</strong></p>`).join("")}<p>Total open timetable time: <strong>${escapeHtml(duration || "0 min")}</strong>.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
}

// Small timetable slices are shared by the active, named-student, and named
// subsection paths. They deliberately use only published slots; "free" never
// claims a room is available, only that no class is listed for that group.
function requestedTimetableWindow(question = "") {
  const q = canonicalTimetableQuestion(question);
  const asksFirst = /\b(?:first|earliest)\b.*\b(?:class|lecture|period)\b|\b(?:class|lecture|period)\b.*\b(?:first|earliest)\b/.test(q);
  const asksLast = /\b(?:last|final|latest)\b.*\b(?:class|lecture|period)\b|\bwhen\b.*\b(?:finish|end|leave)\b|\bwhat time\b.*\b(?:finish|end|leave)\b/.test(q);
  const asksFree = /\bfree\s*(?:lecture|lectures|period|periods|class|classes|slot|slots)|\b(?:empty|khali)\s*(?:lecture|period|class|slot)/.test(q);
  const asksMorning = /\b(?:morning|subah|saver)\b.*\b(?:class|classes|lecture|lectures|period|periods)\b|\b(?:class|classes|lecture|lectures|period|periods)\b.*\b(?:morning|subah|saver)\b/.test(q);
  if (asksFree) return "free";
  if (asksFirst) return "first";
  if (asksLast) return "last";
  if (asksMorning) return "morning";
  return "";
}

function timetableWindowAnswer(entries, heading, window) {
  const ordered = [...(Array.isArray(entries) ? entries : [])].sort((left, right) => left.start - right.start || left.subject.localeCompare(right.subject));
  if (!ordered.length) return `<p><strong><u>No classes are listed for ${escapeHtml(heading)}.</u></strong></p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
  if (window === "free") {
    const free = officialFreeLectureSlots(ordered);
    if (!free.length) return `<p><strong><u>${escapeHtml(heading)} · free lectures</u></strong></p><p>No free timetable slots are listed.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
    return `<p><strong><u>${escapeHtml(heading)} · free lectures</u></strong></p>${free.map((slot) => `<p><strong>${humanTime(slot.start)} - ${humanTime(slot.end)}</strong> · No class listed</p>`).join("")}<p class="answer-source">Official GNDEC weekly timetable. This does not confirm room availability.</p>`;
  }
  if (window === "morning") {
    const morning = ordered.filter((item) => item.end <= 720);
    return morning.length
      ? scheduleAnswer(morning, `${heading} · morning classes`)
      : `<p><strong><u>${escapeHtml(heading)} · morning classes</u></strong></p><p>No class ending by 12:00 PM is listed.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
  }
  const item = window === "last" ? ordered[ordered.length - 1] : ordered[0];
  const label = window === "last" ? "Last" : "First";
  const finish = window === "last" ? `<p>You finish at <strong>${humanTime(item.end)}</strong>.</p>` : "";
  return `<p><strong>${label} class for ${escapeHtml(heading)}: ${escapeHtml(item.subject)}</strong></p><p>${humanTime(item.start)} - ${humanTime(item.end)} · ${escapeHtml(item.room)} · ${escapeHtml(item.teacher)}</p>${finish}<p class="answer-source">Official GNDEC weekly timetable.</p>`;
}

function dayScheduleAnswer(classes, day, dateLabel = "") {
  if (!classes.length) return `<p><strong><u>No classes are listed for ${escapeHtml(dateLabel || day)}.</u></strong></p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
  const heading = `${activeTimetableLabel()} · ${dateLabel || day}`;
  const rows = dayPlanEntries(classes).map((item) => item.free
    ? `<p class="answer-free"><strong>${humanTime(item.start)} - ${humanTime(item.end)}:</strong> Free lecture<br /><span>No class listed in the official timetable.</span></p>`
    : `<p><strong>${humanTime(item.start)} - ${humanTime(item.end)}:</strong> ${escapeHtml(item.subject)}<br /><span>${escapeHtml(item.room)} · ${escapeHtml(item.teacher)}</span></p>`).join("");
  return `<p><strong><u>${escapeHtml(heading)}</u></strong></p>${rows}<p class="answer-source">Official GNDEC weekly timetable.</p>`;
}

function requestedWeekday(question) {
  const q = canonicalTimetableQuestion(question);
  const words = q.match(/[a-z]+/g) || [];
  const aliases = { Monday: ["monday", "mon", "somvar"], Tuesday: ["tuesday", "tue", "mangalvar"], Wednesday: ["wednesday", "wed", "budhvar"], Thursday: ["thursday", "thu", "thurs", "guruvar", "veerwar"], Friday: ["friday", "fri", "shukravar"], Saturday: ["saturday", "sat", "shanivar"], Sunday: ["sunday", "sun", "ravivar"] };
  const days = Object.keys(aliases);
  const aliasDay = days.find((day) => aliases[day].some((alias) => new RegExp(`\\b${alias}\\b`, "i").test(q)));
  if (aliasDay) return aliasDay;
  // Pick the CLOSEST matching weekday, not the first in array order —
  // otherwise "thusday" (distance 1 from thursday, 2 from tuesday) resolves
  // to the wrong day purely because Tuesday is declared earlier.
  let bestDay = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const word of words) {
    if (word.length < 4) continue;
    for (const day of days) {
      for (const alias of aliases[day]) {
        if (alias.length < 3) continue;
        const distance = editDistance(word, alias);
        const allowed = alias.length >= 7 ? 2 : 1;
        if (distance <= allowed && distance < bestDistance) {
          bestDay = day;
          bestDistance = distance;
        }
      }
    }
  }
  return bestDay || days.find((day) => new RegExp(`\\b${day.toLowerCase()}\\b`).test(q)) || "";
}

function requestedTimetableDate(question = "") {
  const q = canonicalTimetableQuestion(question);
  const kernel = globalThis.CompassBrainKernel;
  const months = kernel?.MONTHS || { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
  const relativeOffset = /\byesterday\b/.test(q) ? -1 : /\b(?:tomorrow|kal)\b/.test(q) ? 1 : /\b(?:today|aaj|ajj)\b/.test(q) ? 0 : null;
  if (relativeOffset !== null) {
    const date = indiaCalendarDate(relativeOffset).date;
    return { iso: date.toISOString().slice(0, 10), day: indiaCalendarDate(relativeOffset).day };
  }
  const isoMatch = q.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const monthMatch = q.match(/\b(\d{1,2})\s+([a-z]+)(?:\s+(20\d{2}))?\b/) || q.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(20\d{2}))?\b/);
  let iso = "";
  if (isoMatch) iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  else if (monthMatch) {
    const numberFirst = /^\d+$/.test(monthMatch[1]);
    const day = Number(numberFirst ? monthMatch[1] : monthMatch[2]);
    const monthName = String(numberFirst ? monthMatch[2] : monthMatch[1]).toLowerCase();
    const year = Number(monthMatch[3] || indiaCalendarDate(0).date.getUTCFullYear());
    if (months[monthName] !== undefined) iso = `${year}-${String(months[monthName] + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = iso ? new Date(`${iso}T00:00:00Z`) : null;
  const valid = Boolean(parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso && (!kernel?.isValidIsoDate || kernel.isValidIsoDate(iso)));
  if (!valid) return null;
  return { iso, day: kernel?.weekdayOfIso?.(iso) || new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(parsed) };
}

function requestedTime(question) {
  const q = canonicalTimetableQuestion(question);
  const colon = q.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  if (colon) {
    let minutes = (Number(colon[1]) % 12) * 60 + Number(colon[2]);
    if (colon[3] === "pm") minutes += 720;
    return minutes;
  }
  const meridiem = q.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (meridiem) {
    const hours = Number(meridiem[1]) % 12;
    return hours * 60 + (meridiem[2] === "pm" ? 720 : 0);
  }
  return null;
}

function requestedUpcomingClassPosition(question = "") {
  const q = canonicalTimetableQuestion(question);
  if (/\b(?:5th|fifth)\s+(?:next|upcoming)\b/.test(q)) return 5;
  if (/\b(?:4th|fourth)\s+(?:next|upcoming)\b/.test(q)) return 4;
  if (/\b(?:3rd|third)\s+(?:next|upcoming)\b/.test(q)) return 3;
  if (/\b(?:2nd|second)\s+(?:next|upcoming)\b|\bnext\s+(?:to\s+)?next\b|\bafter\s+(?:the\s+)?next\b|agli\s+se\s+agli|uske\s+baad|^then\??$|अगली\s+से\s+अगली|ਅਗਲੀ\s+ਤੋਂ\s+ਅਗਲੀ/.test(q)) return 2;
  return 1;
}

function answerQuestion(question) {
  const q = canonicalTimetableQuestion(question);
  const namedDay = requestedWeekday(q);
  const mentoringAnswer = mentoringClassAnswer(q);
  if (mentoringAnswer) return mentoringAnswer;
  const officialViewAnswer = officialTimetableViewAnswer(q);
  if (officialViewAnswer) return officialViewAnswer;
  const profileAnswer = answerProfileQuestion(q);
  if (profileAnswer) return profileAnswer;
  if (!state.schedule.length || !state.selectedGroup) return "<p><strong><u>Timetable unavailable</u></strong></p><p>Load the official timetable first. Then I can answer class, teacher, room, and timing questions for your group.</p>";
  const explicitSelectionAnswer = explicitTimetableSelectionAnswer(q);
  if (explicitSelectionAnswer) return explicitSelectionAnswer;
  const teacherSubjects = teacherSubjectRelationshipAnswer(q);
  if (teacherSubjects) return teacherSubjects;
  const catalogueCount = activeCatalogueCountAnswer(q);
  if (catalogueCount) return catalogueCount;
  const teacherReference = teacherReferenceAnswer(q);
  if (teacherReference) return teacherReference;
  const roomReference = roomReferenceAnswer(q);
  if (roomReference) return roomReference;
  const roomSchedule = roomScheduleAnswer(q);
  if (roomSchedule) return roomSchedule;
  const asksDayAfterTomorrow = /\bday\s+after\s+tomorrow\b|\bparso(?:n)?\b/.test(q);
  const relativeDay = asksDayAfterTomorrow ? indiaCalendarDate(2) : null;
  const explicitDay = namedDay || relativeDay?.day || "";
  const asksTomorrow = /tomorrow|kal|कल|ਕੱਲ੍ਹ|ਕਲ੍ਹ/.test(q);
  const asksToday = /today|aaj|ajj|आज|ਅੱਜ/.test(q);
  const asksCurrent = /current|now|abhi|hun|chal rahi|chal raha|ongoing|अभी|चल रही|चल रहा|ਹੁਣ|ਚੱਲ ਰਹੀ|ਚੱਲ ਰਿਹਾ/.test(q);
  const requestedUpcomingPosition = requestedUpcomingClassPosition(q);
  const asksNext = /next|agli|agla|aage|agge|अगली|अगला|आगे|ਅਗਲੀ|ਅਗਲਾ|ਅੱਗੇ/.test(q) || requestedUpcomingPosition > 1;
  const upcomingPosition = asksNext ? requestedUpcomingPosition : 1;
  const asksAfterNext = asksNext && upcomingPosition > 1;
  const asksWhere = /where|room|venue|location|place|kahan|kahaan|kithe|kithhe|कहाँ|कहा|कमरा|किथੇ|ਕਿੱਥੇ/.test(q);
  const asksTeacher = /teacher|faculty|sir|maam|mam|kaun padh|शिक्षक|टीचर|अध्यापक|ਕੌਣ ਪੜ੍ਹਾ|ਅਧਿਆਪਕ|ਟੀਚਰ/.test(q);
  const isPortalLinkQuestion = /\b(?:index|link|links|portal|website|downloads?|pdf|rules?|hostels?|notices?)\b/i.test(q);
  const isScheduleQuestion = !isPortalLinkQuestion && /time\s*table|timetable|schedule|classes|class hai/i.test(q);
  const asksFreePeriod = /free\s*(lecture|lectures|period|periods|class|classes|slots?|time)|empty\s*(period|lecture|slot)|breaks?\s*(today|tomorrow|on|for)?|\bgaps?\b(?:\s*(?:between|in)\s*classes)?/.test(q);
  const asksFirstClass = /\b(?:first|earliest)\b.*\b(?:class|lecture|period)\b|\b(?:class|lecture|period)\b.*\b(?:first|earliest)\b/.test(q);
  const asksLastClass = /\b(?:last|final|latest)\b.*\b(?:class|lecture|period)\b|\bwhen\b.*\b(?:finish|end|leave)\b|\bwhat time\b.*\b(?:finish|end|leave)\b/.test(q);
  if ((asksFirstClass || asksLastClass) && (explicitDay || asksTomorrow || asksToday)) {
    const day = explicitDay || (asksTomorrow ? nextStudyDayInfo(false)?.day : getIndiaNow().day);
    const entries = classFor(state.selectedGroup, day);
    if (!entries.length) return `<p>No class is listed on <strong>${escapeHtml(day)}</strong>.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
    const target = asksFirstClass ? entries[0] : entries[entries.length - 1];
    return `<p><strong>${asksFirstClass ? "First" : "Last"} class on ${escapeHtml(day)}: ${escapeHtml(target.subject)}</strong></p><p>${humanTime(target.start)} - ${humanTime(target.end)} · ${escapeHtml(target.room)} · ${escapeHtml(target.teacher)}</p>${asksLastClass ? `<p>You finish at <strong>${humanTime(target.end)}</strong>.</p>` : ""}<p class="answer-source">Official GNDEC weekly timetable.</p>`;
  }
  if (asksFreePeriod) {
    const day = explicitDay || (asksTomorrow ? (nextStudyDayInfo(false)?.day || currentAndNext(1).day) : getIndiaNow().day);
    return freePeriodAnswer(day);
  }
  const referencedClasses = findReferencedClasses(q);
  const asksWholeWeek = /\ball\b|\bweek\b|all\s+days|every|which\s+days|sari|saari|saare|poore\s+hafte|पूर[ेा]\s+हफ्ते|ਸਾਰੇ|ਹਫਤੇ/.test(q);
  const referencedForDay = explicitDay ? referencedClasses.filter((item) => item.day === explicitDay) : referencedClasses;
  const asksAvailability = /\b(?:is|are)\s+there\b|\b(?:do|does)\s+(?:i\s+have|\w+\s+(?:happen|occur))\b|\bany\b|koi\s+class|class\s+hai|class\s+hundi/.test(q);
  const referencedSubjects = [...new Set(referencedClasses.map((item) => item.subject))];
  if (explicitDay && asksAvailability && referencedSubjects.length) return subjectAvailabilityAnswer(referencedSubjects, explicitDay, referencedClasses);
  // A subject/teacher match is more specific than the broad word "classes".
  // This prevents “all math classes this week” becoming today's whole schedule.
  if (referencedClasses.length && !asksNext && !asksCurrent && !asksAfterNext && (asksWholeWeek || explicitDay)) {
    return scheduleAnswer(referencedForDay, `${activeTimetableLabel()} matching classes${explicitDay ? ` · ${explicitDay}` : " this week"}`);
  }
  if (referencedClasses.length && (asksWhere || asksTeacher)) {
    return scheduleAnswer(asksWholeWeek || explicitDay ? referencedForDay : referencedClasses.slice(0, 1), asksWhere ? "Class location" : "Class teacher");
  }
  const askedTime = requestedTime(q);
  const asksBeforeTime = /\bbefore\b|\bpehle\b|\bpahile\b|\btoh pehl[ea]\b/.test(q);
  const asksAfterTime = /\bafter\b|\bbaad\b|\btoh baad\b/.test(q);
  const asksMorning = /\bmorning\b|\bsubah\b|\bsaver\b/.test(q);
  const asksAfternoon = /\bafternoon\b|\bdopahar\b/.test(q);
  if (explicitDay && (asksMorning || asksAfternoon || (askedTime !== null && (asksBeforeTime || asksAfterTime)))) {
    const allEntries = classFor(state.selectedGroup, explicitDay);
    const cutoff = askedTime !== null ? askedTime : 720;
    const entries = asksBeforeTime || asksMorning
      ? allEntries.filter((item) => item.end <= cutoff)
      : allEntries.filter((item) => item.start >= cutoff);
    const rangeLabel = asksBeforeTime ? `before ${humanTime(cutoff)}` : asksAfterTime ? `after ${humanTime(cutoff)}` : asksMorning ? "in the morning" : "in the afternoon";
    return scheduleAnswer(entries, `${activeTimetableLabel()} · ${explicitDay} classes ${rangeLabel}`);
  }
  if (askedTime !== null) {
    const timeDay = explicitDay || (asksTomorrow ? currentAndNext(1).day : getIndiaNow().day);
    const candidates = classFor(state.selectedGroup, timeDay);
    // "3:30" is ambiguous; when the raw time is before 8 AM also try the
    // afternoon counterpart so afternoon periods still match.
    const timeCandidates = askedTime < 480 ? [askedTime, askedTime + 720] : [askedTime];
    const exact = candidates.filter((item) => timeCandidates.includes(item.start));
    const overlapping = candidates.filter((item) => timeCandidates.some((time) => item.start < time && item.end > time));
    const timeMatches = exact.length ? exact : overlapping;
    if (timeMatches.length) {
      const matchedStart = exact.length ? exact[0].start : overlapping[0].start;
      return `<p><strong><u>${escapeHtml(state.selectedGroup)} · ${escapeHtml(timeDay)} · ${humanTime(matchedStart)}</u></strong></p>${timeMatches.map((item) => `<p><strong>${escapeHtml(item.subject)}</strong> <span>(${escapeHtml(classTypeLabel(item.type))})</span><br />${escapeHtml(item.teacher)} · ${escapeHtml(item.room)}</p>`).join("")}<p class="answer-source">Official GNDEC weekly timetable.</p>`;
    }
  }
  if ((asksToday || explicitDay || isScheduleQuestion) && !asksNext && !asksCurrent && !asksWhere && !asksTeacher) {
    // A whole-week question must never collapse to today's (possibly empty)
    // day view — "saari classes is hafte ki" asks for the full week.
    const futureStudyDay = asksTomorrow ? nextStudyDayInfo(false) : null;
    if (!explicitDay && !asksTomorrow && !asksToday && asksWholeWeek) {
      return scheduleAnswer(classFor(state.selectedGroup, "").length ? [] : referencedClasses.length ? referencedClasses : DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day)), `${activeTimetableLabel()} · whole week`);
    }
    const day = explicitDay || futureStudyDay?.day || getIndiaNow().day;
    const classes = classFor(state.selectedGroup, day);
    return dayScheduleAnswer(classes, day, relativeDay?.compactLabel || futureStudyDay?.compactLabel || "");
  }
  const selection = currentAndNext(asksTomorrow ? 1 : 0);
  // Direction questions must follow time order. A generic word such as
  // "class" must never make MENTORING CLASS win this lookup.
  const match = (asksNext || asksCurrent || asksAfterNext) ? null : (referencedClasses[0] || null);
  if (!match && !asksNext && !asksCurrent && !asksAfterNext && !asksTomorrow) return "";
  const target = match || (asksCurrent ? selection.current : asksNext ? selection.upcoming[upcomingPosition - 1] : selection.next);
  if ((asksToday || /timetable|schedule|classes|class hai|टाइमटेबल|समय सारणी|ਟਾਈਮਟੇਬਲ|ਸਮਾਂ ਸਾਰਣੀ/.test(q)) && !isPortalLinkQuestion && !asksNext && !asksCurrent && !asksWhere && !asksTeacher && !match) {
    const futureStudyDay = asksTomorrow ? nextStudyDayInfo(false) : null;
    const day = futureStudyDay?.day || (asksTomorrow ? selection.day : getIndiaNow().day);
    const classes = classFor(state.selectedGroup, day);
    return dayScheduleAnswer(classes, day, futureStudyDay?.compactLabel || "");
  }
  if (!target && asksCurrent) return "<p><strong><u>No class is happening now.</u></strong></p><p>Your next class is shown in the Up Next panel.</p>";
  if (!target && asksNext && upcomingPosition > 1) return `<p><strong><u>No ${escapeHtml(String(upcomingPosition))}${upcomingPosition === 2 ? "nd" : upcomingPosition === 3 ? "rd" : "th"} upcoming class is listed.</u></strong></p><p>The active official timetable does not contain that many future classes.</p>`;
  if (!target) return "";
  if (asksWhere) return `<p><strong>${escapeHtml(target.subject)}</strong> is in <strong>${escapeHtml(target.room)}</strong>.</p><p>${humanTime(target.start)} to ${humanTime(target.end)} · ${escapeHtml(target.day)}</p>`;
  if (asksTeacher) return `<p><strong>${escapeHtml(target.subject)}</strong> is listed with <strong>${escapeHtml(target.teacher)}</strong>.</p><p>${humanTime(target.start)} · ${escapeHtml(target.room)}</p>`;
  const ordinalLabels = ["", "Next class", "Second upcoming class", "Third upcoming class", "Fourth upcoming class", "Fifth upcoming class"];
  const label = asksCurrent ? "Current class" : asksAfterNext ? ordinalLabels[upcomingPosition] : asksTomorrow ? "Tomorrow's first relevant class" : "Next class";
  return `<p><strong>${label}: ${escapeHtml(target.subject)}</strong></p><p><strong>${humanTime(target.start)} - ${humanTime(target.end)}</strong> · ${escapeHtml(target.room)} · ${escapeHtml(target.teacher)}</p>`;
}

function requestedScheduleDate(question) {
  const months = { january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11 };
  const match = question.toLowerCase().match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)(?:[\s,\-/]+(\d{2}|\d{4}))?\b/);
  if (!match) return null;
  const explicitYear = match[3];
  const parsedYear = explicitYear ? Number(explicitYear) : 0;
  const year = parsedYear ? (parsedYear < 100 ? 2000 + parsedYear : parsedYear) : Number(getIndiaNow().date.match(/\d{4}/)?.[0] || new Date().getFullYear());
  const date = new Date(Date.UTC(year, months[match[2]], Number(match[1])));
  if (date.getUTCMonth() !== months[match[2]]) return null;
  return { date: date.toISOString().slice(0, 10), day: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date), label: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", weekday: "long", timeZone: "UTC" }).format(date) };
}

function calendarQuestionAnswer(question) {
  const q = canonicalTimetableQuestion(question);
  const asksCalendar = /\b(?:what|which|tell|show)\b.*\b(?:date|day|weekday)\b|\b(?:date|day|weekday)\b.*\b(?:what|which|is)\b/.test(q);
  if (!asksCalendar) return "";
  const base = indiaCalendarDate(0).date;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const format = (date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  const nextDay = q.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)?.[1];
  if (nextDay) {
    const target = dayNames.findIndex((value) => value.toLowerCase() === nextDay);
    let offset = (target - base.getUTCDay() + 7) % 7;
    if (offset === 0) offset = 7;
    const date = new Date(base.getTime());
    date.setUTCDate(date.getUTCDate() + offset);
    return `<p><strong>Next ${escapeHtml(dayNames[target])}</strong> is <strong>${escapeHtml(format(date))}</strong>.</p><p class="answer-source">Calculated from today's India calendar date.</p>`;
  }
  const relative = q.match(/\b(day after tomorrow|today|tomorrow)\b/);
  if (relative) {
    const date = new Date(base.getTime());
    const offset = relative[1] === "day after tomorrow" ? 2 : relative[1] === "tomorrow" ? 1 : 0;
    if (offset) date.setUTCDate(date.getUTCDate() + offset);
    const label = offset === 2 ? "Day after tomorrow" : offset ? "Tomorrow" : "Today";
    return `<p><strong>${label}</strong> is <strong>${escapeHtml(dayNames[date.getUTCDay()])}, ${escapeHtml(format(date))}</strong>.</p><p class="answer-source">India calendar date.</p>`;
  }
  const months = { january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11 };
  let match = q.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/]+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)(?:[\s,\-/]+(\d{2}|\d{4}))?\b/);
  let day; let month; let year;
  if (match) {
    day = Number(match[1]); month = months[match[2]]; year = Number(match[3] || base.getUTCFullYear());
  } else {
    match = q.match(/\b(\d{1,2})[\-/](\d{1,2})[\-/](\d{2}|\d{4})\b/);
    if (!match) return "";
    day = Number(match[1]); month = Number(match[2]) - 1; year = Number(match[3]);
  }
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return "<p><strong>That date is not valid.</strong></p>";
  return `<p><strong>${escapeHtml(format(date))}</strong> is a <strong>${escapeHtml(dayNames[date.getUTCDay()])}</strong>.</p><p class="answer-source">Verified calendar calculation.</p>`;
}

function answerStructuredQuestion(question) {
  const calendarAnswer = calendarQuestionAnswer(question);
  if (calendarAnswer) return calendarAnswer;
  const requestedDate = requestedScheduleDate(question);
  const asksSchedule = /time\s*table|schedule|classes|class hai/i.test(question);
  if (requestedDate && asksSchedule && state.schedule.length && state.selectedGroup) {
    // Weekly FET entries cannot prove what happens on a particular calendar
    // date: GNDEC may publish a one-day lecture rotation or activity notice.
    // Do not quietly present the regular week as a verified special schedule.
    return `<p><strong><u>Date-specific timetable not verified.</u></strong></p><p>I have the regular <strong>${escapeHtml(requestedDate.day)}</strong> weekly timetable for ${escapeHtml(activeTimetableLabel())}, but no verified one-day notice for <strong>${escapeHtml(requestedDate.label)}</strong> is loaded.</p><p>Open <strong>Profile → Latest timetable notices</strong> or refresh the official sources. I will not guess a special-day lecture, teacher, or room.</p>`;
  }
  return answerQuestion(question);
}

function isOpenQuestion(question) {
  // Open-ended questions (advice, tips, explanations) must reach the AI
  // even when they happen to mention a subject or teacher name.
  return /tips?|advice|suggest|recommend|how\s+to|kaise|kese|keise|कैसे|samjhao|samjha|समझाओ|समझा|explain|kya karu|kya karun|kya kare|क्या करू|guide|meri madad|मदद|weak|strong|difficult|easy|achha|accha|बेहतर|ਵਧੀਆ/.test(question.toLowerCase());
}

function isHeavyQuestion(question) {
  // Heavy questions (tips, advice, planning, "what to do in free time",
  // study help) are routed to the biggest available model.
  if (isOpenQuestion(question)) return true;
  return /what\s+(should|to\s+do|can\s+i|else)|how\s+(can|should)\s+i|free\s+time|time\s+pass|ideas?|suggestions?|things?\s+to\s+do|suggest\s+me|koi\s+(tips?|advice|suggestion)|opinion|thoughts?|make\s+a\s+plan|plan\s+(for\s+my|my)|study\s+plan|daily\s+plan|weekly\s+plan/.test(question.toLowerCase());
}

function shouldUseActualAi(question) {
  // Preserve public AI capacity: only questions that explicitly ask for an
  // explanation, personal plan, or advice leave Compass's local engine.
  return isOpenQuestion(question) || /make\s+(?:me\s+)?(?:a\s+)?(?:study|daily|weekly)\s+plan|personal(?:ised|ized)?\s+plan|detailed\s+(?:plan|explanation)|explain\s+(?:in\s+)?detail/i.test(question);
}

function isStructuredQuestion(question) {
  const q = canonicalTimetableQuestion(question);
  if (calendarQuestionAnswer(q)) return true;
  // Official schedule facts never go to NVIDIA, even when phrased with
  // conversational words such as “explain”.
  if ((!isOpenQuestion(q) || requestedWeekday(q) || /timetable|time\s*table|schedule|free\s*(lecture|period)/.test(q)) && (isFactualTimetableQuestion(q) || Boolean(findReferencedClass(q)))) return true;
  if (isHeavyQuestion(q)) return false;
  if (requestedWeekday(q) || /time\s*table/.test(q)) return true;
  return Boolean(answerProfileQuestion(q)) || Boolean(findReferencedClass(q)) || /next|current|now|today|tomorrow|timetable|schedule|class|teacher|faculty|room|where|kahan|kahaan|kithe|mentor|hod|section|registration|\u0906\u091c|\u0915\u0932|\u0905\u0917\u0932[\u0940\u093e]|\u0905\u092d\u0940|\u0915\u0939\u093e\u0901|\u0915\u094d\u0932\u093e\u0938|\u0938\u092e\u092f|\u0905\u0a71\u0a1c|\u0a15\u0a32|\u0a05\u0a17\u0a32\u0a40|\u0a39\u0a41\u0a23|\u0a15\u0a3f\u0a71\u0a25\u0a47|\u0a15\u0a3f\u0a25\u0a47/gu.test(q);
}

function assistantContext(question = "", comparisonStudents = []) {
  const now = getIndiaNow();
  const profile = activeStudentProfile();
  const syllabusCourse = syllabusCoursesForQuestion(question)[0];
  const weeklyClasses = DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day));
  const timetableSubjects = [...new Set(weeklyClasses.map((item) => item.subject).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const timetableTeachers = [...new Set(weeklyClasses.flatMap((item) => teacherNames(item.teacher)))].sort((left, right) => left.localeCompare(right));
  const timetableRooms = [...new Set(weeklyClasses.map((item) => item.room).filter((room) => room && !/not listed/i.test(room)))].sort((left, right) => left.localeCompare(right));
  const engineeringBranches = engineeringBranchCatalog();

  const cleanQ = question.replace(/[^a-zA-Z0-9]/g, " ");
  const mentionedGroups = state.groups.filter((g) => new RegExp(`\\b${g.replace(/[^a-zA-Z0-9]/g, "")}\\b`, "i").test(cleanQ));
  const comparisonTimetables = {};
  if (mentionedGroups.length > 0) {
    mentionedGroups.forEach((g) => {
      comparisonTimetables[g] = DAY_NAMES.flatMap((day) => classFor(g, day));
    });
  }
  const kernel = globalThis.CompassBrainKernel;

  return {
    studentProfile: { branch: profile.branch, section: profile.section, subsection: profile.subsection || profile.subgroup },
    selectedTimetable: {
      group: state.selectedGroup,
      groupLabel: groupLabel(state.selectedGroup),
      subgroup: state.selectedSubgroup || "All students",
      indiaTime: `${now.day}, ${now.date}, ${now.time} IST`,
      currentDayClasses: classFor(state.selectedGroup, now.day),
      weeklyClasses,
      catalogue: { subjects: timetableSubjects, teachers: timetableTeachers, rooms: timetableRooms }
    },
    comparisonTimetables,
    comparisonStudents,
    officialAcademicCatalogue: {
      engineeringBranchCount: engineeringBranches.length,
      engineeringBranches,
      scope: "Current B.Tech engineering branches represented by Compass; do not confuse this count with every UG/PG programme.",
      officialProgramsUrl: OFFICIAL_PROGRAMS_URL
    },
    compassKnowledge: {
      creator: "Kaushik Jain from ECE - B1 (2026 Batch) built this web app.",
      holidays: kernel?.OFFICIAL_HOLIDAYS_2026 || [],
      batch2026Details: "2026 Batch Section details: CE, CS, EC, EE, IT, ME, RAI branch students.",
      officialLinksDescription: "GNDEC Official links available: Timetable Index, Academic Calendars (Jul-Dec 2026, Jan-Jun 2026), GNDEC Official Holidays 2026, Current student rosters (CE, CS, EC, EE, IT, ME, RAI), First-year study scheme & syllabus, Applied Sciences, IKGPTU Academic Notifications, GNDEC Information Brochure 2026, Academics & Autonomous Regulations, Campus Facilities & Hostels, GNDEC Faculty Directory.",
      availableVerifiedDomains: ["active timetable", "class dates and times", "subjects", "teachers and co-teachers", "rooms and published building labels", "free periods and internal breaks", "saved profile selection without private identifiers", "first-year syllabus", "public professional faculty details", "GNDEC engineering branch catalogue", "holiday calculation", "creator info", "student search and branch details"],
      instruction: "Use a directly supplied verified fact before claiming that information is unavailable. Never infer a missing college fact."
    },
    source: state.metadata?.source || "Official GNDEC group timetable",
    ...(syllabusCourse ? { officialSyllabus: { ...syllabusCourse, source: "Official GNDEC first-year syllabus" } } : {}),
    ...(state.activeFacultyAiContext ? { officialFaculty: state.activeFacultyAiContext } : {})
  };
}

function redactSensitiveAiText(question = "") {
  let safe = String(question);
  const profile = activeStudentProfile();
  const replacements = [
    [profile.registrationNo, "registration number"],
    [profile.currentSerialNo || profile.serialNo, "serial number"],
    [profile.newSerialNo, "serial number"],
    ...(Array.isArray(profile.oldSerialNos) ? profile.oldSerialNos.map((value) => [value, "serial number"]) : []),
    [profile.crn, "CRN"],
    [profile.mentorPhone, "mentor phone"],
    [profile.mentor, "mentor"],
    [profile.name, "student name"]
  ].filter(([value]) => String(value || "").trim().length >= 2)
    .sort((left, right) => String(right[0]).length - String(left[0]).length);
  for (const [value, label] of replacements) {
    const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    safe = safe.replace(new RegExp(escaped, "gi"), `[${label} removed]`);
  }
  // Also protect identifiers a student typed but which are not yet present in
  // the saved profile. The label remains so the study question still makes
  // sense to the model, while the value never leaves this browser.
  safe = safe.replace(/\b(crn|registration(?:\s+(?:number|no\.?))?|(?:current|new|old|previous)?\s*serial(?:\s+(?:number|no\.?))?)\s*[:#-]?\s*((?=[a-z0-9/-]{2,25}\b)(?=[a-z0-9/-]*\d)[a-z0-9/-]+)\b/gi, "$1 [identifier removed]");
  safe = safe.replace(/\b(mentor\s+(?:phone|mobile|contact)(?:\s+(?:number|no\.?))?)\s*[:#-]?\s*(\+?\d[\d\s-]{6,18}\d)\b/gi, "$1 [phone removed]");
  return safe.slice(0, 1200);
}

function stripThinkingPrefix(value) {
  const markers = [
    /^.*?here'?s\s+(a|my)\s+thinking\s+process\s*:[\s\S]*?(?=\n\s*(final\s+answer|answer|response|conclusion|final)\s*:)/i,
    /^.*?here'?s\s+(a|my)\s+thinking\s+process\s*:[\s\S]*?\n(?=\*{0,2}(final|answer|response|direct|summary)\b)/i,
    /^.*?(thinking\s+process|chain[- ]of[- ]thought)\s*:[\s\S]*?(?=\n\s*(answer|response|final)\s*:)/i
  ];
  for (const pattern of markers) {
    const cleaned = value.replace(pattern, "");
    if (cleaned !== value) return cleaned.trim();
  }
  // Some providers prefix a final answer with a short analysis heading. If a
  // clear final/answer marker exists, keep only the user-facing portion.
  const explicitFinal = value.match(/(?:^|\n)\s*(?:\*{0,2}(?:final\s+answer|answer|response|direct\s+answer)\*{0,2})\s*:\s*([\s\S]+)$/i);
  if (/thinking\s+process|chain[- ]of[- ]thought/i.test(value) && explicitFinal?.[1]) return explicitFinal[1].trim();
  return value.trim();
}

function formatAiAnswer(value) {
  return escapeHtml(stripThinkingPrefix(value))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/\n/g, "<br />");
}

let pdfModulePromise;
let pendingStudentMatches = [];

function normalizeStudentName(value = "") {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function normalizeStudentIdentifier(value = "") {
  return String(value).normalize("NFKC").replace(/[^a-z0-9]+/gi, "").toUpperCase();
}

function normalizeStudentRecord(record = {}) {
  const currentSerialNo = cleanText(String(record.currentSerialNo || record.serialNo || ""));
  const branchValue = cleanText(String(record.branch || ""));
  const mentorVenue = cleanText(String(record.mentorVenue || record.venue || ""));
  const oldSerialNos = [...new Set([
    ...(Array.isArray(record.oldSerialNos) ? record.oldSerialNos : []),
    ...(Array.isArray(record.serialHistory) ? record.serialHistory : []),
    record.oldSerialNo || ""
  ].map((value) => cleanText(String(value))).filter((value) => value && value !== currentSerialNo))];
  return {
    serialNo: currentSerialNo,
    currentSerialNo,
    newSerialNo: cleanText(String(record.newSerialNo || "")),
    oldSerialNos,
    crn: cleanText(String(record.crn || "")),
    name: cleanText(String(record.name || "")),
    registrationNo: cleanText(String(record.registrationNo || "")),
    branch: /^[A-Z0-9]{2,8}$/i.test(branchValue) ? branchValue.toUpperCase() : branchValue,
    section: cleanText(String(record.section || "")).toUpperCase(),
    subsection: cleanText(String(record.subsection || record.subgroup || "")).toUpperCase(),
    mentor: cleanText(String(record.mentor || "")),
    mentorPhone: cleanText(String(record.mentorPhone || record.mentorMobile || "")),
    academicGroup: cleanText(String(record.academicGroup || record.mentoringGroup || "")),
    mentorVenue,
    venue: mentorVenue,
    rosterVersion: cleanText(String(record.rosterVersion || "")),
    rosterRevision: cleanText(String(record.rosterRevision || "")),
    rosterSchemaVersion: Number(record.rosterSchemaVersion || 0)
  };
}

function studentIdentifierValues(record = {}) {
  return [...new Set([
    record.crn, record.registrationNo, record.serialNo, record.currentSerialNo, record.newSerialNo,
    ...(Array.isArray(record.oldSerialNos) ? record.oldSerialNos : []),
    ...(Array.isArray(record.serialHistory) ? record.serialHistory : [])
  ].map(normalizeStudentIdentifier).filter(Boolean))];
}

function studentIdentifierMatch(record, value) {
  const query = normalizeStudentIdentifier(value);
  return Boolean(query && studentIdentifierValues(record).includes(query));
}

function resolveStudentIdentifierMatches(records, value, savedProfile = null) {
  const query = normalizeStudentIdentifier(value);
  if (!query) return [];
  const savedOldSerials = Array.isArray(savedProfile?.oldSerialNos) ? savedProfile.oldSerialNos.map(normalizeStudentIdentifier) : [];
  if (savedOldSerials.includes(query)) {
    // Serial values can be reused in a later roster. A serial retained by this
    // device therefore resolves through the saved CRN/registration identity,
    // never by silently selecting whoever currently owns that number.
    const stableIdentifiers = [savedProfile?.crn, savedProfile?.registrationNo].map(normalizeStudentIdentifier).filter(Boolean);
    const stableMatches = records.filter((record) => stableIdentifiers.some((identifier) => studentIdentifierMatch(record, identifier)));
    if (stableMatches.length) return stableMatches;
  }
  return records.filter((record) => studentIdentifierMatch(record, query));
}

function studentMatchScore(record, query) {
  const candidate = normalizeStudentName(record.name);
  if (candidate === query) return 10000;
  if (candidate.includes(query) || query.includes(candidate)) return 8000 + Math.min(query.length, candidate.length);
  const queryWords = query.split(" ").filter((word) => word.length >= 2);
  const candidateWords = candidate.split(" ").filter(Boolean);
  if (!queryWords.length) return 0;
  let score = 0;
  for (const queryWord of queryWords) {
    const nearest = Math.min(...candidateWords.map((word) => editDistance(queryWord, word)));
    const allowance = queryWord.length >= 7 ? 2 : 1;
    if (nearest > allowance) return 0;
    score += 100 - nearest * 20;
  }
  return score + (queryWords.length === candidateWords.length ? 25 : 0);
}

function recordStudentSearch(name) {
  const original = String(name || "").trim();
  if (original.length < 3) return;
  let history = [];
  try { history = JSON.parse(localStorage.getItem(STUDENT_HISTORY_KEY)) || []; } catch { /* ignore */ }
  history = [original, ...history.filter((item) => item !== original)].slice(0, 8);
  try { localStorage.setItem(STUDENT_HISTORY_KEY, JSON.stringify(history)); } catch { /* ignore */ }
  renderStudentHistory();
}

function renderStudentHistory() {
  const datalist = $("student-history");
  if (!datalist) return;
  let history = [];
  try { history = JSON.parse(localStorage.getItem(STUDENT_HISTORY_KEY)) || []; } catch { /* ignore */ }
  datalist.innerHTML = history.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function parseStudentSectionText(text, fallbackBranch = "") {
  return text.split(/\r?\n/).flatMap((rawLine) => {
    const columns = rawLine.split(/\t+/).map(cleanText).filter(Boolean);
    if (columns.length >= 10 && /^\d+$/.test(columns[0]) && /^[A-Z0-9-]{4,20}$/i.test(columns[1])) {
      // GNDEC's newest permanent-section PDFs add the registration number
      // after CRN. Older releases do not, so support both official layouts.
      const hasRegistrationColumn = /^26\d{6,10}$/.test(columns[2] || "");
      const offset = hasRegistrationColumn ? 1 : 0;
      const nameIndex = 2 + offset;
      const branchIndex = 5 + offset;
      const sectionIndex = 6 + offset;
      const subsectionIndex = 7 + offset;
      const branch = String(columns[branchIndex] || fallbackBranch).toUpperCase();
      const looksLikePermanentRoster = /^[A-Z]{2,8}$/.test(branch) && /^[A-Z0-9]{2,12}$/i.test(columns[sectionIndex] || "") && /^[A-Z0-9]{2,16}$/i.test(columns[subsectionIndex] || "");
      if (looksLikePermanentRoster && columns[nameIndex]) {
        return [normalizeStudentRecord({
          serialNo: columns[0],
          crn: columns[1],
          registrationNo: hasRegistrationColumn ? columns[2] : "",
          name: columns[nameIndex],
          branch,
          section: columns[sectionIndex],
          subsection: columns[subsectionIndex],
          academicGroup: columns[8 + offset] || "",
          mentor: columns[9 + offset] || "",
          mentorPhone: columns[10 + offset] || "",
          mentorVenue: columns[11 + offset] || "",
          rosterSchemaVersion: ROSTER_SCHEMA_VERSION
        })];
      }
    }
    const line = cleanText(rawLine);
    const serialMatch = line.match(/^(\d+)\s+/);
    const serialStripped = line.replace(/^\d+\s+/, "");
    const registrationMatch = serialStripped.match(/\b(26\d{6})\b/);
    if (!registrationMatch) return [];
    const name = cleanText(serialStripped.slice(0, registrationMatch.index));
    const fields = cleanText(serialStripped.slice((registrationMatch.index || 0) + registrationMatch[0].length)).match(/^([A-Z]+)\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+(.+)$/i);
    if (!name || !fields) return [];
    return [normalizeStudentRecord({ serialNo: serialMatch?.[1] || "", name, registrationNo: registrationMatch[1], branch: fields[1].toUpperCase() || fallbackBranch, section: fields[2].toUpperCase(), subsection: fields[3].toUpperCase(), mentor: cleanText(fields[4]) })];
  });
}

function mergeStudentRosterHistory(currentRecords = [], historyRecords = []) {
  const current = currentRecords.map(normalizeStudentRecord);
  const history = historyRecords.map(normalizeStudentRecord);
  const keyFor = (record) => `${String(record.branch || "").toUpperCase()}|${normalizeStudentName(record.name)}`;
  const currentCounts = new Map();
  const historyByKey = new Map();
  current.forEach((record) => currentCounts.set(keyFor(record), (currentCounts.get(keyFor(record)) || 0) + 1));
  history.forEach((record) => historyByKey.set(keyFor(record), [...(historyByKey.get(keyFor(record)) || []), record]));
  return current.map((record) => {
    const key = keyFor(record);
    const historicalMatches = historyByKey.get(key) || [];
    // Temporary rosters do not contain the later CRN, so exact name + branch
    // is the strongest available join. Never enrich a duplicated name on
    // either side: an omitted value is safer than attaching another student's
    // registration number or serial history.
    if (!normalizeStudentName(record.name) || currentCounts.get(key) !== 1 || historicalMatches.length !== 1) return record;
    const historical = historicalMatches[0];
    const previousSerial = historical.currentSerialNo && historical.currentSerialNo !== record.currentSerialNo ? [historical.currentSerialNo] : [];
    return normalizeStudentRecord({
      ...record,
      registrationNo: record.registrationNo || historical.registrationNo,
      oldSerialNos: [...(record.oldSerialNos || []), ...previousSerial, ...(historical.oldSerialNos || [])]
    });
  });
}

async function pdfTextFromResponse(response) {
  if (!pdfModulePromise) {
    pdfModulePromise = import("/vendor/pdf.mjs").then((module) => {
      module.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
      return module;
    });
  }
  const pdfjs = await pdfModulePromise;
  const document = await pdfjs.getDocument({
    data: new Uint8Array(await response.arrayBuffer()),
    // Some official roster PDFs contain unsupported Type 3 font commands.
    // Text extraction still succeeds, so keep genuine errors visible without
    // flooding the developer console with non-actionable font warnings.
    verbosity: pdfjs.VerbosityLevel.ERRORS
  }).promise;
  const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
    const content = await (await document.getPage(index + 1)).getTextContent();
    const rows = new Map();
    content.items.forEach((item) => {
      if (!item.str) return;
      const y = Math.round((item.transform?.[5] || 0) * 10) / 10;
      const x = item.transform?.[4] || 0;
      rows.set(y, [...(rows.get(y) || []), { x, text: item.str }]);
    });
    // Tabs preserve the PDF's table cells. Roster files contain several name
    // columns, so collapsing them all to spaces makes the student's own name
    // impossible to distinguish safely from parent and mentor names. Syllabus
    // parsing already normalizes whitespace and remains compatible with tabs.
    return [...rows.entries()].sort(([a], [b]) => b - a).map(([, items]) => items.sort((a, b) => a.x - b.x).map((item) => item.text).join("\t")).join("\n");
  }));
  return pages.join("\n\f\n");
}

function numberedSyllabusItems(text = "") {
  const value = cleanText(text);
  const accepted = [];
  let expected = 1;
  for (const match of value.matchAll(/(?<!\d)(\d{1,2})\.\s+/g)) {
    if (Number(match[1]) !== expected) continue;
    accepted.push({ index: match.index, contentStart: match.index + match[0].length });
    expected += 1;
  }
  return accepted.map((marker, index) => cleanText(value.slice(marker.contentStart, accepted[index + 1]?.index || value.length))
    .replace(/\b(19|20)\s+(\d{2})\b/g, "$1$2")
    .replace(/\s+\b(?:st|nd|rd|th)\s*$/i, "")
    .slice(0, 420))
    .filter((item) => item.length > 8);
}

function numberedLaboratoryItems(text = "") {
  const value = cleanText(text).replace(/^Experiment\s+Experiment\s+Title\s+No\.?\s*/i, "")
    // In the official Physics PDF text layer, experiment number 3 is emitted
    // after its title. Restore the source's visible order before parsing.
    .replace(/(To determine the dielectric constant of solid samples\.)\s*3\s+(?=4\s+To)/i, "3 $1 ");
  return [...value.matchAll(/(?:^|\s)(\d{1,2})\.?\s+((?:To|Determination|Introduction|Study|Measure|Verify|Trace|Find|Implement)[\s\S]*?)(?=\s+\d{1,2}\.?\s+(?:To|Determination|Introduction|Study|Measure|Verify|Trace|Find|Implement)|$)/gi)]
    .map((match) => conciseSyllabusText(match[2], 420))
    .filter((item) => item.length > 8);
}

function conciseSyllabusText(value, maximum = 900) {
  const cleaned = cleanText(value)
    .replace(/\b\d+\s+of\s+\d+\s+Scheme\s+Code\s*-\s*\d+\s+Guru\s+Nanak\s+Dev\s+Engineering\s+College,?\s+Ludhiana\s+An\s+Autonomous\s+College\s+under\s+UGC\s+Act\s+1956\s+st\s+B\.Tech\.\s+1\s+Year\s+\(Common\s+for\s+all\s+Branches\)\s*/gi, " ")
    .replace(/\s+/g, " ").trim();
  if (cleaned.length <= maximum) return cleaned;
  const candidate = cleaned.slice(0, maximum);
  const boundary = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("; "), candidate.lastIndexOf(": "));
  return `${candidate.slice(0, boundary >= maximum * 0.6 ? boundary + 1 : maximum).trim()}…`;
}

function syllabusNumber(value = "") {
  const compact = String(value).replace(/\s+/g, "");
  return /^\d+(?:\.\d+)?$/.test(compact) ? compact : "";
}

function syllabusMetadataText(value = "") {
  let cleaned = cleanText(value);
  for (let pass = 0; pass < 3; pass += 1) cleaned = cleaned.replace(/\b(\d)\s+(?=\d\b)/g, "$1");
  return cleaned.replace(/\bCalc\s+ulator\b/gi, "Calculator").replace(/\s+/g, " ").trim();
}

function parseSyllabusText(text) {
  // PDF text extraction is not consistent: some pages use new lines while
  // the fast text index uses spaces (and may space out a course code).
  const starts = [...text.matchAll(/\bCourse\s+Code\s*:\s*([A-Z][A-Z\s]{1,8}\d[\d\s]*)\b/gi)];
  return starts.map((match, index) => {
    const block = text.slice(match.index, starts[index + 1]?.index || text.length);
    const code = match[1].replace(/\s+/g, "").toUpperCase();
    const title = cleanText(block.match(/Course\s+Title\s*:\s*([\s\S]*?)(?=\s+(?:Programme|Semester|L\s*:|Credits\s*:)|$)/i)?.[1] || "")
      // Some PDF text layers split a word around a line boundary.  Keeping
      // these official course titles readable also makes fuzzy matching less
      // surprising for students.
      .replace(/\bEng ineering\b/gi, "Engineering")
      .replace(/\bPractice s\b/gi, "Practices")
      .replace(/\bP rogramming\b/gi, "Programming");
    const semester = cleanText(block.match(/Semester\s*:\s*([\s\S]*?)(?=\s+(?:Theory\s*\/\s*Practical|Teaching Hours|Total Max|Course Type)|$)/i)?.[1] || "");
    const credits = block.match(/Credits\s*:\s*(\d+(?:\.\d+)?)/i)?.[1] || "";
    const teachingHours = syllabusMetadataText(block.match(/Teaching\s+Hours\s*:\s*([\s\S]*?)(?=\s+Total\s+Max)/i)?.[1] || "");
    const totalMarks = syllabusNumber(block.match(/Total\s+Max\.?\s+Marks\s*:\s*([\d\s]+?)(?=\s+Continuous)/i)?.[1] || "");
    const assessment = block.match(/Continuous\s+Assessment[\s\S]*?\(C\s*A\)\s*Marks\s*:\s*([\d\s]+?)\s+Marks\s*:\s*([\d\s]+?)(?=\s+Minimum)/i);
    const caMarks = syllabusNumber(assessment?.[1] || "");
    const eseMarks = syllabusNumber(assessment?.[2] || "");
    const examDuration = syllabusMetadataText(block.match(/Duration\s+of\s+End\s+Semester\s+Examination\s*\(ESE\)\s*:\s*([\s\S]*?)(?=\s+Course\s+Type)/i)?.[1] || "");
    const prerequisites = syllabusMetadataText(block.match(/Prerequisites\s*\(if\s+any\)\s*:\s*([\s\S]*?)(?=\s+Additional\s+Material)/i)?.[1] || "");
    const additionalMaterial = syllabusMetadataText(block.match(/Additional\s+Material\s+Allowed\s+in\s+ESE\s*:\s*([\s\S]*?)(?=\s+On\s+completion|\s+Contents)/i)?.[1] || "");
    const outcomesText = block.match(/On completion of the course[\s\S]*?ability to:\s*([\s\S]*?)(?=\s*Contents\b)/i)?.[1] || "";
    const outcomes = outcomesText.split(/\s+(?=\d+\s)/).map((item) => cleanText(item).replace(/^\d+\s*/, "")).filter((item) => item.length > 10).slice(0, 10);
    // “Unit 1 … Unit 6” can appear in a course outcome sentence.  Only read
    // units after the official Contents heading, otherwise the chat can show
    // invented-looking duplicate units for perfectly valid PDF text.
    const contentsStart = block.search(/\bContents\b/i);
    const contents = contentsStart >= 0 ? block.slice(contentsStart) : block;
    const units = [...contents.matchAll(/U\s*nit\s*-\s*(\d+)\s+([\s\S]*?)(?=\s*U\s*nit\s*-\s*\d+|\s*(?:Laboratory Work|Text Books|Reference Books|Online Learning)|$)/gi)].map((unit) => {
      const raw = cleanText(unit[2]);
      const hoursMatch = raw.match(/\b\d+\s*\(L\)(?:\s*\+\s*\d+\s*\([PT]\))*\s*hrs?\b/i);
      const headingEnd = hoursMatch?.index ?? raw.length;
      const detailsStart = hoursMatch ? headingEnd + hoursMatch[0].length : raw.length;
      return {
        number: unit[1],
        title: raw.slice(0, headingEnd).trim().slice(0, 220),
        hours: cleanText(hoursMatch?.[0] || ""),
        details: conciseSyllabusText(raw.slice(detailsStart).replace(/^(?:Part\s*-\s*[AB]\s*)+/i, ""))
      };
    }).filter((unit) => unit.title);
    const textBooksSection = block.match(/\bText Books?\b([\s\S]*?)(?=\bReference Books?\b|\bOnline Learning Materials?\b|\bSupplementary\b|\bExperiments to be performed\b|$)/i)?.[1] || "";
    const referenceBooksSection = block.match(/\bReference Books?\b([\s\S]*?)(?=\bOnline Learning Materials?\b|\bSupplementary\b|\bExperiments to be performed\b|$)/i)?.[1] || "";
    const laboratorySection = block.match(/\bLaboratory\s+Work\b([\s\S]*?)(?=\bText Books?\b|\bReference Books?\b|\bOnline Learning Materials?\b|$)/i)?.[1] || "";
    return { code, title, semester, credits, teachingHours, totalMarks, caMarks, eseMarks, examDuration, prerequisites, additionalMaterial, outcomes, units, laboratoryWork: numberedLaboratoryItems(laboratorySection), textBooks: numberedSyllabusItems(textBooksSection), referenceBooks: numberedSyllabusItems(referenceBooksSection) };
  }).filter((course) => course.title && (course.units.length || course.outcomes.length));
}

function syllabusCoursesForQuestion(question) {
  const q = canonicalTimetableQuestion(question);
  const compact = normalizeStudentName(q);
  const aliases = [
    [["math", "maths", "mathematics", "ganit", "gannit"], "mathematics"], [["physics", "phyiscs", "fiziks", "bhautik"], "physics"], [["chemistry", "chemestry", "rasayan"], "chemistry"],
    [["programming", "programing", "pps", "problem", "solving"], "programming"], [["economics", "economy"], "economics"], [["english", "communication"], "english"],
    [["drawing", "graphics", "engineeringdrawing"], "drawing"], [["manufacturing", "workshop"], "manufacturing"], [["electrical", "electronics", "bee"], "electrical"], [["python"], "python"]
  ];
  const questionWords = compact.split(" ").filter((word) => word.length >= 3);
  const codeMatches = state.syllabus.filter((course) => compact.includes(normalizeStudentName(course.code)));
  if (codeMatches.length) return codeMatches;
  const requestedAliases = aliases.filter(([terms]) => terms.some((term) => questionWords.some((word) => word === term || (word.length >= 4 && editDistance(word, term) <= (term.length >= 8 ? 2 : 1))))).map(([, alias]) => alias);
  let matches = state.syllabus.filter((course) => {
    const title = normalizeStudentName(course.title);
    return requestedAliases.some((alias) => title.includes(alias)) || title.split(" ").filter((word) => word.length >= 5).some((word) => questionWords.some((queryWord) => queryWord === word || (queryWord.length >= 4 && editDistance(queryWord, word) <= (word.length >= 8 ? 2 : 1))));
  });
  // “Math II” must not silently become Math I just because both titles contain
  // Mathematics. Only treat I/II as a course level when it follows Math.
  const mathLevel = q.match(/\b(?:math(?:ematics)?|maths)\s*[- ]?\s*(i{1,3}|1|2)\b/)?.[1];
  if (requestedAliases.includes("mathematics") && mathLevel) {
    const romanLevel = mathLevel === "1" ? "i" : mathLevel === "2" ? "ii" : mathLevel;
    const nonMathMatches = matches.filter((course) => !normalizeStudentName(course.title).includes("mathematics"));
    const levelMatches = matches.filter((course) => normalizeStudentName(course.title).endsWith(` ${romanLevel}`));
    if (levelMatches.length) matches = [...nonMathMatches, ...levelMatches];
  } else if (requestedAliases.includes("mathematics")) {
    // In first-semester Compass usage, an unqualified “Math” means the active
    // Mathematics-I course. Students can still request Math II explicitly.
    const nonMathMatches = matches.filter((course) => !normalizeStudentName(course.title).includes("mathematics"));
    const mathOne = matches.filter((course) => normalizeStudentName(course.title).includes("mathematics") && normalizeStudentName(course.title).endsWith(" i"));
    if (mathOne.length) matches = [...nonMathMatches, ...mathOne];
  }
  return matches;
}

function isSyllabusQuestion(question) {
  const q = canonicalTimetableQuestion(question);
  // “My teachers with their subjects” is a timetable relationship query.
  // The generic word “subjects” must not send it into the syllabus index.
  if (isTeacherSubjectRelationshipQuestion(q)) return false;
  if (isActiveTimetableSubjectQuestion(q)) return false;
  // Students naturally put the requested fact before the course name too
  // (for example, "is calculator allowed in Physics?"). Keep course/detail
  // detection order-independent instead of requiring "Physics calculator".
  const hasNamedCourse = /\b(?:physics|maths?|mathematics|chemistry|economics|english|pps|programming|drawing|graphics|electrical|manufacturing|workshop|python)\b/.test(q) || syllabusCoursesForQuestion(q).length > 0;
  const hasSyllabusDetail = /\b(?:syllabus|study\s*scheme|course\s*(?:code|outcomes?|content)|subject\s*code|units?|chapters?|topics?|credits?|marks?|text\s*books?|reference\s*books?|recommended\s*books?|labs?|laboratory|experiments?|practicals?|assessment|exam\s*(?:duration|pattern|scheme|marks?|time|length|hours?)|teaching\s*hours?|prerequisites?|additional\s*material|calculator|course\s*outcomes?)\b/.test(q);
  if (hasNamedCourse && hasSyllabusDetail) return true;
  if (/syllabus|study\s*scheme|course\s*(?:code|outcomes?|content)|subject\s*code|units?|chapters?|topics?|credits?|marks?|text\s*books?|reference\s*books?|recommended\s*books?|\b(?:co|outcome)\s*#?\s*\d+\b|(?:physics|maths?|mathematics|chemistry|economics|english|pps|programming|drawing|electrical|manufacturing|python)[\s\S]*(?:books?|labs?|laboratory|experiments?|practicals?|assessment|exam\s*(?:duration|pattern|scheme|marks?)|teaching\s*hours?|prerequisites?|additional\s*material|calculator|course\s*outcomes?|\bco\s*\d+)|(?:total|how\s+many|kitne|kinne|count)\s*(?:subjects?|courses?|papers?)|(?:list|show|name)\s+(?:all\s+)?(?:subjects?|courses?|papers?)|(?:all|which)\s+(?:subjects?|courses?|papers?)\b/u.test(q)) return true;
  const words = normalizeStudentName(q).split(" ");
  const syllabusTerm = words.some((word) => word.length >= 4 && ["syllabus", "chapter", "credits", "outcomes", "content", "units"].some((intent) => editDistance(word, intent) <= (intent.length >= 7 ? 2 : 1)));
  if (syllabusTerm) return true;
  const fuzzyCatalogue = words.some((word) => word.length >= 5 && ["subject", "subjects", "course", "courses"].some((intent) => editDistance(word, intent) <= 2));
  return fuzzyCatalogue && /\b(?:total|how many|kitne|kinne|count|list|show|name|all|which|first year)\b/.test(q);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The official syllabus source took too long to respond.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadOfficialSyllabus() {
  if (state.syllabus.length) return state.syllabus;
  if (state.syllabusLoading) return state.syllabusLoading;
  state.syllabusLoading = (async () => {
    // A text-only index of all official PDF pages keeps the first syllabus
    // answer fast: no PDF download or 33-page browser decode is needed.
    try {
      const indexed = await fetchWithTimeout(SYLLABUS_INDEX_URL, { cache: "force-cache" }, 8000);
      if (!indexed.ok) throw new Error("Syllabus index unavailable.");
      const payload = await indexed.json();
      if (!Array.isArray(payload?.pages) || payload.pages.length < 30) throw new Error("Syllabus index is incomplete.");
      state.syllabusPages = payload.pages.map((page, index) => ({ number: Number(page.number) || index + 1, text: cleanText(page.text || "") })).filter((page) => page.text.length > 40);
      const courses = parseSyllabusText(state.syllabusPages.map((page) => page.text).join("\f"));
      if (!courses.length) throw new Error("Syllabus index could not be read.");
      state.syllabus = courses;
      state.syllabusMetadata = { source: payload.source || "Official GNDEC syllabus", generatedAt: payload.generatedAt || "", loadedAt: new Date().toISOString() };
      try { localStorage.setItem(SYLLABUS_STORAGE_KEY, JSON.stringify({ courses, pages: state.syllabusPages, metadata: state.syllabusMetadata })); } catch { /* optional device cache */ }
      updateQuestionSuggestions();
      return courses;
    } catch {
      // The live official PDF remains a resilient fallback.
    }
    const response = await fetchWithTimeout("/api/syllabus", { cache: "force-cache" }, 15000);
    if (!response.ok) throw new Error("The official syllabus PDF could not be loaded.");
    const syllabusText = await pdfTextFromResponse(response);
    const courses = parseSyllabusText(syllabusText);
    if (!courses.length) throw new Error("The official syllabus PDF could not be read.");
    state.syllabus = courses;
    state.syllabusPages = syllabusText.split("\f").map((page, index) => ({ number: index + 1, text: cleanText(page) })).filter((page) => page.text.length > 40);
    state.syllabusMetadata = { source: response.headers.get("X-GNDEC-Source") || "Official GNDEC syllabus", loadedAt: new Date().toISOString() };
    try { localStorage.setItem(SYLLABUS_STORAGE_KEY, JSON.stringify({ courses, pages: state.syllabusPages, metadata: state.syllabusMetadata })); } catch { /* optional device cache */ }
    updateQuestionSuggestions();
    return courses;
  })();
  try { return await state.syllabusLoading; }
  finally { state.syllabusLoading = null; }
}

function syllabusSearchTerms(question) {
  const ignored = new Set(["what", "where", "when", "which", "with", "from", "this", "that", "have", "does", "tell", "about", "please", "syllabus", "study", "scheme", "course", "subject", "page", "pages", "document", "official", "my", "the", "and", "for", "are", "how", "much"]);
  const words = normalizeStudentName(canonicalTimetableQuestion(question)).split(" ").filter((word) => word.length >= 3 && !ignored.has(word));
  // Deterministic topic expansion covers spelling systems and closely related
  // syllabus terminology without an embedding/model dependency. Fuzzy matching
  // below remains bounded to the 33-page official index.
  const conceptGroups = [
    ["fiber", "fibre"], ["optimization", "optimisation"], ["behavior", "behaviour"],
    ["program", "programme", "programming"], ["electromagnetic", "electromagnetism"],
    ["semiconductor", "semiconductors"], ["derivative", "differentiation"],
    ["integral", "integration"], ["crystal", "crystallography"], ["nano", "nanophysics", "nanotechnology"]
  ];
  const expanded = new Set(words);
  conceptGroups.forEach((group) => {
    if (group.some((term) => expanded.has(term))) group.forEach((term) => expanded.add(term));
  });
  return [...expanded].slice(0, 16);
}

function answerSyllabusPageSearch(question, minimumScore = 1) {
  const words = syllabusSearchTerms(question);
  if (!words.length || !state.syllabusPages.length) return "";
  const pageMatches = state.syllabusPages.map((page) => {
    const haystack = normalizeStudentName(page.text);
    const pageWords = [...new Set(haystack.split(" ").filter((word) => word.length >= 4 && word.length <= 40))];
    let score = 0;
    let position = -1;
    words.forEach((word) => {
      const found = haystack.indexOf(word);
      if (found >= 0) {
        score += word.length >= 6 ? 3 : 2;
        if (position < 0 || found < position) position = found;
        return;
      }
      if (word.length < 5) return;
      const maximumDistance = word.length >= 9 ? 2 : 1;
      const fuzzy = pageWords.find((candidate) => Math.abs(candidate.length - word.length) <= maximumDistance && editDistance(candidate, word) <= maximumDistance);
      if (fuzzy) {
        score += 2;
        const fuzzyPosition = haystack.indexOf(fuzzy);
        if (position < 0 || fuzzyPosition < position) position = fuzzyPosition;
      }
    });
    return { ...page, score, position: Math.max(position, 0) };
  }).filter((page) => page.score >= minimumScore).sort((left, right) => right.score - left.score || left.number - right.number).slice(0, 3);
  if (!pageMatches.length) return "";
  return `<p><strong><u>Official syllabus search</u></strong></p>${pageMatches.map((page) => {
    const startsMidText = page.position > 70;
    let excerpt = conciseSyllabusText(page.text.slice(Math.max(0, page.position - 70), page.position + 420), 460);
    if (startsMidText) excerpt = excerpt.replace(/^\S+\s+/, "");
    return `<p><strong>Page ${page.number}:</strong> ${escapeHtml(excerpt)}</p>`;
  }).join("")}<p class="answer-source">Official GNDEC syllabus · all ${state.syllabusPages.length} pages searched locally.</p>`;
}

function rememberSyllabusConversation(kind, courses = []) {
  state.syllabusConversation = { kind, courseCodes: courses.map((course) => course.code).filter(Boolean) };
  try { localStorage.setItem(SYLLABUS_CONVERSATION_KEY, JSON.stringify(state.syllabusConversation)); } catch { /* optional local continuity */ }
}

function syllabusCourseListAnswer() {
  if (!state.syllabus.length) return "";
  const courses = [...state.syllabus].sort((left, right) => left.code.localeCompare(right.code));
  rememberSyllabusConversation("subjects", courses);
  return `<p><strong><u>Official first-year subjects (${courses.length})</u></strong></p><ol>${courses.map((course) => `<li><strong>${escapeHtml(course.title)}</strong> <span>(${escapeHtml(course.code)} · ${course.units.length} units${course.credits ? ` · ${escapeHtml(course.credits)} credits` : ""})</span></li>`).join("")}</ol><p class="answer-source">Official GNDEC syllabus · all ${state.syllabusPages.length || 33} pages searched locally.</p>`;
}

function syllabusBooksAnswer(course, references = false) {
  const books = references ? course.referenceBooks : course.textBooks;
  const label = references ? "Reference books" : "Textbooks";
  if (!Array.isArray(books) || !books.length) return `<p><strong><u>${escapeHtml(course.title)} ${label.toLowerCase()}</u></strong></p><p>No ${label.toLowerCase()} are listed in the official source.</p><p class="answer-source">Official GNDEC syllabus.</p>`;
  return `<p><strong><u>${escapeHtml(course.title)} · ${label}</u></strong></p><ol>${books.map((book) => `<li>${escapeHtml(book)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC syllabus.</p>`;
}

function syllabusSpecificUnitAnswer(course, question) {
  const q = canonicalTimetableQuestion(question);
  const match = q.match(/\bunit\s*(?:-|number|no\.?\s*)?(\d{1,2})\b/);
  if (!match || !course) return "";
  const unit = course.units.find((item) => Number(item.number) === Number(match[1]));
  if (!unit) return `<p><strong><u>${escapeHtml(course.title)}</u></strong></p><p>Unit ${escapeHtml(match[1])} is not listed for this course in the official syllabus.</p><p class="answer-source">Official GNDEC syllabus.</p>`;
  const hours = unit.hours ? ` · ${escapeHtml(unit.hours)}` : "";
  const details = unit.details ? `<p>${escapeHtml(unit.details)}</p>` : "<p>No additional unit description is listed in the extracted official source.</p>";
  return `<p><strong><u>${escapeHtml(course.title)} · Unit ${escapeHtml(unit.number)}</u></strong></p><p><strong>${escapeHtml(unit.title)}</strong>${hours}</p>${details}<p class="answer-source">Official GNDEC syllabus.</p>`;
}

function syllabusSpecificOutcomeAnswer(course, question) {
  const q = canonicalTimetableQuestion(question);
  const match = q.match(/\b(?:co|course\s+outcome|outcome)\s*#?\s*-?\s*(\d{1,2})\b/);
  if (!match || !course) return "";
  const outcome = course.outcomes[Number(match[1]) - 1];
  if (!outcome) return `<p><strong><u>${escapeHtml(course.title)}</u></strong></p><p>Course outcome ${escapeHtml(match[1])} is not listed in the official syllabus.</p><p class="answer-source">Official GNDEC syllabus.</p>`;
  return `<p><strong><u>${escapeHtml(course.title)} · Course outcome ${escapeHtml(match[1])}</u></strong></p><p>${escapeHtml(outcome)}</p><p class="answer-source">Official GNDEC syllabus.</p>`;
}

function syllabusAssessmentAnswer(course, question) {
  const q = canonicalTimetableQuestion(question);
  if (!course || !/marks?|assessment|teaching\s*hours|duration|prerequisites?|additional\s*material|calculator|exam/.test(q)) return "";
  const rows = [];
  if (/marks?|assessment|exam\s*(?:scheme|pattern)/.test(q)) {
    if (course.totalMarks) rows.push(`<li><strong>Total marks:</strong> ${escapeHtml(course.totalMarks)}</li>`);
    if (course.caMarks) rows.push(`<li><strong>Continuous assessment:</strong> ${escapeHtml(course.caMarks)}</li>`);
    if (course.eseMarks) rows.push(`<li><strong>End-semester examination:</strong> ${escapeHtml(course.eseMarks)}</li>`);
  }
  if (/teaching\s*hours|how\s+many\s+hours/.test(q) && course.teachingHours) rows.push(`<li><strong>Teaching hours:</strong> ${escapeHtml(course.teachingHours)}</li>`);
  if (/duration|exam\s*(?:time|length|hours?)/.test(q) && course.examDuration) rows.push(`<li><strong>Exam duration:</strong> ${escapeHtml(course.examDuration)}</li>`);
  if (/prerequisites?/.test(q) && course.prerequisites) rows.push(`<li><strong>Prerequisites:</strong> ${escapeHtml(course.prerequisites)}</li>`);
  if (/additional\s*material|calculator|allowed.*exam/.test(q) && course.additionalMaterial) rows.push(`<li><strong>Additional material allowed:</strong> ${escapeHtml(course.additionalMaterial)}</li>`);
  if (!rows.length) return "";
  return `<p><strong><u>${escapeHtml(course.title)} · Official course details</u></strong></p><ul>${rows.join("")}</ul><p class="answer-source">Official GNDEC syllabus.</p>`;
}

function syllabusLaboratoryAnswer(course, question) {
  const q = canonicalTimetableQuestion(question);
  if (!course || !/\b(?:labs?|laboratory|experiments?|practicals?)\b/.test(q)) return "";
  if (!course.laboratoryWork?.length) return `<p><strong><u>${escapeHtml(course.title)} laboratory work</u></strong></p><p>No numbered laboratory experiments are listed for this course in the extracted official syllabus.</p><p class="answer-source">Official GNDEC syllabus.</p>`;
  return `<p><strong><u>${escapeHtml(course.title)} · Laboratory work (${course.laboratoryWork.length})</u></strong></p><ol>${course.laboratoryWork.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC syllabus.</p>`;
}

function syllabusCompositeAnswer(course, question) {
  if (!course) return "";
  const q = canonicalTimetableQuestion(question);
  const flags = {
    code: /\b(?:course|subject)?\s*code\b|\bcode\b/.test(q),
    semester: /\bsem(?:ester)?\b/.test(q),
    credits: /\bcredits?\b/.test(q),
    units: /\b(?:units?|chapters?|topics?|contents?|syllabus)\b/.test(q),
    outcomes: /\b(?:course\s*)?outcomes?\b|\bco(?:s)?\b/.test(q),
    marks: /\b(?:marks?|assessment|exam\s*(?:scheme|pattern))\b/.test(q),
    examDuration: /\bexam\s*(?:duration|time|length|hours?)\b/.test(q),
    teachingHours: /\bteaching\s*hours?\b/.test(q),
    prerequisites: /\bprerequisites?\b/.test(q),
    material: /\b(?:additional\s*material|calculator)\b/.test(q),
    labs: /\b(?:labs?|laboratory|experiments?|practicals?)\b/.test(q),
    textbooks: /\btext\s*books?\b|\btextbooks?\b/.test(q),
    references: /\breference\s*books?\b|\breferences?\b/.test(q)
  };
  if (Object.values(flags).filter(Boolean).length < 2) return "";
  const sections = [];
  const details = [];
  if (flags.code) details.push(`<li><strong>Course code:</strong> ${escapeHtml(course.code || "Not listed")}</li>`);
  if (flags.semester) details.push(`<li><strong>Semester:</strong> ${escapeHtml(course.semester || "Not listed")}</li>`);
  if (flags.credits) details.push(`<li><strong>Credits:</strong> ${escapeHtml(course.credits || "Not listed")}</li>`);
  if (flags.marks) {
    details.push(`<li><strong>Total marks:</strong> ${escapeHtml(course.totalMarks || "Not listed")}</li>`);
    details.push(`<li><strong>Continuous assessment:</strong> ${escapeHtml(course.caMarks || "Not listed")}</li>`);
    details.push(`<li><strong>End-semester examination:</strong> ${escapeHtml(course.eseMarks || "Not listed")}</li>`);
  }
  if (flags.examDuration) details.push(`<li><strong>Exam duration:</strong> ${escapeHtml(course.examDuration || "Not listed")}</li>`);
  if (flags.teachingHours) details.push(`<li><strong>Teaching hours:</strong> ${escapeHtml(course.teachingHours || "Not listed")}</li>`);
  if (flags.prerequisites) details.push(`<li><strong>Prerequisites:</strong> ${escapeHtml(course.prerequisites || "Not listed")}</li>`);
  if (flags.material) details.push(`<li><strong>Additional material allowed:</strong> ${escapeHtml(course.additionalMaterial || "Not listed")}</li>`);
  if (details.length) sections.push(`<ul>${details.join("")}</ul>`);
  if (flags.units) sections.push(`<p><strong>Units (${course.units.length})</strong></p>${course.units.length ? `<ol>${course.units.map((unit) => `<li><strong>Unit ${escapeHtml(unit.number)}:</strong> ${escapeHtml(unit.title)}</li>`).join("")}</ol>` : "<p>No units are listed.</p>"}`);
  if (flags.outcomes) sections.push(`<p><strong>Course outcomes (${course.outcomes.length})</strong></p>${course.outcomes.length ? `<ol>${course.outcomes.map((outcome) => `<li>${escapeHtml(outcome)}</li>`).join("")}</ol>` : "<p>No outcomes are listed.</p>"}`);
  if (flags.labs) sections.push(`<p><strong>Laboratory work (${course.laboratoryWork?.length || 0})</strong></p>${course.laboratoryWork?.length ? `<ol>${course.laboratoryWork.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : "<p>No numbered laboratory experiments are listed.</p>"}`);
  if (flags.textbooks) sections.push(`<p><strong>Textbooks (${course.textBooks?.length || 0})</strong></p>${course.textBooks?.length ? `<ol>${course.textBooks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : "<p>No textbooks are listed.</p>"}`);
  if (flags.references) sections.push(`<p><strong>Reference books (${course.referenceBooks?.length || 0})</strong></p>${course.referenceBooks?.length ? `<ol>${course.referenceBooks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : "<p>No reference books are listed.</p>"}`);
  return `<p><strong><u>${escapeHtml(course.title)} · Requested syllabus details</u></strong></p>${sections.join("")}<p class="answer-source">Official GNDEC syllabus.</p>`;
}

function answerAcademicScopeQuestion(question) {
  const q = canonicalTimetableQuestion(question);
  const asksSubjects = /subjects?|courses?|papers?|vishay|विषय|ਵਿਸ਼ੇ/.test(q);
  const asksForList = /list|show|name|which|what|tell|have|there|all|kehde|kaun|kinne|कौन|ਕਿਹੜੇ/.test(q);
  if (!asksSubjects || !asksForList) return "";

  const firstYear = /(?:first|1st)\s*year|year\s*(?:one|1)|pehl[ae]\s+saal|pahla\s+saal|पहले\s+साल|ਪਹਿਲੇ\s+ਸਾਲ/.test(q);
  if (firstYear && state.syllabus.length) {
    const answer = syllabusCourseListAnswer();
    return answer.replace("</u></strong></p>", "</u></strong></p><p>This first-year scheme is <strong>common for all branches</strong>.</p>");
  }

  const semesterOrBranch = /(?:first|1st)\s*(?:semester|sem)|(?:semester|sem)\s*(?:one|1)|current\s*(?:semester|sem)|this\s*(?:semester|sem)|my\s+(?:branch|section)|(?:ece|ecb1?)\s+branch|pehl[ae]\s+(?:semester|sem)|पहले\s+सेमेस्टर|ਪਹਿਲੇ\s+ਸਮੈਸਟਰ/.test(q);
  if (!semesterOrBranch || !state.selectedGroup) return "";
  const classes = DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day));
  const subjects = [...new Set(classes.map((item) => item.subject).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  if (!subjects.length) return "";
  const profile = activeStudentProfile();
  const label = activeTimetableLabel();
  const branch = profile.branch ? `<p>Saved branch: <strong>${escapeHtml(profile.branch)}</strong>.</p>` : "";
  return `<p><strong><u>Subjects currently listed for ${escapeHtml(label)} (${subjects.length})</u></strong></p>${branch}<ol>${subjects.map((subject) => `<li><strong>${escapeHtml(subject)}</strong></li>`).join("")}</ol><p class="answer-source">Official GNDEC weekly timetable for the active section and subsection.</p>`;
}

function answerSyllabusFollowup(question) {
  const q = canonicalTimetableQuestion(question);
  const context = state.syllabusConversation;
  if (!context || !state.syllabus.length) return "";
  const asksList = /^(?:list|show|name|tell)\s*(?:them|all|subjects?|courses?)\b|(?:list|show|name)\s+(?:them|all)|which\s+(?:subjects?|courses?)\b/.test(q);
  const explicitlyListsSubjects = /(?:list|show|name)\s+(?:all\s+)?(?:official\s+)?(?:subjects?|courses?)\b|which\s+(?:subjects?|courses?)\b/.test(q);
  const asksUnits = /(?:its?|the)\s*(?:units?|chapters?|topics?)\b|^(?:units?|chapters?|topics?)\b/.test(q);
  const asksOutcomes = /(?:its?|the)\s*(?:course\s*)?outcomes?\b|^(?:course\s*)?outcomes?\b|\bco\b/.test(q);
  const asksDetails = /(?:its?|the)\s*(?:code|credits?|semester|marks?|duration|prerequisites?)\b|^(?:code|credits?|semester|marks?|duration|prerequisites?)\b|additional\s*material|calculator/.test(q);
  const asksBooks = /(?:its?|the)\s*(?:text\s*books?|books?|references?)\b|^(?:text\s*books?|books?|references?)\b/.test(q);
  const asksLaboratory = /\b(?:labs?|laboratory|experiments?|practicals?)\b/.test(q);

  if (explicitlyListsSubjects) return syllabusCourseListAnswer();
  if (context.kind === "course" && context.courseCodes?.length && (asksList || asksUnits || asksOutcomes || asksDetails || asksBooks || asksLaboratory)) {
    const course = state.syllabus.find((item) => context.courseCodes.includes(item.code));
    if (!course) return "";
    const composite = syllabusCompositeAnswer(course, q);
    if (composite) return composite;
    const specificUnit = syllabusSpecificUnitAnswer(course, q);
    if (specificUnit) return specificUnit;
    const specificOutcome = syllabusSpecificOutcomeAnswer(course, q);
    if (specificOutcome) return specificOutcome;
    const assessment = syllabusAssessmentAnswer(course, q);
    if (assessment) return assessment;
    const laboratory = syllabusLaboratoryAnswer(course, q);
    if (laboratory) return laboratory;
    const summary = `<p><strong><u>${escapeHtml(course.title)}</u></strong></p><p>Course code: <strong>${escapeHtml(course.code)}</strong>${course.semester ? ` · Semester: ${escapeHtml(course.semester)}` : ""}${course.credits ? ` · ${escapeHtml(course.credits)} credits` : ""}</p>`;
    if (asksOutcomes) return `${summary}${course.outcomes.length ? `<ol>${course.outcomes.map((outcome) => `<li>${escapeHtml(outcome)}</li>`).join("")}</ol>` : "<p>Course outcomes are not listed in this source.</p>"}<p class="answer-source">Official GNDEC syllabus.</p>`;
    if (asksBooks) return syllabusBooksAnswer(course, /references?/.test(q));
    if (asksDetails) return `${summary}<p class="answer-source">Official GNDEC syllabus.</p>`;
    return `<p><strong><u>${escapeHtml(course.title)} units</u></strong></p><ol>${course.units.map((unit) => `<li><strong>Unit ${escapeHtml(unit.number)}:</strong> ${escapeHtml(unit.title)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC syllabus.</p>`;
  }
  if (asksList) return syllabusCourseListAnswer();
  return "";
}

function contextualLocalFollowupAnswer(question) {
  const syllabusAnswer = answerSyllabusFollowup(question);
  return syllabusAnswer ? `${syllabusAnswer}${followupSuggestions(question)}` : "";
}

function answerSyllabusQuestion(question) {
  const courses = syllabusCoursesForQuestion(question);
  const q = canonicalTimetableQuestion(question);
  const asksCount = /total|how\s+many|kitne|kinne|count/.test(q);
  const asksUnitCount = asksCount && /units?|chapters?/.test(q);
  const asksSubjectCount = asksCount && /subjects?|courses?/.test(q);
  const asksList = /(?:list|show|name)\s*(?:all\s*)?(?:subjects?|courses?)|(?:subjects?|courses?)\s*(?:list|names?)|which\s+(?:subjects?|courses?)/.test(q);
  if (asksList && !courses.length) return syllabusCourseListAnswer();
  if (asksUnitCount || asksSubjectCount) {
    const lines = [];
    if (asksUnitCount && courses.length) lines.push(...courses.map((course) => `<li><strong>${escapeHtml(course.title)}:</strong> ${course.units.length} unit${course.units.length === 1 ? "" : "s"}</li>`));
    if (asksUnitCount && !courses.length) lines.push(`<li><strong>Total units across all official subjects:</strong> ${state.syllabus.reduce((sum, course) => sum + course.units.length, 0)}</li>`);
    if (asksSubjectCount) lines.push(`<li><strong>Total official subjects:</strong> ${state.syllabus.length}</li>`);
    if (lines.length) {
      rememberSyllabusConversation(asksSubjectCount ? "subjects" : "course", courses);
      return `<p><strong><u>Official syllabus summary</u></strong></p><ul>${lines.join("")}</ul>${asksSubjectCount ? '<p class="kb-tip">Say “list them” to see all subject names.</p>' : ""}<p class="answer-source">Official GNDEC syllabus · all ${state.syllabusPages.length || 33} pages searched locally.</p>`;
    }
  }
  if (!courses.length) return answerSyllabusPageSearch(question);
  if (courses.length > 1) {
    rememberSyllabusConversation("course", courses);
    return `<p><strong><u>Requested official syllabus subjects</u></strong></p>${courses.map((item) => `<section><p><strong>${escapeHtml(item.title)}</strong> · ${escapeHtml(item.code)}${item.credits ? ` · ${escapeHtml(item.credits)} credits` : ""}</p>${item.units.length ? `<ol>${item.units.map((unit) => `<li><strong>Unit ${escapeHtml(unit.number)}:</strong> ${escapeHtml(unit.title)}</li>`).join("")}</ol>` : "<p>No units are listed.</p>"}</section>`).join("")}<p class="answer-source">Official GNDEC syllabus.</p>`;
  }
  const course = courses[0];
  const composite = syllabusCompositeAnswer(course, q);
  if (composite) {
    rememberSyllabusConversation("course", [course]);
    return composite;
  }
  const specificUnit = syllabusSpecificUnitAnswer(course, q);
  if (specificUnit) {
    rememberSyllabusConversation("course", [course]);
    return specificUnit;
  }
  const specificOutcome = syllabusSpecificOutcomeAnswer(course, q);
  if (specificOutcome) {
    rememberSyllabusConversation("course", [course]);
    return specificOutcome;
  }
  const assessment = syllabusAssessmentAnswer(course, q);
  if (assessment) {
    rememberSyllabusConversation("course", [course]);
    return assessment;
  }
  const laboratory = syllabusLaboratoryAnswer(course, q);
  if (laboratory) {
    rememberSyllabusConversation("course", [course]);
    return laboratory;
  }
  const asksOutcomes = /outcomes?|co\b/.test(q);
  const asksUnits = /units?|chapters?|topics?|contents?/.test(q);
  const asksBooks = /text\s*books?|books?|references?/.test(q);
  rememberSyllabusConversation("course", [course]);
  const summary = `<p><strong><u>${escapeHtml(course.title)}</u></strong></p><p>Course code: <strong>${escapeHtml(course.code)}</strong>${course.semester ? ` · Semester: ${escapeHtml(course.semester)}` : ""}${course.credits ? ` · ${escapeHtml(course.credits)}` : ""}</p>`;
  if (asksOutcomes) return `${summary}${course.outcomes.length ? `<ol>${course.outcomes.map((outcome) => `<li>${escapeHtml(outcome)}</li>`).join("")}</ol>` : "<p>Course outcomes are not listed in this source.</p>"}<p class="answer-source">Official GNDEC syllabus.</p>`;
  if (asksBooks) return syllabusBooksAnswer(course, /references?/.test(q));
  if (asksUnits || /syllabus|study\s*scheme/.test(q)) return `${summary}${course.units.length ? `<ol>${course.units.map((unit) => `<li><strong>Unit ${escapeHtml(unit.number)}:</strong> ${escapeHtml(unit.title)}</li>`).join("")}</ol>` : "<p>Units are not listed in this source.</p>"}<p class="answer-source">Official GNDEC syllabus.</p>`;
  return `${summary}<p class="answer-source">Official GNDEC syllabus.</p>`;
}

function timetableUpdateAnswer() {
  const update = state.timetableUpdate;
  if (!update?.id || !Array.isArray(update.changes) || !update.changes.length) return "<p><strong><u>No saved timetable change comparison.</u></strong></p><p>Compass stores a comparison only after this device receives two different verified GNDEC timetable releases. When a future release changes, open Settings → What changed? to compare it with the prior verified release.</p>";
  const groupLabel = update.selectedAffected && update.selectedGroup
    ? `Your selected group (${[update.selectedGroup, update.selectedSubgroup].filter(Boolean).join(" / ")}) is affected.`
    : `Affected group${update.totalAffectedGroups === 1 ? "" : "s"}: ${(update.affectedGroups || []).join(", ") || "shown below"}.`;
  const source = update.sourceUrl ? `<p><a class="reference-link" href="${escapeHtml(update.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open the official timetable release</a></p>` : "";
  return `<p><strong><u>New timetable detected</u></strong></p><p>${escapeHtml(groupLabel)} ${update.totalChanges || update.changes.length} verified class change${(update.totalChanges || update.changes.length) === 1 ? "" : "s"} found.</p><p><strong>FET footer:</strong> ${escapeHtml(update.oldFooter || "Not published")} → ${escapeHtml(update.newFooter || "Not published")}</p><ul>${update.changes.slice(0, 8).map((change) => {
    const before = change.before || {}; const after = change.after || {}; const current = after.subject ? after : before;
    const label = `${change.group} · ${change.day} ${humanTime(change.start)} · ${current.subject || "Class"}`;
    const detail = change.kind === "changed" ? (change.fields || []).map((field) => `${field}: ${before[field] || "Not listed"} → ${after[field] || "Not listed"}`).join("; ") : change.kind;
    return `<li><strong>${escapeHtml(label)}</strong>${detail ? ` — ${escapeHtml(detail)}` : ""}</li>`;
  }).join("")}</ul>${source}<p class="answer-source">Compared locally from two verified GNDEC timetable releases saved on this device.</p>`;
}

function tomorrowSimpleCardAnswer() {
  if (!state.schedule.length || !state.selectedGroup) return "";
  const tomorrow = indiaCalendarDate(1);
  const classes = classFor(state.selectedGroup, tomorrow.day);
  if (!classes.length) return `<p><strong><u>Tomorrow · ${escapeHtml(tomorrow.compactLabel)}</u></strong></p><p>No classes are listed in the verified weekly timetable for ${escapeHtml(activeTimetableLabel())}.</p><p class="answer-source">Official GNDEC weekly timetable. A date-specific notice can override a regular week, so Compass does not guess one.</p>`;
  return `<p><strong><u>Tomorrow · ${escapeHtml(tomorrow.compactLabel)}</u></strong></p><div class="answer-day-card">${classes.map((item) => `<p><strong>${humanTime(item.start)}-${humanTime(item.end)}</strong><br />${escapeHtml(item.subject)}<br /><span>${escapeHtml(item.room)} · ${escapeHtml(item.teacher)}</span></p>`).join("")}</div><p class="answer-source">Official GNDEC weekly timetable.</p>`;
}

function nextFreePeriodAdviceAnswer() {
  if (!state.schedule.length || !state.selectedGroup) return "";
  const now = getIndiaNow();
  const todayFree = officialFreeLectureSlots(classFor(state.selectedGroup, now.day));
  const currentOrNextFree = todayFree.find((slot) => slot.end > now.minutes);
  if (!currentOrNextFree) return `<p><strong><u>No remaining verified free lecture today.</u></strong></p><p>Use the next class break for water, food, or a short walk. Ask “Free lectures tomorrow” to see tomorrow’s exact open slots.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
  const remaining = currentOrNextFree.start <= now.minutes ? currentOrNextFree.end - now.minutes : currentOrNextFree.end - currentOrNextFree.start;
  const available = Math.max(0, remaining);
  const action = available >= 45
    ? "Use 5 minutes to choose one syllabus unit, 25 minutes for focused study, 10 minutes for recall questions, then 5 minutes to pack for the next class."
    : `You have about ${available} minutes. Review today’s notes, make three recall questions, then get ready for the next class.`;
  return `<p><strong><u>Your next free timetable slot</u></strong></p><p><strong>${escapeHtml(now.day)} · ${humanTime(Math.max(now.minutes, currentOrNextFree.start))}-${humanTime(currentOrNextFree.end)}</strong></p><p>${escapeHtml(action)}</p><p class="answer-source">Time window from the official GNDEC timetable; study advice is general guidance.</p>`;
}

function fortyFiveMinutePlanAnswer() {
  if (!state.schedule.length || !state.selectedGroup) return "";
  const { now, day, next } = currentAndNext();
  if (!next) return "<p><strong><u>No next class is listed.</u></strong></p><p>Compass cannot safely make a before-class plan without a verified next timetable entry.</p>";
  const timeUntil = day === now.day ? next.start - now.minutes : 45;
  const fits = timeUntil >= 45;
  const target = `${next.subject} · ${humanTime(next.start)} · ${next.room}`;
  return `<p><strong><u>${fits ? "45-minute plan before your next class" : "Short plan before your next class"}</u></strong></p><p>Your next verified class is <strong>${escapeHtml(target)}</strong>.</p><ol>${fits
    ? "<li>5 min: choose one small topic or syllabus unit.</li><li>25 min: study without notifications.</li><li>10 min: write five recall questions or solve one problem.</li><li>5 min: pack up and leave for the room.</li>"
    : `<li>Use the available ${Math.max(0, timeUntil)} minutes to review notes from the last class.</li><li>Write three recall questions.</li><li>Leave a few minutes early for ${escapeHtml(next.room)}.</li>`
  }</ol><p class="answer-source">Next-class time and room from the official GNDEC timetable; the study steps are general guidance.</p>`;
}

function sameBuildingTodayAnswer() {
  if (!state.schedule.length || !state.selectedGroup) return "";
  const now = getIndiaNow();
  const classes = classFor(state.selectedGroup, now.day);
  if (!classes.length) return `<p><strong><u>No classes are listed for ${escapeHtml(now.day)}.</u></strong></p><p class="answer-source">Official GNDEC weekly timetable.</p>`;
  const kernel = globalThis.CompassBrainKernel;
  const grouped = new Map();
  const unmatched = [];
  classes.forEach((item) => {
    const roomInfo = kernel?.lookupCampusRoom?.(item.room);
    const building = cleanText(roomInfo?.block || "");
    if (!building) { unmatched.push(item); return; }
    grouped.set(building, [...(grouped.get(building) || []), item]);
  });
  const groups = [...grouped.entries()].filter(([, entries]) => entries.length > 1);
  if (!groups.length) return `<p><strong><u>No verified same-building grouping is available for ${escapeHtml(now.day)}.</u></strong></p><p>The official timetable publishes these room labels: ${escapeHtml([...new Set(classes.map((item) => item.room))].join(", "))}. Compass will not infer a building when the local verified room directory has no match.</p><p class="answer-source">Official GNDEC timetable and verified local room directory.</p>`;
  return `<p><strong><u>Classes in the same verified building today</u></strong></p>${groups.map(([building, entries]) => `<p><strong>${escapeHtml(building)}</strong><br />${entries.map((item) => `${humanTime(item.start)} ${escapeHtml(item.subject)} (${escapeHtml(item.room)})`).join(" · ")}</p>`).join("")}${unmatched.length ? `<p class="kb-tip">${unmatched.length} class${unmatched.length === 1 ? "" : "es"} use room labels without a verified building match, so they are not grouped.</p>` : ""}<p class="answer-source">Official GNDEC timetable and verified local room directory.</p>`;
}

function tomorrowNeedsAnswer() {
  if (!state.schedule.length || !state.selectedGroup) return "";
  const tomorrow = indiaCalendarDate(1);
  const classes = classFor(state.selectedGroup, tomorrow.day);
  const calendarUrl = state.sourceRegistry?.academicCalendarSource?.url || "https://gndec.ac.in/?q=node/23";
  const classList = classes.length
    ? `<ul>${classes.map((item) => `<li><strong>${humanTime(item.start)}:</strong> ${escapeHtml(item.subject)} · ${escapeHtml(item.room)}</li>`).join("")}</ul>`
    : "<p>No regular weekly classes are listed for tomorrow.</p>";
  return `<p><strong><u>What you need for tomorrow · ${escapeHtml(tomorrow.compactLabel)}</u></strong></p>${classList}<p>Bring the material your teacher has instructed for each listed class. Compass has not inferred materials or a special-day cancellation.</p><p><a class="reference-link" href="${escapeHtml(calendarUrl)}" target="_blank" rel="noopener noreferrer">Open the current official academic calendar</a></p><p class="answer-source">Official GNDEC weekly timetable and current academic-calendar link only.</p>`;
}

function nextClassSyllabusBriefAnswer(question) {
  if (!state.schedule.length || !state.selectedGroup) return "";
  const referenced = findReferencedClass(question);
  const item = referenced || currentAndNext().current || currentAndNext().next;
  if (!item) return "";
  const course = state.syllabus.length ? syllabusCoursesForQuestion(item.subject)[0] : null;
  const syllabus = course
    ? (course.units.length ? `<p><strong>Official syllabus unit 1:</strong> ${escapeHtml(course.units[0].title)}</p>` : `<p>The loaded official syllabus has no unit list for ${escapeHtml(course.title)}.</p>`)
    : "<p>The matching official syllabus unit is not loaded yet, so Compass will not guess one. Ask this again after the syllabus finishes loading.</p>";
  return `<p><strong><u>${escapeHtml(item.subject)} · class brief</u></strong></p><p><strong>When:</strong> ${escapeHtml(item.day)} ${humanTime(item.start)}-${humanTime(item.end)}<br /><strong>Room:</strong> ${escapeHtml(item.room)}<br /><strong>Teacher:</strong> ${escapeHtml(item.teacher)}</p>${syllabus}<p class="answer-source">Class facts from the official GNDEC timetable${course ? "; syllabus unit from the official GNDEC syllabus" : ""}.</p>`;
}

function officialSourcesUsedAnswer() {
  const groupSource = (state.sourceRegistry?.sources || []).find((source) => source.id === "groups");
  const calendar = state.sourceRegistry?.academicCalendarSource;
  return `<p><strong><u>How Compass labels sources</u></strong></p><ul><li><strong>Timetable answers:</strong> the active official GNDEC group/subgroup timetable${groupSource?.url ? ` · <a class="reference-link" href="${escapeHtml(groupSource.url)}" target="_blank" rel="noopener noreferrer">open current source</a>` : ""}</li><li><strong>Profile answers:</strong> the current branch roster for this device</li><li><strong>Syllabus answers:</strong> the official first-year syllabus PDF</li><li><strong>Calendar answers:</strong> ${calendar?.url ? `<a class="reference-link" href="${escapeHtml(calendar.url)}" target="_blank" rel="noopener noreferrer">current official academic calendar</a>` : "the verified academic-calendar link"}</li><li><strong>General advice:</strong> clearly labelled Compass guidance, not an official college fact</li></ul><p>Every factual response names its source at the bottom; Compass does not blend source types silently.</p>`;
}

function timetableVerificationAnswer(question = "") {
  const q = canonicalTimetableQuestion(question);
  if (!/(?:is|are|check|confirm|verify).*(?:my|the)?\s*(?:time\s*table|timetable|official\s+data).*(?:verified|official|real|latest)|\b(?:verified|official)\s+(?:timetable|time\s*table)\b/.test(q)) return "";
  if (!state.schedule.length || !state.selectedGroup) return "<p><strong><u>No timetable is loaded yet.</u></strong></p><p>Compass cannot call a timetable verified until it has loaded an official GNDEC source for your selected group.</p>";
  const sources = Array.isArray(state.sourceRegistry?.sources) ? state.sourceRegistry.sources : [];
  const activeSource = sources.find((source) => source.id === "groups") || null;
  const footer = cleanText(state.metadata?.sourceFooter || activeSource?.sourceFooter || "").slice(0, 100);
  const version = cleanText(state.metadata?.version || state.sourceRegistry?.version || "Not published");
  const fallback = state.metadata?.fallback;
  if (fallback) return `<p><strong><u>Not the newest verified release yet.</u></strong></p><p>Compass is temporarily showing the previous verified timetable (${escapeHtml(fallback.version || "version not published")}) because the newer official file could not be read. It will retry automatically and will not present the fallback as current.</p><p class="answer-source">Previous verified GNDEC timetable.</p>`;
  if (!activeSource?.verified) return "<p><strong><u>Verification is still pending.</u></strong></p><p>The timetable is loaded on this device, but Compass does not yet have a verified current GNDEC group-timetable source. Refresh official data before relying on it.</p>";
  const checkedAt = state.sourceRegistry?.checkedAt ? new Date(state.sourceRegistry.checkedAt) : null;
  const checked = checkedAt && !Number.isNaN(checkedAt.valueOf())
    ? `<br /><strong>Official links checked:</strong> ${escapeHtml(new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(checkedAt))} IST`
    : "";
  const sourceLink = activeSource.url ? `<p><a class="reference-link" href="${escapeHtml(activeSource.url)}" target="_blank" rel="noopener noreferrer">Open the verified official timetable</a></p>` : "";
  return `<p><strong><u>Yes — your selected ${escapeHtml(activeTimetableLabel())} timetable is verified.</u></strong></p><p><strong>Official effective date:</strong> ${escapeHtml(version)}${footer ? `<br /><strong>FET file footer:</strong> ${escapeHtml(footer)}` : ""}${checked}</p>${sourceLink}<p class="answer-source">Official GNDEC group timetable; Compass did not substitute a weekly view for a verification result.</p>`;
}

// A named-person schedule is deliberately separate from the active device
// profile. The name is first resolved against a current official roster or
// official faculty timetable; only then may it select a section/subsection.
function namedPersonTimetableRequest(question = "") {
  const q = canonicalTimetableQuestion(question);
  const asksTimetable = /\b(?:time\s*table|timetable|schedule|class(?:es)?|lectures?|periods?)\b/.test(q);
  if (isTimetableComparisonQuestion(q)) return null;
  if (!asksTimetable || requestedTimetableSelection(q)) return null;
  const teacherCue = /\b(?:teacher|faculty|prof(?:essor)?|dr\.?|doctor|instructor)\b/.test(q);
  const friendCue = /\b(?:friend|classmate|batchmate|peer|student)\b/.test(q);
  const refersToOwnTimetable = /\b(?:my|mine|mera|meri|mere)\b/.test(q) && !friendCue;
  if (refersToOwnTimetable) return null;
  const ignored = new Set(["a", "after", "afternoon", "am", "an", "and", "are", "around", "as", "at", "before", "between", "can", "check", "class", "classes", "current", "day", "does", "do", "doctor", "dr", "duration", "earlier", "evening", "faculty", "first", "for", "free", "friend", "from", "give", "had", "has", "have", "her", "his", "how", "i", "instructor", "is", "its", "last", "later", "latest", "lecture", "lectures", "many", "me", "mine", "morning", "most", "my", "new", "next", "night", "of", "official", "on", "or", "parso", "parson", "period", "periods", "please", "pm", "prof", "professor", "schedule", "shanivar", "show", "student", "table", "teacher", "tell", "that", "the", "their", "this", "time", "timetabel", "timetble", "timetabl", "timetable", "to", "today", "tomorrow", "total", "until", "update", "updated", "verified", "week", "what", "when", "which", "who", "with", "your", "aaj", "ajj", "batao", "kal", "kalle", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  (globalThis.CompassBrainKernel?.MONTH_NAMES || ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]).forEach((month) => ignored.add(String(month).toLowerCase()));
  const selectionCodes = new Set([
    ...state.schedule.map((item) => String(item.group || "").toUpperCase()),
    ...state.schedule.flatMap((item) => cohortTokens(item.cohorts || ""))
  ]);
  const words = normalizeStudentName(q).split(/\s+/).filter((word) => {
    const resemblesWeekday = DAY_NAMES.some((day) => editDistance(word, day.toLowerCase()) <= 2);
    return /^[a-z][a-z-]{2,29}$/.test(word) && !ignored.has(word) && !resemblesWeekday && !selectionCodes.has(word.toUpperCase());
  });
  if (!words.length) return null;
  const referenced = findReferencedClasses(q);
  const hasKnownTimetableReference = referenced.some((item) => {
    const entityWords = normalizeStudentName(`${item.subject || ""} ${item.teacher || ""}`).split(/\s+/).filter((word) => word.length >= 3);
    return words.some((word) => entityWords.some((entity) => entity === word || entity.startsWith(word) || word.startsWith(entity) || editDistance(entity, word) <= (Math.max(entity.length, word.length) >= 8 ? 2 : 1)));
  });
  const term = [...new Set(words)].slice(0, 4).join(" ");
  if (!looksLikePlainStudentNameQuery(term)) return null;
  // A full person name is more specific than a coincidental timetable word
  // (for example a weekday embedded in a course title). One-word subject
  // fragments still stay on the timetable route.
  if (hasKnownTimetableReference && !teacherCue && words.length < 2) return null;
  const activeName = normalizeStudentName(activeStudentProfile()?.name || "");
  if (activeName && (term === activeName || activeName.includes(term) || term.includes(activeName))) return null;
  const dateRequest = requestedTimetableDate(q);
  const day = requestedWeekday(q) || dateRequest?.day || "";
  return {
    term,
    label: term.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
    day,
    dateIso: dateRequest?.iso || "",
    teacherCue,
    window: requestedTimetableWindow(q)
  };
}

function timetablePersonCaption(term = "", schedule = []) {
  const wanted = canonicalFacultyName(term);
  const captions = [...new Set((Array.isArray(schedule) ? schedule : []).map((item) => cleanText(item.group)).filter(Boolean))];
  if (!wanted || !captions.length) return { status: "none", captions: [] };
  const exact = captions.filter((caption) => canonicalFacultyName(caption) === wanted);
  const wantedWords = wanted.split(/\s+/).filter((word) => word.length >= 3);
  const contained = captions.filter((caption) => {
    const candidate = canonicalFacultyName(caption);
    return wantedWords.length && wantedWords.every((word) => candidate === word || candidate.split(/\s+/).some((part) => part === word || part.startsWith(word) || word.startsWith(part)));
  });
  const matches = [...new Set(exact.length ? exact : contained)];
  return { status: matches.length === 1 ? "single" : matches.length > 1 ? "multiple" : "none", captions: matches };
}

function readOnlyStudentTimetableAnswer(request, lookup) {
  if (!lookup?.handled) return "";
  if (lookup.status === "error") return `<p><strong><u>Official roster lookup is unavailable.</u></strong></p><p>I will not substitute your active timetable for ${escapeHtml(request.label)}. Please try again when the official roster can be read.</p>`;
  if (lookup.status === "multiple") return `<p><strong><u>More than one official roster match was found for ${escapeHtml(request.label)}.</u></strong></p><p>Please provide the student’s exact CRN or registration number. Compass will not guess a section/subsection or show your own timetable.</p>`;
  if (lookup.status !== "single" || !lookup.records?.[0]) return "";
  const record = lookup.records[0];
  const group = cleanText(record.section).toUpperCase();
  const subgroup = cleanText(record.subsection).toUpperCase();
  if (!group || !subgroup) return `<p><strong><u>${escapeHtml(record.name || request.label)} has no verified section/subsection in the current roster.</u></strong></p><p>Compass will not infer a timetable from incomplete roster data.</p>`;
  const calendarKernel = globalThis.CompassBrainKernel;
  const dateLabel = request.dateIso ? (calendarKernel?.formatIsoFull?.(request.dateIso) || request.dateIso) : "";
  const calendarHoliday = request.dateIso ? calendarKernel?.checkDateHoliday?.(request.dateIso) : null;
  if (calendarHoliday?.closed) {
    return `<p><strong><u>${escapeHtml(dateLabel)} is an official holiday.</u></strong></p><p><strong>${escapeHtml(calendarHoliday.name)}</strong> (${escapeHtml(calendarHoliday.type)}). Compass will not show a normal weekly timetable for that date.</p><p class="answer-source">Official GNDEC holiday calendar and current official roster; this did not change your profile.</p>`;
  }
  if (calendarHoliday && calendarKernel?.isHalfDayNotice?.(calendarHoliday)) {
    return `<p><strong><u>${escapeHtml(dateLabel)} has a GNDEC second-half-day notice.</u></strong></p><p>${escapeHtml(calendarHoliday.name)} is not a full-day closure. Compass will not guess which individual classes change; check the GNDEC notice.</p><p class="answer-source">Official GNDEC holiday calendar and current official roster; this did not change your profile.</p>`;
  }
  const days = request.day ? [request.day] : request.window ? [getIndiaNow().day] : DAY_NAMES;
  const entries = days.flatMap((day) => classFor(group, day, subgroup));
  const scopedDay = request.day || (request.window ? getIndiaNow().day : "");
  const heading = `${record.name || request.label} · ${subgroup}${scopedDay ? ` · ${scopedDay}` : " timetable"}`;
  const dateNote = request.dateIso ? `<p class="kb-tip">Weekly timetable view for ${escapeHtml(dateLabel)}. Date-specific notices can override it.</p>` : "";
  const note = `<p class="answer-source">Read-only result: ${escapeHtml(subgroup)} came from the current official GNDEC roster (${escapeHtml(lookup.version || "current")}). It did not change your profile or selected timetable.</p>`;
  const answer = request.window ? timetableWindowAnswer(entries, heading, request.window) : scheduleAnswer(entries, heading);
  return `${answer}${dateNote}${note}`;
}

function readOnlyTeacherTimetableAnswer(request, match, schedule) {
  if (match?.status === "multiple") return `<p><strong><u>More than one faculty timetable matches ${escapeHtml(request.label)}.</u></strong></p><p>Please use the faculty member’s full official name. Compass will not guess a timetable.</p>`;
  if (match?.status !== "single" || !match.captions?.[0]) return "";
  const caption = match.captions[0];
  const day = request.day || (request.window ? getIndiaNow().day : "");
  const entries = (Array.isArray(schedule) ? schedule : []).filter((item) => item.group === caption && (!day || item.day === day));
  const heading = `${caption} · Faculty timetable${day ? ` · ${day}` : ""}`;
  const answer = request.window ? timetableWindowAnswer(entries, heading, request.window) : scheduleAnswer(entries, heading);
  return `${answer}<p class="answer-source">Read-only result from the current official GNDEC faculty timetable. It did not change your profile or selected timetable.</p>`;
}

// A comparison such as "Mohitveer Singh vs me tomorrow" is not a generic
// code comparison: resolve the named person from the current roster first,
// then compare two verified timetable codes. Neither lookup changes the
// active profile or timetable selection.
function namedPersonComparisonRequest(question = "") {
  const q = canonicalTimetableQuestion(question);
  if (!/\b(?:vs|versus)\b/.test(q)) return null;
  const parts = q.split(/\b(?:vs|versus)\b/).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const ownsPart = (part) => /\b(?:me|my|mine|mera|meri|mere|apna|apni)\b/.test(part);
  const leftOwn = ownsPart(parts[0]);
  const rightOwn = ownsPart(parts[1]);
  if (leftOwn === rightOwn) return null;
  const personPart = leftOwn ? parts[1] : parts[0];
  const person = namedPersonTimetableRequest(`${personPart} timetable`);
  if (!person || person.teacherCue) return null;
  const dateRequest = requestedTimetableDate(q);
  return {
    person: { ...person, day: requestedWeekday(q) || dateRequest?.day || person.day, dateIso: dateRequest?.iso || person.dateIso },
    personOnLeft: !leftOwn
  };
}

async function resolveNamedPersonComparisonAnswer(question = "") {
  const request = namedPersonComparisonRequest(question);
  if (!request) return "";
  const profile = activeStudentProfile();
  const ownGroup = cleanText(state.selectedGroup).toUpperCase();
  const ownSubgroup = cleanText(state.selectedSubgroup).toUpperCase();
  if (!hasStudentProfile() || !ownGroup || !ownSubgroup || !profileMatchesTimetableSelection(profile, ownGroup, ownSubgroup)) {
    return "<p><strong><u>Set your verified timetable first.</u></strong></p><p>Compass needs your active profile and selected subsection to understand “me”. It will not guess your timetable.</p>";
  }
  let lookup;
  try {
    const rosterData = await loadCurrentRosterRecords();
    lookup = studentLookupContextFromRecords(`find student ${request.person.term}`, rosterData.records, rosterData);
  } catch {
    return `<p><strong><u>Official roster lookup is unavailable.</u></strong></p><p>I cannot verify ${escapeHtml(request.person.label)}'s subsection, so I will not compare it with your timetable.</p>`;
  }
  if (lookup?.status === "multiple") return `<p><strong><u>More than one official roster match was found for ${escapeHtml(request.person.label)}.</u></strong></p><p>Use the student's CRN or full verified name. Compass will not choose a subsection silently.</p>`;
  if (lookup?.status !== "single" || !lookup.records?.[0]) return `<p><strong><u>No verified student match was found for ${escapeHtml(request.person.label)}.</u></strong></p><p>Check the spelling or use a student CRN. Compass will not compare your timetable with an unverified person.</p>`;
  const record = lookup.records[0];
  const personCode = cleanText(record.subsection || record.section).toUpperCase();
  const ownCode = ownSubgroup || ownGroup;
  if (!personCode) return `<p><strong><u>${escapeHtml(record.name || request.person.label)} has no verified timetable subsection.</u></strong></p><p>Compass will not infer one from a name.</p>`;
  const leftCode = request.personOnLeft ? personCode : ownCode;
  const rightCode = request.personOnLeft ? ownCode : personCode;
  const comparisonQuestion = `${leftCode} vs ${rightCode}${request.person.day ? ` ${request.person.day}` : ""}`;
  const brainResult = runCompassBrain(comparisonQuestion);
  if (!brainResult?.answer) return "<p><strong><u>Verified timetable comparison is unavailable.</u></strong></p><p>Please try again after the current official timetable finishes loading.</p>";
  const leftLabel = request.personOnLeft ? `${record.name || request.person.label} (${personCode})` : `Your ${ownCode}`;
  const rightLabel = request.personOnLeft ? `your ${ownCode}` : `${record.name || request.person.label} (${personCode})`;
  const dateNote = request.person.dateIso ? `<p class="kb-tip">For ${escapeHtml(request.person.dateIso)}, date-specific GNDEC notices override the weekly timetable.</p>` : "";
  return `<p><strong>${escapeHtml(leftLabel)} vs ${escapeHtml(rightLabel)}</strong></p><p class="answer-source">Read-only comparison: ${escapeHtml(personCode)} came from the current official GNDEC roster (${escapeHtml(lookup.version || "current")}). Your profile and selected timetable were not changed.</p>${brainResult.answer}${dateNote}`;
}

async function resolveNamedPersonTimetableAnswer(question = "") {
  const request = namedPersonTimetableRequest(question);
  if (!request) return "";
  const teacherResult = async () => {
    try {
      const schedule = await loadOfficialTimetableView("teachers");
      return readOnlyTeacherTimetableAnswer(request, timetablePersonCaption(request.term, schedule), schedule);
    } catch { return ""; }
  };
  if (request.teacherCue) {
    const answer = await teacherResult();
    return answer || `<p><strong><u>No verified faculty timetable match was found for ${escapeHtml(request.label)}.</u></strong></p><p>Please use the faculty member’s full official name. Compass will not show your timetable as theirs.</p>`;
  }
  try {
    const rosterData = await loadCurrentRosterRecords();
    const lookup = studentLookupContextFromRecords(`find student ${request.term}`, rosterData.records, rosterData);
    const studentAnswer = readOnlyStudentTimetableAnswer(request, lookup);
    if (studentAnswer) return studentAnswer;
  } catch { /* Try the official faculty timetable below before failing safely. */ }
  const facultyAnswer = await teacherResult();
  if (facultyAnswer) return facultyAnswer;
  return `<p><strong><u>No verified student or faculty timetable match was found for ${escapeHtml(request.label)}.</u></strong></p><p>Please check the spelling or provide a student CRN. Compass will not substitute your active timetable.</p>`;
}

function namedStudentTimetableAnswer(question = "") {
  const q = canonicalTimetableQuestion(question);
  const asksTimetable = /\b(?:time\s*table|timetable|schedule|class(?:es)?|lectures?|periods?)\b/.test(q);
  if (!asksTimetable || requestedTimetableSelection(q)) return "";
  const friendCue = /\b(?:friend|classmate|batchmate|peer|student)\b/.test(q);
  const refersToOwnTimetable = /\b(?:my|mine|mera|meri|mere)\b/.test(q) && !friendCue;
  if (refersToOwnTimetable) return "";
  const ignored = new Set(["a", "an", "and", "are", "as", "at", "can", "check", "class", "classes", "day", "first", "last", "free", "morning", "for", "friend", "from", "give", "his", "her", "i", "is", "its", "lecture", "lectures", "me", "mine", "my", "of", "on", "or", "period", "periods", "please", "schedule", "show", "student", "table", "tell", "the", "their", "time", "timetable", "to", "today", "tomorrow", "week", "what", "when", "which", "who", "with", "your", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "official", "latest", "new", "update", "updated", "verified"]);
  const selectionCodes = new Set([
    ...state.schedule.map((item) => String(item.group || "").toUpperCase()),
    ...state.schedule.flatMap((item) => cohortTokens(item.cohorts || ""))
  ]);
  const words = normalizeStudentName(q).split(/\s+/).filter((word) => {
    const resemblesWeekday = DAY_NAMES.some((day) => editDistance(word, day.toLowerCase()) <= 2);
    return word.length >= 3 && !ignored.has(word) && !resemblesWeekday && !selectionCodes.has(word.toUpperCase());
  });
  if (!words.length) return "";
  // A verified subject or teacher in the active timetable is a timetable
  // query, not a person's name. Only inspect the non-day candidate words so
  // a subject title containing “Tuesday” cannot hide a named-student request.
  const referenced = findReferencedClasses(q);
  const hasKnownTimetableReference = referenced.some((item) => {
    const entityWords = normalizeStudentName(`${item.subject || ""} ${item.teacher || ""}`).split(/\s+/).filter((word) => word.length >= 3);
    return words.some((word) => entityWords.some((entity) => entity === word || entity.startsWith(word) || word.startsWith(entity) || editDistance(entity, word) <= (Math.max(entity.length, word.length) >= 8 ? 2 : 1)));
  });
  if (hasKnownTimetableReference) return "";
  const candidate = words.slice(0, 4).join(" ");
  if (!looksLikePlainStudentNameQuery(candidate)) return "";
  const activeName = normalizeStudentName(activeStudentProfile()?.name || "");
  if (activeName && (candidate === activeName || activeName.includes(candidate) || candidate.includes(activeName))) return "";
  return `<p><strong><u>I cannot verify ${escapeHtml(candidate)}’s timetable from a name alone.</u></strong></p><p>I will not show your active <strong>${escapeHtml(activeTimetableLabel())}</strong> timetable as another student’s timetable. Timetables are verified by the official section/subsection, not by a guessed name.</p><p>Ask your friend for their official code, then use a request such as <strong>“CSD2 Tuesday timetable”</strong>. That view will not change your saved profile or selected timetable.</p>`;
}

// These requested Compass workflows must always remain deterministic.  They
// run before either Brain path so a generic comparison or planning intent can
// never displace the verified update/source answer with an AI response.
function approvedCompassWorkflowAnswer(question) {
  const q = canonicalTimetableQuestion(question);
  const namedStudentAnswer = namedStudentTimetableAnswer(question);
  if (namedStudentAnswer) return namedStudentAnswer;
  const verificationAnswer = timetableVerificationAnswer(question);
  if (verificationAnswer) return verificationAnswer;
  if (/(?:what|which|show|tell|compare).*(?:changed|change|difference|diff).*(?:my|the)?\s*timetable|(?:timetable).*(?:changed|change|difference|diff)|compare.*(?:last|previous).*(?:verified|release|timetable)/.test(q)) return timetableUpdateAnswer();
  if (/(?:show|give|make).*(?:tomorrow|kal).*(?:simple|card)|(?:simple|card).*(?:tomorrow|kal).*(?:timetable|schedule|class)/.test(q)) return tomorrowSimpleCardAnswer();
  if (/(?:what|which).*(?:should|can).*(?:do|study).*(?:next)?\s*free\s*(?:period|lecture|slot)|next\s+free\s*(?:period|lecture|slot).*(?:do|study|suggest)/.test(q)) return nextFreePeriodAdviceAnswer();
  if (/(?:same|which).*(?:building|block).*(?:today|aaj|classes)|(?:classes).*(?:same).*(?:building|block)/.test(q)) return sameBuildingTodayAnswer();
  if (/45\s*(?:minute|min).*(?:study\s*)?plan|(?:study\s*)?plan.*45\s*(?:minute|min)|plan.*before.*next\s+class/.test(q)) return fortyFiveMinutePlanAnswer();
  if (/(?:what|which|show|all).*(?:official\s+)?sources?.*(?:used|use|answer)|(?:is|was).*(?:this|that).*(?:timetable|roster|syllabus|general\s+advice|source)/.test(q)) return officialSourcesUsedAnswer();
  if (/(?:what|do).*(?:need|prepare|bring).*(?:tomorrow|kal)|(?:tomorrow|kal).*(?:need|prepare|bring)/.test(q)) return tomorrowNeedsAnswer();
  if (/(?:explain|show|tell).*(?:next|upcoming).*(?:class).*(?:room|teacher|syllabus)|(?:next|upcoming).*(?:class).*(?:room|teacher).*(?:syllabus)/.test(q)) return nextClassSyllabusBriefAnswer(question);
  return "";
}

function answerCompassQuestion(question) {
  const workflowAnswer = approvedCompassWorkflowAnswer(question);
  if (workflowAnswer) return workflowAnswer;
  const q = canonicalTimetableQuestion(question);
  const now = getIndiaNow();
  const branchAnswer = engineeringBranchesAnswer(q);
  if (branchAnswer) return branchAnswer;
  if (/^(hi|hello|hey|namaste|sat sri akal|hlo|hola)\b/.test(q)) return "<p><strong>Hello!</strong> I can instantly check your timetable, rooms, teachers, profile, free periods, and first-year syllabus. What would you like to know?</p>";
  if (/thank|shukriya|dhanyavaad|thanks|thx/.test(q)) return "<p>You’re welcome. Ask whenever you need your next class, a room, a subject unit, or a quick plan.</p>";
  if (/what\s+(can|do)\s+you|how\s+can\s+you\s+help|help\s+me|features/.test(q)) return "<p><strong>Compass can help with:</strong></p><ul><li>today, tomorrow, week, next/current class, rooms, teachers, and free periods</li><li>your verified CRN, serial, section, subsection, mentor, and profile details</li><li>first-year syllabus units, outcomes, course codes, and credits</li><li>study help when a detailed explanation or plan is genuinely needed</li></ul><p>Try: “Math units”, “where is Physics?”, “my CRN”, or “my next class”.</p>";
  if (/how.*(?:set|find|change).*(?:group|section|profile)|(?:group|section).*(?:not|missing|wrong)/.test(q)) return "<p>Open <strong>Profile</strong>, then search using your name, CRN, registration number, or serial number. Choose the verified official match if needed. Your active profile stays only on this device.</p>";
  if (/(?:forget|forgot|reset|change).*(?:profile|name|registration|section)|(?:profile|section).*(?:change|wrong)/.test(q)) return "<p>Open <strong>Profile</strong> and run the verified profile lookup again using your name, CRN, registration number, or serial number. Selecting a current official record updates only this device.</p>";
  const sourceFooter = cleanText(state.metadata?.sourceFooter || currentTimetableSourceFooter()).slice(0, 100);
  if (/(?:when|what).*(?:timetable|official\s+source).*(?:generated|generation|footer|date|time)|(?:timetable|official\s+source).*(?:generated|generation|footer)/.test(q)) return `<p><strong><u>Current official timetable source</u></strong></p><p><strong>Effective from:</strong> ${escapeHtml(state.metadata?.version || state.sourceRegistry?.version || "Not published in the loaded registry")}</p>${sourceFooter ? `<p><strong>FET file footer:</strong> ${escapeHtml(sourceFooter)}</p><p class="answer-source">Copied exactly from the official published timetable file; its numeric date format is left unchanged.</p>` : "<p>The loaded official file does not publish a FET generation footer. Compass is showing the official effective date and verification time instead.</p>"}`;
  if (/(?:is|are).*(?:my|the)?\s*(?:timetable|official\s+data).*(?:verified)|\bverified\s+(?:timetable|data)\b/.test(q)) return `<p><strong>${state.sourceRegistry?.sources?.every((source) => source.verified) ? "Yes — the currently loaded timetable views are verified against official GNDEC sources." : "Compass is still checking the official timetable sources."}</strong></p><p><strong>Effective from:</strong> ${escapeHtml(state.metadata?.version || state.sourceRegistry?.version || "Not available")}</p><p class="answer-source">${escapeHtml(state.metadata?.source || "Official GNDEC timetable")}.</p>`;
  if (/(?:which|what).*(?:official\s+)?(?:roster|student\s+list).*(?:my\s+)?(?:profile|using|use)|(?:my\s+)?(?:profile|roster).*(?:official\s+)?(?:source|using)/.test(q)) {
    const branch = branchCodeForProfile(activeStudentProfile());
    const rosterSource = branch ? rosterSourceForBranch(branch) : null;
    if (!branch) return "<p>Set up or verify your Profile first. Then Compass can show the current official branch roster used for this device.</p>";
    if (!rosterSource?.url) return `<p>The current official ${escapeHtml(branch)} roster is not available in the verified source registry yet. Your saved profile was not changed.</p>`;
    return `<p><strong><u>Your current verified roster</u></strong></p><p><strong>${escapeHtml(branch)} Branch Students</strong> is the official roster used to check this device profile.</p><p><a class="reference-link" href="${escapeHtml(rosterSource.url)}" target="_blank" rel="noopener">Open the official ${escapeHtml(branch)} roster</a></p><p class="answer-source">The roster link is discovered from GNDEC’s current timetable index.</p>`;
  }
  if (/(?:what|which).*(?:official\s+)?(?:data|sources?).*(?:update|automatic|regular)|(?:data|sources?).*(?:update|automatic|regular).*(?:official|gndec)/.test(q)) return "<p><strong>Automatically refreshed from official GNDEC pages:</strong></p><ul><li>the complete timetable release and its FET footer</li><li>current branch rosters used for Profile checks</li><li>the current first-year syllabus PDF</li><li>the newest dated academic-calendar PDF</li></ul><p>Compass rechecks this source registry every four hours; this browser also checks when the tab returns and every 15 minutes.</p><p><strong>Not automatic:</strong> built-in Brain rules, holiday data, and hand-curated college-link lists only change after a verified app update. Compass deliberately does not import unreviewed pages or PDFs as facts.</p>";
  if (/check.*(?:official\s+)?updates?/.test(q)) return "<p>Use the <strong>Check for updates & reload</strong> button on Today to run a fresh official-source check now. Your last verified timetable stays available if that check fails.</p>";
  if (/how.*(?:update|refresh)|(?:official|data).*(?:updated|fresh|latest)|when.*update/.test(q)) return `<p>Compass checks GNDEC’s official timetable, roster, and syllabus sources automatically every four hours. This browser also checks for a newer verified revision when the tab returns and every 15 minutes. The timetable currently loaded on this device came from ${escapeHtml(state.metadata?.source || "the official GNDEC source")}.</p>`;
  if (/(?:is|are).*(?:data|profile|chat).*(?:private|safe)|privacy|who.*see.*(?:profile|chat)/.test(q)) return "<p>Your saved profile, selected group, roster search history, syllabus cache, and chat history stay in this browser. Open-ended study questions may use the configured external AI, but Compass removes your name, CRN, registration, serial history, and mentor first. Only branch/section context and an anonymous device/network usage counter are used.</p>";
  if (/how.*(?:share|send).*(?:compass|link)|friend.*(?:use|share)/.test(q)) return "<p>Share the Compass website link. Each friend sets up their own profile on their own browser, so their group, subsection, and chat history do not replace yours.</p>";
  if (/(?:no|not).*(?:internet|network|net)|offline/.test(q)) return "<p>Previously loaded timetable, profile, chat, and syllabus data remain available on this device. Fresh official updates and AI answers need an internet connection.</p>";
  if (/ai\s*(?:limit|questions?|usage)|daily\s*(?:limit|questions?)/.test(q)) return "<p>Timetable and syllabus facts do not use AI. Public devices have a small daily limit only for open-ended study questions; factual college data remains available anytime.</p>";
  if (/free\s*(?:time|period|lecture)|khali|\u0916\u093e\u0932\u0940|\u0a16\u0a3e\u0a32\u0940/.test(q) && /(?:what|do|idea|suggest|kya|kar)/.test(q)) return "<p><strong>Useful free-period choices:</strong></p><ol><li>Review today’s class notes for 10 minutes.</li><li>Open one syllabus unit and make five recall questions.</li><li>Finish one small assignment task.</li><li>Take a real break: water, food, and a short walk.</li></ol><p>Ask “free lectures today” for the exact empty periods.</p>";
  if (/what.*(?:date|day|time)|today.*date/.test(q) && !/timetable|schedule|class|lecture|period/.test(q)) return `<p>In India, it is <strong>${escapeHtml(now.date)}</strong> and the time is <strong>${escapeHtml(now.time)}</strong>.</p>`;
  if (/(?:study\s*)?(?:tips?|advice)|how\s+to\s+study/.test(q) && !/detailed|personal|plan|explain|weak|difficult/.test(q)) return "<p><strong>Quick study method:</strong></p><ol><li>Choose one unit and read its learning outcome first.</li><li>Study for 25 minutes, then take a 5-minute break.</li><li>Write five recall questions without looking at notes.</li><li>End with one past-paper or numerical problem.</li></ol><p>Ask for a detailed subject-specific plan if you need one.</p>";
  return "";
}

function localClarificationAnswer() {
  return "<p><strong>I’m not certain what you mean yet.</strong></p><p>Please rephrase the question with one specific topic or detail. For example: “Which branches are offered?”, “Where is my next class?”, or “Explain Physics Unit 2”.</p>";
}

// Suggestions after an answer are derived from the verified answer facts (when
// Brain 2 supplied them) or the same active timetable used by Brain 1. This
// prevents irrelevant Physics/Math chips and never repeats the question asked.
function followupSuggestions(question, brainResult = null) {
  const q = canonicalTimetableQuestion(question);
  const facts = brainResult?.facts && typeof brainResult.facts === "object" ? brainResult.facts : {};
  const intent = String(brainResult?.intent || "");
  const verifiedClass = facts.class && typeof facts.class === "object" ? facts.class : null;
  const referencedClass = verifiedClass || findReferencedClass(q);
  const rememberedSubject = /^SUBJECT_/.test(intent) || /\b(?:it|its|that subject|same subject)\b/.test(q)
    ? state.brainConversation?.activeSubject
    : "";
  const subject = cleanText(facts.subject || referencedClass?.subject || rememberedSubject || "");
  const requestedDay = cleanText(facts.day || verifiedClass?.day || requestedWeekday(q));
  const syllabusFollowupIntent = /syllabus|course|units?|outcomes?|credits?|marks?|assessment|exam|textbooks?|laboratory/.test(q);
  const syllabusCourse = syllabusFollowupIntent ? syllabusCoursesForQuestion(question)[0] : null;
  const syllabusTitle = cleanText(syllabusCourse?.title || "");
  const facultyName = cleanText(facts.faculty?.name || "");
  const asksLocation = /\b(?:where|room|location|place|kahan|kahaan|kidhar|kithe|kithhe)\b/.test(q);
  const asksTeacher = /\b(?:who\s+teaches|teaches|teacher|faculty|padhata|padhati|padhaunda)\b/.test(q);
  const asksSchedule = /\b(?:when|schedule|timetable|kab|kadon)\b/.test(q);
  let list = [];

  if (facultyName || /^FACULTY_/.test(intent)) {
    if (facultyName && !/\bdepartment\b/.test(q)) list.push(`What is ${facultyName}'s department?`);
    if (facultyName && !/\bqualifications?\b/.test(q)) list.push(`What are ${facultyName}'s qualifications?`);
    list.push("What is my next class?");
  } else if (/^STUDENT_/.test(intent) || /\b(?:find|search|lookup)\b.*\bstudent\b/.test(q)) {
    list = ["Find another student by name or exact CRN", "What is my next class?"];
  } else if (syllabusTitle || syllabusFollowupIntent) {
    const title = syllabusTitle || subject;
    if (title) list = [`${title} course outcomes`, `${title} assessment marks`, `${title} textbooks`];
    else list = ["Physics syllabus", "Math units", "List all official subjects"];
  } else if (/UPCOMING_CLASS/.test(intent) || /\b(?:next|upcoming|current|now|abhi)\b/.test(q)) {
    if (subject && !asksLocation) list.push(`Where is ${subject}?`);
    if (subject && !asksTeacher) list.push(`Who teaches ${subject}?`);
    list.push("2nd next class", requestedDay ? `${requestedDay} timetable` : "Aaj ka timetable batao");
  } else if (subject) {
    if (!asksLocation) list.push(`Where is ${subject}?`);
    if (!asksTeacher) list.push(`Who teaches ${subject}?`);
    if (!syllabusFollowupIntent) list.push(`${subject} syllabus`);
    if (!asksSchedule) list.push(`When is ${subject}?`);
  } else if (/\bfree\b/.test(q)) {
    list = [requestedDay ? `${requestedDay} timetable` : "Aaj ka timetable batao", "What is my next class?", "Kal ka timetable batao"];
  } else if (/timetable|schedule|today|tomorrow|aaj|kal/.test(q) || /^DAY_/.test(intent)) {
    const dayLabel = requestedDay || (/tomorrow|kal/.test(q) ? "tomorrow" : "today");
    list = [`Free lectures ${dayLabel}`, "What is my next class?", "Kal ka timetable batao"];
  } else if (/mentor|section|profile|registration|reg\s*(?:no|number)?|\bcrn\b|serial/.test(q) || /^PROFILE_/.test(intent)) {
    list = ["What is my next class?", "Aaj ka timetable batao", "Free lectures today"];
  } else {
    list = ["What is my next class?", "Aaj ka timetable batao", "What can you do?"];
  }

  const asked = normalizeQuestionSuggestion(question);
  const seen = new Set();
  const suggestions = list.filter((text) => {
    const key = normalizeQuestionSuggestion(text);
    if (!key || key === asked || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
  if (!suggestions.length) return "";
  const markup = suggestions.map((text) => `<button class="kb-followup" type="button" data-kb-followup="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join("");
  return `<div class="kb-followups" role="group" aria-label="Suggested follow-up questions"><span class="kb-followup-label">Try next</span>${markup}</div>`;
}

function answerFromKnowledgeBase(question) {
  const hasExplicitSyllabusCourse = state.syllabus.length && syllabusCoursesForQuestion(question).length > 0;
  const syllabusFollowup = hasExplicitSyllabusCourse ? "" : answerSyllabusFollowup(question);
  if (syllabusFollowup) return { reply: `${syllabusFollowup}${followupSuggestions(question)}`, source: "Official GNDEC syllabus" };
  const kb = kbAnswer(question);
  if (!kb) return null;
  return { reply: `${kb.reply}${followupSuggestions(question)}`, source: kb.source };
}

// Brain 1 keeps its own bounded calculator so it remains useful when Brain 2
// is unavailable. It accepts arithmetic and first-degree x equations only.
function legacyCalculationAnswer(question = "") {
  const source = String(question).normalize("NFKC").toLowerCase()
    .replace(/\b(?:plus|jod|jodo)\b/g, " + ").replace(/\b(?:minus|ghata|ghatao)\b/g, " - ")
    .replace(/\b(?:times|multiply|multiplied by|guna)\b/g, " * ").replace(/\b(?:divided by|divide|bhaag)\b/g, " / ")
    .replace(/[×]/g, "*").replace(/[÷]/g, "/").replace(/,/g, "").trim();
  const equation = source.match(/^(?:solve\s+)?([0-9.x*+\-\s]+)=([0-9.x*+\-\s]+)\??$/);
  if (equation) {
    const left = legacyLinearExpression(equation[1]);
    const right = legacyLinearExpression(equation[2]);
    if (left && right && (left.coefficient || right.coefficient)) {
      const coefficient = left.coefficient - right.coefficient;
      const constant = right.constant - left.constant;
      if (coefficient === 0) return `<p>${constant === 0 ? "This equation has infinitely many solutions." : "This equation has no solution."}</p>`;
      const value = constant / coefficient;
      if (Number.isFinite(value)) return `<p><strong>x = ${escapeHtml(String(Number(value.toFixed(10))))}</strong></p><p class="answer-source">Calculated from the supplied linear equation.</p>`;
    }
  }
  const percentage = source.match(/^(?:what\s+is|calculate)?\s*(-?\d+(?:\.\d+)?)\s*%\s*(?:of)\s*(-?\d+(?:\.\d+)?)\s*\??$/);
  if (percentage) {
    const value = Number(percentage[1]) * Number(percentage[2]) / 100;
    return `<p><strong>${escapeHtml(percentage[1])}% of ${escapeHtml(percentage[2])} = ${escapeHtml(String(Number(value.toFixed(10))))}</strong></p>`;
  }
  const squareRoot = source.match(/^(?:sqrt|square\s+root\s+of)\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?\s*\??$/);
  if (squareRoot) return `<p><strong>sqrt(${escapeHtml(squareRoot[1])}) = ${escapeHtml(String(Number(Math.sqrt(Number(squareRoot[1])).toFixed(10))))}</strong></p>`;
  const expression = source.replace(/^(?:what\s+is|calculate|solve|answer)\s+/, "").replace(/\?$/, "");
  const evaluated = legacySafeArithmeticValue(expression);
  return evaluated.ok ? `<p><strong>${escapeHtml(expression)} = ${escapeHtml(String(Number(evaluated.value.toFixed(10))))}</strong></p>` : "";
}

function legacyLinearExpression(input) {
  const source = String(input).replace(/\s+/g, "");
  if (!source || source.length > 80 || /[^0-9.x*+\-]/.test(source)) return null;
  const terms = source.match(/[+-]?[^+-]+/g);
  if (!terms?.length) return null;
  let coefficient = 0; let constant = 0;
  for (const term of terms) {
    const variable = term.match(/^([+-]?)(?:(\d+(?:\.\d+)?)\*?)?x$/);
    if (variable) { coefficient += (variable[1] === "-" ? -1 : 1) * Number(variable[2] || 1); continue; }
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(term)) return null;
    constant += Number(term);
  }
  return Number.isFinite(coefficient) && Number.isFinite(constant) ? { coefficient, constant } : null;
}

function legacySafeArithmeticValue(expression) {
  const source = String(expression).replace(/\s+/g, "");
  if (!source || source.length > 100 || !/[+*/^()-]/.test(source) || /[^\d.+*/^()-]/.test(source)) return { ok: false };
  let index = 0;
  const number = () => { const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/); if (!match) throw new Error("number"); index += match[0].length; return Number(match[0]); };
  const primary = () => { if (source[index] === "(") { index += 1; const value = expressionParser(); if (source[index] !== ")") throw new Error("parenthesis"); index += 1; return value; } if (source[index] === "+") { index += 1; return primary(); } if (source[index] === "-") { index += 1; return -primary(); } return number(); };
  const power = () => { let value = primary(); if (source[index] === "^") { index += 1; value **= power(); } return value; };
  const term = () => { let value = power(); while (source[index] === "*" || source[index] === "/") { const operator = source[index++]; const right = power(); if (operator === "/" && right === 0) throw new Error("division"); value = operator === "*" ? value * right : value / right; } return value; };
  const expressionParser = () => { let value = term(); while (source[index] === "+" || source[index] === "-") { const operator = source[index++]; const right = term(); value = operator === "+" ? value + right : value - right; } return value; };
  try { const value = expressionParser(); return index === source.length && Number.isFinite(value) ? { ok: true, value } : { ok: false }; } catch { return { ok: false }; }
}

function legacyHolidayAnswer(question) {
  const kernel = globalThis.CompassBrainKernel;
  if (!kernel || typeof kernel.normalize !== "function") return "";
  const q = kernel.normalize(question);
  const baseIso = indiaCalendarDate(0).date.toISOString().slice(0, 10);
  const baseYear = Number(baseIso.slice(0, 4)) || 2026;
  const requestedYearMatch = q.match(/\b(?:in|for|of|year)?\s*(20\d{2})\b/);
  const requestedYear = requestedYearMatch ? Number(requestedYearMatch[1]) : baseYear;
  const holidaySearchResults = kernel.searchHolidays(question);
  const normalizedHolidayQuery = kernel.normalizeHolidayLookup?.(question) || q;
  const exactRegistryName = holidaySearchResults.some((holiday) => [holiday.name, holiday.nameHi, holiday.namePa]
    .some((name) => name && (kernel.normalizeHolidayLookup?.(name) || kernel.normalize(name)) === normalizedHolidayQuery));
  const registryHolidayQuestion = holidaySearchResults.length > 0 && (exactRegistryName
    || /\b(?:when|date|holiday|festival|show|tell|what|which)\b/.test(q));
  const asksHoliday = /\b(?:holiday|holidays|vacation|vacations|chutti|chhutti|off\s+day|gazetted|restricted)\b/.test(q)
    || /\b(?:diwali|dussehra|holi|vaisakhi|baisakhi|gurpurab|independence\s+day|republic\s+day|gandhi\s+jayanti|shivratri|eid|bakrid|christmas|muharram|shaheedi\s+diwas)\b/.test(q)
    || registryHolidayQuestion;
  if (!asksHoliday) return "";
  if (requestedYear !== 2026) return `<p><strong><u>Official GNDEC holiday list for ${escapeHtml(String(requestedYear))} is not loaded.</u></strong></p><p>Compass currently has the verified 2026 list only, so it will not guess dates for another year.</p><p class="answer-source"><a href="${escapeHtml(kernel.HOLIDAY_SOURCE.page)}" target="_blank" rel="noopener noreferrer">${escapeHtml(kernel.HOLIDAY_SOURCE.label)} ↗</a></p>`;

  // Month queries
  const mentionedMonth = Object.keys(kernel.MONTHS).find((m) => new RegExp(`\\b${m}\\b`, "i").test(q) && m.length >= 3);
  if (mentionedMonth !== undefined) {
    const mIdx = kernel.MONTHS[mentionedMonth];
    const mName = kernel.MONTH_NAMES[mIdx];
    const list = kernel.getHolidaysForMonth(mIdx, requestedYear);
    if (!list.length) return `<p><strong>There are no gazetted holidays listed in ${escapeHtml(mName)} ${requestedYear}.</strong></p><p class="answer-source">Official GNDEC & Punjab Government Academic Calendar.</p>`;
    const items = list.map((h) => `<li><strong>${h.date.slice(8, 10)} ${mName} (${h.day})</strong>: ${escapeHtml(h.name)} <em>(${escapeHtml(h.type)})</em></li>`).join("");
    return `<p><strong><u>Official Holidays in ${escapeHtml(mName)} ${requestedYear} (${list.length})</u></strong></p><ul>${items}</ul><p class="answer-source">Official GNDEC & Punjab Government Gazetted Holiday Calendar.</p>`;
  }

  // Specific date check
  const monthNameMatch = q.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/) || q.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/);
  if (monthNameMatch) {
    const isFirstNum = /^\d+$/.test(monthNameMatch[1]);
    const dayNum = isFirstNum ? Number(monthNameMatch[1]) : Number(monthNameMatch[2]);
    const monthStr = (isFirstNum ? monthNameMatch[2] : monthNameMatch[1]).toLowerCase();
    if (kernel.MONTHS[monthStr] !== undefined && dayNum >= 1 && dayNum <= 31) {
      const checkIso = `${baseYear}-${String(kernel.MONTHS[monthStr] + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const holiday = kernel.checkDateHoliday(checkIso);
      const formatted = kernel.formatIsoFull(checkIso);
      if (holiday) {
        if (kernel.isHalfDayNotice?.(holiday)) return `<p><strong>${escapeHtml(formatted)} has a GNDEC second-half-day notice.</strong></p><p>${escapeHtml(holiday.name)} is not a full-day closure. Check the GNDEC notice before assuming classes are cancelled.</p><p class="answer-source">Official GNDEC Holiday Calendar.</p>`;
        if (String(holiday.type || "").toLowerCase() === "restricted") return `<p><strong>${escapeHtml(formatted)} is a Restricted Holiday:</strong></p><p>${escapeHtml(holiday.name)}. Optional leave; college may be open, so classes may happen. Check the GNDEC notice.</p><p class="answer-source">Official GNDEC Holiday Calendar.</p>`;
        return `<p><strong>Yes! ${escapeHtml(formatted)} is an official holiday:</strong></p><p><strong>${escapeHtml(holiday.name)}</strong> (${escapeHtml(holiday.type)} Holiday)</p><p>${escapeHtml(holiday.description)}</p><p class="answer-source">Official GNDEC & Punjab Government Gazetted Calendar.</p>`;
      }
      const weekday = kernel.weekdayOfIso(checkIso);
      return `<p><strong>No. ${escapeHtml(formatted)} is not an official gazetted holiday.</strong></p><p>${weekday === "Saturday" || weekday === "Sunday" ? `It falls on a ${weekday} (weekend).` : "It is a regular college working day."}</p><p class="answer-source">Official GNDEC & Punjab Government Academic Calendar.</p>`;
    }
  }

  // Next holiday
  if (/\b(?:next|upcoming|agli)\s+holiday\b|\bagli\s+chutti\b/.test(q)) {
    const nextH = kernel.getNextHoliday(baseIso);
    if (nextH) {
      return `<p><strong>Next official holiday: ${escapeHtml(nextH.name)}</strong></p><p><strong>Date:</strong> ${escapeHtml(kernel.formatIsoFull(nextH.date))}<br /><strong>Type:</strong> ${escapeHtml(nextH.type)} Holiday</p><p class="answer-source">Official GNDEC & Punjab Government Gazetted Calendar.</p>`;
    }
  }

  // Full-year list and total
  if (/^(?:(?:all|list|show|display|full|complete)\s+)?(?:official\s+)?holidays?(?:\s+2026)?\b/.test(q)
    || /\b(?:holidays?|calendar)\s+(?:in|for|of)\s+2026\b/.test(q)
    || /\b(?:how many|total|count|kitne|kitni)\s+holidays?\s+(?:in\s+(?:a|this)\s+year|this\s+year|saal\s+me)\b/.test(q)) {
    const allHolidays = kernel.getHolidaysForYear(requestedYear);
    const items = allHolidays.map((h) => `<li><strong>${escapeHtml(kernel.formatIsoFull(h.date))}</strong>: ${escapeHtml(h.name)} <em>(${escapeHtml(h.type)})</em></li>`).join("");
    return `<p><strong><u>GNDEC Official Holidays for ${requestedYear} (${allHolidays.length} official-list entries)</u></strong></p><ol>${items}</ol><p class="answer-source"><a href="${escapeHtml(kernel.HOLIDAY_SOURCE.pdf)}" target="_blank" rel="noopener noreferrer">${escapeHtml(kernel.HOLIDAY_SOURCE.label)} ↗</a></p>`;
  }
  // Named official holiday. Keep this in the independent legacy route so the
  // holiday-card action still works if every newer Brain is disabled.
  if (holidaySearchResults.length) {
    const holiday = holidaySearchResults[0];
    const isHalfDay = kernel.isHalfDayNotice?.(holiday);
    const status = isHalfDay
      ? "Second-half-day notice only. Check the GNDEC notice before assuming classes are cancelled."
      : String(holiday.type || "").toLowerCase() === "restricted"
        ? "Optional leave. College may be open, so classes may happen."
        : "Official holiday. College is normally closed.";
    return `<p><strong>${escapeHtml(holiday.name)} (${requestedYear})</strong></p><p><strong>Date:</strong> ${escapeHtml(kernel.formatIsoFull(holiday.date))}<br /><strong>Category:</strong> ${escapeHtml(holiday.type)}<br /><strong>Status:</strong> ${escapeHtml(status)}</p><p class="answer-source"><a href="${escapeHtml(kernel.HOLIDAY_SOURCE.pdf)}" target="_blank" rel="noopener noreferrer">${escapeHtml(kernel.HOLIDAY_SOURCE.label)} ↗</a></p>`;
  }
  return "";
}

function legacyAcademicMarkingAnswer(question) {
  const raw = String(question || "").trim();
  const q = raw.toLowerCase();
  const cgpaMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:cgpa|sgpa)\s*(?:to|in)?\s*(?:percentage|%)/i);
  if (cgpaMatch) {
    const val = Number(cgpaMatch[1]);
    const pct = Math.round(val * 9.5 * 100) / 100;
    return `<p><strong>${val} CGPA = ${pct}%</strong></p><p>Formula: <strong>Percentage = CGPA × 9.5</strong></p><p class="answer-source">Official IKGPTU / GNDEC Autonomous Regulations.</p>`;
  }

  const pctMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|percentage)\s*(?:to|in)?\s*(?:cgpa|sgpa)/i);
  if (pctMatch) {
    const val = Number(pctMatch[1]);
    const cgpa = Math.round((val / 9.5) * 100) / 100;
    return `<p><strong>${val}% = ${cgpa} CGPA</strong></p><p>Formula: <strong>CGPA = Percentage ÷ 9.5</strong></p><p class="answer-source">Official IKGPTU / GNDEC Autonomous Regulations.</p>`;
  }

  if (/\b(?:marking\s*scheme|internal\s*marks?|external\s*marks?|ca\s*marks?|ese\s*marks?)\b/.test(q)) {
    return `<p><strong><u>Official GNDEC B.Tech Autonomous Marking Scheme</u></strong></p><p>• <strong>Theory:</strong> Total 100 Marks (CA/Internal = 40, ESE/External = 60). Passing: Min 40% in ESE (24/60) and 40% aggregate.<br />• <strong>Practical/Labs:</strong> CA = 30/60 Marks, ESE = 20/40 Marks.<br />• <strong>Credits:</strong> 1 Lecture/hr = 1, 1 Tutorial/hr = 1, 2 Lab/hrs = 1.</p><p class="answer-source">Official GNDEC Autonomous Study Scheme.</p>`;
  }

  const kernel = globalThis.CompassBrainKernel;
  if (kernel && typeof kernel.evaluateAttendance === "function" && /\b(?:attendance|bunk|shortage)\b/.test(q)) {
    const match = raw.match(/(\d+)\s*(?:out of|\/|me se)\s*(\d+)/i);
    if (match) {
      const res = kernel.evaluateAttendance({ attended: Number(match[1]), total: Number(match[2]), target: 76 });
      if (res.valid) {
        return res.status === "safe"
          ? `<p><strong>Attendance: ${res.attended}/${res.total} (${res.currentPct}%)</strong></p><p>🎉 You can safely bunk up to <strong>${res.bunksAllowed} classes</strong> and stay above 76%.</p>`
          : `<p><strong>Attendance Shortage: ${res.attended}/${res.total} (${res.currentPct}%)</strong></p><p>⚠️ You must attend the next <strong>${res.classesNeeded} consecutive classes</strong> to reach 76%.</p>`;
      }
    }
  }

  if (kernel && typeof kernel.lookupCampusRoom === "function" && /\b(?:room|block|floor|lab|where|kahan|kidhar)\b/i.test(raw)) {
    const info = kernel.lookupCampusRoom(raw);
    if (info) return `<p><strong>📍 ${info.name}:</strong> ${info.block}, ${info.floor}. (${info.landmark})</p>`;
  }

  if (kernel && typeof kernel.lookupCampusAdministration === "function" && /\b(?:principal|director|dean|dsw|tpo|tcc|coe|hod|head of department)\b/i.test(raw)) {
    const admin = kernel.lookupCampusAdministration(raw);
    if (admin) return `<p><strong>🏛️ ${admin.title}:</strong> ${admin.name} (${admin.office}). Email: <code>${admin.email}</code></p>`;
  }

  return "";
}

// The legacy deterministic route remains an independent reliability boundary.
// Brain v2 may answer first, but every unsupported, uncertain, malformed, or
// failing Brain result returns here without changing existing factual logic.
function legacyAnswerWithoutAi(question, studentLookup = null, facultyLookup = null) {
  const workflowAnswer = approvedCompassWorkflowAnswer(question);
  if (workflowAnswer) return workflowAnswer;
  const facultyAnswer = legacyFacultyLookupAnswer(facultyLookup);
  if (facultyAnswer) return facultyAnswer;
  const rosterAnswer = legacyStudentLookupAnswer(studentLookup);
  if (rosterAnswer) return rosterAnswer;
  const calculationAnswer = legacyCalculationAnswer(question);
  if (calculationAnswer) return calculationAnswer;
  const holidayAnswer = legacyHolidayAnswer(question);
  if (holidayAnswer) return holidayAnswer;
  const academicMarking = legacyAcademicMarkingAnswer(question);
  if (academicMarking) return academicMarking;
  const calendarAnswer = calendarQuestionAnswer(question);
  if (calendarAnswer) return calendarAnswer;
  const academicScopeAnswer = answerAcademicScopeQuestion(question);
  if (academicScopeAnswer) return academicScopeAnswer;
  const knowledgeAnswer = answerFromKnowledgeBase(question);
  if (knowledgeAnswer?.reply) return knowledgeAnswer.reply;
  const popularAnswer = answerCompassQuestion(question);
  if (popularAnswer) return popularAnswer;
  const syllabusQuestion = isSyllabusQuestion(question);
  if (syllabusQuestion && state.syllabus.length && !isOpenQuestion(question)) {
    return answerSyllabusQuestion(question) || "<p><strong><u>Choose a subject.</u></strong></p><p>For example: “Physics syllabus”, “Math units”, or “PPS course outcomes”.</p>";
  }
  if (isStructuredQuestion(question)) return answerStructuredQuestion(question);
  return "";
}

function brainV2Mode() {
  try {
    const query = typeof location !== "undefined" ? String(location.search || "") : "";
    if (/(?:^|[?&])brain=legacy(?:&|$)/i.test(query)) return "legacy";
    if (/(?:^|[?&])brain=v12(?:&|$)/i.test(query)) return "v12";
    if (/(?:^|[?&])brain=v22(?:&|$)/i.test(query)) return "v22";
    if (/(?:^|[?&])brain=v2(?:&|$)/i.test(query)) return "v2";
    if (localStorage.getItem(BRAIN_V2_STORAGE_KEY) === "false") return "legacy";
    if (state.settings?.brainMode) return state.settings.brainMode;
    return "v22";
  } catch { return "v22"; }
}

// Deterministic fallback chain per selected mode. External AI is never part
// of a factual-question chain (AGENTS.md): each step is a local, verified
// brain, and total failure falls through to the legacy local engines.
function brainChainForMode(mode) {
  const v22 = globalThis.CompassBrainV2_2;
  const v12 = globalThis.CompassBrainV1_2;
  const v2 = globalThis.CompassBrainV2;
  if (mode === "v12") return [v12, v2].filter((engine) => engine && typeof engine.process === "function");
  if (mode === "v2") return [v2].filter((engine) => engine && typeof engine.process === "function");
  if (mode === "legacy") return [];
  return [v22, v12, v2].filter((engine) => engine && typeof engine.process === "function");
}

function saveSettings(patch = {}) {
  state.settings = { ...(state.settings || defaultSettings()), ...patch };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
  } catch { /* optional local storage */ }
  applySettings();
  if (Object.prototype.hasOwnProperty.call(patch, "preferredLanguage")
    || Object.prototype.hasOwnProperty.call(patch, "showHinglishChips")
    || Object.prototype.hasOwnProperty.call(patch, "showDynamicChips")) renderQuestionChips();
  if (Object.prototype.hasOwnProperty.call(patch, "timetableGridView")
    || Object.prototype.hasOwnProperty.call(patch, "timetableSwapAxes")
    || Object.prototype.hasOwnProperty.call(patch, "compactTimetable")) {
    renderWeek();
    renderDaySchedule();
  }
  renderSettingsPage();
}

function applySettings() {
  const s = state.settings || defaultSettings();
  if (typeof document !== "undefined") {
    if (s.themeAccent && s.themeAccent !== "emerald") {
      document.documentElement.dataset.accentTheme = s.themeAccent;
    } else {
      delete document.documentElement.dataset.accentTheme;
    }
    document.body?.classList.toggle("compact-timetable", Boolean(s.compactTimetable));
    document.body?.classList.toggle("reduce-motion", Boolean(s.reduceMotion));
    document.body?.classList.toggle("hide-answer-freshness", s.showFreshnessTag === false);
    document.documentElement?.classList.toggle("reduce-motion", Boolean(s.reduceMotion));
    if (s.brainMode) {
      if (s.brainMode === "legacy") setCompassBrainV2Enabled(false);
      else setCompassBrainV2Enabled(true);
    }
  }
}

function renderSettingsPage() {
  const s = state.settings || defaultSettings();
  const brainModeSelect = $("settings-brain-mode");
  if (brainModeSelect) brainModeSelect.value = s.brainMode || "v22";
  const prefLang = $("settings-preferred-language");
  if (prefLang) prefLang.value = s.preferredLanguage || "hinglish";
  const hinglishChips = $("settings-hinglish-chips");
  if (hinglishChips) hinglishChips.checked = s.showHinglishChips !== false;
  const dynChips = $("settings-dynamic-chips");
  if (dynChips) dynChips.checked = s.showDynamicChips !== false;
  const cgpaForm = $("settings-cgpa-formula");
  if (cgpaForm) cgpaForm.value = s.cgpaFormula || "autonomous";
  const attTarget = $("settings-attendance-target");
  if (attTarget) attTarget.value = String(s.attendanceTarget || 76);
  const attAlerts = $("settings-attendance-alerts");
  if (attAlerts) attAlerts.checked = s.attendanceAlerts !== false;
  const restHoli = $("settings-restricted-holidays");
  if (restHoli) restHoli.checked = s.showRestrictedHolidays !== false;
  const ttGrid = $("settings-timetable-grid");
  if (ttGrid) ttGrid.checked = s.timetableGridView !== false;
  const swapRow = $("settings-swap-axes-row");
  if (swapRow) swapRow.hidden = s.timetableGridView === false;
  const ttSwapAxes = $("settings-timetable-swap-axes");
  if (ttSwapAxes) ttSwapAxes.checked = Boolean(s.timetableSwapAxes);
  const freshTags = $("settings-freshness-tag");
  if (freshTags) freshTags.checked = s.showFreshnessTag !== false;
  const aiSug = $("settings-ai-suggestions");
  if (aiSug) aiSug.checked = s.aiSuggestions !== false;
  const compactCheck = $("settings-compact-view");
  if (compactCheck) compactCheck.checked = Boolean(s.compactTimetable);
  const motionCheck = $("settings-reduce-motion");
  if (motionCheck) motionCheck.checked = Boolean(s.reduceMotion);
  const holiAlerts = $("settings-holiday-alerts");
  if (holiAlerts) holiAlerts.checked = s.holidayAlerts !== false;
  const roomLocations = $("settings-room-locations");
  if (roomLocations) roomLocations.checked = s.roomLocations !== false;

  document.querySelectorAll("#theme-accent-picker .accent-dot").forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.accent === (s.themeAccent || "emerald"));
  });

  // Update Live Preview Card
  const previewBadge = document.querySelector("#settings-preview-card .preview-badge");
  if (previewBadge) {
    const accentNames = { emerald: "EMERALD GREEN", azure: "AZURE BLUE", amber: "AMBER GOLD", rose: "CYBER ROSE" };
    previewBadge.textContent = accentNames[s.themeAccent || "emerald"] || "ACTIVE THEME";
  }

  // Diagnostics
  const v22 = globalThis.CompassBrainV2_2;
  const v12 = globalThis.CompassBrainV1_2;
  const v2 = globalThis.CompassBrainV2;
  const metrics = (v22?.getMetrics && v22.getMetrics())
    || (v12?.getMetrics && v12.getMetrics())
    || (v2?.getMetrics && v2.getMetrics())
    || { processed: 0 };
  const diagProcessed = $("diag-processed");
  if (diagProcessed) diagProcessed.textContent = String(metrics.processed || 0);
  const diagLatency = $("diag-latency");
  if (diagLatency) diagLatency.textContent = `${Math.round(metrics.averageLatencyMs || metrics.lastLatencyMs || 0)} ms`;
  const diagHandled = $("diag-handled");
  if (diagHandled) diagHandled.textContent = `${Math.round((metrics.handledRate || 1) * 100)}%`;
  const diagMode = $("diag-mode");
  if (diagMode) diagMode.textContent = s.brainMode === "v22" ? "Brain 2.2 + 1.2" : s.brainMode === "v12" ? "Brain 1.2" : s.brainMode === "v2" ? "Brain 2" : "Legacy";
}

function setCompassBrainV2Enabled(enabled) {
  try {
    localStorage.setItem(BRAIN_V2_STORAGE_KEY, enabled ? "true" : "false");
    if (state.settings) state.settings.brainMode = enabled ? "v22" : "legacy";
  } catch { /* optional local override */ }
}

function resetBrainConversation() {
  state.brainConversation = null;
  state.lastTimetableSubject = "";
  state.rosterLookupConversation = null;
  try { localStorage.removeItem(BRAIN_CONTEXT_STORAGE_KEY); } catch { /* private browsing can block storage */ }
}

function saveBrainConversation(conversation) {
  if (!conversation || typeof conversation !== "object" || !Array.isArray(conversation.recentTurns)) return;
  state.brainConversation = conversation;
  try { localStorage.setItem(BRAIN_CONTEXT_STORAGE_KEY, JSON.stringify(conversation)); } catch { /* local context is optional */ }
}

function compassBrainContext(overrides = {}) {
  const now = getIndiaNow();
  const profile = activeStudentProfile();
  const classes = state.selectedGroup
    ? DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day))
    : [];
  const nextStudyDay = nextStudyDayInfo(false);
  return {
    classes,
    bellSlots: BELL_STARTS.map((start, index) => ({ start, end: BELL_ENDS[index] })),
    conversation: state.brainConversation,
    now,
    calendarDate: indiaCalendarDate(0).date.toISOString().slice(0, 10),
    currentYear: Number(now.date.match(/\d{4}/)?.[0]) || new Date().getFullYear(),
    profileLabel: activeTimetableLabel(),
    profile: {
      name: profile.name,
      crn: profile.crn,
      registrationNo: profile.registrationNo,
      serialNo: profile.serialNo,
      currentSerialNo: profile.currentSerialNo,
      newSerialNo: profile.newSerialNo,
      oldSerialNos: Array.isArray(profile.oldSerialNos) ? profile.oldSerialNos.slice(0, 12) : [],
      branch: profile.branch,
      section: profile.section,
      subsection: profile.subsection || profile.subgroup,
      mentor: profile.mentor,
      mentorPhone: profile.mentorPhone,
      academicGroup: profile.academicGroup,
      mentorVenue: profile.mentorVenue || profile.venue,
      venue: profile.mentorVenue || profile.venue,
      rosterVersion: profile.rosterVersion
    },
    nextStudyDay: nextStudyDay ? { day: nextStudyDay.day, label: nextStudyDay.compactLabel } : null,
    datasetVersion: state.metadata?.version || "",
    allClasses: state.schedule,
    studentRoster: Array.isArray(state.rosterCache?.records) ? state.rosterCache.records : [],
    facultyDirectory: Array.isArray(state.facultyCache?.records) ? state.facultyCache.records : [],
    collegeEvents: Array.isArray(state.collegeEventsCache) ? state.collegeEventsCache : [],
    notices: Array.isArray(state.noticesCache) ? state.noticesCache : [],
    timetables: state.timetablesCache || {},
    syllabus: Array.isArray(state.syllabus) ? state.syllabus : [],
    ...overrides
  };
}

function validateBrainResult(result, engine) {
  if (!result || typeof result !== "object" || !result.handled || !result.verified) return { accepted: false, reason: "INVALID_RESULT" };
  const minimumConfidence = Number.isFinite(engine?.MIN_CONFIDENCE) ? Math.max(0.82, engine.MIN_CONFIDENCE) : 0.82;
  if (!Number.isFinite(result.confidence) || result.confidence < minimumConfidence) return { accepted: false, reason: "LOW_CONFIDENCE" };
  if (typeof result.answer !== "string" || !result.answer.trim() || result.answer.length > 64000) return { accepted: false, reason: "INVALID_RESULT" };
  if (result.plan !== undefined && (!Array.isArray(result.plan) || result.plan.length > 8)) return { accepted: false, reason: "INVALID_RESULT" };
  if (/<\s*\/?\s*(?:script|iframe|object|embed|style|form|input|textarea|select|video|audio|meta|link)\b/i.test(result.answer)
    || /\son[a-z]+\s*=|javascript\s*:/i.test(result.answer)
    || /\bNaN\b|\[object Object\]/.test(result.answer)) return { accepted: false, reason: "VERIFICATION_FAILED" };
  if (typeof engine?.validateResult === "function") {
    const engineValidation = engine.validateResult(result);
    if (!engineValidation?.accepted) return engineValidation || { accepted: false, reason: "INVALID_RESULT" };
  }
  return { accepted: true, reason: "" };
}

function runCompassBrain(question, engine = null, contextOverrides = {}) {
  const mode = brainV2Mode();
  if (mode === "legacy") {
    state.lastBrainDiagnostic = { fallback: true, reason: "BRAIN_DISABLED" };
    return null;
  }
  // Chain per mode: v22 → V2_2, V1_2, V2; v12 → V1_2, V2; v2 → V2 only.
  // An explicitly passed engine keeps priority (existing callers/tests).
  let chain = brainChainForMode(mode);
  if (engine && typeof engine.process === "function") {
    chain = [engine, ...chain.filter((candidate) => candidate !== engine)];
  }
  if (!chain.length) {
    state.lastBrainDiagnostic = { fallback: true, reason: "BRAIN_UNAVAILABLE" };
    return null;
  }
  for (const activeEngine of chain) {
    try {
      const result = activeEngine.process(question, compassBrainContext(contextOverrides));
      const validation = validateBrainResult(result, activeEngine);
      if (!validation.accepted) {
        state.lastBrainDiagnostic = { fallback: true, reason: validation.reason || result?.fallbackReason || "INVALID_RESULT", processingMs: result?.processingMs || 0 };
        continue;
      }
      state.syllabusConversation = null;
      try { localStorage.removeItem(SYLLABUS_CONVERSATION_KEY); } catch { /* optional context reset */ }
      saveBrainConversation(result.context);
      state.lastBrainDiagnostic = { fallback: false, intent: result.intent || "", confidence: result.confidence, processingMs: result.processingMs || 0, version: result.version || "" };
      return result;
    } catch {
      state.lastBrainDiagnostic = { fallback: true, reason: "BRAIN_EXCEPTION" };
    }
  }
  return null;
}

// One public local-answer entry point. Brain v2 is tried first and the legacy
// engine is always retained as the transparent fallback.
function answerWithoutAi(question, engine = null, contextOverrides = {}) {
  const workflowAnswer = approvedCompassWorkflowAnswer(question);
  if (workflowAnswer) return workflowAnswer;
  const mentoringAnswer = mentoringClassAnswer(question);
  if (mentoringAnswer) return mentoringAnswer;
  const officialViewAnswer = officialTimetableViewAnswer(question);
  if (officialViewAnswer) return officialViewAnswer;
  const explicitSelectionAnswer = explicitTimetableSelectionAnswer(question);
  if (explicitSelectionAnswer) return explicitSelectionAnswer;
  const contextualAnswer = contextualLocalFollowupAnswer(question);
  if (contextualAnswer) return contextualAnswer;
  const brainResult = runCompassBrain(question, engine, contextOverrides);
  if (brainResult?.answer) return `${brainResult.answer}${followupSuggestions(question, brainResult)}`;
  const legacyAnswer = legacyAnswerWithoutAi(question, contextOverrides.studentLookup || null, contextOverrides.facultyLookup || null);
  return legacyAnswer && !legacyAnswer.includes('class="kb-followups"') ? `${legacyAnswer}${followupSuggestions(question)}` : legacyAnswer;
}

function renderStudentMatches(matches, message) {
  const result = $("student-lookup-result");
  pendingStudentMatches = matches;
  if (!matches.length) {
    result.textContent = message;
    return;
  }
  result.innerHTML = `<strong>${escapeHtml(message)}</strong>${matches.map((record, index) => {
    const identifiers = [record.crn ? `CRN ${record.crn}` : "", record.registrationNo ? `Registration ${record.registrationNo}` : "", (record.currentSerialNo || record.serialNo) ? `Serial ${record.currentSerialNo || record.serialNo}` : ""].filter(Boolean).join(" · ");
    return `<button class="lookup-choice" type="button" data-student-index="${index}"><span>${escapeHtml(record.name)}</span>${identifiers ? ` · ${escapeHtml(identifiers)}` : ""}<small>${escapeHtml(record.branch)} · ${escapeHtml(record.section)} / ${escapeHtml(record.subsection)} · Mentor: ${escapeHtml(record.mentor || "Not listed")}</small></button>`;
  }).join("")}`;
  result.querySelectorAll("[data-student-index]").forEach((button) => button.addEventListener("click", () => applyStudentRecord(pendingStudentMatches[Number(button.dataset.studentIndex)])));
}

function rosterSourceForBranch(branch) {
  return (state.sourceRegistry?.studentSectionSources || []).find((source) => source.branch === String(branch || "").toUpperCase()) || null;
}

function rosterHistorySourcesForBranch(branch) {
  return (state.sourceRegistry?.studentHistorySources || []).filter((source) => source.branch === String(branch || "").toUpperCase() && source.verified !== false);
}

function rosterRevisionForBranch(branch) {
  const current = rosterSourceForBranch(branch)?.contentHash || "";
  const history = rosterHistorySourcesForBranch(branch).map((source) => source.contentHash || source.url || "").sort();
  return [current, ...history].filter(Boolean).join(":");
}

function branchCodeForProfile(profile = {}) {
  const branch = String(profile.branch || "").toUpperCase();
  const section = String(profile.section || "").toUpperCase();
  return SECTION_LIST_BRANCHES.find((code) => branch === code || section.startsWith(code)) || "";
}

function mergeStudentRecord(record, previous = null) {
  const next = normalizeStudentRecord(record);
  if (!previous) return next;
  const prior = normalizeStudentRecord(previous);
  const sameCrn = next.crn && prior.crn && normalizeStudentIdentifier(next.crn) === normalizeStudentIdentifier(prior.crn);
  const sameRegistration = next.registrationNo && prior.registrationNo && normalizeStudentIdentifier(next.registrationNo) === normalizeStudentIdentifier(prior.registrationNo);
  if (!sameCrn && !sameRegistration) return next;
  const changedSerial = prior.currentSerialNo && next.currentSerialNo && prior.currentSerialNo !== next.currentSerialNo ? [prior.currentSerialNo] : [];
  return normalizeStudentRecord({
    ...next,
    crn: next.crn || prior.crn,
    registrationNo: next.registrationNo || prior.registrationNo,
    newSerialNo: next.newSerialNo || (prior.currentSerialNo === next.currentSerialNo ? prior.newSerialNo : ""),
    oldSerialNos: [...(prior.oldSerialNos || []), ...changedSerial, ...(next.oldSerialNos || [])]
  });
}

function applyStudentRecord(record, { silent = false } = {}) {
  if (!record) return;
  resetBrainConversation();
  const next = mergeStudentRecord(record, state.student);
  const rosterSource = rosterSourceForBranch(branchCodeForProfile(next));
  next.rosterVersion = next.rosterVersion || state.sourceRegistry?.version || "";
  next.rosterRevision = next.rosterRevision || rosterRevisionForBranch(branchCodeForProfile(next)) || rosterSource?.contentHash || "";
  state.student = next;
  state.selectedGroup = next.section;
  state.selectedSubgroup = next.subsection;
  state.profileSyncStatus = next.rosterVersion ? "Verified current roster" : "Profile saved on this device";
  localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(next));
  localStorage.setItem(GROUP_STORAGE_KEY, state.selectedGroup);
  localStorage.setItem(SUBGROUP_STORAGE_KEY, state.selectedSubgroup);
  recordGroupUsage(next.section);
  recordStudentSearch(next.name);
  if (state.groups.length) hydrateGroupControls();
  renderEverything();
  if (state.schedule.length && state.academicOverlayGroup !== cleanText(next.academicGroup)) {
    state.academicOverlay = [];
    state.academicOverlayGroup = "";
    persistTimetableCache();
    void refreshAcademicOverlay();
  }
  populateStudentLookupInput(true);
  if (!silent && $("student-lookup-result")) {
    const identifiers = [next.crn ? `CRN ${next.crn}` : "", next.registrationNo ? `Registration ${next.registrationNo}` : "", (next.currentSerialNo || next.serialNo) ? `Serial ${next.currentSerialNo || next.serialNo}` : ""].filter(Boolean).join(" · ");
    $("student-lookup-result").innerHTML = `<strong>Verified profile applied.</strong> ${escapeHtml(next.name)}${identifiers ? ` · ${escapeHtml(identifiers)}` : ""} · ${escapeHtml(next.section)} / ${escapeHtml(next.subsection)} · ${escapeHtml(next.mentor || "Mentor not listed")}.`;
  }
  if (!silent) showToast(`${next.section} / ${next.subsection} is now your active timetable.`);
}

function saveManualProfile() {
  if (!state.selectedGroup) { showToast("Choose a group first."); return; }
  if (!hasStudentProfile()) {
    showToast("Timetable saved. Find your verified profile to add mentor and academic-group details.");
    activatePage("today");
    return;
  }
  const profile = activeStudentProfile();
  if (profileMatchesTimetableSelection(profile)) {
    if (state.schedule.length && cleanText(profile.academicGroup) && state.academicOverlayGroup !== cleanText(profile.academicGroup)) {
      state.academicOverlay = [];
      state.academicOverlayGroup = "";
      persistTimetableCache();
      void refreshAcademicOverlay();
    }
    showToast("This timetable already matches your saved profile. Mentor details remain linked.");
    activatePage("today");
    return;
  }
  const selectedLabel = [state.selectedGroup, state.selectedSubgroup].filter(Boolean).join(" / ");
  const profileLabel = [profile.section, profile.subsection || profile.subgroup].filter(Boolean).join(" / ");
  const accepted = typeof window === "undefined" || typeof window.confirm !== "function" || window.confirm(`Use ${selectedLabel} as this device's timetable? Your saved profile for ${profile.name} (${profileLabel}) will remain unchanged. Mentoring details only appear while viewing the profile's own section.`);
  if (!accepted) {
    state.selectedGroup = profile.section;
    state.selectedSubgroup = profile.subsection || profile.subgroup || "";
    localStorage.setItem(GROUP_STORAGE_KEY, state.selectedGroup);
    localStorage.setItem(SUBGROUP_STORAGE_KEY, state.selectedSubgroup);
    if (state.groups.length) hydrateGroupControls();
    renderTimetableSearchSuggestions();
    renderEverything();
    showToast("Kept your profile timetable.");
    return;
  }
  state.profileSyncStatus = `Viewing custom timetable ${selectedLabel} · saved profile unchanged`;
  renderProfileSummary();
  showToast(`${selectedLabel} is now this device's timetable. Your profile is still saved.`);
  activatePage("today");
}

function currentRosterCacheKey() {
  const sources = state.sourceRegistry?.studentSectionSources || [];
  const historySources = state.sourceRegistry?.studentHistorySources || [];
  return [...sources.map((source) => `current:${source.branch}:${source.contentHash || source.url || ""}`), ...historySources.map((source) => `history:${source.branch}:${source.id || ""}:${source.contentHash || source.url || ""}`)].sort().join("|") || "fallback-rosters";
}

async function loadCurrentRosterRecords() {
  const cacheKey = currentRosterCacheKey();
  if (state.rosterCache?.key === cacheKey && Array.isArray(state.rosterCache.records) && Date.now() - state.rosterCache.loadedAt < 15 * 60 * 1000) return state.rosterCache;
  const discoveredBranches = state.sourceRegistry?.studentSectionSources?.map((source) => source.branch).filter(Boolean) || [];
  const branches = discoveredBranches.length ? discoveredBranches : SECTION_LIST_BRANCHES;
  const rosterLoads = await Promise.race([
    Promise.all(branches.map(async (branch) => {
      try {
        const response = await fetch(`/api/section-list?branch=${branch}`);
        if (!response.ok) throw new Error("Roster unavailable");
        return { branch, records: parseStudentSectionText(await pdfTextFromResponse(response), branch), error: "" };
      } catch (error) { return { branch, records: [], error: error.message || "Roster unavailable" }; }
    })),
    new Promise((_, reject) => window.setTimeout(() => reject(new Error("The official section lists took too long to load. Please try again.")), 45000))
  ]);
  const successfulLoads = rosterLoads.filter((entry) => entry.records.length);
  if (!successfulLoads.length) throw new Error("Current official student rosters could not be read.");
  const historicalLoads = await Promise.all(branches.flatMap((branch) => rosterHistorySourcesForBranch(branch).map(async (source) => {
    try {
      const response = await fetch(`/api/section-list?branch=${branch}&history=${encodeURIComponent(source.id || "1")}`);
      if (!response.ok) throw new Error("Historical roster unavailable");
      return { branch, records: parseStudentSectionText(await pdfTextFromResponse(response), branch) };
    } catch { return { branch, records: [] }; }
  })));
  const historyByBranch = new Map();
  historicalLoads.forEach((entry) => historyByBranch.set(entry.branch, [...(historyByBranch.get(entry.branch) || []), ...entry.records]));
  const loaded = {
    key: cacheKey,
    records: successfulLoads.flatMap((entry) => mergeStudentRosterHistory(entry.records, historyByBranch.get(entry.branch) || [])),
    loadedBranches: successfulLoads.map((entry) => entry.branch),
    unavailableBranches: rosterLoads.filter((entry) => !entry.records.length).map((entry) => entry.branch),
    version: state.sourceRegistry?.version || "current",
    loadedAt: Date.now()
  };
  state.rosterCache = loaded;
  return loaded;
}

function rosterCountRequest(question = "") {
  const q = canonicalTimetableQuestion(question);
  const asksCount = /\b(?:how\s+many|count|total|kitne|kitni|kinne|kinni)\b/.test(q);
  const asksStudents = /\b(?:students?|student|batch|strength)\b/.test(q);
  return asksCount && asksStudents ? { question: q } : null;
}

function rosterCountAnswer(question = "", rosterData = {}) {
  const q = canonicalTimetableQuestion(question);
  const records = Array.isArray(rosterData.records) ? rosterData.records.map(normalizeStudentRecord) : [];
  if (!records.length) return "";
  const choices = [];
  const addChoice = (code, type, filter) => {
    const normalized = cleanText(code).toUpperCase();
    if (!normalized || !new RegExp(`(?:^|[^a-z0-9])${normalized.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(q)) return;
    const count = records.filter(filter).length;
    if (count) choices.push({ code: normalized, type, count });
  };
  [...new Set(records.map((record) => record.subsection).filter(Boolean))].forEach((code) => addChoice(code, "subsection", (record) => record.subsection === code));
  [...new Set(records.map((record) => record.section).filter(Boolean))].forEach((code) => addChoice(code, "section", (record) => record.section === code));
  [...new Set(records.map((record) => record.branch).filter(Boolean))].forEach((code) => addChoice(code, "branch", (record) => String(record.branch).toUpperCase() === code));
  const unique = [...new Map(choices.map((choice) => [`${choice.type}:${choice.code}`, choice])).values()];
  if (!unique.length) return `<p><strong><u>Which branch, section, or subsection should I count?</u></strong></p><p>For example: “How many students are in CSD2?” or “How many EC branch students?”</p>`;
  if (unique.length > 1) return `<p><strong><u>I found more than one roster target:</u></strong></p><p>${escapeHtml(unique.map((choice) => `${choice.code} (${choice.type})`).join(", "))}. Ask for one target at a time so Compass does not combine counts.</p>`;
  const choice = unique[0];
  const partialWarning = rosterData.unavailableBranches?.length ? `<p class="kb-tip">${escapeHtml(rosterData.unavailableBranches.join(", "))} roster source${rosterData.unavailableBranches.length === 1 ? " was" : "s were"} unavailable, so this count may be incomplete.</p>` : "";
  return `<p><strong><u>${escapeHtml(choice.code)}: ${escapeHtml(String(choice.count))} verified student${choice.count === 1 ? "" : "s"}</u></strong></p><p>${escapeHtml(choice.type[0].toUpperCase() + choice.type.slice(1))} count from the current official GNDEC roster.</p>${partialWarning}<p class="answer-source">Read-only result from current official student rosters (${escapeHtml(rosterData.version || "current")}).</p>`;
}

async function lookupStudent(name) {
  const query = normalizeStudentName(name);
  const identifierQuery = normalizeStudentIdentifier(name);
  const looksLikeIdentifier = Boolean(identifierQuery && /\d/.test(identifierQuery) && /^[A-Z0-9]+$/.test(identifierQuery));
  if (query.length < 3 && !looksLikeIdentifier) throw new Error("Enter at least three letters of a name, or an exact CRN, registration, or serial number.");
  const result = $("student-lookup-result");
  result.textContent = "Checking the current official student rosters...";
  let rosterData;
  try { rosterData = await loadCurrentRosterRecords(); }
  catch (error) { throw new Error(`${error.message || "Current official student rosters could not be read."} Your saved profile was not changed.`); }
  const allStudents = rosterData.records;
  const identifierMatches = looksLikeIdentifier ? resolveStudentIdentifierMatches(allStudents, identifierQuery, state.student) : [];
  const exactNameMatches = allStudents.filter((record) => normalizeStudentName(record.name) === query);
  const ranked = query.length >= 3 ? allStudents.map((record) => ({ record, score: studentMatchScore(record, query) })).filter((match) => match.score > 0).sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name)).map((match) => match.record) : [];
  const matches = (identifierMatches.length ? identifierMatches : exactNameMatches.length ? exactNameMatches : ranked).slice(0, 8);
  const automaticallySafe = identifierMatches.length === 1 || exactNameMatches.length === 1;
  if (automaticallySafe && matches.length === 1) {
    applyStudentRecord(matches[0]);
    return;
  }
  const partialWarning = rosterData.unavailableBranches.length ? ` ${rosterData.unavailableBranches.length} branch roster${rosterData.unavailableBranches.length === 1 ? " was" : "s were"} unavailable.` : "";
  const label = identifierMatches.length ? `Identifier matches — choose using section and mentor.${partialWarning}` : exactNameMatches.length ? `More than one exact name match — choose using CRN, section, and mentor.${partialWarning}` : matches.length ? `Closest official name matches — choose carefully.${partialWarning}` : `No current official student match was found. Check the value or try another verified identifier.${partialWarning}`;
  renderStudentMatches(matches, label);
}

function studentDetailFlags(question = "") {
  const q = canonicalTimetableQuestion(question);
  const flags = {
    name: /\bname\b|\bnaam\b|\u0928\u093e\u092e|\u0a28\u0a3e\u0a2e/u.test(q),
    crn: /\bcrn\b|college\s*roll/.test(q),
    serial: /\bserial\b|\bs\.?\s*no\.?\b/.test(q),
    previousSerials: /(?:old|previous|former|purana|pichla)\s+serial|serial\s+history/.test(q),
    registration: /\bregistration\b|\breg\s*(?:no|number)\b/.test(q),
    branch: /\bbranch\b/.test(q),
    section: /\bsection\b/.test(q),
    subsection: /\bsub\s*section\b|\bsubgroup\b/.test(q),
    academicGroup: /\bacademic\s+group\b|\bmentoring\s+group\b/.test(q),
    mentor: /\bmentor\b/.test(q),
    mentorPhone: /\bmentor\b.*\b(?:phone|mobile|contact)\b|\b(?:phone|mobile|contact)\b.*\bmentor\b/.test(q),
    mentorVenue: /\bmentor\b.*\b(?:venue|room|location|place)\b|\b(?:venue|room|location|place)\b.*\bmentor\b/.test(q)
  };
  flags.full = /\b(?:all|every|full|complete)\b.*\b(?:details?|profile|record|information|info)\b|\b(?:details?|profile|record|information|info)\b.*\b(?:all|every|full|complete)\b|\b(?:saari|sari|poori|puri)\s+(?:detail|jankari|jaankari)\b|(?:\u0938\u092d\u0940\s+\u0935\u093f\u0935\u0930\u0923|\u092a\u0942\u0930\u0940\s+\u091c\u093e\u0928\u0915\u093e\u0930\u0940)|(?:\u0a38\u0a3e\u0a30\u0a40|\u0a2a\u0a42\u0a30\u0a40)\s+\u0a1c\u0a3e\u0a23\u0a15\u0a3e\u0a30\u0a40/u.test(q);
  if (flags.previousSerials) flags.serial = false;
  flags.any = Object.entries(flags).some(([key, value]) => key !== "any" && value);
  if (!flags.any) flags.full = true;
  return flags;
}

function looksLikePlainStudentNameQuery(question = "") {
  const q = normalizeStudentName(question);
  const words = q.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 5 || words.some((word) => !/^[a-z][a-z-]{1,29}$/.test(word))) return false;
  // A one-word lookup is useful for names such as “Mohitveer”, but it must
  // not turn ordinary timetable language into a guessed person. This list is
  // deliberately conservative; explicit “find student …” requests still
  // work through their explicit intent path above.
  const blocked = new Set(["a", "after", "afternoon", "all", "am", "an", "and", "are", "around", "as", "at", "before", "between", "can", "check", "class", "classes", "college", "computer", "current", "day", "does", "do", "duration", "earlier", "economics", "evening", "exam", "explain", "faculty", "fees", "first", "for", "free", "from", "give", "gndec", "good", "had", "has", "have", "help", "hello", "holiday", "hostel", "how", "i", "in", "is", "it", "its", "last", "later", "latest", "lecture", "lectures", "location", "many", "math", "maths", "mathematics", "me", "mine", "morning", "my", "new", "next", "night", "of", "on", "or", "parso", "parson", "period", "periods", "physics", "please", "room", "schedule", "science", "shanivar", "show", "subject", "syllabus", "table", "teacher", "tell", "thank", "thanks", "the", "their", "this", "time", "timetable", "timetabel", "timetabl", "timetble", "to", "today", "tomorrow", "total", "update", "verified", "week", "welcome", "what", "when", "where", "which", "who", "with", "workshop", "your", "aaj", "ajj", "batao", "kal", "kalle", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  return !words.some((word) => blocked.has(word));
}

function isHolidayCalendarQuestion(question = "") {
  const q = canonicalTimetableQuestion(question);
  // This guard is intentionally broad. A holiday question must never fall
  // through into a name-only student/faculty lookup just because it is short
  // (for example, “all holidays” or “September holidays”).
  if (/\b(?:holiday|holidays|vacation|vacations|gazetted|restricted|half\s*-?\s*day|off\s+day|chutti|chhutti|chuttiyan)\b/.test(q)
    || /\b(?:diwali|dussehra|holi|vaisakhi|baisakhi|janam\s+ashtami|gurpurab|independence\s+day|republic\s+day|gandhi\s+jayanti|shivratri|eid|bakrid|christmas|muharram|shaheedi\s+diwas)\b/.test(q)) return true;
  const kernel = globalThis.CompassBrainKernel;
  if (!kernel?.searchHolidays) return false;
  const matches = kernel.searchHolidays(q);
  if (!matches.length) return false;
  const normalized = kernel.normalizeHolidayLookup?.(q) || q;
  const exactName = matches.some((holiday) => [holiday.name, holiday.nameHi, holiday.namePa]
    .some((name) => name && (kernel.normalizeHolidayLookup?.(name) || kernel.normalize(name)) === normalized));
  return exactName || /\b(?:when|date|festival|show|tell|what|which)\b/.test(q);
}

function studentLookupRequest(question = "", rememberedRecord = null) {
  const original = String(question || "").normalize("NFKC").trim();
  const q = canonicalTimetableQuestion(original);
  if (isHolidayCalendarQuestion(q)) return null;
  const refersToSelf = /\b(?:my|mine|mera|meri|mere)\b|\u092e\u0947\u0930[\u093e\u0940\u0947]|\u0a2e\u0947\u0a30[\u0a3e\u0a40\u0a47]/u.test(q);
  if (refersToSelf) return null;
  const explicitStudentCue = /\b(?:student|user|person|profile|record|roll|crn|urn|roster|classmate|peer|batchmate|fresher|freshman)\b/i.test(q);
  const genericReferenceFollowup = /^(?:and\s+)?(?:list|show|name|tell)(?:\s+me)?\s+(?:them|those|these|all)(?:\s+please)?\??$/.test(q);
  if (genericReferenceFollowup && !explicitStudentCue) return null;
  // "ECB vs CS" is a timetable comparison, never a student named "Ec Vs Cs".
  if (/\b(?:vs|versus)\b/i.test(q)) return null;
  // “Batao” is also a roster-search verb, but it must never turn an obvious
  // timetable or syllabus command into a guessed student name.
  if (!explicitStudentCue && /\b(?:timetable|time\s*table|schedule|class(?:es)?|lectures?|periods?|today|tomorrow|aaj|ajj|kal|free|syllabus|units?|physics|chemistry|maths?|mathematics|economics)\b/.test(q)) return null;
  const flags = studentDetailFlags(q);
  const longIdentifierOnly = /^(?:crn|registration|reg(?:istration)?\s*(?:no|number)?)?\s*[:#-]?\s*[a-z0-9-]{4,20}\??$/i.test(q) && /\d/.test(q);
  const serialIdentifierOnly = /^(?:(?:current|new|old|previous)\s+)?(?:serial|s\.?\s*no\.?|sr\.?\s*(?:no\.?|number))\s*[:#-]?\s*\d{1,6}\??$/i.test(q);
  const bareShortSerial = /^\d{1,3}\??$/.test(q);
  const identifierOnly = longIdentifierOnly || serialIdentifierOnly || bareShortSerial;
  const studentSpecificField = flags.crn || flags.registration || flags.serial || flags.previousSerials || flags.section || flags.subsection || flags.branch || flags.academicGroup || flags.mentor || flags.mentorPhone || flags.mentorVenue;
  const explicitFacultyCue = /\b(?:faculty|teacher|professor|prof|dr|doctor|sir|mam|maam|madam|hod|dean|instructor|designation|research|qualification|experience|publications?|vidwan)\b|\b(?:dr|prof)\.?\s+[a-z]/i.test(q);
  if (explicitFacultyCue && !explicitStudentCue && !studentSpecificField) return null;
  const timetableTeacher = state.selectedGroup && referencedTeacherName(q);
  if (timetableTeacher && !explicitStudentCue && !studentSpecificField) return null;
  const namedPossessiveField = !rememberedRecord && studentSpecificField && /\b(?:ka|ki|ke|da|di|de|'s|his|her|their)\b/.test(q);
  const plainName = looksLikePlainStudentNameQuery(q);
  const directIntent = identifierOnly
    || /\b(?:find|search|lookup|locate|verify)\b.*\b(?:student|user|person|profile|record)?\b|\b(?:show|tell|give)\b.*\b(?:student|user|person|profile|record|details?|information|info)\b|\bwho\s+is\b|\btell\s+me\s+about\b|\b(?:details?|profile|record|mentor(?:\s+(?:phone|mobile|contact|venue|room|location))?|section|crn|registration|serial)\s+(?:of|for)\b|\b(?:dhundo|dhoondo|khojo|labho|labh|dasso|batao|dikhao)\b|\u0922\u0942\u0901\u0922|\u0916\u094b\u091c|\u092c\u0924\u093e\u0913|\u0926\u093f\u0916\u093e\u0913|\u0a32\u0a71\u0a2d|\u0a26\u0a71\u0a38\u0a4b|\u0a26\u0a3f\u0a16\u0a3e\u0a13/u.test(q)
    || namedPossessiveField
    || plainName
    || (flags.any && flags.full && /[a-z]{3}/i.test(q))
    || (explicitStudentCue && (flags.any || /[a-z]{3}/i.test(q)));
  const rememberedFollowup = rememberedRecord && flags.any && !directIntent && (
    /\b(?:his|her|their|that\s+student(?:'s)?|this\s+student(?:'s)?|uska|uski|unka|unki)\b/i.test(q)
    || /^(?:and\s+)?(?:what\s+(?:is|are)\s+|show\s+|tell\s+)?(?:mentor(?:\s+(?:phone|mobile|contact|venue|room|location))?|phone|mobile|contact|venue|room|location|section|subsection|branch|crn|registration|serial|academic\s+group|details?|profile)[\s?.,'s-]*$/i.test(q)
  );
  if (rememberedFollowup) return { term: "", flags, followup: true };
  if (!directIntent) return null;
  let term = q
    .replace(/\b(?:who\s+is|tell\s+me\s+about|find|search|look\s*up|lookup|locate|verify|show|tell|give|check|please|dhundo|dhoondo|khojo|labho|labh|dasso|batao|dikhao)\b/g, " ")
    .replace(/\b(?:student|user|person|profile|record|details?|information|info|named|name|about|of|for|by|the|me|all|every|full|complete|current|new|old|previous|former|official|whose|what|is|are|and|aur|te|ka|ki|ke|da|di|de|his|her|their|purana|pichla|saari|sari|poori|puri|jankari|jaankari)\b/g, " ")
    .replace(/\b(?:mentor|phone|mobile|contact|venue|room|location|place|branch|section|subsection|subgroup|academic|group|registration|reg|crn|serial|number|no|roll|urn|roster)\b/g, " ")
    .replace(/[\u0900-\u097f\u0a00-\u0a7f]+/gu, " ")
    .replace(/[^a-z0-9-]+/gi, " ").replace(/\s+/g, " ").trim();
  if (identifierOnly) term = q.replace(/\b(?:current|new|old|previous|crn|registration|reg(?:istration)?|serial|number|no|sr|s|roll|urn)\b/gi, " ").replace(/[^a-z0-9-]+/gi, " ").trim();
  return { term, flags, followup: false };
}

function safeRosterLookupRecord(record = {}) {
  const normalized = normalizeStudentRecord(record);
  return {
    name: normalized.name,
    crn: normalized.crn,
    registrationNo: normalized.registrationNo,
    currentSerialNo: normalized.currentSerialNo,
    oldSerialNos: normalized.oldSerialNos.slice(0, 12),
    branch: normalized.branch,
    section: normalized.section,
    subsection: normalized.subsection,
    academicGroup: normalized.academicGroup,
    mentor: normalized.mentor,
    mentorPhone: normalized.mentorPhone,
    mentorVenue: normalized.mentorVenue
  };
}

function studentLookupContextFromRecords(question, records, metadata = {}, rememberedRecord = null) {
  const request = studentLookupRequest(question, rememberedRecord);
  if (!request) return null;
  const version = String(metadata.version || state.sourceRegistry?.version || "current");
  const unavailableBranches = Array.isArray(metadata.unavailableBranches) ? metadata.unavailableBranches.slice(0, SECTION_LIST_BRANCHES.length) : [];
  if (request.followup && rememberedRecord) return { handled: true, status: "single", query: "", fields: request.flags, records: [safeRosterLookupRecord(rememberedRecord)], version, unavailableBranches, matchKind: "conversation" };
  const term = request.term.trim();
  if (!term || /^(?:all|every|students?|users?)$/i.test(term)) return { handled: true, status: "needs-query", query: term, fields: request.flags, records: [], version, unavailableBranches };
  const safeRecords = (Array.isArray(records) ? records : []).map(normalizeStudentRecord).filter((record) => record.name && record.section);
  const identifier = normalizeStudentIdentifier(term);
  const looksLikeIdentifier = Boolean(identifier && /\d/.test(identifier) && /^[A-Z0-9]+$/.test(identifier));
  const identifierMatches = looksLikeIdentifier ? resolveStudentIdentifierMatches(safeRecords, identifier) : [];
  const normalizedName = normalizeStudentName(term);
  const exactNames = normalizedName.length >= 3 ? safeRecords.filter((record) => normalizeStudentName(record.name) === normalizedName) : [];
  const ranked = normalizedName.length >= 3 ? safeRecords.map((record) => ({ record, score: studentMatchScore(record, normalizedName) })).filter((match) => match.score > 0).sort((left, right) => right.score - left.score || left.record.name.localeCompare(right.record.name)) : [];
  let matches = identifierMatches.length ? identifierMatches : exactNames.length ? exactNames : ranked.map((match) => match.record);
  let matchKind = identifierMatches.length ? "identifier" : exactNames.length ? "exact-name" : matches.length ? "fuzzy-name" : "none";
  if (matchKind === "fuzzy-name" && ranked.length) {
    const confident = ranked[0].score >= 180 && (!ranked[1] || ranked[0].score - ranked[1].score >= 40);
    matches = confident ? [ranked[0].record] : matches.slice(0, 8);
    if (confident) matchKind = "confident-fuzzy-name";
  } else matches = matches.slice(0, 8);
  return {
    handled: true,
    status: matches.length === 1 ? "single" : matches.length > 1 ? "multiple" : "none",
    query: term,
    fields: request.flags,
    records: matches.map(safeRosterLookupRecord),
    version,
    unavailableBranches,
    matchKind
  };
}

async function resolveChatStudentLookup(question) {
  const request = studentLookupRequest(question, state.rosterLookupConversation?.record || null);
  if (!request) return null;
  if (request.followup && state.rosterLookupConversation?.record) return studentLookupContextFromRecords(question, [], { version: state.rosterLookupConversation.version }, state.rosterLookupConversation.record);
  try {
    const rosterData = await loadCurrentRosterRecords();
    const context = studentLookupContextFromRecords(question, rosterData.records, rosterData);
    if (context?.status === "single") state.rosterLookupConversation = { record: context.records[0], version: context.version };
    else if (context) state.rosterLookupConversation = null;
    return context;
  } catch (error) {
    return { handled: true, status: "error", query: request.term, fields: request.flags, records: [], version: state.sourceRegistry?.version || "current", unavailableBranches: [], message: error.message || "Current official student rosters could not be read." };
  }
}

function legacyStudentLookupAnswer(lookup) {
  if (!lookup?.handled) return "";
  const source = "Verified current GNDEC roster";
  const partial = lookup.unavailableBranches?.length ? `<p class="answer-warning">Could not verify: ${escapeHtml(lookup.unavailableBranches.join(", "))} roster${lookup.unavailableBranches.length === 1 ? "" : "s"}.</p>` : "";
  if (lookup.status === "error") return `<p><strong><u>Student lookup unavailable</u></strong></p><p>${escapeHtml(lookup.message || "Try again shortly.")}</p>`;
  if (lookup.status === "needs-query") return "<p><strong><u>Which student?</u></strong></p><p>Give one name, CRN, registration number, or serial number. Compass does not reveal or enumerate the whole roster.</p>";
  if (lookup.status === "none") return `<p><strong><u>No verified student found</u></strong></p><p>No current roster record matched <strong>${escapeHtml(lookup.query)}</strong>. Check the spelling or use an exact CRN.</p>${partial}<p class="answer-source">${escapeHtml(source)}.</p>`;
  if (lookup.status === "multiple") return `<p><strong><u>More than one student may match</u></strong></p><p>Use a CRN or choose more specific spelling:</p><ol>${lookup.records.map((record) => `<li><strong>${escapeHtml(record.name)}</strong> · ${escapeHtml(record.crn ? `CRN ${record.crn}` : `Serial ${record.currentSerialNo || "not published"}`)} · ${escapeHtml([record.section, record.subsection].filter(Boolean).join(" / "))}</li>`).join("")}</ol>${partial}<p class="answer-source">${escapeHtml(source)}.</p>`;
  const record = lookup.records[0];
  const fields = lookup.fields || { full: true };
  const full = fields.full || !fields.any;
  const rows = [];
  const add = (enabled, label, value, missing = "Not published in current roster") => { if (enabled) rows.push(`<strong>${escapeHtml(label)}</strong><br />${escapeHtml(value || missing)}`); };
  add(full || fields.name, "Student name", record.name);
  add(full || fields.branch, "Branch", record.branch);
  add(full || fields.crn, "CRN", record.crn);
  add(full || fields.serial, "Current serial", record.currentSerialNo);
  add(full || fields.previousSerials, "Previous serials", record.oldSerialNos?.join(", "));
  add(full || fields.registration, "Registration No.", record.registrationNo);
  add(full || fields.section, "Section", record.section);
  add(full || fields.subsection, "Subsection", record.subsection);
  add(full || fields.academicGroup, "Academic group", record.academicGroup);
  add(full || fields.mentor, "Mentor", record.mentor);
  add(full || fields.mentorPhone, "Mentor phone", record.mentorPhone);
  add(full || fields.mentorVenue, "Mentor venue", record.mentorVenue);
  return `<p><strong><u>Verified student details</u></strong></p><p>${rows.join("<br /><br />")}</p>${partial}<p class="answer-source">${escapeHtml(source)}. Read-only lookup; your active profile was not changed.</p>`;
}

const FACULTY_DEPARTMENT_ALIASES = Object.freeze([
  ["Electronics & Communication Engineering", /\b(?:ec|ece|electronics(?:\s+and|\s*&)?\s+communication)\b/i],
  ["Computer Science & Engg.", /\b(?:cs|cse|computer\s+science)\b/i],
  ["Information Technology", /\b(?:it|information\s+technology)\b/i],
  ["Electrical Engineering", /\b(?:ee|electrical)\b/i],
  ["Civil Engineering", /\b(?:ce|civil)\b/i],
  ["Mechanical Engineering", /\b(?:me|mechanical)\b/i],
  ["Applied Science", /\b(?:applied\s+science|first\s+year|physics|chemistry|maths?|mathematics)\b/i],
  ["Business Administration", /\b(?:bba|business\s+administration|mba)\b/i],
  ["Computer Applications", /\b(?:bca|mca|computer\s+applications?)\b/i],
  ["Production Engineering", /\b(?:production\s+engineering|pe)\b/i],
  ["School of Architecture", /\b(?:architecture|barch)\b/i],
  ["Computer Center", /\bcomputer\s+cent(?:er|re)\b/i], ["Workshops", /\bworkshops?\b/i], ["Sports", /\bsports?\b/i]
]);

function canonicalFacultyName(value = "") {
  return normalizeStudentName(String(value).replace(/\([^)]*\)/g, " ")).replace(/^(?:dr|er|prof|professor|ar)\s+/, "").trim();
}

function facultyDetailFlags(question = "") {
  const q = canonicalTimetableQuestion(question);
  const flags = {
    designation: /\b(?:designation|position|post|rank)\b/.test(q), email: /\b(?:email|mail|contact)\b/.test(q),
    experience: /\bexperience\b/.test(q), qualifications: /\b(?:qualification|degree|education)\b/.test(q),
    publications: /\b(?:publication|paper|journal|conference)\b/.test(q), memberships: /\b(?:membership|professional body)\b/.test(q),
    research: /\b(?:research|interest|speciali[sz]ation|expertise)\b/.test(q), profile: /\b(?:profile|details?|information|info|about)\b/.test(q)
  };
  flags.full = flags.profile || /\b(?:all|every|full|complete)\b.*\b(?:details?|profile|information|info)\b|\b(?:details?|profile|information|info)\b.*\b(?:of|about)\b/.test(q);
  flags.any = Object.values(flags).some(Boolean);
  if (!flags.any) flags.full = true;
  return flags;
}

function facultyLookupRequest(question = "") {
  const q = canonicalTimetableQuestion(question);
  // Holiday words must always remain on the verified holiday-calendar route;
  // otherwise short phrases such as “next holiday” look like a person's name.
  if (isHolidayCalendarQuestion(q)) return null;
  const department = FACULTY_DEPARTMENT_ALIASES.find(([, pattern]) => pattern.test(q))?.[0] || "";
  let knownTeacher = state.selectedGroup ? referencedTeacherName(q) : "";
  const subjectTeacherCue = /\b(?:who|name|teacher|teachers|faculty|sir|mam|maam|madam|prof|professor|dr|doctor|instructor|teach|teaches|teaching|taught)\b/i.test(q);
  const professionalDetailCue = /\b(?:email|mail|contact|experience|qualification|degree|education|research|interest|speciali[sz]ation|expertise|publications?|papers?|journal|conference|memberships?|vidwan|profile|details?|information|info|designation|position|post)\b/i.test(q);
  const explicitDepartmentCue = /\b(?:department|dept|applied science|computer science|information technology|electrical engineering|civil engineering|mechanical engineering|electronics(?:\s+and|\s*&)?\s+communication)\b/i.test(q);
  const explicitStudentCue = /\b(?:student|roll|crn|urn|roster|registration|classmate|batchmate)\b/i.test(q);
  if (explicitStudentCue && !subjectTeacherCue && !professionalDetailCue) return null;
  if (!knownTeacher && state.selectedGroup && subjectTeacherCue && !explicitDepartmentCue) {
    const subjectClasses = findReferencedClasses(q);
    const subjectTeachers = [...new Set(subjectClasses.flatMap((item) => teacherNames(item.teacher)))];
    // “Math teacher” means the teacher assigned to this student's active
    // timetable, not a directory search for a person named “math”. A request
    // for professional details can continue into the directory only when the
    // timetable identifies exactly one verified person.
    if (subjectClasses.length && !professionalDetailCue) return null;
    if (subjectClasses.length && subjectTeachers.length === 1) knownTeacher = subjectTeachers[0];
    else if (subjectClasses.length) return null;
  }
  const listDepartment = Boolean(department && !knownTeacher && /\b(?:list|show|all|who|names?|faculty|staff|teachers?)\b/.test(q) && !professionalDetailCue);
  const facultyCue = /\b(?:faculty|staff|teacher|professor|prof|doctor|sir|mam|maam|madam|hod|dean|instructor|designation|official\s+email|research|qualification|experience|publications?|vidwan)\b|\b(?:dr|prof)\.?\s+[a-z]/i.test(q);
  const plainName = looksLikePlainStudentNameQuery(q);
  if (!listDepartment && !knownTeacher && !facultyCue && !plainName) return null;
  if (/\b(?:faculty|teacher)\s+timetable\b/.test(q) && !knownTeacher) return null;
  let term = knownTeacher || q
    .replace(/\b(?:find|search|lookup|locate|verify|show|tell|give|please|who|what|which|is|are|about|of|for|the|me|and|ka|ki|ke|da|di|de|all|every|full|complete|official|details?|information|info|profile)\b/g, " ")
    .replace(/\b(?:faculty|staff|teacher|professor|prof|doctor|sir|mam|maam|madam|hod|dean|instructor|designation|position|post|email|mail|contact|experience|qualification|degree|education|research|interest|specialization|specialisation|expertise|publication|publications|paper|papers|journal|conference|membership|memberships|vidwan)\b/g, " ")
    .replace(/\b(?:dr|er|prof|ar)\.?\b/g, " ")
    .replace(/[^a-z0-9@._+-]+/gi, " ").replace(/\s+/g, " ").trim();
  if (department) {
    FACULTY_DEPARTMENT_ALIASES.forEach(([, pattern]) => { term = term.replace(pattern, " "); });
    term = term.replace(/\s+/g, " ").trim();
  }
  return { term: canonicalFacultyName(term), department, listDepartment, fields: facultyDetailFlags(q) };
}

async function loadFacultyDirectory() {
  // The bundled file is only an offline starter set. It must never prevent a
  // lookup from fetching GNDEC's complete current public directory.
  if (state.facultyCache?.records?.length && !state.facultyCache.fallback) return state.facultyCache;
  const bundledFallback = state.facultyCache?.fallback ? state.facultyCache : null;
  try {
    const stored = JSON.parse(localStorage.getItem(FACULTY_DIRECTORY_STORAGE_KEY) || "null");
    if (stored && Number.isFinite(stored.savedAt) && Date.now() - stored.savedAt <= FACULTY_DIRECTORY_MAX_AGE_MS && Array.isArray(stored.payload?.records) && stored.payload.records.length) {
      state.facultyCache = stored.payload;
      return state.facultyCache;
    }
  } catch { /* a corrupt or blocked cache must never break faculty lookup */ }
  if (facultyDirectoryLoading) return facultyDirectoryLoading;
  facultyDirectoryLoading = (async () => {
    const response = await fetch("/api/faculty", { cache: "no-cache" });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.records) || !payload.records.length) throw new Error(payload.error || "Official GNDEC faculty directory could not be read.");
    state.facultyCache = { ...payload, fallback: false };
    try { localStorage.setItem(FACULTY_DIRECTORY_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), payload: state.facultyCache })); } catch { /* caching is optional */ }
    return state.facultyCache;
  })();
  try { return await facultyDirectoryLoading; }
  catch (error) {
    if (bundledFallback?.records?.length) return bundledFallback;
    throw error;
  }
  finally { facultyDirectoryLoading = null; }
}

function facultyTimetableClasses(record = {}) {
  const target = canonicalFacultyName(record.name);
  if (!target || !state.selectedGroup) return [];
  return DAY_NAMES.flatMap((day) => classFor(state.selectedGroup, day)).filter((item) => teacherNames(item.teacher).some((teacher) => canonicalFacultyName(teacher) === target)).slice(0, 30);
}

function cacheEnrichedFacultyRecord(record) {
  if (!record?.profileId || !state.facultyCache?.records?.length) return;
  state.facultyCache.records = state.facultyCache.records.map((candidate) => String(candidate.profileId || "") === String(record.profileId) ? { ...candidate, ...record, timetableClasses: undefined } : candidate);
  try { localStorage.setItem(FACULTY_DIRECTORY_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), payload: state.facultyCache })); } catch { /* caching is optional */ }
}

async function enrichFacultyLookupProfile(lookup) {
  if (lookup?.status !== "single" || !lookup.records?.[0]?.profileId) return lookup;
  const record = lookup.records[0];
  const profileId = String(record.profileId);
  if (record.photoUrl && (record.qualifications || record.experience || record.researchInterests)) return { ...lookup, profilePending: false };
  let loading = facultyProfileLoading.get(profileId);
  if (!loading) {
    loading = (async () => {
      const response = await fetch(`/api/faculty/profile?id=${encodeURIComponent(profileId)}`, { cache: "default" });
      const payload = await response.json();
      if (!response.ok || !payload.profile) return null;
      return payload.profile;
    })();
    facultyProfileLoading.set(profileId, loading);
  }
  try {
    const profile = await loading;
    if (!profile) return { ...lookup, profilePending: false, profileUnavailable: true };
    const enriched = { ...record, ...profile, timetableClasses: facultyTimetableClasses({ ...record, ...profile }) };
    cacheEnrichedFacultyRecord(enriched);
    return { ...lookup, records: [enriched], profilePending: false, profileUnavailable: false };
  } catch { return { ...lookup, profilePending: false, profileUnavailable: true }; }
  finally { if (facultyProfileLoading.get(profileId) === loading) facultyProfileLoading.delete(profileId); }
}

async function resolveChatFacultyLookup(question, options = {}) {
  const request = facultyLookupRequest(question);
  if (!request) return null;
  try {
    const directory = await loadFacultyDirectory();
    const records = directory.records.filter((record) => !request.department || record.department === request.department);
    if (request.listDepartment) return { handled: true, status: "list", query: request.department, records: records.slice(0, 80), fields: request.fields, source: directory.source, checkedAt: directory.checkedAt, unavailableDepartments: directory.unavailableDepartments || [] };
    if (!request.term) return { handled: true, status: "needs-query", query: "", records: [], fields: request.fields, source: directory.source, checkedAt: directory.checkedAt };
    const exact = records.filter((record) => canonicalFacultyName(record.name) === request.term || normalizeStudentName(record.email) === normalizeStudentName(request.term));
    const ranked = records.map((record) => ({ record, score: studentMatchScore(record, request.term) })).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.record.name.localeCompare(right.record.name));
    let matches = exact.length ? exact : ranked.map((item) => item.record);
    if (!exact.length && ranked.length && ranked[0].score >= 180 && (!ranked[1] || ranked[0].score - ranked[1].score >= 40)) matches = [ranked[0].record];
    matches = matches.slice(0, 8);
    if (matches.length === 1) matches[0] = { ...matches[0], timetableClasses: facultyTimetableClasses(matches[0]) };
    const profilePending = options.includeProfile === false && matches.length === 1 && Boolean(matches[0].profileId) && !(matches[0].photoUrl && (matches[0].qualifications || matches[0].experience || matches[0].researchInterests));
    const lookup = { handled: true, status: matches.length === 1 ? "single" : matches.length ? "multiple" : "none", query: request.term, records: matches, fields: request.fields, source: directory.source, checkedAt: directory.checkedAt, unavailableDepartments: directory.unavailableDepartments || [], profilePending };
    return options.includeProfile === false ? lookup : enrichFacultyLookupProfile(lookup);
  } catch (error) {
    return { handled: true, status: "error", query: request.term, records: [], fields: request.fields, message: error.message || "Official GNDEC faculty directory could not be read." };
  }
}

function officialFacultyPhotoUrl(value = "") {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || (url.hostname !== "gndec.ac.in" && url.hostname !== "www.gndec.ac.in")) return "";
    return /\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname) ? url.href : "";
  } catch { return ""; }
}

function facultyPhotoMarkup(record = {}) {
  const profileId = String(record.profileId || "");
  const directImageUrl = officialFacultyPhotoUrl(record.photoUrl);
  if (!directImageUrl || !/^\d{1,8}$/.test(profileId)) return "";
  const name = record.name || "GNDEC faculty member";
  const imageUrl = `/api/faculty/photo?id=${encodeURIComponent(profileId)}`;
  const profileUrl = `https://gndec.ac.in/faculty/?id=${encodeURIComponent(profileId)}`;
  const safeDirectImageUrl = escapeHtml(directImageUrl);
  return `<figure class="faculty-profile-photo"><a class="faculty-photo-link" href="${safeDirectImageUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open the official profile photo of ${escapeHtml(name)}"><img src="${imageUrl}" data-faculty-photo-fallback="${safeDirectImageUrl}" alt="Official GNDEC profile photo of ${escapeHtml(name)}" width="120" height="140" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></a><figcaption><a href="${safeDirectImageUrl}" target="_blank" rel="noopener noreferrer">Open image</a><span aria-hidden="true"> · </span><a href="${profileUrl}" target="_blank" rel="noopener noreferrer">Official profile ↗</a></figcaption></figure>`;
}

function legacyFacultyLookupAnswer(lookup) {
  if (!lookup?.handled) return "";
  const sourceLink = `<a href="${escapeHtml(lookup.source || "https://gndec.ac.in/faculty/")}" target="_blank" rel="noopener noreferrer">Official GNDEC faculty directory ↗</a>`;
  if (lookup.status === "error") return `<p><strong><u>Faculty lookup unavailable</u></strong></p><p>${escapeHtml(lookup.message || "Try again shortly.")}</p>`;
  if (lookup.status === "needs-query") return "<p><strong><u>Which faculty member?</u></strong></p><p>Give a name, department, or official email.</p>";
  if (lookup.status === "none") return `<p><strong><u>No verified faculty match</u></strong></p><p>No official directory record matched <strong>${escapeHtml(lookup.query)}</strong>.</p><p class="answer-source">${sourceLink}</p>`;
  if (lookup.status === "list") return `<p><strong><u>${escapeHtml(lookup.query)} faculty/staff (${lookup.records.length})</u></strong></p><ol>${lookup.records.map((record) => `<li><strong>${escapeHtml(record.name)}</strong> · ${escapeHtml(record.designation)}</li>`).join("")}</ol><p class="answer-source">${sourceLink}</p>`;
  if (lookup.status === "multiple") return `<p><strong><u>More than one faculty member may match</u></strong></p><ol>${lookup.records.map((record) => `<li><strong>${escapeHtml(record.name)}</strong> · ${escapeHtml(record.designation)} · ${escapeHtml(record.department)}</li>`).join("")}</ol><p class="answer-source">${sourceLink}</p>`;
  const record = lookup.records[0];
  const profilePending = Boolean(lookup.profilePending);
  const flags = lookup.fields || { full: true };
  const full = flags.full || !flags.any;
  const rows = [];
  const add = (enabled, label, value, missing = "Not published") => { if (enabled && (!profilePending || (Array.isArray(value) ? value.length : value))) rows.push(`<strong>${escapeHtml(label)}</strong><br />${escapeHtml(Array.isArray(value) ? value.join("; ") : value || missing)}`); };
  add(full || flags.email, "Official directory email", /@/.test(record.email || "") ? record.email : "", "Not published as a valid email");
  add(full || flags.experience, "Experience", record.experience);
  add(full || flags.qualifications, "Qualifications", record.qualifications);
  add(full || flags.publications, "Journal publications", record.journalPublications);
  add(full || flags.publications, "Conference publications", record.conferencePublications);
  add(full || flags.memberships, "Professional memberships", record.memberships);
  add(full || flags.research, "Research interests", record.researchInterests);
  const classes = Array.isArray(record.timetableClasses) ? record.timetableClasses : [];
  const schedule = classes.length ? `<p><strong>Classes in your active timetable</strong></p><ol>${classes.map((item) => `<li><strong>${escapeHtml(item.day)} ${humanTime(item.start)}</strong> · ${escapeHtml(item.subject)} · ${escapeHtml(item.room)}</li>`).join("")}</ol>` : "";
  const subjects = [...new Set(classes.map((item) => item.subject).filter(Boolean))];
  const rooms = [...new Set(classes.map((item) => item.room).filter((room) => room && !/not listed/i.test(room)))];
  const quickFacts = classes.length ? `<p class="faculty-quick-facts"><strong>In your timetable:</strong> ${escapeHtml(subjects.join(", ") || "Subject not listed")} · ${escapeHtml(rooms.join(", ") || "Room not listed")}</p>` : "";
  const profileId = String(record.profileId || "");
  const profileAction = /^\d{1,8}$/.test(profileId) ? `<a class="faculty-profile-action" href="https://gndec.ac.in/faculty/?id=${encodeURIComponent(profileId)}" target="_blank" rel="noopener noreferrer">Open official faculty profile ↗</a>` : "";
  const identity = `<div class="faculty-identity"><strong>${escapeHtml(record.name)}</strong><span>${escapeHtml(record.designation || "Designation not published")}</span><span>${escapeHtml(record.department)}</span>${quickFacts}${profileAction}</div>`;
  const detailContent = `${rows.length ? `<p class="faculty-detail-list">${rows.join("<br /><br />")}</p>` : ""}${schedule}`;
  const expandable = full || rows.length > 3 || classes.length > 2;
  const details = expandable
    ? `<details class="answer-disclosure faculty-details-disclosure"><summary><span>Professional details${classes.length ? " and class schedule" : ""}</span><b aria-hidden="true">+</b></summary><div class="answer-disclosure-body">${detailContent}</div></details>`
    : `<div class="faculty-inline-details">${detailContent}</div>`;
  const enrichmentStatus = profilePending ? '<p class="answer-source faculty-profile-loading">Showing verified directory facts now. Loading the official professional profile and photo…</p>' : lookup.profileUnavailable ? '<p class="answer-warning">The directory facts are verified, but the detailed official profile is temporarily unavailable.</p>' : "";
  return `<p><strong><u>Verified GNDEC faculty details</u></strong></p><div class="faculty-answer-layout">${facultyPhotoMarkup(record)}${identity}</div>${enrichmentStatus}${details}<p class="answer-source">${sourceLink}. Professional public information only.</p>`;
}

function setActiveFacultyAiContext(record, lookup) {
  state.activeFacultyAiContext = record ? {
    facultyDisplayName: record.name, designation: record.designation, department: record.department,
    email: record.email, experience: record.experience, qualifications: record.qualifications,
    journalPublications: record.journalPublications, conferencePublications: record.conferencePublications,
    memberships: record.memberships, researchInterests: record.researchInterests,
    profilePhotoAvailable: Boolean(record.photoUrl), timetableClasses: record.timetableClasses, source: lookup?.source
  } : null;
}

function safeStoredChatHtml(value) {
  const container = document.createElement("div");
  container.innerHTML = String(value || "").slice(0, MAX_CHAT_MESSAGE_HTML);
  const allowedTags = new Set(["A", "B", "BR", "BUTTON", "DETAILS", "DIV", "EM", "FIGCAPTION", "FIGURE", "H2", "H3", "HEADER", "IMG", "LI", "OL", "P", "SECTION", "SMALL", "SPAN", "STRONG", "SUMMARY", "U", "UL"]);
  const allowedAttributes = new Set(["alt", "aria-hidden", "aria-label", "aria-selected", "class", "data-faculty-photo-fallback", "data-kb-followup", "decoding", "height", "href", "loading", "open", "referrerpolicy", "rel", "role", "src", "target", "title", "type", "width"]);
  const officialUrl = (raw) => {
    if (/^\/api\/faculty\/photo\?id=\d{1,8}$/.test(String(raw || ""))) return true;
    try {
      const url = new URL(raw, location.origin);
      return url.protocol === "https:" && (url.hostname === "gndec.ac.in" || url.hostname.endsWith(".gndec.ac.in"));
    } catch { return false; }
  };
  [...container.querySelectorAll("*")].forEach((element) => {
    if (!allowedTags.has(element.tagName)) { element.remove(); return; }
    [...element.attributes].forEach((attribute) => {
      if (!allowedAttributes.has(attribute.name.toLowerCase()) || /^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    });
    if (element.tagName === "A") {
      if (!officialUrl(element.getAttribute("href"))) element.removeAttribute("href");
      else { element.target = "_blank"; element.rel = "noopener noreferrer"; }
    }
    if (element.tagName === "IMG" && !officialUrl(element.getAttribute("src"))) element.remove();
    if (element.tagName === "BUTTON") element.type = "button";
  });
  return container.innerHTML;
}

function ensureChatBubble(role, html) {
  const windowEl = $("chat-window");
  const welcome = $("chat-welcome");
  if (welcome) welcome.hidden = true;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  bubble.setAttribute("role", "article");
  bubble.setAttribute("aria-label", role.includes("user") ? "You" : role.includes("thinking") ? "Compass is working" : "Compass");
  bubble.innerHTML = html;
  if (windowEl) {
    windowEl.appendChild(bubble);
    windowEl.scrollTop = windowEl.scrollHeight;
  }
  return bubble;
}

function persistChat() {
  const windowEl = $("chat-window");
  if (!windowEl) return;
  const messages = [...windowEl.querySelectorAll(".chat-bubble")].slice(-MAX_CHAT_MESSAGES).map((bubble) => ({
    role: bubble.classList.contains("user") ? "user" : "assistant",
    html: bubble.innerHTML.slice(0, MAX_CHAT_MESSAGE_HTML)
  }));
  try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); } catch { /* storage full or blocked */ }
}

function restoreChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY));
    if (!Array.isArray(saved) || !saved.length) return;
    saved.slice(-MAX_CHAT_MESSAGES).forEach((message) => {
      if (!message || typeof message.html !== "string") return;
      ensureChatBubble(message.role === "user" ? "user" : "assistant", safeStoredChatHtml(message.html));
    });
    // Model diagnostics are visible only on an enrolled Kaushik admin device.
    const windowEl = $("chat-window");
    if (!hasAdminAiView() && windowEl) windowEl.querySelectorAll(".answer-model, .answer-source").forEach((element) => {
      if (/(nvidia|meta\/|openai\/|muse|nemotron|gpt-oss)/i.test(element.textContent || "") || element.classList.contains("answer-model")) element.remove();
    });
    const lastAssistant = windowEl && hasAdminAiView() ? [...windowEl.querySelectorAll(".chat-bubble.assistant .answer-source")].pop() : null;
    const badge = $("chat-model-name");
    if (lastAssistant && badge) badge.textContent = lastAssistant.textContent.split("/").pop().replace(/-/g, " ");
  } catch { localStorage.removeItem(CHAT_STORAGE_KEY); }
}

async function askAi(question, heavy = false) {
  const requestedModel = adminRequestedModel();
  const adminDeep = adminAiMode() === "gpt-oss";
  const useHeavy = adminDeep || heavy;
  const thinking = ensureChatBubble("assistant thinking", useHeavy ? "<p><strong>Preparing a detailed answer…</strong></p>" : "<p><strong>Thinking with your college data...</strong></p>");
  const controller = new AbortController();
  // The Worker can try the selected model and one fallback inside this window.
  // Do not leave a student staring at an indefinite “Connecting” state.
  const timeout = window.setTimeout(() => controller.abort(), useHeavy ? 110000 : 90000);
  const windowEl = $("chat-window");
  const scrollToBottom = () => { if (windowEl) windowEl.scrollTop = windowEl.scrollHeight; };
  try {
    let comparisonStudents = [];
    try {
      if (state.sourceRegistry && state.groups.length) {
        const rosterData = await loadCurrentRosterRecords();
        if (rosterData && Array.isArray(rosterData.records)) {
          const qLower = question.toLowerCase();
          const matches = rosterData.records
            .filter(r => r.name && r.name.length > 5 && qLower.includes(r.name.toLowerCase()))
            .map(r => ({
              name: r.name,
              branch: r.branch,
              section: r.section,
              subsection: r.subsection,
              timetable: DAY_NAMES.flatMap((day) => classFor(r.academicGroup, day))
            }));
          if (matches.length > 0) comparisonStudents = matches.slice(0, 5);
        }
      }
    } catch (e) {}

    const externalQuestion = redactSensitiveAiText(question);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Compass-Device": compassDeviceId() },
      body: JSON.stringify({ question: externalQuestion, context: assistantContext(question, comparisonStudents), heavy: useHeavy, ...(requestedModel ? { model: requestedModel } : {}), ...(hasAdminAiView() ? { adminProfile: activeStudentProfile() } : {}), stream: true }),
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      // Live answer: switch the thinking bubble into a streaming answer bubble.
      let model = "";
      let fallback = false;
      let collected = "";
      thinking.className = "chat-bubble assistant streaming";
      thinking.innerHTML = hasAdminAiView() ? '<p class="answer-model">AI response</p><p class="answer-body"></p><p class="answer-source answer-source-stream">Connecting…</p>' : '<p class="answer-body"></p>';
      const bodyEl = thinking.querySelector(".answer-body");
      const sourceEl = thinking.querySelector(".answer-source-stream");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
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
          if (payload.model) {
            model = payload.model;
            fallback = payload.fallback === true;
            if (hasAdminAiView()) {
              const badge = $("chat-model-name");
              if (badge) badge.textContent = model.split("/").pop().replace(/-/g, " ");
              if (sourceEl) sourceEl.textContent = `Streaming from ${model}${fallback ? " (fallback model)" : ""}…`;
            }
          } else if (typeof payload.delta === "string") {
            collected += payload.delta;
            // Plain text while streaming is much cheaper than re-parsing markup
            // on every chunk; final formatting happens when the stream ends.
            bodyEl.textContent = collected;
            scrollToBottom();
          } else if (payload.done) {
            // finalize below
          } else if (payload.error) {
            throw new Error(payload.error);
          }
        }
      }
      if (!model && !collected) throw new Error("The AI returned no answer.");
      thinking.className = "chat-bubble assistant";
      const verifiedOverride = verifiedAiAnswerOverride(question, collected);
      thinking.innerHTML = verifiedOverride || aiAnswerMarkup(collected, model, fallback);
      if (verifiedOverride && hasAdminAiView()) {
        const badge = $("chat-model-name");
        if (badge) badge.textContent = "Compass";
      }
    } else {
      // Non-streaming fallback (older worker / error pages).
      let payload = {};
      if (contentType.includes("application/json")) {
        payload = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text.trim() || `AI request failed (HTTP ${response.status}).`);
      }
      if (!response.ok) throw new Error(payload.error || "AI request failed.");
      thinking.className = "chat-bubble assistant";
      const verifiedOverride = verifiedAiAnswerOverride(question, payload.answer);
      thinking.innerHTML = verifiedOverride || aiAnswerMarkup(payload.answer, payload.model, payload.fallback === true);
      if (hasAdminAiView()) {
        const badge = $("chat-model-name");
        if (badge) badge.textContent = verifiedOverride ? "Compass" : payload.model.split("/").pop().replace(/-/g, " ");
      }
    }
  } catch (error) {
    thinking.className = "chat-bubble assistant";
    const localAnswer = answerWithoutAi(question);
    thinking.innerHTML = localAnswer || localClarificationAnswer();
    if (hasAdminAiView()) {
      const badge = $("chat-model-name");
      if (badge) badge.textContent = "Compass";
    }
  } finally {
    window.clearTimeout(timeout);
  }
  scrollToBottom();
  persistChat();
}

async function unlockAdminAi() {
  const profile = activeStudentProfile();
  if (!isKaushikAdminProfile()) {
    ensureChatBubble("assistant", "<p><strong><u>Admin mode is unavailable.</u></strong></p><p>It can only be enrolled from Kaushik Jain's saved Compass profile.</p>");
    return;
  }
  const bubble = ensureChatBubble("assistant thinking", "<p><strong>Enrolling this device for admin AI access…</strong></p>");
  try {
    const response = await fetch("/api/admin/ai/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Compass-Device": compassDeviceId() },
      body: JSON.stringify({ profile })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Admin unlock failed.");
    localStorage.setItem(AI_ADMIN_VIEW_STORAGE_KEY, JSON.stringify({ expiresAt: payload.expiresAt, profileFingerprint: adminProfileFingerprint(profile) }));
    renderAdminAiVisibility();
    bubble.className = "chat-bubble assistant";
    bubble.innerHTML = `<p><strong><u>Admin AI mode is active.</u></strong></p><p>This exact profile, device, and current network now have unlimited AI access until ${escapeHtml(new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(payload.expiresAt)))}. Changing the name, CRN, registration, profile, timetable selection, device, or network hides admin controls and requires sending KKJ again.</p>`;
  } catch (error) {
    bubble.className = "chat-bubble assistant";
    bubble.innerHTML = `<p><strong><u>Admin unlock failed.</u></strong></p><p>${escapeHtml(error.message || "Check this device's saved profile.")}</p>`;
  }
}

let activeToastTimeout = null;
function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
  if (activeToastTimeout) window.clearTimeout(activeToastTimeout);
  activeToastTimeout = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function academicOverlayFromSchedule(schedule, profile = activeStudentProfile()) {
  const academicGroup = cleanText(profile.academicGroup);
  if (!academicGroup) return [];
  return sanitizeSchedule(schedule).filter((entry) => entry.group === academicGroup);
}

async function importHtml(html, source, sourceInfo = {}, subgroupHtml = "") {
  const schedule = parseFetTimetable(html);
  if (!schedule.length) throw new Error("No class entries were found. Choose the published FET group timetable HTML file.");
  const subgroupSchedule = subgroupHtml ? parseFetTimetable(subgroupHtml) : [];
  if (subgroupHtml && !subgroupSchedule.length) throw new Error("The verified subgroup timetable could not be read.");
  saveData(schedule, source, sourceInfo, academicOverlayFromSchedule(subgroupSchedule));
  showToast(`${schedule.length} class entries loaded for ${state.groups.length} groups.`);
}

async function refreshAcademicOverlay() {
  const academicGroup = cleanText(activeStudentProfile().academicGroup);
  if (!state.schedule.length || !academicGroup || !state.sourceRegistry) return;
  try {
    const response = await fetch("/api/timetable?source=subgroups", { cache: "no-cache" });
    if (!response.ok) return;
    const overlay = academicOverlayFromSchedule(parseFetTimetable(await response.text()));
    // A successful official subgroup file is authoritative even when the
    // student's old academic group no longer appears in a newer release.
    state.academicOverlay = overlay;
    state.academicOverlayGroup = academicGroup;
    persistTimetableCache();
    renderEverything();
  } catch { /* the section timetable remains safe and usable without an overlay */ }
}

async function loadSourceRegistry({ refresh = false } = {}) {
  const response = await fetch(`/api/sources${refresh ? "?refresh=1" : ""}`, { cache: "no-cache" });
  if (!response.ok) throw new Error("Unable to check official GNDEC sources.");
  state.sourceRegistry = await response.json();
  renderStatus();
  renderReferenceLinks();
  return state.sourceRegistry;
}

function timetableSourceRevision(registry = state.sourceRegistry) {
  return ["groups", "subgroups"].map((id) => (registry?.sources || []).find((source) => source.id === id)?.contentHash || "").join("|");
}

function currentTimetableSourceFooter(registry = state.sourceRegistry) {
  const source = (registry?.sources || []).find((item) => item.id === "groups");
  return cleanText(source?.sourceFooter || "").slice(0, 100);
}

function isPreviousVerifiedTimetableResponse(response) {
  return response?.headers?.get("X-GNDEC-Fallback") === "previous-verified";
}

function loadedTimetableSourceInfo(registry, groupsResponse) {
  if (!isPreviousVerifiedTimetableResponse(groupsResponse)) return registry;
  const version = cleanText(groupsResponse.headers.get("X-GNDEC-Version") || "Previous verified fallback").slice(0, 100);
  const sourceFooter = cleanText(groupsResponse.headers.get("X-GNDEC-Source-Footer") || "").slice(0, 100);
  const sourceUrl = cleanText(groupsResponse.headers.get("X-GNDEC-Resolved-Url") || "").slice(0, 1000);
  return {
    ...registry,
    version,
    // This intentionally differs from the live registry version so the next
    // background sync retries the newer complete release instead of treating
    // a temporary fallback as current.
    sources: (registry.sources || []).map((source) => source.id === "groups" ? { ...source, url: sourceUrl || source.url, sourceFooter } : source),
    fallback: { version, sourceFooter, sourceUrl }
  };
}

function decodedReferenceText(link) {
  try { return `${link?.label || ""} ${decodeURIComponent(link?.url || "")}`; }
  catch { return `${link?.label || ""} ${link?.url || ""}`; }
}

function referenceReleaseMonth(url) {
  const match = String(url || "").match(/\/((?:19|20)\d{2})-(0[1-9]|1[0-2])\//);
  return match ? `${match[1]}-${match[2]}` : "";
}

function isStudentRosterReference(link) {
  return /\bbranch\s+students?\b|\bstudent\s+roster\b|\bstudents?\s+sections?\b|\bsections?\s+students?\b|\bpermanent\s+sections?\b|\btemporary\s+sections?\b/i.test(decodedReferenceText(link));
}

function currentTimetableNoticeLinks(extraLinks = [], occupiedUrls = [], currentReleaseMonth = "") {
  const occupied = new Set(occupiedUrls.filter(Boolean));
  const unique = new Map();
  for (const link of extraLinks) {
    let official = false;
    try {
      const url = new URL(link?.url || "");
      official = url.protocol === "https:" && url.hostname === "appsc.gndec.ac.in";
    } catch { /* malformed links are not rendered */ }
    const text = decodedReferenceText(link);
    const month = referenceReleaseMonth(link?.url);
    const looksLikeNotice = /\bone[- ]day\b|\bdate[- ]specific\b|\brotation\b|\bactivity\b|\blecture\b|\bschedule\b|\btime\s*table\b|\btimetable\b/i.test(text);
    if (official && looksLikeNotice && !isStudentRosterReference(link) && !occupied.has(link.url) && (!currentReleaseMonth || !month || month >= currentReleaseMonth)) unique.set(link.url, link);
  }
  return [...unique.values()]
    .sort((left, right) => referenceReleaseMonth(right.url).localeCompare(referenceReleaseMonth(left.url)) || String(left.label || "").localeCompare(String(right.label || "")))
    .slice(0, 12);
}

function renderReferenceLinks() {
  const container = $("reference-links");
  if (!container || !state.sourceRegistry) return;
  const makeLink = (link, prominent = false) => `<a class="${prominent ? "reference-link prominent" : "reference-link"}" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer noopener"><span>${escapeHtml(link.label)}${link.note ? `<small>${escapeHtml(link.note)}</small>` : ""}</span><b aria-hidden="true">↗</b></a>`;
  const makeGroup = (title, note, links, prominent = false) => links.length ? `<section class="reference-group"><div class="reference-group-head"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(note)}</p></div></div><div class="reference-link-grid">${links.map((link, index) => makeLink(link, prominent && index === 0)).join("")}</div></section>` : "";
  const timetableOrder = ["groups", "subgroups", "subjects", "teachers", "rooms", "years"];
  const timetable = timetableOrder.map((id) => (state.sourceRegistry.sources || []).find((source) => source.id === id)).filter(Boolean).map((source) => ({ ...source, note: source.verified ? "Verified current view" : "Official timetable view" }));
  const branchOrder = ["CE", "CS", "EC", "EE", "IT", "ME", "RAI"];
  const studentLists = [...(state.sourceRegistry.studentSectionSources || [])].sort((left, right) => branchOrder.indexOf(left.branch) - branchOrder.indexOf(right.branch)).map((source) => ({ label: `${source.branch} current student roster`, note: source.verified ? "Verified official PDF" : "Official PDF", url: source.url }));
  const profileBranch = branchCodeForProfile(activeStudentProfile());
  const personalList = profileBranch ? studentLists.find((source) => source.label.startsWith(`${profileBranch} `)) : null;
  const currentAcademicCalendar = state.sourceRegistry.academicCalendarSource?.url
    ? { label: state.sourceRegistry.academicCalendarSource.label || "Current academic calendar", note: state.sourceRegistry.academicCalendarSource.verified ? "Verified current official PDF" : "Official PDF", url: state.sourceRegistry.academicCalendarSource.url }
    : { label: "Academic Calendar Jul-Dec 2026", note: "Last verified official PDF", url: "https://gndec.ac.in/sites/default/files/acjul-dec26.pdf" };
  const startHere = [
    { label: "Latest official timetable index", note: `Verified ${state.sourceRegistry.version || "source"}`, url: "https://appsc.gndec.ac.in/time_tables" },
    currentAcademicCalendar,
    { label: "GNDEC Official Holidays 2026", note: "Gazetted holidays", url: "https://gndec.ac.in/sites/default/files/LoH26.pdf" },
    { label: "Academic Calendar Jan-Jun 2026", note: "Academic span", url: "https://gndec.ac.in/sites/default/files/AC%20jan-jun26.pdf" },
    ...(personalList ? [{ ...personalList, label: `My ${profileBranch} current roster` }] : [])
  ];
  const otherStudentLists = personalList ? studentLists.filter((source) => source.url !== personalList.url) : studentLists;
  const groupSourceUrl = (state.sourceRegistry.sources || []).find((source) => source.id === "groups")?.url || "";
  const currentReleaseMonth = referenceReleaseMonth(groupSourceUrl);
  const occupiedUrls = [
    ...timetable.map((item) => item.url),
    ...studentLists.map((item) => item.url),
    state.sourceRegistry.syllabusSource?.url
  ].filter(Boolean);
  const timetableNotices = currentTimetableNoticeLinks(state.sourceRegistry.extraLinks || [], occupiedUrls, currentReleaseMonth);
  const currentSyllabus = state.sourceRegistry.syllabusSource?.url
    ? { label: state.sourceRegistry.syllabusSource.label || "First-year study scheme & syllabus", note: state.sourceRegistry.syllabusSource.verified ? "Current verified official PDF" : "Official PDF", url: state.sourceRegistry.syllabusSource.url }
    : { label: "First-year syllabus", note: "Applied Sciences syllabus page", url: "https://appsc.gndec.ac.in/node/27" };
  const academicLinks = [
    currentSyllabus,
    { label: "First-year syllabus page", note: "Official syllabus index", url: "https://appsc.gndec.ac.in/node/27" },
    { label: "Academic information", note: "Syllabus and academic resources", url: "https://appsc.gndec.ac.in/academics" },
    { label: "Applied Sciences", note: "Department information and study resources", url: "https://appsc.gndec.ac.in/" }
  ];
  const calendarLinks = [
    currentAcademicCalendar,
    { label: "GNDEC List of Holidays 2026 (PDF)", note: "Official Gazetted & Restricted holidays list", url: "https://gndec.ac.in/sites/default/files/LoH26.pdf" },
    { label: "GNDEC Holidays Official Portal", note: "Live statutory and college holiday notices", url: "https://gndec.ac.in/?q=holidays" },
    { label: "Academic Calendar Jan-Jun 2026 (PDF)", note: "Even semester timeline and academic schedule", url: "https://gndec.ac.in/sites/default/files/AC%20jan-jun26.pdf" },
    { label: "GNDEC Academic Calendars Archive", note: "All autonomous academic calendars and revisions", url: "https://gndec.ac.in/?q=node/23" },
    { label: "IKGPTU Academic Notifications", note: "Official university circulars and notices", url: "https://ptu.ac.in/" }
  ];
  const collegeLinks = [
    { label: "GNDEC Main Website", note: "Official college portal", url: "https://gndec.ac.in/" },
    { label: "GNDEC Information Brochure 2026 (PDF)", note: "Autonomous guidelines, course details, and campus rules", url: "https://gndec.ac.in/sites/default/files/IB26.pdf" },
    { label: "Academics & Autonomous Regulations", note: "Credit schemes, attendance criteria, and exam rules", url: "https://gndec.ac.in/?q=node/4" },
    { label: "Campus Facilities & Hostels", note: "Library, dispensary, sports complex, and hostel notices", url: "https://gndec.ac.in/?q=node/34" },
    { label: "GNDEC Faculty Directory", note: "Current public faculty and staff profiles", url: "https://gndec.ac.in/faculty/" },
    { label: "Official Timetable Index", note: "Current and archived timetable releases", url: "https://appsc.gndec.ac.in/time_tables" }
  ];
  container.innerHTML = [
    makeGroup("Start here", "The most useful official links for this device.", startHere),
    makeGroup("Current timetable", "Verified views from the latest official release, in student-first order.", timetable, true),
    makeGroup(personalList ? "Other current student rosters" : "Current student rosters", "Current branch rosters only; historical semester files are intentionally hidden.", otherStudentLists),
    ...(timetableNotices.length ? [makeGroup("Latest timetable notices", "Date-specific schedules and notices published alongside the weekly timetable.", timetableNotices)] : []),
    makeGroup("Academic resources & syllabus", "Current official syllabus and Applied Sciences resources.", academicLinks),
    makeGroup("Academic calendar & holidays", "Official holiday schedules, examination calendars, and autonomous notices.", calendarLinks),
    makeGroup("College services & autonomous portals", "Official GNDEC entry points, regulations, and campus facilities.", collegeLinks)
  ].join("");
}

async function synchronizeStudentProfile() {
  if (state.profileSyncing || !hasStudentProfile() || !state.sourceRegistry) return;
  const profile = activeStudentProfile();
  const branch = branchCodeForProfile(profile);
  const source = rosterSourceForBranch(branch);
  const rosterRevision = rosterRevisionForBranch(branch);
  const stableIdentifiers = [profile.crn, profile.registrationNo].map(normalizeStudentIdentifier).filter(Boolean);
  if (!branch || !source || !stableIdentifiers.length) {
    state.profileSyncStatus = profile.rosterVersion ? "Verified roster" : "Manual profile · search the current roster to verify identifiers";
    renderProfileSummary();
    return;
  }
  if (rosterRevision && profile.rosterRevision === rosterRevision && profile.rosterVersion === state.sourceRegistry.version && Number(profile.rosterSchemaVersion || 0) >= ROSTER_SCHEMA_VERSION) {
    state.profileSyncStatus = "Verified current roster";
    renderProfileSummary();
    return;
  }
  state.profileSyncing = true;
  state.profileSyncStatus = "Checking this profile against the current official roster…";
  renderProfileSummary();
  try {
    const response = await fetch(`/api/section-list?branch=${branch}`, { cache: "no-cache" });
    if (!response.ok) throw new Error("Current branch roster is unavailable");
    let records = parseStudentSectionText(await pdfTextFromResponse(response), branch);
    if (!records.length) throw new Error("Current branch roster format could not be verified");
    const historicalRecords = (await Promise.all(rosterHistorySourcesForBranch(branch).map(async (historySource) => {
      try {
        const historyResponse = await fetch(`/api/section-list?branch=${branch}&history=${encodeURIComponent(historySource.id || "1")}`, { cache: "no-cache" });
        if (!historyResponse.ok) return [];
        return parseStudentSectionText(await pdfTextFromResponse(historyResponse), branch);
      } catch { return []; }
    }))).flat();
    records = mergeStudentRosterHistory(records, historicalRecords);
    const matches = records.filter((record) => stableIdentifiers.some((identifier) => studentIdentifierValues(record).includes(identifier)));
    if (matches.length !== 1) {
      state.profileSyncStatus = matches.length ? "Current roster returned multiple possible profiles · review Profile lookup" : "Saved profile was not found by its stable identifier · search the current roster again";
      renderProfileSummary();
      return;
    }
    applyStudentRecord({ ...matches[0], rosterVersion: state.sourceRegistry.version || "", rosterRevision }, { silent: true });
    state.profileSyncStatus = "Verified current roster";
    renderProfileSummary();
  } catch (error) {
    state.profileSyncStatus = `${error.message || "Profile refresh failed"} · saved profile preserved`;
    renderProfileSummary();
  } finally { state.profileSyncing = false; }
}

async function refreshOfficialData({ discover = true } = {}) {
  const button = $("refresh-button");
  button.disabled = true;
  button.textContent = "Checking official updates...";
  setSourceError();
  try {
    const registry = await loadSourceRegistry({ refresh: discover });
    let [groupsResponse, subgroupsResponse] = await Promise.all([
      fetch("/api/timetable?source=groups", { cache: "no-cache" }),
      fetch("/api/timetable?source=subgroups", { cache: "no-cache" })
    ]);
    if (!groupsResponse.ok || !subgroupsResponse.ok) throw new Error("Unable to contact the complete official timetable release.");
    // A timetable release is only safe as a pair: never combine a newer group
    // view with an older subgroup view. If either source reached its retained
    // fallback, request both views from that same previous verified release.
    if (isPreviousVerifiedTimetableResponse(groupsResponse) || isPreviousVerifiedTimetableResponse(subgroupsResponse)) {
      [groupsResponse, subgroupsResponse] = await Promise.all([
        fetch("/api/timetable?source=groups&fallback=1", { cache: "no-cache" }),
        fetch("/api/timetable?source=subgroups&fallback=1", { cache: "no-cache" })
      ]);
      if (!groupsResponse.ok || !subgroupsResponse.ok || !isPreviousVerifiedTimetableResponse(groupsResponse) || !isPreviousVerifiedTimetableResponse(subgroupsResponse)) {
        throw new Error("The latest official timetable is unavailable and its previous verified release could not be loaded safely.");
      }
    }
    const sourceInfo = loadedTimetableSourceInfo(registry, groupsResponse);
    await importHtml(await groupsResponse.text(), "Official GNDEC group timetable", sourceInfo, await subgroupsResponse.text());
    if (sourceInfo.fallback) setSourceError("The newer official timetable could not be read. Compass is temporarily using the previous verified release and will retry automatically.");
    await synchronizeStudentProfile();
  } catch (error) {
    const message = error.message || "Official data refresh failed.";
    setSourceError(`${message} Your last verified data was preserved; use “Check for updates” to retry.`);
    showToast(message);
    if (!discover) throw error;
  }
  finally { button.disabled = false; button.innerHTML = "Check for updates &amp; reload <span aria-hidden=\"true\">&#8635;</span>"; }
}

async function synchronizeOfficialData() {
  if (state.sourceSyncing) return;
  state.sourceSyncing = true;
  try {
    const registry = await loadSourceRegistry();
    const revision = timetableSourceRevision(registry);
    // The hash catches silent source replacements at the same URL/date.
    if (!state.schedule.length || state.metadata?.version !== registry.version || (revision && state.metadata?.sourceRevision !== revision)) await refreshOfficialData({ discover: false });
    else await synchronizeStudentProfile();
    setSourceError();
  } catch (error) {
    const message = error.message || "Official data could not be checked.";
    setSourceError(`${message} Your last verified data was preserved; use “Check for updates” to retry.`);
    if (!state.schedule.length) showToast(message);
  } finally { state.sourceSyncing = false; }
}

function activatePage(page, updateHash = true) {
  if (!["today", "chat", "timetable", "profile", "settings"].includes(page)) page = "today";
  document.querySelectorAll(".page").forEach((element) => {
    const active = element.dataset.page === page;
    element.classList.toggle("active", active);
    element.hidden = !active;
  });
  document.querySelectorAll(".nav-link, .bottom-link").forEach((element) => {
    const active = element.dataset.pageLink === page;
    element.classList.toggle("active", active);
    if (active) element.setAttribute("aria-current", "page");
    else element.removeAttribute("aria-current");
  });
  closeMobileNavigation();
  if (typeof window !== "undefined") {
    window.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
    if (typeof document !== "undefined") {
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
    $("main-content")?.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
  }
  if (updateHash && location.hash !== `#${page}`) history.pushState(null, "", `#${page}`);
  localStorage.setItem("gndec-compass-last-page", page);
  const pageTitles = { today: "Today", chat: "Ask Compass", timetable: "Timetable", profile: "Profile", settings: "Settings" };
  document.title = `${pageTitles[page] || "Today"} | GNDEC Compass`;
  if (page === "timetable") renderWeek();
  if (page === "settings") renderSettingsPage();
  if (page === "chat") { const windowEl = $("chat-window"); if (windowEl) windowEl.scrollTop = windowEl.scrollHeight; }
}

function mobileNavigationEnabled() {
  return window.matchMedia?.("(max-width: 860px)").matches ?? window.innerWidth <= 860;
}

function syncMobileNavigationAccessibility() {
  const sidebar = document.querySelector(".sidebar");
  const menu = document.querySelector(".menu-button");
  if (!sidebar || !menu) return;
  const mobile = mobileNavigationEnabled();
  const open = mobile && sidebar.classList.contains("open");
  if (!mobile) sidebar.classList.remove("open");
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  if (mobile) sidebar.setAttribute("aria-hidden", String(!open));
  else sidebar.removeAttribute("aria-hidden");
  sidebar.inert = mobile && !open;
  sidebar.querySelectorAll("a, button").forEach((control) => {
    if (mobile && !open) control.setAttribute("tabindex", "-1");
    else control.removeAttribute("tabindex");
  });
  document.documentElement.classList.toggle("navigation-open", open);
}

function closeMobileNavigation(returnFocus = false) {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  const wasOpen = sidebar.classList.contains("open");
  sidebar.classList.remove("open");
  syncMobileNavigationAccessibility();
  if (returnFocus && wasOpen) document.querySelector(".menu-button")?.focus();
}

function syncMobileViewport() {
  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height || window.innerHeight;
  const keyboardOpen = Boolean(viewport && window.innerHeight - viewportHeight > 150);
  document.documentElement.classList.toggle("keyboard-open", keyboardOpen);
  document.documentElement.style.setProperty("--compass-visual-viewport-height", `${Math.round(viewportHeight)}px`);
}

function registerOfflineShell() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js?v=20260901-3", { scope: "/" }).catch(() => {
      // Service workers are an optional enhancement. The live app and its
      // deterministic fallback continue normally when registration is blocked.
    });
  }, { once: true });
}

function initEvents() {
  // The HTML datalist is a no-script/older-browser fallback. Once the richer
  // accessible listbox is running, detach it to avoid two dropdowns at once.
  if ($("question-live-suggestions")) $("question-input")?.removeAttribute("list");
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const targetPage = link.dataset.pageLink || link.getAttribute("href")?.replace(/^#/, "");
      if (targetPage) activatePage(targetPage);
    });
  });
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); activatePage(button.dataset.go); }));
  document.querySelectorAll("[data-focus]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    const target = $(button.dataset.focus);
    if (!target) return;
    target.scrollIntoView?.({ behavior: "smooth", block: "center" });
    window.setTimeout(() => target.focus(), 220);
  }));
  $("group-select").addEventListener("change", (event) => { resetBrainConversation(); state.selectedGroup = event.target.value; state.selectedSubgroup = ""; localStorage.setItem(GROUP_STORAGE_KEY, state.selectedGroup); recordGroupUsage(state.selectedGroup); hydrateGroupControls(); renderTimetableSearchSuggestions(); renderEverything(); showToast(`${state.selectedGroup} is now your timetable.`); });
  $("subgroup-select").addEventListener("change", (event) => { resetBrainConversation(); state.selectedSubgroup = event.target.value; localStorage.setItem(SUBGROUP_STORAGE_KEY, state.selectedSubgroup); renderEverything(); });
  $("timetable-group").addEventListener("change", (event) => { resetBrainConversation(); state.selectedGroup = event.target.value; state.selectedSubgroup = ""; localStorage.setItem(GROUP_STORAGE_KEY, state.selectedGroup); recordGroupUsage(state.selectedGroup); hydrateGroupControls(); renderTimetableSearchSuggestions(); renderEverything(); });
  $("timetable-search").addEventListener("input", renderWeek);
  $("question-input").addEventListener("input", updateQuestionSuggestions);
  $("question-input").addEventListener("focus", updateQuestionSuggestions);
  $("question-input").addEventListener("blur", (event) => {
    if ($("question-live-suggestions")?.contains(event.relatedTarget)) return;
    window.setTimeout(() => {
      if (!$("question-live-suggestions")?.contains(document.activeElement)) closeQuestionSuggestions();
    }, 180);
  });
  $("question-input").addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (moveQuestionSuggestion(event.key === "ArrowDown" ? 1 : -1)) event.preventDefault();
      return;
    }
    if (event.key === "Escape") { closeQuestionSuggestions(); return; }
    if (event.key === "Enter" && state.questionSuggestionIndex >= 0) {
      const options = [...$("question-live-suggestions").querySelectorAll("[data-question-suggestion]")];
      if (chooseQuestionSuggestion(options[state.questionSuggestionIndex])) event.preventDefault();
    }
  });
  $("question-live-suggestions")?.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-question-suggestion]")) event.preventDefault();
  });
  $("question-live-suggestions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-question-suggestion]");
    activateQuestionSuggestion(button);
  });
  $("chat-window")?.addEventListener("click", (event) => {
    const refineButton = event.target.closest(".inline-chip[data-refine]");
    if (refineButton) {
      $("question-input").value = refineButton.dataset.refine || "";
      submitQuestionForm();
      return;
    }
    const button = event.target.closest("[data-kb-followup]");
    if (!button) return;
    $("question-input").value = button.dataset.kbFollowup || "";
    submitQuestionForm();
  });
  $("chat-window")?.addEventListener("error", (event) => {
    const image = event.target?.closest?.("img[data-faculty-photo-fallback]");
    if (!image || image.dataset.facultyPhotoFallbackUsed === "true") return;
    const fallbackUrl = officialFacultyPhotoUrl(image.dataset.facultyPhotoFallback);
    if (!fallbackUrl) return;
    image.dataset.facultyPhotoFallbackUsed = "true";
    image.src = fallbackUrl;
  }, true);
  $("refresh-button").addEventListener("click", refreshOfficialData);
  $("review-timetable-update")?.addEventListener("click", () => {
    activatePage("settings");
    window.setTimeout(() => $("timetable-update-center")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  });
  $("mark-timetable-update-seen")?.addEventListener("click", markTimetableUpdateSeen);
  $("file-import").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!hasAdminAiView()) {
      event.target.value = "";
      renderAdminAiVisibility();
      showToast("Admin authorization required. Verify Kaushik Jain's profile and send KKJ again.");
      return;
    }
    try { await importHtml(await file.text(), `Imported: ${file.name}`); } catch (error) { showToast(error.message); }
    event.target.value = "";
  });
  $("student-lookup-form").addEventListener("submit", async (event) => { event.preventDefault(); const name = $("student-name-input").value; recordStudentSearch(name); try { await lookupStudent(name); } catch (error) { $("student-lookup-result").textContent = error.message || "Student lookup could not be completed."; } });
  $("save-manual-profile")?.addEventListener("click", saveManualProfile);
  $("day-plan-toggle")?.addEventListener("click", (event) => { state.dayPlanOverride = event.currentTarget.dataset.planTarget || ""; renderDaySchedule(); });
  $("admin-ai-mode")?.addEventListener("change", (event) => { if (!hasAdminAiView()) return; localStorage.setItem(ADMIN_AI_MODE_STORAGE_KEY, event.target.value); renderAdminAiVisibility(); showToast(`Admin answer mode: ${event.target.options[event.target.selectedIndex].text}`); });
  $("question-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawQuestion = $("question-input").value.trim();
  if (!rawQuestion) return;
  $("question-input").value = "";
  closeQuestionSuggestions();

  // Multi-Intent Splitter (Hinglish/English)
  const queries = rawQuestion.split(/\s+(?:and|aur|te|also|plus)\s+(?=(?:what|when|where|who|is|are|tell|show|find|whose|how|kado|kadon|kab|kithe|kaha|kon|kaun|keda|whose)\b)|[?.,;]\s+/i).map(q => q.trim()).filter(Boolean);

  for (const q of queries) {
    await (async () => {
      const question = q;
      const adminCommand = question.match(/^kkj$/i);
    if (adminCommand) {
      ensureChatBubble("user", "<strong>KKJ admin request</strong>");
      await unlockAdminAi();
      persistChat();
      return;
    }
    ensureChatBubble("user", `<strong>${escapeHtml(question)}</strong>`);
    state.activeFacultyAiContext = null;
    const mentoringAnswer = mentoringClassAnswer(question);
    if (mentoringAnswer) {
      ensureChatBubble("assistant", mentoringAnswer);
      persistChat();
      return;
    }
    // Resolve "named student vs me" before generic named timetable handling.
    // The person is verified against the current roster and only then mapped
    // to a timetable code for the bounded local comparison engine.
    if (namedPersonComparisonRequest(question)) {
      const comparisonBubble = ensureChatBubble("assistant thinking", "<p><strong>Checking the current official roster and timetables…</strong></p>");
      const comparisonAnswer = await resolveNamedPersonComparisonAnswer(question);
      if (comparisonAnswer) {
        comparisonBubble.className = "chat-bubble assistant";
        comparisonBubble.innerHTML = `${comparisonAnswer}${followupSuggestions(question)}`;
        persistChat();
        return;
      }
      comparisonBubble.remove();
    }
    // A name-only timetable request must never fall through to the active
    // device profile. Resolve it from current official sources first, without
    // applying a roster record or changing the user's timetable selection.
    if (namedPersonTimetableRequest(question)) {
      const lookupBubble = ensureChatBubble("assistant thinking", "<p><strong>Checking current official student and faculty timetables…</strong></p>");
      const namedTimetableAnswer = await resolveNamedPersonTimetableAnswer(question);
      if (namedTimetableAnswer) {
        lookupBubble.className = "chat-bubble assistant";
        lookupBubble.innerHTML = `${namedTimetableAnswer}${followupSuggestions(question)}`;
        persistChat();
        return;
      }
      lookupBubble.remove();
    }
    const requestedView = requestedOfficialTimetableView(question);
    if (requestedView) {
      const viewBubble = ensureChatBubble("assistant thinking", "<p><strong>Checking the verified official timetable…</strong></p>");
      try {
        await loadOfficialTimetableView(requestedView);
        const officialViewAnswer = officialTimetableViewAnswer(question);
        viewBubble.className = "chat-bubble assistant";
        viewBubble.innerHTML = officialViewAnswer || "<p><strong><u>Choose a timetable entry.</u></strong></p><p>Name the faculty member, room, subject, programme, section, or subsection you want to check.</p>";
      } catch (error) {
        viewBubble.className = "chat-bubble assistant";
        viewBubble.innerHTML = `<p><strong><u>Official timetable unavailable</u></strong></p><p>${escapeHtml(error.message || "Please try again.")}</p>`;
      }
      persistChat();
      return;
    }
    const explicitSelectionAnswer = explicitTimetableSelectionAnswer(question);
    if (explicitSelectionAnswer) {
      ensureChatBubble("assistant", explicitSelectionAnswer);
      persistChat();
      return;
    }
    const contextualAnswer = contextualLocalFollowupAnswer(question);
    if (contextualAnswer) {
      ensureChatBubble("assistant", contextualAnswer);
      persistChat();
      return;
    }
    const workflowAnswer = approvedCompassWorkflowAnswer(question);
    if (workflowAnswer) {
      ensureChatBubble("assistant", `${workflowAnswer}${followupSuggestions(question)}`);
      persistChat();
      return;
    }
    const countRequest = rosterCountRequest(question);
    if (countRequest) {
      const countBubble = ensureChatBubble("assistant thinking", "<p><strong>Counting the current official student roster…</strong></p>");
      try {
        const rosterData = await loadCurrentRosterRecords();
        countBubble.className = "chat-bubble assistant";
        countBubble.innerHTML = `${rosterCountAnswer(countRequest.question, rosterData)}${followupSuggestions(question)}`;
      } catch (error) {
        countBubble.className = "chat-bubble assistant";
        countBubble.innerHTML = `<p><strong><u>Official roster count unavailable</u></strong></p><p>${escapeHtml(error.message || "Please try again.")}</p>`;
      }
      persistChat();
      return;
    }
    // Student roster questions are resolved locally before any external AI
    // route. This is a read-only query: it never calls applyStudentRecord(),
    // never changes the active timetable, and never sends identifiers away.
    let unmatchedPlainStudentLookup = null;
    if (studentLookupRequest(question, state.rosterLookupConversation?.record || null)) {
      const lookupBubble = ensureChatBubble("assistant thinking", "<p><strong>Checking current verified student rosters…</strong></p>");
      const studentLookup = await resolveChatStudentLookup(question);
      if (studentLookup?.status === "none" && looksLikePlainStudentNameQuery(question)) {
        // A plain person name might be a faculty member. Keep the verified
        // roster miss so the next directory lookup can give one clear result.
        unmatchedPlainStudentLookup = studentLookup;
        lookupBubble.remove();
      } else {
        const lookupBrainResult = runCompassBrain(question, globalThis.CompassBrainV2, { studentLookup });
        lookupBubble.className = "chat-bubble assistant";
        const lookupAnswer = lookupBrainResult?.answer || legacyAnswerWithoutAi(question, studentLookup);
        lookupBubble.innerHTML = `${lookupAnswer}${followupSuggestions(question, lookupBrainResult)}`;
        persistChat();
        return;
      }
    }
    // Public professional faculty facts come from GNDEC's own directory. This
    // runs after the private roster guard, so student identifiers can never be
    // diverted into an external answer path.
    if (facultyLookupRequest(question)) {
      const lookupBubble = ensureChatBubble("assistant thinking", "<p><strong>Checking the official GNDEC faculty directory…</strong></p>");
      let facultyLookup = await resolveChatFacultyLookup(question, { includeProfile: false });
      let facultyRecord = facultyLookup?.status === "single" ? facultyLookup.records[0] : null;
      setActiveFacultyAiContext(facultyRecord, facultyLookup);
      if (facultyRecord && adminAiMode() !== "local-only" && (adminForcesActualAi() || shouldUseActualAi(question))) {
        facultyLookup = await enrichFacultyLookupProfile(facultyLookup);
        facultyRecord = facultyLookup?.records?.[0] || facultyRecord;
        setActiveFacultyAiContext(facultyRecord, facultyLookup);
        lookupBubble.remove();
        await askAi(question, isHeavyQuestion(question));
      } else {
        const lookupBrainResult = runCompassBrain(question, globalThis.CompassBrainV2, { facultyLookup });
        const lookupAnswer = unmatchedPlainStudentLookup && facultyLookup?.status === "none"
          ? `<p><strong><u>No verified student or faculty match</u></strong></p><p>No current GNDEC student roster or faculty directory record matched <strong>${escapeHtml(unmatchedPlainStudentLookup.query)}</strong>. Check the spelling, or use a student CRN.</p>`
          : lookupBrainResult?.answer || legacyFacultyLookupAnswer(facultyLookup);
        lookupBubble.className = "chat-bubble assistant";
        lookupBubble.innerHTML = `${lookupAnswer}${followupSuggestions(question, lookupBrainResult)}`;
        persistChat();
        if (facultyRecord?.profileId && !(facultyRecord.photoUrl && (facultyRecord.qualifications || facultyRecord.experience || facultyRecord.researchInterests))) {
          const enrichedLookup = await enrichFacultyLookupProfile(facultyLookup);
          const enrichedRecord = enrichedLookup?.records?.[0];
          if (enrichedRecord && enrichedRecord !== facultyRecord) {
            facultyLookup = enrichedLookup;
            facultyRecord = enrichedRecord;
            setActiveFacultyAiContext(facultyRecord, facultyLookup);
            const enrichedBrainResult = runCompassBrain(question, globalThis.CompassBrainV2, { facultyLookup });
            lookupBubble.innerHTML = `${enrichedBrainResult?.answer || legacyFacultyLookupAnswer(facultyLookup)}${followupSuggestions(question, enrichedBrainResult)}`;
          }
        }
      }
      persistChat();
      return;
    }
    if (unmatchedPlainStudentLookup) {
      ensureChatBubble("assistant", `<p><strong><u>No verified student or faculty match</u></strong></p><p>No current GNDEC student roster or faculty directory record matched <strong>${escapeHtml(unmatchedPlainStudentLookup.query)}</strong>. Check the spelling, or use a student CRN.</p>${followupSuggestions(question)}`);
      persistChat();
      return;
    }
    // Choosing Muse or GPT-OSS is an explicit admin instruction to use that
    // real model. Local-first and Local-only continue through Compass's
    // deterministic routes below.
    if (adminForcesActualAi()) {
      await askAi(question, adminAiMode() === "gpt-oss" || isHeavyQuestion(question));
      persistChat();
      return;
    }
    // Brain 2.0 handles only verified deterministic results here. Unsupported,
    // uncertain, malformed, or failed results continue into the legacy route.
    const brainResult = runCompassBrain(question);
    if (brainResult?.answer) {
      ensureChatBubble("assistant", `${brainResult.answer}${followupSuggestions(question, brainResult)}`);
      persistChat();
      return;
    }
    // ── Knowledge base: answers instantly with zero AI ──
    const kbResult = answerFromKnowledgeBase(question);
    if (kbResult && kbResult.reply) {
      // Show a brief "thinking" bubble for that AI feel, then show the answer
      ensureChatBubble("assistant", kbResult.reply);
      persistChat();
      return;
    }
    // ── Fallback: existing flow (syllabus, structured, AI, etc.) ──
    const popularAnswer = answerCompassQuestion(question);
    const syllabusQuestion = isSyllabusQuestion(question);
    if (popularAnswer) ensureChatBubble("assistant", `${popularAnswer}${followupSuggestions(question)}`);
    else if (syllabusQuestion && !state.syllabus.length) {
      let loading;
      const loadingTimer = window.setTimeout(() => { loading = ensureChatBubble("assistant thinking", "<p><strong>Preparing the full official syllabus search…</strong></p>"); }, 450);
      try { await loadOfficialSyllabus(); window.clearTimeout(loadingTimer); loading?.remove(); }
      catch (error) {
        window.clearTimeout(loadingTimer);
        loading ||= ensureChatBubble("assistant", "");
        loading.className = "chat-bubble assistant";
        loading.innerHTML = `<p><strong><u>Syllabus unavailable</u></strong></p><p>${escapeHtml(error.message || "Please try again.")}</p>`;
        persistChat(); return;
      }
    }
    if (!popularAnswer) {
      const structured = syllabusQuestion && !isOpenQuestion(question) ? answerSyllabusQuestion(question) : (isStructuredQuestion(question) ? answerStructuredQuestion(question) : "");
      if (structured) ensureChatBubble("assistant", `${structured}${followupSuggestions(question)}`);
      else if (syllabusQuestion && !isOpenQuestion(question)) ensureChatBubble("assistant", `<p><strong><u>Choose a subject.</u></strong></p><p>For example: “Physics syllabus”, “Math units”, or “PPS course outcomes”.</p>${followupSuggestions(question)}`);
      else if (adminAiMode() === "local-only") ensureChatBubble("assistant", "<p><strong><u>Local-only mode is on.</u></strong></p><p>I can answer timetable, profile, syllabus, and built-in Compass questions without AI. Switch the admin mode to Fast or Deep AI for open-ended help.</p>");
      else if (shouldUseActualAi(question)) await askAi(question, isHeavyQuestion(question));
      else ensureChatBubble("assistant", localClarificationAnswer());
    }
    persistChat();
    })();
  }
});

  const clearChat = $("clear-chat");
  if (clearChat) clearChat.addEventListener("click", () => {
    const windowEl = $("chat-window");
    const welcome = $("chat-welcome");
    if (windowEl) windowEl.querySelectorAll(".chat-bubble").forEach((bubble) => bubble.remove());
    if (welcome) welcome.hidden = false;
    localStorage.removeItem(CHAT_STORAGE_KEY);
    state.syllabusConversation = null;
    state.rosterLookupConversation = null;
    localStorage.removeItem(SYLLABUS_CONVERSATION_KEY);
    resetBrainConversation();
  });
  document.querySelectorAll(".question-chips").forEach((container) => {
    container.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      $("question-input").value = button.dataset.quick || button.textContent;
      activatePage("chat");
      window.setTimeout(submitQuestionForm, 60);
    });
  });
  const holidayBanner = $("holiday-banner");
  if (holidayBanner) {
    const handleHolidayBannerAction = (event) => {
      event.preventDefault();
      const holidayName = holidayBanner.dataset.holidayName;
      if (!holidayName) return;
      const questionInput = $("question-input");
      if (questionInput) {
        questionInput.value = `when is ${holidayName.toLowerCase()}`;
      }
      activatePage("chat");
      window.setTimeout(submitQuestionForm, 60);
    };
    holidayBanner.addEventListener("click", handleHolidayBannerAction);
    holidayBanner.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        handleHolidayBannerAction(event);
      }
    });
  }
  $("source-status-button")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.open("https://appsc.gndec.ac.in/time_tables", "_blank", "noopener,noreferrer");
  });
  document.querySelector(".menu-button").addEventListener("click", (event) => {
    if (!mobileNavigationEnabled()) return;
    const sidebar = document.querySelector(".sidebar");
    const opening = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open");
    syncMobileNavigationAccessibility();
    if (opening) window.requestAnimationFrame(() => sidebar.querySelector(".nav-link.active")?.focus());
  });
  $("sidebar-close-button")?.addEventListener("click", () => closeMobileNavigation(true));
  // Settings event listeners
  $("settings-brain-mode")?.addEventListener("change", (e) => {
    saveSettings({ brainMode: e.target.value });
    showToast(`Active Brain: ${e.target.options[e.target.selectedIndex].text}`);
  });
  $("settings-preferred-language")?.addEventListener("change", (e) => {
    saveSettings({ preferredLanguage: e.target.value });
    showToast(`Preferred language: ${e.target.options[e.target.selectedIndex].text}`);
  });
  $("settings-hinglish-chips")?.addEventListener("change", (e) => {
    saveSettings({ showHinglishChips: e.target.checked });
    showToast(`Hinglish chips: ${e.target.checked ? "Enabled" : "Disabled"}`);
  });
  $("settings-dynamic-chips")?.addEventListener("change", (e) => {
    saveSettings({ showDynamicChips: e.target.checked });
    showToast(`Dynamic chips: ${e.target.checked ? "Enabled" : "Disabled"}`);
  });
  $("settings-cgpa-formula")?.addEventListener("change", (e) => {
    saveSettings({ cgpaFormula: e.target.value });
    showToast(`CGPA formula: ${e.target.options[e.target.selectedIndex].text}`);
  });
  $("settings-attendance-target")?.addEventListener("change", (e) => {
    saveSettings({ attendanceTarget: Number(e.target.value) || 76 });
    showToast(`Attendance target: ${e.target.value}%`);
  });
  $("settings-attendance-alerts")?.addEventListener("change", (e) => {
    saveSettings({ attendanceAlerts: e.target.checked });
    showToast(`Attendance alerts: ${e.target.checked ? "Enabled" : "Disabled"}`);
  });
  $("settings-restricted-holidays")?.addEventListener("change", (e) => {
    saveSettings({ showRestrictedHolidays: e.target.checked });
    showToast(`Restricted holidays: ${e.target.checked ? "Included" : "Excluded"}`);
  });
  $("settings-timetable-grid")?.addEventListener("change", (e) => {
    saveSettings({ timetableGridView: e.target.checked });
    const swapRow = $("settings-swap-axes-row");
    if (swapRow) swapRow.hidden = !e.target.checked;
    renderWeek();
    showToast(`Timetable layout: ${e.target.checked ? "Week grid" : "Standard view"}`);
  });
  $("settings-timetable-swap-axes")?.addEventListener("change", (e) => {
    saveSettings({ timetableSwapAxes: e.target.checked });
    renderWeek();
    showToast(e.target.checked
      ? "Transposed Grid Enabled: Days as rows & Time as columns"
      : "Transposed Grid Disabled: Standard vertical columns");
  });
  $("settings-freshness-tag")?.addEventListener("change", (e) => {
    saveSettings({ showFreshnessTag: e.target.checked });
    showToast(`Freshness badges: ${e.target.checked ? "Enabled" : "Disabled"}`);
  });
  $("settings-ai-suggestions")?.addEventListener("change", (e) => {
    saveSettings({ aiSuggestions: e.target.checked });
    showToast(`AI study assistance: ${e.target.checked ? "Enabled" : "Disabled"}`);
  });
  $("settings-compact-view")?.addEventListener("change", (e) => {
    saveSettings({ compactTimetable: e.target.checked });
    showToast(e.target.checked
      ? "Compact Timetable: Enabled (dense layout)"
      : "Compact Timetable: Disabled (standard spacing)");
  });
  $("settings-reduce-motion")?.addEventListener("change", (e) => {
    saveSettings({ reduceMotion: e.target.checked });
    showToast(`Reduce animations: ${e.target.checked ? "Enabled" : "Disabled"}`);
  });
  $("settings-holiday-alerts")?.addEventListener("change", (e) => {
    saveSettings({ holidayAlerts: e.target.checked });
    showToast(`Long weekend alerts: ${e.target.checked ? "Enabled" : "Disabled"}`);
  });
  $("settings-room-locations")?.addEventListener("change", (e) => {
    saveSettings({ roomLocations: e.target.checked });
    showToast(`Campus room hints: ${e.target.checked ? "Enabled" : "Disabled"}`);
  });
  $("theme-accent-picker")?.addEventListener("click", (e) => {
    const dot = e.target.closest(".accent-dot");
    if (!dot) return;
    saveSettings({ themeAccent: dot.dataset.accent });
    showToast(`Accent theme: ${dot.getAttribute("title") || dot.dataset.accent}`);
  });
  $("reset-conversation-btn")?.addEventListener("click", () => {
    resetBrainConversation();
    renderSettingsPage();
    showToast("Conversation memory cleared.");
  });
  // Data & Storage panel removed — export/import/clear listeners removed
  document.querySelector(".sidebar-scrim")?.addEventListener("click", () => closeMobileNavigation(true));
  document.querySelector(".sidebar")?.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !mobileNavigationEnabled() || !event.currentTarget.classList.contains("open")) return;
    const controls = [...event.currentTarget.querySelectorAll("a, button")].filter((control) => control.getAttribute("tabindex") !== "-1");
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

restoreData();
hydrateGroupControls();
populateStudentLookupInput();
initEvents();
registerOfflineShell();
restoreChat();
renderStudentHistory();
const initialHashPage = location.hash.slice(1);
const savedPage = localStorage.getItem("gndec-compass-last-page") || "";
const validPages = ["today", "chat", "timetable", "profile", "settings"];
let pageToActivate = validPages.includes(initialHashPage) ? initialHashPage : null;
if (!pageToActivate) {
  pageToActivate = validPages.includes(savedPage) ? savedPage : (hasStudentProfile() ? "today" : "profile");
}
activatePage(pageToActivate, false);
renderEverything();
synchronizeOfficialData();

// Eagerly fetch new data stores for the Brain
fetch("/data/college-events.json").then(r => r.json()).then(d => { state.collegeEventsCache = d; }).catch(() => {});
fetch("/data/notices.json").then(r => r.json()).then(d => { state.noticesCache = d; }).catch(() => {});
fetch("/data/timetables.json").then(r => r.json()).then(d => { state.timetablesCache = d; }).catch(() => {});
fetch("/data/faculty.json").then(r => r.json()).then(d => {
  if (!state.facultyCache && Array.isArray(d) && d.length) state.facultyCache = { records: d, fallback: true, source: "Bundled offline faculty fallback" };
}).catch(() => {});

const warmSyllabusIndex = () => { if (!state.syllabus.length) loadOfficialSyllabus().catch(() => { /* PDF fallback remains available when asked */ }); };
if ("requestIdleCallback" in window) window.requestIdleCallback(warmSyllabusIndex, { timeout: 1200 });
else window.setTimeout(warmSyllabusIndex, 180);
syncMobileViewport();
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncMobileViewport);
  window.visualViewport.addEventListener("scroll", syncMobileViewport);
}
window.addEventListener("resize", syncMobileViewport);
window.addEventListener("resize", syncMobileNavigationAccessibility);
window.addEventListener("hashchange", () => {
  const page = location.hash.slice(1);
  if (["today", "chat", "timetable", "profile", "settings"].includes(page)) activatePage(page, false);
});
// Keep long-open tabs current without interrupting students who are away.
window.setInterval(() => { if (!document.hidden) synchronizeOfficialData(); }, 15 * 60 * 1000);
window.addEventListener("visibilitychange", () => { if (!document.hidden) synchronizeOfficialData(); });
let lastRenderedMinute = -1;
window.setInterval(() => {
  const now = getIndiaNow();
  const clock = $("clock");
  if (clock && clock.textContent !== now.time12) {
    clock.textContent = now.time12;
    clock.dateTime = compassReferenceDate().toISOString();
  }
  // Re-render the live panels only when the minute changes; ticking the clock
  // every second keeps the time fresh without rebuilding the DOM constantly.
  if (now.minutes !== lastRenderedMinute) {
    lastRenderedMinute = now.minutes;
    renderLive();
    renderDaySchedule();
    
    // Adaptive Glassmorphism (time-of-day shifting)
    const h = Number(now.time24.split(":")[0]);
    document.body.classList.remove("theme-morning", "theme-afternoon", "theme-night");
    if (h >= 5 && h < 12) document.body.classList.add("theme-morning");
    else if (h >= 12 && h < 18) document.body.classList.add("theme-afternoon");
    else document.body.classList.add("theme-night");
  }
}, 1000);
// Press "/" anywhere to jump to the chat input.
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector(".sidebar")?.classList.contains("open")) {
    closeMobileNavigation(true);
    return;
  }
  if (event.key !== "/") return;
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
  event.preventDefault();
  activatePage("chat");
  window.setTimeout(() => $("question-input").focus(), 30);
});

// ══════════════════════════════════════════════════════════════════════════
// “AI chat without AI” — popular knowledge base (fully local, zero AI cost).
// ══════════════════════════════════════════════════════════════════════════

function kbClean(value) {
  return String(value).normalize("NFKC").replace(/\s+/g, " ").toLowerCase().trim();
}
function kbHas(q, patterns) { return patterns.some((p) => p.test(q)); }

const KB_GREETING = [/^(hi|hii+|hello|hey|heyy+|namaste|namaskar|sat\s?sri\s?akal|satsriakal|hola|yo|good\s+(morning|afternoon|evening))\b/];
const KB_THANKS = [/thank|thanks|thx|shukriya|dhanyava?d|dhanyavad|tusi\s+great|bohat\s+shukriya|ਧੰਨਵਾਦ|धन्यवाद|शुक्रिया/];
const KB_HELP = [/what\s+(can|do|all)\s+you|how\s+can\s+you\s+help|what\s+can\s+compass\s+do|help\s+me|features|kya\s+kar\s+sakta|tusi\s+ki\s+kar|what\s+is\s+compass|compass\s+kya\s+hain?/];

function kbLanguageReply(q, en, hi, pa) {
  const d = /[\u0900-\u097F]/.test(q), g = /[\u0A00-\u0A7F]/.test(q);
  return (g && !d) ? pa : d ? hi : en;
}

function kbSyllabusUnitAnswer(question) {
  const q = canonicalTimetableQuestion(question);
  const matchedCourses = syllabusCoursesForQuestion(q);
  // Let the structured syllabus engine compose verified multi-course answers
  // instead of silently collapsing a question to its first subject.
  if (matchedCourses.length > 1 && /\b(?:and|or|plus|with|then)\b/.test(q)) return null;
  const course = matchedCourses[0];
  if (!course) return null;
  const asksCount = /total|how\s+many|kitne|kinne|count/.test(q);
  const aOut = /outcomes?|co\b|results?/.test(q), aUn = /units?|chapters?|topics?|contents?|syllabus|study\s*scheme/.test(q);
  const asksBooks = /text\s*books?|books?|references?/.test(q);
  const s = `<p><strong><u>${escapeHtml(course.title)}</u></strong></p><p>Code <strong>${escapeHtml(course.code)}</strong>${course.semester ? ` · Sem ${escapeHtml(course.semester)}` : ""}${course.credits ? ` · ${escapeHtml(course.credits)} cr` : ""}</p>`;
  rememberSyllabusConversation("course", [course]);
  const composite = syllabusCompositeAnswer(course, q);
  if (composite) return composite;
  const specificUnit = syllabusSpecificUnitAnswer(course, q);
  if (specificUnit) return specificUnit;
  const specificOutcome = syllabusSpecificOutcomeAnswer(course, q);
  if (specificOutcome) return specificOutcome;
  const assessment = syllabusAssessmentAnswer(course, q);
  if (assessment) return assessment;
  const laboratory = syllabusLaboratoryAnswer(course, q);
  if (laboratory) return laboratory;
  if (/\b(?:is|does|find|search|contains?|which\s+unit|what\s+unit|comes?\s+after)\b/.test(q)) return answerSyllabusPageSearch(question, 3) || s;
  if (asksCount && /units?|chapters?|topics?/.test(q)) return `${s}<p><strong>Total units:</strong> ${course.units.length}</p>`;
  if (/marks?|assessment|teaching\s*hours|duration|prerequisites?|additional\s*material|exam/.test(q)) return answerSyllabusPageSearch(question, 3) || s;
  if (asksBooks) return syllabusBooksAnswer(course, /references?/.test(q));
  if (aOut) return course.outcomes.length ? `${s}<ol>${course.outcomes.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>` : `${s}<p>Outcomes not listed.</p>`;
  if (aUn) return course.units.length ? `${s}<ol>${course.units.map((u) => `<li><strong>Unit ${escapeHtml(u.number)}:</strong> ${escapeHtml(u.title)}</li>`).join("")}</ol>` : `${s}<p>Units not listed.</p>`;
  return s;
}

const KB_OOB = [
  {id:"admin-kkj",test:/kaushik\s*jain|\bkkj\b|who\s*(?:is|created|built)\s*(?:kaushik|kkj|compass)|creator|author|developer|admin\s*command/,reply:()=>`<p><strong><u>Kaushik Jain (Admin &amp; Creator)</u></strong></p><p>Kaushik Jain is the administrator and creator of GNDEC Compass.</p><p>Typing <strong>kkj</strong> in the chat verifies the configured administrator profile on this device and unlocks the admin AI modes and custom timetable HTML import. Server maintenance endpoints remain protected by the separate administrator API token.</p><p class="answer-source">Compass administrator rule.</p>`},
  {id:"college-timing",test:/college\s*(timing|time|opens?|closes?|hours)|college\s*kitne\s*baje|college\s*khulta|college\s*khulda|class\s*(timing|time)|what\s*time\s*(?:does\s*\w+|\w+\s*open|does\s*the\s*college)|kitne\s*baje\s*(college|class)/,reply:()=>{const classes=state.selectedGroup?DAY_NAMES.flatMap((day)=>classFor(state.selectedGroup,day)):[];if(!classes.length)return`<p><strong><u>College hours</u></strong></p><p>Office hours are not present in the currently loaded official timetable. Check the latest GNDEC notice or office page.</p>`;const first=Math.min(...classes.map((item)=>item.start)),last=Math.max(...classes.map((item)=>item.end));return`<p><strong><u>College hours · verified timetable span</u></strong></p><p>Your active official timetable runs from as early as <strong>${humanTime(first)}</strong> to as late as <strong>${humanTime(last)}</strong>, depending on the day.</p><p>This describes your classes, not administrative office hours.</p><p class="kb-tip">Ask “today ka timetable” for today’s exact span.</p>`;}},
  {id:"uniform",test:/uniform|dress\s*code|what\s*to\s*wear|wear\s*in\s*college|dress|ਵਰਦੀ|ड्रेस/,reply:()=>`<p><strong><u>Dress code</u></strong></p><p>The loaded timetable and syllabus do not contain a verified dress-code rule. Check the current student notice or ask your mentor before relying on informal advice.</p>`},
  {id:"attendance",test:/attend|attendance|75%?|75\s*percent|bunk|skip\s*class|miss\s*class|haziri|hazri|hajri|ਗੈਰ-ਹਾਜ਼ਰੀ|ऐटेंडेंस/,reply:()=>`<p><strong><u>GNDEC Attendance Rule</u></strong></p><p>A minimum of <strong>75% attendance</strong> is mandatory in all theory and practical courses under official autonomous regulations to sit in End-Semester Examinations (ESE). Compass provides a default target of <strong>76%</strong> (1% safety cushion) in Settings.</p><p class="answer-source">Official GNDEC Autonomous Academic Regulations.</p>`},
  {id:"cgpa",test:/cgpa|sgpa|gpa|percentage|marks\s*(calculation|formula)|grade\s*point|pointer|sgpi|cgpi/,reply:()=>`<p><strong><u>GNDEC CGPA &amp; Percentage Calculation</u></strong></p><p>• <strong>GNDEC Autonomous Rule:</strong> Percentage = CGPA × 9.5<br />• <strong>IKGPTU Standard Scale:</strong> Percentage = CGPA × 10.0</p><p>For example, a CGPA of <strong>8.4</strong> converts to <strong>79.8%</strong> under Autonomous regulations (or 84.0% standard).</p><p class="answer-source">Official GNDEC Examination Guidelines.</p>`},
  {id:"exam-pattern",test:/exam\s*(pattern|scheme|marks?|format)|internal\s*(exam|marks?)|sessional|mid\s*term|end\s*sem|external|how\s*many\s*marks|exam\s*kitne\s*marks|ਇमਤਿਹਾਨ|परीक्षा/,reply:()=>`<p><strong><u>Exam scheme</u></strong></p><p>Assessment varies by course. Ask for a subject—for example, <strong>“Physics assessment marks”</strong>—and Compass will read the exact continuous-assessment, end-semester, and total marks from the official syllabus.</p>`},
  {id:"holidays",test:/holiday|holidays|vacation|break\s*when|leave\s*when|when\s*is\s*(the\s*)?(next|any)\s*holiday|chutti|छुट्टी|ਛੁੱਟੀ/,reply:()=>`<p><strong><u>GNDEC Official Holidays 2026</u></strong></p><p>Compass includes the complete verified 2026 Gazetted and Restricted holiday calendar from the official GNDEC list (<code>LoH26.pdf</code>). Ask <strong>“How many holidays in August?”</strong>, <strong>“Is on 15 August holiday?”</strong>, or <strong>“When is the next holiday?”</strong> for exact dates.</p><p class="answer-source">Official GNDEC List of Holidays 2026.</p>`},
  {id:"hostel",test:/hostel|mess|room\s*(in\s*)?(hostel|pg)|accommodation|stay\s*where|pg\s*near|हॉस्टल|ਹੋਸਟਲ/,reply:()=>`<p><strong><u>GNDEC Campus Facilities &amp; Hostel Guidelines</u></strong></p><p>GNDEC provides on-campus residential hostels for boys (Hostel 1, 2, 5) and girls (Hostel 4). Key guidelines under autonomous regulations:<br />• <strong>Study Hours:</strong> 9:00 PM – 11:00 PM (strict silence mandatory)<br />• <strong>Curfew Timings:</strong> 8:30 PM (Girls Hostel) / 10:00 PM (Boys Hostel)<br />• <strong>Mess &amp; Amenities:</strong> Cooperative student-managed mess, Wi-Fi, indoor recreation, 24×7 power backup.<br />• <strong>Compliance:</strong> Strict anti-ragging code and biometric attendance.</p><p class="answer-source"><a href="https://gndec.ac.in/?q=node/34" target="_blank" rel="noopener">GNDEC Facilities &amp; Hostels Portal</a> · <a href="https://gndec.ac.in/sites/default/files/information_brochure_2026.pdf" target="_blank" rel="noopener">Information Brochure 2026</a></p>`},
  {id:"portal-timetables",test:/timetable\s*(index|link|portal|website|views?)|section\s*timetable|subsection\s*timetable|faculty\s*timetable|room\s*timetable|programme\s*timetable/,reply:()=>`<p><strong><u>Official GNDEC Timetable Index (Verified 24-08-2026)</u></strong></p><p>• <a href="https://gndec.ac.in/?q=node/34#section" target="_blank" rel="noopener">Section-wise Timetable</a> (Group &amp; semester lecture grids)<br />• <a href="https://gndec.ac.in/?q=node/34#subsection" target="_blank" rel="noopener">Subsection-wise Timetable</a> (Lab cohorts &amp; mentoring grids)<br />• <a href="https://gndec.ac.in/?q=node/34#subject" target="_blank" rel="noopener">Subject-wise Timetable</a> (Course-specific schedules)<br />• <a href="https://gndec.ac.in/?q=node/34#faculty" target="_blank" rel="noopener">Faculty Timetable</a> (Instructor slots)<br />• <a href="https://gndec.ac.in/?q=node/34#room" target="_blank" rel="noopener">Room Timetable</a> (Classroom &amp; lab occupancy)</p><p class="answer-source"><a href="https://gndec.ac.in/?q=node/34" target="_blank" rel="noopener">Official GNDEC Timetable Index</a></p>`},
  {id:"portal-rosters",test:/(?:student\s*)?roster(?:s)?\s*(?:link|pdf|download|list)?|\b(?:ce|cs|ec|ee|it|me|rai)\s*(?:student\s*)?roster\b/,reply:()=>`<p><strong><u>Current Verified GNDEC Student Rosters</u></strong></p><p>• <a href="https://gndec.ac.in/sites/default/files/roster_ce_2026.pdf" target="_blank" rel="noopener">CE Roster</a> (Civil Engineering 1st Year)<br />• <a href="https://gndec.ac.in/sites/default/files/roster_cs_2026.pdf" target="_blank" rel="noopener">CS Roster</a> (Computer Science &amp; Engg)<br />• <a href="https://gndec.ac.in/sites/default/files/roster_ec_2026.pdf" target="_blank" rel="noopener">EC Roster</a> (Electronics &amp; Comm. Engg)<br />• <a href="https://gndec.ac.in/sites/default/files/roster_ee_2026.pdf" target="_blank" rel="noopener">EE Roster</a> (Electrical Engineering)<br />• <a href="https://gndec.ac.in/sites/default/files/roster_it_2026.pdf" target="_blank" rel="noopener">IT Roster</a> (Information Technology)<br />• <a href="https://gndec.ac.in/sites/default/files/roster_me_2026.pdf" target="_blank" rel="noopener">ME Roster</a> (Mechanical Engineering)<br />• <a href="https://gndec.ac.in/sites/default/files/roster_rai_2026.pdf" target="_blank" rel="noopener">RAI Roster</a> (Robotics &amp; AI)</p><p class="answer-source">Verified Official GNDEC Student Rosters.</p>`},
  {id:"portal-appsc",test:/applied\s*sciences?\s*(?:notice|board|dept|department|link)?|appsc\s*(?:notice|board|link)?/,reply:()=>`<p><strong><u>Applied Sciences Department &amp; Live Notice Board</u></strong></p><p>The Department of Applied Sciences coordinates first-year academics, physics/chemistry/maths modules, internal evaluation, and student notices.</p><p>• <a href="https://appsc.gndec.ac.in/notice-board" target="_blank" rel="noopener">Applied Sciences Live Notice Board</a><br />• <a href="https://gndec.ac.in/sites/default/files/syllabus_first_year_2026.pdf" target="_blank" rel="noopener">First-Year Study Scheme &amp; Syllabus (PDF)</a></p><p class="answer-source">Official GNDEC Applied Sciences Portal.</p>`},
  {id:"portal-calendar",test:/academic\s*calendar|session\s*timeline|mst\s*date|exam\s*date|semester\s*timeline/,reply:()=>`<p><strong><u>Official GNDEC Academic Calendar &amp; Session Timeline</u></strong></p><p>• <a href="https://gndec.ac.in/sites/default/files/academic_calendar_jul_dec_2026.pdf" target="_blank" rel="noopener">Academic Calendar Jul–Dec 2026 (PDF)</a> (MSTs, teaching days, and end-semester exams)<br />• <a href="https://gndec.ac.in/sites/default/files/academic_calendar_jan_jun_2026.pdf" target="_blank" rel="noopener">Academic Calendar Jan–Jun 2026 (PDF)</a> (Even semester schedule)<br />• <a href="https://gndec.ac.in/sites/default/files/LoH26.pdf" target="_blank" rel="noopener">GNDEC List of Holidays 2026 (PDF)</a></p><p class="answer-source">Official GNDEC Academic Section.</p>`},
  {id:"library",test:/library|books?|issue\s*(books?|a\s*book)|reading\s*room|library\s*timing|ਲਾਇਬ੍ਰੇਰੀ|लाइब्रेरी/,reply:()=>`<p><strong><u>Library</u></strong></p><p>Current library hours and borrowing rules are not included in the loaded timetable or syllabus. Check the official library notice or ask the library desk. For verified course books, ask “Physics textbooks” or another subject.</p>`},
  {id:"scholarship",test:/scholarship|financial\s*help|fee\s*concession|stipend|ਛਾਤਰਵ੍ਰਿਤੀ|छात्रवृत्ति/,reply:()=>`<p><strong><u>Scholarships</u></strong></p><p>Mostly state/central schemes (post-matric, merit-based). Apply online with bank details and registration number. The college office announces deadlines.</p>`},
  {id:"transport",test:/bus\s*(service|route|pass|timing)|transport|commute|how\s*(to\s*)?(reach|come)\s*(to\s*)?college|bicycle|parking|ਬੱਸ|बस/,reply:()=>`<p><strong><u>Getting to college</u></strong></p><p>City buses, private vans, cycles, and shared autos serve GNDEC from Ludhiana. Parking and a bicycle stand are on campus. Check the college notice for bus pass details.</p>`},
  {id:"fees",test:/fee|fees|tuition|installment|how\s*much\s*(do|is)\s*fee|ਫੀਸ|फीस/,reply:()=>`<p><strong><u>Fees</u></strong></p><p>Fee details are in your admission docs and the GNDEC website. Pay in the fee office or online as announced. Keep the receipt for ID card and exam forms.</p>`},
  {id:"mentor-role",test:/what\s*(is|does)\s*(a\s*)?mentor|mentor\s*(do|kya|ki|kare)|mentor\s*ka\s*kaam|मेंटर\s*क्या/,reply:()=>`<p><strong><u>Mentor’s role</u></strong></p><p>Your mentor is a faculty member who watches your academics, attendance, marks, and any difficulties. They are your first contact for guidance.</p><p class="kb-tip">Ask “who is my mentor?” — saved in your profile.</p>`},
  {id:"hod",test:/\bhod\b|head\s*of\s*department|department\s*head|ਵਿਭਾਗ\s*ਮੁਖੀ|विभागाध्यक्ष/,reply:()=>`<p><strong><u>HOD & department office</u></strong></p><p>The Head of Department handles approvals, subject changes, and academic queries. Reach them through your mentor or the timetable coordinator.</p>`},
  {id:"id-card",test:/id\s*card|identity\s*card|student\s*card|ਆਈਡੀ\s*ਕਾਰਡ|आईडी\s*कार्ड/,reply:()=>`<p><strong><u>Student ID card</u></strong></p><p>Issued by the college office using your admission photo and details. Required for library, lab entry, and exams. Collect it as soon as announced.</p>`},
  {id:"study-advice",test:/how\s*to\s*(study|score|pass|prepare)|study\s*(tips|advice|method|strategy|plan)|padhai\s*kaise|kaise\s*padh|ki\s*padhna|ਪੜ੍ਹਾਈ|पढ़ाई\s*कैसे/,reply:(q)=>{const t=syllabusCoursesForQuestion(q)[0];const sl=t?` for <strong>${escapeHtml(t.title)}</strong>`:"";return`<p><strong><u>Study method${sl}</u></strong></p><ol><li>Read the learning outcome first.</li><li>Study 25–30 min blocks, 5 min break.</li><li>Write 5 recall questions from memory.</li><li>Solve one numerical / past-paper problem daily.</li><li>Revise twice before the internal exam.</li></ol>${t?`<p class="kb-tip">Ask “${escapeHtml(t.code)} outcomes” for exact outcomes.</p>`:""}`;}},
  {id:"time-mgmt",test:/manage\s*(my\s*)?time|time\s*management|balance\s*(studies|classes)|schedule\s*(study|my\s*day)|time\s*kaise\s*manage/,reply:()=>`<p><strong><u>Time balance in first year</u></strong></p><ol><li>Study during free lectures instead of scrolling.</li><li>Finish assignments the same day they’re given.</li><li>Keep Sunday morning for whole-week revision.</li><li>Sleep 7–8 hours — focus and attendance depend on it.</li></ol><p class="kb-tip">Ask “free lectures today” for study gaps.</p>`},
  {id:"first-day",test:/first\s*day|new\s*to\s*college|starting\s*college|just\s*started|pehla\s*din|ਪਹਿਲਾ\s*ਦਿਨ|पहला\s*दिन/,reply:()=>`<p><strong><u>Your first week at GNDEC</u></strong></p><ol><li>Reach early, find your section’s classroom.</li><li>Introduce yourself to your mentor and section mates.</li><li>Load the official timetable on this app — it stays on your phone.</li><li>Note your lab batches from the department list.</li></ol><p class="kb-tip">Ask “what is my next class?” for an instant answer.</p>`},
  {id:"labs",test:/\blabs?\b|practical|batch|experiment|lab\s*coat|ਪ੍ਰਯੋਗਸ਼ਾਲਾ|लैब/,reply:()=>`<p><strong><u>Labs & practicals</u></strong></p><p>First-year labs (Physics, Chemistry, PPS/Workshop) run in batches from the official section list. Bring the manual and follow safety rules — records are graded.</p><p class="kb-tip">Profile → Find my group to see your batch.</p>`},
  {id:"papers",test:/past\s*papers|previous\s*year\s*(papers|questions)|pyq|sample\s*papers|question\s*bank|ਪੁਰਾਣੇ\s*ਪੇਪਰ|पिछले\s*पेपर/,reply:()=>`<p><strong><u>Previous papers</u></strong></p><p>Past internal papers are available in the library and from subject teachers. Solve them topic-wise after each unit — question patterns repeat.</p>`},
  {id:"notes",test:/notes|study\s*material|handouts|e-?material|where\s*(can\s*i\s*)?get\s*(study|material)|ਨੋਟਸ|नोट्स/,reply:()=>`<p><strong><u>Study material</u></strong></p><p>Official handouts are shared by Applied Sciences on their website and by teachers in class. Reference links here include the official Applied Sciences page and syllabus PDF.</p>`},
  {id:"course-change",test:/change\s*(my\s*)?(branch|course|section|group)|switch\s*(branch|course)|transfer\s*branch|section\s*change|branch\s*change|ਬ੍ਰਾਂਚ\s*ਬਦਲ|शाखा\s*बदल/,reply:()=>`<p><strong><u>Branch / section change</u></strong></p><p>Rules are set by the college/university — usually after first year, merit-based. Submit a written request through your mentor to the HOD.</p>`},
  {id:"backlog",test:/backlog|supply|re.?appear|failed|fail\s*in|ek\s*subject\s*me|ਫੇਲ੍ਹ|फेल/,reply:()=>`<p><strong><u>Backlogs</u></strong></p><p>If you don’t clear a subject, it becomes a backlog for the next exam slot. Clear it early — backlogs delay your degree and can affect placements.</p>`},
  {id:"result",test:/result|results|marksheet|grade\s*card|marks\s*(out|declare)|ਪਰਿਣਾਮ|रिजल्ट/,reply:()=>`<p><strong><u>Results</u></strong></p><p>Semester results are on the GNDEC result portal and notice board, a few weeks after the last exam. Keep your registration number ready.</p>`},
  {id:"passing",test:/passing\s*(marks|criteria)|minimum\s*marks|pass\s*marks|kitne\s*marks\s*(par|pe)\s*pass|ਪਾਸ\s*ਮਾਰਕਸ|पासिंग/,reply:()=>`<p><strong><u>Passing criteria</u></strong></p><p>You must pass the end-semester paper and achieve the required combined total (internal + external). Exact minimum is in the syllabus and university rules.</p>`},
  {id:"freshers",test:/freshers?|party|annual\s*(fest|function)|fest|tech\s*fest|sports\s*day|cultural|ਫਰੈਸ਼ਰ|फ्रेसर/,reply:()=>`<p><strong><u>Fests & events</u></strong></p><p>GNDEC runs technical and cultural events — department fests, sports days, the annual function. First-years usually get a dedicated freshers event.</p>`},
  {id:"rules",test:/college\s*rules|rules\s*(of\s*)?college|anti.?ragging|ragging|ਵਿਰੋਧੀ\s*ਰੈਗਿੰਗ|अंटी\s*रैगिंग/,reply:()=>`<p><strong><u>College rules & anti-ragging</u></strong></p><p>GNDEC follows strict anti-ragging rules — any form is a punishable offence. There is an anti-ragging committee you can report to confidentially. Keep your ID card and follow the code of conduct.</p>`},
  {id:"canteen",test:/canteen|food|mess|snacks|where\s*(can\s*i\s*)?eat|khan|ਖਾਣਾ|खाना/,reply:()=>`<p><strong><u>Canteen & food</u></strong></p><p>The campus canteen serves snacks, tea, and lunch during breaks. Carry a water bottle to stay hydrated through labs.</p>`},
  {id:"banks",test:/bank|atm|withdraw|money|paisa|ਬੈਂਕ|बैंक/,reply:()=>`<p><strong><u>Banking near college</u></strong></p><p>ATMs and bank branches are near campus. The college needs your active bank account for scholarships or fee refunds — usually the one you used at admission.</p>`},
  {id:"photocopy",test:/photocopy|xerox|print|printing|stationery|copy\s*shop|ਫੋਟੋਕਾਪੀ|फोटोकॉपी/,reply:()=>`<p><strong><u>Photocopy & stationery</u></strong></p><p>Shops right outside the campus gates handle practical manuals, printouts, and files.</p>`},
  {id:"gym-sports",test:/gym|sports|playground|ground|cricket|football|badminton|ਖੇਡਾਂ|खेल/,reply:()=>`<p><strong><u>Sports & fitness</u></strong></p><p>The campus has a playground and sports facilities. Register with the sports department for the teams you’re interested in.</p>`},
  {id:"placements-early",test:/placement|internship|job|career|ਪਲੇਸਮੈਂਟ|प्लेसमेंट/,reply:()=>`<p><strong><u>Placements (first-year prep)</u></strong></p><p>Keep attendance clean, build basics in programming and math, join one technical club. Companies look at your whole degree, not just the final year.</p>`},
  {id:"branch-choice",test:/which\s*branch|choose\s*branch|branch\s*(option|choice)|best\s*branch|ਸਭ\s*ਤੋਂ\s*ਵਧੀਆ\s*ਬ੍ਰਾਂਚ|शाखा\s*चुन/,reply:()=>`<p><strong><u>Choosing a branch</u></strong></p><p>Branch-change after first year is merit-based. Talk to seniors and teachers, check placement trends, and pick what matches your interest — no single branch is “best” for everyone.</p>`}
];

const KB_QUICK = {
  "free-time": (q) => {if(!/free\s*(time|period|lecture)|khali|ਖਾਲੀ|खाली/.test(q)||!(/(?:what|do|idea|suggest|kya|kar|kaunsa)/.test(q)))return null;return`<p><strong><u>Good ways to use a free period</u></strong></p><ol><li>Review today’s notes for 10 minutes.</li><li>Open one syllabus unit, write 5 recall questions.</li><li>Finish one small assignment task.</li><li>Take a real break — water, snack, short walk.</li></ol><p class="kb-tip">Ask “free lectures today” for the exact empty periods.</p>`;},
  "date-time": (q) => {const n=getIndiaNow();if(!/what.*(?:date|day|time)|today.*(?:date|day)|ajj\s*(ki|kii)\s*(date|tarikh)/.test(q)||/timetable|schedule|class|lecture/.test(q))return null;return`<p>In India it is <strong>${escapeHtml(n.date)}</strong> and the time is <strong>${escapeHtml(n.time)}</strong>.</p>`;},
  "how-works": (q) => {if(!/how.*(?:does\s*)?(compass|this\s*app|you)\s*(work|update|get\s*data)|(?:compass|app).*(?:kya|kaise)\s*(hain|kar)?/.test(q))return null;return`<p><strong><u>How Compass works</u></strong></p><p>Compass reads verified GNDEC timetable, roster, and first-year syllabus sources, then answers factual questions locally on your device. Open-ended study help may use external AI after student identifiers are removed.</p>`;},
  "privacy": (q) => {if(!/privacy|safe|private|data.*(?:share|see|leave|upload)|profile.*(?:see|know)/.test(q))return null;return`<p><strong><u>Privacy</u></strong></p><p>Your saved profile, roster searches, syllabus cache, and chat history stay in this browser. Open-ended AI requests use only the minimum branch/section context; Compass removes names, CRNs, registration numbers, serials, and mentor details before external inference.</p>`;},
  "offline": (q) => {if(!/offline|no\s*internet|no\s*network|without\s*internet/.test(q))return null;return`<p><strong><u>Offline use</u></strong></p><p>Previously loaded timetable, profile, chat, and syllabus data remain available without internet. Fresh updates and AI answers need a connection.</p>`;},
  "share-app": (q) => {if(!/share|friend|send\s*(this|link)|another\s*(phone|device|student)/.test(q))return null;return`<p><strong><u>Sharing Compass</u></strong></p><p>Just share the website link. Each friend sets up their own profile in their own browser — groups, subsections, and chat histories never mix.</p>`;}
};

function kbAnswer(question) {
  const q = kbClean(question);
  if (kbHas(q, KB_GREETING)) return {reply:kbLanguageReply(q,`<p><strong>Hello!</strong> I answer timetable, room, teacher, profile, free-period, and syllabus questions instantly. Ask “what is my next class?” to see me work.</p>`,`<p><strong>नमस्ते!</strong> मैं टाइमटेबल, रूम, टीचर, प्रोफाइल और सिलेबस के सवाल तुरंत जवाब दे सकता हूँ। पूछिए “मेरी अगली क्लास कौन सी है?”</p>`,`<p><strong>ਸਤ ਸ੍ਰੀ ਅਕਾਲ!</strong> ਮੈਂ ਟਾਈਮਟੇਬਲ, ਕਮਰੇ, ਟੀਚਰ, ਪ੍ਰੋਫਾਈਲ ਤੇ ਸਿਲੇਬਸ ਦੇ ਸਵਾਲਾਂ ਦਾ ਤੁਰੰਤ ਜਵਾਬ ਦੇ ਸਕਦਾ ਹਾਂ। ਪੁੱਛੋ “ਮੇਰੀ ਅਗਲੀ ਕਲਾਸ ਕਿਹੜੀ ਹੈ?”</p>`),source:"Compass"};
  if (kbHas(q, KB_THANKS)) return {reply:kbLanguageReply(q,`<p>You’re welcome. Ask whenever you need your next class, a room, a syllabus unit, or a quick plan.</p>`,`<p>कोई बात नहीं। जब भी चाहिए — अगली क्लास, रूम, सिलेबस यूनिट, या कोई सवाल पूछिए।</p>`,`<p>ਕੋई ਗੱਲ ਨਹੀਂ। ਜਦੋਂ ਵੀ ਚਾਹੋ ਪੁੱछੋ — ਅਗਲੀ ਕਲਾਸ, ਕਮਰਾ, ਸਿਲੇਬਸ ਜਾਂ ਕੋਈ ਸਵਾਲ।</p>`),source:"Compass"};
  if (kbHas(q, KB_HELP)) return {reply:`<p><strong><u>What Compass can do</u></strong></p><ul><li><strong>Today / tomorrow / week:</strong> classes, times, rooms</li><li><strong>Next / current class:</strong> instant answer</li><li><strong>Rooms & teachers:</strong> where and who</li><li><strong>Free lectures:</strong> exact gaps in your day</li><li><strong>Profile:</strong> section, mentor, registration</li><li><strong>Syllabus:</strong> units, outcomes, codes, credits</li><li><strong>College life:</strong> attendance, exams, hostels, more</li></ul><p class="kb-tip">Understands English, Hindi, Punjabi, and Hinglish.</p>`,source:"Compass"};

  // 1) Profile questions
  const pa = answerProfileQuestion(question);
  if (pa) return {reply:pa, source:"Profile saved on this device."};

  // 2) Syllabus always wins over a timetable subject match. Without this
  // priority, "Math units" could be mistaken for the next MATH I class.
  // Returning null while the PDF is not cached lets the normal flow load it.
  if (isSyllabusQuestion(question)) {
    if (!state.syllabus.length) return null;
    const u = kbSyllabusUnitAnswer(question);
    if (u) return {reply:`${u}<p class="answer-source">Official GNDEC first-year syllabus.</p>`, source:"Official GNDEC syllabus"};
    // A recognised syllabus question must continue to the structured syllabus
    // engine, never fall through into similarly named timetable classes.
    return null;
  }

  // 3) Exact timetable facts also take priority over general college advice.
  if (state.schedule.length && state.selectedGroup) { const s = answerStructuredQuestion(question); if (s) return {reply:s, source:"Official GNDEC timetable"}; }

  // 4) Out-of-the-box college knowledge is intentionally last. Its patterns
  // must not steal official syllabus or timetable questions.
  for (const e of KB_OOB) { if (e.test.test(q)) return {reply:e.reply(question), source:"Compass knowledge"}; }
  for (const v of Object.values(KB_QUICK)) { const r = v(q); if (r) return {reply:r, source:"Compass knowledge"}; }

  return null;
}

/**
 * GNDEC Compass Next — settings store.
 *
 * Pure, storage-injectable logic:
 *   defaults -> migration -> user values -> admin values -> URL override.
 * The effective value and its source are both returned so the UI can explain
 * why a control is locked ("Managed by college admin").
 */

import {
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_KEY,
  LEGACY_SETTINGS_KEY,
  LEGACY_BRAIN_KEY,
  FLAGS,
  FLAG_MAP,
  PRESET_MAP
} from "./settings-registry.js";

export const PROFILE_KEY = "gndec-compass-next-profile-v1";

export const EMPTY_PROFILE = Object.freeze({
  name: "",
  crn: "",
  registrationNo: "",
  serialNo: "",
  branch: "",
  section: "",
  subsection: "",
  mentor: "",
  mentorPhone: "",
  academicGroup: "",
  mentorVenue: "",
  rosterVersion: "",
  batch: "2026",
  attendanceTarget: 76
});

export function defaultValues() {
  const values = {};
  for (const flag of FLAGS) {
    if (flag.type === "action" || flag.type === "info") continue;
    values[flag.id] = flag.default;
  }
  return values;
}

function asBoolean(raw) {
  if (raw === true || raw === 1 || raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false" || raw === "off") return false;
  return undefined;
}

/** Coerce a raw value for a flag. Invalid values fall back to the default. */
export function coerceValue(flag, raw) {
  if (!flag) return undefined;
  if (flag.type === "action" || flag.type === "info") return null;
  if (flag.type === "boolean") {
    const value = asBoolean(raw);
    return value === undefined ? flag.default : value;
  }
  if (flag.type === "select") {
    const text = String(raw);
    return flag.values.some((option) => option.value === text) ? text : flag.default;
  }
  if (flag.type === "range") {
    const number = Number(raw);
    if (!Number.isFinite(number)) return flag.default;
    const clamped = Math.min(flag.max, Math.max(flag.min, number));
    const step = flag.step || 1;
    return Math.round(clamped / step) * step;
  }
  return flag.default;
}

/** Drop unknown keys and coerce every known one. */
export function sanitizeValues(values = {}) {
  const clean = {};
  for (const flag of FLAGS) {
    if (flag.type === "action" || flag.type === "info") continue;
    clean[flag.id] = coerceValue(flag, values[flag.id] ?? flag.default);
  }
  return clean;
}

/** Parse `?ff=appearance.theme=dark,ask.engine=local` without trusting it. */
export function parseUrlOverrides(search = "") {
  const result = {};
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return result;
  }
  const raw = params.get("ff");
  if (!raw) return result;
  for (const pair of raw.split(",")) {
    const [key, ...rest] = pair.split("=");
    if (!key || !rest.length) continue;
    const flag = FLAG_MAP[key.trim()];
    if (!flag || flag.type === "action") continue;
    result[flag.id] = coerceValue(flag, rest.join("=").trim());
  }
  return result;
}

/**
 * Resolve effective settings.
 * Order: URL debug override > admin override > user device value > default.
 */
export function resolveValues({ user = {}, admin = {}, search = "" } = {}) {
  const values = {};
  const sources = {};
  const urlOverrides = parseUrlOverrides(search);
  for (const flag of FLAGS) {
    if (flag.type === "action" || flag.type === "info") continue;
    let value = flag.default;
    let source = "default";
    if (Object.prototype.hasOwnProperty.call(user, flag.id)) {
      const coerced = coerceValue(flag, user[flag.id]);
      if (coerced !== undefined) { value = coerced; source = "device"; }
    }
    if (Object.prototype.hasOwnProperty.call(admin, flag.id)) {
      const coerced = coerceValue(flag, admin[flag.id]);
      if (coerced !== undefined) { value = coerced; source = "admin"; }
    }
    if (Object.prototype.hasOwnProperty.call(urlOverrides, flag.id)) {
      value = urlOverrides[flag.id];
      source = "url";
    }
    values[flag.id] = value;
    sources[flag.id] = source;
  }
  return { values, sources };
}

/** A flag is usable only when every dependency is satisfied. */
export function isFlagAvailable(flag, values) {
  if (!flag) return false;
  if (!flag.dependsOn) return true;
  const dependencies = String(flag.dependsOn).split(",").map((item) => item.trim()).filter(Boolean);
  return dependencies.every((id) => Boolean(values?.[id]));
}

/** Legacy app settings -> new flag values. Unknown legacy keys are ignored. */
export function migrateLegacy(legacy = {}, legacyBrainEnabled = null) {
  const values = {};
  if (!legacy || typeof legacy !== "object") return values;

  const accent = String(legacy.themeAccent || "");
  if (["emerald", "azure", "amber", "rose", "violet"].includes(accent)) values["appearance.accent"] = accent;

  if (legacy.compactTimetable) {
    values["appearance.density"] = "compact";
    values["timetable.compact"] = true;
  }
  if (legacy.reduceMotion) values["appearance.reduceMotion"] = true;
  if (legacy.showFreshnessTag === false) values["today.freshnessBadge"] = false;
  if (legacy.aiSuggestions === false) values["ask.followups"] = false;
  if (legacy.roomLocations === false) values["rooms.showNextClass"] = false;
  if (legacy.holidayAlerts === false) values["today.holidayBanner"] = false;

  if (legacy.clockMode === "24h") values["timetable.clock"] = "24h";

  if (legacy.timetableGridView === false) values["timetable.view"] = "agenda";
  else if (legacy.timetableExperience === "week") values["timetable.view"] = "week";
  else if (legacy.timetableExperience === "day" || legacy.timetableExperience === "list") values["timetable.view"] = "day";

  const language = String(legacy.preferredLanguage || "");
  if (language === "hindi") values["ask.language"] = "hi";
  else if (language === "punjabi") values["ask.language"] = "pa";
  else if (language === "english") values["ask.language"] = "en";

  const brainMode = String(legacy.brainMode || "");
  if (brainMode === "legacy" || legacyBrainEnabled === false) values["ask.engine"] = "local";
  else if (brainMode) values["ask.engine"] = "auto";

  if (Number.isFinite(Number(legacy.attendanceTarget))) {
    values["__attendanceTarget"] = Number(legacy.attendanceTarget);
  }
  return values;
}

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

export function readStorage(storage, key) {
  try { return storage?.getItem(key) || null; } catch { return null; }
}

export function writeStorage(storage, key, value) {
  try { storage?.setItem(key, value); return true; } catch { return false; }
}

export function loadUserValues(storage, { migrate = true } = {}) {
  const raw = readStorage(storage, SETTINGS_KEY);
  const saved = raw ? safeParse(raw) : null;
  if (saved && saved.values && typeof saved.values === "object") {
    return { values: sanitizeValues(saved.values), migratedFromLegacy: false, attendanceTarget: undefined };
  }
  if (!migrate) return { values: defaultValues(), migratedFromLegacy: false, attendanceTarget: undefined };

  const legacy = safeParse(readStorage(storage, LEGACY_SETTINGS_KEY) || "null");
  const brain = readStorage(storage, LEGACY_BRAIN_KEY);
  const migrated = migrateLegacy(legacy || {}, brain === null ? null : brain === "true");
  const attendanceTarget = migrated.__attendanceTarget;
  delete migrated.__attendanceTarget;
  const values = sanitizeValues({ ...defaultValues(), ...migrated });
  return { values, migratedFromLegacy: Boolean(legacy), attendanceTarget };
}

export function saveUserValues(storage, values, now = new Date().toISOString()) {
  const clean = sanitizeValues(values);
  const payload = JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION, updatedAt: now, values: clean });
  return writeStorage(storage, SETTINGS_KEY, payload) ? clean : null;
}

/** Keep only declared profile fields, trimmed and bounded. */
export function normalizeProfile(profile = {}) {
  const clean = { ...EMPTY_PROFILE };
  for (const key of Object.keys(EMPTY_PROFILE)) {
    const value = profile?.[key];
    if (key === "attendanceTarget") {
      clean.attendanceTarget = Math.min(100, Math.max(0, Number(value) || 76));
    } else {
      clean[key] = typeof value === "string" ? value.trim().slice(0, 120) : value == null ? "" : String(value).trim().slice(0, 120);
    }
  }
  return clean;
}

export function loadProfile(storage) {
  const saved = safeParse(readStorage(storage, PROFILE_KEY) || "null");
  if (saved && typeof saved === "object") {
    return normalizeProfile(saved);
  }
  const legacy = safeParse(readStorage(storage, "gndec-compass-student-v1") || "null");
  if (legacy && typeof legacy === "object") {
    return {
      ...EMPTY_PROFILE,
      name: String(legacy.name || ""),
      crn: String(legacy.crn || ""),
      registrationNo: String(legacy.registrationNo || ""),
      branch: String(legacy.branch || ""),
      section: String(legacy.section || ""),
      subsection: String(legacy.subsection || legacy.subgroup || ""),
      mentor: String(legacy.mentor || ""),
      mentorPhone: String(legacy.mentorPhone || legacy.mentorMobile || ""),
      academicGroup: String(legacy.academicGroup || legacy.mentoringGroup || ""),
      mentorVenue: String(legacy.mentorVenue || legacy.venue || ""),
      rosterVersion: String(legacy.rosterVersion || ""),
      batch: String(legacy.batch || "2026"),
      attendanceTarget: Number(legacy.attendanceTarget) || 76,
      migratedFromLegacy: true
    };
  }
  return { ...EMPTY_PROFILE };
}

export function saveProfile(storage, profile) {
  const clean = normalizeProfile(profile);
  return writeStorage(storage, PROFILE_KEY, JSON.stringify(clean)) ? clean : null;
}

/** Apply a preset on top of current values (preset values win, nothing else changes). */
export function applyPreset(current, presetId) {
  const preset = PRESET_MAP[presetId];
  if (!preset) return sanitizeValues(current);
  return sanitizeValues({ ...defaultValues(), ...current, ...preset.values });
}

/** Reset all settings, or only one category. Actions/info flags are skipped. */
export function resetValues(current = {}, category = "") {
  if (!category) return defaultValues();
  const next = sanitizeValues(current);
  for (const flag of FLAGS) {
    if (flag.category !== category) continue;
    if (flag.type === "action" || flag.type === "info") continue;
    next[flag.id] = flag.default;
  }
  return next;
}

export function changedFlags(values) {
  return FLAGS.filter((flag) => {
    if (flag.type === "action" || flag.type === "info") return false;
    return values?.[flag.id] !== flag.default;
  });
}

export function exportBundle({ values, profile, snapshots = [], chat = [], now = new Date().toISOString() }) {
  return {
    app: "GNDEC Compass Next",
    exportedAt: now,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    values: sanitizeValues(values),
    profile: { ...EMPTY_PROFILE, ...(profile || {}) },
    snapshots: Array.isArray(snapshots) ? snapshots.slice(0, 5) : [],
    chat: Array.isArray(chat) ? chat.slice(-40) : []
  };
}

/** Validate an imported bundle. Returns null when the payload is unusable. */
export function importBundle(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.app !== "GNDEC Compass Next" && !payload.values) return null;
  if (!payload.values || typeof payload.values !== "object") return null;
  const profile = payload.profile && typeof payload.profile === "object" ? { ...EMPTY_PROFILE, ...payload.profile } : null;
  return {
    values: sanitizeValues(payload.values),
    profile,
    snapshots: Array.isArray(payload.snapshots) ? payload.snapshots.slice(0, 5) : [],
    chat: Array.isArray(payload.chat) ? payload.chat.slice(-40) : []
  };
}

/** Settings that must be re-applied to the document when they change. */
export const APPEARANCE_KEYS = Object.freeze([
  "appearance.theme",
  "appearance.accent",
  "appearance.density",
  "appearance.fontScale",
  "appearance.reduceMotion",
  "appearance.highContrast",
  "appearance.colorBlindPalette",
  "appearance.rounded",
  "appearance.glass",
  "appearance.timetableColors",
  "experience.mode",
  "a11y.largeText",
  "a11y.dyslexiaFont",
  "a11y.strongFocus"
]);

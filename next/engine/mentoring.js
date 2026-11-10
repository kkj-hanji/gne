/**
 * Mentoring class override, ported from the legacy Compass behaviour.
 *
 * The official timetable prints the subject "MENTORING CLASS & PROFESSIONAL
 * DEVELOPMENT" but not always the student's own mentor or mentoring venue.
 * When the active device profile matches the selected section and sub-group,
 * the verified mentor name and venue replace only the *missing* printed
 * details. A teacher or room that the timetable does print is never replaced.
 */

export const MENTORING_SUBJECT = "MENTORING CLASS & PROFESSIONAL DEVELOPMENT";

function clean(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

export function isMentoringSubject(subject) {
  return clean(subject).toUpperCase() === MENTORING_SUBJECT;
}

function isMissing(value, label) {
  const text = clean(value);
  return !text || new RegExp(`^${label}\\s+not\\s+listed$`, "i").test(text);
}

/**
 * @param {object} entry parsed timetable entry
 * @param {object} profile device profile ({ mentor, mentorVenue, venue })
 * @returns {object} the same entry, or a copy with mentor details filled in
 */
export function applyMentoringOverride(entry, profile) {
  if (!entry || !isMentoringSubject(entry.subject)) return entry;
  const mentor = clean(profile?.mentor);
  const venue = clean(profile?.mentorVenue || profile?.venue);
  const teacher = isMissing(entry.teacher, "teacher") && mentor ? mentor : entry.teacher;
  const room = isMissing(entry.room, "room") && venue ? venue : entry.room;
  if (teacher === entry.teacher && room === entry.room) return entry;
  return { ...entry, teacher, room, mentoringOverlay: true };
}

export function applyMentoringOverrides(entries, profile) {
  return (Array.isArray(entries) ? entries : []).map((entry) => applyMentoringOverride(entry, profile));
}

/** The profile only applies to the section and sub-group it was verified for. */
export function profileAppliesToSelection(profile, group, subgroup) {
  const section = clean(profile?.section || "").toUpperCase();
  const sub = clean(profile?.subsection || profile?.subgroup || "").toUpperCase();
  if (!section || !sub) return false;
  if (section !== clean(group).toUpperCase()) return false;
  return sub === clean(subgroup).toUpperCase();
}

/** Only the rows that belong to the profile's academic (mentoring) group. */
export function academicOverlayFromSchedule(schedule, profile) {
  const academicGroup = clean(profile?.academicGroup);
  if (!academicGroup) return [];
  return (Array.isArray(schedule) ? schedule : []).filter((entry) => entry && entry.group === academicGroup);
}

function entryKey(entry) {
  return `${entry.day}|${entry.start}|${entry.end}|${entry.subject}`;
}

/**
 * Append official academic-group rows to one day's base classes, then fill the
 * mentoring class details. Only the appended rows receive the override, so a
 * teacher or room that the section timetable already prints is never replaced.
 */
export function classesWithOverlay(base, overlay, day, profile) {
  const entries = Array.isArray(base) ? base : [];
  const existing = new Set(entries.map(entryKey));
  const extra = (Array.isArray(overlay) ? overlay : [])
    .filter((entry) => entry && entry.day === day && !existing.has(entryKey(entry)))
    .map((entry) => applyMentoringOverride(entry, profile));
  return [...entries, ...extra].sort((a, b) => a.start - b.start);
}

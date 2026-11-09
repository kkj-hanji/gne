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

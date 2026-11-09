/** Class reminder rules. Pure functions so they can be tested without a DOM. */

export function reminderWindow(now, leadMinutes) {
  const lead = Math.max(1, Number(leadMinutes) || 10);
  return { from: now.minutes, to: now.minutes + lead };
}

/**
 * A class is due when its start falls inside (now, now + lead].
 * The caller keeps a set of already-notified ids.
 */
export function dueReminder(classes, now, leadMinutes, notified = new Set()) {
  const lead = Math.max(1, Number(leadMinutes) || 10);
  const candidates = (Array.isArray(classes) ? classes : [])
    .filter((entry) => entry.start > now.minutes && entry.start <= now.minutes + lead)
    .filter((entry) => !notified.has(entry.id))
    .sort((a, b) => a.start - b.start);
  return candidates[0] || null;
}

/** True inside a quiet window, including a window that crosses midnight. */
export function isQuietTime(minutes, start = "22:00", end = "07:00") {
  const toMinutes = (value) => {
    const [hours, mins] = String(value).split(":").map(Number);
    return (hours * 60 + mins) % 1440;
  };
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

export function notificationCopy(entry, leadMinutes) {
  if (!entry) return { title: "Compass", body: "" };
  const lead = Number(leadMinutes) || 10;
  return {
    title: `${entry.subject} in ${lead} min`,
    body: `${entry.room || "Room not listed"} · ${entry.teacher || "Teacher not listed"}`
  };
}

/** Daily digest text for the morning summary. */
export function digestCopy(classes, day) {
  if (!Array.isArray(classes) || !classes.length) return { title: `${day}: no classes published`, body: "Enjoy the free day." };
  const first = classes[0];
  const last = classes[classes.length - 1];
  return {
    title: `${day}: ${classes.length} class${classes.length === 1 ? "" : "es"}`,
    body: `${first.subject} at ${format(first.start)} · last class ends ${format(last.end)}`
  };
}

function format(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${hours % 12 || 12}:${String(mins).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

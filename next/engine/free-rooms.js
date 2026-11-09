/**
 * Free-room computation.
 *
 * Uses only published room labels and published class times. A room is never
 * assigned to a department, floor or building unless the official timetable
 * prints that word in the label.
 */

import { humanTime } from "./datetime.js";

export const BLOCK_ORDER = Object.freeze(["F", "G", "S", "A"]);
export const ZONE_LABELS = Object.freeze({ F: "F block", G: "G block", S: "S block", A: "A block" });
export const NAMED_ZONE = "Labs and named rooms";
export const OTHER_ZONE = "Other published rooms";

export function cleanRoom(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

export function roomZone(label) {
  const text = cleanRoom(label);
  if (!text) return OTHER_ZONE;
  const block = /^([A-Z])\s*\d/i.exec(text);
  if (block && BLOCK_ORDER.includes(block[1].toUpperCase())) return ZONE_LABELS[block[1].toUpperCase()];
  if (/\b(?:LAB|LABORATORY|WORKSHOP|WORKSHOPS|STUDIO)\b/i.test(text)) return NAMED_ZONE;
  return OTHER_ZONE;
}

export function isLabRoom(label) {
  return /\b(?:LAB|LABORATORY|WORKSHOP|WORKSHOPS|STUDIO|COMP\s*LAB)\b/i.test(cleanRoom(label));
}

function zoneOrder(zone) {
  const index = Object.values(ZONE_LABELS).indexOf(zone);
  if (index >= 0) return index;
  return zone === NAMED_ZONE ? BLOCK_ORDER.length : BLOCK_ORDER.length + 1;
}

export function compareRooms(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Group published room labels into blocks without inventing metadata. */
export function groupRooms(rooms) {
  const seen = new Set();
  const buckets = new Map();
  for (const room of Array.isArray(rooms) ? rooms : []) {
    const label = cleanRoom(room);
    if (!label) continue;
    const key = label.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const zone = roomZone(label);
    if (!buckets.has(zone)) buckets.set(zone, []);
    buckets.get(zone).push(label);
  }
  const groups = [...buckets.entries()]
    .map(([label, items]) => ({ label, rooms: items.sort(compareRooms), count: items.length }))
    .sort((a, b) => zoneOrder(a.label) - zoneOrder(b.label) || a.label.localeCompare(b.label));
  return { total: seen.size, groups };
}

function overlaps(entry, start, end) {
  return entry.start < end && start < entry.end;
}

/**
 * Compute room availability for a time window.
 *
 * @param {object} options
 * @param {Array<{group:string,day:string,start:number,end:number,subject?:string}>} options.roomSchedule
 *        Parsed official room timetable: `group` is the room label.
 * @param {string} options.day
 * @param {number} options.minutes
 * @param {number} [options.duration=60]
 * @param {boolean} [options.includeLabs=true]
 * @param {boolean} [options.includeLectureHalls=true]
 * @param {string} [options.zone=""]
 */
export function computeFreeRooms({
  roomSchedule = [],
  day,
  minutes,
  duration = 60,
  includeLabs = true,
  includeLectureHalls = true,
  zone = ""
} = {}) {
  const start = Number(minutes);
  const window = Math.max(5, Number(duration) || 60);
  if (!Number.isFinite(start)) return { rooms: [], checked: 0, busy: [], error: "Give a time with AM/PM, for example 2 PM." };
  const end = start + window;

  const rows = (Array.isArray(roomSchedule) ? roomSchedule : []).filter((entry) =>
    entry && entry.day === day && Number.isFinite(entry.start) && Number.isFinite(entry.end)
  );
  const allRooms = [...new Set((Array.isArray(roomSchedule) ? roomSchedule : []).map((entry) => cleanRoom(entry.group)).filter(Boolean))];

  if (!allRooms.length) {
    return { rooms: [], checked: 0, busy: [], error: "The official room timetable is not loaded yet." };
  }
  if (!rows.length) {
    return { rooms: [], checked: allRooms.length, busy: [], error: `The loaded room timetable does not publish ${day} entries.` };
  }

  const candidates = allRooms.filter((room) => {
    if (!includeLabs && isLabRoom(room)) return false;
    if (!includeLectureHalls && !isLabRoom(room)) return false;
    if (zone && roomZone(room) !== zone) return false;
    return true;
  });

  const rooms = [];
  const busy = [];
  for (const room of candidates) {
    const entries = rows.filter((entry) => cleanRoom(entry.group) === room).sort((a, b) => a.start - b.start);
    const conflict = entries.find((entry) => overlaps(entry, start, end));
    if (conflict) {
      busy.push({ room, entry: conflict });
      continue;
    }
    const next = entries.find((entry) => entry.start >= end) || null;
    const previous = [...entries].reverse().find((entry) => entry.end <= start) || null;
    rooms.push({
      room,
      zone: roomZone(room),
      freeFrom: start,
      freeUntil: next ? next.start : null,
      nextClass: next,
      lastClass: previous
    });
  }

  return {
    rooms: rooms.sort((a, b) => compareRooms(a.room, b.room)),
    busy,
    checked: candidates.length,
    day,
    start,
    end,
    duration: window,
    error: ""
  };
}

/** True when a room has no class overlapping the window. */
export function isRoomFree(roomSchedule, room, day, start, duration = 60) {
  return !(Array.isArray(roomSchedule) ? roomSchedule : []).some((entry) =>
    cleanRoom(entry.group) === cleanRoom(room)
    && entry.day === day
    && entry.start < start + duration
    && start < entry.end
  );
}

export function freeRoomSummary(result, limit = 8) {
  if (!result || result.error) return result?.error || "No room availability to show.";
  if (!result.rooms.length) return `No published room is free for ${result.duration} minutes at that time.`;
  const groups = groupRooms(result.rooms.map((item) => item.room)).groups;
  const parts = groups.slice(0, limit).map((group) => `${group.label} (${group.count})`);
  if (groups.length > limit) parts.push(`and ${groups.length - limit} more areas`);
  return `${result.rooms.length} free rooms: ${parts.join(" · ")}`;
}

export function formatFreeWindow(item, clock = "12h") {
  if (!item) return "";
  if (!item.freeUntil) return `Free from ${humanTime(item.freeFrom, clock)}`;
  return `Free until ${humanTime(item.freeUntil, clock)}`;
}

/** Normalise an area filter from a question to a zone label. */
export function zoneFromQuestion(question = "") {
  const q = String(question).toLowerCase();
  if (/\bf\s*(?:block|building)\b|\bf\s*rooms?\b/.test(q)) return ZONE_LABELS.F;
  if (/\bg\s*(?:block|building)\b|\bg\s*rooms?\b/.test(q)) return ZONE_LABELS.G;
  if (/\bs\s*(?:block|building)\b|\bs\s*rooms?\b/.test(q)) return ZONE_LABELS.S;
  if (/\ba\s*(?:block|building)\b/.test(q)) return ZONE_LABELS.A;
  if (/\blabs?\b|\blaborator(?:y|ies)\b|\bworkshops?\b/.test(q)) return NAMED_ZONE;
  return "";
}

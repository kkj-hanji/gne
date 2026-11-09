/** Time helpers for GNDEC Compass Next. Pure functions, IST-aware. */

import { canonicalize, tokenSimilar } from "./language.js";

export const DAY_NAMES = Object.freeze(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
export const STUDY_DAYS = Object.freeze(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
export const IST = "Asia/Kolkata";

export function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** Current wall-clock time in India, independent of the device time zone. */
export function getIndiaNow(reference = new Date()) {
  const date = isValidDate(reference) ? reference : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minutes = Number(lookup.hour) * 60 + Number(lookup.minute);
  return {
    day: lookup.weekday,
    minutes,
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    time24: `${lookup.hour}:${lookup.minute}`,
    time: humanTime(minutes, "12h"),
    dateISO: `${lookup.year}-${lookup.month}-${lookup.day}`,
    date: new Intl.DateTimeFormat("en-IN", {
      timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric"
    }).format(date),
    iso: date.toISOString()
  };
}

/** Add whole days to an IST calendar day without DST surprises. */
export function addDays(now, days) {
  const base = Date.UTC(
    Number(now.dateISO.slice(0, 4)),
    Number(now.dateISO.slice(5, 7)) - 1,
    Number(now.dateISO.slice(8, 10))
  );
  const shifted = new Date(base + days * 86400000);
  return {
    ...now,
    day: DAY_NAMES[(weekdayIndex(now.day) + days + 7) % 7],
    dateISO: shifted.toISOString().slice(0, 10),
    date: new Intl.DateTimeFormat("en-IN", {
      timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric"
    }).format(shifted)
  };
}

export function weekdayIndex(day) {
  return DAY_NAMES.indexOf(day);
}

export function isWeekend(day) {
  return day === "Saturday" || day === "Sunday";
}

/** Next weekday with published classes. Holidays are unknown here, so never claimed. */
export function nextStudyDay(now, days = 1) {
  let cursor = now;
  for (let step = 1; step <= 7; step += 1) {
    const candidate = addDays(now, step);
    if (!isWeekend(candidate.day)) return { ...candidate, offset: step };
    cursor = candidate;
  }
  return { ...addDays(now, 1), offset: 1 };
}

export function humanTime(minutes, clock = "12h") {
  if (!Number.isFinite(minutes)) return "";
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  if (clock === "24h") return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function minutesFromTime(value) {
  const match = String(value || "").trim().match(/(\d{1,2})\s*[:.]?\s*(\d{2})?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (!hours) return `${mins} min`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

const MERIDIEM = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i;
const CLOCK = /\b(\d{1,2}):(\d{2})\b/;
const AT_HOUR = /\b(?:at|by|around|sharp)\s+(\d{1,2})\b/i;

/**
 * Read one clock time from a question. Returns minutes or null.
 * Bounded: never evaluates user text, never guesses an AM/PM that was not
 * implied by the question.
 */
export function parseTimeExpression(question = "") {
  const text = String(question || "");
  const meridiem = MERIDIEM.exec(text);
  if (meridiem) {
    let hours = Number(meridiem[1]);
    const minutes = Number(meridiem[2] || 0);
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    const isPm = meridiem[3].toLowerCase().startsWith("p");
    if (hours === 12) hours = isPm ? 12 : 0;
    else if (isPm) hours += 12;
    return hours * 60 + minutes;
  }
  const clock = CLOCK.exec(text);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  const atHour = AT_HOUR.exec(text);
  if (atHour) {
    const hours = Number(atHour[1]);
    if (hours > 23) return null;
    return hours * 60;
  }
  return null;
}

/** Which day a question is about: explicit weekday, relative word, or null. */
export function resolveQuestionDay(question = "", now = getIndiaNow()) {
  const text = canonicalize(question);
  const tokens = text.split(" ").filter(Boolean);

  // Exact and romanised weekday names, then a bounded typo match.
  const explicit = DAY_NAMES.find((day) => {
    const patterns = [day, day.slice(0, 3)];
    return patterns.some((word) => tokens.includes(word.toLowerCase()));
  }) || DAY_ALIASES.token(text) || fuzzyWeekday(tokens);
  if (explicit) return { day: explicit, label: explicit, offset: null, explicit: true };

  if (/\bday after tomorrow\b/.test(text)) {
    const target = addDays(now, 2);
    return { day: target.day, label: "Day after tomorrow", offset: 2, explicit: false, date: target };
  }
  if (/\btomorrow\b/.test(text)) {
    const target = addDays(now, 1);
    return { day: target.day, label: "Tomorrow", offset: 1, explicit: false, date: target };
  }
  if (/\byesterday\b/.test(text)) {
    const target = addDays(now, -1);
    return { day: target.day, label: "Yesterday", offset: -1, explicit: false, date: target };
  }
  if (/\btoday\b/.test(text)) {
    return { day: now.day, label: "Today", offset: 0, explicit: false, date: now };
  }
  return null;
}

const DAY_ALIASES = Object.freeze({
  mon: "Monday", monday: "Monday", somvar: "Monday", somwar: "Monday", somvaar: "Monday", pir: "Monday",
  tue: "Tuesday", tues: "Tuesday", tuesday: "Tuesday", tusday: "Tuesday", tuseday: "Tuesday", tuesdy: "Tuesday", mangalvar: "Tuesday", mangalwar: "Tuesday", mangalvaar: "Tuesday",
  wed: "Wednesday", weds: "Wednesday", wednesday: "Wednesday", wensday: "Wednesday", wendesday: "Wednesday", wendsday: "Wednesday", wednsday: "Wednesday", budhvar: "Wednesday", budhwar: "Wednesday", budhvaar: "Wednesday",
  thu: "Thursday", thur: "Thursday", thurs: "Thursday", thursday: "Thursday", thusday: "Thursday", thrusday: "Thursday", thursdy: "Thursday", guruvar: "Thursday", guruwar: "Thursday", veervaar: "Thursday",
  fri: "Friday", friday: "Friday", fryday: "Friday", shukarvar: "Friday", shukravar: "Friday", shukrawar: "Friday", jumma: "Friday",
  sat: "Saturday", saturday: "Saturday", saturdy: "Saturday", saterday: "Saturday", shanivar: "Saturday", shanivaar: "Saturday", shanicharvar: "Saturday",
  sun: "Sunday", sunday: "Sunday", sunda: "Sunday", ravivar: "Sunday", ravivaar: "Sunday", itvar: "Sunday", aetvar: "Sunday",
  token(value) {
    for (const piece of String(value || "").split(" ")) {
      if (!piece) continue;
      if (Object.prototype.hasOwnProperty.call(this, piece)) return this[piece];
    }
    return null;
  }
});

function fuzzyWeekday(tokens = []) {
  for (const token of tokens) {
    if (token.length < 5) continue;
    for (const day of DAY_NAMES) {
      if (tokenSimilar(token, day.toLowerCase()) >= 0.8) return day;
    }
  }
  return null;
}

/** True when a stored class overlaps "now". */
export function isHappeningNow(entry, minutes) {
  return Boolean(entry) && entry.start <= minutes && minutes < entry.end;
}

export function relativeStartLabel(minutes, nowMinutes) {
  const delta = Math.round(minutes - nowMinutes);
  if (!Number.isFinite(delta)) return "";
  if (delta >= 0 && delta < 1) return "now";
  if (delta > 0 && delta < 60) return `in ${delta} min`;
  if (delta >= 60 && delta < 180) return `in ${Math.floor(delta / 60)}h ${delta % 60}m`;
  if (delta < 0) return `${formatDuration(Math.abs(delta))} ago`;
  return "";
}

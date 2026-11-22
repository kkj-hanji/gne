/** Deterministic helpers for importing and looking up published exam seats. */

const MAX_SEATS_PER_PLAN = 3000;

export function normalizeCrn(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{6,12}$/.test(digits) ? digits : "";
}

function normalizedText(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeSeatingText(value) {
  return normalizedText(value);
}

/**
 * Convert text extracted from a seating-plan PDF into CRN-to-room assignments.
 * Only the numbered seat table is read; summary counts and other numbers are
 * ignored. A printed total must match every room before the plan is publishable.
 */
export function parseSeatingPlanText(value) {
  const text = String(value || "").replace(/\u0000/g, "");
  if (!text.trim()) return { ok: false, error: "No selectable text was found. Scanned PDFs need OCR and cannot be imported safely yet.", seats: [], rooms: 0, warnings: [] };
  if (text.length > 12_000_000) return { ok: false, error: "This PDF has too much text to process in the browser.", seats: [], rooms: 0, warnings: [] };

  const headings = [...text.matchAll(/^\s*Room\s+No\.\s*(.+?)\s*$/gim)];
  if (!headings.length || headings.length > 250) {
    return { ok: false, error: "No clear room headings were found, or this PDF has too many rooms to review.", seats: [], rooms: headings.length, warnings: [] };
  }

  const seats = [];
  const warnings = [];
  const roomNames = new Set();
  const crnRooms = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const start = headings[index].index + headings[index][0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : text.length;
    const room = headings[index][1].replace(/\s+/g, " ").trim();
    const roomKey = normalizedText(room);
    const body = text.slice(start, end);
    const tableStart = body.search(/\bS\s*\.\s*No\b/i);
    const tableEnd = tableStart < 0 ? -1 : body.slice(tableStart).search(/\bSECTION\s+ALLOTTED\b/i);
    const summary = /TOTAL\s+STU\s*\.\s*(\d+)/i.exec(body);
    if (!room || room.length > 120 || !roomKey || roomNames.has(roomKey) || tableStart < 0 || tableEnd < 0 || !summary) {
      warnings.push(`Room block ${index + 1} is missing a unique room name, numbered table, or printed total.`);
      continue;
    }
    roomNames.add(roomKey);
    const table = body.slice(tableStart, tableStart + tableEnd);
    const roomSeats = [];
    let activeRow = 0;
    for (const line of table.split(/\r?\n/)) {
      const printedRow = /^\s*(\d{1,3})(?:\s+|$)/.exec(line);
      if (printedRow) activeRow = Number(printedRow[1]);
      for (const match of line.matchAll(/\b\d{6,12}\b/g)) {
        if (!activeRow) {
          warnings.push(`${room}: a CRN appears before a numbered seat row.`);
          continue;
        }
        roomSeats.push({ crn: match[0], row: activeRow });
      }
    }
    const expected = Number(summary[1]);
    if (!roomSeats.length || roomSeats.length !== expected) {
      warnings.push(`${room}: printed total ${expected}, extracted ${roomSeats.length}.`);
      continue;
    }
    for (const assignment of roomSeats) {
      const { crn, row } = assignment;
      const previousRoom = crnRooms.get(crn);
      if (previousRoom) {
        warnings.push(`A CRN appears in more than one room (${previousRoom}; ${room}).`);
        continue;
      }
      crnRooms.set(crn, room);
      seats.push({ crn, room, row });
      if (seats.length > MAX_SEATS_PER_PLAN) {
        return { ok: false, error: "This seating plan exceeds the 3,000-seat review limit.", seats: [], rooms: headings.length, warnings: [] };
      }
    }
  }

  const countedRooms = roomNames.size;
  const ok = warnings.length === 0 && countedRooms === headings.length && seats.length > 0;
  return {
    ok,
    error: ok ? "" : "Review the extraction warnings and correct the PDF or table before publishing.",
    seats,
    rooms: countedRooms,
    warnings
  };
}

export function isSeatingQuestion(question, records = [], activeName = "") {
  const raw = String(question || "").toLowerCase();
  const text = normalizedText(question);
  const hindi = /(?:परीक्षा|पेपर|कमर[ेा]|कक्ष|सीट|कहाँ|कहां|किधर)/u.test(raw);
  if (!text && !hindi) return false;
  const hasCrn = /(?<!\d)(?:\d{3}[\s-]\d{4}|\d{6,12})(?!\d)/.test(String(question || ""));
  const asksWhere = /\b(?:room|rm|where|which|kidhar|kithhe|kithay|kahaan|kahan|kamra)\b/.test(text) || /(?:कहाँ|कहां|किधर|कक्ष|कमर[ेा])/u.test(raw);
  let hasRosterName = false;
  if (asksWhere && !hasCrn && !/\b(?:free|available|vacant|khaali)\b/.test(text)) {
    const active = normalizedText(activeName);
    hasRosterName = active.length >= 3 && text.includes(active);
    const rows = records instanceof Set || Array.isArray(records) ? records : [];
    let checked = 0;
    for (const record of hasRosterName ? [] : rows) {
      if (checked++ >= 20_000) break;
      const name = records instanceof Set ? String(record) : normalizedText(typeof record === "string" ? record : record?.name);
      if (name.length >= 3 && text.includes(name)) { hasRosterName = true; break; }
    }
  }
  const seat = /\b(?:seat|seating|seat plan|sitt?ing plan|sitt?ing arrang(?:e)?ment|allotted seat|hall ticket|exam room|paper room|room allotment)\b/.test(text)
    || /\b(?:room|rm|where|which|kidhar|kithhe|kithay|kahaan|kahan|kamra)\b/.test(text)
      && /\b(?:exam|paper|mse|ese|pariksha|imtihan)\b/.test(text)
    || /\b(?:mera|meri|mere)\b.*\b(?:paper|exam|room|seat|kamra)\b/.test(text)
    || hindi && /(?:कहाँ|कहां|किधर|कक्ष|कमर[ेा]|सीट)/u.test(raw)
    || asksWhere && (hasCrn || hasRosterName);
  return seat;
}

/** Resolve an explicitly named student or CRN; otherwise use the active profile. */
export function seatingStudentForQuestion(question, records = [], profile = {}) {
  const text = normalizedText(question);
  const typedCrns = [...String(question || "").matchAll(/(?<!\d)(?:\d{3}[\s-]\d{4}|\d{6,12})(?!\d)/g)].map((match) => match[0]);
  const queryCrn = typedCrns.length === 1 ? normalizeCrn(typedCrns[0]) : "";
  if (typedCrns.length > 1) return { status: "ambiguous" };
  if (queryCrn) {
    const matches = records.filter((record) => normalizeCrn(record?.crn) === queryCrn);
    return matches.length === 1 ? { status: "matched", record: matches[0] } : { status: matches.length ? "ambiguous" : "not-found" };
  }

  const named = records.filter((record) => {
    const name = normalizedText(record?.name);
    return name.length >= 3 && text.includes(name);
  });
  if (named.length) {
    const longest = Math.max(...named.map((record) => normalizedText(record.name).length));
    const best = named.filter((record) => normalizedText(record.name).length === longest);
    return best.length === 1 ? { status: "matched", record: best[0] } : { status: "ambiguous" };
  }
  const ignored = new Set(["where", "which", "room", "exam", "paper", "seat", "seating", "sitting", "plan", "arrangement", "my", "mera", "meri", "mere", "for", "what", "is", "the", "tomorrow", "today", "please", "mse", "ese", "tell", "me", "find", "show", "do", "have", "hai", "ka", "ki", "ke", "in", "mein"]);
  const partialTokens = text.split(" ").filter((token) => token.length >= 4 && !ignored.has(token));
  if (partialTokens.length) {
    const partial = records.filter((record) => {
      const nameTokens = normalizedText(record?.name).split(" ").filter(Boolean);
      return partialTokens.some((queryToken) => nameTokens.some((nameToken) => nameToken.includes(queryToken) || queryToken.includes(nameToken)));
    });
    if (partial.length === 1) return { status: "matched", record: partial[0] };
    if (partial.length > 1) return { status: "ambiguous" };
  }
  return { status: "active-profile", profile };
}

function requestedDate(question, todayISO) {
  const text = normalizedText(question);
  if (/\b(?:tomorrow|tmrw|kal|agla din|next day)\b/.test(text)) {
    const date = new Date(`${todayISO}T12:00:00Z`);
    if (!Number.isFinite(date.valueOf())) return "";
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  if (/\b(?:today|aaj|aj)\b/.test(text)) return todayISO;
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text)?.[1];
  return iso || "";
}

/** Find one upcoming plan, or ask for a subject/date when the request is ambiguous. */
export function selectSeatingPlan(plans = [], question, { dateISO, minutes = 0 } = {}) {
  const requested = requestedDate(question, dateISO);
  let candidates = plans.filter((plan) => plan?.published !== false && /^\d{4}-\d{2}-\d{2}$/.test(String(plan.date || "")));
  if (requested) candidates = candidates.filter((plan) => plan.date === requested);
  else candidates = candidates.filter((plan) => plan.date > dateISO || (plan.date === dateISO && Number(plan.end) > minutes));

  const text = normalizedText(question);
  const subjects = candidates.filter((plan) => {
    const subject = normalizedText(`${plan.subject || ""} ${plan.title || ""}`);
    const shortMath = /\bmaths?\b/.test(text) && /\bmathematics?\b/.test(subject);
    const shortEng = /\bmaths?\b/.test(subject) && /\bmaths?\b/.test(text);
    const usefulTokens = text.split(" ").filter((token) => token.length > 2 && !/^(?:where|which|room|exam|paper|seat|seating|sitting|plan|my|mera|meri|mere|for|what|is|the|tomorrow|today|please|kahan|kahaan|kidhar|kithhe|kithay|kamra|mse|ese|tell|me|find|show|do|have|hai|hai|ka|ki|ke|in|mein|chahiye)$/.test(token));
    return shortMath || shortEng || usefulTokens.some((token) => subject.includes(token));
  });
  if (subjects.length) candidates = subjects;
  if (!candidates.length) return { status: "none" };
  const nearestDate = candidates.map((plan) => plan.date).sort()[0];
  const nearest = candidates.filter((plan) => plan.date === nearestDate);
  return nearest.length === 1 ? { status: "matched", plan: nearest[0] } : { status: "ambiguous", plans: nearest };
}

export function seatAnswerHtml(plan, seat, escapeHtml = (value) => String(value)) {
  return `<p><strong>${escapeHtml(plan.subject || plan.title)}</strong> · ${escapeHtml(plan.date)}${plan.start != null && plan.end != null ? ` · ${escapeHtml(String(plan.startLabel || ""))}${plan.startLabel ? "–" : ""}${escapeHtml(String(plan.endLabel || ""))}` : ""}</p><p>Your published seating plan lists <strong>${escapeHtml(seat.room)}</strong>${seat.row ? ` · Row <strong>${escapeHtml(String(seat.row))}</strong>` : ""}${seat.section ? ` · ${escapeHtml(seat.section)}` : ""}.</p><p class="answer-source">Source: ${escapeHtml(plan.sourceName || "uploaded seating plan")}. Seat data is matched by the exact active-profile CRN.</p>`;
}

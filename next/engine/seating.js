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

/** Infer seating-plan metadata only from a subject with one datesheet match. */
export function inferSeatingPlanMetadata(fileName, exams = []) {
  const text = normalizedText(fileName);
  const subjects = [
    ["Mathematics-I", /\bmaths?\b|\bmathematics?\b/],
    ["PPS", /\bpps\b|programming\s+(?:for\s+)?problem\s+solving/],
    ["BEEE", /\bbeee?\b|basic\s+electrical/],
    ["EDG · Engineering Drawing", /\bedg\b|engineering\s+drawing/],
    ["Physics", /\bphysics\b/],
    ["Chemistry", /\bchemistry\b/],
    ["Economics", /\beconomics?\b/],
    ["English", /\benglish\b/]
  ];
  const subject = subjects.find(([, pattern]) => pattern.test(text))?.[0] || "";
  if (!subject) return null;
  const matches = exams.filter((exam) => {
    const title = normalizedText(exam.title);
    const wanted = normalizedText(subject);
    return title === wanted || (subject === "Mathematics-I" && title.includes("mathematics"))
      || (subject.startsWith("EDG") && title.includes("engineering drawing"));
  });
  const unique = [...new Map(matches.map((exam) => [`${exam.date}|${exam.start}|${exam.end}|${normalizedText(exam.title)}`, exam])).values()];
  if (unique.length !== 1) return null;
  const exam = unique[0];
  if (exam.start == null || exam.end == null || !/mse\s*[-–]?\s*(?:ii|2)/i.test(exam.category || "")) return null;
  const dateLabel = new Date(`${exam.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const id = `seat-${exam.date}-${normalizedText(subject).replace(/\s+/g, "-")}`;
  return {
    id, subject, date: exam.date,
    start: `${String(Math.floor(exam.start / 60)).padStart(2, "0")}:${String(exam.start % 60).padStart(2, "0")}`,
    end: `${String(Math.floor(exam.end / 60)).padStart(2, "0")}:${String(exam.end % 60).padStart(2, "0")}`,
    category: exam.category,
    title: `${exam.title} · ${exam.category} · ${dateLabel}`,
    hint: `Matched ${exam.title} to ${exam.category} on ${dateLabel}.`
  };
}

/** Match only a plan for this paper's date and, when supplied, exact session. */
export function selectSeatingPlanForExam(plans = [], exam = {}) {
  const sameDate = plans.filter((plan) => plan?.date === exam.date && plan.published !== false);
  const examText = normalizedText(`${exam.title || ""} ${exam.category || ""}`);
  const tokens = normalizedText(exam.title || "").split(" ").filter((token) => token.length > 2 && !["exam", "paper", "theory", "mse", "ese"].includes(token));
  const ranked = sameDate.map((plan) => {
    const planText = normalizedText(`${plan.subject || ""} ${plan.title || ""}`);
    const subjectScore = tokens.filter((token) => planText.includes(token)).length + (examText && planText.includes(examText) ? 10 : 0);
    const sameSession = exam.start != null && exam.end != null && plan.start === exam.start && plan.end === exam.end;
    return { plan, score: subjectScore + (sameSession ? 2 : 0), subjectScore, sameSession };
  }).sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  if (ranked[0].subjectScore > 0) return ranked.length === 1 || ranked[0].score > ranked[1].score ? ranked[0].plan : null;
  const sameSession = ranked.filter((entry) => entry.sameSession);
  return sameSession.length === 1 ? sameSession[0].plan : null;
}

function physicalRowsFromLayout(layout) {
  const labelsByCrn = new Map();
  for (const page of Array.isArray(layout) ? layout : []) {
    const items = (Array.isArray(page) ? page : []).map((item) => ({
      value: String(item?.value || "").trim(),
      x: Number(item?.x) || 0,
      y: Number(item?.y) || 0
    })).filter((item) => item.value);
    const roomHeadings = items.filter((item) => /^Room\s+No\.\s*.+$/i.test(item.value)).sort((a, b) => b.y - a.y);
    const headerRows = items.filter((item) => /^S\s*\.\s*No\.?$/i.test(item.value)).map((serial) => ({
      y: serial.y,
      columns: items.filter((item) => Math.abs(item.y - serial.y) < 1.5 && /^Row-[IVX]+$/i.test(item.value))
    })).filter((header) => header.columns.length > 0);

    for (const crnItem of items.filter((item) => /^\d{6,12}$/.test(item.value))) {
      const heading = roomHeadings.filter((candidate) => candidate.y > crnItem.y)
        .sort((a, b) => a.y - b.y)[0];
      if (!heading) continue;
      const roomIndex = roomHeadings.indexOf(heading);
      const nextHeading = roomHeadings[roomIndex + 1];
      if (nextHeading && crnItem.y <= nextHeading.y) continue;
      const header = headerRows
        .filter((row) => row.y < heading.y && row.y > crnItem.y && (!nextHeading || row.y > nextHeading.y))
        .sort((a, b) => (a.y - crnItem.y) - (b.y - crnItem.y))[0];
      if (!header) continue;
      const nearestColumn = [...header.columns].sort((a, b) => Math.abs(a.x - crnItem.x) - Math.abs(b.x - crnItem.x))[0];
      if (nearestColumn && Math.abs(nearestColumn.x - crnItem.x) <= 45) labelsByCrn.set(crnItem.value, nearestColumn.value);
    }
  }
  return labelsByCrn;
}

/**
 * Convert text extracted from a seating-plan PDF into CRN-to-room assignments.
 * Only the numbered seat table is read; summary counts and other numbers are
 * ignored. A printed total must match every room before the plan is publishable.
 */
export function parseSeatingPlanText(value, { layout = [] } = {}) {
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
  const physicalRows = physicalRowsFromLayout(layout);
  const locatedSeats = seats.map((seat) => {
    const rowLabel = physicalRows.get(seat.crn);
    return rowLabel ? { ...seat, rowLabel } : seat;
  });
  return {
    ok,
    error: ok ? "" : "Review the extraction warnings and correct the PDF or table before publishing.",
    seats: locatedSeats,
    rooms: countedRooms,
    warnings
  };
}

export function isSeatingQuestion(question, records = [], activeName = "") {
  const raw = String(question || "").toLowerCase();
  const text = normalizedText(question);
  const intentText = text.replace(/\bplab\b/g, "plan");
  const hindi = /(?:परीक्षा|पेपर|कमर[ेा]|कक्ष|सीट|कहाँ|कहां|किधर)/u.test(raw);
  if (!text && !hindi) return false;
  const hasCrn = /(?<!\d)(?:\d{3}[\s-]\d{4}|\d{6,12})(?!\d)/.test(String(question || ""));
  const crnOnly = /^\s*(?:crn\s*)?(?:\d{3}[\s-]\d{4}|\d{6,12})\s*$/i.test(String(question || ""));
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
  const seat = crnOnly
    || /\b(?:seat|seating|seat plan|sitt?ing plan|sitt?ing arrang(?:e)?ment|sitt?ing class|sitt?ing row|sitt?ing location|allotted seat|hall ticket|exam room|paper room|room allotment)\b/.test(intentText)
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
  const ignored = new Set(["where", "which", "room", "rm", "location", "exam", "paper", "seat", "seating", "sitting", "plan", "plab", "arrangement", "class", "row", "my", "mine", "mera", "meri", "mere", "our", "hamara", "hamari", "hamare", "for", "what", "is", "the", "tomorrow", "today", "tmrw", "next", "please", "mse", "ese", "tell", "me", "find", "show", "do", "have", "hai", "ka", "ki", "ke", "in", "mein", "math", "maths", "mathematics", "physics", "chemistry", "english", "computer", "science", "programming", "python", "pps", "bee", "beee", "edg", "drawing", "graphics", "engineering", "mechanics", "electronics", "workshop", "subject"]);
  const partialTokens = text.split(" ").filter((token) => token.length >= 4 && !ignored.has(token));
  if (partialTokens.length) {
    const partial = records.filter((record) => {
      const nameTokens = normalizedText(record?.name).split(" ").filter(Boolean);
      return partialTokens.some((queryToken) => nameTokens.some((nameToken) => nameToken.includes(queryToken)));
    });
    if (partial.length === 1) return { status: "matched", record: partial[0] };
    if (partial.length > 1) return { status: "ambiguous" };
  }
  if (partialTokens.length && !/\b(?:my|mine|mera|meri|mere|our|hamara|hamari|hamare)\b/.test(text)) return { status: "not-found" };
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

export function seatAnswerHtml(plan, seat, escapeHtml = (value) => String(value), studentLabel = "") {
  const assignmentFor = studentLabel ? `Published seating for <strong>${escapeHtml(studentLabel)}</strong>` : "Your published seating plan";
  const position = seat.rowLabel
    ? ` &middot; ${escapeHtml(seat.rowLabel)}${seat.row != null ? ` &middot; Seat <strong>${escapeHtml(String(seat.row))}</strong>` : ""}`
    : seat.row != null ? ` &middot; Row <strong>${escapeHtml(String(seat.row))}</strong>` : "";
  return `<p><strong>${escapeHtml(plan.subject || plan.title)}</strong> &middot; ${escapeHtml(plan.date)}${plan.start != null && plan.end != null ? ` &middot; ${escapeHtml(String(plan.startLabel || ""))}${plan.startLabel ? "&ndash;" : ""}${escapeHtml(String(plan.endLabel || ""))}` : ""}</p><p>${assignmentFor} lists <strong>${escapeHtml(seat.room)}</strong>${position}${seat.section ? ` &middot; ${escapeHtml(seat.section)}` : ""}.</p><p class="answer-source">Source: ${escapeHtml(plan.sourceName || "uploaded seating plan")}. Assignment matched by exact CRN in the verified roster.</p>`;
}

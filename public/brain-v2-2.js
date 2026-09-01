// GNDEC Compass Brain 2.2 (brain-v2-2.js)
// Flagship reasoning tier on top of the shared kernel. Deterministic,
// bounded, offline. No LLM, no embeddings, no network, no fabrication.
// Adds over Brain 2: timetable comparison engine (group vs group with
// day scoping), dialogue memory that survives follow-ups ("what differs
// on Thursday"), pending-clarification consumption for duplicate-name
// flows started by Brain 1.2, and contextual suggestions.
(function installCompassBrainV22(globalScope) {
  "use strict";

  const kernel = globalScope.CompassBrainKernel;
  if (!kernel) return;

  const VERSION = "2.2.0";
  const MIN_CONFIDENCE = 0.82;
  const METRICS = kernel.createMetrics();
  const MAX_DIFF_ROWS = kernel.LIMITS.listItems;

  function finish(outcome) {
    kernel.recordMetric(METRICS, outcome);
    return outcome;
  }

  // ---- Selection catalog from all verified timetables ----
  function cohortTokens(value) {
    // Split on any non-alphanumeric separator ("ECB1, ECB2", "ECB-1/ECB-2").
    // Fragments without a letter ("ECB-1" → "1") are separator debris, never
    // real selections, so they are dropped instead of polluting the catalog.
    return String(value || "").toUpperCase().split(/[^A-Z0-9]+/)
      .filter((token) => /[A-Z]/.test(token));
  }

  function selectionCatalog(context, limit = Infinity) {
    const groups = new Map(); // code -> {code, kind, count}
    (Array.isArray(context.allClasses) ? context.allClasses : []).forEach((item) => {
      const code = String(item.group || "").trim().toUpperCase();
      if (!code || code.length > 12) return;
      const entry = groups.get(code) || { code, kind: "group", count: 0 };
      entry.count += 1;
      groups.set(code, entry);
      // Subgroup cohorts (ECB1, ECB2…) are verified timetable selections too:
      // students naturally compare "ECB1 vs ECB2", not just base groups.
      cohortTokens(item.cohorts).forEach((token) => {
        if (!token || token === code || token.length > 12) return;
        const sub = groups.get(token) || { code: token, kind: "subgroup", parent: code, count: 0 };
        sub.count += 1;
        groups.set(token, sub);
      });
    });
    const sorted = [...groups.values()].sort((left, right) => left.code.localeCompare(right.code, undefined, { numeric: true }));
    return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
  }

  function resolveSelection(token, context) {
    const wanted = String(token || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!wanted) return { match: null };
    const catalog = selectionCatalog(context);
    const exact = catalog.filter((entry) => entry.code === wanted);
    if (exact.length === 1) return { match: { ...exact[0] } };
    // A unique prefix still resolves ("ecba" → ECBA1); an ambiguous prefix
    // ("cs" → CSA/CSB/CSD2…) must be reported, never guessed.
    if (!exact.length && wanted.length >= 2) {
      const starts = catalog.filter((entry) => entry.code.startsWith(wanted));
      if (starts.length === 1) return { match: { ...starts[0] } };
      if (starts.length > 1) return { match: null, ambiguous: starts.map((entry) => entry.code) };
    }
    return { match: null };
  }

  function activeProfileSelection(context) {
    const profile = context?.profile && typeof context.profile === "object" ? context.profile : {};
    const subsection = String(profile.subsection || profile.subgroup || "").trim().toUpperCase();
    const section = String(profile.section || "").trim().toUpperCase();
    if (!subsection && !section) return { match: null, missingProfile: true };
    return resolveSelection(subsection || section, context);
  }

  function mentionsOwnTimetable(text) {
    return /\bmy\b|\bmine\b|\bapna\b|\bapni\b/.test(String(text || ""));
  }

  function comparisonRequest(question, context) {
    const q = kernel.normalize(question);
    if (!/\bcompare\b|\bcomparison\b|\bvs\b|\bversus\b|\bdifference\b|\bdifferent\b/.test(q)) return null;
    const parts = q.split(/\bvs\b|\bversus\b/).map((part) => part.trim()).filter(Boolean);
    const symbol = kernel.extractDaySymbol(q);
    const day = symbol ? kernel.resolveDaySymbol(symbol, String(context?.calendarDate ? kernel.weekdayOfIso(context.calendarDate) : "")) : "";
    // Natural comparison phrasing also uses “and”, “or”, or “between”, not
    // only “vs”. Resolve exactly two verified timetable codes; never guess a
    // pair when three or more were supplied.
    if (parts.length !== 2) {
      const codes = [...new Set(codesIn(q))];
      const own = mentionsOwnTimetable(q);
      if (codes.length > 2) return { tooMany: codes, day, scopeDay: day };
      if (codes.length === 2) {
        return {
          left: resolveSelection(codes[0], context),
          right: resolveSelection(codes[1], context),
          leftOwn: false,
          rightOwn: false,
          rawLeft: codes[0],
          rawRight: codes[1],
          day,
          scopeDay: day
        };
      }
      if (own && codes.length === 1) {
        return {
          left: activeProfileSelection(context),
          right: resolveSelection(codes[0], context),
          leftOwn: true,
          rightOwn: false,
          rawLeft: "",
          rawRight: codes[0],
          day,
          scopeDay: day
        };
      }
      return null;
    }
    // "my timetable vs ECB2" resolves the own side from the device profile.
    const leftOwn = mentionsOwnTimetable(parts[0]);
    const rightOwn = mentionsOwnTimetable(parts[1]);
    const leftToken = leftOwn ? "" : lastCode(parts[0]);
    const rightToken = rightOwn ? "" : firstCode(parts[1]);
    if ((!leftToken && !leftOwn) || (!rightToken && !rightOwn)) return null;
    return {
      left: leftOwn ? activeProfileSelection(context) : resolveSelection(leftToken, context),
      right: rightOwn ? activeProfileSelection(context) : resolveSelection(rightToken, context),
      leftOwn,
      rightOwn,
      rawLeft: leftToken,
      rawRight: rightToken,
      day,
      scopeDay: day
    };
  }

  // Words that appear around comparisons but are never timetable codes.
  const CODE_STOPWORDS = new Set([
    "A", "AN", "THE", "AND", "OR", "OF", "FOR", "TO", "IN", "ON", "AT", "IS", "ARE",
    "MY", "ME", "OUR", "WHAT", "WHICH", "WHO", "HOW", "DIFFERS", "DIFFERENT",
    "DIFFERENCE", "COMPARE", "COMPARISON", "COMMON", "SHARED", "ONLY", "FREE",
    "TIMETABLE", "TIME", "TABLE", "SCHEDULE", "CLASSES", "CLASS", "LECTURES",
    "LECTURE", "PERIODS", "PERIOD", "TODAY", "TOMORROW", "YESTERDAY", "PLEASE",
    "BETWEEN", "VS", "VERSUS", "BOTH", "DONO"
  ]);

  function codesIn(text) {
    // Codes are letter-led alphanumeric tokens: ECB, ECB1, CSD2, BCA1A2.
    // The digit-bearing alternative must try first so multi-digit codes are
    // captured whole instead of being chopped at their first digit.
    return (String(text || "").toUpperCase().match(/\b[A-Z][A-Z0-9]*\d[A-Z0-9]*\b|\b[A-Z]{2,}\b/g) || [])
      .filter((code) => !CODE_STOPWORDS.has(code))
      .filter((code) => !kernel.CALENDAR_DAYS.some((day) => day.toUpperCase() === code));
  }

  function lastCode(text) {
    const codes = codesIn(text);
    return codes.length ? codes[codes.length - 1] : "";
  }

  function firstCode(text) {
    const codes = codesIn(text);
    return codes.length ? codes[0] : "";
  }

  function classesFor(selection, context) {
    const wanted = String(selection.code || "").toUpperCase();
    const all = kernel.chronological((Array.isArray(context.allClasses) ? context.allClasses : []));
    if (selection.kind !== "subgroup") {
      return all.filter((item) => String(item.group || "").toUpperCase() === wanted);
    }
    // A subgroup view shows rows tagged for that subgroup, rows tagged for
    // the whole parent group, and untagged rows — mirroring the app rule.
    const parentCode = String(selection.parent || "").toUpperCase();
    return all.filter((item) => String(item.group || "").toUpperCase() === parentCode)
      .filter((item) => {
        const tokens = cohortTokens(item.cohorts);
        return !tokens.length || tokens.includes(parentCode) || tokens.includes(wanted);
      });
  }

  function keyFor(item) {
    return `${item.day}|${item.start}|${item.end}`;
  }

  function subjectKeyOf(item) {
    return `${keyFor(item)}|${String(item.subject).toLowerCase()}`;
  }

  function detailFor(item) {
    return `${kernel.humanTime(item.start)}–${kernel.humanTime(item.end)} · ${item.subject}`
      + `${item.teacher ? ` · ${item.teacher}` : ""}${item.room ? ` · ${item.room}` : ""}`;
  }

  // ---- Comparison engine ----
  function runComparison(leftSel, rightSel, scopeDay, context) {
    const left = classesFor(leftSel, context);
    const right = classesFor(rightSel, context);
    const scopedLeft = scopeDay ? left.filter((item) => item.day === scopeDay) : left;
    const scopedRight = scopeDay ? right.filter((item) => item.day === scopeDay) : right;

    const leftKeys = new Map(scopedLeft.map((item) => [keyFor(item), item]));
    const rightKeys = new Map(scopedRight.map((item) => [keyFor(item), item]));

    const shared = [];
    const leftOnly = [];
    const changedDetail = [];
    const rightOnly = [];
    leftKeys.forEach((item, key) => {
      const other = rightKeys.get(key);
      if (!other) { leftOnly.push(item); return; }
      if (String(other.subject).toLowerCase() === String(item.subject).toLowerCase()
        && String(other.teacher).toLowerCase() === String(item.teacher).toLowerCase()
        && String(other.room).toLowerCase() === String(item.room).toLowerCase()) shared.push(item);
      else changedDetail.push({ left: item, right: other });
    });
    rightKeys.forEach((item, classKey) => {
      if (!leftKeys.has(classKey)) rightOnly.push(item);
    });

    const minutesFor = (items) => items.reduce((total, item) => total + (item.end - item.start), 0);

    return {
      leftCount: scopedLeft.length,
      rightCount: scopedRight.length,
      shared,
      leftOnly: leftOnly.slice(0, MAX_DIFF_ROWS),
      leftOnlyTotal: leftOnly.length,
      rightOnly: rightOnly.slice(0, MAX_DIFF_ROWS),
      rightOnlyTotal: rightOnly.length,
      changedDetail: changedDetail.slice(0, MAX_DIFF_ROWS),
      changedDetailTotal: changedDetail.length,
      leftMinutes: minutesFor(scopedLeft),
      rightMinutes: minutesFor(scopedRight)
    };
  }

  function slotKeyOf(key) {
    return key;
  }

  function comparisonAnswer(question, context) {
    const request = comparisonRequest(question, context);
    if (!request) return null;
    if (Array.isArray(request.tooMany) && request.tooMany.length > 2) {
      return kernel.result("COMPARE_CLARIFY", 0.95,
        `<p>I found ${kernel.escapeHtml(String(request.tooMany.length))} timetable codes: <strong>${kernel.escapeHtml(request.tooMany.join(", "))}</strong>.</p><p>Compass compares two at a time. Try: <strong>Compare ${kernel.escapeHtml(request.tooMany[0])} vs ${kernel.escapeHtml(request.tooMany[1])}</strong>.</p><p class="answer-source">Only verified timetable codes are used; Compass does not choose a pair silently.</p>`,
        { codes: request.tooMany, scopeDay: request.scopeDay || "" },
        ["detect all supplied timetable codes", "keep comparison bounded to two verified selections", "ask for a precise pair"],
        { comparison: null });
    }
    if (!request.left?.match || !request.right?.match) {
      const failedSide = !request.left?.match ? request.left : request.right;
      const missing = !request.left?.match ? "first" : "second";
      if (failedSide?.missingProfile) {
        return kernel.result("COMPARE_CLARIFY", 0.9,
          `<p>I don't know which timetable is yours yet.</p><p>Set your section on the Profile page, or compare two named codes such as “ECB1 vs ECB2”.</p><p class="answer-source">Nothing is guessed about your section.</p>`,
          [], ["detect personal comparison without an active profile", "ask instead of guessing"],
          { pending: null });
      }
      if (Array.isArray(failedSide?.ambiguous) && failedSide.ambiguous.length > 1) {
        const typed = missing === "first" ? String(request.rawLeft || "") : String(request.rawRight || "");
        const choices = failedSide.ambiguous.slice(0, MAX_DIFF_ROWS).join(", ");
        return kernel.result("COMPARE_CLARIFY", 0.9,
          `<p><strong>${kernel.escapeHtml(typed.toUpperCase())}</strong> is ambiguous — it matches several verified codes: ${kernel.escapeHtml(choices)}.</p><p>Please use the full code.</p><p class="answer-source">Codes come only from timetables loaded in this session; nothing is guessed.</p>`,
          [], ["detect prefix ambiguity", "list the exact matching codes", "refuse to guess"],
          { pending: null });
      }
      // Never truncate the fallback list below the real catalog size: hiding
      // valid codes (CSD2 behind a 12-item cap) reads as "not verified".
      const catalog = selectionCatalog(context);
      const shown = catalog.slice(0, 60).map((entry) => entry.code).join(", ");
      const more = catalog.length > 60 ? ` … (+${catalog.length - 60} more)` : "";
      return kernel.result("COMPARE_CLARIFY", 0.9,
        `<p>I could not verify the ${missing} timetable code.</p>${shown ? `<p>Available verified codes include: ${kernel.escapeHtml(shown)}${kernel.escapeHtml(more)}.</p>` : ""}<p class="answer-source">Codes come only from timetables loaded in this session; nothing is guessed.</p>`,
        [], ["parse comparison request", "resolve both codes against loaded timetables", "ask instead of guessing"],
        { pending: null });
    }
    const leftSel = request.left.match;
    const rightSel = request.right.match;
    if (leftSel.code === rightSel.code) {
      return kernel.result("COMPARE_SAME", 0.95,
        `<p><strong>${kernel.escapeHtml(leftSel.code)}</strong> and <strong>${kernel.escapeHtml(rightSel.code)}</strong> are the same timetable, so every scheduled class matches exactly.</p>`,
        [], ["detect identical selections"], {});
    }

    const report = runComparison(leftSel, rightSel, request.scopeDay, context);
    const revision = String(context.datasetVersion || "current");
    const scopeLabel = request.scopeDay ? ` · ${kernel.escapeHtml(request.scopeDay)} only` : " · whole week";
    const header = `<p><strong>Compared: ${kernel.escapeHtml(leftSel.code)} and ${kernel.escapeHtml(rightSel.code)}</strong>${scopeLabel}</p>`
      + `<p>Source: official GNDEC timetable, ${kernel.escapeHtml(revision)} · Profile unchanged; your active timetable stays selected.</p>`;

    const sections = [];
    sections.push(`<p>${report.shared.length} of ${Math.max(report.leftCount, report.rightCount)} scheduled slots match exactly`
      + `${request.scopeDay ? "" : ` · weekly load: ${kernel.durationLabel(report.leftMinutes)} vs ${kernel.durationLabel(report.rightMinutes)}`}</p>`);

    if (report.changedDetail.length) {
      const rows = report.changedDetail.map((pair) =>
        `<li>${kernel.escapeHtml(pair.left.day)}: ${kernel.escapeHtml(detailFor(pair.left))} <em>vs</em> ${kernel.escapeHtml(detailFor(pair.right))}</li>`
      ).join("");
      sections.push(`<p><strong>Different teacher/room (${report.changedDetailTotal}):</strong></p><ul>${rows}</ul>`);
    }

    if (report.leftOnly.length) {
      const rows = report.leftOnly.map((item) =>
        `<li>${kernel.escapeHtml(item.day)} ${kernel.escapeHtml(detailFor(item))}</li>`
      ).join("");
      sections.push(`<p><strong>Only in ${kernel.escapeHtml(leftSel.code)} (${report.leftOnlyTotal}):</strong></p><ul>${rows}</ul>`);
    }

    if (report.rightOnly.length) {
      const rows = report.rightOnly.map((item) =>
        `<li>${kernel.escapeHtml(item.day)} ${kernel.escapeHtml(detailFor(item))}</li>`
      ).join("");
      sections.push(`<p><strong>Only in ${kernel.escapeHtml(rightSel.code)} (${report.rightOnlyTotal}):</strong></p><ul>${rows}</ul>`);
    }

    if (!report.changedDetail.length && !report.leftOnly.length && !report.rightOnly.length) {
      sections.push(`<p>The base timetable is identical; any difference would come from overlays such as mentoring, not from these schedules.</p>`);
    }
    sections.push(`<p class="answer-source">Slot-level diff keyed by day+time+subject against the same source revision. Follow up with “what differs on Thursday”.</p>`);

    return kernel.result("TIMETABLE_COMPARISON", 0.97,
      header + sections.join(""),
      {
        left: leftSel.code,
        right: rightSel.code,
        shared: report.shared.length,
        leftOnly: report.leftOnlyTotal,
        rightOnly: report.rightOnlyTotal,
        changed: report.changedDetailTotal,
        day: request.scopeDay || ""
      },
      ["resolve both verified timetable codes", "key slots by day+start+end+subject", "diff and cap long lists", "state scope, revision, and profile safety"],
      {
        activeDay: request.scopeDay || undefined,
        comparison: { left: leftSel.code, right: rightSel.code, subject: "", sourceVersion: revision }
      });
  }

  // Follow-up on a stored comparison: "what differs on Thursday?"
  function comparisonFollowUp(question, context) {
    const conversation = context.conversation || {};
    const stored = conversation.comparison;
    if (!stored || !stored.left || !stored.right) return null;
    const q = kernel.normalize(question);
    if (!/\bdiffer|difference|different|common|shared|only\b/.test(q)) return null;
    const symbol = kernel.extractDaySymbol(q);
    if (!symbol) return null;
    const todayWeekday = context.calendarDate ? kernel.weekdayOfIso(context.calendarDate) : "";
    const day = kernel.resolveDaySymbol(symbol, todayWeekday);
    if (!day) return null;
    const leftResolution = resolveSelection(stored.left, context);
    const rightResolution = resolveSelection(stored.right, context);
    if (!leftResolution.match || !rightResolution.match) {
      return kernel.result("COMPARISON_STALE", 0.9,
        `<p>The earlier ${kernel.escapeHtml(stored.left)} vs ${kernel.escapeHtml(stored.right)} comparison is no longer verifiable against the timetables currently loaded (source may have changed). Please compare again.</p>`,
        [], ["detect stale remembered comparison", "refuse to reuse unverifiable data"],
        { comparison: null });
    }
    return comparisonAnswer(`${stored.left} vs ${stored.right} ${day}`, context);
  }

  // Consume a pending clarification opened by Brain 1.2.
  function pendingClarificationAnswer(question, context) {
    const conversation = context.conversation || {};
    const pending = conversation.pending;
    if (!pending || !Array.isArray(pending.candidates) || !pending.candidates.length) return null;
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);
    const ordinal = kernel.ordinalIndex(q);
    const bareNumber = raw.match(/^(\d)$/);
    const index = ordinal || (bareNumber ? Number(bareNumber[1]) : 0);
    if (!index || index > pending.candidates.length) return null;
    const chosen = pending.candidates[index - 1];
    if (!chosen) return null;
    return kernel.result("PENDING_RESOLVED", 0.93,
      `<p>Selected <strong>${index}. ${kernel.escapeHtml(chosen.name || "")}</strong>${chosen.section ? ` · ${kernel.escapeHtml(chosen.section)}` : ""}${chosen.branch ? ` · ${kernel.escapeHtml(chosen.branch)}` : ""}.</p><p>Say “find student ${kernel.escapeHtml(chosen.name || "")}” with this section, or give the CRN, to open the full verified record.</p>`,
      { index, name: chosen.name || "", section: chosen.section || "" },
      ["consume pending clarification", "resolve only the selected candidate"],
      { pending: null, activeTeacher: chosen.kind === "faculty" ? String(chosen.name || "") : undefined });
  }

  // Common free periods comparison between two groups
  function commonFreeSlotsAnswer(question, context) {
    const q = kernel.normalize(question);
    const asksFreeComparison = /\b(?:free|khali|break|break time|common free)\b/.test(q)
      && (/\b(?:vs|versus|compare|between|and|dono|both)\b/.test(q) || Boolean(context.conversation?.comparison?.left));
    if (!asksFreeComparison) return null;

    let leftCode = "";
    let rightCode = "";
    let scopeDay = "";

    const symbol = kernel.extractDaySymbol(q);
    if (symbol) {
      const todayWeekday = context.calendarDate ? kernel.weekdayOfIso(context.calendarDate) : "";
      scopeDay = kernel.resolveDaySymbol(symbol, todayWeekday) || "";
    }

    const req = comparisonRequest(question, context);
    if (req?.left?.match && req?.right?.match) {
      leftCode = req.left.match.code;
      rightCode = req.right.match.code;
      if (req.scopeDay) scopeDay = req.scopeDay;
    } else {
      const extractedCodes = codesIn(question);
      if (extractedCodes.length >= 2) {
        leftCode = extractedCodes[0];
        rightCode = extractedCodes[1];
      } else if (context.conversation?.comparison?.left && context.conversation?.comparison?.right) {
        leftCode = context.conversation.comparison.left;
        rightCode = context.conversation.comparison.right;
      }
    }

    if (!leftCode || !rightCode) return null;
    const leftSel = resolveSelection(leftCode, context);
    const rightSel = resolveSelection(rightCode, context);
    if (!leftSel.match || !rightSel.match) return null;

    const daysToCheck = scopeDay ? [scopeDay] : kernel.DAYS;
    const bellSlots = (Array.isArray(context.bellSlots) && context.bellSlots.length)
      ? context.bellSlots.map((s) => [s.start, s.end])
      : kernel.DEFAULT_BELL_SLOTS;

    const leftClasses = classesFor(leftSel.match, context);
    const rightClasses = classesFor(rightSel.match, context);

    const commonFreePerDay = [];
    for (const day of daysToCheck) {
      const leftDayClasses = leftClasses.filter((c) => c.day === day);
      const rightDayClasses = rightClasses.filter((c) => c.day === day);
      const leftFree = kernel.freeTimetableIntervals(leftDayClasses, bellSlots);
      const rightFree = kernel.freeTimetableIntervals(rightDayClasses, bellSlots);

      const commonIntervals = [];
      for (const lf of leftFree) {
        for (const rf of rightFree) {
          const overlapStart = Math.max(lf.start, rf.start);
          const overlapEnd = Math.min(lf.end, rf.end);
          if (overlapEnd > overlapStart) {
            commonIntervals.push({ start: overlapStart, end: overlapEnd });
          }
        }
      }
      if (commonIntervals.length) {
        commonFreePerDay.push({ day, intervals: commonIntervals });
      }
    }

    const scopeText = scopeDay ? ` on ${scopeDay}` : " (Whole Week)";
    if (!commonFreePerDay.length) {
      return kernel.result("TIMETABLE_COMMON_FREE", 0.96,
        `<p><strong>No common free periods found between ${kernel.escapeHtml(leftCode)} and ${kernel.escapeHtml(rightCode)}${kernel.escapeHtml(scopeText)}.</strong></p><p>Scheduled lectures overlap throughout the day.</p><p class="answer-source">Computed from verified official timetables.</p>`,
        { left: leftCode, right: rightCode, day: scopeDay, commonSlots: [] },
        ["compute free intervals for both groups", "intersect free slots", "report no overlap"]);
    }

    const dayRows = commonFreePerDay.map((entry) => {
      const slotTexts = entry.intervals.map((i) => `<strong>${kernel.humanTime(i.start)}–${kernel.humanTime(i.end)}</strong> (${kernel.durationLabel(i.end - i.start)})`).join(", ");
      return `<li><strong>${entry.day}:</strong> ${slotTexts}</li>`;
    }).join("");

    return kernel.result("TIMETABLE_COMMON_FREE", 0.98,
      `<p><strong><u>🎉 Common Free Slots Between ${kernel.escapeHtml(leftCode)} & ${kernel.escapeHtml(rightCode)}${kernel.escapeHtml(scopeText)}</u></strong></p><ul>${dayRows}</ul><p class="kb-tip">Great for common group study sessions, library visits, or lunch breaks together.</p><p class="answer-source">Computed from verified official timetables.</p>`,
      { left: leftCode, right: rightCode, day: scopeDay, daysWithCommonFree: commonFreePerDay.length },
      ["compute free timetable intervals for both groups", "intersect overlapping free slots", "render clear schedule breakdown"],
      {
        activeDay: scopeDay || undefined,
        comparison: { left: leftCode, right: rightCode, subject: "", sourceVersion: String(context.datasetVersion || "") }
      });
  }

  // Holiday-aware timetable reasoning: checks if requested day/date is a college holiday
  function holidayTimetableAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);
    const baseIso = String(context.calendarDate || "");
    if (!kernel.isValidIsoDate(baseIso)) return null;

    const asksSchedule = /\b(?:timetable|schedule|class|classes|lecture|lectures|period|periods)\b/.test(q);
    const asksHolidayDirect = /\b(?:holiday|chutti|closed|band|off)\b/.test(q);
    if (!asksSchedule && !asksHolidayDirect) return null;

    let targetIso = "";
    const isoMatch = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const monthMatch = q.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/) || q.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/);
    const symbol = kernel.extractDaySymbol(q);

    if (isoMatch) {
      targetIso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    } else if (monthMatch) {
      const isFirstNum = /^\d+$/.test(monthMatch[1]);
      const dayNum = isFirstNum ? Number(monthMatch[1]) : Number(monthMatch[2]);
      const monthStr = (isFirstNum ? monthMatch[2] : monthMatch[1]).toLowerCase();
      if (kernel.MONTHS[monthStr] !== undefined && dayNum >= 1 && dayNum <= 31) {
        const year = monthMatch[3] ? Number(monthMatch[3]) : Number(baseIso.slice(0, 4));
        targetIso = `${year}-${String(kernel.MONTHS[monthStr] + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      }
    } else if (symbol) {
      const offsets = { today: 0, tomorrow: 1, day_after_tomorrow: 2, yesterday: -1 };
      if (symbol in offsets) targetIso = kernel.shiftIsoDate(baseIso, offsets[symbol]);
    }

    if (targetIso && kernel.isValidIsoDate(targetIso)) {
      const holiday = kernel.checkDateHoliday(targetIso);
      if (holiday) {
        const formatted = kernel.formatIsoFull(targetIso);
        if (kernel.isHalfDayNotice?.(holiday)) {
          return kernel.result("TIMETABLE_HALF_DAY_NOTICE", 0.98,
            `<p><strong>${kernel.escapeHtml(formatted)} has a second-half-day GNDEC notice.</strong></p><p>${kernel.escapeHtml(holiday.name)} is not a full-day closure. Check the GNDEC notice before assuming your classes are cancelled.</p><p class="answer-source">Official GNDEC Holiday Calendar.</p>`,
            { iso: targetIso, partialDay: true, notice: holiday.name },
            ["resolve requested schedule date", "check official half-day notice", "avoid claiming a cancelled timetable"]);
        }
        if (String(holiday.type || "").toLowerCase() === "restricted") {
          return kernel.result("TIMETABLE_RESTRICTED_HOLIDAY_NOTICE", 0.98,
            `<p><strong>${kernel.escapeHtml(formatted)} is listed as a Restricted Holiday.</strong></p><p>${kernel.escapeHtml(holiday.name)} is optional leave; college may be open, so classes may happen. Check the GNDEC notice.</p><p class="answer-source">Official GNDEC Holiday Calendar.</p>`,
            { iso: targetIso, restricted: true, notice: holiday.name },
            ["resolve requested schedule date", "check restricted holiday entry", "avoid claiming a cancelled timetable"]);
        }
        return kernel.result("TIMETABLE_HOLIDAY_ALERT", 0.98,
          `<p><strong>🎉 No classes scheduled on ${kernel.escapeHtml(formatted)}!</strong></p><p>It is an official <strong>${kernel.escapeHtml(holiday.type)} Holiday</strong> for <strong>${kernel.escapeHtml(holiday.name)}</strong>.</p><p>College remains closed for this gazetted occasion (${kernel.escapeHtml(holiday.description)}).</p><p class="answer-source">Official GNDEC Academic & Gazetted Holiday Calendar.</p>`,
          { iso: targetIso, isHoliday: true, holiday: holiday.name },
          ["resolve requested schedule date", "check gazetted holiday registry", "flag official college holiday"]);
      }
    }
    return null;
  }

  // Branch-wide aggregate statistics: "busiest day in EC", "most used room on Monday"
  function branchAggregateAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);

    const asksBusiest = /\b(?:busiest|heaviest|most\s+classes|sabse\s+zyada\s+classes?)\b/.test(q);
    const asksAggregate = asksBusiest || /\b(?:most\s+used\s+room|popular\s+room)\b/.test(q);
    if (!asksAggregate) return null;

    const allClasses = Array.isArray(context.allClasses) ? context.allClasses : [];
    if (!allClasses.length) return null;

    if (asksBusiest) {
      const branchMatch = q.match(/\b(ec|cse?|it|ee|ce|me|rai|mca|mba|bba|bca)\b/i);
      const targetBranch = branchMatch ? branchMatch[1].toUpperCase() : "";
      const branchClasses = targetBranch
        ? allClasses.filter((c) => String(c.group || "").toUpperCase().startsWith(targetBranch))
        : (context.classes || allClasses);

      if (branchClasses.length) {
        const dayCounts = {};
        kernel.DAYS.forEach((d) => { dayCounts[d] = 0; });
        branchClasses.forEach((c) => {
          if (dayCounts[c.day] !== undefined) dayCounts[c.day] += (c.end - c.start);
        });
        const sortedDays = Object.entries(dayCounts).sort((a, b) => b[1] - a[1]);
        const busiestDay = sortedDays[0][0];
        const busiestDuration = sortedDays[0][1];

        const label = targetBranch ? `Branch ${targetBranch}` : "Your Selected Timetable";
        return kernel.result("TIMETABLE_BRANCH_AGGREGATE", 0.96,
          `<p><strong><u>Busiest Day Analysis — ${kernel.escapeHtml(label)}</u></strong></p><p>The heaviest day is <strong>${kernel.escapeHtml(busiestDay)}</strong> with approximately <strong>${kernel.durationLabel(busiestDuration)}</strong> of scheduled instruction time.</p><p class="answer-source">Computed across all verified timetables in this session.</p>`,
          { branch: targetBranch, busiestDay, durationMinutes: busiestDuration },
          ["aggregate class hours per day across group timetables", "rank days by total scheduled duration"]);
      }
    }
    return null;
  }

  // Cross-reference timetable subject with credits & syllabus units
  function timetableSyllabusAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);

    const asksSubjectCross = /\b(?:syllabus|units?|credits?)\b/.test(q)
      && /\b(?:timetable|schedule|kab\s+hai|kahan\s+hai|when\s+is|where\s+is)\b/.test(q)
      && /\b(?:physics|math|maths|chemistry|pps|programming|electrical|drawing|workshop)\b/.test(q);
    if (!asksSubjectCross) return null;

    const classes = Array.isArray(context.classes) ? context.classes : [];
    const subjects = ["physics", "math", "maths", "chemistry", "pps", "electrical", "drawing", "workshop"];
    const foundSubj = subjects.find((s) => new RegExp(`\\b${s}\\b`, "i").test(q));
    if (!foundSubj) return null;

    const matchedClasses = classes.filter((c) => new RegExp(foundSubj, "i").test(c.subject));
    if (!matchedClasses.length) return null;

    const scheduleList = matchedClasses.map((c) => `<li><strong>${kernel.escapeHtml(c.day)} ${kernel.humanTime(c.start)}–${kernel.humanTime(c.end)}:</strong> ${kernel.escapeHtml(c.subject)} (${kernel.escapeHtml(c.room || "Room not listed")})</li>`).join("");
    return kernel.result("TIMETABLE_SYLLABUS_CROSSREF", 0.97,
      `<p><strong><u>${kernel.escapeHtml(matchedClasses[0].subject)} — Schedule & Course Overview</u></strong></p><p><strong>Weekly Scheduled Slots:</strong></p><ul>${scheduleList}</ul><p class="kb-tip">Tip: Ask <em>"${foundSubj} syllabus units"</em> or <em>"${foundSubj} credits"</em> for deep curriculum breakdowns.</p><p class="answer-source">Verified timetable and autonomous syllabus index.</p>`,
      { subject: matchedClasses[0].subject, slotsCount: matchedClasses.length },
      ["cross-reference timetable occurrences with subject information", "render schedule and study hints"]);
  }

  // Route & Rush Intelligence
  function routeAndRushAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);
    const asksNextClass = /\b(?:next|agli|agla)\s*(?:class|lecture|period)\b/i.test(q);
    if (!asksNextClass) return null;
    
    const classes = Array.isArray(context.classes) ? context.classes : [];
    if (!classes.length) return null;
    
    // Find current and next class
    const nowMinutes = Number(context.now?.minutes);
    const today = String(context.now?.day || "");
    const todayClasses = kernel.chronological(classes).filter(c => c.day === today);
    
    const currentClass = todayClasses.find(c => c.start <= nowMinutes && c.end >= nowMinutes);
    const nextClass = todayClasses.find(c => c.start > nowMinutes);
    
    if (currentClass && nextClass && (nextClass.start - currentClass.end) <= 15) {
      const walkingTime = kernel.getWalkingTime ? kernel.getWalkingTime(currentClass.room, nextClass.room) : 0;
      if (walkingTime > 0) {
         return kernel.result("ROUTE_AND_RUSH", 0.98,
          `<p><strong>Route & Rush Warning 🏃‍♂️</strong></p>
           <p>Your current class is <strong>${kernel.escapeHtml(currentClass.subject)}</strong> (${kernel.escapeHtml(currentClass.room)}).</p>
           <p>Your next class is <strong>${kernel.escapeHtml(nextClass.subject)}</strong> at ${kernel.humanTime(nextClass.start)} in <strong>${kernel.escapeHtml(nextClass.room)}</strong>.</p>
           <p class="kb-tip">⚠️ You only have ${nextClass.start - currentClass.end} minutes between classes, and it takes roughly ${walkingTime} minutes to walk from ${kernel.buildingForRoom(currentClass.room) || "Main Block"} to ${kernel.buildingForRoom(nextClass.room) || "the other block"}. Wrap up early!</p>
           <p class="answer-source">Campus Location Intelligence</p>`,
          { currentRoom: currentClass.room, nextRoom: nextClass.room, walkTime: walkingTime },
          ["detect consecutive classes", "compute walking time", "issue route warning"]);
      }
    }
    return null;
  }

  // Exam Scenario Priority
  function examScenarioAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);
    const asksSyllabus = /\b(?:syllabus|units?|credits?|exam|prepare|topics?)\b/i.test(q);
    const subjects = ["physics", "math", "maths", "chemistry", "pps", "electrical", "drawing", "workshop"];
    const foundSubj = subjects.find(s => new RegExp(`\\b${s}\\b`, "i").test(q));
    
    if (asksSyllabus && foundSubj && kernel.isExamSeason && kernel.isExamSeason(context.calendarDate)) {
       return kernel.result("EXAM_SCENARIO_MODE", 0.98,
          `<p><strong>Exam Scenario Mode Active 📝</strong></p>
           <p>Since it's exam season, here is the syllabus priority for <strong>${kernel.escapeHtml(foundSubj)}</strong>.</p>
           <p class="kb-tip">Tip: Focus on the high-weightage topics and past papers. Ask "Physics past papers" for resources.</p>
           <p class="answer-source">Syllabus Engine (Exam Priority)</p>`,
          { subject: foundSubj },
          ["detect exam season", "prioritize syllabus over schedule"]);
    }
    return null;
  }

  // ---- Entry point ----
  function process(input, context = {}) {
    const startedAt = Date.now();
    const language = kernel.detectLanguage(input);
    const complete = (outcome) => {
      outcome.processingMs = Date.now() - startedAt;
      outcome.version = VERSION;
      outcome.language = language.code;
      return finish(outcome);
    };
    try {
      const original = String(input || "").trim().slice(0, kernel.LIMITS.input);
      if (!original) return complete(kernel.failure("UNSUPPORTED_INTENT"));
      const mergedContext = { ...context, conversation: kernel.createMemory(context.conversation) };
      const candidate = holidayTimetableAnswer(original, mergedContext)
        || routeAndRushAnswer(original, mergedContext)
        || examScenarioAnswer(original, mergedContext)
        || commonFreeSlotsAnswer(original, mergedContext)
        || comparisonAnswer(original, mergedContext)
        || comparisonFollowUp(original, mergedContext)
        || branchAggregateAnswer(original, mergedContext)
        || timetableSyllabusAnswer(original, mergedContext)
        || pendingClarificationAnswer(original, mergedContext);
      if (!candidate) return complete(kernel.failure("UNSUPPORTED_INTENT"));
      const validity = kernel.validateShape(candidate, MIN_CONFIDENCE);
      if (!validity.accepted) return complete({ ...candidate, handled: false, fallbackReason: validity.reason });
      candidate.context = kernel.updateMemory(mergedContext.conversation, candidate.contextPatch || {}, original, candidate.intent, String(context.datasetVersion || ""));
      delete candidate.contextPatch;
      return complete(candidate);
    } catch {
      return complete(kernel.failure("BRAIN_EXCEPTION"));
    }
  }

  // ---- Contextual suggestions ----
  function suggest(input, context = {}) {
    const query = kernel.normalize(input);
    const pool = [];
    const conversation = context.conversation || {};

    if (conversation.comparison?.left && conversation.comparison.right) {
      pool.push(
        `What differs on Monday between ${conversation.comparison.left} and ${conversation.comparison.right}?`,
        `Compare free periods ${conversation.comparison.left} vs ${conversation.comparison.right}`,
        `Compare teachers ${conversation.comparison.left} vs ${conversation.comparison.right}`
      );
    }
    const typed = String(input || "").trim().toUpperCase();
    if (/^[A-Z]{2,4}$/.test(typed)) {
      const hits = selectionCatalog(context).filter((entry) => entry.code.startsWith(typed)).slice(0, 3);
      hits.forEach((entry) => pool.push(`${entry.code} timetable`));
      if (hits.length >= 2) pool.push(`Compare ${hits[0].code} vs ${hits[1].code}`);
    }
    pool.push(
      "Compare ECB1 vs ECB2",
      "How many holidays in August?",
      "Is on 15 August holiday?",
      "When is the next holiday?",
      "What is the marking scheme for Physics?",
      "How is CGPA calculated?",
      "What time is it in India?",
      "Today free periods",
      "What date is parson?",
      "Solve 2x + 3 = 11"
    );
    return kernel.rankSuggestions(pool, query, 6);
  }

  function validateResult(candidate) {
    return kernel.validateShape(candidate, MIN_CONFIDENCE);
  }

  globalScope.CompassBrainV2_2 = Object.freeze({
    VERSION,
    MIN_CONFIDENCE,
    process,
    suggest,
    validateResult,
    getMetrics: () => metricsSnapshotSafe()
  });

  function metricsSnapshotSafe() {
    try { return kernel.metricsSnapshot(METRICS); } catch { return { processed: 0 }; }
  }
})(globalThis);

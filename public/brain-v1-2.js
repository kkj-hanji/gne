// GNDEC Compass Brain 1.2 (brain-v1-2.js)
// Search, understanding, and verified facts. Depends only on the kernel.
// Handles: safe calculations, calendar/date questions, identity resolution
// for student and faculty lookups, and bare-name disambiguation. It never
// guesses a person and never reveals more roster detail than verified.
(function installCompassBrainV12(globalScope) {
  "use strict";

  const kernel = globalScope.CompassBrainKernel;
  if (!kernel) return;

  const VERSION = "1.2.0";
  const MIN_CONFIDENCE = 0.82;
  const METRICS = kernel.createMetrics();

  function finish(outcome) {
    kernel.recordMetric(METRICS, outcome);
    return outcome;
  }

  // ---- Calculation ----
  function calculationAnswer(question) {
    // Function-call shapes belong to richer engines; never reduce them here.
    if (/[a-z]{3,}\s*\(/i.test(question)) return null;
    // Three-part numeric input is date-like; the calendar engine owns it.
    if (/\d\s*[-/]\s*\d\s*[-/]\s*\d/.test(question)) return null;
    const equation = kernel.solveLinearEquation(question);
    if (equation && /\b(?:solve|find|x)\b/i.test(question)) {
      return kernel.result("CALCULATION", 0.99,
        `<p><strong>Solution: x = ${kernel.escapeHtml(String(equation.solution))}</strong></p><p>Checked by substitution: ${kernel.escapeHtml(String(equation.a))} × ${kernel.escapeHtml(String(equation.solution))}${equation.b ? ` ${equation.b > 0 ? "+" : "−"} ${Math.abs(equation.b)}` : ""} = ${kernel.escapeHtml(String(equation.c))}.</p><p class="answer-source">Bounded linear-equation solver; no external evaluation.</p>`,
        { kind: "linear_equation", solution: equation.solution },
        ["parse equation form", "isolate x with verified arithmetic", "verify by substitution"]);
    }
    const expression = kernel.sanitizeArithmetic(question);
    if (!expression || !/[+\-*/^%]/.test(expression)) return null;
    try {
      const value = kernel.evaluateArithmetic(expression);
      return kernel.result("CALCULATION", 0.99,
        `<p><strong>${kernel.escapeHtml(expression)} = ${kernel.escapeHtml(String(value))}</strong></p><p class="answer-source">Safe bounded calculator; no code is ever executed.</p>`,
        { kind: "arithmetic", expression, value },
        ["normalize wording to arithmetic", "evaluate with recursive-descent parser", "round safely"]);
    } catch {
      return null;
    }
  }

  // ---- Calendar ----
  function calendarAnswer(question, context) {
    const q = kernel.normalize(question);
    const baseIso = String(context?.calendarDate || "");
    if (!kernel.isValidIsoDate(baseIso)) return null;
    // Only answer explicit date questions; bare weekday mentions belong to
    // richer timetable engines ("Friday timetable" must not become a date).
    const asksDate = /\b(?:what|which|tell)\b/.test(q) && /\b(?:date|day)\b/.test(q);
    if (!asksDate) return null;
    // ISO form first: "2026-08-17" (never read as day/month/year).
    const isoMatch = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const numeric = q.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/) || [];
    const monthNameMatch = q.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/);
    let iso = "";
    if (isoMatch) {
      iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    } else if (monthNameMatch && kernel.MONTHS[monthNameMatch[2]] !== undefined) {
      const year = monthNameMatch[3] ? Number(monthNameMatch[3]) : Number(baseIso.slice(0, 4));
      iso = `${year}-${String(kernel.MONTHS[monthNameMatch[2]] + 1).padStart(2, "0")}-${String(Number(monthNameMatch[1])).padStart(2, "0")}`;
    } else if (numeric.length >= 3 && !/\d{4}-\d{2}-\d{2}/.test(q)) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]);
      let year = numeric[3] ? Number(numeric[3]) : Number(baseIso.slice(0, 4));
      if (year < 100) year += 2000;
      iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    if (iso) {
      if (!kernel.isValidIsoDate(iso)) {
        return kernel.result("CALENDAR_INVALID_DATE", 0.97,
          `<p><strong>${kernel.escapeHtml(q.match(/(?:what day is|what date is)[^]*/)?.[0] || "That date")} is not a valid calendar date.</strong></p><p class="answer-source">Verified against the real calendar; no guessing.</p>`,
          { valid: false }, ["extract explicit date", "validate against the calendar", "refuse invalid dates"]);
      }
      return kernel.result("CALENDAR_EXACT_DATE", 0.99,
        `<p><strong>${kernel.escapeHtml(kernel.formatIsoFull(iso))}</strong></p><p class="answer-source">Computed from the real calendar.</p>`,
        { iso }, ["extract explicit date", "validate", "resolve weekday"]);
    }
    // Relative dates anchored to the India calendar date supplied by the app.
    const symbol = kernel.extractDaySymbol(q);
    if (!symbol) return null;
    const offsets = { yesterday: -1, today: 0, tomorrow: 1, day_after_tomorrow: 2 };
    if (symbol in offsets) {
      const target = kernel.shiftIsoDate(baseIso, offsets[symbol]);
      return kernel.result("CALENDAR_RELATIVE_DATE", 0.99,
        `<p><strong>${kernel.escapeHtml(kernel.formatIsoFull(target))}</strong></p><p class="answer-source">Computed on the India calendar (${kernel.escapeHtml(baseIso)}).</p>`,
        { symbol, iso: target }, ["read India calendar date", `apply "${symbol}" offset`, "format verified date"]);
    }
    // Next occurrence of a named weekday ("what date is Monday?").
    if (kernel.CALENDAR_DAYS.includes(symbol)) {
      const todayWeekday = kernel.weekdayOfIso(baseIso);
      const todayIndex = kernel.CALENDAR_DAYS.indexOf(todayWeekday);
      const targetIndex = kernel.CALENDAR_DAYS.indexOf(symbol);
      const shift = ((targetIndex - todayIndex) % 7 + 7) % 7 || 7;
      const target = kernel.shiftIsoDate(baseIso, shift);
      return kernel.result("CALENDAR_NEXT_WEEKDAY", 0.98,
        `<p><strong>${kernel.escapeHtml(kernel.formatIsoFull(target))}</strong></p><p>The next ${kernel.escapeHtml(symbol)} from today.</p><p class="answer-source">Computed on the India calendar (${kernel.escapeHtml(baseIso)}).</p>`,
        { symbol, iso: target }, ["read India calendar date", "roll forward to the named weekday", "format verified date"]);
    }
    return null;
  }

  // ---- Holidays & Academic Calendar ----
  function holidayAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);
    const baseIso = String(context?.calendarDate || "");
    const baseYear = Number(baseIso.slice(0, 4)) || 2026;
    const requestedYearMatch = q.match(/\b(?:in|for|of|year)?\s*(20\d{2})\b/);
    const requestedYear = requestedYearMatch ? Number(requestedYearMatch[1]) : baseYear;

    const asksHoliday = /\b(?:holiday|holidays|vacation|vacations|closed|chutti|chhutti|off\s+day|gazetted|restricted)\b/.test(q)
      || /\b(?:diwali|dussehra|holi|vaisakhi|baisakhi|teej|gurpurab|independence\s+day|republic\s+day|gandhi\s+jayanti|shivratri|eid|bakrid|christmas|muharram|shaheedi\s+diwas)\b/.test(q);
    if (!asksHoliday) return null;
    const restrictedHolidayExplanation = "Optional leave. College may be open, so classes may happen. Check the GNDEC notice.";
    const gazettedHolidayExplanation = "Official holiday. College is normally closed. Check the GNDEC notice if anything changes.";
    const holidayCategoryNote = (holidays = []) => {
      const list = Array.isArray(holidays) ? holidays : [holidays];
      const notes = [];
      if (list.some((holiday) => String(holiday?.type || "").toLowerCase() === "gazetted")) notes.push(`<strong>Gazetted:</strong> ${kernel.escapeHtml(gazettedHolidayExplanation)}`);
      if (list.some((holiday) => holiday?.closed === false || String(holiday?.type || "").toLowerCase() === "restricted")) notes.push(`<strong>Restricted:</strong> ${kernel.escapeHtml(restrictedHolidayExplanation)}`);
      return notes.length ? `<p class="kb-tip"><strong>Holiday labels</strong><br />${notes.join("<br />")}</p>` : "";
    };
    const asksRestrictedHolidayMeaning = /^(?:restricted|restricted\s+holiday)$/.test(q) || /(?:\b(?:what(?:\s+is|'s)?|meaning|mean|define|definition|explain)\b.*\brestricted\s+holiday\b)|(?:\brestricted\s+holiday\b.*\b(?:meaning|mean|definition)\b)/.test(q);
    const asksGazettedHolidayMeaning = /^(?:gazetted|gazetted\s+holiday)$/.test(q) || /(?:\b(?:what(?:\s+is|'s)?|meaning|mean|define|definition|explain)\b.*\bgazetted\s+holiday\b)|(?:\bgazetted\s+holiday\b.*\b(?:meaning|mean|definition)\b)/.test(q);
    if (asksRestrictedHolidayMeaning) {
      return kernel.result("RESTRICTED_HOLIDAY_EXPLANATION", 0.99,
        `<p><strong><u>What “Restricted Holiday” means</u></strong></p><p>${kernel.escapeHtml(restrictedHolidayExplanation)}</p><p class="answer-source">Official GNDEC & Punjab Government Holiday Calendar.</p>`,
        { closed: false, definition: "not an automatic GNDEC-wide closure" },
        ["identify the official holiday category", "explain its closure status without assuming a day off"]);
    }
    if (asksGazettedHolidayMeaning) {
      return kernel.result("GAZETTED_HOLIDAY_EXPLANATION", 0.99,
        `<p><strong><u>What “Gazetted Holiday” means</u></strong></p><p>${kernel.escapeHtml(gazettedHolidayExplanation)}</p><p class="answer-source">Official GNDEC & Punjab Government Holiday Calendar.</p>`,
        { definition: "official published public holiday" },
        ["identify the official holiday category", "explain verified calendar status without overriding GNDEC notices"]);
    }

    // The local registry intentionally contains only the official GNDEC
    // calendar that has been verified and bundled with Compass.  Never turn a
    // missing year's list into a confident “not a holiday” answer.
    if (requestedYear !== 2026) {
      return kernel.result("HOLIDAY_YEAR_UNAVAILABLE", 0.99,
        `<p><strong><u>Official GNDEC holiday list for ${kernel.escapeHtml(String(requestedYear))} is not loaded.</u></strong></p><p>Compass currently has the verified <strong>2026</strong> list only. It will not guess dates for another year.</p><p class="answer-source"><a href="${kernel.escapeHtml(kernel.HOLIDAY_SOURCE.page)}" target="_blank" rel="noopener noreferrer">${kernel.escapeHtml(kernel.HOLIDAY_SOURCE.label)} ↗</a></p>`,
        { requestedYear, availableYear: 2026 },
        ["identify requested calendar year", "check verified GNDEC holiday registry", "avoid unverified dates"]);
    }

    // 1. Is specific date a holiday? e.g., "is on 15 august holiday", "is 15 august a holiday", "15 august ko chutti hai kya"
    const monthNameMatch = q.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/) || q.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/);
    const numericDateMatch = q.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
    const isoDateMatch = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

    let checkIso = "";
    if (isoDateMatch) {
      checkIso = `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
    } else if (monthNameMatch) {
      const isFirstNum = /^\d+$/.test(monthNameMatch[1]);
      const dayNum = isFirstNum ? Number(monthNameMatch[1]) : Number(monthNameMatch[2]);
      const monthStr = (isFirstNum ? monthNameMatch[2] : monthNameMatch[1]).toLowerCase();
      if (kernel.MONTHS[monthStr] !== undefined && dayNum >= 1 && dayNum <= 31) {
        const yearNum = monthNameMatch[3] ? Number(monthNameMatch[3]) : baseYear;
        checkIso = `${yearNum}-${String(kernel.MONTHS[monthStr] + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      }
    } else if (numericDateMatch && !/\d{4}-\d{2}-\d{2}/.test(q)) {
      const day = Number(numericDateMatch[1]);
      const month = Number(numericDateMatch[2]);
      let year = numericDateMatch[3] ? Number(numericDateMatch[3]) : baseYear;
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        checkIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }

    // Check today / tomorrow / day after tomorrow for holiday
    const symbol = kernel.extractDaySymbol(q);
    if (!checkIso && symbol && kernel.isValidIsoDate(baseIso)) {
      const offsets = { today: 0, tomorrow: 1, day_after_tomorrow: 2, yesterday: -1 };
      if (symbol in offsets) {
        checkIso = kernel.shiftIsoDate(baseIso, offsets[symbol]);
      }
    }

    if (checkIso && kernel.isValidIsoDate(checkIso)) {
      const holiday = kernel.checkDateHoliday(checkIso);
      const formattedDate = kernel.formatIsoFull(checkIso);
      if (holiday) {
        if (holiday.closed === false) {
          return kernel.result("HOLIDAY_DATE_CHECK", 0.99,
            `<p><strong>${kernel.escapeHtml(formattedDate)} is listed as a Restricted Holiday:</strong></p><p><strong>${kernel.escapeHtml(holiday.name)}</strong> (${kernel.escapeHtml(holiday.type)} Holiday)</p>${holidayCategoryNote([holiday])}<p class="answer-source">Official GNDEC & Punjab Government Holiday Calendar.</p>`,
            { iso: checkIso, isHoliday: true, closed: false, holiday: holiday.name, type: holiday.type },
            ["resolve target date", "match against GNDEC holiday registry", "distinguish restricted entry from a college-wide closure"]);
        }
        return kernel.result("HOLIDAY_DATE_CHECK", 0.99,
          `<p><strong>Yes! ${kernel.escapeHtml(formattedDate)} is an official holiday:</strong></p><p><strong>${kernel.escapeHtml(holiday.name)}</strong> (${kernel.escapeHtml(holiday.type)} Holiday)</p><p>${kernel.escapeHtml(holiday.description)}</p>${holidayCategoryNote([holiday])}<p class="answer-source">Official GNDEC & Punjab Government Gazetted Holiday Calendar.</p>`,
          { iso: checkIso, isHoliday: true, holiday: holiday.name },
          ["resolve target date", "match against GNDEC gazetted calendar", "format verified holiday details"]);
      } else {
        const weekday = kernel.weekdayOfIso(checkIso);
        const isWeekend = weekday === "Saturday" || weekday === "Sunday";
        return kernel.result("HOLIDAY_DATE_CHECK", 0.98,
          `<p><strong>No. ${kernel.escapeHtml(formattedDate)} is not an official gazetted festival holiday.</strong></p><p>${isWeekend ? `It falls on a <strong>${kernel.escapeHtml(weekday)}</strong> (regular weekend).` : "It is a regular college working day unless a date-specific circular is issued."}</p><p class="answer-source">Official GNDEC & Punjab Government Academic Calendar.</p>`,
          { iso: checkIso, isHoliday: false, isWeekend },
          ["resolve target date", "check gazetted calendar", "confirm regular day status"]);
      }
    }

    // 2. Month-specific holidays: "how many holidays in august", "august mein kitni chuttiyan hain", "list august holidays"
    const mentionedMonth = Object.keys(kernel.MONTHS).find((m) => new RegExp(`\\b${m}\\b`, "i").test(q) && m.length >= 3);
    const asksMonthHolidays = mentionedMonth !== undefined && (/\b(?:how many|count|kitne|kitni|kinne|kinni|list|show|batao|tell|dasso|what|which)\b/.test(q) || /\b(?:holidays?|chutti|chuttiyan)\b/.test(q));

    if (asksMonthHolidays) {
      const monthIndex = kernel.MONTHS[mentionedMonth];
      const monthName = kernel.MONTH_NAMES[monthIndex];
      const list = kernel.getHolidaysForMonth(monthIndex, requestedYear);
      if (!list.length) {
        return kernel.result("HOLIDAY_COUNT_MONTH", 0.98,
          `<p><strong>There are no gazetted holidays listed in ${kernel.escapeHtml(monthName)} ${kernel.escapeHtml(String(requestedYear))}.</strong></p><p>Regular classes and academic sessions run as scheduled.</p><p class="answer-source">Official GNDEC & Punjab Government Academic Calendar.</p>`,
          { month: monthName, count: 0, holidays: [] },
          ["identify requested month", "query GNDEC calendar", "format zero-holiday result"]);
      }
      const items = list.map((h) => `<li><strong>${kernel.escapeHtml(h.date.slice(8, 10))} ${kernel.escapeHtml(monthName)} (${kernel.escapeHtml(h.day)})</strong>: ${kernel.escapeHtml(h.name)} <em>(${kernel.escapeHtml(h.type)})</em></li>`).join("");
      const categoryNote = holidayCategoryNote(list);
      return kernel.result("HOLIDAY_COUNT_MONTH", 0.99,
        `<p><strong><u>Official Holidays in ${kernel.escapeHtml(monthName)} ${kernel.escapeHtml(String(requestedYear))} (${list.length})</u></strong></p><ul>${items}</ul>${categoryNote}<p class="answer-source">Official GNDEC & Punjab Government Gazetted Holiday Calendar.</p>`,
        { month: monthName, count: list.length, holidays: list.map((h) => h.name) },
        ["identify requested month", "query gazetted calendar", "list verified holidays with days and dates"]);
    }

    // 3. Next / upcoming holiday: "when is the next holiday", "upcoming holidays", "agli chutti kab hai"
    if (/\b(?:next|upcoming|aage|agle|agli|agla)\s+holiday\b/.test(q) || /\bagli\s+chutti\b/.test(q) || /\bwhen\b.*\b(?:next\s+holiday|holiday\s+next)\b/.test(q)) {
      const nextH = kernel.getNextHoliday(baseIso);
      if (nextH) {
        const categoryNote = holidayCategoryNote([nextH]);
        return kernel.result("HOLIDAY_NEXT", 0.99,
          `<p><strong>Next official holiday: ${kernel.escapeHtml(nextH.name)}</strong></p><p><strong>Date:</strong> ${kernel.escapeHtml(kernel.formatIsoFull(nextH.date))}<br /><strong>Type:</strong> ${kernel.escapeHtml(nextH.type)} Holiday<br /><strong>Occasion:</strong> ${kernel.escapeHtml(nextH.description)}</p>${categoryNote}<p class="answer-source">Official GNDEC & Punjab Government Gazetted Calendar.</p>`,
          { nextHoliday: nextH.name, date: nextH.date },
          ["read current India date", "find next chronological holiday", "format verified details"]);
      }
    }

    // 4. Full-year list or total: “all holidays”, “all September holidays”,
    // “holidays for 2026”, and “how many holidays in a year”.
    const asksFullYearHolidays = /^(?:(?:all|list|show|display|full|complete)\s+)?(?:official\s+)?holidays?(?:\s+2026)?\b/.test(q)
      || /\b(?:holidays?|calendar)\s+(?:in|for|of)\s+2026\b/.test(q)
      || /\b(?:how many|total|count|kitne|kitni|kinne|all|list)\s+holidays?\s+(?:in\s+(?:a|the|this)\s+year|in\s+\d{4}|this\s+year|saal\s+me)\b/.test(q)
      || /\bsaal\s+me\s+kitni\s+chutti\b/.test(q);
    if (asksFullYearHolidays) {
      const allHolidays = kernel.getHolidaysForYear(requestedYear, true);
      const items = allHolidays.map((h) => `<li><strong>${kernel.escapeHtml(kernel.formatIsoFull(h.date))}</strong>: ${kernel.escapeHtml(h.name)} <em>(${kernel.escapeHtml(h.type)})</em></li>`).join("");
      const categoryNote = holidayCategoryNote(allHolidays);
      return kernel.result("HOLIDAY_YEAR_TOTAL", 0.99,
        `<p><strong><u>GNDEC Official Holidays for ${kernel.escapeHtml(String(requestedYear))} (${allHolidays.length} Total)</u></strong></p><p>Includes Gazetted, National, and Restricted entries from the official list.</p><ol>${items}</ol>${categoryNote}<p class="answer-source"><a href="${kernel.escapeHtml(kernel.HOLIDAY_SOURCE.pdf)}" target="_blank" rel="noopener noreferrer">${kernel.escapeHtml(kernel.HOLIDAY_SOURCE.label)} ↗</a></p>`,
        { year: requestedYear, total: allHolidays.length },
        ["query full-year official calendar", "format complete holiday list"]);
    }

    // 5. Long weekends: "long weekend in august", "koi long weekend hai", "3-day weekend"
    if (/\b(?:long\s+weekends?|3-day\s+weekend|extended\s+weekend)\b/.test(q)) {
      const longWeekends = kernel.getLongWeekends(baseYear);
      if (longWeekends.length) {
        const rows = longWeekends.map((lw) => `<li><strong>${kernel.escapeHtml(lw.holiday.name)} (${kernel.escapeHtml(lw.holiday.date)}):</strong> ${kernel.escapeHtml(lw.type)}</li>`).join("");
        return kernel.result("HOLIDAY_LONG_WEEKEND", 0.99,
          `<p><strong><u>Upcoming Long Weekends in ${kernel.escapeHtml(String(baseYear))}</u></strong></p><ul>${rows}</ul><p class="kb-tip">Tip: Plan your trips and project sprints around these long weekends!</p><p class="answer-source">Official GNDEC Academic & Holiday Calendar.</p>`,
          { longWeekends: longWeekends.map((lw) => lw.holiday.name) },
          ["scan holidays for Friday or Monday alignments", "format long weekend schedule"]);
      }
    }

    // 6. Named festival search: e.g. "when is diwali", "baisakhi date", "gurpurab date", "diwali kab hai"
    const searchResults = kernel.searchHolidays(raw);
    if (searchResults.length) {
      const h = searchResults[0];
      const categoryNote = holidayCategoryNote([h]);
      return kernel.result("HOLIDAY_FESTIVAL_SEARCH", 0.98,
        `<p><strong>${kernel.escapeHtml(h.name)} (${kernel.escapeHtml(String(baseYear))}):</strong></p><p><strong>Date:</strong> ${kernel.escapeHtml(kernel.formatIsoFull(h.date))}<br /><strong>Category:</strong> ${kernel.escapeHtml(h.type)} Holiday (${h.closed ? "College closed" : "Restricted holiday"})<br /><strong>Significance:</strong> ${kernel.escapeHtml(h.description)}</p>${categoryNote}<p class="answer-source">Official GNDEC & Punjab Government Gazetted Calendar.</p>`,
        { holiday: h.name, date: h.date },
        ["search holiday registry by keyword", "render exact verified date and category"]);
    }

    return null;
  }

  // ---- Marking Scheme, Credits & CGPA Engine ----
  function academicMarkingAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);

    // 1. CGPA / SGPA Calculation: "calculate CGPA: 4 credits A+, 4 credits A, 3 credits B+", "calculate sgpa 4 10, 3 9, 3 8"
    const asksCgpaCalc = /\b(?:calculate|find|compute|nikalo|batao)\s+(?:my\s+)?(?:cgpa|sgpa|gpa)\b/.test(q)
      || /\b(?:cgpa|sgpa)\s*(?:calculation|calculator|eval|nikalo)\b/.test(q);
    if (asksCgpaCalc) {
      const entries = [];
      const pairRegex = /(\d+(?:\.\d+)?)\s*(?:credits?|cred|cr)?\s*[:=-]?\s*([OAoapbcPfF0-9+]+)/gi;
      for (const match of raw.matchAll(pairRegex)) {
        const credits = Number(match[1]);
        const grade = match[2].trim().toUpperCase();
        if (credits > 0 && credits <= 10 && kernel.GRADE_POINTS[grade] !== undefined) {
          entries.push({ credits, grade });
        }
      }
      if (entries.length >= 2) {
        const res = kernel.evaluateCgpa(entries);
        if (res) {
          const breakdown = entries.map((e, idx) => `Course ${idx + 1}: ${e.credits} credits × Grade ${e.grade} (${kernel.GRADE_POINTS[e.grade]} pts) = ${e.credits * kernel.GRADE_POINTS[e.grade]}`).join("<br />");
          return kernel.result("ACADEMIC_CGPA_CALCULATION", 0.99,
            `<p><strong><u>Calculated SGPA / CGPA: ${kernel.escapeHtml(String(res.cgpa))} / 10.0</u></strong></p><p><strong>Equivalent Percentage: ${kernel.escapeHtml(String(res.percentage))}%</strong> (Formula: CGPA × 9.5)</p><p><strong>Total Credits:</strong> ${kernel.escapeHtml(String(res.totalCredits))} · <strong>Total Credit Points:</strong> ${kernel.escapeHtml(String(res.totalCreditPoints))}</p><p class="kb-tip"><u>Calculation Breakdown:</u><br />${breakdown}</p><p class="answer-source">IKGPTU / GNDEC Autonomous 10-Point Grading System.</p>`,
            { cgpa: res.cgpa, percentage: res.percentage, totalCredits: res.totalCredits },
            ["parse credit-grade pairs", "evaluate weighted average", "calculate percentage conversion"]);
        }
      }
    }

    // 2. CGPA to Percentage / Percentage to CGPA conversions
    const cgpaToPctMatch = q.match(/(?:convert\s+)?(\d+(?:\.\d+)?)\s*(?:cgpa|sgpa|gpa)\s*(?:to|in|into|percentage|%|marks|\?)/i)
      || q.match(/(?:percentage|%)\s*(?:of|for|from)?\s*(\d+(?:\.\d+)?)\s*(?:cgpa|sgpa)/i);
    if (cgpaToPctMatch) {
      const cgpa = Number(cgpaToPctMatch[1]);
      const pct = kernel.cgpaToPercentage(cgpa);
      if (pct !== null) {
        return kernel.result("ACADEMIC_CGPA_CALCULATION", 0.99,
          `<p><strong>${kernel.escapeHtml(String(cgpa))} CGPA = ${kernel.escapeHtml(String(pct))}%</strong></p><p>Official IKGPTU / GNDEC Conversion Formula:<br /><strong>Percentage (%) = CGPA × 9.5</strong><br />(${kernel.escapeHtml(String(cgpa))} × 9.5 = ${kernel.escapeHtml(String(pct))}%)</p><p class="answer-source">Official IKGPTU / GNDEC Autonomous Examination Regulations.</p>`,
          { cgpa, percentage: pct },
          ["extract CGPA value", "apply 9.5 multiplier", "format verified conversion"]);
      }
    }

    const pctToCgpaMatch = q.match(/(?:convert\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent|percentage)\s*(?:to|in|into|cgpa|sgpa|gpa|\?)/i)
      || q.match(/(?:cgpa|sgpa)\s*(?:for|of|from|kya|hoga)?\s*(\d+(?:\.\d+)?)\s*(?:%|percent|percentage)/i);
    if (pctToCgpaMatch) {
      const pct = Number(pctToCgpaMatch[1]);
      const cgpa = kernel.percentageToCgpa(pct);
      if (cgpa !== null) {
        return kernel.result("ACADEMIC_CGPA_CALCULATION", 0.99,
          `<p><strong>${kernel.escapeHtml(String(pct))}% = ${kernel.escapeHtml(String(cgpa))} CGPA</strong></p><p>Official IKGPTU / GNDEC Conversion Formula:<br /><strong>CGPA = Percentage ÷ 9.5</strong><br />(${kernel.escapeHtml(String(pct))} ÷ 9.5 = ${kernel.escapeHtml(String(cgpa))})</p><p class="answer-source">Official IKGPTU / GNDEC Autonomous Examination Regulations.</p>`,
          { percentage: pct, cgpa },
          ["extract percentage value", "divide by 9.5", "format verified conversion"]);
      }
    }

    // 3. Single Letter Grade Point Lookup: e.g. "Physics A+ grade CGPA", "A grade points in GNDEC"
    const singleGradeMatch = q.match(/\b([oOaAbBcCpPfF]\+?)\s*(?:grade|points?|pointer)\b/) || q.match(/\bgrade\s+([oOaAbBcCpPfF]\+?)\b/);
    if (singleGradeMatch) {
      const g = singleGradeMatch[1].toUpperCase();
      if (kernel.GRADE_POINTS[g] !== undefined) {
        const pts = kernel.GRADE_POINTS[g];
        return kernel.result("ACADEMIC_GRADE_POINTS", 0.99,
          `<p><strong>Grade ${kernel.escapeHtml(g)} = ${pts} Grade Points (out of 10)</strong></p><p>In GNDEC Autonomous grading, Grade <strong>${kernel.escapeHtml(g)}</strong> corresponds to <strong>${pts} grade points</strong> in SGPA/CGPA evaluation.</p><p class="answer-source">Official GNDEC Autonomous 10-Point Grading Scale.</p>`,
          { grade: g, points: pts },
          ["lookup letter grade point value", "format grading rule"]);
      }
    }

    // 4. Subject Credits Lookup: e.g. "Physics credits", "PPS credits", "Maths credits"
    const asksSubjectCredits = /\bcredits?\b/.test(q) && /\b(?:physics|math|maths|mathematics|chemistry|pps|programming|english|drawing|electrical|workshop|manufacturing|economics|hvpe)\b/.test(q);
    if (asksSubjectCredits) {
      const subjectCreditsMap = {
        physics: { name: "Applied Physics (BTPH-101-18 / BTPH-102-18)", credits: 4, breakdown: "3 Lectures + 1 Tutorial = 4 Credits" },
        math: { name: "Mathematics (BTAM-101-18 / BTAM-102-18)", credits: 4, breakdown: "3 Lectures + 1 Tutorial = 4 Credits" },
        maths: { name: "Mathematics (BTAM-101-18 / BTAM-102-18)", credits: 4, breakdown: "3 Lectures + 1 Tutorial = 4 Credits" },
        mathematics: { name: "Mathematics (BTAM-101-18 / BTAM-102-18)", credits: 4, breakdown: "3 Lectures + 1 Tutorial = 4 Credits" },
        chemistry: { name: "Applied Chemistry (BTCH-101-18)", credits: 4, breakdown: "3 Lectures + 1 Tutorial = 4 Credits" },
        pps: { name: "Programming for Problem Solving (BTPS-101-18)", credits: 3, breakdown: "3 Lectures = 3 Credits (Lab is separate 1.5 Cr)" },
        programming: { name: "Programming for Problem Solving (BTPS-101-18)", credits: 3, breakdown: "3 Lectures = 3 Credits (Lab is separate 1.5 Cr)" },
        english: { name: "English (BTHU-101-18)", credits: 2, breakdown: "2 Lectures = 2 Credits" },
        electrical: { name: "Basic Electrical Engineering (BTEE-101-18)", credits: 4, breakdown: "3 Lectures + 1 Tutorial = 4 Credits" },
        drawing: { name: "Engineering Graphics & Design (BTME-101-18)", credits: 3, breakdown: "1 Lecture + 4 Practical/Drawing hrs = 3 Credits" },
        workshop: { name: "Workshop/Manufacturing Practices (BTMP-101-18)", credits: 3, breakdown: "1 Lecture + 4 Practical hrs = 3 Credits" },
        manufacturing: { name: "Manufacturing Practices (BTMP-101-18)", credits: 3, breakdown: "1 Lecture + 4 Practical hrs = 3 Credits" }
      };
      const foundKey = Object.keys(subjectCreditsMap).find((key) => new RegExp(`\\b${key}\\b`, "i").test(q));
      if (foundKey) {
        const sc = subjectCreditsMap[foundKey];
        return kernel.result("ACADEMIC_SUBJECT_CREDITS", 0.99,
          `<p><strong><u>${kernel.escapeHtml(sc.name)}</u></strong></p><p>• <strong>Total Credits:</strong> ${kernel.escapeHtml(String(sc.credits))} Credits<br />• <strong>Teaching Scheme:</strong> ${kernel.escapeHtml(sc.breakdown)}</p><p class="answer-source">Official GNDEC First-Year Autonomous Study Scheme.</p>`,
          { subject: sc.name, credits: sc.credits },
          ["identify course", "retrieve official credit allocation", "render course credits breakdown"]);
      }
    }

    // 5. General CGPA Formula explanation
    if (/\b(?:cgpa|sgpa)\s*(?:formula|rule|grading|system|scale|pointer)\b/.test(q) || /\bhow\s+(?:is|to\s+calculate)\s+(?:cgpa|sgpa)\b/.test(q)) {
      return kernel.result("ACADEMIC_CGPA_CALCULATION", 0.99,
        `<p><strong><u>GNDEC / IKGPTU 10-Point Grading System & Formula</u></strong></p><p><strong>1. SGPA Formula:</strong><br />\\[ \\text{SGPA} = \\frac{\\sum (\\text{Credits}_i \\times \\text{Grade Point}_i)}{\\sum \\text{Credits}_i} \\]</p><p><strong>2. CGPA to Percentage:</strong><br /><strong>Percentage (%) = CGPA × 9.5</strong></p><p><strong>3. Letter Grade Scale:</strong><br />• <strong>O</strong> (Outstanding): 10 pts (90–100%)<br />• <strong>A+</strong> (Excellent): 9 pts (80–89%)<br />• <strong>A</strong> (Very Good): 8 pts (70–79%)<br />• <strong>B+</strong> (Good): 7 pts (60–69%)<br />• <strong>B</strong> (Above Average): 6 pts (50–59%)<br />• <strong>C</strong> (Average): 5 pts (40–49%)<br />• <strong>P</strong> (Pass): 4 pts (40% minimum)<br />• <strong>F</strong> (Fail): 0 pts (&lt;40%)</p><p class="answer-source">Official GNDEC Autonomous Academic Regulations.</p>`,
        { scale: "10-point", multiplier: 9.5 },
        ["retrieve autonomous grading scheme", "format formula and grade point table"]);
    }

    // 6. Marking Scheme, Internal / External Marks Breakdown
    const asksMarking = /\b(?:marking\s*scheme|internal\s*marks?|external\s*marks?|ca\s*marks?|ese\s*marks?|continuous\s*assessment|end\s*semester\s*exam|passing\s*marks?|mst\s*marks?|total\s*marks)\b/.test(q)
      || (/\bmarks?\b/.test(q) && /\b(?:internal|external|theory|practical|lab|physics|math|pps|chemistry|economics)\b/.test(q));
    if (asksMarking) {
      return kernel.result("ACADEMIC_MARKING_SCHEME", 0.99,
        `<p><strong><u>Official GNDEC B.Tech Autonomous Marking Scheme</u></strong></p><p><strong>1. Theory Courses (Total: 100 Marks):</strong><br />• <strong>Continuous Assessment (CA / Internal):</strong> 40 Marks<br />&nbsp;&nbsp;– Mid-Semester Tests (MST-1 & MST-2): 24–30 Marks<br />&nbsp;&nbsp;– Assignments, Quizzes & Attendance: 10–16 Marks<br />• <strong>End Semester Examination (ESE / External):</strong> 60 Marks<br />• <strong>Passing Rule:</strong> Minimum 40% in ESE (24/60) and 40% in aggregate (40/100).</p><p><strong>2. Laboratory / Practical Courses:</strong><br />• 50-Mark Labs: CA = 30 Marks, ESE = 20 Marks.<br />• 100-Mark Practicals / Workshop: CA = 60 Marks, ESE = 40 Marks.<br />• <strong>Passing Rule:</strong> Minimum 40% in internal and external components.</p><p><strong>3. Credit Allocation:</strong><br />• 1 Lecture hour/week = 1 Credit<br />• 1 Tutorial hour/week = 1 Credit<br />• 2 Practical/Lab hours/week = 1 Credit</p><p class="answer-source">Official GNDEC Autonomous Study Scheme & Examination Regulations.</p>`,
        { theory: { total: 100, ca: 40, ese: 60, pass: 40 }, lab50: { ca: 30, ese: 20 }, lab100: { ca: 60, ese: 40 } },
        ["retrieve official autonomous marking structure", "format theory and laboratory components", "state passing thresholds"]);
    }

    return null;
  }

  // ---- Attendance & Bunk Calculator Engine ----
  function academicAttendanceAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);

    const asksAttendance = /\b(?:attendance|bunk|bunks|bunking|shortage|safe\s*bunk)\b/i.test(raw)
      || (/\b(?:classes?|lectures?)\b/i.test(raw) && /\b(?:miss|skip|bunk|attend|percentage|75|kitni|chutti|how\s+many|lage)\b/i.test(raw))
      || (/\bchutti\b/i.test(raw) && /\b(?:lecture|class|me\s*se|lage|lagi|kitni)\b/i.test(raw))
      || /\b(?:attendance|bunk)\b/.test(q);
    if (!asksAttendance) return null;

    let attended = null;
    let total = null;
    let target = 76;

    const targetMatch = raw.match(/\b(\d{2})%(?!\d)/) || raw.match(/\bfor\s*(\d{2})\s*(?:percent|%|target)\b/i);
    if (targetMatch) target = Number(targetMatch[1]);

    const outOfMatch = raw.match(/(\d+)\s*(?:classes|lectures)?\s*(?:out of|\/|me se)\s*(\d+)/i)
      || raw.match(/(\d+)\s*me\s*se\s*(\d+)/i);
    if (outOfMatch) {
      const n1 = Number(outOfMatch[1]);
      const n2 = Number(outOfMatch[2]);
      if (/me\s*se/i.test(outOfMatch[0]) && n1 > n2) {
        total = n1;
        attended = n2;
      } else if (n1 <= n2) {
        attended = n1;
        total = n2;
      } else {
        total = n1;
        attended = n2;
      }
    } else {
      const numbers = raw.match(/\b\d+\b/g);
      if (numbers && numbers.length >= 2) {
        const n1 = Number(numbers[0]);
        const n2 = Number(numbers[1]);
        if (n1 <= n2) { attended = n1; total = n2; }
        else { attended = n2; total = n1; }
      }
    }

    if (attended === null || total === null || total <= 0) {
      return kernel.result("ACADEMIC_ATTENDANCE_CALCULATION", 0.96,
        `<p><strong><u>GNDEC Minimum Attendance Rule & Calculator</u></strong></p><p>• <strong>Mandatory Rule:</strong> Minimum <strong>75% attendance</strong> is required across all theory and practical subjects to appear in End Semester Exams (ESE).<br />• <strong>Safe Target:</strong> GNDEC Compass uses <strong>76%</strong> as the recommended safe cushion above the 75% minimum.<br />• <strong>Medical / Event Grace:</strong> Up to 10% relaxation is subject to approved medical / institutional certificates.</p><p class="kb-tip"><strong>Try asking with your counts:</strong><br />• <em>"Attended 24 out of 30 classes, how many can I bunk?"</em><br />• <em>"18 me se 12 lecture lage hain, kitni chutti le sakta hu?"</em><br />• <em>"Attendance calculator 15/20"</em></p><p class="answer-source">GNDEC Autonomous Attendance & Academic Regulations.</p>`,
        { defaultRule: 75, safeTarget: 76 },
        ["state 75 percent mandatory rule with 76 percent safe cushion", "provide usage examples with attendance numbers"]);
    }

    const calc = kernel.evaluateAttendance({ attended, total, target });
    if (!calc.valid) {
      return kernel.result("ACADEMIC_ATTENDANCE_CALCULATION", 0.95,
        `<p><strong>Attendance Calculation:</strong> ${kernel.escapeHtml(calc.error)}</p><p class="kb-tip">Give your counts as: <em>“attended 20 out of 25”</em>.</p>`,
        { error: calc.error },
        ["validate input bounds", "return helpful correction"]);
    }

    if (calc.status === "safe") {
      const bunkText = calc.bunksAllowed > 0
        ? `<p><strong>🎉 You are SAFE above ${calc.target}%!</strong><br />• <strong>Current Attendance:</strong> ${calc.attended}/${calc.total} (<strong>${calc.currentPct}%</strong>)<br />• <strong>Safe Bunks Allowed:</strong> You can miss up to <strong>${calc.bunksAllowed} more class${calc.bunksAllowed > 1 ? "es" : ""}</strong> consecutively.<br />• <strong>Attendance after ${calc.bunksAllowed} bunks:</strong> ${calc.attended}/${calc.total + calc.bunksAllowed} (<strong>${calc.afterBunkPct}%</strong>).</p>`
        : `<p><strong>⚠️ You are on the borderline!</strong><br />• <strong>Current Attendance:</strong> ${calc.attended}/${calc.total} (<strong>${calc.currentPct}%</strong>)<br />• <strong>Safe Bunks Allowed:</strong> <strong>0</strong> (Missing even 1 lecture will drop you below ${calc.target}%).</p>`;
      return kernel.result("ACADEMIC_ATTENDANCE_CALCULATION", 0.99,
        `<p><strong><u>Attendance & Bunk Summary (Target: ${calc.target}%)</u></strong></p>${bunkText}<p class="answer-source">Calculated per GNDEC 75% Academic Attendance Policy.</p>`,
        calc,
        ["calculate current attendance percentage", "compute safe bunk limit", "format clear guidance"]);
    } else {
      return kernel.result("ACADEMIC_ATTENDANCE_CALCULATION", 0.99,
        `<p><strong><u>⚠️ Attendance Shortage Alert (Target: ${calc.target}%)</u></strong></p><p>• <strong>Current Attendance:</strong> ${calc.attended}/${calc.total} (<strong>${calc.currentPct}%</strong>)<br />• <strong>Classes Needed:</strong> You must attend the next <strong>${calc.classesNeeded} consecutive class${calc.classesNeeded > 1 ? "es" : ""}</strong> without missing to reach <strong>${calc.target}%</strong>.<br />• <strong>Attendance after ${calc.classesNeeded} classes:</strong> ${calc.attended + calc.classesNeeded}/${calc.total + calc.classesNeeded} (<strong>${calc.afterAttendPct}%</strong>).</p><p class="answer-source">Calculated per GNDEC 75% Academic Attendance Policy.</p>`,
        calc,
        ["calculate attendance shortage", "compute consecutive classes needed to recover", "format recovery goal"]);
    }
  }

  // ---- Campus Directory & Room Navigation Engine ----
  function campusLocationAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);

    const asksLocation = /\b(?:room|kamra|kamre|hall|block|wing|floor|building|lab|laboratory|kahan|kidhar|where|location|situated|located)\b/.test(q);
    if (!asksLocation) return null;

    const info = kernel.lookupCampusRoom(raw);
    if (!info) return null;

    return kernel.result("CAMPUS_ROOM_LOCATION", 0.98,
      `<p><strong><u>📍 Campus Location: ${kernel.escapeHtml(info.name)}</u></strong></p><p>• <strong>Building / Block:</strong> ${kernel.escapeHtml(info.block)}<br />• <strong>Floor:</strong> ${kernel.escapeHtml(info.floor)}<br />• <strong>Landmark / Navigation:</strong> ${kernel.escapeHtml(info.landmark)}</p><p class="answer-source">Official GNDEC Campus Directory & Room Plan.</p>`,
      { room: info.name, block: info.block, floor: info.floor },
      ["identify requested campus room/facility", "lookup official block and floor", "render navigation landmarks"]);
  }

  // ---- Campus Administration & Leadership Engine ----
  function campusAdministrationAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);

    const asksAdmin = /\b(?:principal|director|sehijpal|dean|deans|dsw|tpo|tcc|coe|controller\s*of\s*exam|hod|hods|head\s*of\s*department|head\s*of\s*the\s*department|administration|leadership|authorities|officials)\b/.test(q);
    if (!asksAdmin) return null;

    // Overview list of administration / deans / hods
    if (/\b(?:all\s+hods?|list\s+hods?|list\s+deans?|who\s+are\s+the\s+deans?|leadership|administration\s*list|college\s*officials?)\b/.test(q)
      || (/\b(?:deans?|hods?)\b/.test(q) && /\b(?:list|all|names?|batao|dasso|show)\b/.test(q))) {
      return kernel.result("CAMPUS_ADMINISTRATION_INFO", 0.99,
        `<p><strong><u>🏛️ Key Administrative Leadership — GNDEC Ludhiana</u></strong></p><p>• <strong>Principal:</strong> Dr. Sehijpal Singh (<em>principal@gndec.ac.in</em>)<br />• <strong>Dean (Academic):</strong> Dr. Parminder Singh<br />• <strong>Dean (Student Welfare / DSW):</strong> Dr. Jatinder Kapoor<br />• <strong>Dean (Training & Placement / TPO):</strong> Dr. K.S. Mann<br />• <strong>Dean (Testing & Consultancy / TCC):</strong> Dr. Harwinder Singh<br />• <strong>Dean (Research & Development):</strong> Dr. Hardeep Singh Rai<br />• <strong>Controller of Examinations (COE):</strong> Dr. Arvind Dhingra</p><p><strong><u>Department Heads (HODs):</u></strong><br />• <strong>CSE:</strong> Dr. Parminder Singh | <strong>IT:</strong> Dr. Kiran Jyoti<br />• <strong>ECE:</strong> Dr. Narwant Singh Grewal | <strong>EE:</strong> Dr. Kanwardeep Singh<br />• <strong>ME:</strong> Dr. Harwinder Singh | <strong>CE:</strong> Dr. Puneet Pal Singh Cheema<br />• <strong>Applied Sciences:</strong> Dr. Harpreet Kaur | <strong>MBA:</strong> Dr. Parampal Singh | <strong>MCA:</strong> Dr. Jasbir Singh Saini</p><p class="answer-source">Official GNDEC Institutional Administration Directory.</p>`,
        { type: "overview" },
        ["query institutional administration directory", "format executive leadership hierarchy", "list department heads"]);
    }

    if (typeof kernel.lookupCampusAdministration === "function") {
      const info = kernel.lookupCampusAdministration(raw);
      if (info) {
        return kernel.result("CAMPUS_ADMINISTRATION_INFO", 0.99,
          `<p><strong><u>🏛️ ${kernel.escapeHtml(info.title)}: ${kernel.escapeHtml(info.name)}</u></strong></p><p>• <strong>Role & Department:</strong> ${kernel.escapeHtml(info.description)}<br />• <strong>Office Location:</strong> ${kernel.escapeHtml(info.office)}<br />• <strong>Official Email:</strong> <code>${kernel.escapeHtml(info.email)}</code>${info.phone ? `<br />• <strong>Contact:</strong> ${kernel.escapeHtml(info.phone)}` : ""}</p><p class="answer-source">Official GNDEC Institutional Administration Directory.</p>`,
          info,
          ["match administrative role/designation", "retrieve verified office location and contact", "render official profile card"]);
      }
    }

    return null;
  }

  // ---- Identity resolution (students & faculty) ----
  function normalizeIdentifier(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function nameMatches(queryName, recordName) {
    const query = normalizeIdentifier(queryName);
    const record = normalizeIdentifier(recordName);
    if (!query || !record) return { level: 0 };
    if (record === query) return { level: 4, reason: "exact name" };
    const qTokens = String(queryName || "").trim().split(/\s+/).map((token) => token.toLowerCase()).filter(Boolean);
    const rTokens = String(recordName || "").trim().split(/\s+/).map((token) => token.toLowerCase()).filter(Boolean);
    if (qTokens.length && qTokens.every((token) => rTokens.some((other) => other === token))) return { level: 4, reason: "exact words" };
    // Per-token fuzzy pass: every query word must find a close spelling among
    // the record words. This catches "Chahat Jainn" against "CHAHAT JAIN"
    // even when a leading title ("Dr") would break a whole-string comparison.
    // Phonetic & Alias Expansion
    const ALIAS_MAP = {
      "nav": ["navdeep", "navjot", "navpreet"],
      "sim": ["simran", "simranjeet", "simar"],
      "har": ["harman", "harpreet", "hardeep"],
      "man": ["manpreet", "mandeep", "manjot"],
      "gur": ["gurpreet", "gurdeep", "gursharan"],
      "mac": ["manpreet", "mandeep"],
      "lucky": ["lakshay", "lakshya", "laksh"],
      "kaush": ["kaushik"],
      "vicky": ["vikas", "vikram"],
      "raju": ["raj", "rajesh", "rajinder"]
    };
    
    // Check aliases
    for (const qToken of qTokens) {
      if (ALIAS_MAP[qToken]) {
        for (const alias of ALIAS_MAP[qToken]) {
          if (rTokens.includes(alias)) return { level: 2, reason: "alias match" };
        }
      }
    }

    const closeThreshold = (token) => (token.length >= 7 ? 2 : 1);
    if (qTokens.length && qTokens.every((token) =>
      rTokens.some((other) => other.startsWith(token)
        || (token.length >= 4 && kernel.editDistance(other, token) <= closeThreshold(token))))) {
      return { level: 3, reason: "close spelling" };
    }
    if (qTokens.length && qTokens.every((token) => rTokens.some((other) => other.startsWith(token)))) return { level: 3, reason: "prefix match" };
    if (qTokens.length === 1 && rTokens.some((token) => token.length >= 5 && kernel.editDistance(token, qTokens[0]) <= (qTokens[0].length >= 7 ? 2 : 1))) return { level: 2, reason: "close spelling" };
    const phoneticQuery = qTokens.map((token) => kernel.phoneticKey(token)).filter(Boolean).join("");
    const phoneticRecord = rTokens.map((token) => kernel.phoneticKey(token)).filter(Boolean).join("");
    if (phoneticQuery.length >= 3 && phoneticQuery === phoneticRecord) return { level: 1, reason: "sounds like" };
    return { level: 0 };
  }

  function identifierInQuestion(question) {
    const crn = question.match(/\bCRN[:\s#-]*([A-Z0-9]{4,12})\b/i);
    if (crn) return { field: "crn", value: normalizeIdentifier(crn[1]) };
    const registration = question.match(/\bregistration(?:\s+(?:no|number))?\s*[:#-]?\s*([A-Z0-9]{6,12})\b/i);
    if (registration) return { field: "registrationNo", value: normalizeIdentifier(registration[1]) };
    const serial = question.match(/\bserial(?:\s+(?:no|number))?\s*[:#-]?\s*(\d{1,4})\b/i);
    if (serial) return { field: "serialNo", value: serial[1] };
    return null;
  }

  function sectionHintInQuestion(question, knownGroups) {
    const upper = String(question || "").toUpperCase();
    const tokens = upper.match(/\b[A-Z]{2,5}\d?[A-Z]?\b/g) || [];
    const known = new Set((knownGroups || []).map((group) => String(group || "").toUpperCase()));
    const hits = [...new Set(tokens.filter((token) => known.has(token)))];
    return hits.length === 1 ? hits[0] : "";
  }

  function personSearchAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);
    const students = Array.isArray(context.studentRoster) ? context.studentRoster.filter((record) => record && typeof record === "object") : [];
    const faculty = Array.isArray(context.facultyDirectory) ? context.facultyDirectory.filter((record) => record && typeof record === "object") : [];
    const conversation = context.conversation || {};

    // Continue an open clarification first. Only an explicit selection
    // (number, CRN, registration, serial) resolves it — a bare section word
    // is never enough to reveal a full student record.
    const pending = conversation.pending;
    if (pending?.kind === "person" && Array.isArray(pending.candidates) && pending.candidates.length) {
      const ordinal = kernel.ordinalIndex(q);
      const chosenByOrdinal = ordinal ? pending.candidates[ordinal - 1] : null;
      if (chosenByOrdinal) return renderPersonResult(chosenByOrdinal, context, "resolved from your clarification");
      const identifier = identifierInQuestion(question);
      if (identifier) {
        const byId = pending.candidates.filter((candidate) => normalizeIdentifier(candidate[identifier.field]) === identifier.value);
        if (byId.length === 1) return renderPersonResult(byId[0], context, `matched by ${identifier.field}`);
        return kernel.result("PERSON_CLARIFY_AGAIN", 0.95,
          `<p>That ${kernel.escapeHtml(identifier.field)} does not match the listed candidates. Choose a number, or give the correct CRN, registration number, or serial.</p>`,
          [], ["keep pending clarification open"], {});
      }
      return kernel.result("PERSON_CLARIFY_AGAIN", 0.95,
        `<p>Please choose one of the listed matches by number, or give a CRN, registration number, or serial.</p>`,
        [], ["keep pending clarification open"], {});
    }

    const wantsStudent = /\bstudent\b/.test(q);
    const wantsFaculty = /\b(?:faculty|teacher|professor|lecturer)\b/.test(q);
    const explicitSearch = /\b(?:find|search|lookup|details|info|information|about|who is|dhundo|khojo)\b/.test(q);
    // A bare name is only 2–3 personal-name tokens with no question words.
    const bareName = !wantsStudent && !wantsFaculty && !explicitSearch
      && !/\b(?:what|which|when|where|who|why|how|is|are|do|does|did)\b/.test(q)
      && kernel.looksLikeBarePersonName(raw);

    if (!explicitSearch && !bareName && !wantsFaculty) return null;

    const identifier = identifierInQuestion(question);
    const name = kernel.extractPersonName(raw);
    const knownGroups = uniqueGroups(students.map((record) => record.section));
    const sectionHint = sectionHintInQuestion(question, knownGroups);

    if (wantsFaculty && !explicitSearch && !bareName) {
      // "faculty Dr Chahat Jain" / "teacher Jasmeet Kaur" — public directory.
      const ranked = rankPeople(faculty, name);
      if (ranked.exact.length === 1) return renderPersonResult(ranked.exact[0], context, ranked.reason);
      if (ranked.exact.length > 1) return clarifyPeople(ranked.exact, context, ranked.reason);
      if (ranked.close.length === 1) return renderPersonResult(ranked.close[0], context, ranked.reason);
      if (ranked.close.length > 1) return clarifyPeople(ranked.close, context, ranked.reason);
      return kernel.result("FACULTY_NOT_FOUND", 0.9,
        `<p>No official faculty directory entry sounds like <strong>${kernel.escapeHtml(name)}</strong>.</p>`,
        [], ["search official faculty directory", "report absence honestly"]);
    }

    // Bare names never auto-search students (privacy-first). Faculty is a
    // public professional directory, so a bare name may resolve there.
    if (bareName) {
      if (faculty.length) {
        const ranked = rankPeople(faculty, name);
        if (ranked.exact.length === 1) return renderPersonResult(ranked.exact[0], context, ranked.reason);
        if (ranked.exact.length > 1 || ranked.close.length >= 1) return clarifyPeople([...ranked.exact, ...ranked.close].slice(0, kernel.LIMITS.candidates), context, ranked.reason || "close match");
      }
      return kernel.result("PERSON_KIND_CLARIFY", 0.9,
        `<p><strong>${kernel.escapeHtml(name)}</strong> could be a faculty member or a student.</p><p>To protect privacy, please say “faculty ${kernel.escapeHtml(name)}”, “teacher ${kernel.escapeHtml(name)}”, or “find student ${kernel.escapeHtml(name)}”.</p>`,
        [], ["detect bare personal name", "ask intent instead of searching silently"],
        { pending: { kind: "kind", candidates: [] } });
    }

    if (identifier && (wantsStudent || (!wantsFaculty && explicitSearch))) {
      const byId = students.filter((record) => normalizeIdentifier(record[identifier.field]) === identifier.value);
      if (byId.length === 1) return renderPersonResult(byId[0], context, `matched by ${identifier.field}`);
      if (byId.length > 1) return clarifyPeople(byId, context, "identifier");
      return kernel.result("PERSON_NOT_FOUND", 0.9,
        `<p>No verified student matches that ${kernel.escapeHtml(identifier.field)} in the current official roster.</p>`,
        [], ["search current roster by identifier", "report absence honestly"]);
    }

    if (!name) return null;

    if (wantsFaculty) {
      const ranked = rankPeople(faculty, name);
      if (ranked.exact.length === 1) return renderPersonResult(ranked.exact[0], context, ranked.reason);
      if (ranked.exact.length > 1) return clarifyPeople(ranked.exact, context, ranked.reason);
      if (ranked.close.length === 1) return renderPersonResult(ranked.close[0], context, ranked.reason);
      if (ranked.close.length > 1) return clarifyPeople(ranked.close, context, ranked.reason);
      // Faculty questions stay in the public directory; they never fall
      // through into the private student roster.
      return kernel.result("FACULTY_NOT_FOUND", 0.9,
        `<p>No official faculty directory entry sounds like <strong>${kernel.escapeHtml(name)}</strong>.</p>`,
        [], ["search official faculty directory", "report absence honestly"]);
    }

    if (wantsStudent || (explicitSearch && !wantsFaculty)) {
      // An unqualified explicit search ("find Aman Kumar") resolves against
      // the public faculty directory first; the private roster is only
      // searched when the user explicitly says "student".
      if (!wantsStudent && faculty.length) {
        const ranked = rankPeople(faculty, name);
        const candidates = ranked.exact.length ? ranked.exact : ranked.close;
        if (candidates.length === 1) return renderPersonResult(candidates[0], context, ranked.reason);
        if (candidates.length > 1) return clarifyPeople(candidates, context, ranked.reason);
        return kernel.result("FACULTY_NOT_FOUND", 0.9,
          `<p>No official faculty directory entry sounds like <strong>${kernel.escapeHtml(name)}</strong>. To search students, say “find student ${kernel.escapeHtml(name)}”.</p>`,
          [], ["search official faculty directory", "protect private roster behind an explicit request"]);
      }
      let pool = students;
      if (sectionHint) pool = pool.filter((record) => String(record.section || "").toUpperCase() === sectionHint);
      const ranked = rankPeople(pool, name);
      const candidates = ranked.exact.length ? ranked.exact : ranked.close;
      if (candidates.length === 1) return renderPersonResult(candidates[0], context, ranked.reason);
      if (candidates.length > 1) return clarifyPeople(candidates, context, ranked.reason);
      // With no roster loaded, an explicit student search must fall through
      // to richer engines instead of claiming absence from nothing.
      if (!students.length) return null;
      return kernel.result("STUDENT_NOT_FOUND", 0.9,
        `<p>No verified student named <strong>${kernel.escapeHtml(name)}</strong>${sectionHint ? ` in ${kernel.escapeHtml(sectionHint)}` : ""} appears in the current official roster${sectionHint ? "" : ". Try adding a branch or section"}.</p>`,
        [], ["search current official roster", "apply section filter when present", "report absence honestly"]);
    }
    return null;
  }

  function uniqueGroups(values) {
    return [...new Set((values || []).map((value) => String(value || "").toUpperCase()).filter(Boolean))];
  }

  function rankPeople(records, name) {
    const exact = [];
    const close = [];
    let reason = "";
    records.forEach((record) => {
      const match = nameMatches(name, record.name);
      if (match.level >= 4) { exact.push(record); reason = match.reason; }
      else if (match.level >= 2) { close.push(record); reason = match.reason; }
      else if (match.level === 1) { close.push(record); reason = match.reason; }
    });
    return { exact, close, reason };
  }

  function clarifyPeople(records, context, reason) {
    const safeRecords = records.slice(0, kernel.LIMITS.candidates).map((record) => ({
      kind: record.profileId ? "faculty" : "student",
      id: String(record.profileId || record.crn || ""),
      name: String(record.name || ""),
      branch: String(record.branch || record.department || ""),
      section: String(record.section || "")
    }));
    const lines = safeRecords.map((record, index) =>
      `<li><button class="inline-chip" data-refine="${index + 1}">${index + 1}. ${kernel.escapeHtml(record.name)} (${kernel.escapeHtml(record.section || record.branch || "Unknown")})</button></li>`).join("");
    return kernel.result("PERSON_MULTIPLE_MATCHES", 0.95,
      `<p>I found more than one verified match (${kernel.escapeHtml(reason)}). Tap a chip to refine:</p><ul class="refine-list" style="list-style:none; padding:0; margin:8px 0; display:flex; gap:8px; flex-wrap:wrap;">${lines}</ul><p>Full details are shown only after one unique person is selected.</p>`,
      { candidates: safeRecords.length },
      ["rank verified records", "detect duplicates", "request disambiguation without revealing private fields", "render inline tap-to-refine chips"],
      { pending: { kind: "person", candidates: safeRecords, turn: (Number(context.conversation?.turnCount) || 0) + 1 } });
  }

  function renderPersonResult(record, context, how) {
    const isFaculty = Boolean(record.profileId);
    if (isFaculty) {
      const lines = [
        `<li><strong>Name:</strong> ${kernel.escapeHtml(record.name)}</li>`,
        record.designation ? `<li><strong>Designation:</strong> ${kernel.escapeHtml(record.designation)}</li>` : "",
        record.department ? `<li><strong>Department:</strong> ${kernel.escapeHtml(record.department)}</li>` : "",
        record.email ? `<li><strong>Email:</strong> ${kernel.escapeHtml(record.email)}</li>` : "",
        record.profileUrl ? `<li><strong>Official profile:</strong> <a href="${kernel.escapeHtml(record.profileUrl)}" rel="noopener">${kernel.escapeHtml(record.profileUrl)}</a></li>` : ""
      ].filter(Boolean).join("");
      return kernel.result("FACULTY_DETAILS", 0.98,
        `<p><strong><u>Official faculty record</u></strong></p><ul>${lines}</ul><p class="answer-source">Official GNDEC faculty directory · matched by ${kernel.escapeHtml(how)}.</p>`,
        { kind: "faculty", id: record.profileId || "", name: record.name || "" },
        ["select the single verified directory record", "render professional fields only"],
        { activeTeacher: record.name || "", pending: null });
    }
    const lines = [
      `<li><strong>Name:</strong> ${kernel.escapeHtml(record.name)}</li>`,
      record.crn ? `<li><strong>CRN:</strong> ${kernel.escapeHtml(record.crn)}</li>` : "",
      record.registrationNo ? `<li><strong>Registration:</strong> ${kernel.escapeHtml(record.registrationNo)}</li>` : "",
      (record.currentSerialNo || record.serialNo) ? `<li><strong>Serial:</strong> ${kernel.escapeHtml(String(record.currentSerialNo || record.serialNo))}</li>` : "",
      record.branch ? `<li><strong>Branch:</strong> ${kernel.escapeHtml(record.branch)}</li>` : "",
      record.section ? `<li><strong>Section:</strong> ${kernel.escapeHtml(record.section)}${record.subsection ? ` / ${kernel.escapeHtml(record.subsection)}` : ""}</li>` : "",
      record.mentor ? `<li><strong>Mentor:</strong> ${kernel.escapeHtml(record.mentor)}</li>` : ""
    ].filter(Boolean).join("");
    return kernel.result("STUDENT_DETAILS", 0.98,
      `<p><strong><u>Verified student record</u></strong></p><ul>${lines}</ul><p class="answer-source">Current official roster revision · matched by ${kernel.escapeHtml(how)} · read-only lookup.</p>`,
      { kind: "student", crn: record.crn || "", name: record.name || "" },
      ["select the single verified roster record", "render verified fields only"],
      { activeSubject: "", activeTeacher: "", pending: null });
  }

  function reverseSyllabusAnswer(question, context) {
    const raw = String(question || "").trim();
    const isReverseSyllabus = /\b(?:which|kaunsa|kis)\s*(?:subject|course).*(?:teaches|has|covers|topics?|contains)\s+([a-z0-9\s]+)\b/.exec(raw)
                           || /\b(?:what|kaunsa)\s*(?:subject|course).*(?:for|about)\s+([a-z0-9\s]+)\b/.exec(raw);
    if (!isReverseSyllabus || !context.syllabus || !context.syllabus.length) return null;
    const topic = isReverseSyllabus[1].trim();
    if (topic.length < 3) return null;
    
    const results = [];
    context.syllabus.forEach(course => {
      if (Array.isArray(course.units)) {
        course.units.forEach((unit, idx) => {
          if (new RegExp(`\\b${topic}\\b`, "i").test(unit.content) || new RegExp(`\\b${topic}\\b`, "i").test(unit.title)) {
            results.push(`<li><strong>${kernel.escapeHtml(course.name)} (${course.code})</strong> — Unit ${idx + 1}: ${kernel.escapeHtml(unit.title)}</li>`);
          }
        });
      }
    });
    
    if (results.length) {
      return kernel.result("SYLLABUS_REVERSE_LOOKUP", 0.95,
        `<p><strong>I found "${kernel.escapeHtml(topic)}" in the following official syllabus units:</strong></p><ul>${results.join("")}</ul><p class="answer-source">Official GNDEC Autonomous Syllabus Index</p>`,
        { topic },
        ["scan official syllabus JSON", "match topic keywords to units"]);
    }
    return kernel.result("SYLLABUS_REVERSE_LOOKUP", 0.95,
      `<p>I couldn't find "${kernel.escapeHtml(topic)}" in the official first-year syllabus.</p>`,
      { topic },
      ["scan official syllabus JSON", "report absence"]);
  }

  function sgpaGoalAnswer(question, context) {
    const raw = String(question || "").trim();
    const sgpaMatch = /\b(?:need|want|target)\s*(?:an?\s*)?(\d+(?:\.\d+)?)\s*sgpa\b/i.exec(raw);
    if (!sgpaMatch) return null;
    const targetSGPA = Number(sgpaMatch[1]);
    
    return kernel.result("SGPA_GOAL_SOLVER", 0.95,
        `<p><strong>SGPA Goal Solver</strong></p><p>To reach an SGPA of <strong>${targetSGPA}</strong>, you need to maintain an average grade point of ${targetSGPA}.</p><p class="kb-tip">Tip: A+ is 9 points, A is 8 points, B+ is 7 points. Focus on 4-credit subjects (like Mathematics and Physics) first, as they weight the heaviest.</p><p class="answer-source">GNDEC Autonomous Regulations Math Engine</p>`,
        { target: targetSGPA },
        ["parse SGPA target", "compute average required grade point"]);
  }

  function dataDomainsAnswer(question, context) {
    const raw = String(question || "").trim();
    const q = kernel.normalize(raw);
    
    // Library
    if (/\blibrary\b/i.test(q)) {
       return kernel.result("LIBRARY_INFO", 0.95,
         `<p><strong>Library Information 📚</strong></p>
          <p><strong>Weekdays:</strong> ${kernel.LIBRARY_HOURS?.weekday.open} to ${kernel.LIBRARY_HOURS?.weekday.close}</p>
          <p><strong>Weekends:</strong> ${kernel.LIBRARY_HOURS?.weekend.open} to ${kernel.LIBRARY_HOURS?.weekend.close}</p>
          <p class="kb-tip">${kernel.LIBRARY_HOURS?.notice}</p>
          <p class="answer-source">Campus Information Catalog</p>`,
         { hours: kernel.LIBRARY_HOURS },
         ["query library hours and rules"]);
    }

    // Transport
    if (/\b(?:bus|transport|routes?)\b/i.test(q)) {
       const routes = kernel.TRANSPORT_ROUTES || [];
       const routeHtml = routes.map(r => `<li><strong>${kernel.escapeHtml(r.name)}</strong>: Departs ${kernel.humanTime(r.departure)}, Returns ${kernel.humanTime(r.return)}</li>`).join("");
       return kernel.result("TRANSPORT_INFO", 0.95,
         `<p><strong>College Transport & Buses 🚌</strong></p>
          <ul>${routeHtml}</ul>
          <p class="answer-source">Campus Transport Office</p>`,
         { routes },
         ["query transport routes"]);
    }

    // Clubs
    if (/\b(?:club|scie|lug|society|cultural)\b/i.test(q)) {
       const clubs = kernel.CLUBS || [];
       const match = clubs.find(c => new RegExp(`\\b${c.name}\\b`, "i").test(q)) || clubs[0];
       if (match) {
         return kernel.result("CLUB_INFO", 0.95,
           `<p><strong>${kernel.escapeHtml(match.name)} (${kernel.escapeHtml(match.full)})</strong></p>
            <p>Type: ${kernel.escapeHtml(match.type)}</p>
            <p>Next Event: <strong>${kernel.escapeHtml(match.nextEvent)}</strong></p>
            <p class="answer-source">Clubs & Societies Event Calendar</p>`,
           { club: match },
           ["query club information"]);
       }
    }

    // Placement
    if (/\b(?:placement|internship|tpo)\b/i.test(q)) {
       const p = kernel.PLACEMENT_INFO;
       if (p) {
         const upcHtml = p.upcoming.map(u => `<li><strong>${kernel.escapeHtml(u.company)}</strong> (${kernel.escapeHtml(u.role)}) - ${kernel.escapeHtml(u.date)}</li>`).join("");
         return kernel.result("PLACEMENT_INFO", 0.95,
           `<p><strong>Training & Placement Cell 💼</strong></p>
            <p><strong>Eligibility:</strong> ${kernel.escapeHtml(p.eligibility)}</p>
            <p><strong>Upcoming Drives:</strong></p>
            <ul>${upcHtml}</ul>
            <p class="answer-source">TPO Office Calendar</p>`,
           { placements: p },
           ["query placement eligibility and drives"]);
       }
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
      const candidate = reverseSyllabusAnswer(original, mergedContext)
        || sgpaGoalAnswer(original, mergedContext)
        || dataDomainsAnswer(original, mergedContext)
        || holidayAnswer(original, mergedContext)
        || academicMarkingAnswer(original, mergedContext)
        || academicAttendanceAnswer(original, mergedContext)
        || campusLocationAnswer(original, mergedContext)
        || campusAdministrationAnswer(original, mergedContext)
        || calculationAnswer(original)
        || calendarAnswer(original, mergedContext)
        || personSearchAnswer(original, mergedContext);
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

  function suggest(input, context = {}) {
    const pool = [
      "What time is it in India?",
      "How many holidays in August?",
      "Is on 15 August holiday?",
      "When is the next holiday?",
      "What is the marking scheme for Physics?",
      "Where is G6 room located?",
      "Where is Physics lab?",
      "Who is the Principal of GNDEC?",
      "Who is HOD CSE?",
      "Who is Dean Academics?",
      "What date is parson?",
      "What day is 17 August 2026?",
      "Solve 2x + 3 = 11",
      "Calculate 25% of 240",
      "Find student Aman Kumar",
      "Faculty Dr Chahat Jain",
      ...(Array.isArray(context?.studentRoster) && context.studentRoster.length ? ["Find a student by name"] : [])
    ];
    return kernel.rankSuggestions(pool, kernel.normalize(input), 6);
  }

  function validateResult(candidate) {
    return kernel.validateShape(candidate, MIN_CONFIDENCE);
  }

  globalScope.CompassBrainV1_2 = Object.freeze({
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

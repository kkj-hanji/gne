(function installCompassBrain(globalScope) {
  "use strict";

  const VERSION = "2.12.0";
  const MIN_CONFIDENCE = 0.82;
  const MAX_RECENT_TURNS = 6;
  const MAX_PLAN_STEPS = 8;
  const MAX_INPUT_LENGTH = 1200;
  const MAX_ANSWER_LENGTH = 64000;
  const METRICS = {
    processed: 0,
    handled: 0,
    fallback: 0,
    totalProcessingMs: 0,
    maxProcessingMs: 0,
    intents: Object.create(null),
    fallbackReasons: Object.create(null)
  };
  const FALLBACK_REASONS = Object.freeze({
    DISABLED: "BRAIN_DISABLED",
    UNSUPPORTED: "UNSUPPORTED_INTENT",
    LOW_CONFIDENCE: "LOW_CONFIDENCE",
    MISSING_DATA: "MISSING_DATA",
    VERIFICATION_FAILED: "VERIFICATION_FAILED",
    INVALID_RESULT: "INVALID_RESULT",
    EXCEPTION: "BRAIN_EXCEPTION"
  });

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const CALENDAR_DAYS = [...DAYS, "Saturday", "Sunday"];
  const DEFAULT_BELL_SLOTS = Object.freeze([
    [510, 570], [570, 630], [630, 690], [690, 750],
    [750, 810], [810, 870], [870, 930], [930, 980]
  ]);
  const MONTHS = Object.freeze({
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
    april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
    august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9,
    oct: 9, november: 10, nov: 10, december: 11, dec: 11
  });

  const PHRASES = Object.freeze([
    [/\b(?:day\s+after\s+tomorrow|day-after-tomorrow|parso|parson)\b/g, " day after tomorrow "],
    [/\b(?:timetabel|timetble|timetabl|time tabel)\b/g, "timetable"],
    [/\b(?:loacation|locaton|locatoin|palce|plcae)\b/g, "location"],
    [/\b(?:techer|techers|taecher|faculity)\b/g, "teacher"],
    [/\b(?:syllbus|sylabus|syllubus)\b/g, "syllabus"],
    [/\b(?:subjet|subjets|subect)\b/g, "subjects"],
    [/\b(?:tomor+ow|tomm?or+ow|kal)\b/g, "tomorrow"],
    [/\b(?:tod+ay|aaj|ajj)\b/g, "today"],
    [/\b(?:nxt|agle|agli|agla)\b/g, "next"],
    [/\b(?:clas+|lectur+|lecture)\b/g, "class"],
    [/\b(?:techers?|techer|sir|maam|madam)\b/g, "teacher"],
    [/\b(?:subjets?|subects?|sujects?)\b/g, "subjects"],
    [/\b(?:kaha|kahaan|kidhar|kithe|kithhe)\b/g, "where"],
    [/\b(?:kaun|kon)\b/g, "who"],
    [/\b(?:baad|bad)\b/g, "after"],
    [/\b(?:pehla|pehli)\b/g, "first"],
    [/\b(?:akhri|aakhri)\b/g, "last"],
    [/\b(?:meri|mera|mere|my)\b/g, "my"],
    [/\b(?:kab|kad|kado)\b/g, "when"],
    [/\b(?:vishay|vishe)\b/g, "subjects"],
    [/\b(?:padhata|padhati|padhaunda|padhaundi|teachin)\b/g, "teaches"],
    [/\b(?:padhaata|padhaati|padhate|padhonda|padhondi)\b/g, "teaches"],
    [/\b(?:naam|nam)\b/g, "name"],
    [/\b(?:aur|atte)\b/g, "and"],
    [/\b(?:khali|khaali)\b/g, "free"],
    [/\b(?:sabse|sab ton)\s+(?:halka|halki|kam|ghatt)\b/g, "lightest"],
    [/\b(?:sabse|sab ton)\s+(?:zyada|jada|vadh|wadh)\b/g, "most"],
    [/\b(?:kitna|kinna)\s+(?:lamba|long)\b/g, "how long"],
    [/\b(?:plus|jod|jodo)\b/g, " + "],
    [/\b(?:minus|ghata|ghatao)\b/g, " - "],
    [/\b(?:times|multiply|multiplied by|guna)\b/g, " * "],
    [/\b(?:divided by|divide|bhaag)\b/g, " / "],
    [/\b(?:hafte|hafta|haftey)\b/g, "week"],
    [/\b(?:imarat|building|block)\b/g, "building"],
    [/\u0917\u0923\u093f\u0924|\u0a17\u0a23\u0a3f\u0a24/gu, " maths "],
    [/(?:\u092d\u094c\u0924\u093f\u0915|\u092b\u093f\u091c\u093f\u0915\u094d\u0938|\u0a2d\u0a4c\u0a24\u0a3f\u0a15|\u0a2b\u0a3f\u0a1c\u0a3c\u0a3f\u0a15\u0a38)/gu, " physics "],
    [/\u0936\u093f\u0915\u094d\u0937\u0915|\u091f\u0940\u091a\u0930|\u0905\u0927\u094d\u092f\u093e\u092a\u0915|\u0a05\u0a27\u0a3f\u0a06\u0a2a\u0a15|\u0a1f\u0a40\u0a1a\u0a30/gu, " teacher "],
    [/\u0928\u093e\u092e|\u0a28\u0a3e\u0a2e/gu, " name "],
    [/\u0914\u0930|\u0a05\u0a24\u0a47/gu, " and "],
    [/(?:\u0938\u092c\u0938\u0947\s+(?:\u0939\u0932\u094d\u0915\u093e|\u0915\u092e)|\u0a38\u0a2d\s+\u0a24\u0a4b\u0a02\s+(?:\u0a39\u0a32\u0a15\u0a3e|\u0a18\u0a71\u0a1f))/gu, " lightest "],
    [/(?:\u0938\u092c\u0938\u0947\s+(?:\u091c\u094d\u092f\u093e\u0926\u093e|\u091c\u093c\u094d\u092f\u093e\u0926\u093e)|\u0a38\u0a2d\s+\u0a24\u0a4b\u0a02\s+(?:\u0a35\u0a71\u0a27|\u0a1c\u0a3c\u0a3f\u0a06\u0a26\u0a3e))/gu, " most "],
    [/(?:\u0916\u093e\u0932\u0940|\u0a16\u0a3e\u0a32\u0a40)/gu, " free "],
    [/(?:\u092c\u094d\u0930\u0947\u0915|\u0935\u093f\u0930\u093e\u092e|\u0a2c\u0a4d\u0a30\u0a47\u0a15|\u0a35\u0a3f\u0a30\u0a3e\u0a2e)/gu, " break "],
    [/(?:\u0915\u093f\u0924\u0928\u093e\s+\u0932\u0902\u092c\u093e|\u0a15\u0a3f\u0a70\u0a28\u0a3e\s+\u0a32\u0a70\u0a2c\u0a3e)/gu, " how long "],
    [/(?:\u0907\u092e\u093e\u0930\u0924|\u092d\u0935\u0928|\u0a07\u0a2e\u0a3e\u0a30\u0a24|\u0a2c\u0a3f\u0a32\u0a21\u0a3f\u0a70\u0a17)/gu, " building "],
    [/(?:\u0939\u092b\u094d\u0924[\u093e\u0947]|\u0939\u092b\u093c\u094d\u0924[\u093e\u0947]|\u0a39\u0a2b\u0a3c\u0a24[\u0a3e\u0a47]|\u0a39\u0a2b\u0a24[\u0a3e\u0a47])/gu, " week "],
    [/\u092a\u0922\u093c\u093e\u0924\u093e|\u092a\u0922\u093c\u093e\u0924\u0940|\u092a\u0922\u093c\u093e\u0924\u0947|\u0a2a\u0a5c\u0a4d\u0a39\u0a3e\u0a09\u0a02\u0a26\u0a3e|\u0a2a\u0a5c\u0a4d\u0a39\u0a3e\u0a09\u0a02\u0a26\u0a40/gu, " teaches "],
    [/\u092a\u094d\u0930\u094b\u092b\u093c\u093e\u0907\u0932|\u092a\u094d\u0930\u094b\u092b\u093e\u0907\u0932|\u0a2a\u0a4d\u0a30\u0a4b\u0a2b\u0a3c\u0a3e\u0a08\u0a32/gu, " profile "],
    [/(?:कितने|कितनी|ਕਿੰਨੇ|ਕਿੰਨੀਆਂ)/gu, " how many "],
    [/(?:पहला|पहली|ਪਹਿਲਾ|ਪਹਿਲੀ)/gu, " first "],
    [/(?:आखिरी|अंतिम|ਆਖਰੀ)/gu, " last "],
    [/(?:शनिवार|ਸ਼ਨੀਵਾਰ)/gu, " saturday "],
    [/(?:रविवार|ਐਤਵਾਰ)/gu, " sunday "],
    [/(?:कब|ਕਦੋਂ)/gu, " when "],
    [/(?:विषय|ਵਿਸ਼ੇ)/gu, " subjects "],
    [/(?:बताओ|दिखाओ|ਦੱਸੋ|ਦਿਖਾਓ)/gu, " show "],
    [/(?:आज|ਅੱਜ)/gu, " today "], [/(?:कल|ਕੱਲ੍ਹ|ਕਲ੍ਹ)/gu, " tomorrow "],
    [/(?:अगला|अगली|ਅਗਲਾ|ਅਗਲੀ)/gu, " next "], [/(?:कहाँ|कहा|किधर|ਕਿੱਥੇ|ਕਿਥੇ)/gu, " where "],
    [/(?:विद्यार्थी|छात्र|स्टूडेंट|ਵਿਦਿਆਰਥੀ|ਸਟੂਡੈਂਟ)/gu, " student "], [/(?:विवरण|जानकारी|ਜਾਣਕਾਰੀ|ਵੇਰਵਾ)/gu, " details "],
    [/(?:उप[- ]?अनुभाग|सबसेक्शन|ਸਬਸੈਕਸ਼ਨ)/gu, " subsection "], [/(?:अनुभाग|सेक्शन|ਸੈਕਸ਼ਨ)/gu, " section "],
    [/(?:शाखा|ब्रांच|ਬ੍ਰਾਂਚ)/gu, " branch "], [/(?:पंजीकरण|रजिस्ट्रेशन|ਰਜਿਸਟ੍ਰੇਸ਼ਨ)/gu, " registration "],
    [/(?:क्रमांक|सीरियल|ਸੀਰੀਅਲ)/gu, " serial "], [/(?:पुराना|पिछला|ਪੁਰਾਣਾ|ਪਿਛਲਾ)/gu, " previous "],
    [/(?:मेंटर|मार्गदर्शक|ਮੈਂਟਰ)/gu, " mentor "], [/(?:फ़ोन|फोन|मोबाइल|ਫ਼ੋਨ|ਫੋਨ|ਮੋਬਾਈਲ)/gu, " phone "],
    [/(?:सभी|सारी|पूरी|ਸਾਰੇ|ਸਾਰੀ|ਪੂਰੀ)/gu, " all "], [/(?:कौन|ਕੌਣ)/gu, " who "],
    [/(?:मेरा|मेरी|मेरे|ਮੇਰਾ|ਮੇਰੀ|ਮੇਰੇ)/gu, " my "],
    [/(?:का|की|के)/gu, " ka "], [/(?:ਦਾ|ਦੀ|ਦੇ)/gu, " da "],
    [/(?:तारीख|ਤਾਰੀਖ)/gu, " date "], [/(?:दिन|ਦਿਨ)/gu, " day "]
  ]);

  function clean(value) {
    return String(value || "").normalize("NFKC").toLowerCase()
      // Devanagari and Gurmukhi vowel signs/viramas are Unicode marks, not
      // letters. Removing them corrupts native-script words before aliases
      // can run (for example, "खाली" became disconnected consonants).
      .replace(/[’']/g, "'").replace(/[^\p{L}\p{M}\p{N}%+*/^×÷().:\-\s]/gu, " ")
      .replace(/\s+/g, " ").trim();
  }

  function normalize(input) {
    let normalized = clean(input);
    PHRASES.forEach(([pattern, replacement]) => { normalized = normalized.replace(pattern, replacement); });
    return normalized.replace(/\btime\s*table\b/g, "timetable").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  }

  function humanTime(minutes) {
    const normalized = ((Number(minutes) % 1440) + 1440) % 1440;
    const hour = Math.floor(normalized / 60);
    return `${hour % 12 || 12}:${String(normalized % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  }

  function validClass(item) {
    return Boolean(item && DAYS.includes(item.day) && Number.isFinite(item.start) && Number.isFinite(item.end)
      && item.end > item.start && String(item.subject || "").trim());
  }

  function unique(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  }

  function teacherNames(value) {
    return String(value || "").split(/\s*,\s*|\s+&\s+/).map((teacher) => teacher.trim()).filter((teacher) => teacher && !/not listed/i.test(teacher));
  }

  function classTypeLabel(value) {
    const type = String(value || "").trim().toUpperCase();
    if (type === "L") return "Lecture";
    if (type === "T") return "Tutorial";
    if (type === "P") return "Practical/Lab";
    return type || "Class";
  }

  function durationLabel(minutes) {
    const safeMinutes = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(safeMinutes / 60);
    const remainder = safeMinutes % 60;
    return [hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "", remainder ? `${remainder} minutes` : ""].filter(Boolean).join(" ") || "0 minutes";
  }

  function classTypeSummary(entries) {
    const counts = new Map();
    entries.forEach((item) => {
      const label = classTypeLabel(item.type);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()].map(([label, count]) => `${count} ${label}${count === 1 ? "" : "s"}`).join(" · ");
  }

  function teacherAssignments(teacher, classes) {
    const teaching = classes.filter((item) => teacherNames(item.teacher).includes(teacher));
    return unique(teaching.map((item) => item.subject)).map((subject) => {
      const entries = teaching.filter((item) => item.subject === subject);
      return {
        subject,
        types: classTypeSummary(entries),
        rooms: unique(entries.map((item) => item.room).filter((room) => !/not listed/i.test(room))),
        periods: entries.length
      };
    });
  }

  function teacherAssignmentHtml(pair) {
    return pair.assignments.map((assignment) => `${escapeHtml(assignment.subject)} — ${escapeHtml(assignment.types)}${assignment.rooms.length ? ` · ${escapeHtml(assignment.rooms.join(", "))}` : ""}`).join("<br />");
  }

  function compactClass(item) {
    if (!validClass(item)) return null;
    return {
      id: String(item.id || `${item.day}-${item.start}-${item.subject}-${item.room || ""}`),
      day: item.day,
      start: item.start,
      end: item.end,
      subject: String(item.subject),
      teacher: String(item.teacher || "Teacher not listed"),
      room: String(item.room || "Room not listed"),
      type: String(item.type || "")
    };
  }

  function buildingForRoom(room) {
    const label = String(room || "").trim();
    const parenthetical = label.match(/\(([^)]+(?:BLOCK|BUILDING)[^)]*)\)/i);
    if (parenthetical) return parenthetical[1].trim();
    if (/\bWORKSHOPS?\b/i.test(label)) return "Workshops";
    return "";
  }

  function chronological(entries) {
    return [...entries].sort((left, right) => CALENDAR_DAYS.indexOf(left.day) - CALENDAR_DAYS.indexOf(right.day)
      || left.start - right.start || left.end - right.end || left.subject.localeCompare(right.subject));
  }

  function mergeIntervals(entries) {
    const sorted = [...entries].filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const merged = [];
    sorted.forEach((item) => {
      const previous = merged[merged.length - 1];
      if (previous && item.start <= previous.end) previous.end = Math.max(previous.end, item.end);
      else merged.push({ start: item.start, end: item.end });
    });
    return merged;
  }

  function bellSlots(context) {
    const supplied = Array.isArray(context.bellSlots) ? context.bellSlots : [];
    const valid = supplied.map((slot) => ({ start: Number(slot?.start), end: Number(slot?.end) }))
      .filter((slot) => Number.isFinite(slot.start) && Number.isFinite(slot.end) && slot.end > slot.start)
      .slice(0, 16);
    return valid.length ? valid : DEFAULT_BELL_SLOTS.map(([start, end]) => ({ start, end }));
  }

  function freeTimetableIntervals(entries, context, mergeAdjacent = true) {
    const freeSlots = bellSlots(context).filter((slot) => !entries.some((item) => item.start < slot.end && item.end > slot.start));
    return mergeAdjacent ? mergeIntervals(freeSlots) : freeSlots;
  }

  function internalBreakIntervals(entries) {
    const occupied = mergeIntervals(entries);
    if (occupied.length < 2) return [];
    return occupied.slice(0, -1).map((item, index) => ({ start: item.end, end: occupied[index + 1].start }))
      .filter((item) => item.end > item.start);
  }

  function minutesUntilClass(item, context) {
    const today = String(context.now?.day || "");
    const nowMinutes = Number(context.now?.minutes);
    const todayIndex = CALENDAR_DAYS.indexOf(today);
    const targetIndex = CALENDAR_DAYS.indexOf(item?.day);
    if (todayIndex < 0 || targetIndex < 0 || !Number.isFinite(nowMinutes)) return null;
    let dayOffset = (targetIndex - todayIndex + CALENDAR_DAYS.length) % CALENDAR_DAYS.length;
    if (dayOffset === 0 && item.start <= nowMinutes) dayOffset = CALENDAR_DAYS.length;
    return dayOffset * 1440 + item.start - nowMinutes;
  }

  function nextFutureClass(entries, context) {
    const ranked = entries.map((item) => ({ item, distance: minutesUntilClass(item, context) }))
      .filter((candidate) => Number.isFinite(candidate.distance) && candidate.distance > 0)
      .sort((left, right) => left.distance - right.distance || left.item.end - right.item.end);
    return ranked[0]?.item || null;
  }

  function subjectOccurrenceBlocks(entries) {
    const blocks = [];
    chronological(entries).forEach((item) => {
      const previous = blocks[blocks.length - 1];
      if (previous && previous.day === item.day && item.start <= previous.end) {
        previous.end = Math.max(previous.end, item.end);
        previous.entries.push(item);
      } else {
        blocks.push({ day: item.day, start: item.start, end: item.end, entries: [item] });
      }
    });
    return blocks;
  }

  function classAnchorPatch(item, extras = {}) {
    if (!item) return extras;
    return {
      activeSubject: item.subject,
      activeTeacher: item.teacher,
      activeRoom: item.room,
      activeDay: item.day,
      activeClassId: item.id,
      ...extras
    };
  }

  function levenshtein(left, right) {
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row += 1) {
      const current = [row];
      for (let column = 1; column <= right.length; column += 1) {
        current[column] = Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[right.length];
  }

  function subjectAliases(subject) {
    const base = normalize(subject).replace(/\b(i|ii)\b/g, (match) => match === "i" ? "1" : "2");
    const aliases = new Set([base]);
    if (/mathematics|math\b/.test(base)) ["math", "maths", "math 1", "m1", "mathematics 1"].forEach((value) => aliases.add(value));
    if (/programming for problem solving/.test(base)) ["pps", "programming", "problem solving"].forEach((value) => aliases.add(value));
    if (/engineering drawing/.test(base)) ["edg", "drawing", "engineering drawing"].forEach((value) => aliases.add(value));
    if (/manufacturing practices/.test(base)) ["workshop", "manufacturing"].forEach((value) => aliases.add(value));
    return [...aliases];
  }

  function resolveSubject(question, classes, rememberedSubject = "") {
    const q = normalize(question);
    const subjects = unique(classes.map((item) => item.subject));
    if (/^(?:where|who|when|teacher|next|after|before|same|what about)(?:\s+(?:is|teaches|it|that|there|one|class|room|building|tomorrow|today|monday|tuesday|wednesday|thursday|friday))*\??$/.test(q)
      || /^(?:duration|length|how long|total duration|total time)(?:\s+(?:of|for|it|that|class|classes|lectures?|periods?))*\??$/.test(q)
      || /^(?:and\s+)?(?:rooms?|locations?|places?|venues?|teachers?|how many|count|list them|show them)\??$/.test(q)
      || /^(?:and )?(?:monday|tuesday|wednesday|thursday|friday)\??$/.test(q)) {
      if (!rememberedSubject) return null;
      const remembered = subjects.find((subject) => subject === rememberedSubject);
      if (remembered) return { value: remembered, confidence: 0.9, source: "context" };
    }
    let best = null;
    subjects.forEach((subject) => {
      subjectAliases(subject).forEach((alias) => {
        let confidence = 0;
        if (q === alias || q.includes(alias)) confidence = alias.length <= 2 ? 0.9 : 0.98;
        else {
          const tokens = q.split(" ");
          tokens.forEach((token) => {
            if (token.length < 3 || alias.includes(" ")) return;
            const distance = levenshtein(token, alias);
            if (distance <= 1) confidence = Math.max(confidence, 0.87);
            else if (distance === 2 && alias.length >= 6) confidence = Math.max(confidence, 0.82);
          });
        }
        if (!best || confidence > best.confidence) best = { value: subject, confidence, source: confidence >= 0.98 ? "alias" : "fuzzy" };
      });
    });
    return best?.confidence ? best : null;
  }

  function subjectsMentioned(question, classes) {
    const q = normalize(question);
    return unique(classes.map((item) => item.subject)).map((candidate) => {
      const positions = subjectAliases(candidate).filter((alias) => alias.length > 2).map((alias) => q.indexOf(alias)).filter((position) => position >= 0);
      return { candidate, position: positions.length ? Math.min(...positions) : -1 };
    }).filter((item) => item.position >= 0).sort((left, right) => left.position - right.position).map((item) => item.candidate);
  }

  function multiSubjectAnswer(question, context, mentionedSubjects = subjectsMentioned(question, context.classes)) {
    if (mentionedSubjects.length < 2) return null;
    const clauses = normalize(question).split(/\s+(?:and|aur|ate|te|ਅਤੇ|ਤੇ|और)\s+|[,;]+/u).map((clause) => clause.trim()).filter(Boolean).slice(0, 12);
    const plans = new Map(mentionedSubjects.map((subject) => [subject, { teacher: false, location: false, schedule: false }]));
    let activeSubjects = [];
    clauses.forEach((clause) => {
      const explicit = subjectsMentioned(clause, context.classes);
      if (explicit.length) activeSubjects = explicit;
      const targets = explicit.length ? explicit : activeSubjects;
      if (!targets.length) return;
      const requested = {
        teacher: /\b(?:who|teacher|teachers|faculty|teach|teaches|teaching|taught|kaun|kon|padhata|padhati|padhaunda)\b/u.test(clause),
        location: /\b(?:where|room|rooms|location|locations|place|places|venue|venues|kahan|kahaan|kithe|kithhe)\b/u.test(clause),
        schedule: /\b(?:when|time|times|timing|timings|schedule|timetable|class|classes|lecture|lectures|kab|kadon)\b/u.test(clause)
      };
      if (!requested.teacher && !requested.location && !requested.schedule) requested.schedule = true;
      targets.forEach((subject) => {
        const plan = plans.get(subject);
        if (!plan) return;
        plan.teacher ||= requested.teacher;
        plan.location ||= requested.location;
        plan.schedule ||= requested.schedule;
      });
    });
    const day = resolveDay(question, context);
    const asksAvailability = Boolean(day) && /\b(?:is there|do i have|have i got|any|if yes)\b/.test(normalize(question));
    const sections = mentionedSubjects.map((subject) => {
      const plan = plans.get(subject);
      const all = chronological(context.classes.filter((item) => item.subject === subject));
      const entries = day ? all.filter((item) => item.day === day.day) : all;
      if (!entries.length) return `<section><p><strong><u>${escapeHtml(subject)}</u></strong></p><p>${asksAvailability ? "<strong>No.</strong> " : ""}No class is listed${day ? ` on ${escapeHtml(day.label)}` : " in your active timetable"}.</p></section>`;
      const teachers = unique(entries.flatMap((item) => teacherNames(item.teacher)));
      const rooms = unique(entries.map((item) => item.room).filter((room) => !/not listed/i.test(room)));
      return `<section><p><strong><u>${escapeHtml(subject)}${day ? ` · ${escapeHtml(day.label)}` : " · this week"}</u></strong></p>${asksAvailability ? `<p><strong>Yes.</strong> ${escapeHtml(subject)} is listed on ${escapeHtml(day.label)}.</p>` : ""}${plan.teacher ? `<p><strong>Teacher${teachers.length === 1 ? "" : "s"}:</strong> ${escapeHtml(teachers.join(", ") || "Not listed")}</p>` : ""}${plan.location ? `<p><strong>Room${rooms.length === 1 ? "" : "s"}:</strong> ${escapeHtml(rooms.join(", ") || "Not listed")}</p>` : ""}${plan.schedule ? `<p><strong>Schedule</strong></p><ol>${scheduleRows(entries)}</ol>` : ""}</section>`;
    }).join("");
    const lastSubject = mentionedSubjects[mentionedSubjects.length - 1];
    const lastEntries = chronological(context.classes.filter((item) => item.subject === lastSubject && (!day || item.day === day.day)));
    const anchor = nextFutureClass(lastEntries, context) || lastEntries[0] || null;
    return result("MULTI_SUBJECT_FACTS", 0.98, `<p><strong>Here is the combined answer for each subject.</strong></p>${sections}<p class="answer-source">Every teacher, room, day, and time shown comes from your active official timetable.</p>`, { subjects: mentionedSubjects.map((subject) => ({ subject, ...plans.get(subject) })), day: day?.day || "" }, ["identify every explicit subject", "split the question into bounded clauses", "attach each requested fact to its subject", "filter the active official timetable", "verify teachers, rooms, and times", "render one combined answer"], anchor ? classAnchorPatch(anchor, { activeSubject: lastSubject, previousClassId: "" }) : { activeSubject: lastSubject, activeDay: day?.day || "", activeClassId: "", previousClassId: "", activeRoom: "", activeTeacher: "" });
  }

  function resolveDay(question, context) {
    const q = normalize(question);
    const aliases = {
      Monday: ["monday", "mon"], Tuesday: ["tuesday", "tue", "tues"], Wednesday: ["wednesday", "wed"],
      Thursday: ["thursday", "thu", "thur", "thurs"], Friday: ["friday", "fri"], Saturday: ["saturday", "sat"], Sunday: ["sunday", "sun"]
    };
    const words = q.match(/[a-z]+/g) || [];
    const named = CALENDAR_DAYS.find((day) => aliases[day].some((alias) => new RegExp(`\\b${alias}\\b`).test(q)))
      || CALENDAR_DAYS.find((day) => words.some((word) => word.length >= 4 && aliases[day].some((alias) => levenshtein(word, alias) <= (alias.length >= 7 ? 2 : 1))));
    if (named) return { day: named, confidence: 1, label: named };
    if (/\bday after tomorrow\b/.test(q) && context.calendarDate) {
      const date = new Date(`${context.calendarDate}T00:00:00Z`);
      if (!Number.isNaN(date.getTime())) {
        date.setUTCDate(date.getUTCDate() + 2);
        const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date);
        const label = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
        return { day, confidence: 1, label };
      }
    }
    if (/\btomorrow\b/.test(q)) {
      const next = context.nextStudyDay || {};
      return next.day ? { day: next.day, confidence: 0.96, label: next.label || next.day } : null;
    }
    if (/\btoday\b/.test(q) && DAYS.includes(context.now?.day)) return { day: context.now.day, confidence: 1, label: context.now.day };
    return null;
  }

  function exactDateAnswer(question, context) {
    const q = normalize(question);
    const relative = q.match(/\b(?:what|which)\s+(?:is\s+)?(?:the\s+)?(?:day|date)(?:\s+is|\s+of)?\s+(day after tomorrow|today|tomorrow)\b|\bwhat\s+is\s+(day after tomorrow|today|tomorrow)(?:\s+s)?\s+(?:day|date)\b/);
    if (relative && context.calendarDate) {
      const requested = relative[1] || relative[2];
      const offset = requested === "day after tomorrow" ? 2 : requested === "tomorrow" ? 1 : 0;
      const base = new Date(`${context.calendarDate}T00:00:00Z`);
      if (!Number.isNaN(base.getTime())) {
        base.setUTCDate(base.getUTCDate() + offset);
        const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(base);
        const label = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(base);
        const relativeLabel = offset === 2 ? "Day after tomorrow" : offset ? "Tomorrow" : "Today";
        return result("RELATIVE_DATE", 1, `<p><strong>${relativeLabel}</strong> is <strong>${escapeHtml(weekday)}, ${escapeHtml(label)}</strong>.</p>`, { date: base.toISOString().slice(0, 10), weekday }, ["read India calendar date", "apply relative offset", "resolve weekday"]);
      }
    }
    const nextWeekday = q.match(/\b(?:what|which|tell|show)\b.*\b(?:date|day)\b.*\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*\b(?:date|day)\b/);
    if (nextWeekday && context.calendarDate) {
      const wanted = nextWeekday[1] || nextWeekday[2];
      const base = new Date(`${context.calendarDate}T00:00:00Z`);
      const target = CALENDAR_DAYS.findIndex((value) => value.toLowerCase() === wanted);
      if (!Number.isNaN(base.getTime()) && target >= 0) {
        const targetUtcDay = target === 6 ? 0 : target + 1;
        let offset = (targetUtcDay - base.getUTCDay() + 7) % 7;
        if (offset === 0) offset = 7;
        base.setUTCDate(base.getUTCDate() + offset);
        const label = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(base);
        return result("NEXT_WEEKDAY_DATE", 1, `<p><strong>Next ${escapeHtml(CALENDAR_DAYS[target])}</strong> is <strong>${escapeHtml(label)}</strong>.</p><p class="answer-source">Calculated from today's India calendar date.</p>`, { date: base.toISOString().slice(0, 10), weekday: CALENDAR_DAYS[target] }, ["read India calendar date", "resolve requested weekday", "calculate next occurrence"]);
      }
    }
    if (!/\b(?:what|which)\s+day\b|\bweekday\b/.test(q)) return null;
    let match = q.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/]+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)(?:[\s,\-/]+(\d{2}|\d{4}))?\b/);
    let day;
    let month;
    let year;
    if (match) {
      day = Number(match[1]); month = MONTHS[match[2]]; year = Number(match[3] || context.currentYear || new Date().getUTCFullYear());
      if (year < 100) year += 2000;
    } else {
      match = q.match(/\b(\d{1,2})[\-/](\d{1,2})[\-/](\d{2}|\d{4})\b/);
      if (match) { day = Number(match[1]); month = Number(match[2]) - 1; year = Number(match[3]); if (year < 100) year += 2000; }
      else {
        match = q.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
        if (!match) return null;
        year = Number(match[1]); month = Number(match[2]) - 1; day = Number(match[3]);
      }
    }
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
      return result("DATE_LOOKUP", 1, "<p>That date is not valid.</p>", { valid: false }, ["parse date", "validate calendar date"]);
    }
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date);
    const label = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
    return result("DATE_LOOKUP", 1, `<p><strong>${escapeHtml(label)}</strong> is a <strong>${escapeHtml(weekday)}</strong>.</p>`, { date: date.toISOString().slice(0, 10), weekday }, ["parse date", "validate calendar date", "resolve weekday"]);
  }

  function utilityAnswer(question) {
    const q = clean(question).replace(/,/g, "");
    const arithmetic = String(question || "").normalize("NFKC").toLowerCase()
      .replace(/\b(?:plus|jod|jodo)\b/g, " + ")
      .replace(/\b(?:minus|ghata|ghatao)\b/g, " - ")
      .replace(/\b(?:times|multiply|multiplied by|guna)\b/g, " * ")
      .replace(/\b(?:divided by|divide|bhaag)\b/g, " / ")
      .replace(/,/g, "");
    const equation = arithmetic.match(/^(?:solve\s+)?([0-9.x*+\-\s]+)=([0-9.x*+\-\s]+)\??$/i);
    if (equation) {
      const left = linearExpression(equation[1]);
      const right = linearExpression(equation[2]);
      if (left && right && (left.coefficient !== 0 || right.coefficient !== 0)) {
        const coefficient = left.coefficient - right.coefficient;
        const constant = right.constant - left.constant;
        if (coefficient === 0 && constant === 0) return result("SOLVE_LINEAR_EQUATION", 1, "<p>This equation has infinitely many solutions.</p>", { solutions: "infinite" }, ["parse bounded linear equation", "compare both sides"]);
        if (coefficient === 0) return result("SOLVE_LINEAR_EQUATION", 1, "<p>This equation has no solution.</p>", { solutions: "none" }, ["parse bounded linear equation", "compare both sides"]);
        const value = constant / coefficient;
        if (Number.isFinite(value)) return result("SOLVE_LINEAR_EQUATION", 1, `<p><strong>x = ${escapeHtml(String(Number(value.toFixed(10))))}</strong></p><p class="answer-source">Calculated from the supplied linear equation.</p>`, { variable: "x", value }, ["parse each linear side", "collect x coefficients and constants", "solve x", "verify finite result"]);
      }
    }
    let match = q.match(/^(?:what\s+is|calculate|solve|answer)?\s*(-?\d+(?:\.\d+)?)\s*([+\-*/x×÷])\s*(-?\d+(?:\.\d+)?)\s*\??$/);
    if (match) {
      const left = Number(match[1]);
      const right = Number(match[3]);
      const operator = match[2];
      if ((operator === "/" || operator === "÷") && right === 0) return result("CALCULATE", 1, "<p>Division by zero is undefined.</p>", { valid: false }, ["parse expression", "validate divisor"]);
      const value = operator === "+" ? left + right : operator === "-" ? left - right : (operator === "*" || operator === "x" || operator === "×") ? left * right : left / right;
      if (Number.isFinite(value)) return result("CALCULATE", 1, `<p><strong>${escapeHtml(match[1])} ${escapeHtml(operator)} ${escapeHtml(match[3])} = ${escapeHtml(String(Number(value.toFixed(10))))}</strong></p>`, { value }, ["parse expression", "calculate", "verify finite result"]);
    }
    match = q.match(/^(?:what\s+is|calculate)?\s*(\d+(?:\.\d+)?)\s*%\s*(?:of)\s*(-?\d+(?:\.\d+)?)\s*\??$/);
    if (match) {
      const value = Number(match[1]) * Number(match[2]) / 100;
      return result("CALCULATE", 1, `<p><strong>${escapeHtml(match[1])}% of ${escapeHtml(match[2])} = ${escapeHtml(String(Number(value.toFixed(10))))}</strong></p>`, { value }, ["parse percentage", "calculate"]);
    }
    match = q.match(/^(?:sqrt|square\s+root\s+of)\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?\s*\??$/);
    if (match) {
      const value = Math.sqrt(Number(match[1]));
      return result("CALCULATE", 1, `<p><strong>√${escapeHtml(match[1])} = ${escapeHtml(String(Number(value.toFixed(10))))}</strong></p>`, { value }, ["parse square root", "calculate"]);
    }
    const expression = arithmetic.replace(/^(?:what\s+is|calculate|solve|answer)\s+/, "").replace(/\?$/, "").replace(/×/g, "*").replace(/÷/g, "/").trim();
    const evaluated = safeArithmeticValue(expression);
    if (evaluated.ok) return result("CALCULATE", 1, `<p><strong>${escapeHtml(expression)} = ${escapeHtml(String(Number(evaluated.value.toFixed(10))))}</strong></p>`, { value: evaluated.value }, ["tokenize safe arithmetic", "apply operator precedence", "calculate", "verify finite result"]);
    return null;
  }

  // Accept only one-variable, first-degree equations. The small grammar keeps
  // calculation deterministic and prevents source-text evaluation.
  function linearExpression(input) {
    const source = String(input || "").replace(/\s+/g, "").toLowerCase();
    if (!source || source.length > 80 || /[^0-9.x*+\-]/.test(source)) return null;
    const terms = source.match(/[+-]?[^+-]+/g);
    if (!terms?.length) return null;
    let coefficient = 0;
    let constant = 0;
    for (const term of terms) {
      const variable = term.match(/^([+-]?)(?:(\d+(?:\.\d+)?)\*?)?x$/);
      if (variable) {
        coefficient += (variable[1] === "-" ? -1 : 1) * Number(variable[2] || 1);
        continue;
      }
      if (!/^[+-]?\d+(?:\.\d+)?$/.test(term)) return null;
      constant += Number(term);
    }
    return Number.isFinite(coefficient) && Number.isFinite(constant) ? { coefficient, constant } : null;
  }

  function safeArithmeticValue(expression) {
    const source = String(expression || "").replace(/\s+/g, "");
    if (!source || source.length > 100 || /^\d{4}-\d{1,2}-\d{1,2}$/.test(source) || !/[+*/^()-]/.test(source) || /[^\d.+*/^()-]/.test(source)) return { ok: false };
    let index = 0;
    const number = () => {
      const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!match) throw new Error("number");
      index += match[0].length;
      return Number(match[0]);
    };
    const primary = () => {
      if (source[index] === "(") {
        index += 1;
        const value = expressionParser();
        if (source[index] !== ")") throw new Error("parenthesis");
        index += 1;
        return value;
      }
      if (source[index] === "+") { index += 1; return primary(); }
      if (source[index] === "-") { index += 1; return -primary(); }
      return number();
    };
    const power = () => {
      let value = primary();
      if (source[index] === "^") { index += 1; value **= power(); }
      return value;
    };
    const term = () => {
      let value = power();
      while (source[index] === "*" || source[index] === "/") {
        const operator = source[index++];
        const right = power();
        if (operator === "/" && right === 0) throw new Error("division");
        value = operator === "*" ? value * right : value / right;
      }
      return value;
    };
    const expressionParser = () => {
      let value = term();
      while (source[index] === "+" || source[index] === "-") {
        const operator = source[index++];
        const right = term();
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    };
    try {
      const value = expressionParser();
      return index === source.length && Number.isFinite(value) ? { ok: true, value } : { ok: false };
    } catch { return { ok: false }; }
  }

  function result(intent, confidence, answer, facts = {}, plan = [], contextPatch = {}) {
    return {
      handled: true,
      confidence,
      verified: true,
      intent,
      entities: {},
      facts,
      plan: plan.slice(0, MAX_PLAN_STEPS),
      answer,
      contextPatch
    };
  }

  function recordMetric(outcome) {
    const processingMs = Math.max(0, Number(outcome?.processingMs) || 0);
    METRICS.processed += 1;
    METRICS.totalProcessingMs += processingMs;
    METRICS.maxProcessingMs = Math.max(METRICS.maxProcessingMs, processingMs);
    if (outcome?.handled) {
      METRICS.handled += 1;
      const intent = String(outcome.intent || "UNKNOWN").slice(0, 48);
      METRICS.intents[intent] = (METRICS.intents[intent] || 0) + 1;
    } else {
      METRICS.fallback += 1;
      const reason = String(outcome?.fallbackReason || FALLBACK_REASONS.UNSUPPORTED).slice(0, 48);
      METRICS.fallbackReasons[reason] = (METRICS.fallbackReasons[reason] || 0) + 1;
    }
    return outcome;
  }

  function metricsSnapshot() {
    return {
      processed: METRICS.processed,
      handled: METRICS.handled,
      fallback: METRICS.fallback,
      coverage: METRICS.processed ? METRICS.handled / METRICS.processed : 0,
      averageProcessingMs: METRICS.processed ? METRICS.totalProcessingMs / METRICS.processed : 0,
      maxProcessingMs: METRICS.maxProcessingMs,
      intents: { ...METRICS.intents },
      fallbackReasons: { ...METRICS.fallbackReasons }
    };
  }

  function conversationAnswer(question) {
    const q = normalize(question);
    if (/^(?:hi+|hello|hey+|yo|namaste|sat sri akal|good (?:morning|afternoon|evening))(?:\s+(?:bro|bhai|compass))?[!. ]*$/.test(q)) {
      return result("GREETING", 1, "<p><strong>Hello!</strong> I can instantly check your classes, rooms, teachers, free periods, syllabus, dates, and quick calculations. What would you like to know?</p>");
    }
    if (/^(?:how are you|how's it going|kaise ho|kese ho|ki haal|kidaan|kidda)\b/.test(q)) {
      return result("CONVERSATION", 0.99, "<p>I’m working well. I’m Compass, your local GNDEC assistant. I’m best at verified timetable, syllabus, teacher, room, date, and college questions.</p>");
    }
    if (/\b(?:who|what) are you\b|\bare you (?:an? )?ai\b|\bare you chatgpt\b/.test(q)) {
      return result("IDENTITY", 1, "<p><strong>I’m GNDEC Compass.</strong> For local answers I use deterministic rules, search, timetable indexes, fuzzy matching, and conversation context—not a large language model.</p>");
    }
    if (/^(?:bye|goodbye|good bye|see you|cya|phir milte|milte)\b/.test(q)) return result("CONVERSATION", 0.99, "<p>See you! Your timetable and chat remain saved on this device.</p>");
    if (/^(?:thanks?|thank you|thx|shukriya|dhanyavaad|nice|got it|okay|ok)\b/.test(q)) return result("CONVERSATION", 0.98, "<p>You’re welcome. Ask whenever you need a class, room, teacher, syllabus topic, or quick calculation.</p>");
    return null;
  }

  function profileAnswer(question, context) {
    const q = normalize(question);
    const profile = context.profile && typeof context.profile === "object" ? context.profile : {};
    const asksFull = /\b(?:my profile|full profile|profile details|who am i|mera profile)\b/.test(q) && !/\b(?:private|privacy|safe)\b/.test(q);
    const asksName = /\b(?:what is my name|what s my name|show my name|student name)\b/.test(q);
    const asksBranch = /^(?:what|which)\s+(?:is\s+)?my\s+branch\??$|^my\s+branch\??$|^mer[ai]\s+branch(?:\s+(?:kya|kaun si|ki hai))?\??$/.test(q);
    const asksMentor = /\bmentor\b/.test(q);
    const asksMentorPhone = /\bmentor(?: s)?\s*(?:phone|mobile|contact)(?:\s*(?:number|no))?\b|\b(?:phone|mobile|contact)(?:\s*(?:number|no))?\s*(?:of|for)?\s*(?:my\s+)?mentor\b/.test(q);
    const asksCrn = /\bcrn\b|\bcollege roll(?: no| number)?\b/.test(q);
    const asksRegistration = /\bregistration\b|\breg(?:istration)?\s*(?:no|number)\b/.test(q);
    const asksOldSerial = /\b(?:old|previous|former|purana|pichla)\s+serial\b|\bserial\s+(?:history|old|previous)\b/.test(q);
    const asksNewSerial = /\b(?:new|latest)\s+serial\b|\bserial\s+(?:new|latest)\b/.test(q);
    const asksSerial = /\bserial(?: no| number)?\b|\bsr\s*(?:no|number)\b/.test(q) && !asksOldSerial && !asksNewSerial;
    const asksSubsection = /\bsub ?section\b|\bsubgroup\b/.test(q);
    const asksSection = /\bsection\b/.test(q.replace(/\bsub ?section\b/g, " "));
    const asksAcademicGroup = /\bacademic group\b|\bphysics group\b|\bstudy scheme\b|\bmentoring group\b/.test(q);
    const asksVenue = /\bmy\s+(?:profile\s+)?venue\b|\bmentor(?:ing)?\s+(?:room|venue)\b|\bprofile\s+(?:room|venue)\b/.test(q);
    const hasIntent = asksFull || asksName || asksBranch || asksMentor || asksMentorPhone || asksCrn || asksRegistration || asksSerial || asksOldSerial || asksNewSerial || asksSection || asksSubsection || asksAcademicGroup || asksVenue;
    if (!hasIntent) return null;
    if (!profile.name || !profile.section) {
      return result("PROFILE_SETUP", 1, "<p><strong>Set up this device first.</strong></p><p>Open Profile and search the current official roster, or choose your section and subsection manually.</p>", {}, ["detect profile question", "check active device profile"]);
    }
    const fields = [];
    const add = (label, value, missing = "Not listed") => fields.push({ label, value: String(value || missing) });
    if (asksFull || asksName) add("Student name", profile.name);
    if (asksFull || asksBranch) add("Branch", profile.branch);
    if (asksFull || asksCrn) add("CRN", profile.crn);
    if (asksFull || asksSerial) add("Current serial", profile.currentSerialNo || profile.serialNo);
    // Current S.No. in the verified roster is the latest serial when no
    // distinct new-serial field exists in the source.
    if (asksNewSerial) add("Current/new serial", profile.newSerialNo || profile.currentSerialNo || profile.serialNo);
    if (asksFull || asksOldSerial) add("Previous serials", Array.isArray(profile.oldSerialNos) ? profile.oldSerialNos.join(", ") : "", "No previous serial in saved history");
    if (asksFull || asksRegistration) add("Registration No.", profile.registrationNo, profile.rosterVersion ? "Not published in current roster" : "Not provided");
    if (asksFull || asksSection) add("Section", profile.section);
    if (asksFull || asksSubsection) add("Subsection", profile.subsection);
    if (asksFull || asksAcademicGroup) add("Academic group", profile.academicGroup);
    if (asksFull || asksMentor) add("Mentor", profile.mentor);
    if (asksFull || asksMentorPhone) add("Mentor phone", profile.mentorPhone);
    if (asksFull || asksVenue) add("Mentor venue", profile.mentorVenue || profile.venue);
    const title = asksFull ? "Student profile" : fields.length === 1 ? fields[0].label : "Student details";
    const source = profile.rosterVersion ? "Verified GNDEC roster" : "Active profile saved on this device";
    const details = fields.map((field) => `<strong>${escapeHtml(field.label)}</strong><br />${escapeHtml(field.value)}`).join("<br /><br />");
    return result("PROFILE_FACTS", 1, `<p><strong><u>${escapeHtml(title)}</u></strong></p><p>${details}</p><p class="answer-source">${escapeHtml(source)}.</p>`, { fields }, ["detect requested profile fields", "read active device profile", "render only stored facts"]);
  }

  function studentLookupAnswer(context) {
    const lookup = context.studentLookup;
    if (!lookup || lookup.handled !== true || !["single", "multiple", "none", "needs-query", "error"].includes(lookup.status)) return null;
    const records = Array.isArray(lookup.records) ? lookup.records.slice(0, 8) : [];
    const source = "Verified current GNDEC roster";
    const unavailable = Array.isArray(lookup.unavailableBranches) ? lookup.unavailableBranches.slice(0, 7) : [];
    const partial = unavailable.length ? `<p>Could not verify: <strong>${escapeHtml(unavailable.join(", "))}</strong> roster${unavailable.length === 1 ? "" : "s"}.</p>` : "";
    if (lookup.status === "error") return result("STUDENT_LOOKUP_ERROR", 1, `<p><strong><u>Student lookup unavailable</u></strong></p><p>${escapeHtml(lookup.message || "Try again shortly.")}</p>`, {}, ["detect read-only roster lookup", "preserve active profile", "report verification failure"]);
    if (lookup.status === "needs-query") return result("STUDENT_LOOKUP_QUERY_REQUIRED", 1, "<p><strong><u>Which student?</u></strong></p><p>Give one name, CRN, registration number, or serial number. Compass does not reveal or enumerate the whole roster.</p>", {}, ["reject roster enumeration", "request one verified identifier"]);
    if (lookup.status === "none") return result("STUDENT_LOOKUP_NONE", 0.99, `<p><strong><u>No verified student found</u></strong></p><p>No current roster record matched <strong>${escapeHtml(lookup.query || "that value")}</strong>. Check the spelling or use an exact CRN.</p>${partial}<p class="answer-source">${escapeHtml(source)}.</p>`, { query: lookup.query || "" }, ["search verified current rosters", "compare exact identifiers", "rank conservative name matches", "return no-match safely"]);
    if (lookup.status === "multiple") {
      if (!records.length) return null;
      return result("STUDENT_LOOKUP_AMBIGUOUS", 0.99, `<p><strong><u>More than one student may match</u></strong></p><p>Use a CRN or more specific spelling:</p><ol>${records.map((record) => `<li><strong>${escapeHtml(record.name)}</strong> · ${escapeHtml(record.crn ? `CRN ${record.crn}` : `Serial ${record.currentSerialNo || "not published"}`)} · ${escapeHtml([record.section, record.subsection].filter(Boolean).join(" / "))}</li>`).join("")}</ol>${partial}<p class="answer-source">${escapeHtml(source)}.</p>`, { count: records.length }, ["search verified current rosters", "detect ambiguity", "show bounded disambiguation choices", "preserve active profile"]);
    }
    const record = records[0];
    if (!record || !record.name || !record.section) return null;
    const fields = lookup.fields && typeof lookup.fields === "object" ? lookup.fields : { full: true };
    const full = fields.full || !fields.any;
    const rows = [];
    const add = (enabled, label, value, missing = "Not published in current roster") => { if (enabled) rows.push(`<strong>${escapeHtml(label)}</strong><br />${escapeHtml(value || missing)}`); };
    add(full || fields.name, "Student name", record.name);
    add(full || fields.branch, "Branch", record.branch);
    add(full || fields.crn, "CRN", record.crn);
    add(full || fields.serial, "Current serial", record.currentSerialNo);
    add(full || fields.previousSerials, "Previous serials", Array.isArray(record.oldSerialNos) ? record.oldSerialNos.join(", ") : "");
    add(full || fields.registration, "Registration No.", record.registrationNo);
    add(full || fields.section, "Section", record.section);
    add(full || fields.subsection, "Subsection", record.subsection);
    add(full || fields.academicGroup, "Academic group", record.academicGroup);
    add(full || fields.mentor, "Mentor", record.mentor);
    add(full || fields.mentorPhone, "Mentor phone", record.mentorPhone);
    add(full || fields.mentorVenue, "Mentor venue", record.mentorVenue);
    return result("STUDENT_LOOKUP", 1, `<p><strong><u>Verified student details</u></strong></p><p>${rows.join("<br /><br />")}</p>${partial}<p class="answer-source">${escapeHtml(source)}. Read-only lookup; your active profile was not changed.</p>`, { student: { name: record.name, branch: record.branch, section: record.section, subsection: record.subsection } }, ["resolve one verified roster record", "select requested published fields", "exclude private parent data", "preserve active profile", "render source version"]);
  }

  function officialFacultyPhotoUrl(value = "") {
    try {
      const url = new URL(String(value));
      if (url.protocol !== "https:" || (url.hostname !== "gndec.ac.in" && url.hostname !== "www.gndec.ac.in")) return "";
      return /\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname) ? url.href : "";
    } catch { return ""; }
  }

  function facultyPhotoMarkup(record = {}) {
    const profileId = String(record.profileId || "");
    const directImageUrl = officialFacultyPhotoUrl(record.photoUrl);
    if (!directImageUrl || !/^\d{1,8}$/.test(profileId)) return "";
    const name = record.name || "GNDEC faculty member";
    const imageUrl = `/api/faculty/photo?id=${encodeURIComponent(profileId)}`;
    const profileUrl = `https://gndec.ac.in/faculty/?id=${encodeURIComponent(profileId)}`;
    const safeDirectImageUrl = escapeHtml(directImageUrl);
    return `<figure class="faculty-profile-photo"><a class="faculty-photo-link" href="${safeDirectImageUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open the official profile photo of ${escapeHtml(name)}"><img src="${imageUrl}" data-faculty-photo-fallback="${safeDirectImageUrl}" alt="Official GNDEC profile photo of ${escapeHtml(name)}" width="120" height="140" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></a><figcaption><a href="${safeDirectImageUrl}" target="_blank" rel="noopener noreferrer">Open image</a><span aria-hidden="true"> · </span><a href="${profileUrl}" target="_blank" rel="noopener noreferrer">Official profile ↗</a></figcaption></figure>`;
  }

  function facultyLookupAnswer(context) {
    const lookup = context.facultyLookup;
    if (!lookup?.handled || !["single", "multiple", "list", "none", "needs-query", "error"].includes(lookup.status)) return null;
    const records = Array.isArray(lookup.records) ? lookup.records.slice(0, 80) : [];
    const source = '<a href="https://gndec.ac.in/faculty/" target="_blank" rel="noopener noreferrer">Official GNDEC faculty directory ↗</a>';
    if (lookup.status === "error") return result("FACULTY_LOOKUP_ERROR", 1, `<p><strong><u>Faculty lookup unavailable</u></strong></p><p>${escapeHtml(lookup.message || "Try again shortly.")}</p>`, {}, ["check official faculty source", "report failure without guessing"]);
    if (lookup.status === "needs-query") return result("FACULTY_LOOKUP_QUERY_REQUIRED", 1, "<p><strong><u>Which faculty member?</u></strong></p><p>Give a name, department, or official email.</p>", {}, ["detect faculty request", "request one public identity"]);
    if (lookup.status === "none") return result("FACULTY_LOOKUP_NONE", 0.99, `<p><strong><u>No verified faculty match</u></strong></p><p>No official directory record matched <strong>${escapeHtml(lookup.query || "that name")}</strong>.</p><p class="answer-source">${source}</p>`, {}, ["search official directory", "return no-match safely"]);
    if (lookup.status === "list") return result("FACULTY_DEPARTMENT_LIST", 1, `<p><strong><u>${escapeHtml(lookup.query)} faculty/staff (${records.length})</u></strong></p><ol>${records.map((record) => `<li><strong>${escapeHtml(record.name)}</strong> · ${escapeHtml(record.designation)}</li>`).join("")}</ol><p class="answer-source">${source}</p>`, { count: records.length, department: lookup.query }, ["load official directory", "filter department", "return bounded public list"]);
    if (lookup.status === "multiple") return result("FACULTY_LOOKUP_AMBIGUOUS", 0.99, `<p><strong><u>More than one faculty member may match</u></strong></p><ol>${records.slice(0, 8).map((record) => `<li><strong>${escapeHtml(record.name)}</strong> · ${escapeHtml(record.designation)} · ${escapeHtml(record.department)}</li>`).join("")}</ol><p class="answer-source">${source}</p>`, { count: records.length }, ["search official directory", "detect ambiguity", "show bounded choices"]);
    const record = records[0];
    if (!record?.name || !record.department) return null;
    const profilePending = Boolean(lookup.profilePending);
    const flags = lookup.fields || { full: true };
    const full = flags.full || !flags.any;
    const rows = [];
    const add = (enabled, label, value, missing = "Not published") => { if (enabled && (!profilePending || (Array.isArray(value) ? value.length : value))) rows.push(`<strong>${escapeHtml(label)}</strong><br />${escapeHtml(Array.isArray(value) ? value.join("; ") : value || missing)}`); };
    add(full || flags.email, "Official directory email", /@/.test(record.email || "") ? record.email : "", "Not published as a valid email");
    add(full || flags.experience, "Experience", record.experience);
    add(full || flags.qualifications, "Qualifications", record.qualifications);
    add(full || flags.publications, "Journal publications", record.journalPublications);
    add(full || flags.publications, "Conference publications", record.conferencePublications);
    add(full || flags.memberships, "Professional memberships", record.memberships);
    add(full || flags.research, "Research interests", record.researchInterests);
    const classes = (Array.isArray(record.timetableClasses) ? record.timetableClasses : []).map(compactClass).filter(Boolean).slice(0, 30);
    const schedule = classes.length ? `<p><strong>Classes in your active timetable</strong></p><ol>${scheduleRows(classes)}</ol>` : "";
    const subjects = unique(classes.map((item) => item.subject));
    const rooms = unique(classes.map((item) => item.room).filter((room) => !/not listed/i.test(room)));
    const quickFacts = classes.length ? `<p class="faculty-quick-facts"><strong>In your timetable:</strong> ${escapeHtml(subjects.join(", ") || "Subject not listed")} · ${escapeHtml(rooms.join(", ") || "Room not listed")}</p>` : "";
    const profileId = String(record.profileId || "");
    const profileAction = /^\d{1,8}$/.test(profileId) ? `<a class="faculty-profile-action" href="https://gndec.ac.in/faculty/?id=${encodeURIComponent(profileId)}" target="_blank" rel="noopener noreferrer">Open official faculty profile ↗</a>` : "";
    const identity = `<div class="faculty-identity"><strong>${escapeHtml(record.name)}</strong><span>${escapeHtml(record.designation || "Designation not published")}</span><span>${escapeHtml(record.department)}</span>${quickFacts}${profileAction}</div>`;
    const detailContent = `${rows.length ? `<p class="faculty-detail-list">${rows.join("<br /><br />")}</p>` : ""}${schedule}`;
    const expandable = full || rows.length > 3 || classes.length > 2;
    const details = expandable
      ? `<details class="answer-disclosure faculty-details-disclosure"><summary><span>Professional details${classes.length ? " and class schedule" : ""}</span><b aria-hidden="true">+</b></summary><div class="answer-disclosure-body">${detailContent}</div></details>`
      : `<div class="faculty-inline-details">${detailContent}</div>`;
    const enrichmentStatus = profilePending ? '<p class="answer-source faculty-profile-loading">Showing verified directory facts now. Loading the official professional profile and photo…</p>' : lookup.profileUnavailable ? '<p class="answer-warning">The directory facts are verified, but the detailed official profile is temporarily unavailable.</p>' : "";
    return result("FACULTY_LOOKUP", 1, `<p><strong><u>Verified GNDEC faculty details</u></strong></p><div class="faculty-answer-layout">${facultyPhotoMarkup(record)}${identity}</div>${enrichmentStatus}${details}<p class="answer-source">${source}. Professional public information only.</p>`, { faculty: { name: record.name, department: record.department, designation: record.designation, profilePhotoAvailable: Boolean(record.photoUrl), subjects, rooms } }, ["resolve official directory record", profilePending ? "return verified directory facts immediately" : "load professional profile fields and photo", "exclude personal profile fields", "merge active timetable assignments", "summarize compound facts", "render expandable official card"]);
  }

  function scheduleRows(classes) {
    return classes.map((item) => `<li><strong>${escapeHtml(item.day)} ${humanTime(item.start)}:</strong> ${escapeHtml(item.subject)} · ${escapeHtml(item.room)} · ${escapeHtml(item.teacher)}</li>`).join("");
  }

  function requestedRoom(question, classes, rememberedRoom = "", profile = {}) {
    const q = normalize(question);
    const rooms = unique([...classes.map((item) => item.room), profile.mentorVenue || profile.venue].filter((room) => room && !/not listed/i.test(room))).sort((left, right) => right.length - left.length);
    const explicit = rooms.find((room) => q.includes(normalize(room)));
    if (explicit) return explicit;
    if (/\b(?:there|same room|that room)\b/.test(q) && rooms.includes(rememberedRoom)) return rememberedRoom;
    const code = q.match(/\b[a-z]{1,4}\s*\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s+/g, "").toUpperCase();
    return code ? rooms.find((room) => normalize(room).replace(/\s+/g, "").includes(code.toLowerCase())) || "" : "";
  }

  function resolveTeacher(question, classes, rememberedTeacher = "") {
    const q = normalize(question);
    const teachers = unique(classes.flatMap((item) => teacherNames(item.teacher)));
    if (/^(?:when|where|what|which)(?:\s+(?:does|is|did|subjects?|classes?|rooms?|teacher|he|she|they|that))*\??$/.test(q) && teachers.includes(rememberedTeacher)) {
      return { value: rememberedTeacher, confidence: 0.9, source: "context" };
    }
    const exact = teachers.find((teacher) => {
      const full = normalize(teacher);
      const withoutTitle = full.replace(/^(?:dr|er|prof|professor)\.?\s+/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
      return q.includes(full) || (withoutTitle.length >= 5 && q.includes(withoutTitle));
    });
    if (exact) return { value: exact, confidence: 0.99, source: "exact" };
    const queryWords = new Set(q.split(" ").filter((word) => word.length >= 4 && !["teacher", "faculty", "teach", "teaches", "class", "classes", "subject", "subjects", "when", "where", "which", "what", "does", "with"].includes(word)));
    const candidates = teachers.map((teacher) => {
      const parts = normalize(teacher).replace(/^(?:dr|er|prof|professor)\.?\s+/, "").replace(/\([^)]*\)/g, " ").split(" ").filter((word) => word.length >= 4);
      const matched = parts.filter((part) => [...queryWords].some((word) => word === part || levenshtein(word, part) <= (part.length >= 7 ? 2 : 1)));
      return { value: teacher, matched: matched.length, total: parts.length };
    }).filter((item) => item.matched > 0).sort((left, right) => right.matched - left.matched || left.total - right.total);
    if (!candidates.length || (candidates[1] && candidates[0].matched === candidates[1].matched)) return null;
    return { value: candidates[0].value, confidence: candidates[0].matched >= 2 ? 0.95 : 0.87, source: "fuzzy" };
  }

  function catalogueAnswer(question, context) {
    const classes = context.classes;
    if (!classes.length) return null;
    const q = normalize(question);
    const label = escapeHtml(context.profileLabel || "Your timetable");
    const specificSubjects = subjectsMentioned(question, classes);
    if (/\b(?:is there|do i have|have i got)\b.*\b(?:class|classes|lecture|lectures)\b/.test(q)) return null;
    const asksListThem = /^(?:list|show|name|tell)(?:\s+me)?\s+(?:them|those|all)(?:\s+please)?\??$/.test(q);
    if (asksListThem && context.conversation?.lastIntent === "COUNT_TEACHERS") {
      const teachers = unique(classes.flatMap((item) => teacherNames(item.teacher)));
      return result("LIST_TEACHERS", 0.99, `<p><strong><u>Teachers in ${label}</u></strong></p><ol>${teachers.map((teacher) => `<li>${escapeHtml(teacher)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { teachers }, ["read previous verified intent", "load active timetable", "collect teachers", "remove duplicates"]);
    }
    if (asksListThem && context.conversation?.lastIntent === "COUNT_ROOMS") {
      const rooms = unique(classes.map((item) => item.room).filter((room) => !/not listed/i.test(room)));
      return result("LIST_ROOMS", 0.99, `<p><strong><u>Rooms used by ${label}</u></strong></p><ol>${rooms.map((room) => `<li>${escapeHtml(room)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { rooms }, ["read previous verified intent", "load active timetable", "collect rooms", "remove duplicates"]);
    }
    if (asksListThem && context.conversation?.lastIntent === "COUNT_SUBJECTS") {
      const subjects = unique(classes.map((item) => item.subject));
      return result("LIST_SUBJECTS", 0.99, `<p><strong><u>Subjects in ${label}</u></strong></p><ol>${subjects.map((subject) => `<li>${escapeHtml(subject)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subjects }, ["read previous verified intent", "load active timetable", "collect subjects", "remove duplicates"]);
    }
    const asksCombinedTeacherSubjectMap = /\b(?:how many|count|total|kitne|kinne|kitni|kinni)\b/.test(q)
      && /\b(?:teachers?|faculty)\b/.test(q)
      && /\b(?:subjects?|courses?)\b/.test(q)
      && /\b(?:which|what|with|and|their|there|mapping|teach|teaches|teaching|aur|unke)\b/.test(q);
    if (asksCombinedTeacherSubjectMap) {
      const teachers = unique(classes.flatMap((item) => teacherNames(item.teacher)));
      const pairs = teachers.map((teacher) => ({
        teacher,
        assignments: teacherAssignments(teacher, classes)
      }));
      return result("COUNT_TEACHER_SUBJECTS", 0.99, `<p>You have <strong>${teachers.length}</strong> teachers listed in <strong>${label}</strong>.</p><p><strong><u>Which teacher teaches which subject, class type, and room</u></strong></p><ul>${pairs.map((pair) => `<li><strong>${escapeHtml(pair.teacher)}:</strong> ${teacherAssignmentHtml(pair)}</li>`).join("")}</ul><p>Teachers sharing the same subject may have different lecture, tutorial, or practical assignments.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { teachers, count: teachers.length, pairs }, ["load active timetable", "separate co-teachers", "count teachers", "map each teacher to verified subjects", "separate lecture/tutorial/practical types", "collect official rooms"]);
    }
    const asksInlineList = /\b(?:and\s+)?(?:list|show|name)\s+(?:them|all|those)\b|\b(?:list|show)\b/.test(q);
    if (!specificSubjects.length && (/\b(?:how many|count|total|kitne|kinne|kitni|kinni)\b.*\b(?:my\s+)?teachers?|\bteachers?\b.*\b(?:how many|count|total|kitne|kinne|kitni|kinni)\b/.test(q))) {
      const teachers = unique(classes.flatMap((item) => teacherNames(item.teacher)));
      return result("COUNT_TEACHERS", 0.99, `<p>You have <strong>${teachers.length}</strong> teachers listed in <strong>${label}</strong>.</p>${asksInlineList ? `<ol>${teachers.map((teacher) => `<li>${escapeHtml(teacher)}</li>`).join("")}</ol>` : ""}<p class="answer-source">Calculated from your active official timetable.</p>`, { teachers, count: teachers.length }, ["load active timetable", "collect teachers", "remove duplicates", "count", ...(asksInlineList ? ["list requested values"] : [])]);
    }
    if (!specificSubjects.length && (/\b(?:how many|count|total|kitne|kinne|kitni|kinni)\b.*\b(?:rooms?|locations?|places?)\b|\b(?:rooms?|locations?|places?)\b.*\b(?:how many|count|total|kitne|kinne|kitni|kinni)\b/.test(q))) {
      const rooms = unique(classes.map((item) => item.room).filter((room) => !/not listed/i.test(room)));
      return result("COUNT_ROOMS", 0.99, `<p>You use <strong>${rooms.length}</strong> rooms or locations in <strong>${label}</strong>.</p>${asksInlineList ? `<ol>${rooms.map((room) => `<li>${escapeHtml(room)}</li>`).join("")}</ol>` : ""}<p class="answer-source">Calculated from your active official timetable.</p>`, { rooms, count: rooms.length }, ["load active timetable", "collect rooms", "remove duplicates", "count", ...(asksInlineList ? ["list requested values"] : [])]);
    }
    if (!specificSubjects.length && (/\b(?:how many|count|total|kitne|kinne|kitni|kinni)\b.*\b(?:my\s+)?(?:subjects?|courses?)\b|\b(?:subjects?|courses?)\b.*\b(?:how many|count|total|kitne|kinne|kitni|kinni)\b/.test(q))) {
      const subjects = unique(classes.map((item) => item.subject));
      return result("COUNT_SUBJECTS", 0.99, `<p>You have <strong>${subjects.length}</strong> subjects listed in <strong>${label}</strong>.</p>${asksInlineList ? `<ol>${subjects.map((subject) => `<li>${escapeHtml(subject)}</li>`).join("")}</ol>` : ""}<p class="answer-source">Calculated from your active official timetable.</p>`, { subjects, count: subjects.length }, ["load active timetable", "collect subjects", "remove duplicates", "count", ...(asksInlineList ? ["list requested values"] : [])]);
    }
    const asksTeacherSubjectPairs = /\b(?:teachers?|faculty)\b/.test(q)
      && /\b(?:subjects?|courses?)\b/.test(q)
      && /\b(?:list|show|tell|name|all|my|with|and|their|there|for|of|mapping|wise|which|aur|unke)\b/.test(q);
    if (asksTeacherSubjectPairs) {
      const teacherFirst = q.search(/\b(?:teachers?|faculty)\b/) < q.search(/\b(?:subjects?|courses?)\b/)
        && /\b(?:with|and|their|there|aur|unke)\b/.test(q);
      if (teacherFirst) {
        const pairs = unique(classes.flatMap((item) => teacherNames(item.teacher))).map((teacher) => ({
          teacher,
          assignments: teacherAssignments(teacher, classes)
        }));
        return result("TEACHER_SUBJECTS", 0.98, `<p><strong><u>Teachers and their subjects in ${label}</u></strong></p><ul>${pairs.map((pair) => `<li><strong>${escapeHtml(pair.teacher)}:</strong> ${teacherAssignmentHtml(pair)}</li>`).join("")}</ul><p class="answer-source">Official GNDEC weekly timetable.</p>`, { pairs }, ["load active timetable", "group classes by teacher", "collect verified subjects, class types, and rooms", "remove duplicates"]);
      }
      const pairs = unique(classes.map((item) => item.subject)).map((subject) => ({ subject, teachers: unique(classes.filter((item) => item.subject === subject).flatMap((item) => teacherNames(item.teacher))) }));
      return result("SUBJECT_TEACHERS", 0.98, `<p><strong><u>Subject → teacher</u></strong></p><ul>${pairs.map((pair) => `<li><strong>${escapeHtml(pair.subject)}:</strong> ${escapeHtml(pair.teachers.join(", ") || "Teacher not listed")}</li>`).join("")}</ul><p class="answer-source">Official GNDEC weekly timetable.</p>`, { pairs }, ["group active classes by subject", "collect verified teachers"]);
    }
    const listTeachers = !specificSubjects.length && !/subjects?|courses?/.test(q)
      && !/\b(?:most|maximum|often|frequent)\b/.test(q)
      && /(?:list|show|tell|who|what|which).*(?:all )?(?:my )?teachers?|(?:all )?teachers?.*(?:list|who)|faculty.*(?:list|names?)|^all teachers? names?/.test(q);
    if (listTeachers) {
      const teachers = unique(classes.flatMap((item) => teacherNames(item.teacher)));
      return result("LIST_TEACHERS", 0.98, `<p><strong><u>Teachers in ${label}</u></strong></p><ol>${teachers.map((teacher) => `<li>${escapeHtml(teacher)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { teachers }, ["load active timetable", "collect teachers", "remove duplicates", "verify source"]);
    }
    const listRooms = !specificSubjects.length && !/subjects?|courses?/.test(q) && /(?:list|show|tell|what|which).*(?:all )?(?:my )?(?:rooms?|locations?|places?)|(?:all )?(?:rooms?|locations?).*(?:list|names?)/.test(q);
    if (listRooms) {
      const rooms = unique(classes.map((item) => item.room).filter((room) => !/not listed/i.test(room)));
      return result("LIST_ROOMS", 0.98, `<p><strong><u>Rooms used by ${label}</u></strong></p><ol>${rooms.map((room) => `<li>${escapeHtml(room)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { rooms }, ["load active timetable", "collect rooms", "remove duplicates", "verify source"]);
    }
    if (/(?:my )?(?:timetable|schedule).*(?:subjects?|courses?)|(?:subjects?|courses?).*(?:my )?(?:timetable|schedule)|what subjects? (?:do )?i have|list (?:all )?(?:my )?subjects?/.test(q)) {
      const subjects = unique(classes.map((item) => item.subject));
      return result("LIST_SUBJECTS", 0.98, `<p><strong><u>Subjects in ${label}</u></strong></p><ol>${subjects.map((subject) => `<li>${escapeHtml(subject)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subjects }, ["load active timetable", "collect subjects", "remove duplicates"]);
    }
    if (/(?:teacher|faculty).*(?:of|for).*(?:all )?subjects?|(?:all )?subjects?.*(?:teacher|faculty)/.test(q)) {
      const pairs = unique(classes.map((item) => item.subject)).map((subject) => ({ subject, teachers: unique(classes.filter((item) => item.subject === subject).flatMap((item) => teacherNames(item.teacher))) }));
      return result("SUBJECT_TEACHERS", 0.97, `<p><strong><u>Subject → teacher</u></strong></p><ul>${pairs.map((pair) => `<li><strong>${escapeHtml(pair.subject)}:</strong> ${escapeHtml(pair.teachers.join(", ") || "Teacher not listed")}</li>`).join("")}</ul><p class="answer-source">Official GNDEC weekly timetable.</p>`, { pairs }, ["group active classes by subject", "collect verified teachers"]);
    }
    if (/(?:room|location|place).*(?:of|for).*(?:all )?subjects?|(?:all )?subjects?.*(?:room|location|place)/.test(q)) {
      const pairs = unique(classes.map((item) => item.subject)).map((subject) => ({ subject, rooms: unique(classes.filter((item) => item.subject === subject).map((item) => item.room)) }));
      return result("SUBJECT_ROOMS", 0.97, `<p><strong><u>Subject → room</u></strong></p><ul>${pairs.map((pair) => `<li><strong>${escapeHtml(pair.subject)}:</strong> ${escapeHtml(pair.rooms.join(", ") || "Room not listed")}</li>`).join("")}</ul><p class="answer-source">Official GNDEC weekly timetable.</p>`, { pairs }, ["group active classes by subject", "collect verified rooms"]);
    }
    const room = requestedRoom(question, classes, context.conversation?.activeRoom, context.profile);
    if (room && /(?:classes?|subjects?|lectures?|happen|happens|timetable|schedule).*(?:in|at)|(?:what|which).*(?:in|at)/.test(q)) {
      const entries = classes.filter((item) => item.room === room);
      if (!entries.length) return null;
      return result("CLASSES_IN_ROOM", 0.99, `<p><strong><u>Classes listed in ${escapeHtml(room)}</u></strong></p><ol>${scheduleRows(entries)}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { room, classes: entries }, ["resolve room", "filter active timetable", "sort chronologically", "verify room"], { activeRoom: room, activeClassId: entries[0].id, activeSubject: entries[0].subject });
    }
    if (room && /(?:which|what|where).*(?:building|block)|(?:building|block).*(?:is|for)/.test(q)) {
      const building = buildingForRoom(room);
      if (!building) return null;
      return result("ROOM_BUILDING", 0.96, `<p><strong>${escapeHtml(room)}</strong> is listed in <strong>${escapeHtml(building)}</strong>.</p><p class="answer-source">Derived from the official timetable room label.</p>`, { room, building }, ["resolve room", "extract official building label", "verify relation"], { activeRoom: room });
    }
    if (room && /\b(?:where|location|place|venue|reach|directions?|navigate|way)\b/.test(q)) {
      const entries = classes.filter((item) => item.room === room).sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day) || left.start - right.start);
      const mentorVenue = String(context.profile?.mentorVenue || context.profile?.venue || "");
      const isMentorVenue = mentorVenue && normalize(mentorVenue) === normalize(room);
      const fact = isMentorVenue
        ? `<p><strong>${escapeHtml(room)}</strong> is your mentor's verified venue.</p>`
        : `<p><strong>${escapeHtml(room)}</strong> is an official timetable room/location label.</p>`;
      const uses = entries.length ? `<p>Classes using this room in ${label}:</p><ol>${scheduleRows(entries.slice(0, 8))}</ol>` : "";
      const directions = /\b(?:reach|directions?|navigate|way|how\s+(?:do|can)\s+i\s+(?:get|go))\b/.test(q)
        ? "<p>Exact walking directions are not published in the timetable or roster, so I will not guess them. Use the campus map or ask the department/help desk.</p>"
        : "";
      return result("ROOM_LOCATION", 0.99, `${fact}${uses}${directions}<p class="answer-source">Verified from the active GNDEC timetable/profile; no unverified campus directions added.</p>`, { room, classes: entries, mentorVenue: Boolean(isMentorVenue) }, ["resolve official room label", "check active timetable", "check verified mentor venue", "avoid unverified directions"], { activeRoom: room, activeClassId: entries[0]?.id || "" });
    }
    return null;
  }

  function teacherAnswer(question, context) {
    if (!context.classes.length) return null;
    const q = normalize(question);
    const teacher = resolveTeacher(question, context.classes, context.conversation?.activeTeacher);
    if (!teacher || teacher.confidence < MIN_CONFIDENCE) return null;
    const matches = context.classes.filter((item) => teacherNames(item.teacher).includes(teacher.value));
    const day = resolveDay(question, context);
    const entries = (day ? matches.filter((item) => item.day === day.day) : matches)
      .sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day) || left.start - right.start);
    const patch = { activeTeacher: teacher.value, activeDay: day?.day || "", activeClassId: entries[0]?.id || "", activeSubject: entries[0]?.subject || "", activeRoom: entries[0]?.room || "" };
    const asksDetails = /\b(?:full|complete|all|every)\b.*\b(?:details?|profile|information|info)\b|\b(?:details?|profile|information|info)\b.*\b(?:of|about)\b/.test(q);
    const asksContact = /\b(?:phone|mobile|contact)\b/.test(q);
    const requestedFacts = [
      /\b(?:subjects?|courses?)\b/.test(q),
      /\b(?:rooms?|locations?|places?|where)\b/.test(q),
      /\b(?:when|classes?|schedule|timetable|timings?|days?)\b/.test(q),
      asksContact
    ].filter(Boolean).length;
    if (asksDetails || asksContact || requestedFacts >= 2) {
      const subjects = unique(matches.map((item) => item.subject));
      const types = unique(matches.map((item) => classTypeLabel(item.type)));
      const rooms = unique(matches.map((item) => item.room).filter((room) => !/not listed/i.test(room)));
      const isMentor = normalize(context.profile?.mentor) === normalize(teacher.value);
      const verifiedPhone = isMentor ? String(context.profile?.mentorPhone || "") : "";
      const contact = verifiedPhone
        ? `<p><strong>Verified mentor phone:</strong> ${escapeHtml(verifiedPhone)}</p>`
        : "<p><strong>Phone/contact:</strong> Not published in the active timetable.</p>";
      const schedule = entries.length ? `<p><strong>Weekly schedule${day ? ` · ${escapeHtml(day.label)}` : ""}</strong></p><ol>${scheduleRows(entries)}</ol>` : `<p>No class is listed${day ? ` on ${escapeHtml(day.label)}` : " in the active timetable"}.</p>`;
      return result("TEACHER_DETAILS", teacher.confidence, `<p><strong><u>${escapeHtml(teacher.value)} · verified details</u></strong></p><p><strong>Subjects:</strong> ${escapeHtml(subjects.join(", ") || "Not listed")}<br /><strong>Class types:</strong> ${escapeHtml(types.join(", ") || "Not listed")}<br /><strong>Rooms:</strong> ${escapeHtml(rooms.join(", ") || "Not listed")}</p>${schedule}${contact}<p class="answer-source">Official GNDEC weekly timetable${verifiedPhone ? " and verified active roster" : ""}.</p>`, { teacher: teacher.value, subjects, types, rooms, classes: entries, phonePublished: Boolean(verifiedPhone) }, ["resolve teacher", "filter active timetable", "collect subjects, types, rooms, days and times", "check verified mentor contact", "avoid unpublished facts"], patch);
    }
    if (/\b(?:which|what|list|show)\b.*\b(?:subjects?|courses?)\b|\b(?:subjects?|courses?)\b.*\b(?:teach|teaches|taught|by)\b/.test(q)) {
      const subjects = unique(matches.map((item) => item.subject));
      return result("TEACHER_SUBJECTS", teacher.confidence, `<p><strong>${escapeHtml(teacher.value)}</strong> teaches <strong>${escapeHtml(subjects.join(", "))}</strong> in ${escapeHtml(context.profileLabel || "your timetable")}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { teacher: teacher.value, subjects }, ["resolve teacher", "filter active timetable", "collect subjects", "remove duplicates"], patch);
    }
    if (/\b(?:where|rooms?|locations?|places?)\b/.test(q)) {
      if (!entries.length) return result("TEACHER_LOCATIONS", 0.97, `<p><strong>${escapeHtml(teacher.value)}</strong> has no class listed${day ? ` on ${escapeHtml(day.label)}` : " in your timetable"}.</p>`, { teacher: teacher.value, day: day?.day, classes: [] }, ["resolve teacher", "resolve day", "filter active timetable"], patch);
      return result("TEACHER_LOCATIONS", teacher.confidence, `<p><strong><u>${escapeHtml(teacher.value)}${day ? ` · ${escapeHtml(day.label)}` : ""}</u></strong></p><ol>${scheduleRows(entries)}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { teacher: teacher.value, classes: entries }, ["resolve teacher", "filter active timetable", "sort chronologically", "verify rooms"], patch);
    }
    if (/\b(?:when|classes?|schedule|timetable|teach|teaches|teaching)\b/.test(q) || day) {
      if (!entries.length) return result("TEACHER_SCHEDULE", 0.97, `<p><strong>${escapeHtml(teacher.value)}</strong> has no class listed${day ? ` on ${escapeHtml(day.label)}` : " in your timetable"}.</p>`, { teacher: teacher.value, day: day?.day, classes: [] }, ["resolve teacher", "resolve day", "filter active timetable"], patch);
      return result("TEACHER_SCHEDULE", teacher.confidence, `<p><strong><u>${escapeHtml(teacher.value)}${day ? ` · ${escapeHtml(day.label)}` : ""}</u></strong></p><ol>${scheduleRows(entries)}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { teacher: teacher.value, classes: entries }, ["resolve teacher", "filter active timetable", "sort chronologically", "verify source"], patch);
    }
    const subjects = unique(matches.map((item) => item.subject));
    return result("TEACHER_FOCUS", teacher.confidence, `<p><strong>${escapeHtml(teacher.value)}</strong> is listed for <strong>${escapeHtml(subjects.join(", "))}</strong> in your timetable.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { teacher: teacher.value, subjects }, ["resolve teacher", "collect verified timetable assignments"], patch);
  }

  function findContextClass(context) {
    const id = context.conversation?.activeClassId;
    return id ? context.classes.find((item) => item.id === id) || null : null;
  }

  function findPreviousContextClass(context) {
    const id = context.conversation?.previousClassId;
    return id ? context.classes.find((item) => item.id === id) || null : null;
  }

  function nextAfter(item, classes) {
    if (!item) return null;
    return classes.filter((candidate) => candidate.day === item.day && candidate.start >= item.end).sort((left, right) => left.start - right.start)[0] || null;
  }

  function blockContainingClass(item, classes) {
    if (!item) return null;
    return subjectOccurrenceBlocks(classes.filter((candidate) => candidate.day === item.day && candidate.subject === item.subject))
      .find((block) => block.entries.some((entry) => entry.id === item.id)) || { day: item.day, start: item.start, end: item.end, entries: [item] };
  }

  function contextualClassAnswer(question, context) {
    const q = normalize(question);
    const active = findContextClass(context);
    if (!active) return null;
    const activePatch = classAnchorPatch(active);
    const asksAfter = /^(?:and )?(?:after (?:that|it)|what(?:'s| is) after (?:that|it)|then|next one)$/.test(q);
    if (asksAfter) {
      const activeBlock = blockContainingClass(active, context.classes);
      const next = nextAfter(activeBlock, context.classes);
      if (!next) return result("CLASS_AFTER", 0.98, `<p>No later class is listed after <strong>${escapeHtml(active.subject)}</strong> on ${escapeHtml(active.day)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { after: active, next: null }, ["resolve active class from conversation", "expand a contiguous subject block", "find following class", "verify order"], activePatch);
      return result("CLASS_AFTER", 0.99, `<p><strong>After ${escapeHtml(active.subject)}:</strong> ${escapeHtml(next.subject)} at ${humanTime(next.start)} in ${escapeHtml(next.room)} with ${escapeHtml(next.teacher)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { after: active, next }, ["resolve active class from conversation", "expand a contiguous subject block", "find following class", "verify order"], classAnchorPatch(next));
    }

    const asksBefore = /^(?:and )?(?:before (?:that|it)|what(?:'s| is) before (?:that|it)|previous one)$/.test(q);
    if (asksBefore) {
      const activeBlock = blockContainingClass(active, context.classes);
      const previous = context.classes.filter((candidate) => candidate.day === active.day && candidate.end <= activeBlock.start)
        .sort((left, right) => right.end - left.end || right.start - left.start)[0] || null;
      if (!previous) return result("CLASS_BEFORE", 0.98, `<p>No earlier class is listed before <strong>${escapeHtml(active.subject)}</strong> on ${escapeHtml(active.day)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { before: active, previous: null }, ["resolve active class from conversation", "find previous class", "verify order"], activePatch);
      return result("CLASS_BEFORE", 0.99, `<p><strong>Before ${escapeHtml(active.subject)}:</strong> ${escapeHtml(previous.subject)} at ${humanTime(previous.start)} in ${escapeHtml(previous.room)} with ${escapeHtml(previous.teacher)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { before: active, previous }, ["resolve active class from conversation", "find previous class", "verify order"], classAnchorPatch(previous));
    }

    if (/^(?:and )?same (?:room|building|teacher)$/.test(q)) {
      const rememberedPrevious = findPreviousContextClass(context);
      const activeBlock = blockContainingClass(active, context.classes);
      const right = rememberedPrevious && rememberedPrevious.id !== active.id ? active : nextAfter(activeBlock, context.classes);
      const left = rememberedPrevious && rememberedPrevious.id !== active.id ? rememberedPrevious : active;
      if (!right) return result("COMPARE_CLASS_RELATION", 0.98, `<p>No second consecutive class is available for that comparison after <strong>${escapeHtml(active.subject)}</strong> on ${escapeHtml(active.day)}.</p>`, { left, right: null }, ["resolve conversation class pair", "verify a second class exists"], activePatch);
      const pairPatch = classAnchorPatch(active, { previousClassId: rememberedPrevious?.id || "" });
      if (/room/.test(q)) {
        if (/not listed/i.test(left.room) || /not listed/i.test(right.room)) return result("COMPARE_ROOM", 1, `<p>I can’t verify whether the rooms are the same because one of the two official room labels is missing.</p>`, { same: null, left, right }, ["resolve conversation class pair", "check both room labels", "refuse an unverified comparison"], pairPatch);
        const same = left.room === right.room;
        return result("COMPARE_ROOM", 0.99, `<p><strong>${same ? "Yes" : "No"}.</strong> ${escapeHtml(left.subject)} is in ${escapeHtml(left.room)}, while ${escapeHtml(right.subject)} is in ${escapeHtml(right.room)}.</p>`, { same, left, right }, ["resolve conversation class pair", "compare official room labels"], pairPatch);
      }
      if (/teacher/.test(q)) {
        const leftTeachers = teacherNames(left.teacher);
        const rightTeachers = teacherNames(right.teacher);
        if (!leftTeachers.length || !rightTeachers.length) return result("COMPARE_TEACHER", 1, "<p>I can’t verify whether the teacher is the same because one teacher assignment is not listed.</p>", { same: null, left, right }, ["resolve conversation class pair", "check both teacher assignments", "refuse an unverified comparison"], pairPatch);
        const shared = leftTeachers.filter((teacher) => rightTeachers.includes(teacher));
        const same = leftTeachers.length === rightTeachers.length && leftTeachers.every((teacher) => rightTeachers.includes(teacher));
        return result("COMPARE_TEACHER", 0.99, `<p><strong>${same ? "Yes" : "No"}.</strong> ${escapeHtml(left.subject)}: ${escapeHtml(leftTeachers.join(", "))}; ${escapeHtml(right.subject)}: ${escapeHtml(rightTeachers.join(", "))}.</p>${!same && shared.length ? `<p>Shared teacher: <strong>${escapeHtml(shared.join(", "))}</strong>.</p>` : ""}`, { same, left, right, shared }, ["resolve conversation class pair", "separate co-teachers", "compare verified teacher assignments"], pairPatch);
      }
      const leftBuilding = buildingForRoom(left.room);
      const rightBuilding = buildingForRoom(right.room);
      if (!leftBuilding || !rightBuilding) return result("COMPARE_BUILDING", 1, "<p>I can’t verify whether the building is the same because an official building label is missing.</p>", { same: null, left, right }, ["resolve conversation class pair", "resolve both official building labels", "refuse an unverified comparison"], pairPatch);
      const same = leftBuilding === rightBuilding;
      return result("COMPARE_BUILDING", 0.98, `<p><strong>${same ? "Yes" : "No"}.</strong> ${escapeHtml(left.subject)} is in ${escapeHtml(leftBuilding)}, while ${escapeHtml(right.subject)} is in ${escapeHtml(rightBuilding)}.</p>`, { same, left, right, leftBuilding, rightBuilding }, ["resolve conversation class pair", "resolve official building labels", "compare buildings"], pairPatch);
    }

    if (/^(?:and )?(?:where|where is it|where is that|where is the class|which room|what room|location|place)$/.test(q)) {
      return result("ACTIVE_CLASS_LOCATION", 1, `<p><strong>${escapeHtml(active.subject)}</strong> is in <strong>${escapeHtml(active.room)}</strong> on ${escapeHtml(active.day)} at ${humanTime(active.start)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { class: active, room: active.room }, ["resolve active class from conversation", "read its verified room"], activePatch);
    }
    if (/^(?:and )?(?:who|who teaches it|who teaches that|who is teaching it|which teacher|what teacher|teacher)$/.test(q)) {
      return result("ACTIVE_CLASS_TEACHER", 1, `<p><strong>${escapeHtml(active.subject)}</strong> is taught by <strong>${escapeHtml(active.teacher)}</strong> on ${escapeHtml(active.day)} at ${humanTime(active.start)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { class: active, teacher: active.teacher }, ["resolve active class from conversation", "read its verified teacher assignment"], activePatch);
    }
    if (/^(?:and )?(?:when|when is it|when is that|what time|what day)$/.test(q)) {
      return result("ACTIVE_CLASS_TIME", 1, `<p><strong>${escapeHtml(active.subject)}</strong> is on <strong>${escapeHtml(active.day)} ${humanTime(active.start)} - ${humanTime(active.end)}</strong>.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { class: active }, ["resolve active class from conversation", "read its verified day and time"], activePatch);
    }
    return null;
  }

  function subjectAnswer(question, context) {
    if (!context.classes.length) return null;
    const q = normalize(question);
    const explicitlyMentioned = subjectsMentioned(question, context.classes);
    // Keep facts attached to the subject clause that requested them. This
    // prevents a compound question from collapsing to one arbitrary class.
    if (explicitlyMentioned.length > 1) return multiSubjectAnswer(question, context, explicitlyMentioned);
    const subject = resolveSubject(question, context.classes, context.conversation?.activeSubject);
    const contextClass = findContextClass(context);
    if (/^(?:after (?:that|it)|what(?:'s| is) after (?:that|it)|then|next one)\??$/.test(q) && contextClass) {
      const next = nextAfter(contextClass, context.classes);
      if (!next) return result("CLASS_AFTER", 0.95, `<p>No later class is listed after <strong>${escapeHtml(contextClass.subject)}</strong> on ${escapeHtml(contextClass.day)}.</p>`, { after: contextClass, next: null }, ["resolve previous class", "find following class", "verify order"]);
      return result("CLASS_AFTER", 0.98, `<p><strong>After ${escapeHtml(contextClass.subject)}:</strong> ${escapeHtml(next.subject)} at ${humanTime(next.start)} in ${escapeHtml(next.room)} with ${escapeHtml(next.teacher)}.</p>`, { after: contextClass, next }, ["resolve previous class", "find following class", "verify order"], { activeSubject: next.subject, activeRoom: next.room, activeClassId: next.id, activeDay: next.day });
    }
    if (/^same (?:room|building|teacher)\??$/.test(q) && contextClass) {
      const next = nextAfter(contextClass, context.classes);
      if (!next) return null;
      if (/room/.test(q)) {
        const same = contextClass.room === next.room;
        return result("COMPARE_ROOM", 0.99, `<p><strong>${same ? "Yes" : "No"}.</strong> ${escapeHtml(contextClass.subject)} is in ${escapeHtml(contextClass.room)}, while ${escapeHtml(next.subject)} is in ${escapeHtml(next.room)}.</p>`, { same, leftRoom: contextClass.room, rightRoom: next.room }, ["resolve two consecutive classes", "compare room IDs", "verify equality"]);
      }
      if (/teacher/.test(q)) {
        const leftTeachers = teacherNames(contextClass.teacher);
        const rightTeachers = teacherNames(next.teacher);
        const shared = leftTeachers.filter((teacher) => rightTeachers.includes(teacher));
        const same = leftTeachers.length === rightTeachers.length && leftTeachers.every((teacher) => rightTeachers.includes(teacher));
        return result("COMPARE_TEACHER", 0.99, `<p><strong>${same ? "Yes" : "No"}.</strong> ${escapeHtml(contextClass.subject)}: ${escapeHtml(leftTeachers.join(", ") || "Teacher not listed")}; ${escapeHtml(next.subject)}: ${escapeHtml(rightTeachers.join(", ") || "Teacher not listed")}.</p>${!same && shared.length ? `<p>Shared teacher: <strong>${escapeHtml(shared.join(", "))}</strong>.</p>` : ""}`, { same, leftTeachers, rightTeachers, shared }, ["resolve two consecutive classes", "separate co-teachers", "compare verified teacher names"]);
      }
      const left = buildingForRoom(contextClass.room);
      const right = buildingForRoom(next.room);
      if (!left || !right) return null;
      const same = left === right;
      return result("COMPARE_BUILDING", 0.95, `<p><strong>${same ? "Yes" : "No"}.</strong> ${escapeHtml(contextClass.subject)} is in ${escapeHtml(left)}, while ${escapeHtml(next.subject)} is in ${escapeHtml(right)}.</p>`, { same, leftBuilding: left, rightBuilding: right }, ["resolve consecutive classes", "resolve official building labels", "compare buildings"]);
    }
    if (!subject || subject.confidence < MIN_CONFIDENCE) return null;
    const matches = context.classes.filter((item) => item.subject === subject.value);
    const day = resolveDay(question, context);
    const dayMatches = day ? matches.filter((item) => item.day === day.day) : matches;
    // An explicit subject query starts a new subject focus. Clear any stale
    // class/room/teacher anchor from an earlier turn unless this answer below
    // selects a concrete class and deliberately replaces it.
    const patchBase = { activeSubject: subject.value, activeDay: day?.day || "", activeClassId: "", previousClassId: "", activeRoom: "", activeTeacher: "" };
    const asksCount = /\b(?:how many|count)\b/.test(q) || /\btotal\b.*\b(?:classes?|lectures?|periods?|count)\b|\b(?:classes?|lectures?|periods?)\b.*\btotal\b/.test(q);
    const asksDuration = /\b(?:duration|how long|total time|hours?|minutes?|length)\b/.test(q);
    const asksTeacher = /\b(?:who|teacher|teachers|faculty)\b/.test(q);
    const asksLocation = /\b(?:where|room|rooms|location|locations|place|places|venue|venues)\b/.test(q);
    const asksSchedule = /\b(?:when|timings?|schedule|timetable|all classes|all lectures)\b/.test(q) || /^(?:list|show)(?:\s+me)?\s+(?:them|those|all)\??$/.test(q);
    const requestedFacts = [asksCount, asksDuration, asksTeacher, asksLocation, asksSchedule].filter(Boolean).length;
    const asksAvailability = Boolean(day) && (/\b(?:do i have|is there|have i got|hai|hundi|aa)\b/.test(q) || /(?:\u0939\u0948|\u0939\u0948\u0902|\u0a39\u0a48|\u0a39\u0a28)/u.test(q));
    if (asksAvailability) {
      const entries = chronological(dayMatches);
      if (!entries.length) return result("SUBJECT_AVAILABILITY", 0.99, `<p><strong>No.</strong> ${escapeHtml(subject.value)} is not listed on ${escapeHtml(day.label)} in your active timetable.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subject: subject.value, day: day.day, available: false, classes: [] }, ["resolve subject", "resolve day", "filter active timetable", "verify no matching occurrence"], patchBase);
      const first = entries[0];
      return result("SUBJECT_AVAILABILITY", 0.99, `<p><strong>Yes.</strong> You have ${escapeHtml(subject.value)} on <strong>${escapeHtml(day.label)}</strong>${entries.length > 1 ? ` in <strong>${entries.length}</strong> timetable periods` : ""}.</p><ol>${scheduleRows(entries)}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subject: subject.value, day: day.day, available: true, classes: entries }, ["resolve subject", "resolve day", "filter active timetable", "verify matching occurrences"], classAnchorPatch(first, { previousClassId: "" }));
    }
    const asksNextOccurrence = /\bnext\b/.test(q) && !/\b(?:after|before)\b/.test(q);
    if (asksNextOccurrence) {
      const candidates = day ? dayMatches : matches;
      const next = nextFutureClass(candidates, context) || (!context.now?.day && candidates.length === 1 ? candidates[0] : null);
      if (!candidates.length) return result("NEXT_SUBJECT_CLASS", 0.99, `<p><strong>${escapeHtml(subject.value)}</strong> is not listed${day ? ` on ${escapeHtml(day.label)}` : " in your active timetable"}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subject: subject.value, day: day?.day, class: null }, ["resolve subject", ...(day ? ["resolve day"] : []), "filter active timetable", "verify no matching class"], patchBase);
      if (!next) return result("CLARIFY_SUBJECT_OCCURRENCE", 1, `<p>I found more than one <strong>${escapeHtml(subject.value)}</strong> class, but no current day and time were available to determine which one is next. Please name a day.</p>`, { subject: subject.value, candidates: chronological(candidates) }, ["resolve subject", "find all matching occurrences", "detect missing time anchor", "request a day instead of guessing"], patchBase);
      return result("NEXT_SUBJECT_CLASS", Math.min(subject.confidence, 0.99), `<p><strong>Next ${escapeHtml(subject.value)} class: ${escapeHtml(next.day)}</strong></p><p><strong>${humanTime(next.start)} - ${humanTime(next.end)}</strong> · ${escapeHtml(next.room)} · ${escapeHtml(next.teacher)}</p><p class="answer-source">Selected as the next future occurrence in your active official timetable.</p>`, { subject: subject.value, day: next.day, class: next }, ["resolve subject", ...(day ? ["resolve day"] : []), "read current India day and time", "rank matching occurrences by future distance", "select one verified class"], classAnchorPatch(next, { previousClassId: "" }));
    }
    if (day && /\b(?:first|earliest|last|final|latest)\b.*\b(?:class|lecture|period)\b/.test(q)) {
      const entries = [...dayMatches].sort((left, right) => left.start - right.start);
      if (!entries.length) return result("SUBJECT_BOUNDARY_CLASS", 0.97, `<p><strong>${escapeHtml(subject.value)}</strong> is not listed on ${escapeHtml(day.label)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subject: subject.value, day: day.day, class: null }, ["resolve subject", "resolve day", "filter official timetable"], patchBase);
      const firstRequested = /\b(?:first|earliest)\b/.test(q);
      const target = firstRequested ? entries[0] : entries[entries.length - 1];
      return result("SUBJECT_BOUNDARY_CLASS", 0.99, `<p><strong>${firstRequested ? "First" : "Last"} ${escapeHtml(subject.value)} class on ${escapeHtml(day.label)}</strong></p><p>${humanTime(target.start)} - ${humanTime(target.end)} · ${escapeHtml(target.room)} · ${escapeHtml(target.teacher)}</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subject: subject.value, day: day.day, class: target }, ["resolve subject", "resolve day", "sort subject classes", firstRequested ? "select first" : "select last"], { ...patchBase, activeClassId: target.id, activeRoom: target.room });
    }
    if (requestedFacts >= 2) {
      const minutes = dayMatches.reduce((sum, item) => sum + (item.end - item.start), 0);
      const teachers = unique(dayMatches.flatMap((item) => teacherNames(item.teacher)));
      const rooms = unique(dayMatches.map((item) => item.room).filter((room) => !/not listed/i.test(room)));
      const breakdown = classTypeSummary(dayMatches);
      const teacherDetails = teachers.map((teacher) => ({ teacher, assignments: teacherAssignments(teacher, dayMatches) }));
      const sections = [
        asksCount ? `<p>You have <strong>${dayMatches.length}</strong> ${escapeHtml(subject.value)} timetable ${dayMatches.length === 1 ? "period" : "periods"}${day ? ` on <strong>${escapeHtml(day.label)}</strong>` : " this week"}${breakdown ? ` · ${escapeHtml(breakdown)}` : ""}.</p>` : "",
        asksDuration ? `<p>Total scheduled duration: <strong>${escapeHtml(durationLabel(minutes))}</strong>.</p>` : "",
        asksTeacher ? `<p><strong>Teacher assignments</strong></p><ul>${teacherDetails.map((pair) => `<li><strong>${escapeHtml(pair.teacher)}:</strong> ${teacherAssignmentHtml(pair)}</li>`).join("") || "<li>Teacher not listed</li>"}</ul>` : "",
        asksLocation ? `<p><strong>Rooms:</strong> ${escapeHtml(rooms.join(", ") || "Room not listed")}.</p>` : "",
        asksSchedule ? `<p><strong>Schedule</strong></p><ol>${scheduleRows([...dayMatches].sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day) || left.start - right.start))}</ol>` : ""
      ].join("");
      return result("SUBJECT_COMBINED_FACTS", subject.confidence, `<p><strong><u>${escapeHtml(subject.value)}${day ? ` · ${escapeHtml(day.label)}` : " · this week"}</u></strong></p>${sections}<p class="answer-source">Calculated only from your active official timetable.</p>`, { subject: subject.value, day: day?.day, count: dayMatches.length, minutes, teachers, rooms, classes: dayMatches }, ["resolve subject", ...(day ? ["resolve day"] : []), "filter official timetable", "identify requested facts", "calculate verified totals", "collect teachers and rooms", ...(asksSchedule ? ["sort schedule"] : [])], { ...patchBase, activeRoom: rooms[0] || "", activeClassId: dayMatches[0]?.id || "" });
    }
    if (asksCount) {
      const minutes = dayMatches.reduce((sum, item) => sum + (item.end - item.start), 0);
      const breakdown = classTypeSummary(dayMatches);
      return result("COUNT_SUBJECT_CLASSES", subject.confidence, `<p>You have <strong>${dayMatches.length}</strong> ${escapeHtml(subject.value)} timetable ${dayMatches.length === 1 ? "period" : "periods"}${day ? ` on <strong>${escapeHtml(day.label)}</strong>` : " this week"}.</p>${breakdown ? `<p>Type breakdown: <strong>${escapeHtml(breakdown)}</strong>.</p>` : ""}${asksDuration ? `<p>Total scheduled duration: <strong>${escapeHtml(durationLabel(minutes))}</strong>.</p>` : ""}<p class="answer-source">Calculated from your active official timetable.</p>`, { subject: subject.value, day: day?.day, count: dayMatches.length, minutes, breakdown }, ["resolve subject", "resolve day", "filter active timetable", "count periods", "classify period types", ...(asksDuration ? ["sum verified durations"] : [])], patchBase);
    }
    if (asksDuration) {
      if (!dayMatches.length) return result("SUBJECT_DURATION", 0.97, `<p><strong>${escapeHtml(subject.value)}</strong> is not listed${day ? ` on ${escapeHtml(day.label)}` : " in your timetable"}.</p>`, { subject: subject.value, day: day?.day, classes: [] }, ["resolve subject", "filter active timetable"], patchBase);
      const details = dayMatches.map((item) => `${item.day} ${humanTime(item.start)}–${humanTime(item.end)}: ${item.end - item.start} minutes`);
      const minutes = dayMatches.reduce((sum, item) => sum + (item.end - item.start), 0);
      return result("SUBJECT_DURATION", subject.confidence, `<p><strong><u>${escapeHtml(subject.value)} duration</u></strong></p><p>Total scheduled duration: <strong>${escapeHtml(durationLabel(minutes))}</strong>${day ? ` on ${escapeHtml(day.label)}` : " this week"}.</p><ul>${details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul><p class="answer-source">Calculated from your active official timetable.</p>`, { subject: subject.value, classes: dayMatches, minutes }, ["resolve remembered or explicit subject", "filter active timetable", "calculate each duration", "sum verified durations"], patchBase);
    }
    if (/\b(?:after|before)\b/.test(q)) {
      const blocks = subjectOccurrenceBlocks(dayMatches);
      const contextualAnchor = contextClass?.subject === subject.value && (!day || contextClass.day === day.day)
        ? blockContainingClass(contextClass, context.classes)
        : null;
      let anchorBlock = contextualAnchor;
      let selectionReason = contextualAnchor ? "active conversation occurrence" : day ? "requested day" : "next future occurrence";
      if (!anchorBlock && day && blocks.length === 1) anchorBlock = blocks[0];
      if (!anchorBlock && day && blocks.length > 1) {
        return result("CLARIFY_SUBJECT_OCCURRENCE", 1, `<p><strong>${escapeHtml(subject.value)}</strong> appears more than once on ${escapeHtml(day.label)}. Which time do you mean?</p><ul>${blocks.map((block) => `<li>${humanTime(block.start)} - ${humanTime(block.end)}</li>`).join("")}</ul>`, { subject: subject.value, day: day.day, candidates: blocks }, ["resolve subject", "resolve requested day", "detect multiple separate occurrences", "request a time instead of guessing"], patchBase);
      }
      if (!anchorBlock && !day) {
        const representative = nextFutureClass(blocks.map((block) => block.entries[0]), context);
        if (representative) anchorBlock = blocks.find((block) => block.entries.some((entry) => entry.id === representative.id)) || null;
        else if (blocks.length === 1) { anchorBlock = blocks[0]; selectionReason = "only listed occurrence"; }
      }
      if (!anchorBlock) {
        if (!blocks.length) return null;
        return result("CLARIFY_SUBJECT_OCCURRENCE", 1, `<p>I found more than one <strong>${escapeHtml(subject.value)}</strong> class. Which day do you mean?</p><ul>${blocks.map((block) => `<li>${escapeHtml(block.day)} · ${humanTime(block.start)}</li>`).join("")}</ul>`, { subject: subject.value, candidates: blocks }, ["resolve subject", "find separate weekly occurrences", "detect ambiguity", "request a day instead of guessing"], patchBase);
      }
      const sameDay = context.classes.filter((item) => item.day === anchorBlock.day).sort((left, right) => left.start - right.start);
      const direction = /\bafter\b/.test(q) ? "after" : "before";
      const related = direction === "after"
        ? sameDay.find((item) => item.start >= anchorBlock.end)
        : [...sameDay].reverse().find((item) => item.end <= anchorBlock.start);
      const anchor = anchorBlock.entries[0];
      const selection = selectionReason === "next future occurrence"
        ? `<p>Using your next <strong>${escapeHtml(anchor.subject)}</strong> occurrence on ${escapeHtml(anchor.day)} at ${humanTime(anchorBlock.start)}.</p>`
        : "";
      if (!related) return result("ADJACENT_CLASS", 0.98, `${selection}<p>No class is listed ${direction} <strong>${escapeHtml(anchor.subject)}</strong> on ${escapeHtml(anchor.day)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { anchor, anchorBlock, related: null, direction, selectionReason }, ["resolve subject", `select ${selectionReason}`, "expand a contiguous subject block", `find class ${direction}`, "verify chronological order"], classAnchorPatch(anchor, { previousClassId: "" }));
      return result("ADJACENT_CLASS", contextualAnchor || day || blocks.length === 1 ? 0.99 : 0.94, `${selection}<p><strong>${escapeHtml(related.subject)}</strong> is ${direction} ${escapeHtml(anchor.subject)} on ${escapeHtml(anchor.day)}: ${humanTime(related.start)} in ${escapeHtml(related.room)} with ${escapeHtml(related.teacher)}.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { anchor, anchorBlock, related, direction, selectionReason }, ["resolve subject", `select ${selectionReason}`, "expand a contiguous subject block", `find class ${direction}`, "verify chronological order"], classAnchorPatch(related, { previousClassId: anchor.id }));
    }
    if (/^(?:maths?|mathematics(?: 1| i)?|m1|physics|economics|pps|workshop|manufacturing|drawing|edg)\??$/.test(q)) {
      const focusClass = nextFutureClass(matches, context) || (matches.length === 1 ? matches[0] : null);
      return result("SUBJECT_FOCUS", subject.confidence, `<p><strong>${escapeHtml(subject.value)}</strong> selected. I can show its next class, teacher, rooms, weekly schedule, or syllabus.</p>`, { subject: subject.value }, ["resolve subject", "select a deterministic timetable anchor", "verify active timetable subject"], { ...patchBase, activeDay: focusClass?.day || "", activeClassId: focusClass?.id || "", activeRoom: focusClass?.room || "" });
    }
    if (/\b(?:who|teacher|faculty)\b/.test(q)) {
      const teachers = unique(matches.flatMap((item) => teacherNames(item.teacher)));
      return result("SUBJECT_TEACHER", Math.min(subject.confidence, 0.98), `<p><strong>${escapeHtml(subject.value)}</strong> is taught by <strong>${escapeHtml(teachers.join(", ") || "a teacher not listed in the timetable")}</strong>.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subject: subject.value, teachers }, ["resolve subject", "collect teacher assignments", "verify timetable facts"], patchBase);
    }
    if (asksLocation) {
      if (!dayMatches.length) return result("SUBJECT_LOCATION", 0.97, `<p><strong>${escapeHtml(subject.value)}</strong> is not listed${day ? ` on ${escapeHtml(day.label)}` : " in your timetable"}.</p>`, { subject: subject.value, day: day?.day, classes: [] }, ["resolve subject", "resolve day", "filter active timetable"] , patchBase);
      const entries = dayMatches.sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day) || left.start - right.start);
      return result("SUBJECT_LOCATION", Math.min(subject.confidence, day ? day.confidence : 0.96), `<p><strong><u>${escapeHtml(subject.value)} locations${day ? ` · ${escapeHtml(day.label)}` : ""}</u></strong></p><ol>${scheduleRows(entries)}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subject: subject.value, classes: entries }, ["resolve subject", ...(day ? ["resolve day"] : []), "filter classes", "verify rooms"], { ...patchBase, activeRoom: entries[0].room, activeClassId: entries[0].id });
    }
    if (asksSchedule || /\b(?:classes?|next)\b/.test(q)
      || /^what about (?:today|tomorrow|monday|tuesday|wednesday|thursday|friday)\??$/.test(q)
      || Boolean(day)) {
      const entries = dayMatches.sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day) || left.start - right.start);
      if (!entries.length) return result("SUBJECT_SCHEDULE", 0.97, `<p><strong>${escapeHtml(subject.value)}</strong> is not listed${day ? ` on ${escapeHtml(day.label)}` : " in your timetable"}.</p>`, { subject: subject.value, day: day?.day, classes: [] }, ["resolve subject", "filter active timetable"], patchBase);
      const first = entries[0];
      return result("SUBJECT_SCHEDULE", Math.min(subject.confidence, 0.97), `<p><strong><u>${escapeHtml(subject.value)}${day ? ` · ${escapeHtml(day.label)}` : ""}</u></strong></p><ol>${scheduleRows(entries)}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { subject: subject.value, classes: entries }, ["resolve subject", ...(day ? ["resolve day"] : []), "filter classes", "sort chronologically", "verify source"], { ...patchBase, activeRoom: first.room, activeClassId: first.id });
    }
    return null;
  }

  function requestedUpcomingClassPosition(question = "") {
    const q = normalize(question);
    if (/\b(?:5th|fifth)\s+(?:next|upcoming)\b/.test(q)) return 5;
    if (/\b(?:4th|fourth)\s+(?:next|upcoming)\b/.test(q)) return 4;
    if (/\b(?:3rd|third)\s+(?:next|upcoming)\b/.test(q)) return 3;
    if (/\b(?:2nd|second)\s+(?:next|upcoming)\b|\bnext\s+(?:to\s+)?next\b|\bafter\s+(?:the\s+)?next\b/.test(q)) return 2;
    return 1;
  }

  function upcomingClasses(context, maximum = 5) {
    const today = String(context.now?.day || "");
    if (!CALENDAR_DAYS.includes(today)) return [];
    const nowMinutes = Number(context.now?.minutes);
    const todayIndex = CALENDAR_DAYS.indexOf(today);
    const upcoming = [];
    for (let shift = 0; shift <= 7 && upcoming.length < maximum; shift += 1) {
      const day = CALENDAR_DAYS[(todayIndex + shift) % CALENDAR_DAYS.length];
      const entries = context.classes.filter((item) => item.day === day && (shift > 0 || !Number.isFinite(nowMinutes) || item.start > nowMinutes)).sort((left, right) => left.start - right.start);
      upcoming.push(...entries);
    }
    return upcoming.slice(0, maximum);
  }

  function reasoningAnswer(question, context) {
    if (!context.classes.length) return null;
    const q = normalize(question);
    const byDay = new Map(CALENDAR_DAYS.map((day) => [day, context.classes.filter((item) => item.day === day)]));
    const specificSubjects = subjectsMentioned(question, context.classes);
    const day = resolveDay(question, context);
    const asksUpcomingClass = /\b(?:next|upcoming)\b.*\b(?:class|lecture|period)\b|\b(?:class|lecture|period)\b.*\b(?:next|upcoming)\b/.test(q);
    if (!specificSubjects.length && asksUpcomingClass && CALENDAR_DAYS.includes(String(context.now?.day || ""))) {
      const position = requestedUpcomingClassPosition(q);
      const upcoming = upcomingClasses(context, Math.max(5, position));
      const target = upcoming[position - 1];
      if (!target) return result("UPCOMING_CLASS", 0.99, `<p><strong>No ${position === 1 ? "upcoming" : `${position}${position === 2 ? "nd" : position === 3 ? "rd" : "th"} upcoming`} class is listed.</strong></p><p>The active official timetable does not contain that many future classes.</p>`, { position, class: null }, ["read India day and time", "load active timetable", "scan upcoming study days", "verify bounded result"]);
      const labels = ["", "Next class", "Second upcoming class", "Third upcoming class", "Fourth upcoming class", "Fifth upcoming class"];
      return result("UPCOMING_CLASS", 0.99, `<p><strong>${labels[position]}: ${escapeHtml(target.subject)}</strong></p><p><strong>${humanTime(target.start)} - ${humanTime(target.end)}</strong> · ${escapeHtml(target.room)} · ${escapeHtml(target.teacher)}</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { position, class: target }, ["read India day and time", "load active timetable", "scan upcoming study days", `select upcoming position ${position}`, "verify chronological order"], { activeDay: target.day, activeClassId: target.id, activeSubject: target.subject, activeRoom: target.room });
    }
    if (/which day.*(?:lightest|least|fewest|minimum)|(?:lightest|least|fewest|minimum).*(?:day|classes?|lectures?|periods?)/.test(q)) {
      const loads = DAYS.map((dayName) => {
        const entries = byDay.get(dayName);
        return { day: dayName, count: entries.length, minutes: entries.reduce((sum, item) => sum + (item.end - item.start), 0) };
      });
      const minimumMinutes = Math.min(...loads.map((item) => item.minutes));
      const durationWinners = loads.filter((item) => item.minutes === minimumMinutes);
      const minimumCount = Math.min(...durationWinners.map((item) => item.count));
      const winners = durationWinners.filter((item) => item.count === minimumCount);
      const names = winners.map((item) => item.day).join(" and ");
      const loadText = minimumCount === 0 ? `no classes (0 periods, ${durationLabel(minimumMinutes)})` : `${minimumCount} timetable ${minimumCount === 1 ? "period" : "periods"}, ${durationLabel(minimumMinutes)}`;
      return result("LIGHTEST_DAY", 0.99, `<p><strong>${escapeHtml(names)}</strong> ${winners.length === 1 ? "is" : "are"} lightest: <strong>${escapeHtml(loadText)}</strong>.</p><p class="answer-source">Compared by total scheduled class time, then period count, across your active Monday–Friday timetable.</p>`, { days: winners.map((item) => item.day), minutes: minimumMinutes, count: minimumCount, loads }, ["load active week", "sum scheduled minutes per day", "count periods per day", "select the minimum without excluding zero-class weekdays"], { activeDay: winners[0].day });
    }
    if ((/\bbuilding\b/.test(q) && /\b(?:most|maximum|often)\b/.test(q)) || /building.*(?:use|visit|go).*most/.test(q)) {
      const usage = new Map();
      context.classes.forEach((item) => {
        const building = buildingForRoom(item.room);
        if (!building) return;
        const current = usage.get(building) || { building, periods: 0, minutes: 0 };
        current.periods += 1;
        current.minutes += item.end - item.start;
        usage.set(building, current);
      });
      if (!usage.size) return result("MOST_USED_BUILDING", 1, "<p>I can’t determine your most-used building because the active timetable does not publish building names in its room labels.</p>", { buildings: [] }, ["load active timetable", "extract only published building labels", "detect missing building data"]);
      const ranked = [...usage.values()].sort((left, right) => right.minutes - left.minutes || right.periods - left.periods || left.building.localeCompare(right.building));
      const maximumMinutes = ranked[0].minutes;
      const maximumPeriods = Math.max(...ranked.filter((item) => item.minutes === maximumMinutes).map((item) => item.periods));
      const winners = ranked.filter((item) => item.minutes === maximumMinutes && item.periods === maximumPeriods);
      return result("MOST_USED_BUILDING", 0.97, `<p>You use <strong>${escapeHtml(winners.map((item) => item.building).join(" and "))}</strong> most this week: <strong>${escapeHtml(durationLabel(maximumMinutes))}</strong> across <strong>${maximumPeriods}</strong> timetable ${maximumPeriods === 1 ? "period" : "periods"}.</p><p class="answer-source">Calculated only from explicit building names in your official room labels; unlabeled rooms are excluded.</p>`, { buildings: winners.map((item) => item.building), minutes: maximumMinutes, periods: maximumPeriods, usage: ranked }, ["load active week", "extract explicit building labels", "sum verified scheduled minutes", "count periods", "select maximum"], { activeRoom: "" });
    }
    const asksInternalBreak = /(?:how long|duration|total|long).*(?:break|gap)|(?:break|gap).*(?:how long|duration|total|long)/.test(q);
    const asksFreeTime = !asksInternalBreak && (/\b(?:when|what time)\b.*\bfree\b|\bfree\b.*\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|slots?|periods?|lectures?|time)\b/.test(q));
    if (!specificSubjects.length && day && (asksInternalBreak || asksFreeTime)) {
      const entries = byDay.get(day.day);
      if (asksInternalBreak) {
        const breaks = internalBreakIntervals(entries);
        if (!breaks.length) {
          const reason = entries.length < 2 ? "Fewer than two classes are listed, so there is no between-class break to calculate." : "Your listed classes are consecutive, so there is no internal break between the first and last class.";
          return result("DAY_BREAKS", 0.99, `<p><strong>${escapeHtml(day.label)} break:</strong> ${escapeHtml(reason)}</p><p class="answer-source">Calculated only between verified classes; time before the first class and after the last class is not counted as a break.</p>`, { day: day.day, breaks: [], minutes: 0 }, ["resolve day", "merge overlapping classes", "inspect gaps only between classes"], { activeDay: day.day });
        }
        const minutes = breaks.reduce((sum, item) => sum + (item.end - item.start), 0);
        const longest = Math.max(...breaks.map((item) => item.end - item.start));
        return result("DAY_BREAKS", 0.99, `<p><strong><u>${escapeHtml(day.label)} internal ${breaks.length === 1 ? "break" : "breaks"}</u></strong></p><ol>${breaks.map((item) => `<li><strong>${humanTime(item.start)} - ${humanTime(item.end)}</strong> · ${escapeHtml(durationLabel(item.end - item.start))}</li>`).join("")}</ol><p>Total internal break time: <strong>${escapeHtml(durationLabel(minutes))}</strong>. Longest break: <strong>${escapeHtml(durationLabel(longest))}</strong>.</p><p class="answer-source">Calculated only between verified classes; free time before the first class and after the last class is excluded.</p>`, { day: day.day, breaks, minutes, longest }, ["resolve day", "merge overlapping classes", "calculate gaps between consecutive occupied intervals", "sum and verify durations"], { activeDay: day.day });
      }
      const mergeAdjacent = /\b(?:when|what time)\b.*\bfree\b|\bfree time\b/.test(q);
      const free = freeTimetableIntervals(entries, context, mergeAdjacent);
      const minutes = free.reduce((sum, item) => sum + (item.end - item.start), 0);
      const totalLabel = [Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} hr` : "", minutes % 60 ? `${minutes % 60} min` : ""].filter(Boolean).join(" ") || "0 min";
      const detail = free.length
        ? `<ol>${free.map((item) => `<li><strong>${humanTime(item.start)} - ${humanTime(item.end)}</strong> · ${escapeHtml(durationLabel(item.end - item.start))}</li>`).join("")}</ol><p>Total free timetable time: <strong>${escapeHtml(totalLabel)}</strong>.</p>`
        : "<p>No free official timetable slot is listed.</p>";
      return result("DAY_FREE_TIME", 0.99, `<p><strong><u>${escapeHtml(day.label)} free timetable time</u></strong></p>${detail}<p class="answer-source">Calculated from unoccupied official bell slots in your active timetable.</p>`, { day: day.day, free, minutes }, ["resolve day", "load official bell slots", "remove every slot overlapped by a class", ...(mergeAdjacent ? ["merge adjacent free slots"] : ["preserve individual free bell slots"]), "sum verified durations"], { activeDay: day.day });
    }
    if (/which day.*(?:most|maximum|highest).*(?:classes?|lectures?)|(?:most|maximum).*(?:classes?|lectures?).*which day/.test(q)) {
      const counts = DAYS.map((day) => ({ day, count: byDay.get(day).length }));
      const maximum = Math.max(...counts.map((item) => item.count));
      const winners = counts.filter((item) => item.count === maximum).map((item) => item.day);
      return result("MAX_CLASSES_DAY", 0.98, `<p><strong>${escapeHtml(winners.join(" and "))}</strong> ${winners.length > 1 ? "have" : "has"} the most classes: <strong>${maximum}</strong>.</p><p class="answer-source">Calculated from your active official timetable.</p>`, { days: winners, count: maximum, counts }, ["load active week", "group classes by day", "count", "select maximum", "verify non-negative counts"], { activeDay: winners[0] });
    }
    if (/which teacher.*(?:most|maximum)|(?:most|maximum).*(?:teacher|faculty)|teacher.*see most/.test(q)) {
      const counts = new Map();
      context.classes.forEach((item) => teacherNames(item.teacher).forEach((teacher) => counts.set(teacher, (counts.get(teacher) || 0) + 1)));
      if (!counts.size) return null;
      const maximum = Math.max(...counts.values());
      const teachers = [...counts.entries()].filter(([, count]) => count === maximum).map(([teacher]) => teacher);
      return result("MOST_FREQUENT_TEACHER", 0.97, `<p>You see <strong>${escapeHtml(teachers.join(" and "))}</strong> most often: <strong>${maximum}</strong> timetable periods this week.</p><p class="answer-source">Calculated from your active official timetable.</p>`, { teachers, count: maximum }, ["load active week", "group by teacher", "count periods", "select maximum"]);
    }
    if (!specificSubjects.length && day && /\b(?:first|earliest|start(?:ing)?(?: class| lecture)?|begin)\b.*\b(?:class|lecture|period|college|day)\b|\b(?:class|lecture|period|college|day)\b.*\b(?:first|earliest|start|begin)\b/.test(q)) {
      const entries = byDay.get(day.day).sort((left, right) => left.start - right.start);
      if (!entries.length) return result("FIRST_CLASS", 0.99, `<p>No class is listed on <strong>${escapeHtml(day.label)}</strong>.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { day: day.day, class: null }, ["resolve day", "load active day", "sort chronologically"], { activeDay: day.day });
      const first = entries[0];
      return result("FIRST_CLASS", 0.99, `<p><strong>First class on ${escapeHtml(day.label)}: ${escapeHtml(first.subject)}</strong></p><p>${humanTime(first.start)} - ${humanTime(first.end)} · ${escapeHtml(first.room)} · ${escapeHtml(first.teacher)}</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { day: day.day, class: first }, ["resolve day", "load active day", "sort chronologically", "select first"], { activeDay: day.day, activeClassId: first.id, activeSubject: first.subject, activeRoom: first.room });
    }
    if (!specificSubjects.length && day && (/\b(?:last|final|latest)\b.*\b(?:class|lecture|period)\b|\bwhen\b.*\b(?:finish|end|leave)\b|\bwhat time\b.*\b(?:finish|end|leave)\b/.test(q))) {
      const entries = byDay.get(day.day).sort((left, right) => left.start - right.start);
      if (!entries.length) return result("LAST_CLASS", 0.99, `<p>No class is listed on <strong>${escapeHtml(day.label)}</strong>.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { day: day.day, class: null }, ["resolve day", "load active day", "sort chronologically"], { activeDay: day.day });
      const last = entries[entries.length - 1];
      return result("LAST_CLASS", 0.99, `<p><strong>Last class on ${escapeHtml(day.label)}: ${escapeHtml(last.subject)}</strong></p><p>${humanTime(last.start)} - ${humanTime(last.end)} · ${escapeHtml(last.room)} · ${escapeHtml(last.teacher)}</p><p>You finish at <strong>${humanTime(last.end)}</strong>.</p><p class="answer-source">Official GNDEC weekly timetable.</p>`, { day: day.day, class: last }, ["resolve day", "load active day", "sort chronologically", "select last"], { activeDay: day.day, activeClassId: last.id, activeSubject: last.subject, activeRoom: last.room });
    }
    const asksDayCount = /(?:how many|count|kitne|kitni|kinne|kinni).*(?:classes?|lectures?|periods?)|(?:classes?|lectures?|periods?).*(?:how many|count)/.test(q);
    const asksDayDuration = /(?:total|how many|how much).*(?:class|lecture|timetable|study)\s*(?:time|hours?|minutes?)|(?:how long).*(?:classes?|lectures?|college)|\b(?:total\s+)?duration\b/.test(q);
    if (!specificSubjects.length && day && (asksDayCount || asksDayDuration)) {
      const entries = byDay.get(day.day);
      const minutes = entries.reduce((sum, item) => sum + (item.end - item.start), 0);
      const duration = durationLabel(minutes);
      return result(asksDayCount && asksDayDuration ? "DAY_COUNT_AND_DURATION" : asksDayDuration ? "DAY_CLASS_DURATION" : "COUNT_DAY_CLASSES", 0.99, `<p><strong><u>${escapeHtml(day.label)} class summary</u></strong></p>${asksDayCount ? `<p>You have <strong>${entries.length}</strong> timetable ${entries.length === 1 ? "class" : "periods"}.</p>` : ""}${asksDayDuration ? `<p>Total scheduled class time: <strong>${escapeHtml(duration)}</strong>.</p>` : ""}<p class="answer-source">Calculated from your active official timetable.</p>`, { day: day.day, count: entries.length, minutes }, ["resolve day", "load active day", ...(asksDayCount ? ["count timetable periods"] : []), ...(asksDayDuration ? ["sum verified class durations"] : []), "verify calculated totals"], { activeDay: day.day });
    }
    if (!specificSubjects.length && day && /(?:which|what|list|show).*(?:rooms?|locations?|places?)|(?:where|rooms?).*(?:classes?|lectures?)/.test(q)) {
      const entries = byDay.get(day.day);
      const rooms = unique(entries.map((item) => item.room).filter((room) => !/not listed/i.test(room)));
      return result("DAY_ROOMS", 0.97, `<p><strong><u>${escapeHtml(day.label)} rooms</u></strong></p><ol>${rooms.map((room) => `<li>${escapeHtml(room)}</li>`).join("")}</ol><p class="answer-source">Official GNDEC weekly timetable.</p>`, { day: day.day, rooms }, ["resolve day", "load active day", "collect rooms", "remove duplicates"], { activeDay: day.day });
    }
    if (!specificSubjects.length && day && /(?:which|what).*(?:buildings?|blocks?).*(?:visit|use|go)|(?:buildings?|blocks?).*(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday)/.test(q)) {
      const entries = byDay.get(day.day);
      const buildings = unique(entries.map((item) => buildingForRoom(item.room)).filter(Boolean));
      if (!buildings.length) return null;
      return result("DAY_BUILDINGS", 0.93, `<p><strong>${escapeHtml(day.label)}:</strong> ${escapeHtml(buildings.join(", "))}.</p><p class="answer-source">Derived only from building names present in official room labels.</p>`, { day: day.day, buildings }, ["resolve day", "load day classes", "resolve official room labels", "collect unique buildings"], { activeDay: day.day });
    }
    return null;
  }

  function updateConversation(previous, patch, question, intent) {
    const safePrevious = previous && typeof previous === "object" ? previous : {};
    const hasPatch = (key) => Object.prototype.hasOwnProperty.call(patch || {}, key);
    const patchedText = (key, maximum) => String(hasPatch(key) ? (patch[key] || "") : (safePrevious[key] || "")).slice(0, maximum);
    const recentTurns = Array.isArray(safePrevious.recentTurns) ? safePrevious.recentTurns.slice(-(MAX_RECENT_TURNS - 1)) : [];
    recentTurns.push({ query: normalize(question).slice(0, 160), intent: String(intent || "").slice(0, 48) });
    const requestedDay = hasPatch("activeDay") ? patch.activeDay : safePrevious.activeDay;
    const previousActiveClassId = String(safePrevious.activeClassId || "").slice(0, 240);
    const nextActiveClassId = patchedText("activeClassId", 240);
    let previousClassId = patchedText("previousClassId", 240);
    if (!hasPatch("previousClassId") && hasPatch("activeClassId") && nextActiveClassId && previousActiveClassId && nextActiveClassId !== previousActiveClassId) {
      previousClassId = previousActiveClassId;
    }
    return {
      activeSubject: patchedText("activeSubject", 120),
      activeTeacher: patchedText("activeTeacher", 160),
      activeRoom: patchedText("activeRoom", 160),
      activeDay: CALENDAR_DAYS.includes(requestedDay) ? requestedDay : "",
      activeClassId: nextActiveClassId,
      previousClassId,
      lastIntent: String(intent || safePrevious.lastIntent || "").slice(0, 48),
      recentTurns
    };
  }

  function validateResult(candidate) {
    if (!candidate || typeof candidate !== "object") return { accepted: false, reason: FALLBACK_REASONS.INVALID_RESULT };
    if (!candidate.handled) return { accepted: false, reason: FALLBACK_REASONS.UNSUPPORTED };
    if (!candidate.verified) return { accepted: false, reason: FALLBACK_REASONS.VERIFICATION_FAILED };
    if (!Number.isFinite(candidate.confidence) || candidate.confidence < MIN_CONFIDENCE) return { accepted: false, reason: FALLBACK_REASONS.LOW_CONFIDENCE };
    if (typeof candidate.answer !== "string" || !candidate.answer.trim() || candidate.answer.length > MAX_ANSWER_LENGTH) return { accepted: false, reason: FALLBACK_REASONS.INVALID_RESULT };
    if (!Array.isArray(candidate.plan) || candidate.plan.length > MAX_PLAN_STEPS) return { accepted: false, reason: FALLBACK_REASONS.INVALID_RESULT };
    if (/<\s*\/?\s*(?:script|iframe|object|embed|style|form|input|textarea|select|video|audio|meta|link)\b/i.test(candidate.answer)
      || /\son[a-z]+\s*=|javascript\s*:/i.test(candidate.answer)
      || /\bNaN\b|\[object Object\]/.test(candidate.answer)) return { accepted: false, reason: FALLBACK_REASONS.VERIFICATION_FAILED };
    return { accepted: true, reason: "" };
  }

  function isSyllabusIntent(question) {
    const q = normalize(question);
    return /\b(?:syllabus|units?|chapters?|course outcomes?|credits?|marks?|assessment|exam duration|teaching hours?|textbooks?|reference books?|study scheme|course code|prerequisites?|additional material|calculator|labs?|laboratory|experiments?|practicals?)\b/.test(q);
  }

  function suggestionScore(candidate, query) {
    const value = normalize(candidate);
    if (!query) return 1;
    if (value === query) return -1;
    const ordinalPenalty = /\b(?:2nd|second|3rd|third|4th|fourth|5th|fifth)\b/.test(value)
      && !/\b(?:2nd|second|3rd|third|4th|fourth|5th|fifth)\b/.test(query) ? 180 : 0;
    if (value.startsWith(query)) return 1600 - value.length - ordinalPenalty;
    if (value.includes(query)) return 1450 - value.length - ordinalPenalty;
    const valueWords = value.split(" ").filter(Boolean);
    const queryWords = query.split(" ").filter(Boolean);
    let score = 0;
    for (const queryWord of queryWords) {
      let best = 0;
      valueWords.forEach((valueWord) => {
        if (valueWord === queryWord) best = Math.max(best, 90);
        else if (valueWord.startsWith(queryWord)) best = Math.max(best, 76 - Math.min(20, valueWord.length - queryWord.length));
        else if (queryWord.length >= 3 && valueWord.startsWith(queryWord.slice(0, -1))) best = Math.max(best, 45);
        else if (queryWord.length >= 3 && queryWord.startsWith(valueWord)) best = Math.max(best, 52);
        else if (queryWord.length >= 4 && levenshtein(queryWord, valueWord) <= (queryWord.length >= 7 ? 2 : 1)) best = Math.max(best, 34);
      });
      if (!best) return -1;
      score += best;
    }
    return score + (queryWords.length > 1 ? 120 : 0) - Math.min(40, value.length / 3) - ordinalPenalty;
  }

  function suggest(input, suppliedContext = {}) {
    const typed = String(input || "").trim();
    const q = normalize(typed);
    const classes = (Array.isArray(suppliedContext.classes) ? suppliedContext.classes : []).map(compactClass).filter(Boolean);
    const subjects = unique(classes.map((item) => item.subject));
    const rooms = unique(classes.map((item) => item.room).filter((room) => !/not listed/i.test(room)));
    const teachers = unique(classes.flatMap((item) => teacherNames(item.teacher)));
    const pool = [
      "What is my next class?",
      "2nd next class",
      "Aaj ka timetable batao",
      "Kal ka timetable batao",
      "Parson ka timetable batao",
      "Free lectures today",
      "Who is my mentor?",
      "Where and when is my mentoring class?",
      "Math units",
      "Physics syllabus",
      "List all my teachers",
      "List all my teachers with their subjects",
      "List all rooms",
      "List all my subjects",
      "How many subjects do I have?",
      "How many teachers do I have?",
      "How many rooms do I use?",
      "Show my full profile",
      "What is my CRN?",
      "What is my current serial number?",
      "What are my previous serial numbers?",
      "Find a student by name or CRN",
      "Teachers of all subjects",
      "Rooms of all subjects",
      "Which day has the most classes this week?",
      "Which day is lightest?",
      "Which teacher do I see most this week?",
      "Which building do I use most this week?",
      "When am I free tomorrow?",
      "How long is my break tomorrow?",
      "What is my first class on Monday?",
      "When do I finish on Friday?",
      "Faculty timetable",
      "Room timetable",
      "Subject timetable",
      "Programme timetable",
      "Section timetable",
      "Subsection timetable",
      "What day is 17 August 2026?",
      "What date is day after tomorrow?",
      "How many classes do I have tomorrow?",
      "Solve 2x + 3 = 11",
      "25% of 240",
      ...subjects.flatMap((subject) => [`Who teaches ${subject}?`, `Where is ${subject}?`, `When is ${subject}?`, `When is my next ${subject} class?`, `${subject} weekly schedule`, `${subject} syllabus`]),
      ...teachers.slice(0, 8).map((teacher) => `Which subjects does ${teacher} teach?`),
      ...rooms.slice(0, 8).map((room) => `What classes are in ${room}?`)
    ];
    return unique(pool).map((candidate, index) => ({ candidate, index, score: suggestionScore(candidate, q) }))
      .filter((item) => item.score >= 0)
      .sort((left, right) => right.score - left.score || left.index - right.index || left.candidate.localeCompare(right.candidate))
      .slice(0, 8)
      .map((item) => item.candidate);
  }

  function process(input, suppliedContext = {}) {
    const startedAt = Date.now();
    const finish = (outcome) => recordMetric({ ...outcome, processingMs: Number.isFinite(outcome?.processingMs) ? outcome.processingMs : Date.now() - startedAt });
    const original = String(input || "").trim().slice(0, MAX_INPUT_LENGTH);
    if (!original) return finish({ handled: false, confidence: 0, verified: false, fallbackReason: FALLBACK_REASONS.UNSUPPORTED });
    const context = {
      ...suppliedContext,
      classes: (Array.isArray(suppliedContext.classes) ? suppliedContext.classes : []).map(compactClass).filter(Boolean),
      conversation: suppliedContext.conversation && typeof suppliedContext.conversation === "object" ? suppliedContext.conversation : {}
    };
    const explicitSubject = subjectsMentioned(original, context.classes).length > 0;
    const timetableCandidate = !isSyllabusIntent(original) && (reasoningAnswer(original, context)
      || contextualClassAnswer(original, context)
      || catalogueAnswer(original, context)
      || (explicitSubject
        ? (subjectAnswer(original, context) || teacherAnswer(original, context))
        : (teacherAnswer(original, context) || subjectAnswer(original, context))));
    const candidate = facultyLookupAnswer(context)
      || studentLookupAnswer(context)
      || exactDateAnswer(original, context)
      || utilityAnswer(original)
      || profileAnswer(original, context)
      || conversationAnswer(original)
      || timetableCandidate;
    if (!candidate) return finish({ handled: false, confidence: 0, verified: false, fallbackReason: FALLBACK_REASONS.UNSUPPORTED });
    const validity = validateResult(candidate);
    if (!validity.accepted) return finish({ ...candidate, handled: false, fallbackReason: validity.reason });
    candidate.context = updateConversation(context.conversation, candidate.contextPatch || {}, original, candidate.intent);
    delete candidate.contextPatch;
    candidate.processingMs = Date.now() - startedAt;
    candidate.version = VERSION;
    return finish(candidate);
  }

  globalScope.CompassBrainV2 = Object.freeze({
    VERSION,
    MIN_CONFIDENCE,
    FALLBACK_REASONS,
    normalize,
    process,
    validateResult,
    suggest,
    buildingForRoom,
    getMetrics: metricsSnapshot
  });
})(globalThis);

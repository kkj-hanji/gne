// GNDEC Compass Brain Kernel 1.0
// Shared, dependency-free foundation for Brain 1.2 (brain-v1-2.js) and
// Brain 2.2 (brain-v2-2.js). Deterministic, bounded, offline, no network,
// no LLM, no embeddings. Official sources always remain the authority.
(function installCompassBrainKernel(globalScope) {
  "use strict";

  const VERSION = "1.0.0";
  const LIMITS = Object.freeze({
    input: 1200,
    answer: 64000,
    planSteps: 10,
    recentTurns: 8,
    pendingTurns: 3,
    listItems: 12,
    candidates: 6
  });

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const CALENDAR_DAYS = [...DAYS, "Saturday", "Sunday"];
  const DEFAULT_BELL_SLOTS = Object.freeze([
    [510, 570], [570, 630], [630, 690], [690, 750],
    [750, 810], [810, 870], [870, 930], [930, 980]
  ]);
  const MONTH_NAMES = Object.freeze([
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]);
  const MONTHS = Object.freeze({
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
    april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
    august: 7, aug: 7, agast: 7, september: 8, sep: 8, sept: 8, october: 9,
    oct: 9, november: 10, nov: 10, december: 11, dec: 11
  });

  // Multilingual normalization table (English, Hindi, Punjabi, Hinglish),
  // shared verbatim with the proven Brain 2 table so both generations agree.
  const PHRASES = Object.freeze([
    // Day-after-tomorrow aliases must be rewritten BEFORE plain tomorrow/today
    // words, otherwise "ਕਲ੍ਹ ਪਿੱਛੋਂ" collapses to "tomorrow".
    [/\b(?:day\s+after\s+tomorrow|day-after-tomorrow|parso|parson)\b|\u092a\u0930\u0938\u094b\u0902|\u0a15(?:\u0a71)?\u0a32\u0a4d\u0a39\s*\u0a2a\u0a3f\u0a71?\u0a1b\u0a4b\u0a02/g, " day after tomorrow "],
    [/\b(?:holidays?|vacations?|chutti|chhutti|chuttiyan|chutiyan|chuttiya|chuttiyaan|off)\b|\u091b\u0941\u091f\u094d\u091f\u0940|\u091b\u0941\u091f\u094d\u091f\u093f\u092f\u093e\u0901|\u0905\u0935\u0915\u093e\u0936|\u0a1b\u0a41\u0a71\u0a1f\u0a40|\u0a1b\u0a41\u0a71\u0a1f\u0a40\u0a06\u0a02/gu, " holiday "],
    // Month normalizations in English, Hinglish, Punjabi (Gurmukhi), and Hindi (Devanagari)
    [/\b(?:january|janvari|janwary)\b|\u0a1c\u0a28\u0a35\u0a30\u0a40|\u091c\u0928\u0935\u0930\u0940/gu, " january "],
    [/\b(?:february|farwari|farvari|farwary)\b|\u0a2b\u0a3c\u0a30\u0a35\u0a30\u0a40|\u0a2b\u0a30\u0a35\u0a30\u0a40|\u092b\u093c\u0930\u0935\u0930\u0940|\u092b\u0930\u0935\u0930\u0940/gu, " february "],
    [/\b(?:march|maarch)\b|\u0a2e\u0a3e\u0a30\u0a1a|\u092e\u093e\u0930\u094d\u091a/gu, " march "] ,
    [/\b(?:april|aprail)\b|\u0a05\u0a2a\u0a4d\u0a30\u0a48\u0a32|\u0905\u092a\u094d\u0930\u0948\u0932/gu, " april "],
    [/\b(?:may|maee|mai)\b|\u0a2e\u0a08|\u092e\u0908/gu, " may "],
    [/\b(?:june|joon)\b|\u0a1c\u0a42\u0a28|\u091c\u0942\u0928/gu, " june "],
    [/\b(?:july|julai)\b|\u0a1c\u0a41\u0a32\u0a3e\u0a08|\u091c\u0941\u0932\u0a3e\u0a08/gu, " july "],
    [/\b(?:august|agast)\b|\u0a05\u0a17\u0a38\u0a24|\u0905\u0917\u0938\u094d\u0924/gu, " august "],
    [/\b(?:september|sitambar|sitamber)\b|\u0a38\u0a24\u0a70\u0a2c\u0a30|\u0938\u093f\u0924\u0902\u092c\u0930/gu, " september "],
    [/\b(?:october|aktubar|aktuber)\b|\u0a05\u0a15\u0a24\u0a42\u0a2c\u0a30|\u0905\u0915\u094d\u091f\u0942\u092c\u0930/gu, " october "],
    [/\b(?:november|navambar|navamber)\b|\u0a28\u0a35\u0a70\u0a2c\u0a30|\u0928\u0935\u0902\u092c\u0930/gu, " november "],
    [/\b(?:december|disambar|disamber)\b|\u0a26\u0a38\u0a70\u0a2c\u0a30|\u0926\u093f\u0938\u0902\u092c\u0930/gu, " december "],
    [/\b(?:timetabel|timetble|timetabl|time tabel)\b/g, "timetable"],
    [/\b(?:loacation|locaton|locatoin|palce|plcae)\b/g, "location"],
    [/\b(?:techer|techers|taecher|faculity|sir|maam|mam|madam|prof|professor)\b/g, "teacher"],
    [/\b(?:syllbus|sylabus|syllubus)\b/g, "syllabus"],
    [/\b(?:subjet|subjets|subect)\b/g, "subjects"],
    [/\b(?:tomor+ow|tomm?or+ow|kal|kalle)\b/g, "tomorrow"],
    [/\b(?:tod+ay|aaj|ajj)\b/g, "today"],
    [/\b(?:nxt|agle|agli|agla)\b/g, "next"],
    [/\b(?:clas+|lectur+|lecture|period|periods|ghanta|ghante)\b/g, "class"],
    [/\b(?:kaha|kahaan|kidhar|kithe|kithhe|kamra|kamre)\b/g, "where"],
    [/\b(?:kaun|kon|keda|kedi|kehra|kehri|kaunsa|kaunsi)\b/g, "who"],
    [/\b(?:baad|bad)\b/g, "after"],
    [/\b(?:pehla|pehli)\b/g, "first"],
    [/\b(?:akhri|aakhri)\b/g, "last"],
    [/\b(?:meri|mera|mere|my)\b/g, "my"],
    [/\b(?:kab|kad|kado|kadon|kis time|kinne vaje|kitne baje)\b/g, "when"],
    [/\b(?:vishay|vishe|parhai|padhai)\b/g, "subjects"],
    [/\b(?:padhata|padhati|padhaunda|padhaundi|teachin)\b/g, "teaches"],
    [/\b(?:padhaata|padhaati|padhate|padhonda|padhondi)\b/g, "teaches"],
    [/\b(?:naam|nam)\b/g, "name"],
    [/\b(?:aur|atte|te|naale)\b/g, "and"],
    [/\b(?:khali|khaali|vella|velle|vela|vele)\b/g, "free"],
    [/\b(?:bunk|bunking|mass bunk|skip class)\b/g, "bunk"],
    [/\b(?:haziri|hazri|hajri|att|attandance)\b/g, "attendance"],
    [/\b(?:sabse|sab ton)\s+(?:halka|halki|kam|ghatt)\b/g, "lightest"],
    [/\b(?:sabse|sab ton)\s+(?:zyada|jada|vadh|wadh)\b/g, "most"],
    [/\b(?:kitna|kinna)\s+(?:lamba|long)\b/g, "how long"],
    [/\b(?:plus|jod|jodo)\b/g, " + "],
    [/\b(?:minus|ghata|ghatao)\b/g, " - "],
    [/\b(?:times|multiply|multiplied by|guna)\b/g, " * "],
    [/\b(?:divided by|divide|bhaag)\b/g, " / "],
    [/\b(?:hafte|hafta|haftey)\b/g, "week"],
    [/\b(?:imarat|building|block)\b/g, "building"],
    [/\b(?:marks?|number|ank|aank|nomber)\b|\u0905\u0902\u0915|\u0a05\u0a70\u0a15/gu, " marks "],
    [/\b(?:credits?|kredit)\b/gi, " credits "],
    [/\u0917\u0923\u093f\u0924|\u0a17\u0a23\u0a3f\u0a24/gu, " maths "],
    [/(?:\u092d\u094c\u0924\u093f\u0915|\u092b\u093f\u091c\u093f\u0915\u094d\u0938|\u0a2d\u0a4c\u0a24\u093f\u0915|\u0a2b\u0a3f\u0a1c\u0a3c\u093f\u0a15\u0a38)/gu, " physics "],
    [/\u0936\u093f\u0915\u094d\u0937\u0915|\u091f\u0940\u091a\u0930|\u0905\u0927\u094d\u092f\u093e\u092a\u0915|\u0a05\u0a27\u093f\u0a06\u0a2a\u0915|\u0a1f\u0940\u091a\u0930/gu, " teacher "],
    [/\u0928\u093e\u092e|\u0a28\u093e\u092e/gu, " name "],
    [/\u0914\u0930|\u0a05\u0a24\u0a47/gu, " and "],
    [/(?:\u0938\u092c\u0938\u0947\s+(?:\u0939\u0932\u094d\u0915\u093e|\u0915\u092e)|\u0a38\u092d\s+\u0924\u094b\u0a02\s+(?:\u0939\u0932\u0915\u093e|\u0918\u091f\u094d\u091f))/gu, " lightest "],
    [/(?:\u0938\u092c\u0938\u0947\s+(?:\u091c\u094d\u092f\u093e\u0926\u093e|\u091c\u093c\u094d\u092f\u093e\u0926\u093e)|\u0a38\u092d\s+\u0924\u094b\u0a02\s+(?:\u0a35\u0a71\u0a27|\u0a1c\u093c\u093f\u0a06\u0a26\u093e))/gu, " most "],
    [/(?:\u0916\u093e\u0932\u0940|\u0a16\u0a3e\u0a32\u0a40)/gu, " free "],
    [/(?:\u092c\u094d\u0930\u0947\u0915|\u0935\u093f\u0930\u093e\u092e|\u0a2c\u094d\u0a30\u0a47\u0915|\u0a35\u093f\u0930\u093e\u092e)/gu, " break "],
    [/(?:\u0915\u093f\u0924\u0928\u093e\s+\u0932\u0902\u092c\u093e|\u0a15\u093f\u0a70\u0a28\u093e\s+\u0a32\u0a70\u092c\u093e)/gu, " how long "],
    [/(?:\u0907\u0a2e\u093e\u0a30\u0924|\u092d\u0935\u0928|\u0a07\u0a2e\u093e\u0a30\u0924|\u0a2c\u093f\u0a32\u0a21\u093f\u0a70\u0a17)/gu, " building "],
    [/(?:\u0939\u092b\u094d\u0924[\u093e\u0947]|\u0939\u092b\u093c\u094d\u0924[\u093e\u0947]|\u0a39\u0a2b\u093c\u0924[\u093e\u0a47]|\u0a39\u092b\u0924[\u093e\u0a47])/gu, " week "],
    [/\u092a\u0922\u093c\u093e\u0924\u093e|\u092a\u0922\u093c\u093e\u0924\u0940|\u092a\u0922\u093c\u093e\u0924\u0947|\u0a2a\u0a5c\u0a4d\u0a39\u093e\u0a09\u0a02\u0a26\u093e|\u0a2a\u0a5c\u0a4d\u0a39\u093e\u0a09\u0a02\u0a26\u0940/gu, " teaches "],
    [/\u092a\u094d\u0930\u094b\u092b\u093c\u093e\u0907\u0932|\u092a\u094d\u0930\u094b\u092b\u093e\u0907\u0932|\u0a2a\u0a4d\u0a30\u0a4b\u0a2b\u093c\u093e\u0a08\u0932/gu, " profile "],
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
    [/(?:विद्यार्थी|छात्र|स्टूडेंट|विद्यार्थी|स्टूडेंट)/gu, " student "], [/(?:विवरण|जानकारी|जाणकारी|वेवरा)/gu, " details "],
    [/(?:उप[- ]?अनुभाग|सबसेक्शन|सबसैकसशन)/gu, " subsection "], [/(?:अनुभाग|सेक्शन|सैकसशन)/gu, " section "],
    [/(?:शाखा|ब्रांच|बरांच)/gu, " branch "], [/(?:पंजीकरण|रजिस्ट्रेशन|रजिसटरेशन)/gu, " registration "],
    [/(?:क्रमांक|सीरियल|सीरयल)/gu, " serial "], [/(?:पुराना|पिछला|पुराणा|पिछला)/gu, " previous "],
    [/(?:मेंटर|मार्गदर्शक|मैटर)/gu, " mentor "], [/(?:फ़ोन|फोन|मोबाइल|फ़ोन|फोन|मोबाईल)/gu, " phone "],
    [/(?:सभी|सारी|पूरी|सारे|सारी|पूरी)/gu, " all "], [/(?:कौन|कौण)/gu, " who "],
    [/(?:मेरा|मेरी|मेरे|मेरा|मेरी|मेरे)/gu, " my "],
    [/(?:का|की|के)/gu, " ka "], [/(?:दा|दी|दे)/gu, " da "],
    [/(?:तारीख|तारीख)/gu, " date "], [/(?:दिन|दिन)/gu, " day "]
  ]);

  function clean(value) {
    return String(value || "").normalize("NFKC").toLowerCase()
      .replace(/[’']/g, "'").replace(/[^\p{L}\p{M}\p{N}%+*/^×÷().:=\-\s]/gu, " ")
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

  function durationLabel(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return [hours ? `${hours} hr` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ") || "0 min";
  }

  function classTypeLabel(type) {
    const value = String(type || "").trim().toUpperCase();
    if (value === "L") return "Lecture";
    if (value === "P") return "Practical";
    if (value === "T") return "Tutorial";
    return value || "Class";
  }

  function classTypeSummary(classes) {
    if (!Array.isArray(classes) || !classes.length) return "";
    const counts = new Map();
    classes.forEach((item) => {
      const key = classTypeLabel(item.type);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].map(([label, count]) => `${count} ${label.toLowerCase()}${count === 1 ? "" : "s"}`).join(", ");
  }

  function unique(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  }

  function teacherNames(value) {
    return String(value || "").split(/\s*,\s*|\s+&\s+/).map((teacher) => teacher.trim())
      .filter((teacher) => teacher && !/not listed/i.test(teacher));
  }

  function validClass(item) {
    return Boolean(item && CALENDAR_DAYS.includes(item.day) && Number.isFinite(item.start) && Number.isFinite(item.end)
      && item.end > item.start && String(item.subject || "").trim());
  }

  function compactClass(item) {
    if (!item || typeof item !== "object") return null;
    const start = Math.round(Number(item.start));
    const end = Math.round(Number(item.end));
    const compact = {
      id: String(item.id || `${item.day}|${start}|${end}|${item.subject}`).slice(0, 240),
      group: String(item.group || "").slice(0, 60),
      day: String(item.day || "").slice(0, 20),
      start, end,
      subject: String(item.subject || "").slice(0, 160),
      teacher: String(item.teacher || "").slice(0, 200),
      room: String(item.room || "").slice(0, 160),
      type: String(item.type || "").slice(0, 8),
      cohorts: String(item.cohorts || "").slice(0, 160)
    };
    return validClass(compact) ? compact : null;
  }

  function chronological(classes) {
    return [...(classes || [])].sort((left, right) =>
      CALENDAR_DAYS.indexOf(left.day) - CALENDAR_DAYS.indexOf(right.day) || left.start - right.start || left.end - right.end);
  }

  function mergeIntervals(intervals) {
    const sorted = (intervals || []).filter((slot) => Number.isFinite(slot.start) && Number.isFinite(slot.end) && slot.end > slot.start)
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const merged = [];
    sorted.forEach((slot) => {
      const last = merged[merged.length - 1];
      if (last && slot.start <= last.end) last.end = Math.max(last.end, slot.end);
      else merged.push({ start: slot.start, end: slot.end });
    });
    return merged;
  }

  function bellSlotList(context) {
    const supplied = Array.isArray(context?.bellSlots) ? context.bellSlots : [];
    const slots = supplied.length ? supplied : DEFAULT_BELL_SLOTS;
    return slots.map((slot) => ({ start: Math.round(Number(slot.start ?? slot[0])), end: Math.round(Number(slot.end ?? slot[1])) }))
      .filter((slot) => Number.isFinite(slot.start) && Number.isFinite(slot.end) && slot.end > slot.start);
  }

  function subtractIntervals(base, blocks) {
    let pieces = base.map((slot) => ({ ...slot }));
    (blocks || []).forEach((block) => {
      const next = [];
      pieces.forEach((piece) => {
        if (block.end <= piece.start || block.start >= piece.end) { next.push(piece); return; }
        if (block.start > piece.start) next.push({ start: piece.start, end: block.start });
        if (block.end < piece.end) next.push({ start: block.end, end: piece.end });
      });
      pieces = next;
    });
    return pieces.filter((piece) => piece.end > piece.start);
  }

  function freeTimetableIntervals(classes, context, mergeAdjacent = false) {
    const occupied = mergeIntervals((classes || []).map((item) => ({ start: item.start, end: item.end })));
    const free = bellSlotList(context).flatMap((slot) => subtractIntervals([slot], occupied));
    if (!mergeAdjacent) return free.sort((left, right) => left.start - right.start);
    return mergeIntervals(free).sort((left, right) => left.start - right.start);
  }

  function internalBreakIntervals(classes) {
    const occupied = mergeIntervals((classes || []).map((item) => ({ start: item.start, end: item.end })));
    const breaks = [];
    for (let index = 1; index < occupied.length; index += 1) {
      const gap = { start: occupied[index - 1].end, end: occupied[index].start };
      if (gap.end > gap.start) breaks.push(gap);
    }
    return breaks;
  }

  function buildingForRoom(room) {
    const value = String(room || "");
    const parenthetical = value.match(/\(([^)]+)\)/);
    if (parenthetical && !/not listed/i.test(parenthetical[1])) return parenthetical[1].replace(/\s+/g, " ").trim();
    if (/workshop/i.test(value)) return "Workshop";
    const words = value.replace(/\(.*\)/, "").trim().split(" ").filter(Boolean);
    const hint = words.find((word) => !/^(?:block|building)$/i.test(word) && word.length >= 2 && /[a-z]/i.test(word) && !/^\d+$/.test(word));
    return hint ? hint.toUpperCase() : "";
  }

  function editDistance(left, right) {
    const a = String(left || ""); const b = String(right || "");
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      previous = current;
    }
    return previous[b.length];
  }

  // Phonetic key (soundex-lite). Generates candidates only — never selects a person.
  function phoneticKey(word) {
    const w = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return "";
    const map = { b: "1", f: "1", p: "1", v: "1", c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2", d: "3", t: "3", l: "4", m: "5", n: "5", r: "6" };
    let out = w[0].toUpperCase();
    let previousCode = map[w[0]] || "";
    for (let index = 1; index < w.length; index += 1) {
      const code = map[w[index]] || "";
      if (code && code !== previousCode) out += code;
      if (w[index] !== "h" && w[index] !== "w") previousCode = code || previousCode;
    }
    return `${out}000`.slice(0, 4);
  }

  function detectLanguage(raw) {
    const text = String(raw || "");
    const gurmukhi = (text.match(/[\u0A00-\u0A7F]/gu) || []).length;
    const devanagari = (text.match(/[\u0900-\u097F]/gu) || []).length;
    if (gurmukhi >= 2 && gurmukhi >= devanagari) return { code: "pa", label: "Punjabi" };
    if (devanagari >= 2) return { code: "hi", label: "Hindi" };
    const hinglish = (text.toLowerCase().match(/\b(?:kya|hai|hain|batao|dikhao|kahan|kahaan|kitne|kitni|mera|meri|mere|kal|aaj|parso|parson|nahi|haan|kaise|konsa|kaun|achha|theek|kithhe|kithe)\b/g) || []).length;
    if (hinglish >= 1) return { code: "hi-L", label: "Hinglish" };
    return { code: "en", label: "English" };
  }

  // ---- Safe arithmetic (recursive descent; no eval, no Function) ----
  const WORD_NUMBERS = Object.freeze({
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
    seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000
  });
  function sanitizeArithmetic(text) {
    let expression = clean(text)
      .replace(/×/g, "*").replace(/÷/g, "/")
      .replace(/\bdivided\s+by\b/g, " / ").replace(/\bdivided\b/g, " / ")
      .replace(/\bmultiplied\s+by\b/g, " * ").replace(/\btimes\b/g, " * ")
      .replace(/\bplus\b/g, " + ").replace(/\bminus\b/g, " - ")
      // Percent rules must run BEFORE mod→% conversion, otherwise "17 mod 5"
      // would be misread as "(17/100) 5". A "%" directly followed by another
      // number stays a modulo operator ("17 % 5"); otherwise it is a percent.
      .replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*/g, "($1/100)*")
      .replace(/(\d+(?:\.\d+)?)\s*%(?!\s*\d)/g, "($1/100)")
      .replace(/\bmod(?:ulus)?\b/g, " % ")
      .replace(new RegExp(`\\b(${Object.keys(WORD_NUMBERS).join("|")})\\b`, "g"), (word) => ` ${WORD_NUMBERS[word]} `)
      .replace(/[a-z]/g, " ");
    expression = expression.replace(/[^0-9+\-*/^%().\s]/g, " ").replace(/\s+/g, " ").trim();
    return /^(?:\d|\()/.test(expression) ? expression : "";
  }

  function evaluateArithmetic(expression) {
    const tokens = String(expression || "").match(/\d+(?:\.\d+)?|[+\-*/^()%]/g) || [];
    let position = 0;
    const peek = () => tokens[position];
    const eat = (token) => { if (tokens[position] === token) { position += 1; return true; } return false; };
    function parsePrimary() {
      if (eat("(")) {
        const value = parseSum();
        if (!eat(")")) throw new Error("paren");
        return value;
      }
      const token = peek();
      if (token === undefined || !/[\d.]/.test(token)) throw new Error("number");
      position += 1;
      return Number(token);
    }
    function parseUnary() {
      if (eat("-")) return -parseUnary();
      if (eat("+")) return parseUnary();
      return parsePrimary();
    }
    function parsePower() {
      const base = parseUnary();
      if (eat("^")) return Math.pow(base, parsePower());
      return base;
    }
    function parseProduct() {
      let value = parsePower();
      while (peek() === "*" || peek() === "/" || peek() === "%") {
        const operator = tokens[position]; position += 1;
        const right = parsePower();
        if ((operator === "/" || operator === "%") && right === 0) throw new Error("div0");
        value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
      }
      return value;
    }
    function parseSum() {
      let value = parseProduct();
      while (peek() === "+" || peek() === "-") {
        const operator = tokens[position]; position += 1;
        const right = parseProduct();
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    }
    const value = parseSum();
    if (position !== tokens.length || !Number.isFinite(value)) throw new Error("invalid");
    return Math.round(value * 1e6) / 1e6;
  }

  // Bounded linear equation solver for "solve 2x + 3 = 11" style input.
  function solveLinearEquation(text) {
    const match = clean(text).match(/(-?\d+(?:\.\d+)?)?\s*x\s*(?:([+-])\s*(\d+(?:\.\d+)?))?\s*=\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const a = Number(match[1] === undefined || match[1] === "" ? 1 : match[1]);
    const sign = match[2] === "-" ? -1 : 1;
    const b = match[3] ? sign * Number(match[3]) : 0;
    const c = Number(match[4]);
    if (!Number.isFinite(a) || a === 0 || !Number.isFinite(c)) return null;
    const solution = Math.round(((c - b) / a) * 1e6) / 1e6;
    return { a, b, c, solution };
  }

  // ---- Calendar engine ----
  function isValidIsoDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!match) return false;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
  }

  function shiftIsoDate(iso, days) {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days));
    return date.toISOString().slice(0, 10);
  }

  function weekdayOfIso(iso) {
    const index = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    return CALENDAR_DAYS[(index + 6) % 7];
  }

  function formatIsoLong(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!match) return "";
    return `${MONTH_NAMES[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
  }

  function formatIsoFull(iso) {
    if (!isValidIsoDate(iso)) return "";
    return `${weekdayOfIso(iso)}, ${formatIsoLong(iso)}`;
  }

  // Symbolic day extraction from an already-normalized question.
  function extractDaySymbol(normalizedQuestion) {
    const q = String(normalizedQuestion || "");
    if (/\b(?:day after tomorrow|kal chhod(?: ke)?|parson?|parso)\b/i.test(q)) return "day_after_tomorrow";
    if (/\byesterday\b/.test(q)) return "yesterday";
    if (/\b(?:tomorrow|kal|agle din)\b/.test(q)) return "tomorrow";
    if (/\b(?:today|aaj)\b/.test(q)) return "today";
    const weekday = CALENDAR_DAYS.find((day) => new RegExp(`\\b${day}\\b`, "i").test(q));
    return weekday || "";
  }

  function resolveDaySymbol(symbol, todayCalendarDay) {
    const todayIndex = CALENDAR_DAYS.indexOf(String(todayCalendarDay || ""));
    if (symbol === "today") return todayIndex >= 0 ? CALENDAR_DAYS[todayIndex] : "";
    if (todayIndex < 0) return CALENDAR_DAYS.includes(symbol) ? symbol : "";
    if (symbol === "tomorrow") return CALENDAR_DAYS[(todayIndex + 1) % 7];
    if (symbol === "day_after_tomorrow") return CALENDAR_DAYS[(todayIndex + 2) % 7];
    if (symbol === "yesterday") return CALENDAR_DAYS[(todayIndex + 6) % 7];
    return CALENDAR_DAYS.includes(symbol) ? symbol : "";
  }

  // --- Route & Rush Logic ---
  const ROOM_LOCATIONS = Object.freeze({
    "G6": "Main Block",
    "G7": "Main Block",
    "Workshop": "Workshop Block",
    "Library": "Library Block",
    "T&P": "T&P Cell",
    "Auditorium": "Main Block"
  });

  function getWalkingTime(room1, room2) {
    const b1 = buildingForRoom(room1) || ROOM_LOCATIONS[room1] || "Main Block";
    const b2 = buildingForRoom(room2) || ROOM_LOCATIONS[room2] || "Main Block";
    if (b1 === b2) return 0;
    if (b1 === "Workshop Block" || b2 === "Workshop Block") return 5;
    if (b1 === "Library Block" || b2 === "Library Block") return 3;
    return 2;
  }


  function nextFutureClass(classes, context) {
    const today = String(context?.now?.day || "");
    const nowMinutes = Number(context?.now?.minutes);
    const todayIndex = CALENDAR_DAYS.indexOf(today);
    if (todayIndex < 0) return chronological(classes)[0] || null;
    const ranked = (classes || []).map((item) => {
      const dayIndex = CALENDAR_DAYS.indexOf(item.day);
      if (dayIndex < 0) return null;
      let distance = (dayIndex - todayIndex + 7) % 7;
      if (distance === 0 && Number.isFinite(nowMinutes) && item.start <= nowMinutes) distance = 7;
      return { item, distance };
    }).filter(Boolean);
    ranked.sort((left, right) => left.distance - right.distance || left.item.start - right.item.start);
    return ranked.length ? ranked[0].item : null;
  }

  function upcomingClasses(classes, context, maximum = 5) {
    const today = String(context?.now?.day || "");
    const nowMinutes = Number(context?.now?.minutes);
    const todayIndex = CALENDAR_DAYS.indexOf(today);
    if (todayIndex < 0) return [];
    const upcoming = [];
    for (let shift = 0; shift <= 7 && upcoming.length < maximum; shift += 1) {
      const day = CALENDAR_DAYS[(todayIndex + shift) % 7];
      const entries = (classes || []).filter((item) => item.day === day && (shift > 0 || !Number.isFinite(nowMinutes) || item.start > nowMinutes))
        .sort((left, right) => left.start - right.start);
      upcoming.push(...entries);
    }
    return upcoming.slice(0, maximum);
  }

  // Official GNDEC List of Holidays Year 2026 — LoH26.pdf (?q=holidays).
  const HOLIDAY_SOURCE = Object.freeze({
    page: "https://gndec.ac.in/?q=holidays",
    pdf: "https://gndec.ac.in/sites/default/files/LoH26.pdf",
    label: "GNDEC List of Holidays Year 2026"
  });
  const OFFICIAL_HOLIDAYS_2026 = Object.freeze([
    { date: "2026-01-26", month: 0, day: "Monday", name: "Republic Day", nameHi: "गणतंत्र दिवस", namePa: "ਗਣਤੰਤਰ ਦਿਵਸ", type: "National", closed: true, description: "National holiday." },
    { date: "2026-02-01", month: 1, day: "Sunday", name: "Birthday Sri Guru Ravidass Ji", nameHi: "श्री गुरु रविदास जयंती", namePa: "ਸ੍ਰੀ ਗੁਰੂ ਰਵਿਦਾਸ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-02-15", month: 1, day: "Sunday", name: "Maha Shivratri", nameHi: "महाशिवरात्रि", namePa: "ਮਹਾ ਸ਼ਿਵਰਾਤਰੀ", type: "Gazetted", closed: true, description: "Gazetted festival holiday." },
    { date: "2026-03-04", month: 2, day: "Wednesday", name: "Holi", nameHi: "होली", namePa: "ਹੋਲੀ", type: "Gazetted", closed: true, description: "Festival of colours." },
    { date: "2026-03-21", month: 2, day: "Saturday", name: "Id-Ul-Fiter", nameHi: "ईद-उल-फ़ित्र", namePa: "ਈਦ-ਉਲ-ਫਿਤਰ", type: "Gazetted", closed: true, description: "Gazetted religious holiday." },
    { date: "2026-03-23", month: 2, day: "Monday", name: "Martyrdom Day of Shaheed-e-Azam Bhagat Singh, Sukhdev and Rajguru Ji", nameHi: "शहीदी दिवस", namePa: "ਸ਼ਹੀਦੀ ਦਿਵਸ", type: "Gazetted", closed: true, description: "State holiday commemorating the martyrs." },
    { date: "2026-03-26", month: 2, day: "Thursday", name: "Ram Navmi", nameHi: "राम नवमी", namePa: "ਰਾਮ ਨਵਮੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-03-30", month: 2, day: "Monday", name: "Nagar Kirtan (Mahavir Jayanti)", nameHi: "नगर कीर्तन", namePa: "ਨਗਰ ਕੀਰਤਨ", type: "Half-day", closed: false, description: "Second half-day holiday to join Nagar Kirtan." },
    { date: "2026-03-31", month: 2, day: "Tuesday", name: "Mahavir Jayanti", nameHi: "महावीर जयंती", namePa: "ਮਹਾਵੀਰ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-04-03", month: 3, day: "Friday", name: "Good Friday", nameHi: "गुड फ्राइडे", namePa: "ਗੁੱਡ ਫਰਾਈਡੇ", type: "Gazetted", closed: true, description: "Gazetted Christian holiday." },
    { date: "2026-04-14", month: 3, day: "Tuesday", name: "Baisakhi & Birthday Dr. B.R. Ambedkar", nameHi: "बैसाखी और डॉ. बी.आर. अम्बेडकर जयंती", namePa: "ਵਿਸਾਖੀ ਅਤੇ ਡਾ. ਬੀ.ਆਰ. ਅੰਬੇਡਕਰ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Baisakhi and Birthday of Dr. B.R. Ambedkar." },
    { date: "2026-04-19", month: 3, day: "Sunday", name: "Bhagwan Parshu Ram Janam Utsav", nameHi: "भगवान परशुराम जन्म उत्सव", namePa: "ਭਗਵਾਨ ਪਰਸ਼ੂਰਾਮ ਜਨਮ ਉਤਸਵ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-05-01", month: 4, day: "Friday", name: "May Diwas", nameHi: "मई दिवस", namePa: "ਮਈ ਦਿਵਸ", type: "Gazetted", closed: true, description: "May Day / Labour Day." },
    { date: "2026-05-27", month: 4, day: "Wednesday", name: "Id-ul-Juha (Bakreed)", nameHi: "बकरीद", namePa: "ਬਕਰੀਦ", type: "Gazetted", closed: true, description: "Gazetted Islamic festival." },
    { date: "2026-06-17", month: 5, day: "Wednesday", name: "Nagar Kirtan (Sri Guru Arjan Dev Ji)", nameHi: "नगर कीर्तन", namePa: "ਨਗਰ ਕੀਰਤਨ", type: "Half-day", closed: false, description: "Second half-day holiday to join Nagar Kirtan." },
    { date: "2026-06-18", month: 5, day: "Thursday", name: "Martyrdom Day of Sri Guru Arjan Dev JI", nameHi: "गुरु अर्जुन देव जी शहीदी दिवस", namePa: "ਗੁਰੂ ਅਰਜਨ ਦੇਵ ਜੀ ਸ਼ਹੀਦੀ ਦਿਹਾੜਾ", type: "Gazetted", closed: true, description: "Commemoration of the 5th Sikh Guru." },
    { date: "2026-06-29", month: 5, day: "Monday", name: "Kabir Jayanti", nameHi: "कबीर जयंती", namePa: "ਕਬੀਰ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-07-31", month: 6, day: "Friday", name: "Martyrdom Day Shaheed Udham Singh Ji", nameHi: "शहीद उधम सिंह शहीदी दिवस", namePa: "ਸ਼ਹੀਦ ਊਧਮ ਸਿੰਘ ਸ਼ਹੀਦੀ ਦਿਹਾੜਾ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-08-15", month: 7, day: "Saturday", name: "Independence Day", nameHi: "स्वतंत्रता दिवस", namePa: "ਸੁਤੰਤਰਤਾ ਦਿਵਸ", type: "National", closed: true, description: "National Independence Day of India." },
    { date: "2026-09-03", month: 8, day: "Thursday", name: "Nagar Kirtan (Janam Ashtami)", nameHi: "नगर कीर्तन", namePa: "ਨਗਰ ਕੀਰਤਨ", type: "Half-day", closed: false, description: "Second half-day holiday to join Nagar Kirtan." },
    { date: "2026-09-04", month: 8, day: "Friday", name: "Janam Ashtami", nameHi: "जन्माष्टमी", namePa: "ਜਨਮ ਅਸ਼ਟਮੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-10-02", month: 9, day: "Friday", name: "Birthday Mahatma Gandhi Ji", nameHi: "गांधी जयंती", namePa: "ਗਾਂਧੀ ਜੈਅੰਤੀ", type: "National", closed: true, description: "Birth anniversary of Mahatma Gandhi." },
    { date: "2026-10-11", month: 9, day: "Sunday", name: "Maharaj Aggarsain Jayanti", nameHi: "महाराज अग्रसेन जयंती", namePa: "ਮਹਾਰਾਜ ਅਗਰਸੈਨ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-10-20", month: 9, day: "Tuesday", name: "Dussehra", nameHi: "दशहरा", namePa: "ਦੁਸਹਿਰਾ", type: "Gazetted", closed: true, description: "Victory of good over evil." },
    { date: "2026-10-26", month: 9, day: "Monday", name: "Birthday Maharishi Balmiki Ji", nameHi: "महर्षि वाल्मीकि जयंती", namePa: "ਮਹਾਰਿਸ਼ੀ ਵਾਲਮੀਕਿ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-10-27", month: 9, day: "Tuesday", name: "Parkash Gurparab Sri Guru Ram Dass Sahib Ji", nameHi: "गुरु राम दास जी प्रकाश पर्व", namePa: "ਸ੍ਰੀ ਗੁਰੂ ਰਾਮ ਦਾਸ ਜੀ ਪ੍ਰਕਾਸ਼ ਪੁਰਬ", type: "Restricted", closed: false, description: "Restricted holiday." },
    { date: "2026-11-08", month: 10, day: "Sunday", name: "Diwali", nameHi: "दीवाली", namePa: "ਦੀਵਾਲੀ", type: "Gazetted", closed: true, description: "Festival of lights." },
    { date: "2026-11-09", month: 10, day: "Monday", name: "Vishwakarma Day", nameHi: "विश्वकर्मा दिवस", namePa: "ਵਿਸ਼ਵਕਰਮਾ ਦਿਵਸ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-11-11", month: 10, day: "Wednesday", name: "Gurgaddi Diwas Sri Guru Granth Sahib Ji", nameHi: "गुरु ग्रंथ साहिब गुरुगद्दी दिवस", namePa: "ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ ਗੁਰਗੱਦੀ ਦਿਵਸ", type: "Restricted", closed: false, description: "Restricted holiday." },
    { date: "2026-11-16", month: 10, day: "Monday", name: "Martyrdom Day of S. Kartar Singh Sarabha Ji", nameHi: "शहीद करतार सिंह सराभा शहीदी दिवस", namePa: "ਸ਼ਹੀਦ ਕਰਤਾਰ ਸਿੰਘ ਸਰਾਭਾ ਸ਼ਹੀਦੀ ਦਿਹਾੜਾ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-11-23", month: 10, day: "Monday", name: "Nagar Kirtan (Sri Guru Nanak Dev Ji)", nameHi: "नगर कीर्तन", namePa: "ਨਗਰ ਕੀਰਤਨ", type: "Half-day", closed: false, description: "Second half-day holiday to join Nagar Kirtan." },
    { date: "2026-11-24", month: 10, day: "Tuesday", name: "Birthday Sri Guru Nanak Dev Sahib Ji", nameHi: "गुरु नानक जयंती", namePa: "ਗੁਰੂ नानਕ ਦੇਵ ਜੀ ਪ੍ਰਕਾਸ਼ ਪੁਰਬ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-12-14", month: 11, day: "Monday", name: "Martyrdom Day of Sri Guru Teg Bahadur Ji", nameHi: "गुरु तेग बहादुर शहीदी दिवस", namePa: "ਗੁਰੂ ਤੇਗ ਬਹਾਦਰ ਜੀ ਸ਼ਹੀਦੀ ਦਿਹਾੜਾ", type: "Gazetted", closed: true, description: "Commemoration of the 9th Sikh Guru." },
    { date: "2026-12-25", month: 11, day: "Friday", name: "Christmas Day", nameHi: "क्रिसमस", namePa: "ਕ੍ਰਿਸਮਿਸ", type: "Gazetted", closed: true, description: "Christmas celebration." },
    { date: "2026-12-28", month: 11, day: "Monday", name: "Shaheedi Sabha Fatehgarh Sahib", nameHi: "शहीदी सभा फतेहगढ़ साहिब", namePa: "ਸ਼ਹੀਦੀ ਸਭਾ ਫਤਹਿਗੜ੍ਹ ਸਾਹਿਬ", type: "Gazetted", closed: true, description: "Gazetted holiday." }
  ]);

  function officialHolidayEntries() {
    // The source lists Baisakhi and Dr. B. R. Ambedkar's birthday as two
    // entries on 14 April. Older bundled data combined them, so expand that
    // historic representation before any answer, count, or search uses it.
    return OFFICIAL_HOLIDAYS_2026.flatMap((holiday) => holiday.name === "Baisakhi & Birthday Dr. B.R. Ambedkar"
      ? [
        { ...holiday, name: "Baisakhi", description: "Gazetted holiday." },
        { ...holiday, name: "Birthday Dr. B.R. Ambedkar", description: "Gazetted holiday." }
      ]
      : [holiday]);
  }

  function isHalfDayNotice(holiday) {
    return String(holiday?.type || "").toLowerCase() === "half-day";
  }

  function officialHolidayFilter(holiday, includeRestricted = true, includeHalfDayNotices = false) {
    if (!includeHalfDayNotices && isHalfDayNotice(holiday)) return false;
    if (!includeRestricted && String(holiday?.type || "").toLowerCase() === "restricted") return false;
    return true;
  }

  // A second-half-day notice is important, but it is not a whole holiday.
  // Keep it separate from normal counts/lists so it cannot be called
  // "Restricted" or interpreted as an all-day closure.
  function getHolidaysForYear(year = 2026, includeRestricted = true, includeHalfDayNotices = false) {
    return officialHolidayEntries().filter((h) => Number(h.date.slice(0, 4)) === Number(year) && officialHolidayFilter(h, includeRestricted, includeHalfDayNotices));
  }

  function getHolidaysForMonth(monthIndex, year = 2026, includeRestricted = true, includeHalfDayNotices = false) {
    const numericMonth = Number(monthIndex);
    return officialHolidayEntries().filter((h) => h.month === numericMonth && Number(h.date.slice(0, 4)) === Number(year) && officialHolidayFilter(h, includeRestricted, includeHalfDayNotices));
  }

  function getHolidayNoticesForYear(year = 2026) {
    return officialHolidayEntries().filter((h) => Number(h.date.slice(0, 4)) === Number(year) && isHalfDayNotice(h));
  }

  function getHolidayNoticesForMonth(monthIndex, year = 2026) {
    const numericMonth = Number(monthIndex);
    return officialHolidayEntries().filter((h) => h.month === numericMonth && Number(h.date.slice(0, 4)) === Number(year) && isHalfDayNotice(h));
  }

  function checkDateHoliday(isoDate) {
    if (!isValidIsoDate(isoDate)) return null;
    const match = officialHolidayEntries().find((h) => h.date === isoDate);
    return match || null;
  }

  function isHolidayDate(isoDate) {
    return Boolean(checkDateHoliday(isoDate));
  }

  function getNextHoliday(currentIsoDate, includeRestricted = true, includeHalfDayNotices = false) {
    const base = isValidIsoDate(currentIsoDate) ? currentIsoDate : new Date().toISOString().slice(0, 10);
    const future = officialHolidayEntries().filter((h) => h.date >= base && officialHolidayFilter(h, includeRestricted, includeHalfDayNotices)).sort((a, b) => a.date.localeCompare(b.date));
    return future[0] || null;
  }

  function getHolidayByName(keyword) {
    const q = normalizeHolidayLookup(keyword);
    if (!q) return null;
    const direct = officialHolidayEntries().find((h) => {
      return [h.name, h.nameHi, h.namePa].some((name) => normalizeHolidayLookup(name) === q);
    });
    if (direct) return direct;
    const matches = searchHolidays(keyword);
    return matches.length ? matches[0] : null;
  }

  function getHolidayStats(year = 2026) {
    const list = getHolidaysForYear(year, true);
    const national = list.filter((h) => h.type === "National").length;
    const gazetted = list.filter((h) => h.type === "Gazetted").length;
    const restricted = list.filter((h) => h.type === "Restricted").length;
    return { total: list.length, national, gazetted, restricted, totalMandatory: national + gazetted };
  }

  const HOLIDAY_LOOKUP_STOP_WORDS = new Set([
    "a", "about", "all", "an", "and", "calendar", "college", "date", "day", "days",
    "festival", "for", "gndec", "hai", "holiday", "holidays", "in", "is", "ka", "ki",
    "ko", "list", "me", "of", "official", "on", "please", "show", "tell", "the", "this",
    "what", "when", "which", "year", "gazetted", "restricted", "birthday", "martyrdom", "sri", "ji"
  ]);

  function normalizeHolidayLookup(value) {
    return clean(value)
      .replace(/\bjanmashtami\b|\bjanamastami\b/g, "janam ashtami")
      .replace(/\bvaisakhi\b/g, "baisakhi")
      .replace(/\beid\b/g, "id")
      .replace(/\bfitr\b/g, "fiter")
      .replace(/\bbakrid\b/g, "bakreed")
      .replace(/\bravidas\b/g, "ravidass")
      .replace(/\bvalmiki\b/g, "balmiki")
      .replace(/\bparshuram\b/g, "parshu ram")
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function searchHolidays(keyword) {
    const q = normalizeHolidayLookup(keyword);
    if (!q) return [];
    const queryTerms = q.split(" ").filter((term) => term.length >= 3 && !HOLIDAY_LOOKUP_STOP_WORDS.has(term));
    if (!queryTerms.length) return [];
    const paddedQuery = ` ${q} `;
    return officialHolidayEntries().map((holiday, index) => {
      const names = [holiday.name, holiday.nameHi, holiday.namePa].map(normalizeHolidayLookup).filter(Boolean);
      const searchable = normalizeHolidayLookup(`${holiday.name} ${holiday.nameHi || ""} ${holiday.namePa || ""}`);
      const matchedTerms = queryTerms.filter((term) => searchable.includes(term));
      if (!matchedTerms.length || (queryTerms.length > 1 && matchedTerms.length < queryTerms.length)) return null;
      const exactName = names.some((name) => q === name);
      const completeNameInQuestion = names.some((name) => name.length >= 4 && paddedQuery.includes(` ${name} `));
      const questionInName = names.some((name) => q.length >= 4 && (` ${name} `).includes(` ${q} `));
      const score = (exactName ? 10000 : 0)
        + (completeNameInQuestion ? 8000 : 0)
        + (questionInName ? 4000 : 0)
        + (matchedTerms.length * 100)
        + queryTerms.reduce((sum, term) => sum + term.length, 0)
        - (isHalfDayNotice(holiday) ? 1 : 0);
      return { holiday, score, index };
    }).filter(Boolean)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map((item) => item.holiday);
  }

  // ---- GNDEC Autonomous / IKGPTU Grading & CGPA Engine ----
  const GRADE_POINTS = Object.freeze({
    "O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "P": 4, "F": 0,
    "10": 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "0": 0
  });

  function evaluateCgpa(entries) {
    if (!Array.isArray(entries) || !entries.length) return null;
    let totalCreditPoints = 0;
    let totalCredits = 0;
    for (const item of entries) {
      const credits = Number(item.credits || item.c || 0);
      const gradeStr = String(item.grade || item.g || "").trim().toUpperCase();
      const point = GRADE_POINTS[gradeStr];
      if (!Number.isFinite(credits) || credits <= 0 || point === undefined) return null;
      totalCreditPoints += credits * point;
      totalCredits += credits;
    }
    if (totalCredits <= 0) return null;
    const cgpa = Math.round((totalCreditPoints / totalCredits) * 100) / 100;
    const percentage = Math.round(cgpa * 9.5 * 100) / 100;
    return { cgpa, totalCredits, totalCreditPoints, percentage };
  }

  function cgpaToPercentage(cgpa) {
    const val = Number(cgpa);
    if (!Number.isFinite(val) || val < 0 || val > 10) return null;
    return Math.round(val * 9.5 * 100) / 100;
  }

  function percentageToCgpa(percentage) {
    const val = Number(percentage);
    if (!Number.isFinite(val) || val < 0 || val > 100) return null;
    return Math.round((val / 9.5) * 100) / 100;
  }

  // ---- Bounded dialogue memory ----
  function createMemory(previous) {
    const safe = previous && typeof previous === "object" ? previous : {};
    return {
      activeSubject: String(safe.activeSubject || "").slice(0, 120),
      activeTeacher: String(safe.activeTeacher || "").slice(0, 160),
      activeRoom: String(safe.activeRoom || "").slice(0, 160),
      activeDay: CALENDAR_DAYS.includes(safe.activeDay) ? safe.activeDay : "",
      activeClassId: String(safe.activeClassId || "").slice(0, 240),
      previousClassId: String(safe.previousClassId || "").slice(0, 240),
      lastIntent: String(safe.lastIntent || "").slice(0, 48),
      revision: String(safe.revision || "").slice(0, 120),
      turnCount: Number.isFinite(safe.turnCount) ? Math.max(0, Math.floor(safe.turnCount)) : 0,
      comparison: safe.comparison && typeof safe.comparison === "object"
        ? { left: String(safe.comparison.left || safe.comparison.a || "").slice(0, 60), right: String(safe.comparison.right || safe.comparison.b || "").slice(0, 60), subject: String(safe.comparison.subject || "").slice(0, 160), sourceVersion: String(safe.comparison.sourceVersion || "").slice(0, 120) }
        : null,
      pending: safe.pending && typeof safe.pending === "object" && Array.isArray(safe.pending.candidates)
        ? { kind: String(safe.pending.kind || "").slice(0, 40), candidates: safe.pending.candidates.slice(0, LIMITS.candidates), turn: Number.isFinite(safe.pending.turn) ? safe.pending.turn : 0 }
        : null,
      recentTurns: Array.isArray(safe.recentTurns) ? safe.recentTurns.slice(-(LIMITS.recentTurns - 1)) : []
    };
  }

  function updateMemory(previous, patch, question, intent, revision = "") {
    const memory = createMemory(previous);
    const has = (key) => Object.prototype.hasOwnProperty.call(patch || {}, key);
    const text = (key, maximum) => String(has(key) ? (patch[key] || "") : memory[key]).slice(0, maximum);
    const recentTurns = memory.recentTurns.slice(-(LIMITS.recentTurns - 1));
    recentTurns.push({ query: normalize(question).slice(0, 160), intent: String(intent || "").slice(0, 48) });
    const requestedDay = has("activeDay") ? patch.activeDay : memory.activeDay;
    // Pending clarifications expire by absolute turn count so the capped
    // recent-turns buffer can never freeze their TTL.
    const turnCount = memory.turnCount + 1;
    let pending = has("pending") ? (patch.pending || null) : memory.pending;
    if (pending && turnCount - (Number(pending.turn) || 0) > LIMITS.pendingTurns) pending = null;
    // Source-aware memory: pending clarifications and remembered comparisons
    // are facts about a specific official data revision. When the app reports
    // a different datasetVersion, they must never be reused — the roster or
    // timetable may have changed underneath them.
    const nextRevision = String(revision || "").slice(0, 120);
    if (memory.revision && nextRevision && memory.revision !== nextRevision) {
      // Facts remembered under the old revision are no longer trustworthy.
      // A comparison supplied in this very patch was computed against the
      // new revision, so it survives.
      pending = null;
      if (!has("comparison")) patch.comparison = null;
    }
    return {
      activeSubject: text("activeSubject", 120),
      activeTeacher: text("activeTeacher", 160),
      activeRoom: text("activeRoom", 160),
      activeDay: CALENDAR_DAYS.includes(requestedDay) ? requestedDay : "",
      activeClassId: text("activeClassId", 240),
      previousClassId: text("previousClassId", 240),
      lastIntent: String(intent || memory.lastIntent || "").slice(0, 48),
      revision: String(revision || memory.revision || "").slice(0, 120),
      turnCount,
      comparison: has("comparison") ? (patch.comparison || null) : memory.comparison,
      pending,
      recentTurns
    };
  }

  // ---- Result factory + validation (mirrors the Brain 2 contract) ----
  function result(intent, confidence, answer, facts = [], plan = [], contextPatch = {}) {
    return {
      handled: true,
      verified: true,
      intent: String(intent || "").slice(0, 48),
      confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
      answer: String(answer || ""),
      facts: Array.isArray(facts) ? facts.slice(0, 24) : (facts && typeof facts === "object" ? facts : []),
      plan: (Array.isArray(plan) ? plan : []).map((step) => String(step).slice(0, 80)).slice(0, LIMITS.planSteps),
      contextPatch,
      processingMs: 0,
      version: ""
    };
  }

  function failure(reason) {
    return { handled: false, verified: false, confidence: 0, answer: "", facts: [], plan: [], fallbackReason: reason };
  }

  function validateShape(candidate, minimumConfidence = 0.82) {
    if (!candidate || typeof candidate !== "object") return { accepted: false, reason: "INVALID_RESULT" };
    if (!candidate.handled) return { accepted: false, reason: "UNSUPPORTED_INTENT" };
    if (!candidate.verified) return { accepted: false, reason: "VERIFICATION_FAILED" };
    if (!Number.isFinite(candidate.confidence) || candidate.confidence < minimumConfidence) return { accepted: false, reason: "LOW_CONFIDENCE" };
    if (typeof candidate.answer !== "string" || !candidate.answer.trim() || candidate.answer.length > LIMITS.answer) return { accepted: false, reason: "INVALID_RESULT" };
    if (!Array.isArray(candidate.plan) || candidate.plan.length > LIMITS.planSteps) return { accepted: false, reason: "INVALID_RESULT" };
    if (/<\s*\/?\s*(?:script|iframe|object|embed|style|form|input|textarea|select|video|audio|meta|link)\b/i.test(candidate.answer)
      || /\son[a-z]+\s*=|javascript\s*:/i.test(candidate.answer)
      || /\bNaN\b|\[object Object\]/.test(candidate.answer)) return { accepted: false, reason: "VERIFICATION_FAILED" };
    return { accepted: true, reason: "" };
  }

  // ---- Metrics (privacy-safe counters only, never query text) ----
  function createMetrics() {
    return { processed: 0, handled: 0, fallback: 0, totalProcessingMs: 0, maxProcessingMs: 0, intents: Object.create(null), fallbackReasons: Object.create(null), languages: Object.create(null) };
  }

  function recordMetric(metrics, outcome) {
    metrics.processed += 1;
    if (outcome.handled) {
      metrics.handled += 1;
      const intent = String(outcome.intent || "UNKNOWN").slice(0, 48);
      metrics.intents[intent] = (metrics.intents[intent] || 0) + 1;
      const language = String(outcome.language || "en").slice(0, 8);
      metrics.languages[language] = (metrics.languages[language] || 0) + 1;
    } else {
      metrics.fallback += 1;
      const reason = String(outcome.fallbackReason || "UNKNOWN").slice(0, 48);
      metrics.fallbackReasons[reason] = (metrics.fallbackReasons[reason] || 0) + 1;
    }
    const ms = Math.max(0, Math.round(Number(outcome.processingMs) || 0));
    metrics.totalProcessingMs += ms;
    metrics.maxProcessingMs = Math.max(metrics.maxProcessingMs, ms);
  }

  function metricsSnapshot(metrics) {
    return JSON.parse(JSON.stringify({
      processed: metrics.processed,
      handled: metrics.handled,
      fallback: metrics.fallback,
      averageProcessingMs: metrics.processed ? Math.round(metrics.totalProcessingMs / metrics.processed) : 0,
      maxProcessingMs: metrics.maxProcessingMs,
      intents: { ...metrics.intents },
      fallbackReasons: { ...metrics.fallbackReasons },
      languages: { ...metrics.languages }
    }));
  }

  // ---- Typo-tolerant suggestion ranking ----
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
        else if (queryWord.length >= 4 && editDistance(queryWord, valueWord) <= (queryWord.length >= 7 ? 2 : 1)) best = Math.max(best, 34);
      });
      if (!best) return -1;
      score += best;
    }
    return score + (queryWords.length > 1 ? 120 : 0) - Math.min(40, value.length / 3) - ordinalPenalty;
  }

  function rankSuggestions(pool, query, limit = 8) {
    const seen = new Set();
    return pool
      .map((candidate, index) => ({ candidate, index, score: suggestionScore(candidate, query) }))
      .filter((item) => {
        if (item.score < 0 || seen.has(item.candidate)) return false;
        seen.add(item.candidate);
        return true;
      })
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, limit)
      .map((item) => item.candidate);
  }

  // ---- Person-name helpers (search tier inputs; never auto-select) ----
  const PERSON_TITLE_PATTERN = /^(?:dr|er|prof|professor|mr|mrs|ms|miss)s?\.?$/i;
  const PERSON_STOPWORDS = new Set([
    "find", "search", "lookup", "look", "show", "give", "tell", "get", "check", "details", "detail", "info", "information",
    "about", "for", "of", "the", "and", "from", "with", "into", "this", "that", "there", "here",
    "me", "my", "please", "compass", "student", "students", "faculty", "teacher", "teachers", "professor", "lecturer",
    "who", "is", "was", "are", "kaun", "hai", "hain", "ka", "ki", "ke", "ko", "ka", "da", "di", "de",
    "dhundo", "khojo", "labho", "name", "record", "records", "roster", "directory", "branch", "section", "subsection",
    "all", "list", "his", "her", "their", "him", "them",
    // Conversational words must never be mistaken for personal names.
    "how", "what", "when", "where", "why", "which", "you", "your", "yours", "am", "were", "be", "been",
    "do", "does", "did", "can", "could", "should", "would", "will", "shall", "may", "might", "must",
    "have", "has", "had", "hello", "hey", "hi", "thanks", "thank", "bye", "goodbye", "welcome", "sorry",
    "ok", "okay", "yes", "no", "yeah", "nah", "bro", "dude", "sis", "sir", "madam",
    "good", "morning", "evening", "afternoon", "night", "today", "tomorrow", "yesterday",
    "parso", "parson", "kal", "aaj", "week", "month", "year", "date", "time", "day",
    "class", "classes", "lecture", "lectures", "period", "periods", "room", "rooms",
    "subject", "subjects", "syllabus", "exam", "exams", "college", "campus", "gndec",
    "free", "busy", "next", "first", "last", "break", "mentor", "timetable", "schedule",
    "holiday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "detail", "full", "complete", "entire", "whole", "profile", "photo", "email", "phone",
    "qualification", "qualifications", "designation", "department", "experience",
    "publication", "publications", "venue", "contact", "every", "any"
  ]);

  function extractPersonName(raw) {
    const tokens = clean(raw).split(" ").filter(Boolean);
    const kept = [];
    for (const token of tokens) {
      if (PERSON_TITLE_PATTERN.test(token)) continue;
      if (PERSON_STOPWORDS.has(token)) continue;
      if (/^\d/.test(token)) continue;
      if (token.length < 3) continue;
      kept.push(token);
      if (kept.length >= 4) break;
    }
    if (!kept.length || kept.length > 4) return "";
    return kept.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(" ");
  }

  function looksLikeBarePersonName(raw) {
    const tokens = clean(raw).split(" ").filter(Boolean);
    if (tokens.length < 2 || tokens.length > 3) return false;
    // Person-name heuristics are Latin-script only. Gurmukhi/Devanagari
    // timetable words ("ਅੱਜ ਖਾਲੀ ਲੈਕਚਰ") must never become a person query.
    if (/[\u0900-\u097F\u0A00-\u0A7F]/.test(raw)) return false;
    return tokens.every((token) => token.length >= 3 && /^\p{L}/u.test(token) && !PERSON_STOPWORDS.has(token));
  }

  function titleCaseName(value) {
    return String(value || "").trim().split(/\s+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  }

  function stripTitles(value) {
    return String(value || "").split(/\s+/).filter((word) => !PERSON_TITLE_PATTERN.test(word)).join(" ").trim();
  }

  function ordinalIndex(normalizedQuestion) {
    const q = String(normalizedQuestion || "");
    if (/^(?:1|first|1st|pehla|pehli|pahla)\b/.test(q)) return 1;
    if (/^(?:2|second|2nd|dusra|dusri|duja)\b/.test(q)) return 2;
    if (/^(?:3|third|3rd|tija|tiha)\b/.test(q)) return 3;
    if (/^(?:4|fourth|4th|chautha)\b/.test(q)) return 4;
    if (/^(?:5|fifth|5th|panjva)\b/.test(q)) return 5;
    if (/^(?:6|sixth|6th)\b/.test(q)) return 6;
    return 0;
  }

  function evaluateAttendance({ attended, total, target = 76 }) {
    attended = Math.max(0, Number(attended) || 0);
    total = Math.max(0, Number(total) || 0);
    target = Math.min(99, Math.max(50, Number(target) || 76));
    if (total <= 0) return { valid: false, error: "Total lectures must be greater than 0." };
    if (attended > total) return { valid: false, error: "Attended lectures cannot exceed total lectures." };
    const currentPct = Math.round((attended / total) * 10000) / 100;
    const targetFraction = target / 100;
    if (currentPct >= target) {
      const safeBunks = Math.floor((attended - targetFraction * total) / targetFraction);
      const afterPct = safeBunks > 0 ? Math.round((attended / (total + safeBunks)) * 10000) / 100 : currentPct;
      return {
        valid: true,
        attended,
        total,
        currentPct,
        target,
        status: "safe",
        bunksAllowed: safeBunks,
        afterBunkPct: afterPct
      };
    } else {
      const needed = Math.ceil((targetFraction * total - attended) / (1 - targetFraction));
      const afterPct = Math.round(((attended + needed) / (total + needed)) * 10000) / 100;
      return {
        valid: true,
        attended,
        total,
        currentPct,
        target,
        status: "shortage",
        classesNeeded: needed,
        afterAttendPct: afterPct
      };
    }
  }

  const CAMPUS_ROOM_DIRECTORY = Object.freeze({
    g1: { name: "Room G1", block: "Civil & Applied Sciences Block", floor: "Ground Floor", landmark: "Near East Entrance, adjacent to G2" },
    g2: { name: "Room G2", block: "Civil & Applied Sciences Block", floor: "Ground Floor", landmark: "East Corridor, Ground Floor" },
    g3: { name: "Room G3", block: "Civil & Applied Sciences Block", floor: "Ground Floor", landmark: "East Corridor, Ground Floor" },
    g4: { name: "Room G4", block: "Civil & Applied Sciences Block", floor: "Ground Floor", landmark: "Opposite Physics Lab" },
    g5: { name: "Room G5", block: "Civil & Applied Sciences Block", floor: "Ground Floor", landmark: "Central Courtyard Wing" },
    g6: { name: "Room G6", block: "Civil & Applied Sciences Block", floor: "Ground Floor", landmark: "Opposite Department Notice Board" },
    g7: { name: "Room G7", block: "Civil & Applied Sciences Block", floor: "Ground Floor", landmark: "Near Applied Sciences Faculty Room" },
    g8: { name: "Room G8", block: "Civil & Applied Sciences Block", floor: "1st Floor", landmark: "Staircase A, 1st Floor Hall" },
    g9: { name: "Room G9", block: "Civil & Applied Sciences Block", floor: "1st Floor", landmark: "1st Floor East Wing" },
    g10: { name: "Room G10", block: "Civil & Applied Sciences Block", floor: "1st Floor", landmark: "Near Chemistry Lab" },
    g11: { name: "Room G11", block: "Civil & Applied Sciences Block", floor: "2nd Floor", landmark: "Top Floor Lecture Hall" },
    g12: { name: "Room G12", block: "Civil & Applied Sciences Block", floor: "2nd Floor", landmark: "Top Floor Lecture Hall" },
    a1: { name: "Room A1", block: "Consultancy & MBA Block (A-Block)", floor: "Ground Floor", landmark: "Near Central Library lawn" },
    a2: { name: "Room A2", block: "Consultancy & MBA Block (A-Block)", floor: "Ground Floor", landmark: "Ground Floor Hall" },
    a3: { name: "Room A3", block: "Consultancy & MBA Block (A-Block)", floor: "Ground Floor", landmark: "Ground Floor Hall" },
    a4: { name: "Room A4", block: "Consultancy & MBA Block (A-Block)", floor: "1st Floor", landmark: "1st Floor Main Corridor" },
    a5: { name: "Room A5", block: "Consultancy & MBA Block (A-Block)", floor: "1st Floor", landmark: "1st Floor Wing" },
    a6: { name: "Room A6", block: "Consultancy & MBA Block (A-Block)", floor: "1st Floor", landmark: "1st Floor Seminar Hall" },
    a7: { name: "Room A7", block: "Consultancy & MBA Block (A-Block)", floor: "2nd Floor", landmark: "2nd Floor Lecture Room" },
    a8: { name: "Room A8", block: "Consultancy & MBA Block (A-Block)", floor: "2nd Floor", landmark: "2nd Floor Lecture Room" },
    a9: { name: "Room A9", block: "Consultancy & MBA Block (A-Block)", floor: "2nd Floor", landmark: "2nd Floor Corner Room" },
    m1: { name: "Room M1", block: "Mechanical Engineering Block", floor: "Ground Floor", landmark: "Ground Floor ME Corridor" },
    m2: { name: "Room M2", block: "Mechanical Engineering Block", floor: "Ground Floor", landmark: "Near ME HOD Office" },
    m3: { name: "Room M3", block: "Mechanical Engineering Block", floor: "1st Floor", landmark: "1st Floor ME Wing" },
    m4: { name: "Room M4", block: "Mechanical Engineering Block", floor: "1st Floor", landmark: "1st Floor ME Wing" },
    ee1: { name: "Room EE1", block: "Electrical Engineering Block", floor: "Ground Floor", landmark: "Ground Floor EE Wing" },
    ee2: { name: "Room EE2", block: "Electrical Engineering Block", floor: "Ground Floor", landmark: "Near Electrical Machines Lab" },
    ee3: { name: "Room EE3", block: "Electrical Engineering Block", floor: "1st Floor", landmark: "1st Floor EE Wing" },
    ece1: { name: "Room ECE1", block: "Electronics & Communication Block", floor: "Ground Floor", landmark: "Ground Floor ECE Wing" },
    ece2: { name: "Room ECE2", block: "Electronics & Communication Block", floor: "1st Floor", landmark: "Near VLSI & DSP Labs" },
    "physics lab": { name: "Physics Laboratory", block: "Civil & Applied Sciences Block", floor: "Ground Floor", landmark: "Opposite Room G4" },
    "chemistry lab": { name: "Chemistry Laboratory", block: "Civil & Applied Sciences Block", floor: "1st Floor", landmark: "Adjacent to Room G10" },
    workshop: { name: "Central Mechanical Workshop", block: "Workshop Block", floor: "Ground Floor", landmark: "Machine Shop, Foundry, Fitting & Smithy Shop" },
    "computer center": { name: "Central Computing Center (CCC)", block: "Computer Science & IT Block", floor: "1st & 2nd Floors", landmark: "Main IT Labs Complex" },
    library: { name: "Central Library & Reading Hall", block: "Library Building", floor: "Ground & 1st Floor", landmark: "Opposite College Cafeteria" },
    dispensary: { name: "Health Center & Dispensary", block: "Campus Amenities Block", floor: "Ground Floor", landmark: "Near College Sports Ground" }
  });

  const CAMPUS_ADMINISTRATION_DIRECTORY = Object.freeze({
    principal: {
      key: "principal",
      title: "Principal, GNDEC",
      name: "Dr. Sehijpal Singh",
      qualification: "Ph.D. (Mechanical Engineering)",
      department: "Principal Office / Mechanical Engineering",
      office: "Principal's Secretariat, Administrative Block (Ground Floor)",
      email: "principal@gndec.ac.in",
      phone: "0161-5064501, 0161-2502700",
      description: "Principal of Guru Nanak Dev Engineering College, Ludhiana and Professor in Mechanical Engineering."
    },
    dean_academics: {
      key: "dean_academics",
      title: "Dean (Academic)",
      name: "Dr. Parminder Singh",
      qualification: "Ph.D. (Computer Science & Engineering)",
      department: "Academic Section / Computer Science & Engg.",
      office: "Academic Branch, Administrative Block (Ground Floor)",
      email: "deanacademic@gndec.ac.in",
      phone: "0161-5064522",
      description: "Oversees academic policies, curriculum design, study schemes, and autonomous regulations."
    },
    dean_student_welfare: {
      key: "dean_student_welfare",
      title: "Dean (Student Welfare) / DSW",
      name: "Dr. Jatinder Kapoor",
      qualification: "Ph.D. (Mechanical Engineering)",
      department: "Student Welfare / Mechanical Engineering",
      office: "Student Welfare Branch, Student Activity Centre",
      email: "dsw@gndec.ac.in",
      phone: "0161-5064560",
      description: "Coordinates student clubs, societies, cultural events, student discipline, and campus life."
    },
    dean_training_placement: {
      key: "dean_training_placement",
      title: "Dean / Head (Training & Placement)",
      name: "Dr. K.S. Mann",
      qualification: "Ph.D. (Information Technology)",
      department: "Training & Placement Cell / Information Technology",
      office: "Training & Placement Cell, MBA Block (Ground Floor)",
      email: "tpo@gndec.ac.in",
      phone: "0161-5064535",
      description: "Leads corporate relations, campus recruitment drives, summer training, and industry internships."
    },
    dean_testing_consultancy: {
      key: "dean_testing_consultancy",
      title: "Dean (Testing & Consultancy)",
      name: "Dr. Harwinder Singh",
      qualification: "Ph.D. (Mechanical Engineering)",
      department: "Testing & Consultancy Cell (TCC) / Mechanical Engineering",
      office: "Consultancy & MBA Block (A-Block)",
      email: "tcc@gndec.ac.in",
      phone: "0161-5064509",
      description: "Directs industrial testing, material evaluation, calibration, and technical consultancy."
    },
    dean_rnd: {
      key: "dean_rnd",
      title: "Dean (Research & Development)",
      name: "Dr. Hardeep Singh Rai",
      qualification: "Ph.D. (Civil Engineering)",
      department: "R&D Cell / Civil Engineering",
      office: "Research & Development Cell, A-Block",
      email: "dean_rnd@gndec.ac.in",
      phone: "0161-5064525",
      description: "Oversees research publications, patents, sponsored projects, and doctoral research."
    },
    controller_of_examinations: {
      key: "controller_of_examinations",
      title: "Controller of Examinations (COE)",
      name: "Dr. Arvind Dhingra",
      qualification: "Ph.D. (Electrical Engineering)",
      department: "Examination Branch / Electrical Engineering",
      office: "Examination Branch, Administrative Wing",
      email: "coe@gndec.ac.in",
      phone: "0161-5064508",
      description: "Directs autonomous examination conduct, end-semester evaluation, results, and grade sheets."
    },
    hod_cse: {
      key: "hod_cse",
      title: "Head of Department (CSE)",
      name: "Dr. Parminder Singh",
      department: "Computer Science & Engineering",
      office: "HOD Office, CSE Block (1st Floor)",
      email: "cse@gndec.ac.in",
      description: "Leads the Department of Computer Science & Engineering."
    },
    hod_it: {
      key: "hod_it",
      title: "Head of Department (IT)",
      name: "Dr. Kiran Jyoti",
      department: "Information Technology",
      office: "HOD Office, IT Block (2nd Floor)",
      email: "it@gndec.ac.in",
      description: "Leads the Department of Information Technology."
    },
    hod_ece: {
      key: "hod_ece",
      title: "Head of Department (ECE)",
      name: "Dr. Narwant Singh Grewal",
      department: "Electronics & Communication Engineering",
      office: "HOD Office, ECE Block (Ground Floor)",
      email: "ece@gndec.ac.in",
      description: "Leads the Department of Electronics & Communication Engineering."
    },
    hod_ee: {
      key: "hod_ee",
      title: "Head of Department (EE)",
      name: "Dr. Kanwardeep Singh",
      department: "Electrical Engineering",
      office: "HOD Office, EE Block (Ground Floor)",
      email: "ee@gndec.ac.in",
      description: "Leads the Department of Electrical Engineering."
    },
    hod_me: {
      key: "hod_me",
      title: "Head of Department (ME)",
      name: "Dr. Harwinder Singh",
      department: "Mechanical Engineering",
      office: "HOD Office, Mechanical Block (Ground Floor)",
      email: "me@gndec.ac.in",
      description: "Leads the Department of Mechanical Engineering."
    },
    hod_ce: {
      key: "hod_ce",
      title: "Head of Department (Civil)",
      name: "Dr. Puneet Pal Singh Cheema",
      department: "Civil Engineering",
      office: "HOD Office, Civil Block (Ground Floor)",
      email: "civil@gndec.ac.in",
      description: "Leads the Department of Civil Engineering."
    },
    hod_appsc: {
      key: "hod_appsc",
      title: "Head of Department (Applied Science)",
      name: "Dr. Harpreet Kaur",
      department: "Applied Science & Humanities",
      office: "HOD Office, Civil & Applied Sciences Block",
      email: "appsci@gndec.ac.in",
      description: "Leads Applied Sciences (Physics, Chemistry, Mathematics, Humanities)."
    },
    hod_mba: {
      key: "hod_mba",
      title: "Head of Department (MBA)",
      name: "Dr. Parampal Singh",
      department: "Business Administration (MBA)",
      office: "MBA Block (1st Floor)",
      email: "mba@gndec.ac.in",
      description: "Leads the Department of Business Administration."
    },
    hod_mca: {
      key: "hod_mca",
      title: "Head of Department (MCA)",
      name: "Dr. Jasbir Singh Saini",
      department: "Computer Applications (MCA)",
      office: "Computer Applications Block",
      email: "mca@gndec.ac.in",
      description: "Leads the Department of Computer Applications."
    }
  });

  function lookupCampusAdministration(query) {
    const raw = clean(query);
    const q = normalize(raw);

    // Principal
    if (/\b(?:principal|sehijpal|director)\b/.test(q)) {
      return CAMPUS_ADMINISTRATION_DIRECTORY.principal;
    }

    // Specific Deans
    if (/\b(?:dean\s*academic|academic\s*dean)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.dean_academics;
    if (/\b(?:dsw|student\s*welfare|welfare\s*dean|jatinder\s*kapoor)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.dean_student_welfare;
    if (/\b(?:tpo|training\s*and\s*placement|placement\s*dean|ks\s*mann|k\s*s\s*mann)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.dean_training_placement;
    if (/\b(?:tcc|testing\s*and\s*consultancy|consultancy\s*dean)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.dean_testing_consultancy;
    if (/\b(?:dean\s*r\s*and\s*d|dean\s*rnd|research\s*dean|hardeep\s*singh\s*rai|h\s*s\s*rai)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.dean_rnd;
    if (/\b(?:coe|controller\s*of\s*exam|examination\s*controller|arvind\s*dhingra)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.controller_of_examinations;

    // Specific HODs
    const isHodQuery = /\b(?:hod|head\s*of\s*department|head\s*of\s*the\s*department|head)\b/.test(q);

    if (isHodQuery || /\bwho\s+is\s+(?:the\s+)?(?:hod|head)\b/.test(q)) {
      if (/\b(?:cse|cs|computer\s*science)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_cse;
      if (/\b(?:it|information\s*technology)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_it;
      if (/\b(?:ece|ec|electronics)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_ece;
      if (/\b(?:ee|electrical)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_ee;
      if (/\b(?:me|mech|mechanical)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_me;
      if (/\b(?:ce|civil)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_ce;
      if (/\b(?:appsc|applied|physics|chem|math|first\s*year)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_appsc;
      if (/\b(?:mba|management|business)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_mba;
      if (/\b(?:mca|computer\s*applications)\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_mca;
    }

    // Direct name matches
    if (/\bkiran\s*jyoti\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_it;
    if (/\bnarwant\s*singh\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_ece;
    if (/\bkanwardeep\s*singh\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_ee;
    if (/\bpuneet\s*pal\s*singh|cheema\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_ce;
    if (/\bparampal\s*singh\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_mba;
    if (/\bjasbir\s*singh\s*saini\b/.test(q)) return CAMPUS_ADMINISTRATION_DIRECTORY.hod_mca;

    return null;
  }

  function lookupCampusRoom(query) {
    const raw = clean(query);
    const words = raw.split(/\s+/).filter(Boolean);
    for (const [key, info] of Object.entries(CAMPUS_ROOM_DIRECTORY)) {
      if (raw === key || raw === info.name.toLowerCase()) return info;
    }
    for (const token of words) {
      if (CAMPUS_ROOM_DIRECTORY[token]) return CAMPUS_ROOM_DIRECTORY[token];
    }
    for (const [key, info] of Object.entries(CAMPUS_ROOM_DIRECTORY)) {
      if (raw.includes(key) || raw.includes(info.name.toLowerCase())) return info;
    }
    if (raw.includes("physics")) return CAMPUS_ROOM_DIRECTORY["physics lab"];
    if (raw.includes("chemistry") || raw.includes("chem")) return CAMPUS_ROOM_DIRECTORY["chemistry lab"];
    if (raw.includes("workshop") || raw.includes("foundry") || raw.includes("smithy")) return CAMPUS_ROOM_DIRECTORY["workshop"];
    if (raw.includes("library") || raw.includes("reading")) return CAMPUS_ROOM_DIRECTORY["library"];
    if (raw.includes("dispensary") || raw.includes("hospital") || raw.includes("doctor") || raw.includes("health")) return CAMPUS_ROOM_DIRECTORY["dispensary"];
    if (raw.includes("computer") || raw.includes("ccc")) return CAMPUS_ROOM_DIRECTORY["computer center"];
    return null;
  }

  function getLongWeekends(year = 2026) {
    const holidays = getHolidaysForYear(year);
    const longWeekends = [];
    for (const h of holidays) {
      const d = parseIsoDate(h.date);
      if (!d) continue;
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 5) {
        longWeekends.push({ holiday: h, type: "Friday to Sunday (3-Day Long Weekend)", days: 3 });
      } else if (dayOfWeek === 1) {
        longWeekends.push({ holiday: h, type: "Saturday to Monday (3-Day Long Weekend)", days: 3 });
      } else if (dayOfWeek === 4) {
        longWeekends.push({ holiday: h, type: "Thursday holiday (Optional 4-Day Long Weekend with Friday off)", days: 4 });
      }
    }
    return longWeekends;
  }

  // --- New Data Domains (Transport, Library, Placements, Clubs) ---
  const TRANSPORT_ROUTES = [
    { id: "route-1", name: "Ludhiana City - Campus", departure: 480, return: 1020, stops: ["Bus Stand", "Bharat Nagar Chowk", "GNDEC"] },
    { id: "route-2", name: "Samrala Chowk - Campus", departure: 495, return: 1035, stops: ["Samrala Chowk", "Cheema Chowk", "GNDEC"] }
  ];

  const LIBRARY_HOURS = {
    weekday: { open: "08:00 AM", close: "08:00 PM" },
    weekend: { open: "09:00 AM", close: "02:00 PM" },
    notice: "Bring your ID card for entry. Books can be issued for 14 days."
  };

  const CLUBS = [
    { name: "SCIE", full: "Student Chapter of Institution of Engineers", type: "Technical", contact: "scie@gndec.ac.in", nextEvent: "TechTalk on AI (Friday, 2:00 PM)" },
    { name: "LUG", full: "Linux User Group", type: "Technical", contact: "lug@gndec.ac.in", nextEvent: "InstallFest (Saturday, 10:00 AM)" },
    { name: "Cultural", full: "Cultural Committee", type: "Cultural", contact: "cultural@gndec.ac.in", nextEvent: "Bhangra Auditions (Thursday, 4:00 PM)" }
  ];

  const PLACEMENT_INFO = {
    eligibility: "60% or 6.0 CGPA throughout (10th, 12th, B.Tech) with no active backlogs.",
    upcoming: [
      { company: "TCS", role: "Ninja", date: "2026-09-15" },
      { company: "Infosys", role: "System Engineer", date: "2026-09-20" }
    ]
  };

  // --- Exam Scenario Mode ---
  function isExamSeason(date) {
    const month = date ? new Date(date).getMonth() : new Date().getMonth();
    return month === 4 || month === 5 || month === 10 || month === 11; // May, June, Nov, Dec
  }

  globalScope.CompassBrainKernel = Object.freeze({
    VERSION,
    LIMITS,
    DAYS,
    CALENDAR_DAYS,
    DEFAULT_BELL_SLOTS,
    MONTHS,
    MONTH_NAMES,
    clean,
    normalize,
    escapeHtml,
    humanTime,
    durationLabel,
    classTypeLabel,
    classTypeSummary,
    unique,
    teacherNames,
    validClass,
    compactClass,
    chronological,
    mergeIntervals,
    bellSlotList,
    freeTimetableIntervals,
    internalBreakIntervals,
    buildingForRoom,
    ROOM_LOCATIONS,
    getWalkingTime,
    editDistance,
    phoneticKey,
    detectLanguage,
    sanitizeArithmetic,
    evaluateArithmetic,
    solveLinearEquation,
    isValidIsoDate,
    shiftIsoDate,
    weekdayOfIso,
    formatIsoLong,
    formatIsoFull,
    extractDaySymbol,
    resolveDaySymbol,
    nextFutureClass,
    upcomingClasses,
    createMemory,
    updateMemory,
    result,
    failure,
    validateShape,
    createMetrics,
    recordMetric,
    metricsSnapshot,
    suggestionScore,
    rankSuggestions,
    extractPersonName,
    looksLikeBarePersonName,
    titleCaseName,
    stripTitles,
    ordinalIndex,
    HOLIDAY_SOURCE,
    OFFICIAL_HOLIDAYS_2026,
    officialHolidayEntries,
    isHalfDayNotice,
    getHolidaysForYear,
    getHolidaysForMonth,
    getHolidayNoticesForYear,
    getHolidayNoticesForMonth,
    checkDateHoliday,
    isHolidayDate,
    getNextHoliday,
    getHolidayByName,
    getHolidayStats,
    normalizeHolidayLookup,
    searchHolidays,
    getLongWeekends,
    GRADE_POINTS,
    evaluateCgpa,
    cgpaToPercentage,
    percentageToCgpa,
    evaluateAttendance,
    CAMPUS_ROOM_DIRECTORY,
    lookupCampusRoom,
    CAMPUS_ADMINISTRATION_DIRECTORY,
    lookupCampusAdministration,
    TRANSPORT_ROUTES,
    LIBRARY_HOURS,
    CLUBS,
    PLACEMENT_INFO,
    isExamSeason
  });
})(typeof globalThis !== "undefined" ? globalThis : window);

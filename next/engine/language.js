/**
 * Language normalisation for Ask Compass.
 *
 * The engine must accept what a student actually types: mixed English,
 * Hinglish, romanised Hindi/Punjabi, Devanagari or Gurmukhi script, SMS
 * shortforms, subject codes, nicknames, and ordinary typos.
 *
 * Everything here is deterministic, bounded and local. There is no model, no
 * network call and no learned embedding. Transliteration is a fixed character
 * table, synonyms are a fixed phrase list, and typo matching is a bounded
 * Levenshtein/Dice comparison.
 */

/* ── script transliteration ────────────────────────────────────────────── */

const DEVANAGARI_MAP = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri",
  "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "अं": "an", "अः": "ah",
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
  "ॐ": "om", "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ं": "n", "ँ": "n", "ः": "h", "्": "",
  "़": "", "ऽ": ""
};

const GURMUKHI_MAP = {
  "ੳ": "o", "ਅ": "a", "ੲ": "e", "ਸ": "s", "ਹ": "h", "ਕ": "k", "ਖ": "kh", "ਗ": "g", "ਘ": "gh", "ਙ": "ng",
  "ਚ": "ch", "ਛ": "chh", "ਜ": "j", "ਝ": "jh", "ਞ": "n", "ਟ": "t", "ਠ": "th", "ਡ": "d", "ਢ": "dh", "ਣ": "n",
  "ਤ": "t", "ਥ": "th", "ਦ": "d", "ਧ": "dh", "ਨ": "n", "ਪ": "p", "ਫ": "ph", "ਬ": "b", "ਭ": "bh", "ਮ": "m",
  "ਯ": "y", "ਰ": "r", "ਲ": "l", "ਵ": "v", "ੜ": "r", "ਸ਼": "sh", "ਖ਼": "kh", "ਗ਼": "g", "ਜ਼": "z", "ਫ਼": "ph",
  "ਆ": "aa", "ਇ": "i", "ਈ": "ee", "ਉ": "u", "ਊ": "oo", "ਏ": "e", "ਐ": "ai", "ਓ": "o", "ਔ": "au",
  "ੰ": "n", "ਂ": "n", "੍": "", "ੱ": "", "ੴ": "ik onkar",
  "ਾ": "aa", "ਿ": "i", "ੀ": "ee", "ੁ": "u", "ੂ": "oo", "ੇ": "e", "ੈ": "ai", "ੋ": "o", "ੌ": "au",
  "੦": "0", "੧": "1", "੨": "2", "੩": "3", "੪": "4", "੫": "5", "੬": "6", "੭": "7", "੮": "8", "੯": "9"
};

const SCRIPT_CONSONANTS = new Set(
  "कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसहळਕਖਗਘਙਚਛਜਝਞਟਠਡਢਣਤਥਦਧਨਪਫਬਭਮਯਰਲਵੜਸ਼ਖ਼ਗ਼ਜ਼ਫ਼".split("")
);
const SCRIPT_VOWEL_SIGNS = new Set("ािीुूृेैोौ्ंਁੰ੍ੱਾਿੀੁੂੇੈੋੌ".split("").filter((char) => !["ं", "ँ", "ः", "ੰ", "ਂ"].includes(char)));
const SCRIPT_ALL = new Map(Object.entries({ ...DEVANAGARI_MAP, ...GURMUKHI_MAP }));

export function hasIndicScript(text = "") {
  return /[\u0900-\u097f\u0a00-\u0a7f]/.test(String(text));
}

/**
 * Fixed-table transliteration with inherent vowels. Approximate by design,
 * never a model. A consonant gets "a" unless a vowel sign or virama follows,
 * and a word-final consonant drops the inherent vowel (Hindi/Punjabi habit).
 */
export function transliterate(text = "") {
  const value = String(text || "");
  if (!hasIndicScript(value)) return value;
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!SCRIPT_ALL.has(char)) {
      out += char;
      continue;
    }
    out += SCRIPT_ALL.get(char);
    if (SCRIPT_CONSONANTS.has(char)) {
      const next = value[index + 1];
      const final = index + 1 >= value.length || /\s|[.,!?;:()]/.test(next || " ");
      const hasVowel = next && SCRIPT_VOWEL_SIGNS.has(next);
      if (!hasVowel && !final) out += "a";
    }
  }
  return out;
}

/* ── shortforms and mixed-language synonyms ────────────────────────────── */

/**
 * Each entry maps a student spelling to the canonical English word the rest of
 * the engine already understands. Order is longest-phrase-first.
 */
const PHRASES = [
  // multiword concepts first
  ["\\bday\\s+after\\s+tomorrow\\b", "day after tomorrow"],
  ["\\b(?:parso|parson|parso(n)?)\\b", "day after tomorrow"],
  ["\\b(?:whole|full|entire|pura|poora|saara|sara)\\s+(?:week|hafta|hafte|hapta)\\b", "whole week"],
  ["\\b(?:every|each|all|har|saare|sare)\\s+(?:day|days|din|dino)\\b", "every day"],
  ["\\b(?:free|khali|khaali|khalee|vacant|vacent)\\s+(?:period|periods|slot|slots|bell|bells|time)\\b", "free period"],
  ["\\b(?:next|agla|agli|agle|agley|nxt|nx)\\s+(?:class|lecture|period|periods|classs|cls|klaas|kalaas)\\b", "next class"],
  ["\\b(?:current|ongoing|running|abhi|abi|chalu|chal\\s+rahi|chal\\s+raha)\\s+(?:class|lecture|period)\\b", "current class"],
  ["\\b(?:abhi|abi)\\s+(?:chal\\s+rahi|chal\\s+raha)\\b", "current"],
  ["\\b(?:end\\s*sem|end\\s*semester|ese|semester\\s+exam|final\\s+exam)\\b", "exam"],
  ["\\b(?:date\\s*sheet|dateshet|datasheet|datasheat|ds)\\b", "datesheet"],
  ["\\b(?:time\\s*table|timetabel|timetble|timetbale|timetabl|timetbel|time\\s+tabel|ttbl|tt)\\b", "timetable"],
  ["\\b(?:taaeem|taaim|taim|taym)\\s+(?:tebal|tebl|tabel|table)\\b", "timetable"],
  ["\\b(?:my\\s+section|mera\\s+section|meri\\s+section|mera\\s+group|meri\\s+group)\\b", "my section"],
  ["\\b(?:which\\s+section|kaun\\s+si\\s+section|konsi\\s+section|kaunsi\\s+section)\\b", "which section"],
  ["\\b(?:sat\\s*sri\\s*akal|sat\\s+sri\\s+akal|sat\\s+shri\\s+akal)\\b", "hello"],
  ["\\b(?:ram\\s*ram|radhe\\s*radhe|namaste\\s+ji|namaskar)\\b", "hello"]
];

const WORDS = [
  // SMS / abbreviations
  ["tmrw|tmr|tmro|tmrrw|tomorow|tommorow|tomorroe|2moro|2mrw|2mrow|2mrrw|kal|kall", "tomorrow"],
  ["aaj|aj|ajj|aajj|today'?s", "today"],
  ["yestrday|yestarday|yesterdy|yday", "yesterday"],
  ["abhi|abi|ab|right\\s*now|r\\.?n\\.?", "now"],
  ["nxt|nx|nextt|nxtt", "next"],
  ["curr|crnt|ongoing|running|chalu", "current"],
  ["wt|wht|wat|whts|wats|whats|what'?s", "what"],
  ["hw|hwo|hwz|howz", "how"],
  ["wen|whn|wn", "when"],
  ["wr|wher|wherre", "where"],
  ["hu|huu|whoo|hwo", "who"],
  ["wich|whch|which1", "which"],
  ["plz|pls|plzz|plss|kirpa|kripya", "please"],
  ["thx|thnx|thanx|ty|tysm|shukriya|shukria|dhanyavad|dhanyawad", "thanks"],
  ["ok\\s*bye|bye\\s*bye|good\\s*bye|phir\\s*milte|phir\\s*milde", "bye"],

  // timetable vocabulary
  ["cls|clss|clas|claz|klass|classs|klaas|klaass", "class"],
  ["lec|lecs|lect|lecturee", "lecture"],
  ["per|prd|prds|periods", "period"],
  ["schedul|schedual|scheduel|shedule|shedual|skedule|schedulee", "schedule"],
  ["sub|sbj|sbjct|subj|subjet|subjectt", "subject"],
  ["teach|teachr|teacer|techer|tchr|tr|fac|facultyy", "teacher"],
  ["rm|rms|rom|roomm", "room"],
  ["sec|sect|sction|secton|sectionn", "section"],
  ["grp|grup|group1", "group"],
  ["prof|profil|profilee", "profile"],
  ["mentr|mentor1", "mentor"],
  ["brnch|branch1", "branch"],
  ["exm|exma|eaxm|exam1|exams", "exam"],
  ["phy|phyz|phys|physcs|phyics|phisics|physic", "physics"],
  ["chem|chemstry|chemisty|chemistry1", "chemistry"],
  ["math|maths|mathematics|math1|m1", "math"],
  ["eco|econ|economics1", "economics"],
  ["eng|english|englsh|inglish", "english"],
  ["drawing|drawng|drwing|graphics1", "drawing"],
  ["workshop|workshp|wshop", "workshop"],
  ["programming|programing|progrmming|prog|coding", "programming"],
  ["electrical|electical|electrics", "electrical"],
  ["electronics|electroncs|electronic", "electronics"],
  ["stats|statistics|statstics", "statistics"],
  ["prob|probability|probablity", "probability"],
  ["business|bussiness|buisness", "business"],

  // Hinglish / romanised Hindi and Punjabi
  ["agla|agli|agle|agley|aglaa|agalaa|agala|aglee|agla1", "next"],
  ["pichla|pichle|pichhla|previous|prev", "last"],
  ["pehla|pehli|pehle|phla|phli|first1", "first"],
  ["aakhri|akhri|akhiri|antim|last1", "last"],
  ["khatam|khtm|finish1|end1", "finish"],
  ["kahan|kaha|kahan\\s+hai|kithe|kithay|kidhar|kithon|kider", "where"],
  ["kaun|kon|koun|kisne|kis\\s+ne", "who"],
  ["kab|kb|kado|kadon|kade|kad|kab\\s+hai", "when"],
  ["kya|kia|kyaa", "what"],
  ["kaise|kese|kiven|kive|kaisay", "how"],
  ["batao|btao|bata|bta|bolo|sunao|dikhao|dikha|dikhaao|suna|bhejo|bhej|bhejdo|bhej\\s+do", "show"],
  ["chutti|chhutti|chuti|chhuti|holiday1|leave1", "holiday"],
  ["khali|khaali|khalee|vacent|vacant|avail|available|empty|freee", "free"],
  ["kamra|kamre|kamraa|classroom|class\\s*room", "room"],
  ["adhapak|adhyapak|guru|teacher\\s*ji|sir|maam|madam|miss|professor|prof", "teacher"],
  ["vishay|vishey|subject\\s*ji", "subject"],
  ["pariksha|imtihan|paper|papers", "exam"],
  ["hafta|hafte|hapta|hapte|week1", "week"],
  ["din|dino|days1", "day"],
  ["mera|meri|mere|meraa|meree|apna|apni", "my"],
  ["hai|h|ha|hain|he|hona", "is"],
  ["nahi|nhi|nai|na|no1|not1", "no"],
  ["haan|han|yes1|yep|yeah", "yes"],
  ["kitna|kitne|kine|how\\s*many|how\\s*much", "how many"],
  ["kaunsa|konsa|kaunsi|konsi|kaun\\s*sa|which1", "which"],

  // Romanised weekday names (Punjabi/Hindi), including common spellings.
  ["somvar|somvaar|somavaar|somwar|somawaar|somvar1", "monday"],
  ["mangalvar|mangalvaar|mangalavaar|mangalwar|mangalwaar", "tuesday"],
  ["budhvar|budhvaar|budhavaar|budhwar|budhwaar", "wednesday"],
  ["guruvar|guruvaar|guroovar|guroovaar|guruwar|guruvantar|guruvaar1", "thursday"],
  ["shukarvar|shukravar|shukravaar|shukarvaar|shukarwar", "friday"],
  ["shanivar|shanivaar|shanicharvar|shanicharvaar|shanivaar1", "saturday"],
  ["ravivar|ravivaar|ravi\\s*vaar|itvar|itvaar|aitvar", "sunday"],

  // Gurmukhi/Devanagari spellings after transliteration.
  ["kalh|kallh|kahl|klh", "tomorrow"],
  ["taaeemtebl|taaeemtebal|taaeematebal|taaeematebl|taimatebal|taaimtebal|taimtebl|taimtebal|timetebl", "timetable"],
  ["kalaas|klaas|klaass|kalaash", "class"],
  ["kamaraa|kamara|kamraa|kamre|kamrey", "room"],
  ["agalee|agali|aglee", "next"],
  ["ticher|tcher|teachr|teacer|teachrr", "teacher"]
];

const PHRASE_RULES = PHRASES.map(([pattern, replacement]) => [new RegExp(pattern, "gi"), replacement]);
const WORD_RULES = WORDS.map(([pattern, replacement]) => [new RegExp(`\\b(?:${pattern})\\b`, "gi"), replacement]);

/* ── typo correction ───────────────────────────────────────────────────── */

const SPELLING = {
  timetabel: "timetable", timetble: "timetable", timetbale: "timetable", timetabl: "timetable",
  shedule: "schedule", schedual: "schedule", scheduel: "schedule", schedul: "schedule",
  tomorow: "tomorrow", tommorow: "tomorrow", tomorroe: "tomorrow", tomrow: "tomorrow",
  dateshet: "datesheet", datasheet: "datesheet", datasheat: "datesheet",
  secton: "section", sction: "section", subjet: "subject", sbjct: "subject",
  teachr: "teacher", teacer: "teacher", techer: "teacher",
  physcs: "physics", phyics: "physics", physc: "physics",
  chemstry: "chemistry", chemisty: "chemistry",
  exma: "exam", eaxm: "exam", exm: "exam",
  clas: "class", clss: "class", classs: "class",
  probablity: "probability", statstics: "statistics",
  bussiness: "business", buisness: "business",
  mentr: "mentor", brnch: "branch", profil: "profile",
  tommorow: "tomorrow", frst: "first", lst: "last",
  wht: "what", wher: "where", wen: "when", hw: "how",
  wensday: "wednesday", wendesday: "wednesday", wendsday: "wednesday", wednsday: "wednesday",
  thusday: "thursday", thrusday: "thursday", thursdy: "thursday",
  tusday: "tuesday", tuseday: "tuesday", tuesdy: "tuesday",
  saturdy: "saturday", saterday: "saturday", sunda: "sunday", fryday: "friday",
  mondayy: "monday", tuesdayy: "tuesday", wednesdayy: "wednesday", thursdayy: "thursday",
  fridayy: "friday", saturdayy: "saturday", sundayy: "sunday"
};

/* ── public normalisation ──────────────────────────────────────────────── */

/** Lowercase, transliterate, strip emoji/punctuation noise, expand aliases. */
export function canonicalize(question = "") {
  let text = transliterate(String(question || ""));
  text = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  text = text.toLowerCase();
  // Expand common contractions before punctuation removal turns "what's" into
  // "what s". Keep the words the intent router already understands.
  text = text
    .replace(/\b(what|where|who|when|why|how|that|it|there|here|he|she|this|which)'s\b/g, "$1 is")
    .replace(/\b(?:don't|dont)\b/g, "do not")
    .replace(/\b(?:doesn't|doesnt)\b/g, "does not")
    .replace(/\b(?:can't|cant)\b/g, "can not")
    .replace(/\b(?:won't|wont)\b/g, "will not")
    .replace(/\b(?:i'm|im)\b/g, "i am")
    .replace(/\b(?:i've|ive)\b/g, "i have");
  // Keep the characters used by times, dates, room codes and ranges.
  text = text.replace(/[\u{1f000}-\u{1faff}\u{2600}-\u{27bf}\u{2b00}-\u{2bff}\u{fe0f}]/gu, " ");
  text = text.replace(/[^\p{L}\p{N}\s:./-]/gu, " ");
  text = text.replace(/([a-z])\1{2,}/g, "$1");
  text = text.replace(/\s+/g, " ").trim();

  for (const [pattern, replacement] of PHRASE_RULES) text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of WORD_RULES) text = text.replace(pattern, replacement);

  text = text
    .split(" ")
    .map((token) => SPELLING[token] || token)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

export function tokensOf(question = "") {
  return canonicalize(question)
    .split(" ")
    .filter((token) => token.length >= 2);
}

/* ── fuzzy matching ────────────────────────────────────────────────────── */

/** Bounded Levenshtein distance. Returns `max + 1` as soon as it is exceeded. */
export function editDistance(a = "", b = "", max = 3) {
  const left = String(a);
  const right = String(b);
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > max) return max + 1;
  const previous = new Array(right.length + 1);
  const current = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) previous[j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

/** Sørensen–Dice bigram similarity in [0, 1]. */
export function diceSimilarity(a = "", b = "") {
  const left = String(a);
  const right = String(b);
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const bigrams = new Map();
  for (let i = 0; i < left.length - 1; i += 1) {
    const gram = left.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const gram = right.slice(i, i + 2);
    const count = bigrams.get(gram) || 0;
    if (count > 0) {
      bigrams.set(gram, count - 1);
      hits += 1;
    }
  }
  return (2 * hits) / (left.length + right.length - 2);
}

/**
 * Compare one typed token with one known word. Prefixes ("gagan" vs
 * "gagandeep") and one/two character typos count; unrelated words do not.
 */
export function tokenSimilar(a = "", b = "") {
  const left = String(a).toLowerCase();
  const right = String(b).toLowerCase();
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 4 && right.startsWith(left)) return 0.93;
  if (right.length >= 4 && left.startsWith(right)) return 0.9;
  if (left.length <= 2 || right.length <= 2) return 0;
  const max = left.length >= 8 && right.length >= 8 ? 2 : 1;
  if (left[0] === right[0] && editDistance(left, right, max) <= max) return 0.88;
  const dice = diceSimilarity(left, right);
  return dice >= 0.8 ? dice * 0.9 : 0;
}

/** True when any word/phrase in `terms` is present, allowing small typos. */
export function mentions(question = "", terms = [], { fuzzy = true, minScore = 0.82 } = {}) {
  const text = canonicalize(question);
  const padded = ` ${text} `;
  const tokens = text.split(" ").filter(Boolean);
  for (const term of terms) {
    const normalized = canonicalize(term);
    if (!normalized) continue;
    if (normalized.includes(" ")) {
      if (padded.includes(` ${normalized} `)) return true;
      continue;
    }
    if (tokens.includes(normalized)) return true;
    if (!fuzzy || normalized.length < 4) continue;
    for (const token of tokens) {
      if (token.length < 4 || Math.abs(token.length - normalized.length) > 2) continue;
      if (tokenSimilar(token, normalized) >= minScore) return true;
    }
  }
  return false;
}

/**
 * Find the best match for a typed token in a list of known words.
 * Returns `{ value, score }` or null. Bounded by the list the caller passes.
 */
export function bestMatch(token, candidates = [], { minScore = 0.82 } = {}) {
  const normalized = canonicalize(token);
  if (!normalized) return null;
  let best = null;
  for (const candidate of candidates) {
    const words = canonicalize(candidate).split(" ").filter(Boolean);
    if (!words.length) continue;
    let score = 0;
    if (words.includes(normalized)) score = 1;
    else if (words.some((word) => word === normalized)) score = 1;
    else if (words.some((word) => word.startsWith(normalized) && normalized.length >= 3)) score = 0.94;
    else {
      for (const word of words) {
        if (word.length < 4) continue;
        const candidateScore = tokenSimilar(normalized, word);
        if (candidateScore > score) score = candidateScore;
      }
    }
    if (score >= minScore && (!best || score > best.score)) best = { value: candidate, score };
  }
  return best;
}

/* ── intent vocabulary ─────────────────────────────────────────────────── */

export const VOCAB = Object.freeze({
  next: ["next", "upcoming", "ahead", "now", "current", "ongoing", "running"],
  today: ["today", "now"],
  tomorrow: ["tomorrow"],
  dayAfter: ["day after tomorrow"],
  week: ["week", "weekly", "whole week", "every day", "all days"],
  first: ["first", "earliest", "start", "starting"],
  last: ["last", "final", "latest", "finish", "end", "leave", "over"],
  freePeriod: ["free", "empty", "vacant", "break", "gap", "no class", "spare"],
  period: ["period", "periods", "slot", "slots", "bell", "lecture", "class", "time"],
  freeRoom: ["free", "available", "vacant", "empty", "open"],
  room: ["room", "rooms", "classroom", "classrooms", "lab", "labs", "venue", "location"],
  teacher: ["teacher", "teachers", "faculty", "professor", "sir", "maam", "mam", "miss", "who"],
  subject: ["subject", "subjects", "paper"],
  section: ["section", "sections", "group", "branch"],
  profile: ["profile", "mentor", "crn", "registration", "my section", "my group"],
  exam: ["exam", "exams", "ese", "datesheet", "date sheet", "end sem", "end semester", "test"],
  holiday: ["holiday", "holidays", "leave", "vacation", "off", "chutti", "closed"],
  attendance: ["attendance", "present", "absent", "percentage"],
  syllabus: ["syllabus", "course", "curriculum", "units", "chapters"],
  faculty: ["faculty", "teacher", "professor", "department", "office", "contact"],
  college: ["college", "gndec", "campus", "address", "location", "established", "affiliated", "hostel", "library"],
  greeting: ["hello", "hi", "hey", "namaste", "sat sri akal"],
  thanks: ["thanks", "thank you"],
  bye: ["bye", "goodbye", "see you"],
  capabilities: ["who are you", "what can you do", "help", "how do you work"],
  change: ["change", "update", "edit", "set", "select"]
});

/**
 * Extract the meaningful words of a question for subject/teacher matching.
 * Keeps short subject codes ("pps", "bee") that generic stopword filtering
 * would remove.
 */
export const QUERY_STOPWORDS = Object.freeze(new Set([
  "the", "and", "for", "with", "what", "when", "where", "which", "who", "whom", "how", "why",
  "is", "are", "was", "were", "do", "does", "did", "can", "could", "will", "would", "should",
  "my", "mine", "our", "your", "his", "her", "their", "its", "this", "that", "these", "those",
  "class", "classes", "lecture", "lectures", "period", "periods", "slot", "slots",
  "timetable", "schedule", "today", "tomorrow", "yesterday", "week", "day", "days", "time", "times",
  "free", "busy", "room", "rooms", "classroom", "classrooms", "lab", "labs", "venue", "location",
  "teacher", "teachers", "faculty", "professor", "sir", "maam", "mam", "miss",
  "subject", "subjects", "paper", "papers", "section", "sections", "group", "groups", "branch",
  "next", "current", "last", "first", "final", "now", "please", "tell", "show", "give", "list", "find",
  "me", "about", "there", "here", "any", "all", "of", "in", "on", "at", "to", "from", "by",
  "a", "an", "no", "not", "yes", "is", "hai", "ka", "ki", "ke", "ko", "se", "aur", "ya",
  "batao", "dikhao", "kahan", "kithe", "kya", "kaun", "kab", "kado", "mera", "meri", "mere",
  "exam", "exams", "datesheet", "date", "day", "month", "semester", "sem", "ese", "end",
  "holiday", "holidays", "off", "leave", "attendance", "profile", "mentor", "crn", "registration",
  "gndec", "college", "campus", "compass", "please", "plz", "pls", "help",
  "da", "daa", "de", "dee", "di", "nu", "te", "vich", "ch", "naal", "layi", "liye", "ton", "toh",
  "wala", "wali", "wale", "koi", "bhi", "hi", "ta", "fer", "phir", "hai", "hain", "h"
]));

/** Meaningful tokens after alias expansion and stopword removal. */
export function contentTokens(question = "") {
  return canonicalize(question)
    .split(" ")
    .filter((token) => token.length >= 2 && !QUERY_STOPWORDS.has(token) && !/^\d{1,2}$/.test(token));
}

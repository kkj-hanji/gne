const fs = require('fs');
let txt = fs.readFileSync('next/engine/language.js', 'utf8');

// Find the end of the PHRASES array — after the hostel entry
// Inject new Hinglish phrase rules before the closing ]; of PHRASES
const newPhraseEntries = `
  // --- NEW: Hinglish Phrase Rules ---
  // "mera next class" => "my next class"
  ["\\\\b(?:mera|meri|mere)\\\\s+(?:next|agla|agli|agle)\\\\s+(?:class|lecture|cls|period)\\\\b", "my next class"],
  // "aaj kya hai" => "what is today"
  ["\\\\b(?:aaj|aj)\\\\s+(?:kya|kia|kyaa)\\\\s+(?:hai|hain|han|is|h)\\\\b", "what is today"],
  // "room khali hai" => "room is free"
  ["\\\\b(?:room|kamra|kamre)\\\\s+(?:khali|khaali|khalee|vacant|free|empty)\\\\s+(?:hai|hain|h|is)\\\\b", "room is free"],
  // "mujhe batao" => indicate question intent (show me)
  ["\\\\b(?:mujhe|mujko|muje)\\\\s+(?:batao|bata|dikhao|dikha|show)\\\\b", "show me"],
  // "nahi aaya" => "not come yet" (attendance context)
  ["\\\\b(?:nahi|nahin|nhi|naa|na)\\\\s+(?:aaya|aai|aaye|aa)\\\\b", "not come yet"],
  // "last sem" / "pichle sem" => "previous semester"
  ["\\\\b(?:last|pichle|pichla|pichhle|pichli|prev(?:ious)?)\\\\s+(?:sem|semester|semestr)\\\\b", "previous semester"],
  // "kitna baki" / "kitna left" => quantity remaining
  ["\\\\b(?:kitna|kitne|kitni)\\\\s+(?:baki|bacha|bcha|left|remaining|bachha)\\\\b", "how many remaining"]`;

// Insert before the ]; that closes the PHRASES array
// The hostel entry is the last item, so we look for it and add after
const hostelPattern = /("hostel"\]\r?\n\];)/;
if (hostelPattern.test(txt)) {
  txt = txt.replace(hostelPattern, (m) => {
    return m.replace(/\r?\n\];/, newPhraseEntries + '\r\n];');
  });
  console.log('PHRASES: hostel pattern found and patched');
} else {
  console.error('PHRASES: hostel pattern NOT found!');
}

// --- Add new WORD rules ---
// Find the ct2 entry (last in WORDS array)
const newWordEntries = `
  // --- NEW: Indian student vocabulary ---
  // Intensifiers (map to context-free markers, stripped by stopwords)
  ["kaafi|bahot|bahut|zyada|bohat|bohot", "very"],
  // Command imperatives (Hinglish)
  ["chal|chalo", "show"],
  // Address words (strip/ignore — added to stopwords separately)
  // Teacher spelling variants
  ["teachar|tichar|teechar|teacherr|profesor|professur", "teacher"],
  // Room availability spellings
  ["phree|faree|freee|khali|khaali|khalee", "free"],
  // Quantity: kitna
  ["kitna|kitne|kitni|kina|kine", "how many"],
  // When: kab  
  ["kab|kb|kado|kadon|kade|kad", "when"],
  // Not-yet pattern pieces (after phrase rules, only residuals)
  ["nahi|nahin|nhi", "not"]`;

const ct2Pattern = /(\["ct2\|ct-2\|ct\\\\s\*2", "exam"\]\r?\n\];)/;
if (ct2Pattern.test(txt)) {
  txt = txt.replace(ct2Pattern, (m) => {
    return m.replace(/\r?\n\];/, newWordEntries + '\r\n];');
  });
  console.log('WORDS: ct2 pattern found and patched');
} else {
  console.error('WORDS: ct2 pattern NOT found!');
  // Try alternate ending
  const altPattern = /("exam"\]\r?\n\];)/;
  const idx = txt.lastIndexOf('"exam"]\r\n];');
  const idx2 = txt.lastIndexOf('"exam"]\n];');
  console.log('alt lastIndexOf CRLF:', idx, 'LF:', idx2);
}

// --- Add new VOCAB items ---
// Extend VOCAB.freeRoom and VOCAB.room to include Hinglish terms
// VOCAB.freeRoom already has "free" etc; ensure "phree", "faree", "khali" work
// These are handled by WORD_RULES above mapping them to "free"

// --- Confidence boosting: Add Hinglish marker detection ---
// We'll export a helper that detects strong Hinglish markers
const hinglishExportMarker = `\n/**\n * Returns true when the query contains strong Hinglish / romanised-Hindi markers.\n * Used by the answer engine to slightly boost confidence when intent is clear.\n */\nexport function hasHinglishMarkers(question = "") {\n  const text = String(question).toLowerCase();\n  return /\\b(?:kab|kya|kahan|kaun|mera|meri|mere|aaj|kal|abhi|yaar|bhai|batao|dikhao|khali|hai|hain|nahi|aage|agla|agli|pichle|kitna)\\b/.test(text);\n}\n`;

// Add before the last export (FALLBACK_REFUSAL would be in answer.js; in language.js we add before the last function)
// Find the contentTokens export (last function in language.js)
if (!txt.includes('export function hasHinglishMarkers')) {
  // Insert before the contentTokens function
  txt = txt.replace(
    /\n\/** Meaningful tokens after alias expansion and stopword removal\. \*\/\nexport function contentTokens/,
    hinglishExportMarker + '\n/** Meaningful tokens after alias expansion and stopword removal. */\nexport function contentTokens'
  );
  if (txt.includes('export function hasHinglishMarkers')) {
    console.log('hasHinglishMarkers: added');
  } else {
    // Try with CRLF
    txt = txt.replace(
      /\r\n\/\*\* Meaningful tokens after alias expansion and stopword removal\. \*\/\r\nexport function contentTokens/,
      hinglishExportMarker.replace(/\n/g, '\r\n') + '\r\n/** Meaningful tokens after alias expansion and stopword removal. */\r\nexport function contentTokens'
    );
    if (txt.includes('export function hasHinglishMarkers')) {
      console.log('hasHinglishMarkers: added (CRLF path)');
    } else {
      console.error('hasHinglishMarkers: NOT added');
    }
  }
}

// --- Extend QUERY_STOPWORDS to include address words yaar/bhai/sir ---
// They're already in the stopwords, confirmed at line 575. No change needed.

fs.writeFileSync('next/engine/language.js', txt, 'utf8');
console.log('language.js patched OK');

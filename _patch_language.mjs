import { readFileSync, writeFileSync } from 'fs';
let txt = readFileSync('next/engine/language.js', 'utf8');

// 1. Inject new PHRASE_RULES before the closing of the PHRASES array
// The last entry is the hostel line: ["...", "hostel"]
const hostelEntryRe = /("hostel"\])([\r\n]+\];)/;
if (hostelEntryRe.test(txt)) {
  const newPhraseEntries = [
    '',
    '  // --- NEW: Hinglish Phrase Rules ---',
    '  // "mera next class" => "my next class"',
    '  ["\\\\b(?:mera|meri|mere)\\\\s+(?:next|agla|agli|agle)\\\\s+(?:class|lecture|cls|period)\\\\b", "my next class"],',
    '  // "aaj kya hai" => "what is today"',
    '  ["\\\\b(?:aaj|aj)\\\\s+(?:kya|kia|kyaa)\\\\s+(?:hai|hain|han|is|h)\\\\b", "what is today"],',
    '  // "room khali hai" => "room is free"',
    '  ["\\\\b(?:room|kamra|kamre)\\\\s+(?:khali|khaali|khalee|vacant|free|empty)\\\\s+(?:hai|hain|h|is)\\\\b", "room is free"],',
    '  // "mujhe batao" => indicate question intent (show me)',
    '  ["\\\\b(?:mujhe|mujko|muje)\\\\s+(?:batao|bata|dikhao|dikha|show)\\\\b", "show me"],',
    '  // "nahi aaya" => "not come yet" (attendance context)',
    '  ["\\\\b(?:nahi|nahin|nhi|naa|na)\\\\s+(?:aaya|aai|aaye|aa)\\\\b", "not come yet"],',
    '  // "last sem" / "pichle sem" => "previous semester"',
    '  ["\\\\b(?:last|pichle|pichla|pichhle|pichli|prev(?:ious)?)\\\\s+(?:sem|semester|semestr)\\\\b", "previous semester"],',
    '  // "kitna baki" / "kitna left" => quantity remaining',
    '  ["\\\\b(?:kitna|kitne|kitni)\\\\s+(?:baki|bacha|bcha|left|remaining|bachha)\\\\b", "how many remaining"]',
  ].join('\r\n');

  txt = txt.replace(hostelEntryRe, (_, entry, closing) => {
    return entry + ',' + newPhraseEntries + closing;
  });
  console.log('PHRASES: patched');
} else {
  console.error('PHRASES hostel entry not found');
}

// 2. Inject new WORD rules at end of WORDS array
// Last entry is ["ct2|ct-2|ct\\s*2", "exam"]
const ct2Re = /("exam"\])([\r\n]+\];)([\r\n]+const PHRASE_RULES)/;
if (ct2Re.test(txt)) {
  const newWordEntries = [
    '',
    '  // --- NEW: Indian student vocabulary ---',
    '  // Intensifiers',
    '  ["kaafi|bahot|bahut|zyada|bohat|bohot", "very"],',
    '  // Hinglish command words',
    '  ["chal|chalo", "show"],',
    '  // Teacher spelling variants',
    '  ["teachar|tichar|teechar|teacherr|profesor|professur", "teacher"],',
    '  // Room availability spellings',
    '  ["phree|faree|freee", "free"],',
    '  // Admit card query',
    '  ["admit\\\\s*card|hallticket|hall\\\\s*ticket", "admit card"],',
    '  // Fees / tuition',
    '  ["tuition|tution|tution\\\\s*fee|fees?\\\\s*(?:kitni|kitna|how|kya)?", "fees"]',
  ].join('\r\n');

  txt = txt.replace(ct2Re, (_, entry, closing, next) => {
    return entry + ',' + newWordEntries + closing + next;
  });
  console.log('WORDS: patched');
} else {
  // try without the next group
  const ct2ReAlt = /("exam"\])([\r\n]+\];)/;
  // find the last occurrence inside WORDS array
  const lastIdx = txt.lastIndexOf('"exam"]');
  if (lastIdx !== -1) {
    const after = txt.indexOf('];\r\n', lastIdx);
    const after2 = txt.indexOf('];\n', lastIdx);
    const closeIdx = after !== -1 ? after : after2;
    if (closeIdx !== -1) {
      const newWordEntries = [
        '',
        '  // --- NEW: Indian student vocabulary ---',
        '  // Intensifiers',
        '  ["kaafi|bahot|bahut|zyada|bohat|bohot", "very"],',
        '  // Hinglish command words',
        '  ["chal|chalo", "show"],',
        '  // Teacher spelling variants',
        '  ["teachar|tichar|teechar|teacherr|profesor|professur", "teacher"],',
        '  // Room availability spellings',
        '  ["phree|faree|freee", "free"],',
        '  // Admit card query',
        '  ["admit\\\\s*card|hallticket|hall\\\\s*ticket", "admit card"],',
        '  // Fees / tuition',
        '  ["tuition|tution|fees?", "fees"]',
      ].join('\r\n');
      const lineEnd = txt.indexOf('\r\n', lastIdx);
      txt = txt.slice(0, lineEnd) + ',' + newWordEntries + txt.slice(lineEnd);
      console.log('WORDS: patched (alt)');
    } else {
      console.error('WORDS: close bracket not found');
    }
  } else {
    console.error('WORDS: ct2 entry not found');
  }
}

// 3. Add hasHinglishMarkers export
if (!txt.includes('hasHinglishMarkers')) {
  const hinglishFn = [
    '',
    '/**',
    ' * Returns true when the query contains strong Hinglish / romanised-Hindi markers.',
    ' * Used by the answer engine to slightly boost confidence when intent is clear.',
    ' */',
    'export function hasHinglishMarkers(question = "") {',
    '  const text = String(question).toLowerCase();',
    '  return /\\b(?:kab|kya|kahan|kaun|mera|meri|mere|aaj|kal|abhi|yaar|bhai|batao|dikhao|khali|hai|hain|nahi|aage|agla|agli|pichle|kitna)\\b/.test(text);',
    '}',
    '',
  ].join('\r\n');

  // Insert before contentTokens function
  txt = txt.replace(/(\/\*\* Meaningful tokens after alias expansion and stopword removal\. \*\/[\r\n]+export function contentTokens)/, hinglishFn + '$1');
  if (txt.includes('hasHinglishMarkers')) {
    console.log('hasHinglishMarkers: added');
  } else {
    console.error('hasHinglishMarkers: not added');
  }
}

writeFileSync('next/engine/language.js', txt, 'utf8');
console.log('language.js write complete');

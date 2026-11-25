/**
 * Small, offline GNDEC knowledge layer. Stable facts are bundled here with
 * direct official sources. Time-sensitive detail points to the live college
 * pages instead of being guessed or frozen into the answer.
 */

import { canonicalize, contentTokens } from "./language.js";

const HISTORY_URL = "https://gndec.ac.in/?q=node%2F10";
const CONTACT_URL = "https://www.gndec.ac.in/?q=node%2F53";
const COURSES_URL = "https://gndec.ac.in/?q=courses";
const UGC_DISCLOSURE_URL = "https://www.gndec.ac.in/sites/default/files/UGC%20Self%20Disclosure_1.pdf";
const ADMISSIONS_URL = "https://admission.gndec.ac.in/admission/";
const NOTICEBOARD_URL = "https://erp.gndec.ac.in/notice";
const ACADEMIC_PORTAL_URL = "https://academics.gndec.ac.in/";
const HOSTEL_BROCHURE_URL = "https://gndec.ac.in/sites/default/files/Information%20Brochure%202024.pdf";
const FACILITIES_BROCHURE_URL = "https://gndec.ac.in/sites/default/files/infobroch.pdf";

export const COLLEGE_FACTS_CHECKED_AT = "2026-11-24";

const BTECH = [
  ["Civil Engineering", 120],
  ["Computer Science and Engineering", 300],
  ["Electrical Engineering", 120],
  ["Electronics and Communication Engineering", 90],
  ["Information Technology", 180],
  ["Mechanical Engineering", 120],
  ["Robotics and Artificial Intelligence", 30]
];
const MTECH = [
  ["Computer Science and Engineering", 12],
  ["Environmental Science and Engineering", 6],
  ["Electronics and Communication Engineering", 12],
  ["Computer Science and Information Technology", 12],
  ["Power Engineering", 12],
  ["Production Engineering", 12],
  ["Structural Engineering", 12]
];

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sourceLink(url, label) {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>`;
}

function answer(html, intent, plan) {
  return { html, intent, confidence: 0.96, plan, entities: {}, suggestions: [] };
}

function listPrograms(label, entries) {
  return `<p><strong>${escapeHtml(label)}</strong></p><ul>${entries.map(([name, intake]) => `<li>${escapeHtml(name)}${intake ? ` · published intake ${intake}` : ""}</li>`).join("")}</ul>`;
}

/**
 * Answer GNDEC-wide questions from bundled official facts and evergreen links.
 * Unknown details (fees, current hostel vacancies and opening hours) are
 * explicitly sent to the current official page or phone directory.
 */
export function answerCollegeQuestion(question = "") {
  const text = canonicalize(question);
  const asksSyllabus = /\b(?:syllabus|unit|units|chapter|chapters|topic|topics|curriculum)\b/.test(text);
  const namesCollege = /\b(?:gndec|guru nanak dev|college|campus|institute|institution)\b/.test(text);
  const sourceStamp = `Checked ${COLLEGE_FACTS_CHECKED_AT} against GNDEC's published pages.`;
  const existingTopic = /\b(?:timetable|schedule|class|lecture|teacher|faculty|room|seating|seat|holiday|notice|circular|paper|question bank|mentor|student roster)\b/.test(text)
    || (/\b(?:exam|datesheet|date sheet|mse|ese|mst)\b/.test(text) && !/\b(?:result|results|marksheet|mark sheet|grade card|transcript)\b/.test(text));
  if (asksSyllabus || existingTopic) return null;

  if (/\b(?:fees?|tuition|fee structure|semester fee|challan|payment)\b/.test(text)) {
    return answer(`<p><strong>Compass does not guess college fees.</strong> The amount can depend on the program, admission category and session.</p><p>Check the current official ${sourceLink(ADMISSIONS_URL, "admission and fee information")} or call Accounts at <a href="tel:01615064705">0161 5064705</a>.</p><p class="answer-meta">${sourceStamp} ${sourceLink(CONTACT_URL, "GNDEC contact directory")}</p>`, "COLLEGE_FEES", ["avoid an unverified fee amount", "link the current official admission information", "provide the published Accounts phone"]);
  }

  if (/\b(?:canteen|cafeteria)\b/.test(text)) {
    return answer(`<p>GNDEC's 2022 official information brochure listed a canteen in the Day Scholar Club. That brochure does not verify current opening hours, menu or prices.</p><p>Check ${sourceLink(NOTICEBOARD_URL, "current GNDEC notices")} or the ${sourceLink(FACILITIES_BROCHURE_URL, "published facilities brochure")} for current information.</p>`, "COLLEGE_CANTEEN", ["attribute the canteen listing to the 2022 brochure", "avoid stale hours or prices", "link official sources"]);
  }

  if (/\b(?:hostel|accommodation|dorm|residence|mess)\b/.test(text)) {
    return answer(`<p><strong>Hostels and accommodation</strong></p><p>GNDEC's 2024 information brochure lists three boys' hostels and one girls' hostel, and says accommodation is subject to availability.</p><p>For current vacancies, rules or mess details, check the ${sourceLink(NOTICEBOARD_URL, "official notice board")} or the ${sourceLink(HOSTEL_BROCHURE_URL, "2024 hostel brochure")}.</p><p class="answer-meta">The bundled facts do not include current vacancy or mess-price data. ${sourceStamp}</p>`, "COLLEGE_HOSTEL", ["use the dated published hostel information", "do not guess current availability", "link the official notice board and brochure"]);
  }

  if (/\b(?:facilities|amenities|swimming pool|sports complex|auditorium|day scholar club|gurdwara|dispensary)\b/.test(text)) {
    return answer(`<p><strong>Facilities listed in GNDEC's 2022 information brochure</strong></p><p>The brochure lists a canteen, swimming pool, sports and gymnasium hall, Gurdwara Sahib, bank, dispensary, post office, Alumni Home and Open Air Theater. The list is a dated publication, not live confirmation that each facility is open today.</p><p>${sourceLink(FACILITIES_BROCHURE_URL, "Official facilities brochure")}</p>`, "COLLEGE_FACILITIES", ["use the dated official brochure", "do not imply current opening or availability", "link the source"]);
  }

  if (/\b(?:library|librarian|book issue|book return|library card)\b/.test(text)
    && !/\b(?:hours|opening hours|open now|close now|closing time)\b/.test(text)) {
    return answer(`<p><strong>GNDEC Central Library</strong></p><p>The official contact directory lists the library phone as <a href="tel:01615064597">0161 5064597</a> / <a href="tel:01615064598">0161 5064598</a>.</p><p>The bundled official contact page does not list current library opening hours. ${sourceLink(CONTACT_URL, "Check the GNDEC contact page")}</p>`, "COLLEGE_LIBRARY", ["use the official published library contacts", "do not invent opening hours", "link the source"]);
  }

  if (/\b(?:scholarship|stipend|financial aid|fee waiver)\b/.test(text)) {
    return answer(`<p><strong>Scholarship information changes by scheme and session.</strong> Compass does not guess eligibility or deadlines.</p><p>Check current ${sourceLink(NOTICEBOARD_URL, "GNDEC notices")} and ${sourceLink(ADMISSIONS_URL, "admission information")} for the published scheme and contact details.</p>`, "COLLEGE_SCHOLARSHIP", ["avoid stale eligibility details", "link the current official notices and admission page"]);
  }

  if (/\b(?:admit card|hall ticket|roll slip|roll number slip|admit slip)\b/.test(text)) {
    return answer(`<p><strong>Admit-card information is session-specific.</strong> Check the ${sourceLink(NOTICEBOARD_URL, "official GNDEC notice board")} and the ${sourceLink(ACADEMIC_PORTAL_URL, "academic portal")} for current instructions. Compass does not store personal admit cards.</p>`, "COLLEGE_ADMIT_CARD", ["link current official instructions", "do not claim access to private records"]);
  }

  if (/\b(?:admission|admissions|apply|application|counselling|counseling|eligibility|quota)\b/.test(text)) {
    return answer(`<p><strong>GNDEC admissions</strong></p><p>Use the ${sourceLink(ADMISSIONS_URL, "official GNDEC admissions page")} for current eligibility, counselling, quotas, deadlines and fees.</p><p>For the main Academic / Admission office, the GNDEC contact page lists <a href="tel:01615064704">0161 5064704</a>. ${sourceStamp}</p>`, "COLLEGE_ADMISSIONS", ["link current admission rules", "show the published admission contact", "do not freeze annual deadlines"]);
  }

  const hasProgramNoun = /\b(?:courses?|programs?|programmes?|branches|degrees?)\b/.test(text);
  const catalogWording = /\b(?:which|what)\s+(?:courses?|programs?|programmes?|branches|degrees?)\b|\b(?:courses?|programs?|programmes?|branches|degrees?)\s+(?:offered|available|at|in)\b|\b(?:list|show)\s+(?:me\s+)?(?:the\s+)?(?:courses?|programs?|programmes?|branches|degrees?)\b/.test(text);
  const asksPrograms = hasProgramNoun && (namesCollege || catalogWording);
  if (!asksSyllabus && asksPrograms) {
    return answer(`<p><strong>Programs listed on GNDEC's official course page</strong></p>${listPrograms("B.Tech · 4 years", BTECH)}${listPrograms("M.Tech · full time · 2 years", MTECH)}<ul><li>MBA · 2 years · published intake 60</li><li>MCA · 2 years · published intake 60</li><li>BBA · 3 years · published intake 60</li><li>BCA · 3 years · published intake 180</li><li>B.Com (Entrepreneurship) · 3 years · published intake 60</li><li>B.Voc (Interior Design) · 3 years · published intake 30</li><li>GNDEC School of Architecture: B.Arch · 5 years · published intake 40</li></ul><p class="answer-meta">These names and intakes are a snapshot of the official page checked ${COLLEGE_FACTS_CHECKED_AT}; verify the page for later changes. ${sourceLink(COURSES_URL, "Official courses page")}</p>`, "COLLEGE_COURSES", ["read the official courses page", "label the published page snapshot", "link the source for changes"]);
  }

  if (/\b(?:result|results|marksheet|mark sheet|grade card|transcript)\b/.test(text)) {
    return answer(`<p><strong>GNDEC academic portal</strong></p><p>Open the ${sourceLink(ACADEMIC_PORTAL_URL, "official academic portal")} for student academic records. Compass cannot access or guess a student's personal result.</p>`, "COLLEGE_RESULTS", ["link the official academic portal", "do not claim access to private marks"]);
  }

  if (/\b(?:placement|placements|placement rate|placement record|average package|highest package|recruiter|recruiters|companies visited)\b/.test(text)) {
    return answer(`<p><strong>Current placement statistics are not bundled in Compass.</strong> Older brochure figures may be stale, so I will not present them as current.</p><p>The official contact directory lists the Training and Placement Cell at <a href="tel:01615064511">0161 5064511</a>. ${sourceLink(CONTACT_URL, "GNDEC contact directory")}</p>`, "COLLEGE_PLACEMENTS", ["refuse stale placement statistics", "provide the published Training and Placement Cell phone"]);
  }

  if (/\b(?:library hours|opening hours|open now|close now|closing time)\b/.test(text)) {
    return answer(`<p>The bundled official GNDEC contact page does not publish current library hours. Call the Central Library at <a href="tel:01615064597">0161 5064597</a> or <a href="tel:01615064598">0161 5064598</a>, or check ${sourceLink(CONTACT_URL, "the official contact page")}.</p>`, "COLLEGE_HOURS_UNVERIFIED", ["report that hours are not published in the loaded facts", "provide verified contacts"]);
  }

  if (/\b(?:autonomous|affiliat(?:ed|ion)|university|aicte|ugc|accreditation|naac)\b/.test(text)
    && (namesCollege || /\b(?:autonomous|affiliat(?:ed|ion)|aicte|ugc|naac)\b/.test(text))) {
    return answer(`<p>GNDEC's official history page says UGC conferred Autonomous Status in 2012. GNDEC's public UGC self-disclosure lists I.K. Gujral Punjab Technical University as its affiliating university.</p><p>For current recognition or accreditation status, use the latest ${sourceLink(UGC_DISCLOSURE_URL, "UGC self-disclosure")} rather than relying on older summaries. ${sourceLink(HISTORY_URL, "GNDEC history page")}</p>`, "COLLEGE_AFFILIATION", ["separate historical status from current affiliation", "link the latest disclosure and official history"]);
  }

  if (/\b(?:history|established|founded|foundation|founder|mission|began|started)\b/.test(text)) {
    return answer(`<p><strong>GNDEC history and mission</strong></p><p>Guru Nanak Dev Engineering College was established under the Nankana Sahib Education Trust in 1956. The college history page says its foundation stone was laid on 8 April 1956 by Dr. Rajendra Prasad, India's first President. The page identifies the trust's mission as “Removal of Economic Backwardness through Technology.”</p><p>${sourceLink(HISTORY_URL, "Official GNDEC history")}</p>`, "COLLEGE_HISTORY", ["use GNDEC's official history page", "keep the founding facts source-linked"]);
  }

  const asksForContact = /\b(?:address|contact|phone|telephone|email|e mail)\b/.test(text);
  const asksForCollegeDirections = namesCollege && /\b(?:where is|location|how to reach|directions|distance|railway station|bus stand|airport)\b/.test(text);
  if (asksForContact || asksForCollegeDirections) {
    const distances = /\b(?:distance|railway station|bus stand|airport|how to reach|directions)\b/.test(text)
      ? `<p>The GNDEC contact page states the campus is 7 km from Ludhiana Railway Station, 6 km from the Main Bus Stand and 15 km from the airport. Use a current map for the route.</p>`
      : "";
    return answer(`<p><strong>Guru Nanak Dev Engineering College</strong><br>Gill Park, Gill Road, Ludhiana 141006, Punjab, India.</p><p>Main phone: <a href="tel:01615064501">0161 5064501</a><br>Email: <a href="mailto:principal@gndec.ac.in">principal@gndec.ac.in</a><br>Academic / Admission: <a href="tel:01615064704">0161 5064704</a></p>${distances}<p>${sourceLink(CONTACT_URL, "Official GNDEC contact page")}</p>`, "COLLEGE_CONTACT", ["read the official address and contact details", "link the source page"]);
  }

  const overviewOnly = contentTokens(text).filter((token) => !["gndec", "guru", "nanak", "dev", "engineering", "college", "campus", "institute", "institution"].includes(token));
  if (namesCollege && !overviewOnly.length && /\b(?:about|college|gndec|institute|campus|who are|what is|tell me)\b/.test(text)) {
    return answer(`<p><strong>Guru Nanak Dev Engineering College (GNDEC)</strong> is in Gill Park, Gill Road, Ludhiana. Its official history page says the college was established in 1956 under the Nankana Sahib Education Trust.</p><p>The public site has separate pages for ${sourceLink(COURSES_URL, "programs" )}, ${sourceLink(CONTACT_URL, "contacts")}, and ${sourceLink(HISTORY_URL, "history")}.</p>`, "COLLEGE_OVERVIEW", ["summarize source-backed college identity", "offer direct official links"]);
  }

  return null;
}

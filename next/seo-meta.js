/**
 * Shared SEO metadata for GNDEC Compass Next.
 *
 * Pure data + string helpers. Imported by the Worker (head injection), the
 * browser app (client-side metadata) and the static page generator, so a
 * crawler and a student always see the same title, description and JSON-LD.
 *
 * No DOM, no network, no framework.
 */

export const SITE = Object.freeze({
  name: "GNDEC Compass",
  shortName: "Compass",
  alternateName: [
    "GNDEC Compass Next",
    "GNDEC Timetable",
    "GNDEC Time Table",
    "GNDEC Class Schedule",
    "GNDEC Free Rooms",
    "GNDEC Exam Datesheet",
    "Guru Nanak Dev Engineering College Timetable"
  ],
  tagline: "Verified GNDEC timetable, free rooms, faculty and exam datesheet",
  description:
    "GNDEC Compass is the verified timetable and free-room companion for Guru Nanak Dev Engineering College, Ludhiana. Check any section's class schedule, teacher, room, free periods and end-semester exam datesheet. Works offline, never guesses.",
  locale: "en_IN",
  language: "en-IN",
  themeColor: "#06110e",
  defaultOrigin: "https://gndec-compass-next.koush3069.workers.dev",
  college: Object.freeze({
    name: "Guru Nanak Dev Engineering College",
    shortName: "GNDEC",
    alternateName: ["GNDEC Ludhiana", "Guru Nanak Dev Engineering College Ludhiana", "GNDEC Gill Road"],
    address: Object.freeze({
      streetAddress: "Gill Road",
      addressLocality: "Ludhiana",
      addressRegion: "Punjab",
      postalCode: "141006",
      addressCountry: "IN"
    }),
    telephone: "+91-161-2502700",
    email: "principal@gndec.ac.in",
    url: "https://gndec.ac.in/",
    founded: "1956",
    affiliation: "IK Gujral Punjab Technical University (IKGPTU)",
    approvedBy: "All India Council for Technical Education (AICTE)",
    autonomousSince: "2012",
    accreditation: "NAAC A Grade",
    departments: [
      "Civil Engineering", "Mechanical & Production Engineering", "Electrical Engineering",
      "Electronics & Communication Engineering", "Computer Science & Engineering",
      "Information Technology", "Applied Sciences", "School of Architecture",
      "Business Administration", "Computer Applications"
    ]
  })
});

/** Route ids, URL slugs and human metadata. */
export const ROUTES = Object.freeze({
  today: {
    slug: "today",
    title: "Today's Classes, Free Rooms and Next Lecture — GNDEC Compass",
    heading: "Today at GNDEC",
    description:
      "See today's GNDEC classes for your section, the current or next lecture, room and teacher, free periods and free rooms right now. Verified from the official college timetable.",
    keywords: ["gndec today class", "gndec next lecture", "aaj ki class", "gndec free rooms today", "gndec timetable today"]
  },
  timetable: {
    slug: "timetable",
    title: "GNDEC Timetable — Every Section, Subject, Teacher and Room",
    heading: "GNDEC Timetable",
    description:
      "The full official GNDEC weekly timetable for every section: CEA, CEB, CSA, CSB, CSC, CSD, CSE, CSF, ECA, ECB, EEA, EEB, ITA, ITB, ITC, MEA, MEB, RAI and more. Search any subject, teacher or room.",
    keywords: ["gndec timetable", "gndec time table", "gndec class schedule", "gndec section timetable", "gndec subject schedule", "gndec da timetable", "gndec di timetable"]
  },
  rooms: {
    slug: "rooms",
    title: "GNDEC Free Rooms — Find an Empty Classroom or Lab Now",
    heading: "Free Rooms at GNDEC",
    description:
      "Find free classrooms, lecture halls and labs at GNDEC Ludhiana right now, or at any hour or day. Calculated from the official room timetable, with free-until times.",
    keywords: ["gndec free rooms", "gndec empty classroom", "gndec lab availability", "gndec room timetable", "khali room gndec", "free room now gndec"]
  },
  teachers: {
    slug: "teachers",
    title: "GNDEC Teachers Timetable - Find Any Faculty Member's Classes",
    heading: "GNDEC Teacher Timetable",
    description:
      "Search every teacher printed in the official GNDEC timetable and open their published weekly classes, subjects, sections and rooms. No teacher or class is guessed.",
    keywords: ["gndec teacher timetable", "gndec faculty timetable", "gndec professor schedule", "gndec teacher classes", "gndec faculty schedule"]
  },
  ask: {
    slug: "ask",
    title: "Ask Compass — GNDEC Timetable Assistant in English, Hinglish, Punjabi",
    heading: "Ask Compass",
    description:
      "Ask any GNDEC timetable question in English, Hinglish, romanised Punjabi or romanised Hindi. Compass understands typos, shortforms, subject codes and nicknames, and answers only from verified college data.",
    keywords: ["gndec timetable assistant", "ask gndec", "gndec timetable chatbot", "gndec timetable in hinglish", "gndec timetable punjabi", "gndec next class kaunsi hai"]
  },
  notices: {
    slug: "notices",
    title: "GNDEC Notices, Academic Calendar and Exam Updates",
    heading: "GNDEC Notices",
    description:
      "Every published GNDEC notice collected in one place: examination notices, academic calendar updates, fee and admission notices, with direct links to the official college page.",
    keywords: ["gndec notices", "gndec notice board", "gndec academic calendar", "gndec exam notice", "gndec latest news"]
  },
  papers: {
    slug: "papers",
    title: "GNDEC Question Banks and Previous Year Papers — Official PDFs",
    heading: "GNDEC Question Banks",
    description:
      "Every subject question bank and previous-year paper that a GNDEC department publishes, with a direct link to the official PDF. Search by subject, code, department or semester.",
    keywords: ["gndec question bank", "gndec previous year papers", "gndec sqb", "it gndec question papers", "gndec subject question bank", "gndec old papers"]
  },
  syllabus: {
    slug: "syllabus",
    title: "GNDEC Syllabus — Every Department and Batch, Official PDFs",
    heading: "GNDEC Syllabus",
    description:
      "Official GNDEC syllabus documents for every department and batch, linked directly from the department sites. Search by department, batch or semester.",
    keywords: ["gndec syllabus", "gndec btech syllabus", "gndec it syllabus", "gndec cse syllabus", "gndec syllabus pdf", "gndec batch 2024 syllabus"]
  },
  calendar: {
    slug: "calendar",
    title: "GNDEC Academic Calendar, Holidays and Exam Periods",
    heading: "Academic Calendar",
    description:
      "The official GNDEC academic calendar for July–December 2026, the published holiday list and every admin-confirmed change, with the source PDF for each entry.",
    keywords: ["gndec academic calendar", "gndec holidays", "gndec holiday list 2026", "gndec exam dates", "gndec semester dates"]
  },
  admin: {
    slug: "admin",
    title: "GNDEC Compass Admin",
    heading: "Admin",
    description: "Private publishing workspace for GNDEC Compass notices, date sheets, question banks, syllabus links and announcements.",
    keywords: ["gndec compass admin", "compass publishing"]
  },
  directory: {
    slug: "directory",
    title: "GNDEC Faculty, Student and Syllabus Directory",
    heading: "College Directory",
    description:
      "Search GNDEC faculty by name, department or designation, find a student's section and mentor on this device, and search the official first-year syllabus. Nothing is sent to a server.",
    keywords: ["gndec faculty", "gndec teachers list", "gndec student search", "gndec syllabus", "gndec directory", "gndec mentor"]
  },
  compare: {
    slug: "compare",
    title: "Compare GNDEC Sections — Timetables Side by Side",
    heading: "Compare Sections",
    description:
      "Compare any two GNDEC sections side by side: classes, shared subjects and teachers, and the free windows both sections have in common. Calculated from the official timetable.",
    keywords: ["compare gndec timetable", "gndec two sections", "gndec free time", "gndec common free period", "gndec section comparison"]
  },
  settings: {
    slug: "settings",
    title: "GNDEC Compass Settings — Profiles, Data, Offline and Legacy",
    heading: "Settings",
    description:
      "Choose your GNDEC section and subsection, manage offline data, reminders, themes and startup behaviour, or open the frozen legacy Compass build. All profile data stays on your device.",
    keywords: ["gndec compass settings", "gndec compass profile", "gndec compass legacy"]
  }
});

export const ROUTE_ORDER = Object.freeze(["today", "timetable", "rooms", "teachers", "ask", "notices", "papers", "syllabus", "calendar", "directory", "compare", "settings"]);

export function normalizeOrigin(origin = "") {
  const raw = String(origin || "").trim();
  if (!raw) return SITE.defaultOrigin;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return SITE.defaultOrigin;
    return `${url.protocol}//${url.host}`;
  } catch {
    return SITE.defaultOrigin;
  }
}

/** Escape text for an HTML attribute or element. */
export function escapeAttr(value = "") {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeText(value = "") {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Resolve the active route from a pathname and/or hash, supporting both clean
 * URLs (`/timetable`, `/college/cea-timetable`) and the hash fallback
 * (`#/timetable`) used by old links and file:// previews.
 */
export function routeFromPath(pathname = "/", hash = "") {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean).map((piece) => {
    try { return decodeURIComponent(piece).toLowerCase(); } catch { return piece.toLowerCase(); }
  });
  const hashRoute = String(hash || "").replace(/^#\/?/, "").split("/")[0].toLowerCase();
  if (hashRoute && ROUTES[hashRoute]) return { route: hashRoute, path, canonicalPath: `/${hashRoute}`, section: "" };
  if (!segments.length) return { route: "today", path, canonicalPath: "/", section: "" };
  if (ROUTES[segments[0]]) return { route: segments[0], path, canonicalPath: path, section: segments[1] || "" };
  if (segments[0] === "college") {
    // Static SEO pages live at /college/<slug>/; the app itself stays routed.
    return { route: "timetable", path, canonicalPath: path, section: segments[1] || "" };
  }
  return { route: "today", path, canonicalPath: "/", section: "" };
}

export function routeMeta(route = "today") {
  return ROUTES[route] || ROUTES.today;
}

/** Title and description for one app route (optionally a named section). */
export function metaForRoute(route = "today", { section = "", query = "" } = {}) {
  const base = routeMeta(route);
  const cleanSection = String(section || "").trim().toUpperCase().slice(0, 24);
  let title = base.title;
  let description = base.description;
  let heading = base.heading;
  if (cleanSection && /^[A-Z0-9]{1,12}$/.test(cleanSection)) {
    title = `${cleanSection} Timetable — GNDEC Class Schedule, Teachers and Rooms`;
    heading = `${cleanSection} timetable`;
    description = `Official GNDEC weekly timetable for section ${cleanSection}: every lecture, tutorial and practical with subject, teacher, room and time. Ask Compass for the next class in English, Hinglish or Punjabi.`;
  }
  if (String(query || "").trim()) {
    const q = String(query).trim().slice(0, 80);
    description = `${description} You searched for “${q}”.`;
  }
  return { ...base, title, description, heading, section: cleanSection };
}

/** JSON-LD for the site itself. Emitted on every page. */
export function webApplicationJsonLd(origin = SITE.defaultOrigin) {
  const url = normalizeOrigin(origin);
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE.name,
    alternateName: SITE.alternateName,
    url,
    description: SITE.description,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any (web, Android, iOS, Windows, macOS, Linux)",
    browserRequirements: "Requires JavaScript. Works offline after the first visit.",
    inLanguage: ["en-IN", "en", "hi-Latn", "pa-Latn"],
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    featureList: [
      "Section-wise GNDEC timetable", "Teacher and room lookup", "Free room and free period finder",
      "End-semester exam datesheet", "Offline PWA", "Deterministic Ask Compass in English, Hinglish and Punjabi"
    ],
    publisher: { "@type": "Organization", name: SITE.name, url },
    about: collegeJsonLd(),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${url}/timetable?q={search_term_string}` },
      "query-input": "required name=search_term_string"
    }
  };
}

/** JSON-LD describing the college, using only verified official facts. */
export function collegeJsonLd() {
  const college = SITE.college;
  return {
    "@context": "https://schema.org",
    "@type": "CollegeOrUniversity",
    name: college.name,
    alternateName: college.alternateName,
    url: college.url,
    foundingDate: college.founded,
    telephone: college.telephone,
    email: college.email,
    address: { "@type": "PostalAddress", ...college.address },
    department: college.departments.map((name) => ({ "@type": "EducationalOrganization", name: `${name} Department, GNDEC` })),
    parentOrganization: { "@type": "CollegeOrUniversity", name: college.affiliation }
  };
}

/** Breadcrumb JSON-LD for a route. */
export function breadcrumbJsonLd(origin, route, { section = "" } = {}) {
  const url = normalizeOrigin(origin);
  const base = routeMeta(route);
  const items = [
    { "@type": "ListItem", position: 1, name: "GNDEC Compass", item: `${url}/` },
    { "@type": "ListItem", position: 2, name: base.heading, item: `${url}/${base.slug}` }
  ];
  if (section) items.push({ "@type": "ListItem", position: 3, name: `${section} timetable`, item: `${url}/timetable?section=${encodeURIComponent(section)}` });
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items };
}

export function faqJsonLd(origin = SITE.defaultOrigin) {
  const url = normalizeOrigin(origin);
  const faqs = [
    ["How do I check my GNDEC timetable?", "Open Compass, choose your section in Timetable, and the full weekly schedule appears with subject, teacher, room and time. You can also ask “mera agla class kab hai” in Ask Compass.", `${url}/timetable`],
    ["Which room is free at GNDEC right now?", "Open Free Rooms. Compass checks the official room timetable for every published classroom and lab and lists the rooms with no class in your chosen window.", `${url}/rooms`],
    ["Can Compass tell me my GNDEC exam datesheet?", "Yes. Compass shows the official tentative end-semester datesheet by branch and subject. It never invents a date, session or room.", `${url}/ask`],
    ["Does GNDEC Compass work offline?", "Yes. After the first visit the app shell and the last verified timetable are cached, so the timetable and Ask Compass keep working without a network.", `${url}/`],
    ["Is Ask Compass an AI chatbot?", "Ask Compass is a deterministic engine over verified college data, with optional open-ended AI only for non-factual chat. Timetable, room, teacher and exam answers are never generated by a model.", `${url}/ask`],
    ["Can I ask in Hinglish, Punjabi or Hindi?", "Yes. You can type English, Hinglish, romanised Punjabi or romanised Hindi, including shortforms, subject codes, nicknames and typos.", `${url}/ask`]
  ];
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer, page]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer, url: page }
    }))
  };
}

export function itemListJsonLd(origin, name, items = []) {
  const url = normalizeOrigin(origin);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 200).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url || `${url}/`
    }))
  };
}

/**
 * Full head markup for a route. `markerOnly` returns just the dynamic block so
 * the Worker and the browser can replace the same region.
 */
export function headTags({ origin = SITE.defaultOrigin, route = "today", section = "", query = "", includeJsonLd = true } = {}) {
  const base = normalizeOrigin(origin);
  const meta = metaForRoute(route, { section, query });
  const canonical = section && route === "timetable"
    ? `${base}/timetable?section=${encodeURIComponent(String(section).toUpperCase())}`
    : `${base}/${meta.slug}`;
  const keywords = [...new Set([...meta.keywords, ...SITE.alternateName.map((name) => name.toLowerCase())])].join(", ");
  const image = `${base}/icons/og-cover.svg`;
  const robots = route === "admin" ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
  const blocks = [
    `<title>${escapeText(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="keywords" content="${escapeAttr(keywords)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta name="googlebot" content="index, follow" />`,
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeAttr(SITE.name)}" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    `<meta property="og:image:alt" content="GNDEC Compass — verified timetable and free rooms" />`,
    `<meta property="og:locale" content="${SITE.locale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
    `<meta name="geo.region" content="IN-PB" />`,
    `<meta name="geo.placename" content="Ludhiana" />`,
    `<meta name="geo.position" content="30.9253;75.8310" />`,
    `<meta name="ICBM" content="30.9253, 75.8310" />`,
    `<meta name="author" content="${escapeAttr(SITE.name)}" />`,
    `<meta name="application-name" content="${escapeAttr(SITE.name)}" />`,
    `<link rel="alternate" hreflang="en-in" href="${escapeAttr(canonical)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeAttr(canonical)}" />`
  ];
  if (includeJsonLd) {
    const graph = [
      webApplicationJsonLd(base),
      breadcrumbJsonLd(base, route, { section }),
      route === "ask" || route === "today" ? faqJsonLd(base) : null
    ].filter(Boolean);
    blocks.push(`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`);
  }
  return blocks.join("\n");
}

/** Inject a head block into an existing HTML document. */
export function injectHead(html, head) {
  const source = String(html || "");
  if (!head) return source;
  const start = "<!--COMPASS_SEO-->";
  const end = "<!--/COMPASS_SEO-->";
  if (source.includes(start) && source.includes(end)) {
    const from = source.indexOf(start);
    const to = source.indexOf(end) + end.length;
    return `${source.slice(0, from)}${start}\n${head}\n${end}${source.slice(to)}`;
  }
  if (source.includes("</head>")) return source.replace("</head>", `${head}\n</head>`);
  return `${head}\n${source}`;
}

/** Inline <head> block inner content used by the generator. */
export function headBlock(options = {}) {
  return `<!--COMPASS_SEO-->\n${headTags(options)}\n<!--/COMPASS_SEO-->`;
}

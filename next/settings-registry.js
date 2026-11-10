/**
 * GNDEC Compass Next — feature registry.
 *
 * Every user-visible option is declared exactly once here. The registry is
 * plain data so it can be imported by the browser, by Node tests, and by
 * documentation tooling without a DOM or a build step.
 *
 * Rules:
 *  - ids are stable, dotted, and namespaced by category;
 *  - every flag has a default, a type, a risk level and a status;
 *  - experimental flags are never enabled by default;
 *  - the college map is intentionally not bundled. The flag exists so the
 *    setting is visible and disabled, and so a future lazy chunk can bind to
 *    it without shipping map bytes to anyone who has not opted in.
 */

export const SETTINGS_SCHEMA_VERSION = 2;
export const SETTINGS_KEY = "gndec-compass-next-settings-v2";
export const LEGACY_SETTINGS_KEY = "gndec-compass-settings-v1";
export const LEGACY_BRAIN_KEY = "gndec-compass-brain-v2-enabled-v1";
export const LEGACY_PROFILE_KEY = "gndec-compass-student-v1";
export const LEGACY_GROUP_KEY = "gndec-compass-group-v3";
export const LEGACY_SUBGROUP_KEY = "gndec-compass-subgroup-v3";

export const APP_VERSION = "2.1.9";
export const APP_CHANNEL = "stable";

export const THEMES = ["system", "light", "dark", "oled"];
export const ACCENTS = ["emerald", "azure", "amber", "rose", "violet", "teal", "indigo", "coral", "lime"];
export const DENSITIES = ["comfortable", "compact"];
export const EXPERIENCES = ["new", "classic", "safe"];

export const CATEGORIES = Object.freeze([
  { id: "experience", title: "Experience & rollback", icon: "history", order: 10, description: "Switch between the new app, the classic layout and the frozen legacy build." },
  { id: "appearance", title: "Appearance", icon: "palette", order: 20, description: "Theme, colour, type and motion." },
  { id: "navigation", title: "Navigation", icon: "compass", order: 30, description: "Where Compass opens and how you move around it." },
  { id: "today", title: "Today", icon: "sun", order: 40, description: "What the home screen shows first." },
  { id: "timetable", title: "Timetable", icon: "grid", order: 50, description: "Views, columns and clock format." },
  { id: "rooms", title: "Rooms", icon: "door", order: 60, description: "Free-room finder behaviour." },
  { id: "ask", title: "Ask Compass", icon: "spark", order: 70, description: "Answer engine, evidence and language." },
  { id: "data", title: "Data & offline", icon: "database", order: 80, description: "Updates, caching, storage and data rollback." },
  { id: "notifications", title: "Notifications", icon: "bell", order: 90, description: "Class, exam and notice reminders." },
  { id: "privacy", title: "Privacy", icon: "shield", order: 100, description: "What leaves this device and what never does." },
  { id: "accessibility", title: "Accessibility", icon: "accessibility", order: 110, description: "Text size, contrast, motion and screen readers." },
  { id: "labs", title: "Advanced & Labs", icon: "flask", order: 120, description: "Experimental features. Off by default, always reversible." }
].map(Object.freeze));

/** @typedef {"boolean"|"select"|"range"|"action"|"info"} FlagType */

function flag(id, title, description, options) {
  return Object.freeze({
    id,
    title,
    description,
    category: options.category,
    type: options.type || "boolean",
    default: options.default,
    values: options.values ? Object.freeze(options.values) : undefined,
    min: options.min,
    max: options.max,
    step: options.step,
    unit: options.unit,
    badge: options.badge || "",
    status: options.status || "stable",
    risk: options.risk || "low",
    since: options.since || "2.0.0",
    dependsOn: options.dependsOn,
    requiresRestart: Boolean(options.requiresRestart),
    scope: options.scope || "device",
    keywords: options.keywords || "",
    note: options.note || ""
  });
}

export const FLAGS = Object.freeze([
  // ── Experience & rollback ────────────────────────────────────────────────
  flag("experience.mode", "Experience", "New is the redesigned app. Classic keeps the familiar dense layout. Safe mode removes animation, prefetching and optional network calls.", {
    category: "experience", type: "select", default: "new", values: [
      { value: "new", label: "New (recommended)" },
      { value: "classic", label: "Classic layout" },
      { value: "safe", label: "Safe mode" }
    ], keywords: "ui layout rollback classic safe"
  }),
  flag("experience.legacyCard", "Show legacy build card", "Keep a clearly labelled card in Settings that opens the frozen legacy build.", {
    category: "experience", default: true, keywords: "legacy old version rollback"
  }),
  flag("experience.legacyNewTab", "Open legacy in a new tab", "The legacy build has its own service worker scope, so it opens separately instead of fighting the new cache.", {
    category: "experience", default: true, dependsOn: "experience.legacyCard", risk: "low", keywords: "legacy tab"
  }),
  flag("experience.showBuildChannel", "Show build channel", "Display whether this build is stable or beta in the header.", {
    category: "experience", default: false, keywords: "beta stable build"
  }),
  flag("experience.previousBuild", "Show previous generation", "Keep a labelled card that opens the earlier 2.0 Worker in a new tab. It has its own storage and never shares this app's cache.", {
    category: "experience", default: true, keywords: "v2 previous rollback old build"
  }),
  flag("experience.adminLink", "Show admin link", "Show the publishing shortcut in Settings. The admin page itself always requires a token.", {
    category: "experience", default: true, keywords: "admin publish upload"
  }),

  // ── Appearance ───────────────────────────────────────────────────────────
  flag("appearance.theme", "Theme", "Dark is the default. Choose light, follow your device, or use true-black OLED.", {
    category: "appearance", type: "select", default: "dark", values: [
      { value: "system", label: "System" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
      { value: "oled", label: "OLED black" }
    ], keywords: "dark light theme colour"
  }),
  flag("appearance.accent", "Accent colour", "Used for highlights, focus rings and the active navigation item.", {
    category: "appearance", type: "select", default: "emerald", values: [
      { value: "emerald", label: "Emerald" },
      { value: "azure", label: "Azure" },
      { value: "amber", label: "Amber" },
      { value: "rose", label: "Rose" },
      { value: "violet", label: "Violet" },
      { value: "teal", label: "Teal" },
      { value: "indigo", label: "Indigo" },
      { value: "coral", label: "Coral" },
      { value: "lime", label: "Lime" }
    ], keywords: "colour accent green blue"
  }),
  flag("appearance.palette", "Colour palette", "Choose the overall surface colours for both light and dark themes.", {
    category: "appearance", type: "select", default: "forest", values: [
      { value: "forest", label: "Forest green" },
      { value: "ocean", label: "Ocean blue" },
      { value: "sand", label: "Warm sand" },
      { value: "graphite", label: "Graphite" },
      { value: "lavender", label: "Lavender" },
      { value: "slate", label: "Blue slate" }
    ], keywords: "colour combination background surfaces palette"
  }),
  flag("appearance.background", "Background style", "Use a quiet solid background or a subtle colour wash.", {
    category: "appearance", type: "select", default: "solid", values: [
      { value: "solid", label: "Quiet solid" },
      { value: "wash", label: "Soft colour wash" },
      { value: "aurora", label: "Aurora glow" },
      { value: "mist", label: "Layered mist" }
    ], keywords: "gradient background colour"
  }),
  flag("appearance.density", "Density", "Compact reduces vertical spacing for small screens and long timetables.", {
    category: "appearance", type: "select", default: "comfortable", values: [
      { value: "comfortable", label: "Comfortable" },
      { value: "compact", label: "Compact" }
    ], keywords: "spacing compact"
  }),
  flag("appearance.fontScale", "Text size", "Scales the whole interface. 100% is the design default.", {
    category: "appearance", type: "range", default: 100, min: 90, max: 130, step: 5, unit: "%", keywords: "font size text bigger"
  }),
  flag("appearance.reduceMotion", "Reduce motion", "Stops transitions, parallax and animated reveals.", {
    category: "appearance", default: false, keywords: "animation motion accessibility"
  }),
  flag("appearance.highContrast", "High contrast", "Stronger borders and text contrast.", {
    category: "appearance", default: false, keywords: "contrast accessibility"
  }),
  flag("appearance.colorBlindPalette", "Colour-blind friendly palette", "Replaces accent-only status colours with labelled, pattern-safe badges.", {
    category: "appearance", default: false, keywords: "colour blind accessibility"
  }),
  flag("appearance.rounded", "Rounded corners", "Turn off for a squarer, more utilitarian look.", {
    category: "appearance", default: true, keywords: "radius corners"
  }),
  flag("appearance.glass", "Translucent surfaces", "Subtle backdrop blur. Disabled automatically in Safe mode and on low-power devices.", {
    category: "appearance", default: true, keywords: "blur glass transparency"
  }),
  flag("appearance.timetableColors", "Subject colours", "Give each subject a stable colour across Today and Timetable.", {
    category: "appearance", default: true, keywords: "subject colour timetable"
  }),

  // ── Navigation ───────────────────────────────────────────────────────────
  flag("nav.landing", "Start page", "Where Compass opens when you launch it.", {
    category: "navigation", type: "select", default: "today", values: [
      { value: "today", label: "Today" },
      { value: "timetable", label: "Timetable" },
      { value: "rooms", label: "Rooms" },
      { value: "ask", label: "Ask Compass" }
    ], keywords: "home start landing"
  }),
  flag("nav.bottomItems", "Bottom navigation", "How many destinations appear on the mobile bar.", {
    category: "navigation", type: "select", default: "5", values: [
      { value: "4", label: "4 items" },
      { value: "5", label: "5 items" }
    ], keywords: "mobile nav bottom"
  }),
  flag("nav.commandPalette", "Command palette", "Press Ctrl/Cmd+K to jump anywhere or run an action.", {
    category: "navigation", default: true, keywords: "keyboard search command"
  }),
  flag("nav.sidebarCollapsed", "Collapse sidebar", "Start with the desktop sidebar collapsed to icons.", {
    category: "navigation", default: false, keywords: "sidebar desktop"
  }),
  flag("nav.shortcuts", "Show shortcuts", "Surface keyboard shortcuts on the Today page.", {
    category: "navigation", default: true, keywords: "keyboard shortcuts"
  }),
  flag("nav.confirmExternal", "Confirm external links", "Ask before leaving Compass for an official college page.", {
    category: "navigation", default: true, keywords: "external link warning"
  }),

  // ── Today ────────────────────────────────────────────────────────────────
  flag("today.hero", "Hero card", "The large card at the top of Today.", {
    category: "today", type: "select", default: "next", values: [
      { value: "next", label: "Next class" },
      { value: "timeline", label: "Day timeline" },
      { value: "minimal", label: "Minimal" }
    ], keywords: "home hero"
  }),
  flag("today.leaveNow", "Leave-now hint", "Show a walking reminder before the next class when the room is known.", {
    category: "today", default: true, keywords: "leave now reminder"
  }),
  flag("today.freeRoomsCard", "Free rooms card", "Show rooms that are free right now.", {
    category: "today", default: true, keywords: "rooms free today"
  }),
  flag("today.examCountdown", "Exam countdown", "Show the next published exam date when available.", {
    category: "today", default: true, keywords: "exam countdown"
  }),
  flag("today.noticesCard", "Notices card", "Show the latest verified academic notices.", {
    category: "today", default: true, keywords: "notices news"
  }),
  flag("today.holidayBanner", "Holiday banner", "Show a banner on declared holidays and restricted holidays.", {
    category: "today", default: true, keywords: "holiday"
  }),
  flag("today.freshnessBadge", "Data freshness", "Show when the timetable was last verified.", {
    category: "today", default: true, keywords: "freshness verified"
  }),
  flag("today.quickAsk", "Quick ask", "Show three suggested questions on Today.", {
    category: "today", default: true, keywords: "ask suggestions"
  }),
  flag("today.attendanceCard", "Attendance card", "Track attendance against your target. Requires attendance entries.", {
    category: "today", default: false, badge: "Beta", keywords: "attendance"
  }),

  // ── Timetable ────────────────────────────────────────────────────────────
  flag("timetable.view", "Default view", "The view Timetable opens in.", {
    category: "timetable", type: "select", default: "day", values: [
      { value: "day", label: "Day" },
      { value: "week", label: "Week grid" },
      { value: "agenda", label: "Agenda list" }
    ], keywords: "timetable view day week"
  }),
  flag("timetable.weekStart", "Week starts", "First day of the week grid.", {
    category: "timetable", type: "select", default: "monday", values: [
      { value: "monday", label: "Monday" },
      { value: "sunday", label: "Sunday" }
    ], keywords: "week start"
  }),
  flag("timetable.clock", "Clock format", "12-hour or 24-hour times.", {
    category: "timetable", type: "select", default: "12h", values: [
      { value: "12h", label: "12-hour" },
      { value: "24h", label: "24-hour" }
    ], keywords: "clock time format"
  }),
  flag("timetable.showEmpty", "Show empty slots", "Keep free periods visible in the day view.", {
    category: "timetable", default: false, keywords: "empty free slots"
  }),
  flag("timetable.showParallel", "Show parallel practicals", "Display every cohort scheduled in the same slot.", {
    category: "timetable", default: true, keywords: "parallel practical lab"
  }),
  flag("timetable.showTeacher", "Show teacher", "Display the teacher on each class card.", {
    category: "timetable", default: true, keywords: "teacher faculty"
  }),
  flag("timetable.showRoom", "Show room", "Display the published room on each class card.", {
    category: "timetable", default: true, keywords: "room venue"
  }),
  flag("timetable.showCode", "Show class type", "Display L / T / P tags.", {
    category: "timetable", default: true, keywords: "lecture tutorial practical"
  }),
  flag("timetable.highlightNow", "Highlight current class", "Emphasise the class happening now.", {
    category: "timetable", default: true, keywords: "now current"
  }),
  flag("timetable.compact", "Compact cards", "Smaller class cards with fewer lines.", {
    category: "timetable", default: false, keywords: "compact dense"
  }),
  flag("timetable.stickyHeaders", "Sticky day headers", "Keep the day label visible while scrolling.", {
    category: "timetable", default: true, keywords: "sticky header"
  }),
  flag("timetable.examOverlay", "Exam overlay", "Mark published exam days on the timetable.", {
    category: "timetable", default: true, badge: "Beta", keywords: "exam overlay"
  }),
  flag("timetable.showWeekends", "Show weekends", "Include Saturday and Sunday in the week grid.", {
    category: "timetable", default: false, keywords: "weekend saturday sunday"
  }),

  // ── Rooms ────────────────────────────────────────────────────────────────
  flag("rooms.defaultDuration", "Default duration", "How long a room must stay free.", {
    category: "rooms", type: "select", default: "60", values: [
      { value: "30", label: "30 minutes" },
      { value: "60", label: "1 hour" },
      { value: "90", label: "1.5 hours" },
      { value: "120", label: "2 hours" }
    ], keywords: "duration free room"
  }),
  flag("rooms.groupBy", "Group rooms by", "How the free-room list is organised.", {
    category: "rooms", type: "select", default: "block", values: [
      { value: "block", label: "Block" },
      { value: "none", label: "Flat list" }
    ], keywords: "group block"
  }),
  flag("rooms.showFreeUntil", "Show free until", "Display when a free room's next class starts.", {
    category: "rooms", default: true, keywords: "free until"
  }),
  flag("rooms.showNextClass", "Show next class", "Display the next scheduled class in each room.", {
    category: "rooms", default: true, keywords: "next class room"
  }),
  flag("rooms.includeLabs", "Include labs", "Include laboratory and workshop rooms.", {
    category: "rooms", default: true, keywords: "labs workshops"
  }),
  flag("rooms.includeLectureHalls", "Include lecture halls", "Include ordinary classrooms.", {
    category: "rooms", default: true, keywords: "classrooms lectures"
  }),
  flag("rooms.favourites", "Favourite rooms", "Pin rooms you use often.", {
    category: "rooms", default: true, keywords: "favourite pin"
  }),
  flag("rooms.heatmap", "Hour-by-room heatmap", "A grid of free and busy hours. Computed locally.", {
    category: "rooms", default: false, badge: "Beta", keywords: "heatmap grid"
  }),
  flag("rooms.map", "Campus map", "Not bundled in this build. The option stays off and loads no map code or tiles.", {
    category: "rooms", default: false, status: "experimental", badge: "Not bundled", risk: "low", note: "No map assets are shipped. Enabling this flag has no effect until a lazy map chunk is added.", keywords: "map campus location"
  }),

  // ── Ask Compass ──────────────────────────────────────────────────────────
  flag("ask.engine", "Answer engine", "Auto runs the verified deterministic Brain chain first, then the legacy-safe fallback. Local only skips Brain v2. External AI is never used for factual timetable questions.", {
    category: "ask", type: "select", default: "auto", values: [
      { value: "auto", label: "Auto — Brain + safe fallback" },
      { value: "local", label: "Local only — safe fallback" }
    ], risk: "medium", keywords: "brain engine deterministic"
  }),
  flag("ask.confidence", "Show confidence", "Display the confidence of a verified answer.", {
    category: "ask", default: true, keywords: "confidence"
  }),
  flag("ask.sources", "Show sources", "Show the official source and data version behind an answer.", {
    category: "ask", default: true, keywords: "sources citation"
  }),
  flag("ask.why", "Why this answer", "Show the bounded steps used to answer.", {
    category: "ask", default: true, keywords: "why explain steps"
  }),
  flag("ask.followups", "Follow-up suggestions", "Offer relevant next questions after an answer.", {
    category: "ask", default: true, keywords: "follow up suggestions"
  }),
  flag("ask.voice", "Voice input", "Use the device microphone to dictate a question. Audio is handled by the browser speech service, not Compass servers.", {
    category: "ask", default: true, keywords: "voice microphone"
  }),
  flag("ask.streaming", "Streamed answers", "Reveal answers as they are produced. Local answers appear instantly.", {
    category: "ask", default: true, keywords: "stream typing"
  }),
  flag("ask.length", "Answer length", "How much detail a written answer includes.", {
    category: "ask", type: "select", default: "normal", values: [
      { value: "short", label: "Short" },
      { value: "normal", label: "Normal" },
      { value: "detailed", label: "Detailed" }
    ], keywords: "length detail"
  }),
  flag("ask.language", "Answer language", "Auto follows the language of your question.", {
    category: "ask", type: "select", default: "auto", values: [
      { value: "auto", label: "Auto" },
      { value: "en", label: "English" },
      { value: "hi", label: "Hindi" },
      { value: "pa", label: "Punjabi" }
    ], keywords: "language hindi punjabi"
  }),
  flag("ask.externalAi", "AI for open-ended questions", "Only questions that are not factual college queries may use the college AI relay. Timetable, teacher, room, profile and syllabus facts never leave the deterministic engine.", {
    category: "ask", default: true, risk: "medium", keywords: "ai llm open ended"
  }),
  flag("ask.history", "Save chat history", "Keep recent questions on this device only.", {
    category: "ask", default: true, keywords: "history chat"
  }),
  flag("ask.autoScroll", "Auto-scroll answers", "Keep the newest answer in view.", {
    category: "ask", default: true, keywords: "scroll"
  }),
  flag("ask.dailyLimitNotice", "Show AI daily limit", "Display the remaining daily open-ended AI allowance.", {
    category: "ask", default: true, dependsOn: "ask.externalAi", keywords: "limit quota"
  }),

  // ── Data & offline ───────────────────────────────────────────────────────
  flag("data.autoUpdate", "Automatic data updates", "Check for a newer verified timetable in the background.", {
    category: "data", default: true, keywords: "update auto"
  }),
  flag("data.channel", "Update channel", "Beta may include unverified parser changes. Stable is recommended.", {
    category: "data", type: "select", default: "stable", values: [
      { value: "stable", label: "Stable" },
      { value: "beta", label: "Beta" }
    ], risk: "medium", keywords: "beta channel"
  }),
  flag("data.offlinePack", "Download offline pack", "Cache the timetable, datesheet and notices for offline use.", {
    category: "data", default: false, keywords: "offline download"
  }),
  flag("data.prefetchTomorrow", "Prefetch tomorrow", "Warm tomorrow's timetable while the app is idle.", {
    category: "data", default: true, keywords: "prefetch tomorrow"
  }),
  flag("data.backgroundSync", "Background sync", "Refresh data when the browser allows it.", {
    category: "data", default: true, keywords: "background sync"
  }),
  flag("data.dataSaver", "Data saver", "Skip prefetching, images and non-essential network calls.", {
    category: "data", default: false, keywords: "data saver"
  }),
  flag("data.cacheLimitMb", "Cache limit", "Approximate storage budget for offline data.", {
    category: "data", type: "range", default: 40, min: 10, max: 120, step: 10, unit: "MB", keywords: "cache storage"
  }),
  flag("data.autoRefreshMinutes", "Refresh interval", "How often an open tab checks for a newer release.", {
    category: "data", type: "select", default: "15", values: [
      { value: "0", label: "Manual only" },
      { value: "15", label: "Every 15 minutes" },
      { value: "30", label: "Every 30 minutes" },
      { value: "60", label: "Every hour" }
    ], keywords: "refresh interval"
  }),
  flag("data.snapshots", "Rollback snapshots", "How many verified releases to keep on this device for instant rollback.", {
    category: "data", type: "range", default: 3, min: 1, max: 5, step: 1, unit: "releases", keywords: "rollback versions"
  }),
  flag("data.transcribedNotices", "Include transcribed notices", "Show notices transcribed from photographed official circulars. Every transcription is labelled and links to the original page.", {
    category: "data", default: true, keywords: "transcribed notice circular"
  }),

  // ── Notifications ────────────────────────────────────────────────────────
  flag("notifications.classReminders", "Class reminders", "Notify before the next class while Compass is open or running in the background.", {
    category: "notifications", default: false, keywords: "class reminder notification"
  }),
  flag("notifications.leadMinutes", "Reminder lead time", "How early to remind you.", {
    category: "notifications", type: "select", default: "10", values: [
      { value: "5", label: "5 minutes" },
      { value: "10", label: "10 minutes" },
      { value: "15", label: "15 minutes" },
      { value: "30", label: "30 minutes" }
    ], dependsOn: "notifications.classReminders", keywords: "lead time"
  }),
  flag("notifications.dailyDigest", "Daily digest", "A morning summary of the day's classes.", {
    category: "notifications", default: false, keywords: "digest morning"
  }),
  flag("notifications.digestTime", "Digest time", "When the daily summary is sent.", {
    category: "notifications", type: "select", default: "08:00", values: [
      { value: "07:00", label: "7:00 AM" },
      { value: "08:00", label: "8:00 AM" },
      { value: "09:00", label: "9:00 AM" }
    ], dependsOn: "notifications.dailyDigest", keywords: "digest time"
  }),
  flag("notifications.examAlerts", "Exam alerts", "Notify when a published exam is within three days.", {
    category: "notifications", default: true, keywords: "exam alert"
  }),
  flag("notifications.noticeAlerts", "Notice alerts", "Notify about new verified academic notices.", {
    category: "notifications", default: false, keywords: "notice alert"
  }),
  flag("notifications.quietHours", "Quiet hours", "Suppress notifications during a fixed window.", {
    category: "notifications", default: true, keywords: "quiet hours"
  }),
  flag("notifications.quietStart", "Quiet hours start", "Beginning of the quiet window.", {
    category: "notifications", type: "select", default: "22:00", values: [
      { value: "21:00", label: "9:00 PM" },
      { value: "22:00", label: "10:00 PM" },
      { value: "23:00", label: "11:00 PM" }
    ], dependsOn: "notifications.quietHours", keywords: "quiet start"
  }),
  flag("notifications.quietEnd", "Quiet hours end", "End of the quiet window.", {
    category: "notifications", type: "select", default: "07:00", values: [
      { value: "06:00", label: "6:00 AM" },
      { value: "07:00", label: "7:00 AM" },
      { value: "08:00", label: "8:00 AM" }
    ], dependsOn: "notifications.quietHours", keywords: "quiet end"
  }),
  flag("notifications.sound", "Sound and vibration", "Use the device notification sound.", {
    category: "notifications", default: true, keywords: "sound vibration"
  }),
  flag("notifications.test", "Send a test notification", "Check that notification permission and delivery work.", {
    category: "notifications", type: "action", default: null, keywords: "test notification"
  }),

  // ── Privacy ──────────────────────────────────────────────────────────────
  flag("privacy.analytics", "Anonymous analytics", "Off by default. No question text, profile or timetable is ever included.", {
    category: "privacy", default: false, risk: "medium", keywords: "analytics telemetry"
  }),
  flag("privacy.crashReports", "Crash reports", "Off by default. Sends an anonymised stack trace only.", {
    category: "privacy", default: false, risk: "medium", keywords: "crash report"
  }),
  flag("privacy.localOnly", "Local-only mode", "Disables every optional external call, including the open-ended AI relay.", {
    category: "privacy", default: false, risk: "medium", keywords: "offline local privacy"
  }),
  flag("privacy.export", "Export my data", "Download settings, profile and saved snapshots as JSON.", {
    category: "privacy", type: "action", default: null, keywords: "export download"
  }),
  flag("privacy.clearData", "Clear cached data", "Remove cached timetable data without touching your settings.", {
    category: "privacy", type: "action", default: null, risk: "medium", keywords: "clear cache"
  }),
  flag("privacy.deleteAll", "Delete everything", "Remove settings, profile, chat history and snapshots from this device.", {
    category: "privacy", type: "action", default: null, risk: "high", keywords: "delete reset"
  }),

  // ── Accessibility ────────────────────────────────────────────────────────
  flag("a11y.screenReaderHints", "Screen-reader hints", "Add descriptive labels to cards, charts and controls.", {
    category: "accessibility", default: true, keywords: "screen reader aria"
  }),
  flag("a11y.largeText", "Larger text", "Sets text size to 125%.", {
    category: "accessibility", default: false, keywords: "large text"
  }),
  flag("a11y.dyslexiaFont", "Dyslexia-friendly font", "Use a wider, easier-to-scan system font stack.", {
    category: "accessibility", default: false, keywords: "dyslexia font"
  }),
  flag("a11y.strongFocus", "Strong focus outlines", "Thicker, higher-contrast keyboard focus rings.", {
    category: "accessibility", default: true, keywords: "focus keyboard"
  }),
  flag("a11y.captions", "Captions and transcripts", "Show text alternatives for any audio or video content.", {
    category: "accessibility", default: true, keywords: "captions transcript"
  }),
  flag("a11y.language", "Interface language", "Language for labels and navigation.", {
    category: "accessibility", type: "select", default: "en", values: [
      { value: "en", label: "English" },
      { value: "hi", label: "हिन्दी" },
      { value: "pa", label: "ਪੰਜਾਬੀ" }
    ], keywords: "language interface"
  }),

  // ── Advanced & Labs ──────────────────────────────────────────────────────
  flag("labs.experiments", "Experimental features", "Master switch for Labs. Individual flags still control each feature.", {
    category: "labs", default: false, status: "experimental", risk: "medium", keywords: "experiments labs"
  }),
  flag("labs.newUiPreview", "New UI preview", "Try interface changes before they become the default.", {
    category: "labs", default: false, status: "experimental", dependsOn: "labs.experiments", keywords: "preview ui"
  }),
  flag("labs.map", "Campus map (not bundled)", "No map code or tiles are shipped in this build. This flag is a placeholder for a future lazy chunk.", {
    category: "labs", default: false, status: "experimental", badge: "Not bundled", keywords: "map campus"
  }),
  flag("labs.debugPanel", "Debug panel", "Show engine timings, cache state and the last parsed error.", {
    category: "labs", default: false, status: "experimental", risk: "medium", dependsOn: "labs.experiments", keywords: "debug"
  }),
  flag("labs.flagInspector", "Flag inspector", "Show the effective value and source of every setting.", {
    category: "labs", default: false, status: "experimental", dependsOn: "labs.experiments", keywords: "flags inspector"
  }),
  flag("labs.cacheInspector", "Cache inspector", "List service-worker caches and stored snapshots.", {
    category: "labs", default: false, status: "experimental", dependsOn: "labs.experiments", keywords: "cache inspector"
  }),
  flag("labs.rawEngine", "Raw engine output", "Show the unformatted engine result for debugging. Never shown to normal users.", {
    category: "labs", default: false, status: "experimental", risk: "high", dependsOn: "labs.experiments", keywords: "engine raw debug"
  })
].map(Object.freeze));

export const FLAG_MAP = Object.freeze(Object.fromEntries(FLAGS.map((item) => [item.id, item])));

export const PRESETS = Object.freeze([
  {
    id: "balanced",
    title: "Balanced",
    description: "The recommended defaults: fast, offline-ready and readable.",
    badge: "Recommended",
    values: {}
  },
  {
    id: "battery",
    title: "Battery saver",
    description: "Fewer animations, no background prefetch and quieter notifications.",
    values: {
      "appearance.reduceMotion": true,
      "appearance.glass": false,
      "appearance.timetableColors": false,
      "data.prefetchTomorrow": false,
      "data.backgroundSync": false,
      "ask.streaming": false,
      "notifications.sound": false,
      "today.freeRoomsCard": false
    }
  },
  {
    id: "data-saver",
    title: "Data saver",
    description: "Minimal network use. Offline packs and AI stay off.",
    values: {
      "data.dataSaver": true,
      "data.prefetchTomorrow": false,
      "data.autoUpdate": false,
      "data.offlinePack": false,
      "ask.externalAi": false,
      "appearance.glass": false
    }
  },
  {
    id: "accessibility",
    title: "Accessibility",
    description: "Larger text, high contrast, strong focus and reduced motion.",
    values: {
      "a11y.largeText": true,
      "appearance.fontScale": 125,
      "appearance.reduceMotion": true,
      "appearance.highContrast": true,
      "a11y.strongFocus": true,
      "a11y.screenReaderHints": true
    }
  },
  {
    id: "exam-week",
    title: "Exam week",
    description: "Exam countdown and overlay on, shorter answers, reminders on.",
    values: {
      "today.examCountdown": true,
      "today.hero": "next",
      "timetable.examOverlay": true,
      "notifications.examAlerts": true,
      "ask.length": "short",
      "data.autoUpdate": true
    }
  },
  {
    id: "developer",
    title: "Developer",
    description: "Labs, debug panels and the beta channel. Not recommended for daily use.",
    values: {
      "labs.experiments": true,
      "labs.debugPanel": true,
      "labs.flagInspector": true,
      "labs.cacheInspector": true,
      "data.channel": "beta",
      "experience.showBuildChannel": true
    }
  }
].map(Object.freeze));

export const PRESET_MAP = Object.freeze(Object.fromEntries(PRESETS.map((item) => [item.id, item])));

export function getFlag(id) {
  return FLAG_MAP[id] || null;
}

export function flagsForCategory(category) {
  return FLAGS.filter((item) => item.category === category);
}

export function categoryFor(id) {
  return FLAG_MAP[id]?.category || "";
}

export function isMapFlagEnabled(values = {}) {
  return Boolean(values["labs.map"] || values["rooms.map"]);
}

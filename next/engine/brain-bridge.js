/**
 * Loads the existing, verified Compass Brain engines into Compass Next.
 *
 * The Brain is optional at runtime: if the legacy asset proxy is unavailable,
 * the local deterministic engine still answers factual questions. Brain output
 * is validated exactly like the legacy app validates it — handled, verified,
 * above the engine's own confidence floor, no unsafe markup.
 */

import { humanTime, nextStudyDay } from "./datetime.js";

export const BRAIN_FILES = Object.freeze([
  "/api/legacy/brain-kernel.js",
  "/api/legacy/brain-v1-2.js",
  "/api/legacy/brain-v2-2.js",
  "/api/legacy/brain-v2.js"
]);

export const BRAIN_ENGINES = Object.freeze([
  { global: "CompassBrainV2_2", id: "brain-2.2", label: "Brain 2.2" },
  { global: "CompassBrainV1_2", id: "brain-1.2", label: "Brain 1.2" },
  { global: "CompassBrainV2", id: "brain-2.0", label: "Brain 2.0" }
]);

let loadPromise = null;

export function brainAvailable() {
  return BRAIN_ENGINES.some((engine) => globalThis[engine.global] && typeof globalThis[engine.global].process === "function");
}

export function loadBrainScripts(doc = globalThis.document, sources = BRAIN_FILES) {
  if (brainAvailable()) return Promise.resolve(true);
  if (loadPromise) return loadPromise;
  if (!doc) return Promise.resolve(false);

  loadPromise = new Promise((resolve) => {
    let index = 0;
    const next = () => {
      if (index >= sources.length) {
        resolve(brainAvailable());
        return;
      }
      const src = sources[index++];
      const script = doc.createElement("script");
      script.src = src;
      script.async = false;
      script.defer = false;
      script.onload = next;
      script.onerror = () => {
        // A missing compatibility file must not block the remaining engines.
        console.warn(`[Compass] Brain asset failed to load: ${src}`);
        next();
      };
      (doc.head || doc.documentElement).appendChild(script);
    };
    next();
  });
  return loadPromise;
}

export function resetBrainLoader() {
  loadPromise = null;
}

/** Build the context shape the existing Brain engines already expect. */
export function toBrainContext(answerContext = {}, overrides = {}) {
  const now = answerContext.now || {};
  const profile = answerContext.profile || {};
  const schedule = Array.isArray(answerContext.schedule) ? answerContext.schedule : [];
  const group = answerContext.group || "";
  const subgroup = answerContext.subgroup || "";
  const classes = schedule.filter((entry) => {
    if (entry.group !== group) return false;
    if (!subgroup) return true;
    const cohorts = String(entry.cohorts || "").split(/\s*,\s*/).filter(Boolean);
    return !cohorts.length || cohorts.includes(group) || cohorts.includes(subgroup);
  });
  const next = nextStudyDay(now, 1);
  return {
    classes,
    allClasses: schedule,
    bellSlots: [
      { start: 510, end: 570 }, { start: 570, end: 630 }, { start: 630, end: 690 }, { start: 690, end: 750 },
      { start: 750, end: 810 }, { start: 810, end: 870 }, { start: 870, end: 930 }, { start: 930, end: 980 }
    ],
    conversation: answerContext.conversation || null,
    now,
    calendarDate: now.dateISO || "",
    currentYear: Number(String(now.dateISO || "").slice(0, 4)) || new Date().getFullYear(),
    profileLabel: `${group}${subgroup ? ` · ${subgroup}` : ""}`,
    profile: {
      name: profile.name || "",
      crn: profile.crn || "",
      registrationNo: profile.registrationNo || "",
      branch: profile.branch || "",
      section: profile.section || group,
      subsection: profile.subsection || subgroup,
      mentor: profile.mentor || "",
      mentorPhone: profile.mentorPhone || "",
      academicGroup: group,
      mentorVenue: profile.mentorVenue || "",
      venue: profile.mentorVenue || ""
    },
    nextStudyDay: next ? { day: next.day, label: next.day } : null,
    datasetVersion: answerContext.metadata?.version || "",
    studentRoster: [],
    facultyDirectory: [],
    facultyTimetables: [],
    collegeEvents: [],
    notices: [],
    timetables: {},
    attendanceTarget: Number(profile.attendanceTarget) || 76,
    syllabus: [],
    ...overrides
  };
}

/** Mirror legacy validation. Rejects anything unsafe or under-confident. */
export function validateBrainResult(result, engine) {
  if (!result || typeof result !== "object" || !result.handled || !result.verified) {
    return { accepted: false, reason: "INVALID_RESULT" };
  }
  const minimumConfidence = Number.isFinite(engine?.MIN_CONFIDENCE) ? Math.max(0.82, engine.MIN_CONFIDENCE) : 0.82;
  if (!Number.isFinite(result.confidence) || result.confidence < minimumConfidence) {
    return { accepted: false, reason: "LOW_CONFIDENCE" };
  }
  if (typeof result.answer !== "string" || !result.answer.trim() || result.answer.length > 64000) {
    return { accepted: false, reason: "INVALID_RESULT" };
  }
  if (result.plan !== undefined && (!Array.isArray(result.plan) || result.plan.length > 8)) {
    return { accepted: false, reason: "INVALID_RESULT" };
  }
  if (/<\s*\/?\s*(?:script|iframe|object|embed|style|form|input|textarea|select|video|audio|meta|link)\b/i.test(result.answer)
    || /\son[a-z]+\s*=|javascript\s*:/i.test(result.answer)
    || /\bNaN\b|\[object Object\]/.test(result.answer)) {
    return { accepted: false, reason: "VERIFICATION_FAILED" };
  }
  if (typeof engine?.validateResult === "function") {
    const engineValidation = engine.validateResult(result);
    if (!engineValidation?.accepted) return engineValidation || { accepted: false, reason: "INVALID_RESULT" };
  }
  return { accepted: true, reason: "" };
}

/**
 * Try the verified Brain chain.
 * @returns {{result:object|null, attempts:Array<{engine:string,reason:string}>}}
 */
export function runBrain(question, answerContext, { contextOverrides = {} } = {}) {
  const attempts = [];
  const context = toBrainContext(answerContext, contextOverrides);
  for (const descriptor of BRAIN_ENGINES) {
    const engine = globalThis[descriptor.global];
    if (!engine || typeof engine.process !== "function") {
      attempts.push({ engine: descriptor.label, reason: "UNAVAILABLE" });
      continue;
    }
    try {
      const started = typeof performance !== "undefined" ? performance.now() : Date.now();
      const result = engine.process(question, context);
      const validation = validateBrainResult(result, engine);
      const elapsed = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started);
      if (!validation.accepted) {
        attempts.push({ engine: descriptor.label, reason: validation.reason || result?.fallbackReason || "INVALID_RESULT", ms: elapsed });
        continue;
      }
      attempts.push({ engine: descriptor.label, reason: "ACCEPTED", ms: elapsed });
      return {
        result: {
          ...result,
          engine: descriptor.id,
          engineLabel: descriptor.label,
          processingMs: result.processingMs || elapsed
        },
        attempts
      };
    } catch (error) {
      attempts.push({ engine: descriptor.label, reason: "EXCEPTION", detail: String(error?.message || error) });
    }
  }
  return { result: null, attempts };
}

export function brainSuggestions(input, answerContext) {
  const engine = globalThis.CompassBrainV2;
  if (!engine || typeof engine.suggest !== "function") return [];
  try {
    const suggestions = engine.suggest(input, toBrainContext(answerContext));
    return Array.isArray(suggestions) ? suggestions.slice(0, 4) : [];
  } catch {
    return [];
  }
}

/** Human label for a clock value used by answer cards. */
export function brainTime(minutes) {
  return humanTime(minutes, "12h");
}

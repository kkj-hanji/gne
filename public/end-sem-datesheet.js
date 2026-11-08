/* Official tentative end-semester datesheet panel and Ask Compass adapter.
   Data comes from /api/datesheet, which reads the public Google Sheet linked
   by the GNDEC Controller of Examination. No room, seat, or reporting time is
   invented here. */
(function (root) {
  "use strict";

  const STORAGE_KEY = "gndec-compass-ese-datesheet-v1";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const state = { data: null, loading: null, error: "" };

  const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const normalize = (value) => clean(value).normalize("NFKC").toLowerCase().replace(/[\u2010-\u2015]/g, "-");

  function formatDate(iso) {
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.valueOf())) return iso;
    return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
  }

  function writeCache(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* quota or private mode */ }
  }

  async function load(force = false) {
    if (!force && state.data) return state.data;
    if (!force && state.loading) return state.loading;
    state.loading = (async () => {
      try {
        const response = await fetch(`/api/datesheet${force ? `?refresh=${Date.now()}` : ""}`, { headers: { Accept: "application/json" }, cache: force ? "no-store" : "default" });
        if (!response.ok) throw new Error(`Datesheet API returned HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data?.tabs) || !data.tabs.length) throw new Error("The datesheet response did not contain any tabs.");
        state.data = data;
        state.error = "";
        writeCache(data);
        return data;
      } catch (error) {
        const cached = readCache();
        if (cached?.tabs?.length) { state.data = { ...cached, stale: true }; state.error = error.message || "Live datesheet unavailable"; return state.data; }
        state.error = error.message || "The official datesheet could not be loaded.";
        throw error;
      } finally { state.loading = null; }
    })();
    return state.loading;
  }

  function allEntries(data = state.data) {
    return (data?.tabs || []).flatMap((tab) => (tab.entries || []).map((entry) => ({ ...entry, tabId: tab.id, tabLabel: tab.label, department: tab.department, sessionNote: entry.sessionNote || tab.sessionNote || "" })));
  }

  const ALIASES = [
    ["applied", /\b(?:applied\s*sciences?|appsc|chemistry|physics|maths?|mathematics|english|beee|programming\s+for\s+problem\s+solving)\b/],
    ["ce", /\b(?:civil(?:\s+engineering)?|ce\s+(?:branch|department|dept|ese|datesheet|date\s*sheet|exam(?:ination)?s?))\b/],
    ["cse", /\b(?:computer\s*science(?:\s*(?:&|and)\s*engineering)?|cse|cs\s+(?:branch|department|dept|ese|datesheet|date\s*sheet|exam(?:ination)?s?))\b/],
    ["ece", /\b(?:electronics(?:\s*(?:&|and)\s*communication)?(?:\s+engineering)?|ece|ec\s+(?:branch|department|dept|ese|datesheet|date\s*sheet|exam(?:ination)?s?))\b/],
    ["ee", /\b(?:electrical(?:\s+engineering)?|ee\s+(?:branch|department|dept|ese|datesheet|date\s*sheet|exam(?:ination)?s?))\b/],
    ["it", /\b(?:information\s+technology|it\s+(?:branch|department|dept|ese|datesheet|date\s*sheet|exam(?:ination)?s?))\b/],
    ["me", /\b(?:mechanical(?:\s*(?:&|and)\s*production)?(?:\s+engineering)?|me\s+(?:branch|department|dept|ese|datesheet|date\s*sheet|exam(?:ination)?s?))\b/],
    ["rai", /\b(?:robotics(?:\s*(?:&|and)\s*artificial\s*intelligence)?|rai)\b/],
    ["bba", /\b(?:bba|bachelor\s+of\s+business)\b/],
    ["mba", /\b(?:mba|master\s+of\s+business)\b/],
    ["bcom", /\b(?:b\.?\s*com(?:merce)?)\b/],
    ["bca", /\b(?:bca|bachelor\s+of\s+computer\s+applications?)\b/],
    ["mca", /\b(?:mca|master\s+of\s+computer\s+applications?)\b/],
    ["bvoc", /\b(?:b\.?\s*voc|vocational)\b/],
    ["mtech-ce", /\bm\.?\s*tech\s*(?:\(|in\s+)?civil\b/],
    ["mtech-cse", /\bm\.?\s*tech\s*(?:\(|in\s+)?(?:cse|computer)\b/],
    ["mtech-ece", /\bm\.?\s*tech\s*(?:\(|in\s+)?(?:ece|electronics)\b/],
    ["mtech-ee", /\bm\.?\s*tech\s*(?:\(|in\s+)?(?:ee|electrical)\b/]
  ];

  function tabFromQuestion(question) {
    const q = normalize(question);
    const matches = ALIASES.filter(([, pattern]) => pattern.test(q)).map(([id]) => id);
    if (!matches.length) return "";
    // Prefer the most specific M.Tech alias when both a branch and M.Tech are named.
    return matches.find((id) => id.startsWith("mtech-")) || matches[0];
  }

  function dateFromQuestion(question) {
    const q = normalize(question);
    let match = q.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/);
    if (!match) match = q.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/);
    if (!match) return "";
    const monthNames = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
    const monthFirst = /^[a-z]/.test(match[1]);
    const day = Number(monthFirst ? match[2] : match[1]);
    const month = monthNames[(monthFirst ? match[1] : match[2]).toLowerCase()];
    const year = Number(match[3] || 2026);
    if (!Number.isInteger(day) || month == null || !Number.isFinite(year)) return "";
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function subjectMatches(entry, question) {
    const q = normalize(question);
    const subject = normalize(entry.subject);
    if (!subject) return false;
    if (q.includes(subject)) return true;
    const words = subject.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !/^(?:and|the|for|with|engineering|science|technology)$/.test(word));
    return words.length > 0 && words.every((word) => q.includes(word));
  }

  function matches(question) {
    const q = normalize(question);
    if (!q || /\bacademic\s+calendar\b/.test(q)) return false;
    if (/\b(?:mse|mst|mid\s*sem|internal\s+exam|workshop)\b/.test(q)) return false;
    if (/\b(?:date\s*-?\s*sheet|datesheet|exam\s+schedule|exam\s+dates?|paper\s+schedule|sitting)\b/.test(q)) return true;
    // A bare "end semester exams" question stays with the academic calendar.
    // Once the student names a branch/programme, a date, or asks when/which
    // paper, the subject-wise datesheet is the more specific official answer.
    if (/\b(?:end\s*[- ]?\s*sem(?:ester)?|ese|final\s+(?:semester\s+)?exam)\b/.test(q)) {
      return Boolean(tabFromQuestion(q) || dateFromQuestion(q) || /\b(?:when|date|start|begin|first|last|subject|paper|schedule|which)\b/.test(q));
    }
    return false;
  }

  function resolve(question) {
    if (!matches(question)) return null;
    const data = state.data;
    if (!data) return { pending: true, message: "The official end-semester datesheet is still loading. Open the Timetable page and try again." };
    const tabId = tabFromQuestion(question);
    const date = dateFromQuestion(question);
    let entries = allEntries(data);
    let tabs = data.tabs || [];
    if (tabId) {
      tabs = tabs.filter((tab) => tab.id === tabId || normalize(tab.label) === normalize(tabId));
      entries = entries.filter((entry) => tabs.some((tab) => tab.id === entry.tabId));
    }
    if (date) entries = entries.filter((entry) => entry.date === date);
    const q = normalize(question);
    const subjectHits = entries.filter((entry) => subjectMatches(entry, q));
    if (subjectHits.length) entries = subjectHits;
    entries = entries.sort((left, right) => left.date.localeCompare(right.date) || String(left.subject).localeCompare(String(right.subject)));
    return { data, entries, tabs, tabId, date, subjectFiltered: subjectHits.length > 0, source: data.source, checkedAt: data.checkedAt, stale: data.stale === true };
  }

  function answer(question) {
    const result = resolve(question);
    if (!result) return "";
    if (result.pending) return `<p>${escapeHtml(result.message)}</p>`;
    const source = result.source || {};
    const link = `<p class="answer-source"><a href="${escapeHtml(source.url || "https://docs.google.com/spreadsheets/d/1scMqukyMApsKyemMTbmm9FNUHWv2weZpj1ZGZe-SUfc")}" target="_blank" rel="noopener noreferrer">Official tentative ESE datesheet</a> · published by ${escapeHtml(source.publishedBy || "Controller of Examination, GNDEC")}${result.stale ? " · cached copy, live refresh pending" : ""}. This is tentative; clashes may change it.</p>`;
    if (!result.entries.length) {
      return `<p><strong>No matching sitting was found in the tentative end-semester datesheet.</strong></p><p>Try the branch name, a subject, or a date such as “CSE ESE datesheet” or “end sem exam on 4 December”.</p>${link}`;
    }
    const grouped = new Map();
    for (const entry of result.entries) grouped.set(entry.date, [...(grouped.get(entry.date) || []), entry]);
    const limit = result.tabId || result.date || result.subjectFiltered ? 60 : 10;
    const rows = [...grouped.entries()].slice(0, limit).map(([date, items]) => {
      const lines = items.slice(0, 30).map((entry) => {
        const label = [entry.tabLabel, entry.qualifier, entry.programme].filter(Boolean).join(" · ");
        const session = entry.session ? ` · ${entry.session}${entry.sessionStart != null ? ` (${String(Math.floor(entry.sessionStart / 60)).padStart(2, "0")}:${String(entry.sessionStart % 60).padStart(2, "0")}–${String(Math.floor(entry.sessionEnd / 60)).padStart(2, "0")}:${String(entry.sessionEnd % 60).padStart(2, "0")})` : ""}` : "";
        return `<li><strong>${escapeHtml(entry.subject)}</strong> · ${escapeHtml(label)}${escapeHtml(session)}</li>`;
      }).join("");
      return `<p><strong>${escapeHtml(formatDate(date))}</strong></p><ul>${lines}</ul>`;
    }).join("");
    const shown = Math.min(result.entries.length, limit * 30);
    const note = result.entries.some((entry) => entry.sessionNote)
      ? `<p><strong>Applied Sciences sitting note:</strong> ${escapeHtml(result.entries.find((entry) => entry.sessionNote).sessionNote)}</p>`
      : "";
    const summary = result.tabId
      ? `<p>${result.entries.length} tentative sitting${result.entries.length === 1 ? "" : "s"} for ${escapeHtml(result.tabs[0]?.label || result.tabId)}.</p>`
      : result.date
        ? `<p>${result.entries.length} tentative sitting${result.entries.length === 1 ? "" : "s"} on ${escapeHtml(formatDate(result.date))}.</p>`
        : `<p>The tentative end-semester datesheet contains ${allEntries(result.data).length} subject sittings across ${(result.data.tabs || []).length} department/programme tabs. Ask for a branch, subject, or date to narrow it.</p>`;
    return `<p><strong>Tentative End Semester Examination Date Sheet · November–December 2026</strong></p>${summary}${rows}${shown < result.entries.length ? `<p>Showing the first ${shown} of ${result.entries.length} matching sittings. Use the Timetable page panel for the full list.</p>` : ""}${note}${link}`;
  }

  function render() {
    const panel = document.getElementById("ese-panel");
    if (!panel) return;
    const status = document.getElementById("ese-status");
    const result = document.getElementById("ese-result");
    const department = document.getElementById("ese-department");
    const search = document.getElementById("ese-search");
    if (!status || !result) return;
    const data = state.data;
    if (!data) {
      status.textContent = state.error || "Loading the official tentative datesheet…";
      result.innerHTML = "";
      return;
    }
    if (department && department.options.length <= 1) {
      department.innerHTML = `<option value="">All departments / programmes</option>` + (data.tabs || []).map((tab) => `<option value="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}${tab.entries?.length ? ` (${tab.entries.length})` : ""}</option>`).join("");
    }
    const tabId = department?.value || "";
    const query = clean(search?.value || "");
    let entries = allEntries(data);
    if (tabId) entries = entries.filter((entry) => entry.tabId === tabId);
    if (query) entries = entries.filter((entry) => subjectMatches(entry, query) || normalize(`${entry.subject} ${entry.tabLabel} ${entry.qualifier} ${entry.programme}`).includes(normalize(query)));
    entries.sort((left, right) => left.date.localeCompare(right.date) || String(left.subject).localeCompare(String(right.subject)));
    const grouped = new Map();
    for (const entry of entries) grouped.set(entry.date, [...(grouped.get(entry.date) || []), entry]);
    status.textContent = `${entries.length} tentative sitting${entries.length === 1 ? "" : "s"}${tabId ? ` · ${data.tabs.find((tab) => tab.id === tabId)?.label || tabId}` : ` · ${data.tabs.length} tabs`}${data.stale ? " · cached copy" : ""}`;
    result.innerHTML = grouped.size
      ? [...grouped.entries()].map(([date, items]) => `<section class="ese-day"><h3>${escapeHtml(formatDate(date))}</h3>${items.map((entry) => {
        const meta = [entry.tabLabel, entry.qualifier, entry.programme].filter(Boolean).join(" · ");
        const session = entry.session ? `${entry.session}` : "Session not stated";
        return `<article class="ese-entry"><div><strong>${escapeHtml(entry.subject)}</strong><small>${escapeHtml(meta)} · Semester ${escapeHtml(entry.semester || "")}</small></div><span>${escapeHtml(session)}</span>${entry.sessionNote ? `<p class="ese-note">${escapeHtml(entry.sessionNote)}</p>` : ""}</article>`;
      }).join("")}</section>`).join("")
      : `<p class="empty-list">No sitting matches that filter.</p>`;
  }

  async function show(force = false) {
    const panel = document.getElementById("ese-panel");
    if (!panel) return;
    try { await load(force); } catch { /* status below explains the failure */ }
    render();
  }

  function init() {
    const panel = document.getElementById("ese-panel");
    if (!panel) return;
    document.getElementById("ese-department")?.addEventListener("change", render);
    document.getElementById("ese-search")?.addEventListener("input", render);
    document.getElementById("ese-refresh")?.addEventListener("click", () => show(true));
    show();
  }

  root.CompassEseDatesheet = Object.freeze({ load, show, render, init, matches, resolve, answer, formatDate, allEntries });
})(globalThis);

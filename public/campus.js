/* Official campus directory: department heads, contacts, notices, and
   published syllabus documents. Data comes from /api/campus, which is built
   only from public GNDEC pages. Missing values stay missing. */
(function (root) {
  "use strict";

  const STORAGE_KEY = "gndec-compass-campus-v1";
  const state = { data: null, loading: null, error: "" };

  const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const normalize = (value) => clean(value).normalize("NFKC").toLowerCase().replace(/[\u2010-\u2015]/g, "-");

  const DEPARTMENTS = [
    ["architecture", /\b(?:architecture|arch|school\s+of\s+architecture)\b/],
    ["applied", /\b(?:applied\s*sciences?|appsc|chemistry|physics|mathematics|maths|humanities)\b/],
    ["ce", /\b(?:civil(?:\s+engineering)?|ce\s+(?:department|branch|hod|head|contact|syllabus)|ce)\b/],
    ["cse", /\b(?:computer\s*science(?:\s*(?:&|and)\s*engineering)?|cse|cs\s+(?:department|branch|hod|head|contact|syllabus))\b/],
    ["ece", /\b(?:electronics(?:\s*(?:&|and)\s*communication)?(?:\s+engineering)?|ece|ec\s+(?:department|branch|hod|head|contact|syllabus))\b/],
    ["ee", /\b(?:electrical(?:\s+engineering)?|ee\s+(?:department|branch|hod|head|contact|syllabus))\b/],
    ["it", /\b(?:information\s+technology|it\s+(?:department|branch|hod|head|contact|syllabus))\b/],
    ["me", /\b(?:mechanical(?:\s*(?:&|and)\s*production)?(?:\s+engineering)?|me\s+(?:department|branch|hod|head|contact|syllabus))\b/],
    ["mba", /\b(?:mba|business\s+administration)\b/],
    ["mca", /\b(?:mca|computer\s+applications?)\b/]
  ];

  function departmentFromQuestion(question) {
    const q = normalize(question);
    return DEPARTMENTS.find(([, pattern]) => pattern.test(q))?.[0] || "";
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
        const response = await fetch(`/api/campus${force ? `?refresh=${Date.now()}` : ""}`, { headers: { Accept: "application/json" }, cache: force ? "no-store" : "default" });
        if (!response.ok) throw new Error(`Campus API returned HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data?.departments) || !data.departments.length) throw new Error("The campus response did not contain any departments.");
        state.data = data;
        state.error = "";
        writeCache(data);
        return data;
      } catch (error) {
        const cached = readCache();
        if (cached?.departments?.length) { state.data = { ...cached, stale: true }; state.error = error.message || "Live campus directory unavailable"; return state.data; }
        state.error = error.message || "The official campus directory could not be loaded.";
        throw error;
      } finally { state.loading = null; }
    })();
    return state.loading;
  }

  function departmentById(id) {
    return (state.data?.departments || []).find((department) => department.id === id) || null;
  }

  function noticeMatches(notice, query) {
    const q = normalize(query);
    if (!q) return true;
    return normalize(`${notice.title} ${notice.category} ${notice.author}`).includes(q);
  }

  function documentMatches(document, query) {
    const q = normalize(query);
    if (!q) return true;
    return normalize(`${document.label} ${document.department} ${document.sourcePage}`).includes(q);
  }

  // A notice request can carry a qualifier between the adjective and the noun
  // ("latest GNDEC notices", "recent college circulars"), so match the pair
  // rather than one fixed phrase.
  function noticeRequest(q) {
    if (/\b(?:noticeboard|circulars?)\b/.test(q)) return true;
    return /\bnotices?\b/.test(q) && /\b(?:latest|recent|new|college|gndec|campus|official|erp)\b/.test(q);
  }

  function matches(question) {
    const q = normalize(question);
    if (!q) return false;
    // Meeting minutes are a transcribed notice with its own verified engine;
    // "HOD meeting" must not be answered with the department-head directory.
    if (/\b(?:meeting|minutes|mom)\b/.test(q)) return false;
    if (/\b(?:hod|head\s+of\s+(?:the\s+)?department|head\s+of\s+dept)\b/.test(q)) return true;
    if (noticeRequest(q)) return true;
    if (/\b(?:syllabus|study\s+scheme|curriculum)\b/.test(q)) {
      // First-year subject questions ("physics syllabus", "maths unit 2")
      // belong to the structured syllabus engine, not to a document index.
      const firstYearSubject = /\b(?:physics|maths?|mathematics|chemistry|english|economics|pps|programming\s+for\s+problem\s+solving|beee|basic\s+electrical|manufacturing|workshop|python)\b/.test(q);
      const documentRequest = /\b(?:pdf|download|document|documents|list|all|every|where|link|links|study\s+scheme|curriculum|scheme)\b/.test(q);
      if (documentRequest || (departmentFromQuestion(q) && !firstYearSubject)) return true;
    }
    if (/\b(?:department|dept)\b/.test(q) && /\b(?:contact|email|phone|number|address)\b/.test(q)) return true;
    return false;
  }

  function answer(question) {
    if (!matches(question)) return "";
    const data = state.data;
    if (!data) return `<p>The official campus directory is still loading. Open the Campus page and try again.</p>`;
    const q = normalize(question);
    const id = departmentFromQuestion(q);
    const sourceLine = `<p class="answer-source">Read from public GNDEC pages${data.checkedAt ? ` · checked ${escapeHtml(String(data.checkedAt).slice(0, 10))}` : ""}${data.stale ? " · cached copy" : ""}. A missing value is not guessed. <a href="#campus" data-go="campus">Open the Campus directory</a>.</p>`;

    if (/\b(?:hod|head\s+of\s+(?:the\s+)?department)\b/.test(q)) {
      const departments = id ? [departmentById(id)].filter(Boolean) : data.departments || [];
      if (!departments.length) return `<p>No official department record matches that name.</p>${sourceLine}`;
      const rows = departments.map((department) => {
        const hod = department.hod || {};
        return `<p><strong>${escapeHtml(department.name)} (${escapeHtml(department.short)})</strong><br />${hod.name ? `${escapeHtml(hod.name)}${hod.email ? ` · ${escapeHtml(hod.email)}` : ""}${hod.phone ? ` · ${escapeHtml(hod.phone)}` : ""}` : "No Head of Department block was found on the official page."}<br /><a href="${escapeHtml(department.homepage)}" target="_blank" rel="noopener noreferrer">Official department page</a></p>`;
      }).join("");
      return `<p><strong>Head of Department</strong></p>${rows}${sourceLine}`;
    }

    if (noticeRequest(q)) {
      const query = q.replace(/\b(?:latest|recent|new|college|gndec|campus|erp|official|noticeboard|notices?|circulars?|show|list|me|the|about|on|for)\b/g, " ").trim();
      const notices = (data.notices || []).filter((notice) => noticeMatches(notice, query)).slice(0, 10);
      const rows = notices.map((notice) => `<li><strong>${escapeHtml(notice.title)}</strong><br /><small>${escapeHtml(notice.publishedAt)} · ${escapeHtml(notice.author)} · ${escapeHtml(notice.category)}</small><br /><a href="${escapeHtml(notice.url)}" target="_blank" rel="noopener noreferrer">Read official notice</a></li>`).join("");
      return `<p><strong>Official GNDEC notices</strong></p>${notices.length ? `<ol>${rows}</ol>` : "<p>No official notice matches that filter.</p>"}<p class="answer-source"><a href="${escapeHtml(data.source?.noticeboard || "https://erp.gndec.ac.in/noticeboard")}" target="_blank" rel="noopener noreferrer">ERP noticeboard</a>${data.checkedAt ? ` · checked ${escapeHtml(String(data.checkedAt).slice(0, 10))}` : ""}.</p>`;
    }

    if (/\b(?:syllabus|study\s+scheme|curriculum)\b/.test(q)) {
      const query = q.replace(/\b(?:syllabus|study|scheme|curriculum|of|for|the|show|list|where|download|official|department|dept|all|every|please|give|me)\b/g, " ").trim();
      let documents = data.syllabus || [];
      if (id) documents = documents.filter((document) => document.departmentId === id);
      // A named department already scopes the list. Filtering the leftover
      // department token ("cse") against document labels would hide the very
      // documents the question asked for, because labels use full names.
      if (query && !id) documents = documents.filter((document) => documentMatches(document, query));
      documents = documents.slice(0, 40);
      const rows = documents.map((document) => `<li><a href="${escapeHtml(document.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(document.label)}</a><br /><small>${escapeHtml(document.department)}${document.external ? " · external document linked by the official department page" : ""} · <a href="${escapeHtml(document.sourcePage)}" target="_blank" rel="noopener noreferrer">source page</a></small></li>`).join("");
      return `<p><strong>Published syllabus and study schemes</strong></p>${documents.length ? `<ul>${rows}</ul>` : "<p>No published syllabus document matches that department or filter.</p>"}<p class="answer-source">Official documents are linked exactly as published; Compass does not rewrite their contents. ${data.stale ? "Cached copy." : ""}</p>`;
    }

    if (/\b(?:contact|email|phone|number|address)\b/.test(q) && id) {
      const department = departmentById(id);
      if (!department) return `<p>No official department record matches that name.</p>${sourceLine}`;
      const hod = department.hod || {};
      return `<p><strong>${escapeHtml(department.name)}</strong></p><p>${hod.name ? `${escapeHtml(hod.name)}${hod.email ? `<br />Email: ${escapeHtml(hod.email)}` : ""}${hod.phone ? `<br />Phone: ${escapeHtml(hod.phone)}` : ""}` : "No contact block was found on the official page."}<br /><a href="${escapeHtml(department.homepage)}" target="_blank" rel="noopener noreferrer">Official department page</a></p>${sourceLine}`;
    }

    return "";
  }

  function render() {
    const status = document.getElementById("campus-status");
    if (!status) return;
    const data = state.data;
    if (!data) {
      status.textContent = state.error || "Loading the official campus directory…";
      return;
    }
    const noticeQuery = clean(document.getElementById("campus-notice-search")?.value || "");
    const noticeCategory = document.getElementById("campus-notice-category")?.value || "";
    const syllabusQuery = clean(document.getElementById("campus-syllabus-search")?.value || "");
    const syllabusDepartment = document.getElementById("campus-syllabus-department")?.value || "";
    const departmentsEl = document.getElementById("campus-departments");
    const noticesEl = document.getElementById("campus-notices");
    const syllabusEl = document.getElementById("campus-syllabus");
    status.textContent = `${data.departments.length} departments · ${data.notices.length} notices · ${data.syllabus.length} syllabus documents${data.stale ? " · cached copy" : ""}`;
    if (departmentsEl) {
      departmentsEl.innerHTML = data.departments.map((department) => {
        const hod = department.hod || {};
        return `<article class="campus-department"><h3>${escapeHtml(department.name)} <span>${escapeHtml(department.short)}</span></h3>${hod.name ? `<p><strong>${escapeHtml(hod.name)}</strong><br />${escapeHtml(hod.email || "")}${hod.phone ? `<br />${escapeHtml(hod.phone)}` : ""}</p>` : `<p class="muted">No Head of Department block was found on the official page.</p>`}<a href="${escapeHtml(department.homepage)}" target="_blank" rel="noopener noreferrer">Department page ↗</a></article>`;
      }).join("");
    }
    if (noticesEl) {
      const categories = [...new Set((data.notices || []).map((notice) => notice.category).filter(Boolean))].sort();
      const categorySelect = document.getElementById("campus-notice-category");
      if (categorySelect && categorySelect.options.length <= 1) categorySelect.innerHTML = `<option value="">All categories</option>` + categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("");
      const notices = (data.notices || []).filter((notice) => (!noticeCategory || notice.category === noticeCategory) && noticeMatches(notice, noticeQuery)).slice(0, 40);
      noticesEl.innerHTML = notices.length ? notices.map((notice) => `<article class="campus-notice"><p class="campus-notice-meta">${escapeHtml(notice.publishedAt)} · ${escapeHtml(notice.category)}</p><h3><a href="${escapeHtml(notice.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(notice.title)}</a></h3><p class="muted">${escapeHtml(notice.author)}</p></article>`).join("") : `<p class="empty-list">No notice matches that filter.</p>`;
    }
    if (syllabusEl) {
      const departmentSelect = document.getElementById("campus-syllabus-department");
      if (departmentSelect && departmentSelect.options.length <= 1) departmentSelect.innerHTML = `<option value="">All departments</option>` + data.departments.map((department) => `<option value="${escapeHtml(department.id)}">${escapeHtml(department.name)}</option>`).join("");
      const documents = (data.syllabus || []).filter((document) => (!syllabusDepartment || document.departmentId === syllabusDepartment) && documentMatches(document, syllabusQuery)).slice(0, 80);
      syllabusEl.innerHTML = documents.length ? documents.map((document) => `<article class="campus-document"><h3><a href="${escapeHtml(document.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(document.label)}</a></h3><p class="muted">${escapeHtml(document.department)}${document.external ? " · external document linked by the official department page" : ""}</p><a class="text-button" href="${escapeHtml(document.sourcePage)}" target="_blank" rel="noopener noreferrer">Official source page ↗</a></article>`).join("") : `<p class="empty-list">No syllabus document matches that filter.</p>`;
    }
  }

  async function show(force = false) {
    if (!document.getElementById("campus-status")) return;
    try { await load(force); } catch { /* status explains the failure */ }
    render();
  }

  function init() {
    if (!document.getElementById("campus-page")) return;
    ["campus-notice-search", "campus-notice-category", "campus-syllabus-search", "campus-syllabus-department"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", render);
      document.getElementById(id)?.addEventListener("change", render);
    });
    document.getElementById("campus-refresh")?.addEventListener("click", () => show(true));
    show();
  }

  root.CompassCampus = Object.freeze({ load, show, render, init, matches, answer, departmentFromQuestion });
})(globalThis);

(function (root) {
  "use strict";
  const normalize = value => String(value || "").normalize("NFKC").toLowerCase()
    .replace(/\b(?:wrkshop|workshp|work\s+shop)\b/g, "workshop")
    .replace(/\b(?:pract?cal|practicle|practicals)\b/g, "practical")
    .replace(/\b(?:exm|xam|exams|examination|examinations|paper|papers|pariksha|imtihaan)\b/g, "exam")
    .replace(/\b(?:seeting|sitting|seet|seatting)\b/g, "seating")
    .replace(/\b(?:mera|meri|mere|apna|apni)\b/g, "my")
    .replace(/\b(?:kado|kadon|kab)\b/g, "when")
    .replace(/\b(?:kithe|kithhe|kithay|kahan|kaha|kahaan)\b/g, "where")
    .replace(/\b(?:phy|physic)\b/g, "physics").replace(/\bchem\b/g, "chemistry")
    .replace(/\b(?:timing|timings|tym)\b/g, "time")
    .replace(/\b(?:roomno|roomnum|kamra|kamre)\b/g, "room")
    .replace(/\b(?:konsa|kaunsa|kehda|keda)\b/g, "which")
    .replace(/\bmse\s*[- ]?\s*(?:one|i)\b/g, "mse1")
    .replace(/\s+/g, " ").trim();
  const matches = q => /\b(?:exam|mse\s*-?\s*[123]?|seating|seat|viva|date\s*sheet)\b/.test(normalize(q))
    && !/\b(?:syllabus|marks|pattern|calculator|credits|results|preparation|tips)\b/.test(normalize(q));
  const validDate = v => /^20\d{2}-\d{2}-\d{2}$/.test(v || "") && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
  const clean = (v, max = 180) => typeof v === "string" && v.trim().length <= max && !/[<>\u0000-\u0008]/.test(v) ? v.trim() : "";
  function validate(input, withSeats = true) {
    if (!input || !Array.isArray(input.events) || input.events.length > 500 || !Array.isArray(input.seats || [])) throw new Error("Provide an exam document with at most 500 events.");
    const ids = new Set();
    const events = input.events.map(e => {
      if (!e || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(e.id || "") || ids.has(e.id)) throw new Error("Each event needs a unique ID.");
      ids.add(e.id);
      if (!["theory", "workshop", "practical"].includes(e.kind) || !clean(e.title) || !validDate(e.date) || !validDate(e.endDate || e.date) || (e.endDate || e.date) < e.date) throw new Error(`Check the title, kind and dates for ${e.id}.`);
      if (!Array.isArray(e.sections) || !e.sections.length || e.sections.length > 100 || e.sections.some(s => !/^[A-Z][A-Z0-9]{1,15}$/.test(s))) throw new Error(`Check section codes for ${e.id}.`);
      const timed = Number.isInteger(e.start) && Number.isInteger(e.end) && e.start >= 0 && e.end <= 1440 && e.end > e.start;
      if (!timed && !(e.kind === "practical" && e.start === null && e.end === null)) throw new Error(`Use a valid same-day start/end time for ${e.id}.`);
      if (timed && e.endDate && e.endDate !== e.date) throw new Error("Use separate timed events for separate days; date ranges are only for untimed lab windows.");
      if (e.report != null && (!timed || !Number.isInteger(e.report) || e.report < 0 || e.report > e.start)) throw new Error(`Reporting time must be before the start for ${e.id}.`);
      if (!clean(e.source, 300)) throw new Error(`Source attribution is required for ${e.id}.`);
      const sourceUrl = clean(e.sourceUrl || "", 500);
      if (sourceUrl && !/^\/data\/[a-z0-9-]+\.pdf$/.test(sourceUrl) && !/^\/notices\/[a-z0-9-]+\.html$/.test(sourceUrl) && !/^https:\/\/(?:[a-z0-9-]+\.)*gndec\.ac\.in\//.test(sourceUrl)) throw new Error("Use a supplied notice link or an official GNDEC source URL.");
      return { id: e.id, kind: e.kind, title: clean(e.title), date: e.date, endDate: e.endDate || e.date, start: e.start, end: e.end, report: e.report ?? null, sections: [...new Set(e.sections)], source: clean(e.source, 300), sourceUrl, note: clean(e.note || "", 1200) };
    });
    const seatIds = new Set(), positions = new Set();
    if ((input.seats || []).length > 12000) throw new Error("A publication supports at most 12,000 seating assignments.");
    const seats = withSeats ? (input.seats || []).map(s => {
      if (!s || !ids.has(s.eventId) || typeof s.crn !== "string" || !/^\d{7,12}$/.test(s.crn) || !clean(s.room, 100) || !clean(s.row, 30) || !/^\d{1,3}$/.test(String(s.seat || "")) || Number(s.seat) < 1) throw new Error("Each seat requires an existing exam, exact CRN, room, row and positive S.No. position.");
      const key = `${s.eventId}/${s.crn}`, position = `${s.eventId}/${s.room.trim().toUpperCase()}/${s.row.trim().toUpperCase()}/${Number(s.seat)}`;
      if (seatIds.has(key) || positions.has(position)) throw new Error("Duplicate student or seating position in the same exam. Review before publishing.");
      seatIds.add(key); positions.add(position);
      return { eventId: s.eventId, crn: s.crn, room: clean(s.room, 100), row: clean(s.row, 30), seat: String(s.seat), page: Number.isInteger(s.page) && s.page > 0 && s.page < 101 ? s.page : null };
    }) : [];
    return { schemaVersion: 1, revision: clean(input.revision || "", 100), publishedAt: clean(input.publishedAt || "", 60), events, seats };
  }
  function parseSeatingPage(items, eventId, page) {
    const tokens = items.filter(i => i.str?.trim()).map(i => ({ text: i.str.trim(), x: i.transform[4], y: i.transform[5] }));
    const rooms = tokens.filter(i => /^Room\s+No\./i.test(i.text)).sort((a, b) => b.y - a.y);
    const crns = tokens.filter(i => /^\d{7,12}$/.test(i.text));
    if (!rooms.length || !crns.length) throw new Error(`Page ${page} does not expose a supported room seating grid. Use the CSV/template editor instead.`);
    return crns.map(c => {
      const room = rooms.filter(r => r.y > c.y).pop();
      if (!room) throw new Error(`Missing room above CRN on page ${page}.`);
      const lower = rooms[rooms.indexOf(room) + 1]?.y ?? -Infinity;
      const rows = tokens.filter(i => /^Row\s*[-–]\s*[IVX]+$/i.test(i.text) && i.y < room.y && i.y > c.y && i.y > lower);
      const row = rows.sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
      const seat = tokens.filter(i => /^\d{1,2}$/.test(i.text) && i.x < 90 && i.y < room.y && i.y > lower).sort((a, b) => Math.abs(a.y - c.y) - Math.abs(b.y - c.y))[0];
      if (!row || Math.abs(row.x - c.x) > 40 || !seat || Math.abs(seat.y - c.y) > 14) throw new Error(`An ambiguous row/position on page ${page} needs manual review.`);
      return { eventId, crn: c.text, room: room.text.replace(/^Room\s+No\.\s*/i, ""), row: row.text.replace(/\s+/g, " "), seat: seat.text, page };
    });
  }
  function scope(question, section, events) {
    const q = normalize(question), available = [...new Set(events.flatMap(e => e.sections))];
    const codes = [...q.matchAll(/\b(cse|cs|ece|ec|ee|ce|me|it)\s*([a-z])(?:\s*(\d+))?\b|\b(rai)(?:\s*(\d+))?\b/g)];
    if (codes.length) {
      const sections = codes.map(m => m[4] ? "RAI" : `${({ece:"ec",cse:"cs"})[m[1]] || m[1]}${m[2]}`.toUpperCase());
      return codes.some(m => (m[3] || m[5]) && !["1", "2"].includes(m[3] || m[5])) || sections.some(s => !available.includes(s)) ? null : sections;
    }
    const branches = [...q.replace(/\b(?:show|tell|give|for|room|seat|lab)\s+me\b/g, "").matchAll(/\b(cse|cs|ece|ec|ee|ce|me|it|rai)\b/g)].map(m => ({ece:"EC",cse:"CS"})[m[1]] || m[1].toUpperCase());
    if (branches.length) return available.filter(s => branches.includes(s === "RAI" ? s : s.slice(0, -1)));
    const group=q.match(/\b(physics|chemistry)\s+group\b/);
    if(group) return [...new Set(events.filter(e=>e.kind==="theory" && e.title.toLowerCase()===group[1]).flatMap(e=>e.sections))];
    if (/\b(?:all|every|full)\b/.test(q)) return available;
    return section && available.includes(section) ? [section] : [];
  }
  function select(data, question, context = {}) {
    const q = normalize(question);
    if (!matches(q)) return null;
    const result = { events: [], message: "", seating: /\b(?:room|where|seat|seating|venue|roll)\b/.test(q) };
    if (/\b(?:mse\s*-?\s*(?:[23]|ii|iii)|ese|end\s*sem|semester\s*[2-8])\b/.test(q)) return {...result, message:"No published schedule for that exam session is loaded."};
    const sections = scope(q, context.section, data.events);
    if (!sections?.length) return {...result, message: sections === null ? "That section/subsection is not verified in the published exam data." : "Choose a timetable section or include a published section in your question."};
    let events = data.events.filter(e => e.sections.some(s => sections.includes(s)));
    const practical = /\b(?:lab|practical|viva)\b/.test(q), workshop = /\b(?:workshop|manufacturing|mp)\b/.test(q);
    events = events.filter(e => workshop ? e.kind === "workshop" : practical ? e.kind === "practical" || (!/\b(?:physics|chemistry|english|lab)\b/.test(q) && e.kind === "workshop") : e.kind === "theory");
    const aliases = [["physics",/\bphysics\b/],["chemistry",/\bchemistry\b/],["mathematics",/\b(?:math|maths|mathematics)\b/],["pps",/\b(?:pps|programming)\b/],["edg",/\b(?:edg|drawing)\b/],["beee",/\bbeee\b/],["english",/\b(?:english|pec)\b/],["economics",/\b(?:economics|eco)\b/]];
    const subjects = aliases.filter(([,r]) => r.test(q.replace(/\b(?:physics|chemistry)\s+group\b/g,""))).map(([s]) => s);
    if (!practical && !workshop && subjects.length) events = events.filter(e => subjects.some(s => e.title.toLowerCase().includes(s)));
    if (!practical && !workshop && !subjects.length && !/\bgroup\b/.test(q)) {
      const exactTitles=data.events.filter(e=>e.kind==="theory" && (` ${q} `).includes(` ${normalize(e.title)} `)).map(e=>e.title);
      if(exactTitles.length)events=events.filter(e=>exactTitles.includes(e.title));
    }
    if (practical && /\b(?:pps|programming|beee|edg|biology)\b/.test(q)) return {...result,message:"No subject-specific practical date/time for that course is confirmed in the supplied notices."};
    const temporal = context.temporal;
    if (["invalid","conflict"].includes(temporal?.status)) return {...result,message:temporal.reason || "Please clarify the date."};
    const allowed = new Set(("my me for of the a an please tell show give find when where which what is are do does have has can will be on in at to from between through and or all every full next upcoming current ongoing now today tomorrow yesterday day week month date time timing schedule sheet exam mse mse1 mse2 mse3 seating seat room venue roll crn number reporting report start end starts ends lab labs practical viva workshop manufacturing mp paper physics chemistry mathematics maths math programming pps edg drawing beee english pec economics eco group section subsection branch ka ki ke da di de kab kado kadon hoga hovega hovegi hai hain aa ji nu menu main mera meri mere agla agli abhi hun kis din batao btao das daso dasso bta kb kddo monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september sept sep october oct november december am pm" ).split(" "));
    for (const e of data.events) for (const word of normalize(e.title).split(/[^a-z0-9]+/)) allowed.add(word);
    for(const word of ["no","mein","mai","vich","ch","hai","kal","ajj","aj","aaj","parso","parson","parsoh","h","bta","bata","dasso","details","detail","information","please","plz","pls","ki","kise","mere","mujhe","menu","schedule","plan"])allowed.add(word);
    const unknown=q.replace(/\b(?:cse|cs|ece|ec|ee|ce|me|it)\s*[a-z](?:\s*\d+)?\b|\brai\d*\b/g, "").split(/[^a-z0-9]+/).filter(word=>word&&!/^\d+$/.test(word)&&!allowed.has(word)&&!/^(?:cs|cse|ec|ece|ee|ce|it|rai)$/.test(word));
    if(unknown.length)return {...result,message:"I could not verify every requested subject or detail. Include one published section, exam and date, or ask for the full exam schedule."};
    if (temporal?.dates?.length) {
      const dates=[...temporal.dates].sort(), range=dates.length===2 && /\b(?:from|between|to|through)\b/.test(q);
      events=events.filter(e=>range ? e.date<=dates[1] && e.endDate>=dates[0] : dates.some(d=>e.date<=d && e.endDate>=d));
    }
    if (/\b(?:next|upcoming|agla|agli)\b/.test(q) && context.today) {
      events=events.filter(e=>e.endDate>context.today || (e.endDate===context.today && (e.end??1440)>context.minutes));
      events.sort((a,b)=>a.date.localeCompare(b.date)||(a.start??0)-(b.start??0));
      if(events.length) events=events.filter(e=>e.date===events[0].date && e.start===events[0].start);
    }
    if (/\b(?:now|current|ongoing|abhi|hun)\b/.test(q) && context.today) events=events.filter(e=>e.date<=context.today && e.endDate>=context.today && (e.start===null || e.date<context.today || e.start<=context.minutes) && (e.end===null || e.endDate>context.today || e.end>context.minutes));
    return {...result,events:events.sort((a,b)=>a.date.localeCompare(b.date)||(a.start??0)-(b.start??0)),message:events.length?"":"No matching sitting is confirmed in the published exam data. This does not mean no examination exists."};
  }
  function active(data, section, today, minutes) {
    const own=data.events.filter(e=>e.sections.includes(section));
    const theory=own.filter(e=>e.kind==="theory").sort((a,b)=>a.date.localeCompare(b.date)||a.end-b.end);
    const first=theory[0],last=theory[theory.length-1];
    const examMode=Boolean(first && today>=first.date && (today<last.date || (today===last.date && minutes<last.end)));
    const forthcoming=own.filter(e=>e.endDate>today || (e.endDate===today && (e.end??1440)>minutes)).sort((a,b)=>a.date.localeCompare(b.date)||(a.start??0)-(b.start??0));
    return { examMode, theory:examMode?theory.filter(e=>e.date>today || (e.date===today && e.end>minutes)):[], notices:forthcoming.filter(e=>e.kind!=="theory").slice(0,5) };
  }
  root.CompassExamDomain=Object.freeze({normalize,matches,validDate,validate,parseSeatingPage,scope,select,active});
})(globalThis);

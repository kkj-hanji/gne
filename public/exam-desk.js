(function(root){
  "use strict";
  const domain=root.CompassExamDomain, key="gndec-compass-exam-summary-v1";
  let data=null, bridge=null, pending=null, checked=0, stale=false;
  const seats=new Map(), seatPending=new Map();
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const time=m=>m==null?"Your respective lab turn":`${Math.floor(m/60)%12||12}:${String(m%60).padStart(2,"0")} ${m<720?"AM":"PM"}`;
  const date=d=>new Intl.DateTimeFormat("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(d+"T00:00:00Z"));
  function setData(value){const next=domain.validate(value,false);if(!next.events.length)throw new Error("An empty exam publication cannot replace verified data.");if(data?.publishedAt && next.publishedAt<data.publishedAt)return data;if(data?.revision!==next.revision)seats.clear();data=next;return next;}
  async function fetchJson(url,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{const response=await fetch(url,{...options,signal:controller.signal,cache:"no-store",headers:{Accept:"application/json",...options.headers}});const text=await response.text();let body;try{body=JSON.parse(text);}catch{throw new Error("Exam updates returned an unreadable response. Saved data was preserved.");}if(!response.ok)throw new Error(body.error||"Exam request failed.");return body;}finally{clearTimeout(timer);}
  }
  async function refresh(force=false){
    if(pending)return pending;if(!force&&data&&Date.now()-checked<60000)return data;
    pending=(async()=>{try{const value=await fetchJson("/api/exams");setData(value);checked=Date.now();stale=Boolean(value.stale) || value.revision!==data.revision;if(stale)seats.clear();try{localStorage.setItem(key,JSON.stringify(data));}catch{}}catch{
      stale=true;seats.clear();if(!data){try{setData(JSON.parse(localStorage.getItem(key)||"null"));}catch{try{setData(await fetchJson("/data/exam-summary.json"));}catch{}}}
    }render();return data;})().finally(()=>{pending=null;});return pending;
  }
  function examGroup(e){const title=String(e.title||"").toLowerCase();return title.includes("chemistry")?"chemistry":title.includes("physics")?"physics":"general";}
  function eventMarkup(e){const group=examGroup(e);return `<article class="exam-event exam-event-${group}"><div class="exam-event-topline"><span class="exam-subject-tag">${group==="general"?"EXAM":group.toUpperCase()}</span><small>${esc(e.sections.join(", "))}</small></div><h3>${esc(e.title)}</h3><p class="exam-event-time"><strong>${date(e.date)}${e.endDate!==e.date?` – ${date(e.endDate)}`:""}</strong><br>${e.start===null?"In your respective lab turn":`${time(e.start)}–${time(e.end)}`}${e.report!==null?` · <strong>Report by ${time(e.report)}</strong>`:""}</p>${e.note?`<p class="exam-event-note">${esc(e.note)}</p>`:""}<p class="answer-source">${e.sourceUrl?`<a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">View source notice</a> · `:""}${esc(e.source)}</p></article>`;}
  function context(q,context){return {...context,temporal:root.CompassBrainKernel?.resolveTemporalQuery?.(`${q} date`,context.today)};}
  async function seatFor(event,crn){
    const revision=data.revision,cacheKey=`${revision}/${event.id}/${crn}`;
    if(!stale && seats.has(cacheKey))return seats.get(cacheKey);
    if(seatPending.has(cacheKey))return seatPending.get(cacheKey);
    const task=(async()=>{const value=await fetchJson("/api/exams/seat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventId:event.id,crn})});
      if(value.revision!==revision || data.revision!==revision)throw new Error("The exam publication changed; check again.");
      if(!Object.prototype.hasOwnProperty.call(value,"seat") || (value.seat!==null && (typeof value.seat!=="object" || Array.isArray(value.seat))))throw new Error("Incomplete seating response.");
      if(value.seat){domain.validate({events:[event],seats:[value.seat]});if(value.seat.crn!==crn || value.seat.eventId!==event.id)throw new Error("Mismatched seating response.");}
      if(seats.size>=256)seats.delete(seats.keys().next().value);
      if(!stale)seats.set(cacheKey,value);return value;
    })().finally(()=>seatPending.delete(cacheKey));seatPending.set(cacheKey,task);return task;
  }
  function renderTodaySeat(ctx,event){
    const host=document.getElementById("today-exam-seat");if(!host||!event)return;
    if(!ctx.crn){host.textContent="Save a matching profile with your CRN to see your individual seat.";return;}
    const key=`${data.revision}/${event.id}/${ctx.crn}`;host.dataset.seatKey=key;
    const paint=value=>{const current=document.getElementById("today-exam-seat");if(current?.dataset.seatKey!==key)return;const s=value.seat;current.innerHTML=s?`<div><span class="exam-detail-label">Your room</span><strong class="exam-room-value">${esc(s.room)}</strong></div><div><span class="exam-detail-label">Your position</span><strong>${esc(s.row)} · S.No. ${esc(s.seat)}</strong>${s.page?`<small>Source PDF · page ${s.page}</small>`:""}</div>`:"<p>An individual seat is not confirmed for your next exam. Check the source notice or ask the coordinator.</p>";};
    if(!stale && seats.has(key)){paint(seats.get(key));return;}
    host.textContent="Checking your next exam seat…";
    seatFor(event,ctx.crn).then(paint).catch(()=>{const current=document.getElementById("today-exam-seat");if(current?.dataset.seatKey===key)current.textContent="Your seat could not be checked. Use the source seating plan or Check for updates.";});
  }
  function answer(q,ctx){
    if(!data||!domain.matches(q))return "";
    const selected=domain.select(data,q,context(q,ctx));if(!selected)return "";
    return `<p><strong>MSE-I · Published exam information</strong></p>${selected.message?`<p>${esc(selected.message)}</p>`:""}${selected.events.map(eventMarkup).join("")}${selected.seating?'<p>Seating is specific to a student and one exam date. Use “my exam room tomorrow” with a matching saved profile, or include your exact CRN.</p>':""}${stale?'<p class="answer-warning">Saved exam publication: live updates could not be checked. Check the source notice for later revisions.</p>':""}`;
  }
  async function respond(q,ctx){
    await refresh();
    if(!data)return "";
    const selected=domain.select(data,q,context(q,ctx));if(!selected)return "";
    if(!selected.seating||!selected.events.length)return answer(q,ctx);
    const explicit=String(q).match(/\b\d{7,12}\b/g)||[];
    if(explicit.length>1)return "<p>Please ask about one exact CRN at a time.</p>";
    // A selected foreign section never borrows this device owner's identity.
    const crn=explicit[0]||ctx.crn;
    if(!crn||(!explicit.length&&selected.events.some(e=>!e.sections.includes(ctx.section))))return "<p>Save your matching profile and CRN, or include one exact CRN and exam date. A section alone cannot determine an individual room or seat.</p>";
    const result=[];
    for(const event of selected.events.slice(0,12)){
      try{const value=await seatFor(event,crn),s=value.seat;result.push(`${eventMarkup(event)}${s?`<p><strong>Room ${esc(s.room)}</strong><br>${esc(s.row)} · S.No. position ${esc(s.seat)}${s.page?` · PDF page ${s.page}`:""}<br>CRN ${esc(crn)}</p>`:`<p>${esc(value.message || "No confirmed seating assignment for this exam.")}</p>`}`);
      }catch{result.push(`${eventMarkup(event)}<p>Seating could not be checked. Open the source seating plan; no room or seat has been inferred. Remaining seat lookups were stopped; check for updates before retrying.</p>`);break;}
    }
    return result.join("");
  }
  function todayMarkup(ctx,events,upcoming,mode){
    const focus=upcoming[0],complete=events.length>0&&!focus;
    const live=focus?.date===ctx.today&&ctx.minutes>=focus.start;
    const reporting=focus?.date===ctx.today&&focus.report!==null&&ctx.minutes>=focus.report&&!live;
    const state=live?"Your exam is in progress.":reporting?"It's time to report.":focus?.date===ctx.today?"Your exam is today.":focus?"Your next exam is coming up.":complete?"Your theory exams have ended.":"Choose your exam schedule.";
    const progress=live?Math.min(100,Math.max(0,100*(ctx.minutes-focus.start)/(focus.end-focus.start))):0;
    const nextCard=(event,label)=>`<article class="live-card next-card"><div class="card-kicker">${label}</div><div class="agenda-slot${event?"":" muted"}">${event?`<strong>${esc(event.title)}</strong><span>${date(event.date)}</span><span>${time(event.start)}–${time(event.end)}</span>${event.report!==null?`<span>Report ${time(event.report)}</span>`:""}`:'<strong>No further exam listed</strong><span>Only confirmed dates appear here.</span>'}</div></article>`;
    return `<section class="live-stack" aria-label="Live exam schedule"><article class="live-card now-card"><div class="card-kicker"><span class="live-dot" aria-hidden="true"></span><span>${live?"LIVE EXAM":focus?"NEXT EXAM":"EXAM STATUS"}</span><span class="kicker-end">${esc(ctx.subgroup||ctx.section||"Choose a section")}</span></div><div class="class-state">${state}</div><div class="current-class">${focus?`<h2>${esc(focus.title)}</h2><p>${date(focus.date)}</p><div class="class-details"><span><strong>Exam</strong> ${time(focus.start)}–${time(focus.end)}</span><span><strong>Report</strong> ${focus.report===null?"Not published":time(focus.report)}</span></div><div id="today-exam-seat" class="exam-seat-grid" role="status">Checking your next exam seat…</div><div class="progress-wrap"><div class="progress-track" role="progressbar" aria-label="Exam time elapsed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><div style="width:${progress}%"></div></div><div class="progress-labels"><span>${time(focus.start)}</span><span>${time(focus.end)} · IST</span></div></div>`:`<p>${data?complete?"The published theory exam period is complete.":"No theory exam schedule is confirmed for your selected section.":"Exam information is unavailable. Check for updates or try again when connected."}</p>`}</div><div class="exam-card-actions">${focus?`<button type="button" class="outline-button" data-exam-ask="my exam room ${focus.date}">Ask about my seat</button>${focus.sourceUrl?`<a class="text-button" href="${esc(focus.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source notice ↗</a>`:""}`:""}</div></article><div class="next-grid">${nextCard(upcoming[1],"UP NEXT")}${nextCard(upcoming[2],"THEN")}</div></section><section class="day-section"><div class="section-header"><div><p class="eyebrow">${upcoming.length?"UPCOMING EXAMS":"PUBLISHED EXAMS"}</p><h2>Your exam schedule</h2></div><span class="exam-count">${upcoming.length} remaining · ${events.length} total</span></div><div class="schedule-list">${events.map(e=>{const ended=e.date<ctx.today||(e.date===ctx.today&&e.end<=ctx.minutes);return `<details class="exam-agenda-item${ended?" exam-ended":""}" data-exam-event="${esc(e.id)}"><summary><span class="schedule-time">${date(e.date)}<span>${time(e.start)}–${time(e.end)}</span></span><span><strong class="schedule-name">${esc(e.title)}</strong><span class="schedule-sub">${ended?"Completed":e.report!==null?`Report by ${time(e.report)}`:"Reporting time not published"}</span></span><span class="exam-row-action">Details <span aria-hidden="true">⌄</span></span></summary><div class="exam-agenda-detail">${e.note?`<p>${esc(e.note)}</p>`:""}<p class="answer-source">${esc(e.source)}</p>${e.sourceUrl?`<a class="text-button" href="${esc(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">Read source notice ↗</a>`:""}<button class="text-button" type="button" data-exam-ask="my exam room ${e.date}">Check this exam's seating</button></div></details>`;}).join("")}</div><p class="panel-note">${mode==="auto"?"Auto view returns to your timetable after the final theory exam slot.":"Exam view is selected. You can switch to Auto or Timetable in Settings."}</p></section>`;
  }
  function render(){
    if(!bridge)return;const ctx=bridge.context(),publication=data||{events:[]},active=domain.active(publication,ctx.section,ctx.today,ctx.minutes);
    const mode=["auto","timetable","exam"].includes(ctx.todayView)?ctx.todayView:"auto";
    const showExams=mode==="exam" || (mode==="auto" && active.examMode);
    const card=document.getElementById("today-exam-card"),banner=document.getElementById("exam-notice-banner");
    const allTheory=publication.events.filter(e=>e.kind==="theory" && e.sections.includes(ctx.section)).sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
    const upcoming=allTheory.filter(e=>e.date>ctx.today || (e.date===ctx.today && e.end>ctx.minutes));
    if(card){card.hidden=!showExams;const open=[...card.querySelectorAll("details[open]")].map(e=>e.dataset.examEvent);const focused=card.contains(document.activeElement)?document.activeElement:null;const focusKey=focused?.getAttribute("data-exam-ask")||focused?.getAttribute("href");card.innerHTML=showExams?todayMarkup(ctx,allTheory,upcoming,mode):"";for(const details of card.querySelectorAll("details"))if(open.includes(details.dataset.examEvent))details.open=true;if(focusKey){const replacement=[...card.querySelectorAll("button,a")].find(e=>(e.getAttribute("data-exam-ask")||e.getAttribute("href"))===focusKey);replacement?.focus();}}
    if(showExams && upcoming.length)renderTodaySeat(ctx,upcoming[0]);
    const regular=document.getElementById("today-timetable-content");if(regular)regular.hidden=showExams;
    document.getElementById("today")?.classList.toggle("exam-mode-active",showExams);
    const intro=document.getElementById("intro-copy");if(intro)intro.textContent=showExams?"Your exam dates, reporting times and confirmed seating.":ctx.section?`${date(ctx.today)} · ${[ctx.section,ctx.subgroup].filter(Boolean).join(" / ")} · Your timetable is live.`:"Set up this device to see your own timetable.";
    if(banner){
      const notes=active.notices;
      const hasPractical=notes.some(e=>e.kind==="practical"),hasWorkshop=notes.some(e=>e.kind==="workshop");
      const heading=hasPractical&&hasWorkshop?"Upcoming practical and workshop exams":hasWorkshop?"Upcoming workshop exam":"Upcoming practical examinations";
      banner.hidden=!notes.length;
      banner.innerHTML=notes.length?`<strong>${heading}</strong>${notes.map(e=>`<p>${esc(e.title)} - ${date(e.date)}${e.endDate!==e.date?`-${date(e.endDate)}`:` - ${time(e.start)}-${time(e.end)}`}</p>`).join("")}<button type="button" class="text-button" data-exam-ask="my practical exams">Read exam notices</button>`:"";
    }
    const status=document.getElementById("exam-update-status");if(status){status.hidden=!showExams;status.textContent=!data?"Exam data is not available yet.":stale?"Saved exam publication · live check unavailable":"Exam updates checked on this device. Notices update automatically when published.";}
  }
  function init(adapter){bridge=adapter;try{setData(JSON.parse(localStorage.getItem(key)||"null"));}catch{}render();refresh();
    document.addEventListener("click",event=>{const target=event.target.closest?.("[data-exam-ask]");if(target)bridge.ask(target.dataset.examAsk);});
    document.addEventListener("visibilitychange",()=>{if(!document.hidden){render();refresh();}});
    setInterval(()=>{if(!document.hidden)refresh();},60000);
  }
  root.CompassExamDesk={init,refresh,render,answer,respond,setData,eventMarkup,fetchJson,getData:()=>data};
})(globalThis);

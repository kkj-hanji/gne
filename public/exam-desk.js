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
  function eventMarkup(e){return `<article class="exam-event"><strong>${esc(e.title)}</strong><p>${date(e.date)}${e.endDate!==e.date?` – ${date(e.endDate)}`:""}<br>${e.start===null?"In your respective lab turn":`${time(e.start)}–${time(e.end)}`}${e.report!==null?` · <strong>Report by ${time(e.report)}</strong>`:""}</p>${e.note?`<p>${esc(e.note)}</p>`:""}<small>${esc(e.sections.join(", "))}</small><p class="answer-source">${e.sourceUrl?`<a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">View source notice</a> · `:""}${esc(e.source)}</p></article>`;}
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
    const paint=value=>{const current=document.getElementById("today-exam-seat");if(current?.dataset.seatKey!==key)return;const s=value.seat;current.textContent=s?`Your seat: ${s.room} · ${s.row} · S.No. ${s.seat}${s.page?` · PDF page ${s.page}`:""}`:"An individual seat is not confirmed for your next exam. Check the source notice or ask the coordinator.";};
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
  function render(){
    if(!bridge)return;const ctx=bridge.context(),publication=data||{events:[]},active=domain.active(publication,ctx.section,ctx.today,ctx.minutes);
    const mode=["auto","timetable","exam"].includes(ctx.todayView)?ctx.todayView:"auto";
    const showExams=mode==="exam" || (mode==="auto" && active.examMode);
    const card=document.getElementById("today-exam-card"),banner=document.getElementById("exam-notice-banner");
    const allTheory=publication.events.filter(e=>e.kind==="theory" && e.sections.includes(ctx.section)).sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
    const upcoming=allTheory.filter(e=>e.date>ctx.today || (e.date===ctx.today && e.end>ctx.minutes));
    const shown=upcoming.length?upcoming:allTheory;
    const title=active.examMode?"Your exams":upcoming.length?"Upcoming exams":"Published exams";
    if(card){card.hidden=!showExams;card.innerHTML=showExams?`<p class="eyebrow">EXAM SCHEDULE · ${esc(ctx.section||"CHOOSE YOUR SECTION")}</p><h2>${title}</h2>${upcoming.length?'<p id="today-exam-seat" role="status"></p>':""}${shown.length?shown.map(eventMarkup).join(""):`<p>${data?"No theory exam schedule is confirmed for your selected section.":"Exam information is unavailable. Check for updates or try again when connected."}</p>`}${upcoming.length?'<button type="button" class="outline-button" data-exam-ask="my next exam room">Find my next exam seat</button>':""}<p class="panel-note">${mode==="auto"?"Today returns to your timetable after your final theory exam slot ends.":"Exam view is selected. Choose Auto or Timetable in Settings to change it."}${!upcoming.length&&allTheory.length?" These published theory exams have ended.":""}</p>`:"";}
    if(showExams && upcoming.length)renderTodaySeat(ctx,upcoming[0]);
    const regular=document.getElementById("today-timetable-content");if(regular)regular.hidden=showExams;
    const intro=document.getElementById("intro-copy");if(intro)intro.textContent=showExams?"Your exam dates, reporting times and confirmed seating.":ctx.section?`${date(ctx.today)} · ${[ctx.section,ctx.subgroup].filter(Boolean).join(" / ")} · Your timetable is live.`:"Set up this device to see your own timetable.";
    if(banner){const notes=active.notices;banner.hidden=!notes.length;banner.innerHTML=notes.length?`<strong>Upcoming practical examinations</strong>${notes.map(e=>`<p>${esc(e.title)} · ${date(e.date)}${e.endDate!==e.date?`–${date(e.endDate)}`:` · ${time(e.start)}–${time(e.end)}`}</p>`).join("")}<button type="button" class="text-button" data-exam-ask="my practical exams">Read practical notices</button>`:"";}
    const status=document.getElementById("exam-update-status");if(status){status.hidden=!showExams;status.textContent=!data?"Exam data is not available yet.":stale?"Saved exam publication · live check unavailable":"Exam updates checked on this device. Notices update automatically when published.";}
  }
  function init(adapter){bridge=adapter;try{setData(JSON.parse(localStorage.getItem(key)||"null"));}catch{}render();refresh();
    document.addEventListener("click",event=>{const target=event.target.closest?.("[data-exam-ask]");if(target)bridge.ask(target.dataset.examAsk);});
    document.addEventListener("visibilitychange",()=>{if(!document.hidden){render();refresh();}});
    setInterval(()=>{if(!document.hidden)refresh();},60000);
  }
  root.CompassExamDesk={init,refresh,render,answer,respond,setData,eventMarkup,fetchJson,getData:()=>data};
})(globalThis);

import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash, webcrypto} from "node:crypto";
import vm from "node:vm";
import {parseHTML} from "linkedom";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import "../public/exam-domain.js";
import "../public/brain-kernel.js";
import {examResponse} from "../src/exam-store.js";
import worker from "../src/worker.js";
import {createAppHarness} from "../scripts/stress-probe-harness.mjs";

const seed=JSON.parse(await readFile(new URL("../src/data/exam-seed.json",import.meta.url)));
const domain=globalThis.CompassExamDomain;
const scripts=Object.fromEntries(await Promise.all(["exam-domain","exam-desk","exam-import","admin-exams"].map(async name=>[name,await readFile(new URL(`../public/${name}.js`,import.meta.url),"utf8")])));
const context={section:"ECB",crn:"2617070",today:"2026-09-24",minutes:1100};
const select=(q,ctx=context)=>domain.select(seed,q,{...ctx,temporal:globalThis.CompassBrainKernel.resolveTemporalQuery(q+" date",ctx.today)});
const request=(path,method="GET",body)=>new Request("https://compass.test"+path,{method,headers:{"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
class MemoryKv {values=new Map();async get(k){return this.values.has(k)?JSON.parse(this.values.get(k)):null;}async put(k,v){this.values.set(k,v);}}

test("all 1,146 seats round-trip from the hashed 18-page supplied PDFs",async()=>{
  assert.equal(seed.events.length,21);assert.equal(seed.seats.length,1146);
  const sources=JSON.parse(await readFile(new URL("../src/data/exam-source-manifest.json",import.meta.url)));
  for(const source of sources){
    const bytes=await readFile(new URL("../public"+source.url,import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"),source.sha256);
    const pdf=await getDocument({data:new Uint8Array(bytes),verbosity:0}).promise;
    const event=seed.events.find(e=>e.sourceUrl===source.url);const parsed=[];
    try{assert.equal(pdf.numPages,source.pages);for(let p=1;p<=pdf.numPages;p++){const items=(await(await pdf.getPage(p)).getTextContent()).items;const rows=domain.parseSeatingPage(items,event.id,p);assert.equal(rows.length,items.filter(i=>/^\d{7,12}$/.test(i.str.trim())).length);parsed.push(...rows);}}finally{await pdf.destroy();}
    assert.equal(parsed.length,source.assignments);assert.deepEqual(parsed,seed.seats.filter(s=>s.eventId===event.id));
  }
  assert.deepEqual(seed.seats.find(s=>s.crn==="2617070"),{eventId:"mse1-theory-5",crn:"2617070",room:"A8 (Automobile block)",row:"Row-I",seat:"4",page:2});
  const chemistry=seed.seats.find(s=>s.crn==="2621036");assert.equal(chemistry.room,"S-202");assert.equal(chemistry.row,"Row-I");assert.equal(chemistry.seat,"1");
});

test("all workshop sections tolerate equivalent English, Roman Hindi/Punjabi and typo phrases",()=>{
  const workshop=seed.events.filter(e=>e.kind==="workshop");
  for(const e of workshop)for(const phrase of ["workshop exam","workshop ka paper kab hai","da workshop paper kado aa","wrkshop exam","work shop exam","workshop xam","workshop MSE-I","workshop exam date","manufacturing exam","mp exam"]){
    const result=select(e.sections[0]+" "+phrase);assert.equal(result.events.length,1,phrase+result.message);assert.equal(result.events[0].id,e.id);
  }
  assert.equal(select("ECE B2 workshop paper").events[0].id,"mse1-workshop-ecb");
  for(const q of ["ECB9 workshop exam","ECB12 workshop exam","CSD2 workshop exam","biology practical exam","robotics exam","workshop MSE2","physics exam 2030-09-25"]){assert.equal(select(q).events.length,0,q);}
  assert.equal(select("tell me my next exam").events[0].title,"Physics");
  assert.equal(select("CSD2 exam").events.length,5);
  assert.equal(select("physics group exam").events.length,6);
  assert.equal(select("my exam",{...context,section:""}).events.length,0);
  assert.equal(select("physics unit 1 details"),null);
});

test("date filtering, reporting times, profile period expiry and practical notices use exact boundaries",()=>{
  assert.equal(select("my exam tomorrow").events[0].report,750);
  assert.equal(select("CSD2 exam tomorrow").events[0].report,540);
  assert.equal(select("my exam 28 September").events[0].report,null);
  assert.equal(domain.active(seed,"ECB","2026-09-24",1439).examMode,false);
  assert.equal(domain.active(seed,"ECB","2026-09-25",0).examMode,true);
  assert.equal(domain.active(seed,"ECB","2026-10-01",854).examMode,true);
  assert.equal(domain.active(seed,"ECB","2026-10-01",855).examMode,false);
  assert.equal(domain.active(seed,"CSD","2026-10-01",644).examMode,true);
  assert.equal(domain.active(seed,"CSD","2026-10-01",645).examMode,false);
  assert.equal(domain.active(seed,"ECB","2026-10-09",870).notices.some(e=>e.kind==="workshop"),false);
  assert.equal(domain.active(seed,"ECB","2026-10-10",0).notices.length,0);
  assert.equal(select("my next exam",{...context,today:"2026-10-01",minutes:855}).events.length,0);
});

test("malformed publications, unsafe sources, duplicate identities/positions fail closed",()=>{
  const mutate=fn=>{const d=structuredClone(seed);fn(d);assert.throws(()=>domain.validate(d));};
  mutate(d=>d.events[0].date="2026-02-30");mutate(d=>d.events[0].endDate="2026-10-02");
  mutate(d=>d.events[0].report=1440);mutate(d=>d.events[0].sourceUrl="javascript:alert(1)");
  mutate(d=>d.events[0].title="<script>bad</script>");mutate(d=>d.seats.push(d.seats[0]));
  mutate(d=>d.seats.push({...d.seats[0],crn:"9999999",room:" "+d.seats[0].room+" ",seat:"0"+d.seats[0].seat}));
  mutate(d=>d.seats[0].eventId="missing");mutate(d=>d.events[0].sections=[]);
  mutate(d=>d.seats[0].crn=Number(d.seats[0].crn));mutate(d=>d.seats[0].seat="0");
  assert.throws(()=>domain.parseSeatingPage([],"test",1));
});

test("shared publishing requires authorization, detects stale revisions, updates seats and supports rollback",async()=>{
  const env={SOURCE_REGISTRY:new MemoryKv()};
  assert.equal((await examResponse(request("/api/admin/exams"),env)).status,401);
  const pub=await(await examResponse(request("/api/exams"),env)).json();assert.equal(pub.seats,undefined);assert.doesNotMatch(JSON.stringify(pub),/2617070/);
  const draft=await(await examResponse(request("/api/admin/exams"),env,true)).json();draft.seats.find(s=>s.crn==="2617070").room="F108";
  const published=await(await examResponse(request("/api/admin/exams","PUT",{...draft,baseRevision:draft.revision}),env,true)).json();assert.equal(published.ok,true);
  const seatBody={crn:"2617070",eventId:"mse1-theory-5"};
  let lookup=await(await examResponse(request("/api/exams/seat","POST",seatBody),env)).json();assert.equal(lookup.seat.room,"F108");
  assert.equal((await examResponse(request("/api/admin/exams","PUT",{...draft,baseRevision:draft.revision}),env,true)).status,409);
  const rollback=await examResponse(request("/api/admin/exams","PUT",{baseRevision:published.revision,rollback:true}),env,true);assert.equal(rollback.status,200);
  lookup=await(await examResponse(request("/api/exams/seat","POST",seatBody),env)).json();assert.match(lookup.seat.room,/A8/);
  const missing=await(await examResponse(request("/api/exams/seat","POST",{...seatBody,eventId:"mse1-theory-2"}),env)).json();assert.equal(missing.seat,null);
  assert.equal((await examResponse(request("/api/exams/seat","POST",{crn:"*",eventId:seatBody.eventId}),env)).status,400);
  const cross=request("/api/admin/exams","PUT",{...draft,baseRevision:draft.revision});cross.headers.set("Origin","https://elsewhere.test");assert.equal((await examResponse(cross,env,true)).status,403);
  const bad=new Request("https://compass.test/api/exams/seat",{method:"POST",headers:{"Content-Type":"application/json"},body:"{"});assert.equal((await examResponse(bad,env)).status,400);
});

test("Worker protects admin routes and KV failures cannot supply old seats or authorize an edit",async()=>{
  const env={SOURCE_REGISTRY:{get(){throw new Error("unavailable");}},ADMIN_API_TOKEN:"test-key"};
  assert.equal((await worker.fetch(request("/api/admin/exams"),env,{})).status,401);
  const admin=request("/api/admin/exams");admin.headers.set("X-Compass-Admin-Key","test-key");assert.equal((await worker.fetch(admin,env,{})).status,503);
  const summary=await(await examResponse(request("/api/exams"),env)).json();assert.equal(summary.stale,true);
  assert.equal((await examResponse(request("/api/exams/seat","POST",{eventId:"mse1-theory-5",crn:"2617070"}),env)).status,503);
});

function deskHarness(){
  const {document}=parseHTML('<html><body><main id="today"><div id="today-exam-card"></div><div id="today-timetable-content"></div><div id="exam-notice-banner"></div><div id="exam-update-status"></div><div id="exam-admin-panel"></div></main></body></html>');
  const prototype=Object.getPrototypeOf(document.createElement("select"));Object.defineProperty(prototype,"value",{configurable:true,get(){return this.querySelector("option[selected]")?.value||this.querySelector("option")?.value||"";},set(v){for(const o of this.querySelectorAll("option")){if(o.value===v)o.setAttribute("selected","");else o.removeAttribute("selected");}}});
  const storage=new Map(),env={SOURCE_REGISTRY:new MemoryKv()},ctx={document,console,crypto:webcrypto,Intl,Date,Map,Set,JSON,AbortController,URL,Blob,Response,setTimeout,clearTimeout,setInterval(){},confirm:()=>true,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},CompassBrainKernel:globalThis.CompassBrainKernel};
  ctx.fetch=(path,options={})=>examResponse(new Request("https://compass.test"+path,options),env,options.headers?.["X-Compass-Admin-Key"]==="test-key");
  vm.createContext(ctx);for(const text of Object.values(scripts))vm.runInContext(text,ctx);
  ctx.CompassExamDesk.setData(seed);return {ctx,document,env,storage};
}

const pdfFile=async group=>{
  const bytes=await readFile(new URL(`../public/data/seating-2026-09-25-${group}.pdf`,import.meta.url));
  return {name:`Seating Plan ${group} Group.pdf`,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
};
const readPdf=bytes=>getDocument({data:new Uint8Array(bytes),verbosity:0}).promise;

test("two actual PDFs preview, map, apply and publish atomically through admin controls",async()=>{
  const {ctx,document,env,storage}=deskHarness(),$=id=>document.getElementById(id);
  ctx.CompassExamAdmin.init({readPdf});$("exam-publishing-key").value="test-key";await $("exam-admin-load").onclick();
  assert.equal($("exam-publishing-key").getAttribute("aria-describedby"),"exam-key-help");
  assert.match($("exam-key-help").textContent,/ADMIN_API_TOKEN/);
  $("exam-import-date").value="2026-09-25";
  Object.defineProperty($("exam-seating-multi-files"),"files",{value:await Promise.all([pdfFile("chemistry"),pdfFile("physics")])});
  await $("exam-import-multi-seats").onclick();
  assert.match($("exam-import-preview").textContent,/570 assignments/);
  assert.match($("exam-import-preview").textContent,/576 assignments/);
  assert.equal($("exam-map-0").value,"mse1-theory-0");assert.equal($("exam-map-1").value,"mse1-theory-5");
  assert.equal(env.SOURCE_REGISTRY.values.size,0);assert.equal($("exam-publish").disabled,true);
  await $("exam-apply-import").onclick();assert.match($("exam-seat-preview").textContent,/Imported into draft/);
  await $("exam-review").onclick();assert.match($("exam-publication-preview").textContent,/1146 seating/);
  await $("exam-publish").onclick();assert.match($("exam-admin-status").textContent,/Published successfully/);
  const publication=await(await examResponse(request("/api/admin/exams"),env,true)).json();
  assert.deepEqual(publication.seats,seed.seats);
  assert.match(publication.events[0].source,/Admin-supplied seating PDFs/);
  assert.doesNotMatch([...storage.values()].join(""),/test-key/);
  assert.match(await ctx.CompassExamDesk.respond("my exam room tomorrow",context),/Room A8/);
});

test("PDF import rejects duplicate, excessive, corrupt and oversized inputs without publication",async()=>{
  const {ctx}=deskHarness(),importer=ctx.CompassExamImport,physics=await pdfFile("physics"),chemistry=await pdfFile("chemistry");
  await assert.rejects(importer.readFiles([physics,chemistry,physics],readPdf),/one or two/);
  await assert.rejects(importer.readFiles([physics,{...physics,name:"renamed.pdf"}],readPdf),/same PDF/);
  await assert.rejects(importer.readFiles([{...physics,size:16*1024*1024}],readPdf),/15 MB/);
  await assert.rejects(importer.readFiles([{...physics,name:"seats.txt"}],readPdf),/PDF files/);
  await assert.rejects(importer.readFiles([physics,{name:"broken.pdf",size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer}],readPdf));
  let destroyed=false;
  await assert.rejects(importer.readFiles([physics],async()=>({numPages:51,destroy:async()=>{destroyed=true;}})),/50 pages/);
  assert.equal(destroyed,true);
});

test("exam date and group mapping distinguishes same-subject papers and validates before replacing seats",()=>{
  const {ctx}=deskHarness(),importer=ctx.CompassExamImport;
  assert.equal(importer.candidates(seed.events,"2026-09-28","Physics group.pdf")[0].id,"mse1-theory-6");
  assert.equal(importer.candidates(seed.events,"2026-09-28","Chemistry group.pdf")[0].id,"mse1-theory-1");
  assert.equal(importer.candidates(seed.events,"2026-09-28","seats.pdf").length,2);
  const before=JSON.stringify(seed),file={name:"Physics group.pdf",rows:seed.seats.filter(s=>s.eventId==="mse1-theory-5")};
  for(const [id,date] of [["mse1-theory-0","2026-09-25"],["mse1-theory-5","2026-09-28"],["","2026-09-25"]])assert.throws(()=>importer.apply(seed,[file],[id],date),/mapping/);
  assert.throws(()=>importer.apply(seed,[{...file,rows:[file.rows[0],file.rows[0]]}],["mse1-theory-5"],"2026-09-25"),/Duplicate/);
  assert.equal(JSON.stringify(seed),before);
  const next=importer.apply(seed,[file],["mse1-theory-6"],"2026-09-28").draft;
  assert.equal(next.seats.length,seed.seats.length+576);
  assert.equal(next.seats.filter(s=>s.eventId==="mse1-theory-5").length,576);
  assert.equal(next.seats.filter(s=>s.eventId==="mse1-theory-6").length,576);
});

test("changing a PDF selection during reading invalidates the pending preview",async()=>{
  const {ctx,document,env}=deskHarness(),$=id=>document.getElementById(id);
  let finish,started;const pending=new Promise(resolve=>{finish=resolve;}),reading=new Promise(resolve=>{started=resolve;});
  ctx.CompassExamAdmin.init({readPdf:async bytes=>{started();await pending;return readPdf(bytes);}});
  $("exam-publishing-key").value="test-key";await $("exam-admin-load").onclick();$("exam-import-date").value="2026-09-25";
  Object.defineProperty($("exam-seating-multi-files"),"files",{value:[await pdfFile("physics")]});
  const preparing=$("exam-import-multi-seats").onclick();await reading;
  $("exam-seating-multi-files").onchange();finish();await preparing;
  assert.match($("exam-admin-status").textContent,/selection changed/);
  assert.equal($("exam-apply-import").disabled,true);assert.equal($("exam-import-preview").innerHTML,"");
  assert.equal(env.SOURCE_REGISTRY.values.size,0);
});

test("Today exam cards show reporting, elapsed time, exact seat and preserve expanded details",async()=>{
  const {ctx,document}=deskHarness();let own={...context,today:"2026-09-25",minutes:750};const asked=[];
  ctx.CompassExamDesk.init({context:()=>own,ask:q=>asked.push(q)});await ctx.CompassExamDesk.refresh();
  const card=document.getElementById("today-exam-card");assert.match(card.textContent,/time to report/);
  assert.equal(card.querySelector(".now-card h2").textContent,"Physics");
  assert.equal(card.querySelectorAll(".next-card").length,2);
  assert.equal(card.querySelector("[data-exam-ask]").getAttribute("data-exam-ask"),"my exam room 2026-09-25");
  const details=card.querySelector("details");details.setAttribute("open","");
  own.minutes=810;ctx.CompassExamDesk.render();
  assert.match(card.textContent,/exam is in progress/);
  assert.equal(card.querySelector('[role="progressbar"]').getAttribute("aria-valuenow"),"50");
  assert.equal(card.querySelector("details").open,true);
  await new Promise(resolve=>setTimeout(resolve,20));assert.match(card.querySelector(".exam-room-value").textContent,/A8/);
  own.minutes=855;ctx.CompassExamDesk.render();assert.equal(card.querySelector(".now-card h2").textContent,"Mathematics-I");
  assert.match(card.querySelector(".exam-ended").textContent,/Physics/);
});

test("offline checks discard cached seating and malformed seating payloads fail safely",async()=>{
  for(const payload of [false,0,"",[],{eventId:"mse1-theory-5",crn:"9999999",room:"WRONG ROOM",row:"Row-I",seat:"4",page:2}]){
    const {ctx}=deskHarness(),desk=ctx.CompassExamDesk;
    ctx.fetch=async path=>path==="/api/exams"?Response.json(seed):Response.json({revision:seed.revision,seat:payload});
    const answer=await desk.respond("my exam room tomorrow",context);assert.match(answer,/could not be checked/);assert.doesNotMatch(answer,/WRONG ROOM/);
  }
  const {ctx}=deskHarness(),desk=ctx.CompassExamDesk;
  assert.match(await desk.respond("my exam room tomorrow",context),/Room A8/);
  ctx.fetch=async()=>{throw new Error("Offline");};await desk.refresh(true);
  const answer=await desk.respond("my exam room tomorrow",context);assert.match(answer,/could not be checked/);assert.doesNotMatch(answer,/Room A8/);
});

test("a delayed profile seating response cannot overwrite a different active profile",async()=>{
  const {ctx,document}=deskHarness();let finish;const waiting=new Promise(resolve=>{finish=resolve;});
  ctx.fetch=async path=>path==="/api/exams"?Response.json(seed):waiting;
  let own={...context,today:"2026-09-25",minutes:600};
  ctx.CompassExamDesk.init({context:()=>own,ask(){}});await ctx.CompassExamDesk.refresh();
  own={...own,crn:""};ctx.CompassExamDesk.render();
  finish(Response.json({revision:seed.revision,seat:seed.seats.find(s=>s.crn==="2617070")}));
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.match(document.getElementById("today-exam-seat").textContent,/matching profile/);
  assert.doesNotMatch(document.getElementById("today-exam-seat").textContent,/A8/);
});

test("a delayed seat from an older publication is rejected",async()=>{
  const {ctx}=deskHarness();let finish;const waiting=new Promise(resolve=>{finish=resolve;});
  ctx.fetch=async path=>path==="/api/exams"?Response.json(seed):waiting;
  await ctx.CompassExamDesk.refresh();const pending=ctx.CompassExamDesk.respond("my exam room tomorrow",context);
  await new Promise(resolve=>setTimeout(resolve,5));
  ctx.CompassExamDesk.setData({...seed,revision:"revision-after-seat-request",publishedAt:"2099-01-01T00:00:00Z"});
  finish(Response.json({revision:seed.revision,seat:seed.seats.find(s=>s.crn==="2617070")}));
  const answer=await pending;assert.match(answer,/could not be checked/);assert.doesNotMatch(answer,/Room A8/);
});

test("failed multi-exam seat lookup stops after one failed request",async()=>{
  const {ctx}=deskHarness();let calls=0;
  ctx.fetch=async path=>{if(path==="/api/exams")return Response.json(seed);calls++;throw new Error("Offline");};
  assert.match(await ctx.CompassExamDesk.respond("my exam room",context),/Remaining seat lookups were stopped/);
  assert.equal(calls,1);
});

test("every published CRN lookup returns its own exact exam assignment",async()=>{
  for(const seat of seed.seats){const response=await examResponse(request("/api/exams/seat","POST",{eventId:seat.eventId,crn:seat.crn}),{});assert.equal(response.status,200);const value=await response.json();assert.deepEqual(value.seat,seat);}
  for(const section of [...new Set(seed.events.flatMap(e=>e.sections))]){
    const expected=seed.events.filter(e=>e.kind==="theory" && e.sections.includes(section));
    assert.deepEqual(select(section+" exams").events.map(e=>e.id).sort(),expected.map(e=>e.id).sort());
  }
});

test("browser desk uses matching profile identity, isolates foreign scopes, rejects malformed responses and preserves newer data",async()=>{
  const {ctx}=deskHarness(),desk=ctx.CompassExamDesk;
  assert.match(await desk.respond("my exam room tomorrow",context),/A8.*Automobile/);
  assert.match(await desk.respond("my exam room 28 September",context),/No confirmed seat/);
  assert.match(await desk.respond("CSD2 exam room tomorrow",context),/matching profile/);
  assert.match(await desk.respond("my exam room tomorrow",{...context,crn:""}),/matching profile/);
  const newer={...seed,revision:"newer",publishedAt:"2099-01-01T00:00:00Z"};desk.setData(newer);desk.setData(seed);assert.equal(desk.getData().revision,"newer");
  ctx.fetch=async()=>new Response("<!doctype html><html>proxy</html>");await desk.refresh(true);assert.equal(desk.getData().revision,"newer");assert.match(desk.answer("my exam",context),/Saved exam publication/);
});

test("real admin controls load, validate pasted seats, review and publish a revision consumed by chat",async()=>{
  const {ctx,document}=deskHarness(),$=id=>document.getElementById(id);
  // LinkeDOM models select.value as read-only; browsers implement a setter.
  const prototype=Object.getPrototypeOf(document.createElement("select"));Object.defineProperty(prototype,"value",{configurable:true,get(){return this.querySelector("option[selected]")?.value||this.querySelector("option")?.value||"";},set(v){for(const o of this.querySelectorAll("option")){if(o.value===v)o.setAttribute("selected","");else o.removeAttribute("selected");}}});
  ctx.CompassExamAdmin.init({});$("exam-publishing-key").value="test-key";await $("exam-admin-load").onclick();
  assert.equal($("exam-editor").hidden,false);$("exam-edit-select").value="mse1-theory-5";$("exam-edit-select").onchange();
  $("exam-seat-csv").value="crn,room,row,seat\n2617070,F108,Row-II,8";await $("exam-paste-seats").onclick();assert.match($("exam-seat-preview").textContent,/1 assignments/);
  await $("exam-review").onclick();assert.equal($("exam-publish").disabled,false);await $("exam-publish").onclick();assert.match($("exam-admin-status").textContent,/Published successfully/);
  assert.match(await ctx.CompassExamDesk.respond("my exam room tomorrow",context),/Room F108/);
  $("exam-one-crn").value="2617070";await $("exam-find-seat").onclick();assert.equal($("exam-one-room").value,"F108");
  $("exam-one-room").value="F109";await $("exam-save-seat").onclick();await $("exam-review").onclick();await $("exam-publish").onclick();
  assert.match(await ctx.CompassExamDesk.respond("my exam room tomorrow",context),/Room F109/);
  ctx.CompassExamAdmin.clear();assert.equal($("exam-publishing-key").value,"");assert.equal($("exam-editor").hidden,true);
});

test("existing app answer modes consume the publication with active selection and safe fallback",()=>{
  const h=createAppHarness();for(const name of ["exam-domain","exam-desk"])vm.runInContext(scripts[name],h.context);
  h.context.CompassExamDesk.setData(seed);h.api.state.nowOverride="2026-09-24T10:00:00Z";
  for(const mode of ["legacy","v2","v12","v22"]){h.api.state.settings.brainMode=mode;
    for(const event of seed.events.filter(e=>e.kind==="workshop"))for(const phrase of ["workshop exam","workshop ka paper kab hai","da workshop paper kado aa","wrkshop exam","work shop exam","workshop xam","workshop MSE-I","workshop exam date","manufacturing exam","mp exam"]){assert.match(h.api.answerWithoutAi(event.sections[0]+" "+phrase),new RegExp(Number(event.date.slice(-2))+" Oct"),mode+" "+event.sections[0]+" "+phrase);}
    assert.match(h.api.answerWithoutAi("Physics unit 1 details"),/syllabus/i);
  }
  h.api.state.selectedGroup="MEA";assert.match(h.api.answerWithoutAi("my workshop exam"),/8:30 AM/);
});

test("Today card and practical banner expire in the DOM at the final slot",async()=>{
  const {ctx,document}=deskHarness();let own={...context,today:"2026-10-01",minutes:854};
  ctx.CompassExamDesk.init({context:()=>own,ask(){}});await ctx.CompassExamDesk.refresh();
  assert.equal(document.getElementById("today-exam-card").hidden,false);
  assert.equal(document.getElementById("today-timetable-content").hidden,true);
  own.minutes=855;ctx.CompassExamDesk.render();
  assert.equal(document.getElementById("today-exam-card").hidden,true);
  assert.equal(document.getElementById("today-timetable-content").hidden,false);
  assert.equal(document.getElementById("exam-notice-banner").hidden,false);
  own.today="2026-10-10";ctx.CompassExamDesk.render();assert.equal(document.getElementById("exam-notice-banner").hidden,true);
});

test("Today view modes override Auto, preserve the timetable, and handle empty exam data",async()=>{
  const {ctx,document}=deskHarness();let own={...context,today:"2026-09-25",minutes:600,todayView:"auto"};
  const desk=ctx.CompassExamDesk;desk.init({context:()=>own,ask(){}});await desk.refresh();
  const exam=document.getElementById("today-exam-card"),regular=document.getElementById("today-timetable-content");regular.innerHTML='<p id="preserved-class">Timetable content</p>';
  assert.equal(exam.hidden,false);assert.equal(regular.hidden,true);
  assert.equal(document.getElementById("today").classList.contains("exam-mode-active"),true);
  own.todayView="timetable";desk.render();assert.equal(exam.hidden,true);assert.equal(regular.hidden,false);
  assert.equal(document.getElementById("today").classList.contains("exam-mode-active"),false);
  own.today="2026-10-02";own.todayView="exam";desk.render();assert.equal(exam.hidden,false);assert.equal(regular.hidden,true);assert.match(exam.textContent,/have ended/);
  own.todayView="auto";desk.render();assert.equal(exam.hidden,true);assert.equal(regular.hidden,false);assert.ok(document.getElementById("preserved-class"));
  own.today="2026-09-24";desk.render();assert.equal(exam.hidden,true);
  own.todayView="exam";desk.render();assert.match(exam.textContent,/UPCOMING EXAMS/);
  own.section="";desk.render();assert.match(exam.textContent,/No theory exam schedule/);
  own.todayView="invalid";desk.render();assert.equal(exam.hidden,true);assert.equal(regular.hidden,false);
  own={...own,section:"CSD",today:"2026-10-01",minutes:644,todayView:"auto"};desk.render();assert.equal(exam.hidden,false);
  own.minutes=645;desk.render();assert.equal(exam.hidden,true);
});

test("exam UI lives only on Today and the settings control persists the view",async()=>{
  const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
  const {document,window}=parseHTML(html);
  assert.equal(document.getElementById("today-exam-card").closest("[data-page]").id,"today");
  assert.equal(document.getElementById("day-schedule").closest("#today-timetable-content").id,"today-timetable-content");
  assert.equal(document.getElementById("chat").closest("#today"),null);
  assert.equal(document.querySelector("#profile #exam-update-status"),null);
  assert.equal(document.getElementById("profile-exam-card"),null);
  const h=createAppHarness(),c=h.context;c.document=document;c.location={hash:"",search:"",href:"https://compass.test/"};
  Object.assign(c.window,{addEventListener(){},matchMedia:()=>({matches:false})});
  let renders=0;c.CompassExamDesk={render(){renders++;}};
  // LinkeDOM's select.value lacks the setter implemented by browsers.
  const prototype=Object.getPrototypeOf(document.createElement("select"));Object.defineProperty(prototype,"value",{configurable:true,get(){return this.querySelector("option[selected]")?.value||this.querySelector("option")?.value||"";},set(v){for(const o of this.querySelectorAll("option")){if(o.value===v)o.setAttribute("selected","");else o.removeAttribute("selected");}}});
  vm.runInContext("initEvents(); renderSettingsPage();",c);
  const control=document.getElementById("settings-today-view");assert.equal(control.value,"auto");
  for(const mode of ["exam","timetable","auto"]){control.value=mode;control.dispatchEvent(new window.Event("change"));assert.equal(h.api.state.settings.todayView,mode);assert.equal(vm.runInContext("loadSettings().todayView",c),mode);}
  assert.equal(renders,3);
});

test("actual chat submit uses published seating with Roman language, date changes and profile changes",async()=>{
  const {document,window}=parseHTML(await readFile(new URL("../public/index.html",import.meta.url),"utf8"));
  const h=createAppHarness(),c=h.context;
  Object.assign(c,{document,AbortController,Response,location:{hash:"",search:"",href:"https://compass.test/"}});
  Object.assign(c.window,{addEventListener(){},matchMedia:()=>({matches:false})});
  for(const name of ["exam-domain","exam-desk"])vm.runInContext(scripts[name],c);
  c.CompassExamDesk.setData(seed);const env={SOURCE_REGISTRY:new MemoryKv()};
  c.fetch=(path,options)=>examResponse(new Request("https://compass.test"+path,options),env);
  h.api.state.nowOverride="2026-09-24T10:00:00Z";
  h.api.state.student={name:"KAUSHIK JAIN",crn:"2617070",section:"ECB",subsection:"ECB1"};
  vm.runInContext("initEvents()",c);document.getElementById("chat-window").scrollTo=()=>{};
  const ask=async q=>{document.getElementById("chat-window").innerHTML="";document.getElementById("question-input").value=q;document.getElementById("question-form").dispatchEvent(new window.Event("submit",{cancelable:true}));await new Promise(resolve=>setTimeout(resolve,80));return document.getElementById("chat-window").textContent;};
  for(const q of ["my exam room tomorrow","mera exam kal kis room mein hai","mera exam kal kis room me hai","mera paper kal kithe aa","mera exam kidhar hai tomorrow","mera paper kitthe aa kal","my seatingplan tomorrow","2617070 exam room 25 September"]){assert.match(await ask(q),/A8 \(Automobile block\)/,q);}
  assert.match(await ask("ECB workshop ka paper kab hai"),/9 Oct/);
  h.api.state.nowOverride="2026-09-25T06:00:00Z";assert.match(await ask("my exam room today"),/A8 \(Automobile block\)/);
  assert.doesNotMatch(await ask("my exam room tomorrow"),/Room A8/);
  h.api.state.selectedGroup="CSD";h.api.state.selectedSubgroup="CSD2";
  assert.match(await ask("my exam room today"),/matching profile/);
});

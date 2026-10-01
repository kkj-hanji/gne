import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import "../public/exam-domain.js";
import "../public/exam-schedule.js";
import "../public/practical-exams.js";

const [chemistryPath, physicsPath, edgShift1Path, edgShift2Path, beeePath] = process.argv.slice(2);
if (![chemistryPath, physicsPath, edgShift1Path, edgShift2Path, beeePath].every(Boolean)) {
  throw new Error("Provide Chemistry, Physics, EDG Shift 1, EDG Shift 2, and BEEE Chemistry-group PDFs, in that order.");
}
const domain = globalThis.CompassExamDomain;
const exams = globalThis.CompassExams, practicals = globalThis.CompassPracticals;
const events = exams.entries.map((e,i)=>({id:`mse1-theory-${i}`,kind:"theory",title:exams.subjects[e.subject].label,date:e.date,endDate:e.date,start:e.start,end:e.end,report:e.date==="2026-09-25"?e.start-15:null,sections:e.sections,source:"User-supplied GNDEC Applied Sciences date sheet, issued 14 September 2026",sourceUrl:exams.source.pdfUrl,note:"Times are IST. Later notices may revise this schedule."}));
events.push(...practicals.workshops.map(e=>({id:`mse1-workshop-${e.section.toLowerCase()}`,kind:"workshop",title:"Manufacturing Practices (Workshops)",date:e.date,endDate:e.date,start:e.start,end:e.end,report:null,sections:[e.section],source:practicals.source.provenance,sourceUrl:practicals.source.url,note:`Periods ${e.periods}. Both subsections. Workshop times confirmed by supplier on 24 September 2026.`})));
events.push({id:"mse1-practical-window",kind:"practical",title:"Physics, Chemistry and English lab MSE-I",date:"2026-10-05",endDate:"2026-10-09",start:null,end:null,report:null,sections:[...new Set(exams.entries.flatMap(e=>e.sections))],source:practicals.source.provenance,sourceUrl:practicals.source.url,note:"In your respective lab turns; exact individual lab date/time is not provided. Keep files ready and prepare for viva. If a scheduled examination falls on a holiday, the notice moves it to the corresponding day of the following week. Confirm your lab turn with the lab in-charge."});
const seats=[], sources=[];
const sourceConfigs=[
  {kind:"chemistry",path:chemistryPath,name:"seating-2026-09-25-chemistry.pdf"},
  {kind:"physics",path:physicsPath,name:"seating-2026-09-25-physics.pdf"},
  {kind:"edg-shift-1",path:edgShift1Path,name:"seating-2026-09-30-edg-shift-1.pdf"},
  {kind:"edg-shift-2",path:edgShift2Path,name:"seating-2026-09-30-edg-shift-2.pdf"},
  {kind:"beee-chemistry",path:beeePath,name:"seating-2026-09-30-beee-chemistry.pdf"}
];
const eventFor=(title,start)=>events.find(e=>e.kind==="theory"&&e.date==="2026-09-30"&&e.title.toLowerCase()===title.toLowerCase()&&e.start===start);
function scannedGrid(eventId,page,room,columns){
  const rows=[];
  for(const column of columns) for(let i=0;i<column.values.length;i++){
    const crn=column.values[i];
    if(crn) rows.push({eventId,crn:String(crn),room,row:column.row,seat:String(i+1),page});
  }
  return rows;
}
const col=(row,values)=>({row,values});
const seq=(start,end,omitted=[])=>Array.from({length:end-start+1},(_,i)=>start+i).filter(n=>!omitted.includes(n)).map(n=>String(n));

for(const cfg of sourceConfigs){
  const bytes=await readFile(cfg.path), pdf=await getDocument({data:new Uint8Array(bytes),verbosity:0}).promise;
  let event, extracted=[];
  try {
    if(cfg.kind==="chemistry") event=events.find(e=>e.date==="2026-09-25"&&e.title.toLowerCase()==="chemistry");
    if(cfg.kind==="physics") event=events.find(e=>e.date==="2026-09-25"&&e.title.toLowerCase()==="physics");
    if(cfg.kind==="edg-shift-1") event=eventFor("EDG",555);
    if(cfg.kind==="edg-shift-2") event=eventFor("EDG",660);
    if(cfg.kind==="beee-chemistry") event=eventFor("BEEE",555);
    if(!event) throw new Error("No matching published exam event for "+cfg.kind);
    if(cfg.kind==="edg-shift-2"){
      if(pdf.numPages!==3) throw new Error("The visually reviewed EDG Shift 2 plan must contain three pages.");
      extracted.push(
        ...scannedGrid(event.id,1,"S-201",[col("Row-I",["2617001","2617002","2617003","2617004","2617005","2617006",null]),col("Row-II",["2617007","2617008","2617009","2617010","2617011","2617012",null]),col("Row-III",["2617013","2617014","2617015","2617016","2617017","2617018",null]),col("Row-IV",["2617019","2617020","2617021","2617022","2617023","2617024","2617025"]),col("Row-V",["2617026","2617027","2617028","2617029","2617030","2617031","2617032"])]),
        ...scannedGrid(event.id,1,"S-202",[col("Row-I",["2617033","2617034","2617035","2617037","2617039","2617040",null]),col("Row-II",["2617041","2617042","2617043","2617044","2617045","2617046",null]),col("Row-III",["2617047","2617048","2617049","2617050","2617051","2617052",null]),col("Row-IV",["2617053","2617054","2617055","2617056","2617057","2617058","2617059"]),col("Row-V",["2617060","2617061","2617062","2617063","2617064","2617065","2617066"])])
      );
      extracted.push(
        ...scannedGrid(event.id,2,"S-203",[col("Row-I",["2617067","2617068","2617069","2617070","2617071","2617073",null]),col("Row-II",["2617074","2617075","2617076","2617077","2617078","2617079",null]),col("Row-III",["2617080","2617081","2617082","2617083","2617084","2617085",null]),col("Row-IV",["2617086","2617087","2617088","2617089","2617090","2617091","2617092"]),col("Row-V",["2617093","2617095","2617096","2617097","2617098","2617099","2617100"])]),
        ...scannedGrid(event.id,2,"S-204",[col("Row-I",["2617101","2617102","2617103","2617104","2617105","2617106",null]),col("Row-II",["2617107","2617108","2617109","2617110","2617111","2617112",null]),col("Row-III",["2617113","2617114","2617115","2617116","2617117","2617118",null]),col("Row-IV",["2617119","2617121","2617122","2617123","2617124","2617125","2617126"]),col("Row-V",["2617127","2617128","2617129","2617130","2617131","2617132","2617133"])])
      );
      extracted.push(...scannedGrid(event.id,3,"Drawing hall (Diploma building)",[
        col("Row-I",seq(2616001,2616022)),
        col("Row-II",[...seq(2616023,2616029),...seq(2616031,2616045)]),
        col("Row-III",[...seq(2616046,2616065),null,null]),
        col("Row-IV",seq(2616066,2616087)),
        col("Row-V",seq(2616088,2616109)),
        col("Row-VI",[...seq(2616110,2616113),...seq(2616115,2616125),...seq(2616127,2616131)])
      ]));
      if(extracted.length!==256) throw new Error("EDG Shift 2 transcription count must be 256, got "+extracted.length);
    } else {
      for(let page=1;page<=pdf.numPages;page++){
        const items=(await(await pdf.getPage(page)).getTextContent()).items;
        const raw=items.filter(i=>/^\d{7,12}$/.test(i.str.trim())).length;
        if(cfg.kind==="edg-shift-1"){
          const parsed=domain.parseNumberedGridPage(items,event.id,page);
          extracted.push(...parsed);
          if(raw!==parsed.length) throw new Error("EDG Shift 1 page "+page+" extracted "+parsed.length+" of "+raw+" CRNs.");
        } else {
          const parsed=domain.parseSeatingPage(items,event.id,page);
          extracted.push(...parsed);
          if(raw!==parsed.length) throw new Error(cfg.kind+" page "+page+" did not preserve all printed CRNs.");
        }
      }
    }
  } finally { await pdf.destroy(); }
  if(!extracted.length || new Set(extracted.map(s=>s.crn)).size!==extracted.length) throw new Error("No assignments or duplicate CRNs found in "+cfg.kind);
  if(cfg.kind==="chemistry"||cfg.kind==="physics"){
    event.source="User-supplied GNDEC seating PDF and message for 25 September 2026; official web publication not verified";
    event.note="Report 15 minutes before the exam. Follow the printed seating arrangement. Row-I is from the entrance side. Seating applies only to 25 September 2026, not subsequent papers.";
  } else {
    event.source="User-supplied GNDEC seating plan for 30 September 2026; official web publication not verified";
    event.sourceUrl="/data/"+cfg.name;
    event.note="Room, row and S.No. are transcribed from the supplied seating plan. Row-I is from the entrance side where stated. No reporting time was supplied.";
  }
  if(cfg.kind==="chemistry"||cfg.kind==="physics") event.sourceUrl="/data/"+cfg.name;
  seats.push(...extracted);
  sources.push({kind:cfg.kind,pages:pdf.numPages,assignments:extracted.length,sha256:createHash("sha256").update(bytes).digest("hex"),url:"/data/"+cfg.name,method:cfg.kind==="edg-shift-2"?"visually checked image-table transcription; PDF has no text layer":"selectable PDF text parsed and assignment count checked"});
}
const data=domain.validate({revision:"seed-20260929-1",publishedAt:new Date().toISOString(),events,seats});
await mkdir(new URL("../test/fixtures/exams/archive/",import.meta.url),{recursive:true});
await writeFile(new URL("../test/fixtures/exams/archive/exam-seed-2026-mse1.json",import.meta.url),JSON.stringify(data,null,2)+"\n");
await writeFile(new URL("../test/fixtures/exams/archive/source-manifest-2026-mse1.json",import.meta.url),JSON.stringify(sources,null,2)+"\n");
const scan=sources.find(s=>s.kind==="edg-shift-2");
await writeFile(new URL("../test/fixtures/exams/archive/exam-import-fixtures.json",import.meta.url),JSON.stringify({fixtures:[{sha256:scan.sha256,rows:seats.filter(s=>s.eventId==="mse1-theory-9")}]},null,2)+"\n");
for(const cfg of sourceConfigs) await copyFile(cfg.path,new URL("../test/fixtures/exams/archive/"+cfg.name,import.meta.url));
console.log(JSON.stringify({events:events.length,seats:seats.length,sources},null,2));

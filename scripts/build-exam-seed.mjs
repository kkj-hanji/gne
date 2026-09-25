import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import "../public/exam-domain.js";
import "../public/exam-schedule.js";
import "../public/practical-exams.js";
const [chemistryPath, physicsPath] = process.argv.slice(2);
if (!chemistryPath || !physicsPath) throw new Error("Provide Chemistry PDF and Physics PDF paths, in that order.");
const exams=globalThis.CompassExams, practicals=globalThis.CompassPracticals;
const events=exams.entries.map((e,i)=>({id:`mse1-theory-${i}`,kind:"theory",title:exams.subjects[e.subject].label,date:e.date,endDate:e.date,start:e.start,end:e.end,report:e.date==="2026-09-25"?e.start-15:null,sections:e.sections,source:"User-supplied GNDEC Applied Sciences date sheet, issued 14 September 2026",sourceUrl:exams.source.pdfUrl,note:"Times are IST. Later notices may revise this schedule."}));
events.push(...practicals.workshops.map(e=>({id:`mse1-workshop-${e.section.toLowerCase()}`,kind:"workshop",title:"Manufacturing Practices (Workshops)",date:e.date,endDate:e.date,start:e.start,end:e.end,report:null,sections:[e.section],source:practicals.source.provenance,sourceUrl:practicals.source.url,note:`Periods ${e.periods}. Both subsections. Workshop times confirmed by supplier on 24 September 2026.`})));
events.push({id:"mse1-practical-window",kind:"practical",title:"Physics, Chemistry and English lab MSE-I",date:"2026-10-05",endDate:"2026-10-09",start:null,end:null,report:null,sections:[...new Set(exams.entries.flatMap(e=>e.sections))],source:practicals.source.provenance,sourceUrl:practicals.source.url,note:"In your respective lab turns; exact individual lab date/time is not provided. Keep files ready and prepare for viva. If a scheduled examination falls on a holiday, the notice moves it to the corresponding day of the following week. Confirm your lab turn with the lab in-charge."});
const seats=[],sources=[];
for(const [kind,path] of [["chemistry",chemistryPath],["physics",physicsPath]]) {
  const bytes=await readFile(path),pdf=await getDocument({data:new Uint8Array(bytes),verbosity:0}).promise;
  const event=events.find(e=>e.date==="2026-09-25" && e.title.toLowerCase()===kind);
  let raw=0; const extracted=[];
  for(let page=1;page<=pdf.numPages;page++) {
    const items=(await(await pdf.getPage(page)).getTextContent()).items;
    raw+=items.filter(i=>/^\d{7,12}$/.test(i.str.trim())).length;
    extracted.push(...globalThis.CompassExamDomain.parseSeatingPage(items,event.id,page));
  }
  if(raw!==extracted.length) throw new Error("The import did not preserve every printed CRN.");
  seats.push(...extracted);
  const name=`seating-2026-09-25-${kind}.pdf`;
  sources.push({kind,pages:pdf.numPages,assignments:extracted.length,sha256:createHash("sha256").update(bytes).digest("hex"),url:`/data/${name}`});
  event.source="User-supplied GNDEC seating PDF and message for 25 September 2026; official web publication not verified";
  event.sourceUrl=`/data/${name}`;
  event.note="Report 15 minutes before the exam. Follow the printed seating arrangement. Row-I is from the entrance side. Seating applies only to 25 September 2026, not subsequent papers.";
}
const data=globalThis.CompassExamDomain.validate({revision:"seed-20260924-2",publishedAt:new Date().toISOString(),events,seats});
await mkdir(new URL("../src/data/",import.meta.url),{recursive:true});
await writeFile(new URL("../src/data/exam-seed.json",import.meta.url),JSON.stringify(data,null,2)+"\n");
await writeFile(new URL("../public/data/exam-summary.json",import.meta.url),JSON.stringify({...data,seats:[]},null,2)+"\n");
await writeFile(new URL("../src/data/exam-source-manifest.json",import.meta.url),JSON.stringify(sources,null,2)+"\n");
for(const [kind,path] of [["chemistry",chemistryPath],["physics",physicsPath]]) await copyFile(path,new URL(`../public/data/seating-2026-09-25-${kind}.pdf`,import.meta.url));
console.log(JSON.stringify({events:events.length,seats:seats.length,sources},null,2));

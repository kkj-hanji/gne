import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../public/date-sheet-import.js",import.meta.url),"utf8");
const context=vm.createContext({Date,URL,console});
vm.runInContext(source,context);
const parser=context.CompassDateSheetImport;

test("date-sheet parser extracts two explicit date/time/subject rows and section codes",()=>{
  const rows=parser.parse([
    "Wed, 30 Sept, 2026 · EDG · 11:00 AM–12:30 PM · EEA, EEB, ECA, ECB",
    "Thu, 1 Oct, 2026 · Economics · 12:45 PM to 2:15 PM · ECA ECB"
  ].join("\n"),{defaultYear:2026,sourceName:"MSE.pdf"});
  assert.equal(rows.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(({title,date,start,end,sections})=>({title,date,start,end,sections})))),[
    {title:"EDG",date:"2026-09-30",start:660,end:750,sections:["EEA","EEB","ECA","ECB"]},
    {title:"Economics",date:"2026-10-01",start:765,end:855,sections:["ECA","ECB"]}
  ]);
  assert.equal(rows[0].source,"MSE.pdf");
});

test("Indian numeric dates, 12-hour and 24-hour times normalize without guessing the year",()=>{
  const rows=parser.parse("30/09/2026 EDG 11:00am-12:30pm EEA ECB\n01-10-2026 Economics 12:45 PM-2:15 PM ECA ECB\n02-10-2026 PPS 13:00-14:15 ECA ECB",{defaultYear:2026});
  assert.equal(rows.length,3);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(row=>[row.date,row.start,row.end]))),[["2026-09-30",660,750],["2026-10-01",765,855],["2026-10-02",780,855]]);
  assert.deepEqual(parser.parseTime("12:30 AM"),30);
  assert.deepEqual(parser.parseTime("12:30 PM"),750);
  assert.equal(parser.parseTime("13:15 PM"),null);
});

test("date-sheet parser skips incomplete, impossible and ambiguous-time rows instead of inventing events",()=>{
  assert.equal(parser.parse("Physics 11:00 AM–12:30 PM ECA ECB\n31 Feb 2026 PPS 9:00 AM–10:00 AM CSD\n2026-09-30 EDG 2:30–4:30 EEA").length,0);
  assert.equal(parser.toIso("01/10/2026",2026),"2026-10-01");
  assert.equal(parser.toIso("2026-02-30",2026),null);
});

test("year inferred from current year is visibly flagged for review",()=>{
  const rows=parser.parse("30 September EDG 11:00 AM–12:30 PM EEA ECB",{defaultYear:2026});
  assert.equal(rows.length,1);
  assert.equal(rows[0].date,"2026-09-30");
  assert.equal(rows[0].needsReview,true);
});

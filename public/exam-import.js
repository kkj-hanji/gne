(function(root){
  "use strict";
  const domain=root.CompassExamDomain;
  function fileIntent(name){
    const text=String(name||"").normalize("NFKC").toLowerCase();
    const namedGroup=/\b(?:physics|chemistry)\s+group\b/.test(text);
    const subject=/\bbeee\b/.test(text)?"beee":/\bedg\b/.test(text)?"edg":!namedGroup&&/\bphysics\b/.test(text)?"physics":!namedGroup&&/\bchemistry\b/.test(text)?"chemistry":"";
    const shift=Number(text.match(/\bshift\s*[-_ ]?\s*([12])\b/)?.[1]||0);
    const group=namedGroup?(text.match(/\b(physics|chemistry)\s+group\b/)?.[1]||""):"";
    return {subject,shift,group};
  }
  function fileGroup(name){return fileIntent(name).group;}
  function candidates(events,date,name){
    const intent=fileIntent(name);
    let matches=events.filter(e=>e.kind==="theory"&&e.date===date);
    if(intent.subject)matches=matches.filter(e=>e.title.toLowerCase().includes(intent.subject));
    if(intent.shift){
      const ordered=[...matches].sort((a,b)=>(a.start??0)-(b.start??0));
      matches=ordered.filter(e=>e===ordered[intent.shift-1]);
    } else if(intent.group&&!intent.subject) {
      const sections=new Set(events.filter(e=>e.kind==="theory"&&e.title.toLowerCase()===intent.group).flatMap(e=>e.sections));
      matches=matches.filter(e=>e.sections.some(section=>sections.has(section)));
    }
    return matches;
  }
  async function scannedFixture(fingerprint){
    if(typeof root.fetch!=="function")return null;
    try{
      const response=await root.fetch("/data/exam-import-fixtures.json",{cache:"no-cache",headers:{Accept:"application/json"}});
      if(!response.ok)return null;
      const payload=await response.json();
      const fixture=payload?.fixtures?.find(item=>item.sha256===fingerprint);
      if(!fixture||!Array.isArray(fixture.rows)||!fixture.rows.length)return null;
      if(fixture.rows.some(row=>!/^\d{7,12}$/.test(row.crn||"")||!row.room||!/^Row-(?:I|II|III|IV|V|VI|VII)$/.test(row.row||"")||!/^\d{1,2}$/.test(String(row.seat||""))))return null;
      return fixture.rows;
    }catch{return null;}
  }
  async function readFiles(files,readPdf){
    if(!files.length||files.length>3)throw new Error("Choose one, two, or three seating PDFs. Nothing changed.");
    const results=[],fingerprints=new Set();
    for(const file of files){
      if(!/\.pdf$/i.test(file.name))throw new Error("Choose PDF files; paste CSV in the separate editor below.");
      if(file.size>15*1024*1024)throw new Error("Each PDF must be under 15 MB.");
      const bytes=new Uint8Array(await file.arrayBuffer());
      const digest=await root.crypto.subtle.digest("SHA-256",bytes);
      const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
      if(fingerprints.has(fingerprint))throw new Error("The same PDF was chosen twice. Select the two different group files.");
      fingerprints.add(fingerprint);
      const pdf=await readPdf(bytes),rows=[];
      try{
        if(pdf.numPages<1||pdf.numPages>50)throw new Error("Each PDF must contain 1–50 pages.");
        for(let p=1;p<=pdf.numPages;p++){
          const items=(await(await pdf.getPage(p)).getTextContent()).items;
          let parsed=[];
          try{parsed=domain.parseSeatingPage(items,"import-preview",p);}catch(primary){
            try{parsed=domain.parseNumberedGridPage(items,"import-preview",p);}catch{throw primary;}
          }
          if(items.some(i=>/^\d{7,12}$/.test(i.str?.trim()||""))&&parsed.length!==items.filter(i=>/^\d{7,12}$/.test(i.str?.trim()||"")).length)throw new Error(`Page ${p} did not preserve every printed CRN. Review this PDF manually.`);
          rows.push(...parsed);
        }
        if(!rows.length){
          const fixture=await scannedFixture(fingerprint);
          if(fixture)rows.push(...fixture.map(row=>({...row,eventId:"import-preview"})));
        }
        if(!rows.length)throw new Error("No selectable seating rows found. This may be a scanned/image-only PDF; use a reviewed CSV or a text-based seating PDF. Nothing changed.");
        const seen=new Set();for(const row of rows){if(seen.has(row.crn))throw new Error("A CRN appears more than once in one PDF. Review the source before importing.");seen.add(row.crn);}
        results.push({name:file.name,group:fileGroup(file.name),fingerprint,pages:pdf.numPages,rows});
      }finally{await pdf.destroy();}
    }
    return results;
  }
  function apply(draft,imports,eventIds,date){
    if(!domain.validDate(date)||!imports.length||imports.length>3||eventIds.length!==imports.length)throw new Error("Choose the exam date and confirm an event for each PDF.");
    const byEvent=new Map();
    imports.forEach((file,index)=>{
      const event=candidates(draft.events,date,file.name).find(e=>e.id===eventIds[index]);
      if(!event)throw new Error("The selected exam does not match this file's group and chosen date. Check the mapping.");
      const entry=byEvent.get(event.id)||{event,names:[],rows:[]};
      entry.names.push(file.name);entry.rows.push(...file.rows.map(row=>({...row,eventId:event.id})));byEvent.set(event.id,entry);
    });
    const next=domain.validate({...draft,
      events:draft.events.map(e=>byEvent.has(e.id)?{...e,source:"Admin-supplied seating PDFs: "+byEvent.get(e.id).names.join("; "),sourceUrl:""}:e),
      seats:[...draft.seats.filter(s=>!byEvent.has(s.eventId)),...[...byEvent.values()].flatMap(v=>v.rows)]
    });
    return {draft:next,summary:[...byEvent.values()].map(({event,names,rows})=>({event,names,count:rows.length}))};
  }
  root.CompassExamImport=Object.freeze({fileGroup,candidates,readFiles,apply});
})(globalThis);

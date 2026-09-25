(function(root){
  "use strict";
  const domain=root.CompassExamDomain;
  function fileGroup(name){const physics=/\bphysics\b/i.test(name),chemistry=/\bchemistry\b/i.test(name);return physics!==chemistry?(physics?"physics":"chemistry"):"";}
  function candidates(events,date,name){
    const group=fileGroup(name);
    const sections=new Set(events.filter(e=>e.kind==="theory"&&e.title.toLowerCase()===group).flatMap(e=>e.sections));
    return events.filter(e=>e.kind==="theory"&&e.date===date&&(!group||!sections.size||e.sections.some(s=>sections.has(s))));
  }
  async function readFiles(files,readPdf){
    if(!files.length||files.length>2)throw new Error("Choose one or two seating PDFs. Nothing changed.");
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
        for(let p=1;p<=pdf.numPages;p++)rows.push(...domain.parseSeatingPage((await(await pdf.getPage(p)).getTextContent()).items,"import-preview",p));
        if(!rows.length)throw new Error("No supported seating rows found. Nothing changed.");
        const seen=new Set();for(const row of rows){if(seen.has(row.crn))throw new Error("A CRN appears more than once in one PDF. Review the source before importing.");seen.add(row.crn);}
        results.push({name:file.name,group:fileGroup(file.name),fingerprint,pages:pdf.numPages,rows});
      }finally{await pdf.destroy();}
    }
    return results;
  }
  function apply(draft,imports,eventIds,date){
    if(!domain.validDate(date)||!imports.length||imports.length>2||eventIds.length!==imports.length)throw new Error("Choose the exam date and confirm an event for each PDF.");
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

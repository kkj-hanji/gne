(function(root){
  "use strict";
  let draft=null,baseRevision="",reviewed=false,bridge=null,busy=false,preparedFiles=null,preparedDate="",preparedDateSheet=null,importGeneration=0;
  const domain=root.CompassExamDomain,desk=root.CompassExamDesk;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const minute=value=>value?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
  const clock=value=>value==null?"":`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
  function message(text){$("exam-admin-status").textContent=text;}
  function changed(){reviewed=false;$("exam-publish").disabled=true;$("exam-review").textContent="Review publication";}
  function selectOptions(selected=""){$("exam-edit-select").innerHTML='<option value="">New event</option>'+draft.events.map(e=>`<option value="${e.id}">${esc(e.date+" · "+e.title+" · "+e.sections.join(", "))}</option>`).join("");$("exam-edit-select").value=selected;}
  function loadEvent(){const e=draft?.events.find(e=>e.id===$("exam-edit-select").value);for(const field of ["title","date","endDate","source","sourceUrl","note"])$("exam-field-"+field).value=e?.[field]||"";$("exam-field-kind").value=e?.kind||"theory";$("exam-field-sections").value=e?.sections.join(", ")||"";for(const field of ["start","end","report"])$("exam-field-"+field).value=clock(e?.[field]);changed();}
  async function request(method,body){const token=$("exam-publishing-key").value;if(!token)throw new Error("Enter the publishing key configured for this Worker.");return desk.fetchJson("/api/admin/exams",{method,headers:{"Content-Type":"application/json","X-Compass-Admin-Key":token},...(body?{body:JSON.stringify(body)}:{})});}
  async function run(action){if(busy)return;busy=true;try{await action();}catch(error){message(error.message||"The operation could not be completed.");}finally{busy=false;}}
  async function load(){importGeneration++;preparedFiles=null;$("exam-apply-import").disabled=true;$("exam-import-preview").innerHTML="";draft=domain.validate(await request("GET"));baseRevision=draft.revision;selectOptions();loadEvent();$("exam-editor").hidden=false;message(`Loaded ${draft.events.length} events and ${draft.seats.length} seating assignments. Changes remain a draft until Review and Publish.`);}
  function saveEvent(){if(!draft)throw new Error("Load the current publication first.");const oldId=$("exam-edit-select").value;const event={id:oldId||"event-"+Date.now().toString(36),kind:$("exam-field-kind").value,sections:$("exam-field-sections").value.toUpperCase().split(/[\s,;]+/).filter(Boolean)};for(const field of ["title","date","endDate","source","sourceUrl","note"])event[field]=$("exam-field-"+field).value.trim();event.endDate||=event.date;for(const field of ["start","end","report"])event[field]=minute($("exam-field-"+field).value);const candidate={...draft,events:[...draft.events.filter(e=>e.id!==oldId),event]};draft=domain.validate(candidate);selectOptions(event.id);changed();message("Event saved to draft. Review before publishing.");}
  function previewSeats(rows,event){const next={...draft,seats:[...draft.seats.filter(s=>s.eventId!==event.id),...rows]};domain.validate(next);draft=next;changed();$("exam-seat-preview").innerHTML=`<p><strong>${rows.length} assignments imported into the draft for ${esc(event.title)} on ${esc(event.date)}.</strong> Existing seats for this event were replaced in the draft. Preview the first 20 and export the draft to inspect all rows.</p><div class="exam-table-scroll"><table><thead><tr><th>CRN</th><th>Room</th><th>Row</th><th>S.No.</th></tr></thead><tbody>${rows.slice(0,20).map(s=>`<tr><td>${esc(s.crn)}</td><td>${esc(s.room)}</td><td>${esc(s.row)}</td><td>${esc(s.seat)}</td></tr>`).join("")}</tbody></table></div>`;message("Seating import validated. Review and Publish to make it available to students.");}
  async function prepareFiles(){
    if(!draft)throw new Error("Load the current publication first.");
    const generation=++importGeneration;preparedFiles=null;$("exam-apply-import").disabled=true;$("exam-import-preview").innerHTML="";
    const date=$("exam-import-date").value;
    if(!domain.validDate(date))throw new Error("Choose the examination date first. Filenames do not establish the date.");
    const files=Array.from($("exam-seating-multi-files").files||[]);
    if(!files.length||files.length>3)throw new Error("Choose one, two, or three seating PDFs.");
    message("Reading the seating PDFs on this device...");
    const importer=root.CompassExamImport;
    const rows=await importer.readFiles(files,bridge?.readPdf||asyncPdf);
    if(generation!==importGeneration)throw new Error("The import selection changed while reading. Read the files again.");
    preparedDate=date;preparedFiles=rows;
    $("exam-import-preview").innerHTML=rows.map((file,index)=>{
      const candidates=importer.candidates(draft.events,date,file.name);
      return '<article class="exam-import-summary"><h4>'+esc(file.name)+'</h4><p>'+file.pages+' pages / '+file.rows.length+' assignments / '+esc(file.group||"Choose the group event manually")+'</p><label>Attach to this exam on '+esc(date)+'<select id="exam-map-'+index+'"><option value="">Choose an exam event</option>'+candidates.map(e=>'<option value="'+e.id+'"'+(candidates.length===1?' selected':'')+'>'+esc(e.title+' / '+clock(e.start)+'-'+clock(e.end)+' / '+e.sections.join(", "))+'</option>').join("")+'</select></label><p>First assignments: '+file.rows.slice(0,3).map(r=>esc(r.crn+' / '+r.room+' / '+r.row+' / '+r.seat)).join("; ")+'</p></article>';
    }).join("");
    $("exam-apply-import").disabled=false;message("Files were read without changing the draft. Confirm each exam mapping, then apply.");
  }
  async function asyncPdf(bytes){const pdfjs=await import("/vendor/pdf.mjs");pdfjs.GlobalWorkerOptions.workerSrc="/vendor/pdf.worker.mjs";return pdfjs.getDocument({data:bytes,isEvalSupported:false,verbosity:0}).promise;}
  async function prepareDateSheet(){
    if(!draft)throw new Error("Load the current publication first.");
    const generation=++importGeneration,files=Array.from($("exam-datesheet-files").files||[]);
    preparedDateSheet=null;$("exam-datesheet-apply").disabled=true;$("exam-datesheet-preview").innerHTML="";
    if(!files.length||files.length>5)throw new Error("Choose one to five PDF/image files.");
    const today=bridge?.context?.().today,year=Number(String(today||"").slice(0,4))||new Date().getFullYear(),rows=[];
    message("Reading files on this device. Scanned pages may need local OCR...");
    for(const file of files)rows.push(await root.CompassDateSheetImport.extract(file,bridge?.readPdf||asyncPdf,{defaultYear:year}));
    if(generation!==importGeneration)throw new Error("The file selection changed while reading. Read the files again.");
    preparedDateSheet=rows;
    const entries=rows.flatMap(file=>file.events.map(event=>({file:file.name,event})));
    if(!entries.length){$("exam-datesheet-preview").textContent="No complete dated event rows were recognized. Use manual entry or fix the source scan; nothing has changed.";message("No event rows were recognized.");return;}
    $("exam-datesheet-preview").innerHTML=entries.map((row,index)=>{
      const e=row.event;
      return '<article class="exam-import-summary"><h4>'+esc(row.file)+' · '+esc(e.needsReview?"Please verify year/sections":"Recognized event")+'</h4><div class="exam-editor-grid">'+
        '<label>Subject / event<input id="sheet-title-'+index+'" value="'+esc(e.title)+'" maxlength="180"></label>'+
        '<label>Date<input id="sheet-date-'+index+'" type="date" value="'+esc(e.date)+'"></label>'+
        '<label>Start<input id="sheet-start-'+index+'" type="time" value="'+clock(e.start)+'"></label>'+
        '<label>End<input id="sheet-end-'+index+'" type="time" value="'+clock(e.end)+'"></label>'+
        '<label>Sections<input id="sheet-sections-'+index+'" value="'+esc(e.sections.join(", "))+'" placeholder="Enter official section codes"></label></div>'+
        '<p>Confirm these values against the original notice before adding.</p></article>';
    }).join("");
    $("exam-datesheet-apply").disabled=false;
    message("Found "+entries.length+" candidate event(s) from "+rows.length+" file(s). Check every field before adding to the draft.");
  }
  function applyDateSheet(){
    if(!draft||!preparedDateSheet)throw new Error("Read a datesheet first.");
    const candidates=preparedDateSheet.flatMap(file=>file.events.map(event=>({file:file.name,event})));
    if(!candidates.length)throw new Error("No events were recognized.");
    const events=candidates.map((candidate,index)=>{
      const e={...candidate.event};e.title=$("sheet-title-"+index).value.trim();e.date=$("sheet-date-"+index).value;e.endDate=e.date;
      e.start=minute($("sheet-start-"+index).value);e.end=minute($("sheet-end-"+index).value);
      e.sections=$("sheet-sections-"+index).value.toUpperCase().split(/[\s,;]+/).filter(Boolean);
      e.id="import-"+Date.now().toString(36)+"-"+(index+1);delete e.needsReview;
      if(!e.title||!domain.validDate(e.date)||e.start==null||e.end==null||!e.sections.length)throw new Error("Complete the title, date, start/end times, and section codes for every row.");
      return e;
    });
    draft=domain.validate({...draft,events:[...draft.events,...events]});preparedDateSheet=null;
    $("exam-datesheet-apply").disabled=true;selectOptions(events.at(-1).id);loadEvent();changed();
    $("exam-datesheet-preview").textContent="Recognized rows were added to the unpublished draft. Review the source notice before publishing.";
    message(events.length+" datesheet event(s) added to draft. No data was published.");
  }
  function eligibleExpired(now){
    const today=String(now?.today||"");const minutes=Number(now?.minutes)||0;
    return draft.events.filter(e=>e.kind==="theory"&&e.end!=null&&(e.endDate<today||(e.endDate===today&&e.end<=minutes)));
  }
  function downloadBackup(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function prepareCleanup(){
    if(!draft)throw new Error("Load the current publication first.");
    const expired=eligibleExpired(bridge?.context?.()||{});if(!expired.length)throw new Error("No completed theory exam records are eligible for cleanup at the current India date/time.");
    const ids=new Set(expired.map(event=>event.id)),seatCount=draft.seats.filter(seat=>ids.has(seat.eventId)).length;
    downloadBackup(draft,"compass-exam-publication-before-cleanup.json");
    $("exam-cleanup-preview").innerHTML="<p><strong>Backup downloaded.</strong> Eligible for removal: "+expired.length+" completed theory events and "+seatCount+" linked seat assignments.</p><ul>"+
      expired.map(event=>"<li>"+esc(event.date)+" · "+esc(event.title)+" · "+esc(event.sections.join(", "))+"</li>").join("")+
      "</ul><p>Practical/workshop records, future exams and events without a confirmed end time are preserved. The old KV rollback copy will also be deleted.</p>";
    $("exam-cleanup-confirm").disabled=false;
  }
  async function cleanupExpired(){
    const expired=eligibleExpired(bridge?.context?.()||{});if(!expired.length)throw new Error("No expired theory events remain.");
    if(!root.confirm("Publish the downloaded-backup copy with completed theory exams/seats removed and delete the previous Cloudflare KV rollback copy? Practical, workshop and future events are preserved."))return;
    const ids=new Set(expired.map(event=>event.id)),cleaned=domain.validate({...draft,events:draft.events.filter(event=>!ids.has(event.id)),seats:draft.seats.filter(seat=>!ids.has(seat.eventId))});
    const result=await request("PUT",{...cleaned,baseRevision,purgePrevious:true});
    draft={...cleaned,revision:result.revision,publishedAt:result.publishedAt};baseRevision=result.revision;
    selectOptions();loadEvent();desk.setData(draft);desk.render();await desk.refresh(true);$("exam-cleanup-confirm").disabled=true;
    $("exam-cleanup-preview").innerHTML+="<p><strong>Expired exam records cleaned.</strong> "+esc(result.warning||"Current and previous KV exam publications no longer contain the expired entries.")+"</p>";
    message(result.warning||"Expired exam records and assignments were cleaned. Practical/workshop data remains published.");
  }
  function applyImport(){
    if(!preparedFiles||preparedDate!==$("exam-import-date").value)throw new Error("Prepare the files again after changing the date.");
    const ids=preparedFiles.map((_,i)=>$("exam-map-"+i).value);
    const result=root.CompassExamImport.apply(draft,preparedFiles,ids,preparedDate);
    draft=result.draft;changed();
    $("exam-seat-preview").innerHTML='<p><strong>Imported into draft</strong></p>'+result.summary.map(item=>'<p>'+esc(item.event.date+' / '+item.event.title)+' / '+item.count+' assignments</p>').join("");
    preparedFiles=null;$("exam-apply-import").disabled=true;selectOptions();loadEvent();message("Seating added to the draft. Review the complete publication, then Publish.");
  }
  function parseCsv(text,eventId){const lines=String(text).replace(/^\uFEFF/,"").trim().split(/\r?\n/);if(!/^crn,room,row,seat$/i.test(lines.shift()?.trim()))throw new Error("CSV header must be crn,room,row,seat. Use simple values without commas.");if(lines.length>12000)throw new Error("Too many seating rows.");return lines.filter(l=>l.trim()).map(line=>{const fields=line.split(",").map(s=>s.trim());if(fields.length!==4)throw new Error("Each seating row needs four columns: crn,room,row,seat.");return {eventId,crn:fields[0],room:fields[1],row:fields[2],seat:fields[3],page:null};});}
  function exportDraft(){if(!draft)return;const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="compass-exam-draft.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function init(adapter){bridge=adapter;const host=$("exam-admin-panel");if(!host)return;host.innerHTML=`<p class="eyebrow">ADMIN · EXAM PUBLISHING</p><h2>Dates, reporting times &amp; seating</h2><p>Load, edit, review, then publish. Students receive the published revision automatically. This editor uses your existing Worker publishing key; opening KKJ mode alone does not authorize changes.</p><label>Publishing key <input id="exam-publishing-key" type="password" autocomplete="off" aria-describedby="exam-key-help"></label><details class="exam-key-guide" id="exam-key-help"><summary>What is the publishing key?</summary><p>Use the secret value saved as <code>ADMIN_API_TOKEN</code> for this Worker. Enter its value, not its name. Send <code>KKJ</code> in Ask Compass to show this panel in Settings on the authorized profile and device.</p><p>If you forgot it: Cloudflare &gt; Workers &amp; Pages &gt; gndec-compass &gt; Settings &gt; Variables and Secrets. Edit <code>ADMIN_API_TOKEN</code> as a Secret, choose a new private value, and deploy the change. Cloudflare cannot display the old value again. Use the new value here; keep it private.</p><a href="https://developers.cloudflare.com/workers/configuration/secrets/" target="_blank" rel="noopener noreferrer">Cloudflare secret instructions</a></details><ol class="exam-admin-steps"><li><strong>Load</strong> the current data with your key.</li><li><strong>Edit or import</strong> dates and seating into a draft.</li><li><strong>Review &amp; publish</strong> to update students.</li></ol><button type="button" class="outline-button" id="exam-admin-load">Load current publication</button><p id="exam-admin-status" role="status" aria-live="polite"></p><div id="exam-editor" hidden><label>Choose an event <select id="exam-edit-select"></select></label><div class="exam-editor-grid"><label>Exam / subject <input id="exam-field-title" maxlength="180"></label><label>Type <select id="exam-field-kind"><option value="theory">Theory</option><option value="workshop">Workshop</option><option value="practical">Practical / lab window</option></select></label><label>Section codes (comma separated)<input id="exam-field-sections" placeholder="ECA, ECB"></label><label>Date<input id="exam-field-date" type="date"></label><label>Last date (for lab windows)<input id="exam-field-endDate" type="date"></label><label>Start time<input id="exam-field-start" type="time"></label><label>End time<input id="exam-field-end" type="time"></label><label>Report by (optional)<input id="exam-field-report" type="time"></label><label>Source / notice description<input id="exam-field-source" maxlength="300"></label><label>Official source link (optional)<input id="exam-field-sourceUrl" type="text"></label></div><label>Instructions<textarea id="exam-field-note" maxlength="1200"></textarea></label><p>Leave both times empty only for a practical window without exact timings. Published times are IST.</p><div class="settings-actions"><button type="button" id="exam-save-event" class="outline-button">Save event to draft</button><button type="button" id="exam-delete-event" class="outline-button">Remove selected event from draft</button></div><h3>Import seating: up to three PDFs</h3><p>Choose the examination date, then select up to three plans together. Subject and shift labels in filenames suggest matches when possible; verify each event, page count and assignment count. Files are read on this device. Image-only seating plans still need reviewed CSV/manual entry.</p><label>Examination date <input id="exam-import-date" type="date"></label><label>Seating PDFs (maximum three)<input id="exam-seating-multi-files" type="file" accept=".pdf,application/pdf" multiple></label><button type="button" id="exam-import-multi-seats" class="outline-button">Read files &amp; preview</button><div id="exam-import-preview"></div><button type="button" id="exam-apply-import" class="outline-button" disabled>Apply confirmed seating to draft</button><label>Or paste seating CSV<textarea id="exam-seat-csv" placeholder="crn,room,row,seat"></textarea></label><button type="button" class="outline-button" id="exam-paste-seats">Preview pasted seating</button><h3>Find or correct one student seat</h3><div class="exam-editor-grid"><label>Exact CRN<input id="exam-one-crn" inputmode="numeric"></label><label>Room<input id="exam-one-room"></label><label>Row<input id="exam-one-row" placeholder="Row-I"></label><label>S.No. position<input id="exam-one-seat" inputmode="numeric"></label></div><button type="button" class="outline-button" id="exam-find-seat">Find in draft</button><button type="button" class="outline-button" id="exam-save-seat">Save seat to draft</button><div id="exam-seat-preview"></div><div class="settings-actions"><button type="button" id="exam-export" class="outline-button">Export draft backup</button><button type="button" id="exam-review" class="outline-button">Review publication</button><button type="button" id="exam-publish" class="primary-button" disabled>Publish reviewed data</button><button type="button" id="exam-rollback" class="outline-button">Restore previous publication</button></div><div id="exam-publication-preview"></div><p>Keep one editing session open at a time. Shared updates may take about a minute to appear; students can check again from Profile.</p></div>`;
    $("exam-editor").insertAdjacentHTML("beforeend",'<section class="exam-import-summary"><h3>Add exam dates from a PDF or image</h3><p>Select up to five schedules or notices. Text PDFs are read directly; scanned pages use browser OCR. Files stay on this device. OCR guesses need manual verification and never publish automatically.</p><label>Datesheet files (PDF, PNG, JPG, WebP)<input id="exam-datesheet-files" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" multiple></label><button type="button" id="exam-datesheet-read" class="outline-button">Read datesheet and preview</button><div id="exam-datesheet-preview"></div><button type="button" id="exam-datesheet-apply" class="outline-button" disabled>Add reviewed rows to draft</button></section><section class="exam-import-summary"><h3>Clean completed exam records</h3><p>Download a full JSON backup, then remove only ended theory exam records and their seat assignments. This also clears the old KV rollback copy. Practical and workshop notices remain.</p><button type="button" id="exam-cleanup-preview-button" class="outline-button">Preview cleanup and download backup</button><div id="exam-cleanup-preview"></div><button type="button" id="exam-cleanup-confirm" class="outline-button" disabled>Clean expired records and publish</button></section>');
    $("exam-admin-load").onclick=()=>run(load);$("exam-edit-select").onchange=()=>{for(const field of ["crn","room","row","seat"])$("exam-one-"+field).value="";$("exam-seat-preview").innerHTML="";loadEvent();};$("exam-save-event").onclick=()=>run(saveEvent);
    $("exam-datesheet-read").onclick=()=>run(prepareDateSheet);$("exam-datesheet-apply").onclick=()=>run(applyDateSheet);$("exam-datesheet-files").onchange=()=>{importGeneration++;preparedDateSheet=null;$("exam-datesheet-apply").disabled=true;$("exam-datesheet-preview").innerHTML="";};
    $("exam-cleanup-preview-button").onclick=()=>run(prepareCleanup);$("exam-cleanup-confirm").onclick=()=>run(cleanupExpired);
    $("exam-editor").addEventListener("input",changed);
    $("exam-delete-event").onclick=()=>run(()=>{const id=$("exam-edit-select").value;if(!id)throw new Error("Choose an existing event.");draft.events=draft.events.filter(e=>e.id!==id);draft.seats=draft.seats.filter(s=>s.eventId!==id);selectOptions();loadEvent();message("Event removed from draft only.");});
    $("exam-import-multi-seats").onclick=()=>run(prepareFiles);
    $("exam-apply-import").onclick=()=>run(applyImport);
    const invalidateImport=()=>{importGeneration++;preparedFiles=null;$("exam-apply-import").disabled=true;$("exam-import-preview").innerHTML="";};
    $("exam-import-date").onchange=invalidateImport;$("exam-seating-multi-files").onchange=invalidateImport;
    $("exam-paste-seats").onclick=()=>run(()=>{const event=draft.events.find(e=>e.id===$("exam-edit-select").value);if(!event)throw new Error("Choose a saved event.");previewSeats(parseCsv($("exam-seat-csv").value,event.id),event);event.source="Admin-entered seating assignments";event.sourceUrl="";loadEvent();});
    $("exam-find-seat").onclick=()=>run(()=>{const seat=draft?.seats.find(s=>s.eventId===$("exam-edit-select").value && s.crn===$("exam-one-crn").value.trim());for(const field of ["room","row","seat"])$("exam-one-"+field).value=seat?.[field]||"";message(seat?"Existing assignment loaded. Edit and save to draft.":"No assignment for that CRN in the selected event. Add only from a verified notice.");});
    $("exam-save-seat").onclick=()=>run(()=>{const event=draft?.events.find(e=>e.id===$("exam-edit-select").value);if(!event)throw new Error("Choose a saved event.");const seat={eventId:event.id,page:null};for(const field of ["crn","room","row","seat"])seat[field]=$("exam-one-"+field).value.trim();const next={...draft,seats:[...draft.seats.filter(s=>s.eventId!==event.id||s.crn!==seat.crn),seat]};draft=domain.validate(next);const updated=draft.events.find(e=>e.id===event.id);updated.source="Admin-reviewed seating correction";updated.sourceUrl="";loadEvent();message("Student seat saved to draft. Other students' seats were preserved. Review and Publish to apply.");});
    $("exam-export").onclick=exportDraft;
    $("exam-review").onclick=()=>run(()=>{if($("exam-edit-select").value || $("exam-field-title").value.trim())saveEvent();draft=domain.validate(draft);if(!draft.events.length)throw new Error("Add an event first.");reviewed=true;$("exam-publish").disabled=false;$("exam-publication-preview").innerHTML=`<h3>Ready for publication</h3><p>${draft.events.length} events · ${draft.seats.length} seating assignments. Review every event below; the exported backup includes all assignments.</p>${draft.events.map(desk.eventMarkup).join("")}`;message("Review the complete draft below, then select Publish reviewed data.");});
    $("exam-publish").onclick=()=>run(async()=>{if(!reviewed)throw new Error("Review the draft first.");const result=await request("PUT",{...draft,baseRevision});baseRevision=result.revision;draft.revision=result.revision;draft.publishedAt=result.publishedAt;desk.setData(draft);desk.render();changed();await desk.refresh(true);message("Published successfully. Students will receive the new revision automatically.");});
    $("exam-rollback").onclick=()=>run(async()=>{if(!root.confirm("Restore the previous published exam dataset for all students?"))return;await request("PUT",{baseRevision,rollback:true});await load();await desk.refresh(true);message("Previous publication restored as a new revision.");});
  }
  root.CompassExamAdmin={init,parseCsv,clear(){importGeneration++;preparedFiles=null;draft=null;baseRevision="";reviewed=false;if($("exam-publishing-key"))$("exam-publishing-key").value="";if($("exam-editor"))$("exam-editor").hidden=true;}};
})(globalThis);

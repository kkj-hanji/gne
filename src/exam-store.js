import seed from "./data/exam-seed.json" with { type: "json" };
import "../public/exam-domain.js";
const domain=globalThis.CompassExamDomain;
const KEY="gndec-compass:exam-publication:v1";
const json=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function current(env, strict = false) {
  try {
    const value=await env.SOURCE_REGISTRY?.get(KEY,"json");
    if(value) return domain.validate(value);
  } catch {
    if (strict) throw new Error("The published exam store is unavailable. Retry before editing or checking a seat.");
    return {...domain.validate(seed), stale:true};
  }
  return domain.validate(seed);
}
export async function examResponse(request,env,authorized=false) {
  const path=new URL(request.url).pathname;
  if(!["/api/exams","/api/exams/seat","/api/admin/exams"].includes(path)) return null;
  const admin=path==="/api/admin/exams";
  if(admin && !authorized) return json({error:"Admin authorization required."},401);
  if(path==="/api/exams" && request.method!=="GET") return json({error:"Use GET."},405);
  if(path==="/api/exams/seat" && request.method!=="POST") return json({error:"Use POST with an exact CRN and exam ID."},405);
  let data;
  try { data=await current(env,admin || path==="/api/exams/seat"); }
  catch(error) { return json({error:error.message},503); }
  if(path==="/api/exams") return json({...data,seats:undefined,seatingEvents:[...new Set(data.seats.map(s=>s.eventId))]});
  if(admin && request.method==="GET") return json(data);
  if(admin && request.method!=="PUT") return json({error:"Use GET or PUT."},405);
  if(!request.headers.get("Content-Type")?.includes("application/json")) return json({error:"Send JSON."},415);
  const origin=request.headers.get("Origin");
  if(origin && origin!==new URL(request.url).origin) return json({error:"Use the Compass website to submit this request."},403);
  let body;
  try {
    const text=await request.text();
    if(text.length>(admin?2500000:1000)) return json({error:"Request is too large."},413);
    body=JSON.parse(text);
  } catch { return json({error:"Invalid JSON."},400); }
  if(!admin) {
    if(!/^\d{7,12}$/.test(body?.crn || "") || typeof body?.eventId!=="string") return json({error:"Provide one exact CRN and exam ID."},400);
    const event=data.events.find(e=>e.id===body.eventId);
    if(!event) return json({error:"That exam is not in the current publication."},404);
    const seat=data.seats.find(s=>s.eventId===body.eventId && s.crn===body.crn);
    return json({revision:data.revision,event,seat:seat || null,message:seat?"Row and S.No. are copied from the supplied seating plan.":"No confirmed seat for this CRN in this exam. Check the supplied PDF or contact the exam coordinator."});
  }
  if(!env.SOURCE_REGISTRY) return json({error:"Shared exam publishing requires SOURCE_REGISTRY."},503);
  try {
    // Refuse to silently replace a publication the editor has not loaded.
    if(body.baseRevision!==data.revision) return json({error:"The publication changed. Reload the editor before saving."},409);
    const candidate=body.rollback ? await env.SOURCE_REGISTRY.get(KEY+":previous","json") : body;
    if(!candidate) return json({error:"No previous publication is available."},400);
    const next=domain.validate(candidate);
    if(!next.events.length) return json({error:"Keep at least one event in the publication."},400);
    next.revision=crypto.randomUUID();next.publishedAt=new Date().toISOString();
    await env.SOURCE_REGISTRY.put(KEY+":previous",JSON.stringify(data));
    await env.SOURCE_REGISTRY.put(KEY,JSON.stringify(next));
    return json({ok:true,revision:next.revision,publishedAt:next.publishedAt,events:next.events.length,seats:next.seats.length});
  } catch(error) { return json({error:error.message || "Publication failed; reload and verify before retrying."},400); }
}

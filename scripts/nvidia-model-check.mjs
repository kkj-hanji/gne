const apiKey = process.env.MY_NVIDIA_API_KEY;
const models = [
  "openai/gpt-oss-120b",
  "meta/muse-glimmer-30b"
];

if (!apiKey) throw new Error("MY_NVIDIA_API_KEY is missing from .env.");

const failures = [];
const prompt = `You are GNDEC Compass. A first-year student asks in Hinglish: "Physics ka 7-day revision plan banao. I have 45 minutes per day, and I feel weak in numericals." Give a practical 7-day plan. Include: a small daily task, numerical practice, active recall, one rest/review day, and a short encouraging closing. Do not invent official timetable, syllabus units, marks, or college rules.`;

for (const model of models) {
  const startedAt = Date.now();
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are GNDEC Compass. Reply in the student's language. Be concise, practical, and safe. Never reveal reasoning, a thinking process, or chain-of-thought; give only the final answer." },
          { role: "user", content: prompt }
        ],
        temperature: 0,
        max_tokens: 1100,
        stream: false
      })
    });
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const answer = typeof content === "string" ? content.trim() : Array.isArray(content) ? content.map((part) => part?.text || "").join("").trim() : "";
    const normalized = answer.toLowerCase();
    const required = ["day", "numerical", "recall"];
    const missing = required.filter((term) => !normalized.includes(term));
    const leaksReasoning = /thinking process|chain[- ]of[- ]thought|analyze user request/i.test(answer);
    if (!response.ok || answer.length < 180 || missing.length || leaksReasoning) throw new Error(payload?.error?.message || `quality check failed: ${leaksReasoning ? "visible reasoning" : missing.length ? `missing ${missing.join(", ")}` : "answer was too short"}`);
    console.log(`${model}: quality passed in ${Date.now() - startedAt}ms · ${answer.replace(/\s+/g, " ").slice(0, 180)}`);
  } catch (error) {
    failures.push(`${model}: ${error.message}`);
    console.error(`${model}: failed (${error.message})`);
  }
}

if (failures.length) throw new Error(`Model checks failed:\n${failures.join("\n")}`);

const fs = require('fs');
let content = fs.readFileSync('public/app.js', 'utf8');

const processFnStart = 'async function processUserQuestion(question) {';
const processFnEnd = content.indexOf('$("question-form").addEventListener("submit", async (event) => {');

if (content.indexOf(processFnStart) !== -1) {
  const fnStartIndex = content.indexOf(processFnStart);
  let braceCount = 0;
  let fnEndIndex = -1;
  for (let i = fnStartIndex + processFnStart.length - 1; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        fnEndIndex = i;
        break;
      }
    }
  }
  
  const body = content.substring(fnStartIndex + processFnStart.length, fnEndIndex).trim();
  
  const submitStart = '$("question-form").addEventListener("submit", async (event) => {';
  const submitStartIndex = content.indexOf(submitStart);
  let submitEndIndex = -1;
  braceCount = 0;
  for (let i = submitStartIndex + submitStart.length - 1; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        submitEndIndex = i;
        break;
      }
    }
  }
  
  const newSubmit = `${submitStart}
  event.preventDefault();
  const rawQuestion = $("question-input").value.trim();
  if (!rawQuestion) return;
  $("question-input").value = "";
  closeQuestionSuggestions();

  // Multi-Intent Splitter (Hinglish/English)
  const queries = rawQuestion.split(/\\s+(?:and|aur|te|also|plus)\\s+(?=(?:what|when|where|who|is|are|tell|show|find|whose|how|kado|kadon|kab|kithe|kaha|kon|kaun|keda|whose)\\b)|[?.,;]\\s+/i).map(q => q.trim()).filter(Boolean);

  for (const q of queries) {
    await (async () => {
      const question = q;
      ${body}
    })();
  }
});`;

  const newContent = content.substring(0, fnStartIndex) + newSubmit + content.substring(submitEndIndex + 1);
  fs.writeFileSync('public/app.js', newContent);
  console.log("Fixed submit handler successfully.");
} else {
  console.log("No processUserQuestion found.");
}

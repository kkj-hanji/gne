const fs = require('fs');
const content = fs.readFileSync('public/app.js', 'utf8');

const startMarker = '$("question-form").addEventListener("submit", async (event) => {';
const startIndex = content.indexOf(startMarker);
if (startIndex === -1) throw new Error("Could not find submit handler");

let braceCount = 0;
let endIndex = -1;
for (let i = startIndex + startMarker.length - 1; i < content.length; i++) {
  if (content[i] === '{') braceCount++;
  if (content[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      endIndex = i;
      break;
    }
  }
}

if (endIndex === -1) throw new Error("Could not find end of submit handler");

const handlerBody = content.substring(startIndex + startMarker.length, endIndex);
// The body starts with:
//     event.preventDefault();
//     const question = $("question-input").value.trim();
//     if (!question) return;
//     $("question-input").value = "";
//     closeQuestionSuggestions();

const extractedBody = handlerBody.replace(/^\s*event\.preventDefault\(\);\s*const question = \$\("question-input"\)\.value\.trim\(\);\s*if \(!question\) return;\s*\$\("question-input"\)\.value = "";\s*closeQuestionSuggestions\(\);/s, '').trim();

const newHandler = `
async function processUserQuestion(question) {
  ${extractedBody}
}

$("question-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawQuestion = $("question-input").value.trim();
  if (!rawQuestion) return;
  $("question-input").value = "";
  closeQuestionSuggestions();
  
  // Multi-Intent Splitter (Hinglish/English)
  const queries = rawQuestion.split(/\\s+(?:and|aur|te|also|plus)\\s+(?=(?:what|when|where|who|is|are|tell|show|find|whose|how|kado|kadon|kab|kithe|kaha|kon|kaun|keda|whose)\\b)|[?.,;]\\s+/i).map(q => q.trim()).filter(Boolean);
  
  for (const q of queries) {
    await processUserQuestion(q);
  }
});`;

const newContent = content.substring(0, startIndex) + newHandler.trim() + content.substring(endIndex + 1);
fs.writeFileSync('public/app.js', newContent);
console.log("Refactored submit handler successfully.");

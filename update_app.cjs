const fs = require('fs');
let content = fs.readFileSync('public/app.js', 'utf8');

// Update classTypeLabel to handle L, T, P properly and add expandRoomLocation
content = content.replace(
  /function classTypeLabel\(value\) \{[\s\S]*?return type \|\| "Class";\n\}/,
  `function classTypeLabel(value) {
  const type = String(value || "").trim().toUpperCase();
  if (type === "L") return "Lecture (L)";
  if (type === "T") return "Tutorial (T)";
  if (type === "P") return "Practical/Lab (P)";
  return type || "Class";
}

function expandRoomLocation(room) {
  if (!room) return "";
  let r = room;
  // Expand common lab abbreviations
  r = r.replace(/\\bCOMP LAB\\b/gi, "Computer Lab");
  r = r.replace(/\\bMECH LAB\\b/gi, "Mechanical Lab");
  r = r.replace(/\\bCHEM LAB\\b/gi, "Chemistry Lab");
  r = r.replace(/\\bPHY LAB\\b/gi, "Physics Lab");
  r = r.replace(/\\bCIVIL LAB\\b/gi, "Civil Lab");
  r = r.replace(/\\bELEC LAB\\b/gi, "Electrical Lab");
  r = r.replace(/\\bWORKSHOP\\b/gi, "Workshop");
  return r;
}`
);

// Update renderClassDetails
content = content.replace(
  /\$\{escapeHtml\(item\.type \|\| "Class"\)\}/g,
  "${escapeHtml(classTypeLabel(item.type))}"
);

// We should also replace room in renderClassDetails
content = content.replace(
  /<span>\$\{escapeHtml\(item\.room\)\}<\/span>/g,
  "<span>${escapeHtml(expandRoomLocation(item.room))}</span>"
);

// Also in renderWeek
content = content.replace(
  /<span>\$\{escapeHtml\(item\.room\)\}\$\{item\.type \? ` · \$\{escapeHtml\(item\.type\)\}` : ""\}<\/span>/g,
  "<span>${escapeHtml(expandRoomLocation(item.room))}${item.type ? ` · ${escapeHtml(classTypeLabel(item.type))}` : \"\"}</span>"
);

// Also in day schedule rendering at line ~930
content = content.replace(
  /<div class="schedule-sub">\$\{escapeHtml\(item\.type \|\| "Class"\)\}<\/div><\/div><div class="schedule-teacher">\$\{escapeHtml\(item\.teacher\)\}<\/div><div class="schedule-room">\$\{escapeHtml\(item\.room\)\}<\/div>/g,
  '<div class="schedule-sub">${escapeHtml(classTypeLabel(item.type))}</div></div><div class="schedule-teacher">${escapeHtml(item.teacher)}</div><div class="schedule-room">${escapeHtml(expandRoomLocation(item.room))}</div>'
);

// Update activatePage to set localStorage
content = content.replace(
  /if \(updateHash && location\.hash !== `\#\$\{page\}`\) history\.pushState\(null, "", `\#\$\{page\}`\);/g,
  `if (updateHash && location.hash !== \`#\${page}\`) history.pushState(null, "", \`#\${page}\`);
  localStorage.setItem("gndec-compass-last-page", page);`
);

// Update initialization to read from localStorage
content = content.replace(
  /const initialHashPage = location\.hash\.slice\(1\);\nactivatePage\(\["today", "chat", "timetable", "profile", "settings"\]\.includes\(initialHashPage\) \? initialHashPage : \(hasStudentProfile\(\) \? "today" : "profile"\), false\);/g,
  `const initialHashPage = location.hash.slice(1);
const savedPage = localStorage.getItem("gndec-compass-last-page") || "";
const validPages = ["today", "chat", "timetable", "profile", "settings"];
let pageToActivate = validPages.includes(initialHashPage) ? initialHashPage : null;
if (!pageToActivate) {
  pageToActivate = validPages.includes(savedPage) ? savedPage : (hasStudentProfile() ? "today" : "profile");
}
activatePage(pageToActivate, false);`
);

fs.writeFileSync('public/app.js', content);
console.log('Update script executed');

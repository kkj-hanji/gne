import fs from 'fs';

// Update public/app.js
let appJs = fs.readFileSync('public/app.js', 'utf8');

appJs = appJs.replace(/\s*"How is CGPA calculated\?",\n/g, '\n');
appJs = appJs.replace(/\s*\{ text: "CGPA calculation", query: "How is CGPA calculated\?" \},?\n/g, '\n');
appJs = appJs.replace(/\s*\{ text: "Calculate CGPA", query: "How is CGPA calculated\?" \},?\n/g, '\n');

// Also ensure the previous trailing comma is removed if it's the last item in the array
appJs = appJs.replace(/,\n\s*\]/g, '\n    ]');

fs.writeFileSync('public/app.js', appJs);

// Update public/brain-v1-2.js
let brainJs = fs.readFileSync('public/brain-v1-2.js', 'utf8');

brainJs = brainJs.replace(/\s*"How is CGPA calculated\?",\n/g, '\n');
brainJs = brainJs.replace(/\s*"Attended 24 out of 30 classes, can I bunk\?",\n/g, '\n');

fs.writeFileSync('public/brain-v1-2.js', brainJs);

console.log('Fixed suggestions in app.js and brain-v1-2.js');

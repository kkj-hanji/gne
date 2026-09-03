const fs = require('fs');
const content = fs.readFileSync('test/parser.test.mjs', 'utf8');
const lines = content.split('\n');
console.log('Total lines in test file:', lines.length);

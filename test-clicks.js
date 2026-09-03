import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('public/index.html', 'utf8');
const script = fs.readFileSync('public/app.js', 'utf8');

const dom = new JSDOM(html, { runScripts: 'dangerously' });
const window = dom.window;

// Mock enough of the environment for app.js to not throw immediately
window.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

window.eval(script);

setTimeout(() => {
  const nextBtn = window.document.getElementById('day-nav-next');
  console.log('Next text:', window.document.getElementById('day-nav-next-text').textContent);
  nextBtn.click();
  console.log('Next text after click:', window.document.getElementById('day-nav-next-text').textContent);
}, 200);

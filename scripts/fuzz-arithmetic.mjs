// Fuzz sanitizeArithmetic + evaluateArithmetic: crashes, hangs, non-finite
// leaks, and executable-input survival. Exits non-zero on any finding.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({ console });
vm.runInContext(readFileSync("public/brain-kernel.js", "utf8"), ctx);
const kernel = ctx.CompassBrainKernel;

let seed = 0x2f6e2b1;
const rand = () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 0xffffffff;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const atoms = ["1", "17", "0", "-3", "2.5", "999999999999", "(", ")", "+", "-", "*", "/", "^", "%",
  "mod", "plus", "minus", "times", "divided by", "of", "forty", "two", "constructor", "alert(1)",
  "process.exit()", "Math.random()", "__proto__", "e309", "Infinity", "NaN", "'", '"', "\\", "`",
  "परसों", "ਕਲ੍ਹ", "%", "=", ":", ".", " ", "1e308", "0.1", "1000000"];
const inputs = [];
for (let i = 0; i < 20000; i += 1) {
  const len = 1 + Math.floor(rand() * 10);
  let s = "";
  for (let j = 0; j < len; j += 1) s += `${pick(atoms)}${rand() < 0.7 ? " " : ""}`;
  inputs.push(s);
}
// Directed adversarial cases.
inputs.push("constructor.constructor('return process')()", "(((((1))))))", "5 % % 5", "% % %",
  "mod mod mod", "1e309 ^ 999", "99999999999999999999 ^ 99999999999999999999",
  "((((((((((((((((((((1))))))))))))))))))))", "0 % 0", "5 % 0", "-5 % 3", "5 % -3");

let evaluated = 0;
const findings = [];
const startedAt = Date.now();
for (const input of inputs) {
  let expression = "";
  try {
    expression = kernel.sanitizeArithmetic(input);
  } catch (error) {
    findings.push({ input, stage: "sanitize-throw", error: String(error) });
    continue;
  }
  if (!expression) continue;
  if (!/^[0-9+\-*/^%().\s]+$/.test(expression)) {
    findings.push({ input, stage: "sanitize-leak", expression });
    continue;
  }
  if (expression.length > 400) {
    findings.push({ input, stage: "unbounded-length", expression: expression.slice(0, 80) });
    continue;
  }
  try {
    const value = kernel.evaluateArithmetic(expression);
    evaluated += 1;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      findings.push({ input, stage: "non-finite-result", expression, value: String(value) });
    }
  } catch {
    // Throwing on malformed/div-zero/overflow is the designed failure mode.
  }
}
const elapsed = Date.now() - startedAt;
console.log(`fuzzed ${inputs.length} inputs in ${elapsed}ms (${evaluated} evaluated, ${findings.length} findings)`);
findings.slice(0, 20).forEach((finding, index) => console.log(`${index + 1}.`, JSON.stringify(finding)));
process.exit(findings.length ? 1 : 0);

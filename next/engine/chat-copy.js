const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function decodeHtml(value = "") {
  const decodeCodePoint = (raw, radix = 10) => {
    const point = parseInt(raw, radix);
    if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return "\uFFFD";
    return String.fromCodePoint(point);
  };
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, number) => decodeCodePoint(number))
    .replace(/&#x([\da-f]+);/gi, (_, number) => decodeCodePoint(number, 16));
}

function plainText(html = "") {
  return decodeHtml(String(html).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

const COPY_OMIT = "script,style,template,button,input,textarea,select,iframe,object,embed,img,svg,canvas,video,audio,.answer-suggestions,.msg-actions,[data-copy-ignore],[aria-hidden='true']";
const COPY_BLOCKS = new Set(["ADDRESS", "ARTICLE", "BLOCKQUOTE", "DD", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "LI", "MAIN", "OL", "P", "PRE", "SECTION", "UL"]);

function listItemPrefix(node, ordered) {
  if (!ordered) return "• ";
  const siblings = [...(node.parentElement?.children || [])].filter((child) => child.tagName === "LI");
  return `${Math.max(1, siblings.indexOf(node) + 1)}. `;
}

/** Convert answer HTML to readable plain text while retaining its structure. */
export function htmlToChatText(html = "", documentRef = globalThis.document) {
  const source = String(html || "");
  if (!source.trim()) return "";
  if (!documentRef?.createElement) {
    return decodeHtml(source.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:p|div|li|h[1-6]|tr|section|article)>/gi, "\n").replace(/<[^>]*>/g, ""))
      .replace(/[\t ]+\n/g, "\n").replace(/\n[\t ]+/g, "\n").replace(/[\t ]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  const root = documentRef.createElement("div");
  root.innerHTML = source;
  root.querySelectorAll(COPY_OMIT).forEach((node) => node.remove());
  let output = "";
  const append = (value) => { output += value; };
  const lineBreak = () => { if (!output.endsWith("\n")) append("\n"); };
  const paragraphBreak = () => { while (!output.endsWith("\n\n")) append("\n"); };
  const paragraphTags = new Set(["ADDRESS", "BLOCKQUOTE", "FIGCAPTION", "H1", "H2", "H3", "H4", "H5", "H6", "P", "PRE"]);
  const walk = (node, listType = "", listDepth = 0, inPre = false) => {
    if (node.nodeType === 3) {
      append(inPre ? node.nodeValue || "" : String(node.nodeValue || "").replace(/[\t\r\n ]+/g, " "));
      return;
    }
    if (node.nodeType !== 1 && node !== root) return;
    const tag = node.tagName || "";
    if (tag === "BR") { append("\n"); return; }
    if (tag === "HR") { append("\n\n"); return; }
    if (tag === "TABLE") {
      lineBreak();
      [...node.children].forEach((child) => walk(child, listType, listDepth, inPre));
      lineBreak();
      return;
    }
    if (tag === "TR") {
      lineBreak();
      const cells = [...node.children].filter((child) => child.tagName === "TD" || child.tagName === "TH");
      cells.forEach((cell, index) => {
        walk(cell, listType, listDepth, inPre);
        if (index < cells.length - 1) append("\t");
      });
      lineBreak();
      return;
    }
    if (tag === "TD" || tag === "TH") {
      [...node.childNodes].forEach((child) => walk(child, listType, listDepth, inPre));
      return;
    }
    if (tag === "DT") {
      lineBreak();
      [...node.childNodes].forEach((child) => walk(child, listType, listDepth, inPre));
      append(": ");
      return;
    }
    if (tag === "DD") {
      [...node.childNodes].forEach((child) => walk(child, listType, listDepth, inPre));
      lineBreak();
      return;
    }
    const block = COPY_BLOCKS.has(tag);
    if (block) (paragraphTags.has(tag) ? paragraphBreak : lineBreak)();
    if (tag === "LI") append(`${"  ".repeat(Math.min(listDepth, 4))}${listItemPrefix(node, listType === "ol")}`);
    [...node.childNodes].forEach((child) => {
      const childListType = tag === "OL" || tag === "UL" ? tag.toLowerCase() : listType;
      const childDepth = tag === "OL" || tag === "UL" ? listDepth + 1 : listDepth;
      walk(child, childListType, childDepth, inPre || tag === "PRE");
    });
    if (tag === "A") {
      const href = String(node.getAttribute("href") || "").trim();
      const label = String(node.textContent || "").trim();
      if (href && href !== label) append(` (${href})`);
    }
    if (block) (paragraphTags.has(tag) ? paragraphBreak : lineBreak)();
  };
  [...root.childNodes].forEach((node) => walk(node));
  return output
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Formats any answer for copying, retaining a special compact timetable layout. */
export function formatChatMessageCopy(message, context = {}, documentRef = globalThis.document) {
  if (!message) return "";
  return formatDayScheduleCopy(message, context) || htmlToChatText(message.html || "", documentRef);
}

/** Pick the user's original prompt when an assistant answer's Ask again is used. */
export function chatQuestionToRetry(messages, index) {
  const position = typeof index === "number" ? index : /^\d+$/.test(String(index)) ? Number(index) : NaN;
  if (!Array.isArray(messages) || !Number.isInteger(position)) return null;
  const message = messages[position];
  if (!message) return null;
  if (message.role === "user") return message;
  return [...messages.slice(0, position)].reverse().find((item) => item?.role === "user") || null;
}

/** Write plain text to the clipboard, falling back for browsers without Clipboard API access. */
export async function writeChatClipboard(text, { clipboard = globalThis.navigator?.clipboard, documentRef = globalThis.document } = {}) {
  const value = String(text || "");
  if (!value) throw new Error("Nothing to copy");
  if (typeof clipboard?.writeText === "function") {
    await clipboard.writeText(value);
    return;
  }
  if (!documentRef?.body || typeof documentRef.execCommand !== "function") throw new Error("Clipboard access is unavailable");

  const activeElement = documentRef.activeElement;
  const buffer = documentRef.createElement("textarea");
  buffer.setAttribute("readonly", "");
  buffer.setAttribute("aria-hidden", "true");
  buffer.style.position = "fixed";
  buffer.style.opacity = "0";
  buffer.style.pointerEvents = "none";
  buffer.value = value;
  documentRef.body.appendChild(buffer);
  buffer.select?.();
  let copied = false;
  try { copied = documentRef.execCommand("copy"); }
  finally {
    buffer.remove();
    if (activeElement?.focus) activeElement.focus({ preventScroll: true });
  }
  if (!copied) throw new Error("Clipboard copy was blocked");
}

function dateForWeekday(dateISO, weekday) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ""))) return "";
  const target = WEEKDAYS.findIndex((name) => name.toLowerCase() === String(weekday || "").toLowerCase());
  if (target < 0) return "";
  const date = new Date(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + (target - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
}

/** Formats a daily timetable answer for sharing in the compact legacy style. */
export function formatDayScheduleCopy(message, context = {}) {
  if (!message || message.meta?.intent !== "DAY_SCHEDULE") return "";
  const html = String(message.html || "");
  const cardPattern = /<div\s+class="answer-class(?:\s+[^"]*)?"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  const cards = [...html.matchAll(cardPattern)];
  if (!cards.length) return "";

  const day = String(message.meta?.entities?.day || "").trim();
  const headingHtml = html.match(/<p[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || "";
  const headingParts = plainText(headingHtml).split(/\s*(?:\u00b7|\u2022)\s*/u).filter(Boolean);
  const displayLabel = headingParts.at(-1) || String(context.subgroup || context.group || "").trim();
  const dateISO = dateForWeekday(context.dateISO, day);
  if (!day || !displayLabel || !dateISO) return "";

  const rows = cards.map(({ 1: block }) => {
    const timeHtml = block.match(/<div\s+class="answer-class-time"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const subjectHtml = block.match(/<div\s+class="answer-class-body"[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || "";
    const fullTime = plainText(timeHtml);
    const time = fullTime.match(/^\d{1,2}:\d{2}\s*(?:AM|PM)/i)?.[0] || "";
    const subject = plainText(subjectHtml);
    if (!time || !subject) return "";
    const details = [...block.matchAll(/<span(?:\s+[^>]*)?>([\s\S]*?)<\/span>/gi)]
      .map((item) => plainText(item[1]))
      .filter((item) => item && !/^(lecture|tutorial|practical)$/i.test(item));
    // The answer card shows teacher then room; Legacy shares room then teacher.
    const detailLine = (details.length > 1 ? [details.at(-1), ...details.slice(0, -1)] : details).join(" \u00b7 ");
    return `${day} ${time}: ${subject}${detailLine ? `\n${detailLine}` : ""}`;
  }).filter(Boolean);

  return rows.length ? `${displayLabel} timetable \u00b7 ${day} \u00b7 ${dateISO}\n\n${rows.join("\n\n")}` : "";
}

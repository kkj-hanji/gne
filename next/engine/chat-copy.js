const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)));
}

function plainText(html = "") {
  return decodeHtml(String(html).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
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

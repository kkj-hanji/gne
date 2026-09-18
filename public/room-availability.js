(function (scope) {
  "use strict";
  function matches(question) {
    return /\b(?:rooms?|classrooms?|labs?)\b/i.test(question) && /\b(?:free|empty|available|vacant|khali|khaali)\b/i.test(question);
  }
  function resolve(question, rows, day, minutes) {
    const q = String(question).toLowerCase();
    if (!matches(q)) return null;
    if (/\b(?:next|previous|first|last)\s+(?:period|lecture|class)\b/.test(q)) return { error: "Please give the day and clock time to check room occupancy, for example Monday at 2 PM." };
    if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return { error: "Give a time with AM/PM, for example 2 PM or 14:30." };
    if ([...q.matchAll(/\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b|\b\d{1,2}\s*(?:am|pm)\b/g)].length > 1 || /\bat\s+\d+\s*(?:-|to)\s*\d+/.test(q)) return { error: "Give one time to check room occupancy, including AM/PM." };
    if (/\b(?:between|until|till|through|after(?! tomorrow)|before(?! yesterday)|whole|entire)\b|\d\s*(?:am|pm)\s*(?:-|to)\s*\d/i.test(q)) return { error: "I can check room occupancy at one time. Give a day and time, such as Monday at 2 PM." };
    const labels = [...new Set(rows.map(row => String(row.group || "").trim()).filter(Boolean))];
    const code = [...q.matchAll(/\b([a-z]{1,3})\s*(\d{1,3})\b/gi)].find(match => !/^(?:at|on|in|am|pm)$/.test(match[1]))?.[0]?.replace(/\s/g, "").toUpperCase();
    const prefixes = [...new Set([...q.matchAll(/\b([sfg])\b/g)].map(match => match[1].toUpperCase()))];
    if (/\b(?:in|block|building)\s+a\b|\ba\s+(?:block|building)\b/.test(q)) prefixes.push("A");
    const blocks = [];
    if (/\bautomobile\b/.test(q)) blocks.push(/\bAUTOMOBILE\b/i);
    if (/\b(?:in it|it block|it department|it rooms?|information technology)\b/.test(q)) blocks.push(/\bIT\b|INFORMATION TECHNOLOGY/i);
    if (/\b(?:cse|computer science)\b/.test(q)) blocks.push(/\bCSE\b|COMPUTER SCIENCE/i);
    let rooms = labels;
    if (code) rooms = labels.filter(label => label.replace(/\s/g, "").toUpperCase().match(/^[A-Z]+\d+/)?.[0] === code);
    else if (prefixes.length || blocks.length) rooms = labels.filter(label => prefixes.some(prefix => new RegExp(`^${prefix}\\s*\\d+\\b`, "i").test(label)) || blocks.some(pattern => pattern.test(label)));
    else if (/\b(?:in|block|building|department)\s+(?!the\b|college\b|campus\b|gndec\b)/.test(q)) return { error: "I could not verify that room area. Use a published room code or S, F, G, A, Automobile, IT or CSE." };
    if (!rooms.length) return { error: "No rooms matching that area are present in the loaded official room timetable." };
    if (!rows.some(row => row.day === day)) return { error: `The loaded room timetable does not publish ${day} entries. I cannot confirm room availability for that day.` };
    const available = rooms.filter(room => !rows.some(row => row.group === room && row.day === day && row.start <= minutes && minutes < row.end));
    return { rooms: available.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), checked: rooms.length };
  }
  scope.CompassRoomAvailability = Object.freeze({ matches, resolve });
})(globalThis);

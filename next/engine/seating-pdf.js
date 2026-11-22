import { getDocument, GlobalWorkerOptions } from "../vendor/pdf.min.mjs";

const MAX_FILE_BYTES = 1_500_000;
const MAX_PAGES = 50;

function pageTextLines(items) {
  const rows = [];
  for (const item of items || []) {
    const value = String(item?.str || "").trim();
    if (!value) continue;
    const x = Number(item.transform?.[4]) || 0;
    const y = Number(item.transform?.[5]) || 0;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 1.25);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, value });
  }
  return rows.sort((a, b) => b.y - a.y).map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => item.value).join(" "));
}

/** Extract selectable PDF text on this device. The PDF bytes never leave the browser. */
export async function extractSeatingPdf(file, { onProgress = () => {} } = {}) {
  if (!file || file.type !== "application/pdf" && !/\.pdf$/i.test(file.name || "")) {
    throw new Error("Choose a PDF file.");
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error("Choose a non-empty PDF smaller than 1.5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") throw new Error("This file does not have a valid PDF header.");

  GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href;
  const loading = getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false });
  const document = await loading.promise;
  if (document.numPages < 1 || document.numPages > MAX_PAGES) {
    await document.destroy();
    throw new Error(`This file has ${document.numPages} pages. Seating-plan PDFs must have 1 to ${MAX_PAGES} pages.`);
  }

  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(pageTextLines(content.items).join("\n"));
      page.cleanup();
      onProgress({ page: pageNumber, pages: document.numPages });
    }
  } finally {
    await document.destroy();
  }
  return { text: pages.join("\n\n"), pages: pages.length };
}

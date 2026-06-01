import { PDFDocument } from "npm:pdf-lib";

// PT Sans supports both Latin and Cyrillic; fetched once and cached for the lifetime of the instance
const FONT_URL = "https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo99u79D0KEwA.ttf";
let cachedFontBytes: Uint8Array | null = null;

async function getFontBytes(): Promise<Uint8Array> {
  if (!cachedFontBytes) {
    const res = await fetch(FONT_URL);
    cachedFontBytes = new Uint8Array(await res.arrayBuffer());
  }
  return cachedFontBytes;
}

// Generate an A4 PDF document from assignment text and return raw bytes
export async function generatePdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Dynamic import avoids CJS startup crash in Deno; .default handles CJS interop
  const fontkitLib = await import("npm:@pdf-lib/fontkit");
  doc.registerFontkit((fontkitLib as any).default ?? fontkitLib);
  const fontBytes = await getFontBytes();
  const font = await doc.embedFont(fontBytes);

  const fontSize = 11;
  const lineHeight = 14;
  const margin = 50;
  const pageWidth = 595;
  const pageHeight = 842;
  const usableWidth = pageWidth - 2 * margin;

  // Word-wrap each line to fit usable width
  const wrapped: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") {
      wrapped.push("");
      continue;
    }
    const words = raw.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) > usableWidth && current) {
        wrapped.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) wrapped.push(current);
  }

  // Paginate
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const line of wrapped) {
    if (y < margin + lineHeight) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    if (line !== "") {
      page.drawText(line, { x: margin, y, font, size: fontSize });
    }
    y -= lineHeight;
  }

  return doc.save();
}

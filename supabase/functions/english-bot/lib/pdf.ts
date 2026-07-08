import { PDFDocument } from "npm:pdf-lib";

// PT Sans supports both Latin and Cyrillic; fetched once and cached for the lifetime of the instance.
// ⚠️ Только полные TTF (v18, legacy-путь без unicode-range): старый v17-URL был latin-сабсетом
// и рисовал кириллицу тофу-квадратами.
const FONT_URL = "https://fonts.gstatic.com/s/ptsans/v18/jizaRExUiTo99u79P0U.ttf";
const BOLD_FONT_URL = "https://fonts.gstatic.com/s/ptsans/v18/jizfRExUiTo99u79B_mh4Ok.ttf";
const fontCache = new Map<string, Uint8Array>();

async function getFontBytes(url: string): Promise<Uint8Array> {
  const cached = fontCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch failed: HTTP ${res.status} for ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  fontCache.set(url, bytes);
  return bytes;
}

// Header lines get the bold face: "Module: …" / "Teacher's Guide · …" (first lines)
// and "Task N · …" block titles. Everything else is body text.
export function isHeaderLine(line: string): boolean {
  return /^(Module:|Teacher's Guide\b|Task \d+\b)/.test(line.trimStart());
}

// Generate an A4 PDF document from assignment text and return raw bytes
export async function generatePdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Dynamic import avoids CJS startup crash in Deno; .default handles CJS interop
  const fontkitLib = await import("npm:@pdf-lib/fontkit");
  doc.registerFontkit((fontkitLib as any).default ?? fontkitLib);
  const [fontBytes, boldBytes] = await Promise.all([getFontBytes(FONT_URL), getFontBytes(BOLD_FONT_URL)]);
  const font = await doc.embedFont(fontBytes);
  const bold = await doc.embedFont(boldBytes);

  const fontSize = 11;
  const lineHeight = 14;
  const margin = 50;
  const pageWidth = 595;
  const pageHeight = 842;
  const usableWidth = pageWidth - 2 * margin;

  // Word-wrap each line to fit usable width; wrapped continuations inherit the header face
  const wrapped: { text: string; bold: boolean }[] = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") {
      wrapped.push({ text: "", bold: false });
      continue;
    }
    const isBold = isHeaderLine(raw);
    const face = isBold ? bold : font;
    const words = raw.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (face.widthOfTextAtSize(candidate, fontSize) > usableWidth && current) {
        wrapped.push({ text: current, bold: isBold });
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) wrapped.push({ text: current, bold: isBold });
  }

  // Paginate
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const line of wrapped) {
    if (y < margin + lineHeight) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    if (line.text !== "") {
      page.drawText(line.text, { x: margin, y, font: line.bold ? bold : font, size: fontSize });
    }
    y -= lineHeight;
  }

  return doc.save();
}

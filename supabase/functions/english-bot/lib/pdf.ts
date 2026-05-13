import { PDFDocument, StandardFonts } from "npm:pdf-lib";

// Generate an A4 PDF document from assignment text and return raw bytes
export async function generatePdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

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

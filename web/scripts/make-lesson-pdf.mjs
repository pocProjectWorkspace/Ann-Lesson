// Generates a short original lesson PDF (cover + content pages + practice page).
// Used by prisma/seed-demo.ts so every demo lesson opens in the book viewer.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const W = 595;
const H = 842;
const M = 56;
const INK = rgb(0.13, 0.15, 0.2);
const MUTED = rgb(0.45, 0.47, 0.55);
const SOFT = rgb(0.93, 0.94, 0.99);

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * @param {object} spec
 * @param {string} spec.grade      e.g. "Grade 6"
 * @param {string} spec.subject    e.g. "Science"
 * @param {string} spec.chapter    e.g. "Chapter 2"
 * @param {string} spec.title      e.g. "Living and Non-living Things"
 * @param {string} spec.tagline
 * @param {string} spec.accent     hex colour for the cover
 * @param {{heading:string, paragraphs:string[], bullets?:string[]}[]} spec.sections  one page each
 * @param {string[]} spec.questions
 */
export async function makeLessonPdf(spec) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(spec.title);
  pdf.setAuthor("Lesson Plan sample content");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ACCENT = hex(spec.accent);

  const wrap = (text, size, maxWidth, f = font) => {
    const lines = [];
    let line = "";
    for (const w of text.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  };
  const header = (page, eyebrow, title, n) => {
    page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: SOFT });
    page.drawText(eyebrow, { x: M, y: H - 40, size: 10, font: bold, color: ACCENT });
    page.drawText(title, { x: M, y: H - 66, size: 22, font: bold, color: INK });
    page.drawText(`${n}`, { x: W - M - 10, y: 28, size: 10, font, color: MUTED });
    page.drawText(spec.title, { x: M, y: 28, size: 9, font, color: MUTED });
  };
  const paragraph = (page, text, y, size = 12) => {
    for (const l of wrap(text, size, W - 2 * M)) {
      page.drawText(l, { x: M, y, size, font, color: INK });
      y -= size * 1.55;
    }
    return y - size * 0.6;
  };
  const bullets = (page, items, y, size = 12) => {
    for (const item of items) {
      const lines = wrap(item, size, W - 2 * M - 18);
      page.drawCircle({ x: M + 4, y: y + 4, size: 2, color: ACCENT });
      lines.forEach((l, i) => page.drawText(l, { x: M + 16, y: y - i * size * 1.5, size, font, color: INK }));
      y -= lines.length * size * 1.5 + 6;
    }
    return y;
  };

  // Cover
  {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: ACCENT });
    p.drawRectangle({ x: M, y: H / 2 - 40, width: W - 2 * M, height: 240, color: rgb(1, 1, 1), opacity: 0.12 });
    p.drawText(`${spec.grade.toUpperCase()}  ·  ${spec.subject.toUpperCase()}`, { x: M + 24, y: H / 2 + 150, size: 11, font: bold, color: rgb(1, 1, 1) });
    p.drawText(spec.chapter, { x: M + 24, y: H / 2 + 100, size: 20, font, color: rgb(1, 1, 1) });
    const titleLines = wrap(spec.title, 34, W - 2 * M - 48, bold);
    titleLines.forEach((l, i) => p.drawText(l, { x: M + 24, y: H / 2 + 50 - i * 40, size: 34, font: bold, color: rgb(1, 1, 1) }));
    p.drawText(spec.tagline, { x: M + 24, y: H / 2 + 14 - (titleLines.length - 1) * 40, size: 13, font, color: rgb(1, 1, 1) });
    p.drawRectangle({ x: M + 24, y: 120, width: 70, height: 70, color: rgb(1, 1, 1), opacity: 0.85 });
    p.drawCircle({ x: M + 170, y: 155, size: 36, color: rgb(1, 1, 1), opacity: 0.85 });
    p.drawText("Lesson Plan sample content", { x: M, y: 40, size: 9, font, color: rgb(1, 1, 1) });
  }

  // Content pages
  spec.sections.forEach((s, i) => {
    const p = pdf.addPage([W, H]);
    header(p, `${spec.chapter.toUpperCase()} · PART ${i + 1}`, s.heading, i + 2);
    let y = H - 130;
    for (const para of s.paragraphs) y = paragraph(p, para, y);
    if (s.bullets?.length) {
      p.drawText("Key points", { x: M, y, size: 14, font: bold, color: ACCENT });
      y -= 22;
      y = bullets(p, s.bullets, y);
    }
  });

  // Practice page
  {
    const p = pdf.addPage([W, H]);
    header(p, `${spec.chapter.toUpperCase()} · PRACTICE`, "Check what you learnt", spec.sections.length + 2);
    let y = H - 130;
    p.drawText("Questions", { x: M, y, size: 14, font: bold, color: ACCENT });
    y -= 22;
    y = bullets(p, spec.questions.map((q, i) => `${i + 1}. ${q}`), y);
    p.drawRectangle({ x: M, y: y - 110, width: W - 2 * M, height: 100, color: SOFT });
    p.drawText("Teacher's note", { x: M + 14, y: y - 34, size: 11, font: bold, color: ACCENT });
    const note = "Ask students to mark this lesson as learnt once they have answered the questions in their notebook.";
    wrap(note, 11, W - 2 * M - 28).forEach((l, i) => p.drawText(l, { x: M + 14, y: y - 54 - i * 16, size: 11, font, color: INK }));
  }

  return pdf.save();
}

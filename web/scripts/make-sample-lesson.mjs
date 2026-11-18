// Generates samples/shapes-around-us.pdf: an original 6-page Grade 5 maths lesson
// used to demonstrate the book-style viewer. Run: node scripts/make-sample-lesson.mjs
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 595; // A4 portrait in points
const H = 842;
const M = 56; // margin
const INK = rgb(0.13, 0.15, 0.2);
const ACCENT = rgb(0.31, 0.27, 0.9);
const SOFT = rgb(0.93, 0.94, 0.99);
const MUTED = rgb(0.45, 0.47, 0.55);

const pdf = await PDFDocument.create();
pdf.setTitle("Shapes Around Us");
pdf.setAuthor("Lesson Plan sample content");
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

function wrap(text, size, maxWidth, f = font) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function header(page, chapter, title, n) {
  page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: SOFT });
  page.drawText(chapter, { x: M, y: H - 40, size: 10, font: bold, color: ACCENT });
  page.drawText(title, { x: M, y: H - 66, size: 22, font: bold, color: INK });
  page.drawText(`${n}`, { x: W - M - 10, y: 28, size: 10, font, color: MUTED });
  page.drawText("Shapes Around Us", { x: M, y: 28, size: 9, font, color: MUTED });
}

function paragraph(page, text, y, size = 12, width = W - 2 * M) {
  for (const line of wrap(text, size, width)) {
    page.drawText(line, { x: M, y, size, font, color: INK });
    y -= size * 1.55;
  }
  return y - size * 0.6;
}

function subheading(page, text, y) {
  page.drawText(text, { x: M, y, size: 14, font: bold, color: ACCENT });
  return y - 22;
}

function bullets(page, items, y, size = 12) {
  for (const item of items) {
    const lines = wrap(item, size, W - 2 * M - 18);
    page.drawCircle({ x: M + 4, y: y + 4, size: 2, color: ACCENT });
    lines.forEach((l, i) => {
      page.drawText(l, { x: M + 16, y: y - i * size * 1.5, size, font, color: INK });
    });
    y -= lines.length * size * 1.5 + 6;
  }
  return y;
}

// Page 1: cover
{
  const p = pdf.addPage([W, H]);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: ACCENT });
  p.drawRectangle({ x: M, y: H / 2 - 40, width: W - 2 * M, height: 240, color: rgb(1, 1, 1), opacity: 0.12 });
  p.drawText("GRADE 5  ·  MATHEMATICS", { x: M + 24, y: H / 2 + 150, size: 11, font: bold, color: rgb(1, 1, 1) });
  p.drawText("Chapter 3", { x: M + 24, y: H / 2 + 100, size: 20, font, color: rgb(1, 1, 1) });
  p.drawText("Shapes Around Us", { x: M + 24, y: H / 2 + 50, size: 36, font: bold, color: rgb(1, 1, 1) });
  p.drawText("Polygons, triangles, quadrilaterals and circles", { x: M + 24, y: H / 2 + 14, size: 13, font, color: rgb(1, 1, 1) });
  // decorative shapes
  p.drawRectangle({ x: M + 24, y: 120, width: 70, height: 70, color: rgb(1, 1, 1), opacity: 0.85 });
  p.drawCircle({ x: M + 170, y: 155, size: 36, color: rgb(1, 1, 1), opacity: 0.85 });
  p.drawLine({ start: { x: M + 240, y: 120 }, end: { x: M + 275, y: 190 }, thickness: 4, color: rgb(1, 1, 1) });
  p.drawLine({ start: { x: M + 275, y: 190 }, end: { x: M + 310, y: 120 }, thickness: 4, color: rgb(1, 1, 1) });
  p.drawLine({ start: { x: M + 310, y: 120 }, end: { x: M + 240, y: 120 }, thickness: 4, color: rgb(1, 1, 1) });
  p.drawText("Lesson Plan sample content", { x: M, y: 40, size: 9, font, color: rgb(1, 1, 1) });
}

// Page 2: what is a shape / polygons
{
  const p = pdf.addPage([W, H]);
  header(p, "CHAPTER 3 · LESSON 1", "What is a polygon?", 2);
  let y = H - 130;
  y = paragraph(p, "Look around your classroom. The door is a rectangle, the clock is a circle, and the roof of a house often looks like a triangle. Shapes are everywhere, and in this chapter we will learn their names and what makes each one special.", y);
  y = subheading(p, "Polygons", y);
  y = paragraph(p, "A polygon is a flat, closed shape made only of straight sides. The sides meet at corners called vertices. A shape with a curved side, such as a circle, is not a polygon.", y);
  y = subheading(p, "Naming polygons by sides", y);
  y = bullets(p, ["3 sides: triangle", "4 sides: quadrilateral", "5 sides: pentagon", "6 sides: hexagon", "8 sides: octagon"], y);
  // small shape row
  const base = y - 70;
  p.drawLine({ start: { x: M, y: base }, end: { x: M + 60, y: base }, thickness: 2, color: INK });
  p.drawLine({ start: { x: M + 60, y: base }, end: { x: M + 30, y: base + 52 }, thickness: 2, color: INK });
  p.drawLine({ start: { x: M + 30, y: base + 52 }, end: { x: M, y: base }, thickness: 2, color: INK });
  p.drawRectangle({ x: M + 100, y: base, width: 60, height: 52, borderColor: INK, borderWidth: 2 });
  const cx = M + 230, cy = base + 26, r = 28;
  const pent = Array.from({ length: 5 }, (_, i) => ({ x: cx + r * Math.cos(Math.PI / 2 + (i * 2 * Math.PI) / 5), y: cy + r * Math.sin(Math.PI / 2 + (i * 2 * Math.PI) / 5) }));
  pent.forEach((pt, i) => p.drawLine({ start: pt, end: pent[(i + 1) % 5], thickness: 2, color: INK }));
  p.drawText("triangle", { x: M + 6, y: base - 16, size: 9, font, color: MUTED });
  p.drawText("quadrilateral", { x: M + 96, y: base - 16, size: 9, font, color: MUTED });
  p.drawText("pentagon", { x: M + 208, y: base - 16, size: 9, font, color: MUTED });
}

// Page 3: triangles
{
  const p = pdf.addPage([W, H]);
  header(p, "CHAPTER 3 · LESSON 2", "Triangles", 3);
  let y = H - 130;
  y = paragraph(p, "A triangle has three sides, three vertices and three angles. The three angles of any triangle always add up to 180 degrees. We can sort triangles by their sides or by their angles.", y);
  y = subheading(p, "By sides", y);
  y = bullets(p, ["Equilateral: all three sides are equal, and all angles are 60 degrees.", "Isosceles: two sides are equal, and the two base angles are equal.", "Scalene: all three sides are different lengths."], y);
  y = subheading(p, "By angles", y);
  y = bullets(p, ["Acute: every angle is less than 90 degrees.", "Right: one angle is exactly 90 degrees.", "Obtuse: one angle is greater than 90 degrees."], y);
  const b = y - 90;
  const tri = (x0, pts, label) => {
    pts.forEach((pt, i) => p.drawLine({ start: { x: x0 + pt.x, y: b + pt.y }, end: { x: x0 + pts[(i + 1) % 3].x, y: b + pts[(i + 1) % 3].y }, thickness: 2, color: ACCENT }));
    p.drawText(label, { x: x0, y: b - 16, size: 9, font, color: MUTED });
  };
  tri(M, [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 35, y: 61 }], "equilateral");
  tri(M + 130, [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 0, y: 60 }], "right");
  tri(M + 260, [{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 20, y: 40 }], "scalene / obtuse");
}

// Page 4: quadrilaterals
{
  const p = pdf.addPage([W, H]);
  header(p, "CHAPTER 3 · LESSON 3", "Quadrilaterals", 4);
  let y = H - 130;
  y = paragraph(p, "A quadrilateral is any polygon with four sides. Its four angles add up to 360 degrees. Some quadrilaterals have special names because their sides or angles follow a pattern.", y);
  y = bullets(p, [
    "Square: four equal sides and four right angles.",
    "Rectangle: opposite sides equal and four right angles.",
    "Rhombus: four equal sides, but the angles need not be right angles.",
    "Parallelogram: both pairs of opposite sides are parallel and equal.",
    "Trapezium: exactly one pair of parallel sides.",
  ], y);
  const b = y - 100;
  p.drawRectangle({ x: M, y: b, width: 60, height: 60, borderColor: ACCENT, borderWidth: 2 });
  p.drawRectangle({ x: M + 90, y: b, width: 90, height: 60, borderColor: ACCENT, borderWidth: 2 });
  const para = [{ x: M + 210, y: b }, { x: M + 300, y: b }, { x: M + 325, y: b + 60 }, { x: M + 235, y: b + 60 }];
  para.forEach((pt, i) => p.drawLine({ start: pt, end: para[(i + 1) % 4], thickness: 2, color: ACCENT }));
  const trap = [{ x: M + 355, y: b }, { x: M + 455, y: b }, { x: M + 430, y: b + 60 }, { x: M + 380, y: b + 60 }];
  trap.forEach((pt, i) => p.drawLine({ start: pt, end: trap[(i + 1) % 4], thickness: 2, color: ACCENT }));
  ["square", "rectangle", "parallelogram", "trapezium"].forEach((l, i) => p.drawText(l, { x: [M, M + 90, M + 210, M + 360][i], y: b - 16, size: 9, font, color: MUTED }));
  y = b - 50;
  y = subheading(p, "Try it", y);
  paragraph(p, "Is every square a rectangle? Is every rectangle a square? Discuss with a partner and explain your answer using the definitions above.", y);
}

// Page 5: circles
{
  const p = pdf.addPage([W, H]);
  header(p, "CHAPTER 3 · LESSON 4", "Circles", 5);
  let y = H - 130;
  y = paragraph(p, "A circle is a closed curve where every point is the same distance from a fixed point in the middle, called the centre. A circle is not a polygon because it has no straight sides.", y);
  y = subheading(p, "Parts of a circle", y);
  y = bullets(p, [
    "Radius: a line from the centre to any point on the circle.",
    "Diameter: a line through the centre from one side to the other. It is twice the radius.",
    "Circumference: the distance all the way around the circle.",
    "Chord: a line joining two points on the circle that does not pass through the centre.",
  ], y);
  const cx = W / 2, cy = y - 110, r = 80;
  p.drawCircle({ x: cx, y: cy, size: r, borderColor: ACCENT, borderWidth: 2 });
  p.drawCircle({ x: cx, y: cy, size: 3, color: INK });
  p.drawLine({ start: { x: cx, y: cy }, end: { x: cx + r, y: cy }, thickness: 2, color: INK });
  p.drawText("radius", { x: cx + 20, y: cy + 6, size: 9, font, color: MUTED });
  p.drawLine({ start: { x: cx - r, y: cy - 30 }, end: { x: cx + Math.sqrt(r * r - 900), y: cy - 30 }, thickness: 2, color: MUTED });
  p.drawText("chord", { x: cx - 20, y: cy - 44, size: 9, font, color: MUTED });
  y = cy - r - 40;
  paragraph(p, "Example: if the radius of a wheel is 30 cm, its diameter is 60 cm.", y);
}

// Page 6: practice and summary
{
  const p = pdf.addPage([W, H]);
  header(p, "CHAPTER 3 · PRACTICE", "Check what you learnt", 6);
  let y = H - 130;
  y = subheading(p, "Summary", y);
  y = bullets(p, [
    "Polygons are closed shapes with straight sides, named by the number of sides.",
    "The angles of a triangle add up to 180 degrees; a quadrilateral's add up to 360 degrees.",
    "A circle has a centre, radius, diameter and circumference.",
  ], y);
  y = subheading(p, "Questions", y);
  y = bullets(p, [
    "1. Name a polygon with 6 sides. Draw it.",
    "2. A triangle has angles of 50 and 60 degrees. What is the third angle?",
    "3. Which quadrilateral has four equal sides but no right angles?",
    "4. The diameter of a plate is 24 cm. What is its radius?",
    "5. Find three objects at home shaped like a rectangle, a circle and a triangle. Write their names.",
  ], y);
  y -= 10;
  p.drawRectangle({ x: M, y: y - 120, width: W - 2 * M, height: 120, color: SOFT });
  p.drawText("Teacher's note", { x: M + 14, y: y - 24, size: 11, font: bold, color: ACCENT });
  paragraph(p, "Ask students to mark this lesson as learnt once they have answered the questions in their notebook. Use the progress table to see who needs help before the next chapter.", y - 46, 11, W - 2 * M - 28);
}

mkdirSync("samples", { recursive: true });
const bytes = await pdf.save();
writeFileSync("samples/shapes-around-us.pdf", bytes);
console.log(`Wrote samples/shapes-around-us.pdf (${pdf.getPageCount()} pages, ${bytes.length} bytes)`);

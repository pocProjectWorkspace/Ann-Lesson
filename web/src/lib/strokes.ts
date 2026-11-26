import { z } from "zod";

/**
 * One stroke of ink on a page, in page-relative coordinates (0..1 of width and height).
 * Shared by the board's notes, board-to-desk activities and page colouring, and by the
 * routes and server actions that store them.
 * - pen, highlighter, crayon: a polyline with a width (fraction of page width)
 * - fill: a single seed point; the area around it bounded by the page's dark lines is
 *   flooded with the colour when painted (see components/live/ink.ts)
 */
export const strokeSchema = z.object({
  tool: z.enum(["pen", "highlighter", "crayon", "fill"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().min(0.001).max(0.2),
  points: z.array(z.tuple([z.number().min(-0.1).max(1.1), z.number().min(-0.1).max(1.1)])).min(1).max(4000),
});
export type Stroke = z.infer<typeof strokeSchema>;

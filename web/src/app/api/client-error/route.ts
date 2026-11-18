import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { reportError } from "@/lib/report-error";

/** POST /api/client-error: the browser error boundary reports render failures here. */
export async function POST(req: Request) {
  const parsed = z.object({ message: z.string().max(500), digest: z.string().max(64).optional(), path: z.string().max(300).optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const session = await getSession().catch(() => null);
  reportError(new Error(parsed.data.message), { where: "client", path: parsed.data.path, userId: session?.userId, schoolId: session?.schoolId, extra: { digest: parsed.data.digest } });
  return NextResponse.json({ ok: true });
}

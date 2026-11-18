import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/health → 200 when the app and database are reachable. Used by Docker and load balancers. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up", time: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, db: "down", error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

import "server-only";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { getSessionFromRequest, type Session } from "./auth";
import { reportError } from "./report-error";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: Request, session: Session & { schoolId: string }, params: P) => Promise<Response>;

/**
 * Wraps a mobile API handler: verifies the bearer token (or cookie) against the
 * session table, enforces roles and converts thrown ApiErrors to JSON.
 */
export function withAuth<P = Record<string, never>>(roles: Role[], handler: Handler<P>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) return fail(401, "Not signed in");
      if (!roles.includes(session.role)) return fail(403, "Not allowed for this role");
      if (!session.schoolId) return fail(403, "No school on this account");
      return await handler(req, session as Session & { schoolId: string }, await ctx.params);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.status, e.message);
      reportError(e, { where: "api", path: new URL(req.url).pathname });
      return fail(500, "Something went wrong");
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}


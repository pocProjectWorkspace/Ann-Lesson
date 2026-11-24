import "server-only";

/**
 * Small in-memory rate limiter for login attempts.
 * Works per process. If you run several app instances behind a load balancer,
 * back this with Redis instead; the interface stays the same.
 */
type Bucket = { count: number; windowStart: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.blockedUntil < now && now - b.windowStart > 60 * 60_000) buckets.delete(k);
}

export type LimitRule = { max: number; windowMs: number; blockMs: number };

export const LOGIN_PER_IP: LimitRule = { max: 30, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
export const LOGIN_PER_ACCOUNT: LimitRule = { max: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
/** Unauthenticated endpoints that cost a database or network call per hit. */
export const PUBLIC_PER_IP: LimitRule = { max: 60, windowMs: 15 * 60_000, blockMs: 5 * 60_000 };

/** Count one hit on a public endpoint; returns seconds to wait when the caller is over the limit. */
export function hitPublic(headers: Headers, name: string) {
  const key = `public:${name}:${clientIpFrom(headers)}`;
  const wait = blockedFor(key);
  if (wait) return wait;
  return recordFailure(key, PUBLIC_PER_IP);
}

/** Returns seconds to wait if the key is currently blocked, otherwise 0. */
export function blockedFor(key: string): number {
  const b = buckets.get(key);
  if (!b) return 0;
  const now = Date.now();
  return b.blockedUntil > now ? Math.ceil((b.blockedUntil - now) / 1000) : 0;
}

/** Record a failed attempt. Returns seconds blocked if this attempt crossed the limit. */
export function recordFailure(key: string, rule: LimitRule): number {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || now - b.windowStart > rule.windowMs) {
    b = { count: 0, windowStart: now, blockedUntil: 0 };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count >= rule.max) {
    b.blockedUntil = now + rule.blockMs;
    b.count = 0;
    b.windowStart = now;
    return Math.ceil(rule.blockMs / 1000);
  }
  return 0;
}

export function recordSuccess(key: string) {
  buckets.delete(key);
}

export function clientIpFrom(headers: Headers) {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? "local";
}

export function humanWait(seconds: number) {
  if (seconds < 90) return `${seconds} seconds`;
  return `${Math.ceil(seconds / 60)} minutes`;
}

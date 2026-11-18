import { describe, expect, it } from "vitest";
import { blockedFor, clientIpFrom, humanWait, recordFailure, recordSuccess } from "@/lib/rate-limit";

const rule = { max: 3, windowMs: 60_000, blockMs: 120_000 };

describe("rate limit", () => {
  it("blocks after max failures and reports the wait", () => {
    const key = `t:${Math.random()}`;
    expect(recordFailure(key, rule)).toBe(0);
    expect(recordFailure(key, rule)).toBe(0);
    expect(recordFailure(key, rule)).toBe(120);
    expect(blockedFor(key)).toBeGreaterThan(0);
  });
  it("clears on success", () => {
    const key = `t:${Math.random()}`;
    recordFailure(key, rule);
    recordFailure(key, rule);
    recordSuccess(key);
    expect(recordFailure(key, rule)).toBe(0);
  });
  it("reads the client ip from proxy headers", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIpFrom(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIpFrom(new Headers())).toBe("local");
  });
  it("formats waits", () => {
    expect(humanWait(30)).toBe("30 seconds");
    expect(humanWait(900)).toBe("15 minutes");
  });
});

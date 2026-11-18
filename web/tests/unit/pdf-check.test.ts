import { describe, expect, it } from "vitest";
import { looksLikePdf } from "@/lib/pdf-check";

const enc = (s: string) => new TextEncoder().encode(s);

describe("looksLikePdf", () => {
  it("accepts a real header", () => {
    expect(looksLikePdf(enc("%PDF-1.4\n%âãÏÓ"))).toBe(true);
  });
  it("accepts a header after a short lead-in", () => {
    expect(looksLikePdf(enc("﻿  \n%PDF-1.7"))).toBe(true);
  });
  it("rejects text renamed to .pdf", () => {
    expect(looksLikePdf(enc("hello world this is not a pdf"))).toBe(false);
  });
  it("rejects a header buried deeper than 1 KB", () => {
    expect(looksLikePdf(enc("x".repeat(2000) + "%PDF-1.4"))).toBe(false);
  });
  it("rejects empty input", () => {
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

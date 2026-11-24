import { describe, expect, it } from "vitest";
import { columnIndex, parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("splits simple rows and trims empty lines", () => {
    expect(parseCsv("a,b,c\n1,2,3\n\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("handles quoted fields with commas, quotes and newlines", () => {
    const rows = parseCsv('name,note\n"Kumar, Asha","said ""hi""\nthen left"\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Kumar, Asha", 'said "hi"\nthen left'],
    ]);
  });
  it("handles CRLF and a BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("toCsv", () => {
  it("escapes fields that need it and adds a BOM", () => {
    const out = toCsv([["Name", "Note"], ["Asha", 'has "quotes", commas']]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain('Asha,"has ""quotes"", commas"');
  });
  it("round-trips through parseCsv", () => {
    const rows = [["a", "b,c", 'd"e'], ["1", "", "3"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("columnIndex", () => {
  it("matches headers loosely", () => {
    const h = ["Full Name", "Student_ID", " E-mail "];
    expect(columnIndex(h, "name", "full name")).toBe(0);
    expect(columnIndex(h, "student id", "username")).toBe(1);
    expect(columnIndex(h, "email")).toBe(2);
    expect(columnIndex(h, "password")).toBe(-1);
  });
  it("neutralises spreadsheet formulas in exported cells", async () => {
    const { toCsv } = await import("@/lib/csv");
    const out = toCsv([["=HYPERLINK(\"http://evil\")", "+1", "-2", "@x", "plain"]]);
    expect(out).toContain("'=HYPERLINK");
    expect(out).toContain("'+1");
    expect(out).toContain("'-2");
    expect(out).toContain("'@x");
    expect(out).toContain(",plain");
  });
});

import { describe, it, expect } from "vitest";

import { selectAll } from "./paginate";

/**
 * Build a fake PostgREST query factory over an in-memory dataset that honours a
 * `max-rows` cap exactly like the server: any single `.range()` returns at most
 * `cap` rows regardless of how wide the requested window is.
 */
function fakeTable<T>(rows: T[], cap = 1000) {
  let calls = 0;
  const make = () => ({
    range: async (from: number, to: number) => {
      calls += 1;
      const window = rows.slice(from, to + 1).slice(0, cap);
      return { data: window, error: null as { message: string } | null };
    },
  });
  return { make, calls: () => calls };
}

describe("selectAll", () => {
  it("returns every row past the 1000-row cap", async () => {
    const rows = Array.from({ length: 1116 }, (_, i) => i);
    const t = fakeTable(rows);
    const out = await selectAll<number>(t.make);
    expect(out).toHaveLength(1116);
    expect(out).toEqual(rows);
    // 1116 rows / 1000 page → two full-or-short pages requested.
    expect(t.calls()).toBe(2);
  });

  it("stops after one page when the table is smaller than a page", async () => {
    const rows = Array.from({ length: 42 }, (_, i) => i);
    const t = fakeTable(rows);
    const out = await selectAll<number>(t.make);
    expect(out).toEqual(rows);
    expect(t.calls()).toBe(1);
  });

  it("issues an extra page when the total is an exact multiple of pageSize", async () => {
    // A full final page can't tell us it's the last, so we must probe once more.
    const rows = Array.from({ length: 2000 }, (_, i) => i);
    const t = fakeTable(rows);
    const out = await selectAll<number>(t.make);
    expect(out).toHaveLength(2000);
    expect(t.calls()).toBe(3); // 1000 + 1000 + 0
  });

  it("propagates a query error", async () => {
    const make = () => ({
      range: async () => ({ data: null, error: { message: "boom" } }),
    });
    await expect(selectAll<number>(make)).rejects.toThrow("boom");
  });
});

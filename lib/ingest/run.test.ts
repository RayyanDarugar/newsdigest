import { describe, it, expect, vi, beforeEach } from "vitest";

// Vitest hoists vi.mock factories above top-level const declarations, and
// only allows the factory to reference outer variables whose names start
// with "mock" — hence mockFrom/mockRpc rather than fromMock/rpcMock.
const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/db", () => ({
  getServiceClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import { runIngest } from "@/lib/ingest/run";

function selectResult(slugs: string[]) {
  return { select: () => Promise.resolve({ data: slugs.map((slug) => ({ slug })), error: null }) };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("runIngest", () => {
  it("returns 422 for a payload that fails schema validation", async () => {
    const result = await runIngest({ date: "not-a-date", entries: [], items: [] });
    expect(result).toMatchObject({ ok: false, status: 422 });
  });

  it("returns 422 listing unknown industry/category slugs", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "industries" ? selectResult([]) : selectResult([]),
    );
    const result = await runIngest({
      date: "2026-07-22",
      entries: [
        { category: "big_event", industry: "energy", title: "T", body: "B", position: 0, source_refs: [] },
      ],
      items: [],
    });
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      body: { unknown_industries: ["energy"], unknown_categories: ["big_event"] },
    });
  });

  it("writes the digest and returns counts on a valid payload", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "industries" ? selectResult(["energy"]) : selectResult(["big_event"]),
    );
    mockRpc.mockResolvedValue({ error: null });

    const result = await runIngest({
      date: "2026-07-22",
      entries: [
        { category: "big_event", industry: "energy", title: "T", body: "B", position: 0, source_refs: ["k1"] },
      ],
      items: [{ key: "k1", industry: "energy", source_type: "reddit", title: "I", position: 0 }],
    });

    expect(result).toEqual({ ok: true, date: "2026-07-22", items: 1, entries: 1 });
    expect(mockRpc).toHaveBeenCalledWith("replace_digest", expect.objectContaining({ p_digest: expect.any(Object) }));
  });

  it("returns 500 when the write RPC fails", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "industries" ? selectResult(["energy"]) : selectResult(["big_event"]),
    );
    mockRpc.mockResolvedValue({ error: { message: "db exploded" } });

    const result = await runIngest({
      date: "2026-07-22",
      entries: [
        { category: "big_event", industry: "energy", title: "T", body: "B", position: 0, source_refs: [] },
      ],
      items: [],
    });
    expect(result).toEqual({ ok: false, status: 500, body: { error: "db exploded" } });
  });
});

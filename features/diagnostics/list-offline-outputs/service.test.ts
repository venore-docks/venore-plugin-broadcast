import { beforeEach, describe, expect, it, vi } from "vitest";

const findOutputLastSeenRows = vi.fn();
vi.mock("./store", () => ({
  findOutputLastSeenRows: (...args: unknown[]) => findOutputLastSeenRows(...args),
}));

describe("listOfflineOutputs", () => {
  beforeEach(() => {
    findOutputLastSeenRows.mockReset();
    vi.useRealTimers();
  });

  it("excludes outputs that never reported (browserReportedAt null) — never opened, not offline", async () => {
    findOutputLastSeenRows.mockResolvedValue([{ outputId: "o1", outputName: "Recepção", browserReportedAt: null }]);

    const { listOfflineOutputs } = await import("./service");
    const result = await listOfflineOutputs();

    expect(result).toEqual({ success: true, data: [] });
  });

  it("excludes an output whose last report is within the offline threshold", async () => {
    findOutputLastSeenRows.mockResolvedValue([{ outputId: "o1", outputName: "Recepção", browserReportedAt: new Date(Date.now() - 30_000) }]);

    const { listOfflineOutputs } = await import("./service");
    const result = await listOfflineOutputs();

    expect(result).toEqual({ success: true, data: [] });
  });

  it("includes an output whose last report is older than the offline threshold, sorted longest-offline first", async () => {
    const now = Date.now();
    findOutputLastSeenRows.mockResolvedValue([
      { outputId: "o1", outputName: "Recepção", browserReportedAt: new Date(now - 6 * 60_000) },
      { outputId: "o2", outputName: "Catraca", browserReportedAt: new Date(now - 20 * 60_000) },
    ]);

    const { listOfflineOutputs } = await import("./service");
    const result = await listOfflineOutputs();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((entry) => entry.outputId)).toEqual(["o2", "o1"]);
    expect(result.data[0].outputName).toBe("Catraca");
  });
});

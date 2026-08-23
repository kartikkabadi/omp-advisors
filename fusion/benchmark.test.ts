import { describe, expect, test } from "bun:test";
import {
  compareReports,
  runBenchmark,
  stableStringify,
  summarize,
  type BenchmarkCase,
  type BenchmarkRunner,
  type RunReport,
} from "./benchmark";

const cases: BenchmarkCase[] = [
  { id: "sum", input: "sum 2 + 2" },
  { id: "reverse", input: "reverse 'abc'" },
];

function runner(
  score: number,
  durationMs: number,
  completedCandidates: number,
  errors: number,
): BenchmarkRunner {
  return () => ({ score, durationMs, completedCandidates, errors });
}

describe("compareReports", () => {
  test("improvement when fusion best score beats baseline", () => {
    const baseline: RunReport = { score: 0.5, durationMs: 10, completedCandidates: 1, errors: 0 };
    const fusion: RunReport = { score: 0.9, durationMs: 40, completedCandidates: 3, errors: 0 };
    const metrics = compareReports("sum", baseline, fusion);
    expect(metrics.caseId).toBe("sum");
    expect(metrics.baselineScore).toBe(0.5);
    expect(metrics.fusionBestScore).toBe(0.9);
    expect(metrics.improvement).toBeCloseTo(0.4);
    expect(metrics.improvementRatio).toBeCloseTo(0.8);
    expect(metrics.baselineDurationMs).toBe(10);
    expect(metrics.fusionDurationMs).toBe(40);
    expect(metrics.completedCandidates).toBe(3);
    expect(metrics.baselineErrors).toBe(0);
    expect(metrics.fusionErrors).toBe(0);
    expect(metrics.verdict).toBe("improved");
  });

  test("degraded when fusion best score falls below baseline", () => {
    const baseline: RunReport = { score: 0.8, durationMs: 10, completedCandidates: 1, errors: 0 };
    const fusion: RunReport = { score: 0.4, durationMs: 30, completedCandidates: 4, errors: 1 };
    const metrics = compareReports("reverse", baseline, fusion);
    expect(metrics.improvement).toBeCloseTo(-0.4);
    expect(metrics.improvementRatio).toBeCloseTo(-0.5);
    expect(metrics.completedCandidates).toBe(4);
    expect(metrics.baselineErrors).toBe(0);
    expect(metrics.fusionErrors).toBe(1);
    expect(metrics.verdict).toBe("degraded");
  });

  test("tied when both scores are equal", () => {
    const baseline: RunReport = { score: 0.6, durationMs: 10, completedCandidates: 1, errors: 0 };
    const fusion: RunReport = { score: 0.6, durationMs: 20, completedCandidates: 2, errors: 0 };
    expect(compareReports("sum", baseline, fusion).verdict).toBe("tied");
  });

  test("zero baseline score yields zero improvement ratio without division by zero", () => {
    const baseline: RunReport = { score: 0, durationMs: 10, completedCandidates: 1, errors: 0 };
    const fusion: RunReport = { score: 0.7, durationMs: 40, completedCandidates: 5, errors: 0 };
    const metrics = compareReports("sum", baseline, fusion);
    expect(metrics.improvement).toBeCloseTo(0.7);
    expect(metrics.improvementRatio).toBe(0);
    expect(metrics.verdict).toBe("improved");
  });

  test("reports baseline and fusion errors separately", () => {
    const baseline: RunReport = { score: 0.5, durationMs: 10, completedCandidates: 1, errors: 2 };
    const fusion: RunReport = { score: 0.9, durationMs: 40, completedCandidates: 3, errors: 1 };
    const metrics = compareReports("sum", baseline, fusion);
    expect(metrics.baselineErrors).toBe(2);
    expect(metrics.fusionErrors).toBe(1);
  });
});

describe("runBenchmark", () => {
  test("improved fusion: metrics and totals reflect the gain", async () => {
    const summary = await runBenchmark({
      cases,
      baseline: runner(0.5, 10, 1, 0),
      fusion: runner(0.9, 40, 3, 0),
    });
    expect(summary.cases).toHaveLength(2);
    for (const metrics of summary.cases) {
      expect(metrics.verdict).toBe("improved");
      expect(metrics.improvement).toBeCloseTo(0.4);
      expect(metrics.fusionDurationMs).toBe(40);
      expect(metrics.completedCandidates).toBe(3);
    }
    expect(summary.totals.cases).toBe(2);
    expect(summary.totals.improved).toBe(2);
    expect(summary.totals.tied).toBe(0);
    expect(summary.totals.degraded).toBe(0);
    expect(summary.totals.averageImprovement).toBeCloseTo(0.4);
    expect(summary.totals.totalBaselineDurationMs).toBe(20);
    expect(summary.totals.totalFusionDurationMs).toBe(80);
    expect(summary.totals.totalCompletedCandidates).toBe(6);
    expect(summary.totals.totalBaselineErrors).toBe(0);
    expect(summary.totals.totalFusionErrors).toBe(0);
    expect(summary.totals.totalErrors).toBe(0);
  });

  test("degraded fusion: totals classify losses", async () => {
    const summary = await runBenchmark({
      cases,
      baseline: runner(0.8, 10, 1, 0),
      fusion: runner(0.3, 30, 2, 2),
    });
    expect(summary.cases).toHaveLength(2);
    for (const metrics of summary.cases) {
      expect(metrics.verdict).toBe("degraded");
      expect(metrics.improvement).toBeCloseTo(-0.5);
    }
    expect(summary.totals.degraded).toBe(2);
    expect(summary.totals.improved).toBe(0);
    expect(summary.totals.totalBaselineErrors).toBe(0);
    expect(summary.totals.totalFusionErrors).toBe(4);
    expect(summary.totals.totalErrors).toBe(4);
    expect(summary.totals.averageImprovement).toBeCloseTo(-0.5);
  });

  test("mixed cases classify per case and aggregate correctly", async () => {
    const mixedFusion: BenchmarkRunner = (input) => {
      if (input === "sum 2 + 2") {
        return { score: 0.9, durationMs: 40, completedCandidates: 3, errors: 0 };
      }
      return { score: 0.2, durationMs: 30, completedCandidates: 2, errors: 1 };
    };
    const summary = await runBenchmark({
      cases,
      baseline: runner(0.5, 10, 1, 0),
      fusion: mixedFusion,
    });
    expect(summary.cases[0].verdict).toBe("improved");
    expect(summary.cases[1].verdict).toBe("degraded");
    expect(summary.totals.improved).toBe(1);
    expect(summary.totals.degraded).toBe(1);
    expect(summary.totals.tied).toBe(0);
    expect(summary.totals.totalBaselineErrors).toBe(0);
    expect(summary.totals.totalFusionErrors).toBe(1);
    expect(summary.totals.totalErrors).toBe(1);
    expect(summary.totals.totalCompletedCandidates).toBe(5);
  });

  test("aborted signal skips all cases and yields an empty summary", async () => {
    const controller = new AbortController();
    controller.abort();
    const summary = await runBenchmark({
      cases,
      baseline: runner(0.5, 10, 1, 0),
      fusion: runner(0.9, 40, 3, 0),
      signal: controller.signal,
    });
    expect(summary.cases).toHaveLength(0);
    expect(summary.totals).toEqual({
      cases: 0,
      improved: 0,
      tied: 0,
      degraded: 0,
      averageImprovement: 0,
      totalBaselineDurationMs: 0,
      totalFusionDurationMs: 0,
      totalCompletedCandidates: 0,
      totalBaselineErrors: 0,
      totalFusionErrors: 0,
      totalErrors: 0,
    });
  });

  test("the same signal is threaded into both runners", async () => {
    const controller = new AbortController();
    let baselineSignal: AbortSignal | undefined;
    let fusionSignal: AbortSignal | undefined;
    const baseline: BenchmarkRunner = (_input, signal) => {
      baselineSignal = signal;
      return { score: 0.5, durationMs: 10, completedCandidates: 1, errors: 0 };
    };
    const fusion: BenchmarkRunner = (_input, signal) => {
      fusionSignal = signal;
      return { score: 0.9, durationMs: 40, completedCandidates: 3, errors: 0 };
    };
    await runBenchmark({ cases, baseline, fusion, signal: controller.signal });
    expect(baselineSignal).toBe(controller.signal);
    expect(fusionSignal).toBe(controller.signal);
  });

  test("empty case list yields zeroed totals", async () => {
    const summary = await runBenchmark({
      cases: [],
      baseline: runner(0.5, 10, 1, 0),
      fusion: runner(0.9, 40, 3, 0),
    });
    expect(summary.cases).toHaveLength(0);
    expect(summary.totals.cases).toBe(0);
    expect(summary.totals.averageImprovement).toBe(0);
  });

  test("async baseline and fusion runners are awaited", async () => {
    const asyncBaseline: BenchmarkRunner = (_input, _signal) =>
      Promise.resolve().then(() => ({
        score: 0.5,
        durationMs: 10,
        completedCandidates: 1,
        errors: 0,
      }));
    const asyncFusion: BenchmarkRunner = (_input, _signal) =>
      Promise.resolve().then(() => ({
        score: 0.9,
        durationMs: 40,
        completedCandidates: 3,
        errors: 0,
      }));
    const summary = await runBenchmark({
      cases,
      baseline: asyncBaseline,
      fusion: asyncFusion,
    });
    expect(summary.cases).toHaveLength(2);
    for (const metrics of summary.cases) {
      expect(metrics.verdict).toBe("improved");
      expect(metrics.baselineScore).toBe(0.5);
      expect(metrics.fusionBestScore).toBe(0.9);
      expect(metrics.completedCandidates).toBe(3);
    }
    expect(summary.totals.totalFusionDurationMs).toBe(80);
    expect(summary.totals.totalCompletedCandidates).toBe(6);
  });

  test("baseline and fusion errors are counted separately in totals", async () => {
    const erroredBaseline = runner(0.5, 10, 1, 2);
    const erroredFusion: BenchmarkRunner = (input) =>
      input === "sum 2 + 2"
        ? { score: 0.9, durationMs: 40, completedCandidates: 3, errors: 0 }
        : { score: 0.2, durationMs: 30, completedCandidates: 2, errors: 1 };
    const summary = await runBenchmark({
      cases,
      baseline: erroredBaseline,
      fusion: erroredFusion,
    });
    for (const metrics of summary.cases) {
      expect(metrics.baselineErrors).toBe(2);
    }
    expect(summary.cases[0].fusionErrors).toBe(0);
    expect(summary.cases[1].fusionErrors).toBe(1);
    expect(summary.totals.totalBaselineErrors).toBe(4);
    expect(summary.totals.totalFusionErrors).toBe(1);
    expect(summary.totals.totalErrors).toBe(5);
  });
});

describe("summarize", () => {
  test("aggregates a hand-built metrics list", () => {
    const metrics = [
      compareReports("a", { score: 0.5, durationMs: 10, completedCandidates: 1, errors: 0 }, { score: 0.9, durationMs: 40, completedCandidates: 3, errors: 0 }),
      compareReports("b", { score: 0.5, durationMs: 10, completedCandidates: 1, errors: 0 }, { score: 0.4, durationMs: 20, completedCandidates: 2, errors: 1 }),
      compareReports("c", { score: 0.5, durationMs: 10, completedCandidates: 1, errors: 0 }, { score: 0.5, durationMs: 20, completedCandidates: 2, errors: 0 }),
    ];
    const totals = summarize(metrics);
    expect(totals.improved).toBe(1);
    expect(totals.degraded).toBe(1);
    expect(totals.tied).toBe(1);
    expect(totals.averageImprovement).toBeCloseTo((0.4 - 0.1 + 0) / 3);
    expect(totals.totalCompletedCandidates).toBe(7);
    expect(totals.totalBaselineErrors).toBe(0);
    expect(totals.totalFusionErrors).toBe(1);
    expect(totals.totalErrors).toBe(1);
  });
});

describe("stableStringify", () => {
  test("sorts object keys for canonical output", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  test("handles nested objects and arrays recursively", () => {
    expect(stableStringify({ x: [{ b: 1, a: [2, 3] }], z: "v" })).toBe(
      '{"x":[{"a":[2,3],"b":1}],"z":"v"}',
    );
  });

  test("maps undefined to null instead of dropping it", () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"a":null,"b":1}');
  });

  test("serializes primitives directly", () => {
    expect(stableStringify("text")).toBe('"text"');
    expect(stableStringify(3.5)).toBe("3.5");
    expect(stableStringify(true)).toBe("true");
    expect(stableStringify(null)).toBe("null");
  });

  test("throws a TypeError for values with no JSON representation", () => {
    expect(() => stableStringify(() => {})).toThrow(TypeError);
    expect(() => stableStringify(Symbol("x"))).toThrow(TypeError);
  });

  test("is stable and round-trips for a full benchmark summary", async () => {
    const summary = await runBenchmark({
      cases,
      baseline: runner(0.5, 10, 1, 0),
      fusion: runner(0.9, 40, 3, 0),
    });
    const json1 = stableStringify(summary);
    const json2 = stableStringify(summary);
    expect(json1).toBe(json2);
    expect(JSON.parse(json1)).toEqual(summary);
  });

  test("identical summaries serialize identically regardless of key insertion order", () => {
    const json = stableStringify({ a: 1, b: { z: 2, y: 3 } });
    const reordered = stableStringify({ b: { y: 3, z: 2 }, a: 1 });
    expect(json).toBe(reordered);
  });
});

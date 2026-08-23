import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MAX_CANDIDATES,
  MAX_CANDIDATES,
  MIN_CANDIDATES,
  runFusion,
  type FusionCandidate,
  type FusionDependencies,
  type FusionJudgement,
} from "./core";

interface DepsConfig {
  /** Per-candidate run result: answer text or an Error to reject with. */
  runs: Array<string | Error>;
  /** Per-candidate judge result: 0..1 score or an Error to reject with. */
  judges: Array<number | Error>;
  /** Per-judge evidence notes. */
  evidence?: string[][];
  /** Per-judge dissent notes. */
  dissent?: string[][];
  /** Called after each candidate run, before judging. */
  onRun?: (candidateId: string, index: number) => void;
}

function makeDeps(config: DepsConfig): FusionDependencies {
  let runCount = 0;
  let judgeCount = 0;
  return {
    async runCandidate(_prompt: string, candidateId: string) {
      const spec = config.runs[runCount] ?? config.runs[config.runs.length - 1];
      runCount += 1;
      config.onRun?.(candidateId, runCount - 1);
      if (spec instanceof Error) {
        throw spec;
      }
      return spec;
    },
    async judge(_prompt: string, candidate: FusionCandidate) {
      const spec = config.judges[judgeCount] ?? config.judges[config.judges.length - 1];
      judgeCount += 1;
      if (spec instanceof Error) {
        throw spec;
      }
      return {
        score: spec,
        evidence: config.evidence?.[judgeCount - 1],
        dissent: config.dissent?.[judgeCount - 1],
      } satisfies FusionJudgement;
    },
  };
}

describe("runFusion", () => {
  test("stops on quality threshold after the minimum candidate count and retains evidence and dissent", async () => {
    const deps = makeDeps({
      runs: ["a", "b"],
      judges: [0.6, 0.95],
      evidence: [["e0"], ["e1", "e2"]],
      dissent: [["d0"], ["d1"]],
    });

    const result = await runFusion("prompt", { maxCandidates: 4 }, deps);

    expect(result.stopReason).toBe("threshold");
    expect(result.candidatesRun).toBe(2);
    expect(result.best).toEqual({ id: "candidate-1", output: "b" });
    expect(result.bestScore).toBe(0.95);
    expect(result.scores).toEqual({ "candidate-0": 0.6, "candidate-1": 0.95 });
    expect(result.evidence).toEqual([
      { candidateId: "candidate-0", note: "e0" },
      { candidateId: "candidate-1", note: "e1" },
      { candidateId: "candidate-1", note: "e2" },
    ]);
    expect(result.dissent).toEqual([
      { candidateId: "candidate-0", note: "d0" },
      { candidateId: "candidate-1", note: "d1" },
    ]);
    expect(result.failures).toEqual([]);
  });

  test("stops when marginal gain over the incumbent best is at or below threshold", async () => {
    const deps = makeDeps({ runs: ["a", "b", "c"], judges: [0.5, 0.8, 0.82] });

    const result = await runFusion(
      "prompt",
      { maxCandidates: 4, qualityThreshold: 0.9, marginalGainThreshold: 0.05 },
      deps,
    );

    expect(result.stopReason).toBe("marginal-gain");
    expect(result.candidatesRun).toBe(3);
    expect(result.best?.id).toBe("candidate-2");
    expect(result.bestScore).toBe(0.82);
    expect(result.candidates.map((c) => c.id)).toEqual(["candidate-0", "candidate-1", "candidate-2"]);
  });

  test("yields zero marginal gain when a worse candidate follows the incumbent", async () => {
    const deps = makeDeps({ runs: ["a", "b"], judges: [0.8, 0.5] });

    const result = await runFusion(
      "prompt",
      { maxCandidates: 4, qualityThreshold: 0.9, marginalGainThreshold: 0.05 },
      deps,
    );

    expect(result.stopReason).toBe("marginal-gain");
    expect(result.candidatesRun).toBe(2);
    expect(result.best?.id).toBe("candidate-0");
    expect(result.bestScore).toBe(0.8);
  });

  test("keeps going when a candidate improves the incumbent best by more than the marginal-gain threshold", async () => {
    const deps = makeDeps({ runs: ["a", "b", "c", "d"], judges: [0.5, 0.8, 0.86, 0.92] });

    const result = await runFusion(
      "prompt",
      { maxCandidates: 4, qualityThreshold: 0.99, marginalGainThreshold: 0.05 },
      deps,
    );

    expect(result.stopReason).toBe("budget");
    expect(result.candidatesRun).toBe(4);
    expect(result.best?.id).toBe("candidate-3");
    expect(result.bestScore).toBe(0.92);
  });

  test("exhausts the candidate budget when no stopping rule fires", async () => {
    const deps = makeDeps({ runs: ["a", "b", "c", "d"], judges: [0.3, 0.4, 0.5, 0.6] });

    const result = await runFusion(
      "prompt",
      { maxCandidates: 4, minCandidates: 2, qualityThreshold: 0.9, marginalGainThreshold: 0 },
      deps,
    );

    expect(result.stopReason).toBe("budget");
    expect(result.candidatesRun).toBe(4);
    expect(result.best?.id).toBe("candidate-3");
    expect(result.bestScore).toBe(0.6);
    expect(result.scores).toEqual({ "candidate-0": 0.3, "candidate-1": 0.4, "candidate-2": 0.5, "candidate-3": 0.6 });
  });

  test("captures candidate run failures and keeps going", async () => {
    const deps = makeDeps({
      runs: ["a", new Error("run boom"), "c", "d"],
      judges: [0.5, 0.6, 0.95],
    });

    const result = await runFusion("prompt", { maxCandidates: 4 }, deps);

    expect(result.stopReason).toBe("threshold");
    expect(result.candidatesRun).toBe(4);
    expect(result.failures).toEqual([{ candidateId: "candidate-1", phase: "run", error: "run boom" }]);
    expect(result.candidates.map((c) => c.id)).toEqual(["candidate-0", "candidate-2", "candidate-3"]);
    expect(result.scores).toEqual({ "candidate-0": 0.5, "candidate-2": 0.6, "candidate-3": 0.95 });
    expect(result.best?.id).toBe("candidate-3");
    expect(result.bestScore).toBe(0.95);
  });

  test("captures judge failures, keeps the candidate, and keeps going", async () => {
    const deps = makeDeps({
      runs: ["a", "b", "c"],
      judges: [0.5, new Error("judge boom"), 0.9],
    });

    const result = await runFusion("prompt", { maxCandidates: 4 }, deps);

    expect(result.stopReason).toBe("threshold");
    expect(result.failures).toEqual([{ candidateId: "candidate-1", phase: "judge", error: "judge boom" }]);
    expect(result.candidates.map((c) => c.id)).toEqual(["candidate-0", "candidate-1", "candidate-2"]);
    expect(result.scores).toEqual({ "candidate-0": 0.5, "candidate-2": 0.9 });
    expect(result.best?.id).toBe("candidate-2");
    expect(result.bestScore).toBe(0.9);
  });

  test("stops with partial results when the shared signal aborts mid-run", async () => {
    const controller = new AbortController();
    const deps = makeDeps({
      runs: ["a", "b"],
      judges: [0.5, 0.7],
      onRun: (candidateId) => {
        if (candidateId === "candidate-1") controller.abort();
      },
    });

    const result = await runFusion("prompt", { maxCandidates: 4, signal: controller.signal }, deps);

    expect(result.stopReason).toBe("aborted");
    expect(result.candidatesRun).toBe(2);
    expect(result.best?.id).toBe("candidate-0");
    expect(result.bestScore).toBe(0.5);
    expect(result.scores).toEqual({ "candidate-0": 0.5 });
    expect(result.candidates.map((c) => c.id)).toEqual(["candidate-0", "candidate-1"]);
    expect(result.failures).toEqual([]);
  });

  test("stops as aborted, not failed, when the runner rejects after the signal aborts", async () => {
    const controller = new AbortController();
    const deps: FusionDependencies = {
      async runCandidate() {
        controller.abort();
        throw new Error("aborted");
      },
      async judge(_prompt, candidate) {
        return { score: 1 };
      },
    };

    const result = await runFusion("prompt", { maxCandidates: 4, signal: controller.signal }, deps);

    expect(result.stopReason).toBe("aborted");
    expect(result.candidatesRun).toBe(1);
    expect(result.candidates).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.best).toBeNull();
  });

  test("stops as aborted, not failed, when the judge rejects after the signal aborts", async () => {
    const controller = new AbortController();
    const deps: FusionDependencies = {
      async runCandidate() {
        return "a";
      },
      async judge() {
        controller.abort();
        throw new Error("aborted");
      },
    };

    const result = await runFusion("prompt", { maxCandidates: 4, signal: controller.signal }, deps);

    expect(result.stopReason).toBe("aborted");
    expect(result.candidatesRun).toBe(1);
    expect(result.candidates.map((c) => c.id)).toEqual(["candidate-0"]);
    expect(result.scores).toEqual({});
    expect(result.failures).toEqual([]);
    expect(result.best).toBeNull();
  });

  test("returns an empty aborted result for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = makeDeps({ runs: ["a"], judges: [0.5] });

    const result = await runFusion("prompt", { maxCandidates: 4, signal: controller.signal }, deps);

    expect(result.stopReason).toBe("aborted");
    expect(result.candidatesRun).toBe(0);
    expect(result.best).toBeNull();
    expect(result.bestScore).toBeNull();
    expect(result.candidates).toEqual([]);
    expect(result.scores).toEqual({});
    expect(result.failures).toEqual([]);
  });

  test("treats a non-finite judge score as a judge failure and discards its notes", async () => {
    const deps = makeDeps({
      runs: ["a", "b", "c"],
      judges: [0.5, NaN, 0.7],
      evidence: [["e0"], ["e-discarded"], ["e2"]],
      dissent: [["d0"], ["d-discarded"], ["d2"]],
    });

    const result = await runFusion(
      "prompt",
      { maxCandidates: 3, qualityThreshold: 0.9, marginalGainThreshold: 0 },
      deps,
    );

    expect(result.stopReason).toBe("budget");
    expect(result.failures).toEqual([
      { candidateId: "candidate-1", phase: "judge", error: "judge returned non-finite score: NaN" },
    ]);
    expect(result.scores).toEqual({ "candidate-0": 0.5, "candidate-2": 0.7 });
    expect(result.candidates.map((c) => c.id)).toEqual(["candidate-0", "candidate-1", "candidate-2"]);
    expect(result.evidence).toEqual([
      { candidateId: "candidate-0", note: "e0" },
      { candidateId: "candidate-2", note: "e2" },
    ]);
    expect(result.dissent).toEqual([
      { candidateId: "candidate-0", note: "d0" },
      { candidateId: "candidate-2", note: "d2" },
    ]);
  });

  test("clamps candidate counts and thresholds to their allowed ranges", async () => {
    const deps = makeDeps({
      runs: ["a", "b", "c", "d", "e", "f", "g", "h"],
      judges: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    });

    const result = await runFusion(
      "prompt",
      { maxCandidates: 100, minCandidates: 0, qualityThreshold: 0.9, marginalGainThreshold: 0 },
      deps,
    );

    expect(result.stopReason).toBe("budget");
    expect(result.candidatesRun).toBe(8);
    expect(result.candidates).toHaveLength(8);
  });

  test("clamps a minimum below MIN_CANDIDATES up to the hard floor", async () => {
    const deps = makeDeps({
      runs: ["a", "b"],
      judges: [0.95, 0.95],
    });

    const result = await runFusion(
      "prompt",
      { maxCandidates: 4, minCandidates: 1, qualityThreshold: 0.9 },
      deps,
    );

    expect(result.stopReason).toBe("threshold");
    expect(result.candidatesRun).toBe(2);
  });

  test("clamps a minimum above the budget down to the budget", async () => {
    const deps = makeDeps({ runs: ["a", "b"], judges: [1, 1] });

    const result = await runFusion(
      "prompt",
      { maxCandidates: 2, minCandidates: 5, qualityThreshold: 1.2 },
      deps,
    );

    expect(result.stopReason).toBe("threshold");
    expect(result.candidatesRun).toBe(2);
    expect(result.bestScore).toBe(1);
  });

  test("uses default bounds when options are omitted", async () => {
    const deps = makeDeps({
      runs: ["a", "b", "c", "d", "e"],
      judges: [0.2, 0.25, 0.3, 0.35, 0.4],
    });

    const result = await runFusion("prompt", {}, deps);

    expect(result.stopReason).toBe("budget");
    expect(result.candidatesRun).toBe(DEFAULT_MAX_CANDIDATES);
  });

  test("exports the candidate count bounds", () => {
    expect(MIN_CANDIDATES).toBe(2);
    expect(MAX_CANDIDATES).toBe(8);
    expect(DEFAULT_MAX_CANDIDATES).toBe(4);
  });

  test("delivers progress events and reports the terminal stop reason", async () => {
    const phases: string[] = [];
    const deps = makeDeps({ runs: ["a", "b"], judges: [0.6, 0.95] });

    const result = await runFusion(
      "prompt",
      { maxCandidates: 4, onProgress: (p) => phases.push(p.phase) },
      deps,
    );

    expect(result.progress.map((p) => p.phase)).toEqual(["started", "completed", "started", "completed", "done"]);
    expect(phases).toEqual(result.progress.map((p) => p.phase));
    expect(result.progress[0]).toMatchObject({
      candidateIndex: 0,
      candidateId: "candidate-0",
      phase: "started",
      score: null,
      bestScore: null,
      stopReason: null,
    });
    const done = result.progress[result.progress.length - 1];
    expect(done).toMatchObject({ phase: "done", candidateId: null, stopReason: "threshold" });
  });
});

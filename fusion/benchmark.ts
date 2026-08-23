/**
 * Deterministic benchmark harness comparing a single baseline candidate
 * against a bounded fusion run, over injected cases and runners.
 *
 * Everything is injected: cases, baseline runner, and fusion runner. There is
 * no CLI parsing, no network, no filesystem access, and no random input.
 * Runners report their own duration, so results are reproducible.
 */

/** A deterministic benchmark case. */
export interface BenchmarkCase {
  /** Stable identifier used in metrics output. */
  id: string;
  /** The input handed to each runner. */
  input: string;
}

/** Outcome reported by a runner for a single case. */
export interface RunReport {
  /** Best judged score in [0, 1] produced across whatever the runner ran. */
  score: number;
  /** Wall-clock duration reported by the runner, in milliseconds. */
  durationMs: number;
  /** Number of candidates completed (baseline: 1, fusion: bounded count). */
  completedCandidates: number;
  /** Number of candidate runs that errored. */
  errors: number;
}

/**
 * A runner executes one case and reports its outcome.
 * - baseline: runs a single candidate and reports its score.
 * - fusion:   runs a bounded fusion and reports its best score.
 * The caller binds the real implementation in a closure; the benchmark never
 * reaches into the underlying implementation. Runners may be synchronous or
 * asynchronous; `runBenchmark` awaits both before comparing.
 */
export type BenchmarkRunner = (
  input: string,
  signal: AbortSignal,
) => RunReport | Promise<RunReport>;

/** Per-case comparison between the baseline and the fusion outcome. */
export interface CaseMetrics {
  caseId: string;
  /** Score of the single baseline candidate. */
  baselineScore: number;
  /** Best score the fusion produced across its completed candidates. */
  fusionBestScore: number;
  /** fusionBestScore minus baselineScore. */
  improvement: number;
  /** improvement divided by baselineScore; 0 when baselineScore is 0. */
  improvementRatio: number;
  /** Duration reported by the baseline runner, in milliseconds. */
  baselineDurationMs: number;
  /** Duration reported by the fusion runner, in milliseconds. */
  fusionDurationMs: number;
  /** Number of candidates the fusion completed. */
  completedCandidates: number;
  /** Candidate runs the baseline reported as errored. */
  baselineErrors: number;
  /** Candidate runs the fusion reported as errored. */
  fusionErrors: number;
  /** Classification of the improvement. */
  verdict: "improved" | "tied" | "degraded";
}

/** Aggregates over all benchmarked cases. */
export interface BenchmarkTotals {
  /** Number of cases that ran to completion. */
  cases: number;
  /** Cases where the fusion best score beat the baseline. */
  improved: number;
  /** Cases where the fusion best score matched the baseline. */
  tied: number;
  /** Cases where the fusion best score fell below the baseline. */
  degraded: number;
  /** Mean of per-case improvement (0 when there are no cases). */
  averageImprovement: number;
  totalBaselineDurationMs: number;
  totalFusionDurationMs: number;
  totalCompletedCandidates: number;
  /** Candidate errors reported across all baseline runs. */
  totalBaselineErrors: number;
  /** Candidate errors reported across all fusion runs. */
  totalFusionErrors: number;
  /** totalBaselineErrors plus totalFusionErrors. */
  totalErrors: number;
}

/** Full benchmark output: per-case metrics plus aggregates. */
export interface BenchmarkSummary {
  cases: CaseMetrics[];
  totals: BenchmarkTotals;
}

/** Configuration for a benchmark run. */
export interface BenchmarkOptions {
  cases: BenchmarkCase[];
  /** Runner producing the single-candidate baseline outcome per case. */
  baseline: BenchmarkRunner;
  /** Runner producing the bounded-fusion outcome per case. */
  fusion: BenchmarkRunner;
  /**
   * Optional signal threaded into every runner. When it is already aborted,
   * no case runs and the benchmark returns an empty summary. Aborting during
   * a run only takes effect between cases.
   */
  signal?: AbortSignal;
}

/**
 * Pure comparison of one baseline report against one fusion report.
 * Exported so callers can compare without running the harness.
 */
export function compareReports(
  caseId: string,
  baseline: RunReport,
  fusion: RunReport,
): CaseMetrics {
  const improvement = fusion.score - baseline.score;
  const improvementRatio =
    baseline.score === 0 ? 0 : improvement / baseline.score;
  const verdict: CaseMetrics["verdict"] =
    improvement > 0 ? "improved" : improvement < 0 ? "degraded" : "tied";
  return {
    caseId,
    baselineScore: baseline.score,
    fusionBestScore: fusion.score,
    improvement,
    improvementRatio,
    baselineDurationMs: baseline.durationMs,
    fusionDurationMs: fusion.durationMs,
    completedCandidates: fusion.completedCandidates,
    baselineErrors: baseline.errors,
    fusionErrors: fusion.errors,
    verdict,
  };
}

/** Aggregate a list of per-case metrics into totals. */
export function summarize(metrics: CaseMetrics[]): BenchmarkTotals {
  let improved = 0;
  let tied = 0;
  let degraded = 0;
  let improvementSum = 0;
  let totalBaselineDurationMs = 0;
  let totalFusionDurationMs = 0;
  let totalCompletedCandidates = 0;
  let totalBaselineErrors = 0;
  let totalFusionErrors = 0;
  for (const metric of metrics) {
    if (metric.verdict === "improved") {
      improved += 1;
    } else if (metric.verdict === "degraded") {
      degraded += 1;
    } else {
      tied += 1;
    }
    improvementSum += metric.improvement;
    totalBaselineDurationMs += metric.baselineDurationMs;
    totalFusionDurationMs += metric.fusionDurationMs;
    totalCompletedCandidates += metric.completedCandidates;
    totalBaselineErrors += metric.baselineErrors;
    totalFusionErrors += metric.fusionErrors;
  }
  return {
    cases: metrics.length,
    improved,
    tied,
    degraded,
    averageImprovement: metrics.length === 0 ? 0 : improvementSum / metrics.length,
    totalBaselineDurationMs,
    totalFusionDurationMs,
    totalCompletedCandidates,
    totalBaselineErrors,
    totalFusionErrors,
    totalErrors: totalBaselineErrors + totalFusionErrors,
  };
}

/**
 * Run the benchmark: execute the baseline and the fusion runner for every
 * case (unless the signal is already aborted), compare, and aggregate.
 * Runners may be synchronous or asynchronous; both are awaited before
 * comparison.
 */
export async function runBenchmark(
  options: BenchmarkOptions,
): Promise<BenchmarkSummary> {
  const signal = options.signal ?? new AbortController().signal;
  const metrics: CaseMetrics[] = [];
  for (const testCase of options.cases) {
    if (signal.aborted) {
      break;
    }
    const [baseline, fusion] = await Promise.all([
      options.baseline(testCase.input, signal),
      options.fusion(testCase.input, signal),
    ]);
    metrics.push(compareReports(testCase.id, baseline, fusion));
  }
  return { cases: metrics, totals: summarize(metrics) };
}

/**
 * Canonical JSON serializer: recursively sorts object keys and maps
 * `undefined` to `null`, so identical values always produce identical output.
 * Unlike `JSON.stringify`, object fields set to `undefined` are kept (as
 * `null`) instead of being silently dropped.
 *
 * Returns valid JSON for every supported value: `null`, booleans, numbers,
 * strings, arrays, and plain objects of those (plus `undefined`, serialized
 * as `null`). Values with no JSON representation (functions, symbols, and
 * bigints) throw a `TypeError`.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    if (
      typeof value === "function" ||
      typeof value === "symbol" ||
      typeof value === "bigint"
    ) {
      throw new TypeError(
        `stableStringify: ${typeof value} has no JSON representation`,
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`,
  );
  return `{${parts.join(",")}}`;
}

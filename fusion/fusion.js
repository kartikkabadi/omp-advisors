// fusion/core.ts
var MIN_CANDIDATES = 2;
var MAX_CANDIDATES = 8;
var DEFAULT_MAX_CANDIDATES = 4;
var DEFAULT_MIN_CANDIDATES = MIN_CANDIDATES;
var DEFAULT_QUALITY_THRESHOLD = 0.9;
var DEFAULT_MARGINAL_GAIN_THRESHOLD = 0.02;
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
function normalizeOptions(options) {
  const maxCandidates = clamp(Math.trunc(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES), MIN_CANDIDATES, MAX_CANDIDATES);
  const minCandidates = clamp(Math.trunc(options.minCandidates ?? DEFAULT_MIN_CANDIDATES), MIN_CANDIDATES, maxCandidates);
  const qualityThreshold = clamp(options.qualityThreshold ?? DEFAULT_QUALITY_THRESHOLD, 0, 1);
  const marginalGainThreshold = clamp(options.marginalGainThreshold ?? DEFAULT_MARGINAL_GAIN_THRESHOLD, 0, 1);
  return {
    minCandidates,
    maxCandidates,
    qualityThreshold,
    marginalGainThreshold,
    signal: options.signal,
    onProgress: options.onProgress
  };
}
async function runFusion(prompt, options, dependencies) {
  const opts = normalizeOptions(options);
  const { runCandidate, judge } = dependencies;
  const candidates = [];
  const scores = {};
  const evidence = [];
  const dissent = [];
  const failures = [];
  const progress = [];
  let best = null;
  let bestScore = null;
  let stopReason = null;
  let candidatesRun = 0;
  const emit = (event) => {
    progress.push(event);
    opts.onProgress?.(event);
  };
  for (let i = 0;i < opts.maxCandidates; i++) {
    if (opts.signal?.aborted) {
      stopReason = "aborted";
      break;
    }
    const candidateId = `candidate-${i}`;
    candidatesRun = i + 1;
    emit({
      candidateIndex: i,
      candidateId,
      phase: "started",
      score: null,
      bestScore,
      error: null,
      stopReason: null
    });
    let output;
    try {
      output = await runCandidate(prompt, candidateId, opts.signal);
    } catch (err) {
      if (opts.signal?.aborted) {
        stopReason = "aborted";
        break;
      }
      const error = errorMessage(err);
      failures.push({ candidateId, phase: "run", error });
      emit({ candidateIndex: i, candidateId, phase: "failed", score: null, bestScore, error, stopReason: null });
      continue;
    }
    const candidate = { id: candidateId, output };
    candidates.push(candidate);
    if (opts.signal?.aborted) {
      stopReason = "aborted";
      break;
    }
    let judgement;
    try {
      judgement = await judge(prompt, candidate, opts.signal);
    } catch (err) {
      if (opts.signal?.aborted) {
        stopReason = "aborted";
        break;
      }
      const error = errorMessage(err);
      failures.push({ candidateId, phase: "judge", error });
      emit({ candidateIndex: i, candidateId, phase: "failed", score: null, bestScore, error, stopReason: null });
      continue;
    }
    if (!Number.isFinite(judgement.score)) {
      const error = `judge returned non-finite score: ${String(judgement.score)}`;
      failures.push({ candidateId, phase: "judge", error });
      emit({ candidateIndex: i, candidateId, phase: "failed", score: null, bestScore, error, stopReason: null });
      continue;
    }
    const score = clamp(judgement.score, 0, 1);
    scores[candidateId] = score;
    for (const note of judgement.evidence ?? []) {
      evidence.push({ candidateId, note });
    }
    for (const note of judgement.dissent ?? []) {
      dissent.push({ candidateId, note });
    }
    const previousBest = bestScore;
    if (bestScore === null || score > bestScore) {
      best = candidate;
      bestScore = score;
    }
    const completed = i + 1;
    if (completed >= opts.minCandidates) {
      if (bestScore >= opts.qualityThreshold) {
        stopReason = "threshold";
      } else if (previousBest !== null && bestScore - previousBest <= opts.marginalGainThreshold) {
        stopReason = "marginal-gain";
      }
    }
    emit({
      candidateIndex: i,
      candidateId,
      phase: "completed",
      score,
      bestScore,
      error: null,
      stopReason
    });
    if (stopReason !== null) {
      break;
    }
  }
  if (stopReason === null) {
    stopReason = "budget";
  }
  emit({
    candidateIndex: candidatesRun,
    candidateId: null,
    phase: "done",
    score: null,
    bestScore,
    error: null,
    stopReason
  });
  return {
    stopReason,
    best,
    bestScore,
    candidates,
    scores,
    evidence,
    dissent,
    failures,
    candidatesRun,
    progress
  };
}

// fusion/index.ts
var NATIVE_EXEC_TIMEOUT_MS = 120000;
var COUNT_FLAGS = { min: true, max: true };
var RANGE_FLAGS = { quality: true, marginal: true };
function parseFusionArgs(input) {
  const tokens = input.trim().split(/\s+/).filter((token) => token.length > 0);
  const promptParts = [];
  const options = {};
  const seen = new Set;
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith("--")) {
      promptParts.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
    let value = eq === -1 ? undefined : token.slice(eq + 1);
    if (value === undefined) {
      const next = tokens[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        i += 1;
      }
    }
    if (seen.has(name)) {
      return { error: `duplicate flag --${name}` };
    }
    seen.add(name);
    const flagError = applyFlag(name, value, options);
    if (flagError !== null) {
      return { error: flagError };
    }
  }
  if (options.minCandidates !== undefined && options.maxCandidates !== undefined && options.minCandidates > options.maxCandidates) {
    return {
      error: `--min (${options.minCandidates}) exceeds --max (${options.maxCandidates})`
    };
  }
  return { prompt: promptParts.join(" "), options };
}
function applyFlag(name, raw, options) {
  if (raw === undefined || raw === "") {
    return `flag --${name} requires a value`;
  }
  if (COUNT_FLAGS[name] === true) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < MIN_CANDIDATES || value > MAX_CANDIDATES) {
      return `--${name} must be an integer between ${MIN_CANDIDATES} and ${MAX_CANDIDATES}`;
    }
    if (name === "min") {
      options.minCandidates = value;
    } else {
      options.maxCandidates = value;
    }
    return null;
  }
  if (RANGE_FLAGS[name] === true) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return `--${name} must be a number between 0 and 1`;
    }
    if (name === "quality") {
      options.qualityThreshold = value;
    } else {
      options.marginalGainThreshold = value;
    }
    return null;
  }
  return `unknown flag --${name}`;
}
function formatScore(score) {
  return score === null ? "?" : score.toFixed(2);
}
function reportProgress(ui, progress) {
  const label = progress.candidateId ?? `attempt ${progress.candidateIndex}`;
  switch (progress.phase) {
    case "started":
      ui.setStatus("fusion", `fusion: ${label} running`);
      break;
    case "completed":
      ui.setStatus("fusion", `fusion: ${label} scored ${formatScore(progress.score)} (best ${formatScore(progress.bestScore)})`);
      break;
    case "failed":
      ui.setStatus("fusion", `fusion: ${label} failed${progress.error ? `: ${progress.error}` : ""}`);
      break;
    case "done":
      ui.setStatus("fusion", undefined);
      break;
  }
}
function sendResult(pi, ctx, prompt, result) {
  const outcome = result.bestScore === null ? "no usable answer" : `best score ${formatScore(result.bestScore)}`;
  const type = result.stopReason === "aborted" ? "warning" : "info";
  ctx.ui.notify(`Fusion finished: ${result.stopReason} (${outcome}, ${result.candidatesRun} candidate(s) run)`, type);
  pi.sendMessage({
    customType: "fusion.result",
    content: result.best?.output ?? "No candidate produced a usable answer.",
    display: true,
    details: {
      prompt,
      stopReason: result.stopReason,
      bestScore: result.bestScore,
      candidatesRun: result.candidatesRun,
      candidates: result.candidates,
      scores: result.scores,
      evidence: result.evidence,
      dissent: result.dissent,
      failures: result.failures
    }
  });
}
function nativeRunCandidate(exec) {
  return async (prompt, _candidateId, signal) => {
    const result = await exec("pi", ["--mode", "text", "-p", "--no-session", prompt], { signal, timeout: NATIVE_EXEC_TIMEOUT_MS });
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || `pi exited with code ${result.code}`);
    }
    return result.stdout.trim();
  };
}
var JUDGE_RUBRIC = `Score the candidate answer below on quality from 0 to 1.
Reply with a single JSON object, no commentary:
{"score": <number 0..1>, "evidence": ["<supporting observation>", ...], "dissent": ["<dissenting observation>", ...]}`;
function nativeJudge(exec) {
  return async (prompt, candidate, signal) => {
    const rubric = `${JUDGE_RUBRIC}

PROMPT:
${prompt}

CANDIDATE:
${candidate.output}`;
    const result = await exec("pi", ["--mode", "text", "-p", "--no-session", rubric], {
      signal,
      timeout: NATIVE_EXEC_TIMEOUT_MS
    });
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || `pi exited with code ${result.code}`);
    }
    return parseJudgement(result.stdout);
  };
}
function parseJudgement(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const body = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { score: NaN };
  }
  return {
    score: typeof parsed.score === "number" ? parsed.score : NaN,
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.filter((note) => typeof note === "string") : undefined,
    dissent: Array.isArray(parsed.dissent) ? parsed.dissent.filter((note) => typeof note === "string") : undefined
  };
}
function createExtension(deps = {}) {
  return (pi) => {
    const exec = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
    const runCandidate = deps.runCandidate ?? nativeRunCandidate(exec);
    const judge = deps.judge ?? nativeJudge(exec);
    const runner = deps.runFusion ?? runFusion;
    let activeController = null;
    let running = false;
    pi.on("session_shutdown", () => {
      activeController?.abort();
    });
    pi.registerCommand("fusion", {
      description: "Run bounded fusion: generate 2..8 candidates for the prompt, score each, and report the best answer with evidence and dissent. Flags: --min N, --max N, --quality N, --marginal N.",
      handler: async (args, ctx) => {
        if (running) {
          ctx.ui.notify("A fusion run is already in progress; wait for it to finish.", "warning");
          return;
        }
        const parsed = parseFusionArgs(args);
        if ("error" in parsed) {
          ctx.ui.notify(`Invalid fusion arguments: ${parsed.error}`, "error");
          return;
        }
        if (parsed.prompt === "") {
          ctx.ui.notify("Usage: /fusion <prompt> [--min N] [--max N] [--quality N] [--marginal N]", "error");
          return;
        }
        const controller = new AbortController;
        activeController = controller;
        running = true;
        const options = {
          ...parsed.options,
          signal: controller.signal,
          onProgress: (progress) => reportProgress(ctx.ui, progress)
        };
        ctx.ui.notify(`Fusion started: running up to ${options.maxCandidates ?? DEFAULT_MAX_CANDIDATES} candidates`, "info");
        try {
          const result = await runner(parsed.prompt, options, { runCandidate, judge });
          sendResult(pi, ctx, parsed.prompt, result);
        } catch (error) {
          if (controller.signal.aborted) {
            ctx.ui.notify("Fusion aborted.", "warning");
          } else {
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(`Fusion failed: ${message}`, "error");
          }
        } finally {
          running = false;
          activeController = null;
          ctx.ui.setStatus("fusion", undefined);
        }
      }
    });
  };
}
var fusion_default = createExtension();
export {
  parseFusionArgs,
  fusion_default as default,
  createExtension,
  NATIVE_EXEC_TIMEOUT_MS
};

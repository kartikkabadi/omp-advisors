/**
 * OMP extension integration for bounded fusion.
 *
 * Registers a `/fusion` slash command that parses a prompt plus optional
 * bounded flags, runs a bounded fusion through `runFusion` from ./core, and
 * reports phase updates through `ctx.ui` plus the final synthesis, evidence,
 * and dissent through a custom `pi.sendMessage` message.
 *
 * Lifecycle: the factory registers the command and a `session_shutdown`
 * handler only. Nothing runs at load time and no file is ever touched. A
 * single active AbortController is held per run: overlapping invocations are
 * rejected with a notification, and `session_shutdown` aborts the in-flight
 * run.
 *
 * Child execution is injected through the `createExtension(deps)` seam. The
 * native defaults spawn a child `pi` process through `ExtensionAPI.exec` in
 * print mode; each call pairs the shared abort signal with a fixed bounded
 * timeout (`NATIVE_EXEC_TIMEOUT_MS`) so a hung child cannot stall the run
 * indefinitely. Tests inject fakes instead.
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionFactory,
	ExtensionUIContext,
} from "@oh-my-pi/pi-coding-agent";
import {
	DEFAULT_MAX_CANDIDATES,
	MAX_CANDIDATES,
	MIN_CANDIDATES,
	runFusion,
	type FusionDependencies,
	type FusionJudgement,
	type FusionOptions,
	type FusionProgress,
	type FusionResult,
} from "./core";

/**
 * Fixed per-call ceiling (ms) applied to every native child `pi.exec` run —
 * candidate generation and judging. A hung child cannot stall a fusion run
 * indefinitely; each call still carries the shared abort signal, which is
 * honored alongside this timeout by the installed `ExtensionAPI.exec`.
 */
export const NATIVE_EXEC_TIMEOUT_MS = 120_000;

/** Child process execution surface; structurally matches `ExtensionAPI.exec`. */
export interface ChildExec {
	(
		command: string,
		args: string[],
		options?: { signal?: AbortSignal; timeout?: number; cwd?: string },
	): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;
}

/**
 * Injection seam for tests and benchmarks. Every member is optional and
 * falls back to a native implementation.
 */
export interface FusionExtensionDeps {
	/** Child execution surface; defaults to `ExtensionAPI.exec`. */
	exec?: ChildExec;
	/** Per-candidate generator; defaults to a child `pi` print-mode run. */
	runCandidate?: FusionDependencies["runCandidate"];
	/** Per-candidate judge; defaults to a child `pi` print-mode run with a scoring rubric. */
	judge?: FusionDependencies["judge"];
	/** Core orchestrator; defaults to `runFusion` from ./core. */
	runFusion?: (
		prompt: string,
		options: FusionOptions,
		dependencies: FusionDependencies,
	) => Promise<FusionResult>;
}

/** A successfully parsed `/fusion` invocation. */
export interface FusionInvocation {
	prompt: string;
	options: FusionOptions;
}

/** A rejected `/fusion` invocation. */
export interface FusionInvocationError {
	error: string;
}

export type FusionArgParseResult = FusionInvocation | FusionInvocationError;

/** Flags whose value is a bounded candidate count (2..8). */
const COUNT_FLAGS: Record<string, true> = { min: true, max: true };
/** Flags whose value is a bounded threshold (0..1). */
const RANGE_FLAGS: Record<string, true> = { quality: true, marginal: true };

/**
 * Parse the raw `/fusion` arguments into a prompt plus bounded options.
 * Flags may be written as `--max 4` or `--max=4`; the prompt is everything
 * that is not a recognized flag. Returns an error for unknown flags, missing
 * or malformed values, out-of-range counts, and a minimum above the maximum.
 */
export function parseFusionArgs(input: string): FusionArgParseResult {
	const tokens = input
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
	const promptParts: string[] = [];
	const options: FusionOptions = {};
	const seen = new Set<string>();

	for (let i = 0; i < tokens.length; i++) {
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

	if (
		options.minCandidates !== undefined &&
		options.maxCandidates !== undefined &&
		options.minCandidates > options.maxCandidates
	) {
		return {
			error: `--min (${options.minCandidates}) exceeds --max (${options.maxCandidates})`,
		};
	}

	return { prompt: promptParts.join(" "), options };
}

function applyFlag(
	name: string,
	raw: string | undefined,
	options: FusionOptions,
): string | null {
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

function formatScore(score: number | null): string {
	return score === null ? "?" : score.toFixed(2);
}

function reportProgress(ui: ExtensionUIContext, progress: FusionProgress): void {
	const label = progress.candidateId ?? `attempt ${progress.candidateIndex}`;
	switch (progress.phase) {
		case "started":
			ui.setStatus("fusion", `fusion: ${label} running`);
			break;
		case "completed":
			ui.setStatus(
				"fusion",
				`fusion: ${label} scored ${formatScore(progress.score)} (best ${formatScore(progress.bestScore)})`,
			);
			break;
		case "failed":
			ui.setStatus(
				"fusion",
				`fusion: ${label} failed${progress.error ? `: ${progress.error}` : ""}`,
			);
			break;
		case "done":
			ui.setStatus("fusion", undefined);
			break;
	}
}

function sendResult(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	prompt: string,
	result: FusionResult,
): void {
	const outcome =
		result.bestScore === null
			? "no usable answer"
			: `best score ${formatScore(result.bestScore)}`;
	const type: "info" | "warning" =
		result.stopReason === "aborted" ? "warning" : "info";
	ctx.ui.notify(
		`Fusion finished: ${result.stopReason} (${outcome}, ${result.candidatesRun} candidate(s) run)`,
		type,
	);

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
			failures: result.failures,
		},
	});
}

function nativeRunCandidate(exec: ChildExec): FusionDependencies["runCandidate"] {
	return async (prompt, _candidateId, signal) => {
		const result = await exec(
			"pi",
			["--mode", "text", "-p", "--no-session", prompt],
			{ signal, timeout: NATIVE_EXEC_TIMEOUT_MS },
		);
		if (result.code !== 0) {
			throw new Error(result.stderr.trim() || `pi exited with code ${result.code}`);
		}
		return result.stdout.trim();
	};
}

const JUDGE_RUBRIC = `Score the candidate answer below on quality from 0 to 1.
Reply with a single JSON object, no commentary:
{"score": <number 0..1>, "evidence": ["<supporting observation>", ...], "dissent": ["<dissenting observation>", ...]}`;

function nativeJudge(exec: ChildExec): FusionDependencies["judge"] {
	return async (prompt, candidate, signal) => {
		const rubric = `${JUDGE_RUBRIC}\n\nPROMPT:\n${prompt}\n\nCANDIDATE:\n${candidate.output}`;
		const result = await exec("pi", ["--mode", "text", "-p", "--no-session", rubric], {
			signal,
			timeout: NATIVE_EXEC_TIMEOUT_MS,
		});
		if (result.code !== 0) {
			throw new Error(result.stderr.trim() || `pi exited with code ${result.code}`);
		}
		return parseJudgement(result.stdout);
	};
}

function parseJudgement(text: string): FusionJudgement {
	const cleaned = text
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/```\s*$/i, "")
		.trim();
	const start = cleaned.indexOf("{");
	const end = cleaned.lastIndexOf("}");
	const body = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
	let parsed: { score?: unknown; evidence?: unknown; dissent?: unknown };
	try {
		parsed = JSON.parse(body) as { score?: unknown; evidence?: unknown; dissent?: unknown };
	} catch {
		return { score: NaN };
	}
	return {
		score: typeof parsed.score === "number" ? parsed.score : NaN,
		evidence: Array.isArray(parsed.evidence)
			? parsed.evidence.filter((note): note is string => typeof note === "string")
			: undefined,
		dissent: Array.isArray(parsed.dissent)
			? parsed.dissent.filter((note): note is string => typeof note === "string")
			: undefined,
	};
}

/**
 * Build an OMP extension factory. With no deps, the factory wires the native
 * child execution surface through `ExtensionAPI.exec`; tests inject fakes.
 */
export function createExtension(deps: FusionExtensionDeps = {}): ExtensionFactory {
	return (pi: ExtensionAPI) => {
		const exec: ChildExec =
			deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
		const runCandidate = deps.runCandidate ?? nativeRunCandidate(exec);
		const judge = deps.judge ?? nativeJudge(exec);
		const runner = deps.runFusion ?? runFusion;

		let activeController: AbortController | null = null;
		let running = false;

		pi.on("session_shutdown", () => {
			activeController?.abort();
		});

		pi.registerCommand("fusion", {
			description:
				"Run bounded fusion: generate 2..8 candidates for the prompt, score each, and report the best answer with evidence and dissent. Flags: --min N, --max N, --quality N, --marginal N.",
			handler: async (args: string, ctx: ExtensionCommandContext) => {
				if (running) {
					ctx.ui.notify(
						"A fusion run is already in progress; wait for it to finish.",
						"warning",
					);
					return;
				}
				const parsed = parseFusionArgs(args);
				if ("error" in parsed) {
					ctx.ui.notify(`Invalid fusion arguments: ${parsed.error}`, "error");
					return;
				}
				if (parsed.prompt === "") {
					ctx.ui.notify(
						"Usage: /fusion <prompt> [--min N] [--max N] [--quality N] [--marginal N]",
						"error",
					);
					return;
				}

				const controller = new AbortController();
				activeController = controller;
				running = true;

				const options: FusionOptions = {
					...parsed.options,
					signal: controller.signal,
					onProgress: (progress) => reportProgress(ctx.ui, progress),
				};

				ctx.ui.notify(
					`Fusion started: running up to ${options.maxCandidates ?? DEFAULT_MAX_CANDIDATES} candidates`,
					"info",
				);

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
			},
		});
	};
}

export default createExtension();

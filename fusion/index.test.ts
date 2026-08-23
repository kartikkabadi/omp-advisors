import { describe, expect, test } from "bun:test"
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent"
import {
  NATIVE_EXEC_TIMEOUT_MS,
  createExtension,
  parseFusionArgs,
  type FusionExtensionDeps,
} from "./index"
import {
  DEFAULT_MAX_CANDIDATES,
  type FusionDependencies,
  type FusionOptions,
  type FusionProgress,
  type FusionResult,
} from "./core"

/** Minimal fake of the `ExtensionAPI` surface the factory touches. */
interface FakePi {
  handlers: Map<string, (event?: unknown) => void>
  registered: Array<{
    name: string
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
  }>
  sent: unknown[]
  exec(
    command: string,
    args: string[],
    options?: { signal?: AbortSignal; timeout?: number; cwd?: string },
  ): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>
}

function makePi(): FakePi {
  const handlers = new Map<string, (event?: unknown) => void>()
  const registered: FakePi["registered"] = []
  const sent: unknown[] = []
  const pi: FakePi & {
    on(event: string, handler: (event?: unknown) => void): void
    registerCommand(
      name: string,
      options: {
        description?: string
        handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
      },
    ): void
    sendMessage(message: unknown): void
    exec(
      command: string,
      args: string[],
      options?: { signal?: AbortSignal; timeout?: number; cwd?: string },
    ): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>
  } = {
    handlers,
    registered,
    sent,
    on(event: string, handler: (event?: unknown) => void): void {
      handlers.set(event, handler)
    },
    registerCommand(
      name: string,
      options: {
        description?: string
        handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
      },
    ): void {
      registered.push({ name, handler: options.handler })
    },
    sendMessage(message: unknown): void {
      sent.push(message)
    },
    exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }),
  }
  return pi
}

function toExtensionAPI(pi: FakePi): ExtensionAPI {
  return pi as unknown as ExtensionAPI
}

/** Notifications and status writes collected by the fake context. */
interface NotificationSink {
  notifications: Array<{ message: string; type?: "info" | "warning" | "error" }>
  status: Array<{ key: string; text: string | undefined }>
}

function makeContext(): ExtensionCommandContext & NotificationSink {
  const notifications: NotificationSink["notifications"] = []
  const status: NotificationSink["status"] = []
  const ctx = {
    notifications,
    status,
    ui: {
      notify(message: string, type?: "info" | "warning" | "error"): void {
        notifications.push({ message, type })
      },
      setStatus(key: string, text: string | undefined): void {
        status.push({ key, text })
      },
    },
  }
  return ctx as unknown as ExtensionCommandContext & NotificationSink
}

function getFusionHandler(
  pi: FakePi,
): (args: string, ctx: ExtensionCommandContext) => Promise<void> {
  const entry = pi.registered.find((command) => command.name === "fusion")
  if (entry === undefined) {
    throw new Error("fusion command was not registered")
  }
  return entry.handler
}

interface Installed {
  pi: FakePi
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
}

function install(deps: FusionExtensionDeps, pi: FakePi = makePi()): Installed {
  const factory = createExtension(deps)
  factory(toExtensionAPI(pi))
  return { pi, handler: getFusionHandler(pi) }
}

function hasNotification(ctx: NotificationSink, pattern: RegExp): boolean {
  return ctx.notifications.some((notification) => pattern.test(notification.message))
}

function sentMessage(pi: FakePi): {
  customType: string
  content: string
  display: boolean
  details?: unknown
} {
  const message = pi.sent[0]
  if (message === undefined || typeof message !== "object" || message === null) {
    throw new Error("no custom message was sent")
  }
  return message as {
    customType: string
    content: string
    display: boolean
    details?: unknown
  }
}

function makeResult(overrides: Partial<FusionResult> = {}): FusionResult {
  return {
    stopReason: "threshold",
    best: { id: "candidate-1", output: "best answer" },
    bestScore: 0.9,
    candidates: [{ id: "candidate-1", output: "best answer" }],
    scores: { "candidate-1": 0.9 },
    evidence: [{ candidateId: "candidate-1", note: "clear and direct" }],
    dissent: [],
    failures: [],
    candidatesRun: 1,
    progress: [],
    ...overrides,
  }
}

interface DeferredRunner {
  runner: FusionExtensionDeps["runFusion"]
  calls: Array<{
    prompt: string
    options: FusionOptions
    dependencies: FusionDependencies
  }>
  resolve(result: FusionResult): void
  reject(error: unknown): void
}

function makeDeferredRunner(): DeferredRunner {
  const calls: DeferredRunner["calls"] = []
  const handles: {
    resolve?: (result: FusionResult) => void
    reject?: (error: unknown) => void
  } = {}
  const promise = new Promise<FusionResult>((resolve, reject) => {
    handles.resolve = resolve
    handles.reject = reject
  })
  const runner: FusionExtensionDeps["runFusion"] = (prompt, options, dependencies) => {
    calls.push({ prompt, options, dependencies })
    return promise
  }
  return {
    runner,
    calls,
    resolve(result: FusionResult): void {
      if (handles.resolve === undefined) {
        throw new Error("runner was never awaited")
      }
      handles.resolve(result)
    },
    reject(error: unknown): void {
      if (handles.reject === undefined) {
        throw new Error("runner was never awaited")
      }
      handles.reject(error)
    },
  }
}

function firstCall(
  deferred: DeferredRunner,
): { prompt: string; options: FusionOptions; dependencies: FusionDependencies } {
  const call = deferred.calls[0]
  if (call === undefined) {
    throw new Error("runFusion was not invoked")
  }
  return call
}

describe("fusion extension", () => {
  test("registers the /fusion command and a session_shutdown handler", () => {
    const pi = makePi()
    install({}, pi)
    expect(pi.registered.some((command) => command.name === "fusion")).toBe(true)
    expect(pi.handlers.has("session_shutdown")).toBe(true)
  })

  test("rejects an overlapping run while one is in progress", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)
    const ctx = makeContext()

    const first = installed.handler("first prompt", ctx)
    expect(deferred.calls).toHaveLength(1)

    const secondCtx = makeContext()
    await installed.handler("second prompt", secondCtx)

    expect(deferred.calls).toHaveLength(1)
    expect(hasNotification(secondCtx, /already in progress/)).toBe(true)

    deferred.resolve(makeResult())
    await first
  })

  test("allows a new run after the previous run finishes", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)

    const first = installed.handler("first prompt", makeContext())
    expect(deferred.calls).toHaveLength(1)
    deferred.resolve(makeResult())
    await first

    const ctx = makeContext()
    await installed.handler("second prompt", ctx)
    expect(deferred.calls).toHaveLength(2)
    expect(hasNotification(ctx, /already in progress/)).toBe(false)
  })

  test("rejects malformed or out-of-range flags without running", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)
    const badArguments = [
      "--max 9",
      "--max 1",
      "--min 5 --max 3",
      "--max 2.5",
      "--quality 1.5",
      "--min",
      "--unknown value",
      "--min 2 --min 3",
    ]
    for (const args of badArguments) {
      const ctx = makeContext()
      await installed.handler(`do the thing ${args}`, ctx)
      expect(deferred.calls).toHaveLength(0)
      expect(hasNotification(ctx, /Invalid fusion arguments/)).toBe(true)
    }
  })

  test("rejects an empty prompt with usage without running", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)
    const ctx = makeContext()

    await installed.handler("--max 4", ctx)

    expect(deferred.calls).toHaveLength(0)
    expect(hasNotification(ctx, /Usage:/)).toBe(true)
  })

  test("forwards bounded flags and strips them from the prompt", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)
    const ctx = makeContext()

    const run = installed.handler("analyze the numbers --max 5 --quality 0.7", ctx)
    const call = firstCall(deferred)

    expect(call.prompt).toBe("analyze the numbers")
    expect(call.options.maxCandidates).toBe(5)
    expect(call.options.qualityThreshold).toBe(0.7)

    deferred.resolve(makeResult())
    await run
  })

  test("notifies when the run starts and reports the configured budget", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)
    const ctx = makeContext()

    const run = installed.handler("build it", ctx)

    expect(
      hasNotification(
        ctx,
        new RegExp(`Fusion started: running up to ${DEFAULT_MAX_CANDIDATES} candidates`),
      ),
    ).toBe(true)

    deferred.resolve(makeResult())
    await run
  })

  test("reports progress phases through ui.setStatus", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)
    const ctx = makeContext()

    const run = installed.handler("do the work", ctx)
    const call = firstCall(deferred)
    const onProgress = call.options.onProgress
    if (onProgress === undefined) {
      throw new Error("onProgress was not wired")
    }

    onProgress(progressEvent(0, "candidate-1", "started", null, null))
    onProgress(progressEvent(0, "candidate-1", "completed", 0.9, 0.9))
    onProgress(doneEvent(1, "threshold", 0.9))

    deferred.resolve(makeResult())
    await run

    expect(
      ctx.status.some(
        (entry) => entry.key === "fusion" && entry.text?.includes("running"),
      ),
    ).toBe(true)
    expect(
      ctx.status.some(
        (entry) => entry.key === "fusion" && entry.text?.includes("0.90"),
      ),
    ).toBe(true)
    expect(
      ctx.status.some(
        (entry) => entry.key === "fusion" && entry.text === undefined,
      ),
    ).toBe(true)
  })

  test("aborts the active run on session_shutdown", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)
    const ctx = makeContext()

    const run = installed.handler("shutdown me", ctx)
    const call = firstCall(deferred)
    expect(call.options.signal).toBeInstanceOf(AbortSignal)

    const shutdownHandler = pi.handlers.get("session_shutdown")
    if (shutdownHandler === undefined) {
      throw new Error("session_shutdown handler was not registered")
    }
    shutdownHandler()

    expect(call.options.signal?.aborted).toBe(true)

    deferred.reject(new DOMException("aborted", "AbortError"))
    await run

    expect(hasNotification(ctx, /aborted/i)).toBe(true)
  })

  test("native candidate and judge calls bound exec with a fixed timeout and the shared signal", async () => {
    const pi = makePi()
    const execCalls: Array<{
      command: string
      args: string[]
      options?: { signal?: AbortSignal; timeout?: number; cwd?: string }
    }> = []
    pi.exec = async (command, args, options) => {
      execCalls.push({ command, args, options })
      return { stdout: "candidate answer", stderr: "", code: 0, killed: false }
    }
    const installed = install({}, pi)
    const ctx = makeContext()

    await installed.handler("do the work --max 2", ctx)

    expect(execCalls.length).toBeGreaterThan(0)
    for (const call of execCalls) {
      expect(call.command).toBe("pi")
      expect(call.options?.timeout).toBe(NATIVE_EXEC_TIMEOUT_MS)
      expect(call.options?.signal).toBeInstanceOf(AbortSignal)
    }
  })

  test("reports the final synthesis, evidence, and dissent as a custom message", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)
    const ctx = makeContext()

    const result = makeResult({
      stopReason: "budget",
      best: { id: "candidate-2", output: "synthesized answer" },
      bestScore: 0.87,
      candidates: [
        { id: "candidate-1", output: "first answer" },
        { id: "candidate-2", output: "synthesized answer" },
      ],
      scores: { "candidate-1": 0.7, "candidate-2": 0.87 },
      evidence: [
        { candidateId: "candidate-1", note: "grounded" },
        { candidateId: "candidate-2", note: "concise" },
      ],
      dissent: [{ candidateId: "candidate-2", note: "slightly long" }],
      candidatesRun: 2,
    })

    const run = installed.handler("build a plan --max 2", ctx)
    deferred.resolve(result)
    await run

    const message = sentMessage(pi)
    expect(message).toMatchObject({
      customType: "fusion.result",
      content: "synthesized answer",
      display: true,
    })
    expect(message.details).toEqual({
      prompt: "build a plan",
      stopReason: result.stopReason,
      bestScore: result.bestScore,
      candidatesRun: result.candidatesRun,
      candidates: result.candidates,
      scores: result.scores,
      evidence: result.evidence,
      dissent: result.dissent,
      failures: result.failures,
    })
  })

  test("reports a runner failure as an error notification", async () => {
    const pi = makePi()
    const deferred = makeDeferredRunner()
    const installed = install({ runFusion: deferred.runner }, pi)
    const ctx = makeContext()

    const run = installed.handler("do the work", ctx)
    deferred.reject(new Error("boom"))
    await run

    expect(hasNotification(ctx, /Fusion failed: boom/)).toBe(true)
  })
})

function progressEvent(
  candidateIndex: number,
  candidateId: string,
  phase: "started" | "completed",
  score: number | null,
  bestScore: number | null,
): FusionProgress {
  return { candidateIndex, candidateId, phase, score, bestScore, error: null, stopReason: null }
}

function doneEvent(
  candidateIndex: number,
  stopReason: FusionResult["stopReason"],
  bestScore: number | null,
): FusionProgress {
  return {
    candidateIndex,
    candidateId: null,
    phase: "done",
    score: null,
    bestScore,
    error: null,
    stopReason,
  }
}

describe("parseFusionArgs", () => {
  test("strips recognized flags and returns the prompt", () => {
    const parsed = parseFusionArgs("explain caching --min 2 --max 5")
    if ("error" in parsed) {
      throw new Error(`unexpected parse error: ${parsed.error}`)
    }
    expect(parsed.prompt).toBe("explain caching")
    expect(parsed.options.minCandidates).toBe(2)
    expect(parsed.options.maxCandidates).toBe(5)
  })

  test("accepts --flag=value syntax", () => {
    const parsed = parseFusionArgs("write tests --quality=0.8 --marginal=0.01")
    if ("error" in parsed) {
      throw new Error(`unexpected parse error: ${parsed.error}`)
    }
    expect(parsed.prompt).toBe("write tests")
    expect(parsed.options.qualityThreshold).toBe(0.8)
    expect(parsed.options.marginalGainThreshold).toBe(0.01)
  })

  test("returns an empty prompt and empty options for an empty invocation", () => {
    const parsed = parseFusionArgs("")
    if ("error" in parsed) {
      throw new Error(`unexpected parse error: ${parsed.error}`)
    }
    expect(parsed.prompt).toBe("")
    expect(parsed.options).toEqual({})
  })

  test("rejects unknown flags", () => {
    const parsed = parseFusionArgs("prompt --bogus 1")
    if ("prompt" in parsed) {
      throw new Error("expected a parse error")
    }
    expect(parsed.error).toMatch(/unknown flag --bogus/)
  })

  test("rejects a flag without a value", () => {
    const parsed = parseFusionArgs("prompt --min")
    if ("prompt" in parsed) {
      throw new Error("expected a parse error")
    }
    expect(parsed.error).toMatch(/--min requires a value/)
  })

  test("rejects out-of-range thresholds and counts", () => {
    const inputs = ["prompt --quality 1.5", "prompt --max 9", "prompt --max 1"]
    for (const input of inputs) {
      const parsed = parseFusionArgs(input)
      if ("prompt" in parsed) {
        throw new Error("expected a parse error")
      }
      expect(parsed.error).toMatch(/must be/)
    }
  })

  test("rejects a non-integer count", () => {
    const parsed = parseFusionArgs("prompt --max 2.5")
    if ("prompt" in parsed) {
      throw new Error("expected a parse error")
    }
    expect(parsed.error).toMatch(/integer between/)
  })

  test("rejects a minimum above the maximum", () => {
    const parsed = parseFusionArgs("prompt --min 5 --max 3")
    if ("prompt" in parsed) {
      throw new Error("expected a parse error")
    }
    expect(parsed.error).toMatch(/exceeds --max/)
  })

  test("rejects duplicate flags", () => {
    const parsed = parseFusionArgs("prompt --min 2 --min 3")
    if ("prompt" in parsed) {
      throw new Error("expected a parse error")
    }
    expect(parsed.error).toMatch(/duplicate flag --min/)
  })
})

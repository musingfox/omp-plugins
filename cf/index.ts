import { isDeepStrictEqual } from "node:util";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";

type Phase =
  | "PREFLIGHT"
  | "PROBE"
  | "TYPE"
  | "GATE"
  | "IMPLEMENT"
  | "VERIFY"
  | "CLEANUP"
  | "COMPLETED"
  | "ABORTED";
type Status =
  | "PASS"
  | "BLOCKED"
  | "AWAITING_DECISION"
  | "NEEDS_REPLAN"
  | "FAIL"
  | "ABORTED"
  | "CLEANED";
export type CfWave = { work_id: string; contract_uri: string; dependency_uris: string[] };
export type CfManifest = {
  waves?: CfWave[][];
  route?: "APPROVED" | "RETRY" | "REPLAN" | "ABORTED";
  decision_uri?: string;
  intent_uri?: string;
  preflight_uri?: string;
  resume_phase?: Phase;
  isolation_available?: boolean;
};
export type CfQuestion = { id: string; question: string; options: string[]; recommended?: number };
export type CfEnvelope = {
  status: Status;
  artifact_uri?: string | null;
  blockers?: string[];
  manifest?: CfManifest;
  questions?: CfQuestion[];
};
export type CfState = {
  flowId: string;
  phase: Phase;
  goal: string;
  artifactRoot?: string;
  discoveryUri?: string;
  planUri?: string;
  typeManifest?: CfManifest;
  workerEvidenceUris: string[];
  highDecisions: unknown[];
  waveStatus: string[];
  terminalError?: string;
};

type TaskParams = Record<string, unknown>;
type TaskRelayState = {
  pending?: { resolve: (value: unknown) => void; reject: (error: unknown) => void };
  taskCallId?: string;
  taskParams?: TaskParams;
};
export type CfHost = {
  hasUI: boolean;
  ui: {
    notify(message: string, type?: "info" | "warning" | "error"): void;
    askDialog?: (
      questions: Array<{ id: string; question: string; options: Array<{ label: string }>; recommended?: number }>,
    ) => Promise<{ kind: "submit" | "chat"; results?: Array<{ id?: string; selectedOptions?: string[]; customInput?: string }> } | undefined>;
  };
  task: (params: TaskParams, options?: { awaitCompletion?: boolean }) => Promise<unknown>;
};

export const envelopeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { enum: ["PASS", "BLOCKED", "AWAITING_DECISION", "NEEDS_REPLAN", "FAIL", "ABORTED", "CLEANED"] },
    artifact_uri: { type: ["string", "null"] },
    blockers: { type: "array", items: { type: "string" } },
    manifest: {
      type: "object",
      additionalProperties: false,
      properties: {
        waves: {
          type: "array",
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                work_id: { type: "string" },
                contract_uri: { type: "string" },
                dependency_uris: { type: "array", items: { type: "string" } },
              },
              required: ["work_id", "contract_uri", "dependency_uris"],
            },
          },
        },
        route: { enum: ["APPROVED", "RETRY", "REPLAN", "ABORTED"] },
        decision_uri: { type: "string" },
        intent_uri: { type: "string" },
        preflight_uri: { type: "string" },
        resume_phase: { type: "string" },
        isolation_available: { type: "boolean" },
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          recommended: { type: "number" },
        },
        required: ["id", "question", "options"],
      },
    },
  },
  required: ["status"],
} as const;

const PARENT_TOOLS = ["task", "ask", "hub"] as const;

export function createCfState(goal: string, flowId = crypto.randomUUID()): CfState {
  return { flowId, phase: "PREFLIGHT", goal, highDecisions: [], waveStatus: [], workerEvidenceUris: [] };
}

type TaskResult = { details?: { results?: Array<{ structuredOutput?: { data?: unknown } }> } };

function isEnvelope(value: unknown): value is CfEnvelope {
  return !!value && typeof value === "object" && "status" in value && typeof (value as CfEnvelope).status === "string";
}

function unwrapToolResult(result: unknown): unknown {
  if (result && typeof result === "object" && "details" in result) return result;
  if (result && typeof result === "object" && "result" in result) return unwrapToolResult((result as { result: unknown }).result);
  return result;
}

function readEnvelopes(result: unknown): CfEnvelope[] {
  const values = (unwrapToolResult(result) as TaskResult | undefined)?.details?.results;
  if (!Array.isArray(values)) {
    throw new Error("cf task returned no structured results");
  }
  const found = values.map((item) => item.structuredOutput?.data).filter(isEnvelope);
  if (found.length) return found;
  const diagnostic = values[0]?.structuredOutput as { status?: string; error?: string } | undefined;
  return [
    {
      status: "FAIL",
      blockers: [
        `invalid metadata envelope${diagnostic?.status ? ` (${diagnostic.status}${diagnostic.error ? `: ${diagnostic.error}` : ""})` : ""}`,
      ],
    },
  ];
}

function readEnvelope(result: unknown): CfEnvelope {
  const all = readEnvelopes(result);
  const first = all.find((item) => item.status !== "PASS") ?? all[0];
  const artifacts = all.flatMap((item) => (item.artifact_uri ? [item.artifact_uri] : []));
  return { ...first, artifact_uri: artifacts[0] ?? first.artifact_uri };
}

function taskParams(instruction: string, isolated?: boolean) {
  return {
    agent: "task",
    task: `${instruction}\n\nYield one JSON object that matches the provided outputSchema. additionalProperties is false; omit unused optional keys. Do not wrap the object or add commentary.`,
    outputSchema: envelopeSchema,
    schemaMode: "strict" as const,
    ...(isolated === undefined ? {} : { isolated }),
  };
}

async function runTask(ctx: CfHost, instruction: string, isolated?: boolean): Promise<CfEnvelope> {
  return readEnvelope(await ctx.task(taskParams(instruction, isolated), { awaitCompletion: true }));
}

async function chooseRoute(ctx: CfHost, failure: CfEnvelope, phase: Phase): Promise<"RETRY" | "REPLAN" | "ABORTED"> {
  const gate = await runTask(
    ctx,
    `Prepare a failure decision for ${phase}. Read only ${failure.artifact_uri ?? "the failure metadata"}; return AWAITING_DECISION with retry, replan, and abort choices.`,
  );
  if (!ctx.hasUI || !ctx.ui.askDialog || gate.status !== "AWAITING_DECISION") return "ABORTED";
  const answer = await ctx.ui.askDialog(
    (gate.questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options.map((label) => ({ label })),
      recommended: q.recommended,
    })),
  );
  if (!answer || answer.kind !== "submit") return "ABORTED";
  const resolved = await runTask(
    ctx,
    `Resolve decision ${gate.artifact_uri ?? "unknown"} for ${phase}; answers are ${JSON.stringify(answer)}. Return route metadata only.`,
  );
  const route = resolved.manifest?.route;
  return route === "RETRY" || route === "REPLAN" || route === "ABORTED" ? route : "ABORTED";
}

async function cleanup(ctx: CfHost, root?: string): Promise<CfEnvelope> {
  if (!root) return { status: "CLEANED", artifact_uri: null };
  return runTask(
    ctx,
    `Cleanup only the CF temporary root ${root}. Remove it after terminal completion; do not touch OMP task artifacts or session history.`,
  );
}

function record(state: CfState, phase: Phase, result: CfEnvelope): void {
  if (phase === "PREFLIGHT") {
    const preflightUri = result.manifest?.preflight_uri ?? result.artifact_uri;
    if (preflightUri) state.artifactRoot = preflightUri.replace(/\/[^/]+$/, "");
  }
  if (phase === "PROBE" && result.artifact_uri) state.discoveryUri = result.artifact_uri;
  if (phase === "TYPE") {
    if (result.artifact_uri) state.planUri = result.artifact_uri;
    if (result.manifest) state.typeManifest = result.manifest;
  }
}

function addEvidence(state: CfState, envelopes: CfEnvelope[]): void {
  for (const envelope of envelopes) {
    const uri = envelope.artifact_uri;
    if (uri && !state.workerEvidenceUris.includes(uri)) state.workerEvidenceUris.push(uri);
  }
}

function resetPlanExecution(state: CfState): void {
  state.workerEvidenceUris = [];
  state.waveStatus = [];
}

async function phaseLoop(
  state: CfState,
  ctx: CfHost,
  phase: Phase,
  action: () => Promise<CfEnvelope>,
): Promise<CfEnvelope> {
  state.phase = phase;
  for (;;) {
    const result = await action();
    record(state, phase, result);
    if (result.status === "PASS") return result;
    const route = await chooseRoute(ctx, result, phase);
    if (route === "RETRY" || route === "REPLAN") continue;
    state.phase = "ABORTED";
    return { ...result, status: "ABORTED" };
  }
}

async function scopeGate(state: CfState, ctx: CfHost): Promise<"APPROVED" | "REPLAN" | "ABORTED"> {
  const gate = await runTask(
    ctx,
    `Prepare High-decision and scope gate from plan ${state.planUri}; include scope confirmation and direction risks.`,
  );
  if (gate.status !== "AWAITING_DECISION" || !ctx.hasUI || !ctx.ui.askDialog) return "ABORTED";
  const answer = await ctx.ui.askDialog(
    (gate.questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options.map((label) => ({ label })),
      recommended: q.recommended,
    })),
  );
  if (!answer || answer.kind !== "submit") return "ABORTED";
  const resolved = await runTask(
    ctx,
    `Resolve scope gate ${gate.artifact_uri ?? "unknown"} with answers ${JSON.stringify(answer)}; return route metadata.`,
  );
  state.highDecisions.push(resolved.manifest?.decision_uri ?? answer);
  return resolved.manifest?.route === "APPROVED"
    ? "APPROVED"
    : resolved.manifest?.route === "REPLAN"
      ? "REPLAN"
      : "ABORTED";
}

export async function runFlow(goal: string, ctx: CfHost, state = createCfState(goal)): Promise<CfState> {
  try {
    const preflight = await phaseLoop(state, ctx, "PREFLIGHT", () =>
      runTask(
        ctx,
        `Preflight goal: ${goal}. Create one private /tmp/omp-cf.XXXXXXXX root with umask 077. Atomically write intent.json with the exact goal and preflight.json with clean-worktree, base-SHA, and isolation checks. Return artifact_uri as the preflight.json file URI and manifest containing intent_uri, preflight_uri, and isolation_available. A dirty worktree returns BLOCKED only after writing both artifacts.`,
      ),
    );
    if (preflight.status !== "PASS") return state;
    const isolated = preflight.manifest?.isolation_available === true;
    const probe = await phaseLoop(state, ctx, "PROBE", async () => {
      if (!isolated) {
        return runTask(
          ctx,
          `Single probe using ${preflight.manifest?.intent_uri} and ${preflight.manifest?.preflight_uri}; write bounded discovery atomically, no repository edits.`,
        );
      }
      const handoff = await runTask(
        ctx,
        `Probe A using ${preflight.manifest?.intent_uri} and ${preflight.manifest?.preflight_uri}; write a bounded handoff artifact atomically, no repository edits.`,
        true,
      );
      if (handoff.status !== "PASS") return handoff;
      return runTask(
        ctx,
        `Probe B read and verify isolated handoff ${handoff.artifact_uri}; write bounded discovery atomically, no repository edits.`,
        true,
      );
    });
    if (probe.status !== "PASS") return state;

    planning: for (;;) {
      resetPlanExecution(state);
      const typed = await phaseLoop(state, ctx, "TYPE", () =>
        runTask(
          ctx,
          `Type discovery ${state.discoveryUri}${state.highDecisions.length ? ` with decision URI ${String(state.highDecisions.at(-1))}` : ""} using isolation_available=${isolated}; write WorkContracts, dependency waves, hermetic tests, documentation impact and one full-repository validation command.`,
        ),
      );
      if (typed.status !== "PASS") return state;
      const gate = await scopeGate(state, ctx);
      if (gate === "REPLAN") continue;
      if (gate !== "APPROVED") {
        state.phase = "ABORTED";
        return state;
      }

      state.phase = "IMPLEMENT";
      for (const wave of state.typeManifest?.waves ?? []) {
        if (isolated && wave.length > 1) {
          for (;;) {
            const all = readEnvelopes(
              await ctx.task(
                {
                  context: "Execute only each supplied WorkContract.",
                  tasks: wave.map((work) =>
                    taskParams(
                      `WorkContract ${work.contract_uri}; dependencies ${work.dependency_uris.join(", ")}. Run the hermetic test command and update declared docs. On non-PASS restore only this worker's edits using its start snapshot; never restore to HEAD.`,
                      true,
                    ),
                  ),
                },
                { awaitCompletion: true },
              ),
            );
            addEvidence(state, all);
            const failure = all.find((envelope) => envelope.status !== "PASS");
            if (!failure) break;
            const route = await chooseRoute(ctx, failure, "IMPLEMENT");
            if (route === "RETRY") continue;
            if (route === "REPLAN") continue planning;
            state.phase = "ABORTED";
            return state;
          }
        } else {
          for (const work of wave) {
            for (;;) {
              const worker = await runTask(
                ctx,
                `Implement WorkContract ${work.contract_uri}; dependencies ${work.dependency_uris.join(", ")}. Run the hermetic test command and update declared docs. On non-PASS restore only this worker's edits using its start snapshot; never restore to HEAD.`,
                isolated ? true : undefined,
              );
              addEvidence(state, [worker]);
              if (worker.status === "PASS") break;
              const route = await chooseRoute(ctx, worker, "IMPLEMENT");
              if (route === "RETRY") continue;
              if (route === "REPLAN") continue planning;
              state.phase = "ABORTED";
              return state;
            }
          }
        }
        state.waveStatus.push("PASS");
      }

      state.phase = "VERIFY";
      for (;;) {
        const verified = await runTask(
          ctx,
          `Verify plan ${state.planUri} and all worker evidence ${state.workerEvidenceUris.join(", ")}; rerun the plan's full-repository validation command.`,
        );
        if (verified.status === "PASS") {
          state.phase = "CLEANUP";
          return state;
        }
        const route = await chooseRoute(ctx, verified, "VERIFY");
        if (route === "RETRY") continue;
        if (route === "REPLAN") continue planning;
        state.phase = "ABORTED";
        return state;
      }
    }
  } catch (error) {
    state.phase = "ABORTED";
    state.terminalError = error instanceof Error ? error.message : String(error);
    return state;
  } finally {
    if (state.phase === "CLEANUP" || state.phase === "ABORTED") {
      try {
        const cleaned = await cleanup(ctx, state.artifactRoot);
        state.phase = state.phase === "CLEANUP" && cleaned.status === "CLEANED" ? "COMPLETED" : "ABORTED";
      } catch {
        state.phase = "ABORTED";
      }
    }
  }
}

function createRuntimeHost(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  state: TaskRelayState,
): CfHost {
  return {
    hasUI: ctx.hasUI,
    ui: ctx.ui,
    task: async (params) => {
      const result = new Promise<unknown>((resolve, reject) => {
        state.taskParams = params;
        state.pending = {
          resolve: (value) => {
            state.pending = undefined;
            state.taskCallId = undefined;
            state.taskParams = undefined;
            resolve(value);
          },
          reject: (error) => {
            state.pending = undefined;
            state.taskCallId = undefined;
            state.taskParams = undefined;
            reject(error);
          },
        };
      });
      try {
        pi.sendUserMessage(
          [
            "You are only the CF parent runner.",
            "Call the task tool exactly once.",
            "Use these arguments as the complete task payload. Do not add keys, do not inspect the repository, and do not call other tools.",
            "",
            "```json",
            JSON.stringify(params),
            "```",
          ].join("\n"),
        );
        for (let i = 0; i < 100 && ctx.isIdle() && state.pending; i++) {
          await new Promise<void>((resolve) => {
            ctx.setTimeout(resolve, 50);
          });
        }
        if (ctx.isIdle() && state.pending) {
          state.pending.reject(new Error("cf: parent did not start a turn"));
        } else {
          await ctx.waitForIdle();
          if (state.pending) state.pending.reject(new Error("cf: parent finished a turn without calling task"));
        }
      } catch (error) {
        if (state.pending) state.pending.reject(error);
      }
      return result;
    },
  };
}


const extension = (pi: ExtensionAPI) => {
  const taskState: TaskRelayState = {};
  let flowActive = false;
  pi.on("tool_execution_start", (event) => {
    if (
      event.toolName === "task" &&
      taskState.pending &&
      !taskState.taskCallId &&
      isDeepStrictEqual(event.args, taskState.taskParams)
    ) {
      taskState.taskCallId = event.toolCallId;
    }
  });
  pi.on("tool_execution_end", (event) => {
    if (event.toolName === "task" && event.toolCallId === taskState.taskCallId && taskState.pending) {
      taskState.pending.resolve(event.result);
    }
  });
  pi.on("tool_call", (event) => {
    if (!flowActive) return;
    if (!(PARENT_TOOLS as readonly string[]).includes(event.toolName)) {
      return {
        block: true,
        reason: "CF parent may only use task, ask, and hub",
      };
    }
  });
  pi.registerCommand("cf", {
    description: "Run Context Flow orchestration",
    handler: async (args, ctx) => {
      const goal = args.trim();
      if (!goal) {
        ctx.ui.notify("Usage: /cf <goal>", "warning");
        return;
      }
      if (flowActive) {
        ctx.ui.notify("cf already running", "warning");
        return;
      }
      const previous = pi.getActiveTools();
      flowActive = true;
      try {
        await pi.setActiveTools([...PARENT_TOOLS]);
        const final = await runFlow(goal, createRuntimeHost(pi, ctx, taskState));
        ctx.ui.notify(`cf ${final.phase.toLowerCase()}`, final.phase === "COMPLETED" ? "info" : "warning");
      } catch (error) {
        ctx.ui.notify(`cf failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      } finally {
        try {
          await pi.setActiveTools(previous);
        } catch (error) {
          ctx.ui.notify(`cf failed to restore tools: ${error instanceof Error ? error.message : String(error)}`, "error");
        } finally {
          flowActive = false;
        }
      }
    },
  });
};

export default extension;

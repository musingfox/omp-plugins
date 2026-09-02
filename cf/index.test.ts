import { describe, expect, test } from "bun:test";
import extension, { createCfState, envelopeSchema, runFlow, type CfEnvelope } from "./index";

type Call = { params: Record<string, unknown>; options?: { awaitCompletion?: boolean } };
const reply = (data: CfEnvelope) => ({ details: { results: [{ structuredOutput: { data } }] } });
function context(responses: CfEnvelope[], hasUI = false, batch?: CfEnvelope[], batchSequence?: CfEnvelope[][]) {
  const batches = batchSequence ? [...batchSequence] : batch ? [batch] : [];
  const calls: Call[] = [];
  const ctx = {
    hasUI,
    ui: { notify() {}, askDialog: async () => ({ kind: "submit" as const, results: [] }) },
    task: async (params: Record<string, unknown>, options?: { awaitCompletion?: boolean }) => {
      calls.push({ params, options });
      if (params.tasks) {
        const selected = batches.length > 1 ? batches.shift()! : batches[0] ?? [];
        return { details: { results: selected.map(data => ({ structuredOutput: { data } })) } };
      }
      return reply(responses.shift() ?? { status: "FAIL" });
    },
  };
  return { ctx: ctx as unknown as Parameters<typeof runFlow>[1], calls };
}
const preflight = (isolation_available = false): CfEnvelope => ({ status: "PASS", manifest: { preflight_uri: "file:///tmp/cf/p", intent_uri: "file:///tmp/cf/i", isolation_available } });

describe("cf orchestration state machine", () => {
  test("all workers use strict schemas and await completion", async () => {
    const { ctx, calls } = context([preflight(), { status: "PASS", artifact_uri: "file:///d" }, { status: "PASS", artifact_uri: "file:///p", manifest: { waves: [] } }, { status: "AWAITING_DECISION", questions: [] }]);
    const state = await runFlow("goal", ctx);
    expect(state.phase).toBe("ABORTED");
    expect(calls.every(c => c.options?.awaitCompletion === true)).toBe(true);
    expect(calls.every(c => c.params.schemaMode === "strict" && c.params.outputSchema === envelopeSchema)).toBe(true);
  });

  test("non-UI scope abort cleans up", async () => {
    const { ctx, calls } = context([preflight(), { status: "PASS", artifact_uri: "file:///d" }, { status: "PASS", artifact_uri: "file:///p", manifest: { waves: [] } }, { status: "AWAITING_DECISION", questions: [] }, { status: "CLEANED" }]);
    const state = await runFlow("goal", ctx);
    expect(state.phase).toBe("ABORTED");
    expect(String(calls.at(-1)?.params.task)).toContain("Cleanup only");
  });

  test("isolation false executes a wave serially", async () => {
    const { ctx, calls } = context([preflight(), { status: "PASS", artifact_uri: "file:///d" }, { status: "PASS", artifact_uri: "file:///p", manifest: { waves: [[{ work_id: "a", contract_uri: "file:///a", dependency_uris: [] }, { work_id: "b", contract_uri: "file:///b", dependency_uris: [] }]] } }, { status: "AWAITING_DECISION", questions: [] }, { status: "PASS", manifest: { route: "APPROVED" } }, { status: "PASS", artifact_uri: "file:///ea" }, { status: "PASS", artifact_uri: "file:///eb" }, { status: "PASS" }, { status: "CLEANED" }], true);
    await runFlow("goal", ctx);
    const workers = calls.filter(c => String(c.params.task).includes("Implement WorkContract"));
    expect(workers).toHaveLength(2);
    expect(workers.every(c => !c.params.tasks)).toBe(true);
  });

  test("isolated batch preserves both evidence URIs", async () => {
    const { ctx } = context([preflight(true), { status: "PASS", artifact_uri: "file:///handoff" }, { status: "PASS", artifact_uri: "file:///d" }, { status: "PASS", artifact_uri: "file:///p", manifest: { waves: [[{ work_id: "a", contract_uri: "file:///a", dependency_uris: [] }, { work_id: "b", contract_uri: "file:///b", dependency_uris: [] }]] } }, { status: "AWAITING_DECISION", questions: [] }, { status: "PASS", manifest: { route: "APPROVED" } }, { status: "PASS" }, { status: "CLEANED" }], true, [{ status: "PASS", artifact_uri: "file:///ea" }, { status: "PASS", artifact_uri: "file:///eb" }]);
    const state = await runFlow("goal", ctx);
    expect(state.workerEvidenceUris).toEqual(["file:///ea", "file:///eb"]);
    expect(state.phase).toBe("COMPLETED");
  });

  test("batch RETRY reruns the same wave and deduplicates evidence", async () => {
    const { ctx } = context([preflight(true), { status: "PASS", artifact_uri: "file:///handoff" }, { status: "PASS", artifact_uri: "file:///d" }, { status: "PASS", artifact_uri: "file:///p", manifest: { waves: [[{ work_id: "a", contract_uri: "file:///a", dependency_uris: [] }, { work_id: "b", contract_uri: "file:///b", dependency_uris: [] }]] } }, { status: "AWAITING_DECISION", questions: [] }, { status: "PASS", manifest: { route: "APPROVED" } }, { status: "AWAITING_DECISION", questions: [] }, { status: "PASS", manifest: { route: "RETRY" } }, { status: "PASS" }, { status: "CLEANED" }], true, undefined, [[{ status: "FAIL", artifact_uri: "file:///bad" }, { status: "PASS", artifact_uri: "file:///good" }], [{ status: "PASS", artifact_uri: "file:///good" }, { status: "PASS", artifact_uri: "file:///good2" }]]);
    const state = await runFlow("goal", ctx);
    expect(state.phase).toBe("COMPLETED");
    expect(state.workerEvidenceUris).toEqual(["file:///bad", "file:///good", "file:///good2"]);
  });

  test("worker failure retries the same contract", async () => {
    const { ctx } = context([preflight(), { status: "PASS", artifact_uri: "file:///d" }, { status: "PASS", artifact_uri: "file:///p", manifest: { waves: [[{ work_id: "a", contract_uri: "file:///a", dependency_uris: [] }]] } }, { status: "AWAITING_DECISION", questions: [] }, { status: "PASS", manifest: { route: "APPROVED" } }, { status: "FAIL", artifact_uri: "file:///bad" }, { status: "AWAITING_DECISION", questions: [] }, { status: "PASS", manifest: { route: "RETRY" } }, { status: "PASS", artifact_uri: "file:///good" }, { status: "PASS" }, { status: "CLEANED" }], true);
    const state = await runFlow("goal", ctx);
    expect(state.phase).toBe("COMPLETED");
  });

  test("IMPLEMENT replan discards abandoned plan evidence", async () => {
    const { ctx, calls } = context([
      preflight(),
      { status: "PASS", artifact_uri: "file:///d" },
      { status: "PASS", artifact_uri: "file:///p1", manifest: { waves: [[{ work_id: "old", contract_uri: "file:///old", dependency_uris: [] }]] } },
      { status: "AWAITING_DECISION", questions: [] },
      { status: "PASS", manifest: { route: "APPROVED" } },
      { status: "FAIL", artifact_uri: "file:///old-evidence" },
      { status: "AWAITING_DECISION", questions: [] },
      { status: "PASS", manifest: { route: "REPLAN", decision_uri: "file:///replan" } },
      { status: "PASS", artifact_uri: "file:///p2", manifest: { waves: [[{ work_id: "new", contract_uri: "file:///new", dependency_uris: [] }]] } },
      { status: "AWAITING_DECISION", questions: [] },
      { status: "PASS", manifest: { route: "APPROVED" } },
      { status: "PASS", artifact_uri: "file:///new-evidence" },
      { status: "PASS" },
      { status: "CLEANED" },
    ], true);
    const state = await runFlow("goal", ctx);
    expect(state.phase).toBe("COMPLETED");
    expect(state.planUri).toBe("file:///p2");
    expect(state.workerEvidenceUris).toEqual(["file:///new-evidence"]);
    expect(state.waveStatus).toEqual(["PASS"]);
    const workers = calls.filter(c => String(c.params.task).includes("Implement WorkContract"));
    expect(workers).toHaveLength(2);
    expect(String(workers[0]?.params.task)).toContain("file:///old");
    expect(String(workers[1]?.params.task)).toContain("file:///new");
    const verifyCalls = calls.filter(c => String(c.params.task).includes("Verify plan"));
    expect(verifyCalls).toHaveLength(1);
    expect(String(verifyCalls[0]?.params.task)).toContain("file:///new-evidence");
    expect(String(verifyCalls[0]?.params.task)).not.toContain("file:///old-evidence");
  });

  test("VERIFY replan discards abandoned plan evidence", async () => {
    const { ctx, calls } = context([
      preflight(),
      { status: "PASS", artifact_uri: "file:///d" },
      { status: "PASS", artifact_uri: "file:///p1", manifest: { waves: [[{ work_id: "old", contract_uri: "file:///old", dependency_uris: [] }]] } },
      { status: "AWAITING_DECISION", questions: [] },
      { status: "PASS", manifest: { route: "APPROVED" } },
      { status: "PASS", artifact_uri: "file:///old-evidence" },
      { status: "FAIL", artifact_uri: "file:///verify-old" },
      { status: "AWAITING_DECISION", questions: [] },
      { status: "PASS", manifest: { route: "REPLAN", decision_uri: "file:///replan" } },
      { status: "PASS", artifact_uri: "file:///p2", manifest: { waves: [[{ work_id: "new", contract_uri: "file:///new", dependency_uris: [] }]] } },
      { status: "AWAITING_DECISION", questions: [] },
      { status: "PASS", manifest: { route: "APPROVED" } },
      { status: "PASS", artifact_uri: "file:///new-evidence" },
      { status: "PASS" },
      { status: "CLEANED" },
    ], true);
    const state = await runFlow("goal", ctx);
    expect(state.phase).toBe("COMPLETED");
    expect(state.planUri).toBe("file:///p2");
    expect(state.workerEvidenceUris).toEqual(["file:///new-evidence"]);
    expect(state.waveStatus).toEqual(["PASS"]);
    const verifyCalls = calls.filter(c => String(c.params.task).includes("Verify plan"));
    expect(verifyCalls).toHaveLength(2);
    expect(String(verifyCalls[0]?.params.task)).toContain("file:///old-evidence");
    expect(String(verifyCalls[1]?.params.task)).toContain("file:///new-evidence");
    expect(String(verifyCalls[1]?.params.task)).not.toContain("file:///old-evidence");
  });

  test("High decision replan re-types, gates again, then verifies", async () => {
    const { ctx } = context([preflight(), { status: "PASS", artifact_uri: "file:///d" }, { status: "PASS", artifact_uri: "file:///p1", manifest: { waves: [] } }, { status: "AWAITING_DECISION", questions: [] }, { status: "PASS", manifest: { route: "REPLAN", decision_uri: "file:///decision" } }, { status: "PASS", artifact_uri: "file:///p2", manifest: { waves: [] } }, { status: "AWAITING_DECISION", questions: [] }, { status: "PASS", manifest: { route: "APPROVED" } }, { status: "PASS" }, { status: "CLEANED" }], true);
    const state = await runFlow("goal", ctx);
    expect(state.phase).toBe("COMPLETED");
    expect(state.planUri).toBe("file:///p2");
  });

  test("cleanup failure never reports completed", async () => {
    const { ctx } = context([preflight(), { status: "PASS", artifact_uri: "file:///d" }, { status: "PASS", artifact_uri: "file:///p", manifest: { waves: [] } }, { status: "AWAITING_DECISION", questions: [] }, { status: "PASS", manifest: { route: "APPROVED" } }, { status: "PASS" }, { status: "FAIL" }], true);
    const state = await runFlow("goal", ctx);
    expect(state.phase).toBe("ABORTED");
  });

  test("invalid structured output aborts instead of throwing", async () => {
    const ctx = {
      hasUI: false,
      ui: { notify() {} },
      task: async () => ({ details: { results: [{ structuredOutput: { status: "invalid", error: "schema_violation" } }] } }),
    } as unknown as Parameters<typeof runFlow>[1];
    const state = await runFlow("goal", ctx);
    expect(state.phase).toBe("ABORTED");
  });

  test("state starts with separated evidence fields", () => {
    const state = createCfState("goal", "flow");
    expect(state.flowId).toBe("flow");
    expect(state.workerEvidenceUris).toEqual([]);
  });
  test("runtime relay ignores another task and rejects concurrent flows", async () => {
    const handlers = new Map<string, Array<(event: Record<string, unknown>) => void>>();
    const responses: CfEnvelope[] = [
      preflight(),
      { status: "PASS", artifact_uri: "file:///discovery" },
      { status: "PASS", artifact_uri: "file:///plan", manifest: { waves: [] } },
      { status: "AWAITING_DECISION", questions: [] },
      { status: "CLEANED" },
    ];
    const notifications: Array<[string, string | undefined]> = [];
    let command: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    let sent = 0;
    let releaseIdle: (() => void) | undefined;
    let holdIdle = true;
    const emit = (name: string, event: Record<string, unknown>) => {
      for (const handler of handlers.get(name) ?? []) handler(event);
    };
    extension({
      on: (name: string, handler: (event: Record<string, unknown>) => void) => {
        handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      },
      registerCommand: (_name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
        command = options.handler;
      },
      getActiveTools: () => ["read"],
      setActiveTools: async () => {},
      sendUserMessage: (content: string) => {
        const id = `relay-${++sent}`;
        const result = reply(responses.shift()!);
        const params = JSON.parse(content.match(/```json\n([\s\S]+)\n```/)?.[1] ?? "");
        const reorderedParams = Object.fromEntries(Object.entries(params).reverse());
        queueMicrotask(() => {
          emit("tool_execution_start", { toolName: "task", toolCallId: "other-task", args: { task: "unrelated" } });
          emit("tool_execution_start", { toolName: "task", toolCallId: id, args: reorderedParams });
          emit("tool_execution_end", { toolName: "task", toolCallId: "other-task", result: reply({ status: "FAIL" }) });
          emit("tool_execution_end", { toolName: "task", toolCallId: id, result });
        });
      },
    } as never);
    if (!command) throw new Error("cf command was not registered");
    const ctx = {
      hasUI: false,
      ui: { notify: (message: string, type?: string) => notifications.push([message, type]) },
      isIdle: () => false,
      setTimeout,
      waitForIdle: () => {
        if (!holdIdle) return Promise.resolve();
        holdIdle = false;
        return new Promise<void>((resolve) => {
          releaseIdle = resolve;
        });
      },
    };
    const first = command("goal", ctx);
    await Promise.resolve();
    await command("another goal", ctx);
    expect(notifications).toContainEqual(["cf already running", "warning"]);
    releaseIdle?.();
    await first;
    expect(sent).toBe(5);
    expect(notifications).toContainEqual(["cf aborted", "warning"]);
  });
  test("runtime relay aborts cleanly when idle waiting rejects", async () => {
    let command: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const notifications: Array<[string, string | undefined]> = [];
    const activeTools: string[][] = [];
    extension({
      on() {},
      registerCommand: (_name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
        command = options.handler;
      },
      getActiveTools: () => ["read"],
      setActiveTools: async (tools: string[]) => {
        activeTools.push(tools);
      },
      sendUserMessage() {},
    } as never);
    if (!command) throw new Error("cf command was not registered");
    await command("goal", {
      hasUI: false,
      ui: { notify: (message: string, type?: string) => notifications.push([message, type]) },
      isIdle: () => false,
      setTimeout,
      waitForIdle: async () => {
        throw new Error("idle failed");
      },
    });
    expect(notifications).toContainEqual(["cf aborted", "warning"]);
    expect(activeTools).toEqual([["task", "ask", "hub"], ["read"]]);
  });
  test("failed tool activation releases the flow for a later command", async () => {
    let command: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const notifications: Array<[string, string | undefined]> = [];
    let activationAttempts = 0;
    extension({
      on() {},
      registerCommand: (_name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
        command = options.handler;
      },
      getActiveTools: () => ["read"],
      setActiveTools: async (tools: string[]) => {
        if (tools[0] === "task" && ++activationAttempts === 1) throw new Error("activation failed");
      },
      sendUserMessage() {},
    } as never);
    if (!command) throw new Error("cf command was not registered");
    const ctx = {
      hasUI: false,
      ui: { notify: (message: string, type?: string) => notifications.push([message, type]) },
      isIdle: () => false,
      setTimeout,
      waitForIdle: async () => {
        throw new Error("idle failed");
      },
    };
    await command("first", ctx);
    await command("second", ctx);
    expect(notifications).toContainEqual(["cf failed: activation failed", "error"]);
    expect(notifications.some(([message]) => message === "cf already running")).toBe(false);
  });
  test("flow remains owned until tool restoration completes", async () => {
    let command: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const notifications: Array<[string, string | undefined]> = [];
    let releaseRestore: (() => void) | undefined;
    let restoreStarted: (() => void) | undefined;
    const restorePending = new Promise<void>((resolve) => {
      restoreStarted = resolve;
    });
    let firstRestore = true;
    extension({
      on() {},
      registerCommand: (_name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
        command = options.handler;
      },
      getActiveTools: () => ["read"],
      setActiveTools: async (tools: string[]) => {
        if (tools[0] === "task") throw new Error("activation failed");
        if (firstRestore) {
          firstRestore = false;
          restoreStarted?.();
          await new Promise<void>((resolve) => {
            releaseRestore = resolve;
          });
        }
      },
      sendUserMessage() {},
    } as never);
    if (!command) throw new Error("cf command was not registered");
    const ctx = { hasUI: false, ui: { notify: (message: string, type?: string) => notifications.push([message, type]) } };
    const first = command("first", ctx);
    await restorePending;
    await command("second", ctx);
    expect(notifications).toContainEqual(["cf already running", "warning"]);
    releaseRestore?.();
    await first;
    await command("third", ctx);
    expect(notifications.filter(([message]) => message === "cf already running")).toHaveLength(1);
  });
});

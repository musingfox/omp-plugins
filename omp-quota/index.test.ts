import { describe, expect, test } from "bun:test";
import extension, { initialQuotaState, parseUsage, providerDeteriorations, transitionQuota } from "./index";

describe("quota parsing", () => {
  test("reads primary usage while ignoring metadata and stderr", () => {
    expect(parseUsage(JSON.stringify({ metadata: { scope: "account" }, stderr: "bad", primary: { utilization: 0.72, resets_at: "tomorrow" } }))).toEqual({
      usedPercent: 72,
      remainingPercent: 28,
      resetAt: "tomorrow",
    });
  });

  test("supports remaining percentage without exposing unrelated fields", () => {
    expect(parseUsage({ quota: { remaining_percentage: 40 }, scope: "ignored" })).toEqual({
      usedPercent: 60,
      remainingPercent: 40,
    });
  });
  test("aggregates provider limits by remaining fraction", () => {
    const snapshot = parseUsage({
      reports: [
        { provider: "alpha", limits: [
          { amount: { remainingFraction: 0.9, usedFraction: 0.1 }, window: { resetsAt: "a" }, status: "ok" },
          { amount: { remainingFraction: 0.35, usedFraction: 0.65 }, window: { resetsAt: "b" }, status: "ok" },
        ] },
        { provider: "beta", limits: [
          { amount: { remainingFraction: 0.6, usedFraction: 0.4 }, window: { resetsAt: "c" }, status: "ok" },
          { amount: { remainingFraction: 0.2, usedFraction: 0.8 }, window: { resetsAt: "d" }, status: "ok" },
        ] },
      ],
    });
    expect(snapshot.providers).toEqual([
      { provider: "alpha", usedPercent: 65, remainingPercent: 35, resetAt: "b", status: "ok" },
      { provider: "beta", usedPercent: 80, remainingPercent: 20, resetAt: "d", status: "ok" },
    ]);
    expect(snapshot.remainingPercent).toBe(20);
  });
});

describe("quota state", () => {
  test("failed refresh preserves last good value and marks it stale", () => {
    const healthy = transitionQuota(initialQuotaState(), { usedPercent: 30, remainingPercent: 70 }).state;
    const failed = transitionQuota(healthy).state;
    expect(failed.lastGood).toEqual(healthy.lastGood);
    expect(failed.stale).toBe(true);
  });

  test("deterioration notifies once per severity band", () => {
    const normal = transitionQuota(initialQuotaState(), { usedPercent: 20, remainingPercent: 80 }).state;
    const warning = transitionQuota(normal, { usedPercent: 85, remainingPercent: 15 });
    expect(warning.notifyDeterioration).toBe(true);
    const repeated = transitionQuota(warning.state, { usedPercent: 88, remainingPercent: 12 });
    expect(repeated.notifyDeterioration).toBe(false);
    const critical = transitionQuota(repeated.state, { usedPercent: 97, remainingPercent: 3 });
    expect(critical.notifyDeterioration).toBe(true);
  });

  test("provider warning toast is only emitted on ok to warning/exhausted", () => {
    const before = { usedPercent: 10, remainingPercent: 90, providers: [{ provider: "alpha", usedPercent: 10, remainingPercent: 90, status: "ok" }] };
    const warning = { usedPercent: 85, remainingPercent: 15, providers: [{ provider: "alpha", usedPercent: 85, remainingPercent: 15, status: "warning" }] };
    const exhausted = { ...warning, providers: [{ ...warning.providers[0], status: "exhausted" }] };
    expect(providerDeteriorations(before, warning)).toEqual(["alpha"]);
    expect(providerDeteriorations(warning, exhausted)).toEqual([]);
  });
});

describe("quota command", () => {
  test("refresh invalidates before reading JSON usage", async () => {
    const calls: string[][] = [];
    const widgets: unknown[] = [];
    let command: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    extension({
      exec: async (name: string, args: string[]) => {
        calls.push([name, ...args]);
        return { stdout: JSON.stringify({ quota: { remaining_percentage: 50 } }) };
      },
      on() {},
      registerCommand(_name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) {
        command = options.handler;
      },
    } as never);
    await command!("refresh", {
      hasUI: true,
      ui: { notify() {}, setWidget(_key: string, content: unknown) { widgets.push(content); } },
    });
    expect(calls.map(call => call.join(" "))).toEqual([
      "omp usage invalidate",
      "omp usage --json",
    ]);
    expect(widgets).toEqual([]);
  });
});

import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";

export type ProviderQuota = {
  provider: string;
  usedPercent: number;
  remainingPercent: number;
  resetAt?: string;
  status?: string;
  noLimits?: boolean;
};

export type QuotaSnapshot = {
  usedPercent: number;
  remainingPercent: number;
  resetAt?: string;
  status?: string;
  providers?: ProviderQuota[];
};
export type QuotaState = {
  enabled: boolean;
  lastGood?: QuotaSnapshot;
  stale: boolean;
  severity: "normal" | "warning" | "critical";
  notifiedSeverity: "normal" | "warning" | "critical";
};

export type QuotaTransition = {
  state: QuotaState;
  notifyDeterioration: boolean;
};

const number = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value <= 1 ? value * 100 : value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/%$/, ""));
    if (Number.isFinite(parsed)) return parsed <= 1 ? parsed * 100 : parsed;
  }
  return undefined;
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

function candidate(value: unknown): QuotaSnapshot | undefined {
  const object = record(value);
  if (!object) return undefined;
  const amount = record(object.amount);
  const window = record(object.window);
  const used = number(object.usedPercent ?? object.used_percentage ?? object.percentUsed ?? object.utilization ?? object.usage ?? amount?.usedFraction);
  const remaining = number(object.remainingPercent ?? object.remaining_percentage ?? object.percentRemaining ?? amount?.remainingFraction);
  const usedPercent = used ?? (remaining === undefined ? undefined : 100 - remaining);
  if (usedPercent === undefined || usedPercent < 0 || usedPercent > 100) return undefined;
  return {
    usedPercent,
    remainingPercent: Math.max(0, Math.min(100, remaining ?? 100 - usedPercent)),
    resetAt: typeof object.resetAt === "string" ? object.resetAt : typeof object.resets_at === "string" ? object.resets_at : typeof window?.resetsAt === "string" ? window.resetsAt : typeof window?.resetsAt === "number" ? new Date(window.resetsAt < 1_000_000_000_000 ? window.resetsAt * 1000 : window.resetsAt).toISOString() : undefined,
    status: typeof object.status === "string" ? object.status : undefined,
  };
}

function aggregateReports(reports: unknown[]): QuotaSnapshot | undefined {
  const byProvider = new Map<string, ProviderQuota>();
  for (const reportValue of reports) {
    const report = record(reportValue);
    if (!report || !Array.isArray(report.limits)) continue;
    const limits = report.limits.map(candidate).filter((value): value is QuotaSnapshot => value !== undefined);
    const provider = typeof report.provider === "string" ? report.provider : typeof report.name === "string" ? report.name : "unknown";
    if (limits.length === 0) {
      if (!byProvider.has(provider)) byProvider.set(provider, { provider, usedPercent: 0, remainingPercent: 0, noLimits: true });
      continue;
    }
    const lowest = limits.reduce((a, b) => a.remainingPercent <= b.remainingPercent ? a : b);
    const status = limits.some(limit => limit.status === "exhausted") ? "exhausted" : limits.some(limit => limit.status === "warning") ? "warning" : limits.some(limit => limit.status === "ok") ? "ok" : undefined;
    const previous = byProvider.get(provider);
    if (!previous || previous.noLimits || lowest.remainingPercent < previous.remainingPercent) {
      byProvider.set(provider, { provider, usedPercent: lowest.usedPercent, remainingPercent: lowest.remainingPercent, resetAt: lowest.resetAt, status });
    }
  }
  const providers = [...byProvider.values()];
  const limited = providers.filter(provider => !provider.noLimits);
  const lowest = (limited.length > 0 ? limited : providers).reduce((a, b) => a.remainingPercent <= b.remainingPercent ? a : b);
  return { ...lowest, providers };
}

export function providerDeteriorations(before: QuotaSnapshot | undefined, after: QuotaSnapshot): string[] {
  if (!before?.providers) return [];
  const prior = new Map(before.providers.map(provider => [provider.provider, provider.status]));
  return (after.providers ?? []).filter(provider => prior.get(provider.provider) === "ok" && (provider.status === "warning" || provider.status === "exhausted")).map(provider => provider.provider);
}

/** Parse only quota values; metadata, scope, and stderr are intentionally ignored. */
export function parseUsage(input: unknown): QuotaSnapshot {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  const root = record(value);
  if (!root) throw new Error("usage output is not an object");
  if (Array.isArray(root.reports)) {
    const aggregated = aggregateReports(root.reports);
    if (aggregated) return aggregated;
  }
  const direct = candidate(root);
  if (direct) return direct;
  for (const key of ["primary", "five_hour", "fiveHour", "quota", "usage"]) {
    const parsed = candidate(root[key]);
    if (parsed) return parsed;
  }
  for (const [key, value] of Object.entries(root)) {
    if (key === "metadata" || key === "scope" || key === "stderr") continue;
    const parsed = candidate(value);
    if (parsed) return parsed;
  }
  throw new Error("usage output has no quota values");
}

export function initialQuotaState(): QuotaState {
  return { enabled: false, stale: false, severity: "normal", notifiedSeverity: "normal" };
}

function severity(usedPercent: number): QuotaState["severity"] {
  return usedPercent >= 95 ? "critical" : usedPercent >= 80 ? "warning" : "normal";
}

export function transitionQuota(state: QuotaState, snapshot?: QuotaSnapshot): QuotaTransition {
  if (!snapshot) return { state: { ...state, stale: Boolean(state.lastGood) }, notifyDeterioration: false };
  const nextSeverity = severity(snapshot.usedPercent);
  const order = { normal: 0, warning: 1, critical: 2 };
  const notifyDeterioration = order[nextSeverity] > order[state.severity] && nextSeverity !== state.notifiedSeverity;
  return {
    state: {
      ...state,
      lastGood: snapshot,
      stale: false,
      severity: nextSeverity,
      notifiedSeverity: notifyDeterioration ? nextSeverity : state.notifiedSeverity,
    },
    notifyDeterioration,
  };
}

export function formatQuota(snapshot: QuotaSnapshot, stale = false): string {
  const reset = snapshot.resetAt ? ` | reset ${snapshot.resetAt}` : "";
  if (snapshot.providers?.length) {
    const details = snapshot.providers.map(provider => provider.noLimits ? `${provider.provider}: — / no limits reported` : `${provider.provider}: ${provider.usedPercent.toFixed(0)}% used`).join(" | ");
    return `${details}${reset}${stale ? " [stale]" : ""}`;
  }
  return `Quota ${snapshot.usedPercent.toFixed(0)}% used (${snapshot.remainingPercent.toFixed(0)}% remaining)${reset}${stale ? " [stale]" : ""}`;
}

type CommandHost = ExtensionCommandContext & {
  setInterval?: (callback: () => void | Promise<void>, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  sessionManager?: { getBranch(): Array<{ type?: string; customType?: string; data?: unknown }> };
};

async function readUsage(exec: ExtensionAPI["exec"]): Promise<QuotaSnapshot> {
  const result = await Promise.race([
    exec("omp", ["usage", "--json"], { timeout: 10_000 }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("usage timed out")), 10_000)),
  ]);
  const text = typeof result === "string" ? result : result.stdout ?? "";
  return parseUsage(JSON.parse(text));
}

const extension = (pi: ExtensionAPI) => {
  let state = initialQuotaState();
  let timerInstalled = false;
  let timerHandle: unknown;

  const restoreState = (ctx: CommandHost) => {
    const entries = ctx.sessionManager?.getBranch() ?? [];
    for (const entry of entries) {
      if (entry.type !== "custom" || entry.customType !== "com.musingfox.omp-quota.state") continue;
      const data = record(entry.data);
      if (typeof data?.enabled === "boolean") state = { ...state, enabled: data.enabled };
    }
  };
  let currentContext: CommandHost | undefined;
  const render = (ctx: CommandHost) => {
    if (!state.enabled || !state.lastGood) return;
    const text = formatQuota(state.lastGood, state.stale);
    if (ctx.hasUI) ctx.ui.setWidget("quota", [text]);
    else ctx.ui.notify(text, "info");
  };

  const installTimer = (ctx: CommandHost) => {
    if (timerInstalled || !ctx.setInterval) return;
    timerInstalled = true;
    timerHandle = ctx.setInterval(() => currentContext ? refresh(currentContext) : undefined, 5 * 60 * 1000);
  };
  const refresh = async (ctx: CommandHost, invalidate = false) => {
    try {
      if (invalidate) {
        await pi.exec("omp", ["usage", "invalidate"], { timeout: 10_000 });
      }
      const previous = state.lastGood;
      const snapshot = await readUsage(pi.exec.bind(pi));
      const next = transitionQuota(state, snapshot);
      state = next.state;
      render(ctx);
      for (const provider of providerDeteriorations(previous, snapshot)) ctx.ui.notify(`Quota warning: ${provider}`, "warning");
    } catch {
      state = transitionQuota(state).state;
      render(ctx);
      if (!state.lastGood) ctx.ui.notify("Quota unavailable", "warning");
    }
  };

  pi.on("session_start", (_event, rawCtx) => {
    const ctx = rawCtx as CommandHost;
    restoreState(ctx);
    currentContext = ctx;
    installTimer(ctx);
    void refresh(ctx);
  });
  for (const eventName of ["session_branch", "session_tree"] as const) {
    pi.on(eventName, (_event, rawCtx) => {
      restoreState(rawCtx as CommandHost);
    });
  }


  pi.on("session_shutdown", () => {
    if (timerHandle !== undefined && currentContext?.clearTimer) currentContext.clearTimer(timerHandle);
    timerHandle = undefined;
    timerInstalled = false;
    currentContext = undefined;
  });

  pi.registerCommand("quota", {
    description: "Toggle quota widget or refresh quota usage",
    handler: async (args, rawCtx) => {
      const ctx = rawCtx as CommandHost;
      currentContext = ctx;
      if (args.trim() === "refresh") {
        await refresh(ctx, true);
        return;
      }
      state = { ...state, enabled: !state.enabled };
      pi.appendEntry("com.musingfox.omp-quota.state", { enabled: state.enabled });
      if (!state.enabled) {
        if (ctx.hasUI) ctx.ui.setWidget("quota", []);
        else ctx.ui.notify("Quota disabled", "info");
        return;
      }
      installTimer(ctx);
      await refresh(ctx);
    },
  });
};

export default extension;

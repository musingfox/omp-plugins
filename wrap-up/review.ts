import { fileURLToPath } from "node:url";

export interface ReviewParams {
	operations: { operation: string; evidence: string; tool: string }[];
	suggested: number;
	reason: string;
}

export const reviewSchema = {
	type: "object",
	properties: {
		operations: { type: "array", items: { type: "object", properties: { operation: { type: "string" }, evidence: { type: "string" }, tool: { type: "string" } }, required: ["operation", "evidence", "tool"], additionalProperties: false } },
		suggested: { type: "integer", minimum: 1, maximum: 5 },
		reason: { type: "string" },
	},
	required: ["operations", "suggested", "reason"],
	additionalProperties: false,
};

interface ReviewContext {
	host: "omp" | "pi";
	interactive: boolean;
	sessionId: () => string;
	cwd: string;
	current: () => boolean;
	select: (title: string, options: string[]) => Promise<string | undefined>;
	input: (title: string, placeholder: string) => Promise<string | undefined>;
	exec: (command: string, args: string[], signal?: AbortSignal) => Promise<{ code: number; stdout: string; stderr: string; killed?: boolean }>;
}

const clean = (text: string) => text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");

export async function review(params: ReviewParams, ctx: ReviewContext, signal?: AbortSignal) {
	const result = (value: object, isError = false) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value, isError });
	if (!ctx.interactive) return result({ error: "wrap-up requires an interactive terminal; no rating or operations recorded" }, true);
	const session = ctx.sessionId();
	if (!session?.trim()) return result({ error: "No native session ID" }, true);
	const valid = () => !signal?.aborted && ctx.current() && ctx.sessionId() === session;
	const cancelled = () => result({ cancelled: true, selected: [], ratingWritten: false });
	const selected = new Set<number>();
	while (true) {
		if (!valid()) return cancelled();
		const options = ["完成選擇", ...params.operations.map((op, i) => `${selected.has(i) ? "[x]" : "[ ]"} ${i + 1}. ${clean(op.operation)} — ${clean(op.evidence)} (${clean(op.tool)})`)];
		const choice = await ctx.select("只執行勾選的收尾操作；取消不記分", options);
		if (!valid() || choice === undefined) return cancelled();
		if (choice === options[0]) break;
		const index = options.indexOf(choice) - 1;
		if (index < 0) return cancelled();
		if (selected.has(index)) selected.delete(index); else selected.add(index);
	}
	const scores = [params.suggested, ...[5, 4, 3, 2, 1].filter((score) => score !== params.suggested)];
	const labels = ["", "未達成目標", "只完成部分", "多次糾正後達成", "達成但有小繞路", "一次到位"];
	const options = scores.map((score) => `${score} — ${labels[score]}${score === params.suggested ? "（建議）" : ""}`);
	const answer = await ctx.select(`本次評分：${clean(params.reason)}`, options);
	if (!valid() || answer === undefined) return cancelled();
	const score = scores[options.indexOf(answer)];
	if (!score) return cancelled();
	const userReason = await ctx.input("補充評分理由；直接 Enter 沿用建議，Esc 取消", clean(params.reason));
	if (!valid() || userReason === undefined) return cancelled();
	const reason = userReason.trim() ? `${userReason}\n建議理由：${params.reason}` : params.reason;
	const script = fileURLToPath(new URL("./skills/wrap-up/scripts/rate.mjs", import.meta.url));
	const saved = await ctx.exec("node", [script, "--host", ctx.host, "--session", session, "--score", String(score), "--suggested", String(params.suggested), "--reason", reason, "--project", ctx.cwd], signal);
	if (saved.code !== 0 || saved.killed || !saved.stdout.trim()) return result({ error: saved.stderr.trim() || "Rating write failed; do not execute operations", selected: [] }, true);
	if (!valid()) return result({ ratingReceipt: saved.stdout.trim(), error: "Session changed; do not execute operations", selected: [] }, true);
	return result({ host: ctx.host, session_id: session, score, suggested: params.suggested, reason, ratingReceipt: saved.stdout.trim(), selected: [...selected].sort((a, b) => a - b).map((i) => params.operations[i]), instruction: "Execute only selected operations in the skill's order. Obtain separate explicit approval before push, release, destructive or global-rule changes. Report each receipt." });
}

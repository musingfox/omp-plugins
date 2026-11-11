import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { readFileSync } from "node:fs";
import { review, reviewSchema, type ReviewParams } from "./review";

export default function extension(omp: ExtensionAPI): void {
	let epoch = 0;
	omp.on("session_start", () => { epoch++; });
	omp.on("session_shutdown", () => { epoch++; });
	omp.on("input", () => { epoch++; });
	omp.registerCommand("wrap-up", {
		description: "依證據收尾並記錄本次會話評分",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI || ctx.mode !== "tui") {
				process.stderr.write("wrap-up: requires an interactive terminal; no rating or operations recorded\n");
				return;
			}
			await omp.sendUserMessage(readFileSync(new URL("./skills/wrap-up/SKILL.md", import.meta.url), "utf8"), ctx.isIdle() ? undefined : { deliverAs: "followUp" });
		},
	});
	omp.registerTool({
		name: "wrap_up_review", label: "收尾選擇與評分",
		description: "Present evidence-backed close-out operations and a suggested score to the user. Persist their rating before returning only their selected operations. Never invent consent or call this for unrelated work.",
		parameters: reviewSchema, approval: "write", loadMode: "essential",
		execute: async (_id, params: ReviewParams, signal, _update, ctx) => {
			const request = epoch;
			return review(params, {
				host: "omp", interactive: ctx.hasUI && ctx.mode === "tui", cwd: ctx.cwd,
				sessionId: () => ctx.sessionManager.getSessionId(), current: () => epoch === request,
				select: (title, options) => ctx.ui.select(title, options, { signal }),
				input: (title, placeholder) => ctx.ui.input(title, placeholder, { signal }),
				exec: (command, args, abort) => omp.exec(command, args, { signal: abort }),
			}, signal);
		},
	});
}

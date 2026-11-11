import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { review } from "./review";

export default function extension(pi: ExtensionAPI): void {
	let epoch = 0;
	pi.on("session_start", () => { epoch++; });
	pi.on("session_shutdown", () => { epoch++; });
	pi.on("input", () => { epoch++; });
	pi.registerCommand("wrap-up", {
		description: "依證據收尾並記錄本次會話評分",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI || ctx.mode !== "tui") {
				process.stderr.write("wrap-up: requires an interactive terminal; no rating or operations recorded\n");
				return;
			}
			pi.sendUserMessage(readFileSync(new URL("./skills/wrap-up/SKILL.md", import.meta.url), "utf8"), ctx.isIdle() ? undefined : { deliverAs: "followUp" });
		},
	});
	pi.registerTool({
		name: "wrap_up_review", label: "收尾選擇與評分",
		description: "Present evidence-backed close-out operations and a suggested score to the user. Persist their rating before returning only their selected operations. Never invent consent or call this for unrelated work.",
		parameters: Type.Object({
			operations: Type.Array(Type.Object({ operation: Type.String(), evidence: Type.String(), tool: Type.String() }, { additionalProperties: false })),
			suggested: Type.Integer({ minimum: 1, maximum: 5 }), reason: Type.String(),
		}, { additionalProperties: false }),
		async execute(_id, params, signal, _update, ctx) {
			const request = epoch;
			return review(params, {
				host: "pi", interactive: ctx.hasUI && ctx.mode === "tui", cwd: ctx.cwd,
				sessionId: () => ctx.sessionManager.getSessionId(), current: () => epoch === request,
				select: (title, options) => ctx.ui.select(title, options, { signal }),
				input: (title, placeholder) => ctx.ui.input(title, placeholder, { signal }),
				exec: (command, args, abort) => pi.exec(command, args, { signal: abort }),
			}, signal);
		},
	});
}

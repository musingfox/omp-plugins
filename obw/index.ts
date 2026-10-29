import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { parseKey, truncateToWidth } from "@oh-my-pi/pi-tui";
import { createIssueBrowser, runIssueCommand, sanitizeText } from "./issue";
import { createPmTools, PM_TOOLS, pmToolResult } from "./pm";

export {
	applyIssueCards, createIssueComponent, initialIssueState, isSafeCardPath,
	nextIssueRequest, parseCardBody, parseDashboardViews, parseIssueCards,
	parseIssueViews, renderMermaidFallback, sanitizeText, visibleIssueRows,
} from "./issue";
export type { IssueCard, IssueComponent, IssueMode, IssueState, IssueView, IssueVisibleRow } from "./issue";

export default function extension(omp: ExtensionAPI): void {
	const exec = omp.exec.bind(omp);
	const pm = createPmTools(exec);
	for (const tool of PM_TOOLS) {
		omp.registerTool({
			...tool, approval: "write", loadMode: "essential",
			execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => pmToolResult(await pm.run(tool.name, params, ctx.cwd)),
		});
	}
	omp.registerCommand("issue", {
		description: "Browse Obsidian Workspace task views and cards",
		handler: async (argument, ctx) => {
			await runIssueCommand(argument, ctx.cwd, exec, {
				mode: ctx.mode,
				report: (message) => {
					if (ctx.mode === "print" || ctx.mode === "json") process.stderr.write(`obw: ${sanitizeText(message)}\n`);
					else ctx.ui.notify(sanitizeText(message), "info");
				},
				open: async (config, view) => {
					await ctx.ui.custom<void>((tui, _theme, keybindings, done) => {
						const browser = createIssueBrowser(config, exec, {
							changed: () => tui.requestRender(), close: () => done(),
							fitLine: (text, width) => truncateToWidth(sanitizeText(text, Number.MAX_SAFE_INTEGER), width),
						});
						void browser.start(view);
						return {
							render: (width) => browser.render(width), invalidate: () => browser.invalidate(), dispose: () => browser.dispose(),
							handleInput: (input) => browser.handleInput(keybindings.matches(input, "app.interrupt") ? "escape" : parseKey(input) ?? input),
						};
					});
				},
			});
		},
	});
}

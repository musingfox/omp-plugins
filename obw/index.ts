import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { parseKey, truncateToWidth } from "@oh-my-pi/pi-tui";
import { createIssueBrowser, runIssueCommand, sanitizeText } from "./issue";
import { createPmTools, PM_TOOLS, pmToolResult } from "./pm";
import { createBindingController, getBinding, hasPersistedConversation, hasPersistedSource, type BindingContext } from "./session";
import { readWorkspaceConfig } from "./workspace";
import { createWritebackController, type WritebackStartContext } from "./writeback";

export {
	applyIssueCards, createIssueComponent, initialIssueState, isSafeCardPath,
	nextIssueRequest, parseCardBody, parseDashboardViews, parseIssueCards,
	parseIssueViews, renderMermaidFallback, sanitizeText, visibleIssueRows,
} from "./issue";
export type { IssueCard, IssueComponent, IssueMode, IssueState, IssueView, IssueVisibleRow } from "./issue";

const USER_PERSIST_WAIT_MS = 2_000;
function findUser(ctx: ExtensionContext, timestamp: number) {
	return ctx.sessionManager.getBranch().findLast((entry) => entry.type === "message" && entry.message.role === "user" && entry.message.timestamp === timestamp);
}

export default function extension(omp: ExtensionAPI): void {
	const exec = omp.exec.bind(omp);
	const pm = createPmTools(exec);
	for (const tool of PM_TOOLS) {
		omp.registerTool({
			...tool, approval: "write", loadMode: "essential",
			execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => pmToolResult(await pm.run(tool.name, params, ctx.cwd)),
		});
	}
	const bindings = createBindingController(exec, "omp");
	const writebacks = createWritebackController(exec);
	let epoch = 0;
	let uiRevision = 0;
	let closeBrowser: (() => void) | undefined;
	const invalidate = () => { epoch++; bindings.invalidate(); writebacks.invalidate(); };
	const replaceContext = () => { uiRevision++; invalidate(); closeBrowser?.(); };
	const report = (ctx: ExtensionContext, message: string, type: "info" | "warning" = "info") => {
		const text = sanitizeText(message, Number.MAX_SAFE_INTEGER);
		if (ctx.mode === "print" || ctx.mode === "json") process.stderr.write(`obw: ${text}\n`);
		else ctx.ui.notify(text, type);
	};
	const restore = (ctx: ExtensionContext) => {
		const binding = getBinding(ctx.sessionManager.getBranch(), ctx.sessionManager.getSessionId());
		ctx.ui.setStatus("obw-binding", binding ? `OBW: ${sanitizeText(binding.cardPath)}` : undefined);
	};
	const context = (ctx: ExtensionCommandContext): BindingContext => ({
		sessionId: () => ctx.sessionManager.getSessionId(),
		branch: () => ctx.sessionManager.getBranch(),
		isPersisted: () => hasPersistedConversation(ctx.sessionManager.getSessionFile(), ctx.sessionManager.getBranch()),
		append: (binding) => { omp.appendEntry("obw-binding", binding); restore(ctx); },
		confirm: (owner) => ctx.hasUI ? ctx.ui.confirm("Replace task binding?", `This card belongs to session ${sanitizeText(owner)}. Replace it with this session?`) : Promise.resolve(false),
	});
	const writebackContext = (ctx: ExtensionContext): WritebackStartContext => ({
		sessionId: () => ctx.sessionManager.getSessionId(),
		branch: () => ctx.sessionManager.getBranch(),
		isPersisted: (requiredIds) => hasPersistedSource(ctx.sessionManager.getSessionFile(), ctx.sessionManager.getBranch(), requiredIds),
		isIdle: () => ctx.isIdle(),
		hasPendingMessages: () => ctx.hasPendingMessages(),
		appendReceipt: (receipt) => omp.appendEntry("obw-writeback", receipt),
	});
	omp.on("input", invalidate);
	// User-approved OMP boundary (dual-host-plan §9): OMP fires a turn's first
	// `context` before it emits the user's message_end (agent-loop.ts:1395,1447-1451).
	// message_end reaches extensions after the session queued the user's write
	// (agent-session.ts:4561-4563, 3850-3859), but nothing awaits that write, so
	// wait a bounded time for the entry to reach the branch. The loop does not wait
	// for this handler; the record can land after the model request starts.
	omp.on("message_end", async (event, ctx) => {
		const message = event.message;
		// Work start records a request the user made. Auto-continue starts a fresh
		// run, but the agent sends it as a developer message (agent-session.ts:5478-5487),
		// so it is not the user's request; synthetic users are system-injected too
		// (pi-ai types.ts:1191). A steer joins a turn already under way.
		if (message.role !== "user" || message.steering || message.synthetic) return;
		const request = epoch;
		try {
			if (!getBinding(ctx.sessionManager.getBranch(), ctx.sessionManager.getSessionId())) return;
			const deadline = Date.now() + USER_PERSIST_WAIT_MS;
			let user = findUser(ctx, message.timestamp);
			while (!user && request === epoch && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 10));
				user = findUser(ctx, message.timestamp);
			}
			// The core captures its own revision only on entry; changes during the wait are caught here.
			if (request !== epoch) throw new Error("Work start invalidated by session, branch, input or binding change while waiting for the user entry");
			if (!user) { report(ctx, "Work start refused: the user message did not reach the session branch", "warning"); return; }
			const receipt = await writebacks.recordStart(writebackContext(ctx), user.id);
			if (!receipt.alreadyRecorded) report(ctx, `Work start verified: ${receipt.sourceEntryId}`, "info");
		} catch (error) { report(ctx, `Work start failed: ${error instanceof Error ? error.message : String(error)}`, "warning"); }
	});
	const reload = (_event: unknown, ctx: ExtensionContext) => { replaceContext(); restore(ctx); };
	omp.on("session_start", reload);
	omp.on("session_switch", reload);
	omp.on("session_branch", reload);
	omp.on("session_tree", reload);
	omp.on("session_before_switch", replaceContext);
	omp.on("session_before_branch", replaceContext);
	omp.on("session_before_tree", replaceContext);
	omp.on("session_shutdown", replaceContext);
	omp.registerCommand("obw-bind", {
		description: "Bind this persisted session to a project task path",
		handler: async (argument, ctx) => {
			invalidate();
			const request = epoch;
			try {
				const config = await readWorkspaceConfig(ctx.cwd);
				if (request !== epoch) throw new Error("Binding request invalidated while resolving config");
				await bindings.bind(config, argument, context(ctx));
				report(ctx, "Bound this session; card session readback verified");
			} catch (error) { report(ctx, `Bind failed: ${error instanceof Error ? error.message : String(error)}`); }
		},
	});
	omp.registerCommand("obw-unbind", {
		description: "Remove the active-branch task binding without altering the vault",
		handler: async (_argument, ctx) => { invalidate(); bindings.unbind(context(ctx)); report(ctx, "Unbound this session's active branch"); },
	});
	omp.registerCommand("obw-sync", {
		description: "Sync the current completed reply to the bound task and verify readback",
		handler: async (_argument, ctx) => {
			try {
				const receipt = await writebacks.sync({ ...writebackContext(ctx), waitForIdle: () => ctx.waitForIdle() });
				report(ctx, `Sync verified: ${receipt.sourceEntryId} → ${receipt.cardPath}${receipt.runPath ? `; full text ${receipt.runPath}` : ""}${receipt.alreadyRecorded ? " (already recorded)" : ""}`);
			} catch (error) { report(ctx, `Sync failed: ${error instanceof Error ? error.message : String(error)}`, "warning"); }
		},
	});
	omp.registerCommand("issue", {
		description: "Browse Obsidian Workspace tasks; card keys b Bind / u Unbind",
		handler: async (argument, ctx) => {
			closeBrowser?.();
			const request = ++uiRevision;
			await runIssueCommand(argument, ctx.cwd, exec, {
				mode: ctx.mode,
				report: (message) => report(ctx, message),
				open: async (config, view) => {
					if (request !== uiRevision) throw new Error("Issue request invalidated by context change");
					await ctx.ui.custom<void>((tui, _theme, keybindings, done) => {
						const browser = createIssueBrowser(config, exec, {
							changed: () => tui.requestRender(), close: () => done(),
							fitLine: (text, width) => truncateToWidth(sanitizeText(text, Number.MAX_SAFE_INTEGER), width),
							bind: (path) => {
								invalidate();
								return bindings.bind(config, path, { ...context(ctx), confirm: (owner) => browser.confirmReplacement(owner) });
							},
							unbind: () => { invalidate(); bindings.unbind(context(ctx)); },
							cancelBinding: invalidate,
						});
						closeBrowser = () => { browser.dispose(); done(); };
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

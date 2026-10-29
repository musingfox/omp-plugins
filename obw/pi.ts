import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parseKey, truncateToWidth } from "@earendil-works/pi-tui";
import { createIssueBrowser, runIssueCommand, sanitizeText } from "./issue";
import { createBindingController, getBinding, hasPersistedConversation, hasPersistedSource, type BindingContext } from "./session";
import { readWorkspaceConfig } from "./workspace";
import { createWritebackController, type WritebackStartContext } from "./writeback";

export default function extension(pi: ExtensionAPI): void {
	const exec = pi.exec.bind(pi);
	const bindings = createBindingController(exec);
	const writebacks = createWritebackController(exec);
	let epoch = 0;
	let uiRevision = 0;
	let closeBrowser: (() => void) | undefined;
	const invalidate = () => { epoch++; bindings.invalidate(); writebacks.invalidate(); };
	const replaceContext = () => { uiRevision++; invalidate(); closeBrowser?.(); };
	const report = (ctx: ExtensionContext, message: string, type: "info" | "warning" = "info") => {
		const text = sanitizeText(message, Number.MAX_SAFE_INTEGER);
		if (ctx.mode === "print" || ctx.mode === "json") console.error(`obw: ${text}`);
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
		append: (binding) => { pi.appendEntry("obw-binding", binding); restore(ctx); },
		confirm: (owner) => ctx.hasUI ? ctx.ui.confirm("Replace task binding?", `This card belongs to session ${sanitizeText(owner)}. Replace it with this session?`) : Promise.resolve(false),
	});
	const writebackContext = (ctx: ExtensionContext): WritebackStartContext => ({
		sessionId: () => ctx.sessionManager.getSessionId(),
		branch: () => ctx.sessionManager.getBranch(),
		isPersisted: (requiredIds) => hasPersistedSource(ctx.sessionManager.getSessionFile(), ctx.sessionManager.getBranch(), requiredIds),
		isIdle: () => ctx.isIdle(),
		hasPendingMessages: () => ctx.hasPendingMessages(),
		appendReceipt: (receipt) => pi.appendEntry("obw-writeback", receipt),
	});
	pi.on("input", invalidate);
	// Pi 1.1.0 appends delivered users before context and awaits it before a
	// normal model request. This observer does not cover pre-context failures.
	pi.on("context", async (_event, ctx) => {
		try {
			const entries = ctx.sessionManager.getBranch();
			if (!getBinding(entries, ctx.sessionManager.getSessionId())) return;
			const user = entries.findLast((entry) => entry.type === "message" && entry.message.role === "user");
			if (!user) { report(ctx, "Work start refused: no current user entry", "warning"); return; }
			const receipt = await writebacks.recordStart(writebackContext(ctx), user.id);
			if (!receipt.alreadyRecorded) report(ctx, `Work start verified: ${receipt.sourceEntryId}`, "info");
		} catch (error) { report(ctx, `Work start failed: ${error instanceof Error ? error.message : String(error)}`, "warning"); }
	});
	pi.on("session_start", (_event, ctx) => { replaceContext(); restore(ctx); });
	pi.on("session_tree", (_event, ctx) => { replaceContext(); restore(ctx); });
	pi.on("session_before_tree", replaceContext);
	pi.on("session_before_switch", replaceContext);
	pi.on("session_before_fork", replaceContext);
	pi.on("session_shutdown", replaceContext);
	pi.registerCommand("obw-bind", {
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
	pi.registerCommand("obw-unbind", {
		description: "Remove the active-branch task binding without altering the vault",
		handler: async (_argument, ctx) => { invalidate(); bindings.unbind(context(ctx)); report(ctx, "Unbound this session's active branch"); },
	});
	pi.registerCommand("obw-sync", {
		description: "Sync the current completed reply to the bound task and verify readback",
		handler: async (_argument, ctx) => {
			try {
				const receipt = await writebacks.sync({ ...writebackContext(ctx), waitForIdle: () => ctx.waitForIdle() });
				report(ctx, `Sync verified: ${receipt.sourceEntryId} → ${receipt.cardPath}${receipt.runPath ? `; full text ${receipt.runPath}` : ""}${receipt.alreadyRecorded ? " (already recorded)" : ""}`);
			} catch (error) { report(ctx, `Sync failed: ${error instanceof Error ? error.message : String(error)}`, "warning"); }
		},
	});
	pi.registerCommand("issue", {
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

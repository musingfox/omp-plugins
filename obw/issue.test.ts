import { expect, test } from "bun:test";
import { createIssueBrowser, runIssueCommand, parseIssueCards } from "./issue";
import type { IssueExec } from "./workspace";

const config = { vault: "V", project: "P" };
const output = (stdout: string) => ({ code: 0, killed: false, stdout, stderr: "" });
test("issue refuses rpc/json/print even when UI is available, before config or CLI", async () => {
	for (const mode of ["rpc", "json", "print"]) {
		let opened = false; let called = false; const messages: string[] = [];
		await runIssueCommand("", "/missing", async () => { called = true; return output(""); }, {
			mode, report: (message) => { messages.push(message); }, open: async () => { opened = true; },
		});
		expect(opened).toBe(false); expect(called).toBe(false); expect(messages[0]).toContain("TUI");
	}
});
test("missing config never invokes CLI or opens custom UI", async () => {
	let called = false;
	await runIssueCommand("", "/missing", async () => { called = true; return output(""); }, { mode: "tui", report: () => {}, open: async () => { throw new Error("must not open"); } });
	expect(called).toBe(false);
});
test("malformed list output is not an empty list", () => {
	for (const value of [{}, { files: "wrong" }, [null], [{ status: "todo" }]]) expect(() => parseIssueCards(value)).toThrow();
	expect(parseIssueCards([])).toEqual([]);
});
test("issue view navigation and card back/exit discard delayed results", async () => {
	let release: ((value: ReturnType<typeof output>) => void) | undefined;
	const pending = new Promise<ReturnType<typeof output>>((resolve) => { release = resolve; });
	let queries = 0;
	const exec: IssueExec = async (_command, args) => {
		if (args[1] === "read" && args[2].endsWith("dashboard.base")) return output("views:\n - name: All Tasks\n - name: Active\n");
		if (args[1] === "base:query") { queries++; return output('[{"path":"pm/P/tasks/a.md","title":"A"}]'); }
		return pending;
	};
	let updates = 0; let closed = false;
	const browser = createIssueBrowser(config, exec, { changed: () => { updates++; }, close: () => { closed = true; } });
	await browser.start("");
	expect(browser.render().join("\n")).toContain("All Tasks");
	browser.handleInput("down"); browser.handleInput("enter"); // open first card below todo heading
	browser.handleInput("left"); // back while read pending
	const before = updates;
	release?.(output("LATE CARD")); await browser.idle();
	expect(updates).toBe(before); expect(browser.render().join("\n")).not.toContain("LATE CARD");
	expect(queries).toBe(1);
	browser.handleInput("left"); expect(browser.render().join("\n")).toContain("Views");
	browser.handleInput("down"); browser.handleInput("enter"); await browser.idle();
	expect(browser.render().join("\n")).toContain("Active");
	browser.handleInput("escape"); expect(closed).toBe(true);
});
test("closed UI and newer views ignore older CLI results", async () => {
	let release: ((value: ReturnType<typeof output>) => void) | undefined;
	const pending = new Promise<ReturnType<typeof output>>((resolve) => { release = resolve; });
	const browser = createIssueBrowser(config, async (_command, args) => args[1] === "read" ? output("views:\n - name: All Tasks\n - name: Active\n") : args.includes("view=Active") ? output('[{"title":"new","path":"pm/P/tasks/new.md"}]') : pending, { changed: () => {}, close: () => {} });
	const started = browser.start(""); await Promise.resolve(); await Promise.resolve();
	browser.handleInput("left"); browser.handleInput("down"); browser.handleInput("enter");
	release?.(output('[{"title":"old","path":"pm/P/tasks/old.md"}]')); await started; await browser.idle();
	expect(browser.render().join("\n")).not.toContain("old");
	browser.dispose(); const before = browser.render(); await browser.idle(); expect(browser.render()).toEqual(before);
});
test("UI Unbind invalidates a delayed Bind receipt", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let unbound = false;
  const browser = createIssueBrowser(config, async (_command, args) => output(args[1] === "base:query" ? '[{"title":"A","path":"pm/P/tasks/a.md"}]' : args[2].endsWith("dashboard.base") ? "views:\n - name: All Tasks\n" : "---\ntitle: A\n---\nbody"), {
    changed() {}, close() {}, bind: async () => gate, unbind: () => { unbound = true; },
  });
  await browser.start(""); browser.handleInput("down"); browser.handleInput("enter"); await browser.idle();
  browser.handleInput("b"); browser.handleInput("u"); release?.(); await browser.idle();
  expect(unbound).toBe(true);
  expect(browser.render().join("\n")).toContain("Unbound this session");
  expect(browser.render().join("\n")).not.toContain("Bound this session");
});

test("Back during the first dashboard read preserves the only metadata request", async () => {
	for (const key of ["left", "backspace", "\u001b[D"]) {
		let entered: (() => void) | undefined;
		let release: ((value: ReturnType<typeof output>) => void) | undefined;
		const readEntered = new Promise<void>((resolve) => { entered = resolve; });
		const dashboard = new Promise<ReturnType<typeof output>>((resolve) => { release = resolve; });
		let queries = 0;
		const browser = createIssueBrowser(config, async (_command, args) => {
			if (args[1] === "read") { entered?.(); return dashboard; }
			queries++;
			return output("[]");
		}, { changed() {}, close() {} });
		const started = browser.start("");
		await readEntered;
		browser.handleInput(key);
		expect(browser.render().join("\n")).toContain("All Tasks");
		release?.(output("views:\n - name: All Tasks\n - name: Active\n"));
		await started;
		expect(queries).toBe(1);
		expect(browser.render().join("\n")).not.toContain("Loading");
		browser.handleInput("left");
		expect(browser.render().join("\n")).toContain("Views");
		expect(browser.render().join("\n")).toContain("Active");
		browser.dispose();
	}
});

function approvalBrowser() {
	let closed = false;
	let entered: (() => void) | undefined;
	let completed: (() => void) | undefined;
	const confirmationEntered = new Promise<void>((resolve) => { entered = resolve; });
	const uiCompleted = new Promise<void>((resolve) => { completed = resolve; });
	const approvals: boolean[] = [];
	const browser = createIssueBrowser(config, async (_command, args) => output(
		args[1] === "base:query" ? '[{"title":"A","path":"pm/P/tasks/a.md"}]'
			: args[2].endsWith("dashboard.base") ? "views:\n - name: Active\n"
				: "---\ntitle: A\n---\nvisible card body",
	), {
		changed() {},
		close() { closed = true; completed?.(); },
		bind: async () => {
			entered?.();
			const approved = await browser.confirmReplacement("foreign-session");
			approvals.push(approved);
			if (!approved) throw new Error("Replacement binding was not approved");
		},
	});
	return { browser, approvals, confirmationEntered, uiCompleted, isClosed: () => closed };
}

test("inline replacement approval and rejection retain the browser and a visible receipt", async () => {
	for (const key of ["y", "n"]) {
		const f = approvalBrowser();
		await f.browser.start("Active");
		f.browser.handleInput("enter");
		await f.browser.idle();
		f.browser.handleInput("b");
		await f.confirmationEntered;
		expect(f.browser.render().join("\n")).toContain("Replace task binding?");
		expect(f.browser.render().join("\n")).toContain("foreign-session");
		expect(f.isClosed()).toBe(false);
		f.browser.handleInput(key);
		await f.browser.idle();
		expect(f.approvals).toEqual([key === "y"]);
		expect(f.browser.render().join("\n")).toContain("visible card body");
		expect(f.browser.render().join("\n")).toContain(key === "y" ? "Bound this session" : "not approved");
		f.browser.handleInput("left");
		expect(f.browser.render().join("\n")).toContain("Active");
		f.browser.handleInput("escape");
		await f.uiCompleted;
		expect(f.isClosed()).toBe(true);
	}
});

test("Exit or context disposal resolves pending replacement approval without binding", async () => {
	for (const action of ["exit", "dispose"]) {
		const f = approvalBrowser();
		await f.browser.start("Active");
		f.browser.handleInput("enter");
		await f.browser.idle();
		f.browser.handleInput("b");
		await f.confirmationEntered;
		expect(f.browser.render().join("\n")).toContain("Replace task binding?");
		if (action === "exit") f.browser.handleInput("escape");
		else f.browser.dispose();
		await f.browser.idle();
		expect(f.approvals).toEqual([false]);
		expect(f.browser.render().join("\n")).not.toContain("Bound this session");
		if (action === "exit") await f.uiCompleted;
	}
});

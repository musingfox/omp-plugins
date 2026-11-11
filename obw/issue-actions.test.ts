import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentWorkPrompt, workPrompt } from "./actions";
import { createIssueBrowser, visibleIssueRows, type IssueCard } from "./issue";
import type { IssueExec } from "./workspace";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const config = { vault: "V", project: "P" };
const output = (stdout: string) => ({ code: 0, killed: false, stdout, stderr: "" });

test("project prompt overrides user default, is reread, and cannot cross a changed workspace", async () => {
	const directory = await mkdtemp(join(tmpdir(), "obw-prompt-")); directories.push(directory);
	const file = join(directory, ".obsidian.yaml");
	await writeFile(file, "vault: V\npm:\n  project: P\n  work_prompt: 'Project {card} in {vault} {unknown}'\n");
	expect(await currentWorkPrompt(directory, config, "pm/P/tasks/a.md", "User {card}")).toBe("Project pm/P/tasks/a.md in V {unknown}");
	await writeFile(file, "vault: V\npm:\n  project: P\n");
	expect(await currentWorkPrompt(directory, config, "pm/P/tasks/a.md", "User {card}")).toBe("User pm/P/tasks/a.md");
	expect(workPrompt("pm/P/tasks/a.md", "V")).toContain("pm_tick");
	await writeFile(file, "vault: Other\npm:\n  project: P\n");
	await expect(currentWorkPrompt(directory, config, "pm/P/tasks/a.md")).rejects.toThrow("Workspace changed");
});

test("pending and successful Work presses do not duplicate submission; a failed admission can retry", async () => {
	const directory = await mkdtemp(join(tmpdir(), "obw-send-")); directories.push(directory);
	await writeFile(join(directory, ".obsidian.yaml"), "vault: V\npm:\n  project: P\n");
	let calls = 0;
	let fail = true;
	const browser = createIssueBrowser(config, async (_command, args) => output(args[1] === "base:query" ? '[{"title":"A","path":"pm/P/tasks/a.md"}]' : args[2].endsWith("dashboard.base") ? "views:\n - name: All Tasks\n" : "---\ntitle: A\n---\nBody A"), {
		changed() {}, close() {}, cwd: directory,
		submitWork: async () => { calls++; if (fail) { fail = false; throw new Error("admission refused"); } },
	});
	try {
		await browser.start(""); browser.handleInput("down"); browser.handleInput("enter"); await browser.idle();
		browser.handleInput("w"); browser.handleInput("w"); await browser.idle();
		expect(calls).toBe(1); expect(browser.render().join("\n")).toContain("Could not send: admission refused");
		browser.handleInput("w"); browser.handleInput("w"); await browser.idle(); browser.handleInput("w"); await browser.idle();
		expect(calls).toBe(2); expect(browser.render().join("\n")).toContain("Sent to agent");
	} finally { browser.dispose(); }
});

test("refresh retains the latest cursor by path even when query ordering changes, and closes without another read", async () => {
	let rows: IssueCard[] = [{ title: "A", path: "pm/P/tasks/a.md" }, { title: "B", path: "pm/P/tasks/b.md" }];
	const query = Promise.withResolvers<unknown>();
	let delayed = false;
	let reads = 0;
	const exec: IssueExec = async (_command, args) => {
		reads++;
		if (args[1] === "base:query") return delayed ? query.promise : output(JSON.stringify(rows));
		return output(args[2].endsWith("dashboard.base") ? "views:\n - name: Active\n" : args[2].endsWith("b.md") ? "BODY_B" : "BODY_A");
	};
	const browser = createIssueBrowser(config, exec, { changed() {}, close() {} });
	try {
		await browser.start("Active");
		delayed = true;
		const refresh = browser.refresh();
		browser.handleInput("down");
		rows = [{ title: "B renamed", path: "pm/P/tasks/b.md" }, rows[0]];
		query.resolve(output(JSON.stringify(rows))); await refresh;
		browser.handleInput("enter"); await browser.idle();
		expect(browser.render().join("\n")).toContain("BODY_B");
		browser.dispose(); const before = reads; await browser.refresh(); expect(reads).toBe(before);
	} finally { browser.dispose(); }
});

test("filters and priority sorting preserve canonical card indices", () => {
	const cards = [{ title: "Z", path: "pm/P/tasks/z.md", priority: "high", tags: ["needle"] }, { title: "A", path: "pm/P/tasks/a.md", priority: "low", tags: ["needle"] }, { title: "Other", path: "pm/P/tasks/other.md", priority: "medium" }];
	const state = { mode: "cards" as const, view: "Active", views: [], cards, selected: 0, request: 0, query: "needle", sort: "priority" as const };
	expect(visibleIssueRows(state).map((row) => row.cardIndex)).toEqual([0, 1]);
	expect(visibleIssueRows({ ...state, priority: "low" }).map((row) => row.cardIndex)).toEqual([1]);
});

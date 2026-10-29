import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontMatter } from "./workspace";
import * as session from "./session";
import type { BranchEntry } from "./session";
import { createWritebackController, type WritebackContext } from "./writeback";

const hasPersistedSource = (file: string | undefined, branch: readonly BranchEntry[], ids: readonly string[]) => session.hasPersistedSource(file, branch, ids);

const cardPath = "pm/P/tasks/a.md";
const runPath = "pm/P/runs/a.md";
const reply = '\n完成 "quotes" \\literal\\n [[Target]]\n第二行中文';
const original = "---\ntitle: A\nstatus: todo\npriority: medium\nrelated: []\nsession: s1\n---\n\n## Acceptance Criteria\n\n- [ ] Keep this unchecked\n\n## Notes\n\n保留正文 \\literal\\path [[Target]]\n";
const answer = (id: string): BranchEntry => ({ type: "message", id, message: {
	role: "assistant", stopReason: "stop", content: [{ type: "text", text: reply }],
} });
function fixture() {
	let entries: BranchEntry[] = [
		{ type: "custom", id: "binding-1", customType: "obw-binding", data: {
			host: "pi", sessionId: "s1", vault: "V", project: "P", cardPath,
		} },
		{ type: "message", id: "user-1", message: { role: "user", content: "work" } },
		answer("answer-1"),
	];
	const files = new Map([[cardPath, original]]);
	const folders = new Set(["pm", "pm/P", "pm/P/tasks"]);
	const calls: string[][] = [];
	const mutations: string[] = [];
	const receipts: unknown[] = [];
	let failure: string | undefined;
	let afterWrite: (() => void) | undefined;
	let pending = false;
	let idle = true;
	let wait: () => Promise<void> = async () => {};
	const file = (path: string) => ({ path, extension: path.split(".").at(-1) });
	const save = (path: string, text: string) => {
		files.set(path, text); mutations.push(path); afterWrite?.();
		if (path === failure) { failure = undefined; throw new Error("Injected failure after durable write"); }
	};
	const app = { vault: {
		getAbstractFileByPath: (path: string) => files.has(path) ? file(path) : folders.has(path) ? { path, children: [] } : null,
		read: async (target: { path: string }) => {
			const text = files.get(target.path);
			if (text === undefined) throw new Error("File not found");
			return text;
		},
		process: async (target: { path: string }, change: (text: string) => string) => {
			const text = files.get(target.path);
			if (text === undefined) throw new Error("File not found");
			const next = change(text); save(target.path, next); return next;
		},
		create: async (path: string, text: string) => {
			if (files.has(path)) throw new Error("Already exists");
			save(path, text); return file(path);
		},
		createFolder: async (path: string) => {
			if (folders.has(path)) throw new Error("Already exists");
			folders.add(path); return { path, children: [] };
		},
	} };
	const exec = async (_command: string, args: string[]) => {
		calls.push(args);
		try {
			let stdout: string;
			if (args[1] === "read") {
				const text = files.get(args[2].slice(5));
				if (text === undefined) throw new Error("File not found");
				stdout = text;
			} else if (args[1] === "eval") {
				stdout = `=> ${await runInNewContext(args[2].slice(5), { app, atob, TextDecoder, Uint8Array })}`;
			} else throw new Error("Unexpected CLI operation");
			return { code: 0, killed: false, stdout, stderr: "" };
		} catch (error) {
			return { code: 1, killed: false, stdout: "", stderr: String(error) };
		}
	};
	const context: WritebackContext = {
		sessionId: () => "s1", branch: () => entries, isPersisted: async () => true,
		isIdle: () => idle, hasPendingMessages: () => pending, waitForIdle: () => wait(),
		appendReceipt: (receipt) => {
			receipts.push(receipt);
			entries.push({ type: "custom", id: `receipt-${receipts.length}`, customType: "obw-writeback", data: receipt });
		},
	};
	return { context, exec, files, calls, mutations, receipts,
		setEntries: (value: BranchEntry[]) => { entries = value; },
		push: (entry: BranchEntry) => { entries.push(entry); },
		failAfterWrite: (path: string) => { failure = path; },
		onWrite: (callback: () => void) => { afterWrite = callback; },
		setPending: (value: boolean) => { pending = value; },
		setIdle: (value: boolean) => { idle = value; },
		setWait: (callback: () => Promise<void>) => { wait = callback; },
	};
}

test("sync verifies Unicode summary and full text without changing protected task data", async () => {
	const f = fixture();
	const receipt = await createWritebackController(f.exec).sync(f.context);
	expect(receipt).toMatchObject({ sourceEntryId: "answer-1", cardPath, runPath, verified: true });
	const card = f.files.get(cardPath) ?? "";
	expect(card).toContain('完成 "quotes" \\literal\\n [[Target]]');
	expect(card).toContain("## Agent");
	expect(card).toContain("- [ ] Keep this unchecked");
	expect(card).toContain("保留正文 \\literal\\path [[Target]]");
	expect(parseFrontMatter(card).frontmatter).toEqual(parseFrontMatter(original).frontmatter);
	expect(f.files.get(runPath)).toContain(reply);
	expect(f.receipts).toHaveLength(1);
});

test("duplicate sync and reload preserve vault bytes, while equal text with a new entry id is a new result", async () => {
	const f = fixture(); const c = createWritebackController(f.exec);
	await c.sync(f.context);
	const before = [...f.files.entries()];
	expect(await c.sync(f.context)).toMatchObject({ alreadyRecorded: true, verified: true });
	expect(await createWritebackController(f.exec).sync(f.context)).toMatchObject({ alreadyRecorded: true, verified: true });
	expect([...f.files.entries()]).toEqual(before);
	f.push(answer("answer-2"));
	expect(await c.sync(f.context)).toMatchObject({ sourceEntryId: "answer-2", alreadyRecorded: false });
	expect([...f.files.entries()]).not.toEqual(before);
});

test("concurrent explicit sync requests serialize and record the same snapshot once", async () => {
	const f = fixture(); const c = createWritebackController(f.exec);
	const receipts = await Promise.all([c.sync(f.context), c.sync(f.context)]);
	expect(receipts.map((receipt) => receipt.sourceEntryId)).toEqual(["answer-1", "answer-1"]);
	expect(receipts.filter((receipt) => !receipt.alreadyRecorded)).toHaveLength(1);
	expect(f.receipts).toHaveLength(1);
});

test("Sync waiting before context start cannot hold the shared lifecycle queue", async () => {
	const f = fixture(); const c = createWritebackController(f.exec); f.setIdle(false);
	let entered: (() => void) | undefined;
	let release: (() => void) | undefined;
	const waitEntered = new Promise<void>((resolve) => { entered = resolve; });
	const idle = new Promise<void>((resolve) => { release = resolve; });
	f.setWait(async () => { entered?.(); await idle; });
	const sync = c.sync(f.context).then(
		(receipt) => ({ kind: "synced" as const, receipt }),
		(error: unknown) => ({ kind: "rejected" as const, error }),
	);
	await waitEntered;
	f.push({ type: "message", id: "user-2", message: { role: "user", content: "new work" } });
	const start = c.recordStart(f.context, "user-2").then(
		(receipt) => ({ kind: "started" as const, receipt }),
		(error: unknown) => ({ kind: "failed" as const, error }),
	);
	const beforeIdle = await Promise.race([
		start,
		Bun.sleep(500).then(() => ({ kind: "blocked" as const })),
	]);
	const wasIdle = f.context.isIdle();
	f.setIdle(true); release?.();
	const settledSync = await sync;
	const settledStart = await start;
	expect(beforeIdle.kind).toBe("started");
	expect(wasIdle).toBe(false);
	expect(settledStart.kind).toBe("started");
	expect(settledSync.kind).toBe("rejected");
	if (settledSync.kind === "rejected") expect(String(settledSync.error)).toContain("invalidated");
	expect(f.receipts).toHaveLength(1);
	expect(f.files.has(runPath)).toBe(false);
});

test("Sync becoming busy inside the queue rejects instead of waiting behind itself", async () => {
	const f = fixture(); let waits = 0;
	f.context.isPersisted = async () => { f.setIdle(false); return true; };
	f.setWait(async () => { waits++; f.setIdle(true); });
	await expect(createWritebackController(f.exec).sync(f.context)).rejects.toThrow("Sync requires idle");
	expect(waits).toBe(0);
	expect(f.calls).toHaveLength(0);
	expect(f.receipts).toHaveLength(0);
});

test("a partial durable write never reports success and retry does not duplicate full text", async () => {
	const f = fixture(); const c = createWritebackController(f.exec);
	f.failAfterWrite(runPath);
	await expect(c.sync(f.context)).rejects.toThrow();
	expect(f.receipts).toHaveLength(0);
	const partialRun = f.files.get(runPath);
	expect(partialRun).toContain(reply);
	expect(await c.sync(f.context)).toMatchObject({ verified: true });
	expect(f.files.get(runPath)).toBe(partialRun);
	expect(f.receipts).toHaveLength(1);
});

test("Unbind after the first file write prevents writing a second file or persisting success", async () => {
	const f = fixture();
	f.onWrite(() => f.setEntries([]));
	await expect(createWritebackController(f.exec).sync(f.context)).rejects.toThrow();
	expect(f.mutations).toHaveLength(1);
	expect(f.receipts).toHaveLength(0);
});

test("unbound, pending and failed current replies are refused before vault I/O", async () => {
	for (const invalid of ["unbound", "pending", "failed"]) {
		const f = fixture();
		if (invalid === "unbound") f.setEntries([]);
		if (invalid === "pending") f.setPending(true);
		if (invalid === "failed") f.push({ type: "message", id: "failed-current", message: {
			role: "assistant", stopReason: "error", errorMessage: "failed", content: [{ type: "text", text: "not success" }],
		} });
		await expect(createWritebackController(f.exec).sync(f.context)).rejects.toThrow();
		expect(f.calls).toHaveLength(0);
	}
});

test("new input during waitForIdle invalidates the original sync request", async () => {
	const f = fixture(); f.setIdle(false);
	f.setWait(async () => {
		f.push({ type: "message", id: "user-2", message: { role: "user", content: "new work" } });
		f.push(answer("answer-2")); f.setIdle(true);
	});
	await expect(createWritebackController(f.exec).sync(f.context)).rejects.toThrow();
	expect(f.calls).toHaveLength(0);
});

test("work start uses the real user entry id once even during an active run", async () => {
	const f = fixture(); const c = createWritebackController(f.exec); f.setIdle(false);
	const startContext: Omit<WritebackContext, "waitForIdle"> = {
		sessionId: f.context.sessionId, branch: f.context.branch, isPersisted: f.context.isPersisted,
		isIdle: f.context.isIdle, hasPendingMessages: f.context.hasPendingMessages,
		appendReceipt: f.context.appendReceipt,
	};
	expect(await c.recordStart(startContext, "user-1")).toMatchObject({ sourceEntryId: "user-1", verified: true });
	const card = f.files.get(cardPath);
	expect(card).toContain("工作中");
	expect(await createWritebackController(f.exec).recordStart(f.context, "user-1")).toMatchObject({ alreadyRecorded: true });
	expect(f.files.get(cardPath)).toBe(card);
	expect(f.files.has(runPath)).toBe(false);
});

test("core requests proof of the captured user and selected assistant before vault I/O", async () => {
	const f = fixture();
	let requested: readonly string[] | undefined;
	f.context.isPersisted = async (ids) => { requested = ids; return false; };
	const c = createWritebackController(f.exec);
	await expect(c.sync(f.context)).rejects.toThrow();
	expect(requested).toEqual(["user-1", "answer-1"]);
	await expect(c.recordStart(f.context, "user-1")).rejects.toThrow();
	expect(requested).toEqual(["user-1"]);
	expect(f.calls).toHaveLength(0);
});

test("old disk messages cannot prove new source entries and disk roles must match", async () => {
	const root = await mkdtemp(join(tmpdir(), "obw-source-proof-"));
	const path = join(root, "session.jsonl");
	const f = fixture();
	const old: BranchEntry = { type: "message", id: "old-user", message: { role: "user" } };
	f.setEntries([old, ...f.context.branch()]);
	const rows = (entries: readonly BranchEntry[]) => entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
	try {
		await writeFile(path, rows([old]));
		expect(await hasPersistedSource(path, f.context.branch(), ["user-1"])).toBe(false);
		expect(await hasPersistedSource(path, f.context.branch(), ["user-1", "answer-1"])).toBe(false);
		await writeFile(path, rows([
			{ type: "message", id: "user-1", message: { role: "user" } },
			{ type: "message", id: "answer-1", message: { role: "user" } },
		]));
		expect(await hasPersistedSource(path, f.context.branch(), ["user-1", "answer-1"])).toBe(false);
		await writeFile(path, rows(f.context.branch()));
		expect(await hasPersistedSource(path, f.context.branch(), ["user-1", "answer-1"])).toBe(true);
		expect(await hasPersistedSource(path, f.context.branch(), [])).toBe(false);
		expect(await hasPersistedSource(undefined, f.context.branch(), ["user-1"])).toBe(false);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("memory-only source entries reject writeback even when an old message is on disk", async () => {
	const root = await mkdtemp(join(tmpdir(), "obw-source-missing-"));
	const path = join(root, "session.jsonl");
	const f = fixture();
	const old: BranchEntry = { type: "message", id: "old-user", message: { role: "user" } };
	f.setEntries([old, ...f.context.branch()]);
	f.context.isPersisted = (ids) => hasPersistedSource(path, f.context.branch(), ids);
	try {
		await writeFile(path, JSON.stringify(old) + "\n");
		await expect(createWritebackController(f.exec).sync(f.context)).rejects.toThrow("Writeback requires");
		expect(f.calls).toHaveLength(0);
		expect(f.receipts).toHaveLength(0);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("fenced Notes templates cannot become the Agent insertion target", async () => {
	for (const fence of ["```", "~~~~"]) {
		const f = fixture();
		const notes = `## Notes\n\n${fence}markdown\n## Agent\nexample agent\n## Notes\nexample notes\n${fence}\n\n保留原 Notes\n`;
		f.files.set(cardPath, original.slice(0, original.indexOf("## Notes")) + notes);
		await createWritebackController(f.exec).recordStart(f.context, "user-1");
		const card = f.files.get(cardPath) ?? "";
		expect(card).toContain(notes);
		expect(card.indexOf("## Agent")).toBeLessThan(card.indexOf("## Notes"));
		expect(card.indexOf("工作中")).toBeLessThan(card.indexOf("## Notes"));
	}
});

test("fenced headings inside a real Agent cannot split its existing content", async () => {
	for (const fence of ["```", "~~~~"]) {
		const f = fixture();
		const agent = `## Agent\n\n${fence}markdown\n## Notes\nexample only\n${fence}\n\nexisting Agent tail\n\n`;
		f.files.set(cardPath, original.replace("## Notes", agent + "## Notes"));
		await createWritebackController(f.exec).recordStart(f.context, "user-1");
		const card = f.files.get(cardPath) ?? "";
		expect(card).toContain(agent);
		expect(card.indexOf("工作中")).toBeGreaterThan(card.indexOf("existing Agent tail"));
		expect(card).toContain("## Notes\n\n保留正文 \\literal\\path [[Target]]\n");
	}
});

test("list-contained fenced Notes remain intact and never become an Agent section", async () => {
	for (const [marker, indent] of [["-", "  "], ["1.", "   "]]) {
		for (const fence of ["```", "~~~~"]) {
			const f = fixture();
			const notes = `## Notes\n\n${marker} ${fence}markdown\n${indent}## Agent\n${indent}example agent\n${indent}## Notes\n${indent}example notes\n${indent}${fence}\n\n原 Notes [[Target]]\n`;
			f.files.set(cardPath, original.slice(0, original.indexOf("## Notes")) + "🙂 中文描述\n\n" + notes);
			await createWritebackController(f.exec).recordStart(f.context, "user-1");
			const card = f.files.get(cardPath) ?? "";
			expect(card).toContain(notes);
			expect(card).toContain("🙂 中文描述\n\n");
			expect(card.indexOf("## Agent")).toBeLessThan(card.indexOf("## Notes"));
			expect(card.indexOf("工作中")).toBeLessThan(card.indexOf("## Notes"));
		}
	}
});

test("a real Agent retains list-contained fenced headings before the appended record", async () => {
	const f = fixture();
	const agent = "## Agent\n\n- ```markdown\n  ## Notes\n  example only\n  ```\n\nexisting Agent tail\n\n";
	f.files.set(cardPath, original.replace("## Notes", agent + "## Notes"));
	await createWritebackController(f.exec).recordStart(f.context, "user-1");
	const card = f.files.get(cardPath) ?? "";
	expect(card).toContain(agent);
	expect(card.indexOf("工作中")).toBeGreaterThan(card.indexOf("existing Agent tail"));
	expect(card).toContain("## Notes\n\n保留正文 \\literal\\path [[Target]]\n");
});

test("a multiline reply with one nonempty line still preserves its full whitespace", async () => {
	const f = fixture(); const text = "\n完成\n\n";
	f.push({ type: "message", id: "answer-whitespace", message: {
		role: "assistant", stopReason: "stop", content: [{ type: "text", text }],
	} });
	expect(await createWritebackController(f.exec).sync(f.context)).toMatchObject({ runPath, verified: true });
	expect(f.files.get(runPath)).toContain(text);
});

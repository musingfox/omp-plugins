import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { assertPiWritebackRegistration } from "./pi-registration.mjs";

const { host, entry } = JSON.parse(process.argv[2]);
const loader = await import(pathToFileURL(join(dirname(join(host.root, host.pkg.exports["."].import)), "core/extensions/loader.js")).href);
const cardPath = "pm/P/tasks/a.md";
const runPath = "pm/P/runs/a.md";
const original = "---\ntitle: A\nstatus: todo\npriority: medium\nsession: s1\n---\n\n## Acceptance Criteria\n- [ ] Keep\n\n## Notes\n中文 [[Target]]\n";
const user = (id) => ({ type: "message", id, message: { role: "user", content: "work" } });
const answer = (id) => ({ type: "message", id, message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "完成\n第二行" }] } });
const binding = { host: "pi", sessionId: "s1", vault: "V", project: "P", cardPath };
const ok = (stdout) => ({ code: 0, killed: false, stdout, stderr: "" });

async function fixture() {
	const root = mkdtempSync(join(tmpdir(), "obw-pi-wiring-"));
	const file = join(root, "session.jsonl");
	const entries = [{ type: "custom", id: "binding", customType: "obw-binding", data: binding }, user("user-1"), answer("answer-1")];
	let sessionFile = file;
	let idle = true;
	let pending = false;
	let wait = async () => {};
	let beforeExec = async (_args) => {};
	let afterWrite = () => {};
	let component;
	let done;
	const files = new Map([[cardPath, original]]);
	const folders = new Set(["pm", "pm/P", "pm/P/tasks"]);
	const calls = [];
	const mutations = [];
	const receipts = [];
	const notices = [];
	const statuses = [];
	let waitCalls = 0;
	let outerConfirmCalls = 0;
	const persist = () => writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
	persist();
	writeFileSync(join(root, ".obsidian.yaml"), "vault: V\npm: {project: P}\n");
	const target = (path) => ({ path, extension: path.split(".").at(-1) });
	const save = (path, text) => { files.set(path, text); mutations.push(path); afterWrite(); };
	const app = { vault: {
		getAbstractFileByPath: (path) => files.has(path) ? target(path) : folders.has(path) ? { path, children: [] } : null,
		read: async (f) => { if (!files.has(f.path)) throw new Error("File not found"); return files.get(f.path); },
		process: async (f, change) => { const next = change(files.get(f.path)); save(f.path, next); return next; },
		create: async (path, text) => { if (files.has(path)) throw new Error("Already exists"); save(path, text); return target(path); },
		createFolder: async (path) => { folders.add(path); return { path, children: [] }; },
	}, fileManager: {
		processFrontMatter: async (f, change) => {
			const body = files.get(f.path);
			const fm = { session: body.match(/\nsession: ([^\n]*)/)[1] };
			change(fm);
			save(f.path, body.replace(/\nsession: [^\n]*/, `\nsession: ${fm.session}`));
		},
	} };
	const exec = async (command, args) => {
		assert.equal(command, "obsidian");
		calls.push(args);
		await beforeExec(args);
		try {
			if (args[1] === "base:query") return ok(JSON.stringify([{ path: cardPath, title: "A", status: "todo" }]));
			if (args[1] === "read") {
				const path = args[2].slice(5);
				if (path.endsWith("dashboard.base")) return ok("views:\n - name: All Tasks\n");
				if (!files.has(path)) throw new Error("File not found");
				return ok(files.get(path));
			}
			assert.equal(args[1], "eval");
			return ok(`=> ${await runInNewContext(args[2].slice(5), { app, atob, TextDecoder, Uint8Array })}`);
		} catch (error) { return { code: 1, killed: false, stdout: "", stderr: String(error) }; }
	};
	const appendEntry = (customType, data) => {
		entries.push({ type: "custom", id: `custom-${entries.length}`, customType, data });
		if (customType === "obw-writeback") receipts.push(data);
		persist();
	};
	// Official SDK loads the actual adapter and supplies its registration API.
	// Only vault execution and persistent custom-entry actions are fixture boundaries.
	globalThis[Symbol.for("obw-pi-wiring")] = { exec, appendEntry };
	const wrapper = join(root, "wrapper.ts");
	writeFileSync(wrapper, `import extension from ${JSON.stringify(entry)};\nexport default pi => extension({...pi, ...globalThis[Symbol.for('obw-pi-wiring')]});\n`);
	const loaded = await loader.loadExtensions([wrapper], root);
	assert.deepEqual(loaded.errors, []);
	const extension = loaded.extensions[0];
	assertPiWritebackRegistration(extension);
	const base = {
		cwd: root, mode: "rpc", hasUI: true,
		sessionManager: { getSessionId: () => "s1", getBranch: () => entries, getSessionFile: () => sessionFile },
		isIdle: () => idle, hasPendingMessages: () => pending,
		ui: {
			notify: (message, type) => notices.push({ message, type }),
			setStatus: (name, value) => statuses.push({ name, value }),
			confirm: async () => { outerConfirmCalls++; return false; },
			custom: (factory) => new Promise((resolve) => {
				done = resolve;
				component = factory({ requestRender() {} }, {}, { matches: () => false }, () => resolve());
			}),
		},
	};
	const command = { ...base, waitForIdle: async () => { waitCalls++; await wait(); } };
	const emit = async (name, data = {}) => {
		const event = { type: name, ...data };
		for (const handler of extension.handlers.get(name) ?? []) assert.equal(await handler(event, base), undefined, `${name} must be observation-only`);
		return event;
	};
	return {
		base, command, files, calls, mutations, receipts, notices, statuses,
		emit, run: (name) => extension.commands.get(name).handler("", command),
		push: (message, save = true) => { entries.push(message); if (save) persist(); },
		setFile: (value) => { sessionFile = value; }, setIdle: (value) => { idle = value; }, setPending: (value) => { pending = value; },
		setWait: (callback) => { wait = callback; }, beforeExec: (callback) => { beforeExec = callback; }, onWrite: (callback) => { afterWrite = callback; },
		component: () => component, waitCalls: () => waitCalls, outerConfirmCalls: () => outerConfirmCalls,
		cleanup: () => { component?.dispose(); done?.(); rmSync(root, { recursive: true, force: true }); },
	};
}
async function check(name, body) {
	const f = await fixture();
	try { await body(f); console.log(`PASS wiring: ${name}`); }
	finally { f.cleanup(); }
}
async function until(predicate) {
	const end = Date.now() + 5000;
	while (!predicate()) {
		if (Date.now() >= end) throw new Error("Wiring condition timed out");
		await new Promise((resolve) => setImmediate(resolve));
	}
}

await check("context observes latest persistent queued user without modifying messages or waiting; continuation dedupes", async (f) => {
	f.setIdle(false);
	f.push(user("queued-user-1")); f.push(user("queued-user-2"));
	const messages = [{ role: "user", content: "transformed context, not a source ID" }];
	const before = structuredClone(messages);
	const event = await f.emit("context", { messages });
	assert.equal(event.messages, messages); assert.deepEqual(messages, before);
	assert.equal("waitForIdle" in f.base, false); assert.equal(f.waitCalls(), 0);
	assert.equal(f.receipts.length, 1); assert.equal(f.receipts[0].sourceEntryId, "queued-user-2");
	assert.equal(f.receipts[0].kind, "start"); assert.equal(f.files.has(runPath), false);
	const bytes = f.files.get(cardPath); const writes = f.mutations.length;
	f.push({ type: "message", id: "tool-attempt", message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: {} }] } });
	await f.emit("context", { messages });
	f.push({ type: "message", id: "failed-attempt", message: { role: "assistant", stopReason: "error", errorMessage: "retry", content: [] } });
	await f.emit("context", { messages });
	assert.equal(f.files.get(cardPath), bytes); assert.equal(f.mutations.length, writes); assert.equal(f.receipts.length, 1);
});
await check("no-session and memory-only start fail before vault I/O", async (f) => {
	f.setFile(undefined); await f.emit("context", { messages: [] }); await f.run("obw-sync");
	assert.equal(f.calls.length, 0); assert.match(f.notices.at(-1).message, /persisted source/);
	f.setFile(join(f.base.cwd, "session.jsonl")); f.push(user("not-on-disk"), false); f.push(answer("not-on-disk-answer"), false);
	await f.emit("context", { messages: [] }); await f.run("obw-sync");
	assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0); assert.match(f.notices.at(-1).message, /persisted source/);
});
await check("explicit sync shares start queue, waits through the real command method and emits verified source receipt", async (f) => {
	const { promise: gate, resolve: release } = Promise.withResolvers();
	const { promise: firstRead, resolve: entered } = Promise.withResolvers();
	let first = true;
	f.beforeExec(async () => { if (first) { first = false; entered(undefined); await gate; } });
	f.setIdle(false); f.setWait(async () => f.setIdle(true));
	const start = f.emit("context", { messages: [] }); await firstRead;
	const sync = f.run("obw-sync"); release(undefined); await Promise.all([start, sync]);
	assert.equal(f.waitCalls(), 1); assert.deepEqual(f.receipts.map((receipt) => receipt.kind), ["start", "sync"]);
	assert.equal(f.receipts[1].sourceEntryId, "answer-1"); assert.equal(f.receipts[1].verified, true);
	assert.match(f.files.get(runPath), /完成\n第二行/); assert.match(f.files.get(cardPath), /## Notes\n中文 \[\[Target\]\]/);
	assert.match(f.notices.at(-1).message, /Sync verified.*answer-1/);
	const bytes = [...f.files]; await f.run("obw-sync"); assert.deepEqual([...f.files], bytes); assert.equal(f.receipts.length, 2);
});
await check("sync waiting before persisted context start leaves the shared mutation queue free", async (f) => {
	/** @type {PromiseWithResolvers<void>} */
	const entered = Promise.withResolvers();
	/** @type {PromiseWithResolvers<void>} */
	const idle = Promise.withResolvers();
	f.setIdle(false); f.setWait(async () => { entered.resolve(); await idle.promise; });
	const sync = f.run("obw-sync"); await entered.promise;
	f.push(user("user-after-sync"));
	const start = f.emit("context", { messages: [] });
	/** @type {PromiseWithResolvers<boolean>} */
	const timed = Promise.withResolvers();
	const timeout = setTimeout(() => timed.resolve(false), 500);
	let beforeIdle; let wasIdle; let settled;
	try {
		beforeIdle = await Promise.race([start.then(() => true), timed.promise]);
		wasIdle = f.base.isIdle();
	} finally {
		clearTimeout(timeout); f.setIdle(true); idle.resolve();
		settled = await Promise.allSettled([sync, start]);
	}
	assert.equal(beforeIdle, true); assert.equal(wasIdle, false);
	assert.deepEqual(settled.map((job) => job.status), ["fulfilled", "fulfilled"]);
	assert.equal(f.waitCalls(), 1); assert.equal("waitForIdle" in f.base, false);
	assert.equal(f.receipts.length, 1);
	assert.equal(f.receipts[0].kind, "start"); assert.equal(f.receipts[0].sourceEntryId, "user-after-sync");
	assert.equal(f.receipts[0].verified, true); assert.deepEqual(f.mutations, [cardPath]);
	assert.equal(f.files.has(runPath), false);
	assert.equal(f.notices.filter((notice) => /Sync failed:.*invalidated/.test(notice.message)).length, 1);
});
await check("sync becoming busy during queued source proof refuses without a second idle wait", async (f) => {
	const sessionFile = f.base.sessionManager.getSessionFile;
	f.base.sessionManager.getSessionFile = () => { f.setIdle(false); return sessionFile(); };
	f.setWait(async () => f.setIdle(true));
	await f.run("obw-sync");
	assert.equal(f.waitCalls(), 0); assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0);
	assert.match(f.notices.at(-1).message, /Sync requires idle/);
});
await check("sync consults the public pending-message state before vault I/O", async (f) => {
	f.setPending(true); await f.run("obw-sync");
	assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0); assert.equal(f.waitCalls(), 0);
	assert.match(f.notices.at(-1).message, /pending/);
});
await check("new input invalidates sync during wait without modifying the input event", async (f) => {
	f.setIdle(false); f.setWait(async () => { await f.emit("input", { text: "new work", source: "rpc" }); f.setIdle(true); });
	await f.run("obw-sync"); assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0);
	assert.match(f.notices.at(-1).message, /invalidated/);
});
for (const event of ["input", "session_before_tree", "session_before_switch", "session_before_fork", "session_shutdown", "session_start", "session_tree"]) {
	await check(`${event} invalidates after one durable data write`, async (f) => {
		f.onWrite(() => { void f.emit(event, { text: "queued", source: "rpc" }); });
		await f.run("obw-sync"); assert.equal(f.mutations.length, 1); assert.equal(f.receipts.length, 0);
		assert.match(f.notices.at(-1).message, /invalidated/);
	});
}
for (const name of ["obw-bind", "obw-unbind"]) {
	await check(`${name} invalidates pending writeback immediately`, async (f) => {
		const { promise: gate, resolve: release } = Promise.withResolvers();
		const { promise: firstRead, resolve: entered } = Promise.withResolvers();
		let first = true; f.beforeExec(async () => { if (first) { first = false; entered(undefined); await gate; } });
		const sync = f.run("obw-sync"); await firstRead; await f.run(name); release(undefined); await sync;
		assert.equal(f.mutations.length, 0); assert.equal(f.receipts.length, 0); assert.match(f.notices.at(-1).message, /invalidated/);
	});
}
await check("inline card Bind preserves confirmation and Exit cancellation while invalidating sync", async (f) => {
	f.command.mode = "tui";
	const browser = f.run("issue");
	await until(() => f.component()?.render(100).join("\n").includes("todo (1)"));
	f.component().handleInput("down"); f.component().handleInput("enter");
	await until(() => f.component().render(100).join("\n").includes("中文 [[Target]]"));
	const { promise: gate, resolve: release } = Promise.withResolvers();
	const { promise: firstRead, resolve: entered } = Promise.withResolvers();
	let first = true; f.beforeExec(async () => { if (first) { first = false; entered(undefined); await gate; } });
	const sync = f.run("obw-sync"); await firstRead;
	f.files.set(cardPath, original.replace("session: s1", "session: foreign"));
	f.component().handleInput("b");
	await until(() => f.component().render(100).join("\n").includes("Replace task binding?"));
	assert.equal(f.outerConfirmCalls(), 0);
	f.component().handleInput("escape"); await browser; release(undefined); await sync;
	assert.equal(f.receipts.length, 0); assert.equal(f.mutations.length, 0);
	assert.equal(f.files.get(cardPath), original.replace("session: s1", "session: foreign"));
});
console.log("PASS: adapter unit/wiring fixtures only; no actual model, vault or runtime network calls");

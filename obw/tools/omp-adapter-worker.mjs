import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { assertOmpWritebackRegistration } from "./omp-registration.mjs";

const { host, entry } = JSON.parse(process.argv[2]);
const hostModule = (name) => import(pathToFileURL(join(host.root, host.pkg.exports[`./${name.split("/")[0]}/*`].import.replace("*", name.slice(name.indexOf("/") + 1)))).href);
const loader = await hostModule("extensibility/extensions/loader");
const { serializeTitleSlot } = await hostModule("session/session-title-slot");
const { SessionManager } = await hostModule("session/session-manager");
const cardPath = "pm/P/tasks/a.md";
const runPath = "pm/P/runs/a.md";
const original = "---\ntitle: A\nstatus: todo\npriority: medium\nsession: s1\n---\n\n## Acceptance Criteria\n- [ ] Keep\n\n## Notes\n中文 [[Target]]\n";
let clock = 1_800_000_000_000;
const user = (id, extra = {}) => ({ type: "message", id, message: { role: "user", content: "work", timestamp: ++clock, ...extra } });
const answer = (id) => ({ type: "message", id, message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "完成\n第二行" }], timestamp: ++clock } });
const binding = { host: "omp", sessionId: "s1", vault: "V", project: "P", cardPath };
const ok = (stdout) => ({ code: 0, killed: false, stdout, stderr: "" });

async function fixture() {
	const root = mkdtempSync(join(tmpdir(), "obw-omp-wiring-"));
	const file = join(root, "session.jsonl");
	const entries = [{ type: "custom", id: "binding", customType: "obw-binding", data: binding }, user("user-1"), answer("answer-1")];
	let sessionFile = file;
	let manager;
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
	const bindings = [];
	const notices = [];
	let waitCalls = 0;
	let outerConfirmCalls = 0;
	// OMP's file layout: fixed-width title slot, session header, then entries (session-manager.ts #serializeBody).
	const header = [serializeTitleSlot({ title: "", updatedAt: "2026-10-29T00:00:00.000Z" }), `${JSON.stringify({ type: "session", version: 3, id: "s1", timestamp: "2026-10-29T00:00:00.000Z", cwd: root })}\n`].join("");
	const persist = () => writeFileSync(file, `${header}${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
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
		if (manager) manager.appendCustomEntry(customType, data);
		else { entries.push({ type: "custom", id: `custom-${entries.length}`, customType, data }); persist(); }
		if (customType === "obw-writeback") receipts.push(data);
		if (customType === "obw-binding") bindings.push(data);
	};
	// The official OMP loader binds the actual entry to its own ExtensionAPI; the
	// wrapper replaces only vault execution and session-entry persistence. OMP binds
	// API methods as non-enumerable own properties (loader.ts), so spread would drop them.
	globalThis[Symbol.for("obw-omp-wiring")] = { exec, appendEntry };
	const wrapper = join(root, "wrapper.ts");
	writeFileSync(wrapper, `import extension from ${JSON.stringify(entry)};\nexport default omp => extension(Object.assign(Object.create(omp), globalThis[Symbol.for('obw-omp-wiring')]));\n`);
	const loaded = await loader.loadExtensions([wrapper], root);
	assert.deepEqual(loaded.errors, []);
	const extension = loaded.extensions[0];
	assertOmpWritebackRegistration(extension);
	const base = {
		cwd: root, mode: "rpc", hasUI: true,
		sessionManager: {
			getSessionId: () => manager ? manager.getSessionId() : "s1",
			getBranch: () => manager ? manager.getBranch() : entries,
			getSessionFile: () => manager ? manager.getSessionFile() : sessionFile,
		},
		isIdle: () => idle, hasPendingMessages: () => pending,
		ui: {
			notify: (message, type) => notices.push({ message, type }),
			setStatus: () => {},
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
	/** OMP's message_end for the branch's latest user message, as a deep copy. */
	const userEnd = () => emit("message_end", { message: structuredClone(base.sessionManager.getBranch().findLast((item) => item.type === "message" && item.message.role === "user").message) });
	return {
		base, command, files, calls, mutations, receipts, bindings, notices, userEnd,
		emit, run: (name, argument = "") => extension.commands.get(name).handler(argument, command),
		push: (message, save = true) => { entries.push(message); if (save) persist(); },
		setFile: (value) => { sessionFile = value; }, setIdle: (value) => { idle = value; }, setPending: (value) => { pending = value; },
		useManager: (value) => { manager = value; },
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
const unbound = (f) => f.files.set(cardPath, original.replace("session: s1", "session: "));

// Persisted-session requirement
await check("Bind refuses no-session and not-yet-written session files before vault I/O, then binds as omp with readback", async (f) => {
	unbound(f);
	for (const file of [undefined, join(f.base.cwd, "not-yet-written.jsonl")]) {
		f.setFile(file); await f.run("obw-bind", cardPath);
		assert.equal(f.calls.length, 0); assert.match(f.notices.at(-1).message, /Bind failed: Bind requires a persisted/);
	}
	f.setFile(join(f.base.cwd, "session.jsonl")); await f.run("obw-bind", cardPath);
	assert.match(f.notices.at(-1).message, /^Bound this session/);
	assert.deepEqual(f.bindings, [binding]); assert.match(f.files.get(cardPath), /\nsession: s1\n/);
});
await check("OMP SessionManager keeps a fresh session off disk until a reply; Bind and Sync refuse until then", async (f) => {
	unbound(f);
	const manager = SessionManager.create(f.base.cwd, join(f.base.cwd, "sessions"));
	f.useManager(manager);
	const sessionId = manager.getSessionId();
	manager.appendMessage({ role: "user", content: "work", timestamp: ++clock });
	await f.run("obw-bind", cardPath); await f.run("obw-sync");
	assert.equal(f.calls.length, 0); assert.match(f.notices.at(-2).message, /Bind requires a persisted/); assert.match(f.notices.at(-1).message, /bound session/);
	manager.appendMessage({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "完成" }], timestamp: ++clock });
	await f.run("obw-bind", cardPath);
	assert.match(f.notices.at(-1).message, /^Bound this session/);
	assert.deepEqual(f.bindings, [{ ...binding, sessionId }]); assert.match(f.files.get(cardPath), new RegExp(`\\nsession: ${sessionId}\\n`));
	await f.run("obw-sync");
	assert.match(f.notices.at(-1).message, /^Sync verified/); assert.equal(f.receipts.length, 1);
});
await check("no-session and memory-only start and sync fail before vault I/O", async (f) => {
	f.setFile(undefined); await f.userEnd(); await f.run("obw-sync");
	assert.equal(f.calls.length, 0); assert.match(f.notices.at(-1).message, /persisted source/);
	f.setFile(join(f.base.cwd, "session.jsonl")); f.push(user("not-on-disk"), false); f.push(answer("not-on-disk-answer"), false);
	await f.userEnd(); await f.run("obw-sync");
	assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0); assert.match(f.notices.at(-1).message, /persisted source/);
});

// Work start after the persisted user message
await check("user message_end records the latest persisted user once without waiting for idle; repeats, assistants, steering and auto-continue add nothing", async (f) => {
	f.setIdle(false);
	f.push(user("queued-user-1")); f.push(user("queued-user-2"));
	const event = await f.userEnd();
	assert.equal(event.type, "message_end");
	assert.equal("waitForIdle" in f.base, false); assert.equal(f.waitCalls(), 0);
	assert.equal(f.receipts.length, 1); assert.equal(f.receipts[0].sourceEntryId, "queued-user-2");
	assert.equal(f.receipts[0].kind, "start"); assert.equal(f.files.has(runPath), false);
	const bytes = f.files.get(cardPath); const writes = f.mutations.length;
	await f.userEnd();
	assert.equal(f.files.get(cardPath), bytes); assert.equal(f.mutations.length, writes); assert.equal(f.receipts.length, 1);
	const calls = f.calls.length;
	const tool = { type: "message", id: "tool-attempt", message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: {} }], timestamp: ++clock } };
	f.push(tool); await f.emit("message_end", { message: tool.message });
	// OMP's auto-continue prompt is a synthetic developer message (agent-session.ts:5478-5487).
	const resume = { type: "message", id: "auto-continue", message: { role: "developer", synthetic: true, attribution: "agent", content: [{ type: "text", text: "continue" }], timestamp: ++clock } };
	f.push(resume); await f.emit("message_end", { message: resume.message });
	const steer = user("steer", { steering: true });
	f.push(steer); await f.emit("message_end", { message: steer.message });
	assert.equal(f.files.get(cardPath), bytes); assert.equal(f.mutations.length, writes); assert.equal(f.receipts.length, 1);
	assert.equal(f.calls.length, calls, "assistant, auto-continue and steering message_end reach no vault I/O");
});
await check("user message_end waits for a queued write, then records the entry it finds", async (f) => {
	const late = user("persisted-late");
	setTimeout(() => f.push(late), 50);
	await f.emit("message_end", { message: structuredClone(late.message) });
	assert.equal(f.receipts.length, 1); assert.equal(f.receipts[0].sourceEntryId, "persisted-late");
});
await check("user message_end refuses after the bounded wait when the user never reaches the branch", async (f) => {
	await f.emit("message_end", { message: user("never-persisted").message });
	assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0);
	assert.match(f.notices.at(-1).message, /Work start refused: the user message did not reach the session branch/);
	assert.equal(f.notices.at(-1).type, "warning");
});

for (const event of ["input", "session_before_switch", "session_before_branch", "session_before_tree", "session_shutdown", "session_start", "session_switch", "session_branch", "session_tree"]) {
	await check(`${event} during the wait for the user entry refuses work start`, async (f) => {
		const late = user("persisted-late");
		setTimeout(() => { void f.emit(event, { text: "queued", source: "rpc" }); }, 20);
		const pushed = new Promise((resolve) => setTimeout(() => resolve(f.push(late)), 60));
		await f.emit("message_end", { message: structuredClone(late.message) }); await pushed;
		assert.equal(f.receipts.length, 0); assert.deepEqual(f.mutations, []);
		assert.match(f.notices.at(-1).message, /Work start failed: .*invalidated/);
	});
}
await check("rebinding during the wait for the user entry writes no start to either card", async (f) => {
	const other = "pm/P/tasks/b.md";
	f.files.set(other, original.replace("title: A", "title: B").replace("session: s1", "session: "));
	const late = user("persisted-late");
	const rebind = Promise.withResolvers();
	setTimeout(() => { f.run("obw-bind", other).then(rebind.resolve); }, 20);
	const pushed = new Promise((resolve) => setTimeout(() => resolve(f.push(late)), 60));
	await f.emit("message_end", { message: structuredClone(late.message) });
	await Promise.all([rebind.promise, pushed]);
	assert.equal(f.receipts.length, 0);
	assert.equal(f.files.get(cardPath), original); assert.doesNotMatch(f.files.get(other), /工作中/);
	assert.ok(f.notices.some((notice) => /Work start failed: .*invalidated/.test(notice.message)));
});

// Sync: shared queue, waiting, same-ID dedupe
await check("explicit sync shares start queue, waits through the real command method, emits a verified receipt and dedupes the same ID", async (f) => {
	const { promise: gate, resolve: release } = Promise.withResolvers();
	const { promise: firstRead, resolve: entered } = Promise.withResolvers();
	let first = true;
	f.beforeExec(async () => { if (first) { first = false; entered(undefined); await gate; } });
	f.setIdle(false); f.setWait(async () => f.setIdle(true));
	const start = f.userEnd(); await firstRead;
	const sync = f.run("obw-sync"); release(undefined); await Promise.all([start, sync]);
	assert.equal(f.waitCalls(), 1); assert.deepEqual(f.receipts.map((receipt) => receipt.kind), ["start", "sync"]);
	assert.equal(f.receipts[1].sourceEntryId, "answer-1"); assert.equal(f.receipts[1].host, "omp"); assert.equal(f.receipts[1].verified, true);
	assert.match(f.files.get(runPath), /完成\n第二行/); assert.match(f.files.get(cardPath), /## Notes\n中文 \[\[Target\]\]/);
	assert.match(f.notices.at(-1).message, /Sync verified.*answer-1/);
	const bytes = [...f.files]; await f.run("obw-sync"); assert.deepEqual([...f.files], bytes); assert.equal(f.receipts.length, 2);
	assert.match(f.notices.at(-1).message, /Sync verified.*\(already recorded\)/);
});
await check("sync waiting before a persisted work start leaves the shared mutation queue free", async (f) => {
	/** @type {PromiseWithResolvers<void>} */
	const entered = Promise.withResolvers();
	/** @type {PromiseWithResolvers<void>} */
	const idle = Promise.withResolvers();
	f.setIdle(false); f.setWait(async () => { entered.resolve(); await idle.promise; });
	const sync = f.run("obw-sync"); await entered.promise;
	f.push(user("user-after-sync"));
	const start = f.userEnd();
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
	assert.equal(f.waitCalls(), 1); assert.equal(f.receipts.length, 1);
	assert.equal(f.receipts[0].kind, "start"); assert.equal(f.receipts[0].sourceEntryId, "user-after-sync");
	assert.deepEqual(f.mutations, [cardPath]); assert.equal(f.files.has(runPath), false);
	assert.equal(f.notices.filter((notice) => /Sync failed:.*invalidated/.test(notice.message)).length, 1);
});

// Sync refusal cases
await check("sync becoming busy during queued source proof refuses without a second idle wait", async (f) => {
	const sessionFile = f.base.sessionManager.getSessionFile;
	f.base.sessionManager.getSessionFile = () => { f.setIdle(false); return sessionFile(); };
	f.setWait(async () => f.setIdle(true));
	await f.run("obw-sync");
	assert.equal(f.waitCalls(), 0); assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0);
	assert.match(f.notices.at(-1).message, /Sync requires idle/);
});
await check("sync consults OMP's pending-message state before vault I/O", async (f) => {
	f.setPending(true); await f.run("obw-sync");
	assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0); assert.equal(f.waitCalls(), 0);
	assert.match(f.notices.at(-1).message, /pending/);
});
await check("sync refuses unbound sessions and replies that are not a completed text snapshot", async (f) => {
	f.push({ type: "custom", id: "unbind", customType: "obw-binding", data: null });
	await f.run("obw-sync"); assert.match(f.notices.at(-1).message, /requires a bound session/);
	f.push({ type: "custom", id: "rebind", customType: "obw-binding", data: binding });
	for (const reply of [
		{ role: "assistant", stopReason: "aborted", content: [{ type: "text", text: "partial" }] },
		{ role: "assistant", stopReason: "stop", errorMessage: "boom", content: [{ type: "text", text: "x" }] },
		{ role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id: "t", name: "read", arguments: {} }] },
	]) {
		f.push({ type: "message", id: `reply-${clock}`, message: { ...reply, timestamp: ++clock } });
		await f.run("obw-sync"); assert.match(f.notices.at(-1).message, /not a completed text snapshot/);
	}
	f.push({ type: "message", id: "empty-reply", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: " \n\t" }], timestamp: ++clock } });
	await f.run("obw-sync"); assert.match(f.notices.at(-1).message, /Latest reply has no text/);
	f.push(user("user-2")); await f.run("obw-sync"); assert.match(f.notices.at(-1).message, /No completed reply in the current turn/);
	assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0);
});

// Invalidation on session, branch, input and binding change
await check("new input invalidates sync during wait without modifying the input event", async (f) => {
	f.setIdle(false); f.setWait(async () => { await f.emit("input", { text: "new work", source: "rpc" }); f.setIdle(true); });
	await f.run("obw-sync"); assert.equal(f.calls.length, 0); assert.equal(f.receipts.length, 0);
	assert.match(f.notices.at(-1).message, /invalidated/);
});
for (const event of ["input", "session_before_switch", "session_before_branch", "session_before_tree", "session_shutdown", "session_start", "session_switch", "session_branch", "session_tree"]) {
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

// Inline card Bind / Unbind
async function openCard(f) {
	f.command.mode = "tui";
	const browser = f.run("issue");
	await until(() => f.component()?.render(100).join("\n").includes("todo (1)"));
	f.component().handleInput("down"); f.component().handleInput("enter");
	await until(() => f.component().render(100).join("\n").includes("中文 [[Target]]"));
	return { browser };
}
await check("inline card Bind preserves confirmation and Exit cancellation while invalidating sync", async (f) => {
	const { browser } = await openCard(f);
	const { promise: gate, resolve: release } = Promise.withResolvers();
	const { promise: firstRead, resolve: entered } = Promise.withResolvers();
	let first = true; f.beforeExec(async () => { if (first) { first = false; entered(undefined); await gate; } });
	const sync = f.run("obw-sync"); await firstRead;
	f.files.set(cardPath, original.replace("session: s1", "session: foreign"));
	f.component().handleInput("b");
	await until(() => f.component().render(100).join("\n").includes("Replace task binding?"));
	assert.equal(f.outerConfirmCalls(), 0);
	f.component().handleInput("escape"); await browser; release(undefined); await sync;
	assert.equal(f.receipts.length, 0); assert.equal(f.mutations.length, 0); assert.deepEqual(f.bindings, []);
	assert.equal(f.files.get(cardPath), original.replace("session: s1", "session: foreign"));
});
await check("inline card n declines, y replaces a foreign owner, and u unbinds without changing the vault", async (f) => {
	const { browser } = await openCard(f);
	f.files.set(cardPath, original.replace("session: s1", "session: foreign"));
	f.component().handleInput("b");
	await until(() => f.component().render(100).join("\n").includes("Replace task binding?"));
	f.component().handleInput("n");
	await until(() => !f.component().render(100).join("\n").includes("Replace task binding?"));
	assert.equal(f.mutations.length, 0); assert.deepEqual(f.bindings, []);
	f.component().handleInput("b");
	await until(() => f.component().render(100).join("\n").includes("Replace task binding?"));
	f.component().handleInput("y");
	await until(() => f.bindings.length === 1);
	assert.deepEqual(f.bindings, [binding]); assert.match(f.files.get(cardPath), /\nsession: s1\n/);
	const bytes = f.files.get(cardPath);
	f.component().handleInput("u");
	assert.deepEqual(f.bindings, [binding, null]); assert.equal(f.files.get(cardPath), bytes);
	f.component().handleInput("escape"); await browser;
});
console.log("PASS: OMP adapter unit/wiring fixtures only; no actual model, vault or runtime network calls");

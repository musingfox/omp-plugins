// A real OMP AgentSession runs the actual entry on a fake provider. Only the
// provider and vault exec are fixtures; ordering of message events, context and
// session persistence is OMP's own.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

const { host, entry } = JSON.parse(process.argv[2]);
const ai = await import(pathToFileURL(Bun.resolveSync("@oh-my-pi/pi-ai", host.root)).href);
const omp = await import(pathToFileURL(join(host.root, host.pkg.exports["."].import)).href);
const { initializeExtensions } = await import(pathToFileURL(join(host.root, host.pkg.exports["./modes/*"].import.replace("*", "runtime-init"))).href);
const { default: obw } = await import(pathToFileURL(entry).href);

const root = mkdtempSync(join(tmpdir(), "obw-omp-session-"));
const cardPath = "pm/P/tasks/a.md";
writeFileSync(join(root, ".obsidian.yaml"), "vault: V\npm: {project: P}\n");
let card = "";
let vaultCalls = 0;
const app = { vault: {
	getAbstractFileByPath: (path) => path === cardPath ? { path, extension: "md" } : null,
	read: async () => card,
	process: async (_file, change) => { card = change(card); return card; },
	create: async () => { throw new Error("unexpected create"); },
	createFolder: async () => ({}),
} };
const exec = async (_command, args) => {
	vaultCalls++;
	if (args[1] === "read") return { code: 0, killed: false, stdout: card, stderr: "" };
	if (args[1] === "eval") return { code: 0, killed: false, stdout: `=> ${await runInNewContext(args[2].slice(5), { app, atob, TextDecoder, Uint8Array })}`, stderr: "" };
	return { code: 1, killed: false, stdout: "", stderr: "unexpected" };
};
let calls = 0;
let toolCalls = new Set();
ai.registerCustomApi("obw-fake", (model) => {
	calls++;
	const stream = ai.createAssistantMessageEventStream();
	const tool = toolCalls.has(calls);
	const message = {
		role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
		content: tool ? [{ type: "toolCall", id: `t${calls}`, name: "noop", arguments: {} }] : [{ type: "text", text: `reply ${calls}` }],
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: tool ? "toolUse" : "stop",
	};
	queueMicrotask(() => { stream.push({ type: "start", partial: message }); stream.push({ type: "done", reason: message.stopReason, message }); });
	return stream;
});
const model = { id: "fake", name: "fake", api: "obw-fake", provider: "obw-fake", baseUrl: "http://127.0.0.1:9", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 1000, identity: { class: "unknown" } };
const sessionManager = omp.SessionManager.create(root, join(root, "sessions"));
/** @type {(() => Promise<unknown>) | undefined} */
let replay;
const factory = (api) => {
	const wiring = Object.assign(Object.create(api), { exec, on: (name, handler) => api.on(name, name === "message_end" ? async (event, ctx) => { if (event.message.role === "user") replay = () => handler(event, ctx); return handler(event, ctx); } : handler) });
	obw(wiring);
};
const reports = [];
const write = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...rest) => { if (String(chunk).startsWith("obw: ")) reports.push(String(chunk).trim()); return write(chunk, ...rest); };
const authStorage = await omp.discoverAuthStorage(join(root, "agent"));
authStorage.keys.setRuntime("obw-fake", "x");
const { session } = await omp.createAgentSession({
	cwd: root, agentDir: join(root, "agent"), model, authStorage, getApiKey: async () => "x", sessionManager,
	extensions: [factory], disableExtensionDiscovery: true, enableMCP: false, enableLsp: false, skipPythonPreflight: true,
	noContextFiles: true, autoTitle: false, cacheWarming: false, hasUI: false,
	customTools: [{ name: "noop", label: "noop", description: "noop", parameters: { type: "object", properties: {} }, execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }) }],
});
await initializeExtensions(session, { mode: "print", reportSendError: (_a, error) => { throw error; }, reportRuntimeError: (error) => { throw error.error ?? error; } });
const turn = async (text) => {
	await session.prompt(text);
	await session.waitForIdle();
	// The handler is not awaited by the loop; let its bounded wait and vault I/O settle.
	const end = Date.now() + 5000;
	const user = () => sessionManager.getBranch().findLast((item) => item.type === "message" && item.message.role === "user");
	while (Date.now() < end && !starts().includes(user()?.id)) await new Promise((resolve) => setTimeout(resolve, 10));
	return user().id;
};
const starts = () => sessionManager.getBranch().filter((item) => item.type === "custom" && item.customType === "obw-writeback" && item.data.kind === "start").map((item) => item.data.sourceEntryId);
try {
	await turn("unbound first turn");
	assert.deepEqual(starts(), []); assert.equal(vaultCalls, 0);
	card = `---\ntitle: A\nstatus: todo\nsession: ${sessionManager.getSessionId()}\n---\n\n## Notes\nx\n`;
	sessionManager.appendCustomEntry("obw-binding", { host: "omp", sessionId: sessionManager.getSessionId(), vault: "V", project: "P", cardPath });
	const text = await turn("bound text-only turn");
	assert.deepEqual(starts(), [text], "a bound text-only turn records its own start once");
	console.log(`PASS session: text-only turn recorded start ${text}`);
	toolCalls = new Set([calls + 1]);
	const tooled = await turn("bound tool-call turn");
	assert.equal(calls >= 4, true, "the tool turn made two provider calls");
	assert.deepEqual(starts(), [text, tooled], "a tool-call turn records its start exactly once");
	console.log(`PASS session: tool-call turn recorded start ${tooled} once`);
	const bytes = card;
	if (!replay) throw new Error("the entry never received message_end");
	await replay();
	assert.deepEqual(starts(), [text, tooled]); assert.equal(card, bytes);
	console.log("PASS session: a second identical message_end adds nothing");
	assert.deepEqual(reports.filter((line) => /refused|failed/i.test(line)), [], "normal turns report no refusal");
	assert.equal((card.match(/工作中/g) ?? []).length, 2);
	console.log("PASS: OMP real-session fixture; fake provider and vault, no model or vault calls");
} finally {
	await session.dispose?.();
	rmSync(root, { recursive: true, force: true });
}
process.exit(0);

import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { createBindingController, getBinding, hasPersistedConversation, type BindingContext, type BranchEntry } from "./session";
import type { WorkspaceConfig } from "./workspace";

const config: WorkspaceConfig = { vault: "V", project: "P" };
const path = "pm/P/tasks/a.md";
function fixture(owner: string | undefined = undefined) {
	let entries: BranchEntry[] = [{ type: "message", id: "u1", message: { role: "user" } }];
	let sessionId = "s1";
	let persisted = true;
	let approved = false;
	const calls: string[][] = [];
	const fm: Record<string, unknown> = { title: "中文😀", status: "todo", session: owner };
	const body = () => `---\ntitle: 中文😀\nstatus: todo\nsession: ${fm.session ?? ""}\n---\n## Notes\nuntouched\n`;
	const context: BindingContext = {
		sessionId: () => sessionId,
		branch: () => entries,
		isPersisted: async () => persisted,
		append: (binding) => { entries = [...entries, { type: "custom", id: `b${entries.length}`, customType: "obw-binding", data: binding }]; },
		confirm: async () => approved,
	};
	const exec = async (_command: string, args: string[]) => {
		calls.push(args);
		let stdout = body();
		if (args[1] === "eval") {
			const app = {
				vault: { getAbstractFileByPath: () => ({ path, extension: "md" }), read: async () => body() },
				fileManager: { processFrontMatter: async (_file: unknown, fn: (frontmatter: Record<string, unknown>) => void) => fn(fm) },
			};
			stdout = `=> ${await runInNewContext(args[2].slice(5), { app })}`;
		}
		return { code: 0, killed: false, stdout, stderr: "" };
	};
	return { context, exec, calls, fm, setPersisted: (v: boolean) => { persisted = v; }, approve: () => { approved = true; }, switchSession: () => { sessionId = "s2"; }, branchAway: () => { entries = []; } };
}

test("bind reads task, writes via CLI eval, verifies body, then appends active-branch binding", async () => {
	const f = fixture(); const controller = createBindingController(f.exec);
	await controller.bind(config, path, f.context);
	expect(f.calls.map((call) => call[1])).toEqual(["read", "eval"]);
	expect(f.calls[0]).toEqual(["vault=V", "read", `path=${path}`]);
	expect(getBinding(f.context.branch(), "s1")).toEqual({ host: "pi", sessionId: "s1", vault: "V", project: "P", cardPath: path });
	expect(f.fm.status).toBe("todo");
	controller.unbind(f.context);
	expect(getBinding(f.context.branch(), "s1")).toBeUndefined();
	expect(f.fm.session).toBe("s1");
	expect(f.calls).toHaveLength(2);
});
test("unpersisted sessions and non-task paths refuse before vault I/O", async () => {
	const f = fixture(); const c = createBindingController(f.exec);
	f.setPersisted(false);
	await expect(c.bind(config, path, f.context)).rejects.toThrow("persisted");
	f.setPersisted(true);
	await expect(c.bind(config, "pm/P/docs/a.md", f.context)).rejects.toThrow();
	expect(f.calls).toHaveLength(0);
});
test("foreign session needs actual approval, declined replacement never writes", async () => {
	const f = fixture("other"); const c = createBindingController(f.exec);
	await expect(c.bind(config, path, f.context)).rejects.toThrow();
	expect(f.calls.map((call) => call[1])).toEqual(["read"]);
	f.approve(); await c.bind(config, path, f.context);
	expect(f.fm.session).toBe("s1");
});
test("readback mismatch and CLI failure never persist success", async () => {
	for (const stdout of ['=> OBW_BIND:{"body":"---\\nsession: wrong\\n---\\n"}', "Error: failed"]) {
		const f = fixture();
		const c = createBindingController(async (command, args) => args[1] === "eval" ? { code: 0, killed: false, stdout, stderr: "" } : f.exec(command, args));
		await expect(c.bind(config, path, f.context)).rejects.toThrow();
		expect(getBinding(f.context.branch(), "s1")).toBeUndefined();
	}
});
test("Unbind, session/branch switch and replacement Bind invalidate an in-flight read", async () => {
	for (const change of ["unbind", "session", "branch", "newbind"]) {
		const f = fixture(); let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		let entered: (() => void) | undefined;
		const readEntered = new Promise<void>((resolve) => { entered = resolve; });
		let first = true;
		const c = createBindingController(async (command, args) => { if (first) { first = false; entered?.(); await gate; } return f.exec(command, args); });
		const old = c.bind(config, path, f.context).then(() => "unexpected success", (error: unknown) => error instanceof Error ? error.message : String(error));
		await readEntered;
		let newer: Promise<void> | undefined;
		if (change === "unbind") c.unbind(f.context);
		if (change === "session") f.switchSession();
		if (change === "branch") f.branchAway();
		if (change === "newbind") newer = c.bind(config, path, f.context);
		release?.(); expect(await old).toContain("invalidated"); if (newer) await newer;
		expect(f.calls.filter((call) => call[1] === "eval")).toHaveLength(change === "newbind" ? 1 : 0);
	}
});
test("owner changing after approval is caught inside atomic frontmatter callback", async () => {
  const f = fixture("other");
  f.context.confirm = async () => { f.fm.session = "third-session"; return true; };
  const c = createBindingController(f.exec);
  await expect(c.bind(config, path, f.context)).rejects.toThrow("conflict");
  expect(f.fm.session).toBe("third-session");
  expect(getBinding(f.context.branch(), "s1")).toBeUndefined();
});
test("session replacement after eval cannot append a binding success", async () => {
  const f = fixture();
  const c = createBindingController(async (command, args) => {
    const result = await f.exec(command, args);
    if (args[1] === "eval") f.switchSession();
    return result;
  });
  await expect(c.bind(config, path, f.context)).rejects.toThrow("invalidated");
  expect(getBinding(f.context.branch(), "s2")).toBeUndefined();
});
test("persisted guard requires a real flushed active-branch user/assistant entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "obw-persisted-"));
  try {
    const file = join(root, "session.jsonl");
    const branch: BranchEntry[] = [{ type: "message", id: "u1", message: { role: "user" } }];
    expect(await hasPersistedConversation(undefined, branch)).toBe(false);
    expect(await hasPersistedConversation(file, branch)).toBe(false);
    await writeFile(file, `${JSON.stringify({ type: "session", id: "s1" })}\n`);
    expect(await hasPersistedConversation(file, branch)).toBe(false);
    await writeFile(file, `${JSON.stringify(branch[0])}\n`);
    expect(await hasPersistedConversation(file, branch)).toBe(true);
    expect(await hasPersistedConversation(file, [{ ...branch[0], id: "different-branch" }])).toBe(false);
    expect(await hasPersistedConversation(file, [{ type: "custom", id: "custom" }])).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { appendNote, createPmTools, PM_TOOLS, pmEdit, pmToolResult, setStatus, tickAc } from "./pm";

const card = "---\ntitle: A\nstatus: todo\n---\n\n# a\n\n## Acceptance Criteria\n\n- [ ] first\n- [x] second \"q\" \\b\n\n## Notes\n\n- 中文 [[Target]]\n\n## Agent\n";
const path = "pm/P/tasks/a.md";

let cwd = "";
beforeEach(async () => {
	cwd = await mkdtemp(join(tmpdir(), "obw-pm-test-"));
	await writeFile(join(cwd, ".obsidian.yaml"), "vault: V\npm:\n  project: P\n");
});
afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });

function vault(files: Map<string, string>, options: { onProcess?: () => void; corruptWrite?: boolean } = {}) {
	const calls: string[][] = [];
	const app = { vault: {
		getAbstractFileByPath: (target: string) => files.has(target) ? { path: target, extension: target.split(".").at(-1) } : null,
		read: async (target: { path: string }) => files.get(target.path) ?? "",
		process: async (target: { path: string }, change: (text: string) => string) => {
			options.onProcess?.();
			const next = change(files.get(target.path) ?? "");
			files.set(target.path, options.corruptWrite ? `${next}x` : next);
			return next;
		},
	} };
	const exec = async (_command: string, args: string[]) => {
		calls.push(args);
		try {
			if (args[1] !== "eval") throw new Error("Unexpected CLI operation");
			return { code: 0, killed: false, stdout: `=> ${await runInNewContext(args[2].slice(5), { app, atob, TextDecoder, Uint8Array })}`, stderr: "" };
		} catch (error) {
			return { code: 1, killed: false, stdout: "", stderr: String(error) };
		}
	};
	return { exec, calls };
}

test("tickAc sets only the numbered acceptance box and refuses a missing one", () => {
	expect(tickAc(card, 1, true)).toEqual({ text: card.replace("- [ ] first", "- [x] first") });
	expect(tickAc(card, 2, false)).toEqual({ text: card.replace("- [x] second", "- [ ] second") });
	expect(tickAc(card, 3, true)).toHaveProperty("refused");
	expect(tickAc(card, 0, true)).toHaveProperty("refused");
	expect(tickAc("---\ntitle: a\n---\nbody\n", 1, true)).toHaveProperty("refused");
});

test("appendNote adds after the last Notes line, or creates the section", () => {
	expect(appendNote(card, "next")).toEqual({ text: card.replace("- 中文 [[Target]]\n", "- 中文 [[Target]]\n- next\n") });
	expect(appendNote("---\nstatus: todo\n---\nbody\n", "n")).toEqual({ text: "---\nstatus: todo\n---\nbody\n\n## Notes\n- n\n" });
	expect(appendNote(card, "two\nlines")).toHaveProperty("refused");
	expect(appendNote(card, "  ")).toHaveProperty("refused");
});

test("setStatus replaces the frontmatter status and refuses unknown values or a missing line", () => {
	expect(setStatus(card, "in-progress")).toEqual({ text: card.replace("status: todo", "status: in-progress") });
	expect(setStatus(card, "archived")).toHaveProperty("refused");
	expect(setStatus("no frontmatter\nstatus: todo\n", "done")).toHaveProperty("refused");
});

test("pmEdit refuses bad card names and arguments before any CLI call", () => {
	for (const name of ["", ".", "..", "a/b", "a\\b", "a\nb", "\u0085"]) expect(pmEdit("pm_note", { card: name, line: "x" })).toHaveProperty("refused");
	expect(pmEdit("pm_tick", { card: "a", index: 1.5, checked: true })).toHaveProperty("refused");
	expect(pmEdit("pm_tick", { card: "a", index: 1, checked: "yes" })).toHaveProperty("refused");
	expect(pmEdit("pm_status", { card: "a", status: "later" })).toHaveProperty("refused");
	expect(pmEdit("pm_status", null)).toHaveProperty("refused");
	expect(pmEdit("pm_status", { card: "a", status: "done" })).toHaveProperty("card", "a");
});

test("the three tools are declared with JSON Schema parameters", () => {
	expect(PM_TOOLS.map((tool) => tool.name)).toEqual(["pm_tick", "pm_note", "pm_status"]);
	for (const tool of PM_TOOLS) expect(tool.parameters).toMatchObject({ type: "object", required: expect.arrayContaining(["card"]) });
});

test("a tool result is one JSON line of text, flagged as an error on failure", () => {
	expect(pmToolResult({ ok: true, path })).toEqual({ content: [{ type: "text", text: `{"ok":true,"path":"${path}"}` }], isError: false });
	expect(pmToolResult({ ok: false, reason: "r" })).toEqual({ content: [{ type: "text", text: '{"ok":false,"reason":"r"}' }], isError: true });
});

test("a call reads, writes and reads back the card in the configured vault", async () => {
	const files = new Map([[path, card]]);
	const { exec, calls } = vault(files);
	expect(await createPmTools(exec).run("pm_tick", { card: "a", index: 1, checked: true }, cwd)).toEqual({ ok: true, path });
	expect(files.get(path)).toBe(card.replace("- [ ] first", "- [x] first"));
	expect(calls).toHaveLength(3);
	for (const args of calls) expect(args.slice(0, 2)).toEqual(["vault=V", "eval"]);
	expect(calls.some((args) => args.join(" ").includes("first"))).toBe(false);
});

test("a refused argument, missing config or missing card writes nothing", async () => {
	const files = new Map([[path, card]]);
	const { exec, calls } = vault(files);
	const tools = createPmTools(exec);
	expect(await tools.run("pm_status", { card: "a/b", status: "done" }, cwd)).toMatchObject({ ok: false });
	expect(calls).toHaveLength(0);
	const empty = await mkdtemp(join(tmpdir(), "obw-pm-noconfig-"));
	try {
		expect(await tools.run("pm_status", { card: "a", status: "done" }, empty)).toMatchObject({ ok: false, reason: expect.stringContaining(".obsidian.yaml") });
	} finally { await rm(empty, { recursive: true, force: true }); }
	expect(calls).toHaveLength(0);
	expect(await tools.run("pm_status", { card: "missing", status: "done" }, cwd)).toEqual({ ok: false, reason: "pm/P/tasks/missing.md was not found." });
	expect(calls).toHaveLength(1);
	expect(files.get(path)).toBe(card);
});

test("a card changed between read and write is not overwritten", async () => {
	const files = new Map([[path, card]]);
	const { exec } = vault(files, { onProcess: () => files.set(path, `${card}edited\n`) });
	const result = await createPmTools(exec).run("pm_note", { card: "a", line: "n" }, cwd);
	expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("was not written") });
	expect(files.get(path)).toBe(`${card}edited\n`);
});

test("a failed CLI call never quotes its output, which can hold the card text", async () => {
	const secret = `${card} Error: x`;
	const files = new Map([[path, secret]]);
	const exec = async () => ({ code: 0, killed: false, stdout: `=> OBW_WRITEBACK:${JSON.stringify({ body: secret })}`, stderr: "" });
	const result = await createPmTools(exec).run("pm_status", { card: "a", status: "done" }, cwd);
	expect(result).toMatchObject({ ok: false });
	expect(JSON.stringify(result)).not.toContain("first");
	const failing = async () => ({ code: 1, killed: false, stdout: secret, stderr: secret });
	const failed = await createPmTools(failing).run("pm_status", { card: "a", status: "done" }, cwd);
	expect(failed).toMatchObject({ ok: false });
	expect(JSON.stringify(failed)).not.toContain("first");
	expect(files.get(path)).toBe(secret);
});

test("a read back that differs from the written text is a failure", async () => {
	const files = new Map([[path, card]]);
	const { exec } = vault(files, { corruptWrite: true });
	expect(await createPmTools(exec).run("pm_status", { card: "a", status: "done" }, cwd)).toEqual({ ok: false, reason: `${path} was written, but the read back differs from the text written.` });
});

test("calls that arrive together run one after another", async () => {
	const files = new Map([[path, card]]);
	const { exec } = vault(files);
	const tools = createPmTools(exec);
	const results = await Promise.all([
		tools.run("pm_tick", { card: "a", index: 1, checked: true }, cwd),
		tools.run("pm_note", { card: "a", line: "n" }, cwd),
		tools.run("pm_status", { card: "a", status: "done" }, cwd),
	]);
	expect(results.every((result) => result.ok)).toBe(true);
	expect(files.get(path)).toBe(card.replace("- [ ] first", "- [x] first").replace("- 中文 [[Target]]\n", "- 中文 [[Target]]\n- n\n").replace("status: todo", "status: done"));
});

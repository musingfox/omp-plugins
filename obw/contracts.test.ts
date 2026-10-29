import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBinding, selectSnapshot } from "./session";
import { isTaskPath, readWorkspaceConfig } from "./workspace";

const temporary: string[] = [];
afterEach(async () => {
	for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

const user = (id = "user-current") => ({
	type: "message" as const,
	id,
	message: { role: "user" as const, content: "Work on this task" },
});
const assistant = (id: string, text = "完成\n保留全文") => ({
	type: "message" as const,
	id,
	message: {
		role: "assistant" as const,
		stopReason: "stop",
		content: [{ type: "text", text }],
	},
});

test("snapshot uses the current assistant's real entry id and complete text", () => {
	expect(selectSnapshot([user(), assistant("answer-current")])).toEqual({
		entryId: "answer-current",
		text: "完成\n保留全文",
	});
});

test("snapshot never falls back to a successful historical answer", () => {
	const previous = [user("user-old"), assistant("answer-old")];
	expect(() => selectSnapshot([...previous, user()])).toThrow();
	for (const stopReason of ["error", "aborted", "toolUse", undefined]) {
		const latest = assistant("answer-current");
		expect(() => selectSnapshot([
			...previous,
			user(),
			{ ...latest, message: { ...latest.message, stopReason } },
		])).toThrow();
	}
});

test("snapshot rejects errors, tool calls, and whitespace-only replies", () => {
	const latest = assistant("answer-current");
	expect(() => selectSnapshot([
		user(),
		{ ...latest, message: { ...latest.message, errorMessage: "failed" } },
	])).toThrow();
	expect(() => selectSnapshot([
		user(),
		{ ...latest, message: { ...latest.message, content: [
			{ type: "text", text: "not a finished reply" },
			{ type: "toolCall", id: "call-1", name: "bash", arguments: {} },
		] } },
	])).toThrow();
	expect(() => selectSnapshot([user(), assistant("answer-empty", " \n\t ")])).toThrow();
});

test("binding restoration uses only supplied active-branch entries", () => {
	const binding = {
		host: "pi" as const,
		sessionId: "session-1",
		vault: "obsidian",
		project: "P",
		cardPath: "pm/P/tasks/a.md",
	};
	const bound = { type: "custom" as const, id: "bind-1", customType: "obw-binding", data: binding };
	expect(getBinding([bound], "session-1")).toEqual(binding);
	expect(getBinding([], "session-1")).toBeUndefined();
	expect(getBinding([bound], "another-session")).toBeUndefined();
	expect(getBinding([
		bound,
		{ type: "custom", id: "unbind-1", customType: "obw-binding", data: null },
	], "session-1")).toBeUndefined();
});

test("only project tasks, including tasks/archive, can be bound", () => {
	expect(isTaskPath("pm/P/tasks/a.md", "P")).toBe(true);
	expect(isTaskPath("pm/P/tasks/archive/a.md", "P")).toBe(true);
	for (const path of [
		"pm/P/docs/a.md", "pm/Q/tasks/a.md", "pm/P/tasks/../docs/a.md",
		"/pm/P/tasks/a.md", "pm/P/tasks/a.md\n", "pm/P/tasks/a\u001b.md",
		"pm/P/tasks//a.md", "pm/P/tasks/a\\b.md", "pm/P/tasks/.md",
	]) expect(isTaskPath(path, "P")).toBe(false);
	expect(isTaskPath("pm/../tasks/a.md", "..")).toBe(false);
});

test("config selects the nearest parent and never skips an invalid nearer config", async () => {
	const root = await mkdtemp(join(tmpdir(), "obw-config-"));
	temporary.push(root);
	const child = join(root, "child");
	const nested = join(child, "nested");
	await mkdir(nested, { recursive: true });
	await writeFile(join(root, ".obsidian.yaml"), "vault: parent\npm:\n  project: Parent\n");
	await writeFile(join(child, ".obsidian.yaml"), "vault: obsidian\npm:\n  project: P\n");
	expect(await readWorkspaceConfig(nested)).toMatchObject({ vault: "obsidian", project: "P" });
	await writeFile(join(child, ".obsidian.yaml"), "vault: obsidian\n");
	await expect(readWorkspaceConfig(nested)).rejects.toThrow();
});

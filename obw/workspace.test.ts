import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cliJson, cliOutput, readWorkspaceConfig } from "./workspace";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
test("workspace parses flow YAML, quotes, comments and rejects duplicate keys", async () => {
	const root = await mkdtemp(join(tmpdir(), "obw-yaml-")); roots.push(root);
	await writeFile(join(root, ".obsidian.yaml"), 'vault: "中文 vault" # comment\npm: {project: "P"}\n');
	expect(await readWorkspaceConfig(root)).toMatchObject({ vault: "中文 vault", project: "P" });
	await writeFile(join(root, ".obsidian.yaml"), "vault: A\nvault: B\npm: {project: P}\n");
	await expect(readWorkspaceConfig(root)).rejects.toThrow();
});
test("CLI separates failure, timeout, error text, malformed JSON and empty rows", async () => {
	for (const result of [
		{ code: 1, killed: false, stdout: "[]", stderr: "failed" },
		{ code: 0, killed: true, stdout: "[]", stderr: "" },
		{ code: 0, killed: false, stdout: 'Error: File "a" not found.', stderr: "" },
		{ code: 0, killed: false, stdout: "[]", stderr: "Error: failed" },
	]) await expect(cliOutput(async () => result, ["read"])).rejects.toThrow();
	await expect(cliJson(async () => ({ code: 0, killed: false, stdout: "garbage", stderr: "" }), [])).rejects.toThrow();
	expect(await cliJson(async () => ({ code: 0, killed: false, stdout: "[]", stderr: "" }), [])).toEqual([]);
	await expect(cliOutput(async () => { throw new Error("timeout"); }, [])).rejects.toThrow("timeout");
});

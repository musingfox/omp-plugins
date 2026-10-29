import { beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installedHost } from "./hosts.mjs";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
beforeAll(() => {
	// Unknown slash commands can fall through to the model. Fail before any
	// dispatcher launch unless the official SDK has loaded every registration.
	const gate = Bun.spawnSync([process.execPath, join(packageDir, "tools/check-load.mjs"), "pi"], { stdout: "pipe", stderr: "pipe", timeout: 60_000 });
	if (gate.exitCode !== 0) throw new Error(`Registration gate failed; no dispatcher launched:\n${gate.stdout.toString()}\n${gate.stderr.toString()}`);
});
function invocation(noSession = true) {
	const host = installedHost("pi");
	const root = mkdtempSync(join(tmpdir(), "obw-pi-command-"));
	const cwd = join(root, "work"); const agentDir = join(root, "agent"); const bin = join(root, "bin");
	mkdirSync(cwd); mkdirSync(agentDir); mkdirSync(bin);
	writeFileSync(join(cwd, ".obsidian.yaml"), "vault: unused-unit-vault\npm: {project: P}\n");
	// Fail closed if an unpersisted-session test accidentally reaches vault I/O.
	const marker = join(root, "vault-called");
	writeFileSync(join(bin, "obsidian"), `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
	const cmd = [Bun.which("node"), host.binary, "--offline", "--no-approve", "--no-extensions", "--extension", join(packageDir, "pi.ts"), "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-themes", "--no-mcp", "--no-tools", ...(noSession ? ["--no-session"] : [])];
	const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PATH: `${bin}:${process.env.PATH}` };
	return { cmd, cwd, env, marker, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("official pi print/json dispatcher visibly rejects issue, unpersisted Bind and unbound no-session Sync without model or vault calls", () => {
	const f = invocation();
	try {
		for (const mode of [["--print"], ["--mode", "json"]]) {
			for (const [command, receipt] of [["/issue", "requires TUI mode"], ["/obw-bind pm/P/tasks/a.md", "requires a persisted user or assistant message"], ["/obw-unbind", "Unbound this session's active branch"], ["/obw-sync", "Sync failed: Writeback requires a bound session"]]) {
				const result = Bun.spawnSync([...f.cmd, ...mode, command], { cwd: f.cwd, env: f.env, timeout: 15_000 });
				expect(result.exitCode).toBe(0);
				expect(result.stderr.toString()).toContain(receipt);
				expect(result.stdout.toString()).not.toContain('"role":"assistant"');
				expect(existsSync(f.marker)).toBe(false);
			}
		}
	} finally { f.cleanup(); }
}, 120_000);

test("official pi print/json unbound persistent-session Sync also refuses before model or vault calls", () => {
	const f = invocation(false);
	try {
		for (const mode of [["--print"], ["--mode", "json"]]) {
			const result = Bun.spawnSync([...f.cmd, ...mode, "/obw-sync"], { cwd: f.cwd, env: f.env, timeout: 15_000 });
			expect(result.exitCode).toBe(0);
			expect(result.stderr.toString()).toContain("Sync failed: Writeback requires a bound session");
			expect(result.stdout.toString()).not.toContain('"role":"assistant"');
			expect(existsSync(f.marker)).toBe(false);
		}
	} finally { f.cleanup(); }
}, 60_000);

async function rpcRefusal(command, receipt) {
	const f = invocation();
	const child = Bun.spawn([...f.cmd, "--mode", "rpc"], { cwd: f.cwd, env: f.env, stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: 15_000 });
	try {
		child.stdin.write(`${JSON.stringify({ type: "prompt", id: "issue-refusal", message: command })}\n`);
		const reader = child.stdout.getReader();
		const decoder = new TextDecoder(); let text = "";
		while (!text.includes(receipt)) {
			const result = await reader.read();
			if (result.done) break;
			text += decoder.decode(result.value, { stream: true });
		}
		expect(text).toContain('"type":"extension_ui_request"');
		expect(text).toContain('"method":"notify"');
		expect(text).toContain(receipt);
		expect(text).not.toContain('"role":"assistant"');
		expect(existsSync(f.marker)).toBe(false);
	} finally { child.kill(); await child.exited; f.cleanup(); }
}
test("official pi RPC dispatcher reports issue rejection through extension UI notification", async () => {
	await rpcRefusal("/issue", "requires TUI mode");
}, 30_000);
test("official pi RPC unbound no-session Sync reports refusal without a model or vault call", async () => {
	await rpcRefusal("/obw-sync", "Sync failed: Writeback requires a bound session");
}, 30_000);

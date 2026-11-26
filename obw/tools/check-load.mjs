import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installedHost, requireEntry } from "./hosts.mjs";
import assert from "node:assert/strict";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
const requested = process.argv.slice(2);
const ids = requested.length ? requested : ["omp", "pi"];
let failed = false;
for (const id of ids) {
	let temporary;
	try {
		const host = installedHost(id);
		console.log(`[check:load:${id}] ${host.pkg.name}@${host.pkg.version}; executable=${host.binary}`);
		const entries = requireEntry(id, packageDir);
		temporary = mkdtempSync(join(tmpdir(), `obw-load-${id}-`));
		const cwd = join(temporary, "cwd");
		const agentDir = join(temporary, "agent");
		mkdirSync(cwd);
		mkdirSync(agentDir);
		if (id === "omp") {
			const version = Bun.spawnSync([host.binary, "--version"], { stdout: "pipe", stderr: "pipe", timeout: 10_000 });
			assert.equal(version.exitCode, 0, `Native OMP CLI --version failed: ${version.stderr.toString()}`);
			assert.match(version.stdout.toString(), new RegExp(`^omp/${host.version.replaceAll(".", "\\.")}(?:\\s|$)`), "Native CLI version must match the SDK");
		}
		const runtime = id === "omp" ? process.execPath : Bun.which("node");
		if (!runtime) throw new Error("Node is required for the installed pi loader");
		const result = Bun.spawnSync([runtime, fileURLToPath(new URL("./load-worker.mjs", import.meta.url)), JSON.stringify({ host, packageDir, entries, cwd, agentDir })], {
			cwd,
			env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, OMP_CODING_AGENT_DIR: agentDir },
			stdout: "inherit", stderr: "inherit", timeout: 60_000,
		});
		if (id === "omp" && result.exitCode === 0) {
			const cli = Bun.spawnSync([
				host.binary, "--print", "--no-session", "--no-extensions", "--no-skills", "--no-rules", "--no-context-files",
				"--extension", entries[0], "--session-dir", join(temporary, "sessions"), "/obw-sync",
			], {
				cwd,
				env: { ...process.env, HOME: temporary, OMP_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_DIR: agentDir, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" },
				stdout: "pipe", stderr: "pipe", timeout: 60_000,
			});
			const output = cli.stdout.toString() + cli.stderr.toString();
			assert.equal(cli.exitCode, 0, `Native CLI extension load failed: ${output}`);
			assert.match(output, /Writeback requires a bound session/, "Native CLI must dispatch registered /obw-sync without model or vault access");
			console.log("[check:load:omp] native CLI loaded extension and dispatched /obw-sync");
		}
		if (result.exitCode !== 0) failed = true;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		failed = true;
	} finally {
		if (temporary) rmSync(temporary, { recursive: true, force: true });
	}
}
process.exitCode = failed ? 1 : 0;

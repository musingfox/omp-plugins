import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installedHost } from "./hosts.mjs";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
test("a real OMP session records work start once per bound turn, including text-only turns", () => {
	const host = installedHost("omp");
	const agentDir = mkdtempSync(join(tmpdir(), "obw-omp-session-agent-"));
	try {
		const result = Bun.spawnSync([process.execPath, join(packageDir, "tools/omp-session-worker.mjs"), JSON.stringify({ host, entry: join(packageDir, "index.ts") })], {
			env: { ...process.env, OMP_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_DIR: agentDir }, stdout: "pipe", stderr: "pipe", timeout: 90_000,
		});
		console.log(result.stdout.toString());
		if (result.exitCode !== 0) console.error(result.stderr.toString());
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("PASS: OMP real-session fixture");
	} finally { rmSync(agentDir, { recursive: true, force: true }); }
}, 100_000);

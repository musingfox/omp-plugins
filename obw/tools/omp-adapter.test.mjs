import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installedHost } from "./hosts.mjs";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
test("official OMP loader wiring records work start from message_end, verifies explicit sync and invalidates stale writes", () => {
	const host = installedHost("omp");
	const agentDir = mkdtempSync(join(tmpdir(), "obw-omp-agent-"));
	try {
		// OMP's loader and session manager run on Bun; the agent dir is isolated from the user's.
		const result = Bun.spawnSync([process.execPath, join(packageDir, "tools/omp-adapter-worker.mjs"), JSON.stringify({ host, entry: join(packageDir, "index.ts") })], {
			env: { ...process.env, OMP_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_DIR: agentDir }, stdout: "pipe", stderr: "pipe", timeout: 60_000,
		});
		console.log(result.stdout.toString());
		if (result.exitCode !== 0) console.error(result.stderr.toString());
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("PASS: OMP adapter unit/wiring fixtures only");
	} finally { rmSync(agentDir, { recursive: true, force: true }); }
}, 70_000);

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installedHost, requireEntry } from "./hosts.mjs";

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
		const runtime = id === "omp" ? process.execPath : Bun.which("node");
		if (!runtime) throw new Error("Node is required for the installed pi loader");
		const result = Bun.spawnSync([runtime, fileURLToPath(new URL("./load-worker.mjs", import.meta.url)), JSON.stringify({ host, packageDir, entries, cwd, agentDir })], {
			cwd,
			env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, OMP_CODING_AGENT_DIR: agentDir },
			stdout: "inherit", stderr: "inherit", timeout: 60_000,
		});
		if (result.exitCode !== 0) failed = true;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		failed = true;
	} finally {
		if (temporary) rmSync(temporary, { recursive: true, force: true });
	}
}
process.exitCode = failed ? 1 : 0;

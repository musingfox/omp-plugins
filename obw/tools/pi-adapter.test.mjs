import { expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installedHost } from "./hosts.mjs";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
test("official-loader adapter wiring observes context, verifies explicit sync and invalidates stale writes", () => {
	const host = installedHost("pi");
	const result = Bun.spawnSync([Bun.which("node"), join(packageDir, "tools/pi-adapter-worker.mjs"), JSON.stringify({ host, entry: join(packageDir, "pi.ts") })], {
		stdout: "pipe", stderr: "pipe", timeout: 60_000,
	});
	console.log(result.stdout.toString());
	if (result.exitCode !== 0) console.error(result.stderr.toString());
	expect(result.exitCode).toBe(0);
	expect(result.stdout.toString()).toContain("PASS: adapter unit/wiring fixtures only");
}, 70_000);

import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
// Bun prepends ancestor node_modules/.bin during `bun run`. Keep the Bun that
// launched the script, not a different ancestor dependency named `bun`.
const bun = process.env.npm_execpath || process.execPath;
const [command, ...args] = process.argv.slice(2);
const commands = {
	lint: [[bun, join(packageDir, "node_modules/@biomejs/biome/bin/biome"), "lint", "--error-on-warnings", "--max-diagnostics=none", "."]],
	typecheck: [[bun, join(packageDir, "tools/typecheck.mjs"), ...args]],
	"typecheck:tools": [[bun, join(packageDir, "tools/typecheck.mjs"), "tools"]],
	"check:load": [[bun, join(packageDir, "tools/check-load.mjs"), ...args]],
	test: [[bun, "test", "."], ["bash", "tests/run.sh"]],
};
const steps = command === "check" ? ["lint", "typecheck:tools", "typecheck", "check:load", "test"] : [command];
for (const step of steps) {
	const invocations = commands[step];
	if (!invocations) throw new Error(`Unknown check: ${step}`);
	for (const invocation of invocations) {
		console.log(`[${step}] ${invocation.join(" ")}`);
		const result = Bun.spawnSync(invocation, { cwd: packageDir, stdout: "inherit", stderr: "inherit" });
		if (result.exitCode !== 0) process.exit(result.exitCode || 1);
	}
}

import { accessSync, constants, existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const marker = "OBW_COMMIT_MSG_ACTIVE";
try {
	if (process.env[marker]) throw new Error("Recursive commit-msg delegation refused");
	const config = Bun.spawnSync(["git", "config", "--global", "--path", "--get", "core.hooksPath"], { stdout: "pipe", stderr: "inherit" });
	const hooksPath = config.stdout.toString().trim();
	if (config.exitCode !== 0 || !hooksPath) throw new Error("Global core.hooksPath is missing");
	const globalHook = realpathSync(resolve(hooksPath, "commit-msg"));
	accessSync(globalHook, constants.X_OK);
	const localHook = realpathSync(fileURLToPath(new URL("../../.githooks/commit-msg", import.meta.url)));
	const gitDirResult = Bun.spawnSync(["git", "rev-parse", "--absolute-git-dir"], { stdout: "pipe", stderr: "inherit" });
	if (gitDirResult.exitCode !== 0) throw new Error("Cannot resolve repository git directory");
	const repoHook = join(gitDirResult.stdout.toString().trim(), "hooks/commit-msg");
	// The real global hook calls .git/hooks/commit-msg before validating the message.
	// Refuse known alias loops up front; the inherited marker catches indirect loops.
	if (globalHook === localHook || (existsSync(repoHook) && [localHook, globalHook].includes(realpathSync(repoHook)))) {
		throw new Error("Recursive global/local/.git/hooks commit-msg path refused");
	}
	console.log(`[commit-msg] delegate=${globalHook}`);
	const result = Bun.spawnSync([globalHook, ...process.argv.slice(2)], {
		env: { ...process.env, [marker]: "1" }, stdout: "inherit", stderr: "inherit",
	});
	process.exitCode = result.exitCode === 0 ? 0 : 1;
} catch (error) {
	console.error(`commit-msg: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}

import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function fixture(run) {
	const root = mkdtempSync(join(tmpdir(), "obw-hook-"));
	/** @type {NodeJS.ProcessEnv} */
	const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "global.config"), GIT_CONFIG_NOSYSTEM: "1" };
	delete env.OBW_COMMIT_MSG_ACTIVE;
	const command = (args) => Bun.spawnSync(args, { cwd: root, env, stdout: "pipe", stderr: "pipe" });
	const executable = (path, text) => { writeFileSync(path, text); chmodSync(path, 0o755); };
	try {
		const init = command(["git", "init", "--quiet"]);
		expect(init.exitCode).toBe(0);
		mkdirSync(join(root, ".githooks"));
		mkdirSync(join(root, "obw/tools"), { recursive: true });
		copyFileSync(fileURLToPath(new URL("../../.githooks/commit-msg", import.meta.url)), join(root, ".githooks/commit-msg"));
		chmodSync(join(root, ".githooks/commit-msg"), 0o755);
		copyFileSync(fileURLToPath(new URL("./commit-msg.mjs", import.meta.url)), join(root, "obw/tools/commit-msg.mjs"));
		mkdirSync(join(root, "global"));
		// Match the real global hook's callback order; never modify the user's hook.
		executable(join(root, "global/commit-msg"), '#!/bin/sh\nrepo_hook="$(git rev-parse --git-dir)/hooks/commit-msg"\nif [ -x "$repo_hook" ]; then "$repo_hook" "$@" || exit $?; fi\ngrep -q "^chore: " "$1"\n');
		writeFileSync(env.GIT_CONFIG_GLOBAL, `[core]\n hooksPath = ${join(root, "global")}\n`);
		writeFileSync(join(root, "message"), "chore: hook fixture\n");
		run({ root, env, command, executable, invoke: () => command([join(root, ".githooks/commit-msg"), join(root, "message")]) });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("commit-msg delegates and preserves global validation/local hook failures", () => fixture(({ root, invoke, executable }) => {
	expect(invoke().exitCode).toBe(0);
	writeFileSync(join(root, "message"), "not conventional\n");
	expect(invoke().exitCode).toBe(1);
	writeFileSync(join(root, "message"), "chore: hook fixture\n");
	executable(join(root, ".git/hooks/commit-msg"), "#!/bin/sh\nexit 7\n");
	expect(invoke().exitCode).toBe(1);
}));

test("commit-msg fails closed when the global hooksPath is absent", () => fixture(({ env, invoke }) => {
	writeFileSync(env.GIT_CONFIG_GLOBAL, "");
	const result = invoke();
	expect(result.exitCode).toBe(1);
	expect(result.stderr.toString()).toContain("Global core.hooksPath is missing");
}));

test("commit-msg rejects global and .git/hooks symlink cycles", () => fixture(({ root, env, invoke }) => {
	const repoHook = join(root, ".git/hooks/commit-msg");
	symlinkSync(join(root, ".githooks/commit-msg"), repoHook);
	expect(invoke().stderr.toString()).toContain("Recursive global/local/.git/hooks");
	rmSync(repoHook);
	writeFileSync(env.GIT_CONFIG_GLOBAL, `[core]\n hooksPath = ${join(root, ".githooks")}\n`);
	expect(invoke().exitCode).toBe(1);
}));

test("commit-msg inherited marker stops indirect .git/hooks callback recursion", () => fixture(({ root, invoke, executable }) => {
	executable(join(root, ".git/hooks/commit-msg"), '#!/bin/sh\nexec "$(git rev-parse --show-toplevel)/.githooks/commit-msg" "$@"\n');
	const result = invoke();
	expect(result.exitCode).toBe(1);
	expect(result.stderr.toString()).toContain("recursive delegation refused");
}));

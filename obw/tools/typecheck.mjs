import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installedHost, requireEntry } from "./hosts.mjs";
import { bunTypecheckEnvironment, coreTypecheckConfig, hostTypecheckConfig } from "./typecheck-config.mjs";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
const requested = process.argv.slice(2);
const ids = requested.length ? requested : ["omp", "pi", "core"];
let failed = false;
for (const id of ids) {
	const configDir = join(packageDir, ".checks");
	const configPath = join(configDir, `tsconfig.${id}.json`);
	const typeRoots = join(configDir, `typeRoots.${id}`);
	try {
		let config;
		if (id === "core" || id === "tools") {
			console.log(`[typecheck:${id}] host-free ${id === "core" ? "units/tests" : "check tools"}; types=[bun]; no host SDK mapping`);
			const environment = bunTypecheckEnvironment(packageDir, typeRoots);
			config = id === "core"
				? coreTypecheckConfig()
				: { extends: "../tsconfig.tools.json", compilerOptions: {} };
			Object.assign(config.compilerOptions, environment);
		} else {
			const host = installedHost(id);
			console.log(`[typecheck:${id}] ${host.pkg.name}@${host.pkg.version}; executable=${host.binary}; exports.types=${host.pkg.exports["."].types}`);
			requireEntry(id, packageDir);
			config = hostTypecheckConfig(id, packageDir, host, typeRoots);
		}
		mkdirSync(configDir, { recursive: true });
		writeFileSync(configPath, JSON.stringify(config, null, 2));
		const result = Bun.spawnSync([process.execPath, resolve(packageDir, "node_modules/typescript/bin/tsc"), "--project", configPath, "--pretty", "false", ...(process.env.OBW_TYPECHECK_LIST_FILES === "1" ? ["--listFiles"] : [])], {
			cwd: packageDir, stdout: "inherit", stderr: "inherit",
		});
		if (result.exitCode !== 0) failed = true;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		failed = true;
	} finally {
		rmSync(configPath, { force: true });
		rmSync(typeRoots, { recursive: true, force: true });
	}
}
process.exitCode = failed ? 1 : 0;

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";

export const hosts = {
	omp: { executable: "omp", name: "@oh-my-pi/pi-coding-agent", version: "18.13.3", entry: "index.ts" },
	pi: { executable: "pi", name: "@earendil-works/pi-coding-agent", version: "1.4.0", entry: "pi.ts" },
};

export function installedHost(id) {
	const host = hosts[id];
	if (!host) throw new Error(`Unknown host: ${id}`);
	const override = process.env[`OBW_${id.toUpperCase()}_ROOT`];
	if (override) {
		const root = realpathSync(override);
		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		if (pkg.name !== host.name || pkg.version !== host.version) {
			throw new Error(`Root override ${root}: expected ${host.name}@${host.version}, got ${pkg.name}@${pkg.version}`);
		}
		const entry = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[host.executable];
		if (!entry) throw new Error(`Root override has no ${host.executable} executable`);
		const binary = realpathSync(join(root, entry));
		console.log(`[host:${id}] explicit root=${root}; ${pkg.name}@${pkg.version}; executable=${binary}`);
		return { ...host, id, binary, root, pkg };
	}
	const seen = new Set();
	for (const directory of (process.env.PATH ?? "").split(delimiter)) {
		const executable = Bun.which(host.executable, { PATH: directory || "." });
		if (!executable) continue;
		const binary = realpathSync(executable);
		if (seen.has(binary)) continue;
		seen.add(binary);
		let found;
		for (let root = dirname(binary); ; root = dirname(root)) {
			const manifest = join(root, "package.json");
			if (existsSync(manifest)) {
				const pkg = JSON.parse(readFileSync(manifest, "utf8"));
				found = { root, pkg };
				break;
			}
			if (dirname(root) === root) break;
		}
		if (found?.pkg.name === host.name && found.pkg.version === host.version) {
			console.log(`[host:${id}] selected root=${found.root}; ${found.pkg.name}@${found.pkg.version}; executable=${binary}`);
			return { ...host, id, binary, ...found };
		}
		console.warn(`[host:${id}] WARNING: PATH candidate ${binary} is ${found ? `${found.pkg.name}@${found.pkg.version}` : "not an installed package"}; expected ${host.name}@${host.version}; not selected`);
	}
	throw new Error(`Cannot locate installed ${host.name}@${host.version} on PATH; set OBW_${id.toUpperCase()}_ROOT to an explicitly verified installed root`);
}

// Only the installed package's public exports with an explicit types condition
// may become TypeScript paths. Runtime source exports are never substituted.
export function declarationPaths(host) {
	const paths = {};
	for (const [key, value] of Object.entries(host.pkg.exports ?? {})) {
		if (!key.startsWith(".") || typeof value?.types !== "string") continue;
		const specifier = key === "." ? host.name : `${host.name}/${key.slice(2)}`;
		const target = resolve(host.root, value.types);
		if (!target.includes("*") && !existsSync(target)) {
			throw new Error(`Missing installed declaration: ${target}`);
		}
		paths[specifier] = [target];
	}
	if (!paths[host.name]) throw new Error(`${host.name} has no root exports.types`);
	return paths;
}

export function requireEntry(id, packageDir) {
	const host = hosts[id];
	if (!host) throw new Error(`Unknown host: ${id}`);
	const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
	const entries = pkg[id]?.extensions;
	if (!existsSync(join(packageDir, host.entry)) || !Array.isArray(entries) || !entries.includes(`./${host.entry}`)) {
		throw new Error(`PENDING: ${id} entry ${host.entry} and ${id}.extensions are not implemented (dual-host-plan §6 step 6)`);
	}
	return entries.map((entry) => realpathSync(resolve(packageDir, entry)));
}

import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { declarationPaths } from "./hosts.mjs";

export function tuiDeclarationPaths(host) {
	const name = host.id === "pi" ? "@earendil-works/pi-tui" : "@oh-my-pi/pi-tui";
	for (let directory = host.root; ; directory = dirname(directory)) {
		const root = join(directory, "node_modules", name);
		const manifest = join(root, "package.json");
		if (existsSync(manifest)) {
			const pkg = JSON.parse(readFileSync(manifest, "utf8"));
			if (pkg.name !== name || pkg.version !== host.version) throw new Error(`Expected ${name}@${host.version}, got ${pkg.name}@${pkg.version}`);
			const types = pkg.exports ? pkg.exports["."]?.types : pkg.types;
			if (typeof types !== "string" || !existsSync(resolve(root, types))) throw new Error(`${name} has no official public types entry`);
			console.log(`[typecheck:${host.id}] ${name}@${pkg.version}; ${pkg.exports ? "exports.types" : "types"}=${types}; root=${root}`);
			return { [name]: [resolve(root, types)] };
		}
		if (dirname(directory) === directory) throw new Error(`Cannot locate installed ${name}`);
	}
}

export function hostTypecheckConfig(id, packageDir, host, typeRoots = resolve(packageDir, ".checks/typeRoots.omp")) {
	/** @type {Record<string, string[]>} */
	const paths = { ...declarationPaths(host), ...tuiDeclarationPaths(host) };
	const environment = id === "omp" ? bunTypecheckEnvironment(packageDir, typeRoots) : {};
	if ("paths" in environment) Object.assign(paths, environment.paths);
	if (id === "pi") {
		const nodeRoot = resolve(packageDir, "node_modules/@types/node");
		const node = JSON.parse(readFileSync(join(nodeRoot, "package.json"), "utf8"));
		if (node.name !== "@types/node" || node.version !== "22.19.19") {
			throw new Error(`Pi typecheck requires official @types/node@22.19.19; got ${node.name}@${node.version}`);
		}
		// Pi's published declarations use PlatformPath from Node 22. Do not
		// resolve that import to the installed host's nested Node 26 declarations.
		paths.node = [join(nodeRoot, "index.d.ts")];
		paths.path = [join(nodeRoot, "path.d.ts")];
		paths["node:path"] = [join(nodeRoot, "path.d.ts")];
		console.log(`[typecheck:pi] official @types/node@${node.version}; root=${nodeRoot}; types=[node] (no Bun globals)`);
	}
	return {
		compilerOptions: {
			target: "ESNext", module: "ESNext", moduleResolution: "Bundler",
			strict: true, noEmit: true, types: [id === "pi" ? "node" : "bun"],
			allowImportingTsExtensions: true,
			...(id === "pi" ? { typeRoots: [resolve(packageDir, "node_modules/@types")] } : {}),
			// OMP 18.13.3's published declaration graph does not type-check on its
			// own (missing @huggingface/tokenizers aliases, models.json, fastembed;
			// a CustomToolAdapter override mismatch). OBW's use of that API stays checked.
			...(id === "omp" ? { skipLibCheck: true } : {}),
			...environment,
			paths,
		},
		include: ["../**/*.ts"],
		exclude: ["../node_modules", "../.checks", `../${id === "omp" ? "pi" : "index"}.ts`, ...(id === "pi" ? ["../**/*.test.ts"] : [])],
	};
}

// These units and their tests are host-free. Host adapter imports must not
// pull either SDK declaration graph into the Bun-global check.
export function bunTypecheckEnvironment(packageDir, typeRoots) {
	const nodeRoot = resolve(packageDir, "node_modules/@types/node-bun");
	const node = JSON.parse(readFileSync(join(nodeRoot, "package.json"), "utf8"));
	if (node.name !== "@types/node" || node.version !== "26.6.5") {
		throw new Error(`Bun typecheck requires official @types/node@26.6.5 alias; got ${node.name}@${node.version}`);
	}
	mkdirSync(typeRoots, { recursive: true });
	// Type reference directives also use this isolated root, not the Node 22
	// package next to bun-types. Links contain only official package contents.
	symlinkSync(nodeRoot, join(typeRoots, "node"), "dir");
	symlinkSync(resolve(packageDir, "node_modules/@types/bun"), join(typeRoots, "bun"), "dir");
	console.log(`[typecheck:bun] official @types/node@${node.version}; root=${nodeRoot}; typeRoots=${typeRoots}`);
	return { typeRoots: [typeRoots], paths: { node: [join(nodeRoot, "index.d.ts")] } };
}

export function coreTypecheckConfig() {
	return {
		compilerOptions: {
			target: "ESNext", module: "ESNext", moduleResolution: "Bundler",
			strict: true, noEmit: true, types: ["bun"],
			allowImportingTsExtensions: true,
		},
		include: ["../contracts.test.ts", ...["workspace", "session", "issue", "writeback", "pm"].flatMap((name) => [`../${name}.ts`, `../${name}.test.ts`])],
	};
}

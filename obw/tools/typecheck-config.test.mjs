import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { declarationPaths, installedHost } from "./hosts.mjs";
import { bunTypecheckEnvironment, coreTypecheckConfig, hostTypecheckConfig, tuiDeclarationPaths } from "./typecheck-config.mjs";

const packageDir = fileURLToPath(new URL("../", import.meta.url));

test("pi source check selects official Node 22 declarations and excludes every test", () => {
	const host = installedHost("pi");
	const config = hostTypecheckConfig("pi", packageDir, host);
	const nodeRoot = resolve(packageDir, "node_modules/@types/node");
	expect(config.compilerOptions.types).toEqual(["node"]);
	expect(config.compilerOptions.typeRoots).toEqual([resolve(packageDir, "node_modules/@types")]);
	expect(config.compilerOptions.paths).toEqual({
		...declarationPaths(host),
		...tuiDeclarationPaths(host),
		node: [resolve(nodeRoot, "index.d.ts")],
		path: [resolve(nodeRoot, "path.d.ts")],
		"node:path": [resolve(nodeRoot, "path.d.ts")],
	});
	expect(config.exclude).toContain("../**/*.test.ts");
	expect(config.exclude).toContain("../index.ts");
	expect(config.compilerOptions.strict).toBe(true);
	expect(config.compilerOptions.noEmit).toBe(true);
	expect(config.compilerOptions).not.toHaveProperty("skipLibCheck");
});

test("Bun type reference root resolves only the official Node 26 alias", () => {
	const root = mkdtempSync(join(tmpdir(), "obw-bun-types-"));
	try {
		const config = bunTypecheckEnvironment(packageDir, root);
		const nodeRoot = resolve(packageDir, "node_modules/@types/node-bun");
		expect(config.typeRoots).toEqual([root]);
		expect(config.paths.node).toEqual([join(nodeRoot, "index.d.ts")]);
		expect(realpathSync(join(root, "node"))).toBe(realpathSync(nodeRoot));
		expect(JSON.parse(readFileSync(join(root, "node/package.json"), "utf8")).version).toBe("26.6.5");
		expect(realpathSync(join(root, "bun"))).toBe(realpathSync(resolve(packageDir, "node_modules/@types/bun")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("OMP check retains its official SDK and Bun tests, skipping only library declaration checks", () => {
	const host = installedHost("omp");
	const root = mkdtempSync(join(tmpdir(), "obw-omp-types-"));
	let config;
	try { config = hostTypecheckConfig("omp", packageDir, host, root); }
	finally { rmSync(root, { recursive: true, force: true }); }
	expect(config.compilerOptions.types).toEqual(["bun"]);
	expect(config.compilerOptions.typeRoots).toEqual([root]);
	expect(config.compilerOptions.paths).toEqual({ ...declarationPaths(host), ...tuiDeclarationPaths(host), node: [resolve(packageDir, "node_modules/@types/node-bun/index.d.ts")] });
	expect(config.include).toEqual(["../**/*.ts"]);
	expect(config.exclude).not.toContain("../**/*.test.ts");
	expect(config.exclude).toContain("../pi.ts");
	expect(config.compilerOptions.skipLibCheck).toBe(true);
});

test("Bun core check covers contracts and named host-free units without either adapter", () => {
	const config = coreTypecheckConfig();
	expect(config.compilerOptions.types).toEqual(["bun"]);
	expect(config.include).toEqual([
		"../contracts.test.ts", "../workspace.ts", "../workspace.test.ts",
		"../session.ts", "../session.test.ts", "../issue.ts", "../issue.test.ts",
		"../writeback.ts", "../writeback.test.ts",
	]);
	expect(config.compilerOptions).not.toHaveProperty("paths");
	expect(config.compilerOptions).not.toHaveProperty("skipLibCheck");
});

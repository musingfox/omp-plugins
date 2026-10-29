import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { declarationPaths, installedHost, requireEntry } from "./hosts.mjs";

test("declarationPaths maps only formal exports.types, never runtime source", () => {
	const root = mkdtempSync(join(tmpdir(), "obw-types-"));
	try {
		writeFileSync(join(root, "index.d.ts"), "export {};\n");
		expect(declarationPaths({ root, name: "official-host", pkg: { exports: {
			".": { types: "./index.d.ts", import: "./src/index.ts" },
			"./extensions/*": { types: "./dist/*.d.ts", import: "./src/*.ts" },
			"./runtime": { import: "./runtime.js" },
		} } })).toEqual({ "official-host": [join(root, "index.d.ts")], "official-host/extensions/*": [join(root, "dist/*.d.ts")] });
		expect(() => declarationPaths({ root, name: "official-host", pkg: { exports: { ".": { import: "./src/index.ts" } } } })).toThrow("no root exports.types");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("installedHost diagnoses shadow packages and verifies explicit roots by name/version", () => {
	const root = mkdtempSync(join(tmpdir(), "obw-host-path-"));
	const previousPath = process.env.PATH;
	const previousOverride = process.env.OBW_PI_ROOT;
	try {
		for (const [directory, name, version] of [["shadow", "@mariozechner/pi-coding-agent", "0.0.0"], ["official", "@earendil-works/pi-coding-agent", "1.4.0"]]) {
			mkdirSync(join(root, directory, "bin"), { recursive: true });
			writeFileSync(join(root, directory, "package.json"), JSON.stringify({ name, version, bin: { pi: "bin/pi" } }));
			writeFileSync(join(root, directory, "bin/pi"), "#!/bin/sh\nexit 0\n");
			chmodSync(join(root, directory, "bin/pi"), 0o755);
		}
		delete process.env.OBW_PI_ROOT;
		process.env.PATH = [join(root, "shadow/bin"), join(root, "official/bin")].join(delimiter);
		expect(installedHost("pi").root).toBe(realpathSync(join(root, "official")));
		process.env.OBW_PI_ROOT = join(root, "shadow");
		expect(() => installedHost("pi")).toThrow("expected @earendil-works/pi-coding-agent@1.4.0");
		process.env.OBW_PI_ROOT = join(root, "official");
		expect(installedHost("pi").root).toBe(realpathSync(join(root, "official")));
	} finally {
		if (previousPath === undefined) delete process.env.PATH;
		else process.env.PATH = previousPath;
		if (previousOverride === undefined) delete process.env.OBW_PI_ROOT;
		else process.env.OBW_PI_ROOT = previousOverride;
		rmSync(root, { recursive: true, force: true });
	}
});

test("requireEntry reports an unimplemented pi manifest/entry as PENDING, not a pass", () => {
	const root = mkdtempSync(join(tmpdir(), "obw-entry-"));
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ omp: { extensions: ["./index.ts"] } }));
		writeFileSync(join(root, "index.ts"), "export default () => {};\n");
		expect(requireEntry("omp", root)).toEqual([realpathSync(join(root, "index.ts"))]);
		expect(() => requireEntry("pi", root)).toThrow("PENDING: pi entry pi.ts");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

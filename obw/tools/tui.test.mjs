import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createIssueComponent, initialIssueState, sanitizeText } from "../issue";
import { installedHost } from "./hosts.mjs";
import { tuiDeclarationPaths } from "./typecheck-config.mjs";

test("TUI resolver accepts official import-only exports and refuses the first wrong candidate", () => {
	const host = installedHost("omp");
	const name = "@oh-my-pi/pi-tui";
	const officialTypes = tuiDeclarationPaths(host)[name][0];
	const officialRoot = dirname(dirname(dirname(officialTypes)));
	const root = mkdtempSync(join(tmpdir(), "obw-tui-resolution-"));
	const candidate = join(root, "nested/node_modules", name);
	try {
		mkdirSync(candidate, { recursive: true });
		const pkg = JSON.parse(readFileSync(join(officialRoot, "package.json"), "utf8"));
		writeFileSync(join(candidate, "package.json"), JSON.stringify(pkg));
		symlinkSync(join(officialRoot, "dist"), join(candidate, "dist"), "dir");
		const fixture = { ...host, root: join(root, "nested") };
		expect(realpathSync(tuiDeclarationPaths(fixture)[name][0])).toBe(realpathSync(officialTypes));
		writeFileSync(join(candidate, "package.json"), JSON.stringify({ ...pkg, version: "wrong" }));
		expect(() => tuiDeclarationPaths(fixture)).toThrow("Expected");
		writeFileSync(join(candidate, "package.json"), JSON.stringify({ ...pkg, exports: { ".": { import: "./src/index.ts" } }, types: pkg.types }));
		expect(() => tuiDeclarationPaths(fixture)).toThrow("no official public types");
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("official pi column fitter keeps CJK, emoji, combining characters and narrow lines within width", async () => {
	const host = installedHost("pi");
	const types = tuiDeclarationPaths(host)["@earendil-works/pi-tui"][0];
	const { truncateToWidth, visibleWidth } = await import(pathToFileURL(join(dirname(types), "utils.js")).href);
	const component = createIssueComponent({ ...initialIssueState(), mode: "card", body: '---\ntitle: "中文😀é"\nstatus: todo\npriority: high\nrelated: ["[[中文卡]]"]\n---\n## Acceptance Criteria\n- [ ] 中文😀驗收\n' }, () => {}, (text, width) => truncateToWidth(sanitizeText(text, Number.MAX_SAFE_INTEGER), width));
	for (const width of [0, 1, 2, 5, 12, 80]) {
		component.invalidate();
		for (const line of component.render(width)) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			expect(line).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
		}
	}
	expect(component.render(80).join("\n")).toContain("related: [[中文卡]]");
	expect(component.render(80).join("\n")).toContain("Acceptance Criteria: 0/1");
});

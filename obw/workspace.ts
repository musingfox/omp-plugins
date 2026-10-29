import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";

export type WorkspaceConfig = { vault: string; project: string };
export type IssueExec = (command: string, args: string[], options?: { timeout?: number }) => Promise<unknown>;
export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function hasControlCharacters(value: string): boolean {
	return [...value].some((char) => { const code = char.codePointAt(0) ?? 0; return code < 32 || code === 127; });
}
function validSegment(value: unknown): value is string {
	return typeof value === "string" && !!value.trim() && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\") && !hasControlCharacters(value);
}
export function isSafeCardPath(path: unknown, project: string): path is string {
	if (!validSegment(project) || typeof path !== "string" || !path.startsWith(`pm/${project}/`) || !path.endsWith(".md")) return false;
	return path.split("/").every(validSegment) && path.slice(path.lastIndexOf("/") + 1) !== ".md";
}
export function isTaskPath(path: unknown, project: string): path is string {
	return isSafeCardPath(path, project) && path.startsWith(`pm/${project}/tasks/`);
}
export function parseYamlMapping(source: string): Record<string, unknown> {
	const document = parseDocument(source);
	if (document.errors.length) throw new Error(`Invalid YAML: ${document.errors.map((error) => error.message).join("; ")}`);
	const mapping = asRecord(document.toJS({ maxAliasCount: 100 }));
	if (!mapping) throw new Error("YAML must contain a mapping");
	return mapping;
}
export async function readWorkspaceConfig(cwd: string): Promise<WorkspaceConfig> {
	for (let directory = resolve(cwd); ; directory = dirname(directory)) {
		const path = join(directory, ".obsidian.yaml");
		let source: string;
		try { source = await readFile(path, "utf8"); }
		catch (error) {
			if (asRecord(error)?.code !== "ENOENT") throw new Error(`Cannot read ${path}: ${String(error)}`);
			if (dirname(directory) === directory) break;
			continue;
		}
		const config = parseYamlMapping(source);
		const vault = config?.vault;
		const project = asRecord(config?.pm)?.project;
		if (typeof vault !== "string" || !vault.trim() || hasControlCharacters(vault) || !validSegment(project)) {
			throw new Error(`${path} requires a vault name and pm.project folder; run /obw-init first`);
		}
		return { vault, project };
	}
	throw new Error(`No .obsidian.yaml in ${cwd} or its parents; run /obw-init first`);
}
export function parseFrontMatter(source: string): { frontmatter: Record<string, unknown>; body: string } {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return { frontmatter: {}, body: source };
	const frontmatter = parseYamlMapping(match[1]);
	return { frontmatter, body: source.slice(match[0].length) };
}
export async function cliOutput(exec: IssueExec, args: string[]): Promise<string> {
	const result = asRecord(await exec("obsidian", args, { timeout: 15_000 }));
	if (!result || typeof result.code !== "number" || typeof result.stdout !== "string" || typeof result.stderr !== "string" || typeof result.killed !== "boolean") throw new Error("Obsidian CLI returned invalid output");
	if (result.killed || result.code !== 0 || result.stderr.trim() || /^(?:Error:|ERR\b|File not found\b)/im.test(result.stdout)) throw new Error(`Obsidian CLI failed: ${result.stderr || result.stdout || (result.killed ? "timeout" : result.code)}`);
	return result.stdout;
}
export async function cliJson(exec: IssueExec, args: string[]): Promise<unknown> {
	const text = await cliOutput(exec, args);
	try { return JSON.parse(text) as unknown; }
	catch { throw new Error("Obsidian CLI returned malformed JSON"); }
}

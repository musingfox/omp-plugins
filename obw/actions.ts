import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asRecord, isTaskPath, parseFrontMatter, readWorkspaceConfig, type IssueExec, type WorkspaceConfig } from "./workspace";

export function workPrompt(path: string, vault: string, ...overrides: (string | undefined)[]): string {
	const chosen = overrides.find((text) => text?.trim());
	return chosen ? chosen.replace(/\{(card|vault)\}/g, (_, name) => name === "card" ? path : vault)
		: `Work on the pm task card ${path} in vault ${vault}. Read it with the Obsidian CLI, then meet its acceptance criteria. Set its status with pm_status when you start and when you finish, and tick each criterion with pm_tick once you have verified it.`;
}

export async function currentWorkPrompt(cwd: string, scope: WorkspaceConfig, path: string, userPrompt?: string): Promise<string> {
	const latest = await readWorkspaceConfig(cwd);
	if (latest.vault !== scope.vault || latest.project !== scope.project) throw new Error("Workspace changed; reopen /issue before sending work");
	if (!isTaskPath(path, scope.project)) throw new Error("Only project task cards can be sent for work");
	return workPrompt(path, scope.vault, latest.workPrompt, userPrompt);
}

export async function openCardInBrowser(path: string, raw: string, exec: IssueExec): Promise<string> {
	const renderer = fileURLToPath(new URL("../viz/lib/render.sh", import.meta.url));
	try { await access(renderer); } catch { throw new Error("The sibling viz package is required to open cards in the browser"); }
	const directory = await mkdtemp(join(tmpdir(), "obw-card-"));
	try {
		const input = join(directory, "card.md");
		await writeFile(input, parseFrontMatter(raw).body, "utf8");
		const result = asRecord(await exec("bash", [renderer, input, basename(path, ".md")], { timeout: 60_000 }));
		if (result?.code !== 0 || result.killed || typeof result.stdout !== "string" || !result.stdout.trim()) {
			throw new Error(`Could not render card: ${String(result?.stderr || result?.stdout || "viz failed")}`);
		}
		return result.stdout.trim();
	} finally { await rm(directory, { recursive: true, force: true }); }
}

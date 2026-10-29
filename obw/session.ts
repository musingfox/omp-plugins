import { readFile } from "node:fs/promises";
import { asRecord, cliOutput, isTaskPath, parseFrontMatter, type IssueExec, type WorkspaceConfig } from "./workspace";

export type BranchEntry = { type: string; id: string; customType?: string; data?: unknown; message?: unknown };
export type Binding = WorkspaceConfig & { host: "pi" | "omp"; sessionId: string; cardPath: string };
export function getBinding(entries: readonly BranchEntry[], sessionId: string): Binding | undefined {
	let binding: Binding | undefined;
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== "obw-binding") continue;
		binding = undefined;
		const data = asRecord(entry.data);
		if (!data || (data.host !== "pi" && data.host !== "omp") || data.sessionId !== sessionId || typeof data.vault !== "string" || !data.vault || typeof data.project !== "string" || !isTaskPath(data.cardPath, data.project)) continue;
		binding = { host: data.host, sessionId, vault: data.vault, project: data.project, cardPath: data.cardPath };
	}
	return binding;
}
export function selectSnapshot(entries: readonly BranchEntry[]): { entryId: string; text: string } {
	let userIndex = -1;
	let answerIndex = -1;
	for (const [index, entry] of entries.entries()) {
		if (entry.type !== "message") continue;
		const message = asRecord(entry.message);
		if (message?.role === "user") userIndex = index;
		if (message?.role === "assistant") answerIndex = index;
	}
	if (userIndex < 0 || answerIndex <= userIndex) throw new Error("No completed reply in the current turn");
	const entry = entries[answerIndex];
	const message = asRecord(entry.message);
	if (message?.stopReason !== "stop" || message.errorMessage !== undefined || !Array.isArray(message.content) || message.content.some((block) => asRecord(block)?.type === "toolCall")) throw new Error("Latest reply is not a completed text snapshot");
	const text = message.content.flatMap((block) => { const item = asRecord(block); return item?.type === "text" && typeof item.text === "string" ? [item.text] : []; }).join("\n");
	if (!text.trim()) throw new Error("Latest reply has no text");
	return { entryId: entry.id, text };
}
/** A session filename is allocated before the first conversation is flushed. */
export async function hasPersistedConversation(file: string | undefined, branch: readonly BranchEntry[]): Promise<boolean> {
	if (!file) return false;
	const ids = new Set(branch.filter((entry) => entry.type === "message" && ["user", "assistant"].includes(String(asRecord(entry.message)?.role))).map((entry) => entry.id));
	if (!ids.size) return false;
	try {
		const content = await readFile(file, "utf8");
		return content.split("\n").filter((line) => line.trim()).some((line) => {
			const entry = asRecord(JSON.parse(line));
			return entry?.type === "message" && typeof entry.id === "string" && ids.has(entry.id) && ["user", "assistant"].includes(String(asRecord(entry.message)?.role));
		});
	} catch { return false; }
}
/** Prove every captured source message exists on disk with its active-branch role. */
export async function hasPersistedSource(file: string | undefined, branch: readonly BranchEntry[], requiredIds: readonly string[]): Promise<boolean> {
	if (!file || !requiredIds.length) return false;
	const required = new Map<string, "user" | "assistant">();
	for (const id of requiredIds) {
		const entry = branch.find((entry) => entry.id === id);
		const role = asRecord(entry?.message)?.role;
		if (!id || entry?.type !== "message" || (role !== "user" && role !== "assistant")) return false;
		required.set(id, role);
	}
	try {
		const content = await readFile(file, "utf8");
		const found = new Set<string>();
		for (const line of content.split("\n").filter((line) => line.trim())) {
			const entry = asRecord(JSON.parse(line));
			if (entry?.type !== "message" || typeof entry.id !== "string" || !required.has(entry.id)) continue;
			if (asRecord(entry.message)?.role !== required.get(entry.id)) return false;
			found.add(entry.id);
		}
		return found.size === required.size;
	} catch { return false; }
}
export type BindingContext = {
	sessionId(): string;
	branch(): readonly BranchEntry[];
	isPersisted(): Promise<boolean>;
	append(binding: Binding | null): void;
	confirm(owner: string): Promise<boolean>;
};
function cardSession(body: string): string | undefined {
	const value = parseFrontMatter(body).frontmatter.session;
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "string") throw new Error("Card session property must be text");
	return value;
}
function bindCode(cardPath: string, sessionId: string, previous: string | undefined): string {
	// JSON data is not shell-interpolated; the synchronous frontmatter callback
	// compares the observed owner again, including after the approval dialog.
	return `(async () => {
 const p = ${JSON.stringify({ cardPath, sessionId, previous: previous ?? null })};
 const f = app.vault.getAbstractFileByPath(p.cardPath);
 if (!f || f.extension !== 'md') throw new Error('Task not found');
 await app.fileManager.processFrontMatter(f, fm => {
   const owner = fm.session == null || fm.session === '' ? null : fm.session;
   if (owner !== p.previous) throw new Error('Binding conflict: card session changed');
   fm.session = p.sessionId;
 });
 return 'OBW_BIND:' + JSON.stringify({body: await app.vault.read(f)});
})()`;
}
export function createBindingController(exec: IssueExec, host: Binding["host"]) {
	let revision = 0;
	let queue = Promise.resolve();
	return {
		invalidate() { revision++; },
		unbind(context: BindingContext) { revision++; context.append(null); },
		bind(config: WorkspaceConfig, cardPath: string, context: BindingContext): Promise<void> {
			const request = ++revision;
			const sessionId = context.sessionId();
			const ancestry = context.branch().map((entry) => entry.id).join("\n");
			const check = () => {
				if (request !== revision || context.sessionId() !== sessionId || context.branch().map((entry) => entry.id).join("\n") !== ancestry) throw new Error("Binding request invalidated by session, branch or binding change");
			};
			const work = queue.then(async () => {
				check();
				if (!isTaskPath(cardPath, config.project)) throw new Error("Bind requires a vault-relative task path in this project");
				if (!sessionId || !await context.isPersisted()) throw new Error("Bind requires a persisted user or assistant message; --no-session and new empty sessions cannot bind");
				check();
				const body = await cliOutput(exec, [`vault=${config.vault}`, "read", `path=${cardPath}`]);
				check();
				const previous = cardSession(body);
				if (previous && previous !== sessionId && !await context.confirm(previous)) throw new Error("Replacement binding was not approved");
				check();
				const output = await cliOutput(exec, [`vault=${config.vault}`, "eval", `code=${bindCode(cardPath, sessionId, previous)}`]);
				check();
				const receipt = output.trim().match(/^(?:=>\s*)?OBW_BIND:(\{.*\})$/s);
				const readback = receipt ? asRecord(JSON.parse(receipt[1])) : undefined;
				if (typeof readback?.body !== "string" || cardSession(readback.body) !== sessionId) throw new Error("Bind readback failed; no session binding recorded");
				context.append({ host, sessionId, ...config, cardPath });
			});
			queue = work.catch(() => {});
			return work;
		},
	};
}

import { createHash } from "node:crypto";
import { fromMarkdown } from "mdast-util-from-markdown";
import { getBinding, selectSnapshot, type Binding, type BranchEntry } from "./session";
import { asRecord, cliOutput, hasControlCharacters, parseFrontMatter, type IssueExec } from "./workspace";

export type WritebackReceipt = Binding & {
	kind: "sync" | "start";
	sourceEntryId: string;
	runPath?: string;
	verified: true;
	alreadyRecorded: boolean;
};
export type WritebackStartContext = {
	sessionId(): string;
	branch(): readonly BranchEntry[];
	isPersisted(requiredIds: readonly string[]): Promise<boolean>;
	isIdle(): boolean;
	hasPendingMessages(): boolean;
	appendReceipt(receipt: WritebackReceipt): void;
};
export type WritebackContext = WritebackStartContext & {
	waitForIdle(): Promise<void>;
};

function currentUser(entries: readonly BranchEntry[]): string | undefined {
	return entries.findLast((entry) => entry.type === "message" && asRecord(entry.message)?.role === "user")?.id;
}
function ancestry(entries: readonly BranchEntry[]): string {
	// Our own receipts must not invalidate a second queued request for the same snapshot.
	return JSON.stringify(entries.filter((entry) => entry.type !== "custom" || entry.customType !== "obw-writeback").map((entry) => entry.id));
}
function assertOwner(body: string, binding: Binding): void {
	if (parseFrontMatter(body).frontmatter.session !== binding.sessionId) throw new Error("Binding conflict: card session changed; writeback stopped");
}

// Obsidian API calls and UTF-8/base64 transport follow the verified CC source:
// cc-plugins@c9871a1/obsidian-workspace/hooks/writeback.sh:60-110.
function evalCode(payload: unknown, operation: string): string {
	const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
	return `(async () => {
 const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${encoded}'), c => c.charCodeAt(0))));
 ${operation}
 return 'OBW_WRITEBACK:' + JSON.stringify(result);
})()`;
}
function evalResult(output: string): Record<string, unknown> {
	const match = output.trim().match(/^(?:=>\s*)?OBW_WRITEBACK:(\{.*\})$/s);
	const result = match ? asRecord(JSON.parse(match[1])) : undefined;
	if (!result) throw new Error("Obsidian writeback returned invalid readback");
	return result;
}

function block(key: string, at: string, content: string): string {
	return `<!-- obw-writeback:${key} ${at} -->\n${content}\n<!-- /obw-writeback:${key} -->`;
}
function recordedAt(body: string, key: string, content: (at: string) => string): string | undefined {
	const prefix = `<!-- obw-writeback:${key} `;
	const start = body.indexOf(prefix);
	if (start < 0) {
		if (body.includes(`obw-writeback:${key}`)) throw new Error("Incomplete writeback marker; refusing to append again");
		return undefined;
	}
	const at = body.slice(start + prefix.length, body.indexOf(" -->", start));
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) || body.indexOf(prefix, start + prefix.length) >= 0 || !body.startsWith(block(key, at, content(at)), start)) {
		throw new Error("Writeback block readback mismatch; refusing to append again");
	}
	return at;
}
function appendAgent(card: string, addition: string): string {
	const { body } = parseFrontMatter(card);
	const offset = card.length - body.length;
	// mdast Root.children excludes headings in lists, quotes, code and HTML.
	// unist Point offsets/columns are UTF-16 code units, like String.slice.
	// https://github.com/syntax-tree/mdast#root
	// https://github.com/syntax-tree/unist#point
	const headings = fromMarkdown(body).children.flatMap((node) => {
		if (node.type !== "heading" || node.depth > 2) return [];
		const point = node.position?.start;
		if (point?.offset === undefined) throw new Error("Markdown section has no source offset");
		const text = node.children.length === 1 && node.children[0].type === "text" ? node.children[0].value : undefined;
		return [{ at: point.offset - (point.column - 1), level: node.depth, title: text }];
	});
	const agent = headings.find((heading) => heading.level === 2 && heading.title === "Agent");
	let at: number;
	let insert: string;
	if (agent) {
		const next = headings.find((heading) => heading.at > agent.at);
		at = offset + (next?.at ?? body.length);
		insert = addition;
	} else {
		const notes = headings.find((heading) => heading.level === 2 && heading.title === "Notes");
		at = notes ? offset + notes.at : card.length;
		insert = `## Agent\n\n${addition}`;
	}
	// Insert only: do not normalize frontmatter, trailing whitespace or existing blocks.
	const padding = card.slice(0, at).endsWith("\n") ? "\n" : "\n\n";
	const next = `${card.slice(0, at)}${padding}${insert}\n\n${card.slice(at)}`;
	const markerAt = at - offset + padding.length + (agent ? 0 : "## Agent\n\n".length);
	// Keep the previous fail-closed behavior for EOF inside an unclosed block,
	// but use the parser instead of guessing whether a fence/container is open.
	const visibleMarker = fromMarkdown(next.slice(offset)).children.some((node) => node.type === "html" && node.position?.start.offset === markerAt && node.value === addition.split("\n", 1)[0]);
	if (!visibleMarker) throw new Error("Cannot append an Agent record outside a document-level section");
	return next;
}

export function createWritebackController(exec: IssueExec) {
	let revision = 0;
	let queue: Promise<void> = Promise.resolve();

	async function request(input: { context: WritebackContext; kind: "sync" } | { context: WritebackStartContext; kind: "start"; userEntryId: string }): Promise<WritebackReceipt> {
		const { context, kind } = input;
		const version = revision;
		const sessionId = context.sessionId();
		const entries = context.branch();
		const binding = getBinding(entries, sessionId);
		if (!binding || !sessionId || hasControlCharacters(binding.vault)) throw new Error("Writeback requires a bound session");
		const userId = currentUser(entries);
		if (!userId || (input.kind === "start" && input.userEntryId !== userId)) throw new Error("Work start requires the current real user entry id");
		const snapshot = kind === "sync" ? selectSnapshot(entries) : undefined;
		const sourceEntryId = snapshot?.entryId ?? userId;
		if (!sourceEntryId) throw new Error("Writeback requires a real source entry id");
		const requiredIds = snapshot ? [userId, snapshot.entryId] : [userId];
		const branch = ancestry(entries);
		const bindingIdentity = JSON.stringify(binding);
		const check = () => {
			const now = context.branch();
			if (version !== revision || context.sessionId() !== sessionId || ancestry(now) !== branch || currentUser(now) !== userId || JSON.stringify(getBinding(now, sessionId)) !== bindingIdentity) {
				throw new Error("Writeback request invalidated by session, branch, binding or current input change");
			}
			if (snapshot) {
				const latest = selectSnapshot(now);
				if (latest.entryId !== snapshot.entryId || latest.text !== snapshot.text) throw new Error("Writeback snapshot invalidated");
			}
		};
		const ready = () => {
			check();
			if (kind === "sync" && (!context.isIdle() || context.hasPendingMessages())) throw new Error("Sync requires idle with no pending messages");
		};

		// A run can await recordStart before it settles. Idle waiting must not
		// occupy the mutation queue that its context observer needs to complete.
		if (input.kind === "sync") {
			check();
			if (context.hasPendingMessages()) throw new Error("Sync refused while messages are pending");
			if (!context.isIdle()) await input.context.waitForIdle();
			ready();
		}

		const work = queue.then(async () => {
			check();
			const persisted = await context.isPersisted(requiredIds);
			check();
			if (!persisted) throw new Error("Writeback requires persisted source messages");
			ready();
			const io = async (args: string[]): Promise<string> => {
				ready();
				try { return await cliOutput(exec, [`vault=${binding.vault}`, ...args]); }
				finally { ready(); }
			};
			const readCard = async () => {
				const body = await io(["read", `path=${binding.cardPath}`]);
				assertOwner(body, binding);
				return body;
			};
			const readRun = async (path: string): Promise<string | null> => {
				const result = evalResult(await io(["eval", `code=${evalCode({ path }, `
 const f = app.vault.getAbstractFileByPath(p.path);
 if (f && f.extension !== 'md') throw new Error('Runs path is not a note');
 const result = {body: f ? await app.vault.read(f) : null};`)}`]));
				if (result.body !== null && typeof result.body !== "string") throw new Error("Runs note readback is invalid");
				return result.body;
			};
			const write = async (path: string, previous: string | null, next: string) => {
				evalResult(await io(["eval", `code=${evalCode({ path, previous, next }, `
 const f = app.vault.getAbstractFileByPath(p.path);
 if (p.previous === null) {
   if (f) throw new Error('Writeback conflict: note appeared');
   await app.vault.create(p.path, p.next);
 } else {
   if (!f || f.extension !== 'md') throw new Error('Writeback note not found');
   await app.vault.process(f, body => {
     if (body !== p.previous) throw new Error('Writeback conflict: note changed');
     return p.next;
   });
 }
 const result = {written: true};`)}`]));
			};

			const key = createHash("sha256").update(JSON.stringify([binding.host, sessionId, binding.vault, binding.project, binding.cardPath, kind, sourceEntryId])).digest("hex");
			const text = snapshot?.text ?? "工作中";
			const summary = text.split(/\r\n|\r|\n/).find((line) => line.trim()) ?? "工作中";
			const multiline = kind === "sync" && /[\r\n]/.test(text);
			const name = binding.cardPath.slice(binding.cardPath.lastIndexOf("/") + 1, -3);
			const runPath = multiline ? `pm/${binding.project}/runs/${name}.md` : undefined;
			const runContent = () => `## obw-${key}\n\n${text}`;
			const cardContent = (at: string) => `- ${at} ${summary}${runPath ? `（[[${runPath.slice(0, -3)}#obw-${key}|全文]]）` : ""}`;
			let card = await readCard();
			const run = runPath ? await readRun(runPath) : null;
			const cardAt = recordedAt(card, key, cardContent);
			const runAt = run === null ? undefined : recordedAt(run, key, runContent);
			if (cardAt && runAt && cardAt !== runAt) throw new Error("Writeback card and runs timestamps disagree");
			const at = cardAt ?? runAt ?? new Date().toISOString();
			const alreadyRecorded = !!cardAt && (!runPath || !!runAt);

			if (runPath && !runAt) {
				if (run === null) {
					// Folder creation and each file mutation are separate CLI requests so
					// invalidation after one write cannot reach the next file.
					await readCard();
					const directory = runPath.slice(0, runPath.lastIndexOf("/"));
					evalResult(await io(["eval", `code=${evalCode({ directory }, `
 if (!app.vault.getAbstractFileByPath(p.directory)) await app.vault.createFolder(p.directory);
 const result = {folder: true};`)}`]));
				}
				await readCard();
				const addition = block(key, at, runContent());
				await write(runPath, run, run === null ? addition : `${run}\n\n${addition}`);
				const back = await readRun(runPath);
				if (back === null || recordedAt(back, key, runContent) !== at) throw new Error("Full text readback failed; no success receipt recorded");
			}

			card = await readCard();
			const existing = recordedAt(card, key, cardContent);
			if (existing && existing !== at) throw new Error("Writeback card timestamp changed");
			if (!existing) await write(binding.cardPath, card, appendAgent(card, block(key, at, cardContent(at))));
			if (recordedAt(await readCard(), key, cardContent) !== at) throw new Error("Summary readback failed; no success receipt recorded");
			if (runPath) {
				const back = await readRun(runPath);
				if (back === null || recordedAt(back, key, runContent) !== at) throw new Error("Full text readback failed; no success receipt recorded");
				// Recheck the owner after reading the necessary full text as well.
				if (recordedAt(await readCard(), key, cardContent) !== at) throw new Error("Summary readback changed; no success receipt recorded");
			}
			ready();
			const receipt: WritebackReceipt = { ...binding, kind, sourceEntryId, ...(runPath ? { runPath } : {}), verified: true, alreadyRecorded };
			const hasReceipt = context.branch().some((entry) => {
				if (entry.type !== "custom" || entry.customType !== "obw-writeback") return false;
				const data = asRecord(entry.data);
				return data?.verified === true && data.kind === kind && data.sourceEntryId === sourceEntryId && data.host === binding.host && data.sessionId === sessionId && data.vault === binding.vault && data.project === binding.project && data.cardPath === binding.cardPath && data.runPath === runPath;
			});
			if (!hasReceipt) context.appendReceipt(receipt);
			return receipt;
		});
		queue = work.then(() => {}, () => {});
		return work;
	}

	return {
		invalidate() { revision++; },
		sync(context: WritebackContext) { return request({ context, kind: "sync" }); },
		recordStart(context: WritebackStartContext, userEntryId: string) { return request({ context, kind: "start", userEntryId }); },
	};
}

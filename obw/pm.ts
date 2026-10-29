// The pm card tools and their card edits follow cc-plugins@b4555826
// obsidian-workspace/hooks/pm-tools.ts and the pmCall flow in hooks/register.ts.
import { cliOutput, isTaskPath, readWorkspaceConfig, type IssueExec } from "./workspace";
import { evalCode, evalResult } from "./writeback";

export type Edit = { text: string } | { refused: string };
export type PmResult = { ok: true; path: string } | { ok: false; reason: string };
export type PmToolName = "pm_tick" | "pm_note" | "pm_status";

export const STATUSES = ["todo", "in-progress", "blocked", "done"];
const AC_HEADING = /^## acceptance criteria\s*$/i;
const CHECKBOX = /^\s*[-*+] \[( |x|X)\](\s|$)/;
// C0, DEL and C1 controls, as cc refuses them.
const hasControl = (value: string) => [...value].some((char) => { const code = char.codePointAt(0) ?? 0; return code < 0x20 || (code >= 0x7f && code <= 0x9f); });
const NO_BOX = "index must name one acceptance-criteria checkbox of the card.";
const LINE_REFUSAL = "line must be one line of text.";
const STATUS_REFUSAL = `status must be one of ${STATUSES.join(", ")}.`;
const NO_STATUS = "The card has no top-level status: line in its frontmatter.";
const CARD_REFUSAL = "The card name must be a file name without /, \\, control characters or dots alone.";
const ARGUMENT_REFUSAL = "The arguments do not match the tool: a checkbox index is a whole number, checked is true or false, and status is one of the four values.";

// The body is what follows the frontmatter's closing `---`; a note without one is all body.
function bodyStart(lines: string[]): number {
	if (lines[0] !== "---") return 0;
	const close = lines.indexOf("---", 1);
	return close < 0 ? 0 : close + 1;
}

export function tickAc(text: string, index: number, checked: boolean): Edit {
	if (!Number.isInteger(index) || index < 1) return { refused: NO_BOX };
	const lines = text.split("\n");
	const start = bodyStart(lines);
	const heading = lines.findIndex((line, at) => at >= start && AC_HEADING.test(line));
	if (heading < 0) return { refused: NO_BOX };
	let seen = 0;
	for (let at = heading + 1; at < lines.length; at++) {
		const line = lines[at];
		if (line.startsWith("# ") || line.startsWith("## ")) break;
		if (!CHECKBOX.test(line)) continue;
		seen += 1;
		if (seen !== index) continue;
		const mark = line.indexOf("[") + 1;
		lines[at] = `${line.slice(0, mark)}${checked ? "x" : " "}${line.slice(mark + 1)}`;
		return { text: lines.join("\n") };
	}
	return { refused: NO_BOX };
}

function lineProblem(line: string): string | null {
	return line.trim() === "" || hasControl(line) ? LINE_REFUSAL : null;
}

// The Notes section runs to the next `#` or `##` heading, as the acceptance-criteria section does.
export function appendNote(text: string, line: string): Edit {
	if (lineProblem(line)) return { refused: LINE_REFUSAL };
	const lines = text.split("\n");
	const heading = lines.findIndex((value) => /^## Notes\s*$/.test(value));
	if (heading < 0) return { text: `${text}${text.endsWith("\n") ? "\n" : "\n\n"}## Notes\n- ${line}\n` };
	let end = heading + 1;
	while (end < lines.length && !lines[end].startsWith("# ") && !lines[end].startsWith("## ")) end++;
	let last = heading;
	for (let at = heading + 1; at < end; at++) if (lines[at].trim() !== "") last = at;
	lines.splice(last + 1, 0, `- ${line}`);
	return { text: lines.join("\n") };
}

export function setStatus(text: string, status: string): Edit {
	if (!STATUSES.includes(status)) return { refused: STATUS_REFUSAL };
	const lines = text.split("\n");
	const close = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
	if (close < 0) return { refused: NO_STATUS };
	const at = lines.slice(0, close).findIndex((line) => /^status:/.test(line));
	if (at < 0) return { refused: NO_STATUS };
	lines[at] = `status: ${status}`;
	return { text: lines.join("\n") };
}

function isBadCardName(value: string): boolean {
	return !value.trim() || value === "." || value === ".." || value.includes("/") || value.includes("\\") || hasControl(value);
}

// What a pm tool call changes, checked before any CLI run; `apply` makes the edit once the card has been read.
export function pmEdit(tool: PmToolName, params: unknown): { card: string; apply: (text: string) => Edit } | { refused: string } {
	const args = params !== null && typeof params === "object" ? params as Record<string, unknown> : {};
	const { card } = args;
	if (typeof card !== "string" || isBadCardName(card)) return { refused: CARD_REFUSAL };
	if (tool === "pm_tick") {
		const { index, checked } = args;
		if (typeof index !== "number" || !Number.isInteger(index) || typeof checked !== "boolean") return { refused: ARGUMENT_REFUSAL };
		return { card, apply: (text) => tickAc(text, index, checked) };
	}
	if (tool === "pm_note") {
		const { line } = args;
		if (typeof line !== "string" || lineProblem(line)) return { refused: LINE_REFUSAL };
		return { card, apply: (text) => appendNote(text, line) };
	}
	const { status } = args;
	if (typeof status !== "string" || !STATUSES.includes(status)) return { refused: ARGUMENT_REFUSAL };
	return { card, apply: (text) => setStatus(text, status) };
}

const CARD_FIELD = { type: "string", description: "The card file name under pm/<project>/tasks/, without .md." };

export const PM_TOOLS: { name: PmToolName; label: string; description: string; parameters: Record<string, unknown> }[] = [
	{
		name: "pm_tick",
		label: "PM tick",
		description: "Tick or untick one acceptance-criteria checkbox of a pm task card. index counts the checkboxes under its ## Acceptance Criteria heading from 1.",
		parameters: {
			type: "object",
			properties: { card: CARD_FIELD, index: { type: "integer", description: "The 1-based checkbox number under ## Acceptance Criteria." }, checked: { type: "boolean" } },
			required: ["card", "index", "checked"],
		},
	},
	{
		name: "pm_note",
		label: "PM note",
		description: "Append one line as a bullet at the end of a pm task card Notes section, creating the section when it is missing.",
		parameters: { type: "object", properties: { card: CARD_FIELD, line: { type: "string", description: "One line of text, without line breaks." } }, required: ["card", "line"] },
	},
	{
		name: "pm_status",
		label: "PM status",
		description: "Set the status of a pm task card in its frontmatter.",
		parameters: { type: "object", properties: { card: CARD_FIELD, status: { type: "string", enum: STATUSES } }, required: ["card", "status"] },
	},
];

// A tool result is text content, never a bare object: the body is one JSON line (cc 0f2b6b57).
export function pmToolResult(result: PmResult): { content: { type: "text"; text: string }[]; isError: boolean } {
	return { content: [{ type: "text", text: JSON.stringify(result) }], isError: !result.ok };
}

function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function createPmTools(exec: IssueExec) {
	// Calls that arrive together run one after another, so a call's read never misses an edit another has written.
	let queue: Promise<unknown> = Promise.resolve();

	async function call(tool: PmToolName, params: unknown, cwd: string): Promise<PmResult> {
		const edit = pmEdit(tool, params);
		if ("refused" in edit) return { ok: false, reason: edit.refused };
		let config: { vault: string; project: string };
		try { config = await readWorkspaceConfig(cwd); }
		catch (error) { return { ok: false, reason: reasonOf(error) }; }
		const path = `pm/${config.project}/tasks/${edit.card}.md`;
		if (!isTaskPath(path, config.project)) return { ok: false, reason: "The card path is not a card under pm/<project>/tasks/." };
		const evaluate = async (payload: unknown, operation: string) => {
			let output: string;
			// cliOutput's error quotes the CLI's stdout and stderr, which can hold the card text
			// or its base64 payload; a reason never carries card text (cc register.ts:735-742).
			try { output = await cliOutput(exec, [`vault=${config.vault}`, "eval", `code=${evalCode(payload, operation)}`]); }
			catch { throw new Error("the Obsidian CLI eval call failed; its output is not quoted"); }
			return evalResult(output);
		};
		// The card is read and written through app.vault so the text compared is the file's exact bytes.
		const read = async (): Promise<string | null> => {
			const result = await evaluate({ path }, `
 const f = app.vault.getAbstractFileByPath(p.path);
 if (f && f.extension !== 'md') throw new Error('Card path is not a note');
 const result = {body: f ? await app.vault.read(f) : null};`);
			if (result.body !== null && typeof result.body !== "string") throw new Error("Card readback is invalid");
			return result.body;
		};
		let current: string | null;
		try { current = await read(); }
		catch (error) { return { ok: false, reason: `${path} could not be read: ${reasonOf(error)}` }; }
		if (current === null) return { ok: false, reason: `${path} was not found.` };
		const next = edit.apply(current);
		if ("refused" in next) return { ok: false, reason: next.refused };
		try {
			await evaluate({ path, previous: current, next: next.text }, `
 const f = app.vault.getAbstractFileByPath(p.path);
 if (!f || f.extension !== 'md') throw new Error('Card not found');
 await app.vault.process(f, body => {
   if (body !== p.previous) throw new Error('Card changed since it was read');
   return p.next;
 });
 const result = {written: true};`);
		} catch (error) { return { ok: false, reason: `${path} was not written: ${reasonOf(error)}` }; }
		let back: string | null;
		try { back = await read(); }
		catch (error) { return { ok: false, reason: `${path} was written, but its read back failed: ${reasonOf(error)}` }; }
		if (back !== next.text) return { ok: false, reason: `${path} was written, but the read back differs from the text written.` };
		return { ok: true, path };
	}

	return {
		run(tool: PmToolName, params: unknown, cwd: string): Promise<PmResult> {
			const work = queue.then(() => call(tool, params, cwd)).catch((error: unknown): PmResult => ({ ok: false, reason: `The pm tool could not run: ${reasonOf(error)}` }));
			queue = work;
			return work;
		},
	};
}

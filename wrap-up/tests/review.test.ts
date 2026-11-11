import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { review } from "../review";

const homes: string[] = [];
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
const params = { operations: [{ operation: "Commit", evidence: "本次任務有未提交修改", tool: "git commit" }, { operation: "Push", evidence: "存在未推送提交", tool: "git push" }], suggested: 5, reason: "無糾正；目標已達成" };

test("only selected operations are returned after the real rating CLI persists the user's score", async () => {
	const home = mkdtempSync(join(tmpdir(), "wrap-up-review-"));
	homes.push(home);
	let step = 0;
	const result = await review(params, {
		host: "pi", interactive: true, sessionId: () => "native-session", cwd: "/project", current: () => true,
		select: async (_title, options) => options[step++ === 0 ? 1 : step === 2 ? 0 : 1],
		input: async () => "使用者補充理由",
		exec: async (command, args) => {
			const child = Bun.spawn([command, ...args], { env: { ...process.env, HOME: home }, stdout: "pipe", stderr: "pipe" });
			return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() };
		},
	});
	const value = JSON.parse(result.content[0].text);
	expect(value.selected).toEqual([params.operations[0]]);
	expect(value.score).toBe(4);
	const record = JSON.parse(readFileSync(join(home, ".local/share/omp-plugins/wrap-up/ratings.jsonl"), "utf8").trim());
	expect(record).toMatchObject({ host: "pi", session_id: "native-session", project_path: "/project", score: 4, suggested: 5 });
	expect(record.reason).toStartWith("使用者補充理由");
	expect(value.ratingReceipt).toContain("rated pi native-session 4/5");
});

for (const boundary of ["noninteractive", "cancel-selection", "cancel-score", "cancel-reason", "session-change", "write-error"] as const) {
	test(`${boundary} never returns operation authorization`, async () => {
		let current = true;
		let steps = 0;
		let writes = 0;
		const result = await review(params, {
			host: "omp", interactive: boundary !== "noninteractive", sessionId: () => "native-session", cwd: "/project", current: () => current,
			select: async (_title, options) => {
				steps++;
				if (boundary === "session-change") current = false;
				if (boundary === "cancel-selection" || (boundary === "cancel-score" && steps === 3)) return undefined;
				return options[steps === 1 ? 1 : 0];
			},
			input: async () => boundary === "cancel-reason" ? undefined : "",
			exec: async () => { writes++; return { code: 1, stdout: "", stderr: "Permission denied" }; },
		});
		const value = JSON.parse(result.content[0].text);
		expect(value.selected ?? []).toEqual([]);
		expect(writes).toBe(boundary === "write-error" ? 1 : 0);
	});
}

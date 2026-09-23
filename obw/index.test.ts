import { expect, test } from "bun:test";
import extension, { applyIssueCards, createIssueComponent, initialIssueState, isSafeCardPath, nextIssueRequest, renderMermaidFallback } from "./index";

test("issue command reads dashboard then default All Tasks query", async () => {
  const calls: string[][] = [];
  let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
  const pi = { exec: async (_command: string, args: string[]) => { calls.push(args); if (args[0] === "vault=V") return args[1] === "read" ? "    name: All Tasks\n" : JSON.stringify([]); return "vault: V\npm:\n  project: P\n"; }, registerCommand: (_name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => { handler = options.handler; } };
  extension(pi as never);
  await handler!("", { hasUI: false, ui: { notify() {} } });
  expect(calls[1]).toEqual(["vault=V", "read", "path=pm/P/dashboard.base"]);
  expect(calls[2]).toEqual(["vault=V", "base:query", "path=pm/P/dashboard.base", "view=All Tasks", "format=json"]);
});

test("navigation groups All Tasks and toggles done heading", () => {
  let state = { ...initialIssueState(), mode: "cards" as const, view: "All Tasks", cards: [{ title: "A", status: "todo", priority: "high" }, { title: "B", status: "done" }] };
  const component = createIssueComponent(state, (next) => { state = next; });
  expect(component.render().join("\n")).toContain("▸ done (1)");
  component.handleInput("enter");
  expect(state.doneExpanded).toBe(true);
});

test("stale responses and unsafe card paths are rejected", () => {
  const state = nextIssueRequest({ ...initialIssueState(), mode: "cards", view: "All Tasks" });
  const current = applyIssueCards(state, [{ title: "new" }], state.request);
  expect(applyIssueCards(current, [{ title: "old" }], state.request - 1).cards[0].title).toBe("new");
  expect(isSafeCardPath("pm/P/tasks/a.md", "P")).toBe(true);
  expect(isSafeCardPath("pm/P/../secret.md", "P")).toBe(false);
});

test("Mermaid rendering uses termaid when available and preserves code on failure", async () => {
  const source = "before\n```mermaid\ngraph TD; A-->B\n```\nafter";
  expect(await renderMermaidFallback(source, async () => "<svg>ok</svg>")).toContain("<svg>ok</svg>");
  expect(await renderMermaidFallback(source, async () => { throw new Error("uvx missing"); })).toBe(source);
});

import { expect, test } from "bun:test";
import { applyIssueCards, createIssueComponent, initialIssueState, isSafeCardPath, nextIssueRequest, renderMermaidFallback, type IssueState } from "./index";

test("navigation groups All Tasks and toggles done heading", () => {
  let state: IssueState = { ...initialIssueState(), mode: "cards", view: "All Tasks", cards: [{ title: "A", status: "todo", priority: "high" }, { title: "B", status: "done" }] };
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


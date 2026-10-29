import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension, { applyIssueCards, createIssueComponent, initialIssueState, isSafeCardPath, nextIssueRequest, renderMermaidFallback, type IssueState } from "./index";

test("issue command reads dashboard then default All Tasks query", async () => {
  const root = await mkdtemp(join(tmpdir(), "obw-omp-test-"));
  try {
    await writeFile(join(root, ".obsidian.yaml"), "vault: V\npm:\n  project: P\n");
    const calls: string[][] = [];
    let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    let queried: (() => void) | undefined;
    const query = new Promise<void>((resolve) => { queried = resolve; });
    const omp = {
      exec: async (_command: string, args: string[]) => {
        calls.push(args);
        if (args[1] === "base:query") queried?.();
        return { code: 0, killed: false, stderr: "", stdout: args[1] === "read" ? "views:\n - name: All Tasks\n" : "[]" };
      },
      registerCommand: (_name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => { handler = options.handler; },
      registerTool: () => {},
      on: () => {},
    };
    extension(omp as never);
    await handler?.("", { cwd: root, mode: "tui", ui: { notify() {}, custom: async (factory: (tui: { requestRender(): void }, theme: undefined, keys: { matches(): boolean }, done: () => void) => { dispose(): void }) => {
      const component = factory({ requestRender() {} }, undefined, { matches: () => false }, () => {});
      await query; component.dispose();
    } } });
    expect(calls[0]).toEqual(["vault=V", "read", "path=pm/P/dashboard.base"]);
    expect(calls[1]).toEqual(["vault=V", "base:query", "path=pm/P/dashboard.base", "view=All Tasks", "format=json"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

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

test("pm tools register once each as essential write tools and answer in one JSON line", async () => {
  const root = await mkdtemp(join(tmpdir(), "obw-omp-pm-test-"));
  try {
    await writeFile(join(root, ".obsidian.yaml"), "vault: V\npm:\n  project: P\n");
    type Tool = { name: string; approval: string; loadMode: string; execute(id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: { cwd: string }): Promise<unknown> };
    const tools: Tool[] = [];
    const calls: string[][] = [];
    const omp = {
      exec: async (_command: string, args: string[]) => { calls.push(args); return { code: 0, killed: false, stderr: "", stdout: '=> OBW_WRITEBACK:{"body":null}' }; },
      registerCommand: () => {},
      registerTool: (tool: Tool) => { tools.push(tool); },
      on: () => {},
    };
    extension(omp as never);
    expect(tools.map((tool) => [tool.name, tool.approval, tool.loadMode])).toEqual([["pm_tick", "write", "essential"], ["pm_note", "write", "essential"], ["pm_status", "write", "essential"]]);
    const result = await tools[2].execute("call-1", { card: "a", status: "done" }, undefined, undefined, { cwd: root });
    expect(result).toEqual({ content: [{ type: "text", text: '{"ok":false,"reason":"pm/P/tasks/a.md was not found."}' }], isError: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 2)).toEqual(["vault=V", "eval"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";

export type IssueView = { name: string; description?: string };
export type IssueCard = { path?: string; title: string; body?: string; status?: string; [key: string]: unknown };
export type IssueMode = "views" | "cards" | "card";

export type IssueState = { mode: IssueMode; view?: string; views: IssueView[]; cards: IssueCard[]; selected: number; body?: string; request: number; status?: string; doneExpanded?: boolean };
export function sanitizeText(value: unknown, width = 120): string {
  const text = String(value ?? "").replace(/\t/g, "    ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return text.split("\n").map((line) => line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line).join("\n");
}

export function initialIssueState(): IssueState {
  return { mode: "views", views: [], cards: [], selected: 0, request: 0 };
}

/** A response may only update the request that initiated it. */
export function applyIssueCards(state: IssueState, cards: IssueCard[], request: number): IssueState {
  if (request !== state.request) return state;
  return { ...state, mode: "cards", cards, selected: 0, status: cards.length ? undefined : "No tasks found" };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function parseIssueViews(value: unknown): IssueView[] {
  const root = Array.isArray(value) ? value : asRecord(value)?.views;
  if (!Array.isArray(root)) return [];
  return root.map((item) => {
    const row = asRecord(item) ?? {};
    return { name: String(row.name ?? row.id ?? row.view ?? "Unnamed view"), description: row.description == null ? undefined : String(row.description) };
  });
}

export function parseIssueCards(value: unknown): IssueCard[] {
  const root = Array.isArray(value) ? value : asRecord(value)?.files ?? asRecord(value)?.results ?? asRecord(value)?.cards;
  if (!Array.isArray(root)) return [];
  return root.map((item) => {
    const row = asRecord(item) ?? {};
    const title = String(row.title ?? row.name ?? row.file ?? row.path ?? "Untitled");
    return { ...row, title, path: row.path == null ? undefined : String(row.path), body: row.body == null ? undefined : String(row.body), status: row.status == null ? undefined : String(row.status) };
  });
}
export function isSafeCardPath(path: unknown, project: string): path is string {
  return typeof path === "string" && path.endsWith(".md") && path.startsWith(`pm/${project}/`) && !path.includes("..") && !/[\u0000-\u001f\u007f]/.test(path);
}

export type IssueComponent = { render(width?: number): string[]; handleInput(input: string): void; setState(next: IssueState): void };

export type IssueVisibleRow = { kind: "heading" | "card"; status?: string; cardIndex?: number; label: string };
export function visibleIssueRows(state: IssueState): IssueVisibleRow[] {
  if (state.mode !== "cards" || state.view !== "All Tasks") return state.cards.map((card, cardIndex) => ({ kind: "card", cardIndex, label: card.title }));
  const rows: IssueVisibleRow[] = [];
  for (const status of [...new Set(state.cards.map((card) => String(card.status ?? "todo")))]) {
    const cards = state.cards.flatMap((card, cardIndex) => String(card.status ?? "todo") === status ? [{ card, cardIndex }] : []);
    rows.push({ kind: "heading", status, label: `${status} (${cards.length})` });
    if (status !== "done" || state.doneExpanded) for (const item of cards) rows.push({ kind: "card", status, cardIndex: item.cardIndex, label: item.card.title });
  }
  return rows;
}
export function parseCardBody(raw: string): { header: string[]; body: string; acceptance?: string } {
  const source = String(raw ?? "");
  let body = source;
  const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const fields: string[] = [];
  if (frontmatter) {
    for (const line of frontmatter[1].split("\n")) {
      if (/^(title|status|priority):\s*/i.test(line)) fields.push(line.trim());
    }
    body = source.slice(frontmatter[0].length);
  }
  const checks = [...body.matchAll(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/gm)];
  const acceptance = checks.length ? `Acceptance Criteria: ${checks.filter((item) => item[1].toLowerCase() === "x").length}/${checks.length}` : undefined;
  return { header: fields, body, acceptance };
}
export function nextIssueRequest(state: IssueState): IssueState {
  return { ...state, request: state.request + 1, status: "Loading…" };
}
export async function renderMermaidFallback(text: string, exec: IssueExec, timeout = 5000): Promise<string> {
  const source = String(text);
  const fence = /```mermaid[ \t]*\n([\s\S]*?)```/gi;
  if (!fence.test(source)) return source;
  fence.lastIndex = 0;
  let rendered = source;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(source))) {
    const diagram = match[1].trim();
    if (!/^(graph|flowchart|sequenceDiagram|stateDiagram|classDiagram|erDiagram|gantt|pie)\b/i.test(diagram)) continue;
    try {
      const result = await Promise.race([
        exec("sh", ["-c", "f=$(mktemp -t omp-termaid.XXXXXX); trap 'rm -f \"$f\"' EXIT; printf '%s' \"$1\" >\"$f\"; uvx termaid@0.9.0 --width 80 <\"$f\"", "sh", diagram], { timeout }),
      ]);
      const output = typeof result === "string" ? result : result && typeof result === "object" && "stdout" in result && typeof result.stdout === "string" ? result.stdout : "";
      if (output.trim()) rendered = rendered.replace(match[0], output.trim());
    } catch { /* preserve failed block */ }
  }
  return rendered;
}

/** OMP-native custom component. It deliberately has no Claude/Obsidian UI runtime dependency. */
export function createIssueComponent(state: IssueState, onChange: (next: IssueState) => void): IssueComponent {
  const update = (next: IssueState) => { state = next; onChange(next); };
  return {
    setState(next) { state = next; },
    render(width = 120) {
      const lines: string[] = [];
      if (state.status) lines.push(sanitizeText(state.status, width));
      if (state.mode === "views") {
        lines.push("Views");
        state.views.forEach((view, i) => lines.push(`${i === state.selected ? "▶" : " "} ${sanitizeText(view.name, width - 2)}`));
      } else if (state.mode === "cards") {
        lines.push(`${state.view ?? "All Tasks"}`);
        const rows = visibleIssueRows(state);
        rows.forEach((row, index) => {
          if (row.kind === "heading") lines.push(`${index === state.selected ? "▶" : " "} ${row.status === "done" && !state.doneExpanded ? "▸" : "▾"} ${row.label}`);
          else {
            const card = state.cards[row.cardIndex!];
            const meta = [card.priority, card.due, card.tags].filter(Boolean).map((item) => Array.isArray(item) ? item.join(",") : String(item)).join(" · ");
            lines.push(`${index === state.selected ? "▶" : " "} ${sanitizeText(`${card.title}${meta ? ` — ${meta}` : ""}`, width - 2)}`);
          }
        });
      } else {
        const parsed = parseCardBody(state.body ?? state.cards[state.selected]?.body ?? "No body");
        lines.push(...parsed.header.map((line) => sanitizeText(line, width)));
        if (parsed.acceptance) lines.push(parsed.acceptance);
        lines.push(...sanitizeText(parsed.body, width).split("\n"));
      }
      return lines;
    },
    handleInput(input) {
      const key = ({ "\u001b": "escape", "\u001b[A": "up", "\u001b[B": "down", "\u001b[C": "right", "\u001b[D": "left", "\r": "enter", "\n": "enter" } as Record<string, string>)[input] ?? input.toLowerCase();
      if (key === "escape" || key === "esc") return update({ ...state, mode: "views", body: undefined, status: undefined });
      if (key === "left" || key === "backspace") {
        if (state.mode === "card") return update({ ...state, mode: "cards", body: undefined });
        if (state.mode === "cards") return update({ ...state, mode: "views", view: undefined, cards: [], selected: 0 });
      }
      const rows = state.mode === "cards" ? visibleIssueRows(state) : undefined;
      const max = state.mode === "views" ? state.views.length - 1 : (rows?.length ?? state.cards.length) - 1;
      if (key === "up" || key === "k" || key === "pageup") return update({ ...state, selected: Math.max(0, state.selected - (key === "pageup" ? 5 : 1)) });
      if (key === "down" || key === "j" || key === "pagedown") return update({ ...state, selected: Math.min(max, state.selected + (key === "pagedown" ? 5 : 1)) });
      if (key === "enter" || key === "right") {
        if (state.mode === "views" && state.views[state.selected]) return update({ ...state, mode: "cards", view: state.views[state.selected].name, cards: [], selected: 0, status: "Loading…" });
        if (state.mode === "cards" && rows?.[state.selected]?.kind === "heading") {
          return update({ ...state, doneExpanded: !state.doneExpanded });
        }
        const cardIndex = rows?.[state.selected]?.cardIndex ?? state.selected;
        if (state.mode === "cards" && state.cards[cardIndex]) return update({ ...state, mode: "card", selected: cardIndex, body: state.cards[cardIndex].body, status: undefined });
      }
    },
  };
}

type IssueContext = ExtensionCommandContext & { ui: ExtensionCommandContext["ui"] & { custom?: (factory: unknown, options?: unknown) => Promise<unknown> | unknown } };
type IssueExec = (command: string, args: string[], options?: { timeout?: number }) => Promise<unknown>;


async function cliOutput(exec: IssueExec, args: string[]): Promise<string> {
  const result = await exec("obsidian", args, { timeout: 15_000 });
  if (result && typeof result === "object" && "code" in result && typeof result.code === "number" && result.code !== 0) {
    const stderr = "stderr" in result && typeof result.stderr === "string" ? result.stderr : "Obsidian CLI failed";
    throw new Error(sanitizeText(stderr, 300));
  }
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "stdout" in result && typeof result.stdout === "string") return result.stdout;
  throw new Error("Obsidian CLI returned no output");
}
async function cliJson(exec: IssueExec, args: string[]): Promise<unknown> {
  const text = await cliOutput(exec, args);
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value) && !(value && typeof value === "object")) throw new Error("invalid JSON shape");
    return value;
  } catch (error) {
    throw new Error(`Obsidian CLI returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

}
export function parseDashboardViews(value: unknown): IssueView[] {
  if (typeof value !== "string") return parseIssueViews(value);
  const views: IssueView[] = [];
  for (const match of value.matchAll(/^\s*name:\s*[\"']?([^\"'\n]+?)[\"']?\s*$/gm)) views.push({ name: match[1].trim() });
  return views;
}

async function readConfig(exec: IssueExec): Promise<{ vault: string; project: string } | undefined> {
  const result = await exec("sh", ["-c", "cat .obsidian.yaml 2>/dev/null"], { timeout: 5_000 });
  const text = typeof result === "string" ? result : result && typeof result === "object" && "stdout" in result && typeof result.stdout === "string" ? result.stdout : "";
  const vault = text.match(/^vault:\s*[\"']?([^\"'\n]+)[\"']?\s*$/m)?.[1]?.trim();
  const project = text.match(/^\s+project:\s*[\"']?([^\"'\n]+)[\"']?\s*$/m)?.[1]?.trim();
  return vault && project ? { vault, project } : undefined;
}
const extension = (pi: ExtensionAPI) => {
  const exec = (pi as ExtensionAPI & { exec: IssueExec }).exec.bind(pi);
  pi.registerCommand("issue", { description: "Browse Obsidian Workspace task views and cards", handler: async (rawArgs, rawCtx) => {
    const ctx = rawCtx as IssueContext;
    const config = await readConfig(exec).catch(() => undefined);
    if (!config) { ctx.ui.notify("Missing .obsidian.yaml vault/project; run /obw-init first", "warning"); return; }
    const requested = rawArgs.trim() || "All Tasks";
    const state = initialIssueState();
    try {
      const dashboardPath = `pm/${config.project}/dashboard.base`;
      const dashboard = await cliOutput(exec, [`vault=${config.vault}`, "read", `path=${dashboardPath}`]);
      const views = parseDashboardViews(dashboard);
      state.views = views.length ? views : [{ name: "All Tasks" }];
      state.mode = "cards";
      state.view = requested;
      state.cards = parseIssueCards(await cliJson(exec, [`vault=${config.vault}`, "base:query", `path=${dashboardPath}`, `view=${requested}`, "format=json"]));
      if (!state.cards.length) state.status = "No tasks found";
    } catch (error) { state.status = `Unable to read tasks: ${error instanceof Error ? error.message : String(error)}`; }
    if (ctx.hasUI && ctx.ui.custom) {
      let current = state;
      let component: IssueComponent | undefined;
      let tuiRuntime: { requestRender?: () => void } | undefined;
      const onChange = (next: IssueState) => {
        current = next;
        if (next.mode === "card") {
          const card = next.cards[next.selected];
          if (!card?.body && isSafeCardPath(card?.path, config.project)) {
            const request = nextIssueRequest(next);
            current = request;
            void cliOutput(exec, [`vault=${config.vault}`, "read", `path=${card.path}`])
              .then((body) => {
                if (current.request !== request.request) return;
                current = { ...current, body, status: undefined };
                component?.setState(current);
                tuiRuntime?.requestRender?.();
                void renderMermaidFallback(body, exec).then((rendered) => {
                  if (current.request === request.request && rendered !== body) { current = { ...current, body: rendered }; component?.setState(current); tuiRuntime?.requestRender?.(); }
                });
              })
              .catch((error: unknown) => { if (current.request === request.request) { current = { ...current, status: `Unable to read card: ${error instanceof Error ? error.message : String(error)}` }; component?.setState(current); tuiRuntime?.requestRender?.(); } });
          }
          return;
        }
        if (next.mode !== "cards" || !next.view || next.cards.length || next.status !== "Loading…") return;
        const request = next.request + 1;
        const dashboardPath = `pm/${config.project}/dashboard.base`;
        current = nextIssueRequest(next);
        component?.setState(current);
        void cliJson(exec, [`vault=${config.vault}`, "base:query", `path=${dashboardPath}`, `view=${next.view}`, "format=json"])
          .then((value) => { current = applyIssueCards(current, parseIssueCards(value), request); component?.setState(current); tuiRuntime?.requestRender?.(); })
          .catch((error: unknown) => { if (request === current.request) { current = { ...current, status: `Unable to read tasks: ${error instanceof Error ? error.message : String(error)}` }; component?.setState(current); tuiRuntime?.requestRender?.(); } });
      };
      await ctx.ui.custom((tui: { requestRender?: () => void }, _theme: unknown, keybindings: { matches?: (input: string, action: string) => boolean }, done: (value?: unknown) => void) => {
        tuiRuntime = tui;
        component = createIssueComponent(current, onChange);
        const inner = component;
        return {
          render: (width?: number) => inner.render(width),
          handleInput: (input: string) => {
            const interrupted = keybindings?.matches?.(input, "app.interrupt") || input === "\u001b" || input.toLowerCase() === "escape" || input.toLowerCase() === "esc";
            if (interrupted) return done(undefined);
            inner.handleInput(input);
            tui.requestRender?.();
          },
          setState: (next: IssueState) => { inner.setState(next); tui.requestRender?.(); },
        };
      }, { title: "Issue" });
      return;
    }
    const output = state.mode === "cards" ? state.cards.map((card) => `- ${sanitizeText(card.title)}`).join("\n") : state.views.map((view) => `- ${sanitizeText(view.name)}`).join("\n");
    ctx.ui.notify(output || state.status || "No tasks found", "info");
  }});
};

export default extension;

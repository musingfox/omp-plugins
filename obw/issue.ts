import { asRecord, cliJson, cliOutput, hasControlCharacters, isSafeCardPath, isTaskPath, parseFrontMatter, parseYamlMapping, readWorkspaceConfig, type IssueExec, type WorkspaceConfig } from "./workspace";
export { isSafeCardPath } from "./workspace";

export type IssueView = { name: string; description?: string };
export type IssueCard = { path?: string; title: string; body?: string; status?: string; [key: string]: unknown };
export type IssueMode = "views" | "cards" | "card";

export type IssueState = { mode: IssueMode; view?: string; views: IssueView[]; cards: IssueCard[]; selected: number; body?: string; request: number; status?: string; doneExpanded?: boolean };
export function sanitizeText(value: unknown, width = 120): string {
  const text = [...String(value ?? "").replace(/\t/g, "    ")].filter((char) => char === "\n" || !hasControlCharacters(char)).join("");
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
  if (!Array.isArray(root)) throw new Error("Malformed task list: expected rows");
  return root.map((item) => {
    const row = asRecord(item);
    if (!row || ![row.title, row.name, row.file, row.path].some((value) => typeof value === "string" && value.trim())) throw new Error("Malformed task row");
    const title = String(row.title ?? row.name ?? row.file ?? row.path ?? "Untitled");
    return { ...row, title, path: row.path == null ? undefined : String(row.path), body: row.body == null ? undefined : String(row.body), status: row.status == null ? undefined : String(row.status) };
  });
}
export type IssueComponent = { invalidate(): void; render(width?: number): string[]; handleInput(input: string): void; setState(next: IssueState): void };

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
  const parsed = parseFrontMatter(source);
  body = parsed.body;
  const fields = ["title", "status", "priority", "parent", "blocked_by", "related"].flatMap((name) => {
    const value = parsed.frontmatter[name];
    return value == null ? [] : [`${name}: ${Array.isArray(value) ? value.join(", ") : String(value)}`];
  });
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
  while (true) {
    match = fence.exec(source);
    if (!match) break;
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

/** Host-free rendering; adapters supply their own terminal-column fitter. */
export function createIssueComponent(state: IssueState, onChange: (next: IssueState) => void, fitLine: (text: string, width: number) => string = sanitizeText): IssueComponent {
  const update = (next: IssueState) => { state = next; onChange(next); };
  const safe = (value: unknown) => sanitizeText(value, Number.MAX_SAFE_INTEGER);
  return {
    invalidate() { /* Rendering has no cached output. */ },
    setState(next) { state = next; },
    render(width = 120) {
      const lines: string[] = [];
      if (state.status) lines.push(safe(state.status));
      if (state.mode === "views") {
        lines.push("Views");
        state.views.forEach((view, i) => { lines.push(`${i === state.selected ? "▶" : " "} ${safe(view.name)}`); });
      } else if (state.mode === "cards") {
        lines.push(`${state.view ?? "All Tasks"}`);
        const rows = visibleIssueRows(state);
        rows.forEach((row, index) => {
          if (row.kind === "heading") lines.push(`${index === state.selected ? "▶" : " "} ${row.status === "done" && !state.doneExpanded ? "▸" : "▾"} ${row.label}`);
          else {
            const card = state.cards[row.cardIndex ?? 0];
            const meta = [card.priority, card.due, card.tags].filter(Boolean).map((item) => Array.isArray(item) ? item.join(",") : String(item)).join(" · ");
            lines.push(`${index === state.selected ? "▶" : " "} ${safe(`${card.title}${meta ? ` — ${meta}` : ""}`)}`);
          }
        });
      } else {
        const parsed = parseCardBody(state.body ?? state.cards[state.selected]?.body ?? "No body");
        lines.push(...parsed.header.map(safe));
        if (parsed.acceptance) lines.push(parsed.acceptance);
        lines.push(...safe(parsed.body).split("\n"));
      }
      return lines.flatMap((line) => line.split("\n")).map((line) => fitLine(safe(line), Math.max(0, width)));
    },
    handleInput(input) {
      const key = ({ "\u001b": "escape", "\u001b[A": "up", "\u001b[B": "down", "\u001b[C": "right", "\u001b[D": "left", "\r": "enter", "\n": "enter" } as Record<string, string>)[input] ?? input.toLowerCase();
      if (key === "escape" || key === "esc") return update({ ...state, mode: "views", body: undefined, status: undefined });
      if (key === "left" || key === "backspace") {
        if (state.mode === "card") return update({ ...state, mode: "cards", body: undefined, status: undefined });
        if (state.mode === "cards") return update({ ...state, mode: "views", view: undefined, cards: [], selected: 0 });
      }
      const rows = state.mode === "cards" ? visibleIssueRows(state) : undefined;
      const max = Math.max(0, state.mode === "views" ? state.views.length - 1 : (rows?.length ?? state.cards.length) - 1);
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

export function parseDashboardViews(value: unknown): IssueView[] {
  return parseIssueViews(typeof value === "string" ? parseYamlMapping(value) : value);
}
export type IssueBrowserOptions = {
  changed(): void;
  close(): void;
  fitLine?: (text: string, width: number) => string;
  bind?: (path: string) => Promise<void>;
  unbind?: () => void;
  cancelBinding?: () => void;
};
export function createIssueBrowser(config: WorkspaceConfig, exec: IssueExec, options: IssueBrowserOptions) {
  let current = initialIssueState();
  let closed = false;
  let generation = 0;
  let approval: { owner: string; resolve(accepted: boolean): void } | undefined;
  const pending = new Set<Promise<void>>();
  const dashboardPath = `pm/${config.project}/dashboard.base`;
  const changed = () => { component.setState(current); component.invalidate(); options.changed(); };
  const track = (work: Promise<void>) => {
    pending.add(work);
    void work.finally(() => { pending.delete(work); });
  };
  const request = () => {
    generation++;
    current = { ...current, request: generation };
    options.cancelBinding?.();
    return generation;
  };
  const settle = (id: number, patch: Partial<IssueState>) => {
    if (closed || id !== generation) return;
    current = { ...current, ...patch };
    changed();
  };
  const fail = (id: number, error: unknown) => settle(id, { status: `Unable to read tasks: ${error instanceof Error ? error.message : String(error)}` });
  const loadView = async (id: number, view: string) => {
    try {
      const value = await cliJson(exec, [`vault=${config.vault}`, "base:query", `path=${dashboardPath}`, `view=${view}`, "format=json"]);
      const cards = parseIssueCards(value);
      settle(id, { cards, selected: 0, status: cards.length ? undefined : "No tasks found" });
    } catch (error) { fail(id, error); }
  };
  const loadCard = async (id: number, path: string) => {
    try {
      const body = await cliOutput(exec, [`vault=${config.vault}`, "read", `path=${path}`]);
      parseFrontMatter(body);
      settle(id, { body, status: undefined });
      if (closed || id !== generation) return;
      const rendered = await renderMermaidFallback(body, exec);
      if (rendered !== body) settle(id, { body: rendered });
    } catch (error) { fail(id, error); }
  };
  const component = createIssueComponent(current, (next) => {
    const navigation = next.mode !== current.mode || next.view !== current.view || (next.mode === "card" && next.selected !== current.selected);
    current = next;
    if (navigation) {
      const id = request();
      if (next.mode === "cards" && next.status === "Loading…") track(loadView(id, next.view ?? "All Tasks"));
      if (next.mode === "card") {
        const card = next.cards[next.selected];
        // Always read through CLI, even when a query happened to include a body.
        if (isSafeCardPath(card?.path, config.project)) {
          current = { ...current, body: undefined, status: "Loading…" };
          track(loadCard(id, card.path));
        } else current = { ...current, body: undefined, status: "Card path is outside this project" };
      }
    }
    changed();
  }, options.fitLine);
  const dispose = () => {
    if (closed) return;
    closed = true;
    const pendingApproval = approval;
    approval = undefined;
    pendingApproval?.resolve(false);
    request();
  };
  return {
    confirmReplacement(owner: string): Promise<boolean> {
      if (closed || approval) return Promise.resolve(false);
      return new Promise((resolve) => { approval = { owner, resolve }; changed(); });
    },
    render: (width = 120) => {
      if (approval) return [
        "Replace task binding?",
        `Current session: ${sanitizeText(approval.owner, Number.MAX_SAFE_INTEGER).replaceAll("\n", " ")}`,
        "y Replace · n/Enter Keep · Esc Exit",
      ].map((line) => (options.fitLine ?? sanitizeText)(line, Math.max(0, width)));
      const lines = component.render(width);
      if (current.mode === "card" && options.bind) lines.push((options.fitLine ?? sanitizeText)("b Bind · u Unbind · ← Back · Esc Exit", width));
      return lines;
    },
    invalidate: () => component.invalidate(),
    dispose,
    handleInput(input: string) {
      if (closed) return;
      const key = input.toLowerCase();
      if (["\u001b", "escape", "esc", "q"].includes(key)) { dispose(); options.close(); return; }
      if (approval) {
        if (["y", "n", "enter", "left", "backspace", "\r", "\n"].includes(key) || input === "\u001b[D") {
          const pendingApproval = approval;
          approval = undefined;
          pendingApproval.resolve(key === "y");
          changed();
        }
        return;
      }
      if (current.mode === "cards" && !current.views.length && current.status === "Loading…"
        && (["left", "backspace"].includes(key) || input === "\u001b[D")) return;
      if (current.mode === "card" && key === "b" && options.bind) {
        const path = current.cards[current.selected]?.path;
        if (!isTaskPath(path, config.project)) { settle(generation, { status: "Only project tasks can be bound" }); return; }
        const id = request();
        current = { ...current, status: "Binding…" }; changed();
        track(options.bind(path).then(() => { settle(id, { status: "Bound this session" }); }).catch((error: unknown) => { fail(id, error); }));
        return;
      }
      if (current.mode === "card" && input.toLowerCase() === "u" && options.unbind) {
        request(); options.unbind(); settle(generation, { status: "Unbound this session" }); return;
      }
      component.handleInput(input);
    },
    async start(argument: string) {
      const id = request();
      current = { ...current, mode: "cards", view: argument.trim() || "All Tasks", status: "Loading…" };
      changed();
      try {
        const dashboard = await cliOutput(exec, [`vault=${config.vault}`, "read", `path=${dashboardPath}`]);
        const views = parseDashboardViews(dashboard);
        if (closed || id !== generation) return;
        current = { ...current, views: views.length ? views : [{ name: "All Tasks" }] }; changed();
        await loadView(id, current.view ?? "All Tasks");
      } catch (error) { fail(id, error); }
    },
    async idle() { while (pending.size) await Promise.all([...pending]); },
  };
}
export async function runIssueCommand(argument: string, cwd: string, exec: IssueExec, ui: {
  mode: string;
  report(message: string): void;
  open(config: WorkspaceConfig, argument: string, exec: IssueExec): Promise<void>;
}): Promise<void> {
  if (ui.mode !== "tui") { ui.report("/issue requires TUI mode; RPC, JSON and print are not supported"); return; }
  try { await ui.open(await readWorkspaceConfig(cwd), argument, exec); }
  catch (error) { ui.report(error instanceof Error ? error.message : String(error)); }

}

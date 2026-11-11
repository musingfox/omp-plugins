import { currentWorkPrompt, openCardInBrowser } from "./actions";
import { evalCode, evalResult } from "./writeback";
import { asRecord, cliJson, cliOutput, hasControlCharacters, isSafeCardPath, isTaskPath, parseFrontMatter, parseYamlMapping, readWorkspaceConfig, type IssueExec, type WorkspaceConfig } from "./workspace";
export { isSafeCardPath } from "./workspace";

export type IssueView = { name: string; description?: string };
export type IssueCard = { path?: string; title: string; body?: string; status?: string; [key: string]: unknown };
export type IssueMode = "views" | "cards" | "card";

export type IssueState = { mode: IssueMode; view?: string; views: IssueView[]; cards: IssueCard[]; selected: number; body?: string; request: number; status?: string; doneExpanded?: boolean; query?: string; priority?: string; sort?: "title" | "priority"; scroll?: number; cardPath?: string; links?: { label: string; path?: string }[]; linkSelected?: number };
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
  const query = state.query?.trim().toLowerCase();
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const cards = state.cards.map((card, cardIndex) => ({ card, cardIndex })).filter(({ card }) =>
    (!state.priority || card.priority === state.priority) && (!query || [card.title, card.path, card.tags].flat().join(" ").toLowerCase().includes(query)));
  if (state.sort) cards.sort((a, b) => (state.sort === "priority" ? (rank[String(a.card.priority)] ?? 3) - (rank[String(b.card.priority)] ?? 3) : 0) || a.card.title.localeCompare(b.card.title));
  if (state.mode !== "cards" || state.view !== "All Tasks") return cards.map(({ card, cardIndex }) => ({ kind: "card", cardIndex, label: card.title }));
  const rows: IssueVisibleRow[] = [];
  for (const status of [...new Set(cards.map(({ card }) => String(card.status ?? "todo")))]) {
    const group = cards.filter(({ card }) => String(card.status ?? "todo") === status);
    rows.push({ kind: "heading", status, label: `${status} (${group.length})` });
    if (status !== "done" || state.doneExpanded) for (const { card, cardIndex } of group) rows.push({ kind: "card", status, cardIndex, label: card.title });
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
            const priority = ({ high: "H", medium: "M", low: "L" } as Record<string, string>)[String(card.priority)] ?? "—";
            const meta = [card.due, card.tags].filter(Boolean).map((item) => Array.isArray(item) ? item.join(",") : String(item)).join(" · ");
            lines.push(`${index === state.selected ? "▶" : " "} [${priority}] ${safe(`${card.title}${meta ? ` — ${meta}` : ""}`)}`);
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
      if (state.mode === "card" && ["up", "down", "pageup", "pagedown", "j", "k"].includes(key)) {
        const delta = ["up", "pageup", "k"].includes(key) ? -1 : 1;
        return update({ ...state, scroll: Math.max(0, (state.scroll ?? 0) + delta * (key.startsWith("page") ? 10 : 1)) });
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
        if (state.mode === "cards" && state.cards[cardIndex]) return update({ ...state, mode: "card", selected: cardIndex, cardPath: state.cards[cardIndex].path, scroll: 0, links: [], body: state.cards[cardIndex].body, status: undefined });
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
  cwd?: string;
  userWorkPrompt?: string;
  submitWork?: (text: string) => Promise<void>;
  height?: () => number;
};
export function createIssueBrowser(config: WorkspaceConfig, exec: IssueExec, options: IssueBrowserOptions) {
  let current = initialIssueState();
  let closed = false;
  let generation = 0;
  let approval: { owner: string; resolve(accepted: boolean): void } | undefined;
  let timer: NodeJS.Timeout | undefined;
  let refreshing = false;
  let filtering = false;
  let rawBody = "";
  let rawPath = "";
  const trail: string[] = [];
  const sent = new Set<string>();
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
      const { frontmatter } = parseFrontMatter(body);
      if (closed || id !== generation) return;
      rawBody = body; rawPath = path;
      settle(id, { body, cardPath: path, status: undefined });
      const refs = ["parent", "blocked_by", "related"].flatMap((kind) => {
        const value = frontmatter[kind];
        return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string" && !!item.trim()).map((value) => ({ kind, value }));
      });
      if (refs.length) {
        const code = evalCode({ refs, path }, "const result = { links: p.refs.map(ref => { const target = ref.value.replace(/^\\[\\[|\\]\\]$/g, '').split('|')[0].split('#')[0]; const file = app.metadataCache.getFirstLinkpathDest(target, p.path); return { label: ref.kind + ': ' + ref.value, path: file?.path }; }) };");
        const result = evalResult(await cliOutput(exec, [`vault=${config.vault}`, "eval", `code=${code}`]));
        const links = Array.isArray(result.links) ? result.links.flatMap((item) => {
          const row = asRecord(item);
          return typeof row?.label === "string" ? [{ label: row.label, path: isSafeCardPath(row.path, config.project) ? row.path : undefined }] : [];
        }) : [];
        const focused = current.links?.[current.linkSelected ?? 0]?.path;
        settle(id, { links, linkSelected: Math.max(0, links.findIndex((link) => focused && link.path === focused)) });
      } else settle(id, { links: [], linkSelected: 0 });
      if (closed || id !== generation) return;
      const rendered = await renderMermaidFallback(body, exec);
      if (rendered !== body) settle(id, { body: rendered });
    } catch (error) { fail(id, error); }
  };
  const component = createIssueComponent(current, (next) => {
    const navigation = next.mode !== current.mode || next.view !== current.view || (next.mode === "card" && next.selected !== current.selected);
    if (current.mode === "card" && next.mode === "cards") {
      const path = current.cards[current.selected]?.path;
      next = { ...next, selected: Math.max(0, visibleIssueRows(next).findIndex((row) => row.cardIndex !== undefined && next.cards[row.cardIndex]?.path === path)), cardPath: undefined, links: [], scroll: 0 };
      trail.length = 0;
    }
    current = next;
    if (navigation) {
      const id = request();
      if (next.mode === "cards" && next.status === "Loading…") track(loadView(id, next.view ?? "All Tasks"));
      if (next.mode === "card") {
        const card = next.cards[next.selected];
        // Always read through CLI, even when a query happened to include a body.
        if (isSafeCardPath(card?.path, config.project)) {
          rawBody = ""; rawPath = "";
          current = { ...current, body: undefined, status: "Loading…" };
          track(loadCard(id, card.path));
        } else current = { ...current, body: undefined, status: "Card path is outside this project" };
      }
    }
    changed();
  }, options.fitLine);
  const openRelated = (path: string) => {
    const id = request();
    rawBody = ""; rawPath = "";
    current = { ...current, mode: "card", cardPath: path, body: undefined, links: [], linkSelected: 0, scroll: 0, status: "Loading…" };
    changed(); track(loadCard(id, path));
  };
  const refresh = async () => {
    if (closed || refreshing || approval || filtering || pending.size || current.mode === "views") return;
    refreshing = true;
    const id = generation;
    const mode = current.mode;
    try {
      const value = await cliJson(exec, [`vault=${config.vault}`, "base:query", `path=${dashboardPath}`, `view=${current.view ?? "All Tasks"}`, "format=json"]);
      if (closed || id !== generation) return;
      const path = current.mode === "card" ? current.cards[current.selected]?.path : current.cards[visibleIssueRows(current)[current.selected]?.cardIndex ?? -1]?.path;
      const cards = parseIssueCards(value);
      const next = { ...current, cards };
      const selected = mode === "card" ? cards.findIndex((card) => card.path === path) : visibleIssueRows(next).findIndex((row) => row.cardIndex !== undefined && cards[row.cardIndex]?.path === path);
      settle(id, { cards, selected: selected >= 0 ? selected : Math.min(current.selected, Math.max(0, (mode === "card" ? cards.length : visibleIssueRows(next).length) - 1)), status: cards.length ? undefined : "No tasks found" });
      if (mode === "card" && current.cardPath) await loadCard(id, current.cardPath);
    } catch (error) {
      settle(id, { status: `Refresh failed; showing previous data: ${error instanceof Error ? error.message : String(error)}` });
    } finally { refreshing = false; }
  };
  const dispose = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
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
      let lines = component.render(width);
      if (current.mode === "card") {
        const height = Math.max(8, (options.height?.() ?? 24) - 8);
        const offset = Math.min(current.scroll ?? 0, Math.max(0, lines.length - height));
        lines = lines.slice(offset, offset + height);
        lines.push(...(current.links ?? []).map((link, index) => `${index === (current.linkSelected ?? 0) ? "▶" : " "} ${link.label}${link.path ? "" : " (unavailable or outside project)"}`));
        lines.push(`${isTaskPath(current.cardPath, config.project) ? sent.has(current.cardPath) ? "Sent to agent" : "w Work on this card" : "Read-only relation"} · o Open in browser`);
        lines.push(`${options.bind ? "b Bind · u Unbind · " : ""}Tab/Enter Relations · ↑/↓ Scroll · ← Back · Esc Exit`);
      } else if (current.mode === "cards") {
        lines.unshift(`Filter${filtering ? " (typing)" : ""}: ${current.query ?? ""} · Priority: ${current.priority ?? "all"} · Sort: ${current.sort ?? "source"}`);
        lines.push("f Filter · p Priority · s Sort · x Clear · ← Views · Esc Exit");
      }
      return lines.map((line) => (options.fitLine ?? sanitizeText)(sanitizeText(line, Number.MAX_SAFE_INTEGER), width));
    },
    invalidate: () => component.invalidate(),
    dispose,
    handleInput(input: string) {
      if (closed) return;
      const key = input.toLowerCase();
      if (filtering) {
        if (["enter", "\r", "\n", "escape", "esc", "\u001b"].includes(key)) filtering = false;
        else if (["backspace", "\u007f"].includes(key)) current = { ...current, query: [...(current.query ?? "")].slice(0, -1).join(""), selected: 0 };
        else if (key === "space" || !hasControlCharacters(input) && !["up", "down", "left", "right"].includes(key)) current = { ...current, query: (current.query ?? "") + (key === "space" ? " " : input), selected: 0 };
        changed(); return;
      }
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
      if (current.mode === "cards" && ["f", "p", "s", "x"].includes(key)) {
        request();
        if (key === "f") filtering = true;
        if (key === "p") {
          const priorities = [undefined, "high", "medium", "low"];
          current = { ...current, priority: priorities[(priorities.indexOf(current.priority) + 1) % priorities.length] };
        }
        if (key === "s") current = { ...current, sort: current.sort === "title" ? "priority" : "title" };
        if (key === "x") current = { ...current, query: "", priority: undefined };
        current = { ...current, selected: 0 }; changed(); return;
      }
      if (current.mode === "card" && ["left", "backspace", "\u001b[D"].includes(key) && trail.length) {
        const previous = trail.pop();
        if (previous) openRelated(previous);
        return;
      }
      if (current.mode === "card" && (key === "tab" || input === "\t")) {
        current = { ...current, linkSelected: ((current.linkSelected ?? 0) + 1) % Math.max(1, current.links?.length ?? 0) }; changed(); return;
      }
      if (current.mode === "card" && ["enter", "\r", "\n"].includes(key)) {
        const path = current.links?.[current.linkSelected ?? 0]?.path;
        if (path && current.cardPath) { trail.push(current.cardPath); openRelated(path); }
        return;
      }
      if (current.mode === "card" && key === "w" && options.submitWork && options.cwd) {
        const { cwd, submitWork } = options;
        const path = current.cardPath;
        if (!isTaskPath(path, config.project) || sent.has(path)) return;
        const id = request(); sent.add(path);
        settle(id, { status: "Sending work prompt…" });
        track((async () => {
          try {
            const prompt = await currentWorkPrompt(cwd, config, path, options.userWorkPrompt);
            if (closed || id !== generation) { sent.delete(path); return; }
            await submitWork(prompt);
            settle(id, { status: "Sent to agent" });
          } catch (error) {
            sent.delete(path);
            settle(id, { status: `Could not send: ${error instanceof Error ? error.message : String(error)}` });
          }
        })());
        return;
      }
      if (current.mode === "card" && key === "o" && current.cardPath) {
        const path = current.cardPath;
        if (!rawBody || rawPath !== path) { settle(generation, { status: "Card is still loading" }); return; }
        const id = request();
        track(openCardInBrowser(path, rawBody, exec).then((status) => settle(id, { status })).catch((error: unknown) => settle(id, { status: `Could not open browser: ${String(error)}` })));
        return;
      }
      if (current.mode === "card" && key === "b" && options.bind) {
        const path = current.cardPath ?? current.cards[current.selected]?.path;
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
      current = { ...current, mode: "cards", view: argument.trim() || "All Tasks", sort: "title", status: "Loading…" };
      changed();
      try {
        const dashboard = await cliOutput(exec, [`vault=${config.vault}`, "read", `path=${dashboardPath}`]);
        const views = parseDashboardViews(dashboard);
        if (closed || id !== generation) return;
        current = { ...current, views: views.length ? views : [{ name: "All Tasks" }] }; changed();
        await loadView(id, current.view ?? "All Tasks");
        if (!closed && timer === undefined) {
          timer = setInterval(() => { track(refresh()); }, 5_000);
          timer.unref();
        }
      } catch (error) { fail(id, error); }
    },
    refresh,
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

# cc-plugins 中沒有 OMP 對應版本的 plugin：移植評估

結論：七個 plugin 裡，audit 最值得移植，而且已有 deepen 的先例可照抄；zen-agent、calendar、flashcards、games 需要改寫後才能移植；mermaid-inline 不必移植，因為 OMP 內建了同樣的功能；muster 不適用於 OMP，因為 OMP 的 `task` 加 `hub` 已經涵蓋它的核心用途。

路徑縮寫：`CC` 代表 `/Users/nickhuang/workspace/cc-plugins`，`OMP` 代表 `/Users/nickhuang/node_modules/@oh-my-pi/pi-coding-agent`（`omp` 18.13.3 的安裝位置，`~/.bun/bin/omp` 透過 symlink 指向 `OMP/dist/cli.js`）。OMP 套件沒有附帶 `docs/` 目錄，所以以下關於 OMP 的說法都以 `OMP/src` 的原始碼和 `OMP/CHANGELOG.md` 為依據。

## 一、OMP 有哪些可用的機制（已查證）

- **MCP server**：OMP extension package 根目錄的 `.mcp.json` 會被載入（`OMP/src/discovery/omp-plugins.ts:4-8`、`:291-327`）。`${CLAUDE_PLUGIN_ROOT}` 和 `${OMP_PLUGIN_ROOT}` 兩種寫法都會被換成套件根目錄（`OMP/src/discovery/substitute-plugin-root.ts:4-13`）。
- **自訂 agent 定義**：OMP 會讀取 `<extension>/agents/*.md`、`~/.omp/agent/agents/*.md` 和 `.omp/agents/*.md`，格式是 markdown 加 YAML frontmatter（`OMP/src/task/discovery.ts:1-18`）。frontmatter 支援 `tools`、`spawns`、`model` 等欄位（`OMP/src/task/agents.ts:24-26`）。本 repo 的 deepen 已經用這套機制移植了一個 agent（`deepen/agents/explorer.md`、`deepen/skills/survey/SKILL.md:33-40`）。
- **Hooks**：OMP 只有工具前後的 hook，放在 `hooks/pre|post/<tool>.sh`（`OMP/src/discovery/claude-plugins.ts:330-350`、`omp-plugins.ts:170`）。Claude Code 的 `hooks.json` 模組（Claude Mod 的 `$.ui`、`$.command`、`$.mcp` 等 API）在 OMP 沒有對應機制，改寫的目標是 TypeScript extension。
- **TypeScript extension 的 UI**：可以用的 API 有 `ctx.ui.setWidget`（掛在編輯器上方或下方，對應 Claude Mod 的 band）、`ctx.ui.custom`（取得鍵盤焦點的元件，對應 pane）、`setStatus`、`notify`（`OMP/src/extensibility/extensions/types.ts:274-306`），另外還有 `registerCommand`、`registerMessageRenderer`、`exec`（`types.ts:1262`、`:1301`、`:1332`）。obw 已經用 `ctx.ui.custom` 做出一個 issue pane（`omp-plugins/obw/index.ts:14-24`）。
- **串流中執行指令**：模型串流期間，使用者輸入的 extension 指令會被立刻執行，不會排隊（`OMP/src/modes/controllers/input-controller.ts:841-857`）。
- **Extension 不能直接呼叫 MCP 工具**：`invokeTool` 只能委派給同名的內建工具（`types.ts:500-509`），而且型別裡找不到類似 `$.mcp.call` 的 API（我搜尋了 `types.ts` 裡所有 mcp 相關的段落，只找到通知事件和中繼資料，`:598-601`、`:798-811`）。
- **背景 subagent 和隔離**：`task` 支援 `isolated`（worktree 隔離，`OMP/src/task/types.ts:122-156`）和 `detached` 背景執行（`types.ts:98-103`）。`hub` 統一負責訊息傳遞、背景 job 的等待和取消，以及長時間執行的程序（`OMP/src/tools/hub/index.ts:1-16`）。subagent 可以使用 `ask`（`OMP/src/task/read-only-policy.ts:14`）。
- **沒有 OS sandbox**：我在 `OMP/src` 搜尋 `sandbox-exec`、`seatbelt`、`bubblewrap`，沒有任何結果。`sandbox` 這個字只出現在無關的設定項目裡（`OMP/src/config/settings-schema.ts:4942-4963` 是某個 API endpoint 的選項）。未驗證：沒有官方文件可以確認 OMP 完全沒有 sandbox 功能。
- **內建瀏覽器工具**：底層是 puppeteer-core 加 CDP，也就是 Chromium 系（`OMP/src/tools/browser/launch.ts:5-6`、`browser/attach.ts:14`）。我搜尋 firefox 和 bidi，沒有任何結果。
- **讀取 Claude 插件的 provider 被使用者關掉了**：OMP 有 `claude-plugins` provider，能直接讀取 `~/.claude/plugins/cache` 裡的 skills、commands、pre/post hooks、MCP 和 agents（`OMP/src/discovery/claude-plugins.ts:1-5`、`:605-637`）。但使用者在 `~/.omp/agent/config.yml:18-20` 把 `claude` 和 `claude-plugins` 列進了 `disabledProviders`，所以每個 plugin 都需要原生移植，不能依賴這個 provider。

整個 marketplace 的定位是個人用途：`CC/README.md:3` 寫著「Personal marketplace」。

## 二、逐一評估

### 1. muster

- **用途**：在主 session 派出無人值守的 Claude worker。每個 worker 透過 ACP 跑在自己的 repo clone 裡，有權限圍欄、事件紀錄、以檔案進行的升級提問和報告檔，另外用一條 band 顯示執行中的 worker（`CC/muster/.claude-plugin/plugin.json:4`、`CC/muster/skills/muster/SKILL.md:1-14`）。
- **標記**：plugin.json 寫著 `[Experimental]`（`plugin.json:4`），README 也寫 `muster (Experimental)`（`CC/README.md:188`）。plugin 目錄裡沒有自己的 README。
- **依賴 Claude Code 的地方**：
  - worker 透過 ACP adapter `@agentclientprotocol/claude-agent-acp` 啟動（`CC/muster/src/launch.ts:4`）。
  - 隔離靠 Claude Code 的 OS sandbox，再加上網路白名單和憑證路徑封鎖（`CC/muster/src/sandbox.ts:56-63`、`CC/README.md:199`）。
  - skill 要求用 `Bash(run_in_background: true)` 和 Monitor 來等待（`SKILL.md:20`、`:37-39`）。
  - band 是 Claude Mod（`CC/muster/hooks/hooks.json:1-3`、`hooks/register.ts:5`）。
  - 模型表只列 Claude 的別名（`SKILL.md:22-29`）。
- **OMP 的對應**：
  - 部分對應。`task` 加上 `isolated: true` 提供 worktree 隔離，`detached` 提供背景執行，`hub` 負責等待和取消，subagent 也能用 `ask` 提問。依據見第一節。
  - 本 repo 已經有 pi-dispatch，負責「把工作派給便宜的 pi worker」（`omp-plugins/README.md` 的安裝清單，以及本 session 的 skill 說明）。
  - 沒有對應的部分：OS sandbox 和網路白名單在 OMP 找不到（見第一節），用 clone 而非 worktree 來保護 refs 的做法也沒有。
- **判定：不適用於 OMP。** 它的核心是「從主 session 派出、監看、收回背景 worker」，這已經由 `task`、`hub` 和 pi-dispatch 涵蓋。如果真的需要在 OMP 裡驅動 Claude worker，`muster.ts` 本身是 bun CLI，理論上可以用 `hub` 的 process 子命令啟動。不過 sandbox 依賴 Claude Code，而且 skill 的等待流程得全部重寫，未驗證能否跑通。
- **附帶發現**：`CC/README.md:53-63` 寫明 method plugin（標記為 Experimental）使用 muster 來執行巢狀節點。method 也不在 omp-plugins 裡，但它不在本次清單上。如果之後要移植 method，muster 的這個角色要換成 `task`。

### 2. audit

- **用途**：做兩種 repo 稽核。第一種檢查文件，把 README、CLAUDE.md、docs 等內容分成程式碼的快取、規則、決策和歷史四類，讓每一項知識放在不會漂移的地方。第二種把 `docs/milestones/` 裡的承諾逐條追到守護它的測試（`CC/audit/.claude-plugin/plugin.json:3`、`CC/audit/skills/docs/SKILL.md:3`、`CC/audit/skills/tests/SKILL.md:3`）。
- **標記**：plugin.json 寫著 `[Experimental]`（`plugin.json:3`），plugin 目錄裡沒有 README。
- **依賴 Claude Code 的地方**：
  - plugin.json 宣告依賴 `adr`、`spec`、`wizard`（`plugin.json:18-22`）。這三個在 omp-plugins 裡都已經有了。
  - 用 Agent subagent_type 派出 `audit:tests-tracer` 和 `audit:docs-classifier`（`CC/audit/skills/tests/SKILL.md:50-59`、`CC/audit/skills/docs/SKILL.md:70`）。
  - 兩個 agent 定義用了 `model: opus` 和 `effort: xhigh`（`CC/audit/agents/docs-classifier.md:4-5`、`tests-tracer.md:4-5`）。
  - 向使用者提問用 AskUserQuestion（`docs/SKILL.md:51`、`:109`、`:128`）。
  - 腳本路徑寫成 `${CLAUDE_PLUGIN_ROOT}/scripts/*.sh`（`tests/SKILL.md:29`、`:43`、`:63`）。
- **OMP 的對應**：
  - agent 定義可以放在 `<pkg>/agents/*.md`（`OMP/src/task/discovery.ts:7`），用 `task` 派出。
  - AskUserQuestion 換成 `ask`。
  - 腳本路徑換成 `${OMP_PLUGIN_ROOT}`，deepen 已經這樣寫（`deepen/skills/survey/SKILL.md:40`）。
  - 未驗證：OMP 的 agent frontmatter 是否有 `effort` 欄位。`OMP/src/task/agents.ts:24-26` 只看得到 `tools`、`spawns`、`model`，而 OMP 的 thinking level 由 `resolveTaskEffortLevel` 處理（`OMP/src/task/executor.ts:51`），對應方式尚未查明。
- **判定：可以移植，需要改寫，工作量小。** 它純粹是 skill 加 shell 腳本加 agent，照 deepen 的模式改寫即可。三個依賴都已經存在。

### 3. zen-agent

- **用途**：在使用者平常用的 Zen（Firefox 系瀏覽器）旁邊開第二個 Zen，用獨立 profile 和 WebDriver BiDi 讓 agent 操作，使用者可以看到畫面並隨時接手。它提供 MCP 工具、puppeteer 腳本、經使用者同意後複製單一網域的 cookie，以及 Rex 終端機的網址轉向（`CC/zen-agent/.claude-plugin/plugin.json:4`、`CC/zen-agent/skills/zen-agent/SKILL.md:1-25`、`CC/README.md:112-121`）。
- **標記**：plugin.json 沒有寫 `[Experimental]`（`plugin.json:4`），plugin 目錄裡沒有 README。這是七個 plugin 裡唯一沒有標記 experimental 的。
- **依賴 Claude Code 的地方**：
  - MCP server 寫在 `.mcp.json`，路徑用 `${CLAUDE_PLUGIN_ROOT}`（`CC/zen-agent/.mcp.json:1-8`）。
  - skill frontmatter 的 `allowed-tools` 是 Claude 專用欄位（`SKILL.md:7`）。
  - 其他部分（`bin/zen-agent`、Rex 整合）與 host 無關（`CC/zen-agent/bin/zen-agent:26`、`:130-132`）。
- **OMP 的對應**：
  - OMP extension 的 `.mcp.json` 可以直接載入，`${CLAUDE_PLUGIN_ROOT}` 也會被替換（見第一節）。
  - OMP 內建的 browser 工具只支援 Chromium 和 CDP，沒有 Firefox 或 BiDi，所以兩者並不重疊。
  - omp-plugins 已有的 agent-browser 是無頭 Chrome 的 CLI（`omp-plugins/agent-browser/skills/agent-browser/SKILL.md:1-13`），而 zen-agent 的 skill 描述本身就把兩者分開了（`SKILL.md:6`）。
- **判定：可以移植，需要小幅改寫。** 要做的事是補一個 `package.json`（含 `"omp": {}`），移除 `allowed-tools`，把 skill 裡的 MCP 工具名稱換成 OMP 的命名。未驗證：OMP 怎麼命名 MCP 工具（例如 `mcp__zen__*` 或其他形式），我沒有讀 `OMP/src/mcp/tool-bridge.ts`。另外要確認 `bin/zen-agent` 在 OMP 的 bash 工具下能否正常啟動。

### 4. calendar

- **用途**：輸入 `/cal` 會切換一條 band，列出未來 7 天（或 N 天）的 Google Calendar 行程，內容不會進入對話（`CC/calendar/README.md:1-7`）。
- **標記**：plugin.json 和 README 都寫著 `[Experimental]`（`CC/calendar/.claude-plugin/plugin.json:4`）。
- **依賴 Claude Code 的地方**：
  - 透過 claude.ai 的 Google Calendar connector，以 `$.mcp.call` 取得資料（`CC/calendar/README.md:13-17`）。
  - 用到 Claude Mod 的 `$.command.register`、`$.ui.*`、`$.clock.*`、`$.store.*`（`CC/calendar/hooks/register.ts`，以 grep 統計）。
  - `userConfig.exclude_calendars`（`plugin.json:17-25`）。
- **OMP 的對應**：
  - band 換成 `setWidget`，`/cal` 換成 `registerCommand`。
  - 但 OMP extension 不能直接呼叫 MCP 工具（見第一節）。我在 `OMP/src/mcp/` 搜尋 claude.ai connector，也沒有任何結果。
  - 所以資料來源必須換掉，例如改用 `pi.exec` 呼叫 CLI（像 gcalcli），或在 extension 裡自己處理 Google API 的 OAuth。未驗證：哪一種做法可行。
- **判定：可以移植，但要大幅改寫。** 最難的部分在資料來源，而不在 UI。純粹個人用途，價值中等偏低。

### 5. flashcards

- **用途**：`/cards build` 把 repo 裡變動過的 spec、ADR 和 Obsidian 中已完成的任務卡，以每批 10 份的方式交給背景的 Haiku 產生卡片。`/cards` 開啟一個 Leitner 複習 pane，複習時不消耗模型 token（`CC/flashcards/README.md:1-7`、`CC/flashcards/.claude-plugin/plugin.json:4`）。
- **標記**：plugin.json 寫著 `[Experimental]`（`plugin.json:4`）。
- **依賴 Claude Code 的地方**：
  - 用 `$.agent.spawn({ model: 'haiku' })` 啟動背景模型（`CC/flashcards/hooks/build.ts:107`）。
  - 用到 `$.ui.open/close/toast`、`$.store`、`$.fs`、`$.session.*`。
  - 型別從 `claude-code` 匯入（`hooks/build.ts:1`、`hooks/pane-review.ts:1-2`），而且用到 `atom`、`read`、`update` 這類 reactive state。
  - 讀取 `.obsidian.yaml`（`README.md:3-5`）。
- **OMP 的對應**：
  - pane 換成 `ctx.ui.custom`，obw 已經有先例。
  - 背景模型可以改成用 `pi.exec` 啟動 `omp -p --model ...` 子程序（`omp --help` 列出了 `-p, --print` 和 `--model`）。
  - store 可以改用 extension 自己寫檔，或用 `appendEntry` 存 session 狀態（`types.ts:1328`）。
  - obw 已經在 omp-plugins 裡了。
  - 未驗證：`atom`、`read`、`update` 在 pi-tui 裡是否有對應的東西，可能需要改成手動 render。
- **判定：可以移植，需要改寫。** 純邏輯部分（`leitner.ts`、`select.ts`、`deck-store.ts` 等）可以沿用，要換掉的是 UI 和 agent.spawn。純粹個人用途。

### 6. games

- **用途**：等 Claude 工作時可以在 pane 裡玩 2048、踩地雷、dino 和五子棋。五子棋可以透過 Cloudflare relay 和真人對戰（`CC/games/README.md:1-15`）。
- **標記**：plugin.json 寫著 `[Experimental]`（`CC/games/.claude-plugin/plugin.json:4`）。
- **依賴 Claude Code 的地方**：
  - 用到 Claude Mod 的 `$.ui.open/close/resolve/toast`、`$.command.register`、`$.clock.every`、`$.http.fetch`、`$.store`（`CC/games/hooks/*.ts`，以 grep 統計）。
  - `userConfig` 有 `relay_url` 和 `player_name` 兩個欄位（`plugin.json:18-31`）。
  - 主要賣點是在一輪對話進行中也能玩（`plugin.json:4`）。
  - relay 是獨立的 Cloudflare Worker（`CC/games/relay/`），與 host 無關。
- **OMP 的對應**：
  - pane 換成 `ctx.ui.custom`，指令換成 `registerCommand`。
  - 串流期間 extension 指令會被立刻執行（`input-controller.ts:841-857`），所以「對話中也能玩」在 OMP 理論上可行。未驗證：串流期間 `ctx.ui.custom` 能否穩定取得鍵盤焦點，dino 需要的高頻重繪也還沒試過。
  - `$.http.fetch` 可以換成 Bun 的 `fetch`。
- **判定：可以移植，需要改寫。** 遊戲邏輯（`game2048.ts`、`mines.ts`、`gomoku.ts`、`dino.ts`）可以沿用，`pane-*.ts` 要重寫。這是娛樂用途，值不值得做取決於使用者自己。

### 7. mermaid-inline

- **用途**：把 Claude 寫出的每個 mermaid 區塊，在對話紀錄裡原地畫成純文字方框圖，並對齊 CJK 字元寬度（`CC/mermaid-inline/.claude-plugin/plugin.json:4`）。
- **標記**：plugin.json 寫著 `[Experimental]`（`plugin.json:4`）。
- **依賴 Claude Code 的地方**：用到 Claude Mod 的 `$.ui.log`、`$.ui.invalidate`、`$.fs.write`、`$.process.run`（`CC/mermaid-inline/hooks/*.ts`，以 grep 統計）。
- **OMP 的對應**：
  - OMP 內建這個功能。助理訊息裡的 mermaid 區塊預設會畫成 ASCII，可以用設定 `tui.renderMermaid` 開關（`OMP/CHANGELOG.md:2521`、`OMP/src/config/settings-schema.ts:915`）。
  - 渲染器是 vendored 的 mermaid-ascii，CJK 和 emoji 的寬度處理也保留著（`OMP/CHANGELOG.md:3056`、`:3651`），而且會套用主題顏色、依終端機寬度調整版面（`CHANGELOG.md:3198`）。
- **判定：不適用於 OMP，因為 OMP 已經內建同樣的功能。** 未驗證：OMP 內建的版本是否支援全部五種圖型（flowchart、sequence、class、state、xychart）。

## 三、整理

| Plugin | 標記 | 判定 | 主要障礙 |
|---|---|---|---|
| muster | Experimental | 不適用 | 被 `task`、`hub`、pi-dispatch 涵蓋；OS sandbox 在 OMP 沒有對應 |
| audit | Experimental | 改寫後移植（小） | agent 改用 `task` 派出，提問改用 `ask`；需確認 `effort` 欄位 |
| zen-agent | 無標記 | 改寫後移植（小） | MCP 工具名稱要換成 OMP 的命名，`allowed-tools` 要移除 |
| calendar | Experimental | 改寫後移植（大） | 拿不到 claude.ai connector，extension 也不能呼叫 MCP |
| flashcards | Experimental | 改寫後移植（中） | `agent.spawn` 要改成 `omp -p` 子程序，pane 要重寫 |
| games | Experimental | 改寫後移植（中） | pane 要重寫，串流期間的鍵盤焦點還沒驗證 |
| mermaid-inline | Experimental | 不適用 | OMP 已內建 |

建議的優先順序：先做 audit，再做 zen-agent，因為兩者都只需要改寫 skill 和設定。calendar、flashcards、games 都是 Claude Mod 的 UI 移植，可以共用同一套「Claude Mod 換成 OMP extension」的改寫方式，obw 的 `index.ts` 是現成範本。

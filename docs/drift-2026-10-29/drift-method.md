# OMP cf/spiral 與 cc-plugins method 的漂移報告

結論：cc-plugins 已把 `/cf` 鏈與 spiral 合併成一個 `method` skill 加四個 agent 與六支腳本；omp-plugins 的 `cf/` 與 `spiral/` 應整包刪除，改以一個 OMP 原生的 `method` 套件取代。method 的敘事內容（narrow、contracts、route、report）可以幾乎原樣搬過去，真正需要重新設計的只有「節點的載具」，也就是 cc 端的 muster 派工。

版本基準：

- cc-plugins HEAD 是 `b4555826`，method 版本 0.1.4（`method/.claude-plugin/plugin.json:3`）。
- omp-plugins HEAD 是 `dadb051`。
- OMP 可讀原始碼位於 `/Users/nickhuang/node_modules/@oh-my-pi/pi-coding-agent/src`，版本是 17.3.4（該目錄 `package.json`）。實際執行的 `dist/cli.js` 是 18.13.3（`omp --version`）。下文凡引 OMP 原始碼，都另外在 18.13.3 二進位檔裡 grep 過同一字串；grep 不到的會標「未驗證」。

---

## 1. method 的組成，以及它對 omp cf/spiral 的取代、保留與丟棄

### 1.1 cc 端發生了什麼

- `0ebb9e17` 刪掉 `/cf` 鏈（`commands/cf.md`、implement/research agents、全部 `cf-pi-*.sh`、hooks、docs），只留下 plan、review 與 gate 腳本。
- `38a1f255`、`160cb7b7` 把 plan 改成從已釘住的契約出發，並把 review 收窄成只看 Spec 軸，拿掉 delivery 軸。
- `313f0c07` 讓 spiral 把目標交回 main session，由 main session 釘契約。
- `accb7dd3` 新增 one-node method skill。commit message 說明節點自己寫 sub-contracts 與 `contracts.json`，承接原本 cf:plan 的內容，所以不再派 plan agent。
- `518160ae` 把 review、probe、prototype、divergence 四個 agent 移進 method；`2cd4f064`、`f9ed1f25` 搬移 gate 與 decision-page 腳本。
- `f9902b2b` 改名：`.spiral/` 改成 `.narrow/`，`spiral/prototype-` 改成 `prototype/`，`CF_*` 環境變數改成 `METHOD_*`，而且沒有相容 fallback。
- `de5039bf` 刪除 context-flow 與 spiral 兩個 plugin，deepen 的交接改指向 method skill。
- `4f94974b` 把 repo 內其他引用改指向替代品；diagnose 也不再依賴 context-flow。
- `0cbddb70` 在 observes 加上 `return` 通道；`e2e8824c` 規定 review 在建置者 head 的 worktree 裡執行。

### 1.2 method 的組成

| 部件 | 作用 | 出處 |
|---|---|---|
| `SKILL.md` | 一個節點的入口索引，依情境決定讀哪個檔，並寫明 plugin root | `method/skills/method/SKILL.md:6-27` |
| `narrow.md` | 把問題收斂成契約：diverge、round、probe/prototype、converge、depth gate，最後組出契約 | `narrow.md:1-106` |
| `decision-page.md` | 用 viz 頁面呈現一輪決策：brief 格式、內文版面、render/wait、讀回答案、depth gate | `decision-page.md:1-100` |
| `split.md` | 自己做或拆分，拆分只有三個理由 | `split.md:3-29` |
| `contracts.md` | `contracts.json` schema、欄位規則、原子性、四類反覆出現的缺陷、決策分級、承重假設 | `contracts.md:1-154` |
| `dispatch.md` | 用 muster `--ticket-file` 原樣夾帶 contracts，處理巢狀 run，並說明 agent 席位如何派 | `dispatch.md:1-31` |
| `report.md` | 固定的 `DONE`/`BLOCKED` 回報格式 | `report.md:9-30` |
| `route.md` | 依 review 的 Layer 決定路由（code、contract、milestone），每個 sub-contract 最多彈回兩次 | `route.md:5-29` |
| `review.md`（skill） | 每次拆分做一次 review；leaf 只跑機械 gate | `skills/method/review.md:3-40` |
| `agents/review.md` | Spec 軸審查，輸出 Layer 與 repros 檔，模型 `opus`、effort `high` | `agents/review.md:1-8,19-31,81-89` |
| `agents/divergence.md`、`probe.md`、`prototype.md` | narrow 的三個席位 | 各檔 frontmatter `:1-8` |
| `scripts/check-contracts.sh`、`scope-gate.sh`、`revert-gate.sh`、`add-repros.sh` | contracts.json 的 schema 檢查與兩道機械 gate | `method/README.md:14-17` |
| `scripts/render-decision.sh`、`wait-decision.sh` | 決策頁的 render 與等待 | `method/README.md:18` |

### 1.3 對 omp `cf/` 的影響

omp cf 是一個 TypeScript 狀態機（`cf/index.ts:4-13,371-508`）。它只透過 `task` 派工，並用工具圍欄限制 parent 只能用 `task`、`ask`、`hub`（`cf/index.ts:173,586-594`）。

| omp cf 部件 | method 中的對應 | 判定 |
|---|---|---|
| PREFLIGHT：在 `/tmp/omp-cf.*` 寫 intent/preflight（`cf/index.ts:373-379`） | ticket 開頭只寫 base commit 與測試指令（`dispatch.md:11`） | 被取代 |
| PROBE：研究 handoff A/B（`cf/index.ts:381-399`） | 不設研究席位；節點自己讀，資訊不足時派一次資訊 session（`route.md:17`，`dispatch.md:27-29`） | 被取代 |
| TYPE：WorkContracts 與 waves manifest（`cf/index.ts:22-39,404-409`） | 節點自己寫 `contracts.json`（`contracts.md:27-55`），用 `depends` 決定順序（`contracts.md:63`），再跑 `check-contracts.sh`（`contracts.md:152`） | 被取代 |
| scopeGate：High 決策交給人（`cf/index.ts:319-344`） | 決策分級：High 往上報，Medium 自己決定並記錄（`contracts.md:106-134`，`route.md:18-21`） | 概念保留，機制改變 |
| IMPLEMENT：依 wave 用 isolated `task` 執行（`cf/index.ts:417-463`） | muster 子 run 與巢狀 run（`dispatch.md:5-21`） | 被取代，OMP 需另找載具（見 §2） |
| chooseRoute：RETRY/REPLAN/ABORT（`cf/index.ts:240-261`） | 依 Layer 路由，加上兩次彈回上限（`route.md:5-27`） | 被取代 |
| VERIFY：雙軸 review 與連續兩次失敗即 replan（`cf/index.ts:465-492`） | 每次拆分一次 review，只看 Spec 軸（`skills/method/review.md:3,20-34`）；leaf 跑 scope/revert gate（`skills/method/review.md:5-12`） | 被取代；delivery 軸被丟棄（`160cb7b7`） |
| deliveryGate（`cf/index.ts:345-369`） | 沒有對應；上層讀 `DONE` 報告（`report.md:20-24`） | 丟棄 |
| cleanup（`cf/index.ts:263-269,498-507`） | contracts.json 放在 `mktemp -d`（`contracts.md:25`）；讀完 verdict 後 `git worktree remove`（`skills/method/review.md:25`） | 被取代 |
| envelope JSON schema（`cf/index.ts:94-171`） | `report.md` 的固定格式，加上 `check-contracts.sh` | 被取代 |
| task relay 與工具圍欄（`cf/index.ts:510-565,586-594,607-610`） | 沒有對應；method 由 session 自己照 skill 執行 | 丟棄（可另評估是否留一個小 extension，預設刪除） |

補充兩點：

- omp 端目前完全沒有 scope gate 或 revert gate。omp cf 在 `7756b3e` 刪了 `cf/scripts/shard.py`，在 `11a9310` 刪了 agents。所以 method 的四支 gate 腳本對 OMP 是新增能力，不是搬移；它們只依賴 bash、git、jq、perl、python3、shasum（`method/README.md:41-48`）。
- 未驗證：`cf/index.ts:484,496` 寫入 `state.terminalError`，但 `CfState`（`cf/index.ts:61-76`）沒有這個欄位，看起來會是型別錯誤。我沒有執行 tsc。既然建議整包刪除，這點不必修。

### 1.4 對 omp `spiral/` 的影響

| omp spiral 部件 | method 中的對應 | 判定 |
|---|---|---|
| §1 Diverge 與 carry-over（`spiral/commands/spiral.md:42-72`） | `narrow.md:39-46` | 保留，文字已濃縮 |
| §2 一輪、frontmatter、multi 規則（`spiral.md:74-149`） | `narrow.md:48-58`，`decision-page.md:13-63` | 保留；method 新增卡片版面規則（`decision-page.md:57-63`），render 也會拒收預填答案或對不上選項的表格列（`decision-page.md:73`） |
| §3 Probe、Prototype、五個出口（`spiral.md:151-240`） | `narrow.md:60-77` | 保留；branch 改成 `prototype/<slug>`（`narrow.md:69`，`f9902b2b`）；probe 不給模型覆寫（`narrow.md:62`），與 spiral「便宜模型」的說法（`spiral.md:166`）相反 |
| §4 Converge 的四段結果（`spiral.md:242-304`） | `narrow.md:79-88` | 保留；「重新收斂時改名舊 plan」等細節被刪掉 |
| §5 depth gate 用 inline `ask`，明說不 render（`spiral.md:306-316`） | depth gate 也上頁面（`narrow.md:92`，`decision-page.md:98-100`，`d6ae183b`） | 改變 |
| §5 推升成 `docs/milestones/<slug>.md`，含 frontmatter 與 `## Suggested skills`，再交給 `/cf`（`spiral.md:334-369`） | 「The end: a contract」：由決策者釘住，寫到比 scratch 活得久的檔案，再進 `split.md`（`narrow.md:100-106`） | milestone frontmatter、Suggested skills 與 `/cf` 交接全部丟棄 |
| Rendering 與 timeout 規則（`spiral.md:382-416`） | `decision-page.md:65-96` | 保留 |
| Rules（`spiral.md:418-437`） | `narrow.md:5,21-29,46` | 保留，分散到各段 |
| `docs/concept.md`（228 行） | cc 已刪（`de5039bf`）；公理濃縮成 `narrow.md:19-23`，決策者角色濃縮成 `:25-29` | 丟棄。concept §2 的「能力配置跟著分類走、checker 不低於被查者」與 §6「只有回饋才算迭代」沒有被完整搬進 method，只剩 `narrow.md:76` 的一句 |
| `LICENSE-upstream` 與 mattpocock 歸屬（`spiral.md:11`，`tests/attribution.test.sh`） | method 沒有任何 mattpocock 文字（grep `method/` 無結果） | 丟棄，因為改編來的兩條規則已不存在 |
| `agents/*.md` 三個 | `method/agents/` 同名檔 | 保留；frontmatter 不同（見 §2），prototype 多了「沒有 branch 名稱就是壞派工」與「不跳過 hook」兩段，且 `worktree remove` 不再加 `--force` |
| `scripts/render-decision.sh` | method 版多了 brief 驗證；omp 版有自寫的 semver 解析器（`spiral/scripts/render-decision.sh:10-47`，`b05d0df`），method 版用 `sort -V`（`method/scripts/render-decision.sh:63-78`） | 移植時以 method 版為準，保留 omp 的 `OMP_PLUGIN_ROOT` 根目錄解析 |
| `scripts/wait-decision.sh` | method 版同邏輯，訊息前綴與 timeout 說明不同 | 換成 method 版 |

還有一個漂移不在 method 本身：cc `audit:tests` 仍以 `docs/milestones/` 作為需求來源（`cc-plugins/README.md:315`），但 method 不再規定把結果寫成 milestone 檔（`narrow.md:106` 只要求一個比 scratch 活得久的檔案）。這是 cc 端的未決問題，OMP 移植前應先問清楚。

---

## 2. 只在 Claude Code 存在的機制與 OMP 對應

| method 依賴 | 出處 | OMP 對應 | 驗證狀態 |
|---|---|---|---|
| Agent 工具的 `subagent_type`（`method:review` 等） | `dispatch.md:25`，`narrow.md:41,62,69`，`skills/method/review.md:22` | `task` 的 `agent:` 欄位（`src/task/types.ts:116,124`）；平行 probe 用 batch `{context, tasks[]}`（`types.ts:168-169`）。OMP 會自動把 extension 根目錄下的 `agents/*.md` 載成 task agent（`src/task/discovery.ts:7-12,97-105`） | 已驗證，17.3.4 原始碼；`listOmpExtensionRoots` 字串存在於 18.13.3 |
| agent 名稱命名空間 | `method:review` | OMP 只用 `name` 去重，第一個載入的根目錄獲勝（`discovery.ts:120-128`），沒有 `plugin:` 前綴（omp `README.md:55`）。method 的 `probe`、`divergence`、`prototype` 會和 omp spiral 的同名 agent 衝突；`review` 與內建 `reviewer` 不同名 | 已驗證（原始碼） |
| frontmatter `model: opus` | `agents/review.md:5`，`probe.md:5` | 有 `model` 欄位，可寫 `@role`，例如內建 task 用 `@task`（`src/task/agents.ts:57`，`src/discovery/helpers.ts:298`）。使用者的 modelRoles 沒有 opus（`~/.omp/agent/config.yml:6-16`），要選一個 role（例如 `@slow`）承擔「審查者不低於建置者」 | 欄位已驗證；角色對應未驗證，因為需要使用者決定 |
| frontmatter `effort:` | divergence `xhigh`、review `high`、probe `medium`、prototype `low` | OMP 讀 `thinkingLevel` 或 `thinking`，不讀 `effort`（`helpers.ts:293-299`），可接受 minimal/low/medium/high/xhigh/max（`src/thinking.ts:48-54,204-206`）。直接搬 `effort:` 會被靜默忽略 | 已驗證（原始碼）；`thinkingLevel` 字串存在於 18.13.3 |
| frontmatter `tools:`、`color:` | 各 agent `:4-7` | `tools` 以 CSV 解析並自動補上 `yield`（`helpers.ts:263-268`）；`color` 被忽略。omp spiral agents 的 `omp: task` 也不是解析欄位 | 已驗證（原始碼） |
| 每次派工覆寫 effort | `dispatch.md:21`（muster `--effort`） | `TaskItem.effort` 有宣告（`types.ts:140`），但 arktype schema 沒有這個欄位（`types.ts:113-120`） | 未驗證：18.13.3 二進位有 `"lo" \| "med" \| "hi"` 字串，但看不出 schema 是否接受 |
| `AskUserQuestion`，每批最多四題 | `narrow.md:29`，`decision-page.md:84` | `ask` 支援 `multi`、`recommended`（`src/tools/ask.ts:67-69`），題數只要求至少一題（`ask.ts:79`），所以「每批四題」的規則只屬於 CC | 已驗證（原始碼） |
| 「空白不等於同意 recommend」 | `decision-page.md:91`，`narrow.md:57` | `ask.timeout` 逾時會自動選 recommended（`src/config/settings-schema.ts:1942-1949`，預設 0，即關閉） | 已驗證；這個字串存在於 18.13.3。移植時要求 timeout 為 0，或不傳 `recommended` |
| Bash `run_in_background` 加上「Save 會喚醒你」 | `decision-page.md:75` | bash `async`（`src/tools/bash.ts:319`，`async.enabled` 預設 true，`settings-schema.ts:4225-4227`）；`hub wait` 與 `hub cancel` 對應 `TaskStop`（`src/tools/hub/index.ts` 開頭註解，`hub/types.ts:18-26`） | 未驗證且承重：async job 完成時，能否喚醒已結束回合的 OMP session。hub 註解只說結果會自己送達。omp spiral 宣稱會喚醒（`spiral.md:393`），但沒有測試佐證；`cf/index.ts:538-563` 必須自己用 `sendUserMessage` 與 `waitForIdle` 接線，可見這件事不是免費的。應列為第一個 prototype 題目 |
| `${CLAUDE_PLUGIN_ROOT}` 只在 SKILL.md 中替換 | `SKILL.md:12` | OMP 的 `substitutePluginRoot` 只用在 MCP 設定（`src/discovery/claude-plugins.ts:571-582`），不處理 skill 內文；而且使用者停用了 `claude-plugins` provider（`config.yml:18-20`）。OMP 的做法是 `skill://method/<file>` 讀同目錄檔案（`src/internal-urls/skill-protocol.ts:7-8`），或沿用 omp 慣例「把 `OMP_PLUGIN_ROOT` 設為套件目錄」（`deepen/skills/survey/SKILL.md:13`，`spiral.md:9`） | `skill://` 子路徑：原始碼已驗證，18.13.3 未驗證（grep 不到該註解字串）；`OMP_PLUGIN_ROOT` 字串存在於 18.13.3 |
| plugin 相依 `dependencies: ["viz"]` | `method/.claude-plugin/plugin.json:19-21`，`method/README.md:31` | OMP 沒有 plugin 對 plugin 的相依宣告；只有安裝根目錄 `package.json#dependencies`（`src/extensibility/plugins/loader.ts:73-89`）。對應做法是執行期的 sibling resolver，與 cc 規格 `docs/spec/cross-plugin-runtime-resolution.md:11-22` 一致；omp 端已有 `spiral/scripts/render-decision.sh:10-47`，viz 也提供 `viz/lib/render.sh` | 已驗證 |
| muster 派工（`--ticket-file`、`--model`、`--effort`、`watch`、巢狀 run） | `dispatch.md:3,7,15-21`，`split.md:9` | OMP 沒有 muster。可能的載具有三種：`task` 子 agent（遞迴深度預設 2，`settings-schema.ts:4629-4631`，會限制契約樹深度）；`task` 加 `isolated: true`（隔離預設關閉，`settings-schema.ts:4451-4466`；`task.isolation.apply` 預設 true，會把變更自動套回 parent，`:4499-4508`）；omp pi-dispatch（目前在 `omp plugin list` 顯示為停用 ⦸） | 機制已驗證；選哪個屬於 High 決策，交給協調者與使用者 |
| prototype 的 branch 不得合併 | `agents/prototype.md`，`narrow.md:69` | 不能用 `isolated: true`，因為 apply 與 patch merge 會自動把 diff 套回（見上一列）。保留 agent 自己執行 `git worktree add -b` 的做法 | 已驗證 |
| 資訊 session 用 Explore subagent | `dispatch.md:29` | 用內建 `scout` 或 `sonic` agent（`src/task/agents.ts:68-72`，`src/prompts/agents/scout.md`） | 原始碼已驗證 |
| main session 代人類派自己的 review | `skills/method/review.md:17-18` | `task` 加 `agent: review` | 同第一列 |

---

## 3. 仍然指向 cf/spiral 的引用

### 3.1 cc-plugins（HEAD `b4555826`）

已改成指向 main session 或 method 的：

- diagnose：`diagnose/docs/method.md:177,181,185,193` 都寫成修復交給 main session；`4f94974b` 移除了 `"dependencies": ["context-flow"]`。
- audit：`audit/scripts/assemble.sh:70,82` 輸出「Hand to the main session」。
- deepen：`deepen/skills/survey/SKILL.md:76` 寫成交給 `method` skill（`de5039bf`）。
- spec：glossary 的 mirror rule 改指 `deepen/agents/explorer.md`（`spec/skills/glossary/SKILL.md:27-28`）。

cc 端自己仍殘留舊名：

- `deepen/agents/explorer.md:51` 寫「designing it is `/spiral`'s job」。
- `deepen/docs/PROVENANCE.md:3` 寫「`/spiral` narrows」。
- pi-dispatch 的註解與文件提到 cf/spiral：`pi-dispatch/docs/dispatch-doctrine.md:5`、`scripts/pi-poll.sh:104`、`scripts/pi-run.sh:4`、`scripts/pi-probe.sh:4`、`scripts/pi-dispatch.sh:54`、`scripts/pi-worktree.sh:4`、`shims/git:25`。
- `docs/milestones/muster-acp-workers.md:30` 提到 `cf:*` persona。

### 3.2 omp-plugins（HEAD `dadb051`）

- `README.md:14,20,60` 有 `cf`、`spiral` 的安裝行；`:40,46` 有兩者的表格列；`:44` 寫 diagnose 是「`/cf` handoff」。
- `diagnose/commands/diagnose-now.md:2` 寫「hand off to /cf」；`diagnose/docs/method.md:10` 寫「`/cf` owns the repair after hand-off」。cc 已改成 main session。
- `deepen/skills/survey/SKILL.md:11,61` 寫「`/spiral` narrows」或「`/spiral`'s job」；`deepen/agents/explorer.md:13` 寫「`/spiral` designs candidates」。
- `spec/skills/glossary/SKILL.md:26` 寫「the mirror rule is context-flow's Design Vocabulary」。cc 已改指 `deepen/agents/explorer.md`。
- `obw/docs/dual-host-plan.md:36` 寫「不整合 `cf`」，屬歷史敘述，影響很小。
- omp 沒有 audit 或 muster plugin，所以沒有對應的引用需要處理。

---

## 4. 建議的移植形狀與刪除清單

建議形狀：新增 `omp-plugins/method/`，`package.json` 宣告 `"omp": {}`，內含 `skills/method/`（九個檔照搬，`SKILL.md` 的 plugin root 改用 `OMP_PLUGIN_ROOT` 慣例，同目錄檔案改用 `skill://method/<file>`）、`agents/`（四個檔，`effort:` 換成 `thinkingLevel:`，`model: opus` 換成使用者選定的 role，刪掉 `color:`），以及 `scripts/`（六支照搬，`CLAUDE_PLUGIN_ROOT` 改成 `OMP_PLUGIN_ROOT` 並保留 `dirname` fallback；render 的 viz 解析沿用 omp 現有的 semver resolver）。所有 `subagent_type` 改成 `task` 的 `agent: <name>`，`AskUserQuestion` 改成 `ask`（並註明 `ask.timeout` 必須為 0、沒有四題上限），`run_in_background`/`TaskStop` 改成 bash `async` 加上 `hub wait`/`hub cancel`。

照全域 CLAUDE.md 的里程碑規則，第一個里程碑應端到端跑通「`SKILL.md` + `narrow.md` + 四個 agent 以真正的 OMP agent 派出 + inline `ask` 回合」。以下部分先用 stub：viz 決策頁、async 喚醒、gate、巢狀派工。`dispatch.md` 的節點載具（task 遞迴、isolated task、或 pi-dispatch）是 High 決策，要交給使用者，不由移植者自行決定。

建議刪除：

- `omp-plugins/cf/` 整包：`index.ts`、`index.test.ts`、`package.json`。工具圍欄（`cf/index.ts:586-594`）是唯一沒有 markdown 對應的部件；預設刪除，除非有人要求另立小 extension。
- `omp-plugins/spiral/` 整包：`commands/spiral.md`、`docs/concept.md`、`agents/` 三個檔（method 版取代，而且同名會衝突）、`scripts/`（method 版取代）、`LICENSE-upstream`、`tests/attribution.test.sh`、`tests/handoff-rules.test.sh`、`tests/contract.test.sh`、`tests/run.sh`。
- 唯一值得帶走的測試是 `spiral/tests/render-decision.test.sh` 的 semver fixture（`:8-26`），改寫成 method 版本。
- 同一次變更要一併修正 §3.2 列出的 README、diagnose、deepen、spec 引用。
- 使用者本機還有 `omp plugin link` 連著 cf 與 spiral（`omp plugin list` 顯示 `cf@0.1.0`、`spiral@0.3.2`）。刪除時要 unlink，否則同名 agent 仍可能先載入。

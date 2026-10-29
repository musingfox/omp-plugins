# omp-plugins 翻修計畫（2026-10-29）

本計畫讓 omp-plugins 追上 cc-plugins 的現況。cc-plugins 基準是 `b4555826`（2026-10-26），omp-plugins 基準是 `dadb051` 加上 `obw/` 的暫存變更。宿主版本是 omp 18.13.3、pi 1.4.0。

下列現況由四個子 agent 比對兩個 repo 後整理，出處以 file:line 或 commit 標示。完整報告留在 `docs/drift-2026-10-29/`。這些報告沒有經過獨立 context 複核，每個里程碑開工前要先對照程式碼確認。

## 1. 現況

### 1.1 上游的結構變動

- cc 刪除了 `context-flow`（`/cf`）與 `spiral`，改由 `method` 取代（cc `de5039bf`、`4f94974b`、`f9902b2b`、`0ebb9e17`）。omp 仍然保有 `cf/` 與 `spiral/`。
- `method` 保留 spiral 的 diverge、round、probe、converge（cc `method/skills/method/narrow.md:39-88`），丟掉 cf 的 preflight、研究、TYPE waves、雙軸 VERIFY 與 envelope（omp `cf/index.ts:94-171,345-369,373-492`）。它新增 `contracts.json`、scope gate 與 revert gate，這些對 OMP 都是新能力。
- diagnose、deepen、audit、spiral 改成把後續交回主 session，不再交給 `/cf`（cc `79db07df`、`313f0c07`、`3d73c3fb`、`bfcd5004`）。
- agent-browser 把可見瀏覽器交給新的 zen-agent（cc `45377c18`）。
- obsidian-workspace 把 ADR 移到 adr plugin（cc `f7144fd2`）。

### 1.2 共有 plugin 的差異

| plugin | 差異 | 重點 |
|---|---|---|
| agent-browser | 大 | 安全退步：omp `agent-browser/skills/.../SKILL.md:65,127` 建議把憑證放進全域 `set headers`，會送到每個網站，cc 已禁止（`f1ac52c3`）。另缺 web-test Phase 5 與不可逆操作前先問（`83238191`）。 |
| obw | 大 | jot 的 CLI 呼叫沒帶 `vault=`，會寫錯 vault。wikilink 清單屬性沒寫成 JSON 陣列（cc `dfc9b8d0`）。缺 `pm_tick`、`pm_note`、`pm_status`。仍有 ADR 功能。`obw/viz.ts` 是孤兒，且從 cwd 找 `render.sh`（`viz.ts:12`）。 |
| viz | 大 | cc 改用 Pele 1.6.0、Flexoki 配色並固定 highlight.js 版本，omp 仍是 Mermaid 11 加 ELK、highlight.js `@latest`。cc 修了兩個 feedback bug：再點唯一選項會清掉選擇；範本 frontmatter 的註解讓空的 `choice:` 被當成已回答。cc 另有卡片檢視。 |
| hook-guard | 大 | 移植只剩殼：`pre-commit-checks.md` 從 315 行剩 16 行，hook 腳本都沒搬，文件提到不存在的 extension，第 10–11 行斷句。 |
| diagnose | 中 | `docs/method.md` 有 7 處交給 `/cf`，兩個測試固定這個字串。缺 `set -e`、`format-patch`（cc `36e825d8`）與 Phase 5 的綠轉紅檢查（cc `f0e47acb`）。 |
| deepen | 中 | 交給 `/spiral`（`skills/survey/SKILL.md:11,61`、`agents/explorer.md:13`）。只讀 `docs/adr/`，不讀 `docs/decisions/`（cc `c0b38ed0`）。缺 Design Vocabulary 段落。 |
| adr | 中 | 缺 `rejected` 狀態、supersede／deprecate 後的驗證步驟（cc `eae94b8f`）、相對路徑規則與 MADR 選用段落標記。 |
| apple-podcasts | 中 | omp 版是重寫。禁止 curl 但沒寫原因；OMP `read` 是否回傳原始 JSON/XML 未驗證。 |
| spec | 中，只改文字 | `skills/glossary/SKILL.md:26` 指向已刪的 context-flow，應改指 `deepen/agents/explorer.md`。缺「新檢查要在故意違反時轉紅」的規則。`spec.sh` 不需移植 glob 修正。 |
| wizard | 小 | 仍建議 `confirm … \|\| exit 0`，cc 指出會跳過結尾摘要（`8f7c9649`、`ab7f1756`）。缺 `grep -c` 段數檢查與 `git check-ignore`。 |
| pi-dispatch | 刻意分歧 | omp 版是另一套設計，使用者在 2026-10-12 用 `omp plugin disable` 停用（`~/.omp/plugins/omp-plugins.lock.json:66`）。 |

### 1.3 cc 有、omp 沒有的 plugin

| plugin | 判定 | 理由 |
|---|---|---|
| audit | 移植，小 | 兩個 agent 放進 `agents/` 用 `task` 派出，AskUserQuestion 換成 `ask`。依賴的 adr、spec、wizard 都已在 omp。 |
| zen-agent | 移植，小 | OMP 會載入套件的 `.mcp.json` 並替換 `${CLAUDE_PLUGIN_ROOT}`。要補 `package.json`、拿掉 `allowed-tools`、換 MCP 工具名稱。 |
| flashcards、games | 延後，中 | pane 要用 `ctx.ui.custom` 重寫；flashcards 的背景模型要改用 `omp -p` 子程序。 |
| calendar | 延後，大 | OMP extension 拿不到 claude.ai connector，資料來源要換。 |
| muster | 不移植 | OMP 的 `task`（`isolated`、`detached`）與 `hub` 已涵蓋，且沒有 Claude Code OS sandbox 的對應。 |
| mermaid-inline | 不移植 | OMP 內建 mermaid ASCII 渲染（`tui.renderMermaid`）。 |

### 1.4 進行中與宿主問題

- `obw/` 有一批暫存未提交的雙宿主變更（37 檔，+3076/−286），計畫見 `obw/docs/dual-host-plan.md`。pi 端的 bind、sync 與驗收已完成；OMP 端 `/issue` 只能瀏覽，bind、unbind、sync 未實作（`obw/README.md:11-14`）。當初擋住提交的是 OMP 型別宣告的三個錯誤，只在 17.3.4 與 18.10.2 檢查過，18.13.3 未驗證。
- OMP agent frontmatter 會靜默忽略 `effort:`，要寫成 `thinkingLevel:`（OMP `helpers.ts:293-299`）。套件 `agents/` 按名稱去重，同名 agent 會互相遮蔽（`discovery.ts:97-128`）。
- `ask.timeout` 逾時會自動選 recommended（OMP `settings-schema.ts:1942-1949`），與 method「空白不算同意」的規則衝突。
- 未驗證：背景 async job 完成時能否喚醒已結束回合的 session；單次派工能否覆寫 effort。
- `~/.omp/plugins/node_modules` 裡 fizzy 與 omp-quota 的連結已斷，`omp plugin doctor` 沒有回報。

## 2. 已決事項

使用者在 2026-10-29 決定下列事項：

1. omp 跟隨 cc，以 `method` 取代 `cf` 與 `spiral`。
2. method 的巢狀派工在 OMP 用 `task` 遞迴，不移植 muster。
3. 新 plugin 只移植 audit 與 zen-agent。flashcards、games、calendar 延後；muster、mermaid-inline 不移植。
4. obw 暫存的雙宿主變更先單獨落地，再開始翻修。
5. obw 移除 ADR 功能，交給 adr plugin。
6. 刪除已停用的 pi-dispatch。
7. 每個 plugin 記錄對應的 cc-plugins commit（見 §4）。
8. obw 的檢查改釘 OMP 18.13.3 與 pi 1.4.0；OMP typecheck 只對 omp 目標開 `skipLibCheck`。理由見 `obw/docs/dual-host-plan.md` §9。

## 3. 里程碑

每個里程碑只有一個可觀察的結果。完成條件一律包含在真實 omp session 裡跑過一次，不只跑測試；非互動的 session 用 `omp -p --no-session "<prompt>"`。

Repo 的 pre-commit 會對每個 commit 跑 `bun run --cwd obw check`。新的 worktree 沒有 `obw/node_modules`，第一次 commit 前要先跑 `cd obw && bun install --frozen-lockfile`。

- **M0　obw 雙宿主變更落地。** 已完成。
- **M1　安全與資料錯寫修正。** 已完成。修 agent-browser 的憑證建議、obw jot 的 `vault=`、obw wikilink JSON 陣列、viz 兩個 feedback bug。完成條件是每項各有一個先紅後綠的測試或可重跑的檢查。
- **M2　method 骨架在 OMP 跑通。** 已完成。以 `omp plugin link --local` 安裝後，在真實 `omp -p --no-session` 裡把一個問題收斂成 `contracts.json`，`check-contracts.sh` 通過。移植 SKILL.md、narrow.md 與 review、divergence、probe、prototype 四個 agent，以 `task` 派出並用 inline `ask`。viz 決策頁、背景喚醒、gate 與巢狀派工先用 stub。完成條件是在 omp session 裡把一個問題收斂成 `contracts.json`。
- **M3　method 補上 gate。** 已完成。四個腳本與 cc `b4555826` 逐位元組相同。移植 `check-contracts.sh`、`scope-gate.sh`、`revert-gate.sh`、`add-repros.sh` 與其測試。
- **M4　method 補上決策頁。** 已完成，背景喚醒也一併移植：OMP 的 `async: true` bash 工作完成時會替閒置的 session 開新回合，等待要用 `timeout: 0`。未處理：使用者在終端機回答、agent 寫回 brief 時，若同時有頁面儲存，兩者會互相覆蓋。接上 viz，帶走 `spiral/tests/render-decision.test.sh` 的 semver fixture。依賴 M7。
- **M5　刪除 cf、spiral、pi-dispatch 並改接手方。** 已完成。刪目錄、`omp plugin unlink`，把 diagnose（含兩個測試）、deepen、spec、README 的 `/cf`、`/spiral` 改成交回主 session。完成條件是 `grep -rn '/cf\|spiral\|context-flow'` 在 repo 內沒有殘留。
- **M6　文字層同步。** 已完成。apple-podcasts 檢查音訊網址時改用 `curl -sIL`，因為 OMP `read` 不給狀態碼且會下載整個音訊。spec 沒有在 M6 同步，改由 M14 處理。adr、wizard、spec、deepen（`docs/decisions/`、Design Vocabulary）、diagnose（Phase 5、`set -e`、`format-patch`）、apple-podcasts。
- **M7　viz 換成 Pele 與 Flexoki。** 已完成。
- **M8　hook-guard 重建。** 已完成。依 cc 版補回 `pre-commit-checks.md` 與 hook 腳本。
- **M9　obw 追上 cc。** 已完成。drift 報告 `drift-viz-obw-spec.md` 的其餘 obw (a) 項目由 M13 處理。pm 工具、ADR 移除、dashboard 範本、刪除 `obw/viz.ts`。
- **M10　obw 的 OMP 端 bind／sync。** 已完成，並在真實 OMP 與 Obsidian 上驗收一次（`obw/docs/dual-host-plan.md` §8）。OMP 沒有「使用者訊息已存、請求未送」的事件，使用者決定 OMP 的工作開始改在 `message_end` 記錄，可能晚於請求開始。延續 `dual-host-plan.md` §8 未完成的部分。
- **M11　移植 audit。** 已完成。
- **M12　移植 zen-agent。** 已完成。2026-10-29 在真實 OMP 上觀測到，PTY 模式的 bash 沒有 `AGENT=1`，非 PTY 才有（OMP `src/tools/bash-interactive.ts:35-41`、`src/exec/non-interactive-env.ts:32`）。所以從 PTY 呼叫的 `open URL` 不會轉給 zen-agent（`zen-agent/bin/open:9`）。完成後讓 agent-browser 把可見瀏覽器交給它。
- **M13　obw skill 與範本的剩餘項目。** 已完成。第 7 項（舊版遷移檢查拆到參考檔）仍待處理。drift 報告 obw 第 2、6、8、9、10、11、15、27 項。第 20 項（`/issue` 的篩選與排序鍵）屬可選的 UX，延後。
- **M14　spec 同步。** 已完成。「check 要先在違規版本上變紅」規則、verdict 來自檔案的範例、glossary 觸發語。
- **M15　agent-browser 補齊上游。** 已完成。移植 cc `83238191`、`2e11b620`，並補完 `f1ac52c3` 刪掉的 `references/commands.md`。與 cc `b4555826` 的 skills 只差 `allowed-tools`，因為 OMP 不以它預先核准指令（`src/discovery/agent-plugin-format.ts:94,155-157`）。

執行順序是 M0、M1、M5、M2、M3、M4；其餘彼此獨立，可平行。M5 提到 M2 之前有兩個理由：cc 的交接對象是主 session，不依賴 method；OMP 依名稱去重 agent，先載入者勝（OMP 18.13.3 `src/task/discovery.ts:157-161`），spiral 的 divergence、probe、prototype 會遮住 method 的同名 agent。M4 要的 semver fixture 用 `git show dadb051:spiral/tests/render-decision.test.sh` 取回。

## 4. 防止再度漂移

每個 plugin 的 `package.json` 記下對應的 cc-plugins commit，例如 `"omp": { "upstream": "b4555826" }`。下次同步只要對每個 plugin 跑 `git -C ../cc-plugins log <upstream>..HEAD -- <dir>`。每個里程碑完成時，順手把它碰過的 plugin 的 `upstream` 更新為當時對照的 cc commit。OMP 接受 `omp` 物件裡的自訂欄位：每個 plugin 都記下 `upstream` 後，`omp plugin doctor` 回報 0 個錯誤。

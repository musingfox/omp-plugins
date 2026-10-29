# OBW 雙宿主 extension 規劃

本規劃在既有 `obw` package 中新增 pi 支援，保留 OMP 使用方式。第一版提供任務瀏覽、session 綁定與明確同步；任務管理資料仍以 Obsidian vault 為準。

使用者已批准 pi／OMP 都以 `/obw-sync` 同步呼叫時的已完成回覆快照，不要求自動最終結果回寫。使用者也已批准 repo-local hooks 與專用測試 project。OMP 的正式型別問題尚未解決；使用者已批准先實作 pi。Pi 的 source gate、持久化 fixture 與真實 CLI 同步、正常模型 lifecycle、真 PTY 導航與綁定確認均已通過獨立 review。OMP adapter 已在 2026-10-29 實作 binding、開始記錄與 `/obw-sync`。OMP 的開始記錄依使用者決定改用 `message_end`，可能晚於 model request 開始（§3.4、§9）；這些只有單元、官方 loader fixture 與假 provider 的真實 session 收據，沒有真實 OMP／Obsidian 驗收；跨宿主 A10 尚未完成，見 §8 與 §9。完成範圍與驗收 checkpoint 見 §8；驗收紀錄製作時，實作仍是未提交的 workspace 變更，不是調查基準 commit 的既有功能；後續 Git 狀態以實際 HEAD 與工作目錄為準。

## 1. 基準與來源

實作位置是 `musingfox/omp-plugins` 的 `obw/`。調查基準 commit 是 `dadb05132c7a687645c7d2d92bc77a3cd084a33d`。行為參考是 `musingfox/cc-plugins` 的 `obsidian-workspace/`，基準 commit 是 `c9871a1767ae2a7389c7e54d310f4ef4d5921a54`。

下列來源可在新 session 直接查閱，不依賴調查暫存檔：

- [現有 OMP 入口與測試](https://github.com/musingfox/omp-plugins/tree/dadb05132c7a687645c7d2d92bc77a3cd084a33d/obw)。本地入口是 `obw/index.ts`；`obw/index.test.ts` 使用 Bun，`obw/tests/run.sh` 執行既有 shell tests。
- [CC 任務操作契約](https://github.com/musingfox/cc-plugins/blob/c9871a1767ae2a7389c7e54d310f4ef4d5921a54/obsidian-workspace/skills/pm/SKILL.md)。資料格式、關係與安全要求見第 14–83、122–127 行。
- [CC 任務介面與綁定](https://github.com/musingfox/cc-plugins/blob/c9871a1767ae2a7389c7e54d310f4ef4d5921a54/obsidian-workspace/hooks/register.ts)。Bind／Unbind 見第 180–192 行；狀態更新後的自動綁定見第 329–343 行。
- [CC 回寫](https://github.com/musingfox/cc-plugins/blob/c9871a1767ae2a7389c7e54d310f4ef4d5921a54/obsidian-workspace/hooks/writeback.sh)。事件內容見第 35–55 行；Obsidian eval 與讀回驗證見第 60–110 行。
- [pi 1.1.0 官方型別](https://unpkg.com/@earendil-works/pi-coding-agent@1.1.0/dist/core/extensions/types.d.ts)與[extension 文件](https://unpkg.com/@earendil-works/pi-coding-agent@1.1.0/docs/extensions.md)。`ui.custom` 見型別第 121 行；`agent_settled` 見第 778、1187 行。
- [OMP 17.3.4 官方型別](https://unpkg.com/@oh-my-pi/pi-coding-agent@17.3.4/dist/types/extensibility/extensions/types.d.ts)。`ui.custom` 見第 176 行；`session_stop` 註冊見第 806 行。停止與續跑行為須對照同版本的 `src/session/agent-session.ts` 第 2990–3038、3393 行起。
- [Obsidian CLI 官方文件](https://help.obsidian.md/cli)。另可查閱 [kepano 的 CLI skill](https://github.com/kepano/obsidian-skills/blob/a1dc48e68138490d522c04cbf5822214c6eb1202/skills/obsidian-cli/SKILL.md)。實作前核對實際 CLI 輸出，不根據名稱猜語義。

本機調查版本是 pi 1.1.0、OMP 17.3.4。這是第一版驗收版本，不宣稱相容所有歷史或未來版本。

## 2. 第一版範圍

第一版必須提供以下行為：

1. `/issue` 從 `.obsidian.yaml` 指定的 project dashboard 顯示任務，預設使用 All Tasks。
2. 使用者可切換 view、開啟卡片、返回列表及退出介面。
3. 卡片顯示 title、status、priority、Acceptance Criteria 與關係連結。
4. 使用者可明確 Bind／Unbind 目前 session 與卡片。
5. 綁定 session 開始工作時記錄「工作中」。
6. 使用者呼叫 `/obw-sync` 時，extension 將當下已完成回覆的摘要與必要全文連結寫回任務卡。
7. extension 讀回寫入結果；失敗時顯示警告，不能宣稱成功。
8. 未綁定的 session 不寫入 vault。

本版不新增任務資料庫，不整合 `cf`，不自動把任務改為 done，不自動 archive。保留既有 obw-init、obw-jot、obw-pm 的 OMP 行為，不重寫 PM engine。

本版先不實作自動結果回寫、CC 版的 Bash 字串解析式自動綁定、permission event 回寫、Mermaid 新功能、手機 launcher 或 RPC 卡片 UI。現有 Mermaid 功能不在此次修改中移除。需要等待使用者批准時，第一版不保證自動記錄「需要核准」。

明確操作的入口是 `/issue`、`/obw-bind <vault-relative task path>`、`/obw-unbind` 與 `/obw-sync`。卡片 UI 提供 Bind／Unbind 操作；獨立 commands 使用同一份核心。綁定不會擅自變更 task status。

## 3. 行為契約

### 3.1 設定與讀取

輸入是 command args、宿主 cwd 與 `.obsidian.yaml` 的 vault／pm.project。設定可從 cwd 向父目錄尋找，選擇最近的一份；不得推測 vault。找不到設定或缺少必要欄位時，顯示可操作的錯誤，不呼叫 vault CLI。

Vault I/O 一律使用 `obsidian` CLI，vault-root-relative targeting 使用 `path=`。設定與 package 資源可以讀 filesystem，vault 不可以繞過 CLI。CLI 非零退出、timeout、錯誤文字或不合法輸出，都必須被辨識為失敗。

卡片路徑須屬於設定 project 的任務目錄，包括 archive，並拒絕 traversal、絕對路徑與控制字元。其他類型的關係目標只可作唯讀導覽，不能因此綁定為任務。

同一 UI 同時發出的請求採最新請求有效；已退出的 UI 不得接收延遲結果。顯示空列表與 CLI 失敗是不同結果。

### 3.2 資料與綁定

Vault 保留現有 task schema 與 Bases dashboards。檔案路徑是任務 handle；不新增 issue ID，不改名既有任務，不重寫使用者模板。`session` 欄位與 `## Agent` 記錄採 CC 版的用途，但只在使用者明確綁定後按需建立。

Binding 至少包含 host、session ID、vault、project、cardPath。宿主提供 session ID，extension 不自行產生替代 ID。

Binding 狀態使用宿主的持久化 session entries。還原時只讀 active branch；Unbind 寫入解除事件，不刪 session 歷史。Binding 不要求沿用 `~/.claude-mobile/launches`，第一版不改動該目錄。

Bind 先讀回確認卡片存在。若卡片 `session` 指向另一個 session，先取得明確替換批准；不得靜默覆寫。單一 session 同時只綁定一張卡。Unbind 不清除歷史 Agent 記錄，也不把任務改回 todo。

分支切換、session replacement 與重新載入必須還原正確 binding，不能把舊 context 的回覆寫到新 session 的卡片。

### 3.3 回寫

輸入是已確認的 binding 與明確的同步請求。輸出是附有讀回結果的成功收據，或可見的失敗。回寫不影響 task 的 status、priority、relations 或 archive 位置。

綁定 session 開始工作時記錄時間與「工作中」，automatic continuation 不重複記錄同一輪開始。OMP 的記錄時點依 §9 的使用者決定，是該輪 user message 的寫入排入佇列之後，可能晚於 model request 開始，見 §3.4。明確同步時記錄回覆第一個非空行；多行全文附加到 `pm/{project}/runs/{card}.md`，卡片附全文連結。保留使用者正文；Agent 記錄只能附加，不能重寫 Notes 或 Acceptance Criteria。

開始記錄與回覆快照必須有可持久化的去重識別，使用真實 session message entry ID，不只用回覆文字或時間作 key。重複同步、reload 與同一訊息的恢復通知不得重複附加。單一 session 的回寫採序列執行；partial-write 的去重狀態須能由 vault 讀回查明。

只有摘要及必要全文均讀回吻合，才記錄事件完成。部分成功時保留可查明的狀態，不盲目重跑 append。第一版不宣稱跨 session 寫入具有交易式原子性；遇到 binding 衝突應停止回寫並警告。

### 3.4 宿主差異

共用核心不 import pi／OMP runtime。宿主入口使用自己的官方型別，不使用 union host API 加上 `any` 或猜測性的 fallback。

`exec`、command registration 與 custom UI 的所需形式可共用；各入口負責提供相符的轉接。TUI 元件只依賴 render、input、requestRender 等實際使用的能力，不共享不同宿主的 runtime class instance。

Pi 有 `agent_settled`，但 OMP 17.3.4 沒有等價的 extension 穩定結果通知。`session_stop` 仍容許 hook continuation，`agent_end` 的 `willContinue` 未設也不足以證明工作佇列已清空。證據見 OMP 17.3.4 的 `src/session/agent-session.ts:2735–2743,2990–3038,708–719` 與 `src/session/queued-messages.ts:27–30`。第一版兩個入口都不註冊自動結果回寫，不用固定延遲猜測完成。

使用者已批准 `/obw-sync` 快照契約。Pi command 使用真正的 `waitForIdle()`，等待放在共用 mutation queue 外；否則 run 等待 context 的開始記錄時會互相等待。進入 queue 後若又變 busy，拒絕而不再等待。這只是明確同步的前置檢查，不宣稱是完整穩定邊界，實作見 `obw/writeback.ts:140–159`。快照必須是 active branch 本輪最新 assistant message，且 stopReason 為 stop、沒有 errorMessage、toolCall，並包含非空文字。沒有合格的本輪回覆時拒絕同步，不回退挑選歷史成功答案。

Pi 的 `context` observer 使用本輪真 user entry ID 記錄開始，不修改 model messages；同 ID 的 retry／tool continuation 採去重。開始記錄前驗證該 user 已在磁碟；Sync 則驗證捕捉的 user／assistant 都已持久化，不以任何舊訊息存在代替來源證明。實作見 `obw/pi.ts:33–53`、`obw/session.ts` 的 `hasPersistedSource`。

OMP 18.13.3 的 adapter 在 `obw/index.ts`，與 Pi 共用同一份核心，binding 的 host 寫為 `omp`（`obw/session.ts:125`）。下列 OMP 差異已依原始碼確認，adapter 對每項都採 fail closed：

- OMP 在一輪的第一次 provider request 前觸發 `context` 時，該輪的 user message 還沒寫入 session。Agent loop 先把 prompt 留在 `turnMessages`（`pi-agent-core/src/agent-loop.ts:1350–1351`），經 `syncContextBeforeModelCall`（`:1366`）與 `prepareProviderCall` → `transformContext`（`:1395`、`:1957`）觸發 `context`；直到 `:1447–1451` 才以 `emitInputMessages` 送出該 prompt 的 `message_end`，而這是寫入它的唯一觸發（`src/session/agent-session.ts:4561–4563` → `4008–4020`）。所以 OMP 沒有「user 已寫入且 request 尚未開始」的 hook；`before_provider_request`（`src/sdk.ts:4474–4476`）不帶 messages，且只在 provider 呼叫 `onPayload` 時觸發。
- 因此 OMP 改由 extension 的 `message_end` 記錄開始，這是 §9 的使用者決定。Session 先把 user 的寫入排入佇列（`agent-session.ts:4561–4563`），之後才通知 extension（`:3850–3859`、`:4615`），但沒有等寫入完成。Handler 只處理非 steering、非 synthetic 的 user message（`obw/index.ts:74`），在 branch 上以 timestamp 找到該 entry 後才記錄。最多等 2 秒（`obw/index.ts:16,78–83`），找不到時警告並不寫 vault。等待前先記下失效計數，等待中若 session、branch、input 或 binding 變更，就拒絕記錄（`obw/index.ts:75,85`），與 `/obw-bind` 的做法相同（`obw/index.ts:104`）；核心只在呼叫當下取自己的 revision，看不到等待中的變更。之後仍由核心驗證它是 branch 最新的 user、已在磁碟、binding 與 branch 未變，並以同 ID 去重。Agent loop 不等這個 handler，所以記錄可能晚於 model request 開始。真實 session 測試中拿掉這段等待，文字回合就記錄不到開始，可見 handler 執行時寫入確實常常尚未完成。
- OMP 不再註冊 `context` observer（`obw/tools/omp-registration.mjs` 禁止它），一輪不會記錄兩次，一般回合也不再出現舊的拒絕警告。
- OMP 的 auto-continue prompt 是 `synthetic: true` 的 developer message，不是 user message（`src/session/agent-session.ts:5478–5487`），handler 只看 user message，所以它不記錄開始。
- OMP 對 extension handler 設 30 秒上限（`src/extensibility/extensions/runner.ts:133`）。逾時後 handler 的 vault 寫入仍會繼續並讀回驗證，但 OMP 不再等它。Pi 沒有此上限的證據。
- Pi 的 `session_before_fork` 在 OMP 沒有同名事件。OMP 以 `session_before_switch`／`session_switch`、`session_before_branch`／`session_branch`、`session_before_tree`／`session_tree` 表示切換、分支與 tree 導航（`src/extensibility/shared-events.ts:35–75,137–157`）。Adapter 在 before 事件與 `session_shutdown` 使請求失效，在 `session_start` 與三個完成事件使請求失效並還原 binding（`obw/index.ts:91–99`）。
- OMP 的 `hasUI` 只在沒有 UI context 時為 false（`src/extensibility/extensions/runner.ts:1027–1029`）。一般 RPC 會設定 RPC UI context（`src/modes/rpc/rpc-mode.ts:1706`），`/obw-bind` 的替換批准會送到 RPC client，與 Pi 相同。`--no-ui` 與 print／JSON 模式不設 UI context（`src/modes/print-mode.ts:174–185`），這時遇到另一 session 的卡片直接拒絕。
- 新 session 在第一個 assistant message 前不寫檔（`src/session/session-manager.ts:1858–1865`）。Pi 的同一限制見 `obw/session.ts:34` 的註解與 `obw/session.ts:113` 的錯誤訊息，本次沒有重讀 Pi 原始碼；在此之前 Bind、開始記錄與 Sync 都因缺持久化證據而拒絕。

同步前後重驗 session ID、active branch、binding 與快照識別。等待期間的新輸入、branch／session 切換、Unbind 或重新綁定會使舊請求失效。已開始的 I/O 不宣稱可撤回，但不能繼續用失效 binding 寫下一份資料。

只有 TUI 模式可開 custom UI。RPC、JSON、print 必須明確回報不支援互動式 `/issue`，不得因為 `hasUI` 為 true 就開終端元件，也不得回報 UI 成功。文字輸出的實際通道須依宿主文件確認。

## 4. 最小實作結構

預期在 `obw/` 增加 `pi.ts`，保留 `index.ts` 為 OMP 入口。兩個入口使用共用功能模組；先抽出實際需要的邏輯，不預建通用 framework、event bus 或 storage abstraction。

共用核心目前是 `workspace.ts`、`issue.ts`、`session.ts` 與 `writeback.ts`；入口是 `pi.ts` 與 `index.ts`。核心不 import 宿主 runtime，兩個入口各用正式 SDK 與 TUI。

`package.json` 保留 `omp.extensions`，新增明確的 `pi.extensions`。Pi 若需要載入既有 skills，必須在 pi manifest 中列出，不能新增只有 extensions 的 manifest 後意外失去 skills discovery。

Pi 的 markdown slash commands 使用 prompts；可映射 `commands/*.md`，但 OMP 的 `skill://` 或 `skill:/` 引用不能直接當成 pi 語法。先盤點引用與工具依賴；未完成適配的 commands 不宣稱相容。共用 extension 的完成不代表全部 PM skills 已移植。

## 5. 驗收先於實作

以下每项精確契約都要有可重跑的測試。單元測試允許 stub；雙宿主完成必須有真實宿主與真實 Obsidian 的端到端收據。

| ID | 檢查 | 預期結果 |
|---|---|---|
| A1 | pi／OMP 依自己的 manifest 載入 package。 | 各註冊一次 `/issue`，沒有 extension loading error。 |
| A2 | 缺設定、CLI timeout、malformed output、空列表。 | 各自呈現正確結果；缺設定不呼叫 vault CLI。 |
| A3 | 切 view、開卡片、返回、退出、延遲結果。 | 導覽正確，舊請求與已關閉 UI 不更新畫面。 |
| A4 | Bind、Unbind、reload、branch／session 切換。 | Binding 還原正確；未綁定與舊 session 不寫 vault。 |
| A5 | 另一 session 已綁定卡片。 | 未批准替換時不覆寫 session 欄位。 |
| A6 | 開始工作、明確同步、重複同步、automatic continuation。 | 同一輪工作開始及同一快照各寫一次；未呼叫同步就不寫結果；error、abort、toolCall 或歷史回覆不冒充本輪快照。 |
| A7 | 回寫中文、多行、引號、反斜線與 wikilink。 | 摘要與全文讀回吻合，原有正文及 task 狀態不變。 |
| A8 | 摘要或全文部分寫入失敗。 | 警告可見，沒有成功收據，重試不重複 append。 |
| A9 | RPC、JSON、print 執行 `/issue`。 | 不開 custom UI，回報模式限制。 |
| A10 | 真實 pi 與 OMP 使用同一測試 task。 | 兩邊分別完成瀏覽、綁定、回寫、讀回確認；無其他 session 同時綁定測試卡。 |

既有回歸檢查是 `bun test obw/index.test.ts` 與 `bash obw/tests/run.sh`。新增測試須納入可重跑的 package 指令。每次修改 source 後檢查 touched files 的 lint／typecheck，兩個入口分別對正式宿主型別檢查。

Live 測試先取得使用者批准的 vault／project／測試卡。僅允許操作該測試卡與其 runs note；archive、delete、改動其他任務與清理測試資料需要另行批准。載入測試使用臨時 extension／local package invocation，不變更使用者的持久化 agent 設定。

## 6. 原子實作步驟

本次先交付 pi 的 A1–A9 與真實 pi／Obsidian 驗收；OMP 暫保留現有瀏覽功能。抽出的核心不能依賴宿主，供後續 OMP adapter 使用，但本次不增加 OMP binding／sync 的完成承諾。Pi manifest 不自動暴露尚未適配的 OMP skills／commands。既有 aggregate check 與 hook 保持不變，不隱藏 OMP 的型別錯誤。

按順序完成；括號中的平行標記只適用獨立唯讀調查，不允許同一 checkout 多個 writer。

1. 確認 OMP 的事件限制。此步已完成；使用者批准以雙宿主明確同步取代自動最終回寫。
2. 定義兩個宿主的載入與 typecheck 指令。完成條件是針對正式型別的可重跑檢查。（可與步驟 1 平行調查）
3. 執行既有 OBW 測試。完成條件是保存基準結果；原有失敗另行處理，不混入本次功能。
4. 建立 A2–A9 的契約測試。完成條件是測試在缺少新能力時正確失敗。
5. 抽出現有讀取與 TUI 共用邏輯。完成條件是現有 OMP 行為通過回歸檢查。
6. 新增 pi 入口與雙 manifest。完成條件是兩個真實宿主通過 A1。
7. 實作明確 binding。完成條件是 A4、A5 通過。
8. 實作回寫與去重。完成條件是 A6–A8 通過。
9. 執行 pi live 驗收。此步已完成批准範圍內的 CLI、模型與 PTY 驗收；不能代替尚未完成的雙宿主 A10。
10. 更新使用文件。README 必須區分 Pi extension、OMP skills／瀏覽，以及尚未適配的部分。

若後續要求自動最終回寫，須重新确认範圍與宿主保證；不要把快照同步改成 timer 或 agent_end 自動回寫。

## 7. 權限與阻擋

- 使用者已批准 vault `obsidian` 的專用 project `obw-dual-host-test`。允許建立該 project 的 dashboard、`tasks/dual-host-smoke.md` 與對應 runs note，允許測試卡跨宿主重新綁定。不允許刪除、archive 或修改其他任務。我已透過 CLI 建立 `pm/obw-dual-host-test/dashboard.base` 與 `pm/obw-dual-host-test/tasks/dual-host-smoke.md`，逐檔讀回內容相等。真實 All Tasks query 返回該卡的扁平 JSON row，status 是 todo，priority 是 medium。驗收卡保留三項未勾選 criteria，Notes 包含中文、引號、反斜線與 wikilink；後續驗收不能更改這些原文。Runs note 已在批准的同步驗收中建立；目前留存內容見 §8。
- Repo-local `.githooks` 已建立，此 repo 的 `core.hooksPath=.githooks` 已套用；`git config --local --show-origin --get core.hooksPath` 回傳 `file:.git/config .githooks`。Pre-commit 執行 `bun run --cwd obw check`。Commit-msg 轉呼叫全域 Conventional Commits hook，合法 subject 實測 exit 0，非法 subject 實測 exit 1；循環與缺失檢查見 `obw/tools/commit-msg.test.mjs`。未修改全域 hooks 或 agent 設定。
- 工具已建立於 `obw/tools/`，版本以 `obw/package.json` 與 lockfile 為準。使用者已批准 Node／Bun 分開檢查：pi source 使用 pi 官方 development dependency 對應的 Node types 22.19.19；Bun tools／core 使用獨立 Node types 26.6.5 alias。正式 pi SDK minimal probe 已通過，listFiles 沒有 Bun globals 或 host nested Node26。設定來源與範圍見 `obw/tools/typecheck-config.mjs`；不使用 skipLibCheck、fake declarations 或另一份宿主 runtime。實際 TUI import 使用 installed package 的正式 exports.types；pi-tui 1.1.0 沒有 exports 欄位，使用其正式 top-level types。Pi 入口與 manifest 已建立，見 `obw/pi.ts`、`obw/package.json`。Pi manifest 明確列空 skills／prompts，沒有移植 OMP markdown commands。正式 loader 與 Pi source gate 已核對；tools 使用 checkJs，不能稱為 strict source 檢查。
- Pi／core touched lint、strict typecheck、tools checkJs、正式雙 loader 與受影響的契約測試均有通過收據。這些是分層檢查，沒有以最新的完整 aggregate 執行宣稱全包通過。OMP declarations 仍阻擋 `check`／pre-commit；不修改 host、不使用 skipLibCheck、不抑制診斷、不 bypass hook。
- OMP 正式 declaration 檢查另外發現三個上游錯誤：`@oh-my-pi/pi-catalog@17.3.4/dist/types/models.d.ts:1` 引用缺失的 `./models.json`（TS2307）；`@oh-my-pi/pi-coding-agent@17.3.4/dist/types/extensibility/custom-tools/wrapper.d.ts:18` 的 execute context 與 AgentTool 不相容（TS2416）；`@oh-my-pi/pi-mnemopi@17.3.4/dist/types/core/embeddings.d.ts:1` 引用未安裝的 optional peer fastembed（TS2307）。來源是該版本 published declarations／package manifests，未改動 installed host 或抑制診斷。
- Subagent 首次執行 `bun test obw/index.test.ts`，得到 4 pass／0 fail／9 expects；首次執行 `bash obw/tests/run.sh`，relations、migration、publish、warrant、templates 全部輸出 ok。這些是基準／fixture 測試，不是雙宿主驗收。
- OMP 沒有等價的自動穩定結果事件，使用者已批准雙宿主明確同步，詳見 §3.4。此項不再阻擋第一版，但自動結果回寫仍在範圍外。

### 官方修正版查證

使用者批准先查官方修正版，不批准直接更新使用中的 OMP。查證時以 pi-web-access 取得 [npm dist-tags](https://registry.npmjs.org/-/package/@oh-my-pi%2fpi-coding-agent/dist-tags) 與 [官方最新 release](https://api.github.com/repos/can1357/oh-my-pi/releases/latest)，補取前的實測 UTC 為 `2026-10-12T17:47:32Z`。兩者在該次查證確認穩定候選為 [OMP 18.10.2](https://github.com/can1357/oh-my-pi/releases/tag/v18.10.2)。

Subagent 在 repo 外的新隔離目錄，用 Bun 安裝官方精確版本，使用 TypeScript 5.9.3、Bun types 1.4.3，只 import 官方 package-root ExtensionAPI，執行 strict／noEmit／不使用 skipLibCheck 的檢查。第一次執行 exit 2；研究原因後停止，沒有遍歷其他版本或 patch declarations。

三個原有錯誤仍存在，來源可直接查 published artifacts：

- [catalog models.d.ts](https://unpkg.com/@oh-my-pi/pi-catalog@18.10.2/dist/types/models.d.ts) 第 1 行仍引用 dist/types 中缺失的 models.json（TS2307）。同檔第 5 行另產生 TS2677。
- [CustomToolAdapter wrapper.d.ts](https://unpkg.com/@oh-my-pi/pi-coding-agent@18.10.2/dist/types/extensibility/custom-tools/wrapper.d.ts) 第 18 行仍使用較窄的 CustomToolContext，與 AgentToolContext 不相容（TS2416）。
- [mnemopi embeddings.d.ts](https://unpkg.com/@oh-my-pi/pi-mnemopi@18.10.2/dist/types/core/embeddings.d.ts) 第 1 行仍無條件 import fastembed；[manifest](https://unpkg.com/@oh-my-pi/pi-mnemopi@18.10.2/package.json) 將它列為 optional peer，正常隔離安裝沒有此模組（TS2307）。

此外，該次依賴解析得到 transformers 4.3.1，`Lfm2VlImageProcessor._call` 與 `MgpstrProcessor.batch_decode` 另有兩個 TS2416。檢查共六個頂層診斷；這是公開 declaration graph 的結果，不是 OBW runtime 故障的證據。

隔離安裝沒有省略 optional dependencies，但 Bun 封鎖 onnxruntime-node 與 protobufjs 的 postinstall。沒有信任或執行這些 scripts；只驗證型別，不宣稱該隔離副本 runtime ready。使用中的 OMP 仍是 17.3.4，未修改 host、repo 設定或 vault。

結論是不為這三個型別問題建議升級到 18.10.2。此次只驗最新穩定候選，不宣稱所有歷史版本都不可用。

Pi-first 實作與批准範圍內的 Pi 驗收已完成。不升級或修補 OMP，不抑制 declarations diagnostics。Pre-commit 保持啟用；Pi 驗收完成時尚未 stage、commit 或 push，後續提交仍不得 bypass hook。後續 OMP writeback adapter 與 A10 仍須完成，不能以 Pi 收據宣稱完整雙宿主支援。

## 8. 驗收紀錄

以下是 2026-10-13 留存 checkpoint 的觀測事實；不宣稱 vault 日後永遠維持此狀態。各層皆由獨立 reviewer 核對正式 runtime、來源 IDs、實際回覆通道及讀回內容，沒有以 exit 0 代替效果驗證。暫存 harness／收據不是本文件的依賴，必要結果記在此處。

### 已完成的層次

- Source gate 驗證共用核心、正式 Pi adapter、inline replacement approval 與 queue／idle wait-cycle 修正。最後一次受影響檢查有 18 個 writeback 加 8 個 session tests，共 26 pass／0 fail／132 expects；adapter 有 17 個 fixture 情境。這是受影響子集，不是全包 test 數量。契約來源見 `obw/writeback.test.ts`、`obw/session.test.ts` 與 `obw/tools/pi-adapter-worker.mjs`。
- 正式 Pi／OMP loader 各註冊一次 `/issue`。Pi headless dispatcher 在 registration gate 後驗證 print／JSON stderr、RPC notifications 與拒絕路徑，有 4 pass／50 expects；沒有用未註冊 slash command 作 baseline red。入口與檢查來源見 `obw/pi.ts`、`obw/index.ts`、`obw/tools/pi-command.test.mjs`。
- Layer1 使用正式 Pi dispatcher、SDK 生成的持久化 fixture IDs 與真 Obsidian CLI。Bind、Sync、同 ID 去重、reload、Unbind、branch 還原及 session file reopen 都有讀回收據。Unbind 不改 vault。內容明標手動 fixture，不算模型 lifecycle；多次同步只留一筆結果。
- Layer2 使用 `openai/gpt-6.1-sol/openai-responses` 的一個正常模型 turn。User `af51b310`、assistant `ac1c1efa`；stopReason 是 stop，rawStopReason 是 completed。開始收據 `3bbee4fa` 早於 assistant-start。模型 settled 後、explicit Sync 前，runs bytes 不變，卡片只新增工作中；明確 `/obw-sync` 才以真 assistant ID 寫結果，收據是 `158e9756`。兩行中文、引號、wikilink、反斜線的摘要與全文精確讀回，同 ID 重複同步不改 bytes。
- 真 tmux／正式 Pi `InteractiveMode` 完成唯讀導航。10 個 input 批次與 9 張 transition screens 證明 All Tasks、project-scoped Views、Active、canonical testcard、開卡、Back、重入及 Escape 返回 host editor。Card 的 AC 是 0/3，criteria／Notes 可見；session 與三份 CLI snapshots 完全一致。選卡使用 canonical path，不要求 query row 一定有 title。
- 真 PTY 綁定有三個必要 lifecycle、32 個 input 批次與 31 張 accepted screens。同 owner Bind 得持久化 entry `865159c2`；aux 的 n／pending Escape 都不改 vault 或 startup 後的 session baseline；重新進卡、fresh approval、明確 y 得 `0e1fb437`。原 session 再明確 y 還原 owner，得 `de4cf6b3`。Screen、CLI owner 與磁碟 entries 相符。所有 pane 正常退出，專用 server 已清理。

Live fixture 與正常模型測試只寫批准的 task／runs；所有 vault I/O 都使用 Obsidian CLI。Task status、priority、relations、三項 criteria、Notes 原文與 dashboard 保持。先前失敗的是 repo 外 harness 的 import／getter、PTY capture、tmux diagnostics、cleanup 或 row-label predicate；失敗收據保留，後續成功不覆蓋歷史。Production source 沒有因這些 harness 問題修改。

### 留存狀態

- Vault 是 `obsidian`，project 是 `obw-dual-host-test`。卡片是 `pm/obw-dual-host-test/tasks/dual-host-smoke.md`，runs 是 `pm/obw-dual-host-test/runs/dual-host-smoke.md`。
- 這一段記的是 2026-10-13 的狀態。當時 owner 是原 Pi SID `01a13569-ffaa-7115-a3f8-22e398c55825`；同原 session file 的 active leaf 是 `de4cf6b3`，bound。Primary 只在 PTY Bind 階段新增兩筆 binding entries，舊 source message IDs 保持。之後 owner 的變化見下面兩段 2026-10-29 驗收。
- 2026-10-13 時卡片留三個 Agent blocks：一筆手動 fixture 結果、一筆正常模型工作的開始、一筆正常模型結果。Runs 留兩筆全文。沒有刪除或清理測試資料。
- Aux SID `01a135d2-76a0-73b3-bcdd-9b61b10ee8d2` 的 scratch 歷史保留曾綁定的 marker，但不是卡片最後的 owner。SDK 自然補入的 thinking metadata `a8320070` 已取得批准；拒絕／Exit 比較使用 startup 後 baseline，不把它算作模型回合或 Bind 效果。

### OMP 驗收（2026-10-29）

使用者批准後，在正式 OMP 18.13.3、真 Obsidian CLI 與 `@smol` 模型上跑了一次，程式是 `01bb35c` 的版本。OMP 用隔離的 agent 目錄，session 檔沒有寫進使用者的 `~/.omp/agent/sessions`。Session 是 `01a186cd-852d-73c6-b0a2-c054bd00aed2`。

- 第一則回覆寫入前執行 `/obw-bind`，被拒絕，原因是還沒有 session 檔；vault 不變。
- 回覆後 `/obw-bind` 跳出「Replace task binding?」對話框，指出原 owner 是 Pi session `01a13569-ffaa-7115-a3f8-22e398c55825`。這是 OMP 的 `ctx.ui.confirm` 選單，`y` 鍵無效，要選 Yes 後按 Enter。卡片只有 `session` 改變。
- 第二則訊息顯示「Work start verified」，`## Agent` 下多一個工作中區塊，沒有拒絕警告。這次開始收據（08:37:59.299Z）早於 assistant 訊息（08:38:01.998Z），但 §3.3 的 OMP 時點不保證這個順序。
- `/obw-sync` 寫入第一行與全文連結，runs 筆記多一段全文。再次 `/obw-sync` 顯示 already recorded，`/obw-unbind` 之後兩個檔案的位元組都不變。
- Status、priority、relations、三項 criteria 與 Notes 不變。Session 檔有兩筆 `obw-binding`（綁定與解除）與兩筆 `obw-writeback`（開始與 Sync）。
- 卡片的 owner 留在這個 OMP session，沒有清理，也沒有綁回 Pi。

### Pi 1.4.0 驗收（2026-10-29）

同一天在正式 pi 1.4.0、真 Obsidian CLI 與 `anthropic/claude-haiku-4-5` 上跑了一次，程式是 `84ca2cc`。`PI_CODING_AGENT_DIR` 指向隔離目錄，`~/.pi/agent` 的檔案前後 stat 相同。只載入 obw（`--no-extensions -e obw/pi.ts`），所以沒有驗到 obw 與其他 extension 同時載入。Session 是 `01a1872e-a0b3-7357-9926-f977c45b1340`，共兩個模型回合。

- 四個指令各註冊一次。tmux 裡的 `/issue` 能開卡、Back、Escape，vault 不變。
- 第一個回合後 `/obw-bind` 跳出「Replace task binding?」，指出原 owner 是上面的 OMP session。選 Yes 後卡片只有 `session` 改變，entry 是 `6bf21e1b`。
- 第二則訊息顯示「Work start verified」。開始收據 `bef10e3d`（10:24:04.654Z）早於 assistant `455ac965`（10:24:05.443Z），sync 前 runs 不變。
- `/obw-sync` 寫入第一行與全文，引號、wikilink 與反斜線原樣保留，收據 `840cccd5`。再次 sync 顯示 already recorded，`/obw-unbind`（`027112ab`）之後兩檔 bytes 都不變。
- Status、priority、relations、三項 criteria 與 Notes 不變。
- 卡片 owner 現在是這個 Pi session，該 session 已 unbind。沒有清理測試資料。
- 卡片頁沒有捲動：`obw/issue.ts:120-123` 把整份內文排進畫面，45 列的終端機看不到最後一個 Agent 區塊與 `## Notes`。這不影響上面各項，尚未修。

### 尚未證明的範圍

上面的 OMP 驗收只跑了一次文字回合，下列各項仍沒有在真實 OMP 上觀測：

- Tool call 回合的開始記錄，以及 2 秒等待在高負載下是否足夠。
- 30 秒 handler 上限下，開始記錄與 model request 的實際先後。
- 卡片的 `b`／`u`／`y`／`n` 確認；fixture 只呼叫 component 的 `handleInput`。2026-10-29 的 OMP 冒煙只在真 PTY 做了 `/issue` 唯讀導航（開卡、Back、Escape），沒有按這些鍵。
- 跨宿主 A10。

Pi 的 A2、延遲請求／session invalidation、tool continuation 去重、error／abort 拒絕、partial-write recovery 等細節有 unit／fixture 契約，沒有把每個故障都注入真實 vault。正式 core 測試來源見 `obw/contracts.test.ts`、`obw/issue.test.ts`、`obw/session.test.ts`、`obw/writeback.test.ts`。

正常模型驗收只直接觀測開始收據早於 assistant-start，沒有直接觀測 HTTP request boundary。使用者批准 SDK 必需的既有 OAuth 自動續期，但驗收沒有直接觀測 refresh；auth／settings／models 的 metadata 未變不等於證明其內容不變。Pre-context failure 不在工作開始覆蓋範圍內。Pi 的 no-model PTY warning 是刻意隔離 auth 的預期結果，不算另一輪模型驗收。

後續須取得 A10 的真實跨宿主收據，不以單一宿主的驗收代替。

## 9. 2026-10-29 決定變更

使用者在 2026-10-29 改變了兩項先前的決定，作為 `docs/overhaul-plan.md` 的 M0：

- 檢查釘選的宿主版本改為 OMP 18.13.3 與 pi 1.4.0，與本機安裝一致。本機的 OMP 執行檔已自我更新到 18.13.3，但 `~/node_modules` 的 package 仍是 17.3.4；這次用 `bun add --exact` 把 package 補到 18.13.3。§8 的 Pi 驗收是在 1.1.0 上做的，當時沒有在 1.4.0 重做；同日稍晚才補上 §8 的 Pi 1.4.0 驗收。
- OMP typecheck 改用 `skipLibCheck`，只限 omp 目標。18.13.3 的 published declaration graph 有 48 個自身錯誤：@huggingface/tokenizers 42 個、@huggingface/transformers 2 個、OMP 自己的套件 4 個；OBW 原始碼沒有錯誤。Pi、core 與 tools 的檢查仍不使用 skipLibCheck。設定見 `obw/tools/typecheck-config.mjs`，契約見 `obw/tools/typecheck-config.test.mjs`。

變更後 `bun run --cwd obw check` 全數通過：lint、三層 typecheck、OMP 與 pi 的正式 loader 都只註冊一次 `/issue`，`bun test` 為 65 pass／0 fail。§3 到 §8 中「不使用 skipLibCheck」與「不升級 OMP」的敘述是當時的決定，保留作為歷史。

同日的 M10 為 OMP 加上與 Pi 相同的 `/obw-bind`、`/obw-unbind`、`/obw-sync` 與卡片 `b`／`u`，與 Pi 共用核心；差異見 §3.4。

- 核心唯一的變更是 `createBindingController` 改為由入口傳入 host（`obw/session.ts:97,125`），OMP 寫 `omp`，Pi 寫 `pi`。
- `obw/tools/check-load.mjs` 啟動的 `obw/tools/load-worker.mjs:23` 在 OMP 上改用 `obw/tools/omp-registration.mjs`。它要求四個 command 與三個 pm tool 各註冊一次、十個 observer 各一個，並禁止 `agent_end`、`session_stop` 等自動結果事件。此斷言先對舊 `index.ts` 失敗，實作後通過。
- `obw/tools/omp-adapter-worker.mjs` 在 Bun 上用正式 OMP loader 載入 `index.ts`，只替換 vault exec 與 session entry 寫入，共 35 個情境。它們涵蓋持久化 session 要求、持久化 user 後的開始記錄、Sync 拒絕、同 ID 去重，以及 session、branch、input 與 binding 變更造成的失效，包括在等待 user entry 期間發生的九種事件與重新 bind。repo 只保存這些測試本身；開發時對每組做過的刻意破壞沒有留下紀錄檔。這些 fixture 自行送出 `message_end`，看不出 OMP 的實際事件順序；那由下一項的真實 session 測試涵蓋。
- 審查時用真實 `createAgentSession` 加假 provider 發現：舊的 `context` observer 在一輪第一次 `context` 時找不到該輪 user，文字回合從不記錄開始。使用者在 2026-10-29 選擇改用 extension 的 `message_end`，接受記錄可能晚於 model request 開始。這只改 OMP 的時點，Pi 不變。§3 的其餘保證不變：需要已持久化的 session、只記錄 branch 最新且已在磁碟的 user、同 ID 去重、失效與 fail closed。其中失效也涵蓋等待 user entry 的那 2 秒，這是複審後補上的 epoch 檢查（`obw/index.ts:75,85`）。`obw/tools/omp-session-worker.mjs` 是這個情境的測試：它對 bdfd1dc 的 `index.ts` 失敗，對新的 `message_end` handler 通過；它只重播 user 的 `message_end`，核心去重壞掉時會轉紅。
- 變更後 `bun run --cwd obw check` 通過，`bun test` 為 80 pass／0 fail。這些都是 fixture 與假 provider 收據；OMP 尚未做真實 vault 驗收，見 §8。

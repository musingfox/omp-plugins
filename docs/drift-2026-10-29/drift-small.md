# OMP 外掛與 CC 外掛的漂移報告（8 組）

日期：2026-10-29。比對對象是 `/Users/nickhuang/workspace/cc-plugins`（HEAD b4555826）與 `/Users/nickhuang/workspace/omp-plugins`（main，含未提交的 obw 變更）。比對方法是逐檔 `diff -u` 內容，日期只當參考。下文中「cc:N」指 cc-plugins 該檔第 N 行，「omp:N」指 omp-plugins 該檔第 N 行。

分類代號：
- (a) 必須移植。
- (b) CC 專屬機制，OMP 不需要。
- (c) OMP 專屬，應保留。
- (d) 需要協調者決策（不屬於 a/b/c 任何一類時才用）。

## 總結

| 外掛 | 漂移程度 | 一句話 |
|---|---|---|
| wizard | 小 | template.sh 完全相同；只差描述、兩個驗證指令與 confirm 寫法。 |
| adr | 中 | 少了 `rejected` 狀態、supersede/deprecate 之後的驗證步驟、相對路徑規則。 |
| diagnose | 中 | 仍交給 `/cf`；少了 `set -e`、format-patch 指令與 Phase 5 的翻轉驗證。 |
| deepen | 中 | 仍交給 `/spiral`；少了 `docs/decisions/` 與整段設計詞彙。 |
| apple-podcasts | 中 | 流程改寫幅度大；禁止 curl 的理由未驗證，缺 `?i=` 時的行為不同。 |
| agent-browser | 大 | 有安全退化：教使用者把憑證放進全域 `set headers`。 |
| hook-guard | 大 | 不是漂移而是被掏空：實際的 hook 腳本全部不見，只剩契約文字。 |
| pi-dispatch | 大（刻意） | 是另一個外掛；使用者已在 2026-10-12 主動停用。 |

## 跨外掛共通的 (b) 項目

以下只列一次，不在各外掛重複：
- `.claude-plugin/plugin.json` 與 marketplace 設定屬於 CC 封裝，OMP 用 `package.json` 的 `"omp": {}`（omp-plugins/README.md:5）。
- `evals/` 觸發評測（例如 cc diagnose/evals、adr/evals、pi-dispatch/evals，來自 60dacafa、ea4bbb00、600c0146）跑在 `claude plugin eval` 上，OMP 沒有對應工具。
- manifest、marketplace、readme、attribution、runner 這類 cc 測試只驗證 CC 封裝。
- frontmatter 的 `allowed-tools`、`disable-model-invocation`、`argument-hint` 是 CC 的機制。

會驗證行為的 cc 測試（diagnose 的 `method-*`、`entry-*`、`hitl-template`、`placeholder`；deepen 的 `explorer`、`pipeline`、`report`、`scope`、`vocabulary`）屬於 (a) 候選。omp 這兩個外掛的測試各只有 2 到 3 個檔案。

## 對 /cf、spiral、context-flow 的所有引用

omp 仍然有 `cf/` 與 `spiral/`，`omp plugin list` 也顯示兩者已啟用，所以下列引用目前在本機都找得到目標。cc 已經在 79db07df（diagnose 改成交給 main session）、4f94974b（repo 內引用改指向替代品）、de5039bf（刪除 context-flow 與 spiral）完成替換。

| 位置 | 內容 |
|---|---|
| omp diagnose/docs/method.md:10 | `/cf` owns the repair after hand-off |
| omp diagnose/docs/method.md:175 | `/cf` decides what the correct change is |
| omp diagnose/docs/method.md:179 | The fix is `/cf`'s work |
| omp diagnose/docs/method.md:183 | ask `/cf` to create the seam |
| omp diagnose/docs/method.md:190 | Leave the rest to `/cf` |
| omp diagnose/docs/method.md:214 | `/cf Cherry-pick <sha> ...`（交接行） |
| omp diagnose/docs/method.md:220 | so `/cf` must have the same changes |
| omp diagnose/commands/diagnose-now.md:2 | description：hand off to /cf |
| omp diagnose/tests/contract.test.sh:14-17 | 測試把 `/cf` 字串釘死 |
| omp diagnose/tests/lifecycle.test.sh:55 | 測試把 `/cf Cherry-pick` 釘死 |
| omp deepen/skills/survey/SKILL.md:11 | `/spiral` narrows a candidate |
| omp deepen/skills/survey/SKILL.md:61 | Narrowing ... is `/spiral`'s job |
| omp deepen/agents/explorer.md:13 | `/spiral` designs candidates |
| omp README.md:14、20、60 | `omp plugin link` cf 與 spiral |
| omp README.md:40、44、46 | 外掛表中的 cf、diagnose 的 `/cf` 交接、spiral |

其他六個外掛（adr、agent-browser、apple-podcasts、hook-guard、pi-dispatch、wizard）在 omp 端沒有任何這類引用（我用 `grep -rnE '/cf\b|\bcf\b|spiral|context-flow|CF_'` 搜過）。

附帶發現：cc 自己也還有殘留。cc deepen/agents/explorer.md:51 與 cc deepen/docs/PROVENANCE.md:3 仍寫 `/spiral`；cc pi-dispatch 的腳本註解（scripts/pi-probe.sh:4、pi-worktree.sh:4、pi-poll.sh:104、pi-run.sh:4、pi-dispatch.sh:54）與 docs/dispatch-doctrine.md:5 仍提到 cf 或 spiral。

決策點 (d)：兩條路由協調者選。
1. 保留 omp 的 cf 與 spiral。上述引用維持有效，但措辭與 cc 的「main session」和「method」分道揚鑣。
2. 跟隨 cc。這需要移植 `method`，或把交接改寫成「main session」。diagnose 的兩個測試（contract.test.sh:14-17、lifecycle.test.sh:55）必須在同一個 milestone 裡改，否則 omp 的測試會變紅。deepen 的交接目標也要同時決定。

## diagnose（中）

omp 版本建立於 2026-09-15（檔案 mtime），早於 cc 的 f0e47acb（09-27）與 36e825d8（10-06）。

| 差異 | 來源 | 分類 |
|---|---|---|
| 交接對象由 `/cf` 改成 main session（共 7 處，見上表） | cc method.md:177、181、185、193、223；79db07df | (d)，取決於 cf 的去留 |
| Phase 0 開頭加 `set -e`，並說明 worktree add 失敗時不會印出路徑 | cc method.md:16、30；36e825d8 | (a) |
| `<slug>` 的定義（kebab-case 症狀名） | cc method.md:30 | (a) |
| Teardown 給出具體的 `format-patch` 指令；omp 只有文字描述 | cc method.md:53；36e825d8 | (a) |
| Phase 5 的翻轉驗證：重做 Phase 4 的中和變更，測試應轉綠，還原後轉紅 | cc method.md:181、191；f0e47acb | (a) |
| 第 1 行加了 Contents 目錄 | cc method.md:5 | (a)，低優先 |
| HITL 段落點名 `diagnose` 或 `diagnose-now` | cc method.md 第 10 種 loop；omp diff hunk `+86` | 措辭差異，omp 的寫法也成立，(c) |
| skill description 縮窄成「找出已確認的原因，不用於快速修正」；omp 仍是「broken、throwing、failing、slow」都觸發 | cc skills/diagnose/SKILL.md:4；omp skills/diagnose/SKILL.md:3-4 | (a)，omp 的觸發範圍過寬 |
| cc 的 diagnose-now 是 skill；omp 是 command | cc skills/diagnose-now/SKILL.md；omp commands/diagnose-now.md | (c)，OMP 用 command 承接明確呼叫 |
| `OMP_PLUGIN_ROOT`、OMP `ask`、`task`、`hub` 對應 | omp method.md:5-10；omp SKILL.md:9-11 | (c) |
| 行為測試：cc 有 14 個，omp 只有 contract 與 lifecycle 兩個（我實際執行過，兩者都通過） | cc diagnose/tests/；omp diagnose/tests/ | method-stop、method-stop-guard（2df079bf、bd37bec1、fb714124）、method-noseam、method-redact、hitl-template 屬於 (a) 候選 |

## deepen（中）

omp 版本建立於 2026-09-15。

| 差異 | 來源 | 分類 |
|---|---|---|
| Context 步驟同時讀 `docs/decisions/` 與 `docs/adr/`；omp 只讀 `docs/adr/` | cc survey/SKILL.md:34；omp SKILL.md:29；c0b38ed0 | (a)，與 adr 外掛的目錄偵測順序一致 |
| explorer 的 Design Vocabulary 整段（8 個詞的定義、deletion test、「一個 adapter 是假設的 seam」、拒絕 Ousterhout 比率）在 omp 被刪掉，只留詞彙清單 | cc agents/explorer.md:26-49；omp explorer.md:13 | (a)，這是 explorer 判斷品質的依據 |
| report.md 七個詞的一行定義被刪 | cc docs/report.md 第 7 行起（diff hunk `-4,21`）；omp report.md:7 | (a) |
| report.md 用「design vocabulary」；omp 用「glossary terms」 | cc report.md:7；omp report.md:7 | (a)，cc report.test.sh 的 T6 禁止 report.md 出現 glossary |
| 交接改成 `method` skill；omp 仍是 `/spiral` | cc SKILL.md:76；omp SKILL.md:61；4f94974b | (d) |
| Scope 步驟說明 hotspots.sh 最多印 5 行、取前 3 行 | cc SKILL.md 第 1 節；d898bfca | omp SKILL.md:25 已涵蓋，(無需動作) |
| hotspots.sh 的 WHY 註解（200 commits、25% 門檻的理由，8ba6f0a）被刪，邏輯相同 | cc scripts/hotspots.sh；omp diff | (a)，低優先，只是註解 |
| render-survey.sh：omp 自寫版本比較函式取代 `sort -V` | omp scripts/render-survey.sh:12-41；omp commit b05d0df | (c) |
| 派工改用 OMP `task`（isolated）、`hub` 等待、`read` 取片段 | omp SKILL.md:31-46 | (c) |
| `argument-hint`、`disable-model-invocation` | cc SKILL.md:6-7 | (b) |
| 測試：cc 有 explorer、pipeline、report、scope、vocabulary；omp 只有 contract、hotspots、render（我執行過，三個都通過） | cc deepen/tests/；omp deepen/tests/ | vocabulary（要求 ≥20 行詞彙）、report、scope 屬於 (a) 候選 |

## adr（中）

omp 版本建立於 2026-09-23，早於 cc eae94b8f（10-06）。

| 差異 | 來源 | 分類 |
|---|---|---|
| 狀態值少了 `rejected` | cc SKILL.md:41、references/bootstrap-adr.md:46；omp SKILL.md:50、bootstrap-adr.md:46 | (a)，omp 是否刻意刪除：未驗證，沒有找到相關 commit 說明 |
| Supersede 的 Step 7 Verify 與 Deprecate 的 Step 4 Verify（對改過的檔案跑 broken-links 與 stale-refs，直到乾淨） | cc SKILL.md:196-198、246；eae94b8f | (a) |
| notice 裡的連結路徑必須相對於持有 notice 的檔案 | cc SKILL.md:194 | (a) |
| Audit 移到 `references/audit.md`；omp 把 audit 內嵌在 SKILL.md | cc SKILL.md:263、references/audit.md；eae94b8f | 結構差異，內容大致相同，(c) 可保留 |
| MADR 範本標示 Decision Drivers、Confirmation、Pros and Cons 為選填 | cc references/madr-template.md:3、18、39、44 | (a) |
| bootstrap ADR 的措辭小改（「no lifecycle tracking」一行） | cc bootstrap-adr.md 第 81 行附近 | (a)，低優先 |
| 與 obw project-note ADR 的分界 | omp SKILL.md:8、16-17、79 | (c) |
| OMP `ask` 取代 AskUserQuestion | omp SKILL.md:35、65、100、113 | (c) |
| 範例輸出表格與報告格式（List 表格、Supersession Complete 報告）在 omp 被精簡 | cc SKILL.md List 與 Step 8 | (a)，低優先 |

## wizard（小）

`skills/wizard/template.sh` 兩邊完全相同（diff 沒有輸出）。omp 版本建立於 2026-09-23，早於 cc 8f7c9649（10-06）。

| 差異 | 來源 | 分類 |
|---|---|---|
| description 加上「何時使用」（需要人的階段、想要可重跑的腳本） | cc SKILL.md:5-8；8f7c9649 | (a) |
| 用詞統一成「stage」；omp 混用 step 與 stage | cc SKILL.md 全文；8f7c9649 | (a)，低優先 |
| 驗證 `TOTAL_STAGES` 的指令 `grep -c '^stage "'` | cc SKILL.md:49 | (a) |
| 用具體的 `git check-ignore -q "$ENV_FILE"` 取代「確認已 gitignore」 | cc SKILL.md:52；omp SKILL.md:48 | (a) |
| confirm 的寫法：omp 仍認可 `confirm "…" \|\| exit 0`；cc 指出這樣也會跳過結尾摘要，要摘要就用 `if` | cc SKILL.md:41；omp SKILL.md:41；ab7f1756 | (a) |
| `${OMP_PLUGIN_ROOT}` 與 OMP `ask` | omp SKILL.md:14、27、39 | (c) |

## apple-podcasts（中）

omp 是整份重寫，不是逐行移植。cc 在 e672d5d1（10-06）改成「一次 lookup 加驗證音訊 URL」。

| 差異 | 來源 | 分類 |
|---|---|---|
| cc 要求用 curl、jq、xmllint，理由是 WebFetch 會把回應丟給小模型轉成 markdown，可能弄錯 ID 與 URL；omp 明文禁止 curl，改用 OMP `read` 與 `browser` | cc SKILL.md:17；omp SKILL.md:16-21 | (d)。OMP 本身有 Bash，禁 curl 的理由沒有寫出來。OMP `read` 對 URL 是否回傳原始 JSON 與 XML：未驗證，我沒有在 OMP 裡實際呼叫 |
| 網址缺 `?i=` 時，cc 列出近期集數讓使用者選；omp 直接停下，除非使用者明確要求 | cc SKILL.md:38；omp SKILL.md:39-44 | (a) |
| cc 一次 lookup（`entity=podcastEpisode&limit=200`）就拿到 feedUrl 與集數；omp 分兩次 | cc SKILL.md:45；omp SKILL.md:46-71 | (a)，低優先 |
| 驗證音訊 URL：cc 要求 HTTP 200 且 content-type 為 `audio/*`；omp 接受 2xx/3xx 或「明顯成功的媒體回應」 | cc SKILL.md:71-74；omp SKILL.md:76-80 | (a)，omp 的條件較鬆 |
| RSS fallback 以 guid 精確比對 | cc SKILL.md:84、92；omp SKILL.md:85-103 | 兩邊一致 |
| omp 多了失敗分流與回應契約（第 5 節） | omp SKILL.md:104-120 | (c) |
| 限制說明：cc 明寫「只能查到最新 200 集」「不支援直接以 track_id 查詢」 | cc SKILL.md 最後的 Limitations 段 | (a)，omp 只部分提到 |

## agent-browser（大）

omp 版本建立於 2026-09-23，早於 cc 的 f1ac52c3、83238191（10-05）、2e11b620（10-06）、45377c18（10-24）。

最優先：安全退化。
- omp SKILL.md:65、127 教使用者用 `agent-browser set headers '{"Authorization": ..., "Cookie": ...}'` 傳憑證。
- cc SKILL.md:106-112 改成 `open --headers`（只送給該 URL 的 origin），並明文禁止把憑證放進 `set headers`，因為它是全域設定，會把 token 與 cookie 送到頁面請求的每個第三方 origin（f1ac52c3）。
- 分類 (a)，應列為第一個 milestone。

| 其他差異 | 來源 | 分類 |
|---|---|---|
| scroll 單位：omp 寫「viewport heights」；cc 改成像素（預設 300），並加 `scrollintoview @eN` | omp SKILL.md:97-98；cc SKILL.md:76-78；f1ac52c3 | (a)，omp 的說法錯誤 |
| omp 仍附 `references/commands.md`（310 行）與指令速查表；cc 已刪除這份複製來的參考，改叫使用者跑 `agent-browser --help` | omp SKILL.md:146、references/commands.md；cc SKILL.md:125；f1ac52c3 | (a) |
| 不可逆動作前要先問使用者（cc）；omp 只說先用 `screenshot --annotate` 確認 | cc SKILL.md Best Practices 第 2 點；omp 對應段落；83238191 | (a) |
| 動態內容用 `wait --load networkidle` 或 `wait --text` | cc SKILL.md Best Practices 第 3 點 | (a) |
| web-test 少了 Phase 5「執行測試」：happy path 要綠、regression 要因為 bug 本身而紅 | cc web-test/SKILL.md:13、154；omp web-test/SKILL.md:13；83238191 | (a) |
| web-test 少了「在非 localhost 送出表單或做不可逆動作前先問」 | cc web-test/SKILL.md:41 | (a) |
| web-test 少了 agent-browser 的執行期診斷表（console、errors、eval、cookies、storage、network requests）；omp 直接退回 Playwright library mode | cc web-test/SKILL.md:57-68；omp web-test/SKILL.md:57 | (a) |
| playwright-diagnostics.md：cc 縮到只處理 CLI 看不到的部分（HTTP status、iframe、shadow DOM），並修正 shadow DOM 寫法 | cc web-test/references/playwright-diagnostics.md | (a) |
| playwright skill：omp 保留 Library Mode 與 `npm init playwright@latest`；cc 刪掉 Library Mode，並說 `npm init` 是互動式指令，要留給使用者自己跑 | omp playwright/SKILL.md:21、214；cc playwright/SKILL.md:24 | (a) |
| playwright skill：寫完 spec 要跑到綠才算完成 | cc playwright/SKILL.md:211 | (a) |
| `getByText` 範例加 `{ exact: true }` | cc playwright/SKILL.md 第 62 行附近 | (a)，低優先 |
| api-patterns.md 加目錄 | cc playwright/references/api-patterns.md:3-12 | (a)，低優先 |
| description 把「可見瀏覽器」轉給 zen-agent | cc SKILL.md:7；45377c18 | (d)。omp 沒有 zen-agent 外掛。OMP 內建 `browser` 工具是否能當成可見、可接手的瀏覽器：未驗證 |
| `allowed-tools` 預先核准唯讀指令 | cc SKILL.md:8；2e11b620 | (b) |

## hook-guard（大）

這不是漂移，而是移植時被掏空。行數對比如下：

| 檔案 | cc 行數 | omp 行數 |
|---|---|---|
| references/pre-commit-checks.md | 315 | 16 |
| references/detection.md | 69 | 14 |
| references/commit-msg.md | 46 | 8 |
| references/settings.md | 61 | 10 |

cc 的 pre-commit-checks.md 是「`.githooks/pre-commit` 的唯一真實來源」，裡面有完整的 script skeleton 與每個檢查函式。omp 版本自稱「it is not an automatic hook generator」（omp pre-commit-checks.md:16），所以 agent 每次都要從一段契約文字重新寫出 hook。

| 差異 | 來源 | 分類 |
|---|---|---|
| pre-commit skeleton 與全部檢查函式（secrets 含 gitleaks、private keys、sensitive paths、large files、merge conflicts、line endings、trailing whitespace、EOF newline、broken symlinks、no-commit markers、syntax、lock sync、lint/format/test） | cc pre-commit-checks.md:1-315；f8db700f（可攜、每項都跑）、b424b78e（gitleaks 指令修正）、81661119（目錄） | (a) |
| commit-msg 完整腳本（Conventional Commits、72 字元、跳過 merge 與 fixup） | cc commit-msg.md:1-46 | (a) |
| 偵測細節：語言標記表、工具鏈、禁止 `npx` 退路、PyYAML 與 tomllib 的限制、jj-native 直接中止、既有 hook 盤點、monorepo | cc detection.md:32、38、44、49 | (a) |
| settings 的 frontmatter schema 與預設值 | cc settings.md:1-61 | (a) |
| Setup 的 Verify 步驟：`bash -n` 後在暫時的 scratch repo 實跑 hook | cc SKILL.md:35 | (a) |
| Doctor 把舊版的 `CLAUDECODE` 略過標記判為 FAIL，並給出修正方式；omp 只把它列為檢查項目，沒說是失敗 | cc SKILL.md:46、60；omp SKILL.md:51；bccc943b | (a) |
| Update 的「只替換變動的檢查函式本體」 | cc SKILL.md Update 第 5 步 | (a) |
| `/hook-guard` command 作為 OMP 入口 | omp commands/hook-guard.md | (c) |
| 所有變更都要使用者逐項確認 | omp SKILL.md:29-32、commands/hook-guard.md | (c) |

omp 端的缺陷：
- omp pre-commit-checks.md:10-11 有斷句：「lock-file consistency.」之後直接接「integrity checks MUST still run.」，前半句不見了。
- omp SKILL.md:21、29 與 references/cc-hooks.md:13 都說「the extension」，但 omp hook-guard 沒有 extension，只有 `commands/`、`skills/`、`package.json`（我列過檔案；package.json 只有 `"omp": {}`）。
- omp SKILL.md:5 的 description 說會「在 git 或 jj commit 前要求明確確認」，但沒有任何程式實作這件事。
- omp references/cc-hooks.md:3 描述的是 CC 的 PreToolUse/PostToolUse 設計，而 cc 自己在 bccc943b 已經放棄這個設計，改成所有檢查都在 pre-commit 裡跑。這份文件已過時。
- omp 仍讀寫 `.claude/hook-guard.local.md` 與 `.claude/settings.local.json`（omp settings.md:3-10、detection.md:8）。在 OMP 裡沿用 `.claude/` 路徑是否合理：(d)。

## pi-dispatch（大，但屬刻意分歧）

omp 的 pi-dispatch 是另一個外掛。它把「派工」對應到 OMP 的 `task`、`workpool`、`hub`（omp skills/pi-dispatch/SKILL.md:18-36），不呼叫 pi CLI。cc 的 pi-dispatch 是一組腳本（pi-agent.sh 等 8 支）、builder 與 reviewer 兩個 agent、worktree-fence pi extension、git shim，目的是把工作從 Claude Code 轉給便宜的 pi 模型（cc docs/dispatch-doctrine.md:3）。

停用原因（已查明）：
- `~/.omp/plugins/omp-plugins.lock.json:63-67` 的 `pi-dispatch` 是 `"enabled": false`。
- 停用指令是 `omp plugin disable pi-dispatch`，出現在 OMP session `~/.omp/agent/sessions/-.omp/2026-10-12T10-17-18-886Z_01a12f9d-e326-753a-a0f7-a15f975508a0.jsonl`（時間 2026-10-12T10:43）。
- 同一個 session 裡使用者說：「先停用，在 omp 中用不到，那是從 claude code 搬過來的」。
- 更早的 OMP session（2026-09-15，`PiDispatchDecision.json`）已決定「明確排除 port」，理由是 provider 重播、PI_CWD 圍欄、quota watchdog 都是外部 pi runtime 的控制面，OMP 有原生等價物。
- `omp plugin doctor` 對 pi-dispatch 顯示 ✔，不會顯示停用狀態。

cc 自移植以來的變更（bfcd5004 移除 `/cf` 身分提示、420f57fd 與 7e001e1c worktree 回滾、7c5d7e06 reviewer 釘 opus、600c0146 evals）全部屬於 pi 腳本機制，分類 (b)。

建議協調者在「刪除 omp/pi-dispatch」與「保留但停用」之間決定 (d)，不建議移植 cc 的腳本。

附帶發現：`~/.omp/plugins/node_modules/fizzy` 與 `~/.omp/plugins/node_modules/omp-quota` 是斷掉的 symlink（目標在 omp-plugins 的 dadb051 已刪除），`omp plugin doctor` 沒有抓到。

## 建議的 milestone 順序（供協調者參考）

1. agent-browser 的憑證 header 修正（安全問題，改動小）。
2. 決定 cf 與 spiral 的去留，再一次改完 diagnose 與 deepen 的交接措辭和對應測試。
3. hook-guard 把 cc 的 reference 腳本搬回來，並修掉斷句與不存在的 extension 說法。
4. 其餘 (a) 項目依外掛各一個 milestone：diagnose、deepen、adr、agent-browser 其他項、apple-podcasts、wizard。
5. pi-dispatch 的去留決策。

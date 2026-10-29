# OMP 外掛漂移報告：viz、obw、spec

比對對象是 `/Users/nickhuang/workspace/cc-plugins`（HEAD `b4555826`）與 `/Users/nickhuang/workspace/omp-plugins`（HEAD `dadb051`，含 obw 的 staged 變更）。比對依內容，不依日期。主機版本由我實測：`omp --version` 回傳 `omp/18.13.3`，`pi --version` 回傳 `1.4.0`。

分類代號：
- **(a)** 必須移植到 omp。
- **(b)** 只屬 Claude Code 機制，OMP 不需要。
- **(c)** omp 專屬，應保留。
- 標「待決策」的項目需要協調者或使用者先選方向。

## 總結

| 外掛 | 漂移程度 | 主因 |
|---|---|---|
| viz | 大 | cc 把圖表引擎從 Mermaid 換成 Pele 1.6.0、換成 Flexoki 調色盤、server 改為每次 render 都啟動、feedback 加了圖卡檢視；omp 停在 Mermaid 11 + ELK。 |
| obw | 大 | cc 的 `/issue` pane、pm tools、writeback hooks、dashboard-diff 都是 omp 沒有的；omp 仍保留 cc 已移除的 ADR 功能；jot 少了 `vault=` 規則。staged 的雙宿主工作只完成 pi 端。 |
| spec | 中 | 全是 skill 文字差異加一個指向已刪除 context-flow 的引用；`spec.sh` 的行為已等價。 |

---

## 1. viz（cc 1.1.12 ↔ omp 1.1.0）

cc 自 `c9871a1` 起有 28 個 viz commit（`git log c9871a1..HEAD -- viz`）。omp 最後兩個 viz commit 是 `f8e510c`（2026-09-16，feedback rounds + ELK）與 `fd70144`（PR review 主題）。

### 1.1 圖表引擎與主題

1. **Pele 取代 Mermaid** — cc `lib/template.html` 載入 `pele@1.6.0`，並 inline `pele-glue.js`、`pele-theme.css`（cc template.html 對應 diff 段 490–508；commit `96c00c9b`、`4e24523d`、`1fd988fe`）。omp `lib/template.html:501-522` 仍以 ESM 載入 `mermaid@11` 並註冊 ELK 與 `logos` icon pack。omp 缺 `lib/pele-glue.js`、`lib/pele-theme.css`、`lib/hljs-theme.css` 三個檔。分類：**(a) 待決策**。若採用 Pele，omp 的 ELK 支援（`f8e510c`）會一併失效；若不採用，omp 應明確記下拒絕理由。
2. **feedback recipe 也改用 Pele** — cc `lib/recipes/feedback.html:423-464` inline pele；omp `lib/recipes/feedback.html:320` 仍載入 `mermaid@11/dist/mermaid.min.js`。分類：隨第 1 項決定。
3. **Flexoki 調色盤** — cc template 的 `--bg: #100f0f`、`--accent: #da702c` 等 token 加上一組具名色（`--red`…`--magenta`），commit `4325fb16`；omp 仍是 Monokai 系（`--bg: #07080a`、`--accent: #fd971f`）。cc 有 `1ccc4c4f` 測試比對設計系統 tokens.css。分類：**(a)**。
4. **highlight.js 釘版** — cc 改用 `@highlightjs/cdn-assets@11.12.0` 並由 DOM 階段上色（commit `fee5bb3c`）；omp `template.html` 載入 `cdn-release@latest` 與 `monokai.min.css`，屬浮動版本。分類：**(a)**，浮動版本會讓 render 結果無聲變動。
5. **omp 移除 Mermaid 邊線跑馬燈動畫** — omp template.html 有 `.viz-flow` 靜態虛線註解（diff 段 338–345，附效能量測理由）。cc 已不用 Mermaid，這段在 cc 沒有對應物。分類：**(c)**，但若採用 Pele 即成孤兒。
6. **diagram-types.md** — cc 新增「Pele 讀 Mermaid 語法」說明、`architecture-beta` 一節、「Tangled graphs」用 subgraph 分組（cc `skills/viz-render/references/diagram-types.md:3-73`）；cc 刪除「5–15 nodes」下限（commit `641e1cbb`）。omp 仍保留「Keep diagrams focused: 5-15 nodes optimal」。分類：**(a)**。

### 1.2 render.sh 與 server

7. **每次 render 都經過 server** — cc `lib/render.sh` 在任何輸入都呼叫 `start_viz_server 127.0.0.1` 並印出 `URL:` 行；omp 只在 recipe 時啟動 server（omp `lib/render.sh` 約 148–160 行 `elif [ -n "$RECIPE" ]` 分支）。分類：**(a)**。這也是 cc README 中 tailscale serve 代理與 obw「Open in browser」依賴的前提。
8. **SSH 重新綁定與 PID 追蹤** — cc 新增 `listener_pid()`，並在 SSH 需要 `0.0.0.0` 而現有 server 只聽 loopback 時殺掉重啟（cc `lib/render.sh:93-125`）；omp 以 `$!` 寫 PID 檔，cc 註解指出 python3 可能是 launcher，`$!` 不是實際 listener。分類：**(a)**。
9. **SKILL.md 的平台需求與 SSH 說明** — cc `skills/viz-render/SKILL.md:19-20` 宣告需要 macOS、python3、curl、lsof；cc 同檔 101–104 說明 SSH 下回報 Tailscale URL。omp 都沒有。分類：**(a)**。

### 1.3 Skill 文字

10. **viz-inline 與 viz-render 的交接門檻** — cc 兩邊統一為「~20 行、或 4+ 列且 3+ 欄的表」（cc `skills/viz-inline/SKILL.md:112-113`、`skills/viz-render/SKILL.md:8-10`，commit `d6db7f5c`）；omp 是「~50 行、4+ 列或 3+ 欄」，兩個 skill 的觸發條件因此重疊。分類：**(a)**。
11. **viz-render 的「When to Use」段** — omp `skills/viz-render/SKILL.md:21-28` 有此段，cc 已刪（內容與 description 重複）。分類：**(a)**，跟著刪。
12. **Pele 的確認步驟** — cc `SKILL.md:90-92` 要求 render 後請使用者確認圖有畫出來，因為 Pele 的語法錯誤只在瀏覽器顯示紅字。分類：隨第 1 項。
13. **plans 路徑** — omp 用 `${OMP_PLANS_DIR:-$HOME/.omp/plans}`（omp `SKILL.md:54`），cc 用 `~/.claude/plans`。分類：**(c)**。
14. **`OMP_PLUGIN_ROOT` 與 slash commands** — omp 的 `commands/viz-inline.md`、`commands/viz-render.md` 與 SKILL.md:36 的 plugin root 說明。分類：**(c)**。
15. **viz-inline 的 HumanLayer 出處** — omp `skills/viz-inline/SKILL.md:20-22` 在正文寫出處；cc 改成另放 `skills/viz-inline/LICENSE-upstream`。分類：**(a)**，小幅，補上授權檔即可。

### 1.4 Recipes

16. **feedback recipe 沒列在 omp 的 recipe 清單** — omp `skills/viz-render/SKILL.md:115-120` 只列 pr-review；lib 與 reference 卻都有 feedback。cc `SKILL.md:120-123` 有列 feedback，並在 125–128 說明 Save／Export 按鈕。分類：**(a)**。
17. **Save 寫回作為主要流程** — cc 的 recipe 流程是 Save 寫回原 `.md`，再用 Monitor 等檔案變化（cc `SKILL.md:132-138`、`references/recipes/pr-review.md:66-71`）；omp 的 pr-review reference 仍寫「Export → 貼回聊天」為主要流程（omp `references/recipes/pr-review.md:62-64`）。分類：**(a)**。
18. **round-trip-monitoring.md** — cc 有 `skills/viz-render/references/recipes/round-trip-monitoring.md`，依賴 Claude Code 的 Monitor tool。omp 用自己的「Recipe round-trip (OMP)」段（omp `SKILL.md:135-143`）改以 `ask` 或 `hub start`／`hub wait` 達成。分類：Monitor 版本為 **(b)**；omp 版本為 **(c)**。未驗證：`hub` 在 omp 18.13.3 是否存在。我查過 `which hub` 無結果、`omp --help` 也沒列出，它可能是 agent 內部工具而非 CLI，需在真實 omp session 確認。
19. **feedback 單選再點一次的行為** — cc `lib/recipes/feedback.model.js:95-99` 是「再點唯一選項仍保持選取」（commit `59edc6a6`，修掉 Save 前選項被吃掉的 bug）；omp 同處是「再點會清除」。分類：**(a)**，屬行為 bug 修正。
20. **feedback 圖卡檢視** — cc `feedback.model.js:147-270` 的 `project()` 把 body 投影成選項圖卡（commit `cad2459f`），並有 `tests/feedback.project.test.js` 與 `tests/fixtures/feedback/cards.md`；omp 有 round mode（omp `feedback.model.js:14,40,74`），但沒有圖卡檢視。cc reference 有「Round mode」與「Card view」兩節（cc `references/recipes/feedback.md:59-133`），omp reference 兩節都沒有，所以 omp 的 round mode 雖已實作卻沒寫進文件。分類：**(a)**。
21. **feedback frontmatter 不可加註解** — cc `references/recipes/feedback.md:45-47` 警告 frontmatter 尾端註解會變成值（commit `4aadd391`）；omp reference 的範本在 24–31 行**仍帶 `# optional` 註解**，照抄會讓空的 `choice:` 被讀成已回答。分類：**(a)**，屬無聲故障。
22. **recipes-architecture.md** — 兩邊只差最後一段：cc 說 feedback.html 由 `tests/feedback.e2e.ts` 覆蓋，omp 說「沒有自動檢查」（omp `docs/recipes-architecture.md:59`）。兩邊第 42 行都還提到 spiral，這是兩邊共有的歷史記錄，不算 omp 單方漂移。分類：隨測試移植而定。

### 1.5 測試與 evals

23. **omp 缺的測試** — cc 有 `tests/cdp-harness.ts`、`diagrams.e2e.ts`、`feedback.e2e.ts`、`feedback.project.test.js`、`pele-glue.test.js`、`pele.static.test.js`，以及 `fixtures/code`、`fixtures/diagrams`、`fixtures/feedback/{cards,save}.md`。omp 只有兩個 roundtrip 測試。分類：**(a)**，跟著被移植的功能一起帶過來。
24. **evals/** — cc `evals/viz-inline-*` 是 `claude plugin eval` 的觸發測試。分類：**(b)**。
25. **plugin.json** — cc `.claude-plugin/plugin.json`。分類：**(b)**；omp 用 `package.json` 的 `"omp": {}`。

---

## 2. obw（cc `obsidian-workspace` 0.9.19 ↔ omp `obw` 0.9.0）

omp 的 obw commit 停在 `cbca09a`（2026-09-23）。cc 在 2026-10-05 以 `f7144fd2` 把 ADR 移出 pm，在 `c9871a1` 之後又加了 pm tools 與 JSON 陣列修正。

### 2.1 Skills

1. **jot 每個 CLI 呼叫都要帶 `vault=`** — cc `skills/jot/SKILL.md:10-11` 規定所有呼叫都以 `vault=<VAULT_NAME>` 開頭，否則 CLI 會寫進最近聚焦的 vault；cc 在 24、53、55 行的指令也都帶 `vault=`。omp `skills/obw-jot/SKILL.md:24,51,53` 都沒帶。分類：**(a)**，屬無聲寫錯 vault 的風險，優先級最高。
2. **jot 範例與規則矛盾** — omp `obw-jot/SKILL.md:27` 的範例把 `#worklog` 移到句尾，但同檔 25 行規定 tag 原地保留；cc `jot/SKILL.md:29` 是原地保留。分類：**(a)**。
3. **wikilink 清單屬性必須用 JSON 陣列** — cc `skills/pm/SKILL.md:12,71` 與 `references/to-tickets.md:16` 規定 `blocked_by`／`related` 寫成 `'["[[a]]","[[b]]"]'`，否則整串被存成一個字串（commit `dfc9b8d0`）。omp `obw-pm/SKILL.md:46,56` 只寫 `[[kebab-name]]`。分類：**(a)**，屬無聲資料損壞。
4. **ADR 留在 obw** — cc `f7144fd2` 把 ADR 移出 pm，改由 adr 外掛負責（cc `pm/SKILL.md:3`「ADRs belong to the adr plugin」）。omp 仍有 ADR 建立、Decision Warrant、ADR schema（omp `obw-pm/SKILL.md:3,34,68-81`）、`templates/adr.md`、`tests/warrant.test.sh`，以及 init 安裝 `adr.md`（omp `obw-init/SKILL.md:13`）。omp 加入 ADR 的 commit 是 `6374546`（2026-09-16），早於 cc 的移除。omp repo 本身也有 `adr/` 外掛，所以兩處重複。分類：**(a) 待決策**，建議比照 cc 移除，但 vault 內 ADR 與 repo 內 `docs/decisions/` 的取捨要使用者確認。
5. **dashboard 更新改用 YAML diff** — cc `pm/SKILL.md:102-118` 以 `scripts/dashboard-diff.py`（依賴 `uv` + pyyaml）比對 `scripts/dashboard-history/*.base` 所有歷史版本，輸出 `missing`／`current`／`stale`／`edited` 判定（commit `88b88939`）。omp `obw-pm/SKILL.md:90` 與 `obw-init/SKILL.md:18` 只用 `grep name:` 比對 view 名稱，抓不到 formula、欄位、filter 的變動。分類：**(a)**。
6. **init 保留設定的路徑** — cc `init/SKILL.md:19` 定義 keep-config 路徑，並在 58、60、78 行規定這條路徑不寫 `.obsidian.yaml`、不重複問 `.gitignore`、輸出改為「kept」。omp `obw-init/SKILL.md:10` 會繼續 bootstrap，但第 19 行步驟 7 沒有排除這條路徑。分類：**(a)**，否則可能覆寫使用者已拒絕覆寫的設定。
7. **init 的升級改由 pm refresh 負責** — cc `init/SKILL.md:56` 與 `references/old-layouts.md` 把舊版遷移與 dashboard 更新交給 `/obw:pm refresh dashboard`；omp 把邏輯內嵌在 `obw-init/SKILL.md:16-19`。分類：**(a)**，隨第 5 項一起做。
8. **init 的 Filesystem Access 段與 filename strategy 說明** — cc `init/SKILL.md:10-15` 列出 init 唯一可直接碰 vault 檔案的操作；cc 31 行要求每個 filename strategy 選項的說明要寫出檔名形狀。omp 沒有這兩點。分類：**(a)**，小幅。
9. **pm 的 Delete 行為** — cc `pm/SKILL.md:63` 是先確認再 `delete`（移到垃圾桶）；omp `obw-pm/SKILL.md:37` 是「沒有 delete 就移到 archive」。分類：**(a)**，小幅。
10. **pm 的 Important Rules** — cc `pm/SKILL.md:122-129` 有六條規則，包括「建立或更新要有 CLI 收據」與「大量掃描可交給唯讀 subagent」。omp 散在 8–10、39 行，第 6 條沒有。分類：**(a)** 前五條；第 6 條的 Explore agent 屬 **(b)**，omp 可改成自己的 task 機制或略過。
11. **Skill 描述的觸發語** — cc 的 init、pm description 列出觸發語（cc `init/SKILL.md:3`、`pm/SKILL.md:3`）；omp 的 init、pm description 只描述功能（omp `obw-init/SKILL.md:3`、`obw-pm/SKILL.md:3`）。分類：**(a)**。未驗證：omp 18.13.3 是否用 description 自動觸發 skill；若只靠 slash command，這項可降為 (c)。
12. **`/obw-*` 名稱、`ask` 取代 `AskUserQuestion`、`OMP_PLUGIN_ROOT`、`commands/*.md`** — 分類：**(c)**。

### 2.2 Templates

13. **dashboard 的 `display` 改為連結** — cc `templates/dashboard-project.base:6` 與 `dashboard-cross.base:7` 是 `file.asLink(if(title, title, file.name))`；omp 是純文字 `if(title, title, file.name)`。分類：**(a)**。改 template 後，既有 vault 需要靠第 5 項的 refresh 才會更新。
14. **task.md 的 `session:` 與 `## Agent`** — cc `templates/task.md:12,26` 有這兩處；omp 沒有。staged 計畫規定這兩處只在使用者明確綁定後才按需建立（`obw/docs/dual-host-plan.md:56`）。分類：**(c)**，template 不必改。
15. **templates/README.md 的 schema 清單** — omp `templates/README.md:25-27` 的 Tasks 清單缺 `title`、`parent`、`blocked_by`、`related`，與 omp 自己的 pm schema（`obw-pm/SKILL.md:79`）不一致；cc `templates/README.md:24-25` 有列。分類：**(a)**。

### 2.3 Claude Mod、hooks 與 scripts

16. **pm tools（`pm_tick`、`pm_note`、`pm_status`）** — cc `hooks/pm-tools.ts` 在 session 開始時註冊三個 tool，從 cwd 的 `.obsidian.yaml` 取 vault 與 project，以一次 base64 eval 寫入並讀回，結果是一行 JSON（cc `README.md:52-60`；commits `db60165c` 到 `0f2b6b57`，全部在 `c9871a1` 之後）。omp 的 `index.ts` 與 `pi.ts` 都沒有 `registerTool`（我的 grep 只找到 `registerCommand`）。staged 計畫的範圍（`dual-host-plan.md:23-40`）沒有提到它。分類：**(a) 待決策**，這是真正的功能缺口，計畫裡沒有。
17. **writeback hooks（UserPromptSubmit／Stop／Notification）** — cc `hooks/hooks.json` 與 `hooks/writeback.sh` 在每次 prompt、stop、權限提示時自動寫卡片。staged 計畫說明 OMP 沒有可靠的「已完成」事件（`dual-host-plan.md:82`），使用者已批准改用明確的 `/obw-sync`（同檔 5、84 行）；第 38 行把權限事件寫回與自動結果寫回排除在第一版之外。分類：**(c)**，cc 的 shell hook 屬 **(b)**。
18. **狀態改為 in-progress 時自動綁定、done 時解除** — cc `README.md:44`（解析 Bash 字串）。計畫第 38 行明確排除。分類：**(c)**，第一版不做。
19. **綁定存放位置** — cc 用 `~/.claude-mobile/launches/<sid>.json`（cc `README.md:44`）；計畫改用宿主的持久化 session entries（`dual-host-plan.md:60`）。分類：**(c)**。
20. **`/issue` pane 的 UX 差異** — cc 有 `f` 篩選、`p` 依優先級篩選、`s` 切換排序、`x` 清除篩選、返回時焦點回到原列、`[H|M|L]` 列格式（cc `README.md:24-26`）。omp `issue.ts` 有依狀態分組與 done 收合（`issue.ts:49-50,112`），但沒有篩選與排序鍵。分類：**(a)**，可選，屬 UX 而非資料正確性。
21. **Open in browser** — cc 的卡片有按鈕，透過 viz 的 `render.sh` 開啟，viz 位置由 `installed_plugins.json` 找到（cc `README.md:30`）。omp 有 `obw/viz.ts`（`cbca09a` 提交），但沒有任何檔案 import 它：我 grep `obw/*.ts` 與 `obw/tools/*.mjs` 只找到 viz.ts 自己。它還把 `viz/lib/render.sh` 寫成相對 cwd 的路徑（`obw/viz.ts:12`），只在 omp-plugins repo 根目錄下才找得到。分類：**(a) 待決策**，要嘛接上並改用正確的定位方式，要嘛刪掉這個孤兒檔。
22. **Tailnet URL 行** — cc `README.md:32`。分類：**(b)** 偏向可選；依賴第 1 節第 7 項。
23. **提示列上方的綁定卡片 band** — cc `README.md:44`（Claude Mod band）。分類：**(b)**；OMP 是否有對應的 status 區塊**未驗證**。
24. **termaid 畫 Mermaid** — 兩邊都有（omp `issue.ts:74-86`）。無漂移。
25. **`.claude-plugin/types/`、`types/index.d.ts`、`tsconfig.json`** — Claude Mod 的型別。分類：**(b)**。
26. **evals/** — cc `evals/{init,jot,pm}-*`（commit `45fa226c`）。分類：**(b)**。
27. **cc 的 shell 測試** — 例如 `tests/dashboard-diff.test.sh`、`dashboard-upgrade.test.sh`、`slice-rules.test.sh`、`frontier.test.sh`。分類：隨對應功能 **(a)**；`manifest`、`attribution`、`trigger` 屬 **(b)**。

### 2.4 Staged 未提交工作（雙宿主 extension）——狀態，不算漂移

`git -C omp-plugins diff --cached --stat` 顯示 37 個檔案，新增 3076 行、刪除 286 行。內容包含 `obw/pi.ts`、`session.ts`、`writeback.ts`、`issue.ts`、`workspace.ts`、`docs/dual-host-plan.md`、`tools/` 下的檢查腳本，以及 `.githooks/`。`index.ts` 從 HEAD 縮減約 300 行，`/issue` 的邏輯抽到共用的 `issue.ts`。

- **已完成（只有 pi 端）** — 計畫記錄 pi 的 A1–A9 與真實 pi／Obsidian 驗收已完成（`dual-host-plan.md:5,170,176-183`）。pi 註冊了 `/obw-bind`、`/obw-unbind`、`/obw-sync`、`/issue`（`obw/pi.ts:60,73,77,86`）。
- **OMP 端只有瀏覽** — `obw/README.md:11-14` 寫明 OMP 只有 `/issue` 瀏覽，bind、unbind、sync 都是「Not implemented」。跨宿主驗收 A10 也未完成（`dual-host-plan.md:196,200`）。
- **為何還在 staged** — repo 的 pre-commit hook 會跑 `bun run --cwd obw check`，而 OMP 官方 declarations 的三個上游型別錯誤會讓檢查失敗（`dual-host-plan.md:145,147-148`）。計畫只在 OMP 17.3.4 與 18.10.2 驗過這三個錯誤（148、158–162 行），規定不得 bypass hook（170 行）。
- **版本落差** — 計畫的基準是 pi 1.1.0、OMP 17.3.4（`dual-host-plan.md:21`），現在安裝的是 pi 1.4.0、omp 18.13.3。未驗證：在 18.13.3 下這三個 declaration 錯誤是否仍在，所以不知道 pre-commit 是否仍會擋下這批 staged 變更。我沒有執行檢查，因為本任務只讀不改。
- **pi 不載入 OMP skills** — pi manifest 的 skills 與 prompts 都是空清單（`obw/package.json` 的 `pi` 欄位；`obw/README.md:26`），所以 `/obw-init`、`/obw-jot`、`/obw-pm` 在 pi 上不能用。
- **計畫中提到 `cf`** — `dual-host-plan.md:36` 寫「不整合 `cf`」。cc 已刪除 context-flow／spiral（`de5039bf`），這句只是範圍排除，沒有依賴 `cf`，所以無害；改寫時可以順手刪掉。

---

## 3. spec（cc ↔ omp 0.1.3）

omp 的 spec 移植於 2026-09-16（`41fd471`），比 cc 的 `4a30048d`（09-21）、`1f23ec8e`（09-27）、`510038af`（10-06）都早，所以這三個 commit 的內容 omp 都沒有。

1. **glossary 指向已刪除的 context-flow** — omp `skills/glossary/SKILL.md:26` 寫「The mirror rule is context-flow's Design Vocabulary」。cc 的 `4f94974b` 把它改指 `deepen/agents/explorer.md`（cc `glossary/SKILL.md:26-28`）。omp repo 有 `deepen/agents/explorer.md`，而且裡面有 vocabulary 內容（grep 有命中）。分類：**(a)**。這是本次三個外掛中唯一指向 cc 已刪除元件的引用。
2. **新規則：check 必須先在違規版本上變紅** — cc `skills/spec/SKILL.md:131-136` 規定先做一次刻意違規的 scratch 修改並確認 check 變紅，而且不得對檔案執行 `git checkout`／`git restore`，因為工作區可能有使用者未提交的變更（commit `1f23ec8e`）。omp `spec/SKILL.md:118` 只寫到「第一天就紅代表 check 錯」。分類：**(a)**。
3. **「Propose an entry」步驟段** — cc `spec/SKILL.md:22-31`。omp 沒有。分類：**(a)**。
4. **範例改為不依賴特定 repo** — cc 的 `510038af` 把範例改成 `reviewer-cannot-edit`／`agents/reviewer.md`，把「main」改成「the user or the orchestrating session」，把「worker」改成「agent」（cc `spec/SKILL.md:55-58,66-68,140-141`）。omp 仍用本 repo 的 `judge-seats-cannot-edit`／`pi-dispatch/agents/reviewer.md`，以及「main accepts」（omp `spec/SKILL.md:49-52,133`）。分類：**(a)**。
5. **`test:` 與 `check:` 的優先順序** — cc `spec/SKILL.md:106-108` 說優先用 `check:`，`test:` 還不能執行，會被當成 prose 債務回報；omp `spec/SKILL.md:100` 寫的是 `test: > check: > prose`。分類：**(a)**，兩邊說法互相矛盾。
6. **還不能寫 check 時的範例** — cc `spec/SKILL.md:115-125` 補了「verdict 來自檔案」的實例。分類：**(a)**，小幅。
7. **omp 專屬段落** — omp `spec/SKILL.md:120-130` 規定 check 要驗可觀察的契約、不可 grep 實作字句，也規定 dispatch verdict 只是證據、不是建議。omp 另有 `OMP_PLUGIN_ROOT` 說明（omp `spec/SKILL.md:14`、`glossary/SKILL.md:12`）。分類：**(c)**。
8. **glossary 的 description** — cc `glossary/SKILL.md:4-7` 多了「使用者要求定義或命名領域詞」的觸發語。分類：**(a)**，小幅。
9. **`spec.sh` 的 scope 展開修正** — cc 的 `4a30048d` 加上 `set -f`，避免 `for g in $(scopes …)` 被 shell 依工作樹展開。omp 改用 `while IFS= read -r g`（omp `scripts/spec.sh:64-72`），不會做 glob 展開。我在暫存目錄實測：scope `nonexist/**/*.ts` 對尚不存在的路徑 `nonexist/new/z.ts`，即使目錄下已有其他 `.ts` 檔，仍能正確切出 entry（rc=0）。分類：**(c)**，行為已等價，不必移植。
10. **README** — cc 版有完整的 Problem／Solution 說明；omp 版是精簡的 OMP 用法（omp `README.md:1-12`）。分類：**(c)**。cc 的 `ca4902a2` 只改 README 一行，說明跨外掛解析。未驗證：這一行與 omp 是否相關，我沒有讀這個 diff。
11. **cc 獨有的測試** — `design-vocabulary.test.sh` 守住第 1 項的指向（cc `tests/design-vocabulary.test.sh:15-21`）；`behaviours`、`clean-architecture`、`lazy-creation`、`pure-glossary`、`format`、`readme` 守住 skill 文字。分類：**(a)**，隨文字一起移植。`mod-text-spec-scope.test.sh`（`25cadaa8`）守的是 cc repo 自己的 spec；`marketplace`、`attribution`、`trigger` 屬 **(b)**。
12. **evals/** — cc 的 `617443ae`。分類：**(b)**。

---

## 4. 範圍外但相關

- omp repo 仍保留 `cf/` 與 `spiral/` 兩個外掛目錄（`ls /Users/nickhuang/workspace/omp-plugins`），cc 已在 `de5039bf` 刪除它們，改用 `method` 外掛。omp 沒有 `method` 外掛。這不在本次三個外掛的範圍內，但協調者規劃大改時應一併考慮。
- 兩邊 viz 的 `docs/recipes-architecture.md:42` 都提到 spiral，屬歷史記錄；若 omp 刪掉 spiral，可以改寫這句。

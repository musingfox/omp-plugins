# SRT 工作專案隔離驗證

**已改用 ACP＋SRT，七項驗收已重新通過。工作者為 pi-acp 0.0.34 與 Pi 1.5.0，不是 OMP 原生執行檔。** 本票只交付可重現的隔離與效能實驗，未接入 muster。

## 重現與證據

在 macOS arm64 執行：

```sh
node docs/srt-isolation/run.mjs
```

需要本機 Node、npm、Bun、Pi 1.5.0、Git、clang／otool、原生 sandbox-exec，以及 OMP 的有效 OpenAI Luna 授權。這次使用 Node v24.13.0、OMP auth-gateway 18.18.7、SRT 0.0.82、pi-acp 0.0.34、ACP SDK 0.26.0；未安裝全域套件或改動使用者設定。

程式先建立私有暫存，複製實驗主控程式，分開安裝固定版本的 SRT 與 ACP adapter／SDK，核對 npm integrity，再執行邊界探針。任何探針失敗就停止，不會把未隔離執行當成備援。邊界通過後，才執行兩組真實 ACP 模型工作流程；未隔離組是明確要求的效能對照。

最後一次主控實跑回傳 `PASS`、結束碼 0，邊界探針共 97 項通過。證據保留於：

- 總表、各原始程式 SHA-256、adapter／SDK integrity：`/private/tmp/srt-verification-wuwXjq/acceptance.json`。
- 主控快照、套件 lockfile、生成的 Seatbelt 設定：`/private/tmp/srt-verification-wuwXjq/controller/`；ACP 套件另置於其中的 `acp/`，不對工作者開放整個主控套件目錄。
- Node／Bun 各項 stdout、stderr、結果與哨兵讀回：`/private/tmp/srt-check-xBSPoi/evidence.json`。
- 開發流程、快取與資源數據：`/private/tmp/srt-accept-sq6lCb/evidence.json`。
- 各組 ACP 握手、模型、工具通知、結束碼與完整 profile：上述開發目錄的 `baseline/`、`sandbox/`；事件檔為 `cold-worker.json`、`warm-worker.json`，獨立隔離驗證輸出為 `verification.log`。

每次重跑都產生新的私有路徑並印出總表。暫存中的證據不是永久儲存；本文件保留本次主要輸出，程式可重新產生完整資料。

2026-11-22 整理提交時，上述三份 JSON 證據已不在原暫存路徑，因此無法重新核對當次 `sourceHashes` 與本次原始碼快照；本文 PASS 與量測值保留為先前實驗紀錄，不是本次重新驗收。本次只重新通過九個 `.mjs` 的 `node --check` 與 C 探針的 `clang -fsyntax-only -Wall -Wextra -Werror`；未重跑會下載套件、呼叫真實模型的完整流程。

### ACP 路徑

主控以 ACP stdio 執行 `initialize`、`session/new`、`session/prompt`，兩組均實際協商 protocol version 1、agent `pi-acp@0.0.34`、模型 `bridge/luna`。使用已發布的社群 adapter，不自製假的 ACP server；adapter 內部仍以 Pi RPC 控制 Pi，主控不再直接使用 RPC 或提供 RPC 備援。

client 明確宣告 `fs.readTextFile=false`、`fs.writeTextFile=false`、`terminal=false`，MCP servers 為空，拒絕主機代讀寫與代開 terminal。工具通知中的 terminal metadata 只記錄隔離內的 Bash，不會建立主機 terminal。embedded context 未啟用；模型橋接仍只接受文字。

adapter、SDK 與唯讀啟動器只安裝在當次實驗暫存，不新增 plugin 的宿主 agent SDK 相依，也不把 OMP SDK 打包進 plugin。啟動器固定實體 Node／npm／Git 路徑，避免模型轉義長路徑或誤選 `/usr/bin/git` 的 Xcode shim；沒有因此增加外部檔案或 IPC 授權。


## 隔離邊界

可信主控使用 SRT 0.0.82 的 macOS 函式庫產生設定，移除過寬的內建例外，再由**單一 sandbox-exec** 啟動真實 pi-acp adapter；其 Pi 工作者與所有工具、子程序繼承同一個核心隔離。未只包裝 Bash，也未修改 SRT 或 adapter 套件。這個版本的 SRT 內部 API 與設定格式已固定並檢查，格式不符時拒絕執行。

| 範圍 | 授權 |
| --- | --- |
| 每次工作副本、私有暫存 | 可讀寫；HOME、Pi 狀態、Node／npm 快取均在該次私有暫存內 |
| Node、Bun、Pi／npm、ACP adapter／SDK、Git 及其動態函式庫、系統工具、固定 fixture 與啟動器 | 明列唯讀例外，完整實體路徑列在 manifest.readOnly |
| 共用下載快取 | 唯讀，兩組工作重用同一個有 integrity 驗證的套件壓縮檔 |
| 工具鏈的中間 symlink | 僅明列物件的唯讀中繼資料，不授權整個 Homebrew |
| 授權路徑的祖先目錄 | 僅明列目錄的中繼資料；其他目錄的 stat 與列舉均遭拒 |
| 根目錄 / | 保留 SRT 的 literal 根目錄唯讀規則，不包含子孫路徑；移除此規則會讓本機 /usr/bin/true 啟動 abort |
| 整個 HOME、共用 /tmp、SRT 預設 /tmp/claude | 不開放；後者另加明確拒絕並以真實合成哨兵驗證 |
| SRT 程式、主控、隔離設定、權限答案 | 位於工作者可寫樹之外；寫入、刪除、搬移與父目錄置換遭拒 |

原始 SRT 設定曾讓工作者透過既有 hardlink 讀寫外部哨兵。本實驗由可信主控在工作者啟動前，從可信且不變動的合成專案來源複製出**不同 inode、nlink=1** 的新副本；隔離內另外禁止 file-link。工作者能修改自己的複本，但外部原始哨兵維持不變。來源 symlink 不會被跟隨複製；工作副本內另建的外部 symlink 也無法越界。

此準備程序的前提是來源由可信主控建立，複製時沒有外部攻擊者同步修改。這不是任意共享來源目錄的競態安全複製器，也不宣稱能防禦惡意主機程序、核心漏洞或所有旁路。

### IPC 與模型授權

- SRT 內建 Mach 服務清單及 SecurityServer 例外均移除；Mach lookup、Apple Events、lsopen、POSIX 共享記憶體／semaphore、使用者偏好代理均拒絕。
- Docker／SSH-agent 使用合成 Unix socket 測試。主控在隔離執行前後都能連線，工作者無連線到達；Node 回報 EPERM，Bun 的相同失敗映射為 ECONNREFUSED，因此同時核對接收端計數與前後正向對照。
- 主控能取得 Launch Services、Apple Events、securityd 的 Mach 服務；隔離程序的相同查找失敗。測試不向真實應用程式送開檔請求，也不讀取憑證內容。
- 工作者只可連線到每次工作專用的 `127.0.0.1:動態埠`。該埠由主控持有；工作者不能綁定埠或接受連線。其他 loopback 埠由真實 Pi 子程序測得 EPERM，接收端也有正向對照。
- 此埠只接受經當次隨機 bearer token 授權的 `POST /v1/chat/completions`，模型固定為 `openai-codex/gpt-6-luna`、low。實際埠與允許路徑寫在各組 manifest；token 只放在該次私有 Pi 模型設定。
- 主控橋接程序透過既有 OMP `auth-gateway stdio` 呼叫真實 OpenAI；主機憑證不交給工作者。這個可信程序不另受本實驗的網域防火牆限制，但對工作者沒有檔案、命令執行、任意 CONNECT 或其他模型的代理介面。
- 橋接只接收文字內容，拒絕 file／image URL，避免上游內容轉換替工作者讀主機檔案或抓取任意 URL。合成 file URL 與本機 HTTP URL 均回傳 400，HTTP 哨兵沒有收到連線。
- 未傳入主控權限 fd；另以主控已開啟的合成哨兵 fd 驗證沒有繼承到工作者。

### 允許與拒絕輸出

| 案例 | 本次結果 |
| --- | --- |
| 絕對／相對外部路徑、symlink、目錄中繼資料／列舉 | EPERM |
| 新建外部／共用快取 hardlink | EPERM |
| 修改私有 hardlink 複本 | 成功；外部仍為 SYNTHETIC-ONLY |
| Node fs、Bun.file／Bun.write、子程序、孫程序 | 越界遭拒；私有暫存寫入後可讀回 |
| 共用下載快取寫入、刪除、搬移、hardlink | 遭拒；套件 SHA-512 未變 |
| 主控設定、SRT 程式與權限答案的改寫／刪除／搬移 | 遭拒 |
| 缺少 sandbox-exec | 主控明確拒絕，未啟動工作者 |
| 損壞 Seatbelt 設定 | 結束碼 65，子程序 marker 不存在 |
| 損壞 SRT JSON | 結束碼 1，Refusing to run with the built-in defaults；marker 不存在 |
| 無模型 token／其他 API 路徑／其他模型／非文字內容 | 分別回傳 401／404／403／400 |

## 真實開發流程與快取

共用下載檔為 `is-number@7.0.0`，由可信主控預先下載；工作者沒有 npm registry 連線例外。工作者以真實 npm 離線安裝，私有 npm 快取、node_modules 與 dist 都按工作分開，依賴與建置檔的 nlink 均為 1。這不代表工作者能直接下載任意依賴。

真實 ACP 工作者先透過本機 Bash 執行唯讀 `srt-prepare`，完成網路／外部路徑／快取探針、冷暖離線安裝與預期失敗的原始檢查。安裝時間由固定程式量測實際子程序，不含模型往返；主控從該次 ACP 工具的 terminal output 取得結果，核對真正的完成結束碼及主控 TCP 接收計數。接著 Luna 實際讀取專案、修改 `slug.mjs`、檢查、建置並提交。工作者關閉後，主控另啟動受 SRT 限制的固定驗證程式，重新執行檢查／建置／Git 查詢，核對測試與設定檔 SHA-256 未變、產物內容、nlink=1 及提交差異；不在未隔離主控中執行模型改過的專案程式。兩組都只有 `slug.mjs` 出現在最後提交中。

```text
CHECK_OK: slug and installed dependency
BUILD_OK
SANDBOX_TCP_DENIED:EPERM
OUTSIDE_ABSOLUTE_RELATIVE_SYMLINK_READ_WRITE_DENIED; CACHE_WRITE_UNLINK_RENAME_HARDLINK_DENIED
```

合成專案提交：

- 未隔離：`4d1da88ed978b35d50b576ff573216a1d50a6c49`。
- 隔離：`4a9dccc4f9c5d0055438ed922a733a5dd89ac511`。

這些提交只存在於暫存合成專案，沒有提交或重寫 omp-plugins 的 Git 歷史。

## 效能測量

相同 ACP adapter、Pi、Luna、工具清單、專案與目標，各測一組未隔離及隔離流程。冷啟動是新私有 Node／Pi 狀態，暖啟動重用同一次工作的私有狀態。兩組皆使用預載的同一份唯讀下載檔；冷／暖依賴快取指空的／已有資料的私有 npm 快取，暖安裝前移除自己的 node_modules 再安裝。沒有清除作業系統頁面快取；以下均為新 ACP 量測，未沿用舊 Pi RPC 數字。

啟動時間從 spawn 到 ACP initialize 與可用的 session/new 完成，排除模型往返。為保持設定一致，對照組也產生相同環境設定，但不套用 Seatbelt；設定產生時間另外列出。差值為隔離減未隔離。

| 測量 | 未隔離 | 隔離 | 差值 |
| --- | ---: | ---: | ---: |
| 冷啟動（毫秒） | 1531.25 | 311.56 | -1219.70 |
| 暖啟動（毫秒） | 1388.12 | 339.90 | -1048.22 |
| 冷依賴快取安裝（毫秒） | 309.38 | 363.99 | 54.61 |
| 暖依賴快取安裝（毫秒） | 193.64 | 172.84 | -20.79 |
| 設定產生（毫秒，另計） | 14.81 | 10.85 | -3.95 |
| 準備工具流程（秒） | 4.80 | 6.24 | 1.44 |
| 模型修正工具流程（秒） | 12.75 | 11.92 | -0.82 |
| 模型 API 請求數 | 7 | 7 | 0 |

準備與修正工具流程包含網路、模型生成及工具輪數，不能把其差值當成隔離成本。本次對照組啟動明顯較慢，未分離啟動內部因素；單次、依序執行的樣本及負差值不能證明隔離比較快，也不是純 Seatbelt 成本的可靠估計。

| 程序／狀態 | 取樣窗口（秒） | 工作者峰值 RSS（MiB） | 主控 gateway 峰值 RSS（MiB） | 工作者閒置 CPU（秒） | gateway 閒置 CPU（秒） |
| --- | ---: | ---: | ---: | ---: | ---: |
| 未隔離／冷 | 5.082 | 202.91 | 303.44 | 0.00 | 0.01 |
| 未隔離／暖 | 5.095 | 192.83 | 315.33 | 0.00 | 0.02 |
| 隔離／冷 | 5.105 | 200.53 | 303.48 | 0.00 | 0.06 |
| 隔離／暖 | 5.115 | 201.33 | 314.66 | 0.00 | 0.03 |

每 250 毫秒以 ps 取樣，工作者範圍包含 ACP adapter、Pi 與仍存活的完整子程序樹，本次各窗口均記錄到 adapter 與 Pi 兩個程序；gateway 是另外一棵主控 OMP 程序樹。RSS 為實際 resident set 的加總，共享頁面可能重複計數，並非記憶體配置上限。CPU 使用穩定 PID 樹的累積 TIME 差值；0.00 表示此解析度下沒有觀察到變化，不代表完全不耗 CPU。

上述 RSS 不含執行實驗與 SRT 函式庫的 Node 主控本身，因此不能據此宣稱整個主機隔離系統的總記憶體成本。數據只適用本次窗口與程序範圍，沒有與所有 VM、其他版本或 Gondolin 作通用比較。

## 適用範圍

本票七項驗收以完整 ACP adapter／Pi 工作者、可信合成來源及明列唯讀工具鏈完成。OMP 18.18.7 原生執行檔在隔離內啟動曾 SIGTRAP，尚未進入模型請求；改用 ACP 不代表解決此問題。本次沒有放寬邊界讓它啟動，也不把 Pi 結果當成 OMP 相容性證明。muster、多工作者排程及任意專案來源的安全匯入不在本實驗範圍。

官方依據：[SRT](https://github.com/anthropics/sandbox-runtime)、[ACP 架構](https://agentclientprotocol.com/get-started/architecture)、[ACP TypeScript SDK](https://agentclientprotocol.com/libraries/typescript)、[pi-acp adapter](https://github.com/svkozak/pi-acp)、[OMP 模型設定](https://github.com/can1357/oh-my-pi/blob/main/docs/models.md)，以及固定 Pi 1.5.0 隨附的 docs/models-configuration.md。SDK 介面以實際安裝的 0.26.0 宣告為準，不套用新版文件的 fluent API；套件版本、完整 integrity 與相依樹見當次 lockfile、主控快照及 manifest。

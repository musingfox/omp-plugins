# search-agent

讓代理透過使用者可觀看、可接手的 Search 瀏覽器操作網站；支援 OMP 與 Pi 的原生 MCP 工具，不自帶 MCP client 或傳輸層。伺服器提供相同的 14 項工具。

## 需求與設定

- macOS 上開啟 Search，並啟用 Settings → About → Developer → **Let coding agents use Search**。
- Python 3（僅使用標準函式庫）。
- OMP 19.1.0，或提供 `registerMcpServer` 的 Pi 1.5.0；不需要另外安裝宿主 SDK。
- OMP：`omp plugin link --local /abs/path/to/omp-plugins/search-agent`，重新啟動後用 `/mcp list` 確認套件伺服器 `search-agent:search`；工具名稱為 `mcp__search_agent_search_*`。
- Pi：`pi install /abs/path/to/omp-plugins/search-agent`，依 Pi 原生套件安裝方式載入。
  Pi 安裝後重新啟動，或用 `/reload` 載入；工具名稱為 `mcp__search__*`。若已有同名 `search` MCP 設定，它會優先於套件註冊，請先確認 `/mcp` 顯示來源為 extension。

不會自動修改全域設定、安裝或管理 Search token。OMP 與 Pi 的 MCP 工具命名不同；請依目前宿主發現的工具操作，不假設別名相同。

Search 的首次授權每次可等待 120 秒；尚未回答時會回傳 `waiting_for_person`。OMP 不另設 MCP 用戶端逾時；Pi 使用 300 秒逾時，避免預設 60 秒截斷授權。取消或關閉 MCP 程序的生命週期由宿主管理，不宣稱 Python server 支援 MCP cancellation notification。

上游完整來源：`32cf7767df50f7f13307253cde6c9be4a32e26ca`；功能提交：`7db86a2c1a8521a8db059cfca45ded68a8522e81`。

## 驗收（2026-11-22）

- Python server 與 license 經 `cmp` 確認與上述來源完全相同；MCP 握手協商 `2025-11-25`，列出全部 14 項工具。
- OMP 19.1.0：在隔離 agent 目錄透過原生 link 載入，確認 `search-agent:search` 與 14 項工具。實際瀏覽器流程則沿用既有帳號，在暫存專案的 MCP 設定指向同一支套件 server，避免既有全域設定遮蔽；不是只驗證握手。
- Pi 1.5.0：透過原生套件安裝與 extension 註冊，確認 14 項 direct 工具；搬移入口後重新載入也保持連線。
- 兩個真實宿主都經使用者在 Search 按 Allow，完成 `open_tab → read_page → close_tab → disconnect`，讀到 `https://example.com/` 的 `Example Domain` 標題與實際正文。Pi 另實際回傳過 `waiting_for_person`，在使用者授權後才繼續。
- Pi 入口置於 `pi/extension.ts`，而非套件根目錄，避免 OMP 的目錄自動掃描誤載 Pi 專用 API。獨立審查通過；沒有安裝 SDK 或自製 MCP 傳輸層。
- 其餘工具沿用未修改的來源實作，未宣稱全部逐項重驗。驗收分頁已關閉、連線已斷開，自有驗收終端與暫存 profiles／專案已清理；未修改既有全域 MCP 設定。

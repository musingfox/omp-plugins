---
name: wrap-up
description: Close out the current task using evidence-backed operations selected by the user and a 1–5 session rating. Use for /wrap-up, 收尾, 收一下, wrap up, or asking what remains to close a task.
---

# 收尾

先讀本次對話與工作目錄現況，再列出確有依據的操作；沒有依據就不列。若在 Git 倉庫，讀 `git status --short`、本次 diff 與相對 upstream 的未推送提交。不要修改或提交其他人的變更。

| 候選操作 | 必要依據 | 執行方式 |
|---|---|---|
| 更新文件 | 本次變更讓具體敘述過時 | 更新該文件與引用 |
| Commit | 本次任務的未提交變更 | 遵循倉庫提交規範；保留 hooks |
| Push／PR／Release | 未推送提交或明確的釋出需求 | 先讀專案流程；缺流程就詢問，不猜 |
| 更新任務卡 | 對話指名卡片，且進度、AC 或敘述需更新 | 用已載入的 pm 工具；否則讀該專案任務管理指引 |
| Memory／知識庫 | 值得跨會話保留、且 repo 未記錄的專案事實 | 只用目前宿主實際提供的工具 |
| 全域規則 | 使用者明確決定跨專案偏好 | 提出具體修改並取得逐項批准 |
| 設定／變數 | 對話已決定但尚未實施 | 使用現有設定介面，不跨改其他宿主 |

## 選擇與評分

提出一個 1–5 建議分數，衡量使用者實際拿到目標的程度，不是工作量：5 一次到位；4 達成但有小繞路；3 多次糾正後達成；2 只完成部分或方向需拉回；1 未達成。理由在 300 字內，先寫扣分事件（操作、使用者原話、額外輪次），無則寫「無糾正」；再寫目標與結果、值得保留的具體做法。

呼叫 `wrap_up_review` 一次，傳入：
- `operations`：每項的 `operation`、具體 `evidence` 與實際可用的 `tool`；無候選時傳空陣列。
- `suggested`：建議分數。
- `reason`：建議理由。

此原生工具顯示可切換的多選選單，再詢問評分與補充理由；宿主提供真實 session ID。使用者取消時不寫入評分，也不執行任何操作。工具不可用或非互動環境時，僅列出候選並說明前提；不得以文字猜分、猜 session ID 或自行執行評分腳本繞過互動。

工具先把評分追加到 `~/.local/share/omp-plugins/wrap-up/ratings.jsonl`，依 `host` + `session_id` 區分；同一會話重評會追加，聚合時取該組最後一筆。不讀寫其他宿主資料。評分寫入失敗就停止，不執行候選操作。

## 執行與收據

只執行工具回傳 `selected` 的項目，依序：文件 → 設定／全域規則 → Commit → Push／PR／Release → 任務卡 → Memory／知識庫。Push、release、封存／刪除及全域規則變更，勾選不算最終批准，執行前另行取得明確確認；取消或逾時不代表同意。

每一步取得真實收據：commit hash、push 回應、CLI 寫入後讀回的內容。任一步失敗就停止，列出錯誤與尚未執行的操作，不自動重試或繞過。最後精簡回報結果、待辦、各操作收據及 `ratingReceipt`；未選項目不得宣稱完成。

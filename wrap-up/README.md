# wrap-up

同步自 cc-plugins `4af9bcc6`，以 OMP／Pi 原生 extension 重寫選擇、評分與會話識別，不搬移 Claude 工具或資料。

- OMP：`omp plugin link --local /path/to/omp-plugins/wrap-up`。
- Pi：`pi install /path/to/omp-plugins/wrap-up`。
- 互動終端執行 `/wrap-up`。模型依對話提出有證據的操作，`wrap_up_review` 逐項切換選取，再詢問 1–5 評分與補充理由。直接 Enter 沿用建議理由；Esc 取消整次互動且不記分。
- 使用 `/skill:wrap-up`（Pi）或自動載入技能時，同樣必須經原生工具取得使用者選擇。僅載技能而沒有 extension 時不得執行評分。

評分追加到 `~/.local/share/omp-plugins/wrap-up/ratings.jsonl`，含 `host`、`session_id`、`project_path`、`score`、`suggested`、`reason`、`rated_at`。以宿主與會話 ID 為一組，重評取最後一筆；不讀寫 `~/.claude`。這個位置已由使用者核准。

Print、JSON、RPC 模式不開互動評分；不寫入、不代選、不執行收尾操作。評分失敗也不回傳操作授權。選取後仍需對 push、release、破壞性操作與全域規則變更另取明確批准。

本套件需要 Node 執行評分腳本；Pi 的 `typebox` 由宿主提供，不打包另一份。腳本測試：`bun test wrap-up/tests`。

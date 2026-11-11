# Fizzy

OMP／Pi 共用的 Fizzy CLI 技能；同步自 cc-plugins `4af9bcc6`，參考檔保留上游內容，入口增加 CLI 能力檢查。

需先安裝並登入 [Fizzy CLI](https://github.com/basecamp/fizzy-cli)，另需 `jq`。使用前執行 `fizzy auth status`；缺少 CLI 或登入時只回報前提，不代替使用者設定憑證。不可逆操作仍須明確授權。

本機驗證發現 `fizzy v3.0.3` 雖可登入，但缺少上游技能要求的 `account`、`--profile`、`--json`，回應也使用 `success` 而非 `ok`。因此本機完整功能尚不能驗收；技能會要求相容 CLI，不會猜替代指令或自動更新已安裝工具。

- OMP：`omp plugin link --local /path/to/omp-plugins/fizzy`，技能名稱 `fizzy`。
- Pi：`pi install /path/to/omp-plugins/fizzy`，以 `/skill:fizzy` 載入。

這是指引套件，不提供額外的 Fizzy API 或自動同步程序。

# NutriLens

NutriLens 是以 AI 協助辨識餐點的行動版飲食紀錄網站。餐點、常吃清單與每日目標保存在每個瀏覽器自己的 IndexedDB，不會同步到 D1 或 R2。

## 本機開發

需求：Node.js `>=22.13.0`。

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
```

## 裝置允許碼

執行下列指令會產生一組隨機允許碼，以及要設定到 Sites 的四個 secret。輸出只供管理者保存，不要提交到 Git。

```bash
npm run access:generate
```

需要設定：

- `NUTRILENS_ACCESS_CODE_HASH`
- `NUTRILENS_ACCESS_CODE_SALT`
- `NUTRILENS_ACCESS_SESSION_SECRET`
- `NUTRILENS_ACCESS_CODE_VERSION`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`（未設定時使用程式預設值）

更換允許碼時，重新產生 hash、salt 與 session secret，並提高 `NUTRILENS_ACCESS_CODE_VERSION`，所有舊裝置 cookie 會立即失效。

## 資料與照片

- IndexedDB 名稱：`nutrilens-device-v1`
- Object stores：`settings`、`meals`、`favorites`、`meta`
- JSON 備份格式：`schemaVersion: 3`，可匯入 v1、v2、v3
- 照片只在瀏覽器記憶體與畫面預覽中暫存，AI request 使用 `store: false`
- 每次儲存或離開頁面會清除照片內容，不會寫入 IndexedDB、D1 或 R2

不同手機、瀏覽器、一般模式與無痕模式使用不同資料空間。清除網站資料會刪除本機紀錄，換裝置必須使用 JSON 備份還原。

## 舊雲端資料搬移

目前保留 D1/R2 route 只供既有使用者搬移：

1. 使用原本 ChatGPT 帳號開啟網站。
2. 在設定執行「開始搬移並驗證」。
3. 系統把 snapshot 寫入 IndexedDB，重新讀取並核對餐點、常吃、目標與 SHA-256 指紋。
4. 驗證成功後自動下載 v3 JSON 備份。
5. 使用者再次確認後，才刪除目前帳號的 D1 rows 與 R2 photo prefix。
6. 系統重新查詢並確認餐點、常吃、設定與照片均為零。

所有既有帳號完成搬移後，才能進行第二階段：移除舊餐點 routes、D1/R2 bindings、Drizzle runtime dependencies 與照片設定。

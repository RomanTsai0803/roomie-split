# LINE 群組定時提醒功能 — 設計規格

## 概述

為 RoomieSplit（龍品小窩）新增 LINE 群組定時提醒功能，每月自動發送房租與帳單提醒訊息到室友 LINE 群組。

## 需求

- 每月 **28 號晚上 8 點（台灣時間）** 發送「房租 & 帳單提醒」
- 每月 **最後一天晚上 8 點（台灣時間）** 發送「月底結算」
- 訊息發送到 **LINE 群組**（3 人：劉傑、Aaron、Roman）
- 訊息包含每人本月應付總金額 + 收帳單提醒
- 排程時間固定寫在程式碼中，不做 UI 設定
- **零成本**，不使用任何付費服務

## 架構

```
GitHub Actions (cron schedule)
  → Node.js Script (scripts/send-reminder.js)
    → Firebase Admin SDK 讀取 Firestore 帳務資料
    → 計算每人應付總金額
    → LINE Messaging API Push Message 發送到群組
```

## 組件

### 1. LINE Official Account（Messaging API）

- 在 LINE Developers Console 建立 Messaging API Channel
- 取得 Channel Access Token
- 將官方帳號邀請進室友 LINE 群組
- 取得 Group ID（透過 webhook 或 API）
- 免費額度：每月 200 則，綽綽有餘

### 2. GitHub Actions Workflow（`.github/workflows/reminder.yml`）

單一 cron 排程（UTC 時間，台灣 = UTC+8）：

- `0 12 28-31 * *`（每月 28-31 號，UTC 12:00 = 台灣 20:00）

> 注意：cron 無法直接表達「每月最後一天」，因此 28-31 號都觸發，script 內部判斷今天日期決定行為：
> - **28 號** → 發送「房租 & 帳單提醒」
> - **當月最後一天** → 發送「月底結算」
> - **若 28 號同時是最後一天**（如二月）→ 兩則都發
> - **其他日期**（29-30 號且非最後一天）→ 跳過不發

Workflow 步驟：
1. Checkout repo
2. Setup Node.js 20
3. Install dependencies（firebase-admin, axios）
4. 執行 `node scripts/send-reminder.js`
5. 透過 GitHub Secrets 注入環境變數

### 3. Node.js Script（`scripts/send-reminder.js`）

**職責：**

1. 判斷觸發類型（28 號 or 最後一天）
2. 用 Firebase Admin SDK 連接 Firestore
3. 讀取 `config/main` 取得室友名單與固定費用設定
4. 讀取當月 `expenses` collection
5. 計算每人應付總金額（固定 + 變動）
6. 組合訊息文字
7. 呼叫 LINE Messaging API 發送到群組

**計算邏輯：**

複用 App.jsx 中的結算邏輯：
- 從 `fixedConfig` 取得每人固定費用（房租 + 均分項目）
- 從 `expenses` 加總每人變動費用
- 計算每人應付總金額 = 固定負擔 + 變動負擔

**最後一天判斷邏輯：**

```js
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const isLastDay = tomorrow.getDate() === 1;
```

### 4. 訊息格式

**28 號 — 房租 & 帳單提醒：**

```
龍品小窩 — 房租 & 帳單提醒

本月應付金額：
劉傑：$12,600
Aaron：$10,200
Roman：$9,600

趕快收帳單，要停水停電啦！
```

**最後一天 — 月底結算：**

```
龍品小窩 — 月底結算

本月應付金額：
劉傑：$12,600
Aaron：$10,200
Roman：$9,600

趕快收帳單，要停水停電啦！
```

> 金額為動態計算，從 Firestore 即時讀取。

### 5. Secrets（存在 GitHub Repository Secrets）

| Secret 名稱 | 用途 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK service account JSON |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API token |
| `LINE_GROUP_ID` | 目標 LINE 群組 ID |

## 檔案結構

```
roomie-split/
├── .github/workflows/
│   ├── deploy.yml              (既有)
│   └── reminder.yml            (新增)
├── scripts/
│   ├── send-reminder.js        (新增：主程式)
│   └── package.json            (新增：script 專用 dependencies)
└── ...
```

> `scripts/package.json` 獨立於前端的 `package.json`，只包含 `firebase-admin` 和 `axios`，避免污染前端依賴。

## 不包含

- 不做 App 設定頁面 UI
- 不做個別私訊（統一發群組）
- 不做 LINE 群組指令互動
- 不做結算轉帳明細（誰轉誰多少）
- 訊息不使用 emoji / icon

## 前置作業（需手動完成）

1. 在 LINE Developers Console 建立 Messaging API Channel
2. 取得 Channel Access Token
3. 將官方帳號邀進室友群組
4. 取得 Group ID
5. 在 Firebase Console 產生 service account key
6. 將以上 secrets 設定到 GitHub Repository Secrets

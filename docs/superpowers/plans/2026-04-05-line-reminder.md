# LINE 群組定時提醒功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每月自動從 Firestore 讀取帳務資料，計算每人應付金額，透過 LINE Messaging API 發送提醒到室友群組。

**Architecture:** GitHub Actions cron 每月 28-31 號觸發 Node.js script。Script 用 Firebase Admin SDK 讀取 Firestore，計算每人應付總金額，呼叫 LINE Push Message API 發送到群組。28 號發「房租 & 帳單提醒」，最後一天發「月底結算」。

**Tech Stack:** Node.js 20, Firebase Admin SDK, LINE Messaging API (axios), GitHub Actions

---

## 前置作業（需使用者手動完成）

以下步驟無法自動化，需在開始 coding 前完成：

### P1: 建立 LINE Messaging API Channel

1. 前往 https://developers.line.biz/
2. 登入你的 LINE 帳號
3. 建立一個新的 **Provider**（例如「龍品小窩」）
4. 在 Provider 下建立一個 **Messaging API Channel**
5. Channel 名稱設為「龍品小窩提醒」
6. 到 Channel 的 **Messaging API** 頁籤 → 最下面 **Channel access token** → 點 **Issue** 產生 token
7. 複製這個 token，等等要用

### P2: 將官方帳號加入 LINE 群組

1. 在 LINE Messaging API 頁籤找到 **Bot basic ID**（格式 `@xxx`）
2. 在 LINE app 中搜尋這個 ID，加為好友
3. 在 **Messaging API** 頁籤 → 確認 **Allow bot to join group chats** 是開啟的
4. 把這個官方帳號邀請進你們三人的 LINE 群組

### P3: 取得 LINE Group ID

官方帳號加入群組後，需要取得 Group ID。最簡單的方式：

1. 在 LINE Developers Console → 你的 Channel → **Messaging API** 頁籤
2. 設定 **Webhook URL** 為 `https://webhook.site`（到 https://webhook.site 取得一個臨時 URL）
3. 開啟 **Use webhook**
4. 在 LINE 群組裡隨便發一則訊息
5. 回到 webhook.site，找到收到的 JSON，裡面 `source.groupId` 就是 Group ID
6. 複製 Group ID
7. 完成後可以把 Webhook URL 清掉

### P4: 取得 Firebase Service Account Key

1. 前往 Firebase Console → 你的專案 `roomie-split-bac02`
2. 點 **齒輪** → **專案設定** → **服務帳戶** 頁籤
3. 點 **產生新的私密金鑰** → 下載 JSON 檔案
4. 複製整個 JSON 內容（等等要貼到 GitHub Secrets）

### P5: 設定 GitHub Repository Secrets

1. 前往 https://github.com/RomanTsai0803/roomie-split/settings/secrets/actions
2. 新增以下 3 個 secrets：

| Name | Value |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | P1 取得的 Channel access token |
| `LINE_GROUP_ID` | P3 取得的 Group ID |
| `FIREBASE_SERVICE_ACCOUNT` | P4 下載的 JSON 檔案**完整內容** |

---

## File Structure

```
roomie-split/
├── .github/workflows/
│   └── reminder.yml            (新增：cron 排程 workflow)
├── scripts/
│   ├── package.json            (新增：script 依賴)
│   ├── send-reminder.js        (新增：主程式 — 日期判斷 + 訊息組合 + 發送)
│   └── test-reminder.js        (新增：本地測試用 script)
```

---

## Task 1: 建立 scripts 專案骨架

**Files:**
- Create: `scripts/package.json`

- [ ] **Step 1: 建立 scripts/package.json**

```bash
mkdir -p /Users/roman/Documents/GitHub/roomie-split/scripts
```

寫入 `scripts/package.json`：

```json
{
  "name": "roomie-split-scripts",
  "private": true,
  "type": "module",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "axios": "^1.6.0"
  }
}
```

- [ ] **Step 2: 安裝依賴確認可用**

```bash
cd /Users/roman/Documents/GitHub/roomie-split/scripts
npm install
```

Expected: 成功安裝，產生 `node_modules/` 和 `package-lock.json`

- [ ] **Step 3: 將 node_modules 加入 gitignore**

確認根目錄 `.gitignore` 存在且包含 `node_modules/`。如果不存在，建立 `.gitignore`：

```
node_modules/
```

- [ ] **Step 4: Commit**

```bash
cd /Users/roman/Documents/GitHub/roomie-split
git add scripts/package.json scripts/package-lock.json .gitignore
git commit -m "feat: add scripts project skeleton for LINE reminder"
```

---

## Task 2: 建立 send-reminder.js 主程式

**Files:**
- Create: `scripts/send-reminder.js`

- [ ] **Step 1: 建立 send-reminder.js 完整程式碼**

寫入 `scripts/send-reminder.js`：

```js
import admin from "firebase-admin";
import axios from "axios";

// --- 環境變數 ---
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_GROUP_ID = process.env.LINE_GROUP_ID;
const FIREBASE_SA = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!LINE_TOKEN || !LINE_GROUP_ID || !FIREBASE_SA) {
  console.error("Missing environment variables. Required: LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID, FIREBASE_SERVICE_ACCOUNT");
  process.exit(1);
}

// --- Firebase 初始化 ---
const serviceAccount = JSON.parse(FIREBASE_SA);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// --- 日期判斷（台灣時間 UTC+8）---
function getTaiwanDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 3600000);
}

function isLastDayOfMonth(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
}

// --- 計算每人應付金額（複用 App.jsx 邏輯）---
function getBeneficiaries(forWho, roommates) {
  if (Array.isArray(forWho)) return roommates.filter((r) => forWho.includes(r.id));
  if (forWho === "all") return roommates;
  return roommates.filter((r) => r.id === forWho);
}

function calculateLiabilities(expenses, roommates, fixedConfig, yearMonth) {
  const monthlyExpenses = expenses.filter((e) => e.date.startsWith(yearMonth));
  const hasImportedFixed = monthlyExpenses.some((e) => e.configId);

  const statusMap = {};
  roommates.forEach((r) => {
    statusMap[r.id] = { name: r.name, fixedLiability: 0, variableLiability: 0 };
  });

  // 計算已匯入的帳務
  monthlyExpenses.forEach((item) => {
    const amount = Math.round(parseFloat(item.amount));
    const beneficiaries = getBeneficiaries(item.forWho, roommates);
    const count = beneficiaries.length;
    if (count === 0) return;

    const splitAmount = Math.ceil(amount / count);

    beneficiaries.forEach((r, idx) => {
      let liability;
      if (idx === 0) {
        liability = amount - splitAmount * (count - 1);
      } else {
        liability = splitAmount;
      }

      if (statusMap[r.id]) {
        if (item.configId) {
          statusMap[r.id].fixedLiability += liability;
        } else {
          statusMap[r.id].variableLiability += liability;
        }
      }
    });
  });

  // 如果本月未匯入固定費用，用設定檔計算預估值
  if (!hasImportedFixed) {
    roommates.forEach((r) => (statusMap[r.id].fixedLiability = 0));
    fixedConfig.forEach((cfg) => {
      const amount = Math.round(parseFloat(cfg.amount));
      const beneficiaries = getBeneficiaries(cfg.forWho, roommates);
      const count = beneficiaries.length;
      if (count === 0) return;

      const split = Math.ceil(amount / count);
      beneficiaries.forEach((r) => {
        if (statusMap[r.id]) statusMap[r.id].fixedLiability += split;
      });
    });
  }

  return Object.values(statusMap).map((p) => ({
    name: p.name,
    total: p.fixedLiability + p.variableLiability,
  }));
}

// --- 訊息組合 ---
function buildMessage(title, liabilities) {
  const lines = [`龍品小窩 — ${title}`, "", "本月應付金額："];

  liabilities.forEach((p) => {
    lines.push(`${p.name}：$${p.total.toLocaleString()}`);
  });

  lines.push("", "趕快收帳單，要停水停電啦！");

  return lines.join("\n");
}

// --- LINE 發送 ---
async function sendLineMessage(message) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    {
      to: LINE_GROUP_ID,
      messages: [{ type: "text", text: message }],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_TOKEN}`,
      },
    }
  );
}

// --- 主程式 ---
async function main() {
  const taiwanNow = getTaiwanDate();
  const day = taiwanNow.getDate();
  const isLast = isLastDayOfMonth(taiwanNow);
  const is28th = day === 28;

  console.log(`Taiwan date: ${taiwanNow.toISOString().slice(0, 10)}, day=${day}, is28th=${is28th}, isLastDay=${isLast}`);

  // 28 號或最後一天才發送，其他日期跳過
  if (!is28th && !isLast) {
    console.log("Not 28th or last day. Skipping.");
    process.exit(0);
  }

  // 讀取 Firestore 資料
  const configSnap = await db.collection("config").doc("main").get();
  if (!configSnap.exists) {
    console.error("config/main not found in Firestore");
    process.exit(1);
  }
  const { roommates, fixedConfig } = configSnap.data();

  const yearMonth = taiwanNow.toISOString().slice(0, 7);
  const expensesSnap = await db.collection("expenses").where("date", ">=", `${yearMonth}-01`).where("date", "<=", `${yearMonth}-31`).get();

  const expenses = expensesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  console.log(`Loaded ${roommates.length} roommates, ${fixedConfig.length} fixed configs, ${expenses.length} expenses for ${yearMonth}`);

  const liabilities = calculateLiabilities(expenses, roommates, fixedConfig, yearMonth);

  // 發送訊息
  const messagesToSend = [];

  if (is28th) {
    messagesToSend.push(buildMessage("房租 & 帳單提醒", liabilities));
  }

  if (isLast) {
    messagesToSend.push(buildMessage("月底結算", liabilities));
  }

  for (const msg of messagesToSend) {
    console.log("--- Sending message ---");
    console.log(msg);
    await sendLineMessage(msg);
    console.log("--- Sent! ---");
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
cd /Users/roman/Documents/GitHub/roomie-split
git add scripts/send-reminder.js
git commit -m "feat: add send-reminder.js for LINE monthly notifications"
```

---

## Task 3: 建立本地測試 script

**Files:**
- Create: `scripts/test-reminder.js`

這個 script 讓你在本地測試訊息內容，不會真的發 LINE 訊息。

- [ ] **Step 1: 建立 test-reminder.js**

寫入 `scripts/test-reminder.js`：

```js
/**
 * 本地測試用：模擬計算結果，印出訊息內容但不發送 LINE。
 *
 * 用法：
 *   node scripts/test-reminder.js [28|last|both]
 *
 * 需要環境變數 FIREBASE_SERVICE_ACCOUNT（或在同目錄放 service-account.json）
 * 不需要 LINE 相關環境變數。
 */
import admin from "firebase-admin";
import fs from "fs";

// 嘗試從環境變數或本地檔案載入 service account
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else if (fs.existsSync(new URL("./service-account.json", import.meta.url))) {
  const raw = fs.readFileSync(new URL("./service-account.json", import.meta.url), "utf8");
  serviceAccount = JSON.parse(raw);
} else {
  console.error("No Firebase credentials found.");
  console.error("Set FIREBASE_SERVICE_ACCOUNT env var or place service-account.json in scripts/");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// 複用 send-reminder.js 的計算函式（為了獨立測試，這裡直接複製）
function getBeneficiaries(forWho, roommates) {
  if (Array.isArray(forWho)) return roommates.filter((r) => forWho.includes(r.id));
  if (forWho === "all") return roommates;
  return roommates.filter((r) => r.id === forWho);
}

function calculateLiabilities(expenses, roommates, fixedConfig, yearMonth) {
  const monthlyExpenses = expenses.filter((e) => e.date.startsWith(yearMonth));
  const hasImportedFixed = monthlyExpenses.some((e) => e.configId);

  const statusMap = {};
  roommates.forEach((r) => {
    statusMap[r.id] = { name: r.name, fixedLiability: 0, variableLiability: 0 };
  });

  monthlyExpenses.forEach((item) => {
    const amount = Math.round(parseFloat(item.amount));
    const beneficiaries = getBeneficiaries(item.forWho, roommates);
    const count = beneficiaries.length;
    if (count === 0) return;

    const splitAmount = Math.ceil(amount / count);
    beneficiaries.forEach((r, idx) => {
      let liability;
      if (idx === 0) {
        liability = amount - splitAmount * (count - 1);
      } else {
        liability = splitAmount;
      }
      if (statusMap[r.id]) {
        if (item.configId) {
          statusMap[r.id].fixedLiability += liability;
        } else {
          statusMap[r.id].variableLiability += liability;
        }
      }
    });
  });

  if (!hasImportedFixed) {
    roommates.forEach((r) => (statusMap[r.id].fixedLiability = 0));
    fixedConfig.forEach((cfg) => {
      const amount = Math.round(parseFloat(cfg.amount));
      const beneficiaries = getBeneficiaries(cfg.forWho, roommates);
      const count = beneficiaries.length;
      if (count === 0) return;
      const split = Math.ceil(amount / count);
      beneficiaries.forEach((r) => {
        if (statusMap[r.id]) statusMap[r.id].fixedLiability += split;
      });
    });
  }

  return Object.values(statusMap).map((p) => ({
    name: p.name,
    total: p.fixedLiability + p.variableLiability,
  }));
}

function buildMessage(title, liabilities) {
  const lines = [`龍品小窩 — ${title}`, "", "本月應付金額："];
  liabilities.forEach((p) => {
    lines.push(`${p.name}：$${p.total.toLocaleString()}`);
  });
  lines.push("", "趕快收帳單，要停水停電啦！");
  return lines.join("\n");
}

// --- 主程式 ---
async function main() {
  const mode = process.argv[2] || "both"; // "28", "last", or "both"

  const configSnap = await db.collection("config").doc("main").get();
  if (!configSnap.exists) {
    console.error("config/main not found in Firestore");
    process.exit(1);
  }
  const { roommates, fixedConfig } = configSnap.data();

  const now = new Date();
  const yearMonth = now.toISOString().slice(0, 7);
  const expensesSnap = await db
    .collection("expenses")
    .where("date", ">=", `${yearMonth}-01`)
    .where("date", "<=", `${yearMonth}-31`)
    .get();

  const expenses = expensesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  console.log(`Loaded: ${roommates.length} roommates, ${fixedConfig.length} fixed, ${expenses.length} expenses (${yearMonth})`);
  console.log("");

  const liabilities = calculateLiabilities(expenses, roommates, fixedConfig, yearMonth);

  if (mode === "28" || mode === "both") {
    console.log("=== 28號訊息 ===");
    console.log(buildMessage("房租 & 帳單提醒", liabilities));
    console.log("");
  }

  if (mode === "last" || mode === "both") {
    console.log("=== 最後一天訊息 ===");
    console.log(buildMessage("月底結算", liabilities));
    console.log("");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: 將 service-account.json 加入 gitignore**

在根目錄 `.gitignore` 追加：

```
scripts/service-account.json
```

> 這個檔案包含 Firebase 私密金鑰，絕對不能 commit。

- [ ] **Step 3: 本地測試**

把 P4 下載的 service account JSON 放到 `scripts/service-account.json`，然後執行：

```bash
cd /Users/roman/Documents/GitHub/roomie-split/scripts
node test-reminder.js both
```

Expected: 印出類似以下內容（金額依實際 Firestore 資料）：

```
Loaded: 3 roommates, 4 fixed, 0 expenses (2026-04)

=== 28號訊息 ===
龍品小窩 — 房租 & 帳單提醒

本月應付金額：
劉傑：$12,600
Aaron：$10,200
Roman：$9,600

趕快收帳單，要停水停電啦！

=== 最後一天訊息 ===
龍品小窩 — 月底結算

本月應付金額：
劉傑：$12,600
Aaron：$10,200
Roman：$9,600

趕快收帳單，要停水停電啦！
```

- [ ] **Step 4: Commit**

```bash
cd /Users/roman/Documents/GitHub/roomie-split
git add scripts/test-reminder.js .gitignore
git commit -m "feat: add local test script for LINE reminder"
```

---

## Task 4: 建立 GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/reminder.yml`

- [ ] **Step 1: 建立 reminder.yml**

寫入 `.github/workflows/reminder.yml`：

```yaml
name: Monthly LINE Reminder

on:
  schedule:
    # 每月 28-31 號，UTC 12:00 = 台灣時間 20:00
    - cron: "0 12 28-31 * *"
  # 允許手動觸發（測試用）
  workflow_dispatch:

jobs:
  send-reminder:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install script dependencies
        run: cd scripts && npm install

      - name: Run reminder script
        env:
          LINE_CHANNEL_ACCESS_TOKEN: ${{ secrets.LINE_CHANNEL_ACCESS_TOKEN }}
          LINE_GROUP_ID: ${{ secrets.LINE_GROUP_ID }}
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: node scripts/send-reminder.js
```

- [ ] **Step 2: Commit**

```bash
cd /Users/roman/Documents/GitHub/roomie-split
git add .github/workflows/reminder.yml
git commit -m "feat: add GitHub Actions workflow for monthly LINE reminder"
```

---

## Task 5: 端到端測試

- [ ] **Step 1: 確認前置作業完成**

確認 P1-P5 都已完成：
- LINE Channel Access Token 已取得
- 官方帳號已加入群組
- Group ID 已取得
- Firebase Service Account Key 已取得
- GitHub Secrets 已設定（3 個）

- [ ] **Step 2: Push 到 GitHub**

```bash
cd /Users/roman/Documents/GitHub/roomie-split
git push origin main
```

- [ ] **Step 3: 手動觸發 workflow 測試**

1. 前往 https://github.com/RomanTsai0803/roomie-split/actions
2. 左側點 **Monthly LINE Reminder**
3. 右側點 **Run workflow** → **Run workflow**
4. 等待執行完成（約 30 秒）
5. 如果今天不是 28 號或最後一天，log 會顯示 "Not 28th or last day. Skipping."

若要強制測試發送，臨時修改 `send-reminder.js` 的日期判斷：

將 main() 中這段：
```js
if (!is28th && !isLast) {
```
改為：
```js
if (false && !is28th && !isLast) {
```

Push 後手動觸發，確認 LINE 群組收到訊息。測試完後記得改回來。

- [ ] **Step 4: 確認 LINE 群組收到訊息**

檢查 LINE 群組是否收到格式正確的提醒訊息。

- [ ] **Step 5: 還原測試修改並 commit**

如果有修改日期判斷，記得改回來：

```js
if (!is28th && !isLast) {
```

```bash
git add scripts/send-reminder.js
git commit -m "test: verify LINE reminder e2e, restore date check"
git push origin main
```

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

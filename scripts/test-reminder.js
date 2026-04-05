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

// 複用 send-reminder.js 的計算函式
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

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Users, DollarSign, Calculator, Calendar, CheckCircle, Zap, Activity, Settings, RefreshCw, Save, AlertTriangle, Layers, X, History, FileText, Cloud, CloudOff } from 'lucide-react';

// --- FIREBASE 設定區 ---
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, 
  onSnapshot, query, orderBy, writeBatch, setDoc 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCkHcGr6dGwNupi8-zRoe7892DOrcSZL18",
  authDomain: "roomie-split-bac02.firebaseapp.com",
  projectId: "roomie-split-bac02",
  storageBucket: "roomie-split-bac02.firebasestorage.app",
  messagingSenderId: "174940687352",
  appId: "1:174940687352:web:4446c8e63b1335d910640d",
  measurementId: "G-0L3WSBNVLT"
};

// 初始化 Firebase
let db;
const isFirebaseReady = Object.keys(firebaseConfig).length > 0;
if (isFirebaseReady) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

// ------------------------------------------------

// 初始室友名單
const INITIAL_ROOMMATES = [
  { id: '1', name: '劉傑', color: 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' },
  { id: '2', name: 'Aaron', color: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' },
  { id: '3', name: 'Roman', color: 'bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]' },
];

// 預設固定費用設定
const INITIAL_FIXED_CONFIG = [
  { id: 'f1', title: '劉傑房租', amount: 12600, forWho: '1' },
  { id: 'f2', title: 'Aaron房租', amount: 10200, forWho: '2' },
  { id: 'f3', title: 'Roman房租', amount: 9600, forWho: '3' },
  { id: 'f4', title: '大樓管理費', amount: 737, forWho: 'all' },
];

const App = () => {
  const [expenses, setExpenses] = useState([]);
  const [roommates, setRoommates] = useState(INITIAL_ROOMMATES);
  const [fixedConfig, setFixedConfig] = useState(INITIAL_FIXED_CONFIG);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [dbStatus, setDbStatus] = useState(isFirebaseReady ? 'connecting' : 'local');
  
  const [newExpense, setNewExpense] = useState({
    description: '', amount: '', payerId: '1', forWho: 'all', date: new Date().toISOString().split('T')[0]
  });
  const [batchPayerId, setBatchPayerId] = useState('1');

  // --- 資料同步核心 (Firebase / LocalStorage) ---
  useEffect(() => {
    if (!isFirebaseReady) {
      const savedExp = localStorage.getItem('dragon_den_expenses');
      const savedRoom = localStorage.getItem('dragon_den_names');
      const savedFixed = localStorage.getItem('dragon_den_fixed_config');
      if (savedExp) setExpenses(JSON.parse(savedExp));
      if (savedRoom) setRoommates(JSON.parse(savedRoom));
      if (savedFixed) setFixedConfig(JSON.parse(savedFixed));
      return;
    }

    const q = query(collection(db, "expenses"), orderBy("date", "desc"));
    const unsubExpenses = onSnapshot(q, (snapshot) => {
      const loadedExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExpenses(loadedExpenses);
      setDbStatus('connected');
    }, (error) => {
      console.error("Firebase Error:", error);
      setDbStatus('error');
    });

    const unsubSettings = onSnapshot(doc(db, "config", "main"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.roommates) setRoommates(data.roommates);
        if (data.fixedConfig) setFixedConfig(data.fixedConfig);
      } else {
        setDoc(doc(db, "config", "main"), {
          roommates: INITIAL_ROOMMATES,
          fixedConfig: INITIAL_FIXED_CONFIG
        });
      }
    });

    return () => { unsubExpenses(); unsubSettings(); };
  }, []);

  useEffect(() => {
    if (!isFirebaseReady) {
      localStorage.setItem('dragon_den_expenses', JSON.stringify(expenses));
      localStorage.setItem('dragon_den_names', JSON.stringify(roommates));
      localStorage.setItem('dragon_den_fixed_config', JSON.stringify(fixedConfig));
    }
  }, [expenses, roommates, fixedConfig]);

  useEffect(() => {
    setNewExpense(prev => ({ ...prev, date: `${selectedMonth}-01` }));
  }, [selectedMonth]);

  // --- 資料庫操作封裝 ---
  const addExpenseToDb = async (expenseData) => {
    if (isFirebaseReady) {
      const { id, ...data } = expenseData;
      await addDoc(collection(db, "expenses"), data);
    } else {
      setExpenses([expenseData, ...expenses]);
    }
  };

  const deleteExpenseFromDb = async (id) => {
    if (isFirebaseReady) {
      await deleteDoc(doc(db, "expenses", id));
    } else {
      setExpenses(expenses.filter(e => e.id !== id));
    }
  };

  const updateSettingsInDb = async (newRoommates, newFixedConfig) => {
    if (isFirebaseReady) {
      await updateDoc(doc(db, "config", "main"), {
        roommates: newRoommates || roommates,
        fixedConfig: newFixedConfig || fixedConfig
      });
    } else {
      if (newRoommates) setRoommates(newRoommates);
      if (newFixedConfig) setFixedConfig(newFixedConfig);
    }
  };

  const batchOperationToDb = async (itemsToAdd, idsToDelete) => {
    if (isFirebaseReady) {
      const batch = writeBatch(db);
      if (itemsToAdd) {
        itemsToAdd.forEach(item => {
          const docRef = doc(collection(db, "expenses"));
          const { id, ...data } = item;
          batch.set(docRef, data);
        });
      }
      if (idsToDelete) {
        idsToDelete.forEach(id => {
          const docRef = doc(db, "expenses", id);
          batch.delete(docRef);
        });
      }
      await batch.commit();
    } else {
      let newExp = [...expenses];
      if (idsToDelete) newExp = newExp.filter(e => !idsToDelete.includes(e.id));
      if (itemsToAdd) newExp = [...itemsToAdd, ...newExp];
      setExpenses(newExp);
    }
  };

  // --- 計算邏輯 ---
  const stats = useMemo(() => {
    const monthlyExpenses = expenses.filter(e => e.date.startsWith(selectedMonth));
    const totalSpent = monthlyExpenses.reduce((sum, item) => sum + Math.round(parseFloat(item.amount)), 0);
    const hasImportedFixed = monthlyExpenses.some(e => e.configId);

    const statusMap = {};
    roommates.forEach(r => {
      statusMap[r.id] = { ...r, paid: 0, liability: 0, balance: 0, fixedLiability: 0, variableLiability: 0, breakdown: { fixed: [], variable: [] } };
    });

    monthlyExpenses.forEach(item => {
      const amount = Math.round(parseFloat(item.amount));
      if (statusMap[item.payerId]) statusMap[item.payerId].paid += amount;

      if (item.forWho === 'all') {
        const count = roommates.length;
        const split = Math.round(amount / count);
        roommates.forEach(r => {
          let liability = (r.id === item.payerId) ? amount - (split * (count - 1)) : split;
          statusMap[r.id].liability += liability;
          const detail = { desc: item.description, amt: liability };
          if (item.configId) {
            statusMap[r.id].fixedLiability += liability;
            statusMap[r.id].breakdown.fixed.push(detail);
          } else {
            statusMap[r.id].variableLiability += liability;
            statusMap[r.id].breakdown.variable.push(detail);
          }
        });
      } else if (statusMap[item.forWho]) {
        statusMap[item.forWho].liability += amount;
        const detail = { desc: item.description, amt: amount };
        if (item.configId) {
          statusMap[item.forWho].fixedLiability += amount;
          statusMap[item.forWho].breakdown.fixed.push(detail);
        } else {
          statusMap[item.forWho].variableLiability += amount;
          statusMap[item.forWho].breakdown.variable.push(detail);
        }
      }
    });

    const projectedFixed = {};
    roommates.forEach(r => projectedFixed[r.id] = 0);
    fixedConfig.forEach(cfg => {
      const amount = Math.round(parseFloat(cfg.amount));
      if (cfg.forWho === 'all') {
        const split = Math.round(amount / roommates.length);
        roommates.forEach(r => projectedFixed[r.id] += split);
      } else if (projectedFixed[cfg.forWho] !== undefined) projectedFixed[cfg.forWho] += amount;
    });

    const balances = Object.values(statusMap).map(p => ({ ...p, balance: p.paid - p.liability }));
    let debtors = balances.filter(b => b.balance < -0.1).sort((a, b) => a.balance - b.balance);
    let creditors = balances.filter(b => b.balance > 0.1).sort((a, b) => b.balance - a.balance);
    const transactions = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      let amount = Math.min(Math.abs(debtors[i].balance), creditors[j].balance);
      transactions.push({ from: debtors[i].name, to: creditors[j].name, amount: amount.toFixed(0) });
      debtors[i].balance += amount; creditors[j].balance -= amount;
      if (Math.abs(debtors[i].balance) < 0.1) i++; if (creditors[j].balance < 0.1) j++;
    }

    return { monthlyExpenses, totalSpent, balances, transactions, hasImportedFixed, projectedFixed };
  }, [expenses, roommates, fixedConfig, selectedMonth]);

  // --- 操作 ---
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) return;
    const expense = { id: Date.now().toString(), ...newExpense, amount: Math.round(parseFloat(newExpense.amount)) };
    await addExpenseToDb(expense);
    setNewExpense({ description: '', amount: '', payerId: '1', forWho: 'all', date: selectedMonth + '-01' });
    alert('已新增');
  };

  const handleBatchImport = async () => {
    const existing = expenses.filter(e => e.configId && e.date.startsWith(selectedMonth));
    if (existing.length > 0) {
      if (!window.confirm(`本月已匯入過，要更新金額嗎？(這會刪除舊紀錄並重新寫入)`)) return;
      const idsToDelete = existing.map(e => e.id);
      const newItems = fixedConfig.map((cfg, idx) => ({
        id: (Date.now() + idx).toString(), configId: cfg.id, description: `${cfg.title} (固定)`, amount: Math.round(parseFloat(cfg.amount)), payerId: batchPayerId, forWho: cfg.forWho, date: `${selectedMonth}-01`
      }));
      await batchOperationToDb(newItems, idsToDelete);
    } else {
      if (!window.confirm(`確定匯入 ${selectedMonth} 的固定支出？`)) return;
      const newItems = fixedConfig.map((cfg, idx) => ({
        id: (Date.now() + idx).toString(), configId: cfg.id, description: `${cfg.title} (固定)`, amount: Math.round(parseFloat(cfg.amount)), payerId: batchPayerId, forWho: cfg.forWho, date: `${selectedMonth}-01`
      }));
      await batchOperationToDb(newItems, null);
    }
    setActiveTab('dashboard');
  };

  const deleteExpense = async (id) => { if (window.confirm('刪除此筆？')) await deleteExpenseFromDb(id); };
  const deleteCurrentMonthData = async () => {
    if (window.confirm(`確定清空 ${selectedMonth} 所有資料？`)) {
      const ids = expenses.filter(e => e.date.startsWith(selectedMonth)).map(e => e.id);
      await batchOperationToDb(null, ids);
    }
  };

  // --- 設定更新 ---
  const updateRoommateName = (idx, newName) => {
    const newR = [...roommates];
    newR[idx].name = newName;
    updateSettingsInDb(newR, null);
  };

  const updateFixedConfig = (id, field, value) => {
    const newConfig = fixedConfig.map(item => item.id === id ? { ...item, [field]: value } : item);
    updateSettingsInDb(null, newConfig);
  };
  
  const addFixedConfig = () => {
    const newConfig = [...fixedConfig, { id: `f${Date.now()}`, title: '新費用項目', amount: 0, forWho: 'all' }];
    updateSettingsInDb(null, newConfig);
  };
  
  const removeFixedConfig = (id) => {
    if (window.confirm('確定要刪除此固定費用項目設定嗎？')) {
      const newConfig = fixedConfig.filter(c => c.id !== id);
      updateSettingsInDb(null, newConfig);
    }
  };

  const AmountWithDetail = ({ amount, details, colorClass, title }) => {
    const [showDetail, setShowDetail] = useState(false);
    if (!details?.length) return <div className={`text-xs font-mono text-center ${colorClass}`}>${amount.toLocaleString()}</div>;
    return (
      <>
        <div onClick={() => setShowDetail(true)} className={`text-xs font-mono text-center border-b border-dashed border-slate-600 active:text-cyan-400 active:border-cyan-400 cursor-pointer ${colorClass}`}>${amount.toLocaleString()}</div>
        {showDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDetail(false)}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-slate-800 px-4 py-3 flex justify-between items-center"><h4 className="text-sm font-bold text-white flex gap-2"><FileText size={14}/>{title}</h4><button onClick={() => setShowDetail(false)}><X size={18} className="text-slate-400"/></button></div>
              <div className="p-4 max-h-60 overflow-y-auto">
                {details.map((d, i) => <div key={i} className="flex justify-between py-2 border-b border-slate-800"><span className="text-xs text-slate-300">{d.desc}</span><span className="text-sm font-mono text-cyan-400">${d.amt}</span></div>)}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button onClick={() => setActiveTab(id)} className={`flex flex-col items-center justify-center w-full py-3 relative ${activeTab === id ? 'text-cyan-400' : 'text-slate-600'}`}>
      <div className={`absolute top-0 w-12 h-1 bg-cyan-500 rounded-b-full transition-all ${activeTab === id ? 'opacity-100' : 'opacity-0'}`}></div>
      <Icon size={24} className="mb-1" /><span className="text-[12px] font-bold">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans max-w-md mx-auto relative">
      <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-500 z-50"></div>
      <header className="bg-slate-900/80 backdrop-blur-md px-6 py-4 border-b border-slate-800 z-10">
        <h1 className="text-xl font-black text-white italic flex items-center gap-2"><Activity className="text-cyan-400"/>龍品小窩</h1>
        <p className="text-[10px] text-slate-500 font-mono tracking-widest flex items-center gap-1">
          GODDAMN MONTHLY FIXED EXPENSES
          {dbStatus === 'connected' ? <span className="text-emerald-500 flex items-center gap-1"><Cloud size={10}/>(SYNC)</span> : 
           <span className="text-slate-600 flex items-center gap-1"><CloudOff size={10}/>(LOCAL)</span>}
        </p>
        <div className="mt-2 flex items-center gap-2 bg-black/30 p-1.5 rounded-lg border border-slate-800/50">
           <History size={16} className="text-cyan-500 ml-2" />
           <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent text-white font-mono font-bold text-sm flex-1" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-5 scrollbar-hide">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {!isFirebaseReady && <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded text-amber-500 text-xs text-center">⚠️ 單機模式：請設定 Firebase 以啟用多人同步</div>}
            
            <div className={`rounded-lg p-4 border ${stats.hasImportedFixed ? 'bg-slate-900 border-emerald-500/30' : 'bg-slate-900 border-amber-500/50'}`}>
              <div className="flex justify-between items-center mb-3">
                 <h3 className={`font-bold text-xs uppercase flex gap-2 ${stats.hasImportedFixed ? 'text-emerald-400' : 'text-amber-500'}`}>{stats.hasImportedFixed ? <CheckCircle size={14}/> : <AlertTriangle size={14}/>} 固定費用</h3>
                 <span className={`text-[10px] px-2 py-0.5 rounded border ${stats.hasImportedFixed ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-500 border-amber-500/30'}`}>{stats.hasImportedFixed ? '已同步' : '未匯入'}</span>
              </div>
              {!stats.hasImportedFixed && (
                <div className="flex gap-2 items-center bg-black/20 p-2 rounded border border-slate-700">
                  <span className="text-[10px]">付款人:</span>
                  <select value={batchPayerId} onChange={(e) => setBatchPayerId(e.target.value)} className="bg-transparent text-white text-xs flex-1 font-bold outline-none">{roommates.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                  <button onClick={handleBatchImport} className="bg-amber-600 text-white px-3 py-1 rounded text-[10px] font-bold">匯入</button>
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-lg">
               <h3 className="font-bold text-cyan-500 text-xs uppercase mb-4 flex gap-2"><Layers size={14}/> 本月應付詳情 (點金額看明細)</h3>
               <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-[10px] text-slate-500 border-b border-slate-800 pb-2 text-center"><div className="text-left pl-2">Member</div><div>Fixed</div><div>Var</div><div>Total</div></div>
                  {stats.balances.map(p => (
                    <div key={p.id} className="grid grid-cols-4 gap-2 items-center p-2 rounded bg-black/20">
                       <div className="flex items-center gap-2 overflow-hidden"><div className={`w-1.5 h-6 rounded-sm flex-shrink-0 ${p.color}`}></div><span className="text-xs font-bold truncate">{p.name}</span></div>
                       <AmountWithDetail amount={stats.hasImportedFixed ? p.fixedLiability : stats.projectedFixed[p.id]} details={p.breakdown.fixed} title={`${p.name}固定`} colorClass={stats.hasImportedFixed ? 'text-slate-300' : 'text-amber-500/70 italic'} />
                       <AmountWithDetail amount={p.variableLiability} details={p.breakdown.variable} title={`${p.name}變動`} colorClass="text-slate-300" />
                       <div className="text-sm font-black font-mono text-cyan-400 text-center">${( (stats.hasImportedFixed ? p.fixedLiability : stats.projectedFixed[p.id]) + p.variableLiability).toLocaleString()}</div>
                    </div>
                  ))}
               </div>
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-5 relative overflow-hidden">
                <div className="flex justify-between items-start mb-6"><div><h2 className="text-xs font-mono text-cyan-500 uppercase">總流水 ({selectedMonth})</h2><div className="text-3xl font-black text-white">${stats.totalSpent.toLocaleString()}</div></div><Calculator className="text-slate-700" size={32}/></div>
                <div className="h-px bg-slate-700/50 mb-3"></div>
                {stats.transactions.length === 0 ? <div className="flex gap-3 py-2 text-emerald-400"><CheckCircle size={20}/><span className="font-bold">帳務平衡</span></div> : 
                  <div className="space-y-3">{stats.transactions.map((t, i) => <div key={i} className="flex justify-between bg-black/30 p-3 rounded border border-white/5"><div className="flex gap-2 text-sm"><span className="font-bold text-cyan-400">{t.from}</span><span className="text-slate-500">&gt;&gt;</span><span className="font-bold text-white">{t.to}</span></div><div className="font-mono font-bold text-emerald-400">${t.amount}</div></div>)}</div>}
            </div>
          </div>
        )}

        {activeTab === 'add' && (
          <form onSubmit={handleAddExpense} className="bg-slate-900 rounded-lg p-6 space-y-6 border border-slate-800">
             <h2 className="text-xl font-black text-center text-white">手動輸入款項</h2>
             <div className="space-y-4">
               <div><label className="text-[10px] font-bold text-cyan-500 block mb-1">日期</label><input type="date" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} className="w-full bg-black/40 border border-slate-700 rounded p-3 text-white text-sm" /></div>
               <div><label className="text-[10px] font-bold text-cyan-500 block mb-1">金額</label><div className="relative"><DollarSign className="absolute left-3 top-3 text-slate-500" size={20}/><input type="number" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} placeholder="0" className="w-full bg-black/40 border border-slate-700 rounded p-3 pl-10 text-white text-xl font-bold" /></div></div>
               <div><label className="text-[10px] font-bold text-cyan-500 block mb-1">項目</label><input type="text" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} placeholder="項目名稱..." className="w-full bg-black/40 border border-slate-700 rounded p-3 text-white" /></div>
               <div className="grid grid-cols-2 gap-4">
                 <div><label className="text-[10px] text-cyan-500 block mb-1">誰付的?</label><select value={newExpense.payerId} onChange={e => setNewExpense({...newExpense, payerId: e.target.value})} className="w-full bg-black/40 border border-slate-700 rounded p-3 text-white text-sm">{roommates.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
                 <div><label className="text-[10px] text-cyan-500 block mb-1">誰分擔?</label><select value={newExpense.forWho} onChange={e => setNewExpense({...newExpense, forWho: e.target.value})} className="w-full bg-black/40 border border-slate-700 rounded p-3 text-white text-sm"><option value="all">全體均分</option>{roommates.map(r => <option key={r.id} value={r.id}>僅 {r.name}</option>)}</select></div>
               </div>
             </div>
             <button type="submit" className="w-full bg-cyan-600 text-white font-bold py-4 rounded flex justify-center gap-2"><Plus size={18} strokeWidth={3}/> 確認新增</button>
          </form>
        )}

        {activeTab === 'expenses' && (
           <div className="space-y-3">
             <div className="flex justify-between items-center"><h2 className="text-xl font-black text-white">{selectedMonth} 紀錄</h2><span className="text-xs bg-cyan-900/20 text-cyan-500 px-2 py-1 rounded">{stats.monthlyExpenses.length} 筆</span></div>
             {stats.monthlyExpenses.map(item => (
               <div key={item.id} className="bg-slate-900 p-4 rounded border border-slate-800 flex justify-between items-center">
                 <div className="flex gap-3 items-center">
                   <div className={`w-1 h-10 rounded-full ${roommates.find(r => r.id === item.payerId)?.color}`}></div>
                   <div><div className="font-bold text-white text-sm">{item.description}</div><div className="text-[10px] text-slate-500">{item.date} • {roommates.find(r => r.id === item.payerId)?.name} 付</div></div>
                 </div>
                 <div className="flex gap-3 items-center"><span className="font-bold text-lg text-emerald-400">${item.amount}</span><button onClick={() => deleteExpense(item.id)} className="text-slate-600 hover:text-red-500"><Trash2 size={16}/></button></div>
               </div>
             ))}
           </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-lg p-5 border border-slate-800">
               <h3 className="font-bold text-cyan-500 text-xs mb-4">資料管理 ({selectedMonth})</h3>
               <button onClick={deleteCurrentMonthData} className="w-full flex justify-center gap-2 text-rose-500 bg-rose-950/20 border border-rose-900/50 py-3 rounded text-xs font-bold"><Trash2 size={16}/> 刪除本月資料</button>
            </div>
            <div className="bg-slate-900 rounded-lg p-5 border border-slate-800">
               <div className="flex justify-between mb-4"><h3 className="font-bold text-cyan-500 text-xs">固定費用設定</h3><button onClick={addFixedConfig} className="text-[10px] bg-cyan-900/30 text-cyan-400 px-2 py-1 rounded">新增</button></div>
               {fixedConfig.map(item => (
                 <div key={item.id} className="flex gap-2 mb-2 relative group">
                   <input value={item.title} onChange={e => updateFixedConfig(item.id, 'title', e.target.value)} className="bg-black/20 border border-slate-700 rounded px-2 py-1 text-slate-300 text-sm flex-1"/>
                   <input type="number" value={item.amount} onChange={e => updateFixedConfig(item.id, 'amount', e.target.value)} className="w-20 bg-black/20 border border-slate-700 rounded px-2 py-1 text-white text-sm"/>
                   <button onClick={() => removeFixedConfig(item.id)} className="text-slate-600 hover:text-red-500"><X size={14}/></button>
                 </div>
               ))}
            </div>
             <div className="bg-slate-900 rounded-lg p-5 border border-slate-800">
               <h3 className="font-bold text-cyan-500 text-xs mb-4">成員名單</h3>
               {roommates.map((r, idx) => (
                 <div key={r.id} className="flex gap-3 mb-2"><div className={`w-2 h-8 rounded ${r.color}`}></div><input value={r.name} onChange={e => { const newR = [...roommates]; newR[idx].name = e.target.value; updateSettingsInDb(newR, null); }} className="flex-1 bg-black/40 border border-slate-700 rounded px-3 py-2 text-white text-sm"/></div>
               ))}
            </div>
          </div>
        )}
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 px-6 pb-safe pt-2">
        <div className="flex justify-between">
          <TabButton id="dashboard" label="戰情" icon={Activity} />
          <div className="relative -top-6"><button onClick={() => setActiveTab('add')} className="bg-cyan-600 text-white p-4 rounded shadow-lg border border-cyan-400 hover:scale-105 transition-all"><Plus size={28} strokeWidth={3}/></button></div>
          <TabButton id="expenses" label="紀錄" icon={DollarSign} />
          <TabButton id="settings" label="設定" icon={Settings} />
        </div>
      </nav>
    </div>
  );
};

export default App;

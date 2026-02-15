import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Users, DollarSign, Calculator, Calendar, CheckCircle, Zap, Activity, Settings, RefreshCw, Save, AlertTriangle, Layers, X, History, FileText, Cloud, CloudOff, CheckSquare, Square } from 'lucide-react';

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
  { id: 'f1', title: '劉傑房租', amount: 12600, forWho: ['1'] },
  { id: 'f2', title: 'Aaron房租', amount: 10200, forWho: ['2'] },
  { id: 'f3', title: 'Roman房租', amount: 9600, forWho: ['3'] },
  { id: 'f4', title: '大樓管理費', amount: 737, forWho: ['1', '2', '3'] }, // 預設全體
];

const App = () => {
  const [expenses, setExpenses] = useState([]);
  const [roommates, setRoommates] = useState(INITIAL_ROOMMATES);
  const [fixedConfig, setFixedConfig] = useState(INITIAL_FIXED_CONFIG);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [dbStatus, setDbStatus] = useState(isFirebaseReady ? 'connecting' : 'local');
  
  const [newExpense, setNewExpense] = useState({
    description: '', amount: '', payerId: '1', forWho: ['1', '2', '3'], date: new Date().toISOString().split('T')[0]
  });
  const [batchPayerId, setBatchPayerId] = useState('1');

  // --- 資料同步 ---
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
    });

    const unsubSettings = onSnapshot(doc(db, "config", "main"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.roommates) setRoommates(data.roommates);
        if (data.fixedConfig) setFixedConfig(data.fixedConfig);
      } else {
        setDoc(doc(db, "config", "main"), { roommates: INITIAL_ROOMMATES, fixedConfig: INITIAL_FIXED_CONFIG });
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
    setNewExpense(prev => ({ 
      ...prev, 
      date: `${selectedMonth}-01`,
      forWho: roommates.map(r => r.id)
    }));
  }, [selectedMonth, roommates]);

  // --- DB Operations ---
  const addExpenseToDb = async (data) => {
    if (isFirebaseReady) { const { id, ...rest } = data; await addDoc(collection(db, "expenses"), rest); } 
    else setExpenses([data, ...expenses]);
  };
  const deleteExpenseFromDb = async (id) => {
    if (isFirebaseReady) await deleteDoc(doc(db, "expenses", id));
    else setExpenses(expenses.filter(e => e.id !== id));
  };
  const updateSettingsInDb = async (rms, fcs) => {
    if (isFirebaseReady) await updateDoc(doc(db, "config", "main"), { roommates: rms || roommates, fixedConfig: fcs || fixedConfig });
    else { if(rms) setRoommates(rms); if(fcs) setFixedConfig(fcs); }
  };
  const batchOperationToDb = async (adds, dels) => {
    if (isFirebaseReady) {
      const batch = writeBatch(db);
      if(adds) adds.forEach(i => batch.set(doc(collection(db,"expenses")), ((({id, ...r})=>r)(i))));
      if(dels) dels.forEach(id => batch.delete(doc(db,"expenses",id)));
      await batch.commit();
    } else {
      let next = [...expenses];
      if(dels) next = next.filter(e => !dels.includes(e.id));
      if(adds) next = [...adds, ...next];
      setExpenses(next);
    }
  };

  // --- 核心計算邏輯 ---
  const stats = useMemo(() => {
    const monthlyExpenses = expenses.filter(e => e.date.startsWith(selectedMonth));
    const totalSpent = monthlyExpenses.reduce((sum, item) => sum + Math.round(parseFloat(item.amount)), 0);
    const hasImportedFixed = monthlyExpenses.some(e => e.configId);

    const statusMap = {};
    roommates.forEach(r => {
      statusMap[r.id] = { ...r, paid: 0, liability: 0, balance: 0, fixedLiability: 0, variableLiability: 0, breakdown: { fixed: [], variable: [] } };
    });

    const getBeneficiaries = (forWho, allRoommates) => {
      if (Array.isArray(forWho)) return allRoommates.filter(r => forWho.includes(r.id));
      if (forWho === 'all') return allRoommates;
      return allRoommates.filter(r => r.id === forWho);
    };

    monthlyExpenses.forEach(item => {
      const amount = Math.round(parseFloat(item.amount));
      if (statusMap[item.payerId]) statusMap[item.payerId].paid += amount;

      const beneficiaries = getBeneficiaries(item.forWho, roommates);
      const count = beneficiaries.length;

      if (count > 0) {
        const splitAmount = Math.ceil(amount / count);
        const isPayerInvolved = beneficiaries.some(b => b.id === item.payerId);

        beneficiaries.forEach(r => {
          let liability = 0;
          if (isPayerInvolved) {
            if (r.id === item.payerId) {
              const othersCount = count - 1;
              liability = amount - (splitAmount * othersCount);
            } else {
              liability = splitAmount;
            }
          } else {
            if (r.id === beneficiaries[0].id) {
               const othersLiability = splitAmount * (count - 1);
               liability = amount - othersLiability;
            } else {
               liability = splitAmount;
            }
          }

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
      }
    });

    const projectedFixed = {};
    roommates.forEach(r => projectedFixed[r.id] = 0);
    fixedConfig.forEach(cfg => {
      const amount = Math.round(parseFloat(cfg.amount));
      const beneficiaries = getBeneficiaries(cfg.forWho, roommates);
      const count = beneficiaries.length;
      if(count > 0) {
         const split = Math.ceil(amount / count); 
         beneficiaries.forEach(r => projectedFixed[r.id] += split);
      }
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

  // --- UI Components ---
  const MultiSelectUser = ({ selected, onChange }) => {
    const toggle = (id) => {
      if (selected.includes(id)) {
        if (selected.length === 1) return;
        onChange(selected.filter(uid => uid !== id));
      } else {
        onChange([...selected, id]);
      }
    };
    const selectAll = () => onChange(roommates.map(r => r.id));

    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          {roommates.map(r => (
            <button key={r.id} type="button" onClick={() => toggle(r.id)} className={`flex-1 py-2 px-1 rounded text-xs font-bold transition-all border ${selected.includes(r.id) ? `${r.color.split(' ')[0]} text-white border-transparent shadow-md` : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
              <div className="flex items-center justify-center gap-1">{selected.includes(r.id) ? <CheckSquare size={12} /> : <Square size={12} />}{r.name}</div>
            </button>
          ))}
        </div>
        {selected.length < roommates.length && <button type="button" onClick={selectAll} className="text-[10px] text-cyan-500 self-end hover:underline">選取全體</button>}
      </div>
    );
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) return;
    const expense = { id: Date.now().toString(), ...newExpense, amount: Math.round(parseFloat(newExpense.amount)) };
    await addExpenseToDb(expense);
    setNewExpense({ description: '', amount: '', payerId: '1', forWho: roommates.map(r=>r.id), date: selectedMonth + '-01' });
    alert('已新增');
    setActiveTab('dashboard'); // 新增後跳回戰情
  };

  const handleBatchImport = async () => {
    const existing = expenses.filter(e => e.configId && e.date.startsWith(selectedMonth));
    const actionText = existing.length > 0 ? "更新" : "匯入";
    if (!window.confirm(`確定要以 [${roommates.find(r => r.id === batchPayerId)?.name}] 為付款人，${actionText}固定支出嗎？`)) return;

    if (existing.length > 0) await batchOperationToDb(null, existing.map(e => e.id));
    const batchItems = fixedConfig.map((cfg, idx) => ({
      id: (Date.now() + idx).toString(), configId: cfg.id, description: `${cfg.title} (固定)`, amount: Math.round(parseFloat(cfg.amount)), payerId: batchPayerId, forWho: cfg.forWho, date: `${selectedMonth}-01`
    }));
    await batchOperationToDb(batchItems, null);
    setActiveTab('dashboard');
  };

  const deleteExpense = async (id) => { if (window.confirm('刪除此筆？')) await deleteExpenseFromDb(id); };
  const deleteCurrentMonthData = async () => { if (window.confirm(`確定清空 ${selectedMonth} 所有資料？`)) { const ids = expenses.filter(e => e.date.startsWith(selectedMonth)).map(e => e.id); await batchOperationToDb(null, ids); }};

  const updateFixedConfig = (id, field, value) => { setFixedConfig(fixedConfig.map(item => item.id === id ? { ...item, [field]: value } : item)); updateSettingsInDb(null, fixedConfig.map(item => item.id === id ? { ...item, [field]: value } : item)); };
  const addFixedConfig = () => { const newItem = { id: `f${Date.now()}`, title: '新費用', amount: 0, forWho: roommates.map(r=>r.id) }; setFixedConfig([...fixedConfig, newItem]); updateSettingsInDb(null, [...fixedConfig, newItem]); };
  const removeFixedConfig = (id) => { if (window.confirm('刪除設定？')) { const next = fixedConfig.filter(c => c.id !== id); setFixedConfig(next); updateSettingsInDb(null, next); }};

  const AmountWithDetail = ({ amount, details, colorClass, title }) => {
    const [showDetail, setShowDetail] = useState(false);
    if (!details?.length) return <div className={`text-xs font-mono text-center ${colorClass}`}>${amount.toLocaleString()}</div>;
    return (
      <>
        <div onClick={() => setShowDetail(true)} className={`text-xs font-mono text-center border-b border-dashed border-slate-600 active:text-cyan-400 cursor-pointer ${colorClass}`}>${amount.toLocaleString()}</div>
        {showDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDetail(false)}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-slate-800 px-4 py-3 flex justify-between items-center"><h4 className="text-sm font-bold text-white flex gap-2"><FileText size={14}/>{title}</h4><button onClick={() => setShowDetail(false)}><X size={18} className="text-slate-400"/></button></div>
              <div className="p-4 max-h-60 overflow-y-auto">
                {details.map((d, i) => <div key={i} className="flex justify-between py-2 border-b border-slate-800"><span className="text-xs text-slate-300">{d.desc}</span><span className="text-sm font-mono text-cyan-400">${d.amt}</span></div>)}
                <div className="mt-3 pt-3 border-t border-slate-700 flex justify-between font-bold"><span className="text-xs text-slate-400">總計</span><span className="text-white">${amount.toLocaleString()}</span></div>
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
        <p className="text-[10px] text-slate-500 font-mono tracking-widest flex items-center gap-1">GODDAMN MONTHLY EXPENSES {dbStatus==='connected'?<span className="text-emerald-500 flex gap-1"><Cloud size={10}/></span>:<span className="text-slate-600 flex gap-1"><CloudOff size={10}/></span>}</p>
        <div className="mt-2 flex items-center gap-2 bg-black/30 p-1.5 rounded-lg border border-slate-800/50">
           <History size={16} className="text-cyan-500 ml-2" /><input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent text-white font-mono font-bold text-sm flex-1" />
        </div>
      </header>

      {/* Floating Action Button (FAB) - 只在非新增頁面顯示 */}
      {activeTab !== 'add' && (
        <button 
          onClick={() => setActiveTab('add')}
          className="fixed bottom-24 right-6 bg-cyan-500 text-white p-4 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.6)] hover:scale-110 active:scale-95 transition-all z-50 border-2 border-white/20"
        >
          <Plus size={28} strokeWidth={3} />
        </button>
      )}

      <main className="flex-1 overflow-y-auto p-5 scrollbar-hide">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {!isFirebaseReady && <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded text-amber-500 text-xs text-center">⚠️ 單機模式</div>}
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
             <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-black text-white">手動輸入款項</h2><button type="button" onClick={()=>setActiveTab('dashboard')} className="text-slate-500"><X/></button></div>
             <div className="space-y-4">
               <div><label className="text-[10px] font-bold text-cyan-500 block mb-1">日期</label><input type="date" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} className="w-full bg-black/40 border border-slate-700 rounded p-3 text-white text-sm" /></div>
               <div><label className="text-[10px] font-bold text-cyan-500 block mb-1">金額</label><div className="relative"><DollarSign className="absolute left-3 top-3 text-slate-500" size={20}/><input type="number" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} placeholder="0" className="w-full bg-black/40 border border-slate-700 rounded p-3 pl-10 text-white text-xl font-bold" /></div></div>
               <div><label className="text-[10px] font-bold text-cyan-500 block mb-1">項目</label><input type="text" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} placeholder="例如：全聯採購..." className="w-full bg-black/40 border border-slate-700 rounded p-3 text-white" /></div>
               <div><label className="text-[10px] font-bold text-cyan-500 block mb-1">誰先付的?</label><select value={newExpense.payerId} onChange={e => setNewExpense({...newExpense, payerId: e.target.value})} className="w-full bg-black/40 border border-slate-700 rounded p-3 text-white text-sm">{roommates.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
               <div><label className="text-[10px] font-bold text-cyan-500 block mb-1">分擔對象</label>
                 <MultiSelectUser selected={Array.isArray(newExpense.forWho) ? newExpense.forWho : [newExpense.forWho]} onChange={val => setNewExpense({...newExpense, forWho: val})} />
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
               <h3 className="font-bold text-cyan-500 text-xs mb-4">固定費用設定</h3>
               {fixedConfig.map(item => (
                 <div key={item.id} className="flex flex-col gap-2 p-3 bg-black/20 rounded border border-slate-800 mb-2 relative group">
                   <button onClick={() => removeFixedConfig(item.id)} className="absolute top-2 right-2 text-slate-600 hover:text-red-500"><X size={14}/></button>
                   <div className="flex gap-2"><input value={item.title} onChange={e => updateFixedConfig(item.id, 'title', e.target.value)} className="bg-transparent text-sm font-bold text-slate-300 outline-none flex-1" placeholder="費用名稱" /><input type="number" value={item.amount} onChange={e => updateFixedConfig(item.id, 'amount', e.target.value)} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-sm outline-none" /></div>
                   <div className="pt-2 border-t border-slate-700/50">
                      <span className="text-[10px] text-slate-500 block mb-1">分擔人:</span>
                      <MultiSelectUser selected={Array.isArray(item.forWho) ? item.forWho : [item.forWho]} onChange={val => updateFixedConfig(item.id, 'forWho', val)} />
                   </div>
                 </div>
               ))}
               <button onClick={addFixedConfig} className="w-full py-2 bg-slate-800 text-slate-400 text-xs rounded border border-dashed border-slate-600 mt-2">+ 新增項目</button>
            </div>
            <div className="bg-slate-900 rounded-lg p-5 border border-slate-800">
               <h3 className="font-bold text-cyan-500 text-xs mb-4">資料管理 ({selectedMonth})</h3>
               <button onClick={deleteCurrentMonthData} className="w-full flex justify-center gap-2 text-rose-500 bg-rose-950/20 border border-rose-900/50 py-3 rounded text-xs font-bold"><Trash2 size={16}/> 刪除本月資料</button>
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
        <div className="grid grid-cols-3 gap-1">
          <TabButton id="dashboard" label="戰情" icon={Activity} />
          <TabButton id="expenses" label="紀錄" icon={DollarSign} />
          <TabButton id="settings" label="設定" icon={Settings} />
        </div>
      </nav>
    </div>
  );
};

export default App;

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, DollarSign, Calculator, CheckCircle, Activity, Settings, AlertTriangle, X, History, FileText, Cloud, CloudOff, CheckSquare, Square, ArrowRight, Home, BarChart3 } from 'lucide-react';

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

let db;
const isFirebaseReady = Object.keys(firebaseConfig).length > 0;
if (isFirebaseReady) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

// ------------------------------------------------

const MEMBER_THEMES = {
  '1': { bg: 'bg-terracotta', bgLight: 'bg-terracotta-light', text: 'text-terracotta', ring: 'ring-terracotta/30', dot: 'bg-terracotta' },
  '2': { bg: 'bg-sage', bgLight: 'bg-sage-light', text: 'text-sage', ring: 'ring-sage/30', dot: 'bg-sage' },
  '3': { bg: 'bg-lavender', bgLight: 'bg-lavender-light', text: 'text-lavender', ring: 'ring-lavender/30', dot: 'bg-lavender' },
};

const INITIAL_ROOMMATES = [
  { id: '1', name: '劉傑', color: 'bg-terracotta' },
  { id: '2', name: 'Aaron', color: 'bg-sage' },
  { id: '3', name: 'Roman', color: 'bg-lavender' },
];

const INITIAL_FIXED_CONFIG = [
  { id: 'f1', title: '劉傑房租', amount: 12600, forWho: ['1'] },
  { id: 'f2', title: 'Aaron房租', amount: 10200, forWho: ['2'] },
  { id: 'f3', title: 'Roman房租', amount: 9600, forWho: ['3'] },
  { id: 'f4', title: '大樓管理費', amount: 737, forWho: ['1', '2', '3'] },
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
              liability = amount - (splitAmount * (count - 1));
            } else {
              liability = splitAmount;
            }
          } else {
            if (r.id === beneficiaries[0].id) {
               liability = amount - (splitAmount * (count - 1));
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

  // --- Handlers ---
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) return;
    const expense = { id: Date.now().toString(), ...newExpense, amount: Math.round(parseFloat(newExpense.amount)) };
    await addExpenseToDb(expense);
    setNewExpense({ description: '', amount: '', payerId: '1', forWho: roommates.map(r=>r.id), date: selectedMonth + '-01' });
    alert('已新增');
    setActiveTab('dashboard');
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

  const updateFixedConfig = (id, field, value) => {
    const nextConfig = fixedConfig.map(item => item.id === id ? { ...item, [field]: value } : item);
    setFixedConfig(nextConfig);
    updateSettingsInDb(null, nextConfig);
    const targetExpense = expenses.find(e => e.configId === id && e.date.startsWith(selectedMonth));
    if (targetExpense) {
       const updateData = {};
       if (field === 'title') updateData.description = `${value} (固定)`;
       if (field === 'amount') updateData.amount = Math.round(parseFloat(value) || 0);
       if (field === 'forWho') updateData.forWho = value;
       if (Object.keys(updateData).length > 0) {
          if (isFirebaseReady) {
             updateDoc(doc(db, "expenses", targetExpense.id), updateData);
          } else {
             setExpenses(prev => prev.map(e => e.id === targetExpense.id ? { ...e, ...updateData } : e));
          }
       }
    }
  };

  const addFixedConfig = () => { const newItem = { id: `f${Date.now()}`, title: '新費用', amount: 0, forWho: roommates.map(r=>r.id) }; setFixedConfig([...fixedConfig, newItem]); updateSettingsInDb(null, [...fixedConfig, newItem]); };
  const removeFixedConfig = (id) => { if (window.confirm('刪除設定？')) { const next = fixedConfig.filter(c => c.id !== id); setFixedConfig(next); updateSettingsInDb(null, next); }};

  const getTheme = (id) => MEMBER_THEMES[id] || MEMBER_THEMES['1'];

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
          {roommates.map(r => {
            const theme = getTheme(r.id);
            const isSelected = selected.includes(r.id);
            return (
              <button key={r.id} type="button" onClick={() => toggle(r.id)}
                className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all border-2 ${
                  isSelected
                    ? `${theme.bg} text-white border-transparent shadow-md`
                    : 'bg-warm-50 text-warm-500 border-warm-200 hover:border-warm-300'
                }`}>
                <div className="flex items-center justify-center gap-1.5">
                  {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  {r.name}
                </div>
              </button>
            );
          })}
        </div>
        {selected.length < roommates.length && (
          <button type="button" onClick={selectAll} className="text-[11px] text-terracotta font-medium self-end hover:underline">
            選取全體
          </button>
        )}
      </div>
    );
  };

  const AmountWithDetail = ({ amount, details, colorClass, title }) => {
    const [showDetail, setShowDetail] = useState(false);
    if (!details?.length) return <div className={`text-sm font-medium font-display text-center ${colorClass}`}>${amount.toLocaleString()}</div>;
    return (
      <>
        <div onClick={() => setShowDetail(true)} className={`text-sm font-medium font-display text-center border-b border-dashed border-warm-300 cursor-pointer hover:text-terracotta transition-colors ${colorClass}`}>
          ${amount.toLocaleString()}
        </div>
        {showDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-900/30 backdrop-blur-sm" onClick={() => setShowDetail(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-fade-in-up" onClick={e => e.stopPropagation()}>
              <div className="bg-cream px-5 py-4 flex justify-between items-center border-b border-warm-200">
                <h4 className="text-sm font-bold text-warm-800 flex items-center gap-2"><FileText size={15} className="text-terracotta" />{title}</h4>
                <button onClick={() => setShowDetail(false)} className="text-warm-400 hover:text-warm-600 transition-colors"><X size={18} /></button>
              </div>
              <div className="p-5 max-h-60 overflow-y-auto">
                {details.map((d, i) => (
                  <div key={i} className="flex justify-between py-3 border-b border-warm-100 last:border-0">
                    <span className="text-sm text-warm-600">{d.desc}</span>
                    <span className="text-sm font-display font-semibold text-warm-800">${d.amt.toLocaleString()}</span>
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t-2 border-warm-200 flex justify-between items-center">
                  <span className="text-xs font-semibold text-warm-400 uppercase tracking-wider">Total</span>
                  <span className="font-display text-lg font-bold text-terracotta">${amount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button onClick={() => setActiveTab(id)}
      className={`flex flex-col items-center justify-center py-3 px-4 relative transition-all ${
        activeTab === id ? 'text-terracotta' : 'text-warm-400 hover:text-warm-600'
      }`}>
      {activeTab === id && <div className="absolute top-0 w-8 h-[3px] bg-terracotta rounded-b-full" />}
      <Icon size={22} className="mb-1" strokeWidth={activeTab === id ? 2.5 : 1.8} />
      <span className="text-[11px] font-semibold tracking-wide">{label}</span>
    </button>
  );

  // --- Card wrapper ---
  const Card = ({ children, className = '' }) => (
    <div className={`bg-white rounded-2xl p-5 shadow-[var(--card-shadow)] border border-warm-100 ${className}`}>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-cream">
      {/* Desktop sidebar / Mobile header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-warm-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-terracotta flex items-center justify-center">
                <Home size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-warm-800 tracking-tight">龍品小窩</h1>
                <div className="flex items-center gap-1.5 -mt-0.5">
                  {dbStatus === 'connected'
                    ? <span className="flex items-center gap-1 text-[10px] text-sage font-medium"><Cloud size={10} />Synced</span>
                    : <span className="flex items-center gap-1 text-[10px] text-warm-400 font-medium"><CloudOff size={10} />Local</span>
                  }
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-cream rounded-xl px-3 py-2 border border-warm-200">
              <History size={14} className="text-warm-400" />
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-warm-800 font-semibold text-sm outline-none w-32" />
            </div>
          </div>
        </div>
      </header>

      {/* FAB */}
      {activeTab !== 'add' && (
        <button onClick={() => setActiveTab('add')}
          className="fixed bottom-24 right-4 sm:bottom-8 sm:right-8 lg:right-[calc(50%-600px+2rem)] bg-terracotta text-white p-4 rounded-2xl shadow-lg shadow-terracotta/30 hover:shadow-xl hover:shadow-terracotta/40 hover:scale-105 active:scale-95 transition-all z-40">
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32 sm:pb-24">
        {activeTab === 'dashboard' && (
          <div className="space-y-5 animate-fade-in-up">
            {!isFirebaseReady && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-700 text-xs text-center font-medium">
                單機模式：請設定 Firebase 以啟用多人同步
              </div>
            )}

            {/* Fixed expenses status */}
            <Card>
              <div className="flex justify-between items-center mb-3">
                <h3 className={`font-bold text-sm flex items-center gap-2 ${stats.hasImportedFixed ? 'text-sage' : 'text-amber-600'}`}>
                  {stats.hasImportedFixed ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                  固定費用
                </h3>
                <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${
                  stats.hasImportedFixed
                    ? 'text-sage bg-sage-light/60'
                    : 'text-amber-700 bg-amber-100'
                }`}>
                  {stats.hasImportedFixed ? '已同步' : '未匯入'}
                </span>
              </div>
              {!stats.hasImportedFixed && (
                <div className="flex gap-2 items-center bg-cream rounded-xl p-3 border border-warm-200">
                  <span className="text-xs text-warm-500 font-medium">付款人</span>
                  <select value={batchPayerId} onChange={(e) => setBatchPayerId(e.target.value)}
                    className="bg-transparent text-warm-800 text-sm flex-1 font-bold outline-none">
                    {roommates.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button onClick={handleBatchImport} className="bg-terracotta text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-terracotta-dark transition-colors">
                    匯入
                  </button>
                </div>
              )}
            </Card>

            {/* Responsive grid: side by side on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Member breakdown */}
              <Card>
                <h3 className="font-bold text-warm-800 text-sm mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-terracotta" />
                  本月應付詳情
                  <span className="text-[10px] text-warm-400 font-normal ml-1">點金額看明細</span>
                </h3>
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-[11px] text-warm-400 font-semibold uppercase tracking-wider border-b border-warm-100 pb-2">
                    <div className="pl-1">成員</div>
                    <div className="text-center">固定</div>
                    <div className="text-center">變動</div>
                    <div className="text-center">合計</div>
                  </div>
                  {stats.balances.map((p, idx) => {
                    const theme = getTheme(p.id);
                    return (
                      <div key={p.id} className={`grid grid-cols-4 gap-2 items-center p-3 rounded-xl bg-cream/60 hover:bg-cream transition-colors animate-fade-in-up animate-delay-${idx + 1}`}>
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className={`w-2 h-7 rounded-full flex-shrink-0 ${theme.dot}`} />
                          <span className="text-sm font-bold text-warm-800 truncate">{p.name}</span>
                        </div>
                        <AmountWithDetail
                          amount={stats.hasImportedFixed ? p.fixedLiability : stats.projectedFixed[p.id]}
                          details={p.breakdown.fixed}
                          title={`${p.name} 固定費用`}
                          colorClass={stats.hasImportedFixed ? 'text-warm-600' : 'text-amber-500 italic'}
                        />
                        <AmountWithDetail amount={p.variableLiability} details={p.breakdown.variable} title={`${p.name} 變動費用`} colorClass="text-warm-600" />
                        <div className="text-base font-bold font-display text-terracotta text-center">
                          ${((stats.hasImportedFixed ? p.fixedLiability : stats.projectedFixed[p.id]) + p.variableLiability).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Total + settlements */}
              <Card>
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <h2 className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-1">
                      總流水 {selectedMonth}
                    </h2>
                    <div className="text-4xl font-display font-bold text-warm-800 tracking-tight">
                      ${stats.totalSpent.toLocaleString()}
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-cream flex items-center justify-center">
                    <Calculator className="text-warm-300" size={24} />
                  </div>
                </div>
                <div className="h-px bg-warm-100 mb-4" />
                {stats.transactions.length === 0 ? (
                  <div className="flex items-center gap-3 py-3 px-4 bg-sage-light/30 rounded-xl">
                    <CheckCircle size={20} className="text-sage" />
                    <span className="font-bold text-sage text-sm">帳務平衡</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-2">結算轉帳</h3>
                    {stats.transactions.map((t, i) => (
                      <div key={i} className="flex justify-between items-center bg-cream rounded-xl p-4 border border-warm-100">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-bold text-terracotta">{t.from}</span>
                          <ArrowRight size={14} className="text-warm-300" />
                          <span className="font-bold text-warm-800">{t.to}</span>
                        </div>
                        <div className="font-display font-bold text-sage text-lg">${t.amount}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'add' && (
          <div className="max-w-lg mx-auto animate-fade-in-up">
            <Card>
              <form onSubmit={handleAddExpense} className="space-y-5">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-warm-800">新增款項</h2>
                  <button type="button" onClick={() => setActiveTab('dashboard')} className="text-warm-400 hover:text-warm-600 transition-colors">
                    <X size={22} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider block mb-1.5">日期</label>
                    <input type="date" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                      className="w-full bg-cream border border-warm-200 rounded-xl p-3 text-warm-800 text-base outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/10 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider block mb-1.5">金額</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3.5 text-warm-300" size={18} />
                      <input type="number" inputMode="numeric" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} placeholder="0"
                        className="w-full bg-cream border border-warm-200 rounded-xl p-3 pl-10 text-warm-800 text-xl font-display font-bold outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/10 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider block mb-1.5">項目</label>
                    <input type="text" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} placeholder="例如：全聯採購..."
                      className="w-full bg-cream border border-warm-200 rounded-xl p-3 text-warm-800 text-base outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/10 transition-all placeholder:text-warm-300" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider block mb-1.5">誰先付的?</label>
                      <select value={newExpense.payerId} onChange={e => setNewExpense({...newExpense, payerId: e.target.value})}
                        className="w-full bg-cream border border-warm-200 rounded-xl p-3 text-warm-800 text-base outline-none focus:border-terracotta transition-all">
                        {roommates.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider block mb-1.5">分擔對象</label>
                      <MultiSelectUser selected={Array.isArray(newExpense.forWho) ? newExpense.forWho : [newExpense.forWho]} onChange={val => setNewExpense({...newExpense, forWho: val})} />
                    </div>
                  </div>
                </div>
                <button type="submit" className="w-full bg-terracotta text-white font-bold py-4 rounded-xl flex justify-center items-center gap-2 hover:bg-terracotta-dark active:scale-[0.98] transition-all shadow-md shadow-terracotta/20">
                  <Plus size={18} strokeWidth={2.5} /> 確認新增
                </button>
              </form>
            </Card>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="max-w-2xl mx-auto space-y-4 animate-fade-in-up">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-warm-800">{selectedMonth} 紀錄</h2>
              <span className="text-xs bg-terracotta-light/60 text-terracotta font-semibold px-3 py-1.5 rounded-full">
                {stats.monthlyExpenses.length} 筆
              </span>
            </div>
            {stats.monthlyExpenses.length === 0 && (
              <Card className="text-center py-12">
                <p className="text-warm-400 text-sm">本月尚無紀錄</p>
              </Card>
            )}
            {stats.monthlyExpenses.map((item, idx) => {
              const theme = getTheme(item.payerId);
              return (
                <Card key={item.id} className={`flex justify-between items-center animate-fade-in-up animate-delay-${Math.min(idx + 1, 3)}`}>
                  <div className="flex gap-3 items-center">
                    <div className={`w-1.5 h-10 rounded-full ${theme.dot}`} />
                    <div>
                      <div className="font-semibold text-warm-800 text-sm">{item.description}</div>
                      <div className="text-xs text-warm-400 mt-0.5">
                        {item.date} &middot; {roommates.find(r => r.id === item.payerId)?.name} 付
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-center">
                    <span className="font-display font-bold text-lg text-warm-800">${item.amount.toLocaleString()}</span>
                    <button onClick={() => deleteExpense(item.id)} className="text-warm-300 hover:text-red-400 transition-colors p-1">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-5 animate-fade-in-up">
            <Card>
              <h3 className="font-bold text-warm-800 text-sm mb-4 flex items-center gap-2">
                <Settings size={16} className="text-terracotta" />
                固定費用設定
              </h3>
              <div className="space-y-3">
                {fixedConfig.map(item => (
                  <div key={item.id} className="flex flex-col gap-3 p-4 bg-cream rounded-xl border border-warm-100 relative group">
                    <button onClick={() => removeFixedConfig(item.id)} className="absolute top-3 right-3 text-warm-300 hover:text-red-400 transition-colors">
                      <X size={15} />
                    </button>
                    <div className="flex gap-3 items-center pr-6">
                      <input value={item.title} onChange={e => updateFixedConfig(item.id, 'title', e.target.value)}
                        className="bg-transparent text-base font-semibold text-warm-800 outline-none flex-1 placeholder:text-warm-300" placeholder="費用名稱" />
                      <div className="flex items-center bg-white rounded-lg border border-warm-200 px-2">
                        <span className="text-warm-400 text-sm">$</span>
                        <input type="number" inputMode="numeric" value={item.amount} onChange={e => updateFixedConfig(item.id, 'amount', e.target.value)}
                          className="w-24 bg-transparent py-1.5 px-1 text-warm-800 text-base font-display font-semibold outline-none" />
                      </div>
                    </div>
                    <div className="pt-2 border-t border-warm-200/60">
                      <span className="text-[11px] text-warm-400 font-semibold uppercase tracking-wider block mb-1.5">分擔人</span>
                      <MultiSelectUser selected={Array.isArray(item.forWho) ? item.forWho : [item.forWho]} onChange={val => updateFixedConfig(item.id, 'forWho', val)} />
                    </div>
                  </div>
                ))}
                <button onClick={addFixedConfig} className="w-full py-3 bg-white text-warm-400 text-sm font-semibold rounded-xl border-2 border-dashed border-warm-200 hover:border-terracotta hover:text-terracotta transition-all">
                  + 新增項目
                </button>
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-warm-800 text-sm mb-4">成員名單</h3>
              <div className="space-y-2">
                {roommates.map((r, idx) => {
                  const theme = getTheme(r.id);
                  return (
                    <div key={r.id} className="flex gap-3 items-center">
                      <div className={`w-3 h-8 rounded-full ${theme.dot}`} />
                      <input value={r.name} onChange={e => { const newR = [...roommates]; newR[idx].name = e.target.value; updateSettingsInDb(newR, null); }}
                        className="flex-1 bg-cream border border-warm-200 rounded-xl px-3 py-2.5 text-warm-800 text-base font-medium outline-none focus:border-terracotta transition-all" />
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="border-red-100">
              <h3 className="font-bold text-warm-800 text-sm mb-4">資料管理 ({selectedMonth})</h3>
              <button onClick={deleteCurrentMonthData} className="w-full flex justify-center items-center gap-2 text-red-500 bg-red-50 border border-red-200 py-3 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors">
                <Trash2 size={16} /> 刪除本月所有資料
              </button>
            </Card>
          </div>
        )}
      </main>

      {/* Bottom nav - mobile only, desktop uses sidebar-like top nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-warm-200 sm:hidden z-30 pb-safe">
        <div className="flex justify-around px-2">
          <TabButton id="dashboard" label="總覽" icon={Activity} />
          <TabButton id="expenses" label="紀錄" icon={DollarSign} />
          <TabButton id="settings" label="設定" icon={Settings} />
        </div>
      </nav>

      {/* Desktop nav */}
      <nav className="hidden sm:block fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
        <div className="flex gap-1 bg-white rounded-2xl shadow-lg shadow-warm-800/10 border border-warm-200 px-2 py-1">
          <TabButton id="dashboard" label="總覽" icon={Activity} />
          <TabButton id="expenses" label="紀錄" icon={DollarSign} />
          <TabButton id="settings" label="設定" icon={Settings} />
        </div>
      </nav>
    </div>
  );
};

export default App;

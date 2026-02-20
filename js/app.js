const APP_VERSION = "v0.6.7.3.2";
const BUILD_TIME = "20/02/2026 14:30";
const BUILD_TIME_ISO = "2026-02-20T14:30:00";

// Ripple effect for buttons (mobile-friendly feedback)
// Works for: .btn (primary/ghost/danger) without changing app logic.
document.addEventListener("click", (ev) => {
  const btn = ev.target?.closest?.("button.btn");
  if (!btn) return;
  // Respect disabled buttons
  if (btn.disabled) return;

  try {
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = ev.clientX - rect.left - size / 2;
    const y = ev.clientY - rect.top - size / 2;

    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    // Remove previous ripple (avoid stacking)
    const old = btn.querySelector(".ripple");
    if (old) old.remove();

    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  } catch (_) {
    // no-op
  }
});

// Firebase init (compat build for maximum browser support)
// Note: firebase scripts are loaded in index.html before this file.
const firebaseConfig = {
  apiKey: "AIzaSyDm4QFlXVY89QSTxfPJFsOvebLxGYgQDLg",
  authDomain: "controle-financeiro-6c339.firebaseapp.com",
  projectId: "controle-financeiro-6c339",
  storageBucket: "controle-financeiro-6c339.firebasestorage.app",
  messagingSenderId: "474233431352",
  appId: "1:474233431352:web:dec3e9d4f77b5474b40dcd",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Improve redirect login reliability on mobile/PWA
// - Ensure persistence
// - Handle redirect results explicitly (so errors don't silently fail)
// - Clear the redirect guard flag when we're back
try {
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
} catch (_) {}

// If we came back from a redirect flow, resolve it early.
// This prevents "nothing happens" situations on some mobile webviews.
(async () => {
  try {
    const res = await auth.getRedirectResult();
    if (res && res.user) {
      // success; onAuthStateChanged will fire too
    }
  } catch (e) {
    console.warn("Redirect login failed:", e);
    alert("Não foi possível concluir o login com Google. Tente novamente.");
  } finally {
    try { sessionStorage.removeItem("cf_auth_redirect"); } catch(_) {}
  }
})();

// Minimal API compatibility layer (so the rest of the app can stay the same)
const f = {
  GoogleAuthProvider: firebase.auth.GoogleAuthProvider,
  signInWithPopup: (authInstance, provider) => authInstance.signInWithPopup(provider),
  signInWithRedirect: (authInstance, provider) => authInstance.signInWithRedirect(provider),
  getRedirectResult: (authInstance) => authInstance.getRedirectResult(),
  signOut: (authInstance) => authInstance.signOut(),
  onAuthStateChanged: (authInstance, cb) => authInstance.onAuthStateChanged(cb),

  collection: (_db, path) => _db.collection(path),
  // doc() overloads:
  // - doc(db, "a/b/c")
  // - doc(collectionRef)  -> auto-id doc ref
  // - doc(db, "users", uid, "transactions", id)
  doc: (arg1, ...rest) => {
    if (arg1 && typeof arg1.doc === "function" && rest.length === 0) return arg1.doc();
    if (typeof arg1?.doc === "function" && rest.length === 1 && typeof rest[0] === "string") return arg1.doc(rest[0]);
    if (rest.length === 0 && typeof arg1?.doc === "function") return arg1.doc();
    const path = (rest.length ? [arg1, ...rest] : [arg1]).filter(Boolean).join("/");
    // when first arg is db (firestore instance), it has doc(path)
    if (arg1 && typeof arg1.doc === "function" && rest.length === 1) return arg1.doc(rest[0]);
    return db.doc(path);
  },
  addDoc: (colRef, data) => colRef.add(data),
  getDocs: (qOrCol) => qOrCol.get(),
  getDoc: (docRef) => docRef.get(),
  deleteDoc: (docRef) => docRef.delete(),
  setDoc: (docRef, data, opts) => docRef.set(data, opts),
  where: (field, op, value) => ({ __type: "where", field, op, value }),
  orderBy: (field, dir = "asc") => ({ __type: "orderBy", field, dir }),
  query: (colRef, ...constraints) => {
    let q = colRef;
    constraints.forEach((c) => {
      if (!c) return;
      if (c.__type === "where") q = q.where(c.field, c.op, c.value);
      if (c.__type === "orderBy") q = q.orderBy(c.field, c.dir);
    });
    return q;
  },
  serverTimestamp: () => firebase.firestore.FieldValue.serverTimestamp(),
  writeBatch: (_db) => _db.batch(),
};

/**
 * Firestore:
 * users/{uid}/meta/categories
 * doc = { version, updatedAt, categories: [{ id, name, subs: [string] }] }
 */
class CategoryService {
  constructor(getUid) { this.getUid = getUid; }
  _docRef() {
    const uid = this.getUid();
    if (!uid) throw new Error("Sem usuário logado.");
    return f.doc(db, `users/${uid}/meta/categories`);
  }

  static defaultCategories() {
    const palette = [
      "#2563EB", // azul
      "#16A34A", // verde
      "#CA8A04", // amarelo
      "#7C3AED", // roxo
      "#0EA5E9", // ciano
      "#DC2626", // vermelho
      "#14B8A6", // teal
      "#F97316", // laranja
      "#22C55E", // verde 2
      "#64748B", // cinza
      "#8B5CF6", // violeta
      "#3B82F6", // azul 2
    ];
    return [
      { name: "Agua", subs: [] },
      { name: "Alimentação", subs: ["Mercado", "Restaurante"] },
      { name: "Cartão", subs: [] },
      { name: "Celular", subs: [] },
      { name: "Combustível", subs: [] },
      { name: "Internet", subs: [] },
      { name: "Lazer", subs: [] },
      { name: "Mercado", subs: [] },
      { name: "Moradia", subs: [] },
      { name: "Saúde", subs: [] },
      { name: "Transporte", subs: [] },
      { name: "Outros", subs: [] },
    ].map((c, idx) => ({
      id: cryptoRandomId(),
      name: c.name,
      color: palette[idx % palette.length],
      subs: Array.from(new Set((c.subs || []).filter(Boolean)))
    }));
  }

  async loadOrSeed() {
    const ref = this._docRef();
    const snap = await f.getDoc(ref);
    if (!snap.exists) {
      const payload = { version: 1, updatedAt: f.serverTimestamp(), categories: CategoryService.defaultCategories() };
      await f.setDoc(ref, payload);
      return payload.categories;
    }
    const data = snap.data() || {};
    const cats = Array.isArray(data.categories) ? data.categories : [];
    return cats.map(c => ({
      id: String(c.id || cryptoRandomId()),
      name: String(c.name || "").trim(),
      color: String(c.color || "").trim() || "#2563EB",
      subs: Array.isArray(c.subs) ? c.subs.map(s => String(s||"").trim()).filter(Boolean) : []
    })).filter(c => c.name);
  }

  async save(categories) {
    const ref = this._docRef();
    const clean = (categories || []).map(c => ({
      id: String(c.id || cryptoRandomId()),
      name: String(c.name || "").trim(),
      color: String(c.color || "").trim() || "#2563EB",
      subs: Array.from(new Set((c.subs || []).map(s => String(s||"").trim()).filter(Boolean)))
    })).filter(c => c.name);

    await f.setDoc(ref, { version: 1, updatedAt: f.serverTimestamp(), categories: clean }, { merge: true });
    return clean;
  }
}

/**
 * Firestore:
 * users/{uid}/meta/recurring
 * doc = { version, updatedAt, rules: [{ id, description, amount, type, source, category, subcategory, day, startMonth, endMonth?, active }] }
 */


/**
 * Firestore:
 * users/{uid}/meta/cards
 * doc = { version, updatedAt, cards: [{ id, name, closingDay, dueDay, limit }] }
 */
class CardService {
  constructor(getUid) { this.getUid = getUid; }
  _docRef() {
    const uid = this.getUid();
    if (!uid) throw new Error("Sem usuário logado.");
    return f.doc(db, `users/${uid}/meta/cards`);
  }

  static defaultCards() { return []; }

  async loadOrSeed() {
    const ref = this._docRef();
    const snap = await f.getDoc(ref);
    if (!snap.exists) {
      const payload = { version: 1, updatedAt: f.serverTimestamp(), cards: CardService.defaultCards() };
      await f.setDoc(ref, payload);
      return payload.cards;
    }
    const data = snap.data() || {};
    const cards = Array.isArray(data.cards) ? data.cards : [];
    return cards.map(c => ({
      id: String(c.id || cryptoRandomId()),
      name: String(c.name || "").trim(),
      closingDay: Math.min(28, Math.max(1, Number(c.closingDay || 10))),
      dueDay: Math.min(28, Math.max(1, Number(c.dueDay || 5))),
      limit: Number(c.limit || 0) > 0 ? Number(c.limit) : 0,
    })).filter(c => c.name);
  }

  async save(cards) {
    const ref = this._docRef();
    const clean = (cards || []).map(c => ({
      id: String(c.id || cryptoRandomId()),
      name: String(c.name || "").trim(),
      closingDay: Math.min(28, Math.max(1, Number(c.closingDay || 10))),
      dueDay: Math.min(28, Math.max(1, Number(c.dueDay || 5))),
      limit: Number(c.limit || 0) > 0 ? Number(c.limit) : 0,
    })).filter(c => c.name);
    await f.setDoc(ref, { version: 1, updatedAt: f.serverTimestamp(), cards: clean }, { merge: true });
    return clean;
  }
}

/**
 * Firestore:
 * users/{uid}/meta/cardInvoices
 * doc = { version, updatedAt, invoices: { "<cardId>|<YYYY-MM>": { paidAtISO, amount } } }
 */
class CardInvoiceService {
  constructor(getUid) { this.getUid = getUid; }
  _docRef() {
    const uid = this.getUid();
    if (!uid) throw new Error("Sem usuário logado.");
    return f.doc(db, `users/${uid}/meta/cardInvoices`);
  }

  async load() {
    const ref = this._docRef();
    const snap = await f.getDoc(ref);
    if (!snap.exists) return {};
    const data = snap.data() || {};
    return (data.invoices && typeof data.invoices === "object") ? data.invoices : {};
  }

  async setPaid(cardId, invoiceKey, amount) {
    const ref = this._docRef();
    const key = `${cardId}|${invoiceKey}`;
    const payload = {};
    payload[`invoices.${key}`] = { paidAtISO: Dates.todayISO(), amount: Number(amount || 0) };
    await f.setDoc(ref, { version: 1, updatedAt: f.serverTimestamp(), ...payload }, { merge: true });
  }

  async clearPaid(cardId, invoiceKey) {
    const ref = this._docRef();
    const key = `${cardId}|${invoiceKey}`;
    const payload = {};
    payload[`invoices.${key}`] = firebase.firestore.FieldValue.delete();
    await f.setDoc(ref, { version: 1, updatedAt: f.serverTimestamp(), ...payload }, { merge: true });
  }
}

function fmtPayMethod(v) {
  const map = { dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Cartão" };
  return map[v] || "—";
}

function invoiceKeyFor(dateISO, closingDay) {
  const d = new Date((dateISO || Dates.todayISO()) + "T00:00:00");
  const day = d.getDate();
  let y = d.getFullYear();
  let m = d.getMonth();
  if (day > Number(closingDay || 10)) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}`;
}

function addMonthsToMonthKey(monthKey, delta) {
  const parts = String(monthKey || Dates.currentMonthKey()).split("-");
  let y = Number(parts[0] || 0);
  let m = Number(parts[1] || 1) - 1;
  m += Number(delta || 0);
  while (m < 0) { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
class RecurringService {
  constructor(getUid) { this.getUid = getUid; }
  _docRef() {
    const uid = this.getUid();
    if (!uid) throw new Error("Sem usuário logado.");
    return f.doc(db, `users/${uid}/meta/recurring`);
  }

  async load() {
    const snap = await f.getDoc(this._docRef());
    if (!snap.exists) return [];
    const data = snap.data() || {};
    const rules = Array.isArray(data.rules) ? data.rules : [];
    return rules.map(r => ({
      id: String(r.id || cryptoRandomId()),
      description: String(r.description || "").trim(),
      amount: Number(r.amount || 0),
      type: r.type === "entrada" ? "entrada" : "saida",
      source: ["salario_fixo","renda_extra","outros"].includes(r.source) ? r.source : "outros",
      category: String(r.category || "Outros").trim() || "Outros",
      subcategory: String(r.subcategory || "").trim(),
      day: Math.min(31, Math.max(1, Number(r.day || 1))),
      startMonth: String(r.startMonth || "").slice(0,7) || Dates.currentMonthKey(),
      endMonth: String(r.endMonth || "").slice(0,7) || "",
      active: r.active !== false,
    })).filter(r => r.description);
  }

  async save(rules) {
    const clean = (rules || []).map(r => ({
      id: String(r.id || cryptoRandomId()),
      description: String(r.description || "").trim(),
      amount: Number(r.amount || 0),
      type: r.type === "entrada" ? "entrada" : "saida",
      source: ["salario_fixo","renda_extra","outros"].includes(r.source) ? r.source : "outros",
      category: String(r.category || "Outros").trim() || "Outros",
      subcategory: String(r.subcategory || "").trim(),
      day: Math.min(31, Math.max(1, Number(r.day || 1))),
      startMonth: String(r.startMonth || "").slice(0,7) || Dates.currentMonthKey(),
      endMonth: String(r.endMonth || "").slice(0,7) || "",
      active: !!r.active,
    })).filter(r => r.description);

    await f.setDoc(this._docRef(), { version: 1, updatedAt: f.serverTimestamp(), rules: clean }, { merge: true });
    return clean;
  }

  static _monthGte(a, b) { return String(a) >= String(b); }
  static _monthLte(a, b) { return String(a) <= String(b); }
  static _daysInMonth(monthKey) {
    const [y,m] = monthKey.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }
  static _dateFor(monthKey, day) {
    const d = Math.min(this._daysInMonth(monthKey), Math.max(1, Number(day||1)));
    return `${monthKey}-${String(d).padStart(2,"0")}`;
  }

  async ensureForMonth(monthKey, txSvc, existingTxs = null) {
    const rules = await this.load();
    const mk = String(monthKey || "").slice(0,7);
    if (!mk) return { created: 0, rules };

    const txs = Array.isArray(existingTxs) ? existingTxs : await txSvc.listByMonth(mk);
    const exists = new Set(txs.filter(t => t.recurringId && t.occurrenceMonth).map(t => `${t.recurringId}::${t.occurrenceMonth}`));

    let created = 0;
    for (const r of rules) {
      if (!r.active) continue;
      if (!RecurringService._monthGte(mk, r.startMonth)) continue;
      if (r.endMonth && !RecurringService._monthLte(mk, r.endMonth)) continue;

      const key = `${r.id}::${mk}`;
      if (exists.has(key)) continue;

      const date = RecurringService._dateFor(mk, r.day);
      const tx = {
        description: r.description,
        amount: Number(r.amount || 0),
        type: r.type,
        source: r.source,
        category: r.category,
        subcategory: r.subcategory || "",
        date,
        recurringId: r.id,
        occurrenceMonth: mk,
        generatedFromRecurring: true,
      };
      await txSvc.add(tx);
      created++;
      exists.add(key);
    }

    return { created, rules };
  }
}


/**
 * Firestore:
 * users/{uid}/transactions/{txId}
 * tx = { description, amount, type, source, category, date, createdAt }
 */

class Money {
  static toBRL(value) {
    const v = Number(value || 0);
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  static parseAmount(inputValue) {
    const v = Number(inputValue);
    return Number.isFinite(v) ? v : 0;
  }
}

class Dates {
  static todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  static monthKey(iso) { return String(iso || "").slice(0, 7); }
  static currentMonthKey() { return this.monthKey(this.todayISO()); }

  static startOfWeekISO(anyDateISO) {
    // Semana começa na segunda-feira
    const d = anyDateISO ? new Date(anyDateISO + "T00:00:00") : new Date();
    const day = d.getDay(); // 0 dom ... 6 sab
    const diffToMon = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diffToMon);
    return this.dateToISO(d);
  }
  static endOfWeekISO(anyDateISO) {
    const start = new Date(this.startOfWeekISO(anyDateISO) + "T00:00:00");
    start.setDate(start.getDate() + 6);
    return this.dateToISO(start);
  }
  static dateToISO(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
}

class AuthService {
  constructor() {
    this.user = null;
    this.provider = new f.GoogleAuthProvider();
    this.provider.setCustomParameters({ prompt: "select_account" });
  }
  onChange(cb) {
    return f.onAuthStateChanged(auth, (u) => {
      this.user = u || null;
      cb(this.user);
    });
  }
  async login() {
    // Login Google no mobile/PWA varia entre navegadores.
    // Estratégia robusta:
    // 1) Tenta popup (rápido quando suportado)
    // 2) Se popup for bloqueado / ambiente não suportar, faz redirect
    const isMobile = window.matchMedia("(max-width: 980px)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    try {
      await f.signInWithPopup(auth, this.provider);
      return;
    } catch (e) {
      const code = e && e.code;
      const shouldFallbackToRedirect = isMobile || [
        "auth/popup-blocked",
        "auth/popup-closed-by-user",
        "auth/cancelled-popup-request",
        "auth/operation-not-supported-in-this-environment",
      ].includes(code);

      if (!shouldFallbackToRedirect) {
        console.warn("Popup login failed:", e);
        alert("Não foi possível abrir o login do Google. Tente novamente.");
        return;
      }

      try { sessionStorage.setItem("cf_auth_redirect", "1"); } catch (_) {}
      try {
        await f.signInWithRedirect(auth, this.provider);
      } catch (e2) {
        console.warn("Redirect login failed:", e2);
        alert("Não foi possível concluir o login com Google no celular. Se estiver no app instalado, tente abrir pelo Chrome/Safari e tente novamente.");
      }
    }
  }
  async logout() { await f.signOut(auth); }
}

class TxService {
  constructor(getUid) { this.getUid = getUid; }
  _txCol() {
    const uid = this.getUid();
    if (!uid) throw new Error("Sem usuário logado.");
    return f.collection(db, `users/${uid}/transactions`);
  }
  async add(tx) {
    const payload = { ...tx, amount: Number(tx.amount || 0), createdAt: f.serverTimestamp() };
    await f.addDoc(this._txCol(), payload);
  }

  async update(txId, tx) {
    const uid = this.getUid();
    if (!uid) throw new Error("Sem usuário logado.");
    if (!txId) throw new Error("ID do lançamento inválido.");
    const ref = f.doc(db, `users/${uid}/transactions/${txId}`);
    const payload = { ...tx, amount: Number(tx.amount || 0), updatedAt: f.serverTimestamp() };
    await f.setDoc(ref, payload, { merge: true });
  }
  async remove(txId) {
    const uid = this.getUid();
    await f.deleteDoc(f.doc(db, `users/${uid}/transactions/${txId}`));
  }
  async listAll() {
    const q = f.query(this._txCol(), f.orderBy("date", "desc"));
    const snap = await f.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async listByMonth(monthKey) {
    const q = f.query(
      this._txCol(),
      f.where("date", ">=", `${monthKey}-01`),
      f.where("date", "<=", `${monthKey}-31`),
      f.orderBy("date", "desc"),
    );
    const snap = await f.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async exportAll() {
    const all = await this.listAll();
    return {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      transactions: all.map(({ id, ...rest }) => rest)
    };
  }
  async importMerge(data) {
    const uid = this.getUid();
    const colPath = `users/${uid}/transactions`;
    const batch = f.writeBatch(db);

    (data.transactions || []).forEach((tx) => {
      const ref = f.doc(f.collection(db, colPath));
      batch.set(ref, { ...tx, amount: Number(tx.amount || 0), createdAt: f.serverTimestamp() });
    });
    await batch.commit();
  }
  async importReplace(data) {
    const uid = this.getUid();
    const all = await this.listAll();
    const batch = f.writeBatch(db);

    all.forEach((tx) => batch.delete(f.doc(db, `users/${uid}/transactions/${tx.id}`)));
    (data.transactions || []).forEach((tx) => {
      const ref = f.doc(f.collection(db, `users/${uid}/transactions`));
      batch.set(ref, { ...tx, amount: Number(tx.amount || 0), createdAt: f.serverTimestamp() });
    });
    await batch.commit();
  }
}

class PieChart {
  static palette(n) {
    const colors = [];
    for (let i = 0; i < n; i++) {
      const hue = Math.round((i * 360) / Math.max(1, n));
      colors.push(`hsl(${hue}, 70%, 55%)`);
    }
    return colors;
  }

  static draw(canvas, legendEl, items) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    legendEl.innerHTML = "";
    if (!items.length) return;

    const total = items.reduce((s, i) => s + i.value, 0);
    const colors = this.palette(items.length);

    const cx = Math.floor(W * 0.42);
    const cy = Math.floor(H * 0.52);
    const r = Math.min(W, H) * 0.38;

    let start = -Math.PI / 2;

    items.forEach((it, idx) => {
      const frac = it.value / total;
      const end = start + frac * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = colors[idx];
      ctx.globalAlpha = 0.9;
      ctx.fill();

      start = end;

      const row = document.createElement("div");
      row.className = "legendItem";
      const left = document.createElement("div");
      left.className = "legendLeft";
      const dot = document.createElement("div");
      dot.className = "dot";
      dot.style.background = colors[idx];
      const name = document.createElement("div");
      name.textContent = it.label;
      name.style.color = "rgba(233,242,255,.85)";
      left.appendChild(dot);
      left.appendChild(name);

      const pct = ((it.value / total) * 100).toFixed(1).replace(".", ",") + "%";
      const right = document.createElement("div");
      right.className = "legendVal";
      right.textContent = `${Money.toBRL(it.value)} • ${pct}`;
      row.appendChild(left);
      row.appendChild(right);
      legendEl.appendChild(row);
    });

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fill();

    ctx.fillStyle = "rgba(233,242,255,.88)";
    ctx.font = "700 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Saídas", cx, cy - 6);
    ctx.font = "900 16px system-ui";
    ctx.fillText(Money.toBRL(total), cx, cy + 16);
    ctx.textAlign = "start";
  }
}

class UI {
  constructor(authSvc, txSvc) {
    this.authSvc = authSvc;
    this.txSvc = txSvc;
    this.catSvc = new CategoryService(() => this.authSvc.user?.uid);
    this.recSvc = new RecurringService(() => this.authSvc.user?.uid);
    this.cardSvc = new CardService(() => this.authSvc.user?.uid);
    this.invSvc = new CardInvoiceService(() => this.authSvc.user?.uid);

    this.state = {
      route: "dashboard",
      monthKey: Dates.currentMonthKey(),
      quickFilter: null,
      txMonth: [],
      categories: [],
      relLastList: [],
      relMeta: { label: "—", from: null, to: null },
      lancView: "cards",
      history: [],
      editTxId: null,
      editTxObj: null,
      recurring: [],
      editRecId: null,
      cards: [],
      cardInvoices: {},
      editCardId: null
    };

    this.$ = (id) => document.getElementById(id);

    this.authStatus = this.$("authStatus");
    this.btnLogin = this.$("btnLogin");
    this.btnLogout = this.$("btnLogout");
    this.btnBack = this.$("btnBack");
    this.btnMenu = this.$("btnMenu");
    this.drawer = this.$("drawer");
    this.drawerBackdrop = this.$("drawerBackdrop");
    this.versionInfo = this.$("versionInfo");
    this.versionBadge = this.$("versionBadge");

    this.tabs = Array.from(document.querySelectorAll(".tab"));

    this.cardSaldo = this.$("cardSaldo");
    this.cardEntradas = this.$("cardEntradas");
    this.cardSaidas = this.$("cardSaidas");
    this.cardExtra = this.$("cardExtra");

    this.saldoMes = this.$("saldoMes");
    this.entradasMes = this.$("entradasMes");
    this.saidasMes = this.$("saidasMes");
    this.extraMes = this.$("extraMes");
    this.totalLanc = this.$("totalLanc");
    this.entradasFixas = this.$("entradasFixas");
    this.topCat = this.$("topCat");
    this.qtExtra = this.$("qtExtra");

    this.saldoAteHoje = this.$("saldoAteHoje");
    this.saldoPrevisto = this.$("saldoPrevisto");
    this.saldoPrevistoHint = this.$("saldoPrevistoHint");

    this.pieCanvas = this.$("pieCanvas");
    this.pieLegend = this.$("pieLegend");
    this.chartEmpty = this.$("chartEmpty");

    this.quickForm = this.$("quickForm");
    this.qDesc = this.$("qDesc");
    this.qValor = this.$("qValor");
    this.qTipo = this.$("qTipo");
    this.qFonte = this.$("qFonte");
    this.qFonteWrap = this.$("qFonteWrap");
    this.qCategoria = this.$("qCategoria");
    this.qSubcategoria = this.$("qSubcategoria");
    this.qData = this.$("qData");
    this.qPayRow = this.$("qPayRow");
    this.qPayMethod = this.$("qPayMethod");
    this.qCardWrap = this.$("qCardWrap");
    this.qCard = this.$("qCard");
    this.qInstWrap = this.$("qInstWrap");
    this.qInstallments = this.$("qInstallments");
    this.qInstHint = this.$("qInstHint");
    this.qCardBtn = this.$("qCardBtn");
    this.qCardBtnText = this.$("qCardBtnText");
    this.cardPickerModal = this.$("cardPickerModal");
    this.cardPickerList = this.$("cardPickerList");
    this.cardPickerClose = this.$("cardPickerClose");
    this.qInvoiceHint = this.$("qInvoiceHint");
    this.qRecRow = this.$("qRecRow");
    this.qMakeRecurring = this.$("qMakeRecurring");
    this.qMakeRecurringNote = this.$("qMakeRecurringNote");
    this.btnSalvar = this.$("btnSalvar");
    this.quickMsg = this.$("quickMsg");
    this.btnLimparEdicao = this.$("btnLimparEdicao");
    this.btnVerLanc = this.$("btnVerLanc");

    // Categorias
    this.catNome = this.$("catNome");
    this.catCor = this.$("catCor");
    this.catCorPalette = this.$("catCorPalette");
    this.dlgCatEdit = this.$("dlgCatEdit");
    this.btnFecharCatEdit = this.$("btnFecharCatEdit");
    this.btnCancelarCatEdit = this.$("btnCancelarCatEdit");
    this.btnSalvarCatEdit = this.$("btnSalvarCatEdit");
    this.editCatNome = this.$("editCatNome");
    this.editCatCor = this.$("editCatCor");
    this.editCatCorPalette = this.$("editCatCorPalette");
    this.editCatMsg = this.$("editCatMsg");
    this.btnAddCat = this.$("btnAddCat");
    this.catMsg = this.$("catMsg");
    this.catsWrap = this.$("catsWrap");
    // Add Category modal
    this.btnOpenAddCat = this.$("btnOpenAddCat");
    this.catAddModal = this.$("catAddModal");
    this.catAddClose = this.$("catAddClose");
    this.catAddCancel = this.$("catAddCancel");

    // Add Subcategory modal
    this.btnOpenAddSub = this.$("btnOpenAddSub");
    this.subAddModal = this.$("subAddModal");
    this.subAddClose = this.$("subAddClose");
    this.subAddCancel = this.$("subAddCancel");
    this.subNome = this.$("subNome");
    this.subCatSelect = this.$("subCatSelect");
    this.btnAddSub = this.$("btnAddSub");
    this.subMsg = this.$("subMsg");


    this.fMes = this.$("fMes");
    this.fTipo = this.$("fTipo");
    this.fFonte = this.$("fFonte");
    this.fBusca = this.$("fBusca");
    this.fPay = this.$("fPay");
    this.btnLimparFiltro = this.$("btnLimparFiltro");

    // Recorrentes
    this.btnRecorrentes = this.$("btnRecorrentes");
    this.dlgRecorrentes = this.$("dlgRecorrentes");
    this.btnFecharRec = this.$("btnFecharRec");
    this.recWrap = this.$("recWrap");
    this.recFormTitle = this.$("recFormTitle");
    this.recDesc = this.$("recDesc");
    this.recValor = this.$("recValor");
    this.recDia = this.$("recDia");
    this.recTipo = this.$("recTipo");
    this.recFonte = this.$("recFonte");
    this.recCategoria = this.$("recCategoria");
    this.recSubcategoria = this.$("recSubcategoria");
    this.recStart = this.$("recStart");
    this.recAtivo = this.$("recAtivo");
    this.btnRecCancelar = this.$("btnRecCancelar");
    this.btnRecSalvar = this.$("btnRecSalvar");
    this.recMsg = this.$("recMsg");

    this.segCards = this.$("segCards");
    this.segTabela = this.$("segTabela");
    this.cardsLanc = this.$("cardsLanc");
    this.tableWrap = this.$("tableWrap");
    this.tbodyLanc = this.$("tbodyLanc");
    this.emptyLanc = this.$("emptyLanc");

    this.rModo = this.$("rModo");
    this.rMes = this.$("rMes");
    this.rSemana = this.$("rSemana");
    this.rDe = this.$("rDe");
    this.rAte = this.$("rAte");
    this.wrapMes = this.$("wrapMes");
    this.wrapSemana = this.$("wrapSemana");
    this.wrapDe = this.$("wrapDe");
    this.wrapAte = this.$("wrapAte");
    this.btnGerarRel = this.$("btnGerarRel");
    this.btnCsv = this.$("btnCsv");
    this.btnPdf = this.$("btnPdf");
    this.btnCartoes = this.$("btnCartoes");
    this.btnGerenciarCartoes = this.$("btnGerenciarCartoes");

    // Cartões / faturas
    this.dlgCartoes = this.$("dlgCartoes");
    this.btnFecharCartoes = this.$("btnFecharCartoes");
    this.cardFormTitle = this.$("cardFormTitle");
    this.cardNome = this.$("cardNome");
    this.cardLimite = this.$("cardLimite");
    this.cardFechamento = this.$("cardFechamento");
    this.cardVencimento = this.$("cardVencimento");
    this.btnCardCancelar = this.$("btnCardCancelar");
    this.btnCardSalvar = this.$("btnCardSalvar");
    this.cardMsg = this.$("cardMsg");
    this.cardsWrap = this.$("cardsWrap");
    this.fatCard = this.$("fatCard");
    this.fatMes = this.$("fatMes");
    this.fatTotal = this.$("fatTotal");
    this.fatStatus = this.$("fatStatus");
    this.fatDatas = this.$("fatDatas");
    this.btnFatMarcarPaga = this.$("btnFatMarcarPaga");
    this.btnFatDesmarcar = this.$("btnFatDesmarcar");
    this.fatLista = this.$("fatLista");
    this.fatEmpty = this.$("fatEmpty");

    this.repEntradas = this.$("repEntradas");
    this.repSaidas = this.$("repSaidas");
    this.repSaldo = this.$("repSaldo");
    this.repFixas = this.$("repFixas");
    this.repExtra = this.$("repExtra");
    this.repPeriodo = this.$("repPeriodo");
    this.repCats = this.$("repCats");
    this.printArea = this.$("printArea");

    this.btnExportar = this.$("btnExportar");
    this.fileImport = this.$("fileImport");
    this.btnImportMesclar = this.$("btnImportMesclar");
    this.btnImportSubst = this.$("btnImportSubst");
    this.bkMsg = this.$("bkMsg");
    this.imMsg = this.$("imMsg");
  }

  init() {
    this.qData.value = Dates.todayISO();
    this.fMes.value = this.state.monthKey;

    if (this.fatMes) this.fatMes.value = this.state.monthKey;

    if (this.versionInfo) {
      this.versionInfo.textContent = `${APP_VERSION} • Atualizado em ${BUILD_TIME}`;
      this.versionInfo.title = `Build: ${BUILD_TIME_ISO}`;
    }
    if (this.versionBadge) {
      this.versionBadge.textContent = `(${APP_VERSION})`;
    }

    this._initCategoryPalettes();
    this._initCategoryEditDialog();

    const closeDrawer = () => {
      if (!this.drawer) return;

      // If focus is inside the drawer, move it out BEFORE hiding from assistive tech.
      const active = document.activeElement;
      if (active && this.drawer.contains(active)) {
        (this.btnMenu || this.btnBack || document.body).focus?.();
      }

      this.drawer.classList.remove("is-open");
      this.drawer.setAttribute("aria-hidden", "true");
      // Prefer inert to prevent focus/interaction when closed (supported by modern browsers).
      this.drawer.setAttribute("inert", "");
    };
    const openDrawer = () => {
      if (!this.drawer) return;
      this.drawer.classList.add("is-open");
      this.drawer.setAttribute("aria-hidden", "false");
      this.drawer.removeAttribute("inert");

      // Focus first actionable item for accessibility.
      const first = this.drawer.querySelector("button, a, input, [tabindex]:not([tabindex='-1'])");
      first?.focus?.();
    };
    this._closeDrawer = closeDrawer;

    if (this.btnMenu) {
      this.btnMenu.addEventListener("click", () => {
        if (!this.drawer) return;
        const isOpen = this.drawer.classList.contains("is-open");
        (isOpen ? closeDrawer : openDrawer)();
      });
    }
    if (this.drawerBackdrop) this.drawerBackdrop.addEventListener("click", closeDrawer);
    document.querySelectorAll(".drawer__item").forEach(btn => {
      btn.addEventListener("click", () => {
        this.go(btn.dataset.route);
        closeDrawer();
      });
    });

    if (this.btnBack) {
      this.btnBack.addEventListener("click", () => this.back());
    }

    this.rMes.value = this.state.monthKey;
    this.rSemana.value = Dates.todayISO();

    this._applyRelModeUI();
    this._bind();
    this._applyTypeUI();
    this.go("dashboard");
    this._applyLancView();
  }

  _bind() {
    this.btnLogin.addEventListener("click", async () => {
      try { await this.authSvc.login(); } catch (e) { alert(e.message); }
    });
    this.btnLogout.addEventListener("click", async () => {
      try { await this.authSvc.logout(); } catch (e) { alert(e.message); }
    });

    this.tabs.forEach(t => t.addEventListener("click", () => this.go(t.dataset.route)));

    [this.cardSaldo, this.cardEntradas, this.cardSaidas, this.cardExtra].forEach(card => {
      card.addEventListener("click", () => {
        this.state.quickFilter = card.dataset.filter;
        this.go("lancamentos");
        this.renderLancamentos();
      });
    });

    this.quickForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      this.quickMsg.textContent = "";

      try {
        await this._requireLogin();

        // Fonte faz sentido somente para ENTRADA; Pagamento somente para SAÍDA.
        const type = this.qTipo.value;
        const isEntrada = type === "entrada";
        const isSaida = type === "saida";

        const payMethod = isSaida ? (this.qPayMethod?.value || "dinheiro") : "";
        const cardId = (isSaida && payMethod === "credito") ? (this.qCard?.value || "") : "";

        const tx = {
          description: this.qDesc.value.trim(),
          amount: Money.parseAmount(this.qValor.value),
          type,
          source: isEntrada ? (this.qFonte.value || "outros") : "",
          category: this.qCategoria.value,
          subcategory: (this.qSubcategoria?.value || "") || "",
          date: this.qData.value || Dates.todayISO(),
          payMethod,
          cardId
        };

        if (!tx.description) throw new Error("Descrição obrigatória.");
        if (!(tx.amount > 0)) throw new Error("Valor precisa ser maior que zero.");

        if (this.state.editTxId) {
          await this.txSvc.update(this.state.editTxId, tx);

          // Option: convert a normal launch into a recurring rule
          const wasRecurring = !!this.state.editTxObj?.recurringId;
          const wantsRecurring = !!this.qMakeRecurring?.checked;

          if (wantsRecurring && !wasRecurring) {
            const mk = String((tx.date || Dates.todayISO())).slice(0, 7) || this.state.monthKey;
            const day = Number(String(tx.date || "").slice(8, 10)) || 1;
            const rule = {
              id: cryptoRandomId(),
              description: tx.description,
              amount: Number(tx.amount || 0),
              type: tx.type,
              source: tx.source,
              category: tx.category,
              subcategory: tx.subcategory || "",
              day: Math.min(31, Math.max(1, day)),
              startMonth: mk,
              endMonth: "",
              active: true,
            };

            // Keep local state in sync
            const existing = Array.isArray(this.state.recurring) && this.state.recurring.length
              ? this.state.recurring
              : await this.recSvc.load();
            const next = [...existing, rule].sort((a,b)=>a.description.localeCompare(b.description,'pt-BR'));
            this.state.recurring = await this.recSvc.save(next);

            // Tag this transaction so the generator won't duplicate this month
            await this.txSvc.update(this.state.editTxId, {
              recurringId: rule.id,
              occurrenceMonth: mk,
              generatedFromRecurring: false,
            });
            this.quickMsg.textContent = "Alterações salvas ✅ (marcado como recorrente)";
          } else {
            this.quickMsg.textContent = "Alterações salvas ✅";
          }

          this._clearEditMode();
        } else {
          // NOVO lançamento
          const n = (isSaida && payMethod === "credito")
            ? Math.max(1, Math.min(24, parseInt(this.qInstallments?.value || "1", 10) || 1))
            : 1;

          if (isSaida && payMethod === "credito" && n > 1) {
            if (!cardId) throw new Error("Selecione um cartão para parcelar.");
            const groupId = cryptoRandomId();
            const parts = splitAmountBRL(tx.amount, n);

            for (let idx = 0; idx < n; idx++) {
              const date = addMonthsClampISO(tx.date, idx);
              const desc = `${tx.description} (${idx + 1}/${n})`;
              await this.txSvc.add({
                ...tx,
                description: desc,
                amount: parts[idx],
                date,
                installmentGroupId: groupId,
                installmentNo: idx + 1,
                installmentCount: n,
                originalDescription: tx.description
              });
            }

            this.qDesc.value = "";
            this.qValor.value = "";
            this._resetPayFields();
            this._applyTypeUI();
            this._updateInvoiceHint();
            this.quickMsg.textContent = `Salvo em ${n} parcelas ✅`;
          } else {
            await this.txSvc.add(tx);
            this.qDesc.value = "";
            this.qValor.value = "";
            this._resetPayFields();
            // Mantém a UI coerente com o tipo padrão
            this._applyTypeUI();
            this._updateInvoiceHint();
            this.quickMsg.textContent = "Salvo com sucesso ✅";
          }
        }

        await this.refreshMonth();
        // garante que a lista reflita imediatamente sem precisar F5
        if (this.state.route === "lancamentos") this.renderLancamentos();
      } catch (e) {
        this.quickMsg.textContent = e.message || "Erro ao salvar.";
      }
    });

    // Update recurring note (only when editing)
    if (this.qData) {
      this.qData.addEventListener("change", () => {
        if (this.state.editTxId) this._updateMakeRecurringNote();
        this._updateInvoiceHint();
      });
    }

    if (this.qPayMethod) {
      this.qPayMethod.addEventListener("change", () => {
        const isCredit = this.qPayMethod.value === "credito";
        const canSplit = isCredit && !this.state.editTxId && (this.qTipo?.value === "saida");
        if (this.qCardWrap) this.qCardWrap.style.display = isCredit ? "block" : "none";
        if (this.qInstWrap) this.qInstWrap.style.display = canSplit ? "block" : "none";
        if (!canSplit && this.qInstallments) this.qInstallments.value = "1";

        if (!isCredit && this.qCard) this.qCard.value = "";
        if (!isCredit && this.qCardBtnText) this.qCardBtnText.textContent = "Selecione um cartão…";

        this._updateInstallmentHint();
        this._updateInvoiceHint();
      });
    }

    if (this.qTipo) {
      this.qTipo.addEventListener("change", () => {
        this._applyTypeUI();
      });
    }

    if (this.qInstallments) {
      this.qInstallments.addEventListener("input", () => this._updateInstallmentHint());
      this.qInstallments.addEventListener("change", () => this._updateInstallmentHint());
    }
    // Seletor de cartão: em PWA/Android o <select> pode "bugar"; usamos um picker custom quando disponível.
    if (this.qCardBtn) {
      this.qCardBtn.addEventListener("click", () => this._openCardPicker());
    } else if (this.qCard) {
      // fallback (desktop): select nativo
      this.qCard.addEventListener("change", () => {
        if (this.qCard.value === "__add__") {
          this.qCard.value = "";
          this._openCartoesDialog("faturas");
          return;
        }
        this._updateInvoiceHint();
      });
    }

    if (this.cardPickerClose) {
      this.cardPickerClose.addEventListener("click", () => this._closeCardPicker());
    }
    if (this.cardPickerModal) {
      this.cardPickerModal.addEventListener("click", (e) => {
        if (e.target === this.cardPickerModal) this._closeCardPicker();
      });
    }

    if (this.qCategoria && this.qSubcategoria) {
      this.qCategoria.addEventListener("change", () => {
        this._populateSubSelect(this.qCategoria.value);
      });
    }

    this.btnVerLanc.addEventListener("click", () => {
      this.state.quickFilter = null;
      this.go("lancamentos");
      this.renderLancamentos();
    });


    if (this.btnLimparEdicao) {
      this.btnLimparEdicao.addEventListener("click", () => {
        // Cancel edit / clear quick form without saving
        this._clearEditMode(true);
        this.quickMsg.textContent = "Edição cancelada.";
      });
    }


    // Open/Close: Nova categoria (modal)
    const closeCatAdd = () => {
      if (this.catAddModal) this.catAddModal.style.display = "none";
      if (this.catMsg) this.catMsg.textContent = "";
      if (this.catNome) this.catNome.value = "";
    };
    if (this.btnOpenAddCat) {
      this.btnOpenAddCat.addEventListener("click", async () => {
        try {
          await this._requireLogin();
          if (this.catAddModal) this.catAddModal.style.display = "block";
          if (this.catMsg) this.catMsg.textContent = "";
          // ensure palette selection reflects current hidden input
          this._mountPalette(this.catCorPalette, this.catCor);
          setTimeout(() => this.catNome?.focus(), 0);
        } catch (_) {}
      });
    }
    this.catAddClose?.addEventListener("click", closeCatAdd);
    this.catAddCancel?.addEventListener("click", closeCatAdd);
    // Close on backdrop click
    this.catAddModal?.addEventListener("click", (e) => {
      if (e.target === this.catAddModal) closeCatAdd();
    });

    // Open/Close: Nova subcategoria (modal)
    const closeSubAdd = () => {
      if (this.subAddModal) this.subAddModal.style.display = "none";
      if (this.subMsg) this.subMsg.textContent = "";
      if (this.subNome) this.subNome.value = "";
      if (this.subCatSelect) this.subCatSelect.value = "";
    };
    if (this.btnOpenAddSub) {
      this.btnOpenAddSub.addEventListener("click", async () => {
        try {
          await this._requireLogin();
          this._fillSubcategoryCategorySelect();
          if (!(this.state.categories || []).filter(c=>!isHiddenCategoryName(c.name)).length) {
            alert("Crie uma categoria antes de adicionar subcategoria.");
            return;
          }
          if (this.subAddModal) this.subAddModal.style.display = "block";
          if (this.subMsg) this.subMsg.textContent = "";
          setTimeout(() => this.subNome?.focus(), 0);
        } catch (_) {}
      });
    }
    this.subAddClose?.addEventListener("click", closeSubAdd);
    this.subAddCancel?.addEventListener("click", closeSubAdd);
    this.subAddModal?.addEventListener("click", (e) => {
      if (e.target === this.subAddModal) closeSubAdd();
    });

    if (this.btnAddSub) {
      this.btnAddSub.addEventListener("click", async () => {
        try {
          await this._requireLogin();
          if (this.subMsg) this.subMsg.textContent = "";
          const name = (this.subNome?.value || "").trim();
          const catId = (this.subCatSelect?.value || "").trim();
          if (!name) throw new Error("Digite um nome para a subcategoria.");
          if (!catId) throw new Error("Selecione a categoria.");
          await this._addSubcategoryByModal(catId, name);
          if (this.subMsg) this.subMsg.textContent = "Subcategoria adicionada ✅";
          setTimeout(closeSubAdd, 450);
        } catch (e) {
          if (this.subMsg) this.subMsg.textContent = e.message || "Erro ao adicionar.";
        }
      });
    }

    if (this.btnAddCat) {
      this.btnAddCat.addEventListener("click", async () => {
        try {
          await this._requireLogin();
          this.catMsg.textContent = "";
          const name = (this.catNome.value || "").trim();
          if (!name) throw new Error("Digite um nome para a categoria.");
          const exists = (this.state.categories || []).some(c => c.name.toLowerCase() === name.toLowerCase());
          if (exists) throw new Error("Essa categoria já existe.");
          const color = (this.catCor?.value || "#2563EB").trim();
          const next = [...(this.state.categories || []), { id: cryptoRandomId(), name, color, subs: [] }]
            .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
          this.state.categories = await this.catSvc.save(next);
          this.catNome.value = "";
          this.catMsg.textContent = "Categoria adicionada ✅";
          setTimeout(() => { try { closeCatAdd(); } catch(_){} }, 450);
          this._syncCategorySelects();
          this.renderCategorias();
        } catch (e) {
          this.catMsg.textContent = e.message || "Erro ao adicionar.";
        }
      });
    }

    this.fMes.addEventListener("change", async () => {
      this.state.monthKey = this.fMes.value || Dates.currentMonthKey();
      await this.refreshMonth();
      this.renderLancamentos();
    });
    [this.fTipo, this.fFonte, this.fPay, this.fBusca].filter(Boolean).forEach(el => {
      el.addEventListener("input", () => this.renderLancamentos());
    });
    this.btnLimparFiltro.addEventListener("click", () => {
      this.fTipo.value = "todos";
      this.fFonte.value = "todas";
      if (this.fPay) this.fPay.value = "todas";
      this.fBusca.value = "";
      this.state.quickFilter = null;
      this.renderLancamentos();
    });

    // Recorrentes (dialog)
    if (this.btnRecorrentes && this.dlgRecorrentes) {
      const openRec = async () => {
        try {
          await this._requireLogin();
          await this._loadRecurring();
          this._resetRecForm();
          this._syncRecCategorySelects();
          this._renderRecurring();
          this.dlgRecorrentes.showModal();
        } catch (e) {
          alert(e.message || "Erro ao abrir recorrentes.");
        }
      };
      this.btnRecorrentes.addEventListener("click", openRec);
      this.btnFecharRec?.addEventListener("click", () => this.dlgRecorrentes.close());
      this.btnRecCancelar?.addEventListener("click", () => this._resetRecForm());
      this.recCategoria?.addEventListener("change", () => this._populateRecSubSelect(this.recCategoria.value));
      this.btnRecSalvar?.addEventListener("click", async () => {
        try {
          await this._requireLogin();
          this.recMsg.textContent = "";
          const rule = this._readRecForm();
          const list = (this.state.recurring || []).slice();
          const idx = list.findIndex(r => r.id === rule.id);
          if (idx >= 0) list[idx] = rule; else list.push(rule);
          this.state.recurring = await this.recSvc.save(list);
          this.recMsg.textContent = "Salvo ✅";
          this._resetRecForm();
          this._renderRecurring();

          // Gera para o mês selecionado e recarrega
          await this._ensureRecurringForCurrentMonth();
          await this.refreshMonth();
        } catch (e) {
          this.recMsg.textContent = e.message || "Erro ao salvar.";
        }
      });
    }

    this.segCards.addEventListener("click", () => {
      this.state.lancView = "cards";
      this._applyLancView();
    });
    this.segTabela.addEventListener("click", () => {
      this.state.lancView = "tabela";
      this._applyLancView();
    });

    this.rModo.addEventListener("change", () => this._applyRelModeUI());

    this.btnGerarRel.addEventListener("click", async () => {
      try { await this._requireLogin(); await this._generateReport(); }
      catch (e) { alert(e.message); }
    });

    this.btnCsv.addEventListener("click", () => this._exportCSV());
    this.btnPdf.addEventListener("click", () => this._exportPDF());

    this.btnExportar.addEventListener("click", async () => {
      try {
        await this._requireLogin();
        const data = await this.txSvc.exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        downloadBlob(blob, `backup-controle-financeiro-${Dates.todayISO()}.json`);
        this.bkMsg.textContent = "Backup gerado ✅";
      } catch (e) {
        this.bkMsg.textContent = e.message || "Erro ao exportar.";
      }
    });

    if (this.btnCartoes) {
      this.btnCartoes.addEventListener("click", async () => {
        try {
          await this._requireLogin();
          this.state.cards = await this.cardSvc.loadOrSeed();
          this.state.cardInvoices = await this.invSvc.load();
          this._syncCardSelects();
          this._openCartoesDialog("faturas");
        } catch (e) {
          alert(e.message || "Erro ao abrir cartões.");
        }
      });
    }

    if (this.btnGerenciarCartoes) {
      this.btnGerenciarCartoes.addEventListener("click", async () => {
        try {
          await this._requireLogin();
          this.state.cards = await this.cardSvc.loadOrSeed();
          this.state.cardInvoices = await this.invSvc.load();
          this._syncCardSelects();
          this._openCartoesDialog("gerenciar");
        } catch (e) {
          alert(e.message || "Erro ao abrir cartões.");
        }
      });
    }
    this.btnFecharCartoes?.addEventListener("click", () => this._closeCartoesDialog());
    this.fatCard?.addEventListener("change", () => this._renderFatura());
    this.fatMes?.addEventListener("change", () => this._renderFatura());

    this.btnCardCancelar?.addEventListener("click", () => this._clearCardForm());
    this.btnCardSalvar?.addEventListener("click", async () => {
      try {
        await this._requireLogin();
        if (this.cardMsg) this.cardMsg.textContent = "";
        const name = (this.cardNome?.value || "").trim();
        if (!name) throw new Error("Digite o nome do cartão.");
        const limit = Money.parseAmount(this.cardLimite?.value || "0");
        const closingDay = Math.min(28, Math.max(1, Number(this.cardFechamento?.value || 10)));
        const dueDay = Math.min(28, Math.max(1, Number(this.cardVencimento?.value || 5)));

        const list = (this.state.cards || []).slice();
        if (this.state.editCardId) {
          const idx = list.findIndex(c => c.id === this.state.editCardId);
          if (idx >= 0) list[idx] = { ...list[idx], name, limit, closingDay, dueDay };
        } else {
          list.push({ id: cryptoRandomId(), name, limit, closingDay, dueDay });
        }

        this.state.cards = await this.cardSvc.save(list);
        this._syncCardSelects();
        this._renderCardsAdmin();
        this._renderFatura();
        this._clearCardForm();
        if (this.cardMsg) this.cardMsg.textContent = "Salvo ✅";
      } catch (e) {
        if (this.cardMsg) this.cardMsg.textContent = e.message || "Erro ao salvar cartão.";
      }
    });

    this.btnFatMarcarPaga?.addEventListener("click", async () => {
      try {
        await this._requireLogin();
        const cardId = this.fatCard?.value || "";
        const invKey = this.fatMes?.value || "";
        if (!cardId || !invKey) throw new Error("Selecione cartão e mês.");
        const card = (this.state.cards || []).find(c => c.id === cardId);
        const txs = (this.state.txMonthAll || []).length ? this.state.txMonthAll : (this.state.txMonth || []);
        const items = txs.filter(t => (t.payMethod === "credito") && (t.cardId === cardId))
          .filter(t => invoiceKeyFor(t.date, card?.closingDay || 10) === invKey);
        const total = items.reduce((s,t)=>s + Number(t.amount||0), 0);
        await this.invSvc.setPaid(cardId, invKey, total);
        this.state.cardInvoices = await this.invSvc.load();
        this._renderFatura();
      } catch (e) {
        alert(e.message || "Erro ao marcar como paga.");
      }
    });

    this.btnFatDesmarcar?.addEventListener("click", async () => {
      try {
        await this._requireLogin();
        const cardId = this.fatCard?.value || "";
        const invKey = this.fatMes?.value || "";
        if (!cardId || !invKey) throw new Error("Selecione cartão e mês.");
        await this.invSvc.clearPaid(cardId, invKey);
        this.state.cardInvoices = await this.invSvc.load();
        this._renderFatura();
      } catch (e) {
        alert(e.message || "Erro ao desmarcar.");
      }
    });

    this.btnImportMesclar.addEventListener("click", async () => this._handleImport("merge"));
    this.btnImportSubst.addEventListener("click", async () => this._handleImport("replace"));
  }

  _resetPayFields() {
    if (this.qPayMethod) this.qPayMethod.value = "dinheiro";
    if (this.qCard) this.qCard.value = "";
    if (this.qCardBtnText) this.qCardBtnText.textContent = "Selecione um cartão…";
    if (this.qCardWrap) this.qCardWrap.style.display = "none";
    if (this.qInstallments) this.qInstallments.value = "1";
    if (this.qInstWrap) this.qInstWrap.style.display = "none";
    if (this.qInstHint) this.qInstHint.textContent = "Ao salvar, vou criar 1 lançamento por mês.";
    if (this.qInvoiceHint) this.qInvoiceHint.textContent = "";
  }

  _applyTypeUI() {
    const type = this.qTipo?.value || "saida";
    const isEntrada = type === "entrada";

    // Fonte só para ENTRADA
    if (this.qFonteWrap) this.qFonteWrap.style.display = isEntrada ? "flex" : "none";

    // Pagamento só para SAÍDA
    if (this.qPayRow) this.qPayRow.style.display = isEntrada ? "none" : "grid";

    if (isEntrada) {
      // Limpa pagamento para não confundir
      this._resetPayFields();
    }

    // Ajusta hint
    const pm = this.qPayMethod?.value || "dinheiro";
    const canSplit = (type === "saida") && (pm === "credito") && !this.state.editTxId;
    if (this.qInstWrap) this.qInstWrap.style.display = canSplit ? "block" : "none";
    if (!canSplit && this.qInstallments) this.qInstallments.value = "1";
    this._updateInstallmentHint();
    this._updateInvoiceHint();
  }

  _applyLancView() {
    const isCards = this.state.lancView === "cards";
    this.segCards.classList.toggle("is-active", isCards);
    this.segTabela.classList.toggle("is-active", !isCards);
    this.cardsLanc.style.display = isCards ? "grid" : "none";
    this.tableWrap.style.display = isCards ? "none" : "block";
  }

  _applyRelModeUI() {
    const mode = this.rModo.value;
    const showMes = mode === "mensal";
    const showSemana = mode === "semanal";
    const showPeriodo = mode === "periodo";

    this.wrapMes.style.display = showMes ? "flex" : "none";
    this.wrapSemana.style.display = showSemana ? "flex" : "none";
    this.wrapDe.style.display = showPeriodo ? "flex" : "none";
    this.wrapAte.style.display = showPeriodo ? "flex" : "none";
  }

  async _generateReport() {
    const mode = this.rModo.value;

    const all = await this.txSvc.listAll();
    let list = [];
    let label = "";
    let from = null;
    let to = null;

    if (mode === "mensal") {
      const mk = this.rMes.value || Dates.currentMonthKey();
      from = `${mk}-01`;
      to = `${mk}-31`;
      label = `Mensal • ${mk}`;
      list = all.filter(tx => tx.date >= from && tx.date <= to);
    } else if (mode === "semanal") {
      const any = this.rSemana.value || Dates.todayISO();
      from = Dates.startOfWeekISO(any);
      to = Dates.endOfWeekISO(any);
      label = `Semanal • ${from} até ${to}`;
      list = all.filter(tx => tx.date >= from && tx.date <= to);
    } else {
      from = this.rDe.value || null;
      to = this.rAte.value || null;
      if (!from || !to) throw new Error("No modo Período, preencha De e Até.");
      label = `Período • ${from} até ${to}`;
      list = all.filter(tx => tx.date >= from && tx.date <= to);
    }

    this.state.relLastList = list;
    this.state.relMeta = { label, from, to };

    this._renderReport(list, label);
  }

  async _handleImport(mode) {
    try {
      await this._requireLogin();
      this.imMsg.textContent = "";

      const file = this.fileImport.files?.[0];
      if (!file) throw new Error("Selecione um arquivo JSON.");

      const txt = await file.text();
      const data = JSON.parse(txt);

      if (!data || !Array.isArray(data.transactions)) {
        throw new Error("Arquivo inválido: não encontrei 'transactions'.");
      }

      if (mode === "replace") {
        const ok = confirm("Isso vai APAGAR seus lançamentos atuais e substituir pelo arquivo. Confirmar?");
        if (!ok) return;
        await this.txSvc.importReplace(data);
      } else {
        await this.txSvc.importMerge(data);
      }

      this.imMsg.textContent = "Importação concluída ✅";
      await this.refreshMonth();
      this.renderLancamentos();
    } catch (e) {
      this.imMsg.textContent = e.message || "Erro ao importar.";
    }
  }

  async onAuth(user) {
    if (user) {
      this.authStatus.textContent = user.displayName ? `Logado: ${user.displayName}` : "Logado";
      this.btnLogin.style.display = "none";
      this.btnLogout.style.display = "inline-flex";

      // Categorias (seed + load)
      try {
        this.state.categories = await this.catSvc.loadOrSeed();
        this._syncCategorySelects();
      } catch (e) {
        console.warn("Falha ao carregar categorias:", e);
      }

      // Recorrentes
      try {
        this.state.recurring = await this.recSvc.load();
        await this._ensureRecurringForMonth(this.state.monthKey);
      } catch (e) {
        console.warn("Falha ao carregar recorrentes:", e);
      }

      // Cartões (precisa estar carregado já na tela inicial para o seletor funcionar)
      try {
        this.state.cards = await this.cardSvc.loadOrSeed();
        this.state.cardInvoices = await this.invSvc.load();
        this._syncCardSelects();
        this._updateInvoiceHint();
      } catch (e) {
        console.warn("Falha ao carregar cartões:", e);
      }

      await this.refreshMonth();
      this.renderLancamentos();
      if (this.state.route === "categorias") this.renderCategorias();
    } else {
      this.authStatus.textContent = "Deslogado";
      this.btnLogin.style.display = "inline-flex";
      this.btnLogout.style.display = "none";
      this.state.txMonth = [];
      this.state.categories = [];
      this.state.cards = [];
      this.state.cardInvoices = {};
      this._renderDashboard();
      this.renderLancamentos();
      this._syncCategorySelects(false);
      try { this._syncCardSelects(); } catch (_) {}
    }
  }

  async _requireLogin() {
    if (!this.authSvc.user) throw new Error("Faça login com Google para usar seus dados.");
  }

  _setRoute(route) {
    this.state.route = route;
    this.tabs.forEach(t => t.classList.toggle("is-active", t.dataset.route === route));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("is-visible"));
    document.getElementById(`view-${route}`).classList.add("is-visible");
  }

  go(route, push = true) {
    const prev = this.state.route;
    if (push && prev && prev !== route) this.state.history.push(prev);
    this._setRoute(route);
    this._afterRoute();
  }

  back() {
    const prev = this.state.history.pop();
    if (prev) {
      this._setRoute(prev);
      this._afterRoute(false);
    }
  }

  _afterRoute() {
    // Back button
    if (this.btnBack) this.btnBack.style.display = (this.state.history.length ? "inline-flex" : "none");
    // Close drawer on navigation
    if (this._closeDrawer) this._closeDrawer();

    // Render as needed
    if (this.state.route === "dashboard") {
      this._renderDashboard();
    }
    if (this.state.route === "lancamentos") {
      this.renderLancamentos();
    }
    if (this.state.route === "categorias") {
      this.renderCategorias();
    }
  }

  async refreshMonth() {
    if (!this.authSvc.user) return;
    await this._ensureRecurringForMonth(this.state.monthKey);
    this.state.txMonth = await this.txSvc.listByMonth(this.state.monthKey);
    this._renderDashboard();
    if (this.state.route === "lancamentos") this.renderLancamentos();
  }

  _syncCategorySelects(useManaged = true) {
    // If not logged, keep the hardcoded options.
    if (!this.qCategoria) return;
    if (!useManaged || !(this.state.categories || []).length) {
      // still ensure subcategory select exists
      if (this.qSubcategoria) {
        this.qSubcategoria.innerHTML = `<option value="">—</option>`;
      }
      return;
    }

    const current = this.qCategoria.value;
    const cats = (this.state.categories || []).slice().filter(c=>!isHiddenCategoryName(c.name)).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
    this.qCategoria.innerHTML = cats.map(c => `<option>${escapeHtml(c.name)}</option>`).join("");

    // Keep selection if possible
    const has = cats.some(c => c.name === current);
    this.qCategoria.value = has ? current : (cats[0]?.name || "Outros");
    this._populateSubSelect(this.qCategoria.value);
    this._fillSubcategoryCategorySelect();
  }


  _fillSubcategoryCategorySelect() {
    if (!this.subCatSelect) return;
    const cats = (this.state.categories || []).slice()
      .filter(c => !isHiddenCategoryName(c.name))
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    const cur = this.subCatSelect.value;
    this.subCatSelect.innerHTML = `<option value="">—</option>` + cats.map(c =>
      `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`
    ).join("");
    if (cur) this.subCatSelect.value = cur;
  }

  async _addSubcategoryByModal(catId, name) {
    const cats = (this.state.categories || []).slice();
    const idx = cats.findIndex(c => c.id === catId);
    if (idx < 0) throw new Error("Categoria inválida.");
    const subs = (cats[idx].subs || []).slice();
    const exists = subs.some(s => s.toLowerCase() === name.toLowerCase());
    if (exists) throw new Error("Essa subcategoria já existe nessa categoria.");
    const nextSubs = Array.from(new Set([...subs, name]));
    cats[idx] = { ...cats[idx], subs: nextSubs };
    this.state.categories = await this.catSvc.save(cats);
    this._syncCategorySelects();
    this.renderCategorias();
  }

  _populateSubSelect(catName) {
    if (!this.qSubcategoria) return;
    const name = (catName || this.qCategoria?.value || "").trim();
    const cat = (this.state.categories || []).find(c => !isHiddenCategoryName(c.name) && c.name === name);
    const subs = (cat?.subs || []).slice().sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const current = this.qSubcategoria.value;

    const opts = [`<option value="">—</option>`]
      .concat(subs.map(s => `<option>${escapeHtml(s)}</option>`));
    this.qSubcategoria.innerHTML = opts.join("");
    // keep selection if exists
    if (subs.includes(current)) this.qSubcategoria.value = current;
    else this.qSubcategoria.value = "";
  }

  _getCatColorByName(name) {
    const n = String(name || "").trim();
    const cat = (this.state.categories || []).find(c => !isHiddenCategoryName(c.name) && c.name === n);
    return (cat?.color || "#2563EB").trim();
  }

  _getDefaultCategoryPalette() {
    // Paleta neutra (sem neon) para combinar com o tema escuro.
    return [
      "#2563EB", // blue
      "#0EA5E9", // sky
      "#14B8A6", // teal
      "#22C55E", // green
      "#F59E0B", // amber
      "#A855F7", // purple
      "#F43F5E", // rose
      "#64748B"  // slate
    ];
  }

  _mountPalette(paletteEl, inputEl) {
    if (!paletteEl || !inputEl) return;
    const colors = this._getDefaultCategoryPalette();
    const cur = String(inputEl.value || colors[0]).trim();
    paletteEl.innerHTML = colors.map(c => `
      <button type="button" class="swatch ${c.toLowerCase()===cur.toLowerCase() ? 'is-selected':''}" style="--c:${c}" data-color="${c}" aria-label="Cor ${c}"></button>
    `).join("");
    paletteEl.querySelectorAll("[data-color]").forEach(btn => {
      btn.addEventListener("click", () => {
        const next = btn.getAttribute("data-color") || colors[0];
        inputEl.value = next;
        paletteEl.querySelectorAll(".swatch").forEach(b => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
      });
    });
  }

  _initCategoryPalettes() {
    // Palette for "Adicionar categoria"
    this._mountPalette(this.catCorPalette, this.catCor);

    // Palette for edit dialog
    this._mountPalette(this.editCatCorPalette, this.editCatCor);
  }

  _initCategoryEditDialog() {
    if (!this.dlgCatEdit) return;

    const close = () => {
      try { this.dlgCatEdit.close(); } catch (_) {}
    };

    this.btnFecharCatEdit?.addEventListener("click", close);
    this.btnCancelarCatEdit?.addEventListener("click", close);

    this.dlgCatEdit.addEventListener("click", (ev) => {
      // click outside dialog closes
      if (ev.target === this.dlgCatEdit) close();
    });

    this.btnSalvarCatEdit?.addEventListener("click", async () => {
      try {
        await this._requireLogin();
        this.editCatMsg.textContent = "";
        const catId = this._editingCatId;
        if (!catId) return close();

        const cats = (this.state.categories || []).slice();
        const idx = cats.findIndex(c => c.id === catId);
        if (idx < 0) return close();

        const nextName = (this.editCatNome?.value || "").trim();
        const nextColor = (this.editCatCor?.value || "#2563EB").trim();

        if (!nextName) throw new Error("Informe um nome.");
        if (isHiddenCategoryName(nextName)) throw new Error('O nome "Cartão" é reservado. Use outro nome.');

        // unique name
        const norm = normalizeKey(nextName);
        const dup = cats.some((c,i) => i !== idx && normalizeKey(c.name) === norm);
        if (dup) throw new Error("Já existe uma categoria com esse nome.");

        cats[idx] = { ...cats[idx], name: nextName, color: nextColor };
        this.state.categories = await this.catSvc.save(cats);
        this._syncCategorySelects();
        this.renderCategorias();
        if (this.state.route === "lancamentos") this.renderLancamentos();
        this._renderDashboard();

        close();
      } catch (e) {
        this.editCatMsg.textContent = e.message || "Erro ao salvar.";
      }
    });
  }

  _openCategoryEdit(catId) {
    const cats = (this.state.categories || []).slice();
    const cat = cats.find(c => c.id === catId);
    if (!cat || !this.dlgCatEdit) return;

    this._editingCatId = catId;
    this.editCatMsg.textContent = "";
    this.editCatNome.value = cat.name || "";
    this.editCatCor.value = (cat.color || "#2563EB").trim();
    // remount palette so selection matches
    this._mountPalette(this.editCatCorPalette, this.editCatCor);

    try { this.dlgCatEdit.showModal(); } catch (_) { this.dlgCatEdit.setAttribute("open",""); }
  }


  _fmtCatPill(tx) {
    const label = this._fmtCat(tx);
    if (!label) return "";
    const baseCat = String(tx?.category || "").trim();
    const color = this._getCatColorByName(baseCat);
    return `<span class="catPill"><span class="catDot" style="background:${escapeHtml(color)}"></span>${escapeHtml(label)}</span>`;
  }

  _isRecurringTx(tx) {
    return !!(tx && tx.recurringId);
  }

  _fmtRecurringBadge(tx) {
    if (!this._isRecurringTx(tx)) return "";
    return `<span class="txBadgeRec" title="Lançamento recorrente">Recorrente</span>`;
  }

  _updateMakeRecurringNote() {
    if (!this.qMakeRecurringNote) return;
    if (!this.state.editTxId) { this.qMakeRecurringNote.textContent = ""; return; }

    const tx = this.state.editTxObj || {};
    if (tx.recurringId) {
      this.qMakeRecurringNote.textContent = "Este lançamento já é recorrente. Para alterar a regra, use Recorrentes.";
      return;
    }

    const mk = String((this.qData?.value || Dates.todayISO())).slice(0,7) || this.state.monthKey;
    const day = Number(String(this.qData?.value || "").slice(8,10)) || 1;
    this.qMakeRecurringNote.textContent = `Se marcar, cria uma regra mensal (dia ${day}) a partir de ${mk}.`;
  }

  async _loadRecurring() {
    if (!this.authSvc.user) return [];
    this.state.recurring = await this.recSvc.load();
    return this.state.recurring;
  }

  _resetRecForm() {
    this.state.editRecId = null;
    if (this.recFormTitle) this.recFormTitle.textContent = "Adicionar recorrente";
    if (this.recMsg) this.recMsg.textContent = "";
    if (this.recDesc) this.recDesc.value = "";
    if (this.recValor) this.recValor.value = "";
    if (this.recDia) this.recDia.value = "5";
    if (this.recTipo) this.recTipo.value = "saida";
    if (this.recFonte) this.recFonte.value = "outros";
    if (this.recAtivo) this.recAtivo.checked = true;
    if (this.recStart) this.recStart.value = this.state.monthKey;
    // category selects populated separately
  }

  _syncRecCategorySelects() {
    if (!this.recCategoria) return;
    const cats = (this.state.categories || []).slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    this.recCategoria.innerHTML = cats.map(c => `<option>${escapeHtml(c.name)}</option>`).join("");
    this.recCategoria.value = cats[0]?.name || "Outros";
    this._populateRecSubSelect(this.recCategoria.value);
  }

  _populateRecSubSelect(catName) {
    if (!this.recSubcategoria) return;
    const name = (catName || this.recCategoria?.value || "").trim();
    const cat = (this.state.categories || []).find(c => !isHiddenCategoryName(c.name) && c.name === name);
    const subs = (cat?.subs || []).slice().sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const opts = [`<option value="">—</option>`].concat(subs.map(s => `<option>${escapeHtml(s)}</option>`));
    this.recSubcategoria.innerHTML = opts.join("");
    this.recSubcategoria.value = "";
  }

  _readRecForm() {
    const description = (this.recDesc?.value || "").trim();
    const amount = Money.parseAmount(this.recValor?.value);
    const day = Math.min(31, Math.max(1, Number(this.recDia?.value || 1)));
    const type = this.recTipo?.value === "entrada" ? "entrada" : "saida";
    const source = this.recFonte?.value || "outros";
    const category = this.recCategoria?.value || "Outros";
    const subcategory = this.recSubcategoria?.value || "";
    const startMonth = (this.recStart?.value || this.state.monthKey).slice(0,7);
    const active = !!this.recAtivo?.checked;

    if (!description) throw new Error("Descrição obrigatória.");
    if (!(amount > 0)) throw new Error("Valor precisa ser maior que zero.");

    return {
      id: this.state.editRecId || cryptoRandomId(),
      description,
      amount,
      type,
      source,
      category,
      subcategory,
      day,
      startMonth,
      endMonth: "",
      active
    };
  }

  _renderRecurring() {
    if (!this.recWrap) return;
    const rules = (this.state.recurring || []).slice().sort((a,b)=>a.description.localeCompare(b.description,'pt-BR'));
    if (!rules.length) {
      this.recWrap.innerHTML = `<div class="muted">Nenhum recorrente cadastrado.</div>`;
      return;
    }
    this.recWrap.innerHTML = "";
    for (const r of rules) {
      const row = document.createElement("div");
      row.className = "catItem";
      const catColor = this._getCatColorByName(r.category);
      row.innerHTML = `
        <div class="catHead">
          <div>
            <div class="catTitle"><span class="catDot" style="background:${escapeHtml(catColor)}"></span>${escapeHtml(r.description)}</div>
            <div class="muted small">Dia ${String(r.day).padStart(2,'0')} • ${r.type === 'entrada' ? 'Entrada' : 'Saída'} • ${fmtSource(r.source)} • ${escapeHtml(r.category)}${r.subcategory ? ` &gt; ${escapeHtml(r.subcategory)}` : ""} • a partir de ${r.startMonth}${r.active ? '' : ' • (inativo)'}</div>
          </div>
          <div class="catActions">
            <div class="muted" style="font-weight:800;">${Money.toBRL(r.amount)}</div>
            <button class="btn btn--ghost miniBtn" data-rec-edit="${r.id}">Editar</button>
            <button class="btn btn--dangerSoft miniBtn" data-rec-del="${r.id}">Excluir</button>
          </div>
        </div>
      `;
      row.querySelector("[data-rec-edit]").addEventListener("click", () => this._editRecurring(r));
      row.querySelector("[data-rec-del]").addEventListener("click", async () => this._deleteRecurring(r));
      this.recWrap.appendChild(row);
    }
  }

  _editRecurring(rule) {
    this.state.editRecId = rule.id;
    if (this.recFormTitle) this.recFormTitle.textContent = "Editar recorrente";
    if (this.recMsg) this.recMsg.textContent = "";
    this.recDesc.value = rule.description || "";
    this.recValor.value = String(rule.amount || "");
    this.recDia.value = String(rule.day || 1);
    this.recTipo.value = rule.type || "saida";
    this.recFonte.value = rule.source || "outros";
    this.recStart.value = (rule.startMonth || this.state.monthKey);
    this.recAtivo.checked = rule.active !== false;

    // selects
    this._syncRecCategorySelects();
    this.recCategoria.value = rule.category || "Outros";
    this._populateRecSubSelect(this.recCategoria.value);
    this.recSubcategoria.value = rule.subcategory || "";
  }

  async _deleteRecurring(rule) {
    const ok = confirm(`Excluir o recorrente "${rule.description}"?\n\nIsso NÃO apaga lançamentos já gerados.`);
    if (!ok) return;
    const list = (this.state.recurring || []).filter(r => r.id !== rule.id);
    this.state.recurring = await this.recSvc.save(list);
    this._resetRecForm();
    this._renderRecurring();
  }

  async _ensureRecurringForMonth(monthKey) {
    if (!this.authSvc.user) return;
    try {
      const res = await this.recSvc.ensureForMonth(monthKey, this.txSvc);
      // keep in memory
      if (Array.isArray(res.rules)) this.state.recurring = res.rules;
    } catch (e) {
      console.warn("Falha ao gerar recorrentes:", e);
    }
  }

  async _ensureRecurringForCurrentMonth() {
    return this._ensureRecurringForMonth(this.state.monthKey);
  }

  async renderCategorias() {
    if (!this.catsWrap) return;
    if (!this.authSvc.user) {
      this.catsWrap.innerHTML = `<div class="muted">Faça login para gerenciar suas categorias.</div>`;
      return;
    }

    const cats = (this.state.categories || []).slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    if (!cats.length) {
      this.catsWrap.innerHTML = `<div class="muted">Nenhuma categoria encontrada.</div>`;
      return;
    }

    this.catsWrap.innerHTML = "";
    for (const cat of cats) {
      if (isHiddenCategoryName(cat.name)) continue;
      const el = document.createElement("div");
      el.className = "catItem";
      el.innerHTML = `
        <div class="catHead">
          <div>
            <div class="catTitle"><span class="catDot" style="background:${escapeHtml((cat.color||'#2563EB'))}"></span>${escapeHtml(cat.name)}</div>
            <div class="muted small">${(cat.subs||[]).length} subcategoria(s)</div>
          </div>
          <div class="catActions">
            <button class="btn btn--ghost miniBtn" data-cat-edit="${cat.id}">Editar</button>
            <button class="btn btn--dangerSoft miniBtn" data-cat-del="${cat.id}">Excluir</button>
          </div>
        </div>

        <div class="chips">
          ${(cat.subs||[]).slice().sort((a,b)=>a.localeCompare(b,'pt-BR')).map(s => `
            <div class="chip">
              <span>${escapeHtml(s)}</span>
              <button class="chipBtn" title="Editar" aria-label="Editar" data-sub-edit="${cat.id}" data-sub-name="${escapeHtml(s)}">✎</button>
              <button class="chipBtn is-danger" title="Excluir" aria-label="Excluir" data-sub-del="${cat.id}" data-sub-name="${escapeHtml(s)}">×</button>
            </div>
          `).join("")}
          ${(cat.subs||[]).length ? "" : `<span class=\"muted small\">Sem subcategorias.</span>`}
        </div>
      `;

      // Category actions
      el.querySelector("[data-cat-edit]")?.addEventListener("click", () => this._openCategoryEdit(cat.id));
      el.querySelector("[data-cat-del]")?.addEventListener("click", () => this._deleteCategory(cat.id));

      // Edit/delete subcategory chips
      el.querySelectorAll("[data-sub-edit]").forEach(btn => {
        btn.addEventListener("click", () => this._editSubcategory(cat.id, btn.getAttribute("data-sub-name") || ""));
      });
      el.querySelectorAll("[data-sub-del]").forEach(btn => {
        btn.addEventListener("click", () => this._deleteSubcategory(cat.id, btn.getAttribute("data-sub-name") || ""));
      });

      this.catsWrap.appendChild(el);
    }
  }

  async _editCategory(catId) {
    const cats = (this.state.categories || []).slice();
    const idx = cats.findIndex(c => c.id === catId);
    if (idx < 0) return;
    const cur = cats[idx].name;
    const nextName = (prompt("Novo nome da categoria:", cur) || "").trim();
    if (!nextName || nextName === cur) return;
    const clash = cats.some((c,i) => i !== idx && c.name.toLowerCase() === nextName.toLowerCase());
    if (clash) { alert("Já existe uma categoria com esse nome."); return; }
    cats[idx] = { ...cats[idx], name: nextName };
    this.state.categories = await this.catSvc.save(cats);
    this._syncCategorySelects();
    this.renderCategorias();
  }

  async _deleteCategory(catId) {
    const cats = (this.state.categories || []).slice();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    const ok = confirm(`Excluir a categoria "${cat.name}"?\n\nIsso NÃO apaga lançamentos antigos.`);
    if (!ok) return;
    const next = cats.filter(c => c.id !== catId);
    this.state.categories = await this.catSvc.save(next);
    this._syncCategorySelects();
    this.renderCategorias();
  }

  async _addSubcategory(catId) {
    const input = this.catsWrap?.querySelector(`[data-sub-input="${catId}"]`);
    const name = (input?.value || "").trim();
    if (!name) return;
    const cats = (this.state.categories || []).slice();
    const idx = cats.findIndex(c => c.id === catId);
    if (idx < 0) return;
    const subs = Array.from(new Set([...(cats[idx].subs || []), name]));
    cats[idx] = { ...cats[idx], subs };
    this.state.categories = await this.catSvc.save(cats);
    if (input) input.value = "";
    this._syncCategorySelects();
    this.renderCategorias();
  }

  async _editSubcategory(catId, rawSubName) {
    const subName = decodeHtmlAttr(rawSubName);
    const cats = (this.state.categories || []).slice();
    const idx = cats.findIndex(c => c.id === catId);
    if (idx < 0) return;
    const subs = (cats[idx].subs || []).slice();
    const sIdx = subs.findIndex(s => s === subName);
    if (sIdx < 0) return;
    const nextName = (prompt("Novo nome da subcategoria:", subName) || "").trim();
    if (!nextName || nextName === subName) return;
    const clash = subs.some((s,i) => i !== sIdx && s.toLowerCase() === nextName.toLowerCase());
    if (clash) { alert("Já existe uma subcategoria com esse nome."); return; }
    subs[sIdx] = nextName;
    cats[idx] = { ...cats[idx], subs };
    this.state.categories = await this.catSvc.save(cats);
    this._syncCategorySelects();
    this.renderCategorias();
  }

  async _deleteSubcategory(catId, rawSubName) {
    const subName = decodeHtmlAttr(rawSubName);
    const cats = (this.state.categories || []).slice();
    const idx = cats.findIndex(c => c.id === catId);
    if (idx < 0) return;
    const ok = confirm(`Excluir a subcategoria "${subName}"?\n\nIsso NÃO apaga lançamentos antigos.`);
    if (!ok) return;
    const subs = (cats[idx].subs || []).filter(s => s !== subName);
    cats[idx] = { ...cats[idx], subs };
    this.state.categories = await this.catSvc.save(cats);
    this._syncCategorySelects();
    this.renderCategorias();
  }

  _renderDashboard() {
    const txs = this.state.txMonth || [];
    const totalLanc = txs.length;

    const today = Dates.todayISO();
    let entradasHoje = 0, saidasHoje = 0;

    let entradas = 0, saidas = 0, extra = 0, fixo = 0;
    const catSaidas = new Map();

    for (const tx of txs) {
      const val = Number(tx.amount || 0);
      if (tx.type === "entrada") {
        entradas += val;
        if (tx.source === "renda_extra") extra += val;
        if (tx.source === "salario_fixo") fixo += val;

        if ((tx.date || "") <= today) entradasHoje += val;
      } else if (tx.type === "saida") {
        saidas += val;
        const k = tx.category || "Outros";
        catSaidas.set(k, (catSaidas.get(k) || 0) + val);

        if ((tx.date || "") <= today) saidasHoje += val;
      }
    }

    const saldo = entradas - saidas;
    const saldoHoje = entradasHoje - saidasHoje;

    this.totalLanc.textContent = String(totalLanc);
    this.entradasMes.textContent = Money.toBRL(entradas);
    this.saidasMes.textContent = Money.toBRL(saidas);
    this.saldoMes.textContent = Money.toBRL(saldo);
    if (this.saldoAteHoje) this.saldoAteHoje.textContent = Money.toBRL(saldoHoje);
    if (this.saldoPrevisto) this.saldoPrevisto.textContent = Money.toBRL(saldo);
    this.extraMes.textContent = Money.toBRL(extra);
    this.qtExtra.textContent = String(txs.filter(t => t.type==="entrada" && t.source==="renda_extra").length);
    this.entradasFixas.textContent = Money.toBRL(fixo);

    let top = { cat: "—", v: 0 };
    for (const [cat, v] of catSaidas.entries()) if (v > top.v) top = { cat, v };
    this.topCat.textContent = top.cat;

    const items = Array.from(catSaidas.entries())
      .sort((a,b) => b[1]-a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value }));

    const has = items.length > 0;
    this.chartEmpty.style.display = has ? "none" : "flex";
    this.pieLegend.style.display = has ? "block" : "none";
    if (has) PieChart.draw(this.pieCanvas, this.pieLegend, items);
    else {
      const ctx = this.pieCanvas.getContext("2d");
      ctx.clearRect(0,0,this.pieCanvas.width,this.pieCanvas.height);
      this.pieLegend.innerHTML = "";
    }
  }

  _getLancamentosFiltered() {
    const txs = (this.state.txMonth || []).slice();
    const tipo = this.fTipo.value;
    const fonte = this.fFonte.value;
    const pay = this.fPay ? this.fPay.value : "todas";
    const busca = (this.fBusca.value || "").trim().toLowerCase();

    let filtered = txs;

    if (this.state.quickFilter === "entradas") filtered = filtered.filter(t => t.type === "entrada");
    if (this.state.quickFilter === "saidas") filtered = filtered.filter(t => t.type === "saida");
    if (this.state.quickFilter === "renda_extra") filtered = filtered.filter(t => t.type === "entrada" && t.source === "renda_extra");

    if (tipo !== "todos") filtered = filtered.filter(t => t.type === tipo);
    if (fonte !== "todas") filtered = filtered.filter(t => t.source === fonte);

    if (pay !== "todas") {
      if (pay === "credito") filtered = filtered.filter(t => t.payMethod === "credito");
      else filtered = filtered.filter(t => (t.payMethod || "dinheiro") === pay);
    }

    if (busca) {
      filtered = filtered.filter(t => {
        const d = (t.description || "").toLowerCase();
        const c = (t.category || "").toLowerCase();
        return d.includes(busca) || c.includes(busca);
      });
    }

    return filtered;
  }

  _updateInvoiceHint() {
    if (!this.qInvoiceHint) return;
    const pm = this.qPayMethod?.value || "dinheiro";
    if (pm !== "credito") { this.qInvoiceHint.textContent = ""; return; }
    const cardId = this.qCard?.value || "";
    const card = (this.state.cards || []).find(c => c.id === cardId);
    if (!card) { this.qInvoiceHint.textContent = "Selecione um cartão."; return; }
    const dateISO = this.qData?.value || Dates.todayISO();
    const invKey = invoiceKeyFor(dateISO, card.closingDay);
    const closingDate = `${invKey}-${String(card.closingDay).padStart(2,'0')}`;
    const dueKey = addMonthsToMonthKey(invKey, 1);
    const dueDate = `${dueKey}-${String(card.dueDay).padStart(2,'0')}`;
    this.qInvoiceHint.textContent = `Vai para fatura ${invKey} • Fecha ${closingDate} • Vence ${dueDate}`;
  }


  _updateInstallmentHint() {
    if (!this.qInstHint) return;
    const pm = this.qPayMethod?.value || "dinheiro";
    const isCredit = pm === "credito";
    const n = Math.max(1, Math.min(24, parseInt(this.qInstallments?.value || "1", 10) || 1));
    if (this.qInstallments) this.qInstallments.value = String(n);

    if (!isCredit || this.state.editTxId || (this.qTipo?.value !== "saida")) {
      this.qInstHint.textContent = "Ao salvar, vou criar 1 lançamento por mês.";
      return;
    }
    if (n <= 1) {
      this.qInstHint.textContent = "1x (sem parcelas)";
      return;
    }
    this.qInstHint.textContent = `${n}x — vou criar ${n} lançamentos (1 por mês) a partir da data escolhida.`;
  }

  _syncCardSelects() {
    const cards = this.state.cards || [];
    const fill = (sel, includeAdd = false) => {
      if (!sel) return;
      sel.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = cards.length ? "Selecione..." : "Nenhum cartão (adicione)";
      sel.appendChild(opt0);
      for (const c of cards) {
        const o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.name;
        sel.appendChild(o);
      }
      if (includeAdd) {
        const oa = document.createElement("option");
        oa.value = "__add__";
        oa.textContent = "＋ Adicionar cartão…";
        sel.appendChild(oa);
      }
    };
    if (this.qCard && this.qCard.tagName === "SELECT") {
      fill(this.qCard, true);
    } else {
      this._syncCardPicker();
    }
    fill(this.fatCard, false);
  }

  _syncCardPicker() {
    const cards = this.state.cards || [];
    // Atualiza texto do botão
    const currentId = (this.qCard && this.qCard.value) ? String(this.qCard.value) : "";
    const current = cards.find(c => String(c.id) === currentId);
    if (this.qCardBtnText) this.qCardBtnText.textContent = current ? current.name : (cards.length ? "Selecione um cartão…" : "Nenhum cartão (adicione)");

    if (!this.cardPickerList) return;
    this.cardPickerList.innerHTML = "";

    const makeItem = (label, sub, onClick, cls="") => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pickerItem" + (cls ? " " + cls : "");
      b.innerHTML = label + (sub ? `<span class="sub">${sub}</span>` : "");
      b.addEventListener("click", onClick);
      return b;
    };

    if (!cards.length) {
      this.cardPickerList.appendChild(makeItem("＋ Adicionar cartão…", "Cadastre seu primeiro cartão", () => {
        this._closeCardPicker();
        this._openCartoesDialog();
      }));
      return;
    }

    for (const c of cards) {
      const sub = `Fecha dia ${c.closingDay} • Vence dia ${c.dueDay}` + (c.limit ? ` • Limite ${Money.toBRL(c.limit)}` : "");
      this.cardPickerList.appendChild(makeItem(c.name, sub, () => {
        if (this.qCard) this.qCard.value = c.id;
        if (this.qCardBtnText) this.qCardBtnText.textContent = c.name;
        this._closeCardPicker();
        this._updateInvoiceHint();
      }));
    }

    this.cardPickerList.appendChild(makeItem("＋ Adicionar cartão…", "Cadastrar um novo cartão", () => {
      this._closeCardPicker();
      this._openCartoesDialog();
    }));
  }

  _openCardPicker() {
    if (!this.cardPickerModal) return;
    this._syncCardPicker();
    this.cardPickerModal.style.display = "flex";
    if (this.qCardBtn) this.qCardBtn.setAttribute("aria-expanded", "true");
  }

  _closeCardPicker() {
    if (!this.cardPickerModal) return;
    this.cardPickerModal.style.display = "none";
    if (this.qCardBtn) this.qCardBtn.setAttribute("aria-expanded", "false");
  }

  _fmtPayPill(tx) {
    if ((tx?.type || "") === "entrada") return `<span class="txPayPill">—</span>`;
    const pm = tx?.payMethod || "dinheiro";
    if (pm === "credito") {
      const card = (this.state.cards || []).find(c => c.id === tx.cardId);
      const name = card ? card.name : "Cartão";
      return `<span class="txPayPill">💳 ${escapeHtml(name)}</span>`;
    }
    return `<span class="txPayPill">${escapeHtml(fmtPayMethod(pm))}</span>`;
  }

  _openCartoesDialog(mode = "gerenciar") {
    if (!this.dlgCartoes) return;
    // mode: "gerenciar" (cadastro + fatura) | "faturas" (somente fatura)
    const isFaturasOnly = mode === "faturas";
    this.dlgCartoes.classList.toggle("faturasOnly", isFaturasOnly);

    const titleEl = document.getElementById("dlgCartoesTitle");
    if (titleEl) titleEl.textContent = isFaturasOnly ? "Faturas do cartão" : "Cartões e Faturas";

    try { this.dlgCartoes.showModal(); } catch (_) { this.dlgCartoes.setAttribute("open",""); }

    if (!isFaturasOnly) this._renderCardsAdmin();
    this._renderFatura();
  }

  _closeCartoesDialog() {
    if (!this.dlgCartoes) return;
    try { this.dlgCartoes.close(); } catch (_) { this.dlgCartoes.removeAttribute("open"); }
  }

  _renderCardsAdmin() {
    if (!this.cardsWrap) return;
    const cards = (this.state.cards || []).slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    if (!cards.length) {
      this.cardsWrap.innerHTML = `<div class="empty">Nenhum cartão cadastrado.</div>`;
      return;
    }
    this.cardsWrap.innerHTML = "";
    for (const c of cards) {
      const row = document.createElement("div");
      row.className = "cardItemRow";
      const limitTxt = c.limit ? ` • Limite: ${Money.toBRL(c.limit)}` : "";
      row.innerHTML = `
        <div class="left">
          <div class="title">${escapeHtml(c.name)}</div>
          <div class="meta">Fechamento dia ${c.closingDay} • Vencimento dia ${c.dueDay}${limitTxt}</div>
        </div>
        <div class="actions">
          <button class="btn btn--ghost miniBtn" data-edit="${c.id}">Editar</button>
          <button class="btn btn--dangerSoft miniBtn" data-del="${c.id}">Excluir</button>
        </div>
      `;
      row.querySelector("[data-edit]").addEventListener("click", () => this._editCard(c));
      row.querySelector("[data-del]").addEventListener("click", () => this._deleteCard(c));
      this.cardsWrap.appendChild(row);
    }
  }

  _editCard(card) {
    this.state.editCardId = card.id;
    if (this.cardFormTitle) this.cardFormTitle.textContent = "Editar cartão";
    if (this.cardNome) this.cardNome.value = card.name || "";
    if (this.cardLimite) this.cardLimite.value = card.limit ? String(card.limit) : "";
    if (this.cardFechamento) this.cardFechamento.value = String(card.closingDay || 10);
    if (this.cardVencimento) this.cardVencimento.value = String(card.dueDay || 5);
    if (this.cardMsg) this.cardMsg.textContent = "";
  }

  _clearCardForm() {
    this.state.editCardId = null;
    if (this.cardFormTitle) this.cardFormTitle.textContent = "Adicionar cartão";
    if (this.cardNome) this.cardNome.value = "";
    if (this.cardLimite) this.cardLimite.value = "";
    if (this.cardFechamento) this.cardFechamento.value = "10";
    if (this.cardVencimento) this.cardVencimento.value = "5";
  }

  async _deleteCard(card) {
    const ok = confirm(`Excluir o cartão "${card.name}"? (Compras antigas continuam, mas sem referência do cartão.)`);
    if (!ok) return;
    const next = (this.state.cards || []).filter(c => c.id !== card.id);
    this.state.cards = await this.cardSvc.save(next);
    this._syncCardSelects();
    this._renderCardsAdmin();
    this._renderFatura();
    this._updateInvoiceHint();
  }

  _renderFatura() {
    if (!this.fatCard || !this.fatMes) return;
    const fallback = (this.state.cards?.[0]?.id || "");
    if (!this.fatCard.value && fallback) this.fatCard.value = fallback;

    const card = (this.state.cards || []).find(c => c.id === (this.fatCard.value || ""));
    const invKey = this.fatMes.value || this.state.monthKey;

    if (!card) {
      if (this.fatTotal) this.fatTotal.textContent = Money.toBRL(0);
      if (this.fatStatus) this.fatStatus.textContent = "—";
      if (this.fatDatas) this.fatDatas.textContent = "Fechamento: — • Vencimento: —";
      if (this.fatLista) this.fatLista.innerHTML = "";
      if (this.fatEmpty) this.fatEmpty.style.display = "block";
      return;
    }

    const closingDate = `${invKey}-${String(card.closingDay).padStart(2,'0')}`;
    const dueKey = addMonthsToMonthKey(invKey, 1);
    const dueDate = `${dueKey}-${String(card.dueDay).padStart(2,'0')}`;
    if (this.fatDatas) this.fatDatas.textContent = `Fechamento: ${closingDate} • Vencimento: ${dueDate}`;

    const txs = (this.state.txMonthAll || []).length ? this.state.txMonthAll : (this.state.txMonth || []);
    const items = txs
      .filter(t => (t.payMethod === "credito") && (t.cardId === card.id))
      .filter(t => invoiceKeyFor(t.date, card.closingDay) === invKey)
      .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));

    const total = items.reduce((s,t)=>s + Number(t.amount||0), 0);
    if (this.fatTotal) this.fatTotal.textContent = Money.toBRL(total);

    const paidMap = this.state.cardInvoices || {};
    const paid = paidMap[`${card.id}|${invKey}`];
    if (paid && paid.paidAtISO) {
      if (this.fatStatus) this.fatStatus.textContent = `Paga em ${paid.paidAtISO}`;
    } else {
      if (this.fatStatus) this.fatStatus.textContent = "Em aberto";
    }

    if (this.fatLista) this.fatLista.innerHTML = "";
    if (!items.length) {
      if (this.fatEmpty) this.fatEmpty.style.display = "block";
      return;
    }
    if (this.fatEmpty) this.fatEmpty.style.display = "none";

    for (const tx of items) {
      const row = document.createElement("div");
      row.className = "txCard";
      row.innerHTML = `
        <div class="txTop">
          <div class="txDesc">
            <span class="txDescText">${escapeHtml(tx.description || "")}</span>
          </div>
          <div class="txVal">${Money.toBRL(tx.amount)}</div>
        </div>
        <div class="txMeta">
          <div><span class="muted">Data:</span> ${tx.date || ""}</div>
          <div><span class="muted">Categoria:</span> ${this._fmtCatPill(tx) || "—"}</div>
        </div>
      `;
      this.fatLista.appendChild(row);
    }
  }

  _fmtCat(tx) {
    const c = (tx?.category || "").trim();
    const s = (tx?.subcategory || "").trim();
    if (c && s) return `${c} > ${s}`;
    return c || "";
  }

  renderLancamentos() {
    const filtered = this._getLancamentosFiltered();

    const isEmpty = !filtered.length;
    this.emptyLanc.style.display = isEmpty ? "block" : "none";
    if (isEmpty) {
      this.cardsLanc.innerHTML = "";
      this.tbodyLanc.innerHTML = "";
      return;
    }

    this.cardsLanc.innerHTML = "";
    for (const tx of filtered) {
      const card = document.createElement("div");
      card.className = "txCard";
      card.innerHTML = `
        <div class="txTop">
          <div class="txDesc">
            <span class="txDescText">${escapeHtml(tx.description || "")}</span>
            ${this._fmtRecurringBadge(tx)}
          </div>
          <div class="txVal">${Money.toBRL(tx.amount)}</div>
        </div>
        <div class="txMeta">
          <div><span class="muted">Data:</span> ${tx.date || ""}</div>
          <div><span class="muted">Tipo:</span> ${tx.type === "entrada" ? "Entrada" : "Saída"}</div>
          <div><span class="muted">Categoria:</span> ${this._fmtCatPill(tx) || "—"}</div>
          <div><span class="muted">Fonte:</span> ${tx.type === "entrada" ? fmtSource(tx.source) : "—"}</div>
          <div><span class="muted">Pagamento:</span> ${this._fmtPayPill(tx)}</div>
        </div>
        <div class="txActions">
          <button class="btn btn--ghost miniBtn" data-edit="${tx.id}">Editar</button>
          <button class="btn btn--dangerSoft miniBtn" data-del="${tx.id}">Excluir</button>
        </div>
      `;
      card.querySelector("[data-edit]").addEventListener("click", () => this._editTx(tx));
      card.querySelector("[data-del]").addEventListener("click", async () => this._deleteTx(tx));
      this.cardsLanc.appendChild(card);
    }

    this.tbodyLanc.innerHTML = "";
    for (const tx of filtered) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${tx.date || ""}</td>
        <td>${escapeHtml(tx.description || "")} ${this._isRecurringTx(tx) ? '<span class="txBadgeRec" style="margin-left:6px;">Recorrente</span>' : ''}</td>
        <td>${this._fmtCatPill(tx) || ""}</td>
        <td>${tx.type === "entrada" ? "Entrada" : "Saída"}</td>
        <td>${tx.type === "entrada" ? fmtSource(tx.source) : "—"}</td>
        <td>${this._fmtPayPill(tx)}</td>
        <td class="right">${Money.toBRL(tx.amount)}</td>
        <td class="right">
          <button class="btn btn--ghost miniBtn" data-edit="${tx.id}">Editar</button>
          <button class="btn btn--dangerSoft miniBtn" data-del="${tx.id}">Excluir</button>
        </td>
      `;
      tr.querySelector("[data-edit]").addEventListener("click", () => this._editTx(tx));
      tr.querySelector("[data-del]").addEventListener("click", async () => this._deleteTx(tx));
      this.tbodyLanc.appendChild(tr);
    }
  }

  _editTx(tx) {
    // Envia para o formulário do dashboard e preenche para edição
    this.state.editTxId = tx.id;
    this.state.editTxObj = tx;
    this.go("dashboard");

    this.qDesc.value = tx.description || "";
    this.qValor.value = String(Number(tx.amount || 0));
    this.qTipo.value = tx.type || "saida";
    this.qFonte.value = tx.source || "salario_fixo";

    this._applyTypeUI();

    const cat = (tx.category || "Outros");
    if (this.qCategoria) {
      this.qCategoria.value = cat;
      this._populateSubSelect(cat);
    }
    if (this.qSubcategoria) {
      this.qSubcategoria.value = (tx.subcategory || "");
    }
    this.qData.value = tx.date || Dates.todayISO();

    if (this.qPayMethod) {
      if ((tx.type || "") === "saida") {
        this.qPayMethod.value = tx.payMethod || "dinheiro";
        const isCredit = this.qPayMethod.value === "credito";
        if (this.qCardWrap) this.qCardWrap.style.display = isCredit ? "block" : "none";
        if (this.qCard) this.qCard.value = (isCredit ? (tx.cardId || "") : "");
      } else {
        this._resetPayFields();
      }
      this._updateInvoiceHint();
    }

    // Parcelas: somente para novo lançamento (não aparece na edição)
    if (this.qInstWrap) this.qInstWrap.style.display = "none";
    if (this.qInstallments) this.qInstallments.value = "1";
    this._updateInstallmentHint();

    // Recorrência: só aparece no modo edição
    if (this.qRecRow) this.qRecRow.style.display = "flex";
    if (this.qMakeRecurring) {
      const isRec = !!tx.recurringId;
      this.qMakeRecurring.checked = isRec ? true : false;
      this.qMakeRecurring.disabled = isRec;
    }
    this._updateMakeRecurringNote();

    if (this.btnSalvar) this.btnSalvar.textContent = "Salvar alterações";
    this.quickMsg.textContent = "Editando lançamento…";
    if (this.btnLimparEdicao) this.btnLimparEdicao.style.display = "inline-flex";

    try { this.quickForm.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_) {}
    try { this.qDesc.focus(); } catch (_) {}
  }

  _clearEditMode(clearAll = false) {
    this.state.editTxId = null;
    this.state.editTxObj = null;

    if (this.btnSalvar) this.btnSalvar.textContent = "Salvar";
    if (this.qRecRow) this.qRecRow.style.display = "none";
    if (this.btnLimparEdicao) this.btnLimparEdicao.style.display = "none";

    if (this.qMakeRecurring) {
      this.qMakeRecurring.checked = false;
      this.qMakeRecurring.disabled = false;
    }
    if (this.qMakeRecurringNote) this.qMakeRecurringNote.textContent = "";

    // Always clear the text fields when leaving edit mode
    if (this.qDesc) this.qDesc.value = "";
    if (this.qValor) this.qValor.value = "";

    // When cancelling edit (clearAll=true), reset selects/date too
    if (clearAll) {
      if (this.qTipo) this.qTipo.value = "saida";
      if (this.qFonte) this.qFonte.value = "salario_fixo";
      if (this.qCategoria) {
        // Prefer "Outros" if exists
        const opt = Array.from(this.qCategoria.options || []).some(o => (o.value || o.textContent) === "Outros");
        this.qCategoria.value = opt ? "Outros" : (this.qCategoria.options?.[0]?.value || this.qCategoria.options?.[0]?.textContent || "Outros");
        this._populateSubSelect(this.qCategoria.value);
      }
      if (this.qSubcategoria) this.qSubcategoria.value = "";
      if (this.qData) this.qData.value = Dates.todayISO();
    }

    this._applyTypeUI();
  }


  async _deleteTx(tx) {
    try {
      await this._requireLogin();
      const ok = confirm(`Excluir "${tx.description}" (${Money.toBRL(tx.amount)})?`);
      if (!ok) return;
      await this.txSvc.remove(tx.id);
      await this.refreshMonth();
      this.renderLancamentos();
    } catch (e) {
      alert(e.message);
    }
  }

  _renderReport(list, label) {
    let entradas = 0, saidas = 0, fixas = 0, extra = 0;
    const cats = new Map();

    for (const tx of list) {
      const v = Number(tx.amount || 0);
      if (tx.type === "entrada") {
        entradas += v;
        if (tx.source === "salario_fixo") fixas += v;
        if (tx.source === "renda_extra") extra += v;
      }
      if (tx.type === "saida") {
        saidas += v;
        const k = tx.category || "Outros";
        if (!isHiddenCategoryName(k)) {
          cats.set(k, (cats.get(k) || 0) + v);
        }
      }
    }

    this.repEntradas.textContent = Money.toBRL(entradas);
    this.repSaidas.textContent = Money.toBRL(saidas);
    this.repSaldo.textContent = Money.toBRL(entradas - saidas);
    this.repFixas.textContent = Money.toBRL(fixas);
    this.repExtra.textContent = Money.toBRL(extra);
    this.repPeriodo.textContent = label;

    const sorted = Array.from(cats.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 30);
    this.repCats.innerHTML = "";
    if (!sorted.length) {
      this.repCats.innerHTML = `<span class="muted small">Sem saídas no período.</span>`;
    } else {
      for (const [cat, val] of sorted) {
        const el = document.createElement("div");
        el.className = "chip";
        el.textContent = `${cat}: ${Money.toBRL(val)}`;
        this.repCats.appendChild(el);
      }
    }

    this._buildPrintArea(list, label, { entradas, saidas, fixas, extra, saldo: entradas - saidas }, sorted);
  }

  _buildPrintArea(list, label, totals, sortedCats) {
    const rows = list
      .slice()
      .sort((a,b)=> (a.date||"").localeCompare(b.date||""))
      .map(tx => `
        <tr>
          <td>${tx.date || ""}</td>
          <td>${escapeHtml(tx.description || "")}</td>
          <td>${escapeHtml(tx.category || "")}</td>
          <td>${tx.type === "entrada" ? "Entrada" : "Saída"}</td>
          <td>${fmtSource(tx.source)}</td>
          <td style="text-align:right">${Money.toBRL(tx.amount)}</td>
        </tr>
      `).join("");

    const cats = (sortedCats || []).map(([c,v]) => `<li>${escapeHtml(c)} — ${Money.toBRL(v)}</li>`).join("");

    this.printArea.innerHTML = `
      <div style="font-family:system-ui; padding:18px;">
        <h2 style="margin:0 0 6px 0;">Relatório - Controle Financeiro</h2>
        <div style="margin:0 0 14px 0; color:#333;">${escapeHtml(label)}</div>

        <div style="display:flex; gap:18px; margin-bottom:14px; flex-wrap:wrap;">
          <div><b>Entradas:</b> ${Money.toBRL(totals.entradas)}<br/><span style="color:#555">Fixas:</span> ${Money.toBRL(totals.fixas)} • <span style="color:#555">Extra:</span> ${Money.toBRL(totals.extra)}</div>
          <div><b>Saídas:</b> ${Money.toBRL(totals.saidas)}</div>
          <div><b>Saldo:</b> ${Money.toBRL(totals.saldo)}</div>
          <div><b>Total de lançamentos:</b> ${list.length}</div>
        </div>

        <h3 style="margin:14px 0 6px 0;">Gastos por categoria</h3>
        <ul style="margin:0 0 16px 18px; color:#222;">${cats || "<li>Sem saídas no período.</li>"}</ul>

        <h3 style="margin:14px 0 6px 0;">Lançamentos</h3>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr>
              <th style="border-bottom:1px solid #ccc; text-align:left; padding:6px;">Data</th>
              <th style="border-bottom:1px solid #ccc; text-align:left; padding:6px;">Descrição</th>
              <th style="border-bottom:1px solid #ccc; text-align:left; padding:6px;">Categoria</th>
              <th style="border-bottom:1px solid #ccc; text-align:left; padding:6px;">Tipo</th>
              <th style="border-bottom:1px solid #ccc; text-align:left; padding:6px;">Fonte</th>
              <th style="border-bottom:1px solid #ccc; text-align:right; padding:6px;">Valor</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="margin-top:14px; color:#666; font-size:11px;">
          Gerado em ${new Date().toLocaleString("pt-BR")}
        </div>
      </div>
    `;
  }

  _exportCSV() {
    const list = this.state.relLastList || [];
    if (!list.length) {
      alert("Gere um relatório primeiro.");
      return;
    }
    const label = this.state.relMeta?.label || "relatorio";
    const safe = label.replace(/[^\w\-]+/g, "_").slice(0, 40);

    const headers = ["date","description","category","type","source","amount"];
    const lines = [headers.join(",")];

    for (const tx of list) {
      const row = [
        tx.date || "",
        csvEscape(tx.description || ""),
        csvEscape(this._fmtCat(tx)),
        tx.type || "",
        tx.source || "",
        String(Number(tx.amount || 0))
      ];
      lines.push(row.join(","));
    }

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `relatorio_${safe}.csv`);
  }

  _exportPDF() {
    if (!(this.state.relLastList || []).length) {
      alert("Gere um relatório primeiro.");
      return;
    }
    window.print();
  }
}

function splitAmountBRL(total, n) {
  // Divide um valor em n partes com ajuste de centavos (sempre fecha a soma).
  const totalCent = Math.round(Number(total || 0) * 100);
  const base = Math.floor(totalCent / n);
  const resto = totalCent % n;
  const parts = [];
  for (let i = 0; i < n; i++) parts.push((base + (i < resto ? 1 : 0)) / 100);
  return parts;
}

function addMonthsClampISO(dateISO, monthsToAdd) {
  // Soma meses mantendo o dia quando possível; se não existir (ex: 31), ajusta para o último dia do mês.
  const [y, m, d] = String(dateISO || Dates.todayISO()).split("-").map(Number);
  const base = new Date(y, (m - 1) + Number(monthsToAdd || 0), 1);
  const year = base.getFullYear();
  const month = base.getMonth(); // 0-11
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(1, d || 1), lastDay);
  const out = new Date(year, month, day);
  return Dates.dateToISO(out);
}

function cryptoRandomId() {
  // Small random id for client-side objects (not security sensitive)
  try {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (_) {
    return String(Math.random()).slice(2) + String(Date.now());
  }
}

function fmtSource(src) {
  if (!src) return "—";
  if (src === "salario_fixo") return "Salário fixo";
  if (src === "renda_extra") return "Renda extra";
  return "Outros";
}

function normalizeKey(s){
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim();
}
function isHiddenCategoryName(name){
  // Mantém a categoria no banco (segurança), mas esconde do usuário.
  return normalizeKey(name) === "cartao";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function decodeHtmlAttr(s) {
  // reverse escapeHtml for safe attribute values used in dataset
  const el = document.createElement("textarea");
  el.innerHTML = String(s || "");
  return el.value;
}
function csvEscape(s) {
  const str = String(s).replaceAll('"', '""');
  return `"${str}"`;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// boot
const authSvc = new AuthService();
const txSvc = new TxService(() => authSvc.user?.uid);
const ui = new UI(authSvc, txSvc);

(async () => {
  try {
    // Se o login foi via redirect (mobile), isso finaliza o fluxo.
    await f.getRedirectResult(auth);
  } catch (_) {}

  ui.init();
  authSvc.onChange((user) => ui.onAuth(user));
})();
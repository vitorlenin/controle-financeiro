// lancamentos.js - Serviços de recorrência e lançamentos (TxService)

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

  // Exclusions prevent regeneration of a specific recurring rule for a given month.
  // Stored as string keys: "<recurringId>::<YYYY-MM>" in users/{uid}/meta/recurring.exclusions
  async loadExclusions() {
    const snap = await f.getDoc(this._docRef());
    if (!snap.exists) return new Set();
    const data = snap.data() || {};
    const arr = Array.isArray(data.exclusions) ? data.exclusions : [];
    const set = new Set();
    for (const k of arr) {
      const key = String(k || "").trim();
      if (key) set.add(key);
    }
    return set;
  }

  async addExclusion(recurringId, monthKey) {
    const rid = String(recurringId || "").trim();
    const mk = String(monthKey || "").slice(0, 7);
    if (!rid || !mk) return;

    // Read-modify-write. The list is expected to be small (only skipped months).
    const set = await this.loadExclusions();
    set.add(`${rid}::${mk}`);
    await f.setDoc(this._docRef(), { exclusions: Array.from(set), updatedAt: f.serverTimestamp() }, { merge: true });
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
    const exclusions = await this.loadExclusions();
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
      if (exclusions.has(key)) continue;
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


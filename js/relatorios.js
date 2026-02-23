// relatorios.js - Cartões, faturas e helpers

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

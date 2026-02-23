// categorias.js - CategoryService

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

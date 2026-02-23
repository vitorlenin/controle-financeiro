// auth.js - Firebase (compat) + AuthService
// Objetivo: manter Firebase compat (sem build) e expor apenas o que o app precisa.
// IMPORTANTÍSSIMO: este arquivo NÃO deve declarar serviços duplicados (CategoryService, TxService, etc.)
// porque eles já existem nos seus módulos próprios.

// Firebase init (compat build)
// Obs: os scripts do Firebase compat são carregados no index.html antes deste arquivo.
const firebaseConfig = {
  apiKey: "AIzaSyDm4QFlXVY89QSTxfPJFsOvebLxGYgQDLg",
  authDomain: "controle-financeiro-6c339.firebaseapp.com",
  projectId: "controle-financeiro-6c339",
  storageBucket: "controle-financeiro-6c339.firebasestorage.app",
  messagingSenderId: "474233431352",
  appId: "1:474233431352:web:dec3e9d4f77b5474b40dcd",
};

// Evita erro se o app já estiver inicializado
try {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
} catch (_) {
  try { firebase.initializeApp(firebaseConfig); } catch (_) {}
}

// Expostos globalmente (compat)
const auth = firebase.auth();
const db = firebase.firestore();

// Persistência local (melhor no mobile/PWA)
try {
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
} catch (_) {}

// Camada mínima de compatibilidade (para o resto do app continuar igual)
const f = {
  GoogleAuthProvider: firebase.auth.GoogleAuthProvider,
  signInWithPopup: (authInstance, provider) => authInstance.signInWithPopup(provider),
  signInWithRedirect: (authInstance, provider) => authInstance.signInWithRedirect(provider),
  getRedirectResult: (authInstance) => authInstance.getRedirectResult(),
  signOut: (authInstance) => authInstance.signOut(),
  onAuthStateChanged: (authInstance, cb) => authInstance.onAuthStateChanged(cb),

  collection: (_db, path) => _db.collection(path),
  doc: (arg1, ...rest) => {
    // doc(collectionRef) -> auto-id
    if (arg1 && typeof arg1.doc === "function" && rest.length === 0) return arg1.doc();
    // doc(collectionRef, id)
    if (arg1 && typeof arg1.doc === "function" && rest.length === 1) return arg1.doc(rest[0]);
    // doc(db, 'a/b/c')
    const path = (rest.length ? [arg1, ...rest] : [arg1]).filter(Boolean).join("/");
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
        alert("Não foi possível concluir o login com Google. Tente abrir pelo Chrome/Safari e tente novamente.");
      }
    }
  }
  async logout() { await f.signOut(auth); }
}

// Expor globals (para os outros módulos)
window.AuthService = AuthService;
window.auth = auth;
window.db = db;
window.f = f;

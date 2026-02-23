// app.js - bootstrap
const APP_VERSION = "v7.0.5";

// boot
const authSvc = new AuthService();
const txSvc = new TxService(() => authSvc.user?.uid);
const ui = new UI(authSvc, txSvc);

const app = { authSvc, txSvc, ui };
window.__CF__ = app; // preparado para depuração

(async () => {
  try {
    // Se o login foi via redirect (mobile), isso finaliza o fluxo.
    await f.getRedirectResult(auth);
  } catch (_) {}

  ui.init();
  authSvc.onChange((user) => ui.onAuth(user));
})();

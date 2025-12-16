// mobile/inject.js

(function () {
  if (window.__BLINK_ACTIVE__) return;
  window.__BLINK_ACTIVE__ = true;

  const BASE = "http://YOUR_IP:8000/mobile";

  function load(src) {
    const s = document.createElement("script");
    s.src = src + "?v=" + Date.now();
    document.head.appendChild(s);
  }

  // UI קטן לדעת שזה נטען
  const badge = document.createElement("div");
  badge.textContent = "Blink ON";
  badge.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    z-index: 999999;
    background: #000;
    color: #fff;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 12px;
  `;
  document.body.appendChild(badge);

  load(`${BASE}/core/strain-core.js`);
  load(`${BASE}/core/state-machine.js`);
  load(`${BASE}/core/ux-engine.js`);
  load(`${BASE}/sensors/proximity.js`);
})();

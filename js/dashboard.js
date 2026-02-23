// dashboard.js - PieChart (dashboard)

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


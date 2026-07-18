/* charts.js — tiny dependency-free SVG charts (no CDN needed, works offline).
 * Colors come from CSS custom properties so they adapt to light/dark themes. */

(function (global) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  function el(name, attrs) {
    const node = document.createElementNS(NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  }

  /* Line chart of 18-hole scores over time. values: [{label, value}] */
  function lineChart(container, values, options) {
    options = options || {};
    container.innerHTML = "";
    if (!values.length) {
      container.innerHTML = '<p class="empty">Not enough data yet.</p>';
      return;
    }
    const W = 640, H = 240, pad = { t: 20, r: 16, b: 34, l: 40 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const accent = cssVar("--accent", "#1a7a3c");
    const grid = cssVar("--border", "#d8dee4");
    const text = cssVar("--muted", "#5b6570");

    const vals = values.map(function (v) { return v.value; });
    let min = Math.min.apply(null, vals);
    let max = Math.max.apply(null, vals);
    if (min === max) { min -= 2; max += 2; }
    const range = max - min;
    min -= range * 0.1;
    max += range * 0.1;

    const svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img" });
    svg.setAttribute("aria-label", options.ariaLabel || "Scoring trend chart");

    // Gridlines + y labels (lower is better, so we invert)
    const ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var val = min + (range * 1.2) * (i / ticks);
      var y = pad.t + ih - (ih * (i / ticks));
      svg.appendChild(el("line", { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: grid, "stroke-width": 1, opacity: 0.5 }));
      var lbl = el("text", { x: pad.l - 6, y: y + 4, "text-anchor": "end", "font-size": 11, fill: text });
      lbl.textContent = Math.round(val);
      svg.appendChild(lbl);
    }

    function px(idx) {
      return pad.l + (values.length === 1 ? iw / 2 : (iw * idx) / (values.length - 1));
    }
    function py(value) {
      return pad.t + ih - (ih * (value - min)) / (max - min);
    }

    // Area + line
    var d = "";
    values.forEach(function (v, idx) {
      d += (idx === 0 ? "M" : "L") + px(idx) + " " + py(v.value) + " ";
    });
    var area = d + "L" + px(values.length - 1) + " " + (pad.t + ih) + " L" + px(0) + " " + (pad.t + ih) + " Z";
    svg.appendChild(el("path", { d: area, fill: accent, opacity: 0.12 }));
    svg.appendChild(el("path", { d: d.trim(), fill: "none", stroke: accent, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));

    // Points + x labels
    values.forEach(function (v, idx) {
      var c = el("circle", { cx: px(idx), cy: py(v.value), r: 4, fill: accent });
      var title = el("title");
      title.textContent = v.label + ": " + v.value;
      c.appendChild(title);
      svg.appendChild(c);
      if (idx % Math.ceil(values.length / 6) === 0 || idx === values.length - 1) {
        var t = el("text", { x: px(idx), y: H - 12, "text-anchor": "middle", "font-size": 10, fill: text });
        t.textContent = v.label;
        svg.appendChild(t);
      }
    });

    container.appendChild(svg);
  }

  /* Horizontal bar chart. rows: [{label, value, sub}] lower value = better rank. */
  function barChart(container, rows, options) {
    options = options || {};
    container.innerHTML = "";
    if (!rows.length) {
      container.innerHTML = '<p class="empty">No ranked players yet.</p>';
      return;
    }
    const accent = cssVar("--accent", "#1a7a3c");
    const text = cssVar("--text", "#1b2430");
    const muted = cssVar("--muted", "#5b6570");
    const max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    const min = Math.min.apply(null, rows.map(function (r) { return r.value; }));
    const rowH = 34, W = 640, pad = 8;
    const H = rows.length * rowH + pad * 2;
    const labelW = 150, barMax = W - labelW - 70;

    const svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img" });
    svg.setAttribute("aria-label", options.ariaLabel || "Leaderboard chart");

    rows.forEach(function (r, i) {
      var y = pad + i * rowH;
      var frac = max === min ? 1 : 0.25 + 0.75 * ((max - r.value) / (max - min));
      var w = Math.max(6, barMax * frac);
      var lbl = el("text", { x: 4, y: y + rowH / 2 + 4, "font-size": 13, fill: text, "font-weight": 600 });
      lbl.textContent = (i + 1) + ". " + r.label;
      svg.appendChild(lbl);
      svg.appendChild(el("rect", { x: labelW, y: y + 6, width: w, height: rowH - 14, rx: 4, fill: accent, opacity: i === 0 ? 1 : 0.55 }));
      var val = el("text", { x: labelW + w + 8, y: y + rowH / 2 + 4, "font-size": 12, fill: muted });
      val.textContent = r.sub || r.value;
      svg.appendChild(val);
    });
    container.appendChild(svg);
  }

  global.Charts = { lineChart: lineChart, barChart: barChart };
})(typeof window !== "undefined" ? window : this);

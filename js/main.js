/* ==========================================================
   Coastal Bluffs Story Map — behavior
   - Section nav (active state, mobile drawer) + progress bar
   - Live stats from the bluff service, animated counters, waffle chart
   - Bluff cross-section diagram scrolly
   - "Score a bluff" calculator (MGS stability scoring)
   - Shoreline type × stability matrix (live)
   - Photo annotations (SVG overlay from data-annotations)
   - Maps: bluff data fetched once, shared by hero + scrolly maps; click pop-ups
   ========================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CFG = window.STORY_CONFIG || {};
  var SC = CFG.scoring || {};
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var MI = 1609.344;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function query(params) {
    return fetch(CFG.bluffs.url + "/query?" + new URLSearchParams(Object.assign({ f: "json" }, params)))
      .then(function (r) { return r.json(); });
  }
  function sumStat(field, name) {
    return JSON.stringify([{ statisticType: "sum", onStatisticField: field, outStatisticFieldName: name }]);
  }

  /* ---------- Section nav ---------- */
  var nav = document.getElementById("section-nav");
  var toggle = document.querySelector(".topbar__toggle");
  var navLinks = $$(".sidenav__list a", nav);

  function setNavOpen(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  }
  toggle.addEventListener("click", function () {
    var open = toggle.getAttribute("aria-expanded") !== "true";
    setNavOpen(open);
    if (open) navLinks[0].focus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setNavOpen(false);
      toggle.focus();
    }
  });
  navLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      var section = document.querySelector(link.getAttribute("href"));
      if (!section) return;
      e.preventDefault();
      setNavOpen(false);
      section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      history.replaceState(null, "", link.getAttribute("href"));
      var heading = section.querySelector("h2");
      if (heading) heading.focus({ preventScroll: true });
    });
  });

  var sections = navLinks.map(function (a) { return document.querySelector(a.getAttribute("href")); });
  var bar = document.querySelector(".progress__bar");
  function onScroll() {
    var line = window.innerHeight * 0.35, current = null;
    sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= line) current = i; });
    navLinks.forEach(function (a, i) {
      if (i === current) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  }
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });
  onScroll();

  /* ---------- Reveal-on-view helper ---------- */
  function onView(el, fn, margin) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); } });
    }, { rootMargin: margin || "0px 0px -20% 0px" });
    io.observe(el);
  }

  /* ---------- Live stats ---------- */
  var stats = { S: 1110.4, U: 501.5, H: 77.1 }; // miles; fallback if the service is unreachable

  function percents() {
    // Largest-remainder rounding so the three shares add up to exactly 100
    var total = stats.S + stats.U + stats.H;
    var raw = ["S", "U", "H"].map(function (k) { return { k: k, v: stats[k] / total * 100 }; });
    raw.forEach(function (r) { r.f = Math.floor(r.v); });
    var left = 100 - raw.reduce(function (a, r) { return a + r.f; }, 0);
    raw.slice().sort(function (a, b) { return (b.v - b.f) - (a.v - a.f); })
      .slice(0, left).forEach(function (r) { r.f++; });
    var out = {}; raw.forEach(function (r) { out[r.k] = r.f; });
    return out;
  }

  function renderStats() {
    var p = percents();
    var v = {
      bluffMiles: stats.S + stats.U + stats.H, movingMiles: stats.U + stats.H, highMiles: stats.H,
      pctS: p.S + "%", pctU: p.U + "%", pctH: p.H + "%"
    };
    $$("[data-stat]").forEach(function (el) {
      var val = v[el.getAttribute("data-stat")];
      if (val == null) return;
      var text = typeof val === "number" ? fmt(val) : val;
      el.setAttribute("data-final", text);
      if (!el.hasAttribute("data-counting")) el.textContent = text;
    });
    var w = document.querySelector("[data-waffle]");
    if (w) {
      w.setAttribute("aria-label", "Share of Maine's bluff miles by stability: about " +
        p.S + "% stable, " + p.U + "% unstable, " + p.H + "% highly unstable.");
      var cells = [];
      ["H", "U", "S"].forEach(function (k) { for (var i = 0; i < p[k]; i++) cells.push(k); });
      w.innerHTML = cells.map(function (k, i) {
        return '<span class="cell cell--' + k + '" style="--i:' + i + '"></span>';
      }).join("");
    }
  }

  function loadStats() {
    if (!CFG.bluffs || !CFG.bluffs.url) return;
    query({ where: CFG.bluffs.where || "1=1", groupByFieldsForStatistics: "STABILITY", outStatistics: sumStat(CFG.bluffs.lengthField, "len") })
      .then(function (d) {
        if (!d.features) return;
        d.features.forEach(function (f) {
          if (f.attributes.STABILITY in stats) stats[f.attributes.STABILITY] = f.attributes.len / MI;
        });
        renderStats();
      }).catch(function () { /* keep fallback numbers */ });
  }

  // Animated counters: the final number is in the HTML, so it reads correctly without JS
  $$("[data-count]").forEach(function (el) {
    if (reduceMotion) return;
    onView(el, function () {
      var final = parseFloat((el.getAttribute("data-final") || el.textContent).replace(/,/g, ""));
      if (isNaN(final)) return;
      el.setAttribute("data-counting", "");
      var t0 = performance.now(), dur = 1400;
      (function tick(t) {
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(final * e);
        if (k < 1) requestAnimationFrame(tick);
        else { el.removeAttribute("data-counting"); el.textContent = el.getAttribute("data-final") || fmt(final); }
      })(t0);
    });
  });

  var waffleEl = document.querySelector("[data-waffle]");
  if (waffleEl) onView(waffleEl, function (el) { el.classList.add("is-in"); });
  renderStats();
  loadStats();

  /* ---------- Scoring helpers (shared by calculator + pop-ups) ---------- */
  var LEVEL_PTS = { None: 0, Minimal: 2, Moderate: 4, Extensive: 6 };
  var ASPECT_PTS = { S: 6, SE: 6, SW: 6, E: 4, W: 4, NE: 2, NW: 2, N: 0 };
  function heightPts(v) {
    if (v == null || v === "") return null;
    var s = String(v);
    if (/^</.test(s)) return 0;
    if (/^>/.test(s)) return 6;
    if (/^5-10/.test(s)) return 2;
    if (/^1[05]-/.test(s)) return 4;
    var n = parseFloat(s);
    if (isNaN(n)) return null;
    return n < 5 ? 0 : n < 10 ? 2 : n <= 20 ? 4 : 6;
  }
  function slopePts(v) {
    if (v == null || v === "") return null;
    var s = String(v);
    if (/^(<25|0-25)/.test(s)) return 0;
    if (/^25-50/.test(s)) return 2;
    if (/^50-75/.test(s)) return 4;
    if (/^75-100/.test(s)) return 6;
    if (/^>100/.test(s)) return 8;
    var n = parseFloat(s);
    if (isNaN(n)) return null;
    return n < 25 ? 0 : n < 50 ? 2 : n < 75 ? 4 : n <= 100 ? 6 : 8;
  }
  function multLabel(m) { return m === 1 ? "×1" : m === 0.5 ? "×½" : "×0"; }
  function gaugeHTML(score) {
    var pct = Math.min(score, SC.gaugeMax) / SC.gaugeMax * 100;
    return '<div class="gauge" aria-hidden="true"><div class="gauge__band gauge__band--S"></div>' +
      '<div class="gauge__band gauge__band--U"></div><div class="gauge__band gauge__band--H"></div>' +
      '<div class="gauge__marker" style="left:' + pct + '%"></div></div>';
  }

  /* ---------- "Score a bluff" calculator ---------- */
  var calc = document.querySelector("[data-calc]");
  if (calc && SC.visible) {
    var visBox = calc.querySelector('[data-factors="visible"]');
    var terBox = calc.querySelector('[data-factors="terrain"]');

    function radioRow(name, label, opts) {
      return '<fieldset class="factor-row"><legend>' + esc(label) + '</legend><div class="seg">' +
        opts.map(function (o, i) {
          return '<label><input type="radio" name="' + name + '" value="' + i + '"' + (i === 0 ? " checked" : "") + '>' +
            '<span>' + esc(o[0]) + '<small>+' + o[1] + '</small></span></label>';
        }).join("") + "</div></fieldset>";
    }
    visBox.innerHTML = SC.visible.map(function (f, i) {
      return radioRow("v" + i, f.label, SC.levels.map(function (lv, j) { return [lv, f.points[j]]; }));
    }).join("");
    terBox.innerHTML = SC.terrain.map(function (f, i) { return radioRow("t" + i, f.label, f.options); }).join("");

    var scoreEl = calc.querySelector("[data-score]");
    var ratingEl = calc.querySelector("[data-rating]");
    var markerEl = calc.querySelector("[data-marker]");
    var mathEl = calc.querySelector("[data-math]");
    var multEl = calc.querySelector("[data-mult]");
    var liveEl = calc.querySelector("[data-live]");
    var form = calc.querySelector("form");

    function picked(name) {
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? Number(el.value) : 0;
    }
    function update() {
      var vis = SC.visible.reduce(function (a, f, i) { return a + f.points[picked("v" + i)]; }, 0);
      var ter = SC.terrain.reduce(function (a, f, i) { return a + f.options[picked("t" + i)][1]; }, 0);
      var m = SC.terrainMultiplier(vis);
      var total = vis + ter * m;
      var r = SC.rating(total);
      scoreEl.textContent = total;
      ratingEl.textContent = CFG.labels[r];
      ratingEl.setAttribute("data-r", r);
      markerEl.style.left = (Math.min(total, SC.gaugeMax) / SC.gaugeMax * 100) + "%";
      multEl.textContent = multLabel(m);
      if (m === 0) multEl.setAttribute("data-zero", ""); else multEl.removeAttribute("data-zero");
      mathEl.innerHTML = "Visible signs <b>" + vis + "</b> + terrain <b>" + ter + "</b> " + multLabel(m) +
        " = <b>" + total + "</b><br>" +
        (m === 0 ? "Few visible signs, so terrain isn't counted." :
         m === 0.5 ? "Some visible signs, so terrain counts half." : "Clear visible signs, so terrain counts in full.");
      liveEl.textContent = "Score " + total + ", " + CFG.labels[r] + ".";
    }
    function preset(key) {
      var p = SC.presets[key];
      p.visible.forEach(function (v, i) { form.querySelector('input[name="v' + i + '"][value="' + v + '"]').checked = true; });
      p.terrain.forEach(function (v, i) { form.querySelector('input[name="t' + i + '"][value="' + v + '"]').checked = true; });
      update();
    }
    form.addEventListener("change", update);
    $$("[data-preset]", calc).forEach(function (b) {
      b.addEventListener("click", function () { preset(b.getAttribute("data-preset")); });
    });
    preset("U");
  }

  /* ---------- Shoreline type × stability matrix (live) ---------- */
  var matrix = document.querySelector("[data-matrix]");
  // Fallback miles (2026-10-08 snapshot); replaced by a live query
  var MATRIX_FALLBACK = {
    L: { S: 299.0, U: 120.6, H: 16.7, N: 1009.0 }, A: { S: 138.9, U: 28.6, H: 3.3, N: 79.6 },
    V: { S: 492.8, U: 186.2, H: 19.1, N: 447.8 }, N: { S: 209.3, U: 189.1, H: 39.2, N: 224.1 }
  };
  var TYPE_NAMES = { L: "ledge", A: "armored shores", V: "salt marsh", N: "beaches and flats" };

  function mix(a, b, t) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); });
    var pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return "rgb(" + pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * t); }).join(",") + ")";
  }

  function renderMatrix(M) {
    if (!matrix) return;
    var cols = ["L", "A", "V", "N"], max = 0, share = {};
    cols.forEach(function (c) {
      ["S", "U", "H", "N"].forEach(function (r) { max = Math.max(max, M[c][r] || 0); });
      var bluff = (M[c].S || 0) + (M[c].U || 0) + (M[c].H || 0);
      share[c] = bluff ? (M[c].H || 0) / bluff : 0;
    });
    var peak = cols.slice().sort(function (a, b) { return share[b] - share[a]; });
    $$("tbody tr", matrix).forEach(function (tr) {
      var r = tr.getAttribute("data-row");
      $$("td", tr).forEach(function (td, i) {
        var c = cols[i], mi = M[c][r] || 0, t = Math.sqrt(mi / max);
        var bluff = (M[c].S || 0) + (M[c].U || 0) + (M[c].H || 0);
        td.style.setProperty("--cell-bg", mix("#f3f6f8", "#003f67", t));
        td.style.setProperty("--cell-ink", t > 0.55 ? "#fff" : "#16212b");
        td.innerHTML = "<b>" + fmt(mi) + "</b><small>miles" +
          (r !== "N" && bluff ? " · " + Math.round(mi / bluff * 100) + "% of bluffs" : "") + "</small>";
        td.classList.toggle("is-peak", r === "H" && c === peak[0]);
      });
    });
    var ins = document.querySelector("[data-insight]");
    if (ins) {
      ins.innerHTML = "Bluffs above <b>" + TYPE_NAMES[peak[0]] + "</b> are the most likely to be highly unstable: " +
        Math.round(share[peak[0]] * 100) + "%, vs. " + Math.round(share[peak[3]] * 100) + "% above " + TYPE_NAMES[peak[3]] + ".";
    }
  }

  if (matrix) {
    renderMatrix(MATRIX_FALLBACK);
    if (CFG.bluffs && CFG.bluffs.url) {
      query({ where: "1=1", groupByFieldsForStatistics: "TYPE,STABILITY", outStatistics: sumStat(CFG.bluffs.lengthField, "len") })
        .then(function (d) {
          if (!d.features) return;
          var M = { L: {}, A: {}, V: {}, N: {} };
          d.features.forEach(function (f) {
            var a = f.attributes, t = a.TYPE || "", s = a.STABILITY;
            if (!/^[SUHN]$/.test(s)) return;
            // Mixed types (e.g. "L-V") count toward each type present
            ["L", "A", "V", "N"].forEach(function (k) {
              if (t.indexOf(k) !== -1) M[k][s] = (M[k][s] || 0) + a.len / MI;
            });
          });
          renderMatrix(M);
        }).catch(function () {});
    }
  }

  /* ---------- Step tracking (shared by diagram + map scrollies) ---------- */
  function trackSteps(scrolly, onStep) {
    var steps = $$(".step", scrolly);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        steps.forEach(function (s) { s.classList.toggle("is-active", s === entry.target); });
        onStep(entry.target);
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { io.observe(s); });
    return steps;
  }

  /* ---------- Bluff diagram ---------- */
  $$(".scrolly--diagram").forEach(function (scrolly) {
    var fig = scrolly.querySelector("[data-diagram]");
    trackSteps(scrolly, function (step) { fig.setAttribute("data-focus", step.getAttribute("data-focus")); });
  });

  /* ---------- Photo annotations ----------
     data-annotations='[{"type":"circle","x":50,"y":40,"r":10,"n":1}]'
     x/y/r are % of the image box. Overlay is aria-hidden; numbers are explained in the figcaption. */
  var SVG_NS = "http://www.w3.org/2000/svg";
  $$(".photo[data-annotations]").forEach(function (fig) {
    var notes;
    try { notes = JSON.parse(fig.getAttribute("data-annotations")); } catch (e) { return; }
    var frame = fig.querySelector(".photo__frame");
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "photo__overlay");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    notes.forEach(function (a) {
      var rx = a.type === "ellipse" ? a.rx : a.r;
      var ry = a.type === "ellipse" ? a.ry : a.r * (4 / 3); // keep circles round on the 4:3 frame
      ["ring-shadow", "ring"].forEach(function (cls) {
        var el = document.createElementNS(SVG_NS, "ellipse");
        el.setAttribute("cx", a.x); el.setAttribute("cy", a.y);
        el.setAttribute("rx", rx); el.setAttribute("ry", ry);
        el.setAttribute("class", cls);
        svg.appendChild(el);
      });
      if (a.n != null) {
        var pin = document.createElement("span");
        pin.className = "photo__pin";
        pin.setAttribute("aria-hidden", "true");
        pin.textContent = a.n;
        pin.style.left = (a.x + rx * 0.72) + "%";
        pin.style.top = (a.y - ry * 0.72) + "%";
        frame.appendChild(pin);
      }
    });
    frame.appendChild(svg);
    onView(fig, function () { fig.classList.add("is-in"); });
  });

  /* ---------- Maps ---------- */
  if (!window.L || !CFG.basemap) return;

  // Bluff data: fetched once in pages, shared by every map.
  var listeners = [];
  var pages = [];
  function onBluffPage(fn) { pages.forEach(fn); listeners.push(fn); }

  function loadBluffs() {
    var b = CFG.bluffs;
    if (!b || !b.url) return;
    var base = {
      where: b.where || "1=1",
      outFields: (b.fields || ["*"]).join(","),
      outSR: "4326",
      maxAllowableOffset: "0.0001",
      geometryPrecision: "5",
      f: "geojson"
    };
    query({ where: base.where, returnCountOnly: "true" }).then(function (d) {
      var size = 2000, n = Math.ceil((d.count || 0) / size);
      for (var i = 0; i < n; i++) {
        var q = new URLSearchParams(Object.assign({}, base, { resultOffset: String(i * size), resultRecordCount: String(size) }));
        fetch(b.url + "/query?" + q).then(function (r) { return r.json(); }).then(function (gj) {
          if (!gj.features) return;
          pages.push(gj);
          listeners.forEach(function (fn) { fn(gj); });
        });
      }
    }).catch(function () {
      $$(".map").forEach(function (m) { notice(m, "Couldn't load bluff data"); });
    });
  }

  function notice(mapEl, text) {
    var n = document.createElement("div");
    n.className = "map-notice";
    n.setAttribute("role", "status");
    n.textContent = text;
    mapEl.parentNode.appendChild(n);
  }

  /* Pop-up: fetch the full record for one segment and chart its score */
  function placeName(q) {
    return String(q || "").split("-").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }
  function popupHTML(a) {
    var r = a.STABILITY, label = CFG.labels[r] || r;
    var head = '<div class="pop__head"><div><p class="pop__place">' + esc(placeName(a.QUADNAME) || "Maine coast") + "</p>" +
      '<span class="pop__rating pop__rating--' + esc(r) + '">' + esc(label) + "</span></div>";
    var lenFt = a.Shape__Length ? Math.round(a.Shape__Length * 3.28084) + " ft segment" : "";

    if (a.Score == null) {
      return '<div class="pop">' + head + "</div>" +
        '<p class="pop__empty">Rated from earlier mapping. Detailed scores cover the 2026 Casco Bay update; the rest of the coast follows by 2029.</p>' +
        '<p class="pop__foot">' + esc(lenFt) + "</p></div>";
    }

    var vis = 0;
    var bars = SC.visible.map(function (f) {
      var lv = a[f.field], pts = LEVEL_PTS[lv];
      if (pts == null) pts = 0;
      vis += pts;
      return "<li><span>" + esc(f.label) + '</span><span class="pop__bar"><i style="width:' + (pts / 6 * 100) + '%"></i></span><b>' + pts + "</b></li>";
    }).join("");
    var tPts = [ASPECT_PTS[a.Aspect], heightPts(a.Height), slopePts(a.Slope)];
    var ter = tPts.reduce(function (s, p) { return s + (p || 0); }, 0);
    var m = SC.terrainMultiplier(vis);
    var chips = [["Faces", a.Aspect, tPts[0]], ["Height", a.Height, tPts[1]], ["Slope", a.Slope, tPts[2]]].map(function (c) {
      var v = c[1];
      if (v != null && !isNaN(parseFloat(v)) && !/[<>%-]/.test(v)) v = Math.round(parseFloat(v)) + (c[0] === "Slope" ? "%" : " ft");
      return "<span><small>" + c[0] + "</small> " + esc(v == null ? "—" : v) + " · " + (c[2] == null ? "–" : c[2]) + "</span>";
    }).join("");

    // ~95% of stored MGS scores match the published formula exactly; note any gap rather than hide it
    var gap = a.Score - (vis + ter * m);
    var gapNote = gap ? "Recorded MGS score differs from the formula by " + (gap > 0 ? "+" : "") + gap + "." : "";

    var hab = a.Habitat_Count || 0, dots = "";
    for (var i = 0; i < 9; i++) dots += '<i class="' + (i < hab ? "on" : "") + '"></i>';

    return '<div class="pop">' + head +
      '<div class="pop__score"><b>' + a.Score + "</b><span>score</span></div></div>" +
      gaugeHTML(a.Score) +
      '<p class="pop__h"><span>Visible signs</span><span>' + vis + " pts</span></p>" +
      '<ul class="pop__bars">' + bars + "</ul>" +
      '<p class="pop__h"><span>Terrain ' + multLabel(m) + "</span><span>" + ter * m + " pts</span></p>" +
      '<div class="pop__terrain">' + chips + "</div>" +
      '<div class="pop__row">' +
      '<div class="pop__mini"><small>Sediment value</small><b>' + esc(a.Sediment_Value || "—") + "</b>" +
      (a.Sediment_Score != null ? " <small style=\"display:inline\">(" + a.Sediment_Score + " pts)</small>" : "") + "</div>" +
      '<div class="pop__mini"><small>Habitats nearby</small><b>' + hab + '</b><span class="pop__dots" aria-hidden="true">' + dots + "</span></div>" +
      "</div>" +
      '<p class="pop__foot">' + esc([a.Confidence ? "Confidence: " + a.Confidence : "", lenFt, gapNote].filter(Boolean).join(" · ")) + "</p>" +
      "</div>";
  }

  function makeMap(el, opts) {
    opts = Object.assign({}, opts);
    var wantZoom = opts.zoomControl, popups = opts.popups;
    delete opts.zoomControl; delete opts.popups;
    var map = L.map(el, Object.assign({
      center: [44.2, -68.9], zoom: 8,
      scrollWheelZoom: false, // never trap page scrolling
      preferCanvas: true,
      zoomSnap: 0.25,
      zoomControl: false
    }, opts));
    // Zoom buttons top-right so they never sit under the nav
    if (wantZoom) L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer(CFG.basemap.url, { attribution: CFG.basemap.attribution, maxZoom: CFG.basemap.maxZoom }).addTo(map);
    if (CFG.basemap.labelsUrl) {
      map.createPane("labels");
      map.getPane("labels").style.zIndex = 650;
      map.getPane("labels").style.pointerEvents = "none";
      L.tileLayer(CFG.basemap.labelsUrl, { pane: "labels", maxZoom: CFG.basemap.maxZoom }).addTo(map);
    }

    // Bluff lines, restyled per view without refetching
    var view = "stability";
    var renderer = L.canvas({ padding: 0.5, tolerance: popups ? 8 : 0 });
    var group = L.featureGroup().addTo(map);
    var selected = null;
    function styleFor(f) {
      var s = CFG.views[view](f.properties || {}, CFG.colors);
      return f === (selected && selected.feature) ? Object.assign({}, s, { weight: 9, opacity: 1 }) : s;
    }
    onBluffPage(function (gj) {
      L.geoJSON(gj, { style: styleFor, renderer: renderer, interactive: !!popups }).addTo(group);
    });
    map.setBluffView = function (v) {
      if (!v || v === view || !CFG.views[v]) return;
      view = v;
      group.eachLayer(function (l) { l.setStyle(styleFor); });
    };

    if (popups) {
      group.on("click", function (e) {
        var layer = e.layer, f = layer.feature;
        var id = f.id != null ? f.id : f.properties.OBJECTID;
        var prev = selected;
        selected = layer;
        if (prev) prev.setStyle(styleFor(prev.feature));
        layer.setStyle(styleFor(f));
        layer.bringToFront();
        var pop = L.popup({ className: "bluff-pop", maxWidth: 320, autoPanPaddingTopLeft: [20, 70] })
          .setLatLng(e.latlng).setContent('<div class="pop"><p class="pop__place">Loading…</p></div>').openOn(map);
        query({ objectIds: id, outFields: CFG.bluffs.popupFields.join(","), returnGeometry: "false" })
          .then(function (d) {
            var a = d.features && d.features[0] && d.features[0].attributes;
            pop.setContent(a ? popupHTML(a) : '<p class="pop__empty">No details for this segment.</p>');
          })
          .catch(function () { pop.setContent('<p class="pop__empty">Couldn\'t load details. Try again.</p>'); });
      });
      // Step cards step aside while a pop-up is open so they never cover it
      map.on("popupopen", function () { el.closest(".scrolly").classList.add("has-popup"); });
      map.on("popupclose", function () {
        el.closest(".scrolly").classList.remove("has-popup");
        if (selected) { var s = selected; selected = null; s.setStyle(styleFor(s.feature)); }
      });
    }
    return map;
  }

  // Hero: non-interactive, fits the whole coast
  var heroEl = document.getElementById("map-hero");
  if (heroEl) {
    var hero = makeMap(heroEl, {
      attributionControl: false, dragging: false, keyboard: false,
      doubleClickZoom: false, boxZoom: false, touchZoom: false
    });
    // Push the coast to the right of the headline on wide screens
    var wide = window.innerWidth >= 1024;
    hero.fitBounds([[43.07, -70.9], [45.19, -66.94]], {
      paddingTopLeft: [wide ? heroEl.clientWidth * 0.4 : 10, 30],
      paddingBottomRight: [20, window.innerHeight * (wide ? 0.3 : 0.45)]
    });
  }

  $$(".scrolly--map").forEach(function (scrolly) {
    var mapEl = document.getElementById(scrolly.getAttribute("data-map"));
    if (!mapEl) return;
    var map = makeMap(mapEl, { keyboard: true, zoomControl: true, popups: scrolly.hasAttribute("data-popups") });
    var keys = $$("[data-key]", scrolly);
    // Start in the first step's view so the map is right before any step activates
    var first = scrolly.querySelector(".step");
    if (first) {
      var fc = (first.getAttribute("data-center") || "").split(",").map(Number);
      if (fc.length === 2 && !isNaN(fc[0])) map.setView(fc, Number(first.getAttribute("data-zoom")) || 8);
      map.setBluffView(first.getAttribute("data-view"));
    }
    trackSteps(scrolly, function (step) {
      var c = (step.getAttribute("data-center") || "").split(",").map(Number);
      var z = Number(step.getAttribute("data-zoom")) || map.getZoom();
      map.closePopup();
      if (c.length === 2 && !isNaN(c[0])) {
        if (reduceMotion) map.setView(c, z, { animate: false });
        else map.flyTo(c, z, { duration: 1.4 });
      }
      var v = step.getAttribute("data-view");
      map.setBluffView(v);
      keys.forEach(function (k) {
        var kv = k.getAttribute("data-key");
        k.hidden = !(kv === v || (kv === "stability" && v === "highly"));
      });
    });
    window.addEventListener("resize", function () { map.invalidateSize(); });
    setTimeout(function () { map.invalidateSize(); }, 200);
  });

  loadBluffs();
})();

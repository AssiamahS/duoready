(() => {
  "use strict";

  // Apple opened App Store submissions built with the Xcode 27.1 RC (iOS 27.1 SDK,
  // the first SDK that lets apps fill iPhone Duo's inner display) on 2026-10-05;
  // Xcode 27.1 final shipped 2026-10-15. A release older than the RC date cannot
  // have been built with the 27.1 SDK.
  const SDK_RC = new Date("2026-10-05T00:00:00Z");
  const SDK_FINAL = new Date("2026-10-15T00:00:00Z");
  const DUO_WORDS = /\b(iphone\s*duo|duo|fold(able|ed|ing)?|inner (display|screen)|unfold)\b/i;

  const CFG = window.DUOREADY_CONFIG || { PAY_URL: "", CONTACT: "" };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- storage (localStorage, failure-tolerant) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("duoready:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("duoready:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const state = {
    recent: store.get("recent", []),
    saved: store.get("saved", []),
    leads: [],
    current: null,
    tab: store.get("tab", "check"),
  };

  // ---------- iTunes API: fetch (CORS) with JSONP fallback ----------
  let jsonpSeq = 0;
  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "__duo" + (++jsonpSeq) + Date.now();
      const s = document.createElement("script");
      const t = setTimeout(() => { cleanup(); reject(new Error("Apple lookup timed out")); }, 12000);
      function cleanup() { clearTimeout(t); delete window[cb]; s.remove(); }
      window[cb] = (data) => { cleanup(); resolve(data); };
      s.onerror = () => { cleanup(); reject(new Error("Apple lookup failed")); };
      s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.head.appendChild(s);
    });
  }
  async function itunes(path, params) {
    const url = "https://itunes.apple.com/" + path + "?" + new URLSearchParams(params);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      return jsonp(url);
    }
  }

  function parseInput(raw) {
    const s = raw.trim();
    const id = s.match(/id(\d{6,12})/) || s.match(/^(\d{6,12})$/);
    const country = (s.match(/apps\.apple\.com\/([a-z]{2})\//i) || [])[1];
    if (id) return { id: id[1], country: (country || "us").toLowerCase() };
    if (/^[a-z0-9-]+(\.[a-z0-9-]+){2,}$/i.test(s)) return { bundleId: s, country: "us" };
    return { term: s, country: "us" };
  }

  async function lookup(raw) {
    const q = parseInput(raw);
    let data;
    if (q.id) data = await itunes("lookup", { id: q.id, country: q.country });
    else if (q.bundleId) data = await itunes("lookup", { bundleId: q.bundleId, country: q.country });
    else data = await itunes("search", { term: q.term, entity: "software", country: q.country, limit: 1 });
    const r = data && data.results && data.results.find((x) => x.kind === "software" || x.wrapperType === "software");
    if (!r) throw new Error("No iOS app found for that link or name.");
    return slim(r, q.country);
  }

  function slim(r, country) {
    return {
      id: String(r.trackId),
      name: r.trackName,
      seller: r.sellerName || r.artistName,
      sellerUrl: r.sellerUrl || "",
      devUrl: r.artistViewUrl || "",
      url: r.trackViewUrl,
      icon: r.artworkUrl100 || r.artworkUrl60,
      version: r.version,
      released: r.currentVersionReleaseDate,
      firstReleased: r.releaseDate,
      ratings: r.userRatingCount || 0,
      rating: r.averageUserRating || 0,
      genre: r.primaryGenreName,
      minOs: r.minimumOsVersion,
      price: r.formattedPrice || (r.price ? "$" + r.price : "Free"),
      notes: (r.releaseNotes || "").slice(0, 1200),
      country,
      checkedAt: new Date().toISOString(),
    };
  }

  function assess(app) {
    const d = new Date(app.released);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    const mentions = DUO_WORDS.test(app.notes);
    if (mentions && d >= SDK_RC) {
      return { level: "good", label: "Duo update shipped", text: "The latest release is on the 27.1 SDK timeline and its notes mention Duo or folding. It most likely fills the inner display." };
    }
    if (d < SDK_RC) {
      return { level: "bad", label: "Likely letterboxed", text: `Last updated ${days} day${days === 1 ? "" : "s"} ago, before the iOS 27.1 SDK was accepted for submission. On Duo's inner screen it opens as a phone-sized window with black bars.` };
    }
    return { level: "maybe", label: "Rebuilt, not confirmed", text: `Updated on ${fmtDate(d)}${d < SDK_FINAL ? " (during the 27.1 release-candidate window)" : ""}, but the notes don't mention Duo. It may fill the screen and still have a stretched phone layout. Check it on a device.` };
  }

  const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const fmtNum = (n) => new Intl.NumberFormat(undefined, { notation: n > 9999 ? "compact" : "standard" }).format(n);

  // ---------- rendering ----------
  function itemHTML(app, extra = "") {
    const a = assess(app);
    return `<li class="item${state.current && state.current.id === app.id ? " active" : ""}" data-id="${esc(app.id)}" tabindex="0">
      <img src="${esc(app.icon)}" alt="" loading="lazy">
      <div><div class="t">${esc(app.name)}</div><div class="s">${esc(app.seller)} · ${esc(fmtDate(app.released))}${extra}</div></div>
      <span class="badge ${a.level}">${a.level === "bad" ? "bars" : a.level === "good" ? "ready" : "check"}</span></li>`;
  }

  function renderLists() {
    $("#recent").innerHTML = state.recent.map((a) => itemHTML(a)).join("");
    $("#saved").innerHTML = state.saved.length ? state.saved.map((a) => itemHTML(a)).join("") : `<li class="hint">Nothing saved yet. Star an app from its report.</li>`;
    $("#leads").innerHTML = state.leads.map((a) => itemHTML(a, ` · ${fmtNum(a.ratings)} ratings`)).join("");
    $("#savedCount").textContent = state.saved.length;
  }

  function renderReport(app, scroll = false) {
    state.current = app;
    const a = assess(app);
    const isSaved = state.saved.some((s) => s.id === app.id);
    $("#report").className = "report";
    $("#report").innerHTML = `
      <div class="rhead"><img src="${esc(app.icon)}" alt="">
        <div><h2>${esc(app.name)}</h2><div class="seller">${esc(app.seller)} · ${esc(app.genre || "")}</div></div></div>
      <div class="verdict ${a.level}">
        <div class="screen sm ${a.level === "bad" ? "" : "fill"}" aria-hidden="true"><div class="app"></div></div>
        <div><strong>${esc(a.label)}</strong><p>${esc(a.text)}</p></div>
      </div>
      <dl class="facts">
        <div><dt>Current version</dt><dd>${esc(app.version)}</dd></div>
        <div><dt>Last release</dt><dd>${esc(fmtDate(app.released))}</dd></div>
        <div><dt>Ratings (exposure)</dt><dd>${esc(fmtNum(app.ratings))}${app.rating ? " · " + app.rating.toFixed(1) + "★" : ""}</dd></div>
        <div><dt>Minimum iOS</dt><dd>${esc(app.minOs || "?")}</dd></div>
      </dl>
      ${app.notes ? `<div class="notes" aria-label="Latest release notes">${esc(app.notes)}</div>` : ""}
      <div class="ractions">
        <button class="btn" data-act="refit">${a.level === "good" ? "Get a layout review" : "Fix the black bars"}</button>
        <button class="btn ghost" data-act="save">${isSaved ? "★ Saved" : "☆ Save"}</button>
        <button class="btn ghost" data-act="copy">Copy outreach</button>
        <a class="btn ghost" href="${esc(app.url)}" target="_blank" rel="noopener">App Store</a>
      </div>`;
    renderLists();
    if (scroll && window.matchMedia("(max-width: 699px)").matches) $("#reportPane").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderError(msg) {
    $("#report").className = "report empty";
    $("#report").innerHTML = `<h2>Couldn't check that</h2><p class="err">${esc(msg)}</p>`;
  }

  function outreach(app) {
    const a = assess(app);
    const when = fmtDate(app.released);
    return `Hi ${app.seller} team,

I checked ${app.name} on iPhone Duo's inner display. Its last App Store release is from ${when}, ${a.level === "bad" ? "before the iOS 27.1 SDK, so it opens letterboxed: a phone-sized window with black bars" : "and it still needs a check for a stretched phone layout"} on the 7.6" screen. With ${fmtNum(app.ratings)} ratings, a lot of Duo owners will see that.

I do fixed-price Duo refits: rebuild on Xcode 27.1, adaptive layout for the inner display, state kept across fold/unfold, and the Duo screenshots Apple will require from April 2027. $299 to rebuild and verify, $599 to audit and patch. You get a pull request, and you don't pay if it doesn't fill the screen.

Want a free 2-minute screen recording of your app on the fold?

${location.origin + location.pathname}`;
  }

  // ---------- actions ----------
  async function check(raw) {
    const btn = $("#checkForm .btn");
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      const app = await lookup(raw);
      state.recent = [app, ...state.recent.filter((x) => x.id !== app.id)].slice(0, 12);
      store.set("recent", state.recent);
      renderReport(app, true);
    } catch (e) {
      renderError(e.message || String(e));
    } finally {
      btn.disabled = false; btn.textContent = "Check";
    }
  }

  async function buildLeads(term, country, staleOnly) {
    const btn = $("#leadForm .btn");
    btn.disabled = true; btn.textContent = "Searching the App Store…";
    try {
      const data = await itunes("search", { term, entity: "software", country, limit: 200 });
      let apps = (data.results || []).map((r) => slim(r, country));
      const total = apps.length;
      if (staleOnly) apps = apps.filter((a) => assess(a).level === "bad");
      apps.sort((x, y) => y.ratings - x.ratings);
      state.leads = apps;
      store.set("lastLeadTerm", { term, country, staleOnly });
      $("#leadBar").hidden = false;
      $("#leadSummary").textContent = `${apps.length} of ${total} apps${staleOnly ? " not updated since the 27.1 SDK" : ""}, sorted by ratings`;
      renderLists();
    } catch (e) {
      $("#leadBar").hidden = false;
      $("#leadSummary").textContent = "Search failed: " + (e.message || e);
    } finally {
      btn.disabled = false; btn.textContent = "Build lead list";
    }
  }

  function leadsCSV() {
    const cols = ["name", "seller", "sellerUrl", "devUrl", "url", "released", "version", "ratings", "genre", "verdict"];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = state.leads.map((a) => cols.map((c) => q(c === "verdict" ? assess(a).label : a[c])).join(","));
    const blob = new Blob([cols.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `duoready-leads-${($("#leadTerm").value || "apps").replace(/\W+/g, "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function findApp(id) {
    return [...state.leads, ...state.recent, ...state.saved].find((a) => a.id === id);
  }

  function setTab(name) {
    state.tab = name;
    store.set("tab", name);
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $$(".tabpanel").forEach((p) => (p.hidden = p.dataset.panel !== name));
  }

  // ---------- sales CTA ----------
  function start(tier) {
    if (CFG.PAY_URL) {
      const u = new URL(CFG.PAY_URL);
      if (state.current) u.searchParams.set("client_reference_id", state.current.id);
      window.open(u.toString(), "_blank", "noopener");
      return;
    }
    $("#requestTier").textContent = tier ? "Plan: " + tier : "";
    $("#requestTier").dataset.tier = tier || "";
    $("#requestApp").value = state.current ? state.current.url : "";
    $("#requestFallback").hidden = true;
    $("#requestDlg").showModal();
  }

  function sendRequest(form) {
    const f = new FormData(form);
    const body = `DuoReady refit request
Plan: ${$("#requestTier").dataset.tier || "not chosen"}
Name: ${f.get("name")}
Reply to: ${f.get("reply")}
App: ${f.get("app") || "-"}
Notes: ${f.get("notes") || "-"}`;
    const contact = (CFG.CONTACT || "").trim();
    if (contact.includes("@")) {
      location.href = `mailto:${encodeURIComponent(contact)}?subject=${encodeURIComponent("DuoReady refit request")}&body=${encodeURIComponent(body)}`;
      return true;
    }
    if (/^\+?[\d\s().-]{7,}$/.test(contact)) {
      location.href = `sms:${contact.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`;
      return true;
    }
    const pre = $("#requestFallback");
    pre.hidden = false;
    pre.textContent = "Requests aren't connected yet. Copy this and send it to the developer:\n\n" + body;
    return false;
  }

  // ---------- wire up ----------
  $("#checkForm").addEventListener("submit", (e) => { e.preventDefault(); check($("#appUrl").value); });
  $$(".chip[data-example]").forEach((c) => c.addEventListener("click", () => { $("#appUrl").value = c.dataset.example; check(c.dataset.example); }));
  $("#leadForm").addEventListener("submit", (e) => { e.preventDefault(); buildLeads($("#leadTerm").value.trim(), $("#leadCountry").value, $("#leadStaleOnly").checked); });
  $("#leadCsv").addEventListener("click", leadsCSV);
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

  document.addEventListener("click", (e) => {
    const li = e.target.closest(".item");
    if (li) { const app = findApp(li.dataset.id); if (app) renderReport(app, true); return; }
    const act = e.target.closest("[data-act]");
    if (act && state.current) {
      const app = state.current;
      if (act.dataset.act === "save") {
        const has = state.saved.some((s) => s.id === app.id);
        state.saved = has ? state.saved.filter((s) => s.id !== app.id) : [app, ...state.saved];
        store.set("saved", state.saved);
        renderReport(app);
      } else if (act.dataset.act === "copy") {
        const text = outreach(app);
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
          () => { act.textContent = "Copied"; setTimeout(() => (act.textContent = "Copy outreach"), 1500); },
          () => { window.prompt("Copy this message", text); }
        );
      } else if (act.dataset.act === "refit") {
        start(assess(app).level === "good" ? "Audit & patch ($599)" : "Rebuild & verify ($299)");
      }
    }
    const st = e.target.closest(".start");
    if (st) start(st.dataset.tier);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("item")) e.target.click();
  });

  $("#requestForm").addEventListener("submit", (e) => {
    if (e.submitter && e.submitter.value === "cancel") return;
    if (!sendRequest(e.target)) e.preventDefault();
  });

  const lt = store.get("lastLeadTerm", null);
  if (lt) { $("#leadTerm").value = lt.term; $("#leadCountry").value = lt.country; $("#leadStaleOnly").checked = lt.staleOnly; }
  setTab(state.tab);
  renderLists();
  const deep = new URLSearchParams(location.search).get("app");
  if (deep) { $("#appUrl").value = deep; check(deep); }
  else if (state.recent[0]) renderReport(state.recent[0]);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();

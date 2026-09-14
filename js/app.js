/* Prague Stop Collector — app logic
   Data model:
     stop  = { id, name, lat, lon, lines: [{id, name, type, night}] }
     state = { [stopId]: "transit" | "visited" }   // absent = not collected
   Persistence: localStorage, key STORAGE_KEY
*/

const STORAGE_KEY = "ptc_state_v1";
// Marker images — swap any of these files for your own PNG, same filename, and it just works.
const STATE_ICON_URLS = {
  none: "icons/grey.png",
  transit: "icons/green.png",
  visited: "icons/star.png",
};

const MODE_LABELS = {
  metro: "Metro",
  tram: "Tram",
  bus: "Bus",
  trolleybus: "Trolleybus",
  train: "Train (S-line)",
  funicular: "Funicular",
  ferry: "Ferry",
};

const MODE_ORDER = ["metro", "tram", "trolleybus", "bus", "train", "funicular", "ferry"];

let STOPS = [];          // array of stop objects
let LINES = {};          // lineKey -> { id, name, type, night, stopIds: Set }
let COLLECTED = {};       // stopId -> "transit" | "visited"
let map, markersById = {};
let activeStopId = null;
let activeLineKey = null;
let activeModeFilter = "all";

// ---------- persistence ----------
// COLLECTED[stopId] = { state: "transit"|"visited", ts: <ISO string> }
// (older saved data stored a plain string per stop — migrated on load below)
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    let migrated = false;
    for (const id of Object.keys(parsed)) {
      if (typeof parsed[id] === "string") {
        parsed[id] = { state: parsed[id], ts: null }; // unknown date for old entries
        migrated = true;
      }
    }
    COLLECTED = parsed;
    if (migrated) saveState();
  } catch (e) {
    console.warn("Could not read saved progress, starting fresh.", e);
    COLLECTED = {};
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(COLLECTED));
  } catch (e) {
    console.warn("Could not save progress (storage may be full/unavailable).", e);
  }
}

// ---------- data loading ----------
async function loadData() {
  const res = await fetch("data/stops.json");
  const json = await res.json();
  STOPS = json.stops;

  // Build a line key that's stable across stops referencing the same line.
  // PID line "id" is unique per line, so use that; fall back to name+type.
  LINES = {};
  for (const stop of STOPS) {
    for (const line of stop.lines) {
      const key = lineKeyFor(line);
      if (!LINES[key]) {
        LINES[key] = { key, id: line.id, name: line.name, type: line.type, night: !!line.night, stopIds: new Set() };
      }
      LINES[key].stopIds.add(stop.id);
      // keep "night" true if any occurrence says so
      if (line.night) LINES[key].night = true;
    }
  }
}

function lineKeyFor(line) {
  return `${line.type}:${line.name}`;
}

// ---------- derived / achievement logic ----------
function stopState(stopId) {
  return COLLECTED[stopId] ? COLLECTED[stopId].state : "none";
}

function stopTimestamp(stopId) {
  return COLLECTED[stopId] ? COLLECTED[stopId].ts : null;
}

function formatTimestamp(ts) {
  if (!ts) return "date unknown";
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch (e) {
    return "date unknown";
  }
}

function isCollected(stopId) {
  return !!COLLECTED[stopId];
}

function lineProgress(lineKey) {
  const line = LINES[lineKey];
  const ids = [...line.stopIds];
  const total = ids.length;
  const collected = ids.filter(isCollected).length;
  const visited = ids.filter(id => stopState(id) === "visited").length;
  return { total, collected, visited, remaining: ids.filter(id => !isCollected(id)) };
}

function overallProgress() {
  const total = STOPS.length;
  const collected = STOPS.filter(s => isCollected(s.id)).length;
  return { total, collected };
}

function modeBreakdown() {
  const byMode = {};
  for (const stop of STOPS) {
    const modes = new Set(stop.lines.map(l => l.type));
    for (const m of modes) {
      byMode[m] = byMode[m] || { total: 0, collected: 0 };
      byMode[m].total++;
      if (isCollected(stop.id)) byMode[m].collected++;
    }
  }
  return byMode;
}

// ---------- map ----------
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([50.0836, 14.4230], 12); // Prague center

  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  tiles.addTo(map);

  for (const stop of STOPS) {
    const marker = L.marker([stop.lat, stop.lon], { icon: iconFor(stop.id) });
    marker.on("click", () => openStopSheet(stop.id));
    marker.addTo(map);
    markersById[stop.id] = marker;
  }
}

function iconFor(stopId) {
  const state = stopState(stopId);
  const url = STATE_ICON_URLS[state];
  const size = state === "visited" ? 13 : 9;
  return L.divIcon({
    className: "",
    html: `<div class="stop-marker state-${state}"><img src="${url}" alt="${state}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function refreshMarker(stopId) {
  const marker = markersById[stopId];
  if (marker) marker.setIcon(iconFor(stopId));
}

// ---------- stop sheet ----------
function openStopSheet(stopId) {
  activeStopId = stopId;
  const stop = STOPS.find(s => s.id === stopId);
  document.getElementById("sheetStopName").textContent = stop.name;
  document.getElementById("sheetLineCount").textContent =
    `${stop.lines.length} line${stop.lines.length === 1 ? "" : "s"} serve this stop`;

  const chipsWrap = document.getElementById("sheetLines");
  chipsWrap.innerHTML = "";
  for (const line of stop.lines) {
    const chip = document.createElement("span");
    chip.className = `sheet-line-chip badge-${line.type}`;
    chip.textContent = line.name + (line.night ? " 🌙" : "");
    chipsWrap.appendChild(chip);
  }

  updateStateButtons();
  showSheet("stopSheet");
}

function updateStateButtons() {
  const current = stopState(activeStopId);
  document.querySelectorAll("#stopSheet .state-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.state === current);
  });
  const meta = document.getElementById("sheetTimestamp");
  if (current === "none") {
    meta.textContent = "";
  } else {
    const verb = current === "visited" ? "Visited" : "Driven through";
    meta.textContent = `${verb} · ${formatTimestamp(stopTimestamp(activeStopId))}`;
  }
}

function setStopState(stopId, state) {
  if (state === "none") {
    delete COLLECTED[stopId];
  } else {
    const existing = COLLECTED[stopId];
    // Keep the original timestamp if re-tapping the same state; only
    // stamp "now" when the state actually changes.
    const ts = existing && existing.state === state ? existing.ts : new Date().toISOString();
    COLLECTED[stopId] = { state, ts };
  }
  saveState();
  refreshMarker(stopId);
  renderHeaderProgress();
  renderLinesList();
  if (document.getElementById("tab-stats").classList.contains("active")) renderStats();
  if (activeLineKey) renderLineSheetStops();
}

// ---------- lines tab ----------
function renderModeFilters() {
  const wrap = document.getElementById("modeFilters");
  wrap.innerHTML = "";
  const modesPresent = MODE_ORDER.filter(m => Object.values(LINES).some(l => l.type === m));
  const all = document.createElement("button");
  all.className = "mode-chip" + (activeModeFilter === "all" ? " active" : "");
  all.textContent = "All";
  all.onclick = () => { activeModeFilter = "all"; renderModeFilters(); renderLinesList(); };
  wrap.appendChild(all);

  for (const m of modesPresent) {
    const chip = document.createElement("button");
    chip.className = "mode-chip" + (activeModeFilter === m ? " active" : "");
    chip.textContent = MODE_LABELS[m] || m;
    chip.onclick = () => { activeModeFilter = m; renderModeFilters(); renderLinesList(); };
    wrap.appendChild(chip);
  }
}

function renderLinesList() {
  const listEl = document.getElementById("linesList");
  const query = (document.getElementById("lineSearch").value || "").trim().toLowerCase();

  let keys = Object.keys(LINES);
  if (activeModeFilter !== "all") keys = keys.filter(k => LINES[k].type === activeModeFilter);
  if (query) keys = keys.filter(k => LINES[k].name.toLowerCase().includes(query));

  // sort: by mode order, then numeric/alpha by name
  keys.sort((a, b) => {
    const la = LINES[a], lb = LINES[b];
    const ia = MODE_ORDER.indexOf(la.type), ib = MODE_ORDER.indexOf(lb.type);
    if (ia !== ib) return ia - ib;
    if (la.night !== lb.night) return la.night ? 1 : -1;
    return la.name.localeCompare(lb.name, undefined, { numeric: true });
  });

  listEl.innerHTML = "";
  if (keys.length === 0) {
    listEl.innerHTML = `<p style="color:#8a9095;padding:20px 4px;">No lines match.</p>`;
    return;
  }

  for (const key of keys) {
    const line = LINES[key];
    const prog = lineProgress(key);
    const pct = prog.total ? Math.round((prog.collected / prog.total) * 100) : 0;

    const row = document.createElement("div");
    row.className = "line-row";
    row.onclick = () => openLineSheet(key);
    row.innerHTML = `
      <div class="line-badge badge-${line.type}">${escapeHtml(line.name)}</div>
      <div class="line-row-body">
        <div class="line-row-title">${MODE_LABELS[line.type] || line.type}${line.night ? " · night" : ""}</div>
        <div class="line-row-sub">${prog.collected} / ${prog.total} stops collected</div>
        <div class="progress-mini-track"><div class="progress-mini-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="line-row-pct">${pct}%</div>
    `;
    listEl.appendChild(row);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- line sheet ----------
function openLineSheet(lineKey) {
  activeLineKey = lineKey;
  const line = LINES[lineKey];
  document.getElementById("lineSheetTitle").textContent =
    `${MODE_LABELS[line.type] || line.type} ${line.name}${line.night ? " (night)" : ""}`;
  renderLineSheetStops();
  showSheet("lineSheet");
}

function renderLineSheetStops() {
  const line = LINES[activeLineKey];
  const prog = lineProgress(activeLineKey);
  const pct = prog.total ? Math.round((prog.collected / prog.total) * 100) : 0;
  document.getElementById("lineSheetBar").style.width = pct + "%";
  document.getElementById("lineSheetSummary").textContent =
    `${prog.collected} / ${prog.total} stops collected (${prog.visited} visited, ${prog.collected - prog.visited} driven through)`;

  const wrap = document.getElementById("lineSheetStops");
  wrap.innerHTML = "";
  const ids = [...line.stopIds].map(id => STOPS.find(s => s.id === id)).sort((a, b) => a.name.localeCompare(b.name));
  for (const stop of ids) {
    const state = stopState(stop.id);
    const ts = stopTimestamp(stop.id);
    const row = document.createElement("div");
    row.className = "line-stop-row";
    row.onclick = () => { closeSheet("lineSheet"); openStopSheet(stop.id); };
    const label =
      state === "visited" ? `Visited · ${formatTimestamp(ts)}` :
      state === "transit" ? `Driven through · ${formatTimestamp(ts)}` :
      "Not collected";
    row.innerHTML = `
      <span class="dot state-${state}"></span>
      <span class="name">
        ${escapeHtml(stop.name)}
        <span class="stop-row-meta">${label}</span>
      </span>`;
    wrap.appendChild(row);
  }
}

// ---------- stats tab ----------
function renderStats() {
  const el = document.getElementById("statsContent");
  const { total, collected } = overallProgress();
  const pct = total ? Math.round((collected / total) * 100) : 0;

  let html = `
    <div class="stats-card">
      <div class="stats-big-num">${collected} / ${total}</div>
      <div class="stats-label">stops collected (${pct}%)</div>
    </div>
  `;

  // per-mode breakdown
  const byMode = modeBreakdown();
  html += `<div class="stats-card"><div class="stats-label" style="margin-bottom:8px;">By mode</div>`;
  for (const m of MODE_ORDER) {
    if (!byMode[m]) continue;
    const { total: t, collected: c } = byMode[m];
    const p = t ? Math.round((c / t) * 100) : 0;
    html += `
      <div class="mode-progress-row">
        <div class="label">${MODE_LABELS[m] || m}</div>
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${p}%"></div></div>
        <div class="pct">${p}%</div>
      </div>`;
  }
  html += `</div>`;

  // almost-done lines (in progress, not complete), closest first
  const inProgress = Object.keys(LINES)
    .map(key => ({ key, ...lineProgress(key), line: LINES[key] }))
    .filter(l => l.collected > 0 && l.collected < l.total)
    .sort((a, b) => (a.total - a.collected) - (b.total - b.collected));

  if (inProgress.length) {
    html += `<div class="stats-card"><div class="stats-label" style="margin-bottom:4px;">Almost there</div><div class="almost-list">`;
    for (const l of inProgress.slice(0, 12)) {
      const left = l.total - l.collected;
      html += `
        <div class="almost-item" data-key="${l.key}">
          <span class="name">${MODE_LABELS[l.line.type] || l.line.type} ${escapeHtml(l.line.name)}</span>
          <span class="need">${left} stop${left === 1 ? "" : "s"} to go</span>
        </div>`;
    }
    html += `</div></div>`;
  }

  el.innerHTML = html;
  el.querySelectorAll(".almost-item").forEach(item => {
    item.onclick = () => { switchTab("lines"); openLineSheet(item.dataset.key); };
  });
}

function renderHeaderProgress() {
  const { total, collected } = overallProgress();
  document.getElementById("overallProgress").textContent = `${collected} / ${total} stops`;
}

// ---------- sheets (generic show/hide) ----------
function showSheet(id) {
  document.getElementById(id).classList.add("open");
  document.getElementById(id + "Backdrop").classList.add("open");
}
function closeSheet(id) {
  document.getElementById(id).classList.remove("open");
  document.getElementById(id + "Backdrop").classList.remove("open");
}

// ---------- tabs ----------
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
  if (name === "stats") renderStats();
  if (name === "map" && map) setTimeout(() => map.invalidateSize(), 50);
}

// ---------- wiring ----------
function wireEvents() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll("#stopSheet .state-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      setStopState(activeStopId, btn.dataset.state);
      updateStateButtons();
    });
  });

  document.getElementById("sheetClose").addEventListener("click", () => closeSheet("stopSheet"));
  document.getElementById("stopSheetBackdrop").addEventListener("click", () => closeSheet("stopSheet"));
  document.getElementById("lineSheetClose").addEventListener("click", () => closeSheet("lineSheet"));
  document.getElementById("lineSheetBackdrop").addEventListener("click", () => closeSheet("lineSheet"));

  document.getElementById("lineSearch").addEventListener("input", renderLinesList);
}

// ---------- boot ----------
async function boot() {
  loadState();
  await loadData();
  wireEvents();
  renderModeFilters();
  renderLinesList();
  renderHeaderProgress();
  initMap();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(err => {
      console.warn("Service worker registration failed (app still works online):", err);
    });
  }
}

boot();

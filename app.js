import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const VERSION = "3";
const STALE_MS = 8 * 60 * 60 * 1000; // ab 8 Stunden gilt ein Eintrag als veraltet
const $ = (id) => document.getElementById(id);
const show = (id) => {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = true));
  $(id).hidden = false;
};

const cfg = window.CONFIG || {};
if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  show("screen-setup");
  throw new Error("config.js ist noch nicht ausgefüllt");
}
// Stolperstein: Unter "Project Settings -> API" steht auch die REST-Adresse
// (…/rest/v1/). Der Client hängt diesen Pfad selbst an — steht er schon in der URL,
// fragt er ins Leere. Deshalb hier auf die reine Projekt-Adresse zurechtstutzen.
const cleanUrl = (u) =>
  String(u).trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "").replace(/\/+$/, "");

const db = createClient(cleanUrl(cfg.SUPABASE_URL), String(cfg.SUPABASE_ANON_KEY).trim());

/* ---------- Fehler sichtbar machen ---------- */

function showError(msg) {
  const el = $("error");
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
}

// Aus der technischen Meldung eine Anweisung machen, mit der man etwas anfangen kann.
function explain(error) {
  const code = String(error.code || "");
  const msg = String(error.message || error);
  if (code === "PGRST202" || /could not find the function|does not exist/i.test(msg))
    return "Die Datenbank kennt die Funktionen noch nicht. Führe supabase/schema.sql im Supabase SQL-Editor aus.";
  if (code === "42501" || /permission denied|not authorized/i.test(msg))
    return "Die Datenbank verweigert den Zugriff. Führe die aktuelle Fassung von supabase/schema.sql im SQL-Editor aus.";
  if (code === "PGRST125" || /invalid path/i.test(msg))
    return "Die SUPABASE_URL in config.js ist falsch. Dort gehört nur die Projekt-Adresse hin (https://deinprojekt.supabase.co), ohne /rest/v1.";
  if (code === "PGRST301" || /jwt|api key/i.test(msg))
    return "Der Key in config.js passt nicht zum Projekt. Prüfe URL und anon-Key unter Project Settings → API.";
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return "Keine Verbindung zur Datenbank. Prüfe das Internet und die SUPABASE_URL in config.js.";
  return "Speichern fehlgeschlagen: " + msg;
}

/* ---------- Gruppe & Identität ---------- */

const randomId = (len = 16) => {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((n) => alphabet[n % alphabet.length])
    .join("");
};

const groupFromUrl = () => (location.hash.match(/^#g=([a-z0-9]{6,32})$/) || [])[1] || null;

let group = groupFromUrl();
let me = null; // { id, secret, name } — das Secret beweist, dass der Eintrag mir gehört

const meKey = () => `zeit:me:${group}`;

function loadMe() {
  try {
    const m = JSON.parse(localStorage.getItem(meKey()) || "null");
    if (!m || !m.id || !m.name) return null;
    if (!m.secret) {
      m.secret = randomId(24); // Nachrüsten für Einträge aus früheren Versionen
      localStorage.setItem(meKey(), JSON.stringify(m));
    }
    return m;
  } catch {
    return null;
  }
}

/* ---------- Screens ---------- */

$("btn-create").addEventListener("click", () => {
  location.hash = `#g=${randomId()}`;
});

$("form-join").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("input-name").value.trim();
  group = groupFromUrl();
  if (!name || !group) return;
  me = { id: randomId(20), secret: randomId(24), name };
  localStorage.setItem(meKey(), JSON.stringify(me));
  start();
});

window.addEventListener("hashchange", route);
route();

function route() {
  group = groupFromUrl();
  if (!group) {
    // Als App gestartet (ohne Hash)? Dann zurück in die zuletzt genutzte Gruppe.
    const last = localStorage.getItem("zeit:last");
    if (last) {
      location.hash = `#g=${last}`;
      return;
    }
    return show("screen-start");
  }
  localStorage.setItem("zeit:last", group);
  me = loadMe();
  if (!me) {
    show("screen-join");
    $("input-name").focus();
    return;
  }
  start();
}

/* ---------- Hauptansicht ---------- */

let state = { free: false, note: "" };
let channel = null;
let timer = null;

async function start() {
  show("screen-main");
  $("me-name").textContent = me.name;
  $("version").textContent = `Version ${VERSION}`;

  await refresh(true);

  // Live-Updates: ein Ruf in die Gruppe, sobald jemand etwas ändert.
  if (channel) db.removeChannel(channel);
  channel = db.channel(`zeit:${group}`);
  channel.on("broadcast", { event: "update" }, () => refresh()).subscribe();

  clearInterval(timer);
  timer = setInterval(() => refresh(), 20000); // Fallback + frische Zeitangaben
}

function paintMe() {
  $("btn-free").setAttribute("aria-pressed", String(state.free));
  $("btn-busy").setAttribute("aria-pressed", String(!state.free));
}

$("btn-free").addEventListener("click", () => setFree(true));
$("btn-busy").addEventListener("click", () => setFree(false));

function setFree(free) {
  state.free = free;
  paintMe();
  save();
}

let noteTimer = null;
$("input-note").addEventListener("input", () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(save, 600);
});
$("input-note").addEventListener("blur", () => {
  clearTimeout(noteTimer);
  save();
});

// Speichervorgänge nacheinander abarbeiten. Sonst kann ein früherer Aufruf (z. B. der
// Klick auf "Hab Zeit") nach einem späteren (die getippte Notiz) beim Server ankommen
// und dessen Ergebnis wieder überschreiben.
let saveChain = Promise.resolve();
function save() {
  saveChain = saveChain.then(doSave, doSave);
  return saveChain;
}

async function doSave() {
  state.note = $("input-note").value;
  const args = () => ({
    g: group,
    mid: me.id,
    sec: me.secret,
    nm: me.name,
    is_free: state.free,
    txt: state.note.trim(),
  });

  let { error } = await db.rpc("set_status", args());

  // Eintrag mit dieser ID gehört zu einem alten Secret (z. B. nach einem Schema-Wechsel)?
  // Dann still mit frischer ID neu anfangen, statt den Nutzer im Regen stehen zu lassen.
  if (error && /gehoert jemand anderem/i.test(String(error.message))) {
    me = { ...me, id: randomId(20), secret: randomId(24) };
    localStorage.setItem(meKey(), JSON.stringify(me));
    ({ error } = await db.rpc("set_status", args()));
  }

  if (error) {
    flash("nicht gespeichert");
    showError(explain(error));
    return;
  }
  showError("");
  flash("gespeichert");
  channel?.send({ type: "broadcast", event: "update", payload: {} });
  refresh();
}

let flashTimer = null;
function flash(text) {
  const el = $("saved");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove("on"), 1600);
}

async function refresh(applyMine = false) {
  const { data, error } = await db.rpc("list_statuses", { g: group });
  if (error) return showError(explain(error));
  if (!data) return;

  if (applyMine) {
    const mine = data.find((r) => r.id === me.id);
    if (mine) {
      state = { free: !!mine.free, note: mine.note || "" };
      $("input-note").value = state.note;
    }
    paintMe();
  }

  const stale = (r) => Date.now() - new Date(r.updated_at).getTime() > STALE_MS;
  const others = data.filter((r) => r.id !== me.id);
  // Zuerst aktuelle Einträge, darin "hat Zeit" zuerst, sonst die neuesten oben.
  others.sort(
    (a, b) =>
      Number(stale(a)) - Number(stale(b)) ||
      Number(b.free) - Number(a.free) ||
      String(b.updated_at).localeCompare(String(a.updated_at))
  );

  const list = $("list");
  list.innerHTML = "";
  for (const r of others) list.appendChild(renderItem(r, stale(r)));
  $("empty").hidden = others.length > 0;
}

function renderItem(r, isStale) {
  const li = document.createElement("li");
  li.className = "item" + (r.free ? " free" : "") + (isStale ? " stale" : "");

  const dot = document.createElement("span");
  dot.className = "dot";

  const body = document.createElement("div");
  body.className = "body";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = r.name;
  body.appendChild(name);

  if (r.note) {
    const note = document.createElement("div");
    note.className = "note-text";
    note.textContent = r.note;
    body.appendChild(note);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${r.free ? "Hat Zeit" : "Keine Zeit"} · ${ago(Date.now() - new Date(r.updated_at).getTime())}`;
  body.appendChild(meta);

  li.append(dot, body);
  return li;
}

function ago(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.floor(std / 24);
  return tage === 1 ? "gestern" : `vor ${tage} Tagen`;
}

/* ---------- Teilen & Verlassen ---------- */

$("btn-share").addEventListener("click", async () => {
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: "Zeit?", text: "Wer hat gerade Zeit?", url });
    else {
      await navigator.clipboard.writeText(url);
      flash("Link kopiert");
    }
  } catch {
    /* Teilen abgebrochen */
  }
});

$("btn-leave").addEventListener("click", async () => {
  if (!confirm("Deinen Eintrag aus dieser Gruppe löschen?")) return;
  await db.rpc("delete_status", { mid: me.id, sec: me.secret });
  channel?.send({ type: "broadcast", event: "update", payload: {} });
  localStorage.removeItem(meKey());
  localStorage.removeItem("zeit:last");
  location.href = location.pathname;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
const db = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

/* ---------- Gruppe & Identität ---------- */

const randomId = (len = 16) => {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((n) => alphabet[n % alphabet.length])
    .join("");
};

const groupFromUrl = () => (location.hash.match(/^#g=([a-z0-9]{6,32})$/) || [])[1] || null;

let group = groupFromUrl();
let me = null; // { id, name }

const meKey = () => `zeit:me:${group}`;

function loadMe() {
  try {
    const raw = localStorage.getItem(meKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
const saveMe = (m) => localStorage.setItem(meKey(), JSON.stringify(m));

/* ---------- Screens ---------- */

$("btn-create").addEventListener("click", () => {
  location.hash = `#g=${randomId()}`;
});

$("form-join").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("input-name").value.trim();
  group = groupFromUrl();
  if (!name || !group) return;
  me = { id: randomId(20), name };
  saveMe(me);
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

  const { data } = await db.from("statuses").select("*").eq("id", me.id).maybeSingle();
  if (data) {
    state = { free: !!data.free, note: data.note || "" };
    $("input-note").value = state.note;
  }
  paintMe();
  await refresh();

  if (channel) db.removeChannel(channel);
  channel = db
    .channel(`statuses:${group}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "statuses", filter: `group_id=eq.${group}` },
      refresh
    )
    .subscribe();

  clearInterval(timer);
  timer = setInterval(refresh, 20000); // Fallback + frische Zeitangaben
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

async function save() {
  state.note = $("input-note").value;
  const { error } = await db.from("statuses").upsert({
    id: me.id,
    group_id: group,
    name: me.name,
    free: state.free,
    note: state.note.trim(),
    updated_at: new Date().toISOString(),
  });
  flash(error ? "nicht gespeichert" : "gespeichert");
  if (!error) refresh();
}

let flashTimer = null;
function flash(text) {
  const el = $("saved");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove("on"), 1600);
}

async function refresh() {
  const { data, error } = await db
    .from("statuses")
    .select("*")
    .eq("group_id", group)
    .order("updated_at", { ascending: false });
  if (error) return;

  const stale = (r) => Date.now() - new Date(r.updated_at).getTime() > STALE_MS;
  const others = data.filter((r) => r.id !== me.id);
  // Zuerst aktuelle Einträge, darin "hat Zeit" zuerst, sonst die neuesten oben.
  others.sort(
    (a, b) =>
      Number(stale(a)) - Number(stale(b)) ||
      Number(b.free) - Number(a.free) ||
      b.updated_at.localeCompare(a.updated_at)
  );

  const list = $("list");
  list.innerHTML = "";
  for (const r of others) list.appendChild(renderItem(r));
  $("empty").hidden = others.length > 0;
}

function renderItem(r) {
  const age = Date.now() - new Date(r.updated_at).getTime();
  const li = document.createElement("li");
  li.className = "item" + (r.free ? " free" : "") + (age > STALE_MS ? " stale" : "");

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
  meta.textContent = `${r.free ? "Hat Zeit" : "Keine Zeit"} · ${ago(age)}`;
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
  const payload = { title: "Zeit?", text: "Hier siehst du, wer gerade Zeit hat:", url };
  try {
    if (navigator.share) await navigator.share(payload);
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
  await db.from("statuses").delete().eq("id", me.id);
  localStorage.removeItem(meKey());
  location.reload();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

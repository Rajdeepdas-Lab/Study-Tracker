/* WBBSE Class 9 Study Tracker – service worker (reminders & background alerts) */
const KV = "wbbse9-sw";
const db = () => new Promise((res, rej) => { const r = indexedDB.open(KV, 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function get(k) { try { const d = await db(); return await new Promise(res => { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(); }); } catch (e) {} }
async function put(k, v) { try { const d = await db(); await new Promise(res => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (e) {} }
const hm = d => ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);

// Shows the reminder if it is due, enabled, not shown yet today and sessions are still pending.
async function check() {
  const c = await get("cfg");
  if (!c || !c.on) return;
  const n = new Date(), key = n.toDateString();
  if (hm(n) < c.t || c.last === key || c.notified === key) return;
  if (c.day === key && c.pending === 0) return;
  const body = c.day === key
    ? c.pending + " study session" + (c.pending === 1 ? "" : "s") + " still pending today."
    : "Time for today’s study session – open your tracker.";
  await self.registration.showNotification("Study reminder", { body, tag: "study-reminder", icon: "icon-192.png", badge: "icon-192.png", data: { url: self.registration.scope } });
  c.notified = key;
  await put("cfg", c);
}

let tm;
function arm(c) {
  clearTimeout(tm);
  if (!c || !c.on) return;
  const p = c.t.split(":"), n = new Date(), d = new Date(n.getFullYear(), n.getMonth(), n.getDate(), +p[0], +p[1], 0);
  if (d <= n) d.setDate(d.getDate() + 1);
  tm = setTimeout(check, d - n + 1000); // best effort: only runs while the worker is still alive
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// Page → worker: reminder settings and today's pending count
self.addEventListener("message", e => {
  const m = e.data;
  if (!m || m.type !== "cfg") return;
  e.waitUntil((async () => {
    const prev = await get("cfg"), key = new Date().toDateString();
    const c = { on: m.on ? 1 : 0, t: /^\d\d:\d\d$/.test(m.t) ? m.t : "18:00", pending: +m.pending || 0, day: m.day, last: m.last || "" };
    c.notified = prev && prev.t === c.t && prev.notified === key ? key : "";
    await put("cfg", c);
    arm(c);
  })());
});

// Chrome installed-app periodic background sync (approximate timing, decided by the browser)
self.addEventListener("periodicsync", e => { if (e.tag === "study-reminder") e.waitUntil(check()); });

// Optional: a push server can send { "title": "...", "body": "..." } to show an exact-time alert
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Study reminder", { body: d.body || "Time to study!", tag: "study-reminder", icon: "icon-192.png", data: { url: self.registration.scope } }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || "./");
  }));
});

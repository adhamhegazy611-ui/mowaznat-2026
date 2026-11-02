/* دخول مباشر من البوابة: الجلسة جاية في الرابط، بناخدها ونمسحها من شريط العنوان قبل أي حاجة */
let SSO = (() => { try { const h = new URLSearchParams(location.hash.slice(1)), a = h.get("access_token"), r = h.get("refresh_token");
  if (a && r) { history.replaceState(null, "", location.pathname + location.search); return {access_token: a, refresh_token: r}; } } catch (e) {} return null; })();

const SB = "https://ceqbfxmeziwzjopbckqk.supabase.co";
const KEY = "sb_publishable_UCwjZzeOG4MXMW3cU4RFFg_cvVhYMde";
/* حسابات المنظومة (نفس حسابات المقايسات والموازنات) */
const MZ_URL = "https://qadrtqtydtgzachfzpqw.supabase.co";
const MZ_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZHJ0cXR5ZHRnemFjaGZ6cHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTI5MTksImV4cCI6MjEwODA4ODkxOX0.zngPkaxJKin9rmzABnDfmkU8-OkXAAGZ8zTwae4-fkw";
const MZ_DOM = "@mo2ysaat.app";
const DAYS = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const D = s => new Date(s + "T00:00:00");
const iso = d => { const z = n => String(n).padStart(2,"0"); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; };
const addD = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
const fmt = s => { const x = D(s); return DAYS[x.getDay()] + " " + x.toLocaleDateString("ar-EG",{day:"numeric",month:"long",year:"numeric"}); };
const fmtS = s => D(s).toLocaleDateString("ar-EG",{day:"numeric",month:"short",year:"numeric"});

async function rpc(fn, args = {}) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {method:"POST", headers:{apikey:KEY, Authorization:`Bearer ${KEY}`, "Content-Type":"application/json"}, body:JSON.stringify(args)});
  if (!r.ok) throw new Error((await r.text()) || r.status);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function rest(path) { const r = await fetch(`${SB}/rest/v1/${path}`, {headers:{apikey:KEY, Authorization:`Bearer ${KEY}`}}); return r.json(); }
const showMsg = (el, ok, txt) => el.innerHTML = `<div class="msg ${ok?"ok":"bad"}">${esc(txt)}</div>`;

/* ================= PUBLIC ================= */
let entities = [], CAL = null, SEL = null, ENT = null, MONTH = null; // MONTH = Date of 1st
const WK = ["سبت","أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة"];
$("pHead").innerHTML = WK.map(n => `<div class="wkh">${n}</div>`).join("");

async function loadStatus() {
  if (!MONTH) { const f = await rpc("get_days", {p_from: null, p_to: null}); const d = D(f.first); MONTH = new Date(d.getFullYear(), d.getMonth(), 1); }
  const first = iso(MONTH), last = iso(new Date(MONTH.getFullYear(), MONTH.getMonth() + 1, 0));
  CAL = await rpc("get_days", {p_from: first, p_to: last});
  const max = CAL.max, map = Object.fromEntries((CAL.days || []).map(d => [d.date, d]));
  $("mTitle").textContent = MONTH.toLocaleDateString("ar-EG",{month:"long",year:"numeric"});
  const fm = D(CAL.first), um = D(CAL.until);
  $("mPrev").disabled = MONTH.getFullYear() * 12 + MONTH.getMonth() <= fm.getFullYear() * 12 + fm.getMonth();
  $("mNext").disabled = MONTH.getFullYear() * 12 + MONTH.getMonth() >= um.getFullYear() * 12 + um.getMonth();
  $("untilNote").textContent = "الحجز متاح لحد " + D(CAL.until).toLocaleDateString("ar-EG",{day:"numeric",month:"long",year:"numeric"});
  const lead = (MONTH.getDay() + 1) % 7, nDays = new Date(MONTH.getFullYear(), MONTH.getMonth() + 1, 0).getDate();
  let h = ""; for (let i = 0; i < lead; i++) h += `<div class="day blank"></div>`;
  for (let i = 1; i <= nDays; i++) {
    const ds = iso(new Date(MONTH.getFullYear(), MONTH.getMonth(), i)), d = map[ds], num = (i).toLocaleString("ar-EG");
    if (!d) { h += `<button class="day past" disabled><div class="dd">${num}</div></button>`; continue; }
    const full = d.count >= max;
    if (d.closed) { h += `<button class="day off" disabled title="إجازة"><div class="dd">${num}</div><div class="lbl">إجازة</div></button>`; continue; }
    let cap = ""; for (let k = 0; k < max; k++) cap += `<s class="${k < d.count ? "t" : ""}"></s>`;
    h += `<button class="day ${full?"full":""} ${SEL===ds?"sel":""}" ${full?"disabled":""} onclick="pickDay('${ds}')" title="${fmt(ds)}${full?" — مكتمل":""}"><div class="dd">${num}</div><div class="cap">${cap}</div></button>`;
  }
  $("pDays").innerHTML = h;
  if (SEL && map[SEL] && (map[SEL].count >= max)) SEL = null;
  renderSel();
}
$("mPrev").onclick = () => { MONTH = new Date(MONTH.getFullYear(), MONTH.getMonth() - 1, 1); loadStatus(); };
$("mNext").onclick = () => { MONTH = new Date(MONTH.getFullYear(), MONTH.getMonth() + 1, 1); loadStatus(); };
let SELDATA = null;
function pickDay(ds) {
  SEL = ds; $("fMsg").innerHTML = "";
  loadStatus().then(() => { if (innerWidth < 900) $("formBody").scrollIntoView({behavior:"smooth", block:"start"}); });
}
function renderSel() {
  const d = SEL && (CAL.days || []).find(x => x.date === SEL);
  if (d) SELDATA = d;
  $("formEmpty").classList.toggle("hidden", !!SEL);
  $("formBody").classList.toggle("hidden", !SEL);
  if (!SEL || !SELDATA) return;
  const max = CAL.max, x = D(SEL);
  $("sMon").textContent = x.toLocaleDateString("ar-EG",{month:"short"});
  $("sDay").textContent = x.toLocaleDateString("ar-EG",{day:"numeric"});
  $("pDate").textContent = fmt(SEL);
  $("pBooked").textContent = SELDATA.count ? `محجوز: ${SELDATA.booked.join("، ")} — متاح ${max - SELDATA.count}` : `متاح ${max} أماكن`;
}

function renderEntList() {
  const q = $("fSearch").value.trim();
  const list = q ? entities.filter(e => e.name.includes(q)) : entities;
  $("fList").innerHTML = list.length ? list.map(e => `<div class="opt" data-id="${e.id}">${esc(e.name)}</div>`).join("")
    : `<div class="opt none">${entities.length ? "مفيش جهة بالاسم ده" : "لسه مفيش جهات مسجلة"}</div>`;
}
function openList(o) { $("fList").classList.toggle("hidden", !o); $("entPick").classList.toggle("open", o); }
$("fSearch").onfocus = () => { renderEntList(); openList(true); };
$("fSearch").oninput = () => { renderEntList(); openList(true); };
$("fSearch").onblur = () => setTimeout(() => openList(false), 150);
$("fList").onmousedown = e => { const o = e.target.closest(".opt[data-id]"); if (!o) return; e.preventDefault(); setEnt(entities.find(x => x.id === o.dataset.id)); };
function setEnt(e) {
  ENT = e || null;
  $("entPick").classList.toggle("hidden", !!ENT); $("entChosen").classList.toggle("hidden", !ENT);
  if (ENT) { $("entName").textContent = ENT.name; openList(false); } else $("fSearch").value = "";
}
$("entChange").onclick = () => { setEnt(null); $("fSearch").focus(); };
async function loadEntities() { entities = await rest("entities?select=id,name&order=name"); }

$("fBtn").onclick = async () => {
  const proj = $("fProj").value.trim(), rev = $("fRev").value.trim();
  if (!SEL) return showMsg($("fMsg"), false, "اختار اليوم الأول");
  if (!ENT) return showMsg($("fMsg"), false, "اختار الجهة من القائمة");
  if (!proj) return showMsg($("fMsg"), false, "اكتب اسم المشروع");
  if (!rev) return showMsg($("fMsg"), false, "اكتب المطلوب مراجعته");
  $("fBtn").disabled = true;
  try {
    const r = await rpc("book", {p_entity: ENT.id, p_date: SEL, p_project: proj, p_review: rev, p_missing: $("fMiss").value});
    if (r.ok) { ["fProj","fRev","fMiss"].forEach(i => $(i).value = ""); setEnt(null); }
    await loadStatus();
    if (!SEL && r.ok) $("formEmpty").innerHTML = `<div class="msg ok" style="margin:0 0 14px">${esc(r.msg)}</div>تقدر تختار يوم تاني لجهة تانية.`;
    else showMsg($("fMsg"), r.ok, r.msg);
  } catch (e) { showMsg($("fMsg"), false, "حصلت مشكلة، حاول تاني"); }
  $("fBtn").disabled = false;
};

/* ================= ADMIN ================= */
/* الدخول بحسابات المنظومة؛ PIN هنا هو توكن الجلسة، وقاعدة البيانات بتتأكد إن صاحبه «مسؤول» */
let AUTH_STORE; try { sessionStorage.setItem("_t","1"); sessionStorage.removeItem("_t"); AUTH_STORE = sessionStorage; } catch (e) { AUTH_STORE = undefined; }
let sbA = null;
try { sbA = supabase.createClient(MZ_URL, MZ_KEY, {auth:{storage:AUTH_STORE, persistSession:!!AUTH_STORE, autoRefreshToken:true, detectSessionInUrl:false, storageKey:"hagz-admin-auth"}}); } catch (e) {}
let PIN = null, ADM = null, LOGGING = null;
if (sbA) sbA.auth.onAuthStateChange((_ev, s) => { PIN = s ? s.access_token : null; });

async function authToken() {
  if (!sbA) return null;
  if (SSO) { const t = SSO; SSO = null; try { await sbA.auth.setSession(t); } catch (e) {} }
  const { data } = await sbA.auth.getSession();
  PIN = data.session ? data.session.access_token : null;
  return PIN;
}
function showPanel(on) { $("aLogin").classList.toggle("hidden", on); $("aPanel").classList.toggle("hidden", !on); }

async function tryLogin() {
  const tok = await authToken();
  if (!tok) return "none";
  const r = await rpc("admin_login", {p_pin: tok});
  if (!r.ok) return "denied";
  ADM = r; showPanel(true);
  $("aToday").textContent = "النهارده: " + fmt(r.today);
  $("sUntil").value = r.until;
  $("sDays").innerHTML = DAYS.map((d,i) => `<label><input type="checkbox" value="${i}" ${r.closed_days.includes(i)?"checked":""}>${d}</label>`).join("");
  $("rFrom").value = addD(r.today, -90); $("rTo").value = addD(r.today, -1);
  setQuick("up"); loadAdminEntities(); loadStats();
  return "ok";
}
function autoLogin() {
  if (!LOGGING) LOGGING = tryLogin().catch(() => "error").finally(() => { LOGGING = null; });
  return LOGGING;
}
$("aLoginBtn").onclick = async () => {
  const u = $("aUser").value.trim().toLowerCase(), p = $("aPass").value;
  if (!u || !p) return showMsg($("aLoginMsg"), false, "اكتب اسم المستخدم وكلمة المرور");
  if (!sbA) return showMsg($("aLoginMsg"), false, "تعذّر الاتصال، حدّث الصفحة وجرّب تاني");
  $("aLoginBtn").disabled = true; $("aLoginMsg").innerHTML = "";
  try {
    const { error } = await sbA.auth.signInWithPassword({email: u + MZ_DOM, password: p});
    if (error) showMsg($("aLoginMsg"), false, "اسم المستخدم أو كلمة المرور غلط");
    else {
      const st = await tryLogin();
      if (st === "denied") { await sbA.auth.signOut(); showMsg($("aLoginMsg"), false, "الحساب ده مش «مسؤول» — لوحة الإدارة للمسؤولين بس"); }
      else if (st !== "ok") showMsg($("aLoginMsg"), false, "حصلت مشكلة، حاول تاني");
      else $("aPass").value = "";
    }
  } catch (e) { showMsg($("aLoginMsg"), false, "حصلت مشكلة، حاول تاني"); }
  $("aLoginBtn").disabled = false;
};
$("aUser").onkeydown = e => { if (e.key === "Enter") $("aPass").focus(); };
$("aPass").onkeydown = e => { if (e.key === "Enter") $("aLoginBtn").click(); };
$("aOut").onclick = async () => { try { await sbA.auth.signOut(); } catch (e) {} PIN = null; ADM = null; showPanel(false); $("aPass").value = ""; };
document.querySelectorAll(".tabs button[data-t]").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tabs button[data-t]").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll("[data-p]").forEach(p => p.classList.toggle("hidden", p.dataset.p !== b.dataset.t));
  if (b.dataset.t === "ar") loadArchive();
});

const ST = {booked:["منتظر","pend"], attended:["حضر","ok"], no_show:["غاب","bad"]};
const stOf = b => (b.status === "booked" && b.booking_date < ADM.today) ? ["غاب (بدون تسجيل)","bad"] : ST[b.status];
function rowHtml(b) {
  const st = stOf(b), x = D(b.booking_date);
  return `<tr>
    <td class="dt" data-l="التاريخ"><b>${fmtS(b.booking_date)}</b><span>${DAYS[x.getDay()]}</span></td>
    <td data-l="الجهة"><b style="font-weight:600">${esc(b.entity_name)}</b></td>
    <td data-l="المشروع">${esc(b.project_name)}</td>
    <td data-l="المطلوب مراجعته"><div class="pre">${esc(b.review_items)}</div></td>
    <td data-l="النواقص">${b.missing_items ? `<div class="miss">${esc(b.missing_items)}</div>` : `<span class="none">لا يوجد</span>`}</td>
    <td data-l="الحالة"><span class="tag ${st[1]}">${st[0]}</span></td>
    <td><div class="acts">
      ${b.status !== "attended" ? `<button class="btn xs okb" onclick="setSt('${b.id}','attended')">حضر</button>` : ""}
      ${b.status !== "no_show" ? `<button class="btn xs badb" onclick="setSt('${b.id}','no_show')">غاب</button>` : ""}
      ${b.status !== "booked" ? `<button class="btn xs ghost" onclick="setSt('${b.id}','booked')">تراجع</button>` : ""}
      <button class="btn xs ghost" onclick="delBk('${b.id}')">حذف</button>
    </div></td></tr>`;
}
const emptyRow = t => `<tr><td colspan="7" class="none" style="text-align:center;padding:34px">${t}</td></tr>`;

let QUICK = "up";
function setQuick(q) {
  QUICK = q; document.querySelectorAll("#quick button").forEach(b => b.classList.toggle("on", b.dataset.q === q));
  loadBookings();
}
document.querySelectorAll("#quick button").forEach(b => b.onclick = () => setQuick(b.dataset.q));
async function loadBookings() {
  const t = ADM.today;
  const r = {today:[t,t], week:[t, addD(t, 6 - ((D(t).getDay() + 1) % 7))], up:[t, ADM.until]}[QUICK];
  const list = (await rpc("admin_bookings", {p_pin: PIN, p_from: r[0], p_to: r[1]})).reverse();
  $("bCount").textContent = `${list.length} حجز`;
  $("bList").innerHTML = list.length ? list.map(rowHtml).join("") : emptyRow("مفيش حجوزات");
}

let ARCH = [], RST = "";
async function loadArchive() {
  ARCH = await rpc("admin_bookings", {p_pin: PIN, p_from: $("rFrom").value || "2000-01-01", p_to: $("rTo").value || addD(ADM.today, -1)});
  renderArchive();
}
function archFiltered() {
  const q = $("rQ").value.trim();
  return ARCH.filter(b => (!q || b.entity_name.includes(q) || b.project_name.includes(q)) &&
    (!RST || (RST === "attended" ? b.status === "attended" : b.status !== "attended")));
}
function renderArchive() {
  const l = archFiltered();
  const att = l.filter(b => b.status === "attended").length;
  $("rCount").textContent = `${l.length} حجز — حضر ${att} / غاب ${l.length - att}`;
  $("rList").innerHTML = l.length ? l.map(rowHtml).join("") : emptyRow("مفيش حجوزات في الأرشيف بالفلتر ده");
}
$("rFrom").onchange = $("rTo").onchange = loadArchive;
$("rQ").oninput = renderArchive;
document.querySelectorAll("#rSt button").forEach(b => b.onclick = () => {
  RST = b.dataset.s; document.querySelectorAll("#rSt button").forEach(x => x.classList.toggle("on", x === b)); renderArchive();
});
$("rCsv").onclick = () => {
  const rows = [["التاريخ","اليوم","الجهة","المشروع","المطلوب مراجعته","النواقص","الحالة"]].concat(
    archFiltered().map(b => [b.booking_date, DAYS[D(b.booking_date).getDay()], b.entity_name, b.project_name, b.review_items, b.missing_items || "", stOf(b)[0]]));
  const csv = "﻿" + rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
  a.download = `ارشيف-الحجوزات-${$("rFrom").value}-${$("rTo").value}.csv`; a.click();
};

async function loadStats() {
  const t = ADM.today;
  const all = await rpc("admin_bookings", {p_pin: PIN, p_from: addD(t,-30), p_to: ADM.until});
  const today = all.filter(b => b.booking_date === t);
  $("stToday").textContent = today.length;
  $("stTodayN").textContent = today.map(b => b.entity_name).join("، ") || "مفيش";
  $("stUp").textContent = all.filter(b => b.booking_date > t).length;
  $("stMiss").textContent = all.filter(b => b.booking_date < t && b.status !== "attended").length;
}
function reloadAll() { loadBookings(); loadStats(); if (!document.querySelector('[data-p="ar"]').classList.contains("hidden")) loadArchive(); }
async function setSt(id, s) { await rpc("admin_set_status", {p_pin: PIN, p_id: id, p_status: s}); reloadAll(); loadAdminEntities(); }
async function delBk(id) { if (!confirm("حذف الحجز ده نهائياً؟")) return; await rpc("admin_delete_booking", {p_pin: PIN, p_id: id}); reloadAll(); }

let aEnts = [];
async function loadAdminEntities() { aEnts = await rpc("admin_entities", {p_pin: PIN}); renderAdminEnts(); }
function renderAdminEnts() {
  const q = $("eSearch").value.trim(), l = q ? aEnts.filter(e => e.name.includes(q)) : aEnts;
  const act = aEnts.filter(e => e.active).length;
  $("eCount").textContent = `(${act} ظاهرة من ${aEnts.length})`;
  $("stEnt").textContent = act; $("stEntN").textContent = aEnts.length - act ? `${aEnts.length - act} مخفية` : "كلها ظاهرة في الحجز";
  $("eList").innerHTML = l.map(e => `<div class="erow ${e.active?"":"off"}"><div class="n"><b>${esc(e.name)}</b>
      ${e.last_miss ? `<small>آخر غياب: ${fmt(e.last_miss)}</small>` : ""}</div>
      <button class="btn xs ghost" onclick="renEnt('${e.id}')">تعديل</button>
      <button class="btn xs ${e.active?"badb":"okb"}" onclick="togEnt('${e.id}',${!e.active})">${e.active?"إخفاء":"إظهار"}</button></div>`).join("")
    || `<div class="empty">لسه مفيش جهات — ضيفها من الخانة اللي جنبك</div>`;
}
$("eSearch").oninput = renderAdminEnts;
$("eAdd").onclick = async () => {
  const names = $("eNew").value.split("\n").map(s => s.trim()).filter(Boolean);
  if (!names.length) return;
  await rpc("admin_add_entities", {p_pin: PIN, p_names: names}); $("eNew").value = "";
  showMsg($("eMsg"), true, `اتضاف ${names.length} جهة`); loadAdminEntities(); loadEntities();
};
async function togEnt(id, a) { await rpc("admin_set_entity", {p_pin: PIN, p_id: id, p_active: a}); loadAdminEntities(); loadEntities(); }
async function renEnt(id) {
  const e = aEnts.find(x => x.id === id), n = prompt("الاسم الجديد:", e.name);
  if (n && n.trim()) { try { await rpc("admin_rename_entity", {p_pin: PIN, p_id: id, p_name: n}); } catch(x) { alert("الاسم ده موجود قبل كده"); } loadAdminEntities(); loadEntities(); }
}
$("sSave").onclick = async () => {
  const days = [...document.querySelectorAll("#sDays input:checked")].map(i => +i.value);
  await rpc("admin_settings", {p_pin: PIN, p_closed: days, p_new_pin: null, p_until: $("sUntil").value || null});
  if ($("sUntil").value) ADM.until = $("sUntil").value;
  showMsg($("sMsg"), true, "اتحفظت الإعدادات"); MONTH = null; loadStatus(); reloadAll();
};

/* ================= ROUTING ================= */
function route() {
  const admin = location.hash === "#admin";
  $("pub").classList.toggle("hidden", admin); $("adm").classList.toggle("hidden", !admin);
  $("navlink").textContent = admin ? "صفحة الحجز" : "لوحة الإدارة";
  $("navlink").href = admin ? "#" : "#admin";
  if (admin && !ADM) autoLogin();
}
window.onhashchange = route; route();
if (SSO) authToken();
loadStatus(); loadEntities();

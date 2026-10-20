import * as W from './workflow.js';
import * as S from './store.js';
import { icon, illo, brandMark } from './icons.js';

// ================= ابزارها =================
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fa = s => String(s ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const nf = new Intl.NumberFormat('fa-IR');
const money = n => nf.format(Math.round(+n || 0)) + ' ریال';
const fdate = iso => iso ? fa(W.jalaliString(iso)) : '—';
const ftime = iso => { const d = new Date(iso); return fa(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')); };
const fdt = iso => iso ? `${fdate(iso)} — ${ftime(iso)}` : '—';
const num = v => +W.normalizeDigits(String(v ?? '').replace(/[,،٬\s]/g, '')) || 0;
const sget = k => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sset = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* اختیاری */ } };
const lget = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lset = (k, v) => { try { localStorage.setItem(k, v); } catch { /* اختیاری */ } };

const st = { user: null, view: 'login', p: {}, open: new Set(['claim']), q: '', claimId: null };
let db;

const userById = id => db.users.find(u => u.id === id);
const claimById = id => db.claims.find(c => c.id === id);
function persist() { S.save(); }

function visibleClaims(u = st.user) {
  if (!u) return [];
  if (u.role === 'subscriber') return db.claims.filter(c => c.subscriberId === u.id);
  if (u.role === 'insurer') return db.claims.filter(c => c.forwardedAt);
  return db.claims;
}
function currentClaim() {
  const mine = visibleClaims();
  return mine.find(c => c.id === st.claimId) || mine.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}
function badge(c) { const s = W.STATUS[c.status]; return `<span class="badge ${s.tone}">${esc(s.short)}</span>`; }
function slaBadge(c) {
  const s = W.slaInfo(c, db.settings);
  if (!s) return '';
  return s.overdue ? `<span class="badge sla over">${icon('clock')} ${fa(s.used - s.limit)} روز تأخیر</span>`
    : `<span class="badge sla">${icon('clock')} ${fa(s.left)} روز مانده</span>`;
}
function unreadNotifs() {
  const u = st.user; if (!u) return [];
  return db.notifications.filter(n => (n.toUser === u.id || n.toRole === u.role) && !n.readBy.includes(u.id));
}
function myNotifs() { const u = st.user; return db.notifications.filter(n => n.toUser === u.id || n.toRole === u.role); }
function visibleMsgs(c) { return c.messages.filter(m => !(m.internal && st.user.role === 'subscriber')); }
function unreadMsgs(c) {
  const r = (db.reads[st.user.id] || {})[c.id] || '';
  return visibleMsgs(c).filter(m => m.byId !== st.user.id && m.at > r).length;
}
function totalUnreadMsgs() { return visibleClaims().reduce((a, c) => a + unreadMsgs(c), 0); }
function markRead(c) { (db.reads[st.user.id] ||= {})[c.id] = new Date().toISOString(); persist(); }

// ================= ناوبری و رندر =================
function go(view, p = {}) {
  st.view = view; st.p = p;
  if (p.id) st.claimId = p.id;
  sset('gii.view', JSON.stringify({ view, p }));
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  const app = $('#app');
  if (!st.user) { app.innerHTML = viewLogin(); return; }
  if (st.user.mustChangePassword) { app.innerHTML = topbar() + `<main class="page narrow">${viewForcePassword()}</main>`; return; }
  const v = VIEWS[st.user.role][st.view] || VIEWS[st.user.role].home;
  app.innerHTML = topbar() + `<main class="page ${st.user.role === 'subscriber' ? 'narrow' : ''}">${v()}</main>` + bottomNav();
  hydrateFiles(app);
  const tab = $('.tab.on');
  if (tab) { const y = window.scrollY; tab.scrollIntoView({ block: 'nearest', inline: 'center' }); window.scrollTo({ top: y }); }
}

function topbar() {
  const n = unreadNotifs().length;
  return `<header class="topbar"><div class="topbar-in">
    <button class="sq-btn" data-act="help" aria-label="راهنما و پرسش‌های متداول">${icon('help')}</button>
    <div class="brand">${brandMark(42)}<div><b>بیمه حوادث گاز</b><small>${esc(W.ROLES[st.user?.role] || 'سامانه پرونده خسارت')}</small></div></div>
    <button class="sq-btn" data-act="notifs" aria-label="اعلان‌ها">${icon('bell')}${n ? `<span class="dot">${fa(n)}</span>` : ''}</button>
  </div></header>`;
}

function bottomNav() {
  const r = st.user.role;
  const unread = totalUnreadMsgs();
  const homeViews = ['home', 'sections', 'sec', 'track', 'register', 'registered', 'review', 'list', 'users', 'settings', 'reports', 'sms'];
  const items = [
    { id: 'home', label: 'خانه', ic: 'home', on: homeViews.includes(st.view) },
    ...(r !== 'subscriber' ? [{ id: 'list', label: 'پرونده‌ها', ic: 'inbox', on: st.view === 'list', hideSm: true }] : []),
    { id: 'messenger', label: 'پیام‌رسان', ic: 'send', on: ['inbox', 'thread'].includes(st.view), dot: unread },
    { id: 'profile', label: 'پروفایل', ic: 'user', on: false },
  ];
  return `<nav class="bottomnav" aria-label="ناوبری اصلی"><div class="bottomnav-in">${items.map(i => `
    <button class="nav-btn ${i.on ? 'on' : ''} ${i.hideSm ? 'hide-sm' : ''}" data-nav="${i.id}" ${i.on ? 'aria-current="page"' : ''}>
      ${icon(i.ic)}<span class="lbl">${i.label}</span>${i.dot ? `<span class="dot">${fa(i.dot)}</span>` : ''}
    </button>`).join('')}</div></nav>`;
}

function pageTitle(title, sub = '', back = 'home', backP = {}) {
  return `<div class="page-title"><button class="back" data-go="${back}" data-p='${esc(JSON.stringify(backP))}' aria-label="بازگشت">${icon('chevR')}</button>
    <div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}

function tile({ go: g, p = {}, act, color = '', art, a, b, title, sub, btn = 'شروع', count, compact }) {
  const attrs = act ? `data-act="${act}"` : `data-go="${g}" data-p='${esc(JSON.stringify(p))}'`;
  return `<button class="tile ${color} ${compact ? 'compact' : ''}" ${attrs}>
    ${count ? `<span class="count">${fa(count)}</span>` : ''}
    <div class="tile-art">${illo(art, a, b)}</div>
    <div class="tile-body"><span class="tile-title">${title}</span><span class="tile-sub">${sub}</span><span class="tile-btn">${btn}</span></div>
  </button>`;
}

function ocard(key, ic, k, v, body) {
  const open = st.open.has(key);
  return `<div class="ocard ${open ? 'open' : ''}">
    <button class="ocard-head" data-act="toggle" data-key="${key}" aria-expanded="${open}">${icon(ic)}<span class="k">${k}</span><span class="v">${v}</span>${icon('chevD', 'chev')}</button>
    ${open ? `<div class="ocard-body">${body}</div>` : ''}
  </div>`;
}
const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;

function stepper(c) {
  if (c.status === 'rejected') return `<div class="note bad">${icon('x')}<div><b>پرونده رد شد</b>${esc(c.rejectReason || '')}</div></div>`;
  const cur = W.STATUS[c.status].step;
  return `<div class="stepper" role="list">${W.STEPS.map((s, i) => {
    const n = i + 1; const done = n < cur || c.status === 'paid'; const isCur = n === cur && c.status !== 'paid';
    return `<div class="step ${done ? 'done' : ''} ${isCur ? 'cur' : ''}" role="listitem"><span class="b">${done ? icon('check') : fa(n)}</span>${s}</div>`;
  }).join('')}</div>`;
}

function toast(msg, bad = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ================= برگه کشویی =================
function openSheet(html) {
  closeSheet();
  const root = document.createElement('div');
  root.id = 'sheet';
  root.innerHTML = `<div class="sheet-scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in"><div class="grab"></div>${html}</div></div>`;
  document.body.appendChild(root);
  hydrateFiles(root);
  const f = root.querySelector('textarea, input:not([type=hidden])');
  if (f) setTimeout(() => f.focus(), 50);
}
function closeSheet() { const s = $('#sheet'); if (s) s.remove(); }

// ================= فایل‌ها =================
const urlCache = new Map();
async function hydrateFiles(root) {
  for (const img of root.querySelectorAll('img[data-file]')) {
    const id = img.dataset.file;
    if (!urlCache.has(id)) {
      const blob = await S.getFile(id);
      if (!blob) { img.alt = 'فایل در این دستگاه موجود نیست'; continue; }
      urlCache.set(id, URL.createObjectURL(blob));
    }
    img.src = urlCache.get(id);
  }
}
function thumb(c, id, removable) {
  const f = c.files[id] || { name: 'فایل', type: '' };
  const isImg = f.type.startsWith('image/');
  return `<div class="thumb"><button class="link" style="all:unset;cursor:pointer;display:block;width:100%;height:100%" data-act="viewFile" data-file="${id}" data-claim="${c.id}" aria-label="نمایش ${esc(f.name)}">
    ${isImg ? `<img data-file="${id}" alt="${esc(f.name)}">` : `<div class="pdf">${icon('doc')}${esc(f.name)}</div>`}</button>
    ${removable ? `<button class="rm" data-act="rmFile" data-file="${id}" aria-label="حذف">${icon('trash')}</button>` : ''}</div>`;
}
function addFileBtn(target, label = 'افزودن', accept = 'image/*,application/pdf') {
  return `<label class="add-file">${icon('upload')}<span>${label}</span><input type="file" multiple accept="${accept}" data-upload="${target}"></label>`;
}

async function handleUpload(input) {
  const c = currentClaim();
  const target = input.dataset.upload;
  const files = [...input.files];
  if (!files.length) return;
  let added = 0;
  for (const file of files) {
    if (!/^image\/|application\/pdf/.test(file.type)) { toast(`«${file.name}» پذیرفته نشد؛ فقط عکس یا PDF.`, true); continue; }
    if (file.size > 15 * 1024 * 1024) { toast(`«${file.name}» بیش از ۱۵ مگابایت است.`, true); continue; }
    const blob = await S.compressImage(file);
    const id = S.uid('f');
    await S.putFile(id, blob);
    c.files[id] = { name: file.name, type: blob.type || file.type, size: blob.size, at: new Date().toISOString(), by: st.user.role };
    if (target === 'photos') c.photos.push(id);
    else (c.docs[target] ||= []).push(id);
    added++;
  }
  persist();
  if (added) toast(`${fa(added)} فایل بارگذاری شد.`);
  render();
}

// ================= ورود =================
const DEMO = [
  { u: '1023456789', p: '123456', t: 'مشترک — پرونده دارای نقص', s: 'حمید رضایی', ic: 'alert' },
  { u: '1045678912', p: '123456', t: 'مشترک — منتظر تأیید مبلغ', s: 'مریم احمدی', ic: 'money' },
  { u: '1067891234', p: '123456', t: 'مشترک — ورود اول با رمز موقت', s: 'رضا کریمی', ic: 'key' },
  { u: 'gas', p: 'gas123', t: 'کارشناس شرکت گاز', s: 'سارا کاظمی', ic: 'flame' },
  { u: 'bime', p: 'bime123', t: 'کارشناس بیمه‌گر', s: 'علی محمدی', ic: 'shield' },
  { u: 'admin', p: 'admin123', t: 'مدیر سامانه', s: 'کاربران، تنظیمات و گزارش', ic: 'settings' },
];
function viewLogin() {
  return `<div class="login-hero"><div class="login-hero-in">${brandMark(64)}
      <h1>بیمه حوادث مشترکین گاز</h1>
      <p>ثبت، تکمیل و پیگیری پرونده خسارت حوادث ناشی از گاز طبیعی؛ از مشترک تا شرکت گاز و بیمه‌گر.</p></div></div>
    <main class="page narrow login-card">
      <form class="form" data-form="login" autocomplete="on">
        <label class="fld"><span>نام کاربری</span><input id="lg-user" name="username" type="text" class="ltr" autocomplete="username" required placeholder="برای مشترکین: شماره اشتراک گاز"></label>
        <label class="fld"><span>رمز عبور</span><input id="lg-pass" name="password" type="password" class="ltr" autocomplete="current-password" required></label>
        <button class="btn" type="submit">${icon('lock')} ورود به سامانه</button>
        <div class="note info">${icon('help')}<div>حساب مشترک را شرکت گاز پس از مراجعه حضوری شما می‌سازد و نام کاربری و رمز موقت را پیامک می‌کند.</div></div>
      </form>
      <div class="flow">
        <div>${icon('upload')}<b>مشترک</b>بارگذاری مدارک</div>
        <div>${icon('flame')}<b>شرکت گاز</b>بررسی و تأیید</div>
        <div>${icon('money')}<b>بیمه‌گر</b>ارزیابی و پرداخت</div>
      </div>
      <div class="section-label">حساب‌های نمایشی</div>
      <div class="rows">${DEMO.map((d, i) => `<button class="row" data-act="demoLogin" data-i="${i}">${icon(d.ic)}<span class="main"><span class="t">${d.t}</span><span class="s">${d.s}</span></span>${icon('chevL', 'chev')}</button>`).join('')}</div>
      <p class="demo-tag">همه اشخاص، پرونده‌ها و مبالغ نسخه نمایشی ساختگی‌اند و فقط در همین مرورگر ذخیره می‌شوند.</p>
    </main>`;
}
async function doLogin(username, password) {
  const uname = W.normalizeDigits(username).trim();
  const u = db.users.find(x => x.username.toLowerCase() === uname.toLowerCase());
  if (!u || u.pwHash !== await S.hashPw(u.username, password)) { toast('نام کاربری یا رمز عبور نادرست است.', true); return; }
  if (!u.active) { toast('این حساب غیرفعال شده است. با شرکت گاز تماس بگیرید.', true); return; }
  st.user = u; st.claimId = null; sset('gii.user', u.id);
  u.lastLoginAt = new Date().toISOString(); persist();
  go('home');
}

function viewForcePassword() {
  return `<div class="page-title"><div><h1>تعیین رمز عبور جدید</h1><div class="sub">${esc(st.user.name)} — ورود اول با رمز موقت</div></div></div>
    <form class="form" data-form="newpw">
      <div class="note info">${icon('lock')}<div>برای امنیت پرونده، رمز موقتی را که شرکت گاز پیامک کرده با رمز دلخواه خود عوض کنید.</div></div>
      <label class="fld"><span>رمز جدید</span><input id="np1" name="p1" type="password" class="ltr" minlength="6" required autocomplete="new-password"><small>دست‌کم ۶ نویسه</small></label>
      <label class="fld"><span>تکرار رمز جدید</span><input id="np2" name="p2" type="password" class="ltr" minlength="6" required autocomplete="new-password"></label>
      <div class="btns"><button class="btn green" type="submit">ذخیره و ادامه</button><button class="btn ghost" type="button" data-act="logout">خروج</button></div>
    </form>`;
}

// ================= مشترک =================
const SECTIONS = [
  { id: 'incident', title: 'اطلاعات حادثه', ic: 'flame', key: 'incident' },
  { id: 'damage', title: 'خسارت‌ها و آسیب‌دیدگان', ic: 'list', key: 'damage' },
  { id: 'photos', title: 'تصاویر محل حادثه', ic: 'camera', key: 'photos' },
  { id: 'docs', title: 'مدارک', ic: 'doc', key: 'docs' },
  { id: 'bank', title: 'اطلاعات حساب بانکی', ic: 'bank', key: 'bank' },
  { id: 'submit', title: 'بازبینی و ارسال پرونده', ic: 'send', key: 'declare' },
];
const editable = c => st.user.role === 'subscriber' && ['draft', 'returned'].includes(c.status);
const defectsFor = (c, target) => c.deficiencies.filter(d => d.status === 'open' && (d.target === target || (target === 'section:docs' && d.target.startsWith('doc:'))));

function subHome() {
  const c = currentClaim();
  if (!c) return `<div class="empty">${illo('inbox')}<b>هنوز پرونده‌ای برای شما ثبت نشده است.</b><span>پس از مراجعه به شرکت گاز، پرونده در اینجا نمایش داده می‌شود.</span></div>`;
  const u = st.user;
  const status = W.STATUS[c.status];
  const pay = c.assessment ? W.computePayable(c.assessment.items, db.settings, c.damage.deceased?.length || 0).payable : 0;
  const issues = W.sectionIssues(c);
  const multi = visibleClaims().length > 1;
  let bar;
  if (c.status === 'paid') bar = `<div class="pill-bar green"><span>مبلغ پرداخت‌شده:</span><span class="amt num">${money(c.payment?.amount || pay)}</span></div>`;
  else if (['assessed', 'payment', 'objection'].includes(c.status)) bar = `<div class="pill-bar"><span>مبلغ تعیین‌شده خسارت:</span><span class="amt num">${money(pay)}</span></div>`;
  else if (c.status === 'returned') bar = `<div class="pill-bar orange"><span>نقص پرونده:</span><span class="amt">${fa(W.openDeficiencies(c).length)} مورد</span></div>`;
  else if (c.status === 'rejected') bar = `<div class="pill-bar red"><span>وضعیت پرونده:</span><span class="amt">رد شده</span></div>`;
  else bar = `<div class="pill-bar"><span>وضعیت پرونده:</span><span class="amt">${esc(status.short)}</span></div>`;

  const canEdit = editable(c);
  return `
  <div class="well">
    ${ocard('claim', 'building', 'پرونده:', `<span class="num" dir="ltr">${esc(c.code)}</span>`, `
      ${kv('نوع حادثه', esc(W.INCIDENT_TYPES[c.incident.type] || '—'))}
      <div class="kv-row">${kv('تاریخ حادثه', fa(c.incident.date || '—'))}${kv('تشکیل پرونده', fdate(c.createdAt))}</div>
      ${kv('وضعیت', `${badge(c)} ${slaBadge(c)}`)}
      ${stepper(c)}
      ${multi ? `<div class="kv"><button class="link" data-act="pickClaim">${icon('swap')} تغییر پرونده (${fa(visibleClaims().length)} پرونده)</button></div>` : ''}`)}
    ${ocard('me', 'people', 'مشترک:', `${esc(u.name)} <span class="num">(${fa(u.subscriptionNo)})</span>`, `
      ${kv('کد ملی', `<span class="num">${fa(u.nationalId)}</span>`)}${kv('موبایل', `<span class="num">${fa(u.mobile)}</span>`)}${kv('نشانی', esc(u.address))}`)}
  </div>
  ${bar}
  ${c.status === 'returned' ? `<div class="note warn">${icon('alert')}<div><b>شرکت گاز پرونده را برای اصلاح برگردانده است</b>
      <ul>${W.openDeficiencies(c).map(d => `<li>${esc(d.title)}: ${esc(d.note)}${d.reply ? ' — <i>پاسخ داده شد</i>' : ''}</li>`).join('')}</ul></div></div>` : ''}
  ${c.status === 'assessed' ? `<div class="note info">${icon('money')}<div><b>مبلغ خسارت شما تعیین شد</b>برای دیدن جزئیات و قبول یا اعتراض، «پیگیری پرونده» را باز کنید.</div></div>` : ''}
  <div class="well">
    <div class="tiles">
      ${tile({ go: 'sections', color: 'green', art: 'folderUp', a: 'var(--green)', b: 'var(--blue)', title: canEdit ? 'تکمیل پرونده' : 'مدارک پرونده', sub: canEdit ? 'ارسال مدارک و عکس‌ها' : 'مشاهده اطلاعات ارسالی', btn: canEdit ? (c.submitCount ? 'اصلاح' : 'شروع') : 'مشاهده' })}
      ${tile({ go: 'track', art: 'trackRial', a: 'var(--blue)', b: 'var(--blue)', title: 'پیگیری پرونده', sub: 'وضعیت، مبلغ و تاریخچه', btn: 'شروع' })}
    </div>
  </div>
  ${canEdit ? `<div class="section-label">مراحل تکمیل پرونده</div>${sectionRows(c, issues)}` : ''}`;
}

function sectionRows(c, issues) {
  return `<div class="rows">${SECTIONS.map(s => {
    const iss = issues[s.key] || [];
    const flagged = s.id === 'docs' ? defectsFor(c, 'section:docs').length : s.id === 'submit' ? 0 : defectsFor(c, 'section:' + s.id).length;
    const dot = flagged ? `<span class="state-dot flag">${icon('alert')}</span>` : iss.length ? `<span class="state-dot miss">${fa(iss.length)}</span>` : `<span class="state-dot ok">${icon('check')}</span>`;
    const sub = flagged ? 'نقص اعلام‌شده دارد' : iss.length ? 'مانده: ' + iss.slice(0, 2).join('، ') + (iss.length > 2 ? '، …' : '') : 'کامل است';
    return `<button class="row" data-go="sec" data-p='{"s":"${s.id}"}'>${icon(s.ic)}<span class="main"><span class="t">${s.title}</span><span class="s">${esc(sub)}</span></span>${dot}${icon('chevL', 'chev')}</button>`;
  }).join('')}</div>`;
}

function subSections() {
  const c = currentClaim();
  return pageTitle(editable(c) ? 'تکمیل پرونده' : 'مدارک پرونده', `<span dir="ltr" class="num">${esc(c.code)}</span>`) + sectionRows(c, W.sectionIssues(c));
}

function defectBox(c, d, canReply) {
  return `<div class="defect ${d.status === 'closed' ? 'closed' : ''}">
    <div><b>${esc(d.title)}</b> — ${esc(d.note)}</div>
    <div class="who">${d.by === 'insurer' ? 'بیمه‌گر' : 'شرکت گاز'} · ${esc(d.byName || '')} · ${fdate(d.at)}</div>
    ${d.reply ? `<div class="reply"><b>پاسخ:</b> ${esc(d.reply)}</div>` : ''}
    ${canReply ? `<label class="fld"><span>پاسخ شما به این مورد</span><textarea id="rep-${d.id}" data-defreply="${d.id}" placeholder="مثلاً: سند مالکیت بارگذاری شد." style="min-height:60px">${esc(d.reply || '')}</textarea></label>
      <div><button class="btn sm green" data-act="saveReply" data-id="${d.id}">ثبت پاسخ</button></div>` : ''}
  </div>`;
}
function defectsBlock(c, target) {
  const list = defectsFor(c, target);
  if (!list.length) return '';
  const can = editable(c);
  return `<div class="note warn" style="flex-direction:column">${list.map(d => defectBox(c, d, can)).join('')}</div>`;
}

function field(label, bind, val, { type = 'text', req = false, ltr = false, ph = '', hint = '', area = false, opts = null, dis = false } = {}) {
  const id = 'f-' + bind.replace(/\W/g, '-');
  const a = `id="${id}" data-bind="${bind}" ${dis ? 'disabled' : ''} ${ph ? `placeholder="${esc(ph)}"` : ''}`;
  let ctrl;
  if (opts) ctrl = `<select ${a}><option value="">انتخاب کنید</option>${Object.entries(opts).map(([k, v]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  else if (area) ctrl = `<textarea ${a}>${esc(val || '')}</textarea>`;
  else ctrl = `<input ${a} type="${type}" class="${ltr ? 'ltr' : ''}" value="${esc(val || '')}">`;
  return `<label class="fld" for="${id}"><span>${label}${req ? ' <i>*</i>' : ''}</span>${ctrl}${hint ? `<small>${hint}</small>` : ''}</label>`;
}

function subSection() {
  const c = currentClaim();
  const sid = st.p.s;
  const meta = SECTIONS.find(s => s.id === sid) || SECTIONS[0];
  const dis = !editable(c);
  const head = pageTitle(meta.title, `<span dir="ltr" class="num">${esc(c.code)}</span>`, 'sections');
  const lockNote = dis && st.user.role === 'subscriber' ? `<div class="note info">${icon('lock')}<div>پرونده در حال بررسی است و تا زمان اعلام نقص قابل ویرایش نیست.</div></div>` : '';
  const nextBtn = idx => {
    const nx = SECTIONS[idx + 1];
    return nx && !dis ? `<button class="btn" data-go="sec" data-p='{"s":"${nx.id}"}'>ذخیره و مرحله بعد: ${nx.title}</button>` : '';
  };
  const idx = SECTIONS.indexOf(meta);
  const inc = c.incident;
  if (sid === 'incident') return head + lockNote + defectsBlock(c, 'section:incident') + `<div class="form">
      <div class="grid2">
        ${field('تاریخ حادثه', 'incident.date', fa(inc.date), { req: true, ph: '۱۴۰۵/۰۷/۲۸', hint: 'به شمسی: سال/ماه/روز', dis, ltr: true })}
        ${field('ساعت تقریبی', 'incident.time', fa(inc.time), { ph: '۲۱:۳۰', dis, ltr: true })}
        ${field('نوع حادثه', 'incident.type', inc.type, { req: true, opts: W.INCIDENT_TYPES, dis })}
        ${field('کاربری محل', 'incident.placeType', inc.placeType, { req: true, opts: W.PLACE_TYPES, dis })}
      </div>
      ${field('نشانی کامل محل حادثه', 'incident.address', inc.address, { req: true, area: true, dis })}
      <div class="grid2">
        ${field('کد پستی', 'incident.postalCode', fa(inc.postalCode), { ltr: true, ph: '۱۰ رقم', dis })}
        ${field('شماره گزارش آتش‌نشانی', 'incident.fireReportNo', fa(inc.fireReportNo), { req: inc.type === 'fire' || inc.type === 'explosion', dis, hint: 'در صورت حضور آتش‌نشانی' })}
        ${field('شماره گزارش کلانتری', 'incident.policeReportNo', fa(inc.policeReportNo), { dis, hint: 'در حوادث منجر به جرح یا فوت الزامی است' })}
      </div>
      ${field('شرح حادثه', 'incident.description', inc.description, { req: true, area: true, dis, ph: 'چه اتفاقی افتاد؟ از کدام وسیله گازسوز شروع شد؟ چه بخش‌هایی آسیب دید؟' })}
      ${nextBtn(idx)}
    </div>`;

  if (sid === 'damage') {
    const d = c.damage;
    const kinds = Object.entries(W.DAMAGE_KINDS).map(([k, v]) => `<label class="chip ${d.kinds.includes(k) ? 'on' : ''}"><input type="checkbox" data-kind="${k}" ${d.kinds.includes(k) ? 'checked' : ''} ${dis ? 'disabled' : ''}>${d.kinds.includes(k) ? icon('check') : ''}${v}</label>`).join('');
    const total = (d.items || []).reduce((a, i) => a + num(i.amount), 0) + (d.injured || []).reduce((a, i) => a + num(i.amount), 0);
    const rowsOf = (list, key, cols) => (list || []).map((it, i) => `<div class="item-row ${cols.length > 2 ? 'r4' : ''}">
        ${cols.map(([f, l, o]) => `<label class="fld ${o?.wide ? 'wide' : ''}"><span>${l}</span><input type="text" data-bind="damage.${key}.${i}.${f}" value="${esc(o?.money ? (it[f] ? nf.format(num(it[f])) : '') : fa(it[f] ?? ''))}" ${o?.ltr ? 'class="ltr"' : ''} ${dis ? 'disabled' : ''} inputmode="${o?.money || o?.ltr ? 'numeric' : 'text'}"></label>`).join('')}
        ${dis ? '' : `<button class="icon-btn" data-act="rmItem" data-key="${key}" data-i="${i}" aria-label="حذف ردیف">${icon('trash')}</button>`}
      </div>`).join('');
    return head + lockNote + defectsBlock(c, 'section:damage') + `<div class="form">
      <div class="fld"><span>نوع خسارت <i>*</i></span><div class="chips">${kinds}</div><small>مدارک لازم بر اساس انتخاب شما تعیین می‌شود.</small></div>
      ${d.kinds.includes('property') ? `<div class="fld"><span>اقلام خسارت مالی</span><div class="items">${rowsOf(d.items, 'items', [['title', 'شرح قلم', { wide: true }], ['qty', 'تعداد', { ltr: true }], ['amount', 'مبلغ ادعایی (ریال)', { money: true }]])}</div>
        ${dis ? '' : `<div><button class="btn sm ghost" data-act="addItem" data-key="items">${icon('plus')} افزودن قلم</button></div>`}</div>` : ''}
      ${d.kinds.includes('medical') ? `<div class="fld"><span>مصدومان</span><div class="items">${rowsOf(d.injured, 'injured', [['name', 'نام و نام خانوادگی', { wide: true }], ['relation', 'نسبت با مشترک'], ['hospital', 'مرکز درمانی'], ['amount', 'هزینه درمان (ریال)', { money: true }]])}</div>
        ${dis ? '' : `<div><button class="btn sm ghost" data-act="addItem" data-key="injured">${icon('plus')} افزودن مصدوم</button></div>`}</div>` : ''}
      ${d.kinds.includes('death') ? `<div class="fld"><span>متوفیان</span><div class="items">${rowsOf(d.deceased, 'deceased', [['name', 'نام و نام خانوادگی', { wide: true }], ['nationalId', 'کد ملی', { ltr: true }], ['relation', 'نسبت با مشترک']])}</div>
        ${dis ? '' : `<div><button class="btn sm ghost" data-act="addItem" data-key="deceased">${icon('plus')} افزودن</button></div>`}</div>` : ''}
      <div class="sumline total"><span>جمع مبلغ ادعایی</span><b id="dmgTotal">${money(total)}</b></div>
      ${nextBtn(idx)}
    </div>`;
  }

  if (sid === 'photos') {
    return head + lockNote + defectsBlock(c, 'section:photos') + `<div class="form">
      <div class="note info">${icon('camera')}<div><b>چه عکس‌هایی لازم است؟ (دست‌کم ${fa(W.MIN_PHOTOS)} عکس)</b>
        <ul><li>نمای کلی محل حادثه</li><li>محل شروع آتش یا انفجار از نزدیک</li><li>وسیله گازسوز (اجاق، بخاری، آبگرمکن) و شیلنگ یا دودکش آن</li><li>کنتور و شیر اصلی گاز</li><li>هر قلم خسارت‌دیده</li></ul>
        پیش از تمیزکاری یا تعمیر عکس بگیرید.</div></div>
      <div class="sumline"><span>عکس‌های بارگذاری‌شده</span><b>${fa(c.photos.length)} از حداقل ${fa(W.MIN_PHOTOS)}</b></div>
      <div class="thumbs">${c.photos.map(id => thumb(c, id, !dis)).join('')}${dis ? '' : addFileBtn('photos', 'عکس جدید', 'image/*')}</div>
      ${nextBtn(idx)}
    </div>`;
  }

  if (sid === 'docs') {
    return head + lockNote + `<div class="note info">${icon('doc')}<div>عکس واضح یا فایل PDF هر مدرک را بارگذاری کنید. فهرست بر اساس نوع حادثه و خسارت تنظیم شده است.</div></div>`
      + docCards(c, { editableBy: dis ? null : 'subscriber' }) + (nextBtn(idx) ? `<div class="btns">${nextBtn(idx)}</div>` : '');
  }

  if (sid === 'bank') {
    const b = c.bank;
    const ok = W.isValidSheba(b.sheba);
    return head + lockNote + defectsBlock(c, 'section:bank') + `<div class="form">
      <div class="note info">${icon('bank')}<div>خسارت فقط به حساب شبای ذی‌نفع (مشترک یا وراث قانونی) واریز می‌شود.</div></div>
      <label class="fld" for="f-sheba"><span>شماره شبا <i>*</i></span><input id="f-sheba" data-bind="bank.sheba" class="ltr" value="${esc(b.sheba)}" placeholder="IR000000000000000000000000" ${dis ? 'disabled' : ''}>
        <small id="sheba-hint" class="${b.sheba && !ok ? 'err' : ''}">${b.sheba ? (ok ? '✓ شماره شبا معتبر است' : 'شماره شبا معتبر نیست؛ IR و ۲۴ رقم') : 'با IR شروع می‌شود و ۲۴ رقم دارد'}</small></label>
      <div class="grid2">${field('نام صاحب حساب', 'bank.holder', b.holder, { req: true, dis })}${field('نام بانک', 'bank.bankName', b.bankName, { dis })}</div>
      ${nextBtn(idx)}
    </div>`;
  }

  // submit
  const issues = W.sectionIssues(c);
  const missing = W.missingForSubmit(c);
  return head + lockNote + `<div class="form">
    <div class="fld"><span>وضعیت بخش‌ها</span></div>
    ${SECTIONS.filter(s => s.id !== 'submit').map(s => {
      const iss = issues[s.key];
      return `<div class="sumline"><span>${s.title}</span>${iss.length ? `<span class="badge warn">${fa(iss.length)} مورد ناقص</span>` : '<span class="badge ok">کامل</span>'}</div>`;
    }).join('')}
    ${W.openDeficiencies(c).length ? `<div class="fld"><span>پاسخ به موارد نقص</span>${W.openDeficiencies(c).map(d => defectBox(c, d, editable(c))).join('')}</div>` : ''}
    <label class="check"><input type="checkbox" id="f-declare" data-bind="declaration" ${c.declaration ? 'checked' : ''} ${dis ? 'disabled' : ''}>
      <span>اینجانب <b>${esc(st.user.name)}</b> تأیید می‌کنم اطلاعات و مدارک ارسالی صحیح و کامل است و هرگونه اظهار خلاف واقع موجب رد پرونده و پیگرد قانونی خواهد بود.</span></label>
    ${missing.length && !dis ? `<div class="note warn">${icon('alert')}<div><b>پیش از ارسال تکمیل کنید:</b><ul>${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div></div>` : ''}
    ${!dis ? `<button class="btn green" data-act="doAction" data-action="submit" ${missing.length ? 'disabled' : ''}>${icon('send')} ${c.submitCount ? 'ارسال مجدد پرونده به شرکت گاز' : 'ارسال پرونده به شرکت گاز'}</button>` : ''}
  </div>`;
}

function docCards(c, { editableBy = null, flagRole = null } = {}) {
  return W.visibleDocs(c).map(d => {
    const files = c.docs[d.id] || [];
    const required = d.need(c) && !(d.optional && d.optional(c));
    const flags = c.deficiencies.filter(x => x.status === 'open' && x.target === 'doc:' + d.id);
    const canUp = editableBy && d.uploader === editableBy;
    const dot = flags.length ? `<span class="state-dot flag">${icon('alert')}</span>` : files.length ? `<span class="state-dot ok">${icon('check')}</span>` : `<span class="state-dot miss">${icon('upload')}</span>`;
    return `<div class="doc-card ${flags.length ? 'flag' : ''}">
      <div class="doc-head">${dot}<span class="t">${esc(d.title)}</span>
        ${d.uploader === 'gas' ? '<span class="badge info">شرکت گاز</span>' : required ? '<span class="badge neutral">الزامی</span>' : '<span class="badge neutral">اختیاری</span>'}
        ${flagRole ? `<button class="btn sm ghost" data-act="flag" data-target="doc:${d.id}" data-title="${esc(d.title)}">${icon('alert')} نقص</button>` : ''}</div>
      ${flags.map(f => defectBox(c, f, editable(c) && st.user.role === 'subscriber')).join('')}
      ${files.length || canUp ? `<div class="thumbs">${files.map(id => thumb(c, id, canUp)).join('')}${canUp ? addFileBtn(d.id) : ''}</div>` : `<small class="s" style="color:var(--muted)">${d.uploader === 'gas' ? 'پس از بازدید کارشناس گاز بارگذاری می‌شود.' : 'بارگذاری نشده'}</small>`}
    </div>`;
  }).join('');
}

function offerBlock(c) {
  if (!c.assessment || !['assessed', 'payment', 'paid', 'objection'].includes(c.status)) return '';
  const r = W.computePayable(c.assessment.items, db.settings, c.damage.deceased?.length || 0);
  return `<div class="form">
    <h2 style="font-size:17px">جزئیات ارزیابی خسارت</h2>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>شرح</th><th>ادعایی</th><th>تأییدشده</th></tr></thead><tbody>
      ${c.assessment.items.map(i => `<tr><td>${esc(i.title)}</td><td class="n">${nf.format(i.claimed)}</td><td class="n">${nf.format(i.approved)}</td></tr>`).join('')}
    </tbody></table></div>
    ${r.property ? `<div class="sumline"><span>جمع خسارت مالی تأییدشده</span><b>${money(r.property)}</b></div><div class="sumline"><span>کسر فرانشیز (${fa(db.settings.deductiblePercent)}٪)</span><b>${money(-r.deductible)}</b></div>` : ''}
    ${r.medical ? `<div class="sumline"><span>هزینه درمان</span><b>${money(r.medical)}</b></div>` : ''}
    ${r.death ? `<div class="sumline"><span>غرامت فوت</span><b>${money(r.death)}</b></div>` : ''}
    ${r.capped ? `<small style="color:var(--amber)">بخشی از مبلغ به سقف تعهد بیمه‌نامه محدود شده است.</small>` : ''}
    <div class="sumline total"><span>مبلغ قابل پرداخت</span><b>${money(r.payable)}</b></div>
    ${c.assessment.note ? `<div class="note info">${icon('chat')}<div><b>توضیح ارزیاب (${esc(c.assessment.adjuster)})</b>${esc(c.assessment.note)}</div></div>` : ''}
    ${c.objection ? `<div class="note warn">${icon('alert')}<div><b>اعتراض مشترک — ${fdate(c.objection.at)}</b>${esc(c.objection.note)}</div></div>` : ''}
    ${c.status === 'assessed' && st.user.role === 'subscriber' ? `<div class="btns"><button class="btn green" data-act="doAction" data-action="accept">${icon('check')} قبول مبلغ</button><button class="btn ghost" data-act="doAction" data-action="object">اعتراض به مبلغ</button></div>` : ''}
    ${c.status === 'paid' ? `<div class="note ok">${icon('checkC')}<div><b>واریز شد</b>شماره پیگیری <span class="num">${fa(c.payment.ref)}</span> — تاریخ ${fa(c.payment.date)}</div></div>` : ''}
    ${c.status === 'payment' ? `<div class="note info">${icon('clock')}<div>درخواست پرداخت ثبت شد. پس از واریز، شماره پیگیری اینجا و با پیامک اعلام می‌شود.</div></div>` : ''}
  </div>`;
}

function timelineBlock(c) {
  return `<ul class="tl">${c.timeline.slice().reverse().map(t => `<li><div class="t">${esc(t.label)}</div><div class="s">${esc(t.by)} · ${esc(W.ROLES[t.role] || '')} · ${fdt(t.at)}</div>${t.note ? `<div class="n">${esc(t.note)}</div>` : ''}</li>`).join('')}</ul>`;
}

function subTrack() {
  const c = currentClaim();
  const s = W.STATUS[c.status];
  const owner = s.owner ? { subscriber: 'شما', gas: 'شرکت گاز', insurer: 'بیمه‌گر' }[s.owner] : null;
  return pageTitle('پیگیری پرونده', `<span dir="ltr" class="num">${esc(c.code)}</span>`) + `
    <div class="ocard"><div style="padding:12px 0">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${badge(c)} ${slaBadge(c)}</div>
      <h2 style="font-size:18px;margin-top:8px">${esc(s.label)}</h2>
      ${owner ? `<div style="color:var(--muted);font-size:13.5px">اقدام بعدی با: <b>${owner}</b></div>` : ''}
      ${stepper(c)}
    </div></div>
    ${c.status === 'returned' ? `<button class="btn orange" data-go="sec" data-p='{"s":"submit"}'>${icon('edit')} رفع نقص و ارسال مجدد</button>` : ''}
    ${offerBlock(c)}
    <div class="section-label">تاریخچه پرونده</div>
    <div class="ocard" style="padding:16px 18px">${timelineBlock(c)}</div>`;
}

// ================= پیام‌رسان =================
function messengerSheet() {
  openSheet(`<h2>پیام‌رسان</h2><div class="rows">
    <button class="row" data-act="newMsg">${icon('send')}<span class="main"><span class="t">ایجاد پیام جدید</span></span>${icon('chevL', 'chev')}</button>
    <button class="row" data-act="allMsgs">${icon('list')}<span class="main"><span class="t">مشاهده همه پیام‌ها</span>${totalUnreadMsgs() ? `<span class="s">${fa(totalUnreadMsgs())} پیام خوانده‌نشده</span>` : ''}</span>${icon('chevL', 'chev')}</button>
    <button class="row muted" data-act="help">${icon('help')}<span class="main"><span class="t">پایگاه پرسش‌ها و پاسخ‌های متداول</span></span>${icon('chevL', 'chev')}</button>
    <button class="row muted" data-act="guide">${icon('history')}<span class="main"><span class="t">راهنمای مراحل پرونده</span></span>${icon('chevL', 'chev')}</button>
  </div>`);
}
function viewInbox() {
  const list = visibleClaims().map(c => ({ c, last: visibleMsgs(c).slice(-1)[0], un: unreadMsgs(c) }))
    .filter(x => x.last || st.user.role === 'subscriber').sort((a, b) => (b.last?.at || '').localeCompare(a.last?.at || ''));
  return pageTitle('همه پیام‌ها') + (list.length ? `<div class="rows">${list.map(({ c, last, un }) => `
    <button class="row" data-go="thread" data-p='{"id":"${c.id}"}'>${icon('chat')}<span class="main"><span class="t"><span dir="ltr" class="num">${esc(c.code)}</span> — ${esc(userById(c.subscriberId)?.name || '')}</span>
    <span class="s">${last ? esc(last.by + ': ' + last.text.slice(0, 70)) : 'هنوز پیامی نیست'}</span></span>${un ? `<span class="badge bad">${fa(un)}</span>` : ''}${icon('chevL', 'chev')}</button>`).join('')}</div>`
    : `<div class="empty">${illo('chat')}<b>پیامی وجود ندارد.</b></div>`);
}
function threadHtml(c) {
  const msgs = visibleMsgs(c);
  const staff = st.user.role !== 'subscriber';
  return `<div class="thread">${msgs.length ? msgs.map(m => `<div class="msg ${m.byId === st.user.id ? 'me' : ''} ${m.internal ? 'internal' : ''}">
      <span class="meta">${esc(m.by)} · ${esc(W.ROLES[m.role])}${m.internal ? ' · یادداشت داخلی' : ''} · ${fdt(m.at)}</span>${esc(m.text)}</div>`).join('')
      : `<div class="empty">${illo('chat')}<span>پیامی ثبت نشده. سؤال خود را درباره این پرونده بنویسید.</span></div>`}</div>
    <form class="form" data-form="msg" data-id="${c.id}">
      <div class="composer"><textarea id="msg-text" name="text" placeholder="متن پیام…" required></textarea><button class="btn sm" type="submit" aria-label="ارسال">${icon('send')}</button></div>
      ${staff ? `<label class="check"><input type="checkbox" name="internal" id="msg-internal"><span>یادداشت داخلی بین شرکت گاز و بیمه‌گر (مشترک نمی‌بیند)</span></label>` : ''}
    </form>`;
}
function viewThread() {
  const c = claimById(st.p.id) || currentClaim();
  markRead(c);
  return pageTitle('گفتگوی پرونده', `<span dir="ltr" class="num">${esc(c.code)}</span> — ${esc(userById(c.subscriberId)?.name || '')}`, 'inbox') + threadHtml(c);
}

// ================= کارکنان: فهرست و کارتابل =================
const FILTERS = {
  gas: {
    all: ['همه', null],
    todo: ['کارتابل بررسی', ['submitted', 'gas_review']],
    query: ['استعلام بیمه‌گر', ['insurer_query']],
    subscriber: ['نزد مشترک', ['draft', 'returned']],
    insurer: ['نزد بیمه‌گر', ['sent_insurer', 'insurer_review', 'assessed', 'objection', 'payment']],
    closed: ['بایگانی', ['paid', 'rejected']],
  },
  insurer: {
    all: ['همه', null],
    new: ['جدید', ['sent_insurer']],
    review: ['در حال ارزیابی', ['insurer_review', 'objection']],
    gas: ['استعلام از گاز', ['insurer_query', 'returned', 'submitted', 'gas_review']],
    wait: ['منتظر تأیید مشترک', ['assessed']],
    pay: ['آماده پرداخت', ['payment']],
    closed: ['بایگانی', ['paid', 'rejected']],
  },
};
FILTERS.admin = FILTERS.gas;

function filtered(f) {
  const def = FILTERS[st.user.role][f] || FILTERS[st.user.role].all;
  return visibleClaims().filter(c => !def[1] || def[1].includes(c.status));
}
function claimRow(c) {
  const u = userById(c.subscriberId);
  return `<button class="claim-row" data-go="review" data-p='{"id":"${c.id}"}'>
    <span class="av ${c.incident.type === 'fire' || c.incident.type === 'explosion' ? 'fire' : ''}">${icon(c.incident.type === 'co' ? 'alert' : 'flame')}</span>
    <span class="main"><span class="code">${esc(c.code)}</span>
      <span>${esc(u?.name || '')} — ${esc(W.INCIDENT_TYPES[c.incident.type] || '')}</span>
      <span class="meta">${badge(c)} ${slaBadge(c)} ${unreadMsgs(c) ? `<span class="badge bad">${icon('chat')} ${fa(unreadMsgs(c))}</span>` : ''}<span>${fdate(c.statusAt)}</span></span></span>
    ${icon('chevL', 'chev')}</button>`;
}
function listHtml() {
  const q = W.normalizeDigits(st.q).trim().toLowerCase();
  const list = filtered(st.p.f || 'all').filter(c => {
    if (!q) return true;
    const u = userById(c.subscriberId) || {};
    return [c.code, u.name, u.nationalId, u.subscriptionNo, u.mobile].some(x => String(x || '').toLowerCase().includes(q));
  }).sort((a, b) => (b.statusAt || '').localeCompare(a.statusAt || ''));
  return list.length ? list.map(claimRow).join('') : `<div class="empty">${illo('inbox')}<span>پرونده‌ای با این شرایط پیدا نشد.</span></div>`;
}
function viewList() {
  const f = st.p.f || 'all';
  const defs = FILTERS[st.user.role];
  return pageTitle(defs[f][0] === 'همه' ? 'همه پرونده‌ها' : defs[f][0]) + `
    <input type="search" id="q" placeholder="جستجو: کد پرونده، نام، کد ملی، شماره اشتراک یا موبایل" value="${esc(st.q)}">
    <div class="chips">${Object.entries(defs).map(([k, [l]]) => `<button class="chip ${k === f ? 'on' : ''}" data-go="list" data-p='{"f":"${k}"}'>${l} <span class="num">${fa(filtered(k).length)}</span></button>`).join('')}</div>
    <div id="claimList" style="display:flex;flex-direction:column;gap:10px">${listHtml()}</div>`;
}

function gasHome() {
  const n = s => db.claims.filter(c => s.includes(c.status)).length;
  const todo = db.claims.filter(c => W.waitingOn(c) === 'gas');
  const recent = db.claims.slice().sort((a, b) => (b.statusAt || '').localeCompare(a.statusAt || '')).slice(0, 4);
  return `<div class="well">
    ${ocard('unit', 'building', 'واحد:', esc(st.user.org || ''), `${kv('کارشناس', esc(st.user.name))}${kv('امروز', fa(W.jalaliString(new Date())))}${kv('بیمه‌نامه', `${esc(db.settings.policyNo)} · ${fa(db.settings.policyStart)} تا ${fa(db.settings.policyEnd)}`)}`)}
  </div>
  <div class="pill-bar ${todo.some(c => W.slaInfo(c, db.settings)?.overdue) ? 'orange' : ''}"><span>پرونده‌های منتظر اقدام شما:</span><span class="amt">${fa(todo.length)} پرونده</span></div>
  <div class="well"><div class="tiles t3">
    ${tile({ go: 'register', color: 'green', art: 'userPlus', a: 'var(--green)', b: 'var(--blue)', title: 'ثبت مشترک حادثه‌دیده', sub: 'ساخت حساب و پرونده', btn: 'شروع' })}
    ${tile({ go: 'list', p: { f: 'todo' }, art: 'inbox', a: 'var(--blue)', b: 'var(--green)', title: 'کارتابل بررسی', sub: 'پرونده‌های ارسالی مشترکین', btn: 'ورود', count: n(['submitted', 'gas_review']) })}
    ${tile({ go: 'list', p: { f: 'query' }, color: 'violet', art: 'alertDoc', a: 'var(--violet)', b: 'var(--orange)', title: 'استعلام بیمه‌گر', sub: 'مدارک تکمیلی درخواستی', btn: 'ورود', count: n(['insurer_query']) })}
    ${tile({ go: 'list', p: { f: 'subscriber' }, color: 'orange', art: 'camera', a: 'var(--orange)', b: 'var(--blue)', title: 'نزد مشترک', sub: 'در حال تکمیل یا رفع نقص', btn: 'ورود', count: n(['draft', 'returned']) })}
    ${tile({ go: 'list', p: { f: 'insurer' }, art: 'sendShield', a: 'var(--blue)', b: 'var(--green)', title: 'نزد بیمه‌گر', sub: 'ارزیابی و پرداخت', btn: 'ورود', count: n(['sent_insurer', 'insurer_review', 'assessed', 'objection', 'payment']) })}
    ${tile({ go: 'list', p: { f: 'closed' }, color: 'green', art: 'payment', a: 'var(--green)', b: 'var(--orange)', title: 'بایگانی', sub: 'پرداخت‌شده یا رد شده', btn: 'ورود', count: n(['paid', 'rejected']) })}
  </div></div>
  <div class="section-label">آخرین تغییرات</div>
  <div style="display:flex;flex-direction:column;gap:10px">${recent.map(claimRow).join('')}</div>`;
}

function insurerHome() {
  const mine = visibleClaims();
  const n = s => mine.filter(c => s.includes(c.status)).length;
  const pending = mine.filter(c => c.status === 'payment').reduce((a, c) => a + W.computePayable(c.assessment.items, db.settings).payable, 0);
  const paid = mine.filter(c => c.status === 'paid').reduce((a, c) => a + (c.payment?.amount || 0), 0);
  return `<div class="well">
    ${ocard('unit', 'building', 'بیمه‌نامه:', esc(db.settings.policyNo), `${kv('بیمه‌گذار', 'شرکت ملی گاز — مشترکین گاز طبیعی')}${kv('مدت', `${fa(db.settings.policyStart)} تا ${fa(db.settings.policyEnd)}`)}${kv('کارشناس', esc(st.user.name))}`)}
    ${ocard('caps', 'shield', 'سقف تعهدات:', 'مالی، درمان و فوت', `${kv('خسارت مالی', money(db.settings.propertyCapRial))}${kv('هزینه درمان', money(db.settings.medicalCapRial))}${kv('فوت (هر نفر)', money(db.settings.deathCapRial))}${kv('فرانشیز', fa(db.settings.deductiblePercent) + '٪')}`)}
  </div>
  <div class="pill-bar"><span>جمع پرداخت‌شده:</span><span class="amt num">${money(paid)}</span></div>
  <div class="well"><div class="tiles t3">
    ${tile({ go: 'list', p: { f: 'new' }, art: 'inbox', a: 'var(--blue)', b: 'var(--green)', title: 'پرونده‌های جدید', sub: 'تأییدشده توسط شرکت گاز', btn: 'ورود', count: n(['sent_insurer']) })}
    ${tile({ go: 'list', p: { f: 'review' }, color: 'green', art: 'trackRial', a: 'var(--green)', b: 'var(--blue)', title: 'ارزیابی خسارت', sub: 'در حال بررسی و اعتراض‌ها', btn: 'ورود', count: n(['insurer_review', 'objection']) })}
    ${tile({ go: 'list', p: { f: 'gas' }, color: 'violet', art: 'alertDoc', a: 'var(--violet)', b: 'var(--orange)', title: 'استعلام از گاز', sub: 'منتظر مدارک تکمیلی', btn: 'ورود', count: n(['insurer_query']) })}
    ${tile({ go: 'list', p: { f: 'wait' }, color: 'orange', art: 'timeline', a: 'var(--orange)', b: 'var(--blue)', title: 'منتظر تأیید مشترک', sub: 'مبلغ اعلام شده', btn: 'ورود', count: n(['assessed']) })}
    ${tile({ go: 'list', p: { f: 'pay' }, color: 'green', art: 'payment', a: 'var(--green)', b: 'var(--orange)', title: 'آماده پرداخت', sub: pending ? money(pending) : 'موردی نیست', btn: 'ورود', count: n(['payment']) })}
    ${tile({ go: 'list', p: { f: 'closed' }, art: 'docsCheck', a: 'var(--blue)', b: 'var(--green)', title: 'بایگانی', sub: 'پرداخت‌شده یا رد شده', btn: 'ورود', count: n(['paid', 'rejected']) })}
  </div></div>`;
}

// ---------- صفحه بررسی پرونده (کارکنان) ----------
const CAUSES = {
  hose: 'شیلنگ فرسوده یا غیراستاندارد', appliance: 'نقص وسیله گازسوز', flue: 'نقص یا انسداد دودکش',
  pipe: 'نشت لوله‌کشی داخلی (پس از کنتور)', ventilation: 'نبود تهویه مناسب', before_meter: 'حادثه در تأسیسات قبل از کنتور',
  unrelated: 'علت غیرمرتبط با گاز', other: 'سایر',
};
const OPINIONS = { covered: 'مشمول پوشش بیمه', needs_review: 'نیازمند بررسی بیشتر بیمه‌گر', not_covered: 'غیرمشمول' };

function canFlag(c) {
  return (st.user.role === 'gas' && c.status === 'gas_review') || (st.user.role === 'insurer' && ['insurer_review', 'objection'].includes(c.status));
}

function viewReview() {
  const c = claimById(st.p.id);
  if (!c) return pageTitle('پرونده پیدا نشد');
  st.claimId = c.id;
  const u = userById(c.subscriberId);
  const tab = st.p.tab || 'summary';
  const acts = W.availableActions(c, st.user.role);
  const openDef = W.openDeficiencies(c).length;
  const tabs = [['summary', 'خلاصه', 'list'], ['files', 'مدارک و عکس', 'image'], ['defects', `نقص‌ها${openDef ? ' (' + fa(openDef) + ')' : ''}`, 'alert'], ['gas', 'بازدید گاز', 'meter'],
    ...(st.user.role !== 'subscriber' && (c.forwardedAt || st.user.role === 'insurer') ? [['assess', 'ارزیابی خسارت', 'money']] : []), ['chat', `پیام‌ها${unreadMsgs(c) ? ' (' + fa(unreadMsgs(c)) + ')' : ''}`, 'chat'], ['history', 'تاریخچه', 'history']];
  const actBtns = acts.map(a => {
    const tone = /reject/.test(a.id) ? 'red ghost' : /return|query|object/.test(a.id) ? 'orange' : /forward|assess|pay|answer/.test(a.id) ? 'green' : '';
    return `<button class="btn ${tone}" data-act="doAction" data-action="${a.id}">${esc(a.label)}</button>`;
  }).join('');
  let body = '';
  if (tab === 'summary') body = reviewSummary(c, u);
  if (tab === 'files') body = reviewFiles(c);
  if (tab === 'defects') body = reviewDefects(c);
  if (tab === 'gas') body = reviewGas(c);
  if (tab === 'assess') body = reviewAssess(c);
  if (tab === 'chat') { markRead(c); body = threadHtml(c); }
  if (tab === 'history') body = `<div class="ocard" style="padding:16px 18px">${timelineBlock(c)}</div>`;
  return pageTitle(`<span dir="ltr" class="num">${esc(c.code)}</span>`, `${esc(u?.name || '')} — اشتراک ${fa(u?.subscriptionNo || '')}`, 'list', { f: 'all' }) + `
    <div class="ocard"><div style="padding:12px 0;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${badge(c)} ${slaBadge(c)} ${c.submitCount > 1 ? `<span class="badge neutral">ارسال ${fa(c.submitCount)}م</span>` : ''}</div>
      <b>${esc(W.STATUS[c.status].label)}</b>
      ${stepper(c)}
    </div></div>
    ${actBtns ? `<div class="btns">${actBtns}</div>` : ''}
    <div class="tabs" role="tablist">${tabs.map(([id, l, ic]) => `<button class="tab ${tab === id ? 'on' : ''}" role="tab" aria-selected="${tab === id}" data-go="review" data-p='{"id":"${c.id}","tab":"${id}"}'>${icon(ic)}${l}</button>`).join('')}</div>
    ${body}`;
}

function flagBtn(c, target, title) {
  return canFlag(c) ? `<button class="btn sm ghost" data-act="flag" data-target="${target}" data-title="${esc(title)}">${icon('alert')} اعلام نقص</button>` : '';
}
function secCard(c, key, ic, title, inner) {
  const flags = c.deficiencies.filter(d => d.status === 'open' && d.target === 'section:' + key);
  return `<div class="ocard" style="padding:14px 18px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">${icon(ic)}<b style="flex:1">${title}</b>${flagBtn(c, 'section:' + key, title)}</div>
    ${flags.map(d => defectBox(c, d, false)).join('')}${inner}</div>`;
}

function reviewSummary(c, u) {
  const i = c.incident, d = c.damage;
  const total = (d.items || []).reduce((a, x) => a + num(x.amount), 0) + (d.injured || []).reduce((a, x) => a + num(x.amount), 0);
  const late = W.parseJalali(i.date) && W.daysBetween(W.parseJalali(i.date), c.createdAt) > db.settings.reportWindowDays;
  return `
    ${late ? `<div class="note warn">${icon('clock')}<div>حادثه بیش از ${fa(db.settings.reportWindowDays)} روز پس از وقوع اعلام شده است.</div></div>` : ''}
    ${secCard(c, 'subscriber', 'user', 'مشترک', `${kv('نام', esc(u.name))}<div class="kv-row">${kv('کد ملی', fa(u.nationalId))}${kv('موبایل', fa(u.mobile))}</div>${kv('نشانی', esc(u.address))}
      ${st.user.role === 'gas' ? `<div class="kv"><button class="btn sm ghost" data-act="resetSubPw" data-id="${u.id}">${icon('key')} صدور رمز موقت جدید برای مشترک</button></div>` : ''}`)}
    ${secCard(c, 'incident', 'flame', 'اطلاعات حادثه', `<div class="kv-row">${kv('نوع', esc(W.INCIDENT_TYPES[i.type] || '—'))}${kv('تاریخ', fa(i.date || '—') + (i.time ? ' ساعت ' + fa(i.time) : ''))}</div>
      <div class="kv-row">${kv('کاربری', esc(W.PLACE_TYPES[i.placeType] || '—'))}${kv('گزارش آتش‌نشانی', fa(i.fireReportNo || '—'))}${kv('گزارش کلانتری', fa(i.policeReportNo || '—'))}</div>
      ${kv('نشانی', esc(i.address || '—'))}${kv('شرح', esc(i.description || '—'))}`)}
    ${secCard(c, 'damage', 'list', 'خسارت‌های ادعایی', `${kv('نوع', d.kinds.map(k => W.DAMAGE_KINDS[k]).join('، ') || '—')}
      ${(d.items || []).map(x => kv(esc(x.title), `${money(num(x.amount))} <span style="color:var(--muted)">(${fa(x.qty || 1)} عدد)</span>`)).join('')}
      ${(d.injured || []).map(x => kv('مصدوم: ' + esc(x.name), `${money(num(x.amount))} — ${esc(x.hospital || '')}`)).join('')}
      ${(d.deceased || []).map(x => kv('متوفی: ' + esc(x.name), `کد ملی ${fa(x.nationalId)}`)).join('')}
      <div class="sumline total"><span>جمع ادعا</span><b>${money(total)}</b></div>`)}
    ${secCard(c, 'bank', 'bank', 'حساب بانکی', `${kv('شبا', `<span dir="ltr" class="num">${esc(c.bank.sheba || '—')}</span> ${c.bank.sheba ? (W.isValidSheba(c.bank.sheba) ? '<span class="badge ok">معتبر</span>' : '<span class="badge bad">نامعتبر</span>') : ''}`)}${kv('صاحب حساب', esc(c.bank.holder || '—'))}`)}
    ${offerBlock(c)}`;
}

function reviewFiles(c) {
  const gasCanUpload = st.user.role === 'gas' && ['submitted', 'gas_review', 'insurer_query'].includes(c.status);
  return `${secCard(c, 'photos', 'camera', `تصاویر حادثه (${fa(c.photos.length)})`, `<div class="thumbs">${c.photos.map(id => thumb(c, id, false)).join('')}</div>`)}
    ${docCards(c, { editableBy: gasCanUpload ? 'gas' : null, flagRole: canFlag(c) })}`;
}

function reviewDefects(c) {
  const open = c.deficiencies.filter(d => d.status === 'open');
  const closed = c.deficiencies.filter(d => d.status === 'closed');
  const role = st.user.role;
  const item = d => {
    const mineRole = d.by === role;
    const btns = [];
    if (role === 'gas' && c.status === 'gas_review' && d.reply) btns.push(`<button class="btn sm green" data-act="defAccept" data-id="${d.id}">پذیرش پاسخ</button>`, `<button class="btn sm ghost" data-act="defReject" data-id="${d.id}">پاسخ کافی نیست</button>`);
    if (mineRole && !d.reply && canFlag(c)) btns.push(`<button class="btn sm red ghost" data-act="defDelete" data-id="${d.id}">حذف</button>`);
    const gasAnswers = role === 'gas' && c.status === 'insurer_query' && d.by === 'insurer' && d.status === 'open';
    return defectBox(c, d, false) + (gasAnswers ? `<div class="form" style="padding:12px"><label class="fld"><span>پاسخ شرکت گاز به بیمه‌گر</span><textarea id="rep-${d.id}" data-defreply="${d.id}" style="min-height:60px">${esc(d.reply || '')}</textarea></label><div><button class="btn sm green" data-act="saveReply" data-id="${d.id}">ثبت پاسخ</button></div><small>اگر پاسخ نیازمند مدرک از مشترک است، «اعلام نقص و بازگشت به مشترک» را بزنید.</small></div>` : '')
      + (btns.length ? `<div class="btns">${btns.join('')}</div>` : '');
  };
  return `${canFlag(c) ? `<form class="form" data-form="defect"><b>${role === 'insurer' ? 'درخواست مدرک یا توضیح تکمیلی' : 'ثبت نقص عمومی'}</b>
      <label class="fld"><span>شرح</span><textarea id="def-note" name="note" required placeholder="${role === 'insurer' ? 'مثلاً: فاکتور خرید یخچال یا عکس پلاک کنتور' : 'مثلاً: عکس‌ها تار هستند'}"></textarea></label>
      <div><button class="btn sm" type="submit">${icon('plus')} افزودن</button></div>
      <small>نقص هر مدرک یا بخش را از زبانه‌های «خلاصه» و «مدارک و عکس» هم می‌توانید مستقیم ثبت کنید.</small></form>` : ''}
    <div class="section-label">موارد باز (${fa(open.length)})</div>
    ${open.length ? open.map(item).join('') : `<div class="empty">${icon('checkC')}<span>نقص بازی وجود ندارد.</span></div>`}
    ${closed.length ? `<div class="section-label">موارد بسته‌شده (${fa(closed.length)})</div>${closed.map(d => defectBox(c, d, false)).join('')}` : ''}`;
}

function reviewGas(c) {
  const r = c.gasReport || {};
  const dis = !(st.user.role === 'gas' && ['submitted', 'gas_review'].includes(c.status));
  const issues = W.gasReportIssues(c);
  const radio = (bind, val, opts) => `<div class="chips">${Object.entries(opts).map(([k, v]) => `<label class="chip ${val === k ? 'on' : ''}"><input type="radio" name="${bind}" data-bind="${bind}" value="${k}" ${val === k ? 'checked' : ''} ${dis ? 'disabled' : ''}>${v}</label>`).join('')}</div>`;
  return `<div class="form">
    ${!dis && issues.length ? `<div class="note warn">${icon('meter')}<div><b>برای ارسال به بیمه‌گر تکمیل کنید:</b> ${esc(issues.join('، '))}</div></div>` : ''}
    ${r.afterMeter === 'before' || r.cause === 'before_meter' ? `<div class="note bad">${icon('alert')}<div>حادثه در تأسیسات قبل از کنتور معمولاً از محل بیمه‌نامه مسئولیت شرکت گاز پیگیری می‌شود، نه بیمه حوادث مشترکین. طبق قرارداد جاری تصمیم بگیرید.</div></div>` : ''}
    ${r.opinion === 'not_covered' ? `<div class="note bad">${icon('x')}<div>کارشناس، حادثه را غیرمشمول دانسته است. در صورت قطعی بودن، «رد پرونده» را با ذکر دلیل بزنید.</div></div>` : ''}
    <div class="grid2">${field('کارشناس بازدیدکننده', 'gasReport.inspector', r.inspector, { req: true, dis })}${field('تاریخ بازدید', 'gasReport.visitDate', fa(r.visitDate), { req: true, ph: '۱۴۰۵/۰۷/۲۸', ltr: true, dis })}</div>
    ${field('علت فنی حادثه', 'gasReport.cause', r.cause, { req: true, opts: CAUSES, dis })}
    <div class="fld"><span>محل وقوع نسبت به کنتور <i>*</i></span>${radio('gasReport.afterMeter', r.afterMeter, { after: 'پس از کنتور (لوله‌کشی و وسایل مشترک)', before: 'قبل از کنتور' })}</div>
    <div class="fld"><span>وسیله گازسوز</span>${radio('gasReport.appliance', r.appliance, { standard: 'استاندارد', nonstandard: 'غیراستاندارد', unknown: 'نامشخص' })}</div>
    <div class="fld"><span>نظر کارشناس درباره پوشش <i>*</i></span>${radio('gasReport.opinion', r.opinion, OPINIONS)}</div>
    ${field('شرح بازدید و توضیحات', 'gasReport.notes', r.notes, { area: true, dis })}
    <div class="fld"><span>صورت‌جلسه بازدید (امضاشده) <i>*</i></span><div class="thumbs">${(c.docs.gas_report || []).map(id => thumb(c, id, !dis)).join('')}${dis ? '' : addFileBtn('gas_report')}</div></div>
  </div>`;
}

function assessSummary(c) {
  const r = W.computePayable(c.assessment?.items || [], db.settings, c.damage.deceased?.length || 0);
  return `<div class="sumline"><span>جمع ادعا</span><b>${money(r.claimed)}</b></div>
      <div class="sumline"><span>خسارت مالی تأییدشده</span><b>${money(r.property)}</b></div>
      <div class="sumline"><span>فرانشیز ${fa(db.settings.deductiblePercent)}٪</span><b>${money(-r.deductible)}</b></div>
      <div class="sumline"><span>درمان (سقف ${money(db.settings.medicalCapRial)})</span><b>${money(r.medical)}</b></div>
      ${r.death ? `<div class="sumline"><span>فوت</span><b>${money(r.death)}</b></div>` : ''}
      ${r.capped ? `<small style="color:var(--amber)">سقف تعهد اعمال شد.</small>` : ''}
      <div class="sumline total"><span>قابل پرداخت</span><b>${money(r.payable)}</b></div>`;
}

function reviewAssess(c) {
  const role = st.user.role;
  const dis = !(role === 'insurer' && ['insurer_review', 'objection'].includes(c.status));
  if (!c.assessment && dis) return `<div class="empty">${illo('trackRial')}<span>ارزیابی هنوز ثبت نشده است.</span></div>`;
  const a = c.assessment || { adjuster: '', visitDate: '', note: '', items: [] };
  const r = W.computePayable(a.items, db.settings, c.damage.deceased?.length || 0);
  const cat = { property: 'مالی', medical: 'درمان', death: 'فوت' };
  const payForm = role === 'insurer' && c.status === 'payment' ? `<div class="form"><b>ثبت پرداخت</b>
      <div class="grid2">${field('شماره پیگیری واریز', 'payment.ref', fa(c.payment?.ref), { req: true, ltr: true })}${field('تاریخ واریز', 'payment.date', fa(c.payment?.date), { req: true, ltr: true, ph: '۱۴۰۵/۰۸/۱۰' })}</div>
      <div class="sumline total"><span>مبلغ واریزی</span><b>${money(r.payable)}</b></div>
      <small>شماره شبا: <span dir="ltr" class="num">${esc(c.bank.sheba)}</span> — ${esc(c.bank.holder)}</small></div>` : '';
  if (dis) return offerBlock(c) + payForm;
  return `<div class="form">
    ${c.objection && c.status === 'objection' ? `<div class="note warn">${icon('alert')}<div><b>اعتراض مشترک</b>${esc(c.objection.note)}</div></div>` : ''}
    <div class="grid2">${field('ارزیاب خسارت', 'assessment.adjuster', a.adjuster, { req: true })}${field('تاریخ بازدید ارزیاب', 'assessment.visitDate', fa(a.visitDate), { ltr: true, ph: '۱۴۰۵/۰۷/۲۸' })}</div>
    <div class="btns"><button class="btn sm ghost" data-act="prefillAssess">${icon('copy')} آوردن اقلام از اظهارنامه مشترک</button><button class="btn sm ghost" data-act="addAssess">${icon('plus')} ردیف جدید</button></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>نوع</th><th>شرح</th><th>ادعایی (ریال)</th><th>تأییدشده (ریال)</th><th></th></tr></thead><tbody>
      ${a.items.map((it, i) => `<tr>
        <td><select data-bind="assessment.items.${i}.category" aria-label="نوع">${Object.entries(cat).map(([k, v]) => `<option value="${k}" ${it.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><input data-bind="assessment.items.${i}.title" value="${esc(it.title)}" aria-label="شرح"></td>
        <td><input data-bind="assessment.items.${i}.claimed" data-num class="ltr" value="${nf.format(it.claimed || 0)}" inputmode="numeric" aria-label="ادعایی"></td>
        <td><input data-bind="assessment.items.${i}.approved" data-num class="ltr" value="${nf.format(it.approved || 0)}" inputmode="numeric" aria-label="تأییدشده"></td>
        <td><button class="icon-btn" data-act="rmAssess" data-i="${i}" aria-label="حذف">${icon('trash')}</button></td></tr>`).join('') || `<tr><td colspan="5" style="color:var(--muted)">ردیفی نیست؛ اقلام را از اظهارنامه بیاورید.</td></tr>`}
    </tbody></table></div>
    <div id="assessSum">${assessSummary(c)}</div>
    ${field('توضیح برای مشترک', 'assessment.note', a.note, { area: true, ph: 'دلیل کسورات، استهلاک یا اقلام غیرقابل پرداخت' })}
    <small>تغییرات خودکار ذخیره می‌شود. برای اعلام به مشترک، دکمه «ثبت ارزیابی و اعلام مبلغ به مشترک» را بالای صفحه بزنید.</small>
  </div>`;
}

// ---------- ثبت مشترک (شرکت گاز) ----------
function viewRegister() {
  return pageTitle('ثبت مشترک حادثه‌دیده', 'ساخت حساب کاربری و تشکیل پرونده') + `
  <form class="form" data-form="register" autocomplete="off">
    <div class="note info">${icon('userPlus')}<div>پس از ثبت، نام کاربری (شماره اشتراک) و رمز موقت برای موبایل مشترک پیامک می‌شود. اگر مشترک قبلاً حساب داشته باشد، فقط پرونده جدید برایش ساخته می‌شود.</div></div>
    <div class="grid2">
      <label class="fld"><span>نام و نام خانوادگی <i>*</i></span><input id="r-name" name="name" required></label>
      <label class="fld"><span>کد ملی <i>*</i></span><input id="r-nid" name="nationalId" class="ltr" inputmode="numeric" maxlength="10" required></label>
      <label class="fld"><span>شماره اشتراک گاز <i>*</i></span><input id="r-sub" name="subscriptionNo" class="ltr" inputmode="numeric" required></label>
      <label class="fld"><span>موبایل <i>*</i></span><input id="r-mob" name="mobile" class="ltr" inputmode="tel" placeholder="09xxxxxxxxx" required></label>
      <label class="fld"><span>تاریخ حادثه <i>*</i></span><input id="r-date" name="date" class="ltr" placeholder="۱۴۰۵/۰۷/۲۸" required></label>
      <label class="fld"><span>نوع حادثه <i>*</i></span><select id="r-type" name="type" required>${Object.entries(W.INCIDENT_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    </div>
    <label class="fld"><span>نشانی محل حادثه <i>*</i></span><textarea id="r-addr" name="address" required style="min-height:70px"></textarea></label>
    <label class="fld"><span>یادداشت پذیرش (اختیاری)</span><textarea id="r-note" name="note" style="min-height:60px" placeholder="مثلاً: مشترک با گزارش آتش‌نشانی مراجعه کرد."></textarea></label>
    <button class="btn green" type="submit">${icon('userPlus')} ساخت حساب و تشکیل پرونده</button>
  </form>`;
}
function viewRegistered() {
  const { claimId, username, password, existing } = st.p;
  const c = claimById(claimId); const u = userById(c.subscriberId);
  return pageTitle('پرونده تشکیل شد', `<span dir="ltr" class="num">${esc(c.code)}</span>`) + `
    <div class="cred">
      <b>${existing ? 'مشترک از قبل حساب داشت؛ پرونده جدید به حسابش افزوده شد.' : 'اطلاعات ورود مشترک'}</b>
      <div class="line"><span>نام کاربری</span><code>${esc(username)}</code></div>
      ${password ? `<div class="line"><span>رمز موقت</span><code>${esc(password)}</code></div>` : ''}
      <small>${password ? 'این رمز فقط یک بار نمایش داده می‌شود. مشترک در ورود اول باید آن را تغییر دهد.' : ''} پیامک به ${fa(u.mobile)} ارسال شد (شبیه‌سازی).</small>
      <div class="btns"><button class="btn sm ghost" data-act="copyCred" data-text="${esc(`نام کاربری: ${username}${password ? ' — رمز موقت: ' + password : ''}`)}">${icon('copy')} رونوشت</button></div>
    </div>
    <div class="btns"><button class="btn" data-go="review" data-p='{"id":"${c.id}"}'>مشاهده پرونده</button><button class="btn ghost" data-go="register">ثبت مشترک دیگر</button></div>`;
}

// ---------- مدیر ----------
function adminHome() {
  const paid = db.claims.filter(c => c.status === 'paid').reduce((a, c) => a + (c.payment?.amount || 0), 0);
  return `<div class="well">${ocard('unit', 'settings', 'بیمه‌نامه:', esc(db.settings.policyNo), `${kv('مدت', `${fa(db.settings.policyStart)} تا ${fa(db.settings.policyEnd)}`)}${kv('کاربران', fa(db.users.length))}${kv('پرونده‌ها', fa(db.claims.length))}`)}</div>
  <div class="pill-bar green"><span>جمع خسارت پرداخت‌شده:</span><span class="amt num">${money(paid)}</span></div>
  <div class="well"><div class="tiles t3">
    ${tile({ go: 'users', art: 'people', a: 'var(--blue)', b: 'var(--green)', title: 'کاربران', sub: 'کارکنان و مشترکین', btn: 'ورود', count: db.users.length })}
    ${tile({ go: 'settings', color: 'green', art: 'gear', a: 'var(--green)', b: 'var(--blue)', title: 'تنظیمات بیمه‌نامه', sub: 'سقف‌ها، فرانشیز، مهلت‌ها', btn: 'ورود' })}
    ${tile({ go: 'reports', color: 'violet', art: 'chart', a: 'var(--violet)', b: 'var(--orange)', title: 'گزارش‌ها', sub: 'آمار وضعیت و عملکرد', btn: 'ورود' })}
    ${tile({ go: 'list', p: { f: 'all' }, art: 'inbox', a: 'var(--blue)', b: 'var(--orange)', title: 'همه پرونده‌ها', sub: 'جستجو و مشاهده', btn: 'ورود', count: db.claims.length })}
    ${tile({ go: 'sms', color: 'orange', art: 'sms', a: 'var(--orange)', b: 'var(--blue)', title: 'پیامک‌ها', sub: 'گزارش پیامک‌های ارسالی', btn: 'ورود', count: db.sms.length })}
    ${tile({ act: 'resetDemo', color: 'red', art: 'timeline', a: 'var(--red)', b: 'var(--orange)', title: 'بازنشانی نمایشی', sub: 'بازگشت به داده‌های نمونه', btn: 'بازنشانی' })}
  </div></div>`;
}
function viewUsers() {
  const q = W.normalizeDigits(st.q).trim();
  const list = db.users.filter(u => !q || [u.name, u.username, u.nationalId, u.mobile].some(x => String(x || '').includes(q)));
  return pageTitle('کاربران') + `<div class="btns"><button class="btn sm green" data-act="addStaff">${icon('userPlus')} کاربر کارکنان</button></div>
    <input type="search" id="uq" placeholder="جستجو در نام، نام کاربری، کد ملی یا موبایل" value="${esc(st.q)}">
    <div class="rows">${list.map(u => `<div class="row">${icon(u.role === 'subscriber' ? 'user' : u.role === 'gas' ? 'flame' : u.role === 'insurer' ? 'shield' : 'settings')}
      <span class="main"><span class="t">${esc(u.name)} ${u.active ? '' : '<span class="badge bad">غیرفعال</span>'}</span><span class="s">${esc(W.ROLES[u.role])} · <span dir="ltr">${esc(u.username)}</span>${u.lastLoginAt ? ' · آخرین ورود ' + fdate(u.lastLoginAt) : ''}</span></span>
      <button class="btn sm ghost" data-act="resetPw" data-id="${u.id}" aria-label="رمز موقت">${icon('key')}</button>
      ${u.id !== st.user.id ? `<button class="btn sm ${u.active ? 'red ghost' : 'green'}" data-act="toggleUser" data-id="${u.id}">${u.active ? 'غیرفعال' : 'فعال'}</button>` : ''}</div>`).join('')}</div>`;
}
function viewSettings() {
  const s = db.settings;
  const f = (k, l, h = '') => `<label class="fld"><span>${l}</span><input id="s-${k}" name="${k}" class="ltr" value="${typeof s[k] === 'number' ? nf.format(s[k]) : esc(fa(s[k]))}">${h ? `<small>${h}</small>` : ''}</label>`;
  return pageTitle('تنظیمات بیمه‌نامه') + `<form class="form" data-form="settings">
    <div class="note warn">${icon('alert')}<div>مقادیر پیش‌فرض نمونه‌اند. سقف تعهدات و فرانشیز را دقیقاً مطابق بیمه‌نامه سال جاری وارد کنید.</div></div>
    <div class="grid2">${f('policyNo', 'شماره بیمه‌نامه')}${f('policyStart', 'شروع')}${f('policyEnd', 'پایان')}${f('deductiblePercent', 'فرانشیز خسارت مالی (٪)')}</div>
    <div class="grid2">${f('propertyCapRial', 'سقف خسارت مالی (ریال)')}${f('medicalCapRial', 'سقف هزینه درمان (ریال)')}${f('deathCapRial', 'سقف فوت هر نفر (ریال)')}${f('reportWindowDays', 'مهلت اعلام حادثه (روز)')}</div>
    <div class="grid2">${f('gasSlaDays', 'مهلت بررسی شرکت گاز (روز)')}${f('insurerSlaDays', 'مهلت بررسی بیمه‌گر (روز)')}${f('fixSlaDays', 'مهلت رفع نقص مشترک (روز)')}</div>
    <button class="btn green" type="submit">ذخیره تنظیمات</button></form>`;
}
function viewReports() {
  const cs = db.claims;
  const counts = Object.keys(W.STATUS).map(k => [k, cs.filter(c => c.status === k).length]).filter(([, n]) => n);
  const max = Math.max(1, ...counts.map(([, n]) => n));
  const paid = cs.filter(c => c.status === 'paid');
  const avgDays = paid.length ? Math.round(paid.reduce((a, c) => a + W.daysBetween(c.createdAt, c.paidAt || c.statusAt), 0) / paid.length) : 0;
  const claimed = cs.reduce((a, c) => a + (c.damage.items || []).reduce((x, i) => x + num(i.amount), 0) + (c.damage.injured || []).reduce((x, i) => x + num(i.amount), 0), 0);
  const overdue = cs.filter(c => W.slaInfo(c, db.settings)?.overdue).length;
  const returns = cs.reduce((a, c) => a + c.timeline.filter(t => t.action === 'gas_return').length, 0);
  return pageTitle('گزارش‌ها') + `<div class="kpis">
      <div class="kpi"><div class="l">کل پرونده‌ها</div><div class="v">${fa(cs.length)}</div></div>
      <div class="kpi"><div class="l">میانگین تا پرداخت</div><div class="v">${fa(avgDays)} روز</div></div>
      <div class="kpi"><div class="l">پرونده‌های دارای تأخیر</div><div class="v">${fa(overdue)}</div></div>
      <div class="kpi"><div class="l">دفعات اعلام نقص</div><div class="v">${fa(returns)}</div></div>
      <div class="kpi"><div class="l">جمع ادعا</div><div class="v" style="font-size:17px">${money(claimed)}</div></div>
      <div class="kpi"><div class="l">جمع پرداخت</div><div class="v" style="font-size:17px">${money(paid.reduce((a, c) => a + (c.payment?.amount || 0), 0))}</div></div>
    </div>
    <div class="form"><b>پرونده‌ها بر اساس وضعیت</b><div class="stat-bars">${counts.map(([k, n]) => `<div class="sbar"><span>${W.STATUS[k].short}</span><span class="track"><span class="fill" style="width:${(n / max) * 100}%;display:block"></span></span><b class="num">${fa(n)}</b></div>`).join('')}</div></div>`;
}
function viewSms() {
  return pageTitle('پیامک‌های ارسالی', 'در نسخه نمایشی پیامک واقعی ارسال نمی‌شود') + `<div class="rows">${db.sms.map(s => `<div class="row">${icon('sms')}<span class="main"><span class="t num" dir="ltr" style="text-align:right">${fa(s.mobile)}</span><span class="s">${esc(s.text)}</span><span class="s">${fdt(s.at)}</span></span></div>`).join('') || '<div class="empty">پیامکی نیست.</div>'}</div>`;
}

const VIEWS = {
  subscriber: { home: subHome, sections: subSections, sec: subSection, track: subTrack, inbox: viewInbox, thread: viewThread },
  gas: { home: gasHome, list: viewList, review: viewReview, register: viewRegister, registered: viewRegistered, inbox: viewInbox, thread: viewThread },
  insurer: { home: insurerHome, list: viewList, review: viewReview, inbox: viewInbox, thread: viewThread },
  admin: { home: adminHome, list: viewList, review: viewReview, users: viewUsers, settings: viewSettings, reports: viewReports, sms: viewSms, inbox: viewInbox, thread: viewThread },
};

// ================= برگه‌های عمومی =================
const FAQ = [
  ['چه حوادثی تحت پوشش است؟', 'آتش‌سوزی، انفجار و گازگرفتگی ناشی از گاز طبیعی در محل مشترک (معمولاً پس از کنتور) که به خسارت مالی، جرح یا فوت منجر شده باشد. جزئیات و سقف‌ها را بیمه‌نامه سال جاری تعیین می‌کند.'],
  ['حساب کاربری را از کجا بگیرم؟', 'به امور حوادث شرکت گاز منطقه مراجعه کنید. پس از ثبت، نام کاربری (شماره اشتراک) و رمز موقت برایتان پیامک می‌شود.'],
  ['چه مدارکی لازم است؟', 'کارت ملی، سند یا اجاره‌نامه، قبض گاز، گزارش آتش‌نشانی، عکس‌های محل، فاکتور اقلام و گواهی شبا. در جرح یا فوت، مدارک پزشکی، پزشکی قانونی، گواهی فوت و انحصار وراثت هم لازم است. سامانه فهرست دقیق پرونده شما را نشان می‌دهد.'],
  ['اگر شرکت گاز نقص اعلام کند؟', 'پیامک دریافت می‌کنید. وارد سامانه شوید، موارد را اصلاح کنید، به هر مورد پاسخ دهید و پرونده را دوباره ارسال کنید.'],
  ['اگر با مبلغ خسارت موافق نباشم؟', 'در «پیگیری پرونده» گزینه «اعتراض به مبلغ» را بزنید و دلیل را بنویسید. بیمه‌گر دوباره ارزیابی می‌کند.'],
  ['پیش از عکاسی محل را تمیز کنم؟', 'خیر. تا ثبت عکس‌ها و بازدید کارشناس، محل را تعمیر یا پاک‌سازی نکنید.'],
];
function helpSheet() {
  openSheet(`<h2>پرسش‌های متداول</h2><div class="faq">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    <div class="support"><span class="av">${icon('support')}</span>اورژانس گاز: <span class="num">۱۹۴</span></div>`);
}
function guideSheet() {
  openSheet(`<h2>مراحل پرونده</h2><ul class="tl">
    <li><div class="t">۱. مراجعه به شرکت گاز</div><div class="s">ثبت مشترک، تشکیل پرونده و پیامک نام کاربری و رمز موقت</div></li>
    <li><div class="t">۲. تکمیل پرونده توسط مشترک</div><div class="s">اطلاعات حادثه، خسارت‌ها، عکس‌ها، مدارک و شبا؛ سپس ارسال</div></li>
    <li><div class="t">۳. بررسی شرکت گاز</div><div class="s">بازدید کارشناس، بررسی مدارک؛ در صورت نقص، بازگشت به مشترک</div></li>
    <li><div class="t">۴. بررسی بیمه‌گر</div><div class="s">ارزیابی خسارت؛ در صورت نیاز درخواست مدارک تکمیلی از طریق شرکت گاز</div></li>
    <li><div class="t">۵. تأیید مبلغ و پرداخت</div><div class="s">قبول یا اعتراض مشترک، سپس واریز به شبا و اعلام شماره پیگیری</div></li></ul>`);
}
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}
function profileSheet() {
  const dark = isDark();
  openSheet(`<h2>پروفایل</h2><p class="lead">${esc(st.user.name)} · ${esc(W.ROLES[st.user.role])}</p><div class="rows">
    <button class="row" data-act="changePw">${icon('key')}<span class="main"><span class="t">تغییر رمز</span></span>${icon('chevL', 'chev')}</button>
    <button class="row" data-act="newMsg">${icon('chat')}<span class="main"><span class="t">ارسال پیام</span></span>${icon('chevL', 'chev')}</button>
    <button class="row" data-act="theme" role="switch" aria-checked="${dark}">${icon('eye')}<span class="main"><span class="t">حالت تیره</span></span><span class="switch ${dark ? 'on' : ''}"></span></button>
    <button class="row" data-act="help">${icon('help')}<span class="main"><span class="t">پایگاه پرسش‌ها و پاسخ‌های متداول</span></span>${icon('chevL', 'chev')}</button>
    <button class="row danger" data-act="logout">${icon('logout')}<span class="main"><span class="t">خروج از حساب کاربری</span></span>${icon('chevL', 'chev')}</button>
  </div>
  <div class="support"><span class="av">${icon('support')}</span>تماس با پشتیبانی<span class="num" style="font-weight:500">اورژانس گاز ۱۹۴</span></div>`);
}
function notifSheet() {
  const list = myNotifs().slice(0, 40);
  openSheet(`<h2>اعلان‌ها</h2>${list.length ? `<div class="rows">${list.map(n => `<button class="row ${n.readBy.includes(st.user.id) ? 'muted' : ''}" data-act="openNotif" data-id="${n.id}">${icon('bell')}<span class="main"><span class="t">${esc(n.text)}</span><span class="s">${fdt(n.at)}</span></span>${icon('chevL', 'chev')}</button>`).join('')}</div>` : `<div class="empty">${illo('timeline')}اعلانی ندارید.</div>`}`);
  for (const n of list) if (!n.readBy.includes(st.user.id)) n.readBy.push(st.user.id);
  persist();
  const dot = $('.topbar [data-act=notifs] .dot'); if (dot) dot.remove();
}
function pickClaimSheet() {
  const cur = currentClaim();
  openSheet(`<h2>پرونده‌ها</h2><p class="lead">پرونده مورد نظر خود را انتخاب کنید.</p>
    ${visibleClaims().map(c => `<button class="radio-card ${c.id === cur.id ? 'on' : ''}" data-act="setClaim" data-id="${c.id}"><span><b dir="ltr" class="num">${esc(c.code)}</b><br><small>${esc(W.INCIDENT_TYPES[c.incident.type])} — ${esc(W.STATUS[c.status].short)}</small></span><span class="rd"></span></button>`).join('')}
    <div class="btns"><button class="btn" data-act="closeSheet">تأیید</button></div>`);
}

// ================= عمل‌های پرونده =================
function afterAction(c, id, note) {
  const sub = userById(c.subscriberId);
  const t = text => S.notify({ toUser: sub.id, text, claimId: c.id });
  const sms = text => S.sendSms(sub.mobile, text);
  switch (id) {
    case 'submit': S.notify({ toRole: 'gas', text: `پرونده ${c.code} ${c.submitCount > 1 ? 'پس از رفع نقص دوباره' : ''} ارسال شد.`, claimId: c.id }); break;
    case 'gas_return': t(`برای پرونده ${c.code} نقص اعلام شد.`); sms(`مشترک گرامی، پرونده ${c.code} نیاز به اصلاح دارد. لطفاً وارد سامانه شوید.`); break;
    case 'gas_forward': S.notify({ toRole: 'insurer', text: `پرونده ${c.code} از شرکت گاز دریافت شد.`, claimId: c.id }); t(`پرونده ${c.code} برای بیمه‌گر ارسال شد.`); sms(`پرونده ${c.code} تأیید و برای بیمه‌گر ارسال شد.`); break;
    case 'gas_answer': S.notify({ toRole: 'insurer', text: `شرکت گاز به استعلام پرونده ${c.code} پاسخ داد.`, claimId: c.id }); break;
    case 'ins_start': t(`بیمه‌گر بررسی پرونده ${c.code} را آغاز کرد.`); break;
    case 'ins_query': S.notify({ toRole: 'gas', text: `بیمه‌گر برای پرونده ${c.code} مدارک تکمیلی خواست.`, claimId: c.id }); break;
    case 'ins_assess': t(`مبلغ خسارت پرونده ${c.code} تعیین شد.`); sms(`مبلغ خسارت پرونده ${c.code} تعیین شد. برای تأیید یا اعتراض وارد سامانه شوید.`); break;
    case 'accept': S.notify({ toRole: 'insurer', text: `مشترک مبلغ پرونده ${c.code} را پذیرفت.`, claimId: c.id }); break;
    case 'object': S.notify({ toRole: 'insurer', text: `مشترک به مبلغ پرونده ${c.code} اعتراض کرد.`, claimId: c.id }); break;
    case 'ins_pay': t(`خسارت پرونده ${c.code} واریز شد.`); sms(`خسارت پرونده ${c.code} به مبلغ ${nf.format(c.payment.amount)} ریال واریز شد. پیگیری: ${c.payment.ref}`); break;
    case 'gas_reject': case 'ins_reject': t(`پرونده ${c.code} رد شد.`); sms(`پرونده ${c.code} مشمول پوشش تشخیص داده نشد. دلیل: ${note}`); S.notify({ toRole: id === 'gas_reject' ? 'insurer' : 'gas', text: `پرونده ${c.code} رد شد.`, claimId: c.id }); break;
  }
}
function actionSheet(id) {
  const c = currentClaim();
  const a = W.ACTIONS[id];
  const err = W.canDo(c, st.user.role, id);
  const placeholder = { object: 'دلیل اعتراض و مبلغ مورد انتظار خود را بنویسید.', gas_reject: 'دلیل رد (مثلاً: حادثه غیرمرتبط با گاز طبق گزارش کارشناس)', ins_reject: 'دلیل رد بر اساس شرایط بیمه‌نامه' }[id] || 'توضیح (اختیاری)';
  openSheet(`<h2>${esc(a.label)}</h2><p class="lead"><span dir="ltr" class="num">${esc(c.code)}</span></p>
    ${err ? `<div class="note warn">${icon('alert')}<div>${esc(err)}</div></div>` : ''}
    <form class="form" data-form="action" data-action="${id}" style="border:0;padding:0">
      <label class="fld"><span>${a.needsNote ? 'توضیح <i>*</i>' : 'توضیح'}</span><textarea id="act-note" name="note" ${a.needsNote ? 'required' : ''} placeholder="${esc(placeholder)}"></textarea></label>
      <div class="btns"><button class="btn ${/reject/.test(id) ? 'red' : 'green'}" type="submit" ${err ? 'disabled' : ''}>تأیید</button><button class="btn ghost" type="button" data-act="closeSheet">انصراف</button></div>
    </form>`);
}
function runAction(id, note) {
  const c = currentClaim();
  if (id === 'ins_pay' && c.payment) c.payment.amount = W.computePayable(c.assessment.items, db.settings, c.damage.deceased?.length || 0).payable;
  try {
    const next = W.applyAction(c, id, st.user, note);
    Object.assign(c, next);
    afterAction(c, id, note);
    persist(); closeSheet();
    toast(W.STATUS[c.status].label);
    if (st.user.role === 'subscriber') go('track'); else render();
  } catch (e) { toast(e.message, true); }
}

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { const k = ks[i]; if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; }
  o[ks[ks.length - 1]] = val;
}

// ================= رویدادها =================
const ACTS = {
  toggle: el => { const k = el.dataset.key; st.open.has(k) ? st.open.delete(k) : st.open.add(k); render(); },
  help: helpSheet, guide: guideSheet, notifs: notifSheet, closeSheet,
  demoLogin: el => { const d = DEMO[+el.dataset.i]; doLogin(d.u, d.p); },
  logout: () => { closeSheet(); st.user = null; sset('gii.user', null); sset('gii.view', null); render(); },
  theme: () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; lset('gii.theme', next); profileSheet();
  },
  changePw: () => openSheet(`<h2>تغییر رمز</h2><form class="form" data-form="changepw" style="border:0;padding:0">
      <label class="fld"><span>رمز فعلی</span><input id="cp0" name="p0" type="password" class="ltr" required autocomplete="current-password"></label>
      <label class="fld"><span>رمز جدید</span><input id="cp1" name="p1" type="password" class="ltr" minlength="6" required autocomplete="new-password"></label>
      <label class="fld"><span>تکرار رمز جدید</span><input id="cp2" name="p2" type="password" class="ltr" minlength="6" required autocomplete="new-password"></label>
      <div class="btns"><button class="btn" type="submit">ذخیره</button><button class="btn ghost" type="button" data-act="closeSheet">انصراف</button></div></form>`),
  newMsg: () => {
    closeSheet();
    if (st.user.role === 'subscriber') { const c = currentClaim(); if (c) go('thread', { id: c.id }); return; }
    openSheet(`<h2>پیام درباره کدام پرونده؟</h2><div class="rows">${visibleClaims().map(c => `<button class="row" data-act="openThread" data-id="${c.id}">${icon('chat')}<span class="main"><span class="t" dir="ltr" style="text-align:right">${esc(c.code)}</span><span class="s">${esc(userById(c.subscriberId)?.name || '')}</span></span>${icon('chevL', 'chev')}</button>`).join('')}</div>`);
  },
  openThread: el => { closeSheet(); go('thread', { id: el.dataset.id }); },
  allMsgs: () => { closeSheet(); go('inbox'); },
  openNotif: el => {
    const n = db.notifications.find(x => x.id === el.dataset.id); closeSheet();
    if (n?.claimId) go(st.user.role === 'subscriber' ? 'track' : 'review', { id: n.claimId });
  },
  pickClaim: pickClaimSheet,
  setClaim: el => { st.claimId = el.dataset.id; pickClaimSheet(); render(); },
  doAction: el => actionSheet(el.dataset.action),
  viewFile: async el => {
    const c = claimById(el.dataset.claim); const id = el.dataset.file; const f = c.files[id];
    const blob = await S.getFile(id); if (!blob) { toast('فایل در این دستگاه موجود نیست.', true); return; }
    if (!urlCache.has(id)) urlCache.set(id, URL.createObjectURL(blob));
    const url = urlCache.get(id);
    openSheet(`<h2 style="font-size:16px;overflow-wrap:anywhere">${esc(f.name)}</h2><p class="lead">${fdt(f.at)} · ${fa(Math.ceil(f.size / 1024))} کیلوبایت</p>
      <div class="viewer">${f.type.startsWith('image/') ? `<img src="${url}" alt="${esc(f.name)}">` : `<div class="note info">${icon('doc')}<div>پیش‌نمایش PDF در این صفحه ممکن نیست. <a href="${url}" target="_blank" rel="noopener">باز کردن فایل</a></div></div>`}</div>
      <button class="btn ghost" data-act="closeSheet">بستن</button>`);
  },
  rmFile: el => {
    const c = currentClaim(); const id = el.dataset.file;
    c.photos = c.photos.filter(x => x !== id);
    for (const k in c.docs) c.docs[k] = c.docs[k].filter(x => x !== id);
    delete c.files[id]; persist(); render();
  },
  addItem: el => {
    const c = currentClaim(); const k = el.dataset.key;
    (c.damage[k] ||= []).push(k === 'items' ? { title: '', qty: 1, amount: '' } : k === 'injured' ? { name: '', relation: '', hospital: '', amount: '' } : { name: '', nationalId: '', relation: '' });
    persist(); render();
  },
  rmItem: el => { const c = currentClaim(); c.damage[el.dataset.key].splice(+el.dataset.i, 1); persist(); render(); },
  saveReply: el => {
    const c = currentClaim(); const d = c.deficiencies.find(x => x.id === el.dataset.id);
    const v = $(`#rep-${d.id}`).value.trim(); if (!v) { toast('متن پاسخ را بنویسید.', true); return; }
    d.reply = v; d.replyAt = new Date().toISOString(); d.replyBy = st.user.name; persist(); toast('پاسخ ثبت شد.'); render();
  },
  flag: el => openSheet(`<h2>اعلام نقص</h2><p class="lead">${esc(el.dataset.title)}</p>
    <form class="form" data-form="defect" data-target="${esc(el.dataset.target)}" data-title="${esc(el.dataset.title)}" style="border:0;padding:0">
      <label class="fld"><span>شرح نقص</span><textarea id="def-note2" name="note" required placeholder="دقیقاً بنویسید چه چیزی باید اصلاح یا اضافه شود."></textarea></label>
      <div class="btns"><button class="btn orange" type="submit">ثبت نقص</button><button class="btn ghost" type="button" data-act="closeSheet">انصراف</button></div></form>`),
  defAccept: el => { const c = currentClaim(); const d = c.deficiencies.find(x => x.id === el.dataset.id); d.status = 'closed'; d.closedAt = new Date().toISOString(); persist(); render(); },
  defReject: el => {
    const c = currentClaim(); const d = c.deficiencies.find(x => x.id === el.dataset.id);
    d.note = d.note + ' | پاسخ قبلی کافی نبود: ' + d.reply; d.reply = ''; d.at = new Date().toISOString(); persist(); render();
  },
  defDelete: el => { const c = currentClaim(); c.deficiencies = c.deficiencies.filter(x => x.id !== el.dataset.id); persist(); render(); },
  prefillAssess: () => {
    const c = currentClaim(); c.assessment ||= { adjuster: st.user.name, visitDate: '', note: '', items: [] };
    const d = c.damage;
    c.assessment.items = [
      ...(d.items || []).map(i => ({ category: 'property', title: i.title, claimed: num(i.amount), approved: num(i.amount) })),
      ...(d.injured || []).map(i => ({ category: 'medical', title: 'درمان: ' + i.name, claimed: num(i.amount), approved: num(i.amount) })),
      ...(d.deceased || []).map(i => ({ category: 'death', title: 'فوت: ' + i.name, claimed: db.settings.deathCapRial, approved: db.settings.deathCapRial })),
    ];
    persist(); render();
  },
  addAssess: () => { const c = currentClaim(); c.assessment ||= { adjuster: st.user.name, visitDate: '', note: '', items: [] }; c.assessment.items.push({ category: 'property', title: '', claimed: 0, approved: 0 }); persist(); render(); },
  rmAssess: el => { const c = currentClaim(); c.assessment.items.splice(+el.dataset.i, 1); persist(); render(); },
  copyCred: el => {
    const text = el.dataset.text;
    navigator.clipboard?.writeText(text).then(() => toast('رونوشت شد.'), () => toast('رونوشت ممکن نشد؛ متن را دستی انتخاب کنید.', true));
  },
  resetSubPw: async el => resetPassword(userById(el.dataset.id)),
  resetPw: async el => resetPassword(userById(el.dataset.id)),
  toggleUser: el => { const u = userById(el.dataset.id); u.active = !u.active; persist(); render(); },
  addStaff: () => openSheet(`<h2>کاربر جدید کارکنان</h2><form class="form" data-form="staff" style="border:0;padding:0">
      <label class="fld"><span>نام و نام خانوادگی</span><input id="sf-name" name="name" required></label>
      <div class="grid2"><label class="fld"><span>نام کاربری</span><input id="sf-user" name="username" class="ltr" required></label>
      <label class="fld"><span>نقش</span><select id="sf-role" name="role"><option value="gas">کارشناس شرکت گاز</option><option value="insurer">کارشناس بیمه‌گر</option><option value="admin">مدیر سامانه</option></select></label></div>
      <label class="fld"><span>واحد سازمانی</span><input id="sf-org" name="org"></label>
      <div class="btns"><button class="btn green" type="submit">ساخت و صدور رمز موقت</button></div></form>`),
  resetDemo: () => openSheet(`<h2>بازنشانی داده‌های نمایشی</h2><p class="lead">همه پرونده‌ها، کاربران و فایل‌های این مرورگر پاک و داده‌های نمونه دوباره ساخته می‌شود.</p>
      <div class="btns"><button class="btn red" data-act="resetDemoYes">بازنشانی</button><button class="btn ghost" data-act="closeSheet">انصراف</button></div>`),
  resetDemoYes: async () => { closeSheet(); db = await S.seed(); urlCache.clear(); st.user = db.users.find(u => u.role === 'admin'); sset('gii.user', st.user.id); toast('داده‌های نمونه بازنشانی شد.'); go('home'); },
};

async function resetPassword(u) {
  const pw = S.tempPassword();
  u.pwHash = await S.hashPw(u.username, pw); u.mustChangePassword = true; u.active = true;
  if (u.mobile) S.sendSms(u.mobile, `رمز موقت جدید سامانه بیمه حوادث گاز: ${pw}`);
  persist();
  openSheet(`<h2>رمز موقت صادر شد</h2><div class="cred"><div class="line"><span>نام کاربری</span><code>${esc(u.username)}</code></div><div class="line"><span>رمز موقت</span><code>${pw}</code></div>
    <small>${u.mobile ? 'به ' + fa(u.mobile) + ' پیامک شد (شبیه‌سازی). ' : ''}کاربر در ورود بعدی باید رمز را تغییر دهد.</small></div><button class="btn ghost" data-act="closeSheet">بستن</button>`);
}

const FORMS = {
  login: f => doLogin(f.username.value, f.password.value),
  newpw: async f => {
    if (f.p1.value !== f.p2.value) return toast('تکرار رمز با رمز جدید یکسان نیست.', true);
    if (f.p1.value.length < 6) return toast('رمز باید دست‌کم ۶ نویسه باشد.', true);
    if (await S.hashPw(st.user.username, f.p1.value) === st.user.pwHash) return toast('رمز جدید نباید با رمز موقت یکی باشد.', true);
    st.user.pwHash = await S.hashPw(st.user.username, f.p1.value); st.user.mustChangePassword = false; persist(); toast('رمز ذخیره شد.'); go('home');
  },
  changepw: async f => {
    if (await S.hashPw(st.user.username, f.p0.value) !== st.user.pwHash) return toast('رمز فعلی نادرست است.', true);
    if (f.p1.value !== f.p2.value) return toast('تکرار رمز یکسان نیست.', true);
    st.user.pwHash = await S.hashPw(st.user.username, f.p1.value); persist(); closeSheet(); toast('رمز تغییر کرد.');
  },
  msg: f => {
    const c = claimById(f.dataset.id); const text = f.text.value.trim(); if (!text) return;
    const internal = !!(f.internal && f.internal.checked);
    c.messages.push({ id: S.uid('m'), at: new Date().toISOString(), by: st.user.name, byId: st.user.id, role: st.user.role, text, internal });
    if (st.user.role === 'subscriber') { S.notify({ toRole: 'gas', text: `پیام جدید از مشترک در پرونده ${c.code}`, claimId: c.id }); if (c.forwardedAt) S.notify({ toRole: 'insurer', text: `پیام جدید از مشترک در پرونده ${c.code}`, claimId: c.id }); }
    else if (!internal) S.notify({ toUser: c.subscriberId, text: `پیام جدید از ${W.ROLES[st.user.role]} در پرونده ${c.code}`, claimId: c.id });
    else S.notify({ toRole: st.user.role === 'gas' ? 'insurer' : 'gas', text: `یادداشت داخلی جدید در پرونده ${c.code}`, claimId: c.id });
    markRead(c); render();
    const t = $('#msg-text'); if (t) t.focus();
  },
  action: f => runAction(f.dataset.action, f.note.value.trim()),
  defect: f => {
    const c = currentClaim(); const note = f.note.value.trim(); if (!note) return;
    c.deficiencies.push({ id: S.uid('d'), target: f.dataset.target || 'general', title: f.dataset.title || (st.user.role === 'insurer' ? 'درخواست بیمه‌گر' : 'نقص عمومی'), note, by: st.user.role, byName: st.user.name, at: new Date().toISOString(), status: 'open', reply: '' });
    persist(); closeSheet(); toast('ثبت شد. برای اعلام به ' + (st.user.role === 'insurer' ? 'شرکت گاز «درخواست مدارک تکمیلی»' : 'مشترک «اعلام نقص و بازگشت»') + ' را بزنید.'); render();
  },
  register: async f => {
    const v = k => W.normalizeDigits(f[k].value).trim();
    const errs = [];
    if (v('name').length < 3) errs.push('نام');
    if (!W.isValidNationalId(v('nationalId'))) errs.push('کد ملی معتبر');
    if (!/^\d{6,13}$/.test(v('subscriptionNo'))) errs.push('شماره اشتراک (فقط رقم)');
    if (!W.isValidMobile(v('mobile'))) errs.push('موبایل ۱۱ رقمی');
    const d = W.parseJalali(v('date'));
    if (!d) errs.push('تاریخ حادثه شمسی معتبر');
    else if (d > new Date()) errs.push('تاریخ حادثه در آینده است');
    if (v('address').length < 10) errs.push('نشانی کامل');
    if (errs.length) return toast('بررسی کنید: ' + errs.join('، '), true);
    let u = db.users.find(x => x.role === 'subscriber' && (x.nationalId === v('nationalId') || x.subscriptionNo === v('subscriptionNo')));
    const existing = !!u; let pw = null;
    if (u && u.nationalId !== v('nationalId')) return toast('این شماره اشتراک با کد ملی دیگری ثبت شده است.', true);
    if (!u) {
      if (db.users.some(x => x.username === v('subscriptionNo'))) return toast('نام کاربری تکراری است.', true);
      pw = S.tempPassword();
      u = { id: S.uid('u'), role: 'subscriber', username: v('subscriptionNo'), name: v('name'), nationalId: v('nationalId'), subscriptionNo: v('subscriptionNo'), mobile: v('mobile'), address: v('address'), active: true, mustChangePassword: true, createdAt: new Date().toISOString(), pwHash: await S.hashPw(v('subscriptionNo'), pw) };
      db.users.push(u);
    }
    db.seq += 1;
    const now = new Date().toISOString();
    const late = W.daysBetween(d, new Date()) > db.settings.reportWindowDays;
    const c = {
      id: S.uid('c'), code: W.claimCode(db.seq), subscriberId: u.id, createdBy: st.user.id, createdAt: now, status: 'draft', statusAt: now, submitCount: 0,
      incident: { date: W.jalaliString(d), time: '', type: f.type.value, placeType: 'residential', address: v('address'), postalCode: '', description: '', fireReportNo: '', policeReportNo: '' },
      damage: { kinds: [], items: [], injured: [], deceased: [] }, photos: [], docs: {}, files: {}, bank: { sheba: '', holder: u.name }, declaration: false,
      deficiencies: [], messages: [], gasReport: {}, assessment: null, payment: null,
      timeline: [{ at: now, by: st.user.name, role: 'gas', action: 'create', label: existing ? 'تشکیل پرونده جدید برای مشترک موجود' : 'تشکیل پرونده و ایجاد حساب مشترک', note: [f.note.value.trim(), late ? `اعلام با تأخیر: بیش از ${db.settings.reportWindowDays} روز پس از حادثه` : ''].filter(Boolean).join(' — ') }],
    };
    db.claims.push(c);
    S.sendSms(u.mobile, pw ? `مشترک گرامی، پرونده خسارت ${c.code} تشکیل شد. نام کاربری: ${u.username} — رمز موقت: ${pw}` : `مشترک گرامی، پرونده خسارت ${c.code} برای شما تشکیل شد. با حساب قبلی وارد شوید.`);
    S.notify({ toUser: u.id, text: `پرونده ${c.code} تشکیل شد. لطفاً اطلاعات و مدارک را تکمیل کنید.`, claimId: c.id });
    persist();
    go('registered', { claimId: c.id, username: u.username, password: pw, existing });
  },
  settings: f => {
    const s = db.settings;
    for (const k of Object.keys(s)) {
      if (!f[k]) continue;
      s[k] = typeof s[k] === 'number' ? num(f[k].value) : W.normalizeDigits(f[k].value).trim();
    }
    persist(); toast('تنظیمات ذخیره شد.'); render();
  },
  staff: async f => {
    const username = f.username.value.trim();
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return toast('این نام کاربری وجود دارد.', true);
    const u = { id: S.uid('u'), role: f.role.value, username, name: f.name.value.trim(), org: f.org.value.trim(), active: true, mustChangePassword: true, createdAt: new Date().toISOString(), pwHash: '' };
    db.users.push(u); await resetPassword(u); render();
  },
};

function onBind(el) {
  const c = currentClaim(); if (!c) return;
  const path = el.dataset.bind;
  let val = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.num !== undefined) val = num(val);
  else if (typeof val === 'string' && /(date|time|postalCode|ReportNo|qty|amount|nationalId|ref)$/.test(path)) val = W.normalizeDigits(val).trim();
  if (path.endsWith('.amount')) val = String(num(val) || '');
  if (path === 'bank.sheba') val = W.normalizeDigits(val).replace(/\s|-/g, '').toUpperCase();
  if (path.startsWith('assessment')) c.assessment ||= { adjuster: '', visitDate: '', note: '', items: [] };
  if (path.startsWith('payment')) c.payment ||= {};
  setPath(c, path, val);
  persist();
  // بخش‌هایی که نمایش وابسته دارند دوباره رسم می‌شوند
  if (/\.amount$/.test(path)) {
    const d = c.damage; const t = $('#dmgTotal');
    if (t) t.textContent = money((d.items || []).reduce((a, i) => a + num(i.amount), 0) + (d.injured || []).reduce((a, i) => a + num(i.amount), 0));
    el.value = val ? nf.format(+val) : '';
  } else if (path.startsWith('assessment.items')) {
    const box = $('#assessSum'); if (box) box.innerHTML = assessSummary(c);
    if (el.dataset.num !== undefined) el.value = nf.format(val);
  } else if (path === 'bank.sheba') {
    const h = $('#sheba-hint'); const ok = W.isValidSheba(val);
    if (h) { h.textContent = ok ? '✓ شماره شبا معتبر است' : 'شماره شبا معتبر نیست؛ IR و ۲۴ رقم'; h.className = ok ? '' : 'err'; }
  } else if (el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT') {
    const y = window.scrollY; render(); window.scrollTo({ top: y });
  }
}

function wire() {
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const n = nav.dataset.nav;
      if (n === 'profile') return profileSheet();
      if (n === 'messenger') return messengerSheet();
      if (n === 'list') { st.q = ''; return go('list', { f: 'all' }); }
      return go('home');
    }
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); closeSheet(); if (g.dataset.go !== st.view) st.q = ''; return go(g.dataset.go, g.dataset.p ? JSON.parse(g.dataset.p) : {}); }
    const a = e.target.closest('[data-act]');
    if (a && ACTS[a.dataset.act]) { e.preventDefault(); ACTS[a.dataset.act](a); }
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    FORMS[f.dataset.form]?.(f);
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('input[type=file][data-upload]')) return handleUpload(el);
    if (el.matches('[data-kind]')) {
      const c = currentClaim(); const k = el.dataset.kind;
      c.damage.kinds = el.checked ? [...new Set([...c.damage.kinds, k])] : c.damage.kinds.filter(x => x !== k);
      if (el.checked && k === 'property' && !c.damage.items.length) c.damage.items.push({ title: '', qty: 1, amount: '' });
      if (el.checked && k === 'medical' && !c.damage.injured.length) c.damage.injured.push({ name: '', relation: '', hospital: '', amount: '' });
      if (el.checked && k === 'death' && !c.damage.deceased.length) c.damage.deceased.push({ name: '', nationalId: '', relation: '' });
      persist(); render(); return;
    }
    if (el.matches('[data-bind]')) onBind(el);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { st.q = e.target.value; const l = $('#claimList'); if (l) l.innerHTML = listHtml(); }
    if (e.target.id === 'uq') { st.q = e.target.value; const pos = e.target.selectionStart; render(); const n = $('#uq'); n.focus(); n.setSelectionRange(pos, pos); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
}

// ================= راه‌اندازی =================
async function boot() {
  const t = lget('gii.theme'); if (t) document.documentElement.dataset.theme = t;
  db = S.load() || await S.seed();
  wire();
  const uid = sget('gii.user');
  st.user = uid ? db.users.find(u => u.id === uid && u.active) || null : null;
  if (st.user) { try { const v = JSON.parse(sget('gii.view') || 'null'); if (v) { st.view = v.view; st.p = v.p || {}; if (st.p.id) st.claimId = st.p.id; } } catch { /* نادیده */ } }
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();

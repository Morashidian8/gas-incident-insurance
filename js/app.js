import * as W from './workflow.js';
import * as S from './store.js';
import * as LOCAL from './backend-local.js';
import * as WPB from './backend-wp.js';
import { icon, illo, brandMark } from './icons.js';

// داخل وردپرس (افزونه) داده‌ها روی سرور است؛ در غیر این صورت همین مرورگر.
const B = window.GII_WP ? WPB : LOCAL;

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

// همان کد دو چهره دارد: «app» (اپ نصب‌شدنی موبایل) و «site» (سایت با چیدمان رومیزی).
// نشانی طرف مقابل از ویژگی‌های data-* تگ html خوانده می‌شود (tools/build_single.py آنها را می‌نویسد).
const MODE = document.documentElement.dataset.mode === 'site' ? 'site' : 'app';
const OTHER_URL = location.protocol.startsWith('http') ? document.documentElement.dataset.otherUrl || (MODE === 'site' ? '../' : 'site/') : '';

const st = { user: null, view: 'login', p: {}, open: new Set(['claim']), q: '', claimId: null };
let db;

const userById = id => db.users.find(u => u.id === id);
const claimById = id => db.claims.find(c => c.id === id);
// ذخیره ویرایش فیلدهای پرونده؛ در وردپرس با تأخیر کوتاه به سرور فرستاده می‌شود
function saveClaim(c = currentClaim()) { if (c) B.saveClaim(c).catch(e => toast(e.message, true)); }
// داده را از پشتیبان دوباره می‌خواند (در حالت محلی همان شیء است)
async function sync() {
  db = await B.refresh();
  const id = B.meId();
  st.user = id ? db.users.find(u => u.id === id) || null : null;
}
// یک عمل پشتیبان را اجرا می‌کند، داده را تازه می‌کند و در صورت خطا پیام می‌دهد؛ نتیجه یا undefined
async function run(fn, okMsg) {
  try {
    const r = await fn();
    await sync();
    if (okMsg) toast(okMsg);
    return r ?? true;
  } catch (e) {
    toast(e.message, true);
    if (e.status === 401 || e.status === 403) { await sync().catch(() => {}); render(); }
    return undefined;
  }
}
const demoOn = () => B.kind === 'local' || !!db.demo;
// در وردپرس فهرست حساب‌های نمایشی را سرور می‌دهد (فقط وقتی حالت نمایشی روشن است)
const demoList = () => (B.kind === 'wp' ? db.demoAccounts || [] : DEMO);

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
function badge(c) {
  const s = W.STATUS[c.status];
  const label = c.status === 'payment' ? W.FIN_STAGES.find(x => x.id === W.finStage(c)).short : s.short;
  return `<span class="badge ${s.tone}">${esc(label)}</span>`;
}
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
function markRead(c) { B.markRead(c); }

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
  const site = MODE === 'site';
  if (!st.user) { app.innerHTML = site ? siteHeader() + viewLanding() + siteFooter() : viewLogin(); if (site) startJourney(); return; }
  if (st.user.mustChangePassword) { app.innerHTML = (site ? siteHeader() : topbar()) + `<main class="page narrow">${viewForcePassword()}</main>`; return; }
  const v = VIEWS[st.user.role][st.view] || VIEWS[st.user.role].home;
  const main = `<main class="page ${st.user.role === 'subscriber' ? 'narrow' : ''}">${v()}</main>`;
  app.innerHTML = site ? siteHeader() + main + siteFooter() : topbar() + main + bottomNav();
  hydrateFiles(app);
  const tab = $('.tab.on');
  if (tab) { const y = window.scrollY; tab.scrollIntoView({ block: 'nearest', inline: 'center' }); window.scrollTo({ top: y }); }
}

// بازسازی صفحه بدون پرش به بالا (فیلترهای گزارش، تازه‌سازی خودکار)
function renderKeep() { const y = window.scrollY; render(); window.scrollTo({ top: y }); }

// اگر مدیر چیزی تنظیم نکرده باشد، مقدار پیش‌فرض نسخه ساخته‌شده (tools/build_single.py --logo) به کار می‌رود
const brandSetting = k => (k in db.settings ? db.settings[k] : W.DEFAULT_SETTINGS[k]) || '';
function logoHtml(size) {
  const src = brandSetting('logoDataUrl');
  return src ? `<span class="org-logo" style="width:${size}px;height:${size}px;padding:${Math.round(size * 0.12)}px"><img src="${esc(src)}" alt="${esc(brandSetting('orgName') || 'لوگوی سازمان')}"></span>` : brandMark(size);
}

function siteHeader() {
  const u = st.user;
  const n = u ? unreadNotifs().length : 0;
  const nav = u ? navItems().map(i => `<button class="site-link ${i.on ? 'on' : ''}" data-nav="${i.id}" ${i.on ? 'aria-current="page"' : ''}>${icon(i.ic)}<span>${i.id === 'profile' ? esc(u.name) : i.label}</span>${i.dot ? `<span class="dot">${fa(i.dot)}</span>` : ''}</button>`).join('')
    : `<a class="site-link" href="#journey">مسیر پرونده</a><a class="site-link" href="#docs">مدارک لازم</a><a class="site-link" href="#faq">پرسش‌ها</a>`;
  return `<header class="site-head ${u ? '' : 'on-hero'}"><div class="site-head-in">
    <div class="brand">${logoHtml(44)}<div><b>بیمه حوادث مشترکین گاز</b><small>${esc(u ? W.ROLES[u.role] : brandSetting('orgName') || 'سامانه پرونده خسارت')}</small></div></div>
    <nav class="site-nav" aria-label="ناوبری اصلی">${nav}</nav>
    <div class="site-tools">
      <button class="sq-btn" data-act="help" aria-label="پرسش‌های متداول">${icon('help')}</button>
      ${u ? `<button class="sq-btn" data-act="notifs" aria-label="اعلان‌ها">${icon('bell')}${n ? `<span class="dot">${fa(n)}</span>` : ''}</button>` : `<a class="btn sm ember" href="#login">${icon('lock')} ورود</a>`}
    </div>
  </div></header>`;
}
function siteFooter() {
  return `<footer class="site-foot"><div class="site-foot-in">
    <div class="foot-brand">${logoHtml(52)}<div><b>بیمه حوادث مشترکین گاز</b><span>تشکیل، تکمیل و پیگیری آنلاین پرونده خسارت حوادث گاز طبیعی</span></div></div>
    <div class="foot-col"><b>اورژانس گاز</b><span class="foot-big num">۱۹۴</span><span>بوی گاز؟ شیر اصلی را ببندید، کلید برق نزنید و از محل خارج شوید.</span></div>
    <div class="foot-col"><b>دسترسی</b>${OTHER_URL ? `<a href="${esc(OTHER_URL)}">${icon('sms')} اپ موبایل قابل نصب</a>` : ''}<a href="#journey">${icon('history')} مسیر پرونده</a><a href="#faq">${icon('help')} پرسش‌های متداول</a></div>
  </div><div class="foot-note">داده‌های نسخه نمایشی فقط در همین مرورگر ذخیره می‌شود و با اپ موبایل روی همین دستگاه مشترک است.</div></footer>`;
}

function topbar() {
  const n = unreadNotifs().length;
  return `<header class="topbar"><div class="topbar-in">
    <button class="sq-btn" data-act="help" aria-label="راهنما و پرسش‌های متداول">${icon('help')}</button>
    <div class="brand">${logoHtml(42)}<div><b>بیمه حوادث گاز</b><small>${esc(W.ROLES[st.user?.role] || 'سامانه پرونده خسارت')}</small></div></div>
    <button class="sq-btn" data-act="notifs" aria-label="اعلان‌ها">${icon('bell')}${n ? `<span class="dot">${fa(n)}</span>` : ''}</button>
  </div></header>`;
}

function navItems() {
  const r = st.user.role;
  const unread = totalUnreadMsgs();
  const homeViews = ['home', 'sections', 'sec', 'track', 'register', 'registered', 'review', 'users', 'settings', 'sms'];
  return [
    { id: 'home', label: 'خانه', ic: 'home', on: homeViews.includes(st.view) },
    ...(r !== 'subscriber' ? [{ id: 'list', label: 'پرونده‌ها', ic: 'inbox', on: st.view === 'list', hideSm: true }, { id: 'reports', label: 'گزارش', ic: 'chart', on: st.view === 'reports' }] : []),
    { id: 'messenger', label: 'پیام‌رسان', ic: 'send', on: ['inbox', 'thread'].includes(st.view), dot: unread },
    { id: 'profile', label: 'پروفایل', ic: 'user', on: false },
  ];
}
function bottomNav() {
  const items = navItems();
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
function closeSheet() { const s = $('#sheet'); if (s) s.remove(); clearInterval(otpTick); }

// ================= فایل‌ها =================
const urlCache = new Map();
async function hydrateFiles(root) {
  for (const img of root.querySelectorAll('img[data-file]')) {
    const id = img.dataset.file;
    if (!urlCache.has(id)) {
      const blob = await B.getFile(img.dataset.claim, id).catch(() => null);
      if (!blob) { img.alt = 'فایل در دسترس نیست'; continue; }
      urlCache.set(id, URL.createObjectURL(blob));
    }
    img.src = urlCache.get(id);
  }
}
function thumb(c, id, removable) {
  const f = c.files[id] || { name: 'فایل', type: '' };
  const isImg = f.type.startsWith('image/');
  return `<div class="thumb"><button class="link" style="all:unset;cursor:pointer;display:block;width:100%;height:100%" data-act="viewFile" data-file="${id}" data-claim="${c.id}" aria-label="نمایش ${esc(f.name)}">
    ${isImg ? `<img data-file="${id}" data-claim="${c.id}" alt="${esc(f.name)}">` : `<div class="pdf">${icon('doc')}${esc(f.name)}</div>`}</button>
    ${removable ? `<button class="rm" data-act="rmFile" data-file="${id}" aria-label="حذف">${icon('trash')}</button>` : ''}</div>`;
}
function addFileBtn(target, label = 'افزودن', accept = 'image/*,application/pdf') {
  return `<label class="add-file">${icon('upload')}<span>${label}</span><input type="file" multiple accept="${accept}" data-upload="${target}"></label>`;
}

// لوگو به‌صورت data URL در تنظیمات ذخیره می‌شود؛ تصاویر بزرگ به ۳۲۰ پیکسل کوچک می‌شوند.
async function handleLogo(input) {
  const file = input.files[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return toast('فقط PNG، JPG، WEBP یا SVG.', true);
  let blob = file;
  if (file.type !== 'image/svg+xml') {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      blob = await new Promise(r => c.toBlob(r, 'image/png'));
    } catch { /* همان فایل اصلی */ }
  }
  if (blob.size > 400 * 1024) return toast('حجم لوگو زیاد است؛ فایلی کمتر از ۴۰۰ کیلوبایت انتخاب کنید.', true);
  const logoDataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  await run(() => B.saveSettings({ logoDataUrl }), 'لوگو ذخیره شد.'); render();
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
    const name = blob === file ? file.name : file.name.replace(/\.\w+$/, '') + '.jpg';
    try { await B.upload(c, target, blob, name); added++; } catch (e) { toast(`«${file.name}»: ${e.message}`, true); }
  }
  await sync().catch(() => {});
  if (added) toast(`${fa(added)} فایل بارگذاری شد.`);
  render();
}

// ================= ورود =================
const DEMO = [
  { u: '1023456789', p: '123456', t: 'مشترک — پرونده دارای نقص', s: 'حمید رضایی', ic: 'alert' },
  { u: '1045678912', p: '123456', t: 'مشترک — منتظر تأیید مبلغ', s: 'مریم احمدی', ic: 'money' },
  { u: '1067891234', p: '123456', t: 'مشترک — ورود اول با رمز موقت', s: 'رضا کریمی', ic: 'key' },
  { u: '1024681357', p: '123456', t: 'مشترک — حواله صادر شده', s: 'علیرضا تهرانی', ic: 'receipt' },
  { u: 'gas', p: 'gas123', t: 'کارشناس شرکت گاز', s: 'سارا کاظمی', ic: 'flame' },
  { u: 'bime', p: 'bime123', t: 'کارشناس بیمه‌گر', s: 'علی محمدی', ic: 'shield' },
  { u: 'admin', p: 'admin123', t: 'مدیر سامانه', s: 'کاربران، تنظیمات و گزارش', ic: 'settings' },
];
function viewLogin() {
  return `<div class="login-hero"><div class="login-hero-in">${logoHtml(84)}${brandSetting('orgName') ? `<div class="org-name">${esc(brandSetting('orgName'))}</div>` : ''}
      <h1>بیمه حوادث مشترکین گاز</h1>
      <p>ثبت، تکمیل و پیگیری پرونده خسارت حوادث ناشی از گاز طبیعی؛ از مشترک تا شرکت گاز و بیمه‌گر.</p></div></div>
    <main class="page narrow login-card">
      ${loginForm()}
      ${fireCta()}
      <div class="flow">
        <div>${icon('upload')}<b>مشترک</b>بارگذاری مدارک</div>
        <div>${icon('flame')}<b>شرکت گاز</b>بررسی و تأیید</div>
        <div>${icon('money')}<b>بیمه‌گر</b>ارزیابی و پرداخت</div>
      </div>
      ${demoRows()}
      ${OTHER_URL ? `<a class="alt-link" href="${esc(OTHER_URL)}">${icon('eye')} اپ باز نمی‌شود؟ از طریق سایت وارد شوید</a>` : ''}
    </main>`;
}
function loginForm() {
  return `<form class="form" data-form="login" autocomplete="on" id="login">
      <label class="fld" for="lg-user"><span>نام کاربری</span><input id="lg-user" name="username" type="text" class="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="برای مشترکین: شماره اشتراک گاز"></label>
      <label class="fld" for="lg-pass"><span>رمز عبور</span><input id="lg-pass" name="password" type="password" class="ltr" autocomplete="current-password" required placeholder="رمز عبور یا رمز موقت پیامک‌شده"></label>
      <button class="link forgot" type="button" data-act="forgot">${icon('key')} رمز عبور را فراموش کرده‌ام</button>
      <button class="btn" type="submit">${icon('lock')} ورود به سامانه</button>
      <div class="note info">${icon('help')}<div>حساب مشترک را شرکت گاز پس از مراجعه حضوری شما می‌سازد و نام کاربری و رمز موقت را پیامک می‌کند.</div></div>
    </form>`;
}
function demoRows() {
  if (!demoOn()) return '';
  return `<div class="section-label">حساب‌های نمایشی</div>
      <div class="rows">${demoList().map((d, i) => `<button class="row" data-act="demoLogin" data-i="${i}">${icon(d.ic)}<span class="main"><span class="t">${d.t}</span><span class="s">${d.s}</span></span>${icon('chevL', 'chev')}</button>`).join('')}</div>
      <p class="demo-tag">همه اشخاص، پرونده‌ها و مبالغ نسخه نمایشی ساختگی‌اند و فقط در همین مرورگر ذخیره می‌شوند.</p>`;
}

// ---------- مسیر پرونده (موشن‌گرافی مراحل) ----------
// شش ایستگاه از حادثه تا واریز؛ نشانگر پرونده روی مسیر حرکت می‌کند و کارت هر مرحله جایگزین قبلی می‌شود.
// مهلت‌ها از تنظیمات مدیر خوانده می‌شود تا با قرارداد جاری یکی باشد.
function journeySteps() {
  const s = db.settings;
  return [
    { art: 'houseFire', a: '#f26b21', b: '#3a8cc3', who: 'مشترک', t: 'وقوع حادثه و مراجعه', d: `پس از آتش‌سوزی، انفجار یا گازگرفتگی، گزارش آتش‌نشانی یا کارشناس رسمی دادگستری را بگیرید که در آن علت حادثه «گاز» قید شده باشد؛ سپس با کارت ملی به امور حوادث شرکت گاز منطقه مراجعه کنید.`, when: `حداکثر ${fa(s.reportWindowDays)} روز پس از حادثه` },
    { art: 'sms', a: '#3a8cc3', b: '#1f9d57', who: 'شرکت گاز', t: 'ساخت حساب و پیامک رمز', d: 'کارشناس گاز پرونده و حساب کاربری شما را می‌سازد. نام کاربری (شماره اشتراک) و رمز موقت پیامک می‌شود.', when: 'همان روز مراجعه' },
    { art: 'folderUp', a: '#1f9d57', b: '#3a8cc3', who: 'مشترک', t: 'تکمیل و ارسال پرونده', d: 'اطلاعات حادثه، فهرست خسارت‌ها، دست‌کم ۴ عکس، مدارک و شماره شبا را بارگذاری و پرونده را ارسال کنید.', when: 'هر زمان، از گوشی یا کامپیوتر' },
    { art: 'docsCheck', a: '#f2a024', b: '#3a8cc3', who: 'شرکت گاز', t: 'بررسی مدارک در شرکت گاز', d: 'کارشناس گاز مدارک را بررسی می‌کند؛ به‌ویژه اینکه در گزارش آتش‌نشانی یا کارشناس رسمی دادگستری، علت حادثه «گاز» قید شده باشد. سپس پرونده را برای بیمه‌گر می‌فرستد.', when: `تا ${fa(s.gasSlaDays)} روز`, loop: `اگر نقصی باشد، پرونده با پیامک برمی‌گردد و ${fa(s.fixSlaDays)} روز برای اصلاح فرصت دارید.` },
    { art: 'trackRial', a: '#6d5bd0', b: '#3a8cc3', who: 'بیمه‌گر', t: 'ارزیابی خسارت', d: 'ارزیاب بیمه خسارت را بررسی می‌کند و مبلغ قابل پرداخت را پس از کسر فرانشیز اعلام می‌کند.', when: `تا ${fa(s.insurerSlaDays)} روز` },
    { art: 'payment', a: '#1f9d57', b: '#f26b21', who: 'مشترک و بیمه‌گر', t: 'تأیید مبلغ و واریز', d: 'مبلغ را می‌پذیرید یا با دلیل اعتراض می‌کنید. پس از تأیید، خسارت به شبای شما واریز و شماره پیگیری پیامک می‌شود.', when: 'پس از تأیید شما' },
  ];
}
function journeyHtml(compact = false) {
  const steps = journeySteps();
  return `<section class="journey ${compact ? 'compact' : ''}" id="journey" data-i="0" style="--n:${steps.length};--p:0" aria-roledescription="نمایش مرحله‌به‌مرحله">
    ${compact ? '' : `<div class="j-head"><div><span class="eyebrow">مسیر پرونده شما</span><h2>از تشکیل پرونده تا دریافت خسارت</h2><p>شش ایستگاه، با مهلت هر مرحله و اینکه کار دست کیست.</p></div></div>`}
    <div class="j-track" role="tablist" aria-label="مراحل پرونده">
      <div class="j-rail"><div class="j-fill"></div></div>
      <div class="j-token" aria-hidden="true">${icon('doc')}</div>
      ${steps.map((st_, i) => `<button class="j-st" role="tab" data-act="jGo" data-i="${i}" aria-label="مرحله ${fa(i + 1)}: ${st_.t}"><span class="j-dot">${fa(i + 1)}</span><span class="j-lbl">${st_.t}</span></button>`).join('')}
    </div>
    <div class="j-stage" aria-live="polite">${steps.map((st_, i) => `<article class="j-card" data-k="${i}">
        <div class="j-art">${illo(st_.art, st_.a, st_.b)}</div>
        <div class="j-txt"><span class="j-who">${icon(st_.who === 'بیمه‌گر' ? 'shield' : st_.who === 'شرکت گاز' ? 'flame' : 'user')} ${st_.who}</span>
          <h3><span class="num">${fa(i + 1)}</span> ${st_.t}</h3><p>${st_.d}</p>
          <span class="j-when">${icon('clock')} ${st_.when}</span>
          ${st_.loop ? `<div class="j-loop"><svg viewBox="0 0 64 28" aria-hidden="true"><path d="M58 22C58 6 6 6 6 22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="5 5"/><path d="M2 16l4 7 5-6" fill="none" stroke="currentColor" stroke-width="2.5"/></svg><span>${st_.loop}</span></div>` : ''}
        </div></article>`).join('')}</div>
    <div class="j-ctrl">
      <button class="j-btn" data-act="jStep" data-d="-1" aria-label="مرحله قبل">${icon('chevR')}</button>
      <button class="j-btn play" data-act="jPlay" aria-label="توقف یا پخش">${icon('pause')}${icon('play')}</button>
      <button class="j-btn" data-act="jStep" data-d="1" aria-label="مرحله بعد">${icon('chevL')}</button>
      <div class="j-timer"><span></span></div>
    </div>
  </section>`;
}
const J_MS = 4200;
let jTimer = null;
function jSet(i) {
  const j = $('.journey'); if (!j) return;
  const n = journeySteps().length;
  i = (i + n) % n;
  j.dataset.i = i;
  j.style.setProperty('--p', i / (n - 1));
  j.querySelectorAll('.j-st').forEach((b, k) => { b.classList.toggle('done', k < i); b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i); });
  j.querySelectorAll('.j-card').forEach((c, k) => { c.classList.toggle('on', k === i); c.setAttribute('aria-hidden', k !== i); });
  const bar = j.querySelector('.j-timer span');
  bar.classList.remove('run'); void bar.offsetWidth;
  if (j.dataset.play === '1') bar.classList.add('run');
}
function startJourney() {
  clearInterval(jTimer); jTimer = null;
  const j = $('.journey'); if (!j) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  j.dataset.play = reduced ? '0' : '1';
  j.style.setProperty('--j-ms', J_MS + 'ms');
  jSet(0);
  jTimer = setInterval(() => {
    const jj = $('.journey');
    if (!jj) { clearInterval(jTimer); jTimer = null; return; }
    if (jj.dataset.play === '1' && !document.hidden) jSet(+jj.dataset.i + 1);
  }, J_MS);
}

// صفحه نخست سایت: معرفی و ورود، مسیر پرونده، مدارک، پرسش‌ها
function viewLanding() {
  const docs = [
    ['flame', 'ember', 'مهم‌ترین مدرک', ['گزارش آتش‌نشانی یا کارشناس رسمی دادگستری', 'در گزارش باید صریحاً نوشته شده باشد که علت حادثه «گاز» بوده است', 'گزارش با علت نامعلوم یا غیر از گاز پذیرفته نمی‌شود']],
    ['doc', 'blue', 'همه پرونده‌ها', ['کارت ملی مشترک', 'سند مالکیت یا اجاره‌نامه', 'آخرین قبض گاز', 'گواهی شماره شبا', 'دست‌کم ۴ عکس از محل حادثه', 'فاکتور یا برآورد اقلام خسارت‌دیده']],
    ['people', 'violet', 'مصدومیت', ['پرونده پزشکی و صورت‌حساب بیمارستان', 'گواهی پزشکی قانونی', 'گزارش کلانتری']],
    ['alert', 'green', 'فوت', ['گواهی فوت', 'گواهی انحصار وراثت و مدارک وراث', 'گواهی پزشکی قانونی', 'گزارش کلانتری']],
  ];
  return `<section class="hero"><div class="hero-glow" aria-hidden="true"></div><div class="wrap hero-grid">
      <div class="hero-copy">
        ${brandSetting('orgName') ? `<span class="eyebrow light">${esc(brandSetting('orgName'))}</span>` : ''}
        <h1>خسارت حادثه گاز را <em>بی‌رفت‌وآمد</em> پیگیری کنید</h1>
        <p>پس از آتش‌سوزی، انفجار یا گازگرفتگی، مدارک را آنلاین بفرستید و ببینید پرونده‌تان در شرکت گاز و نزد بیمه‌گر به کجا رسیده است.</p>
        <ul class="hero-facts">
          <li><b class="num">۶</b><span>ایستگاه شفاف تا واریز</span></li>
          <li><b>${icon('sms')}</b><span>پیامک در هر مرحله</span></li>
          <li><b>${icon('alert')}</b><span>اعلام دقیق هر نقص</span></li>
        </ul>
        <div class="hero-cta"><a class="btn ember" href="#journey">${icon('history')} مسیر پرونده را ببینید</a>${OTHER_URL ? `<a class="btn ghost-light" href="${esc(OTHER_URL)}">${icon('sms')} اپ موبایل</a>` : ''}</div>
      </div>
      <div class="hero-login"><div class="glass"><h2>ورود به سامانه</h2>${loginForm()}</div>${fireCta()}</div>
    </div></section>
    <div class="band">${journeyHtml()}</div>
    <section id="docs" class="wrap sec">
      <div class="sec-head"><span class="eyebrow">پیش از شروع</span><h2>مدارک لازم</h2><p>سامانه فهرست دقیق را بر اساس نوع حادثه و خسارت شما می‌سازد؛ این خلاصه برای آمادگی است.</p></div>
      <div class="doc-grid">${docs.map(([ic, tone, t, list]) => `<article class="doc-tile ${tone}"><span class="doc-ic">${icon(ic)}</span><h3>${t}</h3><ul>${list.map(x => `<li>${icon('check')}${x}</li>`).join('')}</ul></article>`).join('')}</div>
      <p class="warn-line">${icon('alert')} تا عکاسی از محل و صدور گزارش آتش‌نشانی یا کارشناس رسمی، محل حادثه را تعمیر یا پاک‌سازی نکنید.</p>
    </section>
    <section id="faq" class="wrap sec faq-split">
      <div class="faq-aside"><span class="eyebrow light">پاسخ سریع</span><h2>پرسش‌های متداول</h2><p>پاسخ رایج‌ترین پرسش‌ها درباره پوشش، مدارک، نقص پرونده و اعتراض.</p>
        <div class="sos"><span>${icon('flame')}</span><div><b>اورژانس گاز</b><span class="num">۱۹۴</span></div></div></div>
      <div class="faq faq-list">${FAQ.map(([q, a]) => `<details><summary>${q}${icon('chevD')}</summary><p>${a}</p></details>`).join('')}</div>
    </section>
    <section class="wrap sec land-demo">${demoRows()}</section>`;
}

async function doLogin(username, password) {
  if (!await run(() => B.login(username, password))) return;
  st.claimId = null;
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
  else if (c.status === 'payment') bar = `<div class="pill-bar"><span>${esc(W.FIN_STAGES.find(x => x.id === W.finStage(c)).label)}:</span><span class="amt num">${money(c.payment?.amount || pay)}</span></div>`;
  else if (['assessed', 'objection'].includes(c.status)) bar = `<div class="pill-bar"><span>مبلغ تعیین‌شده خسارت:</span><span class="amt num">${money(pay)}</span></div>`;
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
  ${['payment', 'paid'].includes(c.status) ? `<button class="note info as-link" data-go="track">${icon('receipt')}<div><b>${c.status === 'paid' ? 'رسید واریز خسارت' : 'پرداخت در جریان است'}</b>مراحل مالی، شماره حواله و پیگیری بانکی را در «پیگیری پرونده» ببینید.</div>${icon('chevL', 'chev')}</button>` : ''}
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
        ${field('شماره گزارش کلانتری', 'incident.policeReportNo', fa(inc.policeReportNo), { dis, hint: 'در حوادث منجر به جرح یا فوت الزامی است' })}
      </div>
      ${field('شرح حادثه', 'incident.description', inc.description, { req: true, area: true, dis, ph: 'چه اتفاقی افتاد؟ از کدام وسیله گازسوز شروع شد؟ چه بخش‌هایی آسیب دید؟' })}
      ${causeBox(c, dis)}
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

// گزارش آتش‌نشانی یا کارشناس رسمی دادگستری: مهم‌ترین مدرک پرونده، چون شرکت گاز بازدید ندارد
function causeBox(c, dis) {
  const inc = c.incident;
  return `<div class="cause-box">
    <div class="cause-head">${icon('flame')}<b>گزارش علت حادثه <i>*</i></b></div>
    <p>گزارش <b>آتش‌نشانی</b> یا <b>کارشناس رسمی دادگستری</b> که در آن علت حادثه به‌صراحت «گاز» نوشته شده باشد. این مهم‌ترین مدرک پرونده است و بدون آن خسارت پرداخت نمی‌شود.</p>
    <ul>
      <li>علت باید روشن نوشته شده باشد؛ مثلاً «نشت گاز»، «انفجار ناشی از تجمع گاز» یا «آتش‌سوزی ناشی از گاز».</li>
      <li>گزارشی که علت را «نامعلوم» یا چیزی غیر از گاز (مثلاً اتصالی برق) نوشته باشد پذیرفته نمی‌شود.</li>
      <li>گزارش باید مهر و امضا، تاریخ و نشانی محل حادثه را داشته باشد.</li>
    </ul>
    <div class="grid2">
      ${field('صادرکننده گزارش', 'incident.causeIssuer', inc.causeIssuer, { req: true, opts: W.CAUSE_ISSUERS, dis })}
      ${field('شماره گزارش', 'incident.causeReportNo', fa(inc.causeReportNo), { req: true, dis })}
      ${field('تاریخ گزارش', 'incident.causeReportDate', fa(inc.causeReportDate), { req: true, ph: '۱۴۰۵/۰۷/۲۸', ltr: true, dis })}
    </div>
    <label class="check"><input type="checkbox" id="f-cause-gas" data-bind="incident.causeStatesGas" ${inc.causeStatesGas ? 'checked' : ''} ${dis ? 'disabled' : ''}>
      <span>تأیید می‌کنم در این گزارش <b>صریحاً قید شده که علت حادثه گاز بوده است.</b></span></label>
    <small>فایل یا عکس واضح همین گزارش را در بخش «مدارک» بارگذاری کنید.</small>
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
        ${required ? `<span class="badge ${d.hint ? 'warn' : 'neutral'}">${d.hint ? 'الزامی و مهم' : 'الزامی'}</span>` : '<span class="badge neutral">اختیاری</span>'}
        ${flagRole ? `<button class="btn sm ghost" data-act="flag" data-target="doc:${d.id}" data-title="${esc(d.title)}">${icon('alert')} نقص</button>` : ''}</div>
      ${d.hint ? `<p class="doc-hint">${icon('alert')}<span>${esc(d.hint)}</span></p>` : ''}
      ${flags.map(f => defectBox(c, f, editable(c) && st.user.role === 'subscriber')).join('')}
      ${files.length || canUp ? `<div class="thumbs">${files.map(id => thumb(c, id, canUp)).join('')}${canUp ? addFileBtn(d.id) : ''}</div>` : '<small class="s" style="color:var(--muted)">بارگذاری نشده</small>'}
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
  </div>${financeBlock(c)}`;
}

// ---------- پنل مالی: از قبول مبلغ تا واریز ----------
const maskSheba = v => v ? `${v.slice(0, 4)} •••• •••• ${v.slice(-4)}` : '—';
const FIN_WAIT = {
  review: 'واحد مالی بیمه‌گر مدارک پرداخت را کنترل و شبای شما را با نام ذی‌نفع تطبیق می‌دهد.',
  voucher: 'پس از بررسی مالی، حواله پرداخت به نام شما صادر می‌شود.',
  bank: 'حواله برای انتقال پایا یا ساتنا به بانک فرستاده می‌شود.',
  paid: 'مبلغ به حساب شبای شما واریز و شماره پیگیری بانکی پیامک می‌شود.',
};
function finDetails(c, id) {
  const f = c.finance || {};
  const r = W.computePayable(c.assessment.items, db.settings, c.damage.deceased?.length || 0);
  const num_ = v => `<span class="num" dir="ltr">${esc(fa(v))}</span>`;
  if (id === 'accepted') return [['تاریخ تأیید شما', fdt(c.acceptedAt)], ['مبلغ پذیرفته‌شده', money(r.payable)]];
  if (id === 'review' && f.review) return [['بررسی‌کننده', esc(f.review.reviewer)], ['تطبیق شبا با نام ذی‌نفع', `<span class="ok-txt">${icon('check')} تأیید شد</span>`], ['زمان بررسی', fdt(f.review.at)], ...(f.review.note ? [['توضیح', esc(f.review.note)]] : [])];
  if (id === 'voucher' && f.voucher) return [['شماره حواله', num_(f.voucher.voucherNo)], ['تاریخ صدور', fa(f.voucher.date)], ['مبلغ حواله', money(f.voucher.amount)], ['صادرکننده', esc(f.voucher.by)]];
  if (id === 'bank' && f.bank) return [['روش انتقال', W.TRANSFER_METHODS[f.bank.method].label], ['پیگیری دستور پرداخت', num_(f.bank.ref)], ['تاریخ ارسال به بانک', fa(f.bank.date)], ['زمان تقریبی واریز', W.TRANSFER_METHODS[f.bank.method].eta]];
  if (id === 'paid' && c.status === 'paid') return [['شماره پیگیری بانکی', num_(c.payment.ref)], ['تاریخ واریز', fa(c.payment.date)], ['مبلغ واریزی', money(c.payment.amount)], ['حساب مقصد', `<span class="num" dir="ltr">${maskSheba(c.bank.sheba)}</span>`], ['صاحب حساب', esc(c.bank.holder)]];
  return null;
}
function financeBlock(c) {
  const stage = W.finStage(c);
  if (!stage || !c.assessment) return '';
  const r = W.computePayable(c.assessment.items, db.settings, c.damage.deceased?.length || 0);
  const due = c.payment?.amount || r.payable;
  const paid = c.status === 'paid' ? due : 0;
  const cur = W.FIN_STAGES.findIndex(x => x.id === stage);
  const receipt = c.status === 'paid' ? `رسید واریز خسارت — پرونده ${c.code}\nمبلغ: ${nf.format(c.payment.amount)} ریال\nتاریخ واریز: ${c.payment.date}\nپیگیری بانکی: ${c.payment.ref}\nحواله: ${c.finance?.voucher?.voucherNo || '—'}\nحساب مقصد: ${maskSheba(c.bank.sheba)} — ${c.bank.holder}` : '';
  return `<div class="form fin">
    <div class="fin-head"><h2>${icon('receipt')} وضعیت مالی و پرداخت</h2><span class="badge ${c.status === 'paid' ? 'ok' : 'accent'}">${W.FIN_STAGES[cur].short}</span></div>
    <div class="fin-sum">
      <div><span>خسارت نهایی تأییدشده</span><b class="num">${money(due)}</b></div>
      <div><span>پرداخت‌شده</span><b class="num ok-txt">${money(paid)}</b></div>
      <div><span>مانده</span><b class="num">${money(due - paid)}</b></div>
    </div>
    <ol class="fin-steps">${W.FIN_STAGES.map((fs, i) => {
      const cls = c.status === 'paid' || i < cur ? 'done' : i === cur ? 'on' : 'todo';
      const det = cls !== 'todo' ? finDetails(c, fs.id) : null;
      return `<li class="${cls}"><span class="fin-dot">${cls === 'done' ? icon('check') : fa(i + 1)}</span><div class="fin-body"><b>${fs.label}</b>
        ${det ? `<dl class="fin-kv">${det.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : `<span class="muted">${cls === 'on' ? 'در حال انجام — ' : ''}${FIN_WAIT[fs.id] || ''}</span>`}</div></li>`;
    }).join('')}</ol>
    ${receipt ? `<div class="receipt"><div>${icon('checkC')}<b>خسارت به حساب شما واریز شد</b></div><button class="btn sm ghost" data-act="copyCred" data-text="${esc(receipt)}">${icon('copy')} رونوشت رسید</button></div>` : ''}
  </div>`;
}
function finForm(c) {
  if (st.user.role !== 'insurer' || c.status !== 'payment') return '';
  const stage = W.finStage(c);
  const r = W.computePayable(c.assessment.items, db.settings, c.damage.deceased?.length || 0);
  const today = fa(W.jalaliString(new Date()));
  const sub = userById(c.subscriberId);
  if (stage === 'accepted') return `<form class="form" data-form="fin" data-step="fin_review"><b>گام بعد: بررسی مالی و استعلام شبا</b>
    <label class="fld" for="fn-rev"><span>بررسی‌کننده مالی</span><input id="fn-rev" name="reviewer" value="${esc(st.user.name)}" required></label>
    <label class="check"><input type="checkbox" id="fn-sheba" name="shebaMatch"><span>استعلام شد: شبای <span class="num" dir="ltr">${esc(c.bank.sheba)}</span> به نام «${esc(c.bank.holder)}» است و با ذی‌نفع پرونده (${esc(sub?.name || '')}) مطابقت دارد.</span></label>
    <label class="fld" for="fn-note"><span>توضیح (اختیاری)</span><textarea id="fn-note" name="note" style="min-height:60px"></textarea></label>
    <button class="btn green" type="submit">${icon('check')} ثبت بررسی مالی</button></form>`;
  if (stage === 'review') return `<form class="form" data-form="fin" data-step="fin_voucher"><b>گام بعد: صدور حواله پرداخت</b>
    <div class="grid2"><label class="fld" for="fn-vno"><span>شماره حواله</span><input id="fn-vno" name="voucherNo" class="ltr" required value="H-${W.toJalali(new Date()).jy}-${esc(c.code.slice(-6))}"></label>
    <label class="fld" for="fn-vdate"><span>تاریخ صدور</span><input id="fn-vdate" name="date" class="ltr" required value="${today}"></label></div>
    <div class="sumline total"><span>مبلغ حواله (طبق ارزیابی)</span><b>${money(r.payable)}</b></div><input type="hidden" name="amount" value="${r.payable}">
    <button class="btn green" type="submit">${icon('receipt')} صدور حواله</button></form>`;
  if (stage === 'voucher') return `<form class="form" data-form="fin" data-step="fin_bank"><b>گام بعد: ارسال دستور پرداخت به بانک</b>
    <div class="grid2"><label class="fld" for="fn-m"><span>روش انتقال</span><select id="fn-m" name="method">${Object.entries(W.TRANSFER_METHODS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
    <label class="fld" for="fn-ref"><span>شماره پیگیری دستور پرداخت</span><input id="fn-ref" name="ref" class="ltr" required></label>
    <label class="fld" for="fn-bdate"><span>تاریخ ارسال</span><input id="fn-bdate" name="date" class="ltr" required value="${today}"></label></div>
    <small class="muted">مقصد: <span class="num" dir="ltr">${esc(c.bank.sheba)}</span> — ${esc(c.bank.holder)}</small>
    <button class="btn green" type="submit">${icon('send')} ثبت ارسال به بانک</button></form>`;
  return `<div class="form"><b>گام آخر: ثبت واریز</b>
    <div class="grid2">${field('شماره پیگیری بانکی واریز', 'payment.ref', fa(c.payment?.ref), { req: true, ltr: true })}${field('تاریخ واریز', 'payment.date', fa(c.payment?.date), { req: true, ltr: true, ph: today })}</div>
    <div class="sumline total"><span>مبلغ واریزی</span><b>${money(c.payment?.amount || r.payable)}</b></div>
    <button class="btn green" data-act="doAction" data-action="ins_pay">${icon('checkC')} ثبت واریز و اطلاع به مشترک</button></div>`;
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

function dashLink() {
  const L = W.liveStatus(visibleClaims());
  const paid = L.groups.find(g => g.id === 'paid').count;
  return `<button class="dash-link" data-go="reports"><span class="dl-ic">${icon('chart')}</span><span class="dl-t"><b>گزارش‌ها و داشبورد لحظه‌ای</b><small>${fa(L.total)} پرونده · ${fa(L.referred)} ارجاع به بیمه · ${fa(paid)} پرداخت‌شده — گزارش ماهانه و خروجی Excel</small></span>${icon('chevL', 'chev')}</button>`;
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
  ${dashLink()}
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
  </div></div>
  ${dashLink()}`;
}

// ---------- صفحه بررسی پرونده (کارکنان) ----------
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
  const tabs = [['summary', 'خلاصه', 'list'], ['files', 'مدارک و عکس', 'image'], ['defects', `نقص‌ها${openDef ? ' (' + fa(openDef) + ')' : ''}`, 'alert'],
    ...(st.user.role !== 'subscriber' && (c.forwardedAt || st.user.role === 'insurer') ? [['assess', 'ارزیابی خسارت', 'money']] : []), ['chat', `پیام‌ها${unreadMsgs(c) ? ' (' + fa(unreadMsgs(c)) + ')' : ''}`, 'chat'], ['history', 'تاریخچه', 'history']];
  const actBtns = acts.map(a => {
    const tone = /reject/.test(a.id) ? 'red ghost' : /return|query|object/.test(a.id) ? 'orange' : /forward|assess|pay|answer/.test(a.id) ? 'green' : '';
    return `<button class="btn ${tone}" data-act="doAction" data-action="${a.id}">${esc(a.label)}</button>`;
  }).join('');
  let body = '';
  if (tab === 'summary') body = reviewSummary(c, u);
  if (tab === 'files') body = reviewFiles(c);
  if (tab === 'defects') body = reviewDefects(c);
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
    ${causeReview(c)}
    ${secCard(c, 'subscriber', 'user', 'مشترک', `${kv('نام', esc(u.name))}<div class="kv-row">${kv('کد ملی', fa(u.nationalId))}${kv('موبایل', fa(u.mobile))}</div>${kv('نشانی', esc(u.address))}
      ${st.user.role === 'gas' ? `<div class="kv"><button class="btn sm ghost" data-act="resetSubPw" data-id="${u.id}">${icon('key')} صدور رمز موقت جدید برای مشترک</button></div>` : ''}`)}
    ${secCard(c, 'incident', 'flame', 'اطلاعات حادثه', `<div class="kv-row">${kv('نوع', esc(W.INCIDENT_TYPES[i.type] || '—'))}${kv('تاریخ', fa(i.date || '—') + (i.time ? ' ساعت ' + fa(i.time) : ''))}</div>
      <div class="kv-row">${kv('کاربری', esc(W.PLACE_TYPES[i.placeType] || '—'))}${kv('گزارش کلانتری', fa(i.policeReportNo || '—'))}</div>
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
  return `${secCard(c, 'photos', 'camera', `تصاویر حادثه (${fa(c.photos.length)})`, `<div class="thumbs">${c.photos.map(id => thumb(c, id, false)).join('')}</div>`)}
    ${docCards(c, { flagRole: canFlag(c) })}`;
}

// کادر گزارش علت حادثه در صفحه بررسی کارکنان؛ نقص آن به مدرک cause_report بسته می‌شود تا مشترک کنار همان مدرک ببیند
function causeReview(c) {
  const i = c.incident;
  const files = c.docs.cause_report || [];
  const flags = c.deficiencies.filter(d => d.status === 'open' && d.target === 'doc:cause_report');
  return `<div class="cause-box review">
    <div class="cause-head">${icon('flame')}<b style="flex:1">گزارش علت حادثه</b>${canFlag(c) ? `<button class="btn sm ghost" data-act="flag" data-target="doc:cause_report" data-title="گزارش علت حادثه">${icon('alert')} اعلام نقص</button>` : ''}</div>
    <div class="kv-row">${kv('صادرکننده', esc(W.CAUSE_ISSUERS[i.causeIssuer] || '—'))}${kv('شماره', fa(i.causeReportNo || '—'))}${kv('تاریخ', fa(i.causeReportDate || '—'))}</div>
    ${kv('اظهار مشترک', i.causeStatesGas ? '<span class="badge ok">در گزارش علت گاز قید شده</span>' : '<span class="badge bad">تأیید نشده</span>')}
    ${c.causeCheck ? kv('بررسی شرکت گاز', `<span class="badge ok">${icon('check')} علت گاز تأیید شد</span> ${esc(c.causeCheck.by)} · ${fdate(c.causeCheck.at)}`) : ''}
    ${flags.map(d => defectBox(c, d, false)).join('')}
    ${files.length ? `<div class="thumbs">${files.map(id => thumb(c, id, false)).join('')}</div>` : '<div class="note bad">' + icon('alert') + '<div>فایل گزارش بارگذاری نشده است.</div></div>'}
    ${st.user.role === 'gas' && c.status === 'gas_review' ? `<small>پیش از ارسال به بیمه‌گر، فایل گزارش را باز کنید و مطمئن شوید علت حادثه صریحاً «گاز» نوشته شده است. اگر نیست یا مبهم است، «اعلام نقص» بزنید.</small>` : ''}
  </div>`;
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
  if (dis) return offerBlock(c) + finForm(c);
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
    ${tile({ go: 'reports', color: 'violet', art: 'chart', a: 'var(--violet)', b: 'var(--orange)', title: 'گزارش‌ها و داشبورد', sub: 'وضعیت لحظه‌ای، ماهانه و خروجی Excel', btn: 'ورود' })}
    ${tile({ go: 'list', p: { f: 'all' }, art: 'inbox', a: 'var(--blue)', b: 'var(--orange)', title: 'همه پرونده‌ها', sub: 'جستجو و مشاهده', btn: 'ورود', count: db.claims.length })}
    ${tile({ go: 'sms', color: 'orange', art: 'sms', a: 'var(--orange)', b: 'var(--blue)', title: 'پیامک‌ها', sub: 'گزارش پیامک‌های ارسالی', btn: 'ورود', count: db.sms.length })}
    ${!demoOn() ? '' : tile({ act: 'resetDemo', color: 'red', art: 'timeline', a: 'var(--red)', b: 'var(--orange)', title: 'بازنشانی نمایشی', sub: 'بازگشت به داده‌های نمونه', btn: 'بازنشانی' })}
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
  const f = (k, l, h = '') => `<label class="fld"><span>${l}</span><input id="s-${k}" name="${k}" class="${k === 'orgName' ? '' : 'ltr'}" value="${typeof s[k] === 'number' ? nf.format(s[k]) : esc(k === 'orgName' ? brandSetting('orgName') : fa(s[k]))}">${h ? `<small>${h}</small>` : ''}</label>`;
  return pageTitle('تنظیمات بیمه‌نامه') + `<form class="form" data-form="settings">
    <div class="note warn">${icon('alert')}<div>مقادیر پیش‌فرض نمونه‌اند. سقف تعهدات و فرانشیز را دقیقاً مطابق بیمه‌نامه سال جاری وارد کنید.</div></div>
    <div class="fld"><span>لوگوی سازمان (صفحه ورود و نوار بالا)</span>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${logoHtml(72)}
        <label class="btn sm ghost" style="cursor:pointer">${icon('upload')} بارگذاری لوگو<input type="file" id="s-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-logo hidden></label>
        ${brandSetting('logoDataUrl') ? `<button class="btn sm red ghost" type="button" data-act="rmLogo">حذف لوگو</button>` : ''}</div>
      <small>فایل رسمی لوگو را با PNG شفاف یا SVG بارگذاری کنید. بدون لوگو، نشان پیش‌فرض سامانه نمایش داده می‌شود.</small></div>
    ${f('orgName', 'نام سازمان زیر لوگو', 'مثلاً: شرکت ملی گاز ایران — شرکت گاز استان تهران')}
    <div class="grid2">${f('policyNo', 'شماره بیمه‌نامه')}${f('policyStart', 'شروع')}${f('policyEnd', 'پایان')}${f('deductiblePercent', 'فرانشیز خسارت مالی (٪)')}</div>
    <div class="grid2">${f('propertyCapRial', 'سقف خسارت مالی (ریال)')}${f('medicalCapRial', 'سقف هزینه درمان (ریال)')}${f('deathCapRial', 'سقف فوت هر نفر (ریال)')}${f('reportWindowDays', 'مهلت اعلام حادثه (روز)')}</div>
    <div class="grid2">${f('gasSlaDays', 'مهلت بررسی شرکت گاز (روز)')}${f('insurerSlaDays', 'مهلت بررسی بیمه‌گر (روز)')}${f('fixSlaDays', 'مهلت رفع نقص مشترک (روز)')}</div>
    <div class="section-label">${icon('flame')} بیمه آتش‌سوزی در صفحه ورود</div>
    <div class="note info">${icon('help')}<div>این سه طرح با دکمه «خرید بیمه آتش‌سوزی منزل» در صفحه ورود نمایش داده می‌شوند. با زدن هر طرح، سایت همان بیمه‌گر باز می‌شود. نشانی باید با <span dir="ltr">https://</span> شروع شود. برای پنهان کردن یک طرح، نام بیمه‌گر و عنوان آن را خالی بگذارید.</div></div>
    ${[0, 1, 2].map(i => { const o = (Array.isArray(s.fireOffers) ? s.fireOffers : W.DEFAULT_SETTINGS.fireOffers)[i] || {};
      return `<fieldset class="offer-set"><legend>طرح ${fa(i + 1)} — ${['پایه', 'متوسط', 'جامع'][i]}</legend><div class="grid2">${Object.entries(W.FIRE_OFFER_FIELDS).map(([k, l]) => `<label class="fld"><span>${l}</span><input name="fo${i}_${k}" class="${k === 'url' ? 'ltr' : ''}" value="${esc(o[k] || '')}" ${k === 'url' ? 'type="url" inputmode="url" placeholder="https://"' : ''}></label>`).join('')}</div></fieldset>`; }).join('')}
    <button class="btn green" type="submit">ذخیره تنظیمات</button></form>`;
}
// ---------- گزارش‌ها و داشبورد ----------
// گاز و مدیر همه پرونده‌ها را می‌بینند؛ بیمه‌گر فقط پرونده‌های ارجاع‌شده را
let liveAt = new Date();
const claimedOf = c => (c.damage.items || []).reduce((x, i) => x + num(i.amount) * (num(i.qty) || 1), 0) + (c.damage.injured || []).reduce((x, i) => x + num(i.amount), 0);
const approvedOf = c => c.assessment ? W.computePayable(c.assessment.items || [], db.settings, c.damage.deceased?.length || 0).payable : 0;
const paidOf = c => c.status === 'paid' ? +(c.payment?.amount || 0) : 0;
const repType = c => (W.REPORT_TYPES[c.incident.type] ? c.incident.type : 'leak');
const stamp = () => W.jalaliString(new Date()).replace(/\//g, '-');

function viewReports() {
  const cs = visibleClaims();
  const sub = st.user.role === 'insurer' ? 'پرونده‌های ارجاع‌شده به بیمه‌گر' : 'همه پرونده‌های سامانه';
  return pageTitle('گزارش‌ها و داشبورد', sub) + liveBlock(cs) + monthlyBlock(cs) + perfBlock(cs);
}
function liveBlock(cs) {
  const L = W.liveStatus(cs);
  const by = id => L.groups.find(x => x.id === id).count;
  const pct = n => (L.total ? Math.round((n * 100) / L.total) : 0);
  const atInsurer = by('referred') + by('insurer');
  const g = st.p.g || '';
  const sel = W.LIVE_GROUPS.find(x => x.id === g);
  const sum = `از ${fa(L.total)} پرونده، ${fa(L.referred)} پرونده به بیمه ارجاع شده است: ${fa(atInsurer)} در دست بررسی بیمه، ${fa(by('assessed'))} منتظر تأیید مبلغ توسط مشترک، ${fa(by('payment'))} در انتظار پرداخت و ${fa(by('paid'))} پرداخت‌شده${by('rejected') ? `؛ ${fa(by('rejected'))} پرونده رد شده است` : ''}.`;
  const big = [['کل پرونده‌ها', L.total, 'inbox', ''], ['ارجاع‌شده به بیمه', L.referred, 'sendShield', 'violet'], ['در دست بررسی بیمه', atInsurer, 'clock', 'warn'], ['پرداخت‌شده توسط بیمه', by('paid'), 'money', 'ok']];
  return `<section class="rep-card" id="rep-live">
    <div class="rep-head"><div><h2>${icon('meter')} وضعیت لحظه‌ای پرونده‌ها</h2>
      <p class="live-at"><span class="live-dot" aria-hidden="true"></span>به‌روز شده ساعت <span class="num">${fa(liveAt.toLocaleTimeString('en-GB'))}</span> · هر ۱۵ ثانیه خودکار</p></div>
      <div class="rep-tools"><button class="btn sm ghost" data-act="repRefresh">${icon('refresh')} تازه‌سازی</button><button class="btn sm green" data-act="expLive">${icon('download')} خروجی Excel</button></div></div>
    <div class="big-kpis">${big.map(([l, n, ic, tone]) => `<div class="bk ${tone}"><span class="ic">${icon(ic)}</span><span class="v num">${fa(n)}</span><span class="l">${l}</span>${L.total && l !== 'کل پرونده‌ها' ? `<span class="p num">${fa(pct(n))}٪ از کل</span>` : ''}</div>`).join('')}</div>
    <p class="rep-sum">${sum}</p>
    <div class="stack" role="img" aria-label="سهم هر وضعیت">${L.groups.filter(x => x.count).map(x => `<span class="seg t-${x.tone}" style="flex:${x.count}" title="${x.label}: ${fa(x.count)}"></span>`).join('')}</div>
    <div class="live-grid">${L.groups.map(x => `<button class="lg t-${x.tone} ${g === x.id ? 'on' : ''}" data-act="rep" data-p='{"g":"${g === x.id ? '' : x.id}"}' aria-pressed="${g === x.id}">
      <span class="sw"></span><span class="n num">${fa(x.count)}</span><span class="l">${x.label}</span><span class="s">${x.sub}</span><span class="p num">${fa(pct(x.count))}٪</span></button>`).join('')}</div>
    ${sel ? claimTable(cs.filter(c => sel.statuses.includes(c.status)), `پرونده‌های «${sel.label}»`) : `<p class="hint-s">${icon('help')} روی هر وضعیت بزنید تا فهرست پرونده‌هایش را ببینید.</p>`}
  </section>`;
}
// جدول یک نوع حادثه: هر ماه با تعداد و مبالغ؛ زدن هر ماه فهرست و جزئیات همان ماه را می‌آورد
function typeRows(cs, y, t) {
  return W.MONTHS.map((_, i) => {
    const l = W.filterReport(cs, { year: y, month: i + 1, type: t });
    return { n: l.length, claimed: l.reduce((a, c) => a + claimedOf(c), 0), paid: l.reduce((a, c) => a + paidOf(c), 0), done: l.filter(c => c.status === 'paid').length };
  });
}
function typeTable(cs, y, m, t) {
  const rows = typeRows(cs, y, t);
  const tot = rows.reduce((a, r) => ({ n: a.n + r.n, claimed: a.claimed + r.claimed, paid: a.paid + r.paid, done: a.done + r.done }), { n: 0, claimed: 0, paid: 0, done: 0 });
  const max = Math.max(1, ...rows.map(r => r.n));
  const mil = v => (v ? fa((v / 1e7).toLocaleString('en-US', { maximumFractionDigits: 1 })).replace('.', '٫') : '—'); // میلیون تومان
  return `<div class="tbl-wrap"><table class="mtx one"><thead><tr><th>ماه</th><th>${W.REPORT_TYPES[t]}</th><th>پرداخت‌شده</th><th>ادعا<small>میلیون تومان</small></th><th>پرداختی<small>میلیون تومان</small></th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr class="${m === i + 1 ? 'on' : ''}"><th><button class="mname" data-act="rep" data-p='{"m":${i + 1}}' ${r.n ? '' : 'disabled'}>${W.MONTHS[i]}</button></th>
      <td><button class="cell ${m === i + 1 ? 'on' : ''}" style="--h:${(r.n / max).toFixed(2)}" data-act="rep" data-p='{"m":${i + 1}}' ${r.n ? '' : 'disabled'}>${r.n ? fa(r.n) : '·'}</button></td>
      <td class="num">${r.n ? fa(r.done) : '·'}</td><td class="num">${mil(r.claimed)}</td><td class="num">${mil(r.paid)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th><button class="mname" data-act="rep" data-p='{"m":0}'>جمع سال</button></th><td><button class="cell ${!m ? 'on' : ''}" data-act="rep" data-p='{"m":0}'>${fa(tot.n)}</button></td><td class="num">${fa(tot.done)}</td><td class="num">${mil(tot.claimed)}</td><td class="num">${mil(tot.paid)}</td></tr></tfoot></table></div>
    <p class="hint-s">${icon('help')} روی هر ماه بزنید تا پرونده‌های ${W.REPORT_TYPES[t]} همان ماه با جزئیات و خروجی Excel بیاید.</p>`;
}
const MTX_HEAD = { fire: 'آتش‌سوزی', explosion: 'انفجار', co: 'مسمومیت', leak: 'سایر' };
function monthlyBlock(cs) {
  const nowY = W.toJalali(new Date()).jy;
  const years = [...new Set([nowY, ...cs.map(c => W.incidentMonth(c).y)])].sort((a, b) => b - a);
  const y = +st.p.y || nowY, m = +st.p.m || 0, t = st.p.t || '';
  const M = W.monthlyMatrix(cs, y);
  const types = Object.entries(W.REPORT_TYPES);
  const rowSum = r => Object.values(r).reduce((a, n) => a + n, 0);
  const max = Math.max(1, ...M.rows.flatMap(r => Object.values(r)));
  const cell = (mi, tk, n, heat = true) => `<button class="cell ${m === mi && t === tk ? 'on' : ''}" ${heat ? `style="--h:${(n / max).toFixed(2)}"` : ''} data-act="rep" data-p='{"m":${mi},"t":"${tk}"}' ${n ? '' : 'disabled'} aria-label="${mi ? W.MONTHS[mi - 1] : 'کل سال'} ${tk ? W.REPORT_TYPES[tk] : 'همه انواع'}: ${n}">${n ? fa(n) : '·'}</button>`;
  const list = W.filterReport(cs, { year: y, month: m || null, type: t || null });
  const label = `${t ? W.REPORT_TYPES[t] : 'همه حوادث'} — ${m ? W.MONTHS[m - 1] + ' ' : 'سال '}${fa(y)}`;
  return `<section class="rep-card" id="rep-month">
    <div class="rep-head"><div><h2>${icon('chart')} حوادث به تفکیک ماه و نوع</h2><p class="muted-s">بر اساس تاریخ وقوع حادثه</p></div>
      <div class="rep-tools"><label class="sel"><span>سال</span><select data-rep="y">${years.map(v => `<option value="${v}" ${v === y ? 'selected' : ''}>${fa(v)}</option>`).join('')}</select></label>
        <button class="btn sm green" data-act="expMonthly" data-y="${y}">${icon('download')} خروجی Excel جدول</button></div></div>
    <div class="chips">${[['', 'همه انواع'], ...types].map(([k, l]) => `<button class="chip ${t === k ? 'on' : ''}" data-act="rep" data-p='{"t":"${k}","m":0}'>${l} <span class="num">${fa(k ? M.totals[k] : M.all)}</span></button>`).join('')}</div>
    ${t ? typeTable(cs, y, m, t) : `<div class="tbl-wrap"><table class="mtx"><thead><tr><th>ماه</th>${types.map(([k, l]) => `<th title="${l}">${MTX_HEAD[k]}</th>`).join('')}<th>جمع</th></tr></thead>
      <tbody>${M.rows.map((r, i) => `<tr class="${m === i + 1 ? 'on' : ''}"><th><button class="mname" data-act="rep" data-p='{"m":${i + 1},"t":""}'>${W.MONTHS[i]}</button></th>${types.map(([k]) => `<td>${cell(i + 1, k, r[k])}</td>`).join('')}<td class="tot">${cell(i + 1, '', rowSum(r), false)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th><button class="mname" data-act="rep" data-p='{"m":0,"t":""}'>جمع سال</button></th>${types.map(([k]) => `<td>${cell(0, k, M.totals[k], false)}</td>`).join('')}<td class="tot">${cell(0, '', M.all, false)}</td></tr></tfoot></table></div>`}
    <div class="sel-bar"><div><b>${esc(label)}</b><span class="num">${fa(list.length)} حادثه</span></div>
      <div class="rep-tools"><button class="btn sm green" data-act="expDetail" ${list.length ? '' : 'disabled'}>${icon('download')} خروجی Excel با جزئیات</button><button class="btn sm ghost" data-act="printSel" ${list.length ? '' : 'disabled'}>${icon('print')} گزارش چاپی</button></div></div>
    ${claimTable(list, '')}
  </section>`;
}
function claimTable(list, title) {
  const rows = list.slice().sort((a, b) => (b.incident.date || '').localeCompare(a.incident.date || ''));
  if (!rows.length) return `<div class="empty">${illo('inbox')}<span>پرونده‌ای در این دسته نیست.</span></div>`;
  const shown = rows.slice(0, 150);
  return `${title ? `<h3 class="tbl-title">${esc(title)} <span class="num">(${fa(rows.length)})</span></h3>` : ''}<div class="tbl-wrap"><table class="ctbl"><thead><tr><th>کد پرونده</th><th>مشترک</th><th>تاریخ حادثه</th><th>نوع</th><th>وضعیت</th><th>ادعا (ریال)</th><th>پرداختی (ریال)</th><th></th></tr></thead><tbody>
    ${shown.map(c => `<tr><td class="num" dir="ltr">${esc(c.code)}</td><td>${esc(userById(c.subscriberId)?.name || '')}</td><td class="num">${fa(c.incident.date || '—')}</td><td>${W.REPORT_TYPES[repType(c)]}</td><td>${badge(c)}</td><td class="num">${nf.format(claimedOf(c))}</td><td class="num">${paidOf(c) ? nf.format(paidOf(c)) : '—'}</td>
      <td class="acts"><button class="btn sm ghost" data-act="claimReport" data-id="${c.id}" title="گزارش کامل پرونده">${icon('doc')} جزئیات</button><button class="btn sm ghost" data-go="review" data-p='{"id":"${c.id}"}' aria-label="باز کردن پرونده">${icon('chevL')}</button></td></tr>`).join('')}
  </tbody></table></div>${rows.length > shown.length ? `<p class="hint-s">${fa(rows.length - shown.length)} پرونده دیگر در خروجی Excel آمده است.</p>` : ''}`;
}
function perfBlock(cs) {
  const counts = Object.keys(W.STATUS).map(k => [k, cs.filter(c => c.status === k).length]).filter(([, n]) => n);
  const max = Math.max(1, ...counts.map(([, n]) => n));
  const paid = cs.filter(c => c.status === 'paid');
  const avgDays = paid.length ? Math.round(paid.reduce((a, c) => a + W.daysBetween(c.createdAt, c.paidAt || c.statusAt), 0) / paid.length) : 0;
  const overdue = cs.filter(c => W.slaInfo(c, db.settings)?.overdue).length;
  const returns = cs.reduce((a, c) => a + c.timeline.filter(t => t.action === 'gas_return').length, 0);
  return `<section class="rep-card"><div class="rep-head"><div><h2>${icon('timeline')} عملکرد و مبالغ</h2></div></div>
    <div class="kpis">
      <div class="kpi"><div class="l">میانگین تشکیل تا پرداخت</div><div class="v">${fa(avgDays)} روز</div></div>
      <div class="kpi"><div class="l">پرونده‌های دارای تأخیر</div><div class="v">${fa(overdue)}</div></div>
      <div class="kpi"><div class="l">دفعات اعلام نقص</div><div class="v">${fa(returns)}</div></div>
      <div class="kpi"><div class="l">جمع ادعا</div><div class="v" style="font-size:17px">${money(cs.reduce((a, c) => a + claimedOf(c), 0))}</div></div>
      <div class="kpi"><div class="l">جمع پرداخت</div><div class="v" style="font-size:17px">${money(paid.reduce((a, c) => a + paidOf(c), 0))}</div></div>
    </div>
    <div class="stat-bars">${counts.map(([k, n]) => `<div class="sbar"><span>${W.STATUS[k].short}</span><span class="track"><span class="fill" style="width:${(n / max) * 100}%;display:block"></span></span><b class="num">${fa(n)}</b></div>`).join('')}</div></section>`;
}

// ---------- خروجی‌ها ----------
// CSV با BOM تا اکسل حروف فارسی را درست نشان دهد؛ نام فایل لاتین، چون برخی مرورگرها نام فارسی را به «download» تبدیل می‌کنند
function download(name, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? '﻿' + text : text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('فایل ' + name + ' آماده شد.');
}
function exportLive() {
  const cs = visibleClaims(); const L = W.liveStatus(cs);
  const rows = [['گزارش وضعیت لحظه‌ای پرونده‌ها'], ['تاریخ و ساعت', W.jalaliString(new Date()) + ' ' + new Date().toLocaleTimeString('en-GB')], ['کل پرونده‌ها', L.total], ['ارجاع‌شده به بیمه (تجمعی)', L.referred], [],
    ['وضعیت', 'شرح', 'تعداد', 'درصد از کل'], ...L.groups.map(g => [g.label, g.sub, g.count, L.total ? Math.round((g.count * 1000) / L.total) / 10 : 0]), [],
    ['کد پرونده', 'مشترک', 'نوع حادثه', 'تاریخ حادثه', 'وضعیت', 'گروه', 'در انتظار اقدام', 'تاریخ آخرین تغییر', 'روز در وضعیت فعلی', 'ارجاع به بیمه', 'مبلغ ادعا', 'مبلغ پرداختی'],
    ...cs.map(c => [c.code, userById(c.subscriberId)?.name || '', W.REPORT_TYPES[repType(c)], c.incident.date || '', W.STATUS[c.status].label, W.LIVE_GROUPS.find(g => g.statuses.includes(c.status))?.label || '',
      W.waitingOn(c) ? W.ROLES[W.waitingOn(c)] : '—', c.statusAt ? W.jalaliString(c.statusAt) : '', c.statusAt ? W.daysBetween(c.statusAt, new Date()) : '', c.forwardedAt ? W.jalaliString(c.forwardedAt) : '', claimedOf(c), paidOf(c)])];
  download(`claims-status-${stamp()}.csv`, W.toCsv(rows));
}
function exportMonthly(y, t = '') {
  if (t) {
    const rows = typeRows(visibleClaims(), y, t);
    return download(`incidents-monthly-${y}-${t}.csv`, W.toCsv([[`${W.REPORT_TYPES[t]} — سال ${y} به تفکیک ماه (بر اساس تاریخ وقوع)`], [], ['ماه', 'تعداد حادثه', 'پرداخت‌شده', 'جمع ادعا (ریال)', 'جمع پرداختی (ریال)'],
      ...rows.map((r, i) => [W.MONTHS[i], r.n, r.done, r.claimed, r.paid]), ['جمع سال', ...['n', 'done', 'claimed', 'paid'].map(k => rows.reduce((a, r) => a + r[k], 0))]]));
  }
  const M = W.monthlyMatrix(visibleClaims(), y); const types = Object.entries(W.REPORT_TYPES);
  const rows = [[`حوادث سال ${y} به تفکیک ماه و نوع (بر اساس تاریخ وقوع)`], [], ['ماه', ...types.map(([, l]) => l), 'جمع'],
    ...M.rows.map((r, i) => [W.MONTHS[i], ...types.map(([k]) => r[k]), Object.values(r).reduce((a, n) => a + n, 0)]),
    ['جمع سال', ...types.map(([k]) => M.totals[k]), M.all]];
  download(`incidents-monthly-${y}.csv`, W.toCsv(rows));
}
function reportSelection() {
  const nowY = W.toJalali(new Date()).jy;
  const y = +st.p.y || nowY, m = +st.p.m || 0, t = st.p.t || '';
  return { y, m, t, list: W.filterReport(visibleClaims(), { year: y, month: m || null, type: t || null }),
    label: `${t ? W.REPORT_TYPES[t] : 'همه حوادث'} — ${m ? W.MONTHS[m - 1] + ' ' : 'سال '}${y}` };
}
function detailRows(list) {
  const fin = c => (c.status === 'paid' ? 'واریز شد' : c.finance?.stage ? (W.FIN_STAGES.find(f => f.id === c.finance.stage)?.short || '') : '');
  return [['کد پرونده', 'نام مشترک', 'کد ملی', 'شماره اشتراک', 'موبایل', 'نوع حادثه', 'تاریخ حادثه', 'ساعت', 'نوع محل', 'نشانی محل حادثه', 'شرح حادثه',
    'صادرکننده گزارش علت', 'شماره گزارش علت', 'تاریخ گزارش علت', 'قید گاز در گزارش', 'انواع خسارت', 'تعداد مصدوم', 'تعداد فوتی', 'مبلغ ادعا (ریال)',
    'وضعیت', 'در انتظار اقدام', 'تاریخ تشکیل', 'تاریخ ارجاع به بیمه', 'تأییدکننده قید گاز', 'تعداد اعلام نقص', 'ارزیاب', 'مبلغ قابل پرداخت پس از فرانشیز (ریال)',
    'مرحله مالی', 'شماره حواله', 'شماره پیگیری واریز', 'تاریخ واریز', 'مبلغ واریزی (ریال)', 'روز از تشکیل تا پرداخت'],
  ...list.map(c => { const u = userById(c.subscriberId) || {}; const i = c.incident;
    return [c.code, u.name || '', u.nationalId || '', u.subscriptionNo || '', u.mobile || '', W.REPORT_TYPES[repType(c)], i.date || '', i.time || '', W.PLACE_TYPES[i.placeType] || '', i.address || '', i.description || '',
      W.CAUSE_ISSUERS[i.causeIssuer] || '', i.causeReportNo || '', i.causeReportDate || '', i.causeStatesGas ? 'بله' : 'خیر', (c.damage.kinds || []).map(k => W.DAMAGE_KINDS[k]).join('، '),
      (c.damage.injured || []).length, (c.damage.deceased || []).length, claimedOf(c), W.STATUS[c.status].label, W.waitingOn(c) ? W.ROLES[W.waitingOn(c)] : '—',
      W.jalaliString(c.createdAt), c.forwardedAt ? W.jalaliString(c.forwardedAt) : '', c.causeCheck?.by || '', c.timeline.filter(x => x.action === 'gas_return' || x.action === 'ins_query').length,
      c.assessment?.adjuster || '', approvedOf(c) || '', fin(c), c.finance?.voucher?.voucherNo || '', c.payment?.ref || '', c.payment?.date || '', paidOf(c) || '',
      c.status === 'paid' ? W.daysBetween(c.createdAt, c.paidAt || c.statusAt) : ''];
  })];
}

// ---------- گزارش چاپی ----------
// صفحه‌ای جدا روی همه برنامه؛ «چاپ» آن را به PDF یا کاغذ می‌برد و «دانلود» یک فایل HTML مستقل می‌دهد
const RP_CSS = `.rp{font-family:Vazirmatn,Tahoma,sans-serif;color:#1c2733;direction:rtl;line-height:1.8;max-width:900px;margin:0 auto;padding:24px 18px}
.rp h1{font-size:21px;margin:0}.rp h2{font-size:16px;margin:22px 0 8px;padding:6px 10px;background:#e7f1f9;border-radius:8px;color:#2b6f9e}
.rp .hd{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;border-bottom:3px solid #3a8cc3;padding-bottom:10px}
.rp .hd small{color:#6a7b8c}.rp table{width:100%;border-collapse:collapse;font-size:13px;margin:4px 0}
.rp th,.rp td{border:1px solid #cad8e4;padding:5px 8px;text-align:right;vertical-align:top}.rp th{background:#f3f6f9;font-weight:700;white-space:nowrap}
.rp .kvt th{width:34%}.rp .ok{color:#1f9d57;font-weight:700}.rp .bad{color:#d9443a;font-weight:700}.rp .foot{margin-top:24px;color:#6a7b8c;font-size:12px;border-top:1px solid #cad8e4;padding-top:8px}
.rp .num{font-variant-numeric:tabular-nums}`;
function rpHead(title, sub) {
  return `<div class="hd"><div><h1>${esc(title)}</h1><small>${esc(sub)}</small></div><small>${esc(brandSetting('orgName') || 'سامانه بیمه حوادث مشترکین گاز')}<br>تهیه: ${fdt(new Date().toISOString())}</small></div>`;
}
const kvT = rows => `<table class="kvt">${rows.filter(Boolean).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
function claimReportHtml(c) {
  const u = userById(c.subscriberId) || {}; const i = c.incident; const a = c.assessment; const f = c.finance || {};
  const pay = a ? W.computePayable(a.items || [], db.settings, c.damage.deceased?.length || 0) : null;
  const docs = W.visibleDocs(c).map(d => [d.title, (c.docs[d.id] || []).length ? `<span class="ok">${fa((c.docs[d.id] || []).length)} فایل</span>` : '<span class="bad">بارگذاری نشده</span>']);
  return `${rpHead('گزارش کامل پرونده ' + c.code, W.STATUS[c.status].label)}
  <h2>مشترک</h2>${kvT([['نام', esc(u.name || '')], ['کد ملی', fa(u.nationalId || '—')], ['شماره اشتراک', fa(u.subscriptionNo || '—')], ['موبایل', fa(u.mobile || '—')]])}
  <h2>حادثه</h2>${kvT([['نوع حادثه', esc(W.INCIDENT_TYPES[i.type] || '—')], ['تاریخ و ساعت', `${fa(i.date || '—')} ${fa(i.time || '')}`], ['نوع محل', esc(W.PLACE_TYPES[i.placeType] || '—')], ['نشانی', esc(i.address || '—')], ['شرح', esc(i.description || '—')], i.policeReportNo ? ['گزارش کلانتری', fa(i.policeReportNo)] : null])}
  <h2>گزارش علت حادثه</h2>${kvT([['صادرکننده', esc(W.CAUSE_ISSUERS[i.causeIssuer] || '—')], ['شماره و تاریخ', `${fa(i.causeReportNo || '—')} — ${fa(i.causeReportDate || '—')}`], ['قید «گاز» در گزارش', i.causeStatesGas ? '<span class="ok">بله</span>' : '<span class="bad">خیر</span>'], ['تأیید شرکت گاز', c.causeCheck ? `${esc(c.causeCheck.by)} — ${fdt(c.causeCheck.at)}` : '—']])}
  <h2>خسارت اعلامی</h2>
  ${(c.damage.items || []).length ? `<table><tr><th>شرح</th><th>تعداد</th><th>مبلغ (ریال)</th></tr>${c.damage.items.map(x => `<tr><td>${esc(x.title)}</td><td class="num">${fa(x.qty || 1)}</td><td class="num">${nf.format(num(x.amount))}</td></tr>`).join('')}</table>` : ''}
  ${(c.damage.injured || []).length ? `<table><tr><th>مصدوم</th><th>نسبت</th><th>بیمارستان</th><th>هزینه درمان (ریال)</th></tr>${c.damage.injured.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.relation || '')}</td><td>${esc(x.hospital || '')}</td><td class="num">${nf.format(num(x.amount))}</td></tr>`).join('')}</table>` : ''}
  ${(c.damage.deceased || []).length ? `<table><tr><th>متوفی</th><th>نسبت</th></tr>${c.damage.deceased.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.relation || '')}</td></tr>`).join('')}</table>` : ''}
  ${kvT([['جمع ادعا', money(claimedOf(c))]])}
  <h2>مدارک</h2><table>${docs.map(([t, v]) => `<tr><th>${esc(t)}</th><td>${v}</td></tr>`).join('')}<tr><th>عکس‌های محل</th><td>${fa(c.photos.length)} عکس</td></tr></table>
  ${(c.deficiencies || []).length ? `<h2>نقص‌ها و استعلام‌ها</h2><table><tr><th>مورد</th><th>توضیح</th><th>پاسخ</th><th>وضعیت</th></tr>${c.deficiencies.map(d => `<tr><td>${esc(d.title || '')}</td><td>${esc(d.note)}</td><td>${esc(d.reply || '—')}</td><td>${d.status === 'open' ? '<span class="bad">باز</span>' : '<span class="ok">رفع شده</span>'}</td></tr>`).join('')}</table>` : ''}
  ${a ? `<h2>ارزیابی بیمه‌گر</h2>${kvT([['ارزیاب', esc(a.adjuster || '')], ['تاریخ بازدید', fa(a.visitDate || '—')], a.note ? ['توضیح', esc(a.note)] : null])}
    <table><tr><th>ردیف</th><th>ادعا (ریال)</th><th>تأییدشده (ریال)</th></tr>${(a.items || []).map(x => `<tr><td>${esc(x.title)}</td><td class="num">${nf.format(+x.claimed || 0)}</td><td class="num">${nf.format(+x.approved || 0)}</td></tr>`).join('')}</table>
    ${kvT([['فرانشیز', money(pay.deductible)], ['قابل پرداخت', `<b>${money(pay.payable)}</b>`]])}` : ''}
  ${f.review || c.payment ? `<h2>مراحل مالی</h2>${kvT([f.review ? ['بررسی مالی', `${esc(f.review.reviewer)} — ${fdate(f.review.at)}`] : null, f.voucher ? ['حواله', `${esc(f.voucher.voucherNo)} — ${fa(f.voucher.date)} — ${money(f.voucher.amount)}`] : null, f.bank ? ['دستور پرداخت', `${esc(W.TRANSFER_METHODS[f.bank.method]?.label || '')} — ${esc(f.bank.ref)} — ${fa(f.bank.date)}`] : null, c.status === 'paid' ? ['واریز', `<span class="ok">${money(c.payment.amount)}</span> — پیگیری ${fa(c.payment.ref)} — ${fa(c.payment.date)}`] : null])}` : ''}
  <h2>تاریخچه</h2><table><tr><th>زمان</th><th>اقدام</th><th>توسط</th><th>توضیح</th></tr>${c.timeline.map(t => `<tr><td class="num">${fdt(t.at)}</td><td>${esc(t.label)}</td><td>${esc(t.by)}</td><td>${esc(t.note || '')}</td></tr>`).join('')}</table>
  <p class="foot">این گزارش از سامانه بیمه حوادث مشترکین گاز تهیه شده و اطلاعات هویتی و بانکی مشترک را دارد؛ آن را محرمانه نگه دارید.</p>`;
}
function selectionReportHtml(sel) {
  const types = Object.entries(W.REPORT_TYPES);
  const by = k => sel.list.filter(c => repType(c) === k).length;
  return `${rpHead('گزارش حوادث: ' + sel.label, `${fa(sel.list.length)} پرونده`)}
  <h2>خلاصه</h2><table><tr>${types.map(([, l]) => `<th>${l}</th>`).join('')}<th>جمع</th><th>جمع ادعا</th><th>جمع پرداختی</th></tr><tr>${types.map(([k]) => `<td class="num">${fa(by(k))}</td>`).join('')}<td class="num">${fa(sel.list.length)}</td><td class="num">${money(sel.list.reduce((a, c) => a + claimedOf(c), 0))}</td><td class="num">${money(sel.list.reduce((a, c) => a + paidOf(c), 0))}</td></tr></table>
  <h2>فهرست پرونده‌ها</h2><table><tr><th>کد</th><th>مشترک</th><th>تاریخ حادثه</th><th>نوع</th><th>وضعیت</th><th>ادعا</th><th>پرداختی</th></tr>
  ${sel.list.map(c => `<tr><td class="num" dir="ltr">${esc(c.code)}</td><td>${esc(userById(c.subscriberId)?.name || '')}</td><td class="num">${fa(c.incident.date || '')}</td><td>${W.REPORT_TYPES[repType(c)]}</td><td>${W.STATUS[c.status].short}</td><td class="num">${nf.format(claimedOf(c))}</td><td class="num">${paidOf(c) ? nf.format(paidOf(c)) : '—'}</td></tr>`).join('')}</table>
  <p class="foot">جزئیات کامل هر پرونده: دکمه «جزئیات» در فهرست، یا «خروجی Excel با جزئیات».</p>`;
}
function openPrintDoc(title, body, file) {
  closePrintDoc();
  const d = document.createElement('div');
  d.id = 'printdoc'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.dataset.title = title; d.dataset.file = file;
  d.innerHTML = `<div class="pd-bar"><button class="btn sm" data-act="pdPrint">${icon('print')} چاپ / ذخیره PDF</button><button class="btn sm ghost" data-act="pdSave">${icon('download')} دانلود فایل</button><button class="btn sm ghost" data-act="pdClose">${icon('x')} بستن</button></div><style>${RP_CSS}</style><div class="rp">${body}</div>`;
  document.body.appendChild(d); document.body.classList.add('has-printdoc');
  d.querySelector('button').focus();
}
function closePrintDoc() { $('#printdoc')?.remove(); document.body.classList.remove('has-printdoc'); }

// ---------- بیمه آتش‌سوزی (پیشنهاد صفحه ورود) ----------
const fireOffers = () => (Array.isArray(db.settings.fireOffers) ? db.settings.fireOffers : W.DEFAULT_SETTINGS.fireOffers).filter(o => o && (o.insurer || o.plan));
function fireCta() {
  const n = fireOffers().length;
  if (!n) return '';
  return `<button class="fire-cta" type="button" data-act="fireOffers"><span class="fc-ic">${icon('flame')}</span>
    <span class="fc-t"><b>خرید بیمه آتش‌سوزی منزل</b><small>مقایسه ${fa(n)} طرح با نرخ‌های مختلف و خرید آنلاین</small></span>${icon('chevL', 'chev')}</button>`;
}
function fireSheet() {
  const tiers = ['پایه', 'متوسط', 'جامع'];
  openSheet(`<h2>بیمه آتش‌سوزی منزل</h2>
    <p class="lead">بیمه حوادث مشترکین گاز فقط حوادث ناشی از گاز را پوشش می‌دهد. برای پوشش آتش‌سوزی با هر علتی، یکی از این طرح‌ها را انتخاب کنید؛ خرید در سایت خود بیمه‌گر انجام می‌شود.</p>
    <div class="offers">${fireOffers().map((o, i) => {
      const url = W.safeOfferUrl(o.url);
      const inner = `<span class="of-tier">${tiers[i] || ''}</span><span class="of-ins">${icon('shield')} ${esc(o.insurer)}</span><span class="of-plan">${esc(o.plan)}</span>
        <span class="of-price">${esc(o.price)}</span><span class="of-cover">${esc(o.cover)}</span><span class="of-go">${url ? `خرید از سایت بیمه‌گر ${icon('external')}` : 'نشانی خرید هنوز ثبت نشده'}</span>`;
      return url ? `<a class="offer t${i}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<button class="offer t${i} off" type="button" data-act="offerNoUrl">${inner}</button>`;
    }).join('')}</div>
    <p class="hint-s">${icon('help')} نرخ و شرایط را بیمه‌گر تعیین می‌کند؛ پیش از پرداخت، شرایط بیمه‌نامه را در سایت بیمه‌گر بخوانید.</p>`);
}

function viewSms() {
  // در وردپرس هر پیامک وضعیت ارسال دارد: logged (فقط ثبت)، sent (ارسال شد) یا failed (خطا)
  const st_ = s => !s.status ? '' : s.status === 'sent' ? '<span class="badge ok">ارسال شد</span>' : s.status === 'logged' ? '<span class="badge neutral">فقط ثبت</span>' : `<span class="badge bad" title="${esc(s.status)}">خطا در ارسال</span>`;
  const sub = B.kind === 'local' ? 'در نسخه نمایشی پیامک واقعی ارسال نمی‌شود' : 'سامانه پیامک در پیشخوان وردپرس ← بیمه حوادث گاز تنظیم می‌شود';
  return pageTitle('پیامک‌های ارسالی', sub) + `<div class="rows">${db.sms.map(s => `<div class="row">${icon('sms')}<span class="main"><span class="t num" dir="ltr" style="text-align:right">${fa(s.mobile)}</span><span class="s">${esc(s.text)}</span><span class="s">${fdt(s.at)}</span></span>${st_(s)}</div>`).join('') || '<div class="empty">پیامکی نیست.</div>'}</div>`;
}

const VIEWS = {
  subscriber: { home: subHome, sections: subSections, sec: subSection, track: subTrack, inbox: viewInbox, thread: viewThread },
  gas: { home: gasHome, list: viewList, review: viewReview, register: viewRegister, registered: viewRegistered, reports: viewReports, inbox: viewInbox, thread: viewThread },
  insurer: { home: insurerHome, list: viewList, review: viewReview, reports: viewReports, inbox: viewInbox, thread: viewThread },
  admin: { home: adminHome, list: viewList, review: viewReview, users: viewUsers, settings: viewSettings, reports: viewReports, sms: viewSms, inbox: viewInbox, thread: viewThread },
};

// ================= برگه‌های عمومی =================
const FAQ = [
  ['چه حوادثی تحت پوشش است؟', 'آتش‌سوزی، انفجار و گازگرفتگی ناشی از گاز طبیعی در محل مشترک (معمولاً پس از کنتور) که به خسارت مالی، جرح یا فوت منجر شده باشد. جزئیات و سقف‌ها را بیمه‌نامه سال جاری تعیین می‌کند.'],
  ['حساب کاربری را از کجا بگیرم؟', 'به امور حوادث شرکت گاز منطقه مراجعه کنید. پس از ثبت، نام کاربری (شماره اشتراک) و رمز موقت برایتان پیامک می‌شود.'],
  ['چه مدارکی لازم است؟', 'مهم‌ترین مدرک، گزارش آتش‌نشانی یا کارشناس رسمی دادگستری است که در آن علت حادثه «گاز» قید شده باشد. بقیه: کارت ملی، سند یا اجاره‌نامه، قبض گاز، عکس‌های محل، فاکتور اقلام و گواهی شبا. در جرح یا فوت، مدارک پزشکی، پزشکی قانونی، گواهی فوت و انحصار وراثت هم لازم است. سامانه فهرست دقیق پرونده شما را نشان می‌دهد.'],
  ['اگر شرکت گاز نقص اعلام کند؟', 'پیامک دریافت می‌کنید. وارد سامانه شوید، موارد را اصلاح کنید، به هر مورد پاسخ دهید و پرونده را دوباره ارسال کنید.'],
  ['اگر با مبلغ خسارت موافق نباشم؟', 'در «پیگیری پرونده» گزینه «اعتراض به مبلغ» را بزنید و دلیل را بنویسید. بیمه‌گر دوباره ارزیابی می‌کند.'],
  ['پیش از عکاسی محل را تمیز کنم؟', 'خیر. تا عکاسی از محل و صدور گزارش آتش‌نشانی یا کارشناس رسمی دادگستری، محل را تعمیر یا پاک‌سازی نکنید.'],
  ['گزارش آتش‌نشانی چه چیزی باید داشته باشد؟', 'در گزارش آتش‌نشانی یا کارشناس رسمی دادگستری باید صریحاً نوشته شده باشد که علت حادثه «گاز» بوده است (مثلاً نشت گاز یا انفجار ناشی از گاز)، با مهر و امضا، تاریخ و نشانی محل. گزارشی که علت را نامعلوم یا غیر از گاز بداند، برای پرونده پذیرفته نمی‌شود.'],
];
function helpSheet() {
  openSheet(`<h2>پرسش‌های متداول</h2><div class="faq">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    <div class="support"><span class="av">${icon('support')}</span>اورژانس گاز: <span class="num">۱۹۴</span></div>`);
}
function guideSheet() {
  openSheet(`<h2>مسیر پرونده</h2><p class="lead">از تشکیل پرونده تا دریافت خسارت</p>${journeyHtml(true)}`);
  startJourney();
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
  const unread = list.filter(n => !n.readBy.includes(st.user.id)).map(n => n.id);
  if (unread.length) B.readNotifs(unread).catch(() => {});
  const dot = $('.topbar [data-act=notifs] .dot'); if (dot) dot.remove();
}
function pickClaimSheet() {
  const cur = currentClaim();
  openSheet(`<h2>پرونده‌ها</h2><p class="lead">پرونده مورد نظر خود را انتخاب کنید.</p>
    ${visibleClaims().map(c => `<button class="radio-card ${c.id === cur.id ? 'on' : ''}" data-act="setClaim" data-id="${c.id}"><span><b dir="ltr" class="num">${esc(c.code)}</b><br><small>${esc(W.INCIDENT_TYPES[c.incident.type])} — ${esc(W.STATUS[c.status].short)}</small></span><span class="rd"></span></button>`).join('')}
    <div class="btns"><button class="btn" data-act="closeSheet">تأیید</button></div>`);
}

// ================= عمل‌های پرونده =================
function actionSheet(id) {
  const c = currentClaim();
  const a = W.ACTIONS[id];
  const err = W.canDo(c, st.user.role, id);
  const placeholder = { object: 'دلیل اعتراض و مبلغ مورد انتظار خود را بنویسید.', gas_reject: 'دلیل رد (مثلاً: حادثه غیرمرتبط با گاز طبق گزارش کارشناس)', ins_reject: 'دلیل رد بر اساس شرایط بیمه‌نامه' }[id] || 'توضیح (اختیاری)';
  openSheet(`<h2>${esc(a.label)}</h2><p class="lead"><span dir="ltr" class="num">${esc(c.code)}</span></p>
    ${err ? `<div class="note warn">${icon('alert')}<div>${esc(err)}</div></div>` : ''}
    <form class="form" data-form="action" data-action="${id}" style="border:0;padding:0">
      ${id === 'gas_forward' ? `<div class="cause-box review"><div class="cause-head">${icon('flame')}<b>گزارش علت حادثه</b></div>
        <div class="thumbs">${(c.docs.cause_report || []).map(fid => thumb(c, fid, false)).join('')}</div>
        <label class="check"><input type="checkbox" name="causeConfirmed" id="act-cause" required>
          <span>گزارش ${esc(W.CAUSE_ISSUERS[c.incident.causeIssuer] || 'علت حادثه')} را باز کردم و در آن <b>صریحاً «گاز» به‌عنوان علت حادثه قید شده است.</b></span></label></div>` : ''}
      <label class="fld"><span>${a.needsNote ? 'توضیح <i>*</i>' : 'توضیح'}</span><textarea id="act-note" name="note" ${a.needsNote ? 'required' : ''} placeholder="${esc(placeholder)}"></textarea></label>
      <div class="btns"><button class="btn ${/reject/.test(id) ? 'red' : 'green'}" type="submit" ${err ? 'disabled' : ''}>تأیید</button><button class="btn ghost" type="button" data-act="closeSheet">انصراف</button></div>
    </form>`);
}
async function runAction(id, note, opts = {}) {
  const c = currentClaim();
  if (!await run(() => B.action(c, id, note, opts))) return;
  closeSheet();
  toast(W.STATUS[claimById(c.id).status].label);
  if (st.user.role === 'subscriber') go('track'); else render();
}

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { const k = ks[i]; if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; }
  o[ks[ks.length - 1]] = val;
}

// ================= رویدادها =================
const ACTS = {
  forgot: () => forgotSheet('id'),
  // گزارش‌ها
  rep: a => { st.p = { ...st.p, ...JSON.parse(a.dataset.p) }; sset('gii.view', JSON.stringify({ view: st.view, p: st.p })); renderKeep(); },
  repRefresh: async () => { await sync().catch(() => {}); liveAt = new Date(); renderKeep(); toast('داده‌ها تازه شد.'); },
  expLive: () => exportLive(),
  expMonthly: a => exportMonthly(+a.dataset.y, st.p.t || ''),
  expDetail: () => { const sel = reportSelection(); download(`claims-detail-${sel.y}${sel.m ? '-' + String(sel.m).padStart(2, '0') : ''}${sel.t ? '-' + sel.t : ''}.csv`, W.toCsv(detailRows(sel.list))); },
  printSel: () => { const sel = reportSelection(); openPrintDoc('گزارش ' + sel.label, selectionReportHtml(sel), `incidents-${sel.y}${sel.m ? '-' + String(sel.m).padStart(2, '0') : ''}${sel.t ? '-' + sel.t : ''}`); },
  claimReport: a => { const c = db.claims.find(x => x.id === a.dataset.id); if (c) openPrintDoc('پرونده ' + c.code, claimReportHtml(c), 'claim-' + c.code); },
  pdPrint: () => window.print(),
  pdSave: () => {
    const d = $('#printdoc'); if (!d) return;
    const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(d.dataset.title)}</title><style>body{margin:0;background:#fff}${RP_CSS}</style></head><body><div class="rp">${d.querySelector('.rp').innerHTML}</div></body></html>`;
    download(d.dataset.file + '.html', html, 'text/html;charset=utf-8');
  },
  pdClose: () => closePrintDoc(),
  // بیمه آتش‌سوزی
  fireOffers: () => fireSheet(),
  offerNoUrl: () => toast('نشانی خرید این طرح هنوز ثبت نشده است؛ مدیر سامانه آن را در «تنظیمات» وارد می‌کند.', true),
  otpResend: async () => {
    if (!rst) return forgotSheet('id');
    try { await sendOtp(rst.username, rst.mobile); forgotSheet('code'); toast('کد تازه ارسال شد.'); } catch (e) { forgotSheet('code', e.message); }
  },
  jGo: el => { const j = $('.journey'); j.dataset.play = '0'; jSet(+el.dataset.i); },
  jStep: el => { const j = $('.journey'); j.dataset.play = '0'; jSet(+j.dataset.i + +el.dataset.d); },
  jPlay: () => { const j = $('.journey'); j.dataset.play = j.dataset.play === '1' ? '0' : '1'; jSet(+j.dataset.i); },
  toggle: el => { const k = el.dataset.key; st.open.has(k) ? st.open.delete(k) : st.open.add(k); render(); },
  help: helpSheet, guide: guideSheet, notifs: notifSheet, closeSheet,
  demoLogin: el => { const d = demoList()[+el.dataset.i]; doLogin(d.u, d.p); },
  logout: async () => { closeSheet(); await run(() => B.logout()); st.user = null; sset('gii.view', null); st.view = 'home'; render(); },
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
    const blob = await B.getFile(c.id, id).catch(() => null); if (!blob) { toast('فایل در دسترس نیست.', true); return; }
    if (!urlCache.has(id)) urlCache.set(id, URL.createObjectURL(blob));
    const url = urlCache.get(id);
    openSheet(`<h2 style="font-size:16px;overflow-wrap:anywhere">${esc(f.name)}</h2><p class="lead">${fdt(f.at)} · ${fa(Math.ceil(f.size / 1024))} کیلوبایت</p>
      <div class="viewer">${f.type.startsWith('image/') ? `<img src="${url}" alt="${esc(f.name)}">` : `<div class="note info">${icon('doc')}<div>پیش‌نمایش PDF در این صفحه ممکن نیست. <a href="${url}" target="_blank" rel="noopener">باز کردن فایل</a></div></div>`}</div>
      <button class="btn ghost" data-act="closeSheet">بستن</button>`);
  },
  rmFile: async el => { await run(() => B.removeFile(currentClaim(), el.dataset.file)); render(); },
  addItem: el => {
    const c = currentClaim(); const k = el.dataset.key;
    (c.damage[k] ||= []).push(k === 'items' ? { title: '', qty: 1, amount: '' } : k === 'injured' ? { name: '', relation: '', hospital: '', amount: '' } : { name: '', nationalId: '', relation: '' });
    saveClaim(c); render();
  },
  rmItem: el => { const c = currentClaim(); c.damage[el.dataset.key].splice(+el.dataset.i, 1); saveClaim(c); render(); },
  saveReply: el => {
    const c = currentClaim(); const d = c.deficiencies.find(x => x.id === el.dataset.id);
    const v = $(`#rep-${d.id}`).value.trim(); if (!v) { toast('متن پاسخ را بنویسید.', true); return; }
    run(() => B.defect(c, d.id, 'reply', v), 'پاسخ ثبت شد.').then(render);
  },
  flag: el => openSheet(`<h2>اعلام نقص</h2><p class="lead">${esc(el.dataset.title)}</p>
    <form class="form" data-form="defect" data-target="${esc(el.dataset.target)}" data-title="${esc(el.dataset.title)}" style="border:0;padding:0">
      <label class="fld"><span>شرح نقص</span><textarea id="def-note2" name="note" required placeholder="دقیقاً بنویسید چه چیزی باید اصلاح یا اضافه شود."></textarea></label>
      <div class="btns"><button class="btn orange" type="submit">ثبت نقص</button><button class="btn ghost" type="button" data-act="closeSheet">انصراف</button></div></form>`),
  defAccept: el => run(() => B.defect(currentClaim(), el.dataset.id, 'accept')).then(render),
  defReject: el => run(() => B.defect(currentClaim(), el.dataset.id, 'reject')).then(render),
  defDelete: el => run(() => B.defect(currentClaim(), el.dataset.id, 'delete')).then(render),
  prefillAssess: () => {
    const c = currentClaim(); c.assessment ||= { adjuster: st.user.name, visitDate: '', note: '', items: [] };
    const d = c.damage;
    c.assessment.items = [
      ...(d.items || []).map(i => ({ category: 'property', title: i.title, claimed: num(i.amount), approved: num(i.amount) })),
      ...(d.injured || []).map(i => ({ category: 'medical', title: 'درمان: ' + i.name, claimed: num(i.amount), approved: num(i.amount) })),
      ...(d.deceased || []).map(i => ({ category: 'death', title: 'فوت: ' + i.name, claimed: db.settings.deathCapRial, approved: db.settings.deathCapRial })),
    ];
    saveClaim(c); render();
  },
  addAssess: () => { const c = currentClaim(); c.assessment ||= { adjuster: st.user.name, visitDate: '', note: '', items: [] }; c.assessment.items.push({ category: 'property', title: '', claimed: 0, approved: 0 }); saveClaim(c); render(); },
  rmAssess: el => { const c = currentClaim(); c.assessment.items.splice(+el.dataset.i, 1); saveClaim(c); render(); },
  copyCred: el => {
    const text = el.dataset.text;
    navigator.clipboard?.writeText(text).then(() => toast('رونوشت شد.'), () => toast('رونوشت ممکن نشد؛ متن را دستی انتخاب کنید.', true));
  },
  resetSubPw: el => resetPassword(el.dataset.id),
  resetPw: el => resetPassword(el.dataset.id),
  toggleUser: el => run(() => B.toggleUser(el.dataset.id)).then(render),
  addStaff: () => openSheet(`<h2>کاربر جدید کارکنان</h2><form class="form" data-form="staff" style="border:0;padding:0">
      <label class="fld"><span>نام و نام خانوادگی</span><input id="sf-name" name="name" required></label>
      <div class="grid2"><label class="fld"><span>نام کاربری</span><input id="sf-user" name="username" class="ltr" required></label>
      <label class="fld"><span>نقش</span><select id="sf-role" name="role"><option value="gas">کارشناس شرکت گاز</option><option value="insurer">کارشناس بیمه‌گر</option><option value="admin">مدیر سامانه</option></select></label></div>
      <label class="fld"><span>واحد سازمانی</span><input id="sf-org" name="org"></label>
      <div class="btns"><button class="btn green" type="submit">ساخت و صدور رمز موقت</button></div></form>`),
  rmLogo: () => run(() => B.saveSettings({ logoDataUrl: '' }), 'لوگو حذف شد.').then(render),
  resetDemo: () => openSheet(`<h2>بازنشانی داده‌های نمایشی</h2><p class="lead">همه پرونده‌ها، کاربران و فایل‌های این مرورگر پاک و داده‌های نمونه دوباره ساخته می‌شود.</p>
      <div class="btns"><button class="btn red" data-act="resetDemoYes">بازنشانی</button><button class="btn ghost" data-act="closeSheet">انصراف</button></div>`),
  resetDemoYes: async () => { closeSheet(); if (!await run(() => B.resetDemo(), 'داده‌های نمونه بازنشانی شد.')) return; urlCache.clear(); go('home'); },
};

// ---------- بازیابی رمز عبور (فراموشی رمز) ----------
// کاربر نام کاربری و موبایل ثبت‌شده را وارد می‌کند، کد ۶ رقمی پیامکی می‌گیرد و رمز تازه می‌گذارد.
// کد فقط به‌صورت هش نگه داشته می‌شود، ۲ دقیقه اعتبار دارد و حداکثر ۵ بار می‌شود امتحانش کرد.
// پیام مرحله اول برای حساب موجود و ناموجود یکسان است تا وجود حساب لو نرود.
let rst = null, otpTick = null;
function forgotSheet(step = 'id', err = '') {
  clearInterval(otpTick);
  const e = err ? `<div class="note bad">${icon('alert')}<div>${esc(err)}</div></div>` : '';
  if (step === 'id') {
    openSheet(`<h2>بازیابی رمز عبور</h2><p class="lead">کد تأیید به موبایلی که در شرکت گاز ثبت کرده‌اید پیامک می‌شود.</p>${e}
      <form class="form flat" data-form="forgotId">
        <label class="fld" for="fg-user"><span>نام کاربری</span><input id="fg-user" name="username" class="ltr" required autocomplete="username" placeholder="برای مشترکین: شماره اشتراک گاز" value="${esc(rst?.username || $('#lg-user')?.value || '')}"></label>
        <label class="fld" for="fg-mob"><span>شماره موبایل ثبت‌شده</span><input id="fg-mob" name="mobile" class="ltr" required inputmode="tel" autocomplete="tel" placeholder="09xxxxxxxxx" value="${esc(rst?.mobile || '')}"></label>
        <div class="btns"><button class="btn" type="submit">${icon('sms')} ارسال کد تأیید</button><button class="btn ghost" type="button" data-act="closeSheet">انصراف</button></div>
        <small class="muted">موبایل خود را عوض کرده‌اید یا کارمند هستید و موبایل ثبت نکرده‌اید؟ از شرکت گاز یا مدیر سامانه رمز موقت جدید بگیرید.</small>
      </form>`);
    return;
  }
  if (step === 'code') {
    const last = rst.demoSms ? { text: rst.demoSms } : null;
    openSheet(`<h2>کد تأیید</h2><p class="lead">اگر نام کاربری و موبایل درست باشد، کد ۶ رقمی به <span class="num" dir="ltr">${fa(rst.mobile.replace(/^(\d{4})\d{4}/, '$1****'))}</span> پیامک شده است.</p>${e}
      ${last ? `<div class="sms-demo">${icon('sms')}<div><b>پیامک نمایشی</b>${esc(last.text)}</div></div>` : ''}
      <form class="form flat" data-form="forgotCode">
        <label class="fld" for="fg-code"><span>کد تأیید</span><input id="fg-code" name="code" class="ltr otp" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="------"></label>
        <div class="otp-left" id="otp-left"></div>
        <div class="btns"><button class="btn green" type="submit">تأیید کد</button><button class="btn ghost" type="button" data-act="otpResend" id="otp-resend" disabled>ارسال دوباره</button></div>
        <button class="link" type="button" data-act="forgot">${icon('edit')} اصلاح نام کاربری یا موبایل</button>
      </form>`);
    const tick = () => {
      const left = Math.max(0, Math.ceil((rst.exp - Date.now()) / 1000));
      const el = $('#otp-left'); if (!el) { clearInterval(otpTick); return; }
      el.textContent = left ? `اعتبار کد: ${fa(Math.floor(left / 60))}:${fa(String(left % 60).padStart(2, '0'))}` : 'کد منقضی شد؛ دوباره ارسال کنید.';
      el.classList.toggle('over', !left);
      const r = $('#otp-resend'); if (r) r.disabled = left > rst.ttl / 2000;
    };
    tick(); otpTick = setInterval(tick, 1000);
    return;
  }
  openSheet(`<h2>رمز عبور جدید</h2><p class="lead">کد تأیید شد. رمز تازه‌ای انتخاب کنید.</p>${e}
    <form class="form flat" data-form="forgotNew">
      <label class="fld" for="fg-p1"><span>رمز جدید</span><input id="fg-p1" name="p1" type="password" class="ltr" minlength="6" required autocomplete="new-password"><small>دست‌کم ۶ نویسه</small></label>
      <label class="fld" for="fg-p2"><span>تکرار رمز جدید</span><input id="fg-p2" name="p2" type="password" class="ltr" minlength="6" required autocomplete="new-password"></label>
      <button class="btn green" type="submit">ذخیره رمز و بازگشت به ورود</button>
    </form>`);
}
// کد را پشتیبان می‌سازد و پیامک می‌کند؛ اینجا فقط زمان اعتبار و (در حالت نمایشی) متن پیامک نگه داشته می‌شود
async function sendOtp(username, mobile) {
  const r = await B.forgotStart(username, mobile);
  rst = { username, mobile, ...r };
}

function credSheet(r, title = 'رمز موقت صادر شد') {
  openSheet(`<h2>${title}</h2><div class="cred"><div class="line"><span>نام کاربری</span><code>${esc(r.username)}</code></div><div class="line"><span>رمز موقت</span><code>${esc(r.password)}</code></div>
    <small>${r.mobile ? 'به ' + fa(r.mobile) + ' پیامک شد. ' : ''}کاربر در ورود بعدی باید رمز را تغییر دهد.</small></div><button class="btn ghost" data-act="closeSheet">بستن</button>`);
}
async function resetPassword(id) {
  const r = await run(() => B.resetUserPw(id));
  if (r) { credSheet(r); render(); }
}

const FORMS = {
  login: f => doLogin(f.username.value, f.password.value),
  forgotId: async f => {
    const username = W.normalizeDigits(f.username.value).trim(), mobile = W.normalizeDigits(f.mobile.value).trim();
    if (!W.isValidMobile(mobile)) return forgotSheet('id', 'شماره موبایل را ۱۱ رقمی و با ۰۹ وارد کنید.');
    try { await sendOtp(username, mobile); } catch (e) { return forgotSheet('id', e.message); }
    forgotSheet('code');
  },
  forgotCode: async f => {
    if (!rst) return forgotSheet('id');
    try { await B.forgotVerify(f.code.value); } catch (e) {
      if (e.restart) { rst = null; return forgotSheet('id', e.message); }
      return forgotSheet('code', e.message);
    }
    forgotSheet('new');
  },
  forgotNew: async f => {
    if (f.p1.value !== f.p2.value) return forgotSheet('new', 'تکرار رمز با رمز جدید یکسان نیست.');
    let username;
    try { username = await B.forgotReset(f.p1.value); } catch (e) {
      if (e.restart) { rst = null; return forgotSheet('id', e.message); }
      return forgotSheet('new', e.message);
    }
    rst = null; closeSheet();
    const lu = $('#lg-user'); if (lu) { lu.value = username; $('#lg-pass').value = ''; $('#lg-pass').focus(); }
    toast('رمز جدید ذخیره شد. با آن وارد شوید.');
  },
  newpw: async f => {
    if (f.p1.value !== f.p2.value) return toast('تکرار رمز با رمز جدید یکسان نیست.', true);
    if (await run(() => B.setPassword({ next: f.p1.value }), 'رمز ذخیره شد.')) go('home');
  },
  changepw: async f => {
    if (f.p1.value !== f.p2.value) return toast('تکرار رمز یکسان نیست.', true);
    if (await run(() => B.setPassword({ current: f.p0.value, next: f.p1.value }), 'رمز تغییر کرد.')) closeSheet();
  },
  msg: async f => {
    const c = claimById(f.dataset.id); const text = f.text.value.trim(); if (!text) return;
    const internal = !!(f.internal && f.internal.checked);
    if (!await run(() => B.message(c, text, internal))) return;
    markRead(claimById(c.id)); render();
    const t = $('#msg-text'); if (t) t.focus();
  },
  action: f => runAction(f.dataset.action, f.note.value.trim(), { causeConfirmed: !!(f.causeConfirmed && f.causeConfirmed.checked) }),
  fin: async f => {
    const c = currentClaim(); const step = f.dataset.step;
    const v = k => (f[k] ? W.normalizeDigits(f[k].value).trim() : '');
    const data = step === 'fin_review' ? { reviewer: f.reviewer.value.trim(), shebaMatch: f.shebaMatch.checked, note: f.note.value.trim() }
      : step === 'fin_voucher' ? { voucherNo: v('voucherNo'), date: v('date'), amount: +v('amount') }
      : { method: f.method.value, ref: v('ref'), date: v('date') };
    if (!await run(() => B.finance(c, step, data))) return;
    toast(W.FIN_STAGES.find(x => x.id === claimById(c.id).finance.stage).label + ' — ثبت شد.'); render();
  },
  defect: async f => {
    const c = currentClaim(); const note = f.note.value.trim(); if (!note) return;
    if (!await run(() => B.addDefect(c, { target: f.dataset.target || 'general', title: f.dataset.title || '', note }))) return;
    closeSheet(); toast('ثبت شد. برای اعلام به ' + (st.user.role === 'insurer' ? 'شرکت گاز «درخواست مدارک تکمیلی»' : 'مشترک «اعلام نقص و بازگشت»') + ' را بزنید.'); render();
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
    const r = await run(() => B.register({ name: v('name'), nationalId: v('nationalId'), subscriptionNo: v('subscriptionNo'), mobile: v('mobile'), date: W.jalaliString(d), type: f.type.value, address: v('address'), note: f.note.value.trim() }));
    if (r) go('registered', r);
  },
  settings: async f => {
    const s = db.settings; const patch = {};
    if (f.orgName) patch.orgName = f.orgName.value.trim();
    for (const k of Object.keys(s)) {
      if (k === 'orgName' || k === 'logoDataUrl' || k === 'fireOffers' || !f[k]) continue;
      patch[k] = typeof s[k] === 'number' ? num(f[k].value) : W.normalizeDigits(f[k].value).trim();
    }
    if (f.fo0_insurer) {
      patch.fireOffers = [0, 1, 2].map(i => Object.fromEntries(Object.keys(W.FIRE_OFFER_FIELDS).map(k => [k, f[`fo${i}_${k}`].value.trim()])));
      const bad = patch.fireOffers.find(o => o.url && !W.safeOfferUrl(o.url));
      if (bad) return toast(`نشانی خرید «${bad.insurer || bad.plan}» باید با https:// شروع شود.`, true);
    }
    await run(() => B.saveSettings(patch), 'تنظیمات ذخیره شد.'); render();
  },
  staff: async f => {
    const r = await run(() => B.addStaff({ username: f.username.value.trim(), name: f.name.value.trim(), role: f.role.value, org: f.org.value.trim() }));
    if (r) { credSheet(r, 'کاربر ساخته شد'); render(); }
  },
};

function onBind(el) {
  const c = currentClaim(); if (!c) return;
  const path = el.dataset.bind;
  let val = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.num !== undefined) val = num(val);
  else if (typeof val === 'string' && /(date|Date|time|postalCode|ReportNo|qty|amount|nationalId|ref)$/.test(path)) val = W.normalizeDigits(val).trim();
  if (path.endsWith('.amount')) val = String(num(val) || '');
  if (path === 'bank.sheba') val = W.normalizeDigits(val).replace(/\s|-/g, '').toUpperCase();
  if (path.startsWith('assessment')) c.assessment ||= { adjuster: '', visitDate: '', note: '', items: [] };
  if (path.startsWith('payment')) c.payment ||= {};
  setPath(c, path, val);
  saveClaim(c);
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
      if (n === 'reports') return go('reports');
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
    if (el.matches('input[type=file][data-logo]')) return handleLogo(el);
    if (el.matches('[data-kind]')) {
      const c = currentClaim(); const k = el.dataset.kind;
      c.damage.kinds = el.checked ? [...new Set([...c.damage.kinds, k])] : c.damage.kinds.filter(x => x !== k);
      if (el.checked && k === 'property' && !c.damage.items.length) c.damage.items.push({ title: '', qty: 1, amount: '' });
      if (el.checked && k === 'medical' && !c.damage.injured.length) c.damage.injured.push({ name: '', relation: '', hospital: '', amount: '' });
      if (el.checked && k === 'death' && !c.damage.deceased.length) c.damage.deceased.push({ name: '', nationalId: '', relation: '' });
      saveClaim(c); render(); return;
    }
    if (el.matches('[data-rep]')) { st.p = { ...st.p, [el.dataset.rep]: +el.value, m: 0 }; sset('gii.view', JSON.stringify({ view: st.view, p: st.p })); return renderKeep(); }
    if (el.matches('[data-bind]')) onBind(el);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { st.q = e.target.value; const l = $('#claimList'); if (l) l.innerHTML = listHtml(); }
    if (e.target.id === 'uq') { st.q = e.target.value; const pos = e.target.selectionStart; render(); const n = $('#uq'); n.focus(); n.setSelectionRange(pos, pos); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#printdoc')) closePrintDoc(); else closeSheet(); } });
}

// ================= راه‌اندازی =================
async function boot() {
  const t = lget('gii.theme'); if (t) document.documentElement.dataset.theme = t;
  try { db = await B.boot(); } catch (e) {
    $('#app').innerHTML = `<main class="page narrow"><div class="note bad">${icon('alert')}<div><b>سامانه در دسترس نیست</b>${esc(e.message)}</div></div></main>`;
    return;
  }
  wire();
  const uid = B.meId();
  st.user = uid ? db.users.find(u => u.id === uid && u.active) || null : null;
  if (st.user) { try { const v = JSON.parse(sget('gii.view') || 'null'); if (v) { st.view = v.view; st.p = v.p || {}; if (st.p.id) st.claimId = st.p.id; } } catch { /* نادیده */ } }
  render();
  if (!st.user && location.hash) document.querySelector(location.hash)?.scrollIntoView();
  if (MODE === 'app' && 'serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register(window.GII_WP?.sw || 'sw.js').catch(() => {});
  // در وردپرس دیگران هم پرونده را تغییر می‌دهند؛ هنگام بازگشت به صفحه و هر دقیقه داده تازه می‌شود
  // داشبورد گزارش هر ۱۵ ثانیه تازه می‌شود (در وردپرس تغییرات کاربران دیگر هم دیده می‌شود)
  setInterval(() => {
    if (!st.user || st.view !== 'reports' || document.visibilityState !== 'visible' || $('#sheet') || $('#printdoc') || document.activeElement?.matches('select')) return;
    sync().then(() => { liveAt = new Date(); if (st.view === 'reports') renderKeep(); }).catch(() => {});
  }, 15000);
  if (B.kind === 'wp') {
    const idle = () => !$('#sheet') && !document.activeElement?.matches('input, textarea, select');
    const tick = () => { if (st.user && idle() && document.visibilityState === 'visible') sync().then(render).catch(() => {}); };
    document.addEventListener('visibilitychange', tick);
    setInterval(tick, 60000);
  }
}
boot();

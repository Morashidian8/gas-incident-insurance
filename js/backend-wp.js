// پشتیبان وردپرس: داده‌ها روی سرور و از REST افزونه (gii/v1) خوانده و نوشته می‌شود.
// سرور همه قواعد را دوباره بررسی می‌کند؛ اینجا فقط درخواست‌ها فرستاده و پاسخ‌ها ترجمه می‌شوند.
// window.GII_WP را قالب افزونه (templates/canvas.php) می‌سازد: { rest, nonce }.
export const kind = 'wp';
const CFG = (typeof window !== 'undefined' && window.GII_WP) || {};
let nonce = CFG.nonce || '';
let D = null;

async function req(method, path, body, asBlob = false, retried = false) {
  const opt = { method, credentials: 'same-origin', headers: nonce ? { 'X-WP-Nonce': nonce } : {} };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(CFG.rest + path, opt); } catch { throw new Error('ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید.'); }
  if (asBlob) { if (!r.ok) throw new Error('فایل در دسترس نیست.'); return r.blob(); }
  const j = await r.json().catch(() => ({}));
  // nonce کهنه (مثلاً پس از خروج یا پایان نشست): یک بار nonce تازه گرفته و درخواست تکرار می‌شود
  if (r.status === 403 && j.code === 'rest_cookie_invalid_nonce' && !retried) {
    nonce = '';
    const b = await req('GET', 'bootstrap', undefined, false, true).catch(() => null);
    if (b && b.nonce) nonce = b.nonce;
    return req(method, path, body, asBlob, true);
  }
  if (!r.ok) {
    const e = new Error(j.message || 'خطا در ارتباط با سرور');
    e.status = r.status; e.restart = !!(j.data && j.data.restart);
    throw e;
  }
  return j;
}

export async function boot() { return refresh(); }
export async function refresh() {
  const j = await req('GET', 'bootstrap');
  if (j.nonce) nonce = j.nonce;
  D = j.db; D.meId = j.me;
  return D;
}
export const data = () => D;
export const meId = () => (D && D.meId) || null;

// ---------- ورود و رمز ----------
export async function login(username, password) {
  const j = await req('POST', 'auth/login', { username, password });
  nonce = j.nonce;
  await refresh();
}
export async function logout() {
  const j = await req('POST', 'auth/logout');
  nonce = j.nonce || '';
  await refresh();
}
// وردپرس با تغییر رمز نشست‌ها را می‌بندد و سرور نشست تازه با nonce تازه برمی‌گرداند
export async function setPassword(p) { const j = await req('POST', 'auth/password', p); if (j.nonce) nonce = j.nonce; }

let rid = '', token = '';
export async function forgotStart(username, mobile) {
  const j = await req('POST', 'auth/forgot', { username, mobile });
  rid = j.rid; token = '';
  return { exp: Date.now() + j.ttl, ttl: j.ttl, demoSms: j.demoSms || '' };
}
export async function forgotVerify(code) { token = (await req('POST', 'auth/verify', { rid, code })).token; }
export async function forgotReset(password) { return (await req('POST', 'auth/reset', { rid, token, password })).username; }

// ---------- ثبت‌نام اینترنتی مشترک ----------
let srid = '', stoken = '';
export async function signupStart(f) {
  const j = await req('POST', 'signup/start', f);
  srid = j.rid; stoken = '';
  return { exp: Date.now() + j.ttl, ttl: j.ttl, demoSms: j.demoSms || '', shahkar: j.shahkar };
}
export async function signupVerify(code) { stoken = (await req('POST', 'signup/verify', { rid: srid, code })).token; }
// فرم چندبخشی: داده‌ها به‌صورت JSON و فایل‌ها با نام شکاف (national_card[]، bill[]، proof[])
function regForm(data, files) {
  const fd = new FormData();
  fd.append('data', JSON.stringify(data));
  for (const [k, list] of Object.entries(files || {})) for (const b of list) fd.append(k + '[]', b, b.name || k);
  return fd;
}
export async function signupSubmit(data, files) {
  const fd = regForm(data, files);
  fd.append('rid', srid); fd.append('token', stoken);
  const j = await req('POST', 'signup/submit', fd);
  nonce = j.nonce;
  await refresh();
}
export async function regResubmit(data, files) { await req('POST', 'regs/me', regForm(data, files)); }
export async function regReview(uid, decision, note) { return req('POST', `regs/${uid}/review`, { decision, note }); }
export async function regFile(uid, fid) { return req('GET', `regs/${uid}/files/${fid}`, undefined, true); }

// ---------- پرونده ----------
// ویرایش فیلدها با تأخیر کوتاه یک‌جا فرستاده می‌شود. اگر کاربر در فاصله ارسال تا پاسخ
// دوباره چیزی را عوض کرده باشد، پاسخ سرور روی ویرایش تازه‌تر نوشته نمی‌شود.
const edits = new WeakMap();
const timers = new Map();
const inflight = new Map();
const EDITABLE = ['incident', 'damage', 'bank', 'declaration', 'assessment', 'payment', 'release'];
function sendClaim(c) {
  timers.delete(c.id);
  const v = edits.get(c);
  const body = {};
  for (const k of EDITABLE) if (c[k] !== undefined) body[k] = c[k];
  const p = req('PUT', `claims/${c.id}`, body).then(j => {
    if (edits.get(c) === v) Object.assign(c, j.claim);
  }).finally(() => { if (inflight.get(c.id) === p) inflight.delete(c.id); });
  inflight.set(c.id, p);
  return p;
}
export function saveClaim(c) {
  edits.set(c, (edits.get(c) || 0) + 1);
  clearTimeout(timers.get(c.id)?.t);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => sendClaim(c).then(resolve, reject), 500);
    timers.set(c.id, { t, c, resolve, reject });
  });
}
// ویرایش‌های در صف را پیش از هر عمل وضعیت می‌فرستد تا سرور آخرین داده را ببیند
export async function flush() {
  for (const { t, c, resolve, reject } of [...timers.values()]) { clearTimeout(t); sendClaim(c).then(resolve, reject); }
  await Promise.all([...inflight.values()]);
}

export async function action(c, id, note, opts = {}) { await flush(); await req('POST', `claims/${c.id}/action`, { action: id, note, ...opts }); }
export async function finance(c, step, data) { await flush(); await req('POST', `claims/${c.id}/finance`, { step, data }); }
export async function addDefect(c, d) { await req('POST', `claims/${c.id}/defects`, d); }
export async function defect(c, id, op, reply = '') { await req('POST', `claims/${c.id}/defects/${id}`, { op, reply }); }
export async function message(c, text, internal) { await req('POST', `claims/${c.id}/messages`, { text, internal }); }
export async function markRead(c) {
  (D.reads[D.meId] ||= {})[c.id] = new Date().toISOString();
  req('POST', `claims/${c.id}/read`).catch(() => {});
}
export async function readNotifs(ids) {
  for (const n of D.notifications) if (ids.includes(n.id) && !n.readBy.includes(D.meId)) n.readBy.push(D.meId);
  await req('POST', 'notifications/read', { ids });
}

// ---------- فایل ----------
export async function upload(c, target, blob, name) {
  await flush();
  const fd = new FormData();
  fd.append('target', target);
  fd.append('file', blob, name);
  await req('POST', `claims/${c.id}/files`, fd);
}
export async function removeFile(c, id) { await req('DELETE', `claims/${c.id}/files/${id}`); }
export async function getFile(claimId, id) { return req('GET', `claims/${claimId}/files/${id}`, undefined, true); }

// ---------- شرکت گاز و مدیریت ----------
export async function register(f) { return req('POST', 'claims', f); }
export async function saveSettings(patch) { await req('POST', 'settings', patch); }
export async function resetUserPw(id) { return req('POST', `users/${id}/reset`); }
export async function addStaff(u) { return req('POST', 'users', u); }
export async function toggleUser(id) { await req('POST', `users/${id}/toggle`); }
export async function resetDemo() { await req('POST', 'demo/reset'); return refresh(); }

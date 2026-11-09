// پشتیبان محلی: همه داده‌ها در همین مرورگر (localStorage و IndexedDB).
// همان رابطی را دارد که backend-wp.js با REST وردپرس پیاده می‌کند؛ app.js فقط با این رابط کار می‌کند.
// هر تابع در صورت خطا Error با پیام فارسیِ قابل نمایش پرتاب می‌کند.
import * as W from './workflow.js';
import * as S from './store.js';

export const kind = 'local';
const nf = new Intl.NumberFormat('fa-IR');
const sget = k => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sset = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* اختیاری */ } };

let me = null;
const db = () => S.getDb();
const save = () => S.save();
const userById = id => db().users.find(u => u.id === id);
const user = () => userById(me);
const fail = msg => { throw new Error(msg); };

export async function boot() {
  let d = S.load();
  if (!d || d.version !== S.DB_VERSION) d = await S.seed();
  me = sget('gii.user');
  if (!d.users.some(u => u.id === me && u.active)) me = null;
  return d;
}
export const data = () => db();
export const meId = () => me;
export async function refresh() { return db(); }

// ---------- ورود و رمز ----------
export async function login(username, password) {
  const uname = W.normalizeDigits(username).trim();
  const u = db().users.find(x => x.username.toLowerCase() === uname.toLowerCase());
  if (!u || u.pwHash !== await S.hashPw(u.username, password)) fail('نام کاربری یا رمز عبور نادرست است.');
  if (!u.active) fail('این حساب غیرفعال شده است. با شرکت گاز تماس بگیرید.');
  me = u.id; sset('gii.user', u.id);
  u.lastLoginAt = new Date().toISOString(); save();
}
export async function logout() { me = null; sset('gii.user', null); }

// current فقط وقتی لازم است که کاربر ملزم به تغییر رمز موقت نباشد
export async function setPassword({ current, next }) {
  const u = user();
  if (next.length < 6) fail('رمز باید دست‌کم ۶ نویسه باشد.');
  if (u.mustChangePassword) {
    if (await S.hashPw(u.username, next) === u.pwHash) fail('رمز جدید نباید با رمز موقت یکی باشد.');
  } else if (await S.hashPw(u.username, current || '') !== u.pwHash) fail('رمز فعلی نادرست است.');
  u.pwHash = await S.hashPw(u.username, next); u.mustChangePassword = false; save();
}

// بازیابی رمز: کد فقط هش‌شده نگه داشته می‌شود؛ پاسخ مرحله اول برای حساب موجود و ناموجود یکسان است.
const OTP_TTL = 120000, OTP_TRIES = 5;
let otp = null;
export async function forgotStart(username, mobile) {
  username = W.normalizeDigits(username).trim(); mobile = W.normalizeDigits(mobile).trim();
  if (!W.isValidMobile(mobile)) fail('شماره موبایل را ۱۱ رقمی و با ۰۹ وارد کنید.');
  const u = db().users.find(x => x.active && x.mobile && x.username.toLowerCase() === username.toLowerCase() && x.mobile === mobile);
  const code = String(100000 + Math.floor(Math.random() * 900000));
  otp = { userId: u?.id || null, exp: Date.now() + OTP_TTL, tries: 0, ok: false, hash: u ? await S.hashPw(u.username, 'otp:' + code) : '' };
  let demoSms = '';
  if (u) { demoSms = `کد بازیابی رمز سامانه بیمه حوادث گاز: ${code} — این کد را به هیچ‌کس ندهید.`; S.sendSms(mobile, demoSms); save(); }
  return { exp: otp.exp, ttl: OTP_TTL, demoSms };
}
export async function forgotVerify(code) {
  if (!otp) fail('دوباره از اول شروع کنید.');
  if (Date.now() > otp.exp) fail('کد منقضی شده است؛ «ارسال دوباره» را بزنید.');
  if (++otp.tries > OTP_TRIES) { otp = null; const e = new Error('تعداد تلاش‌ها زیاد بود. دوباره از اول شروع کنید.'); e.restart = true; throw e; }
  const u = otp.userId && userById(otp.userId);
  if (!u || await S.hashPw(u.username, 'otp:' + W.normalizeDigits(code).trim()) !== otp.hash) fail(`کد نادرست است. ${(OTP_TRIES - otp.tries).toLocaleString('fa-IR')} بار دیگر می‌توانید امتحان کنید.`);
  otp.ok = true;
}
export async function forgotReset(password) {
  const u = otp?.ok && userById(otp.userId);
  if (!u) { const e = new Error('دوباره از اول شروع کنید.'); e.restart = true; throw e; }
  if (password.length < 6) fail('رمز باید دست‌کم ۶ نویسه باشد.');
  u.pwHash = await S.hashPw(u.username, password); u.mustChangePassword = false;
  S.sendSms(u.mobile, 'رمز عبور حساب شما در سامانه بیمه حوادث گاز تغییر کرد. اگر شما این کار را نکرده‌اید، با شرکت گاز تماس بگیرید.');
  S.notify({ toUser: u.id, text: 'رمز عبور حساب شما با کد پیامکی بازیابی شد.' });
  save(); otp = null;
  return u.username;
}

// ---------- پرونده ----------
// ویرایش فیلدها مستقیم روی شیء پرونده انجام شده؛ اینجا فقط ذخیره می‌شود.
export async function saveClaim() { save(); }
export async function flush() {}

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
export async function action(c, id, note, opts = {}) {
  if (id === 'ins_pay' && c.payment && c.assessment) c.payment.amount = c.payment.amount || W.computePayable(c.assessment.items, db().settings, c.damage.deceased?.length || 0).payable;
  Object.assign(c, W.applyAction(c, id, user(), note, new Date(), opts));
  afterAction(c, id, note);
  save();
}
export async function finance(c, step, data) {
  Object.assign(c, W.applyFinance(c, step, data, user()));
  const sub = userById(c.subscriberId);
  const msg = step === 'fin_review' ? `بررسی مالی پرونده ${c.code} انجام و شبای شما تأیید شد.`
    : step === 'fin_voucher' ? `حواله پرداخت خسارت پرونده ${c.code} به شماره ${data.voucherNo} و مبلغ ${nf.format(data.amount)} ریال صادر شد.`
    : `دستور پرداخت خسارت پرونده ${c.code} از طریق ${W.TRANSFER_METHODS[data.method].label} به بانک ارسال شد. پیگیری: ${data.ref}`;
  S.notify({ toUser: sub.id, text: msg, claimId: c.id });
  if (step !== 'fin_review') S.sendSms(sub.mobile, msg);
  save();
}
export async function addDefect(c, { target, title, note }) {
  const u = user();
  c.deficiencies.push({ id: S.uid('d'), target: target || 'general', title: title || (u.role === 'insurer' ? 'درخواست بیمه‌گر' : 'نقص عمومی'), note, by: u.role, byName: u.name, at: new Date().toISOString(), status: 'open', reply: '' });
  save();
}
// op: reply | accept | reject | delete
export async function defect(c, id, op, reply = '') {
  const d = c.deficiencies.find(x => x.id === id);
  if (!d) fail('این مورد پیدا نشد.');
  const now = new Date().toISOString();
  if (op === 'reply') { d.reply = reply; d.replyAt = now; d.replyBy = user().name; }
  if (op === 'accept') { d.status = 'closed'; d.closedAt = now; }
  if (op === 'reject') { d.note = d.note + ' | پاسخ قبلی کافی نبود: ' + d.reply; d.reply = ''; d.at = now; }
  if (op === 'delete') c.deficiencies = c.deficiencies.filter(x => x.id !== id);
  save();
}
export async function message(c, text, internal) {
  const u = user();
  c.messages.push({ id: S.uid('m'), at: new Date().toISOString(), by: u.name, byId: u.id, role: u.role, text, internal });
  if (u.role === 'subscriber') { S.notify({ toRole: 'gas', text: `پیام جدید از مشترک در پرونده ${c.code}`, claimId: c.id }); if (c.forwardedAt) S.notify({ toRole: 'insurer', text: `پیام جدید از مشترک در پرونده ${c.code}`, claimId: c.id }); }
  else if (!internal) S.notify({ toUser: c.subscriberId, text: `پیام جدید از ${W.ROLES[u.role]} در پرونده ${c.code}`, claimId: c.id });
  else S.notify({ toRole: u.role === 'gas' ? 'insurer' : 'gas', text: `یادداشت داخلی جدید در پرونده ${c.code}`, claimId: c.id });
  save();
}
export async function markRead(c) { (db().reads[me] ||= {})[c.id] = new Date().toISOString(); save(); }
export async function readNotifs(ids) {
  for (const n of db().notifications) if (ids.includes(n.id) && !n.readBy.includes(me)) n.readBy.push(me);
  save();
}

// ---------- فایل ----------
export async function upload(c, target, blob, name) {
  const id = S.uid('f');
  await S.putFile(id, blob);
  c.files[id] = { name, type: blob.type, size: blob.size, at: new Date().toISOString(), by: user().role };
  if (target === 'photos') c.photos.push(id); else (c.docs[target] ||= []).push(id);
  save();
}
export async function removeFile(c, id) {
  c.photos = c.photos.filter(x => x !== id);
  for (const k in c.docs) c.docs[k] = c.docs[k].filter(x => x !== id);
  delete c.files[id]; save();
}
export async function getFile(claimId, id) { return S.getFile(id); }

// ---------- ثبت مشترک (شرکت گاز) ----------
export async function register(f) {
  const d = W.parseJalali(f.date);
  let u = db().users.find(x => x.role === 'subscriber' && (x.nationalId === f.nationalId || x.subscriptionNo === f.subscriptionNo));
  const existing = !!u; let pw = null;
  if (u && u.nationalId !== f.nationalId) fail('این شماره اشتراک با کد ملی دیگری ثبت شده است.');
  if (!u) {
    if (db().users.some(x => x.username === f.subscriptionNo)) fail('نام کاربری تکراری است.');
    pw = S.tempPassword();
    u = { id: S.uid('u'), role: 'subscriber', username: f.subscriptionNo, name: f.name, nationalId: f.nationalId, subscriptionNo: f.subscriptionNo, mobile: f.mobile, address: f.address, active: true, mustChangePassword: true, createdAt: new Date().toISOString(), pwHash: await S.hashPw(f.subscriptionNo, pw) };
    db().users.push(u);
  }
  const c = newClaim(u, { date: d, type: f.type, address: f.address, note: f.note }, user(), existing ? 'تشکیل پرونده جدید برای مشترک موجود' : 'تشکیل پرونده و ایجاد حساب مشترک');
  S.sendSms(u.mobile, pw ? `مشترک گرامی، پرونده خسارت ${c.code} تشکیل شد. نام کاربری: ${u.username} — رمز موقت: ${pw}` : `مشترک گرامی، پرونده خسارت ${c.code} برای شما تشکیل شد. با حساب قبلی وارد شوید.`);
  S.notify({ toUser: u.id, text: `پرونده ${c.code} تشکیل شد. لطفاً اطلاعات و مدارک را تکمیل کنید.`, claimId: c.id });
  save();
  return { claimId: c.id, username: u.username, password: pw, existing };
}
// پرونده تازه برای مشترک (ثبت حضوری یا تأیید ثبت‌نام اینترنتی)
function newClaim(u, f, staff, label) {
  db().seq += 1;
  const now = new Date().toISOString();
  const d = f.date;
  const late = W.daysBetween(d, new Date()) > db().settings.reportWindowDays;
  const c = {
    id: S.uid('c'), code: W.claimCode(db().seq), subscriberId: u.id, createdBy: staff.id, createdAt: now, status: 'draft', statusAt: now, submitCount: 0,
    incident: { date: W.jalaliString(d), time: '', type: f.type, placeType: 'residential', address: f.address, postalCode: '', description: '', causeIssuer: '', causeReportNo: '', causeReportDate: '', causeStatesGas: false, policeReportNo: '' },
    damage: { kinds: [], items: [], injured: [], deceased: [] }, photos: [], docs: {}, files: {}, bank: { sheba: '', holder: u.name }, declaration: false,
    deficiencies: [], messages: [], assessment: null, payment: null,
    timeline: [{ at: now, by: staff.name, role: 'gas', action: 'create', label, note: [f.note, late ? `اعلام با تأخیر: بیش از ${db().settings.reportWindowDays} روز پس از حادثه` : ''].filter(Boolean).join(' — ') }],
  };
  db().claims.push(c);
  return c;
}

// ---------- ثبت‌نام اینترنتی مشترک ----------
// سه مرحله: مشخصات + کد پیامکی (و استعلام شاهکار) ← تأیید کد ← مدارک، حادثه و رمز.
// حساب تا تأیید کارشناس گاز «در انتظار» می‌ماند. محدودیت‌ها همان محدودیت‌های سرور وردپرس است.
let regOtp = null;
const rl = (key, max, ms) => {
  const r = (db().rl ||= {}); const now = Date.now();
  r[key] = (r[key] || []).filter(t => now - t < ms);
  if (r[key].length >= max) return false;
  r[key].push(now); save(); return true;
};
const blocked = mobile => { const until = (db().blocks || {})[mobile]; return until && new Date(until) > new Date(); };
// استعلام شاهکار (تطابق کد ملی با صاحب سیم‌کارت). نسخه نمایشی: موبایل‌های پایان‌یافته به ۰۰۰۰ «عدم تطابق» است.
function shahkar(nationalId, mobile) {
  return { status: /0000$/.test(mobile) ? 'mismatch' : 'ok', at: new Date().toISOString(), demo: true };
}
const cleanSignup = f => ({
  name: String(f.name || '').trim().slice(0, 100), nationalId: W.normalizeDigits(f.nationalId).trim(), subscriptionNo: W.normalizeDigits(f.subscriptionNo).trim(),
  mobile: W.normalizeDigits(f.mobile).trim(), relation: f.relation,
});
export async function signupStart(raw) {
  const f = cleanSignup(raw);
  const errs = W.signupIssues(f);
  if (errs.length) fail('بررسی کنید: ' + errs.join('، '));
  if (blocked(f.mobile)) fail('امکان ثبت‌نام با این موبایل فعلاً وجود ندارد. با شرکت گاز تماس بگیرید.');
  if (!rl('otp|' + f.mobile, 3, 600000) || !rl('otpday|' + f.mobile, 10, 86400000) || !rl('otpdev', 10, 3600000)) fail('درخواست‌ها زیاد بود. چند دقیقه دیگر دوباره امتحان کنید.');
  const sk = shahkar(f.nationalId, f.mobile);
  if (sk.status === 'mismatch') fail('این شماره موبایل به نام صاحب این کد ملی نیست (استعلام شاهکار). موبایلی را وارد کنید که به نام خودتان ثبت شده است.');
  const code = String(100000 + Math.floor(Math.random() * 900000));
  regOtp = { f, sk, hash: await S.hashPw(f.mobile, 'reg:' + code), exp: Date.now() + OTP_TTL, tries: 0, ok: false };
  const demoSms = `کد تأیید ثبت‌نام سامانه بیمه حوادث گاز: ${code} — این کد را به هیچ‌کس ندهید.`;
  S.sendSms(f.mobile, demoSms); save();
  return { exp: regOtp.exp, ttl: OTP_TTL, demoSms, shahkar: sk.status };
}
export async function signupVerify(code) {
  if (!regOtp) fail('دوباره از اول شروع کنید.');
  if (Date.now() > regOtp.exp) fail('کد منقضی شده است؛ «ارسال دوباره» را بزنید.');
  if (++regOtp.tries > OTP_TRIES) { regOtp = null; const e = new Error('تعداد تلاش‌ها زیاد بود. دوباره از اول شروع کنید.'); e.restart = true; throw e; }
  if (await S.hashPw(regOtp.f.mobile, 'reg:' + W.normalizeDigits(code).trim()) !== regOtp.hash) fail(`کد نادرست است. ${(OTP_TRIES - regOtp.tries).toLocaleString('fa-IR')} بار دیگر می‌توانید امتحان کنید.`);
  regOtp.ok = true; regOtp.exp = Date.now() + 30 * 60000; // ۳۰ دقیقه برای تکمیل مدارک
}
const subscriberClash = (f, selfId) => db().users.find(x => x.id !== selfId && x.role === 'subscriber' && !(x.reg && x.reg.status === 'rejected')
  && (x.subscriptionNo === f.subscriptionNo || x.nationalId === f.nationalId || x.mobile === f.mobile));
async function storeRegFiles(files) {
  const out = {};
  for (const [slot, list] of Object.entries(files || {})) {
    if (!W.REG_DOCS[slot]) continue;
    out[slot] = [];
    for (const b of list.slice(0, 3)) {
      if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(b.type)) fail('فقط عکس (JPG، PNG، WEBP) یا PDF پذیرفته می‌شود.');
      if (b.size > 15 * 1048576) fail('حجم هر فایل حداکثر ۱۵ مگابایت است.');
      const id = S.uid('f'); await S.putFile(id, b);
      out[slot].push({ id, name: b.name || slot, type: b.type, size: b.size, at: new Date().toISOString() });
    }
  }
  return out;
}
const regIncident = f => (f.hasIncident ? { date: W.normalizeDigits(f.incident.date).trim(), type: f.incident.type, address: String(f.incident.address || '').trim().slice(0, 500) } : null);
export async function signupSubmit(raw, files) {
  if (!regOtp?.ok || Date.now() > regOtp.exp) { const e = new Error('اعتبار کد تأیید تمام شده است. دوباره از اول شروع کنید.'); e.restart = true; throw e; }
  const f = { ...regOtp.f, hasIncident: !!raw.hasIncident, incident: raw.incident || {}, password: raw.password || '', declaration: !!raw.declaration,
    docs: Object.fromEntries(Object.entries(files || {}).map(([k, v]) => [k, v.length])) };
  const errs = W.signupFinalIssues(f);
  if (errs.length) fail('بررسی کنید: ' + errs.join('، '));
  if (subscriberClash(f)) fail('برای این شماره اشتراک، کد ملی یا موبایل قبلاً حساب ساخته شده است. وارد شوید یا «رمز عبور را فراموش کرده‌ام» را بزنید.');
  if (!rl('reg|dev', 3, 86400000)) fail('از این دستگاه امروز ثبت‌نام‌های زیادی انجام شده است. فردا دوباره امتحان کنید.');
  const d = db();
  d.users = d.users.filter(x => !(x.username === f.subscriptionNo && x.reg && x.reg.status === 'rejected'));
  const now = new Date().toISOString();
  const u = { id: S.uid('u'), role: 'subscriber', username: f.subscriptionNo, name: f.name, nationalId: f.nationalId, subscriptionNo: f.subscriptionNo, mobile: f.mobile,
    address: f.hasIncident ? f.incident.address : '', active: true, mustChangePassword: false, createdAt: now, pwHash: await S.hashPw(f.subscriptionNo, f.password),
    reg: { status: 'pending', at: now, submittedAt: now, relation: f.relation, hasIncident: f.hasIncident, incident: regIncident(f), files: await storeRegFiles(files), shahkar: regOtp.sk,
      history: [{ at: now, by: f.name, role: 'subscriber', action: 'submit', label: 'ثبت درخواست ثبت‌نام اینترنتی', note: '' }] } };
  d.users.push(u);
  S.notify({ toRole: 'gas', text: `درخواست ثبت‌نام جدید: ${u.name} — اشتراک ${u.subscriptionNo}` });
  S.sendSms(u.mobile, 'درخواست ثبت‌نام شما در سامانه بیمه حوادث گاز ثبت شد. نتیجه بررسی کارشناس شرکت گاز پیامک می‌شود.');
  regOtp = null; me = u.id; sset('gii.user', u.id); save();
}
// مشترک پس از «نیاز به اصلاح» اطلاعات یا مدارک را اصلاح و دوباره می‌فرستد
export async function regResubmit(raw, files) {
  const u = user();
  if (!u?.reg || u.reg.status !== 'needs_fix') fail('در این وضعیت امکان ویرایش درخواست نیست.');
  const f = { name: String(raw.name || '').trim().slice(0, 100), nationalId: W.normalizeDigits(raw.nationalId).trim(), subscriptionNo: u.subscriptionNo, mobile: u.mobile, relation: raw.relation };
  const errs = W.signupIssues(f);
  if (errs.length) fail('بررسی کنید: ' + errs.join('، '));
  const added = await storeRegFiles(files);
  for (const [k, v] of Object.entries(added)) if (v.length) u.reg.files[k] = v; // فایل تازه جایگزین قبلی می‌شود
  const all = { ...f, hasIncident: !!raw.hasIncident, incident: raw.incident || {}, password: '------', declaration: true, docs: Object.fromEntries(Object.entries(u.reg.files).map(([k, v]) => [k, v.length])) };
  const errs2 = W.signupFinalIssues(all).filter(x => !x.startsWith('رمز'));
  if (errs2.length) fail('بررسی کنید: ' + errs2.join('، '));
  if (subscriberClash(f, u.id)) fail('این کد ملی برای حساب دیگری ثبت شده است.');
  const now = new Date().toISOString();
  Object.assign(u, { name: f.name, nationalId: f.nationalId, address: all.hasIncident ? all.incident.address : u.address });
  Object.assign(u.reg, { status: 'pending', submittedAt: now, relation: f.relation, hasIncident: all.hasIncident, incident: regIncident(all) });
  u.reg.history.push({ at: now, by: u.name, role: 'subscriber', action: 'resubmit', label: 'اصلاح و ارسال دوباره درخواست', note: raw.reply || '' });
  S.notify({ toRole: 'gas', text: `درخواست ثبت‌نام اصلاح شد: ${u.name} — اشتراک ${u.subscriptionNo}` });
  save();
}
// تصمیم کارشناس گاز: approve | fix | reject | spam
export async function regReview(uid, decision, note = '') {
  const staff = user();
  if (!['gas', 'admin'].includes(staff.role)) fail('فقط کارشناس شرکت گاز.');
  const u = userById(uid);
  if (!u?.reg || !['pending', 'needs_fix'].includes(u.reg.status)) fail('این درخواست دیگر قابل بررسی نیست.');
  note = String(note || '').trim();
  if (decision !== 'approve' && note.length < 3) fail('دلیل یا توضیح را بنویسید.');
  const now = new Date().toISOString();
  const LBL = { approve: 'تأیید ثبت‌نام', fix: 'درخواست اصلاح', reject: 'رد درخواست', spam: 'مسدودسازی به‌عنوان اسپم' };
  if (!LBL[decision]) fail('تصمیم نامعتبر است.');
  u.reg.history.push({ at: now, by: staff.name, role: staff.role, action: decision, label: LBL[decision], note });
  Object.assign(u.reg, { reviewedBy: staff.name, reviewedAt: now, note });
  let claimId = null;
  if (decision === 'approve') {
    u.reg.status = 'approved';
    if (u.reg.hasIncident && u.reg.incident) {
      const c = newClaim(u, { date: W.parseJalali(u.reg.incident.date), type: u.reg.incident.type, address: u.reg.incident.address, note: note || '' }, staff, 'تأیید ثبت‌نام اینترنتی و تشکیل پرونده');
      // مدارک ثبت‌نام همان مدارک پرونده‌اند؛ دوباره خواسته نمی‌شوند
      for (const [slot, list] of Object.entries(u.reg.files || {})) for (const fl of list) {
        c.files[fl.id] = { name: fl.name, type: fl.type, size: fl.size, at: fl.at, by: 'subscriber' };
        (c.docs[W.REG_DOC_TO_CLAIM[slot]] ||= []).push(fl.id);
      }
      claimId = c.id;
    }
    S.sendSms(u.mobile, `ثبت‌نام شما در سامانه بیمه حوادث گاز تأیید شد. نام کاربری: ${u.username} و رمزی که خودتان ساختید.${claimId ? ' پرونده خسارت شما تشکیل شد.' : ''}`);
    S.notify({ toUser: u.id, text: claimId ? 'ثبت‌نام شما تأیید و پرونده خسارت تشکیل شد. لطفاً اطلاعات و مدارک را تکمیل کنید.' : 'ثبت‌نام شما تأیید شد.', claimId });
  } else if (decision === 'fix') {
    u.reg.status = 'needs_fix';
    S.sendSms(u.mobile, `درخواست ثبت‌نام شما نیاز به اصلاح دارد: ${note} — وارد سامانه شوید و اصلاح کنید.`);
    S.notify({ toUser: u.id, text: `درخواست ثبت‌نام نیاز به اصلاح دارد: ${note}` });
  } else if (decision === 'reject') {
    u.reg.status = 'rejected';
    S.sendSms(u.mobile, `درخواست ثبت‌نام شما در سامانه بیمه حوادث گاز رد شد. دلیل: ${note}`);
    S.notify({ toUser: u.id, text: `درخواست ثبت‌نام رد شد: ${note}` });
  } else {
    u.reg.status = 'spam'; u.active = false;
    (db().blocks ||= {})[u.mobile] = new Date(Date.now() + 7 * 86400000).toISOString();
  }
  save();
  return { claimId };
}
export async function regFile(uid, fid) { return S.getFile(fid); }

// ---------- مدیریت ----------
export async function saveSettings(patch) { Object.assign(db().settings, patch); save(); }
export async function resetUserPw(id) {
  const u = userById(id);
  const pw = S.tempPassword();
  u.pwHash = await S.hashPw(u.username, pw); u.mustChangePassword = true; u.active = true;
  if (u.mobile) S.sendSms(u.mobile, `رمز موقت جدید سامانه بیمه حوادث گاز: ${pw}`);
  save();
  return { username: u.username, password: pw, mobile: u.mobile || '' };
}
export async function addStaff({ username, name, role, org }) {
  if (db().users.some(u => u.username.toLowerCase() === username.toLowerCase())) fail('این نام کاربری وجود دارد.');
  const u = { id: S.uid('u'), role, username, name, org, active: true, mustChangePassword: true, createdAt: new Date().toISOString(), pwHash: '' };
  db().users.push(u);
  return resetUserPw(u.id);
}
export async function toggleUser(id) { const u = userById(id); u.active = !u.active; save(); }
export async function resetDemo() {
  const d = await S.seed();
  me = d.users.find(u => u.role === 'admin').id; sset('gii.user', me);
  return d;
}

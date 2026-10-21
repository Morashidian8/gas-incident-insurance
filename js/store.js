// ذخیره‌سازی محلی نسخه نمایشی: داده‌ها در localStorage و فایل‌ها در IndexedDB.
// در نسخه عملیاتی این لایه با API سرور جایگزین می‌شود (docs/DESIGN.md بخش معماری).
import { DEFAULT_SETTINGS, DOC_TYPES, claimCode, jalaliString, isValidNationalId } from './workflow.js';

const KEY = 'gii.db.v1';
// با تغییر ساختار داده نمایشی بالا می‌رود تا مرورگرهای قبلی داده نمونه تازه بگیرند
export const DB_VERSION = 2;
let db = null;

export function uid(p = 'id') { return p + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }

export function getDb() { return db; }
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('ذخیره نشد', e); }
}
export function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) db = JSON.parse(raw); } catch { db = null; }
  return db;
}

// ---------- فایل‌ها ----------
const mem = new Map();
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise((res) => {
    try {
      const r = indexedDB.open('gii-files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
  return idbP;
}
export async function putFile(id, blob) {
  mem.set(id, blob);
  const d = await idb();
  if (!d) return;
  await new Promise(res => { try { const t = d.transaction('files', 'readwrite'); t.objectStore('files').put(blob, id); t.oncomplete = res; t.onerror = res; } catch { res(); } });
}
export async function getFile(id) {
  if (mem.has(id)) return mem.get(id);
  const d = await idb();
  if (!d) return null;
  return new Promise(res => {
    try { const r = d.transaction('files').objectStore('files').get(id); r.onsuccess = () => { if (r.result) mem.set(id, r.result); res(r.result || null); }; r.onerror = () => res(null); } catch { res(null); }
  });
}
export async function clearFiles() {
  mem.clear();
  const d = await idb();
  if (!d) return;
  await new Promise(res => { try { const t = d.transaction('files', 'readwrite'); t.objectStore('files').clear(); t.oncomplete = res; t.onerror = res; } catch { res(); } });
}

// فشرده‌سازی عکس پیش از ذخیره (حداکثر ضلع ۱۶۰۰ پیکسل)
export async function compressImage(file, max = 1600) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

// ---------- رمز عبور ----------
export async function hashPw(username, pw) {
  const data = new TextEncoder().encode('gii:' + username.toLowerCase() + ':' + pw);
  try {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 0; for (const b of data) h = (h * 31 + b) >>> 0; return 'x' + h.toString(16);
  }
}
export function tempPassword() {
  const a = new Uint32Array(1);
  try { crypto.getRandomValues(a); } catch { a[0] = Math.floor(Math.random() * 1e9); }
  return String(100000 + (a[0] % 900000));
}

// ---------- اعلان و پیامک ----------
export function notify({ toUser = null, toRole = null, text, claimId = null }) {
  db.notifications.unshift({ id: uid('n'), toUser, toRole, text, claimId, at: new Date().toISOString(), readBy: [] });
  db.notifications = db.notifications.slice(0, 300);
}
export function sendSms(mobile, text) {
  db.sms.unshift({ id: uid('s'), mobile, text, at: new Date().toISOString() });
  db.sms = db.sms.slice(0, 300);
}

// ---------- داده‌های نمایشی ----------
function nid(base9) { // ساخت کد ملی معتبر از ۹ رقم
  const sum = base9.split('').reduce((a, d, i) => a + (+d) * (10 - i), 0) % 11;
  const id = base9 + (sum < 2 ? sum : 11 - sum);
  return isValidNationalId(id) ? id : null;
}
function sheba(bban) {
  let r = 0; for (const ch of bban + '182700') r = (r * 10 + +ch) % 97;
  return 'IR' + String(98 - r).padStart(2, '0') + bban;
}
function svgBlob(svg) { return new Blob([svg], { type: 'image/svg+xml' }); }
function samplePhoto(label, hue) {
  return svgBlob(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},25%,32%)"/><stop offset="1" stop-color="hsl(${hue},30%,14%)"/></linearGradient></defs>
<rect width="800" height="600" fill="url(#g)"/><rect x="80" y="160" width="300" height="300" fill="hsl(${hue},12%,22%)"/>
<rect x="430" y="220" width="260" height="240" fill="hsl(${hue},10%,26%)"/><path d="M200 460c-60 0-90-40-90-90 0-60 50-80 60-150 40 30 60 60 55 90 20-10 30-30 35-50 40 30 70 70 70 110 0 50-40 90-130 90z" fill="hsl(28,40%,30%)" opacity=".7"/>
<text x="400" y="560" font-family="Tahoma" font-size="34" fill="#fff" text-anchor="middle" opacity=".85">عکس نمونه — ${label}</text></svg>`);
}
function sampleDoc(title) {
  return svgBlob(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<rect width="600" height="800" fill="#fbfbf8"/><rect x="40" y="40" width="520" height="720" fill="none" stroke="#c9d3dc" stroke-width="3"/>
<text x="300" y="120" font-family="Tahoma" font-size="30" fill="#1c2733" text-anchor="middle">${title}</text>
<text x="300" y="165" font-family="Tahoma" font-size="20" fill="#8a97a3" text-anchor="middle">مدرک نمونه برای نسخه نمایشی</text>
${Array.from({ length: 14 }, (_, i) => `<rect x="80" y="${220 + i * 34}" width="${i % 3 ? 440 : 300}" height="10" rx="5" fill="#dfe6ec"/>`).join('')}
<circle cx="460" cy="690" r="46" fill="none" stroke="#3a8cc3" stroke-width="4"/></svg>`);
}

function daysAgo(n, h = 10) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 15, 0, 0); return d; }

export async function seed() {
  await clearFiles();
  const now = new Date();
  db = {
    version: DB_VERSION, seq: 0, settings: { ...DEFAULT_SETTINGS },
    users: [], claims: [], notifications: [], sms: [], reads: {},
  };
  const mk = async (u, pw) => { const user = { id: uid('u'), active: true, mustChangePassword: false, createdAt: daysAgo(40).toISOString(), ...u, pwHash: await hashPw(u.username, pw) }; db.users.push(user); return user; };

  const admin = await mk({ role: 'admin', username: 'admin', name: 'مدیر سامانه', org: 'واحد فناوری اطلاعات' }, 'admin123');
  const gas = await mk({ role: 'gas', username: 'gas', name: 'سارا کاظمی', org: 'شرکت گاز استان — امور حوادث و بیمه', mobile: '09120000001' }, 'gas123');
  const ins = await mk({ role: 'insurer', username: 'bime', name: 'علی محمدی', org: 'شرکت بیمه‌گر — واحد خسارت', mobile: '09120000002' }, 'bime123');

  const subs = [
    ['حمید رضایی', '004123456', '1023456789', '09121112233', 'تهران، نارمک، خیابان گلبرگ، کوچه ۱۴، پلاک ۸'],
    ['مریم احمدی', '012345678', '1045678912', '09123334455', 'کرج، گوهردشت، بلوار موذن، پلاک ۲۲'],
    ['رضا کریمی', '029876543', '1067891234', '09125556677', 'تهران، پیروزی، خیابان نبرد، پلاک ۴۵'],
    ['زهرا موسوی', '038765432', '1089123456', '09127778899', 'تهران، شهرری، خیابان فداییان اسلام، پلاک ۳'],
    ['محسن نوری', '047654321', '1091234567', '09129990011', 'شهریار، خیابان ولیعصر، کوچه یاس، پلاک ۱۱'],
    ['فاطمه جعفری', '056543219', '1013579246', '09124443322', 'تهران، تهرانپارس، فلکه دوم، پلاک ۷۰'],
    ['علیرضا تهرانی', '065432198', '1024681357', '09121234567', 'تهران، ونک، خیابان ملاصدرا، پلاک ۱۸'],
  ];
  const users = [];
  for (const [name, b9, subNo, mobile, address] of subs) {
    const nationalId = nid(b9) || nid(b9.slice(0, 8) + '1');
    users.push(await mk({ role: 'subscriber', username: subNo, name, nationalId, subscriptionNo: subNo, mobile, address }, '123456'));
  }
  users[2].mustChangePassword = true; // نمایش ورود اول

  const fileMeta = async (c, blob, name, by) => {
    const id = uid('f');
    await putFile(id, blob);
    c.files[id] = { name, type: blob.type, size: blob.size, at: c.createdAt, by };
    return id;
  };

  async function claim(u, opt) {
    db.seq += 1;
    const created = daysAgo(opt.age);
    const c = {
      id: uid('c'), code: claimCode(db.seq, created), subscriberId: u.id, createdBy: gas.id, createdAt: created.toISOString(),
      status: 'draft', statusAt: created.toISOString(), submitCount: 0,
      incident: { date: jalaliString(daysAgo(opt.age + 2)), time: '21:30', type: 'fire', placeType: 'residential', address: u.address, postalCode: '', description: '', fireReportNo: '', policeReportNo: '', ...opt.incident },
      damage: { kinds: ['property'], items: [], injured: [], deceased: [], ...opt.damage },
      photos: [], docs: {}, files: {}, bank: { sheba: '', holder: '' }, declaration: false,
      deficiencies: [], messages: [], timeline: [{ at: created.toISOString(), by: gas.name, role: 'gas', action: 'create', label: 'تشکیل پرونده و ایجاد حساب مشترک', note: '' }],
      gasReport: {}, assessment: null, payment: null,
    };
    if (opt.fill) {
      for (let i = 0; i < 5; i++) c.photos.push(await fileMeta(c, samplePhoto(['آشپزخانه', 'سقف', 'کابینت', 'پنجره', 'کنتور'][i], 200 + i * 20), `photo-${i + 1}.svg`, 'subscriber'));
      for (const d of DOC_TYPES) {
        if (d.uploader !== 'subscriber' || !d.need(c) || (d.optional && d.optional(c))) continue;
        if (opt.skipDocs && opt.skipDocs.includes(d.id)) continue;
        c.docs[d.id] = [await fileMeta(c, sampleDoc(d.title), d.id + '.svg', 'subscriber')];
      }
      c.bank = { sheba: sheba(opt.bban || '0170000000123456789001'), holder: u.name };
      c.declaration = true;
    }
    if (opt.gasReport) {
      c.gasReport = { inspector: 'مهندس امیر سعیدی', visitDate: jalaliString(daysAgo(opt.age - 2)), cause: 'hose', afterMeter: 'after', appliance: 'standard', opinion: 'covered', notes: 'نشت از شیلنگ غیراستاندارد اجاق گاز؛ خسارت پس از کنتور است.' };
      c.docs.gas_report = [await fileMeta(c, sampleDoc('صورت‌جلسه بازدید کارشناس گاز'), 'gas_report.svg', 'gas')];
    }
    const steps = opt.steps || [];
    for (const [action, label, role, ago, note] of steps) {
      const by = role === 'gas' ? gas.name : role === 'insurer' ? ins.name : u.name;
      c.timeline.push({ at: daysAgo(ago, 12).toISOString(), by, role, action, label, note: note || '' });
    }
    if (steps.length) c.statusAt = c.timeline[c.timeline.length - 1].at;
    const fw = c.timeline.find(t => t.action === 'gas_forward');
    if (fw) c.forwardedAt = fw.at;
    c.status = opt.status || 'draft';
    Object.assign(c, opt.extra || {});
    db.claims.push(c);
    return c;
  }

  // ۱) پرونده دارای نقص — مشترک باید اصلاح کند
  const c1 = await claim(users[0], {
    age: 9, status: 'returned', fill: true, skipDocs: ['ownership'],
    incident: { description: 'هنگام روشن کردن اجاق گاز، شعله به شیلنگ رسید و آتش به کابینت و پرده آشپزخانه سرایت کرد. آتش‌نشانی ظرف ۱۵ دقیقه آتش را مهار کرد.', fireReportNo: '۵۴۸۷۲' },
    damage: { items: [{ title: 'کابینت آشپزخانه', qty: 1, amount: 420000000 }, { title: 'یخچال فریزر', qty: 1, amount: 310000000 }, { title: 'رنگ و گچ‌کاری سقف', qty: 1, amount: 95000000 }] },
    steps: [['submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 6], ['gas_start', 'شروع بررسی', 'gas', 5], ['gas_return', 'اعلام نقص و بازگشت به مشترک', 'gas', 4, 'دو مورد نقص ثبت شد.']],
    extra: { submitCount: 1 },
  });
  c1.deficiencies.push(
    { id: uid('d'), target: 'doc:ownership', title: 'سند مالکیت یا اجاره‌نامه محل حادثه', note: 'سند مالکیت یا اجاره‌نامه بارگذاری نشده است.', by: 'gas', byName: gas.name, at: daysAgo(4).toISOString(), status: 'open', reply: '' },
    { id: uid('d'), target: 'section:photos', title: 'تصاویر حادثه', note: 'لطفاً یک عکس واضح از کنتور و شیر اصلی گاز هم اضافه کنید.', by: 'gas', byName: gas.name, at: daysAgo(4).toISOString(), status: 'open', reply: '' },
  );
  c1.messages.push({ id: uid('m'), at: daysAgo(4, 13).toISOString(), by: gas.name, byId: gas.id, role: 'gas', text: 'سلام، لطفاً موارد نقص را تا ۱۰ روز آینده تکمیل کنید تا پرونده برای بیمه‌گر ارسال شود.', internal: false });

  // ۲) خسارت تعیین شده — منتظر تأیید مشترک
  const c2 = await claim(users[1], {
    age: 34, status: 'assessed', fill: true, gasReport: true,
    incident: { type: 'explosion', description: 'انفجار ناشی از تجمع گاز در آشپزخانه پس از خاموش شدن شعله اجاق؛ شیشه‌ها و در ورودی آسیب دید.', fireReportNo: '۴۹۱۲۰' },
    damage: { items: [{ title: 'شیشه و پنجره‌ها', qty: 4, amount: 180000000 }, { title: 'در ورودی', qty: 1, amount: 120000000 }, { title: 'لوازم آشپزخانه', qty: 1, amount: 260000000 }] },
    steps: [['submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 30], ['gas_start', 'شروع بررسی', 'gas', 29], ['gas_forward', 'تأیید و ارسال به بیمه‌گر', 'gas', 26], ['ins_start', 'پذیرش و شروع ارزیابی', 'insurer', 24], ['ins_assess', 'ثبت ارزیابی و اعلام مبلغ به مشترک', 'insurer', 3, 'بر اساس بازدید ارزیاب و فاکتورها.']],
  });
  c2.assessment = { adjuster: 'مهندس نادر شریفی', visitDate: jalaliString(daysAgo(20)), note: 'لوازم آشپزخانه با استهلاک ۲۰٪ محاسبه شد.', at: daysAgo(3).toISOString(),
    items: [{ category: 'property', title: 'شیشه و پنجره‌ها', claimed: 180000000, approved: 165000000 }, { category: 'property', title: 'در ورودی', claimed: 120000000, approved: 110000000 }, { category: 'property', title: 'لوازم آشپزخانه', claimed: 260000000, approved: 208000000 }] };

  // ۳) پیش‌نویس تازه — ورود اول مشترک
  await claim(users[2], { age: 1, incident: { type: 'fire' }, damage: { kinds: [] } });

  // ۴) ارسال‌شده — در کارتابل شرکت گاز
  await claim(users[3], {
    age: 5, status: 'submitted', fill: true,
    incident: { type: 'co', description: 'مسمومیت با مونوکسید کربن به علت انسداد دودکش آبگرمکن؛ دو نفر از اعضای خانواده بستری شدند.' },
    damage: { kinds: ['medical'], injured: [{ name: 'علی موسوی', nationalId: '', relation: 'فرزند', hospital: 'بیمارستان فیروزگر', amount: 85000000 }, { name: 'زهرا موسوی', nationalId: '', relation: 'خود مشترک', hospital: 'بیمارستان فیروزگر', amount: 64000000 }] },
    steps: [['submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 2]],
    extra: { submitCount: 1 },
  });

  // ۵) نزد بیمه‌گر
  await claim(users[4], {
    age: 18, status: 'sent_insurer', fill: true, gasReport: true,
    incident: { description: 'آتش‌سوزی بخاری گازی در اتاق نشیمن به علت نزدیکی پرده؛ فرش و مبلمان سوخت.', fireReportNo: '۵۰۳۳۱' },
    damage: { items: [{ title: 'فرش دستباف ۹ متری', qty: 1, amount: 350000000 }, { title: 'مبلمان', qty: 1, amount: 280000000 }] },
    steps: [['submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 14], ['gas_start', 'شروع بررسی', 'gas', 13], ['gas_forward', 'تأیید و ارسال به بیمه‌گر', 'gas', 11]],
    extra: { submitCount: 1 },
  });

  // ۶) پرداخت‌شده
  const c6 = await claim(users[5], {
    age: 70, status: 'paid', fill: true, gasReport: true,
    incident: { description: 'آتش‌سوزی آبگرمکن در پارکینگ؛ دیوار و تأسیسات آسیب دید.', fireReportNo: '۴۴۰۹۸' },
    damage: { items: [{ title: 'آبگرمکن و لوله‌کشی', qty: 1, amount: 140000000 }, { title: 'بازسازی دیوار پارکینگ', qty: 1, amount: 90000000 }] },
    steps: [['submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 66], ['gas_start', 'شروع بررسی', 'gas', 65], ['gas_forward', 'تأیید و ارسال به بیمه‌گر', 'gas', 62], ['ins_start', 'پذیرش و شروع ارزیابی', 'insurer', 60], ['ins_assess', 'ثبت ارزیابی و اعلام مبلغ به مشترک', 'insurer', 50], ['accept', 'قبول مبلغ و درخواست پرداخت', 'subscriber', 49], ['ins_pay', 'ثبت پرداخت', 'insurer', 41, 'واریز به حساب شبای مشترک']],
    extra: { submitCount: 1 },
  });
  c6.assessment = { adjuster: 'مهندس نادر شریفی', visitDate: jalaliString(daysAgo(55)), note: '', at: daysAgo(50).toISOString(),
    items: [{ category: 'property', title: 'آبگرمکن و لوله‌کشی', claimed: 140000000, approved: 128000000 }, { category: 'property', title: 'بازسازی دیوار پارکینگ', claimed: 90000000, approved: 90000000 }] };
  c6.payment = { ref: '140506118842', date: jalaliString(daysAgo(41)), amount: 196200000 };
  c6.acceptedAt = daysAgo(49).toISOString();
  c6.finance = {
    stage: 'bank',
    review: { reviewer: 'واحد مالی بیمه‌گر', shebaMatch: true, note: '', at: daysAgo(47).toISOString(), by: ins.name },
    voucher: { voucherNo: 'H-1405-000006', date: jalaliString(daysAgo(45)), amount: 196200000, at: daysAgo(45).toISOString(), by: ins.name },
    bank: { method: 'paya', ref: 'P-77810452', date: jalaliString(daysAgo(42)), at: daysAgo(42).toISOString(), by: ins.name },
  };
  c6.timeline.splice(c6.timeline.length - 1, 0,
    { at: daysAgo(47, 11).toISOString(), by: ins.name, role: 'insurer', action: 'fin_review', label: 'بررسی مالی و استعلام شبا انجام شد', note: '' },
    { at: daysAgo(45, 11).toISOString(), by: ins.name, role: 'insurer', action: 'fin_voucher', label: 'حواله پرداخت صادر شد', note: 'حواله H-1405-000006' },
    { at: daysAgo(42, 11).toISOString(), by: ins.name, role: 'insurer', action: 'fin_bank', label: 'دستور پرداخت به بانک ارسال شد', note: 'پایا — پیگیری P-77810452' });

  // ۷) قبول مبلغ و حواله صادر شده — نمایش مراحل مالی برای مشترک
  const c7 = await claim(users[6], {
    age: 40, status: 'payment', fill: true, gasReport: true,
    incident: { description: 'آتش‌سوزی پکیج گرمایشی در آشپزخانه به علت نشتی اتصالات؛ کابینت و سقف کاذب آسیب دید.', fireReportNo: '۴۷۲۲۵' },
    damage: { items: [{ title: 'پکیج و لوله‌کشی', qty: 1, amount: 210000000 }, { title: 'کابینت و سقف کاذب', qty: 1, amount: 260000000 }] },
    steps: [['submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 36], ['gas_start', 'شروع بررسی', 'gas', 35], ['gas_forward', 'تأیید و ارسال به بیمه‌گر', 'gas', 31], ['ins_start', 'پذیرش و شروع ارزیابی', 'insurer', 29], ['ins_assess', 'ثبت ارزیابی و اعلام مبلغ به مشترک', 'insurer', 12], ['accept', 'قبول مبلغ و درخواست پرداخت', 'subscriber', 9], ['fin_review', 'بررسی مالی و استعلام شبا انجام شد', 'insurer', 6], ['fin_voucher', 'حواله پرداخت صادر شد', 'insurer', 2, 'حواله H-1405-000007']],
    extra: { submitCount: 1, acceptedAt: daysAgo(9).toISOString() },
  });
  c7.assessment = { adjuster: 'مهندس نادر شریفی', visitDate: jalaliString(daysAgo(25)), note: 'سقف کاذب با استهلاک ۱۵٪ محاسبه شد.', at: daysAgo(12).toISOString(),
    items: [{ category: 'property', title: 'پکیج و لوله‌کشی', claimed: 210000000, approved: 195000000 }, { category: 'property', title: 'کابینت و سقف کاذب', claimed: 260000000, approved: 221000000 }] };
  c7.finance = {
    stage: 'voucher',
    review: { reviewer: 'واحد مالی بیمه‌گر', shebaMatch: true, note: 'شبا با کد ملی ذی‌نفع تطبیق داده شد.', at: daysAgo(6).toISOString(), by: ins.name },
    voucher: { voucherNo: 'H-1405-000007', date: jalaliString(daysAgo(2)), amount: 374400000, at: daysAgo(2).toISOString(), by: ins.name },
  };
  c7.payment = { amount: 374400000 };
  notify({ toUser: users[6].id, text: `حواله پرداخت خسارت پرونده ${c7.code} به شماره H-1405-000007 صادر شد.`, claimId: c7.id });

  notify({ toRole: 'gas', text: `پرونده ${db.claims[3].code} از سوی مشترک ارسال شد.`, claimId: db.claims[3].id });
  notify({ toUser: users[0].id, text: `برای پرونده ${c1.code} نقص اعلام شد. لطفاً اصلاح و دوباره ارسال کنید.`, claimId: c1.id });
  notify({ toUser: users[1].id, text: `مبلغ خسارت پرونده ${c2.code} تعیین شد. لطفاً بررسی و تأیید کنید.`, claimId: c2.id });
  notify({ toRole: 'insurer', text: `پرونده ${db.claims[4].code} از شرکت گاز دریافت شد.`, claimId: db.claims[4].id });
  sendSms(users[2].mobile, `مشترک گرامی، پرونده خسارت گاز شما تشکیل شد. نام کاربری: ${users[2].username} — رمز موقت: ۱۲۳۴۵۶`);
  void admin; void now;
  save();
  return db;
}

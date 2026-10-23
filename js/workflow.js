// منطق خالص گردش کار پرونده (بدون DOM) — هم در مرورگر و هم در تست‌های Node استفاده می‌شود.

export const ROLES = {
  subscriber: 'مشترک',
  gas: 'کارشناس شرکت گاز',
  insurer: 'کارشناس بیمه‌گر',
  admin: 'مدیر سامانه',
};

// step: مرحله در نوار پیشرفت (۱ تکمیل، ۲ شرکت گاز، ۳ بیمه‌گر، ۴ تعیین خسارت، ۵ پرداخت)
// owner: نقشی که اقدام بعدی با اوست
export const STATUS = {
  draft:          { label: 'در حال تکمیل توسط مشترک', short: 'پیش‌نویس',        tone: 'neutral', step: 1, owner: 'subscriber' },
  returned:       { label: 'نقص پرونده؛ منتظر اصلاح مشترک', short: 'دارای نقص',   tone: 'warn',    step: 1, owner: 'subscriber' },
  submitted:      { label: 'ارسال‌شده به شرکت گاز',     short: 'ارسال‌شده',       tone: 'info',    step: 2, owner: 'gas' },
  gas_review:     { label: 'در حال بررسی شرکت گاز',     short: 'بررسی گاز',       tone: 'info',    step: 2, owner: 'gas' },
  sent_insurer:   { label: 'ارسال‌شده به بیمه‌گر',       short: 'نزد بیمه‌گر',     tone: 'info',    step: 3, owner: 'insurer' },
  insurer_review: { label: 'در حال بررسی و ارزیابی بیمه‌گر', short: 'ارزیابی',     tone: 'info',    step: 3, owner: 'insurer' },
  insurer_query:  { label: 'درخواست مدارک تکمیلی از سوی بیمه‌گر', short: 'استعلام بیمه‌گر', tone: 'warn', step: 3, owner: 'gas' },
  assessed:       { label: 'خسارت تعیین شد؛ منتظر تأیید مشترک', short: 'منتظر تأیید',  tone: 'accent', step: 4, owner: 'subscriber' },
  objection:      { label: 'اعتراض مشترک به مبلغ خسارت', short: 'اعتراض',         tone: 'warn',    step: 4, owner: 'insurer' },
  payment:        { label: 'تأیید شد؛ در انتظار پرداخت', short: 'در انتظار پرداخت', tone: 'accent', step: 5, owner: 'insurer' },
  paid:           { label: 'خسارت پرداخت شد',            short: 'پرداخت‌شده',      tone: 'ok',      step: 5, owner: null },
  rejected:       { label: 'پرونده مشمول پوشش نیست (رد شد)', short: 'رد شده',      tone: 'bad',     step: 0, owner: null },
};

export const STEPS = ['تکمیل پرونده', 'بررسی شرکت گاز', 'بررسی بیمه‌گر', 'تعیین خسارت', 'پرداخت'];

export const INCIDENT_TYPES = {
  fire: 'آتش‌سوزی',
  explosion: 'انفجار',
  co: 'گازگرفتگی (مسمومیت با مونوکسید کربن)',
  leak: 'نشت گاز منجر به خسارت',
};

export const PLACE_TYPES = { residential: 'مسکونی', commercial: 'تجاری', office: 'اداری', other: 'سایر' };

export const DAMAGE_KINDS = {
  property: 'خسارت مالی (ساختمان و اثاثیه)',
  medical: 'هزینه درمان مصدومان',
  death: 'فوت',
};

// انواع مدارک. need(claim) مشخص می‌کند آیا برای این پرونده لازم است.
// uploader: چه نقشی آن را بارگذاری می‌کند.
export const CAUSE_ISSUERS = { fire: 'سازمان آتش‌نشانی', expert: 'کارشناس رسمی دادگستری' };
export const CAUSE_HINT = 'در این گزارش باید علت حادثه به‌صراحت «گاز طبیعی» نوشته شده باشد (مثلاً نشت گاز، انفجار یا آتش‌سوزی ناشی از گاز). گزارشی که علت را «نامعلوم» یا چیزی غیر از گاز (مثلاً اتصالی برق) نوشته باشد پذیرفته نمی‌شود. گزارش باید مهر و امضا، تاریخ و نشانی محل حادثه را داشته باشد.';

export const DOC_TYPES = [
  { id: 'national_id',  title: 'کارت ملی مشترک (پشت و رو)',            uploader: 'subscriber', need: () => true },
  { id: 'ownership',    title: 'سند مالکیت یا اجاره‌نامه محل حادثه',      uploader: 'subscriber', need: () => true },
  { id: 'gas_bill',     title: 'آخرین قبض گاز',                           uploader: 'subscriber', need: () => true },
  // سند اصلی اثبات علت حادثه؛ شرکت گاز بازدید ندارد و فقط همین گزارش علت «گاز» را ثابت می‌کند
  { id: 'cause_report', title: 'گزارش آتش‌نشانی یا کارشناس رسمی دادگستری (با قید علت گاز)', uploader: 'subscriber', need: () => true, hint: CAUSE_HINT },
  { id: 'police',       title: 'گزارش نیروی انتظامی / کلانتری',            uploader: 'subscriber', need: c => hasKind(c, 'medical') || hasKind(c, 'death'), optional: c => !(hasKind(c, 'medical') || hasKind(c, 'death')) },
  { id: 'invoices',     title: 'فاکتور یا برآورد هزینه اقلام خسارت‌دیده',  uploader: 'subscriber', need: c => hasKind(c, 'property') },
  { id: 'medical',      title: 'پرونده پزشکی و صورت‌حساب بیمارستان',        uploader: 'subscriber', need: c => hasKind(c, 'medical') },
  { id: 'forensic',     title: 'گواهی پزشکی قانونی',                       uploader: 'subscriber', need: c => hasKind(c, 'medical') || hasKind(c, 'death') },
  { id: 'death_cert',   title: 'گواهی فوت',                                uploader: 'subscriber', need: c => hasKind(c, 'death') },
  { id: 'inheritance',  title: 'گواهی انحصار وراثت و مدارک وراث',          uploader: 'subscriber', need: c => hasKind(c, 'death') },
  { id: 'sheba_cert',   title: 'گواهی شماره شبا به نام ذی‌نفع',             uploader: 'subscriber', need: () => true },
];

export const MIN_PHOTOS = 4;

export const DEFAULT_SETTINGS = {
  // مقادیر نمونه‌اند و مدیر سامانه باید با قرارداد بیمه سال جاری جایگزین کند.
  propertyCapRial: 2_000_000_000,
  medicalCapRial: 1_000_000_000,
  deathCapRial: 6_000_000_000,
  deductiblePercent: 10,
  reportWindowDays: 30,
  gasSlaDays: 7,
  insurerSlaDays: 15,
  fixSlaDays: 10,
  policyNo: 'نمونه ۱۴۰۵/۴۲۲',
  policyStart: '1405/01/01',
  policyEnd: '1405/12/29',
  // لوگو و نام سازمان در صفحه ورود و نوار بالا؛ مدیر در تنظیمات بارگذاری می‌کند
  orgName: '',
  logoDataUrl: '',
};

export function hasKind(c, k) { return !!(c.damage && c.damage.kinds && c.damage.kinds.includes(k)); }

export function requiredDocs(c, uploader) {
  return DOC_TYPES.filter(d => d.need(c) && !(d.optional && d.optional(c)) && (!uploader || d.uploader === uploader));
}
export function visibleDocs(c) {
  return DOC_TYPES.filter(d => d.need(c) || (d.optional && !d.optional(c)) || (c.docs[d.id] || []).length || d.id === 'police');
}

// ---------- اعتبارسنجی‌های ایرانی ----------
export function normalizeDigits(s) {
  return String(s ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}
export function isValidNationalId(raw) {
  const s = normalizeDigits(raw).trim();
  if (!/^\d{10}$/.test(s) || /^(\d)\1{9}$/.test(s)) return false;
  const check = +s[9];
  const sum = s.slice(0, 9).split('').reduce((a, d, i) => a + (+d) * (10 - i), 0) % 11;
  return sum < 2 ? check === sum : check === 11 - sum;
}
export function isValidMobile(raw) { return /^09\d{9}$/.test(normalizeDigits(raw).trim()); }
export function isValidSheba(raw) {
  const s = normalizeDigits(raw).replace(/\s|-/g, '').toUpperCase();
  if (!/^IR\d{24}$/.test(s)) return false;
  const re = s.slice(4) + '1827' + s.slice(2, 4); // I=18, R=27
  let r = 0;
  for (const ch of re) r = (r * 10 + +ch) % 97;
  return r === 1;
}

// ---------- تاریخ شمسی (الگوریتم jalaali) ----------
function div(a, b) { return ~~(a / b); }
function jalCal(jy) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const gy = jy + 621;
  let leapJ = -14, jp = breaks[0], jm, jump, leap, n, i;
  for (i = 1; i < breaks.length; i++) {
    jm = breaks[i]; jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(j % 1461, 4) * 5 + 308;
  const gd = div(i % 153, 5) + 1;
  const gm = (div(i, 153) % 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f, jm, jd;
  if (k >= 0) {
    if (k <= 185) { jm = 1 + div(k, 31); jd = (k % 31) + 1; return { jy, jm, jd }; }
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30); jd = (k % 30) + 1;
  return { jy, jm, jd };
}
export function toJalali(date) {
  const d = new Date(date);
  return d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
}
export function jalaliString(date) {
  const { jy, jm, jd } = toJalali(date);
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}
// '1405/07/28' -> Date (ظهر محلی) یا null
export function parseJalali(raw) {
  const m = normalizeDigits(raw).trim().match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!m) return null;
  const jy = +m[1], jm = +m[2], jd = +m[3];
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31 || (jm > 6 && jd > 30)) return null;
  if (jm === 12 && jd === 30 && jalCal(jy).leap !== 0) return null;
  const g = d2g(j2d(jy, jm, jd));
  return new Date(g.gy, g.gm - 1, g.gd, 12);
}
export function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }

// ---------- کامل بودن بخش‌های پرونده ----------
export function sectionIssues(c) {
  const inc = c.incident || {};
  const out = { incident: [], damage: [], photos: [], docs: [], bank: [], declare: [] };
  if (!parseJalali(inc.date)) out.incident.push('تاریخ حادثه');
  if (!inc.type) out.incident.push('نوع حادثه');
  if (!inc.placeType) out.incident.push('نوع کاربری محل');
  if (!inc.address || inc.address.trim().length < 10) out.incident.push('نشانی کامل محل حادثه');
  if (!inc.description || inc.description.trim().length < 20) out.incident.push('شرح حادثه (دست‌کم ۲۰ حرف)');
  if (!CAUSE_ISSUERS[inc.causeIssuer]) out.incident.push('صادرکننده گزارش علت حادثه');
  if (!inc.causeReportNo) out.incident.push('شماره گزارش علت حادثه');
  if (!parseJalali(inc.causeReportDate)) out.incident.push('تاریخ گزارش علت حادثه');
  if (!inc.causeStatesGas) out.incident.push('تأیید قید علت گاز در گزارش');

  const dmg = c.damage || { kinds: [] };
  if (!dmg.kinds || !dmg.kinds.length) out.damage.push('نوع خسارت');
  if (hasKind(c, 'property') && !(dmg.items || []).some(i => i.title && +i.amount > 0)) out.damage.push('دست‌کم یک قلم خسارت مالی با مبلغ');
  if (hasKind(c, 'medical') && !(dmg.injured || []).some(p => p.name && +p.amount > 0)) out.damage.push('مشخصات و هزینه درمان مصدوم');
  if (hasKind(c, 'death') && !(dmg.deceased || []).some(p => p.name && isValidNationalId(p.nationalId))) out.damage.push('مشخصات متوفی با کد ملی معتبر');

  const n = (c.photos || []).length;
  if (n < MIN_PHOTOS) out.photos.push(`دست‌کم ${MIN_PHOTOS} عکس از محل حادثه (${n} بارگذاری شده)`);

  for (const d of requiredDocs(c, 'subscriber')) if (!(c.docs[d.id] || []).length) out.docs.push(d.title);

  const b = c.bank || {};
  if (!isValidSheba(b.sheba)) out.bank.push('شماره شبای معتبر');
  if (!b.holder) out.bank.push('نام صاحب حساب');

  if (!c.declaration) out.declare.push('تأیید تعهدنامه صحت اطلاعات');
  return out;
}

export function missingForSubmit(c) {
  const s = sectionIssues(c);
  const list = [...s.incident, ...s.damage, ...s.photos, ...s.docs, ...s.bank, ...s.declare];
  const unanswered = openDeficiencies(c).filter(d => !d.reply && d.by !== 'system');
  if (c.status === 'returned' && unanswered.length) list.push(`پاسخ به ${unanswered.length} مورد نقص اعلام‌شده`);
  return list;
}

export function openDeficiencies(c) { return (c.deficiencies || []).filter(d => d.status === 'open'); }

// ---------- محاسبه خسارت قابل پرداخت ----------
export function computePayable(items, settings = DEFAULT_SETTINGS, deathCount = 0) {
  const sum = cat => items.filter(i => i.category === cat).reduce((a, i) => a + Math.max(0, +i.approved || 0), 0);
  const property = sum('property');
  const deductible = Math.round(property * (settings.deductiblePercent / 100));
  const propertyNet = Math.min(Math.max(0, property - deductible), settings.propertyCapRial);
  const medical = Math.min(sum('medical'), settings.medicalCapRial);
  const death = Math.min(sum('death'), settings.deathCapRial * Math.max(1, deathCount));
  return {
    property, deductible, propertyNet, medical, death,
    claimed: items.reduce((a, i) => a + (+i.claimed || 0), 0),
    payable: propertyNet + medical + death,
    capped: property - deductible > settings.propertyCapRial || sum('medical') > settings.medicalCapRial,
  };
}

// ---------- انتقال‌های وضعیت ----------
// هر عمل: نقش مجاز، وضعیت‌های مبدأ، وضعیت مقصد، و شرط اضافه (برگرداندن پیام خطا یا null)
export const ACTIONS = {
  submit:       { role: 'subscriber', from: ['draft', 'returned'], to: 'submitted', label: 'ارسال پرونده به شرکت گاز',
                  guard: c => { const m = missingForSubmit(c); return m.length ? 'موارد ناقص: ' + m.join('، ') : null; } },
  gas_start:    { role: 'gas', from: ['submitted'], to: 'gas_review', label: 'شروع بررسی' },
  gas_return:   { role: 'gas', from: ['gas_review', 'insurer_query'], to: 'returned', label: 'اعلام نقص و بازگشت به مشترک',
                  guard: c => openDeficiencies(c).some(d => !d.reply) ? null : 'دست‌کم یک مورد نقص جدید ثبت کنید.' },
  gas_forward:  { role: 'gas', from: ['gas_review'], to: 'sent_insurer', label: 'تأیید و ارسال به بیمه‌گر',
                  guard: c => {
                    const s = missingForSubmit({ ...c, status: 'draft' });
                    if (s.length) return 'مدارک مشترک ناقص است: ' + s.join('، ');
                    if (openDeficiencies(c).some(d => !d.reply)) return 'موارد نقص باز وجود دارد.';
                    return null;
                  } },
  gas_answer:   { role: 'gas', from: ['insurer_query'], to: 'insurer_review', label: 'پاسخ به استعلام و بازگشت به بیمه‌گر',
                  guard: c => openDeficiencies(c).some(d => d.by === 'insurer' && !d.reply) ? 'به همه موارد استعلام بیمه‌گر پاسخ دهید.' : null },
  gas_reject:   { role: 'gas', from: ['gas_review'], to: 'rejected', label: 'رد پرونده (غیرمشمول)', needsNote: true },
  ins_start:    { role: 'insurer', from: ['sent_insurer'], to: 'insurer_review', label: 'پذیرش و شروع ارزیابی' },
  ins_query:    { role: 'insurer', from: ['insurer_review', 'objection'], to: 'insurer_query', label: 'درخواست مدارک تکمیلی',
                  guard: c => openDeficiencies(c).some(d => d.by === 'insurer' && !d.reply) ? null : 'دست‌کم یک مورد درخواست ثبت کنید.' },
  ins_assess:   { role: 'insurer', from: ['insurer_review', 'objection'], to: 'assessed', label: 'ثبت ارزیابی و اعلام مبلغ به مشترک',
                  guard: c => {
                    const a = c.assessment || {};
                    if (!a.adjuster) return 'نام ارزیاب خسارت را وارد کنید.';
                    if (!(a.items || []).length) return 'دست‌کم یک ردیف ارزیابی وارد کنید.';
                    return null;
                  } },
  ins_reject:   { role: 'insurer', from: ['insurer_review', 'objection'], to: 'rejected', label: 'رد پرونده', needsNote: true },
  accept:       { role: 'subscriber', from: ['assessed'], to: 'payment', label: 'قبول مبلغ و درخواست پرداخت' },
  object:       { role: 'subscriber', from: ['assessed'], to: 'objection', label: 'اعتراض به مبلغ', needsNote: true },
  ins_pay:      { role: 'insurer', from: ['payment'], to: 'paid', label: 'ثبت واریز',
                  guard: c => {
                    if (finStage(c) !== 'bank') return 'پیش از ثبت واریز، بررسی مالی، صدور حواله و ارسال به بانک باید انجام شود.';
                    return (c.payment && c.payment.ref && c.payment.date) ? null : 'شماره پیگیری بانکی و تاریخ واریز را وارد کنید.';
                  } },
};

export function availableActions(c, role) {
  return Object.entries(ACTIONS).filter(([, a]) => a.role === role && a.from.includes(c.status)).map(([id, a]) => ({ id, ...a }));
}

export function canDo(c, role, actionId) {
  const a = ACTIONS[actionId];
  if (!a) return 'عمل نامعتبر';
  if (a.role !== role) return 'این عمل برای نقش شما مجاز نیست.';
  if (!a.from.includes(c.status)) return 'در وضعیت فعلی پرونده این عمل ممکن نیست.';
  return a.guard ? a.guard(c) : null;
}

// اعمال یک عمل روی پرونده؛ پرونده جدید برمی‌گرداند (ورودی را تغییر نمی‌دهد).
// opts.causeConfirmed: کارشناس گاز هنگام ارسال به بیمه‌گر تأیید می‌کند که در گزارش، علت گاز قید شده است
export function applyAction(claim, actionId, actor, note = '', now = new Date(), opts = {}) {
  const err = canDo(claim, actor.role, actionId);
  if (err) throw new Error(err);
  const a = ACTIONS[actionId];
  if (a.needsNote && !note.trim()) throw new Error('نوشتن توضیح برای این عمل الزامی است.');
  if (actionId === 'gas_forward' && !opts.causeConfirmed) throw new Error('تأیید کنید که گزارش علت حادثه را دیده‌اید و در آن «گاز» به‌عنوان علت قید شده است.');
  const c = structuredClone(claim);
  const at = now.toISOString();
  c.status = a.to;
  c.statusAt = at;
  if (actionId === 'submit') {
    c.submittedAt = at;
    c.submitCount = (c.submitCount || 0) + 1;
  }
  if (actionId === 'gas_forward' || actionId === 'gas_answer') {
    for (const d of c.deficiencies) if (d.status === 'open') { d.status = 'closed'; d.closedAt = at; }
  }
  if (actionId === 'gas_forward') { c.forwardedAt = at; c.causeCheck = { by: actor.name, at }; }
  if (actionId === 'gas_return') {
    // استعلام‌های بیمه‌گر که به مشترک ارجاع شده باز می‌مانند تا مشترک پاسخ دهد
    c.returnedAt = at;
  }
  if (actionId === 'submit') {
    // پاسخ داده‌شده‌ها برای بررسی مجدد گاز باز می‌مانند؛ گاز با ارسال آنها را می‌بندد
  }
  if (actionId === 'ins_assess') c.assessment.at = at;
  if (actionId === 'accept') c.acceptedAt = at;
  if (actionId === 'object') c.objection = { note, at };
  if (actionId === 'ins_pay') c.paidAt = at;
  if (a.to === 'rejected') c.rejectReason = note;
  c.timeline.push({ at, by: actor.name, role: actor.role, action: actionId, label: a.label, note });
  return c;
}

// اقدام بعدی هر نقش، برای نمایش در کارتابل
export function waitingOn(c) { return STATUS[c.status].owner; }

export function slaInfo(c, settings = DEFAULT_SETTINGS, now = new Date()) {
  const since = c.statusAt || c.createdAt;
  const owner = waitingOn(c);
  const limit = owner === 'gas' ? settings.gasSlaDays : owner === 'insurer' ? settings.insurerSlaDays
    : c.status === 'returned' ? settings.fixSlaDays : null;
  if (!limit) return null;
  const used = daysBetween(since, now);
  return { limit, used, left: limit - used, overdue: used > limit };
}

export function claimCode(seq, date = new Date()) {
  return `GZ-${toJalali(date).jy}-${String(seq).padStart(6, '0')}`;
}

// ---------- فرایند مالی پس از قبول مبلغ ----------
// در وضعیت «payment» پرونده این زیرمرحله‌ها را به ترتیب طی می‌کند و هر کدام جزئیاتش را نگه می‌دارد.
export const FIN_STAGES = [
  { id: 'accepted', label: 'تأیید مبلغ توسط مشترک', short: 'تأیید مبلغ' },
  { id: 'review', label: 'بررسی مالی و استعلام شبا', short: 'بررسی مالی' },
  { id: 'voucher', label: 'صدور حواله پرداخت', short: 'حواله صادر شد' },
  { id: 'bank', label: 'ارسال دستور پرداخت به بانک', short: 'ارسال به بانک' },
  { id: 'paid', label: 'واریز به حساب ذی‌نفع', short: 'واریز شد' },
];
export const TRANSFER_METHODS = {
  paya: { label: 'پایا', eta: 'معمولاً در چرخه‌های پایای همان روز یا روز کاری بعد به حساب می‌نشیند' },
  satna: { label: 'ساتنا', eta: 'معمولاً در همان روز کاری به حساب می‌نشیند' },
};

export function finStage(c) {
  if (c.status === 'paid') return 'paid';
  if (c.status !== 'payment') return null;
  return (c.finance && c.finance.stage) || 'accepted';
}

const FIN_STEPS = {
  fin_review: { from: 'accepted', to: 'review', label: 'بررسی مالی و استعلام شبا انجام شد',
    check: d => (!d.reviewer ? 'نام بررسی‌کننده مالی را وارد کنید.' : !d.shebaMatch ? 'تطبیق شبا با نام ذی‌نفع باید تأیید شود.' : null) },
  fin_voucher: { from: 'review', to: 'voucher', label: 'حواله پرداخت صادر شد',
    check: d => (!d.voucherNo ? 'شماره حواله را وارد کنید.' : !parseJalali(d.date) ? 'تاریخ صدور حواله معتبر نیست.' : !(d.amount > 0) ? 'مبلغ حواله باید بیشتر از صفر باشد.' : null) },
  fin_bank: { from: 'voucher', to: 'bank', label: 'دستور پرداخت به بانک ارسال شد',
    check: d => (!TRANSFER_METHODS[d.method] ? 'روش انتقال (پایا یا ساتنا) را انتخاب کنید.' : !d.ref ? 'شماره پیگیری دستور پرداخت را وارد کنید.' : !parseJalali(d.date) ? 'تاریخ ارسال معتبر نیست.' : null) },
};
export const FIN_ACTIONS = FIN_STEPS;

// یک گام مالی را اعمال می‌کند و پرونده جدید برمی‌گرداند.
export function applyFinance(claim, step, data, actor, now = new Date()) {
  const f = FIN_STEPS[step];
  if (!f) throw new Error('گام مالی نامعتبر');
  if (actor.role !== 'insurer') throw new Error('فقط کارشناس بیمه‌گر گام‌های مالی را ثبت می‌کند.');
  if (finStage(claim) !== f.from) throw new Error('این گام مالی به ترتیب نیست.');
  const err = f.check(data);
  if (err) throw new Error(err);
  const c = structuredClone(claim);
  const at = now.toISOString();
  c.finance = { ...(c.finance || {}), stage: f.to, [f.to]: { ...data, at, by: actor.name } };
  if (f.to === 'voucher') c.payment = { ...(c.payment || {}), amount: data.amount };
  const note = f.to === 'review' ? (data.note || '')
    : f.to === 'voucher' ? `حواله ${data.voucherNo} به مبلغ ${data.amount} ریال`
    : `${TRANSFER_METHODS[data.method].label} — پیگیری ${data.ref}`;
  c.timeline.push({ at, by: actor.name, role: actor.role, action: step, label: f.label, note });
  return c;
}

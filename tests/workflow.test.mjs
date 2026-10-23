import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../js/workflow.js';

const gas = { name: 'کارشناس گاز', role: 'gas' };
const sub = { name: 'مشترک', role: 'subscriber' };
const ins = { name: 'ارزیاب', role: 'insurer' };

function makeSheba(bban) { // bban: 22 رقم
  const re = bban + '1827' + '00';
  let r = 0;
  for (const ch of re) r = (r * 10 + +ch) % 97;
  return 'IR' + String(98 - r).padStart(2, '0') + bban;
}

function completeClaim() {
  const photos = ['p1', 'p2', 'p3', 'p4'];
  const docs = {};
  for (const d of W.DOC_TYPES) docs[d.id] = ['f-' + d.id];
  return {
    id: 'c1', status: 'draft', createdAt: new Date().toISOString(), timeline: [], deficiencies: [],
    incident: { date: '1405/07/20', type: 'fire', placeType: 'residential', address: 'تهران، خیابان آزادی، پلاک ۱۲', description: 'آتش‌سوزی آشپزخانه به علت نشت شیلنگ اجاق گاز', causeIssuer: 'fire', causeReportNo: '۱۲۳۴', causeReportDate: '1405/07/21', causeStatesGas: true },
    damage: { kinds: ['property'], items: [{ title: 'کابینت', qty: 1, amount: 300000000 }], injured: [], deceased: [] },
    photos, docs, bank: { sheba: makeSheba('0570028180010653892101'), holder: 'مشترک' }, declaration: true,
  };
}

test('کد ملی', () => {
  assert.equal(W.isValidNationalId('0499370899'), true);
  assert.equal(W.isValidNationalId('۰۴۹۹۳۷۰۸۹۹'), true);
  assert.equal(W.isValidNationalId('0499370898'), false);
  assert.equal(W.isValidNationalId('1111111111'), false);
});

test('شبا', () => {
  const s = makeSheba('0570028180010653892101');
  assert.equal(W.isValidSheba(s), true);
  assert.equal(W.isValidSheba(s.slice(0, -1) + '9'), false);
  assert.equal(W.isValidSheba('IR12'), false);
});

test('تاریخ شمسی رفت و برگشت', () => {
  assert.equal(W.jalaliString(new Date(2026, 9, 20)), '1405/07/28');
  assert.equal(W.jalaliString(new Date(2025, 2, 21)), '1404/01/01');
  const d = W.parseJalali('۱۴۰۵/۰۷/۲۸');
  assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 9); assert.equal(d.getDate(), 20);
  assert.equal(W.parseJalali('1405/07/31'), null);
  assert.equal(W.parseJalali('abc'), null);
});

test('بدون تأیید قید علت گاز، ارسال ممکن نیست', () => {
  const c = completeClaim();
  c.incident.causeStatesGas = false;
  assert.match(W.canDo(c, 'subscriber', 'submit'), /علت گاز/);
  c.incident.causeStatesGas = true; c.incident.causeIssuer = '';
  assert.match(W.canDo(c, 'subscriber', 'submit'), /صادرکننده/);
});

test('ارسال پرونده ناقص رد می‌شود', () => {
  const c = completeClaim();
  c.photos = ['p1'];
  assert.match(W.canDo(c, 'subscriber', 'submit'), /عکس/);
});

test('چرخه کامل: نقص، اصلاح، ارسال به بیمه‌گر، ارزیابی، پرداخت', () => {
  let c = completeClaim();
  assert.equal(W.canDo(c, 'gas', 'submit'), 'این عمل برای نقش شما مجاز نیست.');
  c = W.applyAction(c, 'submit', sub);
  assert.equal(c.status, 'submitted');
  c = W.applyAction(c, 'gas_start', gas);
  assert.match(W.canDo(c, 'gas', 'gas_return'), /نقص/);
  c.deficiencies.push({ id: 'd1', target: 'doc:cause_report', note: 'گزارش ناخوانا است', by: 'gas', status: 'open' });
  c = W.applyAction(c, 'gas_return', gas);
  assert.equal(c.status, 'returned');
  assert.match(W.canDo(c, 'subscriber', 'submit'), /پاسخ/);
  c.deficiencies[0].reply = 'نسخه خوانا بارگذاری شد';
  c = W.applyAction(c, 'submit', sub);
  c = W.applyAction(c, 'gas_start', gas);
  assert.throws(() => W.applyAction(c, 'gas_forward', gas), /گاز/);
  c = W.applyAction(c, 'gas_forward', gas, '', new Date(), { causeConfirmed: true });
  assert.equal(c.causeCheck.by, gas.name);
  assert.equal(c.status, 'sent_insurer');
  assert.equal(W.openDeficiencies(c).length, 0);
  c = W.applyAction(c, 'ins_start', ins);
  c.deficiencies.push({ id: 'd2', target: 'general', note: 'عکس کنتور', by: 'insurer', status: 'open' });
  c = W.applyAction(c, 'ins_query', ins);
  assert.equal(c.status, 'insurer_query');
  assert.match(W.canDo(c, 'gas', 'gas_answer'), /پاسخ/);
  c.deficiencies[1].reply = 'عکس کنتور پیوست شد';
  c = W.applyAction(c, 'gas_answer', gas);
  assert.equal(c.status, 'insurer_review');
  c.assessment = { adjuster: 'ارزیاب', items: [{ category: 'property', title: 'کابینت', claimed: 300000000, approved: 250000000 }] };
  c = W.applyAction(c, 'ins_assess', ins);
  assert.throws(() => W.applyAction(c, 'object', sub, ''), /توضیح/);
  c = W.applyAction(c, 'accept', sub);
  c.payment = { ref: '998877', date: '1405/08/10' };
  assert.match(W.canDo(c, 'insurer', 'ins_pay'), /حواله/);
  assert.equal(W.finStage(c), 'accepted');
  assert.throws(() => W.applyFinance(c, 'fin_voucher', { voucherNo: '1', date: '1405/08/01', amount: 1 }, ins), /ترتیب/);
  assert.throws(() => W.applyFinance(c, 'fin_review', { reviewer: 'مالی' }, ins), /شبا/);
  c = W.applyFinance(c, 'fin_review', { reviewer: 'واحد مالی', shebaMatch: true }, ins);
  c = W.applyFinance(c, 'fin_voucher', { voucherNo: 'H-1405-77', date: '1405/08/05', amount: 205000000 }, ins);
  assert.equal(c.payment.amount, 205000000);
  c = W.applyFinance(c, 'fin_bank', { method: 'paya', ref: 'P-5566', date: '1405/08/06' }, ins);
  assert.equal(W.finStage(c), 'bank');
  c = W.applyAction(c, 'ins_pay', ins);
  assert.equal(c.status, 'paid');
  assert.equal(c.timeline.length, 15);
  assert.equal(W.finStage(c), 'paid');
});

test('محاسبه خسارت با فرانشیز و سقف', () => {
  const s = { ...W.DEFAULT_SETTINGS, deductiblePercent: 10, propertyCapRial: 100, medicalCapRial: 50 };
  const r = W.computePayable([
    { category: 'property', approved: 200, claimed: 250 },
    { category: 'medical', approved: 80, claimed: 80 },
  ], s);
  assert.equal(r.deductible, 20);
  assert.equal(r.propertyNet, 100);
  assert.equal(r.medical, 50);
  assert.equal(r.payable, 150);
  assert.equal(r.capped, true);
});

test('مدارک لازم بر اساس نوع خسارت', () => {
  const c = completeClaim();
  c.docs = {};
  const ids = () => W.requiredDocs(c, 'subscriber').map(d => d.id);
  assert.ok(ids().includes('cause_report'));
  assert.ok(!ids().includes('death_cert'));
  assert.ok(!ids().includes('police'));
  c.damage.kinds.push('death');
  assert.ok(ids().includes('death_cert'));
  assert.ok(ids().includes('police'));
  c.incident.type = 'co';
  assert.ok(ids().includes('cause_report'), 'گزارش علت برای همه انواع حادثه لازم است');
  assert.ok(!W.DOC_TYPES.some(d => d.uploader === 'gas'), 'مدرکی برای بارگذاری شرکت گاز نمانده');
});

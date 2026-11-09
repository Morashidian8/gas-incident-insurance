import { chromium } from 'playwright';
// اجرا: ابتدا README همین پوشه را ببینید. تصاویر و فایل‌های خروجی در tests/e2e/out ذخیره می‌شوند.
import { mkdirSync } from 'node:fs';
mkdirSync('tests/e2e/out', { recursive: true });
const PNG = { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') };

const B = process.env.WP_BASE || 'http://localhost:8888';
const b = await chromium.launch();
const errs = [];
const log = (...a) => console.log(...a);
async function session(name, url, w = 412, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${name} pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${name} console: ${m.text()}`); });
  await p.goto(B + url); await p.waitForTimeout(1200);
  return p;
}
const loginAs = async (p, i) => { await p.click(`[data-act=demoLogin][data-i="${i}"]`); await p.waitForTimeout(1200); };
const act = async (p, a, note) => {
  await p.click(`[data-act=doAction][data-action=${a}] >> nth=0`); await p.waitForTimeout(300);
  if (note) await p.fill('#act-note', note);
  if (await p.isDisabled('form[data-form=action] button[type=submit]')) { log('  BLOCKED', a, (await p.textContent('.sheet .note')).trim()); await p.keyboard.press('Escape'); return; }
  await p.click('form[data-form=action] button[type=submit]'); await p.waitForTimeout(1500);
};
const status = async p => p.evaluate(() => document.querySelector('.badge')?.textContent);
const openClaim = async (p, code) => { await p.click('[data-nav=list]'); await p.waitForTimeout(600); await p.click(`.claim-row:has-text("${code}")`); await p.waitForTimeout(1000); };

// ---- سایت برای مهمان ----
const site = await session('site', '/gii-site/', 1366, 900);
log('site: hero', await site.locator('.hero').count(), '| journey', await site.locator('.journey').count(), '| demo buttons', await site.locator('[data-act=demoLogin]').count(), '| font Vazirmatn loaded', await site.evaluate(() => document.fonts.check('16px Vazirmatn')));
await site.screenshot({ path: 'tests/e2e/out/w1-site.png' });

// ---- بازیابی رمز (حالت نمایشی: متن پیامک روی صفحه) ----
await site.click('[data-act=forgot]'); await site.fill('#fg-user', '1045678912'); await site.fill('#fg-mob', '09123334455');
await site.click('form[data-form=forgotId] button[type=submit]'); await site.waitForTimeout(1000);
const code = (await site.textContent('.sms-demo')).match(/(\d{6})/)[1];
await site.fill('#fg-code', code); await site.click('form[data-form=forgotCode] button[type=submit]'); await site.waitForTimeout(800);
await site.fill('#fg-p1', 'maryam99'); await site.fill('#fg-p2', 'maryam99'); await site.click('form[data-form=forgotNew] button[type=submit]'); await site.waitForTimeout(800);
await site.fill('#lg-pass', 'maryam99'); await site.click('form[data-form=login] button[type=submit]'); await site.waitForTimeout(1500);
log('forgot+login as Maryam:', await site.locator('.site-link[data-nav=profile]').textContent().catch(() => 'FAILED'));
await site.screenshot({ path: 'tests/e2e/out/w2-site-maryam.png' });

// ---- مشترک: رفع نقص و ارسال مجدد (اپ موبایل) ----
const sub = await session('sub', '/gii-app/');
await loginAs(sub, 0);
const c1 = (await sub.textContent('.ocard-head .v')).trim();
log('subscriber claim', c1, 'status', await status(sub));
await sub.click('[data-go=sec][data-p*=incident]'); await sub.waitForTimeout(500);
log('  subscriber cause box:', await sub.locator('.cause-box').count(), '| gas-statement checked:', await sub.isChecked('#f-cause-gas'));
await sub.screenshot({ path: 'tests/e2e/out/c1-incident.png', fullPage: true });
await sub.click('[data-nav=home]'); await sub.waitForTimeout(300);
await sub.click('[data-go=sec][data-p*=docs]'); await sub.waitForTimeout(500);
log('  doc hint shown:', await sub.locator('.doc-hint').count());
await sub.screenshot({ path: 'tests/e2e/out/c2-docs.png' });
await sub.setInputFiles('input[data-upload=ownership]', PNG); await sub.waitForTimeout(2000);
log('  uploaded ownership; thumbs with blob src:', await sub.locator('img[data-file][src^=blob]').count());
for (const id of await sub.$$eval('[data-defreply]', els => els.map(e => e.dataset.defreply))) { await sub.fill(`#rep-${id}`, 'اصلاح شد'); await sub.click(`[data-act=saveReply][data-id="${id}"]`); await sub.waitForTimeout(800); }
await sub.click('[data-nav=home]'); await sub.click('[data-go=sec][data-p*=photos]'); await sub.waitForTimeout(400);
await sub.setInputFiles('input[data-upload=photos]', PNG); await sub.waitForTimeout(1500);
for (const id of await sub.$$eval('[data-defreply]', els => els.map(e => e.dataset.defreply))) { await sub.fill(`#rep-${id}`, 'عکس کنتور اضافه شد'); await sub.click(`[data-act=saveReply][data-id="${id}"]`); await sub.waitForTimeout(800); }
// ویرایش یک فیلد و ذخیره خودکار روی سرور
await sub.click('[data-nav=home]'); await sub.click('[data-go=sec][data-p*=incident]'); await sub.waitForTimeout(400);
await sub.fill('#f-incident-time', '21:45'); await sub.locator('#f-incident-time').blur(); await sub.waitForTimeout(1200);
await sub.click('[data-nav=home]'); await sub.click('[data-go=sec][data-p*=submit]'); await sub.waitForTimeout(400);
await act(sub, 'submit');
log('  after submit:', await status(sub));

// ---- شرکت گاز ----
const gas = await session('gas', '/gii-site/', 1366, 900);
await loginAs(gas, 4);
await gas.click('.site-link[data-nav=list]'); await gas.waitForTimeout(600); await gas.click(`.claim-row:has-text("${c1}")`); await gas.waitForTimeout(1000);
log('gas sees time edit:', await gas.evaluate(() => document.body.innerText.includes('۲۱:۴۵')));
await act(gas, 'gas_start');
await gas.click('[role=tab][data-p*=defects]'); await gas.waitForTimeout(500);
log('  defects with replies:', await gas.locator('.defect .reply').count());
log('  gas tabs:', (await gas.$$eval('[role=tab]', t => t.map(x => x.textContent.trim()))).join(' | '));
await gas.click('[role=tab][data-p*=summary]'); await gas.waitForTimeout(400);
log('  cause box on review:', await gas.locator('.cause-box').count(), '| cause thumbs:', await gas.locator('.cause-box .thumb').count());
await gas.screenshot({ path: 'tests/e2e/out/c3-gas-review.png' });
// بدون تیک تأیید، ارسال انجام نمی‌شود
await gas.click('[data-act=doAction][data-action=gas_forward]'); await gas.waitForTimeout(400);
await gas.screenshot({ path: 'tests/e2e/out/c4-forward-sheet.png' });
await gas.click('form[data-form=action] button[type=submit]'); await gas.waitForTimeout(800);
log('  forward without tick blocked (sheet still open):', await gas.locator('#act-cause').count() === 1, '| status', await status(gas));
await gas.check('#act-cause'); await gas.click('form[data-form=action] button[type=submit]'); await gas.waitForTimeout(1500);

log('  after forward:', await status(gas));

// ---- بیمه‌گر ----
const ins = await session('ins', '/gii-site/', 1366, 900);
await loginAs(ins, 5);
await ins.click('.site-link[data-nav=list]'); await ins.waitForTimeout(600); await ins.click(`.claim-row:has-text("${c1}")`); await ins.waitForTimeout(1000);
await act(ins, 'ins_start');
await ins.click('[role=tab][data-p*=assess]'); await ins.waitForTimeout(400);
await ins.click('[data-act=prefillAssess]'); await ins.waitForTimeout(1200);
await ins.fill('[data-bind="assessment.items.0.approved"]', '400000000'); await ins.locator('[data-bind="assessment.items.0.approved"]').blur(); await ins.waitForTimeout(1200);
await act(ins, 'ins_assess');
log('  after assess:', await status(ins));

// ---- مشترک قبول می‌کند ----
await sub.reload(); await sub.waitForTimeout(1500); await sub.click('[data-nav=home]'); await sub.waitForTimeout(500);
await sub.click('[data-go=track]'); await sub.waitForTimeout(600);
await act(sub, 'accept');
log('subscriber accepted:', await status(sub));

// ---- اقرارنامه رسمی دفترخانه: مشترک ثبت و بارگذاری می‌کند ----
await sub.waitForTimeout(800);
log('  release panel:', await sub.locator('.form.release').count(), '| template text:', (await sub.textContent('.rel-text p')).slice(0, 40));
for (const [k, v] of [['notaryNo', '۱۲۳'], ['notaryCity', 'تهران'], ['regNo', '140585123456'], ['date', await sub.evaluate(() => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value])); return `${p.year}/${p.month}/${p.day}`; })]]) {
  await sub.fill(`#f-release-${k}`, v); await sub.locator(`#f-release-${k}`).blur(); await sub.waitForTimeout(300);
}
await sub.setInputFiles('input[data-upload=release_deed]', { name: 'deed.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
await sub.waitForTimeout(1800);
await sub.check('#f-release-confirmed'); await sub.waitForTimeout(1500);
await act(sub, 'release_submit');
log('  after release submit:', await status(sub));

// ---- بیمه‌گر: بررسی اقرارنامه، مراحل مالی و واریز ----
await ins.reload(); await ins.waitForTimeout(1500);
await ins.click('[role=tab][data-p*=assess]'); await ins.waitForTimeout(500);
log('insurer sees deed thumbs:', await ins.locator('.form.release .thumb').count());
await act(ins, 'release_accept');
log('  after release accept:', await status(ins));
await ins.click('[role=tab][data-p*=assess]'); await ins.waitForTimeout(500);
await ins.check('#fn-sheba'); await ins.click('form[data-form=fin] button[type=submit]'); await ins.waitForTimeout(1500);
await ins.click('form[data-form=fin] button[type=submit]'); await ins.waitForTimeout(1500);
await ins.fill('#fn-ref', 'P-123'); await ins.click('form[data-form=fin] button[type=submit]'); await ins.waitForTimeout(1500);
await ins.fill('#f-payment-ref', '140507771234'); await ins.locator('#f-payment-ref').blur();
await ins.fill('#f-payment-date', '1405/07/30'); await ins.locator('#f-payment-date').blur(); await ins.waitForTimeout(1200);
await act(ins, 'ins_pay');
log('  pay before original (expect BLOCKED above):', await status(ins));
await ins.fill('form[data-form=relOriginal] input[name=note]', 'رسید ۵۵'); await ins.click('form[data-form=relOriginal] button[type=submit]'); await ins.waitForTimeout(1500);
await act(ins, 'ins_pay');
log('insurer paid:', await status(ins));
await ins.screenshot({ path: 'tests/e2e/out/w3-insurer.png', fullPage: true });

await sub.reload(); await sub.waitForTimeout(1500); await sub.click('[data-nav=home]'); await sub.waitForTimeout(500); await sub.click('[data-go=track]'); await sub.waitForTimeout(800);
log('subscriber receipt shown:', await sub.locator('.receipt').count(), '| SMS count to admin later');
await sub.screenshot({ path: 'tests/e2e/out/w4-sub-paid.png', fullPage: true });

// ---- مدیر: پیامک‌ها ----
const adm = await session('adm', '/gii-site/', 1366, 900);
await loginAs(adm, 6);
await adm.click('[data-go=sms]'); await adm.waitForTimeout(800);
log('admin sms log rows:', await adm.locator('.rows .row').count());
await adm.screenshot({ path: 'tests/e2e/out/w5-admin-sms.png' });

log(errs.length ? errs.join('\n') : 'no errors');
await b.close();

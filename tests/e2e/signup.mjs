import { chromium } from 'playwright';
// ثبت‌نام اینترنتی کامل: شاهکار، کد پیامکی، مدارک، تکراری، اصلاح، تأیید و تشکیل پرونده، اسپم
// BASE=http://localhost:8770/ (اپ مرورگری) یا http://localhost:8888/gii-app/ (وردپرس، پس از activate.php)
import { mkdirSync } from 'node:fs';
mkdirSync('tests/e2e/out', { recursive: true });
const B = process.env.BASE || 'http://localhost:8770/';
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errs = [];
const nid = b9 => { let s = 0; for (let i = 0; i < 9; i++) s += +b9[i] * (10 - i); s %= 11; return b9 + (s < 2 ? s : 11 - s); };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const img = n => ({ name: n + '.png', mimeType: 'image/png', buffer: png });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto(B); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await p.goto(B); await p.waitForTimeout(1200);
const step1 = async (sub, mob, rel = 'tenant') => {
  await p.fill('#su-sub', sub); await p.fill('#su-name', 'پرویز نیک‌نام'); await p.fill('#su-nid', nid('123456781')); await p.fill('#su-mob', mob);
  await p.click(`label:has(input[name=relation][value=${rel}])`); await p.click('form[data-form=signup1] button[type=submit]'); await p.waitForTimeout(500);
};
await p.click('[data-act=signup]'); await p.waitForTimeout(300);
await p.screenshot({ path: 'tests/e2e/out/su1.png', fullPage: true });
await p.click('[data-act=noSubNo]'); await p.waitForTimeout(200);
console.log('lookup link:', await p.getAttribute('.sheet a.btn', 'href'), await p.getAttribute('.sheet a.btn', 'target'));
await p.screenshot({ path: 'tests/e2e/out/su-nosub.png' }); await p.keyboard.press('Escape');
// شاهکار: عدم تطابق
await step1('1099887766', '09121230000');
console.log('shahkar mismatch:', (await p.textContent('.note.bad')).trim().slice(0, 60));
// مسیر درست
await step1('1099887766', '09121234455');
const sms = await p.textContent('.sms-demo'); const code = sms.match(/(\d{6})/)[1];
await p.screenshot({ path: 'tests/e2e/out/su2.png' });
await p.fill('#su-code', '000000'); await p.click('form[data-form=signup2] button[type=submit]'); await p.waitForTimeout(300);
console.log('wrong code:', (await p.textContent('.note.bad')).trim().slice(0, 30));
await p.fill('#su-code', code); await p.click('form[data-form=signup2] button[type=submit]'); await p.waitForTimeout(300);
await p.setInputFiles('input[name=national_card]', img('card')); await p.setInputFiles('input[name=bill]', img('bill'));
// بدون اجاره‌نامه → خطا
await p.fill('input[name=incDate]', '1405/08/10'); await p.fill('textarea[name=incAddress]', 'تهران، خیابان انقلاب، کوچه بهار، پلاک ۵');
await p.fill('input[name=password]', 'secret1'); await p.fill('input[name=password2]', 'secret1'); await p.check('input[name=declaration]');
await p.click('form[data-form=signup3] button[type=submit]'); await p.waitForTimeout(300);
console.log('missing proof toast:', (await p.textContent('.toast')).slice(0, 60));
await p.setInputFiles('input[name=proof]', img('lease'));
await p.screenshot({ path: 'tests/e2e/out/su3.png', fullPage: true });
await p.click('form[data-form=signup3] button[type=submit]'); await p.waitForTimeout(1200);
console.log('status page:', (await p.textContent('main h2')).trim());
await p.screenshot({ path: 'tests/e2e/out/su4-status.png', fullPage: true });
// تکراری: همان اشتراک دوباره
await p.click('[data-act=logout]'); await p.waitForTimeout(400);
await p.click('[data-act=signup]'); await step1('1023456789', '09129998877', 'owner');
const c2 = (await p.textContent('.sms-demo')).match(/(\d{6})/)[1]; await p.fill('#su-code', c2); await p.click('form[data-form=signup2] button[type=submit]'); await p.waitForTimeout(300);
await p.setInputFiles('input[name=national_card]', img('c')); await p.setInputFiles('input[name=bill]', img('b'));
await p.uncheck('input[name=hasIncident]'); await p.fill('input[name=password]', 'secret1'); await p.fill('input[name=password2]', 'secret1'); await p.check('input[name=declaration]');
await p.click('form[data-form=signup3] button[type=submit]'); await p.waitForTimeout(500);
console.log('duplicate blocked:', (await p.textContent('.toast')).slice(0, 70));
await p.click('[data-act=signupExit]'); await p.waitForTimeout(300);
// کارشناس گاز
await p.click('[data-act=demoLogin][data-i="4"]'); await p.waitForTimeout(500);
console.log('regs tile count:', await p.textContent('.tile:has-text("درخواست‌های ثبت‌نام") .tile-n'));
await p.click('[data-go=regs]'); await p.waitForTimeout(300);
await p.screenshot({ path: 'tests/e2e/out/su5-regs.png', fullPage: true });
await p.click('.claim-row:has-text("پرویز")'); await p.waitForTimeout(500);
await p.screenshot({ path: 'tests/e2e/out/su6-reg.png', fullPage: true });
await p.click('[data-act=regDecide][data-d=fix]'); await p.fill('textarea[name=note]', 'عکس قبض خوانا نیست؛ دوباره بارگذاری کنید.'); await p.click('form[data-form=regReview] button[type=submit]'); await p.waitForTimeout(500);
// مشترک اصلاح می‌کند
await p.click('[data-nav=profile]'); await p.click('[data-act=logout]'); await p.waitForTimeout(300);
await p.fill('#lg-user', '1099887766'); await p.fill('#lg-pass', 'secret1'); await p.click('form[data-form=login] button[type=submit]'); await p.waitForTimeout(600);
console.log('needs fix shown:', await p.locator('form[data-form=regfix]').count(), (await p.textContent('.note.warn')).trim().slice(0, 50));
await p.setInputFiles('form[data-form=regfix] input[name=bill]', img('bill2')); await p.fill('textarea[name=reply]', 'عکس جدید فرستادم');
await p.click('form[data-form=regfix] button[type=submit]'); await p.waitForTimeout(800);
console.log('after resubmit:', (await p.textContent('main h2')).trim());
// کارشناس تأیید می‌کند
await p.click('[data-act=logout]'); await p.waitForTimeout(300);
await p.click('[data-act=demoLogin][data-i="4"]'); await p.waitForTimeout(500);
await p.click('[data-go=regs]'); await p.click('.claim-row:has-text("پرویز")'); await p.waitForTimeout(300);
await p.click('[data-act=regDecide][data-d=approve]'); await p.click('form[data-form=regReview] button[type=submit]'); await p.waitForTimeout(1000);
console.log('opened claim:', await p.textContent('.page-title h1'), '| docs tab files:');
await p.click('[role=tab][data-p*=files]'); await p.waitForTimeout(500);
console.log('  ', (await p.locator('.doc-card').allTextContents()).filter(t => /کارت ملی|قبض|اجاره/.test(t)).map(t => t.replace(/\s+/g, ' ').slice(0, 50)).join(' | '));
// اسپم
await p.click('[data-nav=home]'); await p.click('[data-go=regs]'); await p.click('.claim-row:has-text("کامران")'); await p.waitForTimeout(300);
await p.click('[data-act=regDecide][data-d=spam]'); await p.fill('textarea[name=note]', 'مدارک جعلی'); await p.click('form[data-form=regReview] button[type=submit]'); await p.waitForTimeout(500);
// مشترک تأییدشده وارد پرونده می‌شود
await p.click('[data-nav=profile]'); await p.click('[data-act=logout]'); await p.waitForTimeout(300);
await p.fill('#lg-user', '1099887766'); await p.fill('#lg-pass', 'secret1'); await p.click('form[data-form=login] button[type=submit]'); await p.waitForTimeout(600);
console.log('approved subscriber home:', await p.locator('.tile').count(), 'tiles |', (await p.textContent('.ocard-head .v')).trim());
await p.click('[data-nav=profile]'); await p.click('[data-act=logout]'); await p.waitForTimeout(300);
await p.fill('#lg-user', '1078912345'); await p.fill('#lg-pass', '123456'); await p.click('form[data-form=login] button[type=submit]'); await p.waitForTimeout(500);
console.log('spam user login:', (await p.textContent('.toast')).slice(0, 50));
await p.click('[data-act=signup]'); await step1('1011112222', '09351234567', 'owner');
console.log('spam mobile blocked:', (await p.textContent('.note.bad')).trim().slice(0, 50));
const docs = B.includes('8888') ? await p.evaluate(async () => { const j = await (await fetch(GII_WP.rest + 'bootstrap', { credentials: 'same-origin' })).json(); return 'subscriber sees claims: ' + j.db.claims.length + ' docs ' + JSON.stringify(Object.fromEntries(Object.entries(j.db.claims[0]?.docs || {}).map(([k, v]) => [k, v.length]))); }) : await p.evaluate(() => { const d = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => localStorage.getItem(k).includes('"claims"')))); const c = d.claims.find(x => x.timeline[0].label.includes('ثبت‌نام اینترنتی')); return { docs: Object.fromEntries(Object.entries(c.docs).map(([k, v]) => [k, v.length])), files: Object.keys(c.files).length, subscriber: d.users.find(u => u.id === c.subscriberId).reg.status }; });
console.log('claim docs:', JSON.stringify(docs));
console.log('errors', errs);
await b.close();

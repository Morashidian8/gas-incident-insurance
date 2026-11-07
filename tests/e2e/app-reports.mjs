import { chromium } from 'playwright';
// اجرا: ابتدا README همین پوشه را ببینید. تصاویر و فایل‌های خروجی در tests/e2e/out ذخیره می‌شوند.
import { mkdirSync } from 'node:fs';
mkdirSync('tests/e2e/out', { recursive: true });

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errs = [];
const B = process.env.APP_BASE || 'http://localhost:8770/';
async function pg(w, h) { const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); return p; }
const demo = async (p, url, i) => { await p.evaluate(() => sessionStorage.clear()); await p.goto(url); await p.waitForTimeout(500); await p.click(`[data-act=demoLogin][data-i="${i}"]`); await p.waitForTimeout(400); };

let p = await pg(412, 900);
await p.goto(B); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await p.goto(B); await p.waitForTimeout(1500);
await p.screenshot({ path: 'tests/e2e/out/r1-login.png', fullPage: true });
await p.click('.fire-cta'); await p.waitForTimeout(300);
console.log('offers:', await p.locator('.offer').count());
await p.screenshot({ path: 'tests/e2e/out/r2-offers.png' });
await p.click('.offer >> nth=0'); await p.waitForTimeout(200);
console.log('toast:', await p.textContent('.toast'));
// admin: set URL for offer 1
await demo(p, B, 6);
await p.click('[data-go=settings]'); await p.waitForTimeout(300);
await p.fill('input[name=fo0_url]', 'javascript:alert(1)'); await p.click('form[data-form=settings] button[type=submit]'); await p.waitForTimeout(200);
console.log('bad url toast:', await p.textContent('.toast.bad'));
await p.fill('input[name=fo0_url]', 'https://example.com/fire'); await p.fill('input[name=fo0_price]', '۹۹۹ تومان');
await p.click('form[data-form=settings] button[type=submit]'); await p.waitForTimeout(300);
await p.click('[data-act=logout], [data-nav=profile]').catch(()=>{}); await p.waitForTimeout(200);
await p.evaluate(() => sessionStorage.clear()); await p.goto(B); await p.waitForTimeout(500);
await p.click('.fire-cta'); await p.waitForTimeout(200);
console.log('offer0 href:', await p.getAttribute('.offer >> nth=0', 'href'), 'target', await p.getAttribute('.offer >> nth=0', 'target'), 'price:', await p.textContent('.offer >> nth=0 >> .of-price'));

// gas: reports
await demo(p, B, 4);
await p.screenshot({ path: 'tests/e2e/out/r3-gashome.png', fullPage: true });
await p.click('.dash-link'); await p.waitForTimeout(400);
await p.screenshot({ path: 'tests/e2e/out/r4-reports.png', fullPage: true });
console.log('kpis:', (await p.locator('.bk .v').allTextContents()).join(' | '));
console.log('sum:', await p.textContent('.rep-sum'));
await p.click('.lg >> nth=6'); await p.waitForTimeout(200);
console.log('paid rows:', await p.locator('#rep-live .ctbl tbody tr').count());
// select year 1404 and Bahman
await p.selectOption('[data-rep=y]', '1404'); await p.waitForTimeout(200);
await p.click('#rep-month tbody tr:nth-child(11) .mname'); await p.waitForTimeout(200);
console.log('bahman bar:', (await p.textContent('.sel-bar')).replace(/\s+/g,' '));
await p.click('#rep-month .chip:has-text("مسمومیت")'); await p.waitForTimeout(200);
console.log('bahman co:', (await p.textContent('.sel-bar')).replace(/\s+/g,' '), 'rows', await p.locator('#rep-month .ctbl tbody tr').count());
await p.screenshot({ path: 'tests/e2e/out/r5-month.png', fullPage: true });
const [d1] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=expDetail]')]);
await d1.saveAs('tests/e2e/out/detail.csv'); console.log('detail file:', d1.suggestedFilename());
const [d2] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=expLive]')]);
await d2.saveAs('tests/e2e/out/live.csv'); console.log('live file:', d2.suggestedFilename());
const [d3] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=expMonthly]')]);
await d3.saveAs('tests/e2e/out/monthly.csv');
await p.click('#rep-month [data-act=claimReport] >> nth=0'); await p.waitForTimeout(300);
await p.screenshot({ path: 'tests/e2e/out/r6-claimreport.png', fullPage: false });
const [d4] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=pdSave]')]);
await d4.saveAs('tests/e2e/out/claim.html');
await p.keyboard.press('Escape'); console.log('printdoc closed:', await p.locator('#printdoc').count() === 0);
// insurer reports
await demo(p, B, 5); await p.click('[data-nav=reports]'); await p.waitForTimeout(300);
console.log('insurer kpis:', (await p.locator('.bk .v').allTextContents()).join(' | '));
// desktop site
const s = await pg(1366, 900);
await s.goto(B + 'site/'); await s.waitForTimeout(1200);
await s.screenshot({ path: 'tests/e2e/out/r7-site.png' });
await demo(s, B + 'site/', 6); await s.goto(B + 'site/'); await s.waitForTimeout(300);
await s.click('[data-go=reports]'); await s.waitForTimeout(400);
await s.screenshot({ path: 'tests/e2e/out/r8-site-reports.png', fullPage: true });
await p.click('[data-nav=profile]'); await p.waitForTimeout(200); console.log('profile sheet logout:', await p.locator('[data-act=logout]').count());
console.log('errors:', errs);
await b.close();

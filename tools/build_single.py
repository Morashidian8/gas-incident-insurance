"""یک فایل HTML تکی و خودبسنده از برنامه می‌سازد (بدون نیاز به سرور).

اجرا:  python3 tools/build_single.py [--logo logo.png --org "نام سازمان"]
خروجی: dist/gas-incident-insurance.html  و  dist/fragment.html (بدون doctype، برای میزبانی درون‌صفحه‌ای)
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def module(path, ns, deps=""):
    src = (ROOT / path).read_text(encoding="utf-8")
    src = re.sub(r"^import .*?;\n", "", src, flags=re.M)
    names = re.findall(r"^export (?:async )?(?:function|const|let) (\w+)", src, flags=re.M)
    src = re.sub(r"^export ", "", src, flags=re.M)
    return f"const {ns} = (() => {{\n{deps}{src}\nreturn {{ {', '.join(names)} }};\n}})();\n"


def logo_data_url(path):
    import base64, mimetypes
    mime = mimetypes.guess_type(path)[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(Path(path).read_bytes()).decode()


SW = """// پوسته برنامه را برای کار آفلاین نگه می‌دارد؛ داده‌ها در localStorage و IndexedDB هستند.
const CACHE = 'gii-pwa-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone();
    if (res.ok) caches.open(CACHE).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
"""


def build(logo=None, org=""):
    css = (ROOT / "css/app.css").read_text(encoding="utf-8")
    wf = module("js/workflow.js", "W")
    if logo:
        # لوگو و نام سازمان به‌عنوان پیش‌فرض نسخه ساخته‌شده قرار می‌گیرد
        wf = wf.replace("logoDataUrl: '',", f"logoDataUrl: '{logo_data_url(logo)}',", 1)
        wf = wf.replace("orgName: '',", f"orgName: {org!r},", 1)
    store = module("js/store.js", "S", "const { DEFAULT_SETTINGS, DOC_TYPES, claimCode, jalaliString, isValidNationalId } = W;\n")
    icons = module("js/icons.js", "I")
    app = (ROOT / "js/app.js").read_text(encoding="utf-8")
    app = re.sub(r"^import .*?;\n", "", app, flags=re.M)
    js_full = wf + store + icons + "{\nconst { icon, illo, brandMark } = I;\n" + app + "\n}\n"
    # نسخه درون‌صفحه‌ای سرویس‌ورکر ندارد
    js = js_full.replace("navigator.serviceWorker.register('sw.js')", "Promise.reject()")
    head = """<title>بیمه حوادث مشترکین گاز</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lalezar&family=Vazirmatn:wght@400;500;700;800&display=swap">
"""
    body = f'<style>\n{css}\n</style>\n<div id="app" aria-live="polite"></div>\n<script>\n{js}</script>\n'
    body_full = body.replace(js, js_full)
    pwa = """<meta name="theme-color" content="#3a8cc3">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="حوادث گاز">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
"""
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    (out / "fragment.html").write_text(head + body, encoding="utf-8")
    (out / "gas-incident-insurance.html").write_text(
        '<!doctype html>\n<html lang="fa" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + pwa + head + "</head>\n<body>\n" + body_full + "</body>\n</html>\n", encoding="utf-8")
    # پوشه قابل انتشار روی هر میزبان https (مثلاً GitHub Pages) و نصب روی صفحه اصلی گوشی
    import shutil
    site = out / "pwa"
    if site.exists():
        shutil.rmtree(site)
    (site / "icons").mkdir(parents=True)
    shutil.copy(out / "gas-incident-insurance.html", site / "index.html")
    shutil.copy(ROOT / "manifest.webmanifest", site)
    for f in (ROOT / "icons").glob("*.png"):
        shutil.copy(f, site / "icons")
    (site / "sw.js").write_text(SW, encoding="utf-8")
    print("dist/gas-incident-insurance.html ساخته شد")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--logo", help="فایل لوگوی سازمان (PNG/SVG) برای قرار گرفتن در نسخه ساخته‌شده")
    ap.add_argument("--org", default="", help="نام سازمان زیر لوگو")
    a = ap.parse_args()
    build(a.logo, a.org)

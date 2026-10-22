"""نسخه نمایشی رمزدار برای ارائه به دیگران.

یک فایل HTML تکی می‌سازد که:
  - کل برنامه (کد، سبک، فونت‌ها) داخلش با AES-256-GCM رمز شده؛ کلید با PBKDF2-SHA256 از رمز ساخته می‌شود.
  - بدون رمز چیزی از برنامه دیده یا خوانده نمی‌شود؛ رمزگشایی با WebCrypto خود مرورگر و بدون اینترنت.
  - تاریخ انقضا دارد و پس از آن اجرا نمی‌شود.
  - روی همه صفحه‌ها واترمارک «نسخه نمایشی محرمانه» (و نام گیرنده) دارد.
  - کد فشرده و درهم (terser) است و هیچ نشانی بیرونی (GitHub، Google Fonts و...) در آن نیست.

محدودیت: هر چیزی که در مرورگر اجرا شود، پس از ورود رمز روی همان دستگاه قابل استخراج است؛
این روش سوءاستفاده را سخت و ردپذیر می‌کند، نه غیرممکن.

اجرا:
  python3 tools/build_secure.py --password '...' [--days 30] [--name 'نام گیرنده'] --terser /path/to/terser --out file.html
"""
import argparse
import base64
import datetime as dt
import gzip
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_single import bundle_js, logo_data_url  # noqa: E402

ITERATIONS = 310_000


def minify(js, terser):
    if not terser:
        print("هشدار: terser داده نشد؛ کد فشرده نمی‌شود.")
        return js
    with tempfile.TemporaryDirectory() as d:
        src, out = Path(d) / "in.js", Path(d) / "out.js"
        src.write_text(js, encoding="utf-8")
        subprocess.run([terser, str(src), "--compress", "passes=2", "--mangle", "toplevel=true", "--toplevel", "-o", str(out)], check=True)
        return out.read_text(encoding="utf-8")


def fonts_css():
    """فونت‌ها به‌صورت data URI داخل فایل تا هیچ درخواست بیرونی نباشد."""
    css = (ROOT / "assets" / "fonts" / "fonts.css").read_text(encoding="utf-8")
    for f in (ROOT / "assets" / "fonts").glob("*.woff2"):
        b64 = base64.b64encode(f.read_bytes()).decode()
        css = css.replace(f"url('{f.name}')", f"url(data:font/woff2;base64,{b64})")
    return css


def build(password, days, name, terser, out, logo, org):
    js = bundle_js(logo, org)
    # در نسخه رمزدار پیوند به نسخه دیگر و سرویس‌ورکر لازم نیست (نشانی‌ای هم لو نمی‌رود)
    for a, b in [("const OTHER_URL = location.protocol.startsWith('http')", "const OTHER_URL = false && location.protocol.startsWith('http')"),
                 ("navigator.serviceWorker.register(", "Promise.reject(")]:
        assert a in js, a
        js = js.replace(a, b)
    js = minify(js, terser)
    css = fonts_css() + (ROOT / "css" / "app.css").read_text(encoding="utf-8")

    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days)
    payload = json.dumps({"js": js, "css": css, "exp": int(exp.timestamp() * 1000), "name": name}, ensure_ascii=False).encode()
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(password.encode())
    blob = AESGCM(key).encrypt(iv, gzip.compress(payload, 9), None)
    enc = {"s": base64.b64encode(salt).decode(), "i": base64.b64encode(iv).decode(), "n": ITERATIONS, "d": base64.b64encode(blob).decode(), "e": int(exp.timestamp() * 1000)}

    logo_uri = logo_data_url(logo) if logo else ""
    html = TEMPLATE.replace("__ENC__", json.dumps(enc)).replace("__LOGO__", logo_uri).replace("__ORG__", org or "")
    Path(out).write_text(html, encoding="utf-8")
    print(f"ساخته شد: {out} ({Path(out).stat().st_size // 1024} KB) — اعتبار تا {exp:%Y-%m-%d}")


# صفحه قفل: فقط همین بخش رمز نشده است
TEMPLATE = r"""<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>بیمه حوادث مشترکین گاز — نسخه نمایشی</title>
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; min-height: 100%; }
  body { background: #0b2340; color: #e8f1fa; font-family: Tahoma, 'Segoe UI', sans-serif; direction: rtl; }
  #lock { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; box-sizing: border-box; }
  .card { box-sizing: border-box; width: min(380px, 100%); background: #fff; color: #1c2733; border-radius: 22px; padding: 26px 22px; box-shadow: 0 30px 70px rgba(0,0,0,.4); display: flex; flex-direction: column; gap: 12px; text-align: center; }
  .card img { width: 76px; height: 76px; object-fit: contain; margin: 0 auto; }
  .card h1 { font-size: 19px; margin: 0; }
  .card p { margin: 0; font-size: 13.5px; color: #5d6d7d; line-height: 1.9; }
  .card input { font: inherit; font-size: 16px; padding: 12px; border-radius: 12px; border: 1.5px solid #d5dee7; text-align: center; direction: ltr; }
  .card input:focus { outline: none; border-color: #3a8cc3; }
  .card button { font: inherit; font-weight: 700; font-size: 15px; padding: 12px; border-radius: 14px; border: 0; background: #3a8cc3; color: #fff; cursor: pointer; }
  .card button.alt { background: #f26b21; }
  .card button:disabled { opacity: .6; }
  .err { color: #d9443a !important; font-weight: 700; min-height: 1.4em; }
  .tag { display: inline-block; background: #fdf0e2; color: #b45a12; border-radius: 999px; padding: 3px 12px; font-size: 12px; font-weight: 700; margin: 0 auto; }
  #wm { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; opacity: .11; background-repeat: repeat; }
  @media print { body * { display: none !important; } body::after { content: "چاپ این نسخه مجاز نیست."; display: block; padding: 40px; color: #000; } }
</style>
</head>
<body>
<div id="lock"><div class="card">
  <img src="__LOGO__" alt="" onerror="this.remove()">
  <span class="tag">نسخه نمایشی محرمانه</span>
  <h1>سامانه بیمه حوادث مشترکین گاز</h1>
  <p>این فایل رمزگذاری شده است. رمز را از فرستنده بگیرید.</p>
  <input id="pw" type="password" autocomplete="off" placeholder="رمز" aria-label="رمز">
  <button id="go">باز کردن</button>
  <p class="err" id="err"></p>
  <p id="exp"></p>
</div></div>
<script>
(function () {
  var ENC = __ENC__;
  var $ = function (id) { return document.getElementById(id); };
  var fa = function (d) { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' }).format(d); } catch (e) { return d.toLocaleDateString(); } };
  $('exp').textContent = 'اعتبار این نسخه تا ' + fa(new Date(ENC.e));
  var b64 = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && /^[supSUP]$/.test(e.key)) e.preventDefault(); });

  async function unlock() {
    var pw = $('pw').value; if (!pw) return;
    $('go').disabled = true; $('err').textContent = ''; $('go').textContent = 'در حال باز کردن…';
    try {
      if (!window.crypto || !crypto.subtle || !window.DecompressionStream) throw new Error('old');
      var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
      var key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(ENC.s), iterations: ENC.n, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      var plain;
      try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(ENC.i) }, key, b64(ENC.d)); }
      catch (e) { throw new Error('pw'); }
      var text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      var P = JSON.parse(text);
      if (Date.now() > P.exp) throw new Error('exp');
      choose(P);
    } catch (e) {
      $('err').textContent = e.message === 'pw' ? 'رمز نادرست است.' : e.message === 'exp' ? 'اعتبار این نسخه تمام شده است.' : e.message === 'old' ? 'این مرورگر قدیمی است؛ با کروم یا سافاری جدید باز کنید.' : 'باز کردن ممکن نشد.';
      $('go').disabled = false; $('go').textContent = 'باز کردن';
    }
  }
  function choose(P) {
    $('lock').querySelector('.card').innerHTML = '<span class="tag">نسخه نمایشی محرمانه</span><h1>کدام نسخه نمایش داده شود؟</h1>'
      + '<button id="m-app">اپ موبایل</button><button class="alt" id="m-site">سایت (کامپیوتر)</button>'
      + '<p>برای جابه‌جایی بین دو نسخه، صفحه را دوباره باز کنید.</p>';
    $('m-app').onclick = function () { run(P, 'app'); };
    $('m-site').onclick = function () { run(P, 'site'); };
  }
  function watermark(name) {
    var text = 'نسخه نمایشی محرمانه' + (name ? ' — ' + name : '') + ' — ' + fa(new Date());
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="240"><text x="210" y="130" text-anchor="middle" font-family="Tahoma" font-size="17" fill="#555" transform="rotate(-24 210 120)">' + text.replace(/[<&]/g, '') + '</text></svg>';
    var wm = document.createElement('div'); wm.id = 'wm';
    wm.style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
    document.body.appendChild(wm);
  }
  function run(P, mode) {
    document.documentElement.dataset.mode = mode;
    $('lock').remove();
    var st = document.createElement('style'); st.textContent = P.css; document.head.appendChild(st);
    document.body.style.cssText = '';
    var app = document.createElement('div'); app.id = 'app'; app.setAttribute('aria-live', 'polite'); document.body.prepend(app);
    var sc = document.createElement('script'); sc.textContent = P.js; document.body.appendChild(sc);
    watermark(P.name);
  }
  $('go').onclick = unlock;
  $('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') unlock(); });
})();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--password", required=True)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--name", default="")
    ap.add_argument("--terser", default="")
    ap.add_argument("--out", required=True)
    ap.add_argument("--logo", default=str(ROOT / "assets" / "logo.png"))
    ap.add_argument("--org", default="شرکت ملی گاز ایران")
    a = ap.parse_args()
    build(a.password, a.days, a.name, a.terser, a.out, a.logo, a.org)

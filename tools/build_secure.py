"""نسخه نمایشی رمزدار برای ارائه به دیگران.

یک فایل HTML تکی می‌سازد که:
  - کل برنامه (کد، سبک، فونت‌ها) داخلش با AES-256-GCM رمز شده؛ کلید با PBKDF2-SHA256 از رمز ساخته می‌شود.
  - بدون رمز چیزی از برنامه دیده یا خوانده نمی‌شود؛ رمزگشایی با WebCrypto خود مرورگر و بدون اینترنت.
    اگر WebCrypto در دسترس نباشد (فایل باز شده از پیام‌رسان یا مدیر فایل اندروید، مرورگر قدیمی)
    همان رمزگشایی با کد جاوااسکریپت داخل صفحه انجام می‌شود.
  - تاریخ انقضا دارد و پس از آن اجرا نمی‌شود.
  - روی همه صفحه‌ها واترمارک «نسخه نمایشی محرمانه» (و نام گیرنده) دارد.
  - کد فشرده و درهم (terser) است و هیچ نشانی بیرونی (GitHub، Google Fonts و...) در آن نیست.

روی صفحه بزرگ، «اپ موبایل» داخل قاب گوشی (iframe با عرض موبایل) و در صورت انتخاب، تمام‌صفحه نمایش داده می‌شود؛
برای ارائه آفلاین از روی فلش مناسب است. عقب بردن ساعت دستگاه برای دور زدن انقضا تشخیص داده می‌شود.

محدودیت: هر چیزی که در مرورگر اجرا شود، پس از ورود رمز روی همان دستگاه قابل استخراج است؛
این روش سوءاستفاده را سخت و ردپذیر می‌کند، نه غیرممکن.

اجرا:
  python3 tools/build_secure.py --password '...' [--days 30] [--name 'نام گیرنده'] --terser /path/to/terser --out file.html
"""
import argparse
import base64
import datetime as dt
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


def norm_password(pw):
    """فاصله، خط تیره و نویسه‌های نامرئی نادیده؛ رقم فارسی/عربی = رقم لاتین؛ حروف بزرگ و کوچک یکسان.
    همین کار در صفحه قفل هم انجام می‌شود تا رمز تایپ‌شده با صفحه‌کلید فارسی یا کپی‌شده با فاصله هم کار کند."""
    out = ""
    for ch in pw:
        o = ord(ch)
        if 0x6F0 <= o <= 0x6F9: ch = str(o - 0x6F0)
        elif 0x660 <= o <= 0x669: ch = str(o - 0x660)
        if ch.isascii() and ch.isalnum(): out += ch.upper()
    return out


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
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(norm_password(password).encode())
    blob = AESGCM(key).encrypt(iv, payload, None)
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
  .card button.link { background: none; color: #3a8cc3; padding: 0; font-size: 13px; font-weight: 400; }
  .card button.alt { background: #f26b21; }
  .card button:disabled { opacity: .6; }
  .fs { display: flex; gap: 8px; align-items: center; justify-content: center; font-size: 13px; color: #5d6d7d; cursor: pointer; }
  .err { color: #d9443a !important; font-weight: 700; min-height: 1.4em; }
  .nojs { background: #fff4e5; border: 1.5px solid #f2a65a; border-radius: 12px; padding: 10px; color: #8a4b0f !important; font-weight: 700; }
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
  <p class="nojs" id="nojs">این پیش‌نمایش برنامه اجرا نمی‌کند. فایل را ذخیره کنید و با مرورگر <b>کروم</b> یا <b>سافاری</b> باز کنید.<br>(در تلگرام/واتس‌اپ: «ذخیره در دانلودها» یا «باز کردن با…» ← Chrome)</p>
  <input id="pw" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="latin" placeholder="رمز" aria-label="رمز" disabled>
  <button type="button" class="link" id="show">نمایش رمز</button>
  <button id="go" disabled>باز کردن</button>
  <p class="err" id="err"></p>
  <p id="exp"></p>
</div></div>
<script>
(function () {
  var ENC = __ENC__;
  var $ = function (id) { return document.getElementById(id); };
  $('nojs').style.display = 'none';
  $('pw').disabled = false; $('go').disabled = false;
  var fa = function (d) { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' }).format(d); } catch (e) { return d.toLocaleDateString(); } };
  $('exp').textContent = 'اعتبار این نسخه تا ' + fa(new Date(ENC.e));
  var b64 = function (s) { var r = atob(s), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; };
  var enc = function (s) { var u = unescape(encodeURIComponent(s)), a = new Uint8Array(u.length); for (var i = 0; i < u.length; i++) a[i] = u.charCodeAt(i); return a; };
  var dec = function (a) {
    if (window.TextDecoder) return new TextDecoder().decode(a);
    var s = ''; for (var i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192));
    return decodeURIComponent(escape(s));
  };
  // جلوگیری از ذخیره، چاپ، نمایش کد، ابزار توسعه، کشیدن و کپی (در صفحه اصلی و قاب گوشی)
  function guard(doc) {
    doc.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    doc.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (k === 'f12' || (mod && /^[supa]$/.test(k) && !(k === 'a' && e.target.matches && e.target.matches('input, textarea'))) || (mod && e.shiftKey && /^[ijck]$/.test(k)) || (e.metaKey && e.altKey && /^[iju]$/.test(k))) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    ['copy', 'cut', 'dragstart'].forEach(function (t) { doc.addEventListener(t, function (e) { if (!(e.target.matches && e.target.matches('input, textarea'))) e.preventDefault(); }, true); });
    var st = doc.createElement('style');
    st.textContent = 'body{-webkit-user-select:none;user-select:none}input,textarea{-webkit-user-select:text;user-select:text}img{-webkit-user-drag:none}@media print{body *{display:none!important}body::after{content:"چاپ این نسخه مجاز نیست.";display:block;padding:40px}}';
    (doc.head || doc.documentElement).appendChild(st);
  }
  guard(document);
  // جلوگیری از دور زدن تاریخ انقضا با عقب بردن ساعت دستگاه
  var SEEN = 'gii.secure.seen.' + ENC.s.slice(0, 8);
  function clockOk() {
    var now = Date.now(), seen = 0;
    try { seen = +localStorage.getItem(SEEN) || 0; } catch (e) {}
    if (seen && now < seen - 36 * 3600 * 1000) return false;
    try { localStorage.setItem(SEEN, String(Math.max(seen, now))); } catch (e) {}
    return true;
  }
  setInterval(clockOk, 60000);

  // ---- رمزگشایی با WebCrypto ----
  function viaWebCrypto(pw) {
    var S = crypto.subtle;
    return S.importKey('raw', enc(pw), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return S.deriveKey({ name: 'PBKDF2', salt: b64(ENC.s), iterations: ENC.n, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }).then(function (key) {
      return S.decrypt({ name: 'AES-GCM', iv: b64(ENC.i) }, key, b64(ENC.d)).then(function (b) { return new Uint8Array(b); }, function () { throw new Error('pw'); });
    });
  }

  // ---- رمزگشایی بدون WebCrypto: SHA-256، PBKDF2 و AES-256-CTR (بخش رمز GCM) ----
  var K256 = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  var IV0 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var Wb = new Uint32Array(64);
  function compress(h, m) { // h: وضعیت ۸ کلمه‌ای، m: ۱۶ کلمه
    var w = Wb, i, t1, t2, x, y;
    for (i = 0; i < 16; i++) w[i] = m[i];
    for (i = 16; i < 64; i++) {
      x = w[i - 15]; y = w[i - 2];
      w[i] = (((x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ (x >>> 3)) + w[i - 7] + ((y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ (y >>> 10)) + w[i - 16]) | 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (i = 0; i < 64; i++) {
      t1 = (k + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
      t2 = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
  }
  function sha256(bytes) {
    var n = bytes.length, len = ((n + 9 + 63) >> 6) << 6, p = new Uint8Array(len), h = IV0.slice(), m = new Int32Array(16), i, j;
    p.set(bytes); p[n] = 0x80;
    var bits = n * 8; p[len - 4] = bits >>> 24; p[len - 3] = bits >>> 16; p[len - 2] = bits >>> 8; p[len - 1] = bits; p[len - 5] = Math.floor(bits / 4294967296);
    for (i = 0; i < len; i += 64) { for (j = 0; j < 16; j++) m[j] = p[i + j * 4] << 24 | p[i + j * 4 + 1] << 16 | p[i + j * 4 + 2] << 8 | p[i + j * 4 + 3]; compress(h, m); }
    return h;
  }
  var words2bytes = function (h) { var o = new Uint8Array(h.length * 4); for (var i = 0; i < h.length; i++) { o[i * 4] = h[i] >>> 24; o[i * 4 + 1] = h[i] >>> 16; o[i * 4 + 2] = h[i] >>> 8; o[i * 4 + 3] = h[i]; } return o; };
  // PBKDF2-HMAC-SHA256 برای ۳۲ بایت (یک بلوک)؛ تکه‌تکه تا صفحه قفل نشود
  function pbkdf2(pw, salt, iters, done) {
    var key = pw.length > 64 ? words2bytes(sha256(pw)) : pw, ip = new Uint8Array(64), op = new Uint8Array(64), i;
    for (i = 0; i < 64; i++) { ip[i] = (key[i] || 0) ^ 0x36; op[i] = (key[i] || 0) ^ 0x5c; }
    var istate = IV0.slice(), ostate = IV0.slice(), m = new Int32Array(16);
    var load = function (b) { for (var j = 0; j < 16; j++) m[j] = b[j * 4] << 24 | b[j * 4 + 1] << 16 | b[j * 4 + 2] << 8 | b[j * 4 + 3]; };
    load(ip); compress(istate, m); load(op); compress(ostate, m);
    var hmac = function (msg) { var inner = sha256Cont(istate, msg); return sha256Cont(ostate, words2bytes(inner)); };
    var first = new Uint8Array(salt.length + 4); first.set(salt); first[salt.length + 3] = 1;
    var u = hmac(first), t = u.slice(), blk = new Int32Array(16), h = new Int32Array(8), count = 1;
    function step() {
      var stop = Math.min(iters, count + 4000);
      for (; count < stop; count++) {
        // HMAC روی ۳۲ بایت: یک فشرده‌سازی داخلی و یک بیرونی
        for (var j = 0; j < 8; j++) blk[j] = u[j]; blk[8] = 0x80000000; for (j = 9; j < 15; j++) blk[j] = 0; blk[15] = (64 + 32) * 8;
        for (j = 0; j < 8; j++) h[j] = istate[j]; compress(h, blk);
        for (j = 0; j < 8; j++) blk[j] = h[j];
        for (j = 0; j < 8; j++) h[j] = ostate[j]; compress(h, blk);
        for (j = 0; j < 8; j++) { u[j] = h[j]; t[j] ^= h[j]; }
      }
      if (count < iters) { $('go').textContent = 'در حال باز کردن… ' + Math.round(count / iters * 100) + '٪'; setTimeout(step, 0); }
      else done(words2bytes(t));
    }
    step();
  }
  function sha256Cont(state, msg) { // ادامه هش پس از یک بلوک ۶۴ بایتی
    var n = msg.length, len = ((n + 9 + 63) >> 6) << 6, p = new Uint8Array(len), h = Array.prototype.slice.call(state), m = new Int32Array(16), i, j;
    p.set(msg); p[n] = 0x80; var bits = (n + 64) * 8; p[len - 4] = bits >>> 24; p[len - 3] = bits >>> 16; p[len - 2] = bits >>> 8; p[len - 1] = bits;
    for (i = 0; i < len; i += 64) { for (j = 0; j < 16; j++) m[j] = p[i + j * 4] << 24 | p[i + j * 4 + 1] << 16 | p[i + j * 4 + 2] << 8 | p[i + j * 4 + 3]; compress(h, m); }
    return h;
  }
  // AES-256 (فقط رمزکردن بلوک، برای حالت CTR)
  var SB = new Uint8Array(256), T0 = new Uint32Array(256), T1 = new Uint32Array(256), T2 = new Uint32Array(256), T3 = new Uint32Array(256);
  (function () {
    var mul = function (a, b) { var r = 0; while (b) { if (b & 1) r ^= a; a = a & 0x80 ? (a << 1) ^ 0x11b : a << 1; b >>= 1; } return r; };
    var rot = function (v, n) { return ((v << n) | (v >> (8 - n))) & 255; };
    for (var x = 0; x < 256; x++) {
      var inv = 0; if (x) for (var y = 1; y < 256; y++) if (mul(x, y) === 1) { inv = y; break; }
      var s = inv ^ rot(inv, 1) ^ rot(inv, 2) ^ rot(inv, 3) ^ rot(inv, 4) ^ 0x63;
      SB[x] = s;
      var v = (mul(s, 2) << 24 | s << 16 | s << 8 | mul(s, 3)) >>> 0;
      T0[x] = v; T1[x] = v << 24 | v >>> 8; T2[x] = v << 16 | v >>> 16; T3[x] = v << 8 | v >>> 24;
    }
  })();
  function expandKey(k) {
    var w = new Uint32Array(60), i, t, rc = 1;
    for (i = 0; i < 8; i++) w[i] = k[i * 4] << 24 | k[i * 4 + 1] << 16 | k[i * 4 + 2] << 8 | k[i * 4 + 3];
    for (i = 8; i < 60; i++) {
      t = w[i - 1];
      if (i % 8 === 0) { t = SB[t >>> 16 & 255] << 24 | SB[t >>> 8 & 255] << 16 | SB[t & 255] << 8 | SB[t >>> 24]; t ^= rc << 24; rc = rc << 1 ^ (rc & 0x80 ? 0x11b : 0); }
      else if (i % 8 === 4) t = SB[t >>> 24] << 24 | SB[t >>> 16 & 255] << 16 | SB[t >>> 8 & 255] << 8 | SB[t & 255];
      w[i] = w[i - 8] ^ t;
    }
    return w;
  }
  function encBlock(w, b, o) {
    var s0 = b[0] ^ w[0], s1 = b[1] ^ w[1], s2 = b[2] ^ w[2], s3 = b[3] ^ w[3], t0, t1, t2, t3, r, k = 4;
    for (r = 1; r < 14; r++, k += 4) {
      t0 = T0[s0 >>> 24] ^ T1[s1 >>> 16 & 255] ^ T2[s2 >>> 8 & 255] ^ T3[s3 & 255] ^ w[k];
      t1 = T0[s1 >>> 24] ^ T1[s2 >>> 16 & 255] ^ T2[s3 >>> 8 & 255] ^ T3[s0 & 255] ^ w[k + 1];
      t2 = T0[s2 >>> 24] ^ T1[s3 >>> 16 & 255] ^ T2[s0 >>> 8 & 255] ^ T3[s1 & 255] ^ w[k + 2];
      t3 = T0[s3 >>> 24] ^ T1[s0 >>> 16 & 255] ^ T2[s1 >>> 8 & 255] ^ T3[s2 & 255] ^ w[k + 3];
      s0 = t0; s1 = t1; s2 = t2; s3 = t3;
    }
    o[0] = (SB[s0 >>> 24] << 24 | SB[s1 >>> 16 & 255] << 16 | SB[s2 >>> 8 & 255] << 8 | SB[s3 & 255]) ^ w[k];
    o[1] = (SB[s1 >>> 24] << 24 | SB[s2 >>> 16 & 255] << 16 | SB[s3 >>> 8 & 255] << 8 | SB[s0 & 255]) ^ w[k + 1];
    o[2] = (SB[s2 >>> 24] << 24 | SB[s3 >>> 16 & 255] << 16 | SB[s0 >>> 8 & 255] << 8 | SB[s1 & 255]) ^ w[k + 2];
    o[3] = (SB[s3 >>> 24] << 24 | SB[s0 >>> 16 & 255] << 16 | SB[s1 >>> 8 & 255] << 8 | SB[s2 & 255]) ^ w[k + 3];
  }
  function ctrDecrypt(key, iv, data) { // GCM: شمارنده از IV||2 شروع می‌شود؛ ۱۶ بایت آخر برچسب است
    var w = expandKey(key), n = data.length - 16, out = new Uint8Array(n), ctr = new Uint32Array(4), ks = new Uint32Array(4), i, j, c = 2;
    ctr[0] = iv[0] << 24 | iv[1] << 16 | iv[2] << 8 | iv[3]; ctr[1] = iv[4] << 24 | iv[5] << 16 | iv[6] << 8 | iv[7]; ctr[2] = iv[8] << 24 | iv[9] << 16 | iv[10] << 8 | iv[11];
    for (i = 0; i < n; i += 16, c++) {
      ctr[3] = c; encBlock(w, ctr, ks);
      for (j = 0; j < 16 && i + j < n; j++) out[i + j] = data[i + j] ^ (ks[j >> 2] >>> (24 - (j & 3) * 8));
    }
    return out;
  }
  function viaJs(pw) {
    return new Promise(function (res) {
      setTimeout(function () { pbkdf2(enc(pw), b64(ENC.s), ENC.n, function (key) { res(ctrDecrypt(key, b64(ENC.i), b64(ENC.d))); }); }, 30);
    });
  }
  window.__giiSelfTest = function () { return { sha: Array.prototype.map.call(words2bytes(sha256(enc('abc'))), function (b) { return (b + 256).toString(16).slice(1); }).join('') }; };

  // مانند norm_password در سازنده
  function normPw(v) {
    return v.replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); })
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }
  $('show').onclick = function () { var i = $('pw'); i.type = i.type === 'password' ? 'text' : 'password'; $('show').textContent = i.type === 'password' ? 'نمایش رمز' : 'پنهان کردن رمز'; };
  function unlock() {
    var pw = normPw($('pw').value); if (!pw) return;
    $('go').disabled = true; $('err').textContent = ''; $('go').textContent = 'در حال باز کردن…';
    var hasWC = false; try { hasWC = !!(window.crypto && crypto.subtle && window.isSecureContext !== false); } catch (e) {}
    (hasWC ? viaWebCrypto(pw).catch(function (e) { if (e.message === 'pw') throw e; return viaJs(pw); }) : viaJs(pw)).then(function (plain) {
      var P; try { P = JSON.parse(dec(plain)); } catch (e) { throw new Error('pw'); }
      if (!P || !P.js) throw new Error('pw');
      if (Date.now() > P.exp) throw new Error('exp');
      if (!clockOk()) throw new Error('clock');
      choose(P);
    }).catch(function (e) {
      $('err').textContent = e.message === 'pw' ? 'رمز نادرست است. با «نمایش رمز» آن را با رمزی که گرفته‌اید مقایسه کنید (حروف انگلیسی).' : e.message === 'exp' ? 'اعتبار این نسخه تمام شده است.' : e.message === 'clock' ? 'تاریخ و ساعت این دستگاه درست نیست. آن را تنظیم کنید و دوباره باز کنید.' : 'باز کردن ممکن نشد. فایل را با مرورگر کروم یا سافاری باز کنید.';
      $('go').disabled = false; $('go').textContent = 'باز کردن';
    });
  }
  var wide = function () { return window.innerWidth >= 760; };
  function choose(P) {
    $('lock').querySelector('.card').innerHTML = '<span class="tag">نسخه نمایشی محرمانه</span><h1>کدام نسخه نمایش داده شود؟</h1>'
      + '<button id="m-app">اپ موبایل' + (wide() ? ' (در قاب گوشی)' : '') + '</button><button class="alt" id="m-site">سایت (کامپیوتر)</button>'
      + '<label class="fs"><input type="checkbox" id="m-fs" ' + (wide() ? 'checked' : '') + '> نمایش تمام‌صفحه برای ارائه (خروج با Esc)</label>'
      + '<p>برای جابه‌جایی بین دو نسخه، صفحه را دوباره باز کنید.</p>';
    var go = function (mode) {
      try { if ($('m-fs').checked && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) {}
      run(P, mode);
    };
    $('m-app').onclick = function () { go('app'); };
    $('m-site').onclick = function () { go('site'); };
  }
  function wmSvg(name) {
    var text = 'نسخه نمایشی محرمانه' + (name ? ' — ' + name : '') + ' — ' + fa(new Date());
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="240"><text x="210" y="130" text-anchor="middle" font-family="Tahoma" font-size="17" fill="#555" transform="rotate(-24 210 120)">' + text.replace(/[<&]/g, '') + '</text></svg>';
    return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
  }
  function watermark(doc, name) {
    var wm = doc.createElement('div');
    wm.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:.11;background-repeat:repeat;background-image:' + wmSvg(name));
    doc.body.appendChild(wm);
  }
  function run(P, mode) {
    $('lock').remove();
    document.body.style.cssText = '';
    if (mode === 'app' && wide()) return runFramed(P);
    document.documentElement.dataset.mode = mode;
    var st = document.createElement('style'); st.textContent = P.css; document.head.appendChild(st);
    var app = document.createElement('div'); app.id = 'app'; app.setAttribute('aria-live', 'polite'); document.body.prepend(app);
    var sc = document.createElement('script'); sc.textContent = P.js; document.body.appendChild(sc);
    watermark(document, P.name);
  }
  // اپ موبایل روی صفحه بزرگ: داخل قاب گوشی با viewport واقعی موبایل (iframe هم‌مبدأ)
  function runFramed(P) {
    var css = 'html,body{height:100%}body{margin:0;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,#1d4f7a,#0b2340 60%);overflow:hidden}'
      + '.phone{position:relative;width:398px;height:min(860px,calc(100vh - 40px));border-radius:48px;background:#0c0f14;padding:12px;box-shadow:0 40px 90px rgba(0,0,0,.55),inset 0 0 0 2px #2a3340}'
      + '.phone iframe{width:100%;height:100%;border:0;border-radius:38px;background:#f3f6f9;display:block}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var ph = document.createElement('div'); ph.className = 'phone';
    var fr = document.createElement('iframe'); fr.title = 'اپ بیمه حوادث مشترکین گاز';
    fr.srcdoc = '<!doctype html><html lang="fa" dir="rtl" data-mode="app"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app" aria-live="polite"></div></body></html>';
    fr.onload = function () {
      var d = fr.contentDocument;
      guard(d);
      var s1 = d.createElement('style'); s1.textContent = P.css; d.head.appendChild(s1);
      var sc = d.createElement('script'); sc.textContent = P.js; d.body.appendChild(sc);
      watermark(d, P.name);
      fr.contentWindow.focus();
    };
    ph.appendChild(fr); document.body.appendChild(ph);
    watermark(document, P.name);
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

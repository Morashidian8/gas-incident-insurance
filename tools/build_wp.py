"""افزونه وردپرس را آماده و بسته‌بندی می‌کند.

اجرا:  python3 tools/build_wp.py [--logo assets/logo.png --org "شرکت ملی گاز ایران"] [--pages-url https://.../]
خروجی:
  wordpress/gas-incident-insurance/assets/   app.js و app.css و فونت‌ها و آیکون‌ها (از همان کد اپ)
  dist/gas-incident-insurance-wp.zip          فایل نصب افزونه در وردپرس (افزونه‌ها ← افزودن ← بارگذاری)
  dist/pwa/wp/                                همان zip و blueprint.json برای آزمایش در WordPress Playground
"""
import argparse
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_single import bundle_js  # noqa: E402

PLUGIN = ROOT / "wordpress" / "gas-incident-insurance"
SLUG = "gas-incident-insurance"


def build(logo=None, org="", pages_url=""):
    assets = PLUGIN / "assets"
    if assets.exists():
        shutil.rmtree(assets)
    (assets / "icons").mkdir(parents=True)
    (assets / "app.js").write_text(bundle_js(logo, org), encoding="utf-8")
    shutil.copy(ROOT / "css" / "app.css", assets / "app.css")
    shutil.copytree(ROOT / "assets" / "fonts", assets / "fonts")
    for f in (ROOT / "icons").glob("*.png"):
        shutil.copy(f, assets / "icons")

    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    zpath = out / f"{SLUG}-wp.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(PLUGIN.rglob("*")):
            if f.is_file():
                z.write(f, f"{SLUG}/{f.relative_to(PLUGIN)}")

    # آزمایش بدون هاست: وردپرس کامل داخل مرورگر با افزونه و داده نمایشی
    wp = out / "pwa" / "wp"
    wp.mkdir(parents=True, exist_ok=True)
    shutil.copy(zpath, wp / f"{SLUG}.zip")
    blueprint = {
        "$schema": "https://playground.wordpress.net/blueprint-schema.json",
        "meta": {"title": "سامانه بیمه حوادث مشترکین گاز — نسخه آزمایشی", "author": "Morashidian8"},
        "landingPage": "/gii-site/",
        "login": False,
        "preferredVersions": {"php": "8.3", "wp": "latest"},
        "features": {"networking": False},
        "siteOptions": {"blogname": "سامانه بیمه حوادث گاز (آزمایشی)", "timezone_string": "Asia/Tehran", "permalink_structure": "/%postname%/"},
        "steps": [
            {"step": "installPlugin", "pluginData": {"resource": "url", "url": f"{pages_url.rstrip('/')}/wp/{SLUG}.zip"}, "options": {"activate": True}},
            {"step": "runPHP", "code": "<?php require_once '/wordpress/wp-load.php'; GII_Store::update_settings( array( 'demo' => true ) ); GII_Seed::reset( 0 ); flush_rewrite_rules();"},
        ],
    }
    (wp / "blueprint.json").write_text(json.dumps(blueprint, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"ساخته شد: {zpath.relative_to(ROOT)} ({zpath.stat().st_size // 1024} KB) و dist/pwa/wp/blueprint.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--logo")
    ap.add_argument("--org", default="")
    ap.add_argument("--pages-url", default="https://morashidian8.github.io/gas-incident-insurance/")
    a = ap.parse_args()
    build(a.logo, a.org, a.pages_url)

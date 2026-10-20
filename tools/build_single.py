"""یک فایل HTML تکی و خودبسنده از برنامه می‌سازد (بدون نیاز به سرور).

اجرا:  python3 tools/build_single.py
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


def build():
    css = (ROOT / "css/app.css").read_text(encoding="utf-8")
    wf = module("js/workflow.js", "W")
    store = module("js/store.js", "S", "const { DEFAULT_SETTINGS, DOC_TYPES, claimCode, jalaliString, isValidNationalId } = W;\n")
    icons = module("js/icons.js", "I")
    app = (ROOT / "js/app.js").read_text(encoding="utf-8")
    app = re.sub(r"^import .*?;\n", "", app, flags=re.M)
    app = app.replace("navigator.serviceWorker.register('sw.js')", "Promise.reject()")
    js = wf + store + icons + "{\nconst { icon, illo, brandMark } = I;\n" + app + "\n}\n"
    head = """<title>بیمه حوادث مشترکین گاز</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lalezar&family=Vazirmatn:wght@400;500;700;800&display=swap">
"""
    body = f'<style>\n{css}\n</style>\n<div id="app" aria-live="polite"></div>\n<script>\n{js}</script>\n'
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    (out / "fragment.html").write_text(head + body, encoding="utf-8")
    (out / "gas-incident-insurance.html").write_text(
        '<!doctype html>\n<html lang="fa" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + "</head>\n<body>\n" + body + "</body>\n</html>\n", encoding="utf-8")
    print("dist/gas-incident-insurance.html ساخته شد")


if __name__ == "__main__":
    build()

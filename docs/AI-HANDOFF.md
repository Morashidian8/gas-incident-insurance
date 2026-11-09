# AI-HANDOFF — راهنمای ادامه توسعه با هر هوش مصنوعی

> **برای صاحب پروژه (فارسی):** این فایل را همراه کل پوشه پروژه به هر دستیار هوش مصنوعی برنامه‌نویسی بدهید (Claude، ChatGPT/Codex، Cursor، Gemini و…) و بگویید: «اول فایل `docs/AI-HANDOFF.md` را کامل بخوان و طبق آن کار کن.» همه چیزی که برای فهمیدن، ساختن، آزمایش و انتشار سامانه لازم است این‌جاست.
>
> The rest of this file is written for an AI coding assistant. Read it fully before changing anything.

---

## 1. What this is

**Gas Incident Insurance Claims System** (سامانه بیمه حوادث مشترکین گاز) — a Persian (RTL) system for filing and tracking insurance claims after natural-gas accidents (fire, explosion, CO poisoning, leak) for gas subscribers in Iran.

Four roles share one claim:

| Role | id | Does |
|---|---|---|
| Subscriber (مشترک) | `subscriber` | Fills incident info, damages, photos, documents, IBAN (Sheba); answers deficiencies; accepts/objects to the amount; sees finance stages and receipt |
| Gas company expert (کارشناس شرکت گاز) | `gas` | Registers subscriber + creates claim (temp password by SMS); reviews; flags deficiencies per item; **must confirm the cause report states "gas"** before forwarding to insurer; answers insurer queries |
| Insurer expert (کارشناس بیمه‌گر) | `insurer` | Assesses (deductible, caps), queries gas co., runs finance stages (review → voucher → bank → paid) |
| Admin (مدیر سامانه) | `admin` | Staff users, policy settings, logo, fire-insurance offers on login page, reports, SMS log |

Flow: incident → subscriber **self-registers online** (subscription no. + Shahkar + SMS code + national card / gas bill photos; gas expert approves → account active + draft claim with those documents) — or gas co. registers them in person → subscriber submits → gas reviews / returns with deficiencies → resubmit → gas forwards to insurer (cause-report confirmation required) → insurer assesses → subscriber accepts/objects → finance stages → paid.

**The single most important document** is the fire-department or official court expert report that explicitly states the cause was gas (`cause_report`). There is **no gas-company site visit** — do not reintroduce one.

## 2. Two deliveries, one codebase

1. **Browser-only app** (`index.html`, `site.html`, `js/`, `css/`): all data in the browser (localStorage + IndexedDB). Demo / presentation only — data is NOT shared between devices or users.
2. **WordPress plugin** (`wordpress/gas-incident-insurance/`): real multi-user server. Same front-end JS (bundled into `assets/app.js`), data via REST API `gii/v1`. This is the production path (needs a host + domain + HTTPS).

The same front-end has two faces: `data-mode="app"` (installable mobile PWA, bottom nav, sheets) and `data-mode="site"` (desktop website with header, landing page). Mode is read from `<html data-mode>`.

## 3. File map

```
index.html, site.html        entry pages (app / site) for local dev with ES modules
manifest.webmanifest, sw.js  PWA
js/workflow.js   PURE business rules, no DOM: statuses, actions & guards, required documents,
                 validations (national id checksum, Sheba mod-97, Jalali calendar), payable
                 computation (deductible, caps), finance stages, report helpers, CSV.
                 Mirrored 1:1 in wordpress/.../includes/workflow.php — KEEP BOTH IN SYNC.
js/store.js      Local DB (localStorage + IndexedDB files), demo seed (7 scenario claims +
                 40 archive claims via archiveSpecs()). DB_VERSION bump = reseed browsers.
js/backend-local.js  Backend interface implemented on store.js
js/backend-wp.js     Same interface over REST (nonce, debounced saves, flush before actions)
js/app.js        All UI: views per role, sheets, forms (FORMS), actions (ACTS), reports,
                 charts, exports, print report, fire offers, motion. `const B = window.GII_WP ? WPB : LOCAL`
js/icons.js      Hand-made line icons icon(), duotone icons duo(), illustrations illo(), brandMark()
css/app.css      Design tokens (top) + components. Visual system spec: docs/VISUAL.md
assets/          logo.png (NIGC), fonts/ (Vazirmatn, Lalezar — OFL, local, offline)
icons/           PWA icons
tools/build_single.py  Bundles modules into one script (imports → consts), outputs dist/pwa
                       (app at /, site at /site/) + single-file HTMLs in dist/
tools/build_wp.py      Copies bundle into plugin assets, zips plugin, writes Playground blueprint
tools/build_secure.py  Encrypted single-file presentation build (see §8)
wordpress/gas-incident-insurance/
  gas-incident-insurance.php  plugin bootstrap, roles, CPTs, pages /gii-site/ /gii-app/, PWA routes
  includes/workflow.php  PHP port of js/workflow.js (server enforces ALL rules)
  includes/rest.php      REST routes + permission checks + sanitization
  includes/store.php     claim storage (CPT gii_claim, JSON in meta), private files dir with random key
  includes/seed.php      demo data (same as js/store.js, archive_specs() identical to archiveSpecs())
  includes/sms.php       SMS providers: log | kavenegar | melipayamak
  includes/admin.php     wp-admin settings page
  templates/canvas.php   blank page template hosting the app
tests/workflow.test.mjs      Node unit tests for js/workflow.js
wordpress/tests/workflow-test.php  PHP unit tests for workflow.php (same scenarios)
tests/e2e/                   Playwright end-to-end scripts (see tests/e2e/README.md)
docs/DESIGN.md        domain/business design (workflow, documents, SLA, finance, reports)
docs/DESIGN-BRIEF.md  full feature list per screen (what must not be lost)
docs/VISUAL.md        visual design system (tokens, components, layout)
dist/                 BUILT output (committed; CI rebuilds) — never edit by hand
```

## 4. Commands

Requirements: Node 22+, Python 3.10+, PHP 8.x (for plugin tests/lint).

```bash
npm test                                   # JS unit tests (node --test)
php wordpress/tests/workflow-test.php      # PHP unit tests
for f in $(find wordpress -name '*.php'); do php -l "$f"; done   # PHP lint

# Build (ALWAYS in this order — build_single wipes dist/pwa, build_wp adds /wp/ into it)
python3 tools/build_single.py --logo assets/logo.png --org "شرکت ملی گاز ایران"
python3 tools/build_wp.py     --logo assets/logo.png --org "شرکت ملی گاز ایران"

# Run locally (browser-only version)
python3 -m http.server 8770 -d dist/pwa    # app: http://localhost:8770/  site: /site/
# or during development with ES modules directly: python3 -m http.server 8000  → /index.html
```

CI: `.github/workflows/pages.yml` runs tests + PHP lint, builds, deploys `dist/pwa` to GitHub Pages on every push to `main`. The WordPress Playground blueprint is published at `<pages-url>/wp/blueprint.json` (open `https://playground.wordpress.net/?blueprint-url=<that url>` to try the plugin in a browser with no hosting).

## 5. Rules you must follow when changing things

1. **Business rules live in `workflow.js` AND `workflow.php`.** Any rule change goes into both, plus a test in both `tests/workflow.test.mjs` and `wordpress/tests/workflow-test.php`. The server must enforce every rule (never trust the client).
2. **Demo seed is duplicated** in `js/store.js` and `includes/seed.php`. `archiveSpecs()` and `archive_specs()` must produce identical data. After changing the browser seed, bump `DB_VERSION` in store.js.
3. **New UI uses existing tokens and components** (css/app.css top, docs/VISUAL.md). No decorative gradients; flame orange (`--fl`) only for incident / cause-report things; status colors only for status.
4. **Persian UI:** RTL, Persian digits in display (`fa()`), Jalali dates (`W.jalaliString`, `W.parseJalali`), amounts in Rial with thousands separators. Inputs accept Persian or Latin digits (`W.normalizeDigits`). Latin identifiers (Sheba, codes) are `dir="ltr"`.
5. **Don't edit `dist/` or `wordpress/.../assets/app.js|app.css` by hand** — they are build outputs.
6. **Security in the plugin:** every REST route checks role and claim ownership; sanitize every field (see `rest.php` helpers `txt`, `area`, `digits`, `int`, `pick`); private files are served only through the API; login lockout and OTP rate limits exist — keep them.
7. **Accessibility:** labels on inputs, `aria-label` on icon buttons, focus visible, Esc closes sheets, `prefers-reduced-motion` respected.
8. **Download filenames are Latin** (some browsers turn Persian names into "download").
9. **Charts** use the validated palette `--s1..--s4` (fixed color per incident type: co=s1 blue, fire=s2 orange, leak=s3 aqua, explosion=s4 yellow). Never color a series by rank.
10. Verify UI changes in a real browser at 390px and 1440px width, light and dark.

## 5b. Online self-registration

- Endpoints (`rest.php`): `signup/start` (validate, block list, rate limits, Shahkar via `includes/shahkar.php`, send OTP), `signup/verify`, `signup/submit` (multipart: `data` JSON + `national_card[]`, `bill[]`, `proof[]`), `regs/me` (resubmit after "needs fix"), `regs/<uid>/review` (approve | fix | reject | spam), `regs/<uid>/files/<fid>`.
- Storage: the registration lives on the pending user (`gii_reg` user meta / `user.reg` in the browser version); files in `<private dir>/reg-<uid>/`. On approval they are copied into the claim (`REG_DOC_TO_CLAIM`).
- Rules: `signupIssues` / `signupFinalIssues` / `regDocsNeeded` in workflow.js and workflow.php.
- Shahkar modes (wp-admin → بیمه حوادث گاز): off, demo (mobiles ending 0000 mismatch), http (provider URL + key; adapt `GII_Shahkar::http()` to the provider's API).
- A subscriber whose `reg.status` is not `approved` sees only the request-status page.

## 6. Key data shapes (claim)

```js
{ id, code: 'GZ-1405-000012', subscriberId, createdBy, createdAt, status, statusAt, submitCount,
  incident: { date:'1405/07/28', time, type:'fire|explosion|co|leak', placeType, address, postalCode,
              description, causeIssuer:'fire|expert', causeReportNo, causeReportDate, causeStatesGas:boolean,
              policeReportNo },
  damage: { kinds:['property','medical','death'], items:[{title,qty,amount}], injured:[...], deceased:[...] },
  photos:[fileId], docs:{ docTypeId:[fileId] }, files:{ fileId:{name,type,size,at,by} },
  bank:{ sheba, holder, bankName }, declaration,
  deficiencies:[{ id, target:'doc:<id>'|'section:<id>'|'general', title, note, by, status:'open|closed', reply }],
  messages:[{ id, at, by, byId, role, text, internal }],
  timeline:[{ at, by, role, action, label, note }],
  forwardedAt, causeCheck:{by,at}, assessment:{ adjuster, visitDate, note, items:[{category,title,claimed,approved}] },
  objection, acceptedAt, finance:{ stage, review, voucher, bank }, payment:{ amount, ref, date }, paidAt }
```

Statuses: draft, returned, submitted, gas_review, sent_insurer, insurer_review, insurer_query, assessed, objection, payment, paid, rejected (see `STATUS` and `ACTIONS` in workflow.js).

## 7. Demo accounts (demo mode only)

Subscribers `1023456789`, `1045678912`, `1067891234`, `1024681357`, pending online registration `1056781234` / `123456` · gas `gas` / `gas123` · insurer `bime` / `bime123` · admin `admin` / `admin123` (in WordPress the admin login is `modir` / `admin123`). Demo mode wipes all data — never enable it on a real server.

## 8. Encrypted presentation file

`tools/build_secure.py` makes a single offline HTML: AES-256-GCM (PBKDF2-SHA256, 310k iterations), WebCrypto with a pure-JS fallback, expiry date, clock-rollback check, watermark, copy/print/devtools-key blocking, phone frame on desktop. Needs `pip install cryptography` and a `terser` binary:

```bash
npm i -g terser
python3 tools/build_secure.py --password 'XXXX-XXXX-XXXX' --days 30 --name 'Recipient' --terser "$(which terser)" --out presentation.html
```

Passwords are never stored in the repository. It deters copying; it cannot make extraction impossible.

## 9. Ideas not done yet

- SMS OTP templates (pattern messages) once an SMS provider is chosen.
- Real fire-insurance offers (insurer names, rates, purchase URLs) — admin enters them in Settings.
- Per-recipient watermarked presentation builds.
- Hosting: Iranian host recommended for personal/banking data, daily backups of DB + `wp-content/uploads`.

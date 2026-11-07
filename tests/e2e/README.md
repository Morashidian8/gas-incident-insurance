# End-to-end tests (Playwright)

Run from the repository root after `npm i -D playwright && npx playwright install chromium`.

## Browser-only app — `app-reports.mjs`
Fire-insurance offers, admin settings validation, reports dashboard, monthly report, Excel/HTML exports, profile sheet.

```bash
python3 tools/build_single.py --logo assets/logo.png --org "شرکت ملی گاز ایران"
python3 -m http.server 8770 -d dist/pwa &
node tests/e2e/app-reports.mjs            # APP_BASE=http://localhost:8770/ by default
```

## WordPress plugin, 4 users — `wp-flow.mjs`
Site landing, password reset by SMS code, subscriber fixes deficiencies and uploads, gas reviews and forwards (cause confirmation required), insurer assesses, subscriber accepts, insurer finance stages and payment, admin SMS log.

Local WordPress without hosting (SQLite, PHP built-in server):

1. Put a WordPress copy with the SQLite integration plugin in `tests/e2e/wp-local/wp` (e.g. from the npm package `@wp-playground/wordpress-builds`, or WordPress + `sqlite-database-integration`).
2. Symlink the plugin: `ln -s ../../../../wordpress/gas-incident-insurance tests/e2e/wp-local/wp/wp-content/plugins/gas-incident-insurance`
3. `php tests/e2e/wp-local/install.php && php tests/e2e/wp-local/activate.php` (activates the plugin, turns demo mode on, seeds data)
4. `cd tests/e2e/wp-local && php -S localhost:8888 -t wp router.php &`
5. `node tests/e2e/wp-flow.mjs` (WP_BASE=http://localhost:8888 by default)

Or test in the browser with no installation at all: WordPress Playground with `dist/pwa/wp/blueprint.json` (see docs/AI-HANDOFF.md §4).

Screenshots and downloads go to `tests/e2e/out/` (git-ignored).

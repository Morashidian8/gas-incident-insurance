// آیکون‌های خطی ۲۴×۲۴ و تصویرسازی کاشی‌ها — همه دست‌ساز و بدون وابستگی.

const P = {
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  help: '<circle cx="12" cy="12" r="0" /><path d="M9.2 9.3a2.9 2.9 0 1 1 3.9 2.7c-.7.3-1.1.9-1.1 1.6v.7"/><circle cx="12" cy="17.3" r=".4" fill="currentColor"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M10 20.5v-5.5h4v5.5"/>',
  send: '<path d="M20.5 4.5 3.8 10.8l6.8 2.6 2.6 6.8z"/><path d="m10.6 13.4 4.6-4.6"/>',
  user: '<circle cx="12" cy="9" r="3.6"/><path d="M5 19.5c1.4-3 4-4.3 7-4.3s5.6 1.3 7 4.3"/><circle cx="12" cy="12" r="9.2"/>',
  chevL: '<path d="m14.5 6-6 6 6 6"/>',
  chevR: '<path d="m9.5 6 6 6-6 6"/>',
  chevD: '<path d="m6 9.5 6 6 6-6"/>',
  building: '<path d="M4 20.5h16M5.5 20.5v-9M9.5 20.5v-9M14.5 20.5v-9M18.5 20.5v-9M3.5 11.5h17L12 5z"/>',
  people: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M15.8 14.6c2.3 0 4 1.3 4.7 3.9"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.3 2.6-5 3.4-8.4 2.4 1.4 3.4 3.4 3.3 5.2 1-.6 1.6-1.6 1.8-2.8 2 1.6 3.5 3.6 3.5 6 0 3.2-2.4 5.6-6 5.6z"/><path d="M12 21c-1.5 0-2.5-1-2.5-2.4 0-1.5 1.3-2.3 2.5-3.8 1.2 1.5 2.5 2.3 2.5 3.8S13.5 21 12 21z"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.7-7 9-4.1-1.3-7-4.6-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  doc: '<path d="M7 3.5h7l4.5 4.5v11A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h5"/>',
  camera: '<path d="M4.5 8h3l1.6-2.5h5.8L16.5 8h3A1.5 1.5 0 0 1 21 9.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9.5A1.5 1.5 0 0 1 4.5 8z"/><circle cx="12" cy="13.5" r="3.4"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17.5 5-4.5 3.5 3 3-2.5 4.5 3.5"/>',
  bank: '<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M3 10h18M6.5 15h4"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/><path d="M8 9h8M8 12.3h5"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="5" cy="6.5" r=".6" fill="currentColor"/><circle cx="5" cy="12" r=".6" fill="currentColor"/><circle cx="5" cy="17.5" r=".6" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkC: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16.2 9.5"/>',
  x: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
  alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.8" r=".5" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.5V12l3 2"/>',
  upload: '<path d="M12 15.5V5M7.5 9.5 12 5l4.5 4.5"/><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
  logout: '<path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7"/><path d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx=".8"/><rect x="10.5" y="6.5" width="3" height="11" rx=".8"/><rect x="15.5" y="13.5" width="3" height="4" rx=".8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-12"/>',
  eye: '<path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>',
  money: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  sms: '<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.2"/><path d="M10.5 18h3M9 7.5h6M9 10.5h4"/>',
  userPlus: '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 19.5c1.2-3.2 3.6-4.6 6.5-4.6 1.3 0 2.5.3 3.5.8M18 13.5v6M15 16.5h6"/>',
  inbox: '<path d="M4 13.5 6.3 6A1.5 1.5 0 0 1 7.7 5h8.6a1.5 1.5 0 0 1 1.4 1L20 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/><path d="M4 13.5h4.5l1.2 2.2h4.6l1.2-2.2H20"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.8V9h4.2M12 8v4.3l2.8 1.7"/>',
  meter: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><rect x="7.5" y="6.5" width="9" height="4" rx=".8"/><circle cx="12" cy="15.5" r="2.3"/>',
  edit: '<path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m13.5 8.5 3 3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  support: '<path d="M5 13.5V12a7 7 0 0 1 14 0v1.5"/><rect x="3.5" y="13" width="3.5" height="5.5" rx="1.4"/><rect x="17" y="13" width="3.5" height="5.5" rx="1.4"/><path d="M19 18.5c0 1.5-1.5 2.3-4 2.3"/>',
  swap: '<path d="M7 4.5 4 7.5l3 3M4 7.5h12M17 13.5l3 3-3 3M20 16.5H8"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  pause: '<rect x="7" y="5.5" width="3.4" height="13" rx="1"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1"/>',
  play: '<path d="M16.5 6v12L7.5 12z" fill="currentColor"/>',
  receipt: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  refresh: '<path d="M19.5 11A7.5 7.5 0 0 0 6.2 7.2L4.5 9M4.5 13a7.5 7.5 0 0 0 13.3 3.8l1.7-1.8"/><path d="M4.5 4.8V9h4.2M19.5 19.2V15h-4.2"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ----- تصویرسازی کاشی‌ها -----
// a: رنگ اصلی، b: رنگ دوم. اشیاء سفید با خط تیره و لکه‌های رنگی پشت سر، مثل نمونه.
const INK = 'var(--illo-ink)';
const W = 'var(--illo-paper)';
function frame(inner, a, b) {
  return `<svg class="illo" viewBox="0 0 140 110" aria-hidden="true" fill="none" stroke-linejoin="round" stroke-linecap="round">
  <circle cx="44" cy="52" r="34" fill="${a}" opacity=".16"/>
  <circle cx="98" cy="40" r="22" fill="${b}" opacity=".9"/>
  <circle cx="102" cy="82" r="14" fill="${a}" opacity=".85"/>
  ${inner}</svg>`;
}
const sheet = (x, y, w, h, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${W}" stroke="${INK}" stroke-width="2.2"/>${extra}`;
const lines = (x, y, w, n, gap = 7, c = 'var(--illo-line)') =>
  Array.from({ length: n }, (_, i) => `<path d="M${x} ${y + i * gap}h${i % 2 ? w * 0.7 : w}" stroke="${c}" stroke-width="3"/>`).join('');

const ILLO = {
  folderUp: (a, b) => frame(`
    ${sheet(52, 18, 42, 52, lines(59, 30, 26, 3))}
    <path d="M36 44h22l6 6h38a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H40a4 4 0 0 1-4-4z" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="72" cy="67" r="10" fill="${W}" stroke="${a}" stroke-width="2.4"/>
    <path d="M72 72v-10M67.5 66 72 61.5l4.5 4.5" stroke="${a}" stroke-width="2.4"/>`, a, b),

  trackRial: (a, b) => frame(`
    ${sheet(34, 14, 50, 64, lines(42, 28, 30, 4))}
    <path d="M34 66c-8 0-10 14 2 14h26" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="86" cy="62" r="17" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="86" cy="62" r="12" stroke="${a}" stroke-width="2"/>
    <text x="86" y="66.5" font-size="11" text-anchor="middle" fill="${a}" stroke="none" font-family="Vazirmatn, Tahoma" font-weight="700">ریال</text>
    <path d="m74 74-9 9" stroke="${INK}" stroke-width="5"/><path d="m74 74-9 9" stroke="${W}" stroke-width="2"/>`, a, b),

  houseFire: (a, b) => frame(`
    <path d="M30 52 64 26l34 26v32a3 3 0 0 1-3 3H33a3 3 0 0 1-3-3z" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <rect x="42" y="58" width="16" height="16" rx="2" stroke="${INK}" stroke-width="2"/>
    <path d="M72 87V64h14v23" stroke="${INK}" stroke-width="2"/>
    <path d="M104 58c-9 0-15-6-15-14 0-8 7-11 8-20 6 4 9 9 8 14 3-2 4-4 5-7 5 4 9 9 9 14 0 8-6 13-15 13z" fill="#f08a3c" stroke="${INK}" stroke-width="2.2"/>
    <path d="M104 58c-3.5 0-6-2.3-6-5.6 0-3.4 3-5.2 6-9 3 3.8 6 5.6 6 9 0 3.3-2.5 5.6-6 5.6z" fill="#ffd36b"/>`, a, b),

  camera: (a, b) => frame(`
    ${sheet(58, 16, 40, 34, `<path d="m62 44 10-10 8 7 6-5 8 8" stroke="${a}" stroke-width="2.2"/><circle cx="70" cy="26" r="3" fill="${b}"/>`)}
    <path d="M30 44h12l5-8h22l5 8h12a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V48a4 4 0 0 1 4-4z" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="58" cy="62" r="12" fill="${W}" stroke="${INK}" stroke-width="2.2"/><circle cx="58" cy="62" r="6" fill="${a}"/>
    <circle cx="80" cy="52" r="2" fill="${INK}"/>`, a, b),

  docsCheck: (a, b) => frame(`
    ${sheet(46, 20, 44, 58)}
    ${sheet(38, 26, 44, 58, lines(46, 40, 26, 4))}
    <circle cx="86" cy="76" r="13" fill="${a}" stroke="${INK}" stroke-width="2.2"/>
    <path d="m80 76 4.5 4.5 7.5-8" stroke="${W}" stroke-width="2.8"/>`, a, b),

  bank: (a, b) => frame(`
    <rect x="28" y="34" width="70" height="46" rx="7" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M28 46h70" stroke="${INK}" stroke-width="2.2"/><rect x="36" y="55" width="13" height="10" rx="2" fill="${b}"/>
    <path d="M36 72h28" stroke="var(--illo-line)" stroke-width="3"/>
    <path d="M100 52 114 57v11c0 9-6 15-14 18-8-3-14-9-14-18V57z" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <path d="m94 68 4.5 4.5 7.5-8" stroke="${a}" stroke-width="2.6"/>`, a, b),

  chat: (a, b) => frame(`
    <path d="M28 26h52a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H48l-12 10V64h-8a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6z" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    ${lines(34, 38, 40, 3)}
    <path d="M110 48H74a5 5 0 0 0-5 5v20a5 5 0 0 0 5 5h22l10 8v-8h4a5 5 0 0 0 5-5V53a5 5 0 0 0-5-5z" fill="${a}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="82" cy="63" r="2.4" fill="${W}"/><circle cx="92" cy="63" r="2.4" fill="${W}"/><circle cx="102" cy="63" r="2.4" fill="${W}"/>`, a, b),

  userPlus: (a, b) => frame(`
    <rect x="26" y="28" width="74" height="50" rx="7" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="48" cy="48" r="8" fill="${b}" stroke="${INK}" stroke-width="2"/>
    <path d="M36 70c2-7 7-10 12-10s10 3 12 10" stroke="${INK}" stroke-width="2"/>
    ${lines(66, 44, 24, 3)}
    <circle cx="100" cy="78" r="13" fill="${a}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M100 71.5v13M93.5 78h13" stroke="${W}" stroke-width="2.8"/>`, a, b),

  inbox: (a, b) => frame(`
    ${sheet(46, 16, 40, 40, lines(53, 27, 24, 3))}
    <path d="M28 56 36 40h68l8 16v24a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4z" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M28 56h22l4 8h32l4-8h22" stroke="${INK}" stroke-width="2.2"/>
    <path d="M54 64h32l4-8h22v24a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4V56h22z" fill="${a}" opacity=".25"/>`, a, b),

  alertDoc: (a, b) => frame(`
    ${sheet(34, 16, 50, 66, lines(42, 30, 30, 5))}
    <path d="M92 44 114 82H70z" fill="${b}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M92 57v12" stroke="${INK}" stroke-width="2.8"/><circle cx="92" cy="75" r="1.8" fill="${INK}"/>`, a, b),

  sendShield: (a, b) => frame(`
    <path d="M58 24 84 33v20c0 16-11 26-26 31-15-5-26-15-26-31V33z" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M47 54 55 62 70 46" stroke="${a}" stroke-width="3"/>
    <path d="M116 40 78 56l15 5 5 15z" fill="${b}" stroke="${INK}" stroke-width="2.2"/>
    <path d="m93 61 10-10" stroke="${INK}" stroke-width="2.2"/>`, a, b),

  payment: (a, b) => frame(`
    <ellipse cx="58" cy="78" rx="24" ry="7" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M34 78v-8c0 4 11 7 24 7s24-3 24-7v8" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <ellipse cx="58" cy="62" rx="24" ry="7" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M34 62v8c0 4 11 7 24 7s24-3 24-7v-8" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <ellipse cx="58" cy="62" rx="24" ry="7" fill="${b}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="96" cy="40" r="15" fill="${a}" stroke="${INK}" stroke-width="2.2"/>
    <path d="m89 40 5 5 9-9.5" stroke="${W}" stroke-width="3"/>`, a, b),

  chart: (a, b) => frame(`
    <rect x="28" y="20" width="80" height="64" rx="7" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <rect x="40" y="52" width="10" height="22" rx="2" fill="${b}"/>
    <rect x="56" y="38" width="10" height="36" rx="2" fill="${a}"/>
    <rect x="72" y="46" width="10" height="28" rx="2" fill="${b}"/>
    <rect x="88" y="30" width="10" height="44" rx="2" fill="${a}"/>`, a, b),

  gear: (a, b) => frame(`
    <g transform="translate(62 56)">
      <path d="M-6-30h12l2 8 7 3 7-4 8 8-4 7 3 7 8 2v12l-8 2-3 7 4 7-8 8-7-4-7 3-2 8H-6l-2-8-7-3-7 4-8-8 4-7-3-7-8-2V-6l8-2 3-7-4-7 8-8 7 4 7-3z" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
      <circle r="10" fill="${a}" stroke="${INK}" stroke-width="2.2"/>
    </g>`, a, b),

  people: (a, b) => frame(`
    <circle cx="52" cy="42" r="12" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M30 82c3-14 12-20 22-20s19 6 22 20z" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="88" cy="48" r="10" fill="${a}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M70 84c2-11 10-17 18-17s16 6 18 17z" fill="${a}" stroke="${INK}" stroke-width="2.2"/>`, a, b),

  meter: (a, b) => frame(`
    <rect x="36" y="18" width="52" height="70" rx="7" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <rect x="44" y="28" width="36" height="16" rx="3" fill="${b}" stroke="${INK}" stroke-width="2"/>
    <path d="M50 36h3M56 36h3M62 36h3M68 36h3" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="62" cy="64" r="11" stroke="${INK}" stroke-width="2.2"/>
    <path d="M62 64l6-6" stroke="${a}" stroke-width="2.6"/>
    <path d="M100 74c-6 0-10-4-10-9 0-5 5-7 5-13 4 3 6 6 5 9 2-1 3-3 3-5 4 3 7 6 7 9 0 5-4 9-10 9z" fill="#4c8fe8" stroke="${INK}" stroke-width="2.2"/>`, a, b),

  timeline: (a, b) => frame(`
    <path d="M44 22v66" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="44" cy="30" r="7" fill="${a}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="44" cy="55" r="7" fill="${b}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="44" cy="80" r="7" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <rect x="58" y="22" width="48" height="16" rx="5" fill="${W}" stroke="${INK}" stroke-width="2"/>
    <rect x="58" y="47" width="40" height="16" rx="5" fill="${W}" stroke="${INK}" stroke-width="2"/>
    <rect x="58" y="72" width="44" height="16" rx="5" fill="${W}" stroke="${INK}" stroke-width="2" stroke-dasharray="4 4"/>`, a, b),

  sms: (a, b) => frame(`
    <rect x="44" y="14" width="40" height="76" rx="8" fill="${W}" stroke="${INK}" stroke-width="2.2"/>
    <path d="M58 82h12" stroke="${INK}" stroke-width="2.4"/>
    <rect x="50" y="28" width="28" height="16" rx="5" fill="${a}"/>
    <rect x="50" y="50" width="22" height="12" rx="5" fill="${b}"/>
    <path d="M96 30c6 4 6 14 0 18M102 24c10 7 10 23 0 30" stroke="${INK}" stroke-width="2.2"/>`, a, b),
};

export function illo(name, a = 'var(--blue)', b = 'var(--green)') {
  return (ILLO[name] || ILLO.docsCheck)(a, b);
}

// نشان سامانه: سپر با شعله آبی گاز
export function brandMark(size = 40) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="22" fill="#fff"/>
    <circle cx="24" cy="24" r="19" fill="none" stroke="var(--green)" stroke-width="2.4"/>
    <path d="M24 9.5 35 13.5v9c0 7.3-4.7 12.6-11 14.8-6.3-2.2-11-7.5-11-14.8v-9z" fill="var(--green)"/>
    <path d="M24 32c-3.4 0-5.6-2.2-5.6-5.2 0-3.1 2.4-4.6 3.2-7.8 2.2 1.3 3.2 3.2 3 4.8 1-.6 1.5-1.5 1.7-2.6 1.9 1.5 3.3 3.4 3.3 5.6 0 3-2.2 5.2-5.6 5.2z" fill="#fff"/>
    <path d="M24 32c-1.4 0-2.3-.9-2.3-2.2 0-1.4 1.2-2.1 2.3-3.5 1.1 1.4 2.3 2.1 2.3 3.5 0 1.3-.9 2.2-2.3 2.2z" fill="#4c8fe8"/>
  </svg>`;
}

import { chromium } from 'playwright';

const URL = process.env.JAGA_URL ?? 'https://jaga-eta.vercel.app';
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- overlay helpers injected into the page ----
const injectOverlay = async (page) => {
  await page.addStyleTag({ content: `
    #jv-cap{position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;justify-content:center;pointer-events:none;padding:0 0 34px}
    #jv-cap .inner{max-width:80%;background:rgba(12,22,30,.92);color:#fff;font:600 22px/1.4 ui-sans-serif,system-ui,Segoe UI,sans-serif;
      padding:14px 26px;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);opacity:0;transform:translateY(14px);
      transition:opacity .45s ease,transform .45s ease;border:1px solid rgba(45,212,191,.35);text-align:center}
    #jv-cap.show .inner{opacity:1;transform:translateY(0)}
    #jv-cap .inner b{color:#2dd4bf}
    #jv-card{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
      background:linear-gradient(160deg,#0b1620,#0a1410);color:#fff;opacity:0;transition:opacity .6s ease;text-align:center;font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif}
    #jv-card.show{opacity:1}
    #jv-card img{width:120px;height:120px;border-radius:26px;box-shadow:0 18px 60px rgba(45,212,191,.25)}
    #jv-card h1{font-size:54px;margin:6px 0 0;letter-spacing:-.02em}
    #jv-card .accent{background:linear-gradient(100deg,#0ea5a4,#2dd4bf);-webkit-background-clip:text;background-clip:text;color:transparent}
    #jv-card p{font-size:22px;color:#9fb3bf;margin:0}
    #jv-card .url{font:600 18px ui-monospace,monospace;color:#2dd4bf;margin-top:10px}
  ` });
  await page.evaluate(() => {
    const cap = document.createElement('div'); cap.id = 'jv-cap'; cap.innerHTML = '<div class="inner"></div>';
    document.body.appendChild(cap);
    const card = document.createElement('div'); card.id = 'jv-card'; document.body.appendChild(card);
  });
};
const caption = async (page, html) => {
  await page.evaluate((h) => {
    const c = document.querySelector('#jv-cap'); c.classList.remove('show');
    setTimeout(() => { c.querySelector('.inner').innerHTML = h; c.classList.add('show'); }, 200);
  }, html);
};
const hideCaption = async (page) => page.evaluate(() => document.querySelector('#jv-cap').classList.remove('show'));
const card = async (page, html, show) => page.evaluate(({ h, s }) => {
  const el = document.querySelector('#jv-card'); if (h !== null) el.innerHTML = h; el.classList.toggle('show', s);
}, { h: html, s: show });
const scrollTo = async (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
}, sel);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-device-scale-factor=1', '--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: 'out', size: { width: W, height: H } } });
  const page = await ctx.newPage();
  console.log('goto', URL);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await injectOverlay(page);
  await sleep(800);

  // ---- INTRO CARD ----
  await card(page, `<img src="/logo.png"><h1>Jaga</h1><p>PLP yield, <span class="accent">minus the crash.</span></p>`, true);
  await sleep(3200);
  await card(page, null, false);
  await sleep(900);

  // ---- HERO ----
  await caption(page, `An automated vault on <b>DeepBook Predict</b>`);
  await sleep(3200);
  await caption(page, `PLP yield, plus a built-in <b>crash hedge</b> — one composable token.`);
  await sleep(3600);

  // ---- PROBLEM ----
  await scrollTo(page, '#why'); await sleep(1100);
  await caption(page, `On Predict, <b>PLP holders are “the house.”</b>`);
  await sleep(3200);
  await caption(page, `Calm markets pay premium — but a <b>crash</b> hits PLP with a brutal left tail.`);
  await sleep(3800);

  // ---- HOW IT WORKS ----
  await scrollTo(page, '#how'); await sleep(1100);
  await caption(page, `Jaga’s fix: <b>two legs, one token.</b>`);
  await sleep(3000);
  await caption(page, `<b>Leg 1</b> — supply dUSDC to PLP, earn yield. Fully trustless.`);
  await sleep(3600);
  await caption(page, `<b>Leg 2</b> — buy OTM-DOWN binaries as crash insurance, auto-rolled by a keeper.`);
  await sleep(4000);

  // ---- SIMULATION ----
  await scrollTo(page, '#sim'); await sleep(1200);
  await caption(page, `Proof: a <b>30,000-path</b> Monte-Carlo backtest.`);
  await sleep(3400);
  await caption(page, `CVaR-1% goes <b>−54% → −38%</b> — the crash tail cut ~16 points…`);
  await sleep(4000);
  await caption(page, `…for only <b>~1% of yield</b> given up.`);
  await sleep(3400);

  // ---- VAULT (live) ----
  await scrollTo(page, '#app'); await sleep(1200);
  await caption(page, `And it’s <b>live on Sui testnet</b> — real NAV, real PLP price.`);
  await sleep(3600);
  await caption(page, `Deposit dUSDC, receive <b>jSHARE</b>. One click in, one token out.`);
  await sleep(3800);

  // ---- ROADMAP ----
  await scrollTo(page, '#roadmap'); await sleep(1100);
  await caption(page, `Next: <b>dynamic hedge ratio</b>, multi-asset, jSHARE as collateral.`);
  await sleep(3800);
  await hideCaption(page); await sleep(600);

  // ---- OUTRO CARD ----
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(800);
  await card(page, `<img src="/logo.png"><h1><span class="accent">Jaga</span></h1><p>Making being “the house” survivable.</p><div class="url">jaga-eta.vercel.app</div>`, true);
  await sleep(3800);

  await ctx.close(); // flush video
  await browser.close();
  console.log('done — video in video/out');
})().catch((e) => { console.error(e); process.exit(1); });

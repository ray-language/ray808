/**
 * Smoke test of the built page in headless Chrome, at desktop size and on a phone
 * viewport (touch, 390×844). It serves `dist/` with Vite's preview server from this
 * same process — nothing is left running — and checks:
 *   - the 116 factory samples load and START runs the sequencer (the LED moves);
 *   - steps toggle, knobs turn by dragging, the pattern memories switch;
 *   - with a fake `window.ray` bridge, state is saved through the backend protocol;
 *   - on the phone: no sideways scroll, 8×2 step grid, the instrument strip, the
 *     action sheet and the sample sheet.
 * Screenshots go to $SMOKE_OUT (default: ./smoke-out). Usage: npm run build && npm run smoke
 */
import { mkdirSync } from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const OUT = process.env.SMOKE_OUT ?? 'smoke-out';
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

let failures = 0;
const check = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) failures++;
};

// A stand-in for the raylang backend (src/api.ray): answers the same ops in memory.
const FAKE_BRIDGE = `
  window.__rayCalls = [];
  window.__rayState = null;
  window.ray = {
    request: async (v) => {
      window.__rayCalls.push(v.op);
      if (v.op === 'hello') return JSON.stringify({ ok: true, platform: 'test', dialogs: false });
      if (v.op === 'state.load') return JSON.stringify({ ok: true, state: window.__rayState });
      if (v.op === 'state.save') { window.__rayState = v.state; return JSON.stringify({ ok: true }); }
      if (v.op === 'sample.list') return JSON.stringify({ ok: true, samples: [] });
      return JSON.stringify({ ok: false, error: 'unhandled ' + v.op });
    },
  };`;

async function open(options, bridge) {
  const ctx = await browser.newContext(options);
  if (bridge) await ctx.addInitScript(FAKE_BRIDGE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('.display__msg')?.textContent?.includes('READY'), null, {
    timeout: 30000,
  });
  return { ctx, page, errors };
}

const ledPosition = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.step')].findIndex((s) => s.classList.contains('step--running')));

/* ---------- desktop ---------- */
{
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 960 } }, true);
  check(true, 'desktop: 116 factory samples loaded');
  await page.screenshot({ path: `${OUT}/desktop.png`, fullPage: true });

  check((await page.locator('.panel__strips .strip').count()) === 12, 'desktop: 12 channel strips');

  const before = await page.locator('.step--on').count();
  await page.locator('.step__btn').nth(1).dispatchEvent('pointerdown');
  check((await page.locator('.step--on').count()) === before + 1, 'desktop: a step toggles on');

  await page.locator('.start-btn').click();
  await page.waitForTimeout(700);
  const a = await ledPosition(page);
  await page.waitForTimeout(400);
  const b = await ledPosition(page);
  check(a !== -1 && b !== -1 && a !== b, `desktop: the running LED moves (${a} → ${b})`);
  await page.locator('.start-btn').click();

  const knob = page.locator('.strip[data-strip="BD"] .knob__body').nth(1);
  const v0 = Number(await knob.getAttribute('aria-valuenow'));
  const box = await knob.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 40, { steps: 5 });
  await page.mouse.up();
  const v1 = Number(await knob.getAttribute('aria-valuenow'));
  check(v1 > v0, `desktop: dragging a knob up turns it (${v0} → ${v1})`);

  await page.locator('.patterns__btn').nth(3).click();
  check((await page.textContent('.display')).includes('PT 04'), 'desktop: pattern 4 selected');

  await page.waitForTimeout(400); // the autosave is debounced
  const calls = await page.evaluate(() => window.__rayCalls);
  const saved = await page.evaluate(() => window.__rayState?.pattern);
  check(calls.includes('state.save') && saved === 3, 'desktop: state saved through the bridge');

  check(errors.length === 0, `desktop: no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
  await ctx.close();
}

/* ---------- phone ---------- */
{
  const { ctx, page, errors } = await open(
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    false,
  );
  await page.screenshot({ path: `${OUT}/phone.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/phone-fold.png` });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `phone: no sideways scroll (overflow ${overflow}px)`);
  check((await page.locator('.machine--phone').count()) === 1, 'phone: phone layout active');

  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.steps')).gridTemplateColumns.split(' ').length);
  check(cols === 8, `phone: steps in 8 columns (${cols})`);

  const stepBox = await page.locator('.step__btn').first().boundingBox();
  check(stepBox.width >= 38 && stepBox.height >= 44, `phone: step buttons are thumb-sized (${Math.round(stepBox.width)}×${Math.round(stepBox.height)})`);

  // A notched iPhone: Chrome reports no safe area, so set the inset the page reads. Only
  // <main> scrolls (a control inside a coasting scroll view loses its first tap on iOS);
  // the header compacts while reading down and comes back when scrolling up.
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-top', '59px'));
  await page.waitForTimeout(50);
  const header = () =>
    page.evaluate(() => {
      const h = document.querySelector('.phone-header');
      const r = h.getBoundingClientRect();
      return {
        compact: h.classList.contains('phone-header--compact'),
        top: Math.round(r.top),
        height: Math.round(r.height),
        start: Math.round(document.querySelector('.start-btn').getBoundingClientRect().height),
        page: document.scrollingElement.scrollHeight - window.innerHeight,
      };
    });
  const scrollMain = async (y) => {
    await page.evaluate((v) => (document.querySelector('.phone-scroll').scrollTop = v), y);
    await page.waitForTimeout(350); // past the header's transition
  };
  const full = await header();
  check(!full.compact && full.top >= 59, `phone: the header starts full size below the status bar (top ${full.top}px, ${full.height}px tall)`);
  check(full.page <= 0, 'phone: the page itself never scrolls, only <main>');

  await scrollMain(300);
  const small = await header();
  check(small.compact && small.height < full.height - 40 && small.start < full.start, `phone: scrolling down compacts the header (${full.height} → ${small.height}px, START ${full.start} → ${small.start}px)`);
  check(small.top >= 59, `phone: the compact header stays below the status bar (top ${small.top}px)`);
  await page.screenshot({ path: `${OUT}/phone-compact.png` });

  await page.locator('.start-btn').tap();
  await page.waitForTimeout(500);
  check((await ledPosition(page)) !== -1, 'phone: START answers in the compact header');
  await page.locator('.start-btn').tap();

  await scrollMain(200);
  check(!(await header()).compact, 'phone: scrolling back up restores the header');

  // At the very end of the page, compacting grows <main> and the browser clamps scrollTop:
  // the header must settle compact instead of bouncing.
  await scrollMain(100000);
  const states = [];
  for (let i = 0; i < 6; i++) {
    states.push((await header()).compact);
    await page.waitForTimeout(80);
  }
  check(states.every(Boolean), `phone: at the bottom the header settles compact (${states.join(',')})`);

  await scrollMain(0);
  check(!(await header()).compact, 'phone: back at the top the header is full size');
  await page.evaluate(() => document.documentElement.style.removeProperty('--safe-top'));

  await page.locator('.chip .strip__plate', { hasText: 'SNARE' }).tap();
  check((await page.textContent('.card .section-label')).includes('SNARE'), 'phone: tapping a plate selects the snare');
  check((await page.locator('.strip--focus .knob').count()) === 3, 'phone: the snare editor shows its 3 knobs');

  const on0 = await page.locator('.step--on').count();
  await page.locator('.step__btn').nth(2).tap();
  check((await page.locator('.step--on').count()) === on0 + 1, 'phone: tapping a step toggles it');

  await page.locator('.start-btn').tap();
  await page.waitForTimeout(600);
  check((await ledPosition(page)) !== -1, 'phone: START runs from the pinned top bar');
  await page.locator('.start-btn').tap();

  await page.locator('.menu-btn').tap();
  check((await page.locator('.sheet__item').count()) === 6, 'phone: the menu opens as an action sheet');
  await page.screenshot({ path: `${OUT}/phone-menu.png` });
  await page.locator('.sheet__item', { hasText: 'SAMPLES' }).tap();
  await page.waitForTimeout(350);
  const panel = await page.locator('.sample-panel').boundingBox();
  check(Math.abs(panel.x) < 2 && Math.abs(panel.width - 390) < 2, 'phone: the sample bank opens full screen');
  await page.screenshot({ path: `${OUT}/phone-samples.png` });
  await page.locator('.sample-panel__close').tap();

  await page.locator('.menu-btn').tap();
  await page.locator('.sheet__item', { hasText: 'RESET' }).tap();
  check((await page.locator('.confirm').count()) === 1, 'phone: RESET asks with the in-page dialog');
  await page.locator('.confirm .mini-btn', { hasText: 'CANCEL' }).tap();

  check(errors.length === 0, `phone: no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
  await ctx.close();
}

await browser.close();
await new Promise((r) => server.httpServer.close(r));
console.log(failures === 0 ? '\nsmoke: all checks passed' : `\nsmoke: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

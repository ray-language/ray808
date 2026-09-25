/**
 * Renders the app icon (assets/icon.png, 1024×1024) from HTML with headless Chrome:
 * the 808's four step colours under a glowing display. `ray bundle` derives every
 * platform size (icns, Android mipmaps, the iOS asset) from this one file.
 * Usage: node scripts/make-icon.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const html = `<!doctype html><html><body style="margin:0">
<div style="width:1024px;height:1024px;background:radial-gradient(circle at 50% 20%,#34343c,#16161a 70%);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:70px;font-family:Helvetica,Arial,sans-serif">
  <div style="font:700 250px/1 Menlo,monospace;color:#ff5340;letter-spacing:10px;
    text-shadow:0 0 30px rgba(255,83,64,.8),0 0 90px rgba(255,83,64,.45)">808</div>
  <div style="display:flex;gap:34px">
    ${['#c93b32', '#dd7327', '#e3b32d', '#e6decb']
      .map((c) => `<div style="width:150px;height:210px;border-radius:22px;background:${c};
        box-shadow:0 18px 0 rgba(0,0,0,.45),inset 0 8px 0 rgba(255,255,255,.35)"></div>`)
      .join('')}
  </div>
</div></body></html>`;

mkdirSync('../assets', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(html);
await page.screenshot({ path: '../assets/icon.png', omitBackground: false });
await browser.close();
console.log('wrote assets/icon.png');

import { chromium } from 'playwright';
const BASE = 'http://acme-demo.localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const out: string[] = [];
  document.querySelectorAll('body *').forEach((e) => {
    const cs = getComputedStyle(e);
    if ((cs.position === 'fixed') && (e as HTMLElement).offsetHeight > 0 && (e as HTMLElement).offsetHeight < 120) {
      const r = e.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 140 && r.left < 260) {
        out.push(`<${e.tagName.toLowerCase()}> id=${e.id||'-'} class=${(e.getAttribute('class')||'-').slice(0,40)} data=${e.getAttributeNames().filter(a=>a.startsWith('data-')).join(',')||'-'} txt=${(e.textContent||'').trim().slice(0,30)}`);
      }
    }
  });
  // custom elements (web components) no body
  const ce: string[] = [];
  document.querySelectorAll('*').forEach((e) => { if (e.tagName.includes('-')) ce.push(e.tagName.toLowerCase()); });
  return { fixed: [...new Set(out)], custom: [...new Set(ce)] };
});
console.log('FIXED bottom-left:', JSON.stringify(info.fixed, null, 2));
console.log('CUSTOM elements:', info.custom);
await browser.close();

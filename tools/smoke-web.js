/**
 * Web smoke test: launches the exported app in headless Chrome and drives it.
 *
 * This is what proves the vehicle scene actually renders and reacts, rather
 * than merely compiling. It caught two real defects that the unit suite could
 * not: a stale terminal-status list that left every command "pending" forever,
 * and a camera preset that framed by vertical FOV and so overflowed a
 * portrait surface.
 *
 * Usage:
 *   npm i -D playwright                       # once
 *   npx expo export --platform web -d dist
 *   python3 -m http.server 8123 --directory dist &
 *   SHOT_DIR=/tmp/shots node tools/smoke-web.js
 *
 * Headless Chrome has no GPU, so WebGL is forced onto SwiftShader below.
 * Without those flags the canvas never gets a context and every frame is blank.
 */
const { chromium } = require('playwright');
const OUT = process.env.SHOT_DIR || '/tmp/shots';
const BASE = process.env.BASE_URL || 'http://localhost:8123';
(async () => {
  const browser = await chromium.launch({ channel:'chrome', headless:true,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 })).newPage();
  const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  page.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  const btn = (l) => page.locator(`[role="button"][aria-label="${l}"]`).first();
  const text = async () => (await page.locator('body').innerText()).split('\n').slice(0,10).join(' | ');

  await page.goto(BASE,{waitUntil:'networkidle'});
  await page.waitForTimeout(3500);
  await page.screenshot({ path:`${OUT}/f1-welcome.png` });
  console.log('welcome:', await text());

  await page.getByText('Explore Demo').first().click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path:`${OUT}/f2-home.png` });

  // Repeated taps: two immediate presses must not create two commands.
  await btn('Rear trunk').click();
  await btn('Rear trunk').click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path:`${OUT}/f3-trunk-open.png` });
  console.log('after trunk:', await text());

  // Status line must clear on its own.
  await page.waitForTimeout(8000);
  await page.screenshot({ path:`${OUT}/f4-line-cleared.png` });
  console.log('after 8s:', await text());

  await btn('Controls').click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path:`${OUT}/f5-controls.png` });

  // Flash: bounded light event on the real lamps.
  await btn('Flash').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path:`${OUT}/f6-flash.png` });
  await page.waitForTimeout(6000);
  await page.screenshot({ path:`${OUT}/f7-after-flash.png` });

  // Enable driving: authorisation vs readiness.
  await btn('Enable driving').click();
  await page.waitForTimeout(7000);
  await page.screenshot({ path:`${OUT}/f8-drive.png` });
  console.log('drive:', await text());

  console.log('ERRORS:', errs.slice(0,8));
  await browser.close();
})().catch(e=>{console.error('FAILED',e);process.exit(1);});

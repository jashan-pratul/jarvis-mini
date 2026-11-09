#!/usr/bin/env node
/**
 * Samsung Galaxy A16 emulation pass using the locally installed Google Chrome.
 *
 *   node scripts/a16-check.mjs [url] [--views] [--out=dir]
 *
 * - Emulates a 393×873 CSS viewport, DPR 2.75, touch, Android Chrome UA.
 * - Taps "Touch to initialise", waits for the boot sequence to finish.
 * - Screenshots every available view, checks horizontal overflow and
 *   undersized touch targets, and fails on console errors / page errors.
 *
 * NOTE: This is emulation (desktop GPU/SwiftShader), not a real Mali-G57.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:8787/';
const outDir = (args.find((a) => a.startsWith('--out=')) ?? '--out=test-artifacts').slice(6);
const visitViews = args.includes('--views');
const extraWait = Number((args.find((a) => a.startsWith('--wait=')) ?? '--wait=0').slice(7));

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const A16 = {
  viewport: { width: 393, height: 873, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; SM-A165F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
};

fs.mkdirSync(outDir, { recursive: true });
const problems = [];
const consoleErrors = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage();
  await page.setUserAgent(A16.userAgent);
  await page.setViewport(A16.viewport);
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.screenshot({ path: path.join(outDir, '01-gate.png') });

  const gate = await page.$('button[aria-label^="Touch to initialise"]');
  if (!gate) throw new Error('Boot gate button not found');
  await gate.tap();
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: path.join(outDir, '02-init.png') });

  // Wait for the main navigation to appear (boot complete).
  await page.waitForSelector('nav[aria-label="Main navigation"]', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500 + extraWait));
  await page.screenshot({ path: path.join(outDir, '03-core.png') });

  const audit = async (label) => {
    const result = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflowX = doc.scrollWidth > window.innerWidth + 1;
      const wide = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (style.position === 'fixed' && r.width <= window.innerWidth + 1) return false;
          return r.right > window.innerWidth + 1 && r.width > 0 && style.visibility !== 'hidden';
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
      const small = [...document.querySelectorAll('button, a[href], [role="button"], input, select, textarea')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
          return r.width < 40 || r.height < 40;
        })
        .slice(0, 8)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24)}] ${Math.round(r.width)}×${Math.round(r.height)}`;
        });
      return { overflowX, wide, small, scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth };
    });
    if (result.overflowX) problems.push(`[${label}] horizontal overflow (${result.scrollWidth} > ${result.innerWidth}): ${result.wide.join(', ')}`);
    if (result.small.length) problems.push(`[${label}] touch targets < 40px: ${result.small.join('; ')}`);
  };

  await audit('core');

  if (visitViews) {
    const totalTabs = await page.$$eval('nav[aria-label="Main navigation"] button', (els) => els.length);
    let i = 4;
    for (let idx = 0; idx < totalTabs; idx++) {
      const buttons = await page.$$('nav[aria-label="Main navigation"] button');
      const btn = buttons[idx];
      if (!btn) continue;
      const label = await btn.evaluate((el) => el.textContent?.trim() ?? `tab-${idx}`);
      await btn.tap();
      await new Promise((r) => setTimeout(r, 1200));
      await page.screenshot({ path: path.join(outDir, `${String(i++).padStart(2, '0')}-${label.toLowerCase()}.png`) });
      await audit(label);
    }
  }

  const perf = await page.evaluate(() => ({
    domNodes: document.getElementsByTagName('*').length,
    jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  }));
  console.log(`DOM nodes: ${perf.domNodes} · JS heap: ${perf.jsHeapMB ?? 'n/a'} MB`);
} finally {
  await browser.close();
}

const relevantErrors = consoleErrors.filter((e) => !/favicon|manifest/i.test(e));
if (relevantErrors.length) problems.push(...relevantErrors.map((e) => `console: ${e}`));

console.log(`Screenshots → ${outDir}/`);
if (problems.length) {
  console.log('\nISSUES:');
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exitCode = 1;
} else {
  console.log('✓ No console errors, no horizontal overflow, touch targets OK');
}

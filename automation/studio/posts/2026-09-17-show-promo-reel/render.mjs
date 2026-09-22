import { createRequire } from 'module';
const require = createRequire('D:/Dev/GitHub/ig-studio/'); const { chromium } = require('playwright');
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file:///' + process.cwd().split(String.fromCharCode(92)).join('/') + '/reel.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1200);
const FPS = 30, N = 27 * FPS;
if (only) { for (const t of only) { await p.evaluate(t => seek(t), t); await p.screenshot({ path: `prev-${t}.jpg`, type: 'jpeg', quality: 80 }); } }
else for (let i = 0; i < N; i++) { await p.evaluate(t => seek(t), i / FPS); await p.screenshot({ path: `frames/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 }); }
await b.close();

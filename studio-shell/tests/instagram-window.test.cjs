const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('D:/Dev/GitHub/ig-studio/node_modules/playwright');

test('real Electron workspace recovers from stale server state and preserves edits', { timeout: 60000 }, async () => {
  const profile = mkdtempSync(path.join(tmpdir(), 'cts-electron-check-'));
  let app;
  try {
    const env = { ...process.env, CTS_TEST_PROFILE: profile };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'fixtures/instagram-window.cjs')], env });
    const page = await app.firstWindow();
    await page.waitForFunction(() => document.querySelector('#acct')?.textContent.includes('Active Instagram:'));
    assert.match(await page.locator('#acct').textContent(), /@crimetimesnacks/);
    assert.ok(!(await page.locator('#acct').textContent()).includes('not running'));
    await page.locator('[data-cpost]').waitFor();
    await app.evaluate(() => { globalThis.ctsFixture.fail = true; });
    await page.locator('[data-cpost]').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Fixture composer refused'));
    assert.match(await page.locator('#toast').getAttribute('class'), /bad/);
    assert.ok(!(await page.locator('#toast').textContent()).includes('Caption copied'));
    await page.locator('[data-ccap]').fill('Unsaved podcast caption');
    await app.evaluate(() => { globalThis.ctsFixture.username = 'ai.techprojects'; });
    await page.locator('#recheck').click();
    await page.waitForFunction(() => document.querySelector('#acct').textContent.includes('@ai.techprojects'));
    assert.equal(await page.locator('[data-ccap]').inputValue(), 'Unsaved podcast caption');
    assert.equal(await page.evaluate(() => postGate('crimetimesnacks').ok), false);
    await page.evaluate(() => { document.querySelector('[data-ccap]').removeAttribute('data-dirty'); });
    await app.evaluate(() => { globalThis.ctsFixture.username = 'crimetimesnacks'; });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.querySelector('#acct').textContent.includes('@crimetimesnacks'));
    await page.screenshot({ path: path.join(tmpdir(), 'crimetime-studio-connection-check.png') });
  } finally {
    await app?.close();
    if (!path.resolve(profile).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Invalid test profile cleanup');
    rmSync(profile, { recursive: true, force: true });
  }
});

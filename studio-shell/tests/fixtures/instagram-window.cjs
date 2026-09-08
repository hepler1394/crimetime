const { app, BrowserWindow, protocol, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
app.setPath('userData', process.env.CTS_TEST_PROFILE);
protocol.registerSchemesAsPrivileged([{ scheme: 'cts-shell', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const state = globalThis.ctsFixture = { username: 'crimetimesnacks', requests: [], fail: false };
const repo = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/instagram') { res.setHeader('Content-Type', 'text/html'); return res.end(fs.readFileSync(path.join(repo, 'automation/studio/instagram.html'))); }
  if (req.url === '/api/ig/account') return res.end(JSON.stringify({ shell: false, signedIn: false, username: null }));
  if (req.url === '/api/posts') return res.end(JSON.stringify([{ id: 'fixture', title: 'Podcast fixture', status: 'approved', slides: 1, files: ['slide-1.jpg'], caption: 'Saved caption', dir: 'fixture' }]));
  if (req.url === '/api/ig/queue') return res.end(JSON.stringify({ posts: [], renders: [], rules: [], account: 'ai.techprojects' }));
  if (req.url === '/images/logo.png' || req.url.startsWith('/api/post/fixture/file')) { res.setHeader('Content-Type', 'image/png'); return res.end(fs.readFileSync(path.join(repo, 'images/logo.png'))); }
  res.end('{}');
});
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  session.defaultSession.protocol.handle('cts-shell', (request) => {
    const command = new URL(request.url).hostname;
    state.requests.push(command);
    if (command === 'account') return new Response(JSON.stringify({ signedIn: true, username: state.username }));
    return new Response(JSON.stringify(state.fail ? { ok: false, why: 'Fixture composer refused the request' } : { ok: true }));
  });
  const window = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { sandbox: true, contextIsolation: true } });
  window.loadURL(`http://127.0.0.1:${server.address().port}/instagram`);
});
app.on('window-all-closed', () => { server.close(); app.quit(); });

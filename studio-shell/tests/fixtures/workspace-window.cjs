const { app, BrowserWindow } = require('electron');
app.setPath('userData', process.env.CTS_TEST_PROFILE);
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1600, height: 1100, show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  win.loadURL(process.env.CTS_TEST_URL);
});
app.on('window-all-closed', () => app.quit());

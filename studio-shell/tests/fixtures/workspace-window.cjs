const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
app.setPath('userData', process.env.CTS_TEST_PROFILE);
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1600, height: 1100, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  require('../../studio-permissions.cjs').configureStudioPermissions(win.webContents.session,process.env.CTS_TEST_URL);
  win.loadURL(process.env.CTS_TEST_URL);
});
app.on('window-all-closed', () => app.quit());

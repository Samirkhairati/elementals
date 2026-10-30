import { app, BrowserWindow, Menu } from 'electron';

export function setupMenu(win: BrowserWindow) {
  const isMac = process.platform === 'darwin';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const template: any[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Appearance',
          submenu: [
            {
              label: 'Select Tabs',
              submenu: [
                {
                  label: 'Maps Panel',
                  click: () => win.webContents.send('dockview-toggle-panel', 'maps'),
                },
                {
                  label: 'Layers Panel',
                  click: () => win.webContents.send('dockview-toggle-panel', 'layers'),
                },
                {
                  label: 'Entities Panel',
                  click: () => win.webContents.send('dockview-toggle-panel', 'entities'),
                },
                {
                  label: 'Properties Panel',
                  click: () => win.webContents.send('dockview-toggle-panel', 'properties'),
                },
                { type: 'separator' },
                {
                  label: 'Tileset Browser',
                  click: () => win.webContents.send('dockview-toggle-panel', 'tilesets'),
                },
                {
                  label: 'Tileset Preview',
                  click: () => win.webContents.send('dockview-toggle-panel', 'preview'),
                },
                {
                  label: 'Active Selection',
                  click: () => win.webContents.send('dockview-toggle-panel', 'activeSelection'),
                },
              ],
            },
            { type: 'separator' },
            {
              label: 'Reset Layout',
              click: () => win.webContents.send('dockview-reset-layout'),
            },
          ],
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ]
          : [{ role: 'close' }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, isAllowedNavigation, parsePort } from './devServer';

describe('parsePort', () => {
  it('accepts integer ports', () => {
    expect(parsePort('5274')).toBe(5274);
    expect(parsePort(' 80 ')).toBe(80);
    expect(parsePort('65535')).toBe(65535);
  });

  it.each([[undefined], [''], ['abc'], ['5174abc'], ['5174.5'], ['-1'], ['0'], ['65536'], ['1e3'], ['0x10'], ['99999999999999999999']])(
    'falls back for %j',
    (value) => {
      expect(parsePort(value)).toBe(DEFAULT_PORT);
    }
  );

  it('honours a custom fallback', () => {
    expect(parsePort('nope', 1234)).toBe(1234);
  });
});

describe('isAllowedNavigation', () => {
  const dev = { isPackaged: false, port: 5174, distDir: '/app/dist' };
  const packaged = { isPackaged: true, port: 5174, distDir: path.resolve('/app/dist') };

  it('allows only the dev server origin in development', () => {
    expect(isAllowedNavigation('http://localhost:5174/', dev)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5174/editor?x=1#h', dev)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5175/', dev)).toBe(false);
    expect(isAllowedNavigation('https://localhost:5174/', dev)).toBe(false);
    expect(isAllowedNavigation('http://localhost:5174.evil.com/', dev)).toBe(false);
    expect(isAllowedNavigation('http://evil.com/', dev)).toBe(false);
    expect(isAllowedNavigation('https://example.com', dev)).toBe(false);
    expect(isAllowedNavigation('file:///etc/passwd', dev)).toBe(false);
    expect(isAllowedNavigation('javascript:alert(1)', dev)).toBe(false);
    expect(isAllowedNavigation('not a url', dev)).toBe(false);
  });

  it('allows only files inside the dist folder when packaged', () => {
    expect(isAllowedNavigation(pathToFileURL(path.join(packaged.distDir, 'index.html')).href, packaged)).toBe(true);
    expect(isAllowedNavigation(pathToFileURL(path.join(packaged.distDir, 'a', 'b.html')).href + '#/x', packaged)).toBe(true);
    expect(isAllowedNavigation(pathToFileURL('/app/dist-evil/index.html').href, packaged)).toBe(false);
    expect(isAllowedNavigation(pathToFileURL('/etc/passwd').href, packaged)).toBe(false);
    expect(isAllowedNavigation('http://localhost:5174/', packaged)).toBe(false);
    expect(isAllowedNavigation('https://example.com/', packaged)).toBe(false);
  });
});

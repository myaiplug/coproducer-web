import assert from 'node:assert/strict';
import test from 'node:test';
import { pickLiminalAsset, applyLiminalDownloads } from './liminal-latest.js';

const assets = [
  { name: 'checksums-windows.sha256', browser_download_url: 'https://example.test/sum' },
  { name: 'Liminal-StemSplit-Setup-v0.5.1-Windows-x64-Online.exe', browser_download_url: 'https://example.test/online.exe' },
  { name: 'NoDAW.Liminal_0.5.1_aarch64.dmg', browser_download_url: 'https://example.test/mac.dmg' },
  { name: 'NoDAW.Liminal_0.5.1_x64-setup.exe', browser_download_url: 'https://example.test/setup.exe' },
  { name: 'NoDAW.Liminal_0.5.1_x64_en-US.msi', browser_download_url: 'https://example.test/setup.msi' },
];

test('prefers the offline Windows setup over the online installer', () => {
  const windows = pickLiminalAsset(assets, 'windows');
  assert.equal(windows.name, 'NoDAW.Liminal_0.5.1_x64-setup.exe');
  assert.equal(pickLiminalAsset(assets, 'online').name, 'Liminal-StemSplit-Setup-v0.5.1-Windows-x64-Online.exe');
  assert.equal(pickLiminalAsset(assets, 'mac').name, 'NoDAW.Liminal_0.5.1_aarch64.dmg');
});

test('rewrites marked download links to the resolved assets', () => {
  const store = {
    'data-liminal-download': 'windows',
    href: 'https://github.com/myaiplug/liminal-stemsplit/releases/latest',
  };
  const link = {
    getAttribute: (key) => store[key],
    setAttribute: (key, value) => { store[key] = value; },
  };
  const version = { textContent: '' };
  const doc = {
    querySelectorAll(selector) {
      if (selector === '[data-liminal-download]') return [link];
      if (selector === '[data-liminal-release]') return [];
      if (selector === '[data-liminal-version]') return [version];
      return [];
    },
  };
  applyLiminalDownloads(doc, {
    tag: 'v0.5.1',
    htmlUrl: 'https://github.com/myaiplug/liminal-stemsplit/releases/tag/v0.5.1',
    windows: assets[3],
    windowsOnline: assets[1],
    mac: assets[2],
  });
  assert.equal(store.href, 'https://example.test/setup.exe');
  assert.equal(store['data-download'], 'NoDAW.Liminal_0.5.1_x64-setup.exe');
  assert.equal(version.textContent, 'v0.5.1');
});

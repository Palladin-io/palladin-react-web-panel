// Executed by Node during build; not a browser/Vitest suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appLinkAssociations, appLinkAssociationPlugin } from './app-link-associations.mjs';

const environment = {
  PALLADIN_APP_LINK_ENVIRONMENT: 'staging',
  PALLADIN_APP_LINK_APPLE_APP_ID: 'ABCDEFGHIJ.com.example.mobile.staging',
  PALLADIN_APP_LINK_ANDROID_PACKAGE: 'com.example.mobile.staging',
  PALLADIN_APP_LINK_ANDROID_SHA256: Array(32).fill('AA').join(':'),
};

test('fresh clones do not associate a domain with any application', () => {
  const documents = appLinkAssociations({});
  assert.deepEqual(JSON.parse(documents['assetlinks.json']), []);
  assert.deepEqual(JSON.parse(documents['apple-app-site-association']), { applinks: { details: [] } });
});

test('publishes explicit identities and narrow Apple paths, not all paths', () => {
  const documents = appLinkAssociations(environment);
  const apple = JSON.parse(documents['apple-app-site-association']);
  assert.deepEqual(apple.applinks.details[0].components, [{ '/': '/share/*' }, { '/': '/verify-email' }]);
  assert.deepEqual(apple.applinks.details[0].appIDs, [environment.PALLADIN_APP_LINK_APPLE_APP_ID]);
  const android = JSON.parse(documents['assetlinks.json']);
  assert.equal(android[0].target.package_name, environment.PALLADIN_APP_LINK_ANDROID_PACKAGE);
});

test('partial, malformed, wildcard and unknown-environment configuration fail closed', () => {
  assert.throws(() => appLinkAssociations({ PALLADIN_APP_LINK_ENVIRONMENT: 'staging' }));
  for (const [key, value] of [
    ['PALLADIN_APP_LINK_ENVIRONMENT', 'local'],
    ['PALLADIN_APP_LINK_APPLE_APP_ID', 'ABCDEFGHIJ.*'],
    ['PALLADIN_APP_LINK_ANDROID_PACKAGE', 'com.example.*'],
    ['PALLADIN_APP_LINK_ANDROID_SHA256', 'AA:BB'],
    ['PALLADIN_APP_LINK_ANDROID_SHA256', `${environment.PALLADIN_APP_LINK_ANDROID_SHA256},${environment.PALLADIN_APP_LINK_ANDROID_SHA256}`],
  ]) assert.throws(() => appLinkAssociations({ ...environment, [key]: value }));
});

test('build emits canonical documents and ZIP-safe same-origin mirrors', () => {
  const emitted = [];
  appLinkAssociationPlugin(environment).generateBundle.call({ emitFile: (file) => emitted.push(file) });
  assert.deepEqual(emitted.map((file) => file.fileName), [
    '.well-known/apple-app-site-association', 'well-known/apple-app-site-association',
    '.well-known/assetlinks.json', 'well-known/assetlinks.json',
  ]);
  for (const name of ['apple-app-site-association', 'assetlinks.json']) {
    assert.equal(
      emitted.find((file) => file.fileName === `.well-known/${name}`).source,
      emitted.find((file) => file.fileName === `well-known/${name}`).source,
    );
  }
});

test('Netlify rewrites only exact association URLs before the SPA fallback', async () => {
  const { readFile } = await import('node:fs/promises');
  const redirects = (await readFile(new URL('../public/_redirects', import.meta.url), 'utf8'))
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(redirects.slice(0, 3), [
    '/.well-known/apple-app-site-association /well-known/apple-app-site-association 200!',
    '/.well-known/assetlinks.json /well-known/assetlinks.json 200!',
    '/* /index.html 200',
  ]);
});

test('dev server returns JSON without a redirect or SPA fallback', () => {
  let middleware;
  appLinkAssociationPlugin(environment).configureServer({ middlewares: { use: (value) => { middleware = value; } } });
  const headers = {};
  let body;
  middleware({ url: '/.well-known/apple-app-site-association' }, {
    setHeader: (key, value) => { headers[key] = value; }, end: (value) => { body = value; },
  }, () => assert.fail('SPA fallback must not receive an association document'));
  assert.equal(headers['Content-Type'], 'application/json');
  assert.ok(JSON.parse(body).applinks);
  let passed = false;
  middleware({ url: '/share/example' }, {}, () => { passed = true; });
  assert.equal(passed, true);
});

const configurationKeys = [
  'PALLADIN_APP_LINK_ENVIRONMENT', 'PALLADIN_APP_LINK_APPLE_APP_ID',
  'PALLADIN_APP_LINK_ANDROID_PACKAGE', 'PALLADIN_APP_LINK_ANDROID_SHA256',
];

export function appLinkAssociations(environment) {
  const values = configurationKeys.map((key) => environment[key]?.trim() ?? '');
  const [deployment, appleAppId, androidPackage, fingerprintList] = values;
  if (values.some(Boolean) && !values.every(Boolean)) {
    throw new Error('App Link configuration must be complete or entirely disabled');
  }
  let details = [];
  let android = [];
  if (values.every(Boolean)) {
    const fingerprints = fingerprintList.split(',').map((value) => value.trim());
    if (!['staging', 'production'].includes(deployment)
      || !/^[A-Z0-9]{10}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(appleAppId)
      || !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(androidPackage)
      || !fingerprints.every((value) => /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))
      || new Set(fingerprints).size !== fingerprints.length) {
      throw new Error('Invalid App Link configuration');
    }
    details = [{ appIDs: [appleAppId], components: [{ '/': '/share/*' }, { '/': '/verify-email' }] }];
    android = [{ relation: ['delegate_permission/common.handle_all_urls'], target: {
      namespace: 'android_app', package_name: androidPackage, sha256_cert_fingerprints: fingerprints,
    } }];
  }
  return {
    'apple-app-site-association': JSON.stringify({ applinks: { details } }),
    'assetlinks.json': JSON.stringify(android),
  };
}

export function appLinkAssociationPlugin(environment) {
  const documents = appLinkAssociations(environment);
  return {
    name: 'app-link-associations',
    generateBundle() {
      for (const [name, source] of Object.entries(documents)) {
        this.emitFile({ type: 'asset', fileName: `.well-known/${name}`, source });
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.replace(/^\/\.well-known\//, '');
        if (!Object.hasOwn(documents, name ?? '')) return next();
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(documents[name]);
      });
    },
  };
}

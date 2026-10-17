// Sign in with Apple needs a paid Apple Developer account. A free Apple ID (Xcode's "Personal Team", which
// `npm run phone` and `npm run build` use) can't sign an app that asks for it, so the build would fail.
// It's only switched on with KLEOS_APPLE_SIGNIN=1, which the App Store build in eas.json sets.
// Without it, the app simply doesn't show the Apple button; saving an account by email still works.
const { withEntitlementsPlist } = require('expo/config-plugins');

const withoutAppleSignIn = (config) =>
  withEntitlementsPlist(config, (c) => {
    delete c.modResults['com.apple.developer.applesignin'];
    return c;
  });

module.exports = ({ config }) => {
  const apple = process.env.KLEOS_APPLE_SIGNIN === '1';
  const name = (p) => (Array.isArray(p) ? p[0] : p);
  return {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: apple },
    // expo-apple-authentication is applied by Expo whenever it's installed, so the entitlement it adds is removed here.
    plugins: apple ? config.plugins : [...(config.plugins || []).filter((p) => name(p) !== 'expo-apple-authentication'), withoutAppleSignIn],
    extra: { ...config.extra, appleSignIn: apple },
  };
};

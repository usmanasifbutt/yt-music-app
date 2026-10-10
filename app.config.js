// Extends app.json. With APP_VARIANT=beta (the "beta" EAS profile) the app gets its own
// package ID and name, so a test build installs next to the real app instead of replacing it.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'beta') return config;
  return {
    ...config,
    name: `${config.name} Beta`,
    android: {
      ...config.android,
      package: `${config.android.package}.beta`,
    },
  };
};

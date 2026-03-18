let appPromise;

module.exports = async (req, res) => {
  if (!appPromise) {
    appPromise = import("../backend/src/server.js")
      .then(async (serverModule) => {
        await serverModule.initializeServer({ enableScheduler: false });
        return serverModule.default;
      })
      .catch((error) => {
        appPromise = undefined;
        throw error;
      });
  }

  const app = await appPromise;
  return app(req, res);
};
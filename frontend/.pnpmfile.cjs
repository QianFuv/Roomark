/**
 * pnpm install hooks.
 *
 * openapi-typescript needs the TypeScript 5 compiler API, which TypeScript 7 no longer ships,
 * so it gets its own TypeScript 5 dependency instead of the project's TypeScript 7 peer.
 */
module.exports = {
  hooks: {
    readPackage(manifest) {
      if (manifest.name === "openapi-typescript") {
        delete manifest.peerDependencies?.typescript;
        manifest.dependencies = { ...manifest.dependencies, typescript: "5.9.3" };
      }

      return manifest;
    },
  },
};

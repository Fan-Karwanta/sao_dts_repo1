// PM2 process list for the Windows LAN deployment. Start from the repo root:
//   pm2 start infra/ecosystem.config.cjs
// then `pm2 save` and `pm2-startup install` so the apps survive reboots.
const path = require("node:path");

const root = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "sao-api",
      cwd: path.join(root, "apps/api"),
      script: "dist/main.js",
      env: { NODE_ENV: "production" },
    },
    {
      name: "sao-web",
      cwd: path.join(root, "apps/web"),
      // Call the Next.js binary directly — npm/pnpm wrappers don't run well
      // as PM2 scripts on Windows.
      script: path.join(root, "apps/web/node_modules/next/dist/bin/next"),
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
    },
  ],
};

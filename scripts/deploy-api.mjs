import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
cpSync("apps/api/dist", "dist/app", { recursive: true });

const moduleDirs = [
  "node_modules",
  "apps/api/node_modules",
  "packages/db/node_modules",
  "packages/contracts/node_modules",
];
for (const dir of moduleDirs) {
  if (existsSync(dir))
    cpSync(dir, "dist/vendor", { recursive: true, dereference: true });
}

mkdirSync("dist/vendor/@sao", { recursive: true });
const skipNestedModules = (src) => !src.includes("node_modules");
cpSync("packages/contracts", "dist/vendor/@sao/contracts", {
  recursive: true,
  filter: skipNestedModules,
});
cpSync("packages/db", "dist/vendor/@sao/db", {
  recursive: true,
  filter: skipNestedModules,
});

writeFileSync(
  "dist/main.js",
  [
    'const path = require("path");',
    'process.env.NODE_PATH = path.join(__dirname, "vendor");',
    'require("module").Module._initPaths();',
    'require("./app/main.js");',
    "",
  ].join("\n"),
);

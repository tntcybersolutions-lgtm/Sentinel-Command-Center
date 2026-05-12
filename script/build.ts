import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execSync } from "child_process";

const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  console.log("running secret-scan gate...");
  execSync("node scripts/secret-scan-gate.cjs", { stdio: "inherit" });

  console.log("running no-placeholder gate...");
  execSync("node scripts/no-placeholder-gate.cjs", { stdio: "inherit" });

  console.log("running data-quality gate...");
  execSync("node scripts/data-quality-gate.cjs", { stdio: "inherit" });

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.dirname": "__dirname",
      "import.meta.filename": "__filename",
    },
    minify: true,
    plugins: [
      {
        name: "stub-vite-prod",
        setup(b) {
          // Mark vite + plugins external so esbuild does not bundle them
          b.onResolve({ filter: /^vite$|^@replit\/vite-plugin-|^@vitejs\// }, () => ({ path: "vite-runtime-stub", namespace: "stub" }));
          // Stub vite.config to an empty object so its top-level plugin imports never execute
          b.onResolve({ filter: /vite\.config(\.ts|\.js)?$/ }, () => ({ path: "vite-config-stub", namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default { plugins: [] };", loader: "ts" }));
        },
      },
    ],
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});

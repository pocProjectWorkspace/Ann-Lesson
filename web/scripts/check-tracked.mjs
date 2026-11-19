// Fails when a source file exists on disk but is ignored by git, which means it
// would never reach GitHub, CI or production. (This once hid an API route behind
// an "uploads/" ignore rule meant for the local uploads folder.)
import { execSync } from "node:child_process";
const dirs = ["src", "prisma", "scripts", "tests", "public"];
const out = execSync(`git ls-files --others --ignored --exclude-standard ${dirs.join(" ")}`, { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((f) => f && !f.includes("node_modules") && !/pdf\.worker\.min\.mjs$|dev-axe\.js$/.test(f));
if (out.length) {
  console.error("These source files are ignored by git and will not be deployed:\n  " + out.join("\n  "));
  process.exit(1);
}
console.log("All source files are tracked.");

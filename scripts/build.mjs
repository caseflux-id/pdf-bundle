import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { join } from "node:path";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Use a stable semver version for releases");
const bridge = "__caseflux_pdf_bundle_" + version.replaceAll(".", "_");
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
execFileSync("go", ["build", "-buildvcs=false", "-trimpath", "-ldflags", `-s -w -X main.bridgeName=${bridge}`, "-o", "dist/engine.wasm", "./cmd/wasm"], {
  stdio: "inherit", env: { ...process.env, GOOS: "js", GOARCH: "wasm", CGO_ENABLED: "0" },
});
const goroot = execFileSync("go", ["env", "GOROOT"], { encoding: "utf8" }).trim();
const runtime = await readFile(join(goroot, "lib/wasm/wasm_exec.js"), "utf8");
await writeFile("dist/wasm_exec.js", runtime + "\nexport const Go = globalThis.Go;\n");
for (const name of ["index.js", "cdn.js", "core.js", "index.d.ts"]) {
  await writeFile(join("dist", name), (await readFile(join("src", name), "utf8")).replaceAll("__VERSION__", version));
}
// Ship the actual licenses for Go and every module linked into the engine.
await rm("THIRD_PARTY_LICENSES", { recursive: true, force: true });
await mkdir("THIRD_PARTY_LICENSES");
await copyFile(join(goroot, "LICENSE"), "THIRD_PARTY_LICENSES/Go-LICENSE.txt");
const modules = execFileSync("go", ["list", "-m", "-f", "{{if not .Main}}{{.Path}}|{{.Dir}}{{end}}", "all"], { encoding: "utf8" });
for (const line of modules.trim().split("\n").filter(Boolean)) {
  const [path, directory] = line.split("|");
  const license = await readFile(join(directory, "LICENSE"));
  await writeFile(join("THIRD_PARTY_LICENSES", path.replaceAll("/", "_") + "-LICENSE.txt"), license);
}
console.log("Built pdf-bundle " + version + " with " + execFileSync("go", ["version"], { encoding: "utf8" }).trim());

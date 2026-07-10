import { rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const outputDirectory = ".export-test-build";
const isWindows = process.platform === "win32";
const tscExecutable = join("node_modules", ".bin", isWindows ? "tsc.cmd" : "tsc");

const compileArguments = [
  "--ignoreConfig",
  "src/audio/audioBufferUtils.ts",
  "src/audio/exportWav.ts",
  "scripts/wavExport.test.ts",
  "--target",
  "ES2022",
  "--module",
  "commonjs",
  "--lib",
  "ES2022,DOM",
  "--strict",
  "--skipLibCheck",
  "--outDir",
  outputDirectory,
];

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} a échoué avec le code ${result.status ?? "inconnu"}.`);
  }
}

rmSync(outputDirectory, { recursive: true, force: true });

try {
  run(tscExecutable, compileArguments);
  writeFileSync(join(outputDirectory, "package.json"), '{"type":"commonjs"}\n');
  run(process.execPath, [join(outputDirectory, "scripts", "wavExport.test.js")]);
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}

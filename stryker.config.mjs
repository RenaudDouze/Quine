/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },
  checkers: ["typescript"],
  typescriptChecker: {
    prioritizePerformanceOverAccuracy: true,
  },
  reporters: ["html", "clear-text", "progress"],
  coverageAnalysis: "perTest",
  mutate: [
    "src/lib/bingo.ts",
    "src/lib/share.ts",
    "src/lib/colors.ts",
    "src/lib/url.ts",
    "src/lib/download.ts",
    "src/lib/gridImage.ts",
    "src/lib/print.ts",
    "src/lib/remoteSync.ts",
    "src/lib/pdfExport.ts",
    "src/lib/reorder.ts",
  ],
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
};

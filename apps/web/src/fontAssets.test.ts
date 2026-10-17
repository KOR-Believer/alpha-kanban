import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const stylesheetPath = require.resolve("pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css");
const stylesheet = readFileSync(stylesheetPath, "utf8");

describe("self-hosted fonts", () => {
  it("keeps Raleway before the bundled Korean fallback", () => {
    const appStyles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(appStyles).toContain('@import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";');
    expect(appStyles).toContain('--font-sans: "Raleway Variable", "Pretendard Variable", ui-sans-serif, system-ui, sans-serif;');
    expect(appStyles).not.toContain("--ak-font-korean");
  });

  it("resolves every variable subset locally without a font CDN", () => {
    const urls = [...stylesheet.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]!.replace(/["']/g, ""));
    expect(urls.length).toBeGreaterThan(1);
    expect(stylesheet).toContain("font-display: swap");
    expect(stylesheet.match(/unicode-range:/g)).toHaveLength(urls.length);
    for (const url of urls) {
      expect(url).toMatch(/^\.\/woff2-dynamic-subset\/.+\.woff2$/);
      expect(existsSync(resolve(dirname(stylesheetPath), url)), url).toBe(true);
    }
  });

  it("preserves copyright notices and the full font license for distribution", () => {
    const license = readFileSync(new URL("../licenses/OFL.txt", import.meta.url), "utf8");
    expect(license).toContain("The Raleway Project Authors");
    expect(license).toContain("Kil Hyung-jin");
    const original = readFileSync(require.resolve("@fontsource-variable/raleway/LICENSE"), "utf8");
    const terms = (text: string) => text.slice(text.indexOf("SIL OPEN FONT LICENSE Version 1.1")).replace(/\s+/g, " ").trim();
    expect(terms(license)).toBe(terms(original));
  });
});

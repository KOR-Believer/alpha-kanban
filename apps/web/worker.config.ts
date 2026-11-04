import type { Plugin } from "vite";
import { createRequire } from "node:module";

const sharedRequire = createRequire(new URL("../../packages/shared/package.json", import.meta.url));
const decoderRequire = createRequire(sharedRequire.resolve("micromark-util-decode-string"));
export const markdownWorkerAliases = {
  "decode-named-character-reference": decoderRequire.resolve("decode-named-character-reference"),
};

/** Markdown's browser decoder uses document; its worker/default entry is DOM-free. */
export function markdownWorkerPlugins(): Plugin[] {
  return [{
    name: "markdown-worker-entities",
    enforce: "pre",
    resolveId(source) {
      if (source === "decode-named-character-reference") return markdownWorkerAliases[source];
    },
  }];
}

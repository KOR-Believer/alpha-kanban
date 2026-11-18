import { PREVIEW_LIMITS } from "./previewModel";
import type { PreviewResourceReader } from "./FilePreview";
import { parse, serialize, type DefaultTreeAdapterTypes } from "parse5";

/** A fixed, bounded read of directly authored dependencies; no RPC/file handle reaches the frame. */
export async function prepareHtml(text: string, path: string, read: PreviewResourceReader, signal: AbortSignal) {
  const resources: { token: string; blob: Blob }[] = [], failures = new Set<string>(), cache = new Map<string, string>();
  let total = 0, count = 0;
  // A data-only parser: constructing native DOM nodes can fetch resources before
  // the isolated frame owns them. This AST has no document, network or script API.
  const document = parse(text), elements: DefaultTreeAdapterTypes.Element[] = [];
  const pending: DefaultTreeAdapterTypes.Node[] = [document];
  while (pending.length) {
    const node = pending.pop()!;
    if ("tagName" in node) {
      const refresh = node.tagName === "meta" && node.attrs.some(attribute => attribute.name === "http-equiv" && attribute.value.toLowerCase() === "refresh");
      if (node.tagName === "base" || refresh) {
        if (node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter(child => child !== node);
        continue;
      }
      elements.push(node);
    }
    if ("childNodes" in node) pending.push(...[...node.childNodes].reverse());
    if ("content" in node) pending.push(node.content);
  }
  const get = (element: DefaultTreeAdapterTypes.Element, name: string) => element.attrs.find(attribute => attribute.name === name)?.value;
  const set = (element: DefaultTreeAdapterTypes.Element, name: string, value: string) => {
    const attribute = element.attrs.find(attribute => attribute.name === name);
    if (attribute) attribute.value = value; else element.attrs.push({ name, value });
  };
  const remove = (element: DefaultTreeAdapterTypes.Element, name: string) => { element.attrs = element.attrs.filter(attribute => attribute.name !== name); };
  const external = (value: string) => /^(?:https?:|data:|#|\/\/)/i.test(value);
  async function resource(source: string, href: string, kind: "css" | "js" | "asset", stack: string[] = []): Promise<string> {
    signal.throwIfAborted();
    if (external(href)) return href;
    const key = source + "\n" + href;
    if (cache.has(key)) return cache.get(key)!;
    if (stack.includes(key) || stack.length > 8 || ++count > PREVIEW_LIMITS.resources) { failures.add(href); return "about:blank"; }
    try {
      const pathname = decodeURIComponent(href.split(/[?#]/)[0]!);
      const allowed = kind === "css" ? /\.css$/i : kind === "js" ? /\.(?:js|mjs|cjs)$/i : /\.(?:png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf)$/i;
      if (!allowed.test(pathname)) throw new Error("Unsupported resource type");
      const result = await read(source, href, signal); signal.throwIfAborted();
      total += result.file.size;
      if (result.file.size > PREVIEW_LIMITS.resourceBytes || total > PREVIEW_LIMITS.totalResourceBytes) throw new Error("Resource limit");
      let blob: Blob = result.file;
      if (kind === "css" || kind === "js") {
        const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(await result.file.arrayBuffer());
        signal.throwIfAborted();
        blob = new Blob([kind === "css" ? await css(sourceText, result.path, [...stack, key]) : sourceText], { type: kind === "css" ? "text/css" : "text/javascript" });
      } else if (!result.file.type || result.file.type === "application/octet-stream") {
        const extension = result.path.toLowerCase().split(".").at(-1)!;
        const mime: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", woff: "font/woff", woff2: "font/woff2" };
        blob = result.file.slice(0, result.file.size, mime[extension] || result.file.type);
      }
      signal.throwIfAborted();
      // Opaque frames cannot read parent-owned Blob URLs. Send only bounded bytes;
      // the isolated host creates its own URLs, in dependency order.
      const token = `ak-preview-resource:${resources.length}:end`;
      resources.push({ token, blob }); cache.set(key, token); return token;
    } catch (error) { signal.throwIfAborted(); failures.add(href); return "about:blank"; }
  }
  async function css(source: string, sourcePath: string, stack: string[] = []): Promise<string> {
    // Replace spans once, preserving media queries and authored order. Strings and
    // comments are skipped unless they are the argument of an actual resource token.
    const pattern = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|@import\s+(?:url\(\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s)]+))\s*\)|"([^"\n]+)"|'([^'\n]+)')|url\(\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s)]+))\s*\)/gi;
    let output = "", last = 0;
    for (const match of source.matchAll(pattern)) {
      output += source.slice(last, match.index);
      const imported = match[1] || match[2] || match[3] || match[4] || match[5];
      const value = imported || match[6] || match[7] || match[8];
      output += value ? match[0].replace(value, await resource(sourcePath, value, imported ? "css" : "asset", stack)) : match[0];
      last = match.index! + match[0].length;
    }
    return output + source.slice(last);
  }
  try {
    for (const element of elements) {
      signal.throwIfAborted();
      const attribute = element.tagName === "link" ? "href" : element.tagName === "video" ? "poster" : ["script", "img", "source"].includes(element.tagName) ? "src" : undefined;
      const value = attribute && get(element, attribute);
      const kind = element.tagName === "script" ? "js" : element.tagName === "link" && get(element, "rel")?.toLowerCase() === "stylesheet" ? "css" : "asset";
      if (attribute && value && !external(value)) {
        set(element, attribute, await resource(path, value, kind)); remove(element, "integrity"); remove(element, "crossorigin");
      }
    }
    for (const element of elements.filter(element => get(element, "srcset"))) {
      const value = get(element, "srcset")!;
      // A plain src remains usable for data-URL srcsets; comma splitting would corrupt them.
      if (/data:/i.test(value)) { remove(element, "srcset"); continue; }
      const candidates: string[] = [];
      for (const candidate of value.split(",")) {
        const [href, ...size] = candidate.trim().split(/\s+/);
        if (href) candidates.push([await resource(path, href, "asset"), ...size].join(" "));
      }
      set(element, "srcset", candidates.join(", "));
    }
    for (const element of elements) {
      if (element.tagName === "style") for (const child of element.childNodes) if ("value" in child && child.nodeName === "#text") child.value = await css(child.value, path);
      const inline = get(element, "style");
      if (inline) set(element, "style", await css(inline, path));
    }
    signal.throwIfAborted();
    return { html: serialize(document), resources, failures: [...failures], dispose: () => { resources.length = 0; } };
  } catch (error) { resources.length = 0; throw error; }
}

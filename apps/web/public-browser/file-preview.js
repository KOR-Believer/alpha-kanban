// This document is sandboxed both by its response and by the embedding iframe.
// It accepts exactly one text payload from its parent, never handles or commands.
(() => {
  const token = location.hash.slice(1);
  const expectedOrigin = new URL(location.href).origin;
  if (window === parent || !/^[a-f0-9-]{36}$/.test(token)) return;
  let used = false;
  const receive = async event => {
    if (used || event.source !== parent || event.origin !== expectedOrigin || event.data?.type !== "ak-preview-html" || event.data.token !== token || typeof event.data.html !== "string" || event.data.html.length > 4 * 1024 * 1024) return;
    const resources = event.data.resources;
    if (!Array.isArray(resources) || resources.length > 100 || resources.some((resource, index) => resource.token !== `ak-preview-resource:${index}:end` || !(resource.blob instanceof Blob) || resource.blob.size > 10 * 1024 * 1024) || resources.reduce((size, resource) => size + resource.blob.size, 0) > 32 * 1024 * 1024) return;
    used = true; clearInterval(timer); window.removeEventListener("message", receive);
    const urls = new Map();
    const replace = text => text.replace(/ak-preview-resource:\d+:end/g, value => urls.get(value) || "about:blank");
    try {
      for (const resource of resources) {
        const blob = resource.blob.type === "text/css" ? new Blob([replace(await resource.blob.text())], { type: "text/css" }) : resource.blob;
        urls.set(resource.token, URL.createObjectURL(blob));
      }
      const html = replace(event.data.html);
      document.open(); document.write(html); document.close();
      window.addEventListener("pagehide", () => urls.forEach(url => URL.revokeObjectURL(url)), { once: true });
    } catch {
      urls.forEach(url => URL.revokeObjectURL(url));
      document.body.textContent = "The HTML preview could not be opened. Use Source or download the file.";
    }
  };
  window.addEventListener("message", receive);
  const ready = () => parent.postMessage({ type: "ak-preview-ready", token }, expectedOrigin);
  const timer = setInterval(ready, 250); ready();
  setTimeout(() => clearInterval(timer), 30_000);
})();

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlaskConical, FolderKanban } from "lucide-react";
import { Resvg } from "@resvg/resvg-js";
import type { Plugin } from "vite";
import { RELEASE_CHANNELS, releaseChannel, type ReleaseChannel } from "./release-channel.mjs";

// Build-time assets read the same light tokens as the app, not another palette.
export function brandColors(channel: ReleaseChannel) {
  const css = readFileSync(new URL("./src/styles.css", import.meta.url), "utf8");
  const base = css.match(/:root\s*\{([^}]+)\}/)![1]!;
  const override = channel === "canary" ? css.match(/:root\[data-release-channel="canary"\]\s*\{([^}]+)\}/)![1]! : "";
  const tokens = Object.fromEntries([...`${base}\n${override}`.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]));
  const color = (name: string): string => {
    const value = tokens[name];
    if (!value) throw new Error(`Missing brand token ${name}`);
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    return reference ? color(reference[1]!) : value === "oklch(1 0 0)" ? "#ffffff" : value;
  };
  return { background: color("--ak-app-icon-background"), foreground: color("--ak-app-icon-foreground"), surface: color("--ak-header-background") };
}

export function brandIcon(channel: ReleaseChannel, size: number, favicon = false) {
  const config = RELEASE_CHANNELS[channel];
  const colors = brandColors(channel);
  const Icon = config.icon === "flask" ? FlaskConical : FolderKanban;
  // Maskable app icons retain the original safe area; the tiny favicon uses more space.
  const inset = favicon ? 64 : 112;
  const mark = renderToStaticMarkup(createElement(Icon, { x: inset, y: inset, width: 512 - inset * 2, height: 512 - inset * 2, color: colors.foreground, strokeWidth: favicon ? 2 : 1.6 }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${colors.background}"/>${mark}</svg>`;
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

export function browserBrand(value: unknown): Plugin {
  const channel = releaseChannel(value);
  const surface = brandColors(channel).surface;
  const favicon = channel === "canary" ? "/icons/favicon-32.png" : "/icons/app-192.png";
  const icons = new Map([192, 512].map((size) => [`/icons/app-${size}.png`, brandIcon(channel, size)]));
  if (channel === "canary") icons.set(favicon, brandIcon(channel, 32, true));
  return {
    name: "alpha-kanban-brand",
    transformIndexHtml(html) {
      return {
        html: html.replace(/<html([^>]*)>/, `<html$1 data-release-channel="${channel}">`)
          .replace(/<title>Alpha Kanban<\/title>/, `<title>${channel === "canary" ? "[Canary] " : ""}Alpha Kanban</title>`)
          .replace(/(<meta name="theme-color" content=")[^"]+("\s*\/>)/, `$1${surface}$2`),
        tags: [{ tag: "link", attrs: { rel: "icon", href: favicon, type: "image/png" }, injectTo: "head" }],
      };
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const icon = icons.get(request.url?.split("?")[0] ?? "");
        if (!icon) return next();
        response.setHeader("Content-Type", "image/png");
        response.end(icon);
      });
    },
    generateBundle() {
      for (const [path, source] of icons) this.emitFile({ type: "asset", fileName: path.slice(1), source });
    },
  };
}

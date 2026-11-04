import { RELEASE_CHANNELS, releaseChannel } from "../release-channel.mjs";

// One build chooses the brand. Routes, preferences and hostnames cannot switch it.
export const appBrand = RELEASE_CHANNELS[releaseChannel(__APP_RELEASE__.channel)];

export function brandedTitle(title: string) {
  return appBrand.channel === "canary" ? `[Canary] ${title}` : title;
}

export function initializeBrand() {
  document.documentElement.dataset.releaseChannel = appBrand.channel;
  document.title = brandedTitle("Alpha Kanban");
}

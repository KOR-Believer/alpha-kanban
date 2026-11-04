// Shared by packaging, Vite, the app and its worker. Never infer a channel from a URL.
export const RELEASE_CHANNELS = Object.freeze({
  stable: Object.freeze({ channel: "stable", origin: "https://kanban.giveit2.me", name: "Alpha Kanban", pagesProject: "alpha-kanban", branch: "master", historyFile: "releases.json", icon: "folder", accent: "olive" }),
  canary: Object.freeze({ channel: "canary", origin: "https://kanban-canary.giveit2.me", name: "Alpha Kanban Canary", pagesProject: "alpha-kanban-canary", branch: "release/canary", historyFile: "releases.canary.json", icon: "flask", accent: "purple" }),
});

export function releaseChannel(value) {
  if (value === undefined) return "stable"; // Only historical stable releases omit it.
  if (value !== "stable" && value !== "canary") throw new Error("Invalid release channel.");
  return value;
}

export function sameReleaseChannel(value, expected) {
  try { return releaseChannel(value) === releaseChannel(expected); }
  catch { return false; }
}

export function resolveReleaseChannel(env = {}) {
  const channel = releaseChannel(env.AK_RELEASE_CHANNEL);
  const config = RELEASE_CHANNELS[channel];
  // Pages provides the branch and deployment URL; direct uploads must supply a target.
  const deployment = env.CF_PAGES === "1" || env.AK_DEPLOY_PROJECT !== undefined || env.AK_DEPLOY_BRANCH !== undefined;
  if (deployment) {
    if (env.AK_RELEASE_CHANNEL === undefined) throw new Error("Deployment requires AK_RELEASE_CHANNEL.");
    let project = env.AK_DEPLOY_PROJECT;
    if (env.CF_PAGES === "1") {
      let url;
      try { url = new URL(env.CF_PAGES_URL); } catch { throw new Error("Deployment requires a valid CF_PAGES_URL."); }
      const match = /^([a-z0-9-]+\.)?([a-z0-9-]+)\.pages\.dev$/.exec(url.hostname);
      if (url.protocol !== "https:" || url.port || url.username || url.password || !match) throw new Error("Invalid Pages deployment URL.");
      if (project !== undefined && project !== match[2]) throw new Error("Deployment project and Pages URL do not match.");
      project = match[2];
      if (env.AK_DEPLOY_BRANCH !== undefined && env.AK_DEPLOY_BRANCH !== env.CF_PAGES_BRANCH) throw new Error("Deployment branch and Pages branch do not match.");
    }
    const branch = env.CF_PAGES === "1" ? env.CF_PAGES_BRANCH : env.AK_DEPLOY_BRANCH;
    if (project !== config.pagesProject || branch !== config.branch) throw new Error("Deployment project, branch and release channel do not match.");
    if (env.AK_RELEASE_NOTES_FILE !== undefined) throw new Error("Deployment must use the channel's authored release history.");
  }
  return config;
}

export function assertReleaseOrigin(channel, origin) {
  const expected = RELEASE_CHANNELS[releaseChannel(channel)];
  // Check known hosted origins; local smoke origins are allowed, never used to choose a channel.
  for (const config of Object.values(RELEASE_CHANNELS)) {
    if ((origin === config.origin || origin === `https://${config.pagesProject}.pages.dev`) && config !== expected) throw new Error("Release channel and hosted origin do not match.");
  }
}

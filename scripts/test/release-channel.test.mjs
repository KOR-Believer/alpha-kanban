import test from "node:test";
import assert from "node:assert/strict";
import { RELEASE_CHANNELS, resolveReleaseChannel, releaseChannel, sameReleaseChannel, assertReleaseOrigin } from "../../apps/web/release-channel.mjs";

test("local defaults stay stable; both channels select one consistent definition", () => {
  assert.equal(resolveReleaseChannel(), RELEASE_CHANNELS.stable);
  for (const channel of ["stable", "canary"]) assert.equal(resolveReleaseChannel({ AK_RELEASE_CHANNEL: channel }), RELEASE_CHANNELS[channel]);
  for (const channel of ["", "production", "Canary", "stable ", null]) assert.throws(() => resolveReleaseChannel({ AK_RELEASE_CHANNEL: channel }));
});
test("Pages requires an explicit channel and a matching project and deployment branch", () => {
  for (const config of Object.values(RELEASE_CHANNELS)) {
    const env = { CF_PAGES: "1", CF_PAGES_BRANCH: config.branch, CF_PAGES_URL: `https://abcdef.${config.pagesProject}.pages.dev`, AK_RELEASE_CHANNEL: config.channel };
    assert.equal(resolveReleaseChannel(env), config);
    assert.throws(() => resolveReleaseChannel({ ...env, AK_RELEASE_CHANNEL: undefined }));
    assert.throws(() => resolveReleaseChannel({ ...env, CF_PAGES_BRANCH: "feature/topic" }));
    assert.throws(() => resolveReleaseChannel({ ...env, CF_PAGES_URL: "https://unrelated.pages.dev" }));
    assert.throws(() => resolveReleaseChannel({ ...env, CF_PAGES_URL: "https://alpha-kanban.pages.dev.attacker.test" }));
    assert.throws(() => resolveReleaseChannel({ ...env, AK_DEPLOY_PROJECT: "other" }));
    assert.throws(() => resolveReleaseChannel({ ...env, AK_DEPLOY_BRANCH: "other" }));
    assert.throws(() => resolveReleaseChannel({ ...env, AK_RELEASE_NOTES_FILE: "some-history.json" }));
    const other = config.channel === "stable" ? "canary" : "stable";
    assert.throws(() => resolveReleaseChannel({ ...env, AK_RELEASE_CHANNEL: other }));
  }
});
test("direct deployment targets require all three values; local branch names choose nothing", () => {
  assert.equal(resolveReleaseChannel({ CF_PAGES_BRANCH: "release/canary" }).channel, "stable");
  for (const config of Object.values(RELEASE_CHANNELS)) {
    const env = { AK_RELEASE_CHANNEL: config.channel, AK_DEPLOY_PROJECT: config.pagesProject, AK_DEPLOY_BRANCH: config.branch };
    assert.equal(resolveReleaseChannel(env), config);
    assert.throws(() => resolveReleaseChannel({ ...env, AK_DEPLOY_BRANCH: undefined }));
    assert.throws(() => resolveReleaseChannel({ ...env, AK_DEPLOY_PROJECT: undefined }));
  }
});
test("missing channel means historical stable only, never malformed metadata", () => {
  assert.equal(releaseChannel(undefined), "stable");
  assert.equal(sameReleaseChannel(undefined, "stable"), true);
  assert.equal(sameReleaseChannel(undefined, "canary"), false);
  for (const value of [null, "", "preview", false]) assert.equal(sameReleaseChannel(value, "stable"), false);
  assert.equal(sameReleaseChannel("canary", "stable"), false);
  assert.equal(sameReleaseChannel("canary", "canary"), true);
});
test("known public origins reject the other build, while local smoke is explicit", () => {
  for (const config of Object.values(RELEASE_CHANNELS)) {
    assert.doesNotThrow(() => assertReleaseOrigin(config.channel, config.origin));
    assert.doesNotThrow(() => assertReleaseOrigin(config.channel, "http://127.0.0.1:4189"));
    const other = config.channel === "stable" ? "canary" : "stable";
    assert.throws(() => assertReleaseOrigin(other, config.origin));
    assert.throws(() => assertReleaseOrigin(other, `https://${config.pagesProject}.pages.dev`));
  }
});

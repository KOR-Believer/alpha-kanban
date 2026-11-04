export type ReleaseChannel = "stable" | "canary";
export type ChannelConfig = Readonly<{ channel: ReleaseChannel; origin: string; name: string; pagesProject: string; branch: string; historyFile: string; icon: "folder" | "flask"; accent: "olive" | "purple" }>;
export const RELEASE_CHANNELS: Readonly<Record<ReleaseChannel, ChannelConfig>>;
export function releaseChannel(value?: unknown): ReleaseChannel;
export function sameReleaseChannel(value: unknown, expected: unknown): boolean;
export function resolveReleaseChannel(env?: Record<string, string | undefined>): ChannelConfig;
export function assertReleaseOrigin(channel: unknown, origin: string): void;

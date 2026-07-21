#!/usr/bin/env node

const args = process.argv.slice(2);
const url = args.find((arg) => !arg.startsWith("--")) ?? "http://127.0.0.1:5174/api/health";
const timeoutArg = readOption(args, "--timeout-ms");
const intervalArg = readOption(args, "--interval-ms");
const timeoutMs = parsePositiveInteger(timeoutArg ?? process.env.WAIT_FOR_URL_TIMEOUT_MS, 30_000);
const intervalMs = parsePositiveInteger(intervalArg ?? process.env.WAIT_FOR_URL_INTERVAL_MS, 250);
const requestTimeoutMs = Math.min(intervalMs, 1_000);

console.log(`Waiting for ${url}`);

const startedAt = Date.now();
let lastError = "";

while (Date.now() - startedAt < timeoutMs) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (response.ok) {
      console.log(`Ready: ${url}`);
      process.exit(0);
    }

    lastError = `HTTP ${response.status}`;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  await delay(intervalMs);
}

console.error(`Timed out waiting for ${url}${lastError ? ` (${lastError})` : ""}`);
process.exit(1);

function readOption(values, name) {
  const index = values.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return values[index + 1];
}

function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Deliberately standalone: no app modules, DB writes, registration sweeps or storage resets.
const copy = {
  ko: {
    title: "앱 복구", description: "화면이 열리지 않거나 오래된 화면에 머물러 있나요? 인터넷에 연결한 뒤 다른 Alpha Kanban 창을 모두 닫고 다시 시도하세요.",
    preserved: "연결한 폴더, 사용자 설정과 파일 저장 복구 기록은 지우지 않습니다. 원본 Markdown도 변경하지 않습니다.",
    button: "앱 파일 다시 받기", return: "앱으로 돌아가기", busy: "다른 Alpha Kanban 탭과 설치된 앱 창을 모두 닫은 뒤 다시 시도해 주세요.",
    offline: "앱 복구에는 인터넷 연결이 필요합니다. 기존 앱 파일은 그대로 두었습니다.",
    checking: "앱 파일을 확인하고 있습니다...", done: "앱 파일을 다시 받았습니다. 앱으로 돌아가세요.",
    failed: "복구를 마치지 못했습니다. 인터넷 연결을 확인하고 다른 앱 창을 모두 닫은 뒤 다시 시도하세요. 계속 실패하면 브라우저를 종료했다가 다시 열어 주세요.",
    retired: "오프라인 앱 등록을 정리했습니다. 폴더 연결과 설정은 그대로 남아 있습니다.",
  },
  en: {
    title: "Repair app", description: "Is the app stuck or showing an old screen? Connect to the internet and close all other Alpha Kanban windows before trying again.",
    preserved: "Connected folders, preferences and file recovery records are kept. Your original Markdown files are not changed.",
    button: "Download app files again", return: "Return to the app", busy: "Close other Alpha Kanban tabs and installed app windows, then try again.",
    offline: "App repair needs an internet connection. Existing app files were kept.",
    checking: "Checking app files...", done: "App files are ready. Return to the app.",
    failed: "Repair could not finish. Check your connection and close other app windows, then try again. If it still fails, quit and reopen the browser.",
    retired: "Offline app registration was removed. Connected folders and preferences were kept.",
  },
};
const prefix = "alpha-kanban-app-v1-";
const button = document.querySelector("#repair");
const result = document.querySelector("#result");
const language = document.querySelector("#language");
let resultKey = "";
function render() {
  document.documentElement.lang = language.value;
  for (const element of document.querySelectorAll("[data-copy]")) element.textContent = copy[language.value][element.dataset.copy];
  result.textContent = resultKey ? copy[language.value][resultKey] : "";
}
try { language.value = localStorage.getItem("alpha-kanban.locale") === "en" ? "en" : "ko"; } catch { /* Storage is not needed for repair. */ }
language.onchange = render;
render();
const say = (key) => { resultKey = key; render(); };
const owned = (registration) => registration?.scope === location.origin + "/" &&
  [registration.active, registration.waiting, registration.installing].some((worker) => worker?.scriptURL === location.origin + "/sw.js");
function message(worker, type) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("busy")); }, 5000);
    channel.port1.onmessage = (event) => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    worker.postMessage({ type, protocol: 1 }, [channel.port2]);
  });
}
async function fresh(path, integrity) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) throw new Error("failed");
  url.searchParams.set("ak-repair", crypto.randomUUID());
  const response = await fetch(url, { cache: "no-store", integrity, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("failed");
  return response;
}
async function waitForWorker(registration) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (registration.waiting) {
      const reply = await message(registration.waiting, "AK_APPLY");
      if (!reply.ok) throw new Error("busy");
    }
    const active = registration.active;
    if (active?.state === "activated") {
      const info = await message(active, "AK_INFO");
      if (info.mode === "app" && info.ready) return info;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("failed");
}
button.onclick = async () => {
  if (!navigator.onLine) { say("offline"); return; }
  button.disabled = true; say("checking");
  try {
    if (!navigator.locks || !navigator.serviceWorker) throw new Error("failed");
    let registration = await navigator.serviceWorker.getRegistration("/");
    if (registration && !owned(registration)) throw new Error("failed");
    if (registration?.active) {
      const reply = await message(registration.active, "AK_CLIENTS");
      if (reply.count) throw new Error("busy");
    }
    const release = await (await fresh("/release.json")).json();
    if (release.app !== "alpha-kanban" || release.protocol !== 1) throw new Error("failed");
    if (release.mode === "retired") {
      await registration?.update();
      if (registration?.waiting && !(await message(registration.waiting, "AK_APPLY")).ok) throw new Error("busy");
      for (let attempt = 0; attempt < 50 && await navigator.serviceWorker.getRegistration("/"); attempt++) await new Promise((resolve) => setTimeout(resolve, 200));
      if (await navigator.serviceWorker.getRegistration("/")) throw new Error("busy");
      await navigator.locks.request("alpha-kanban:pwa-session-v1", { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error("busy");
        for (const name of await caches.keys()) if (name.startsWith(prefix)) await caches.delete(name);
      });
      say("retired"); return;
    }
    const inventory = await (await fresh("/offline-assets.json")).json();
    if (inventory.buildId !== release.buildId || !Array.isArray(inventory.assets) || !inventory.assets.some((asset) => asset.url === "index.html")) throw new Error("failed");
    const responses = [];
    // Verify the entire release before changing any existing app cache.
    for (const asset of inventory.assets) responses.push([asset, await fresh("/" + asset.url, asset.integrity)]);
    await navigator.locks.request("alpha-kanban:pwa-session-v1", { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error("busy");
      const cache = await caches.open(prefix + release.buildId);
      for (const [asset, response] of responses) {
        const key = new URL(asset.url, location.origin);
        if (asset.revision) key.searchParams.set("__WB_REVISION__", asset.revision);
        await cache.put(key, response);
      }
    });
    registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await registration.update();
    const info = await waitForWorker(registration);
    if (info.buildId !== release.buildId) throw new Error("failed");
    // The active worker cleans only obsolete app assets after checking every open app client.
    await message(registration.active, "AK_COLLECT");
    say("done");
  } catch (error) { say(error.message === "busy" ? "busy" : "failed"); }
  finally { button.disabled = false; }
};

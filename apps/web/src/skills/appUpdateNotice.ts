// Acknowledgement is persisted in the skill journal first. This carries only
// its ID to already-open views; it never authorizes or performs a file update.
const ACKNOWLEDGED = "alpha-kanban:skill-update-acknowledged";

export function notifyAppUpdateAcknowledged(id: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACKNOWLEDGED, { detail: id }));
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(ACKNOWLEDGED);
    channel.postMessage(id);
  } catch { /* Focus/reopening also checks the durable acknowledgement. */ }
  finally { channel?.close(); }
}

export function subscribeAppUpdateAcknowledged(listener: (id: string) => void) {
  const local = (event: Event) => {
    const id = (event as CustomEvent<unknown>).detail;
    if (typeof id === "string") listener(id);
  };
  window.addEventListener(ACKNOWLEDGED, local);
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(ACKNOWLEDGED);
    channel.onmessage = event => { if (typeof event.data === "string") listener(event.data); };
  } catch { /* Window focus remains a read-only fallback. */ }
  return () => { window.removeEventListener(ACKNOWLEDGED, local); channel?.close(); };
}

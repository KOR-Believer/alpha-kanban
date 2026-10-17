export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export class AppInstaller {
  private promptEvent?: InstallPrompt;
  private listeners = new Set<() => void>();
  private state = { available: false, installed: false, prompting: false, failed: false };
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<typeof this.state>) { this.state = { ...this.state, ...next }; this.listeners.forEach((listener) => listener()); }
  start(target: Window = window) {
    const display = target.matchMedia("(display-mode: standalone)");
    const installed = () => { this.promptEvent = undefined; this.update({ available: false, installed: true }); };
    const before = (event: Event) => { event.preventDefault(); this.promptEvent = event as InstallPrompt; this.update({ available: true, installed: false, failed: false }); };
    const displayChanged = () => { if (display.matches) installed(); };
    this.update({ installed: display.matches });
    target.addEventListener("beforeinstallprompt", before);
    target.addEventListener("appinstalled", installed);
    display.addEventListener("change", displayChanged);
    return () => { target.removeEventListener("beforeinstallprompt", before); target.removeEventListener("appinstalled", installed); display.removeEventListener("change", displayChanged); };
  }
  async install() {
    const event = this.promptEvent;
    if (!event || this.state.prompting) return;
    this.promptEvent = undefined;
    this.update({ available: false, prompting: true, failed: false });
    try {
      await event.prompt();
      await event.userChoice;
      // Accepted means the prompt was accepted; only appinstalled confirms completion.
    } catch { this.update({ failed: true }); }
    finally { this.update({ prompting: false }); }
  }
}

export const appInstaller = new AppInstaller();

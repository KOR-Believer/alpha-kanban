import type { TicketDetailMode } from "../../appRoute";
import { usePanelPresentation, type PanelPreferences } from "../ui/usePanelPresentation";

const preferences: PanelPreferences = {
  modeKey: "alpha-kanban.ticketDetailMode",
  sizeKey: "alpha-kanban.ticketDetailModalSize",
  defaultMode: "side",
  defaultSize: { width: 1000, height: 800 },
  side: { widthKey: "alpha-kanban.ticketDetailWidth", defaultWidth: 720 },
};

export function useTicketDetailPresentation(routeMode?: TicketDetailMode, onModeChange?: (mode: TicketDetailMode) => void) {
  return usePanelPresentation(preferences, routeMode, onModeChange);
}

export { detailLimits, fitDetailSize, resizeDetailSize } from "../ui/usePanelPresentation";
export type { DetailSize, ResizeEdge, PanelPresentation as TicketDetailPresentation } from "../ui/usePanelPresentation";

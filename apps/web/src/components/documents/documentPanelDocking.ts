import { MIN_SIDE_DOCK_WIDTH, isSideDock, type PanelPlacement, type PanelSize } from "./documentPanelState";

// Tuning point: 0.20 means the central 20% of BOTH the workspace width and height.
// Hit testing and the visible neutral rectangle always use this same value.
export const DOCK_NEUTRAL_ZONE_RATIO = 0.20;
export const DOCK_DRAG_THRESHOLD_PX = 6;

export function neutralDockBounds(area: PanelSize, ratio = DOCK_NEUTRAL_ZONE_RATIO) {
  const fraction = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : DOCK_NEUTRAL_ZONE_RATIO;
  const width = area.width * fraction, height = area.height * fraction;
  return { x: (area.width - width) / 2, y: (area.height - height) / 2, width, height };
}

/** The two diagonals divide the workspace into four directional triangles. */
export function getCardinalDirection(x: number, y: number, area: PanelSize): PanelPlacement | null {
  if (![x, y, area.width, area.height].every(Number.isFinite) || area.width <= 0 || area.height <= 0 ||
    x < 0 || y < 0 || x > area.width || y > area.height) return null;
  const nx = x / area.width, ny = y / area.height;
  if (ny < nx && ny < 1 - nx) return "top";
  if (ny >= nx && ny >= 1 - nx) return "bottom";
  return nx > .5 ? "right" : "left";
}

export function panelDockTarget(x: number, y: number, area: PanelSize, neutralRatio = DOCK_NEUTRAL_ZONE_RATIO): PanelPlacement | null {
  const direction = getCardinalDirection(x, y, area);
  if (!direction || (isSideDock(direction) && area.width < MIN_SIDE_DOCK_WIDTH)) return null;
  const neutral = neutralDockBounds(area, neutralRatio);
  if (neutral.width > 0 && neutral.height > 0 && x >= neutral.x && x <= neutral.x + neutral.width && y >= neutral.y && y <= neutral.y + neutral.height) return null;
  return direction;
}

import { MoveDiagonal2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { PanelPresentation, ResizeEdge } from "./usePanelPresentation";

export function PanelResizeHandles({ presentation, label, tourLayout = false }: {
  presentation: PanelPresentation;
  label: (edge: ResizeEdge) => string;
  tourLayout?: boolean;
}) {
  const { t } = useTranslation();
  if (presentation.mode === "full") return null;
  const edges: ResizeEdge[] = presentation.mode === "side" ? ["left"] : ["left", "right", "top", "bottom", "bottom-right"];
  return edges.map((edge) => {
    const vertical = edge === "top" || edge === "bottom";
    const corner = edge === "bottom-right";
    return <button key={edge} type="button" className="ak-focus-ring ak-panel-resize-handle" data-edge={edge} data-tour-layout={tourLayout || undefined}
      role={corner ? undefined : "separator"} aria-label={label(edge)}
      aria-orientation={corner ? undefined : vertical ? "horizontal" : "vertical"}
      aria-valuemin={corner ? undefined : vertical ? presentation.limits.minHeight : presentation.limits.minWidth}
      aria-valuemax={corner ? undefined : vertical ? presentation.limits.maxHeight : presentation.limits.maxWidth}
      aria-valuenow={corner ? undefined : vertical ? presentation.height : presentation.width}
      title={t("Drag to resize. Double-click to reset.")}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        presentation.startResize(edge, event.clientX, event.clientY, event.pointerId);
      }}
      onDoubleClick={presentation.resetSize}
      onKeyUp={(event) => {
        if (tourLayout && event.key.startsWith("Arrow")) event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 10;
        if (event.key === "Home" || event.key === "End") presentation.resizeToLimit(edge, event.key === "Home" ? "min" : "max");
        else if (event.key === "Enter" || event.key === " ") presentation.resetSize();
        else presentation.nudgeResize(edge, event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0);
      }}>
      {corner ? <MoveDiagonal2 className="size-3" aria-hidden="true" /> : <span aria-hidden="true" />}
    </button>;
  });
}

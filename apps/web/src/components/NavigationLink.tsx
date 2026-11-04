import type { ComponentProps, MouseEvent } from "react";

/** Intercept only ordinary navigation; let the browser own new tabs and copied URLs. */
export function NavigationLink({ href, onNavigate, disabled, onClick, ...props }: Omit<ComponentProps<"a">, "href"> & {
  href: string;
  onNavigate?: () => void;
  disabled?: boolean;
}) {
  function click(event: MouseEvent<HTMLAnchorElement>) {
    if (disabled) { event.preventDefault(); return; }
    onClick?.(event);
    if (!onNavigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || (props.target && props.target !== "_self") || props.download != null) return;
    event.preventDefault();
    onNavigate();
  }
  return <a {...props} href={disabled ? undefined : href} aria-disabled={disabled || undefined}
    tabIndex={disabled ? -1 : props.tabIndex} onClick={click} />;
}

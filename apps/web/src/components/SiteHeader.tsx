import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type Ref } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useTranslation } from "../i18n";
import { AppBrand } from "./AppBrand";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeToggle } from "./ThemeToggle";
import { NavigationLink } from "./NavigationLink";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const pages = [
  { href: "/", label: "Kanban" },
  { href: "/docs", label: "Documentation" },
  { href: "/releases", label: "Releases" },
  { href: "/about", label: "About" },
] as const;

export function useSiteHeaderSize() {
  const header = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(56);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () => setHeaderHeight(Math.ceil(element.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { header, headerHeight };
}

export function SiteHeader({ page, tools, onNavigate, className = "", ref }: {
  page: typeof pages[number]["href"];
  tools?: ReactNode;
  onNavigate?: (href: string) => void;
  className?: string;
  ref?: Ref<HTMLElement>;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigating = useRef(false);
  function closeMenu(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    navigating.current = true;
    setMenuOpen(false);
  }
  function links() {
    return pages.map(item => {
      const props = {
        className: "ak-site-link ak-focus-ring",
        "aria-current": item.href === page ? "page" as const : undefined,
        onClick: closeMenu,
        children: t(item.label),
      };
      return onNavigate
        ? <NavigationLink key={item.href} href={item.href} onNavigate={() => onNavigate(item.href)} {...props} />
        : <Link key={item.href} to={item.href} {...props} />;
    });
  }
  return <header ref={ref} className={`ak-site-header ${className}`}>
    <div className="ak-site-heading">
      <Link to="/" className="ak-public-brand ak-focus-ring"><AppBrand /></Link>
      <nav className="ak-site-navigation" aria-label={t("Site navigation")}>{links()}</nav>
      <Popover open={menuOpen} onOpenChange={open => { navigating.current = false; setMenuOpen(open); }}>
        <PopoverTrigger asChild><Button className="ak-site-menu-trigger" size="iconSm" variant="ghost" title={t("Site navigation")} aria-label={t("Site navigation")}><Menu aria-hidden="true" /></Button></PopoverTrigger>
        <PopoverContent className="ak-site-menu" align="start" aria-label={t("Site navigation")} onCloseAutoFocus={event => { if (navigating.current) event.preventDefault(); }}>
          <nav aria-label={t("Site navigation")}>{links()}</nav>
        </PopoverContent>
      </Popover>
    </div>
    <div className="ak-site-tools">
      <div className="ak-site-preferences"><LanguageSelector /><ThemeToggle /></div>
      {tools ? <><span aria-hidden="true" className="ak-toolbar-divider" /><div className="ak-site-actions">{tools}</div></> : null}
    </div>
  </header>;
}

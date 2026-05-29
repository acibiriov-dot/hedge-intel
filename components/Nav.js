"use client";
//
// Единая шапка навигации hedge-intel.
//
// Монтируется в app/layout.js → присутствует на КАЖДОЙ странице.
// App Router сохраняет layout между переходами, поэтому шапка не
// перерисовывается при смене маршрута — она остаётся на месте, активный
// пункт переключается через usePathname().
//
// Доступ: шапка отображается только после ввода пароля (localStorage.hi_access).
// На locked-screen каждой страницы (/dashboard, /volatility, ...) шапка скрыта
// — пока пользователь не залогинен, меню ему не нужно.
//
// После успешного login страница должна dispatch'нуть `hi-access-changed`
// event — Nav слушает его и перерисовывается. Это нужно потому что
// localStorage events в том же табе браузером не эмитируются.
//
// Стиль — по DESIGN_CODE.md: --bg-alt, --divider, --capital-emerald для
// активного пункта. SF Pro Display fallback Inter. Спокойно, без неона.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const KEY_ACCESS = "hi_access";

// Порядок строго по задаче. /decision-engine — будущая страница,
// /covered-call намеренно убран из меню (страница пока остаётся в файлах).
const NAV_ITEMS = [
  { href: "/dashboard",       label: "Главная" },
  { href: "/options",         label: "Анализ опционов" },
  { href: "/volatility",      label: "Волатильность" },
  { href: "/strategies",      label: "Стратегии" },
  { href: "/smart-strategy",  label: "Умная стратегия" },
  { href: "/decision-engine", label: "Движок решений" },
  { href: "/briefing",        label: "Брифинг" },
];

export default function Nav() {
  const pathname = usePathname();
  const [hasAccess, setHasAccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const recheck = () => {
      try { setHasAccess(localStorage.getItem(KEY_ACCESS) === "1"); } catch {}
    };
    recheck();
    // "storage" — кросс-таб событие; "hi-access-changed" — наш кастомный
    // диспатч из page.js'ов после login/logout в том же табе.
    window.addEventListener("storage", recheck);
    window.addEventListener("hi-access-changed", recheck);
    return () => {
      window.removeEventListener("storage", recheck);
      window.removeEventListener("hi-access-changed", recheck);
    };
  }, []);

  function logout() {
    try { localStorage.removeItem(KEY_ACCESS); } catch {}
    setHasAccess(false);
    window.dispatchEvent(new Event("hi-access-changed"));
    // Полная перезагрузка → каждая открытая страница перечитает
    // localStorage и покажет lock screen. Самый надёжный способ
    // не оставить пользователю доступ к контенту после logout'а.
    window.location.reload();
  }

  // SSR/CSR mismatch protection — рендерим только после mount'а.
  if (!mounted || !hasAccess) return null;

  return (
    <nav style={S.bar}>
      <div style={S.inner}>
        <a href="/dashboard" style={S.brand}>HEDGE INTEL</a>
        <div style={S.links}>
          {NAV_ITEMS.map((item) => {
            // Активная вкладка — точное совпадение пути или nested route
            // (например /options/some-detail тоже подсвечивает "Анализ опционов").
            const active =
              pathname === item.href ||
              (pathname && pathname.startsWith(item.href + "/"));
            return (
              <a key={item.href} href={item.href} style={active ? S.linkActive : S.link}>
                {item.label}
              </a>
            );
          })}
        </div>
        <button onClick={logout} style={S.logout}>Выход</button>
      </div>
    </nav>
  );
}

// ── Стили ───────────────────────────────────────────────────────────────────
// Палитра из DESIGN_CODE.md. SF Pro Display → fallback Inter.
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Inter, 'Helvetica Neue', sans-serif";

const C = {
  bgAlt:         "#1A1E23",
  divider:       "#2A2E34",
  emerald:       "#12473D",
  textWhite:     "#FFFFFF",
  textPrimary:   "#D6D9DE",
  textSecondary: "#9CA3AF",
};

const S = {
  bar: {
    background: C.bgAlt,
    borderBottom: `1px solid ${C.divider}`,
    fontFamily: FONT_SANS,
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  inner: {
    maxWidth: 1400,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: 20,
    padding: "10px 24px",
  },
  brand: {
    color: C.textWhite,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1.6,
    paddingRight: 20,
    marginRight: 4,
    borderRight: `1px solid ${C.divider}`,
    textDecoration: "none",
    flex: "0 0 auto",
    fontFamily: FONT_SANS,
  },
  links: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    flex: 1,
    flexWrap: "wrap",
  },
  link: {
    padding: "7px 12px",
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    borderRadius: 4,
    transition: "color 120ms ease, background 120ms ease",
  },
  linkActive: {
    padding: "7px 12px",
    color: C.textWhite,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    borderRadius: 4,
    background: C.emerald,
  },
  logout: {
    flex: "0 0 auto",
    padding: "7px 14px",
    background: "transparent",
    color: C.textSecondary,
    border: `1px solid ${C.divider}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: FONT_SANS,
  },
};

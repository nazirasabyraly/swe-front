import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

const WAIT_MS = 3000;

/**
 * Single-page navigation doesn't move focus or change the title on its own (WCAG 2.4.2, 2.4.3).
 * After each route change, wait for the page's <h1> (it may appear after data loads), then use it
 * as the document title and move focus to it, unless the user has already focused something
 * inside the page.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    const main = document.getElementById('main');
    if (!main) return;
    const isFirst = first.current;
    first.current = false;

    function apply(h1: HTMLElement) {
      document.title = `${h1.textContent?.trim()} · BiletFlow`;
      if (isFirst) return; // don't steal focus on the initial page load
      const active = document.activeElement;
      if (active && active !== document.body && main!.contains(active) && active !== main) return;
      h1.tabIndex = -1;
      h1.focus({ preventScroll: false });
    }

    const existing = main.querySelector('h1');
    if (existing) {
      apply(existing as HTMLElement);
      return;
    }
    const observer = new MutationObserver(() => {
      const h1 = main.querySelector('h1');
      if (h1) {
        observer.disconnect();
        apply(h1 as HTMLElement);
      }
    });
    observer.observe(main, { childList: true, subtree: true });
    const timer = setTimeout(() => observer.disconnect(), WAIT_MS);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}

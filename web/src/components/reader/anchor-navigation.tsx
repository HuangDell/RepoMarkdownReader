'use client';

import { useEffect } from 'react';

function idFromHash(hash: string) {
  if (!hash.startsWith('#') || hash.length <= 1) return '';

  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

function scrollToHash(hash: string) {
  const id = idFromHash(hash);
  if (!id) return false;

  const target = document.getElementById(id);
  if (!target) return false;

  target.scrollIntoView({ block: 'start' });
  return true;
}

export function AnchorNavigation() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest('a[href^="#"]');
      if (!(link instanceof HTMLAnchorElement)) return;

      const hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      if (!scrollToHash(hash)) return;

      event.preventDefault();
      window.history.pushState(null, '', hash);
    }

    function handleHashChange() {
      scrollToHash(window.location.hash);
    }

    document.addEventListener('click', handleClick);
    window.addEventListener('hashchange', handleHashChange);

    const timeout = window.setTimeout(() => {
      scrollToHash(window.location.hash);
    }, 0);

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('hashchange', handleHashChange);
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}

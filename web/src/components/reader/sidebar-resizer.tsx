'use client';

import { useEffect } from 'react';

type ResizablePanel = {
  elementId: string;
  widthVariable: string;
  positionVariable: string;
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  edge: 'left' | 'right';
  className: string;
  label: string;
  mediaQuery?: string;
};

const SIDEBAR: ResizablePanel = {
  elementId: 'nd-sidebar',
  widthVariable: '--fd-sidebar-width',
  positionVariable: '--reader-sidebar-resizer-left',
  storageKey: 'reader-sidebar-width',
  defaultWidth: 268,
  minWidth: 220,
  maxWidth: 480,
  edge: 'right',
  className: 'reader-sidebar-resizer',
  label: 'Resize Explorer',
};

const TOC: ResizablePanel = {
  elementId: 'nd-toc',
  widthVariable: '--fd-toc-width',
  positionVariable: '--reader-toc-resizer-left',
  storageKey: 'reader-toc-width',
  defaultWidth: 268,
  minWidth: 180,
  maxWidth: 460,
  edge: 'left',
  className: 'reader-toc-resizer',
  label: 'Resize outline',
  mediaQuery: '(min-width: 1280px)',
};

function clampWidth(panel: ResizablePanel, width: number) {
  return Math.min(panel.maxWidth, Math.max(panel.minWidth, width));
}

function readWidth(layout: HTMLElement, panel: ResizablePanel) {
  const width = Number.parseInt(getComputedStyle(layout).getPropertyValue(panel.widthVariable), 10);
  return Number.isFinite(width) ? width : panel.defaultWidth;
}

function LayoutResizer({ panel }: { panel: ResizablePanel }) {
  useEffect(() => {
    const layout = document.getElementById('nd-docs-layout');
    if (!layout) return;

    const media = panel.mediaQuery ? window.matchMedia(panel.mediaQuery) : null;
    let activeTarget: HTMLElement | null = null;
    let detachTarget = () => undefined;

    const attachTarget = () => {
      const target = document.getElementById(panel.elementId);
      if (target === activeTarget) return;

      detachTarget();
      if (!target) return;
      activeTarget = target;

      const syncPosition = () => {
        if (media && !media.matches) return;
        const bounds = target.getBoundingClientRect();
        const position = panel.edge === 'left' ? bounds.left : bounds.right;
        layout.style.setProperty(panel.positionVariable, `${position}px`);
      };

      const applyVisibility = () => {
        if (media && !media.matches) {
          layout.style.removeProperty(panel.widthVariable);
          layout.style.removeProperty(panel.positionVariable);
          return;
        }

        const savedWidth = Number.parseInt(window.localStorage.getItem(panel.storageKey) ?? '', 10);
        if (Number.isFinite(savedWidth)) {
          layout.style.setProperty(panel.widthVariable, `${clampWidth(panel, savedWidth)}px`);
        }
        syncPosition();
      };

      applyVisibility();
      window.addEventListener('resize', syncPosition);
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncPosition);
      observer?.observe(target);
      media?.addEventListener('change', applyVisibility);

      detachTarget = () => {
        window.removeEventListener('resize', syncPosition);
        observer?.disconnect();
        media?.removeEventListener('change', applyVisibility);
        layout.style.removeProperty(panel.widthVariable);
        layout.style.removeProperty(panel.positionVariable);
        activeTarget = null;
      };
    };

    const mutationObserver = new MutationObserver(attachTarget);
    mutationObserver.observe(layout, { childList: true, subtree: true });
    attachTarget();

    return () => {
      mutationObserver.disconnect();
      detachTarget();
    };
  }, [panel]);

  function setWidth(layout: HTMLElement, nextWidth: number) {
    const width = clampWidth(panel, nextWidth);
    layout.style.setProperty(panel.widthVariable, `${width}px`);
    window.localStorage.setItem(panel.storageKey, String(width));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const layout = document.getElementById('nd-docs-layout');
    if (!layout) return;

    const startWidth = readWidth(layout, panel);
    const startX = event.clientX;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const direction = panel.edge === 'right' ? 1 : -1;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (moveEvent: PointerEvent) => {
      setWidth(layout, startWidth + (moveEvent.clientX - startX) * direction);
    };
    const handleUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', handleUp, { once: true });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const layout = document.getElementById('nd-docs-layout');
    if (!layout) return;

    const step = panel.edge === 'right' ? 8 : -8;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setWidth(layout, readWidth(layout, panel) + (event.key === 'ArrowRight' ? step : -step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setWidth(layout, panel.minWidth);
    } else if (event.key === 'End') {
      event.preventDefault();
      setWidth(layout, panel.maxWidth);
    }
  }

  return (
    <div
      className={`reader-layout-resizer ${panel.className}`}
      role="separator"
      aria-label={panel.label}
      aria-orientation="vertical"
      aria-valuemin={panel.minWidth}
      aria-valuemax={panel.maxWidth}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    />
  );
}

export function SidebarResizer() {
  return <LayoutResizer panel={SIDEBAR} />;
}

export function TocResizer() {
  return <LayoutResizer panel={TOC} />;
}

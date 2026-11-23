"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

const MIN_WIDTH = 240;
const MAX_WIDTH = 560;
const KEYBOARD_STEP = 16;
const LIST_AND_THREAD_WIDTH = 580;

export function ResizableContactPanel({ children, width, onWidthChange }: {
  children: ReactNode;
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const t = useTranslations("Inbox.sidebar");
  const panelRef = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [maxWidth, setMaxWidth] = useState(MAX_WIDTH);

  useEffect(() => {
    const container = panelRef.current?.parentElement;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setMaxWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(entry.contentRect.width) - LIST_AND_THREAD_WIDTH)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const visibleWidth = Math.min(width, maxWidth);
  const resize = (next: number) => onWidthChange(Math.max(MIN_WIDTH, Math.min(maxWidth, next)));

  return (
    <aside ref={panelRef} aria-label={t("contactInfo")} className="relative hidden h-full shrink-0 lg:block" style={{ width: visibleWidth }}>
      <div
        role="separator"
        aria-label={t("resizeContactPanel")}
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={visibleWidth}
        tabIndex={0}
        className="absolute inset-y-0 -left-1 z-10 w-2 touch-none cursor-col-resize select-none hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none active:bg-primary/60"
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, x: event.clientX, width: visibleWidth };
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start?.pointerId === event.pointerId) resize(start.width + start.x - event.clientX);
        }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={(event) => {
          switch (event.key) {
            case "ArrowLeft": resize(visibleWidth + KEYBOARD_STEP); break;
            case "ArrowRight": resize(visibleWidth - KEYBOARD_STEP); break;
            case "Home": resize(MIN_WIDTH); break;
            case "End": resize(maxWidth); break;
            default: return;
          }
          event.preventDefault();
        }}
      />
      {children}
    </aside>
  );
}

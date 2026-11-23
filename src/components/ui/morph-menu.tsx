'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './morph-menu.module.css';

export interface MorphMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Set false when the action opens a dialog that takes focus. */
  restoreFocus?: boolean;
}

export interface MorphMenuProps {
  items: readonly MorphMenuItem[];
  label: string;
  title?: string;
  disabled?: boolean;
  size?: 36 | 44;
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
  className?: string;
  triggerIcon?: ReactNode;
}

/** Liquid glass action menu with keyboard navigation and viewport collision handling. */
export function MorphMenu({
  items,
  label,
  title,
  disabled = false,
  size = 44,
  side = 'bottom',
  align = 'end',
  className,
  triggerIcon,
}: MorphMenuProps) {
  const restoreFocus = useRef(true);
  const longestLabel = Math.max(0, ...items.map((item) => item.label.length));
  const dimensions = {
    '--morph-size': `${size}px`,
    '--morph-width': `${Math.max(160, Math.min(260, longestLabel * 7.5 + 62))}px`,
  } as CSSProperties;

  return (
    <Menu.Root
      modal={false}
      disabled={disabled || items.length === 0}
      onOpenChange={(open) => {
        if (open) restoreFocus.current = true;
      }}
    >
      <Menu.Trigger
        aria-label={label}
        title={title ?? label}
        className={cn(styles.trigger, className)}
        style={dimensions}
      >
        {triggerIcon ?? <MoreVertical size={18} aria-hidden="true" />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side={side}
          align={align}
          sideOffset={-size}
          collisionPadding={8}
          className={styles.positioner}
          style={dimensions}
        >
          <Menu.Popup
            aria-label={label}
            className={styles.popup}
            finalFocus={() => restoreFocus.current}
          >
            <div className={styles.surface} aria-hidden="true" />
            <div className={styles.content}>
              {items.map(
                ({ id, label: itemLabel, icon: Icon, ...item }, index) => (
                  <Menu.Item
                    key={id}
                    render={<button type="button" />}
                    nativeButton
                    label={itemLabel}
                    disabled={disabled || item.disabled}
                    data-danger={item.danger || undefined}
                    className={styles.item}
                    style={
                      {
                        '--morph-delay': `${100 + Math.min(index, 8) * 40}ms`,
                      } as CSSProperties
                    }
                    onClick={() => {
                      restoreFocus.current = item.restoreFocus ?? true;
                      item.onClick();
                    }}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{itemLabel}</span>
                  </Menu.Item>
                )
              )}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

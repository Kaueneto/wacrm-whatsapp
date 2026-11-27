'use client';

import Link, { useLinkStatus } from 'next/link';
import { OctaLogo } from '@/components/brand/octa-logo';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import {
  Bell,
  Bot,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  Radio,
  CalendarClock,
  ChevronDown,
  FileText,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  UsersRound,
  Tags,
  Workflow,
  X,
  Zap,
  Loader2,
  Settings,
  Wallet,
} from 'lucide-react';
import type { AccountRole } from '@/lib/auth/roles';
import { canAccessWorkspacePage } from '@/lib/auth/workspace-access';
import { SHOW_PIPELINES } from '@/lib/feature-visibility';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import motion from '@/components/ui/surface-motion.module.css';

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
}

const primaryItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/inbox', labelKey: 'inbox', icon: MessageSquare },
  { href: '/notifications', labelKey: 'notifications', icon: Bell },
];

interface NavGroup {
  labelKey: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    labelKey: 'relationshipGroup',
    icon: Users,
    items: [
      { href: '/contacts', labelKey: 'contacts', icon: Users },
      { href: '/collections', labelKey: 'collections', icon: Wallet },
      { href: '/pipelines', labelKey: 'pipelines', icon: GitBranch },
      { href: '/tags', labelKey: 'tags', icon: Tags },
    ],
  },
  {
    labelKey: 'campaigns',
    icon: Megaphone,
    items: [
      { href: '/campaigns', labelKey: 'campaigns', icon: CalendarClock },
      { href: '/broadcasts', labelKey: 'broadcasts', icon: Radio },
      {
        href: '/campaigns/templates',
        labelKey: 'templates',
        icon: FileText,
      },
    ],
  },
  {
    labelKey: 'automationGroup',
    icon: Zap,
    items: [
      { href: '/automations', labelKey: 'automations', icon: Zap },
      { href: '/flows', labelKey: 'flows', icon: Workflow },
      { href: '/agents', labelKey: 'aiAgents', icon: Bot },
    ],
  },
];

const organizationItem: NavItem = {
  href: '/organization', labelKey: 'organization', icon: UsersRound,
};
const settingsItem: NavItem = { href: '/settings', labelKey: 'settings', icon: Settings };

const desktopQuery = '(min-width: 64rem)';
const collapsePreference = 'wacrm.sidebar.collapsed';

function subscribeToDesktop(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function readCollapsePreference() {
  try {
    return window.localStorage.getItem(collapsePreference) === 'true';
  } catch {
    return false;
  }
}

const navRowClass = cn(
  motion.sidebarRow,
  'group/nav relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground focus-visible:bg-muted/80 focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-safe:transition-[background-color,color,box-shadow] motion-safe:duration-150 lg:min-h-9',
);

const navLabelClass =
  'min-w-0 flex-1 origin-left truncate motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:group-hover/nav:scale-[1.045] motion-safe:group-focus-visible/nav:scale-[1.045]';

const activeRowClass =
  'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary focus-visible:bg-primary/15 focus-visible:text-primary';

function NavigationPending({ compact }: { compact: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <Loader2
      aria-hidden="true"
      className={cn(
        'size-3.5 shrink-0',
        compact && 'absolute bottom-0.5 left-0.5 size-2.5',
        pending ? 'opacity-100 motion-safe:animate-spin' : 'opacity-0',
      )}
    />
  );
}

function SidebarGroup({
  label,
  icon: Icon,
  active,
  compact,
  compactItems,
  children,
}: {
  label: string;
  icon: NavGroup['icon'];
  active: boolean;
  compact: boolean;
  compactItems: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(active);
  const [wasActive, setWasActive] = useState(active);
  // Reveal a group when navigation enters it, keeping the previous groups open.
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setExpanded(true);
  }

  if (compact) {
    return (
      <li>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger render={
              <DropdownMenuTrigger
                aria-label={label}
                className={cn(navRowClass, 'justify-center px-0', active && activeRowClass)}
              />
            }>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>{label}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" sideOffset={12} className="min-w-44 p-1.5">
            {compactItems}
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((previous) => !previous)}
        className={cn(navRowClass, active && 'text-foreground')}
      >
        <Icon className="size-4 shrink-0" />
        <span className={navLabelClass}>{label}</span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 motion-safe:transition-transform',
            expanded && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>
      <ul
        id={id}
        hidden={!expanded}
        className="border-border ml-5 space-y-1 border-l pl-2"
      >
        {children}
      </ul>
    </li>
  );
}

interface NavigationProps {
  pathname: string;
  accountRole: AccountRole | null;
  totalUnread: number;
  unreadNotifications: number;
  compact: boolean;
  onNavigate?: () => void;
}

function SidebarNavigation({
  pathname,
  accountRole,
  totalUnread,
  unreadNotifications,
  compact,
  onNavigate,
}: NavigationProps) {
  const t = useTranslations('Sidebar');

  const visibleItems = (items: NavItem[]) =>
    items.filter((item) =>
      (SHOW_PIPELINES || item.href !== '/pipelines') &&
      accountRole && canAccessWorkspacePage(accountRole, item.href)
    );

  function isActive(item: NavItem) {
    if (item.href === '/campaigns' && (pathname === '/campaigns/templates' || pathname.startsWith('/campaigns/templates/'))) return false;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  function renderItem(item: NavItem) {
    const active = isActive(item);
    const label = t(item.labelKey);
    const hasUnreadInbox = item.href === '/inbox' && totalUnread > 0 && !active;
    const hasUnreadNotifications = item.href === '/notifications' && unreadNotifications > 0;
    const unreadLabel = hasUnreadInbox
      ? t('unreadConversations', { count: totalUnread })
      : hasUnreadNotifications
        ? t('unreadNotifications', { count: unreadNotifications })
        : undefined;
    const link = (
      <Link
        href={item.href}
        prefetch={item.href === '/organization' ? true : undefined}
        onNavigate={onNavigate}
        aria-label={compact ? label : undefined}
        aria-description={unreadLabel}
        aria-current={active ? 'page' : undefined}
        className={cn(navRowClass, compact && 'justify-center px-0', active && activeRowClass)}
      >
        <item.icon className="size-4 shrink-0" aria-hidden="true" />
        {!compact && <span className={navLabelClass}>{label}</span>}
        <NavigationPending compact={compact} />
        {hasUnreadInbox && (
          <span
            aria-hidden="true"
            className={cn('flex size-2 shrink-0', compact ? 'absolute right-1 top-1' : 'relative')}
          >
            <span className="bg-primary absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping" />
            <span className="bg-primary relative inline-flex size-2 rounded-full" />
          </span>
        )}
        {hasUnreadNotifications && (
          <span
            aria-hidden="true"
            className={cn(
              'bg-primary text-primary-foreground flex items-center justify-center rounded-full font-semibold',
              compact ? 'absolute -right-0.5 -top-0.5 h-4 min-w-4 px-0.5 text-[9px]' : 'h-5 min-w-5 px-1 text-[10px]',
            )}
          >
            {unreadNotifications > 9 ? '9+' : unreadNotifications}
          </span>
        )}
      </Link>
    );
    return (
      <li key={item.href}>
        {compact ? (
          <Tooltip>
            <TooltipTrigger render={link} />
            <TooltipContent side="right" sideOffset={12}>{label}</TooltipContent>
          </Tooltip>
        ) : link}
      </li>
    );
  }

  const visibleGroups = groups
    .map((group) => ({ ...group, items: visibleItems(group.items) }))
    .filter((group) => group.items.length > 0);
  const administrationItems = visibleItems([organizationItem, settingsItem]);

  return (
    <nav
      id="sidebar-navigation"
      className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4', compact ? 'px-2' : 'px-3')}
    >
      <ul className="space-y-1">
        {visibleItems(primaryItems).map(renderItem)}
      </ul>
      {visibleGroups.length > 0 && (
        <ul className="border-border space-y-1 border-t pt-3">
          {visibleGroups.map((group) => (
            <SidebarGroup
              key={group.labelKey}
              label={t(group.labelKey)}
              icon={group.icon}
              active={group.items.some(isActive)}
              compact={compact}
              compactItems={compact ? group.items.map((item) => (
                <DropdownMenuItem
                  key={item.href}
                  render={<Link href={item.href} aria-current={isActive(item) ? 'page' : undefined} />}
                  className={cn(navRowClass, 'gap-2 px-2 py-1.5', isActive(item) && activeRowClass)}
                >
                  <item.icon aria-hidden="true" />
                  <span className={navLabelClass}>{t(item.labelKey)}</span>
                </DropdownMenuItem>
              )) : null}
            >
              {!compact && group.items.map(renderItem)}
            </SidebarGroup>
          ))}
        </ul>
      )}
      {administrationItems.length > 0 && (
        <ul className="border-border mt-auto space-y-1 border-t pt-3">
          {administrationItems.map(renderItem)}
        </ul>
      )}
    </nav>
  );
}

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations('Sidebar');
  const pathname = usePathname();
  const { accountRole } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsePreference);
  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
  const compact = isDesktop && collapsed;
  const toggleLabel = t(compact ? 'expandSidebar' : 'collapseSidebar');
  const ToggleIcon = compact ? PanelLeftOpen : PanelLeftClose;
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  const navigationProps = {
    pathname,
    accountRole,
    totalUnread,
    unreadNotifications,
    compact,
    onNavigate: onClose,
  };

  function toggleCompact() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(collapsePreference, String(next));
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
  }

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open || isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, isDesktop, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('closeMenu')}
        onClick={onClose}
        className={cn(
          'bg-background/70 fixed inset-0 z-30 backdrop-blur-sm transition-opacity lg:hidden',
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left.
          'border-border bg-card fixed inset-y-0 left-0 z-40 flex h-full w-64 shrink-0 flex-col border-r',
          'motion-safe:transition-[translate,visibility] motion-safe:duration-200 motion-safe:ease-out',
          open ? 'visible translate-x-0' : 'invisible -translate-x-full',
          'lg:visible lg:static lg:z-0 lg:translate-x-0 motion-safe:lg:transition-[width]',
          compact ? 'lg:w-16' : 'lg:w-60'
        )}
        aria-label={t('primaryNav')}
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div className={cn('border-border flex h-14 shrink-0 items-center gap-2 border-b', compact ? 'justify-center' : 'justify-between px-4')}>
          <Link href="/dashboard" aria-label={t('title')} className="flex min-w-0 items-center gap-2">
            <OctaLogo compact={compact} className="text-foreground" markClassName="h-9" wordmarkClassName="text-base" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeMenu')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <TooltipProvider delay={250}>
          <SidebarNavigation {...navigationProps} />
          <div className={cn('border-border hidden shrink-0 border-t py-3 lg:block', compact ? 'px-2' : 'px-3')}>
            <Tooltip>
              <TooltipTrigger
                type="button"
                aria-label={toggleLabel}
                aria-expanded={!compact}
                aria-controls="sidebar-navigation"
                onClick={toggleCompact}
                className={cn(navRowClass, compact && 'justify-center px-0')}
              >
                <ToggleIcon className="size-4 shrink-0" aria-hidden="true" />
                {!compact && <span className={navLabelClass}>{toggleLabel}</span>}
              </TooltipTrigger>
              {compact && <TooltipContent side="right" sideOffset={12}>{toggleLabel}</TooltipContent>}
            </Tooltip>
          </div>
        </TooltipProvider>
      </aside>
    </>
  );
}

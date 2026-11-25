"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import { applyInboxFilter, type InboxFilter } from "@/lib/inbox/inbox-filters";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus, Tag } from "@/types";
import { Search, ChevronDown, ListFilter, Tag as TagIcon, X, UserRound } from "lucide-react";
import { useCan } from "@/hooks/use-can";
import { useAuth } from "@/hooks/use-auth";
import { fetchAccountTags } from "@/lib/settings/account-catalog";
import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { getDateLocale } from "@/i18n/date-locale";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConversationTagLabels } from "@/components/inbox/conversation-tag-labels";
import { TooltipProvider } from "@/components/ui/tooltip";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
  initialFilter?: InboxFilter;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-muted-foreground",
};


export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
  initialFilter = "all",
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  const canManageTags = useCan("edit-settings");
  const { accountId, user } = useAuth();
  const [assignees, setAssignees] = useState<{ accountId: string; names: Record<string, string> } | null>(null);
  const assigneeNames = assignees?.accountId === accountId ? assignees.names : null;

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    void createClient().from("profiles")
      .select("user_id,full_name")
      .eq("account_id", accountId)
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) {
          console.error("Failed to load conversation assignee names:", error.code);
          return;
        }
        setAssignees({ accountId, names: Object.fromEntries((data ?? []).map((member) => [member.user_id, member.full_name?.trim() ?? ""])) });
      });
    return () => controller.abort();
  }, [accountId, resyncToken]);

  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(() => [
    { label: t("filterAll"), value: "all" },
    { label: t("filterUnread"), value: "unread" },
    { label: t("filterWaiting"), value: "waiting" },
    { label: t("filterUnassigned"), value: "unassigned" },
    { label: t("filterExpiring"), value: "expiring" },
    { label: t("filterOpen"), value: "open" },
    { label: t("filterPending"), value: "pending" },
    { label: t("filterClosed"), value: "closed" },
  ], [t]);

  const [search, setSearch] = useState("");
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const [loading, setLoading] = useState(true);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [tagCatalogState, setTagCatalogState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  useEffect(() => {
    if (!filterMenuOpen || !accountId) return;
    let cancelled = false;
    void fetchAccountTags(createClient(), accountId).then(data => {
      if (cancelled) return;
      setTags(data.sort((a, b) => a.name.localeCompare(b.name)));
      const validIds = new Set(data.map(tag => tag.id));
      setSelectedTagIds(ids => ids.filter(id => validIds.has(id)));
      setTagCatalogState('ready');
    }).catch(() => { if (!cancelled) setTagCatalogState('failed'); });
    return () => {
      cancelled = true;
    };
  }, [accountId, filterMenuOpen]);

  // Company options are derived from the loaded conversations — there's no
  // separate companies table, and only companies with a live conversation
  // are worth offering as an inbox filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    let result = applyInboxFilter(conversations, filter, now);

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [conversations, filter, now, search, selectedTagIds, selectedCompany]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);
  const toggleLabelDisplay = () => setTagsExpanded((expanded) => !expanded);

  return (
    // w-full on mobile so the list occupies the whole viewport when it's
    // the single pane showing; fixed 320px on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="flex h-full w-full flex-col border-r border-border bg-card lg:w-80">
      {/* Search + Filter */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder={t("searchPlaceholder")}
            className="border-border bg-muted pl-9 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu onOpenChange={setFilterMenuOpen}>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground hover:bg-muted">
              <ListFilter className="size-3.5" aria-hidden />
              {t("filters")}
              <span className="text-muted-foreground">{activeFilter?.label ?? t("filterAll")}</span>
              {selectedTagIds.length > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{selectedTagIds.length}</span>
              )}
              <ChevronDown className="size-3" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56 border-border bg-popover"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("filterStatus")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={filter} onValueChange={(value) => {
                  const option = FILTER_OPTIONS.find(item => item.value === value);
                  if (option) setFilter(option.value);
                }}>
                  {FILTER_OPTIONS.map((opt) => (
                    <DropdownMenuRadioItem key={opt.value} value={opt.value}>{opt.label}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-1.5">
                  <TagIcon className="size-3.5" aria-hidden />
                  {t("filterByTags")}
                </DropdownMenuLabel>
                <div className="max-h-40 overflow-y-auto">
                  {tagCatalogState !== 'ready' || tags.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      {t(tagCatalogState === 'loading' ? "loadingTags" : tagCatalogState === 'failed' ? "loadTagsFailed" : "noTagsAvailable")}
                    </p>
                  ) : tags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag.id}
                      closeOnClick={false}
                      checked={selectedTagIds.includes(tag.id)}
                      onCheckedChange={() => toggleTag(tag.id)}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                      <span className="truncate">{tag.name}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
                {canManageTags && (
                  <DropdownMenuItem render={<Link href="/tags" />}>
                    {t("manageTags")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex max-w-40 items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedCompany
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="truncate">{selectedCompany ?? t("company")}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    "text-sm",
                    selectedCompany === null
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {t("allCompanies")}
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      "text-sm",
                      selectedCompany === co
                        ? "text-primary"
                        : "text-popover-foreground"
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasContactFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag?.color ?? "var(--muted-foreground)" }}
                  />
                  <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                onClick={() => setSelectedCompany(null)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearContactFilters}
              className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("clearAll")}
            </button>
          </div>
        )}
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
          </div>
        ) : (
          <TooltipProvider delay={350}>
            <div className="flex flex-col">
              {filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  onSelect={handleSelect}
                  tagsExpanded={tagsExpanded}
                  onToggleTags={toggleLabelDisplay}
                  assigneeName={conv.assigned_agent_id ? assigneeNames?.[conv.assigned_agent_id] : undefined}
                  assignedToMe={!!user?.id && conv.assigned_agent_id === user.id}
                  t={t}
                />
              ))}
            </div>
          </TooltipProvider>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  tagsExpanded: boolean;
  onToggleTags: () => void;
  assigneeName?: string;
  assignedToMe: boolean;
  t: ReturnType<typeof useTranslations>;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  tagsExpanded,
  onToggleTags,
  assigneeName,
  assignedToMe,
  t,
}: ConversationItemProps) {
  const dateLocale = getDateLocale(useLocale());
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");
  const initials = displayName.charAt(0).toUpperCase();
  const assigneeLabel = conversation.assigned_agent_id
    ? assigneeName
      ? t(conversation.status === "closed" ? "assignedTo" : "beingHandledBy", { name: assigneeName })
      : t("assignedToAgent")
    : t("noAssignee");

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        locale: dateLocale,
        addSuffix: false,
      })
    : "";

  return (
    <div className={cn("hover:bg-muted/50", isActive && "border-l-2 border-primary bg-muted/70")}>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full min-w-0 items-start gap-3 px-3 py-3 text-left"
      >
        {/* Avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
          {contact?.avatar_url ? (
            <img
              src={contact.avatar_url}
              alt={displayName}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {displayName}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {conversation.last_message_text || t("noMessagesYet")}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {conversation.unread_count > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {conversation.unread_count}
                </span>
              )}
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  STATUS_COLORS[conversation.status]
                )}
                title={conversation.status}
              />
            </div>
          </div>
          <div className="mt-1.5 flex min-w-0">
            <span
              title={assigneeLabel}
              className={cn(
                "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                !conversation.assigned_agent_id || conversation.status === "closed"
                  ? "bg-muted text-muted-foreground"
                  : assignedToMe
                    ? "bg-primary/10 text-primary"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
              )}
            >
              <UserRound className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{assigneeLabel}</span>
            </span>
          </div>
        </div>
      </button>
      {!!contact?.tags?.length && (
        <div className="-mt-2 ml-16 pr-3 pb-2">
          <ConversationTagLabels tags={contact.tags} expanded={tagsExpanded} onToggle={onToggleTags} />
        </div>
      )}
    </div>
  );
}

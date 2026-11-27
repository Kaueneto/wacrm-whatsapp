"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canSupervise } from "@/lib/auth/roles";
import { TeamRoutingDialog } from './team-routing-dialog';
import { withAgentSignature } from '@/lib/whatsapp/agent-signature';
import { usePresence } from "@/hooks/use-presence";
import { PresenceDot } from "@/components/presence/presence-dot";
import { presenceLabel } from "@/lib/presence";
import { cn } from "@/lib/utils";
import type {
  Conversation,
  Message,
  MessageReaction,
  Contact,
  ConversationStatus,
  MessageTemplate,
  Profile,
  InteractiveMessagePayload,
} from "@/types";
import {
  MessageSquare,
  ChevronDown,
  UserPlus,
  Check,
  Clock,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { customerServiceWindow } from '@/lib/whatsapp/customer-service-window';
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { MessageActions } from "./message-actions";
import { MediaLightbox } from "./media-lightbox";
import { collectMediaGallery } from "@/lib/media/gallery";
import {
  MessageComposer,
  CHAT_MEDIA_BUCKET,
  type SendMediaPayload,
} from "./message-composer";
import { deleteAccountMedia } from "@/lib/storage/upload-media";
import { TemplatePicker } from "./template-picker";
import { AiThreadBanner } from "./ai-thread-banner";
import { buildReplyPreview } from "./reply-quote";
import {
  renderTemplateBody,
  templateHeaderMediaUrl,
} from "@/lib/whatsapp/template-body";
import {
  matchMessageTemplate,
  templateNamesInMessages,
} from "@/lib/whatsapp/template-message-view";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { resolveAssignmentResult } from "@/lib/inbox/assignment";
import {
  businessReactionOn,
  withBusinessReaction,
} from "@/lib/inbox/business-reaction";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  confirmedSendUpdate,
  isTempMessage,
  newTempMessageId,
} from "@/lib/inbox/optimistic-messages";

const MESSAGE_PAGE_SIZE = 200;

interface ReplyDraft {
  id: string;
  authorLabel: string;
  preview: string;
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[], conversationId: string) => void;
  onOlderMessagesLoaded?: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  onAssignChange: (
    conversationId: string,
    assignedAgentId: string | null,
  ) => void;
  /**
   * On mobile, the thread is shown full-screen with the conversation list
   * hidden. This callback lets the page deselect the active conversation
   * and reveal the list again. Rendered as a back-arrow in the header on
   * mobile only.
   */
  onBack?: () => void;
  /**
   * Increment to force the messages + reactions fetch effects to refire.
   * Parent bumps this on realtime reconnect / tab visibility → visible
   * so the open thread catches up on any events sent while the WS was
   * disconnected or the tab was throttled. Optional so existing callers
   * keep working.
   */
  resyncToken?: number;
  /**
   * Fired by the manual-refresh button in the thread header. The parent
   * typically bumps the same `resyncToken` it controls — this gives the
   * user a way to force a refetch when they suspect realtime missed an
   * event (or they're impatient). Optional so existing callers keep
   * working; the button is only rendered when this is provided.
   */
  onRefresh?: () => void;
  /**
   * Desktop-only contact-panel toggle. The page owns the open/closed
   * state (it's the one that renders the sidebar), so the thread just
   * reflects it and asks the page to flip it. Both optional so existing
   * callers keep working; the toggle button only renders when
   * `onToggleContactPanel` is wired up.
   */
  contactPanelOpen?: boolean;
  onToggleContactPanel?: () => void;
}

function formatDateSeparator(dateStr: string, t: ReturnType<typeof useTranslations>, locale: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return t("today");
  if (isYesterday(date)) return t("yesterday");
  return date.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" });
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const day = format(new Date(msg.created_at), "yyyy-MM-dd");
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

const STATUS_OPTIONS: { label: string; value: ConversationStatus; color: string }[] = [
  { label: "Open", value: "open", color: "text-primary" },
  { label: "Pending", value: "pending", color: "text-amber-400" },
  { label: "Closed", value: "closed", color: "text-muted-foreground" },
];

/**
 * Shared subtle dotted wallpaper for the active thread and empty state.
 *
 * Defined once at module scope so the two render paths can't drift —
 * if we ever switch the asset, both spots update together.
 */
const CHAT_BG_CLASSES = "chat-wallpaper";

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onOlderMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onAssignChange,
  onBack,
  resyncToken = 0,
  onRefresh,
  contactPanelOpen,
  onToggleContactPanel,
}: MessageThreadProps) {
  const t = useTranslations("Inbox.messageThread");
  const locale = useLocale();
  const tTimer = useTranslations("Inbox.sessionTimer");
  const tQuote = useTranslations("Inbox.replyQuote");

  const { user, accountRole, profile } = useAuth();
  const signOutgoingText = useCallback((text: string) =>
    profile?.message_signature_enabled && profile.full_name
      ? withAgentSignature(text, profile.message_signature_name?.trim() || profile.full_name) : text,
  [profile?.message_signature_enabled, profile?.message_signature_name, profile?.full_name]);
  const { getPresence, getRow, now } = usePresence();
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const [olderPages, setOlderPages] = useState<{
    conversationId: string;
    hasOlder: boolean;
    paginated?: true;
  } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [sentTemplates, setSentTemplates] = useState<MessageTemplate[]>([]);
  const sentTemplateNames = useMemo(
    () => templateNamesInMessages(messages).join("\n"),
    [messages],
  );
  useEffect(() => {
    if (!sentTemplateNames) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .in("name", sentTemplateNames.split("\n"));

      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch sent templates:", error);
        return;
      }
      setSentTemplates((data as MessageTemplate[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [sentTemplateNames]);
  // Purely visual spin state for the manual-refresh button. The actual
  // refetch is fire-and-forget through `onRefresh` (which bumps the
  // parent's resyncToken); the 700ms spin is just feedback so the click
  // doesn't feel like a no-op. Cleared via the timer ref on unmount.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  const handleRefreshClick = useCallback(() => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    onRefresh();
    refreshTimerRef.current = setTimeout(() => {
      setIsRefreshing(false);
      refreshTimerRef.current = null;
    }, 700);
  }, [isRefreshing, onRefresh]);
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  // Which attachment the media viewer is showing. Lives here rather than in
  // the bubble so the viewer can page through every image/video in the
  // thread (issue #373). Paired with the conversation it belongs to and read
  // back through that check below, so switching threads closes the viewer
  // without an effect racing the messages refetch.
  const [openMedia, setOpenMedia] = useState<{
    conversationId: string;
    messageId: string;
  } | null>(null);

  // Profiles are bounded by RLS to rows the current user is allowed to
  // see — today that's just the current user, but the dropdown keeps the
  // shape ready for shared-team workspaces without a refactor.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .order("full_name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to fetch profiles:", error);
          return;
        }
        setProfiles((data as Profile[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [profilesVersion]);

  // 24-hour session timer
  const sessionInfo = useMemo(() => {
    // The conversation timestamp also covers inbound messages outside the
    // loaded page. Ignore messages from the previous thread while switching.
    const lastInboundAt = messages.reduce<string | null>((latest, message) => {
      if (message.conversation_id !== conversation?.id || message.sender_type !== 'customer') return latest;
      return !latest || Date.parse(message.created_at) > Date.parse(latest)
        ? message.created_at : latest;
    }, conversation?.last_inbound_at ?? null);

    if (!lastInboundAt) return { expired: true, remaining: tTimer("noCustomerMessages") };

    const { expired, remainingMs } = customerServiceWindow(lastInboundAt, now);

    if (expired) {
      return { expired: true, remaining: tTimer("expired") };
    }

    const hoursLeft = remainingMs / 3_600_000;
    const remaining =
      hoursLeft >= 1
        ? tTimer("xhRemaining", { hours: Math.floor(hoursLeft) })
        : tTimer("xmRemaining", { minutes: Math.ceil(hoursLeft * 60) });

    return { expired, remaining };
  }, [messages, conversation?.id, conversation?.last_inbound_at, now, tTimer]);

  // Store latest callback in a ref so fetchMessages doesn't need to
  // depend on `onMessagesLoaded` — otherwise parent re-renders cause
  // fetchMessages to change → useEffect re-fires → refetch → realtime
  // UPDATE on conversations.unread_count → parent re-renders → LOOP.
  // The ref is written inside an effect so the mutation doesn't happen
  // during render (React 19 refs rule); consumers only read `.current`
  // inside the async fetch completion, which runs after the render.
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  });

  const conversationId = conversation?.id;
  if (loadedConversationId !== null && loadedConversationId !== conversationId) {
    setLoadedConversationId(null);
  }
  if (olderPages && olderPages.conversationId !== conversationId) {
    setOlderPages(null);
  }
  const initialLoading = loadedConversationId !== conversationId && messages.length === 0;
  const firstMessageId = messages[0]?.id;
  const lastMessageId = messages.at(-1)?.id;
  const hasUnread = (conversation?.unread_count ?? 0) > 0;
  const hasOlderMessages =
    !!olderPages && olderPages.conversationId === conversationId && olderPages.hasOlder;

  const mediaMessageId =
    openMedia && openMedia.conversationId === conversationId
      ? openMedia.messageId
      : null;
  const handleMediaChange = useCallback(
    (messageId: string | null) => {
      setOpenMedia(
        messageId && conversationId ? { conversationId, messageId } : null,
      );
    },
    [conversationId],
  );

  // The first fetch settles the loading state for this conversation.
  // Reconnects, periodic checks and manual refreshes merge in the background.
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    const request = new AbortController();

    (async () => {
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(MESSAGE_PAGE_SIZE)
          .abortSignal(request.signal);

        if (request.signal.aborted) return;
        if (error) throw error;

        const newestPage = ((data ?? []) as Message[]).slice().reverse();
        setOlderPages((previous) =>
          previous?.conversationId === conversationId && previous.paginated
            ? previous
            : { conversationId, hasOlder: newestPage.length === MESSAGE_PAGE_SIZE },
        );
        onMessagesLoadedRef.current(newestPage, conversationId);
      } catch (error) {
        if (!request.signal.aborted) console.error("Failed to fetch messages:", error);
      } finally {
        if (!request.signal.aborted) setLoadedConversationId(conversationId);
      }
    })();

    return () => request.abort();
  }, [conversationId, resyncToken]);

  const loadOlderMessages = useCallback(async () => {
    const oldest = messages.find((m) => !isTempMessage(m));
    if (!conversationId || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { data, error } = await createClient()
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .lte("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      if (error) {
        console.error("Failed to fetch older messages:", error);
        toast.error(t("loadOlderFailed"));
        return;
      }
      const olderPage = ((data ?? []) as Message[]).slice().reverse();
      setOlderPages({
        conversationId,
        hasOlder: olderPage.length === MESSAGE_PAGE_SIZE,
        paginated: true,
      });
      const knownIds = new Set(messages.map((m) => m.id));
      const el = scrollRef.current;
      if (el && olderPage.some((m) => !knownIds.has(m.id))) {
        scrollAnchorRef.current = {
          scrollHeight: el.scrollHeight,
          scrollTop: el.scrollTop,
        };
      }
      onOlderMessagesLoaded?.(olderPage);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, loadingOlder, messages, onOlderMessagesLoaded, t]);

  // Reactions fetch — pulls the current state from the DB. Kept separate
  // from the channel subscription below so a `resyncToken` bump just
  // refetches the rows without also tearing down and rebuilding the
  // realtime channel.
  useEffect(() => {
    if (!conversationId) {
      setReactions([]);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("*")
        .eq("conversation_id", conversationId);
      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch reactions:", error);
        return;
      }
      setReactions((data as MessageReaction[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, resyncToken]);

  // Reactions realtime subscription per conversation. Subscribing here
  // (not at the page level) keeps the channel scoped to the visible
  // conversation and avoids cross-conversation chatter on a busy inbox.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`reactions:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            // Swap any matching optimistic temp row for the real one so
            // the pill doesn't double up after a successful POST.
            const tempIdx = prev.findIndex(
              (r) =>
                r.id.startsWith("temp-") &&
                r.message_id === row.message_id &&
                r.actor_type === row.actor_type &&
                r.actor_id === row.actor_id,
            );
            if (tempIdx >= 0) {
              const copy = prev.slice();
              copy[tempIdx] = row;
              return copy;
            }
            return [...prev, row];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => prev.map((r) => (r.id === row.id ? row : r)));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as Partial<MessageReaction>;
          if (!old?.id) return;
          setReactions((prev) => prev.filter((r) => r.id !== old.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Clear any in-progress reply draft when the active conversation changes —
  // a quote pulled from conversation A shouldn't bleed into conversation B.
  useEffect(() => {
    setReplyTo(null);
  }, [conversationId]);

  // Reset the server-side unread_count to 0 whenever an unread count
  // surfaces on the active conversation — covers both (a) opening a
  // conversation that had unread messages and (b) new messages arriving
  // while the user is already viewing the thread (webhook server-bumps
  // unread_count to N+1; the realtime UPDATE propagates it into the
  // client, which re-runs this effect and flips it back to 0).
  //
  // Guarding on hasUnread prevents the eq-update loop: once unread_count
  // is 0 the condition is false, so no further UPDATE is issued.
  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    const supabase = createClient();
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
      .then(({ error }) => {
        if (error) console.error("Failed to reset unread_count:", error);
      });
  }, [conversationId, hasUnread]);

  // Refreshing the same messages or updating delivery status must leave the
  // scroll position alone. Prepending history still uses the scroll anchor.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchor = scrollAnchorRef.current;
    scrollAnchorRef.current = null;
    if (anchor) {
      el.scrollTop = el.scrollHeight - anchor.scrollHeight + anchor.scrollTop;
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [conversationId, firstMessageId, lastMessageId, initialLoading]);

  const handleSend = useCallback(
    async (text: string, replyToId?: string) => {
      if (!conversation) return;

      const tempId = newTempMessageId();

      // Optimistic update — shows the message immediately with "sending" status
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "text",
        content_text: signOutgoingText(text),
        status: "sending",
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "text",
            content_text: text,
            reply_to_message_id: replyToId,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error("Failed to send message:", reason);
          toast.error(t("sendFailed", { reason }));
          // Mark the optimistic bubble as failed so the user sees what happened
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        // Success — the realtime INSERT event will replace the temp bubble
        // with the real DB row. If realtime hasn't arrived yet, at least
        // flip status to 'sent' so the UI stops showing "sending".
        onUpdateMessage(tempId, confirmedSendUpdate(payload));
      } catch (err) {
        console.error("Failed to send message:", err);
        const reason = err instanceof Error ? err.message : t("networkError");
        toast.error(t("sendFailed", { reason }));
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage, t, signOutgoingText]
  );

  const handleSendMedia = useCallback(
    async (payload: SendMediaPayload) => {
      if (!conversation) return;

      // Documents show their filename in our own bubble (and to the
      // recipient as the Meta caption when no caption was typed); other
      // kinds use the caption as-is. Audio carries no caption.
      const contentText =
        payload.kind === "document"
          ? payload.caption || payload.filename || t("documentFallback")
          : payload.caption;

      const tempId = newTempMessageId();
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: payload.kind,
        content_text: payload.kind !== 'audio' && contentText ? signOutgoingText(contentText) : contentText,
        media_url: payload.mediaUrl,
        status: "sending",
        created_at: new Date().toISOString(),
        reply_to_message_id: payload.replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: payload.kind,
            media_url: payload.mediaUrl,
            content_text: contentText,
            filename: payload.filename,
            reply_to_message_id: payload.replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error("Failed to send media:", reason);
          toast.error(t("sendFailed", { reason }));
          onUpdateMessage(tempId, { status: "failed" });
          // The upload never reached the recipient — GC the orphaned
          // object rather than leaving it in the public bucket forever.
          void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(() => {});
          return;
        }

        onUpdateMessage(tempId, confirmedSendUpdate(data));
      } catch (err) {
        console.error("Failed to send media:", err);
        const reason = err instanceof Error ? err.message : t("networkError");
        toast.error(t("sendFailed", { reason }));
        onUpdateMessage(tempId, { status: "failed" });
        void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(() => {});
      }
    },
    [conversation, onNewMessage, onUpdateMessage, t, signOutgoingText],
  );

  const handleSendInteractive = useCallback(
    async (payload: InteractiveMessagePayload, replyToId?: string) => {
      if (!conversation) return;

      const tempId = newTempMessageId();
      // Optimistic bubble — renders the buttons/list immediately via the
      // interactive_payload, same as the persisted row will.
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "interactive",
        content_text: signOutgoingText(payload.body),
        interactive_payload: { ...payload, body: signOutgoingText(payload.body) },
        status: "sending",
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "interactive",
            interactive_payload: payload,
            reply_to_message_id: replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error("Failed to send interactive message:", reason);
          toast.error(t("sendFailed", { reason }));
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        onUpdateMessage(tempId, confirmedSendUpdate(data));
      } catch (err) {
        console.error("Failed to send interactive message:", err);
        const reason = err instanceof Error ? err.message : t("networkError");
        toast.error(t("sendFailed", { reason }));
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage, t, signOutgoingText],
  );

  const handleStatusChange = useCallback(
    async (status: ConversationStatus) => {
      if (!conversation) return;

      const supabase = createClient();
      await supabase
        .from("conversations")
        .update({ status })
        .eq("id", conversation.id);

      onStatusChange(conversation.id, status);
    },
    [conversation, onStatusChange]
  );

  const handleOpenTemplates = useCallback(() => {
    setTemplateModalOpen(true);
  }, []);

  const handleSendTemplate = useCallback(
    async (
      template: MessageTemplate,
      values: {
        body: string[];
        headerText?: string;
        buttonParams?: Record<number, string>;
      },
    ) => {
      if (!conversation) return;

      const renderedBody = renderTemplateBody(template.body_text, values.body);
      const tempId = newTempMessageId();

      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "template",
        content_text: renderedBody,
        media_url: templateHeaderMediaUrl(template) ?? undefined,
        template_name: template.name,
        status: "sending",
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "template",
            template_name: template.name,
            template_language: template.language,
            // Structured params drive the new send-builder path
            // (header media + URL button substitution). Body values
            // are mirrored under both shapes so the route can fall
            // back if the template row isn't found locally.
            template_message_params: {
              body: values.body,
              headerText: values.headerText,
              buttonParams: values.buttonParams,
            },
            template_params: values.body,
            content_text: renderedBody,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error("Failed to send template:", reason);
          toast.error(t("sendTemplateFailed", { reason }));
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        onUpdateMessage(tempId, confirmedSendUpdate(payload));
      } catch (err) {
        console.error("Failed to send template:", err);
        const reason = err instanceof Error ? err.message : t("networkError");
        toast.error(t("sendTemplateFailed", { reason }));
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage, t],
  );

  // Build a quick id → Message map so reply quotes can be rendered without
  // an extra fetch — the thread already holds the full conversation.
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Images + videos in the thread, in order — the set the media viewer
  // pages through with ← / →.
  const mediaGallery = useMemo(() => collectMediaGallery(messages), [messages]);

  // Bucket reactions by their target message_id for O(1) per-bubble lookup.
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();
    for (const r of reactions) {
      const bucket = map.get(r.message_id);
      if (bucket) bucket.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  const contactDisplayName =
    contact?.name || (contact ? contactHandle(contact) : "") || t("customer");

  // Author label for a quoted message: "You" when we sent the parent,
  // contact name when the customer sent it.
  const authorLabelFor = useCallback(
    (m: Message): string => {
      const isAgentMsg =
        m.sender_type === "agent" || m.sender_type === "bot";
      return isAgentMsg ? t("you") : contactDisplayName;
    },
    [contactDisplayName, t],
  );

  const handleStartReply = useCallback(
    (msg: Message) => {
      setReplyTo({
        id: msg.id,
        authorLabel: authorLabelFor(msg),
        preview: buildReplyPreview(msg, tQuote),
      });
    },
    [authorLabelFor],
  );

  // Single reaction-set primitive. emoji === "" removes; otherwise adds/swaps.
  // The "toggle" semantic (pill click) is computed at the call site where the
  // current reactions for the bubble are already in scope — keeps this
  // function dependency-free w.r.t. the reaction list.
  const postReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id || !conversation) {
        console.warn("[reactions] missing user or conversation");
        return;
      }
      if (messageId.startsWith("temp-")) {
        toast.error(t("waitForSending"));
        return;
      }

      const convId = conversation.id;
      const userId = user.id;
      let snapshot: MessageReaction[] = [];

      // Functional updater — captures the freshest reactions list, never a
      // stale closure. Snapshot stored for rollback on POST failure.
      setReactions((prev) => {
        snapshot = prev;
        return withBusinessReaction(prev, {
          messageId,
          conversationId: convId,
          userId,
          emoji,
          now: new Date(),
        });
      });

      try {
        const res = await fetch("/api/whatsapp/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: messageId, emoji }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : t("networkError");
        toast.error(t("reactionFailed", { reason }));
        setReactions(snapshot);
      }
    },
    [conversation, user?.id, t],
  );

  const handleAssignChange = useCallback(
    async (agentId: string | null) => {
      if (!conversation) return;

      const supabase = createClient();
      const { data, error } = await supabase
        .from("conversations")
        .update({ assigned_agent_id: agentId })
        .eq("id", conversation.id)
        .select("assigned_agent_id")
        .single();

      if (error) {
        console.error("Failed to update assignment:", error);
        toast.error(error.code === "23514" ? error.message : t("assignmentUpdateFailed"));
        return;
      }

      const { assignedAgentId, rejected } = resolveAssignmentResult(
        agentId,
        data?.assigned_agent_id,
      );
      if (rejected) {
        toast.error(t("assigneeNoLongerMember"));
        setProfilesVersion((v) => v + 1);
      }

      onAssignChange(conversation.id, assignedAgentId);
    },
    [conversation, onAssignChange, t],
  );

  // Empty state — same subtle wallpaper as the active
  // thread below, so swapping between empty/selected doesn't change the
  // pattern under the user's eye.
  if (!conversation || !contact) {
    return (
      <div className={cn("flex flex-1 flex-col items-center justify-center", CHAT_BG_CLASSES)}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-muted-foreground">
          {t("selectConversation")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("selectConversationHint")}
        </p>
      </div>
    );
  }

  const displayName = contact.name || contactHandle(contact);
  const messageGroups = groupMessagesByDate(messages);
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === conversation.status
  );
  const assignedAgentId = conversation.assigned_agent_id ?? null;
  const canClaim = accountRole === "agent" && conversation.team_queue_enabled && !assignedAgentId && conversation.status !== "closed";
  const currentAssignee = profiles.find((p) => p.user_id === assignedAgentId);
  const assignLabel = assignedAgentId
    ? (currentAssignee?.full_name ?? t("assigned"))
    : t("assign");

  return (
    // `min-w-0` is load-bearing: the page already puts min-w-0 on the
    // thread's flex *wrapper* (issue #165), but this root keeps the
    // default `min-width: auto`, so a single wide message (long unbroken
    // URL/word) expands the whole thread past its flex share and the chat
    // paints on top of the contact sidebar at lg+ — outgoing bubbles get
    // clipped and the hover toolbar overlaps the Tags panel. Letting the
    // root shrink lets the bubbles' break-words / max-w caps apply.
    // Issue #257.
    <div className={cn("flex min-w-0 flex-1 flex-col", CHAT_BG_CLASSES)}>
      {/* Header — solid card surface sits on top of the wallpaper so the
          name/avatar/dropdowns stay legible. */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Back-to-list button — mobile only. Hidden on lg+ where the
              conversation list is always visible next to the thread. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t("backToConversations")}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleContactPanel}
            aria-expanded={contactPanelOpen}
            title={t("contactDetails")}
            className="-m-1 flex min-w-0 items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:gap-3"
          >
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-medium text-foreground">
              {contact.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contact.avatar_url} alt="" className="size-full object-cover" />
              ) : displayName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">{displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">{contactHandle(contact)}</span>
            </span>
          </button>
          {/* Session timer badge — hidden on the narrowest phones so
              the name + back arrow keep their room. */}
          <Badge
            variant="outline"
            className={cn(
              "ml-1 hidden gap-1 border-border text-[10px] sm:inline-flex sm:ml-2",
              sessionInfo.expired ? "text-red-400" : "text-primary"
            )}
          >
            <Clock className="h-3 w-3" />
            {sessionInfo.remaining}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Manual refresh — forces a refetch of the messages + the
              conversation list (the parent bumps its resyncToken). Useful
              when realtime missed an event or the agent just wants to be
              sure nothing's stale. Only rendered when the parent wires
              up `onRefresh`. */}
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              aria-label={t("refreshConversation")}
              title={t("refresh")}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60",
              )}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
              />
            </button>
          )}

          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
                  "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  currentStatus?.color ?? "text-muted-foreground"
                )}>
                {currentStatus ? t(`status${currentStatus.label}`) : t("status")}
                <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-popover"
            >
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn("text-sm", opt.color)}
                >
                  {t(`status${opt.label}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign dropdown */}
          {accountRole && canSupervise(accountRole) && (
            <TeamRoutingDialog
              key={conversation.id}
              conversationId={conversation.id}
              currentTeamId={conversation.team_id}
              currentAgentId={conversation.assigned_agent_id}
              onChanged={(agentId) => { onAssignChange(conversation.id, agentId); onRefresh?.(); }}
            />
          )}
          {conversation.team_id && accountRole && canSupervise(accountRole) ? (
            <TeamRoutingDialog
              key={`${conversation.id}-assignee`}
              conversationId={conversation.id}
              currentTeamId={conversation.team_id}
              currentAgentId={conversation.assigned_agent_id}
              assigneeLabel={assignLabel}
              onChanged={(agentId) => { onAssignChange(conversation.id, agentId); onRefresh?.(); }}
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={!accountRole || !canSupervise(accountRole)}
                className={cn(
                  "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  assignedAgentId ? "text-primary" : "text-muted-foreground"
                )}
              >
                <UserPlus className="h-3 w-3" />
                <span className="hidden sm:inline">{assignLabel}</span>
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-border bg-popover"
              >
                {profiles.length === 0 ? (
                  <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                    {t("noTeammates")}
                  </DropdownMenuItem>
                ) : (
                  profiles.map((p) => {
                    const isSelected = p.user_id === assignedAgentId;
                    const presence = getPresence(p.user_id);
                    return (
                      <DropdownMenuItem
                        key={p.id}
                        onClick={() => handleAssignChange(p.user_id)}
                        className={cn(
                          "text-sm",
                          isSelected ? "text-primary" : "text-popover-foreground"
                        )}
                      >
                        <PresenceDot
                          status={presence}
                          label={presenceLabel(
                            presence,
                            getRow(p.user_id)?.last_seen_at ?? null,
                            now
                          )}
                          className="mr-2"
                        />
                        <span className="flex-1">
                          {p.full_name}
                          {p.user_id === user?.id ? t("me") : ""}
                        </span>
                        {isSelected && <Check className="ml-2 h-3 w-3" />}
                      </DropdownMenuItem>
                    );
                  })
                )}
                {assignedAgentId && (
                  <>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem
                      onClick={() => handleAssignChange(null)}
                      className="text-sm text-muted-foreground"
                    >
                      {t("unassign")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {initialLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">{t("noMessagesYet")}</p>
            <p className="text-xs text-muted-foreground">
              {t("sendTemplateHint")}
            </p>
          </div>
        ) : (
          <div className="w-full space-y-4">
            {hasOlderMessages && onOlderMessagesLoaded && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadOlderMessages()}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? t("loadingOlder") : t("loadOlder")}
                </Button>
              </div>
            )}
            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="rounded-md bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                    {formatDateSeparator(group.date, t, locale)}
                  </span>
                </div>
                {/* Messages */}
                <div className="space-y-1">
                  {group.messages.map((msg, index) => {
                    const parent = msg.reply_to_message_id
                      ? messagesById.get(msg.reply_to_message_id)
                      : null;
                    const reply = parent
                      ? {
                          authorLabel:
                            parent.sender_type === "agent" || parent.sender_type === "bot"
                              ? t("me") 
                              : contact?.name || contact?.phone || t("unknown"),
                          preview: buildReplyPreview(parent, tQuote),
                        }
                      : null;
                    const msgReactions = reactionsByMessageId.get(msg.id);
                    // Toggle is computed at the call site — no extra hook.
                    const handlePillToggle = (emoji: string) => {
                      const current = businessReactionOn(msgReactions, msg.id);
                      const next = current?.emoji === emoji ? "" : emoji;
                      void postReaction(msg.id, next);
                    };
                    return (
                      <MessageActions
                        key={msg.id}
                        message={msg}
                        startsGroup={index > 0 && (
                          group.messages[index - 1].sender_type !== msg.sender_type ||
                          new Date(msg.created_at).getTime() - new Date(group.messages[index - 1].created_at).getTime() > 5 * 60 * 1000
                        )}
                        onReply={() => handleStartReply(msg)}
                        onReact={(emoji) => {
                          if (emoji) void postReaction(msg.id, emoji);
                        }}
                      >
                        <MessageBubble
                          message={msg}
                          template={
                            msg.content_type === "template"
                              ? matchMessageTemplate(msg, sentTemplates)
                              : null
                          }
                          reply={reply}
                          reactions={msgReactions}
                          onToggleReaction={handlePillToggle}
                          onOpenMedia={handleMediaChange}
                        />
                      </MessageActions>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI auto-reply banner — take over an active bot, or resume it
          after a handoff. Renders nothing unless the account has
          auto-reply configured. */}
      <AiThreadBanner
        conversationId={conversation.id}
        disabled={conversation.ai_autoreply_disabled ?? false}
        flowAiActive={!!conversation.ai_flow_context}
        handoffSummary={conversation.ai_handoff_summary}
        assignedAgentId={assignedAgentId}
        currentUserId={user?.id}
        onChange={(patch) => {
          if ("assigned_agent_id" in patch) {
            onAssignChange(conversation.id, patch.assigned_agent_id ?? null);
          }
        }}
      />

      {/* Composer */}
      {canClaim ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card p-4">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t("teamQueueHint")}</p>
          <Button
            disabled={claiming}
            onClick={async () => {
              setClaiming(true);
              try {
                const response = await fetch("/api/support/claim", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ conversationId: conversation.id }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || t("claimFailed"));
                onAssignChange(conversation.id, result.assignedAgentId);
                toast.success(t("claimSuccess"));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("claimFailed"));
              } finally {
                setClaiming(false);
                onRefresh?.();
              }
            }}
          >
            {t(claiming ? "claiming" : "claimConversation")}
          </Button>
        </div>
      ) : <MessageComposer
        conversationId={conversation.id}
        sessionExpired={sessionInfo.expired}
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        onSendInteractive={handleSendInteractive}
        onOpenTemplates={handleOpenTemplates}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
      />}

      <TemplatePicker
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        onSelect={handleSendTemplate}
      />

      {/* Full-size viewer for the thread's images/videos. Renders nothing
          until a bubble opens it. */}
      <MediaLightbox
        items={mediaGallery}
        activeId={mediaMessageId}
        onActiveIdChange={handleMediaChange}
        contactLabel={contactDisplayName}
      />
    </div>
  );
}

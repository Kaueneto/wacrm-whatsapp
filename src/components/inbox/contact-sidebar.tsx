"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canSendMessages } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactTagPicker } from "@/components/contacts/contact-tag-picker";
import { ConversationTagLabels } from "@/components/inbox/conversation-tag-labels";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { getDateLocale } from "@/i18n/date-locale";
import { contactHandle } from "@/lib/whatsapp/wa-identity";

interface ContactSidebarProps {
  contact: Contact;
  onContactTagChange: (contactId: string, tag: Tag, assigned: boolean) => void;
  className?: string;
}

export function ContactSidebar({ contact, onContactTagChange, className }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const dateLocale = getDateLocale(useLocale());
  const { user, accountId, accountRole } = useAuth();
  const canManageContactTags = accountRole ? canSendMessages(accountRole) : false;
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const contactId = contact.id;
  useEffect(() => {
    const request = new AbortController();
    const supabase = createClient();

    void (async () => {
      const [dealsRes, notesRes] = await Promise.all([
        supabase.from("deals").select("*, stage:pipeline_stages(*)")
          .eq("contact_id", contactId).order("created_at", { ascending: false }).abortSignal(request.signal),
        supabase.from("contact_notes").select("*")
          .eq("contact_id", contactId).order("created_at", { ascending: false }).abortSignal(request.signal),
      ]);
      if (request.signal.aborted) return;
      if (dealsRes.data) setDeals(dealsRes.data);
      const loadedNotes = notesRes.data;
      if (loadedNotes) {
        const loadedIds = new Set(loadedNotes.map((note) => note.id));
        setNotes((previous) => [...previous.filter((note) => !loadedIds.has(note.id)), ...loadedNotes]);
      }
    })();

    return () => request.abort();
  }, [contactId]);

  const handleCopyPhone = useCallback(async () => {
    // Copies whatever the row displays — a BSUID-only contact has no
    // phone number to copy, but its @username still identifies them.
    const handle = contactHandle(contact);
    if (!handle) return;
    await navigator.clipboard.writeText(handle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  async function handleAddNote() {
    const noteText = newNote.trim();
    if (!noteText || !accountId || !user || addingNote) return;
    setAddingNote(true);

    try {
      const { data, error } = await createClient()
        .from("contact_notes")
        .insert({ contact_id: contactId, account_id: accountId, user_id: user.id, note_text: noteText })
        .select()
        .single();

      if (error || !data) throw error ?? new Error("Missing saved note");
      setNotes((previous) => [data, ...previous.filter((note) => note.id !== data.id)]);
      setNewNote("");
    } catch {
      toast.error(tSidebar("addNoteFailed"));
    } finally {
      setAddingNote(false);
    }
  }

  const displayName = contact.name || contactHandle(contact);
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className={cn("flex h-full w-full min-w-0 flex-col border-l border-border bg-card", className)}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              style={{ cursor: "pointer" }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">
                {contactHandle(contact)}
              </span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <TagIcon className="size-3" />
                {tSidebar("tags")}
              </div>
              {canManageContactTags && (
                <ContactTagPicker key={contact.id} contactId={contact.id} assignedTags={contact.tags ?? []}
                  onChange={(tag, assigned) => onContactTagChange(contact.id, tag, assigned)} />
              )}
            </div>
            <div className="mt-2">
              {contact.tags?.length ? (
                <TooltipProvider delay={350}>
                  <ConversationTagLabels tags={contact.tags} expanded={tagsExpanded} onToggle={() => setTagsExpanded((expanded) => !expanded)} />
                </TooltipProvider>
              ) : (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noTags")}</p>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              {tSidebar("deals")}
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noDeals")}</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  aria-label={tSidebar("addNote")}
                  placeholder={tSidebar("addNotePlaceholder")}
                  disabled={addingNote}
                  rows={2}
                  className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  aria-label={tSidebar("addNote")}
                  disabled={!newNote.trim() || !accountId || !user || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {notes.length > 0 && (
                <ol className="mt-4 space-y-3">
                  {notes.map((note) => (
                    <li key={note.id} className="relative pl-5 before:absolute before:top-2 before:-bottom-5 before:left-1 before:w-px before:bg-border last:before:hidden">
                      <span aria-hidden="true" className="absolute top-1 left-0.5 size-1.5 rounded-full bg-primary" />
                      <time dateTime={note.created_at} className="block text-[11px] text-muted-foreground">
                        {format(new Date(note.created_at), "PP HH:mm", { locale: dateLocale })}
                      </time>
                      <p className="mt-1 text-sm wrap-break-word whitespace-pre-wrap text-foreground">{note.note_text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

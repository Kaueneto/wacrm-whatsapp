'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { canSendMessages } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { displayTagColor } from '@/lib/contacts/tag-catalog';
import type { Contact, ContactNote, Tag } from '@/types';
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  StickyNote,
  Plus,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContactTagPicker } from '@/components/contacts/contact-tag-picker';
import { labelTextColor } from '@/components/inbox/conversation-tag-labels';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { contactHandle } from '@/lib/whatsapp/wa-identity';
import { ContactTimeline } from './contact-timeline';
import type { UauFinance } from '@/lib/uau/finance-types';
import { UauFinancePanel } from './uau-finance-panel';
import { UauAttendanceDialog } from './uau-attendance-dialog';

interface ContactSidebarProps {
  uauSuggestion?: string | null;
  conversationId?: string;
  contact: Contact;
  onContactTagChange: (contactId: string, tag: Tag, assigned: boolean) => void;
  className?: string;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

export function ContactSidebar({
  uauSuggestion,
  conversationId,
  contact,
  onContactTagChange,
  className,
  expanded = false,
  onToggleExpanded,
}: ContactSidebarProps) {
  const tSidebar = useTranslations('Inbox.sidebar');
  const tWorkspace = useTranslations('UauWorkspace');
  const [uauFinance, setUauFinance] = useState<UauFinance | null>(null);
  const { user, accountId, accountRole } = useAuth();
  const canManageContactTags = accountRole
    ? canSendMessages(accountRole)
    : false;
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const [showHeaderIdentity, setShowHeaderIdentity] = useState(false);

  useEffect(() => {
    const root = scrollAreaRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    );
    const identity = identityRef.current;
    if (!root || !identity) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowHeaderIdentity(
          !entry.isIntersecting &&
            entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0)
        );
      },
      { root, threshold: 0 }
    );
    observer.observe(identity);
    return () => observer.disconnect();
  }, [contact.id]);

  const contactId = contact.id;
  useEffect(() => {
    const request = new AbortController();
    const supabase = createClient();

    void (async () => {
      const notesRes = await supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .abortSignal(request.signal);
      if (request.signal.aborted) return;
      const loadedNotes = notesRes.data;
      if (loadedNotes) {
        const loadedIds = new Set(loadedNotes.map((note) => note.id));
        setNotes((previous) => [
          ...previous.filter((note) => !loadedIds.has(note.id)),
          ...loadedNotes,
        ]);
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
        .from('contact_notes')
        .insert({
          contact_id: contactId,
          account_id: accountId,
          user_id: user.id,
          note_text: noteText,
        })
        .select()
        .single();

      if (error || !data) throw error ?? new Error('Missing saved note');
      setNotes((previous) => [
        data,
        ...previous.filter((note) => note.id !== data.id),
      ]);
      setNewNote('');
    } catch {
      toast.error(tSidebar('addNoteFailed'));
    } finally {
      setAddingNote(false);
    }
  }

  const displayName = contact.name || contactHandle(contact);
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        'border-border bg-card flex h-full w-full min-w-0 flex-col border-l',
        className
      )}
    >
      <div className="border-border flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
        <h2 className="shrink-0 text-xs font-semibold">
          {tSidebar('contactInfo')}
        </h2>
        <div
          aria-hidden={!showHeaderIdentity}
          className={cn(
            'min-w-0 flex-1 overflow-hidden motion-safe:transition-[opacity,filter,transform] motion-safe:duration-300 motion-safe:ease-out',
            showHeaderIdentity
              ? 'translate-y-0 opacity-100 blur-none'
              : 'pointer-events-none translate-y-1 opacity-0 blur-sm'
          )}
        >
          <p className="truncate text-xs font-semibold" title={displayName}>
            {displayName}
          </p>
          <p
            className="text-muted-foreground truncate text-[10px]"
            title={contactHandle(contact)}
          >
            {contactHandle(contact)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleExpanded}
          aria-label={tWorkspace(expanded ? 'backToChat' : 'focusView')}
          title={tWorkspace(expanded ? 'backToChat' : 'focusView')}
        >
          {expanded ? (
            <ArrowRight className="size-4" />
          ) : (
            <ArrowLeft className="size-4" />
          )}
        </Button>
      </div>
      <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1">
        <div className={cn('p-4', expanded && 'flex flex-col gap-6')}>
          <div className="min-w-0">
            <div ref={identityRef}>
              {/* Contact Info */}
              <div
                className={cn(
                  'flex flex-col items-center text-center',
                  expanded && 'items-start text-left'
                )}
              >
                <div
                  className={cn(
                    'bg-muted text-foreground flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold',
                    expanded && 'hidden'
                  )}
                >
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
                <h3
                  className={cn(
                    'text-foreground mt-3 text-sm font-semibold',
                    expanded && 'mt-0 text-xl'
                  )}
                >
                  {displayName}
                </h3>
                {contact.company && (
                  <p className="text-muted-foreground text-xs">
                    {contact.company}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div
                className={cn(
                  'mt-4 space-y-2',
                  expanded &&
                    'mt-1 flex flex-wrap items-center space-y-0 gap-x-4 gap-y-1'
                )}
              >
                <button
                  onClick={handleCopyPhone}
                  style={{ cursor: 'pointer' }}
                  className={cn(
                    'text-muted-foreground hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    expanded && 'text-foreground w-auto px-0 font-medium'
                  )}
                >
                  <Phone className="text-muted-foreground h-4 w-4" />
                  <span className="flex-1 text-left">
                    {contactHandle(contact)}
                  </span>
                  {copied ? (
                    <Check className="text-primary h-3 w-3" />
                  ) : (
                    <Copy className="text-muted-foreground h-3 w-3" />
                  )}
                </button>

                {contact.email && (
                  <div className="text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                    <Mail className="text-muted-foreground h-4 w-4" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Divider */}
            <div className="border-border my-4 border-t" />

            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-muted-foreground flex items-center gap-2 px-1 text-xs font-medium tracking-wider uppercase">
                  <TagIcon className="size-3" />
                  {tSidebar('tags')}
                </div>
                {canManageContactTags && (
                  <ContactTagPicker
                    key={contact.id}
                    contactId={contact.id}
                    assignedTags={contact.tags ?? []}
                    onChange={(tag, assigned) =>
                      onContactTagChange(contact.id, tag, assigned)
                    }
                  />
                )}
              </div>
              <div className="mt-2">
                {contact.tags?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {contact.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex min-h-7 max-w-full items-center rounded-md px-3 py-1.5 text-xs font-semibold"
                        style={{
                          backgroundColor: displayTagColor(tag.color),
                          color: labelTextColor(displayTagColor(tag.color)),
                        }}
                      >
                        <span className="break-words">{tag.name}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground px-1 text-xs">
                    {tSidebar('noTags')}
                  </p>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-border my-4 border-t" />

            {canManageContactTags && (
              <UauFinancePanel
                key={`${contact.id}:${uauSuggestion ?? ''}`}
                contactId={contact.id}
                suggestionToken={uauSuggestion}
                detailed={expanded}
                onDataChange={setUauFinance}
              />
            )}
            {!expanded && <div className="border-border my-4 border-t" />}
          </div>
          <div className="min-w-0">
            {/* Notes */}
            <div>
              <div className="text-muted-foreground flex items-center gap-2 px-1 text-xs font-medium tracking-wider uppercase">
                <StickyNote className="h-3 w-3" />
                {tWorkspace('timelineTitle')}
              </div>
              <div className="mt-2">
                <div className="flex gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    aria-label={tSidebar('addNote')}
                    placeholder={tSidebar('addNotePlaceholder')}
                    disabled={addingNote}
                    rows={2}
                    className="border-border bg-muted text-foreground placeholder-muted-foreground focus:border-primary/50 min-w-0 flex-1 resize-none rounded-lg border px-3 py-2 text-xs outline-none"
                  />
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90 h-auto px-2"
                    onClick={handleAddNote}
                    aria-label={tSidebar('addNote')}
                    disabled={
                      !newNote.trim() || !accountId || !user || addingNote
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {canManageContactTags && (
                  <UauAttendanceDialog
                    key={`${contactId}:${conversationId}:${uauFinance?.selectedKey}`}
                    contactId={contactId}
                    conversationId={conversationId}
                    finance={uauFinance}
                    onSaved={async () => {
                      const response = await fetch(
                        `/api/integrations/uau/contacts/${contactId}/finance`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'refresh',
                            contractKey: uauFinance?.selectedKey ?? undefined,
                          }),
                        }
                      );
                      const result = await response.json();
                      if (!response.ok || !result.linked)
                        throw new Error('Refresh failed');
                      setUauFinance(result);
                    }}
                  />
                )}
                <ContactTimeline
                  notes={notes}
                  attendances={uauFinance?.attendances ?? []}
                  erpLoaded={uauFinance !== null}
                  erpFailed={
                    uauFinance?.warnings.includes('attendances') ?? false
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

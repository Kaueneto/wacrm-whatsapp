import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText } from '@/lib/flows/meta-send';

export interface FlowAiContext {
  kind: 'flow';
  flow_run_id: string;
  node_key: string;
  instructions: string;
  note: string;
  handoff_mode: 'queue' | 'round_robin';
  fallback_message: string;
}

export function isFlowAiActive(conversation: {
  ai_flow_context?: unknown;
  assigned_agent_id?: unknown;
  ai_autoreply_disabled?: unknown;
}): boolean {
  const context = conversation.ai_flow_context as
    FlowAiContext | null | undefined;
  return (
    context?.kind === 'flow' &&
    !conversation.assigned_agent_id &&
    !conversation.ai_autoreply_disabled
  );
}

/** Atomic and idempotent: never replaces a human who already took over. */
export async function handoffFlowAi(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  contactId: string;
  userId: string;
  context: FlowAiContext;
  summary: string;
}): Promise<void> {
  const { data, error } = await args.db.rpc('finish_flow_ai', {
    p_account_id: args.accountId,
    p_conversation_id: args.conversationId,
    p_summary: [args.summary, args.context.note].filter(Boolean).join('\n\n'),
  });
  if (error) throw new Error(error.message);
  if (data === true && args.context.fallback_message) {
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: args.context.fallback_message,
      aiGenerated: false,
    });
  }
}

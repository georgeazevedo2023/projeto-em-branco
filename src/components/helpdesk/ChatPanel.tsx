import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { Badge } from '@/components/ui/badge';
import { nowBRISO } from '@/lib/dateUtils';
import { NotesPanel } from './NotesPanel';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, ArrowLeft, User, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose, Bot, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import type { Conversation, Message } from '@/pages/dashboard/HelpDesk';
import type { Label } from './ConversationLabels';

interface ChatPanelProps {
  conversation: Conversation | null;
  onUpdateConversation: (id: string, updates: Partial<Conversation>) => void;
  onBack?: () => void;
  onShowInfo?: () => void;
  onToggleInfo?: () => void;
  showingInfo?: boolean;
  onToggleList?: () => void;
  showingList?: boolean;
  inboxLabels?: Label[];
  assignedLabelIds?: string[];
  onLabelsChanged?: () => void;
  agentNamesMap?: Record<string, string>;
  onAgentAssigned?: (conversationId: string, agentId: string) => void;
}

export const ChatPanel = ({ conversation, onUpdateConversation, onBack, onShowInfo, onToggleInfo, showingInfo, onToggleList, showingList, inboxLabels, assignedLabelIds, onLabelsChanged, agentNamesMap, onAgentAssigned }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [iaAtivada, setIaAtivada] = useState(false);
  const [ativandoIa, setAtivandoIa] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // Separate notes from chat messages
  const notes = messages.filter(m => m.direction === 'private_note');
  const chatMessages = messages.filter(m => m.direction !== 'private_note');

  // Resolve agent name from map (no extra query needed)
  const agentName = conversation?.assigned_to
    ? (agentNamesMap?.[conversation.assigned_to] || conversation.assigned_to.slice(0, 8))
    : null;

  // Load IA state from database when conversation changes
  useEffect(() => {
    setAtivandoIa(false);
    if (!conversation?.id) {
      setIaAtivada(false);
      return;
    }
    const loadStatusIa = async () => {
      const { data } = await supabase
        .from('conversations')
        .select('status_ia')
        .eq('id', conversation.id)
        .maybeSingle();
      setIaAtivada((data as any)?.status_ia === 'ligada');
    };
    loadStatusIa();
  }, [conversation?.id]);

  const fetchMessages = async () => {
    if (!conversation) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data as Message[]) || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [conversation?.id]);

  // Realtime via broadcast (bypasses RLS evaluation issues with postgres_changes)
  useEffect(() => {
    if (!conversation) return;

    const channel = supabase
      .channel('helpdesk-realtime')
      .on('broadcast', { event: 'new-message' }, (payload) => {
        console.log('[ChatPanel] broadcast received:', payload.payload?.conversation_id);
        if (payload.payload?.conversation_id === conversation.id) {
          fetchMessages();
          // Check for status_ia and sync to DB
          if (payload.payload?.status_ia === 'ligada') {
            console.log('[ChatPanel] IA ativada via broadcast');
            setIaAtivada(true);
            supabase.from('conversations').update({ status_ia: 'ligada' } as any).eq('id', conversation.id).then();
          } else if (payload.payload?.status_ia === 'desligada') {
            console.log('[ChatPanel] IA desligada via broadcast');
            setIaAtivada(false);
            supabase.from('conversations').update({ status_ia: 'desligada' } as any).eq('id', conversation.id).then();
          }
        }
      })
      .on('broadcast', { event: 'transcription-updated' }, (payload) => {
        const { messageId, conversationId, transcription } = payload.payload || {};
        console.log('[ChatPanel] transcription-updated:', messageId, conversationId);
        if (conversationId === conversation.id && messageId && transcription) {
          setMessages(prev => prev.map(msg =>
            msg.id === messageId ? { ...msg, transcription } : msg
          ));
        }
      })
      .subscribe((status) => {
        console.log('[ChatPanel] channel status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }, 150);
    return () => clearTimeout(timer);
  }, [messages, loading]);

  const handleActivateIA = async () => {
    if (!conversation || ativandoIa) return;
    setAtivandoIa(true);
    try {
      const contact = conversation.contact;
      const inboxId = conversation.inbox_id;
      const instanceId = conversation.inbox?.instance_id || '';

      // Fetch inbox webhook_outgoing_url and name
      const { data: inboxData } = await supabase
        .from('inboxes')
        .select('webhook_outgoing_url, name')
        .eq('id', inboxId)
        .maybeSingle();

      const webhookUrl = inboxData?.webhook_outgoing_url;
      if (!webhookUrl) {
        toast.error('Nenhum webhook de saída configurado para esta caixa');
        return;
      }

      // Fetch instance name
      const { data: instanceData } = await supabase
        .from('instances')
        .select('name')
        .eq('id', instanceId)
        .maybeSingle();

      // Fetch logged-in agent info
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const userId = sessionData?.session?.user?.id;

      let currentAgentName = 'Agente';
      if (userId) {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle();
        currentAgentName = profileData?.full_name || 'Agente';
      }

      const payload = {
        timestamp: nowBRISO(),
        instance_name: instanceData?.name || '',
        instanceName: instanceData?.name || '',
        instance_id: instanceId,
        inbox_name: inboxData?.name || '',
        inbox_id: inboxId,
        contact_name: contact?.name || contact?.phone || '',
        remotejid: contact?.jid || '',
        fromMe: true,
        agent_name: currentAgentName,
        agent_id: userId || '',
        pausar_agente: 'nao',
        status_ia: 'ligar',
        message_type: 'text',
        message: null,
        media_url: null,
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fire-outgoing-webhook`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ webhook_url: webhookUrl, payload }),
        }
      );

      if (!response.ok) {
        throw new Error('Falha ao ativar IA');
      }

      toast.success('Solicitação de ativação da IA enviada');
    } catch (err) {
      console.error('Error activating IA:', err);
      toast.error('Erro ao ativar IA');
    } finally {
      setAtivandoIa(false);
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Selecione uma conversa</p>
        <p className="text-sm">Escolha uma conversa na lista para começar</p>
      </div>
    );
  }

  const contact = conversation.contact;

  return (
    <>
      {/* Header */}
      <div className="min-h-[3.5rem] px-3 md:px-4 py-2 flex items-center gap-2 border-b border-border/50 bg-card shrink-0 z-10 relative">
        {/* Left: nav buttons + contact info */}
        <div className="flex items-center gap-1 shrink-0">
          {onBack && (
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          {onToggleList && (
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={onToggleList}>
              {showingList ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            </Button>
          )}
        </div>

        {/* Contact name + phone + agent stacked */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h3 className="font-semibold text-sm truncate leading-tight">
            {contact?.name || contact?.phone || 'Desconhecido'}
          </h3>
          {contact?.phone && (
            <span className="text-[11px] text-muted-foreground truncate leading-tight">
              {contact.phone}
            </span>
          )}
          {agentName && (
            <span className="text-[10px] text-primary/80 truncate leading-tight font-medium">
              👤 {agentName}
            </span>
          )}
        </div>

        {/* Right: actions group */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Select
            value={conversation.status}
            onValueChange={(status) => onUpdateConversation(conversation.id, { status })}
          >
            <SelectTrigger className="h-7 w-auto text-xs border-border/50 bg-transparent shadow-none focus:ring-0 gap-1 px-2 [&>svg:last-child]:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="aberta">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Aberta</span>
              </SelectItem>
              <SelectItem value="pendente">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Pendente</span>
              </SelectItem>
              <SelectItem value="resolvida">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-muted-foreground/50" /> Resolvida</span>
              </SelectItem>
            </SelectContent>
          </Select>

          {iaAtivada ? (
            <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1 shrink-0 text-[11px] px-2 py-0.5">
              <Bot className="w-3 h-3" />
              IA Ativada
            </Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-7 text-xs gap-1"
              onClick={handleActivateIA}
              disabled={ativandoIa}
            >
              <Bot className="w-3 h-3" />
              {ativandoIa ? 'Ativando...' : 'Ativar IA'}
            </Button>
          )}

          {/* Notes button */}
          {notes.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 relative"
              onClick={() => setNotesOpen(true)}
              title="Ver notas privadas"
            >
              <StickyNote className="w-4 h-4 text-warning" />
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {notes.length}
              </span>
            </Button>
          )}

          {onShowInfo && (
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onShowInfo}>
              <User className="w-4 h-4" />
            </Button>
          )}
          {onToggleInfo && (
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onToggleInfo}>
              {showingInfo ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">
            Nenhuma mensagem ainda
          </div>
        ) : (
          <div className="space-y-2">
            {chatMessages.map(msg => (
              <MessageBubble key={msg.id} message={msg} instanceId={conversation.inbox?.instance_id} agentNamesMap={agentNamesMap} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput conversation={conversation} onMessageSent={() => { fetchMessages(); setIaAtivada(false); }} onAgentAssigned={onAgentAssigned} inboxLabels={inboxLabels} assignedLabelIds={assignedLabelIds} onLabelsChanged={onLabelsChanged} onStatusChange={(status) => onUpdateConversation(conversation.id, { status })} />

      {/* Notes Panel */}
      <NotesPanel
        open={notesOpen}
        onOpenChange={setNotesOpen}
        notes={notes}
        onNoteDeleted={(noteId) => setMessages(prev => prev.filter(m => m.id !== noteId))}
        agentNamesMap={agentNamesMap}
      />
    </>
  );
};

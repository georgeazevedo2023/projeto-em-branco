import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Phone, ArrowLeft, Tags, Settings2, UserCheck, Sparkles, RefreshCw, Clock, Target, CheckCircle2, AlertCircle, History, ChevronDown, ChevronUp, MessageSquare, Wand2 } from 'lucide-react';
import type { Conversation, AiSummary } from '@/pages/dashboard/HelpDesk';
import { ConversationLabels, type Label } from './ConversationLabels';
import { LabelPicker } from './LabelPicker';
import { ManageLabelsDialog } from './ManageLabelsDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatBR } from '@/lib/dateUtils';

interface InboxAgent {
  user_id: string;
  full_name: string;
}

interface PastConversation {
  id: string;
  status: string;
  last_message_at: string | null;
  created_at: string;
  ai_summary: AiSummary | null;
  last_message: string | null;
}

interface ContactInfoPanelProps {
  conversation: Conversation;
  onUpdateConversation: (id: string, updates: Partial<Conversation>) => void;
  onBack?: () => void;
  inboxLabels?: Label[];
  assignedLabelIds?: string[];
  onLabelsChanged?: () => void;
  agentNamesMap?: Record<string, string>;
}

const statusOptions = [
  { value: 'aberta', label: 'Aberta' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'resolvida', label: 'Resolvida' },
];

const priorityOptions = [
  { value: 'alta', label: 'Alta', color: 'bg-destructive text-destructive-foreground' },
  { value: 'media', label: 'Média', color: 'bg-warning text-warning-foreground' },
  { value: 'baixa', label: 'Baixa', color: 'bg-primary text-primary-foreground' },
];

const statusBadgeClass: Record<string, string> = {
  aberta: 'bg-primary/15 text-primary border-primary/30',
  pendente: 'bg-warning/15 text-warning border-warning/30',
  resolvida: 'bg-success/15 text-success border-success/30',
};

const statusLabel: Record<string, string> = {
  aberta: 'Aberta',
  pendente: 'Pendente',
  resolvida: 'Resolvida',
};

export const ContactInfoPanel = ({
  conversation,
  onUpdateConversation,
  onBack,
  inboxLabels = [],
  assignedLabelIds = [],
  onLabelsChanged,
  agentNamesMap = {},
}: ContactInfoPanelProps) => {
  const contact = conversation.contact;
  const name = contact?.name || contact?.phone || 'Desconhecido';
  const [manageLabelsOpen, setManageLabelsOpen] = useState(false);
  const [agents, setAgents] = useState<InboxAgent[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(conversation.ai_summary || null);
  const [summarizing, setSummarizing] = useState(false);

  // Past conversations state
  const [pastConversations, setPastConversations] = useState<PastConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set());
  const [generatingSummaryFor, setGeneratingSummaryFor] = useState<string | null>(null);

  // Fetch departments for this inbox
  useEffect(() => {
    const fetchDepts = async () => {
      if (!conversation.inbox_id) return;
      const { data } = await supabase
        .from('departments')
        .select('id, name')
        .eq('inbox_id', conversation.inbox_id)
        .order('name');
      setDepartments((data as any[]) || []);
    };
    fetchDepts();
  }, [conversation.inbox_id]);

  // Sync aiSummary when conversation changes
  useEffect(() => {
    setAiSummary(conversation.ai_summary || null);
  }, [conversation.id, conversation.ai_summary]);

  // Fetch past conversations for this contact
  useEffect(() => {
    const fetchHistory = async () => {
      if (!conversation.contact_id) return;
      setHistoryLoading(true);
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('id, status, last_message_at, created_at, ai_summary, last_message')
          .eq('contact_id', conversation.contact_id)
          .neq('id', conversation.id)
          .order('last_message_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        setPastConversations(
          (data || []).map((c: any) => ({
            ...c,
            ai_summary: c.ai_summary || null,
          }))
        );
      } catch (err) {
        console.error('[ContactInfoPanel] fetchHistory error:', err);
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory();
  }, [conversation.id, conversation.contact_id]);

  const handleSummarize = async (forceRefresh = false) => {
    setSummarizing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-conversation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ conversation_id: conversation.id, force_refresh: forceRefresh }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        if (res.status === 429) throw new Error('Limite de IA atingido. Tente mais tarde.');
        if (res.status === 402) throw new Error('Créditos de IA insuficientes.');
        throw new Error(result.error || 'Erro ao gerar resumo');
      }

      setAiSummary(result.summary);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar resumo');
    } finally {
      setSummarizing(false);
    }
  };

  // Fetch inbox members using two separate queries (no FK between inbox_users and user_profiles)
  useEffect(() => {
    const fetchAgents = async () => {
      if (!conversation.inbox_id) return;

      // Step 1: get user_ids from inbox_users
      const { data: members, error: membersError } = await supabase
        .from('inbox_users')
        .select('user_id')
        .eq('inbox_id', conversation.inbox_id);

      if (membersError) {
        console.error('[ContactInfoPanel] fetchAgents members error:', membersError);
        return;
      }

      const userIds = members?.map(m => m.user_id) ?? [];
      if (userIds.length === 0) {
        setAgents([]);
        return;
      }

      // Step 2: get full names from user_profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profilesError) {
        console.error('[ContactInfoPanel] fetchAgents profiles error:', profilesError);
        return;
      }

      const agentList: InboxAgent[] = (profiles ?? [])
        .map(p => ({
          user_id: p.id,
          full_name: p.full_name || 'Sem nome',
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));

      setAgents(agentList);
    };
    fetchAgents();
  }, [conversation.inbox_id]);

  const assignedLabels = inboxLabels.filter(l => assignedLabelIds.includes(l.id));

  const handleRemoveLabel = async (labelId: string) => {
    try {
      await supabase
        .from('conversation_labels')
        .delete()
        .eq('conversation_id', conversation.id)
        .eq('label_id', labelId);
      onLabelsChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover etiqueta');
    }
  };

  const handleAssignAgent = async (value: string) => {
    const agentId = value === '__none__' ? null : value;
    const agent = agentId ? agents.find(a => a.user_id === agentId) : null;
    const agentName = agent?.full_name || null;

    // Update DB
    const { error } = await supabase
      .from('conversations')
      .update({ assigned_to: agentId })
      .eq('id', conversation.id);

    if (error) {
      toast.error('Erro ao atribuir agente');
      return;
    }

    // Broadcast para sync em tempo real
    await supabase.channel('helpdesk-conversations').send({
      type: 'broadcast',
      event: 'assigned-agent',
      payload: {
        conversation_id: conversation.id,
        assigned_to: agentId,
      },
    });

    // Update local via callback
    onUpdateConversation(conversation.id, { assigned_to: agentId } as any);
    toast.success(agentId ? `Atribuído a ${agentName}` : 'Agente removido');
  };

  const handleAssignDepartment = async (value: string) => {
    const deptId = value === '__none__' ? null : value;
    const { error } = await supabase
      .from('conversations')
      .update({ department_id: deptId } as any)
      .eq('id', conversation.id);
    if (error) {
      toast.error('Erro ao atribuir departamento');
      return;
    }
    onUpdateConversation(conversation.id, { department_id: deptId } as any);
    const deptName = deptId ? departments.find(d => d.id === deptId)?.name : null;
    toast.success(deptId ? `Departamento: ${deptName}` : 'Departamento removido');
  };

  const toggleSummaryExpanded = (convId: string) => {
    setExpandedSummaries(prev => {
      const next = new Set(prev);
      if (next.has(convId)) {
        next.delete(convId);
      } else {
        next.add(convId);
      }
      return next;
    });
  };

  const handleGenerateHistorySummary = async (convId: string) => {
    setGeneratingSummaryFor(convId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-conversation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ conversation_id: convId, force_refresh: false }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        if (res.status === 429) throw new Error('Limite de IA atingido. Tente mais tarde.');
        if (res.status === 402) throw new Error('Créditos de IA insuficientes.');
        throw new Error(result.error || 'Erro ao gerar resumo');
      }

      // Update local state with the new summary
      setPastConversations(prev =>
        prev.map(c =>
          c.id === convId ? { ...c, ai_summary: result.summary } : c
        )
      );
      toast.success('Resumo gerado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar resumo');
    } finally {
      setGeneratingSummaryFor(null);
    }
  };

  return (
    <div className="p-4 space-y-5 overflow-y-auto flex-1">
      {onBack && (
        <Button variant="ghost" size="sm" className="gap-1 -ml-2 -mt-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
      )}

      {/* Contact */}
      <div className="flex flex-col items-center text-center">
        <Avatar className="w-16 h-16 mb-2">
          <AvatarImage src={contact?.profile_pic_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xl">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-semibold">{name}</h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Phone className="w-3 h-3" />
          <span>{contact?.phone}</span>
        </div>
      </div>

      {/* Labels */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Tags className="w-3 h-3" />
            Etiquetas
          </label>
          <div className="flex items-center gap-0.5">
            {onLabelsChanged && (
              <LabelPicker
                conversationId={conversation.id}
                inboxLabels={inboxLabels}
                assignedLabelIds={assignedLabelIds}
                onChanged={onLabelsChanged}
              />
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setManageLabelsOpen(true)} title="Gerenciar etiquetas">
              <Settings2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <ConversationLabels labels={assignedLabels} size="md" onRemove={handleRemoveLabel} />
        {assignedLabels.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma etiqueta</p>
        )}
      </div>

      {/* Status */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium">Status</label>
        <Select
          value={conversation.status}
          onValueChange={(v) => onUpdateConversation(conversation.id, { status: v })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priority */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium">Prioridade</label>
        <Select
          value={conversation.priority}
          onValueChange={(v) => onUpdateConversation(conversation.id, { priority: v })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priorityOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', opt.color.split(' ')[0])} />
                  {opt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Agent Assignment */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          <UserCheck className="w-3 h-3" />
          Agente Responsável
        </label>
        <div className="flex gap-1">
          <Select
            value={conversation.assigned_to || '__none__'}
            onValueChange={handleAssignAgent}
          >
            <SelectTrigger className="h-8 text-sm flex-1">
              <SelectValue placeholder="Nenhum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Nenhum —</SelectItem>
              {agents.map(agent => (
                <SelectItem key={agent.user_id} value={agent.user_id}>
                  {agent.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {conversation.assigned_to && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleAssignAgent('__none__')}
              title="Remover atribuição"
            >
              ✕
            </Button>
          )}
        </div>
      </div>

      {/* Department Assignment */}
      {departments.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Target className="w-3 h-3" />
            Departamento
          </label>
          <Select
            value={conversation.department_id || '__none__'}
            onValueChange={handleAssignDepartment}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Nenhum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Nenhum —</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* AI Summary — current conversation */}
      <div className="space-y-2 border border-border/50 rounded-lg p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium flex items-center gap-1.5 text-foreground">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Resumo da Conversa
          </label>
          {aiSummary && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => handleSummarize(true)}
              disabled={summarizing}
              title="Atualizar resumo"
            >
              <RefreshCw className={cn('w-3 h-3', summarizing && 'animate-spin')} />
            </Button>
          )}
        </div>

        {summarizing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-primary" />
            <span>Analisando conversa com IA...</span>
          </div>
        )}

        {!summarizing && !aiSummary && (
          <p className="text-xs text-muted-foreground italic py-1">
            Resumo gerado automaticamente ao resolver a conversa ou após 1h de inatividade.
          </p>
        )}

        {!summarizing && aiSummary && (
          <div className="space-y-2.5 text-xs">
            {/* Reason */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-muted-foreground font-medium">
                <Target className="w-3 h-3" />
                Motivo do contato
              </div>
              <p className="text-foreground leading-relaxed">{aiSummary.reason}</p>
            </div>

            {/* Summary */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-muted-foreground font-medium">
                <AlertCircle className="w-3 h-3" />
                Resumo
              </div>
              <p className="text-foreground leading-relaxed">{aiSummary.summary}</p>
            </div>

            {/* Resolution */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-muted-foreground font-medium">
                <CheckCircle2 className="w-3 h-3" />
                Resolução
              </div>
              <p className="text-foreground leading-relaxed">{aiSummary.resolution}</p>
            </div>

            {/* Metadata */}
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-2.5 h-2.5" />
                <span>
                  Gerado {new Date(aiSummary.generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <span className="text-muted-foreground">{aiSummary.message_count} msgs</span>
            </div>
          </div>
        )}
      </div>

      {/* Contact History Timeline */}
      <div className="space-y-2">
        <button
          onClick={() => setHistoryExpanded(v => !v)}
          className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <span className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            Histórico do contato
            {!historyLoading && (
              <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {pastConversations.length}
              </span>
            )}
          </span>
          {historyExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {historyExpanded && (
          <div className="space-y-0">
            {historyLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 pl-1">
                <div className="w-3 h-3 rounded-full border border-muted-foreground/30 border-t-primary animate-spin" />
                Carregando histórico...
              </div>
            )}

            {!historyLoading && pastConversations.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2 pl-1">
                Nenhuma conversa anterior com este contato.
              </p>
            )}

            {!historyLoading && pastConversations.length > 0 && (
              <div className="relative">
                {/* Timeline vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/60" />

                <div className="space-y-0">
                  {pastConversations.map((past, idx) => {
                    const dateStr = past.last_message_at || past.created_at;
                    const isExpanded = expandedSummaries.has(past.id);
                    const hasSummary = !!past.ai_summary;

                    return (
                      <div key={past.id} className="relative pl-5 pb-4 last:pb-0">
                        {/* Timeline dot */}
                        <div className={cn(
                          'absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-background flex items-center justify-center',
                          past.status === 'resolvida'
                            ? 'border-success'
                            : past.status === 'pendente'
                            ? 'border-warning'
                            : 'border-primary'
                        )}>
                          <div className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            past.status === 'resolvida'
                              ? 'bg-success'
                              : past.status === 'pendente'
                              ? 'bg-warning'
                              : 'bg-primary'
                          )} />
                        </div>

                        {/* Card */}
                        <div className="rounded-md border border-border/40 bg-muted/20 overflow-hidden">
                          {/* Header */}
                          <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[11px] font-medium text-foreground shrink-0">
                                {formatBR(dateStr, 'dd/MM/yyyy')}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {formatBR(dateStr, 'HH:mm')}
                              </span>
                            </div>
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0',
                              statusBadgeClass[past.status] || 'bg-muted text-muted-foreground border-border'
                            )}>
                              {statusLabel[past.status] || past.status}
                            </span>
                          </div>

                          {/* Last message preview + generate summary button (if no summary) */}
                          {!hasSummary && (
                            <div className="px-2.5 pb-2 space-y-1.5">
                              {past.last_message && (
                                <div className="flex items-start gap-1">
                                  <MessageSquare className="w-2.5 h-2.5 text-muted-foreground mt-0.5 shrink-0" />
                                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                                    {past.last_message}
                                  </p>
                                </div>
                              )}
                              <button
                                onClick={() => handleGenerateHistorySummary(past.id)}
                                disabled={generatingSummaryFor === past.id}
                                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {generatingSummaryFor === past.id ? (
                                  <>
                                    <Sparkles className="w-3 h-3 animate-pulse" />
                                    Gerando resumo...
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="w-3 h-3" />
                                    Gerar resumo com IA
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* AI Summary */}
                          {hasSummary && (
                            <div className="border-t border-border/30">
                              {/* Reason always visible */}
                              <div className="px-2.5 py-1.5">
                                <div className="flex items-start gap-1">
                                  <Target className="w-2.5 h-2.5 text-primary mt-0.5 shrink-0" />
                                  <p className="text-[11px] text-foreground leading-relaxed">
                                    {past.ai_summary!.reason}
                                  </p>
                                </div>
                              </div>

                              {/* Expanded detail */}
                              {isExpanded && (
                                <div className="px-2.5 pb-2 space-y-1.5 border-t border-border/20 pt-1.5">
                                  {past.ai_summary!.summary && (
                                    <div className="flex items-start gap-1">
                                      <AlertCircle className="w-2.5 h-2.5 text-muted-foreground mt-0.5 shrink-0" />
                                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        {past.ai_summary!.summary}
                                      </p>
                                    </div>
                                  )}
                                  {past.ai_summary!.resolution && (
                                    <div className="flex items-start gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5 text-success mt-0.5 shrink-0" />
                                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        {past.ai_summary!.resolution}
                                      </p>
                                    </div>
                                  )}
                                  {past.ai_summary!.message_count && (
                                    <p className="text-[10px] text-muted-foreground/60">
                                      {past.ai_summary!.message_count} mensagens
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Toggle expand */}
                              <button
                                onClick={() => toggleSummaryExpanded(past.id)}
                                className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors border-t border-border/20"
                              >
                                {isExpanded ? (
                                  <>Ver menos <ChevronUp className="w-3 h-3" /></>
                                ) : (
                                  <>Ver resumo completo <ChevronDown className="w-3 h-3" /></>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inbox */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium">Caixa de Entrada</label>
        <Badge variant="secondary" className="text-xs">
          {conversation.inbox?.name || 'N/A'}
        </Badge>
      </div>

      {/* Manage Labels Dialog */}
      {conversation.inbox_id && onLabelsChanged && (
        <ManageLabelsDialog
          open={manageLabelsOpen}
          onOpenChange={setManageLabelsOpen}
          inboxId={conversation.inbox_id}
          labels={inboxLabels}
          onChanged={onLabelsChanged}
        />
      )}
    </div>
  );
};

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { ConversationList } from '@/components/helpdesk/ConversationList';
import { ChatPanel } from '@/components/helpdesk/ChatPanel';
import { ContactInfoPanel } from '@/components/helpdesk/ContactInfoPanel';
import { ManageLabelsDialog } from '@/components/helpdesk/ManageLabelsDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { Label } from '@/components/helpdesk/ConversationLabels';

export interface AiSummary {
  reason: string;
  summary: string;
  resolution: string;
  generated_at: string;
  message_count: number;
}

export interface Conversation {
  id: string;
  inbox_id: string;
  contact_id: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  department_id: string | null;
  is_read: boolean;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  ai_summary?: AiSummary | null;
  contact?: {
    id: string;
    name: string | null;
    phone: string;
    jid: string;
    profile_pic_url: string | null;
  };
  inbox?: {
    id: string;
    name: string;
    instance_id: string;
    webhook_outgoing_url?: string | null;
  };
  last_message?: string;
  department_name?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: string;
  content: string | null;
  media_type: string;
  media_url: string | null;
  sender_id: string | null;
  external_id: string | null;
  created_at: string;
  transcription?: string | null;
}

function mediaPreview(mediaType: string): string {
  switch (mediaType) {
    case 'image': return '📷 Foto';
    case 'video': return '🎥 Vídeo';
    case 'audio': return '🎵 Áudio';
    case 'document': return '📎 Documento';
    default: return '';
  }
}

interface Inbox {
  id: string;
  name: string;
  instance_id: string;
  webhook_outgoing_url?: string | null;
}

const HelpDesk = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const inboxParam = searchParams.get('inbox');
  const deptParam = searchParams.get('dept');
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'info'>('list');
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('aberta');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [selectedInboxId, setSelectedInboxId] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [syncedInboxes, setSyncedInboxes] = useState<Set<string>>(new Set());

  // Labels state
  const [inboxLabels, setInboxLabels] = useState<Label[]>([]);
  const [conversationLabelsMap, setConversationLabelsMap] = useState<Record<string, string[]>>({});
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [agentNamesMap, setAgentNamesMap] = useState<Record<string, string>>({});
  const [conversationNotesSet, setConversationNotesSet] = useState<Set<string>>(new Set());

  // Departments state
  const [inboxDepartments, setInboxDepartments] = useState<{ id: string; name: string }[]>([]);
  const [allInboxDepts, setAllInboxDepts] = useState<Record<string, { id: string; name: string }[]>>({});
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);

  const { isSuperAdmin } = useAuth();

  // Fetch user's inboxes (filtered by access for non-super-admins)
  useEffect(() => {
    const fetchInboxes = async () => {
      if (!user) return;

      let inboxData: Inbox[] = [];

      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from('inboxes')
          .select('id, name, instance_id, webhook_outgoing_url')
          .order('name');
        if (!error && data) inboxData = data;
      } else {
        const { data, error } = await supabase
          .from('inbox_users')
          .select('inboxes(id, name, instance_id, webhook_outgoing_url)')
          .eq('user_id', user.id);
        if (!error && data) {
          inboxData = data
            .map((d: any) => d.inboxes)
            .filter(Boolean) as Inbox[];
        }
      }

      if (inboxData.length > 0) {
        setInboxes(inboxData);
        const targetInbox = inboxParam && inboxData.some(ib => ib.id === inboxParam)
          ? inboxParam
          : inboxData[0].id;
        setSelectedInboxId(targetInbox);
        if (deptParam) {
          setDepartmentFilter(deptParam);
        }

        // Fetch departments for all inboxes (for dropdown)
        const inboxIds = inboxData.map(ib => ib.id);
        const { data: deptData } = await supabase
          .from('departments')
          .select('id, name, inbox_id')
          .in('inbox_id', inboxIds)
          .order('name');
        if (deptData) {
          const grouped: Record<string, { id: string; name: string }[]> = {};
          deptData.forEach(d => {
            if (!grouped[d.inbox_id]) grouped[d.inbox_id] = [];
            grouped[d.inbox_id].push({ id: d.id, name: d.name });
          });
          setAllInboxDepts(grouped);
        }
      }
    };
    fetchInboxes();
  }, [user, inboxParam, isSuperAdmin]);

  // Fetch labels for selected inbox
  const fetchLabels = useCallback(async () => {
    if (!selectedInboxId) return;
    const { data } = await supabase
      .from('labels')
      .select('*')
      .eq('inbox_id', selectedInboxId)
      .order('name');
    setInboxLabels((data as Label[]) || []);
  }, [selectedInboxId]);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  // Fetch departments for selected inbox
  const fetchDepartments = useCallback(async () => {
    if (!selectedInboxId) return;
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .eq('inbox_id', selectedInboxId)
      .order('name');
    setInboxDepartments((data as any[]) || []);
  }, [selectedInboxId]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  // Fetch agent names from all user profiles
  const fetchAgentNames = useCallback(async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(p => {
        if (p.full_name) map[p.id] = p.full_name;
      });
      setAgentNamesMap(map);
    }
  }, []);

  useEffect(() => {
    fetchAgentNames();
  }, [fetchAgentNames]);

  // Fetch conversation_labels for loaded conversations
  const fetchConversationLabels = useCallback(async (convIds: string[]) => {
    if (convIds.length === 0) {
      setConversationLabelsMap({});
      return;
    }
    const { data } = await supabase
      .from('conversation_labels')
      .select('conversation_id, label_id')
      .in('conversation_id', convIds);

    const map: Record<string, string[]> = {};
    (data || []).forEach(cl => {
      if (!map[cl.conversation_id]) map[cl.conversation_id] = [];
      map[cl.conversation_id].push(cl.label_id);
    });
    setConversationLabelsMap(map);
  }, []);

  // Fetch which conversations have private notes
  const fetchConversationNotes = useCallback(async (convIds: string[]) => {
    if (convIds.length === 0) {
      setConversationNotesSet(new Set());
      return;
    }
    const { data } = await supabase
      .from('conversation_messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .eq('direction', 'private_note');

    const noteSet = new Set<string>((data || []).map((m: any) => m.conversation_id));
    setConversationNotesSet(noteSet);
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!user || !selectedInboxId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('conversations')
        .select('*, contacts(*), inboxes(id, name, instance_id, webhook_outgoing_url), departments(id, name)')
        .eq('inbox_id', selectedInboxId)
        .order('last_message_at', { ascending: false });

      if (statusFilter !== 'todas') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const convIds = (data || []).map((c: any) => c.id);

      // Fetch conversation labels and notes in parallel
      await Promise.all([
        fetchConversationLabels(convIds),
        fetchConversationNotes(convIds),
      ]);

      const mapped: Conversation[] = (data || []).map((c: any) => ({
        ...c,
        contact: c.contacts,
        inbox: c.inboxes,
        last_message: c.last_message || null,
        ai_summary: c.ai_summary || null,
        department_name: c.departments?.name || null,
      }));

      setConversations(mapped);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [user, selectedInboxId, statusFilter, fetchConversationLabels, fetchConversationNotes]);

  // Defensive reset: garante que selectedConversation pertence à caixa atual
  useEffect(() => {
    setSelectedConversation(prev => {
      if (prev && prev.inbox_id !== selectedInboxId) return null;
      return prev;
    });
  }, [selectedInboxId]);

  useEffect(() => {
    if (selectedInboxId) {
      fetchConversations();
    }
  }, [fetchConversations]);

  // Realtime via broadcast
  useEffect(() => {
    if (!selectedInboxId) return;

    const channel = supabase
      .channel('helpdesk-conversations')
      .on('broadcast', { event: 'new-message' }, (payload) => {
        console.log('[HelpDesk] broadcast received:', payload.payload);
        const data = payload.payload;
        if (data?.inbox_id === selectedInboxId) {
          setConversations(prev => {
            const exists = prev.some(c => c.id === data.conversation_id);
            if (exists) {
              const updated = prev.map(c =>
                c.id === data.conversation_id
                  ? { ...c, last_message: data.content || mediaPreview(data.media_type) || c.last_message, last_message_at: data.created_at, is_read: false }
                  : c
              );
              return updated.sort((a, b) =>
                new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
              );
            }
            fetchConversations();
            return prev;
          });
        }
      })
      .on('broadcast', { event: 'assigned-agent' }, (payload) => {
        const { conversation_id, assigned_to } = payload.payload || {};
        if (!conversation_id) return;
        // Atualiza lista de conversas
        setConversations(prev =>
          prev.map(c => c.id === conversation_id ? { ...c, assigned_to: assigned_to ?? null } : c)
        );
        // Atualiza conversa selecionada
        setSelectedConversation(prev =>
          prev?.id === conversation_id ? { ...prev, assigned_to: assigned_to ?? null } : prev
        );
      })
      .subscribe((status) => {
        console.log('[HelpDesk] channel status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedInboxId, fetchConversations]);

  const handleSync = async () => {
    if (!selectedInboxId || syncing) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-conversations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ inbox_id: selectedInboxId }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      toast({
        title: 'Sincronização concluída',
        description: `${result.synced} conversas sincronizadas${result.errors > 0 ? `, ${result.errors} erros` : ''}`,
      });

      fetchConversations();
    } catch (err: any) {
      console.error('Sync error:', err);
      toast({
        title: 'Erro na sincronização',
        description: err.message || 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    if (isMobile) setMobileView('chat');

    if (!conversation.is_read) {
      await supabase
        .from('conversations')
        .update({ is_read: true })
        .eq('id', conversation.id);

      setConversations(prev =>
        prev.map(c => c.id === conversation.id ? { ...c, is_read: true } : c)
      );
    }
  };

  const handleUpdateConversation = async (id: string, updates: Partial<Omit<Conversation, 'ai_summary'>>) => {
    await supabase.from('conversations').update(updates).eq('id', id);
    fetchConversations();
    if (selectedConversation?.id === id) {
      setSelectedConversation(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const handleLabelsChanged = () => {
    fetchLabels();
    const convIds = conversations.map(c => c.id);
    fetchConversationLabels(convIds);
  };

  const handleAgentAssigned = (conversationId: string, agentId: string) => {
    setConversations(prev =>
      prev.map(c => c.id === conversationId ? { ...c, assigned_to: agentId } : c)
    );
    setSelectedConversation(prev =>
      prev?.id === conversationId ? { ...prev, assigned_to: agentId } : prev
    );
  };

  const handleInboxChange = (val: string) => {
    setSelectedConversation(null);
    setLabelFilter(null);
    if (val.includes('|')) {
      const [inboxId, deptId] = val.split('|');
      setSelectedInboxId(inboxId);
      setDepartmentFilter(deptId);
    } else {
      setSelectedInboxId(val);
      setDepartmentFilter(null);
    }
    if (isMobile) setMobileView('list');
  };

  // Build composite select value
  const inboxSelectValue = departmentFilter
    ? `${selectedInboxId}|${departmentFilter}`
    : selectedInboxId;

  const [assignmentFilter, setAssignmentFilter] = useState<'todas' | 'minhas' | 'nao-atribuidas'>('todas');
  const [priorityFilter, setPriorityFilter] = useState<'todas' | 'alta' | 'media' | 'baixa'>('todas');

  const filteredConversations = conversations.filter(c => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = c.contact?.name?.toLowerCase().includes(q) || c.contact?.phone?.includes(q);
      if (!matchesSearch) return false;
    }
    // Label filter
    if (labelFilter) {
      const convLabels = conversationLabelsMap[c.id] || [];
      if (!convLabels.includes(labelFilter)) return false;
    }
    // Assignment filter
    if (assignmentFilter === 'minhas' && c.assigned_to !== user?.id) return false;
    if (assignmentFilter === 'nao-atribuidas' && c.assigned_to !== null) return false;
    // Priority filter
    if (priorityFilter !== 'todas' && c.priority !== priorityFilter) return false;
    // Department filter
    if (departmentFilter && c.department_id !== departmentFilter) return false;
    return true;
  });

  const [manageLabelsOpen, setManageLabelsOpen] = useState(false);

  const statusTabs = [
    { value: 'aberta', label: 'Abertas' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'resolvida', label: 'Resolvidas' },
    { value: 'todas', label: 'Todas' },
  ];

  const unifiedHeader = (
    <div className="shrink-0 bg-card/50 backdrop-blur-sm border-b border-border/50">
      {/* Linha principal: título + tabs (desktop) + seletor */}
      <div className="flex items-center gap-2 px-4 h-11">
        <h2 className="font-display font-bold text-base shrink-0">Atendimento</h2>

        {/* Status tabs — visíveis só no desktop */}
        <div className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto no-scrollbar">
          {statusTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {inboxes.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="hidden md:inline text-xs text-muted-foreground">Caixa:</span>
            <Select value={inboxSelectValue} onValueChange={handleInboxChange}>
              <SelectTrigger className="w-36 md:w-52 h-7 text-xs border-border/30 bg-secondary/50">
                <SelectValue placeholder="Selecionar inbox" />
              </SelectTrigger>
              <SelectContent>
                {inboxes.map(inbox => {
                  const depts = allInboxDepts[inbox.id] || [];
                  return (
                    <SelectGroup key={inbox.id}>
                      <SelectItem value={inbox.id}>
                        {inbox.name}
                      </SelectItem>
                      {depts.map(dept => (
                        <SelectItem key={dept.id} value={`${inbox.id}|${dept.id}`} className="pl-8 text-xs text-muted-foreground">
                          ↳ {dept.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Status tabs — apenas no mobile, linha separada com scroll horizontal */}
      <div className="md:hidden flex items-center gap-0.5 px-3 pb-2 overflow-x-auto no-scrollbar">
        {statusTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0',
              statusFilter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );

  const listProps = {
    conversations: filteredConversations,
    selectedId: selectedConversation?.id || null,
    searchQuery,
    onSearchChange: setSearchQuery,
    onSelect: handleSelectConversation,
    loading,
    inboxLabels,
    conversationLabelsMap,
    labelFilter,
    onLabelFilterChange: setLabelFilter,
    inboxId: selectedInboxId,
    onLabelsChanged: handleLabelsChanged,
    agentNamesMap,
    conversationNotesSet,
    assignmentFilter,
    onAssignmentFilterChange: setAssignmentFilter,
    priorityFilter,
    onPriorityFilterChange: setPriorityFilter,
    inboxDepartments,
    departmentFilter,
    onDepartmentFilterChange: setDepartmentFilter,
  };

  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100dvh-3.5rem)] -m-4 overflow-hidden">
        {mobileView === 'list' && (
          <>
            {unifiedHeader}
            <div className="flex-1 flex flex-col overflow-hidden">
              <ConversationList {...listProps} />
            </div>
          </>
        )}
        {mobileView === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ChatPanel
              conversation={selectedConversation}
              onUpdateConversation={handleUpdateConversation}
              onBack={() => setMobileView('list')}
              onShowInfo={() => setMobileView('info')}
              inboxLabels={inboxLabels}
              assignedLabelIds={selectedConversation ? conversationLabelsMap[selectedConversation.id] || [] : []}
              onLabelsChanged={handleLabelsChanged}
              agentNamesMap={agentNamesMap}
              onAgentAssigned={handleAgentAssigned}
            />
          </div>
        )}
        {mobileView === 'info' && selectedConversation && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ContactInfoPanel
              conversation={selectedConversation}
              onUpdateConversation={handleUpdateConversation}
              onBack={() => setMobileView('chat')}
              inboxLabels={inboxLabels}
              assignedLabelIds={conversationLabelsMap[selectedConversation.id] || []}
              onLabelsChanged={handleLabelsChanged}
              agentNamesMap={agentNamesMap}
            />
          </div>
        )}
        {selectedInboxId && (
          <ManageLabelsDialog
            open={manageLabelsOpen}
            onOpenChange={setManageLabelsOpen}
            inboxId={selectedInboxId}
            labels={inboxLabels}
            onChanged={handleLabelsChanged}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {unifiedHeader}
      {selectedInboxId && (
        <ManageLabelsDialog
          open={manageLabelsOpen}
          onOpenChange={setManageLabelsOpen}
          inboxId={selectedInboxId}
          labels={inboxLabels}
          onChanged={handleLabelsChanged}
        />
      )}
      <div className="flex flex-1 overflow-hidden rounded-xl border border-border/50 bg-card/30">
        {showConversationList && (
          <div className="w-80 lg:w-96 border-r border-border/50 flex flex-col shrink-0 overflow-hidden">
            <ConversationList {...listProps} />
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ChatPanel
            conversation={selectedConversation}
            onUpdateConversation={handleUpdateConversation}
            onToggleInfo={() => setShowContactInfo(prev => !prev)}
            showingInfo={showContactInfo}
            onToggleList={() => setShowConversationList(prev => !prev)}
            showingList={showConversationList}
            inboxLabels={inboxLabels}
            assignedLabelIds={selectedConversation ? conversationLabelsMap[selectedConversation.id] || [] : []}
            onLabelsChanged={handleLabelsChanged}
            agentNamesMap={agentNamesMap}
            onAgentAssigned={handleAgentAssigned}
          />
        </div>

        {selectedConversation && showContactInfo && (
          <div className="w-64 lg:w-72 border-l border-border/50 flex flex-col shrink-0 overflow-hidden">
            <ContactInfoPanel
              conversation={selectedConversation}
              onUpdateConversation={handleUpdateConversation}
              inboxLabels={inboxLabels}
              assignedLabelIds={conversationLabelsMap[selectedConversation.id] || []}
              onLabelsChanged={handleLabelsChanged}
              agentNamesMap={agentNamesMap}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default HelpDesk;

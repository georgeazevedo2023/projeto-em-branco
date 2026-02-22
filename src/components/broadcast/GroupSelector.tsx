import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Users, CheckSquare, Square, MessageSquare } from 'lucide-react';
import type { Instance } from './InstanceSelector';

export interface Participant {
  jid: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  name?: string;        // PushName do WhatsApp
  phoneNumber?: string; // Número real (quando disponível)
}

export interface Group {
  id: string;
  name: string;
  size: number;
  participants: Participant[];
  pictureUrl?: string;
}

interface GroupSelectorProps {
  instance: Instance;
  selectedGroups: Group[];
  onSelectionChange: (groups: Group[]) => void;
}

const GroupSelector = ({ instance, selectedGroups, onSelectionChange }: GroupSelectorProps) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (instance) {
      fetchGroups();
    }
  }, [instance.id]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        toast.error('Sessão expirada');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.data.session.access_token}`,
          },
          body: JSON.stringify({
            action: 'groups',
            token: instance.token,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao buscar grupos');
      }

      const data = await response.json();
      
      // Normalizar resposta
      let rawGroups: any[];
      if (Array.isArray(data)) {
        rawGroups = data;
      } else if (data?.groups && Array.isArray(data.groups)) {
        rawGroups = data.groups;
      } else if (data?.data && Array.isArray(data.data)) {
        rawGroups = data.data;
      } else {
        rawGroups = [];
      }

      const formattedGroups: Group[] = rawGroups.map((g: any) => {
        const rawParticipants = g.Participants || g.participants || [];
        return {
          id: g.JID || g.jid || g.id,
          name: g.Name || g.name || g.Subject || g.Topic || g.subject || 'Grupo sem nome',
          size: rawParticipants.length || g.ParticipantCount || 0,
          pictureUrl: g.profilePicUrl || g.pictureUrl || g.PictureUrl,
          participants: rawParticipants.map((p: any) => {
            // PhoneNumber é o número real, JID pode ser LID interno do WhatsApp
            let phoneNumber = p.PhoneNumber || p.phoneNumber || '';
            const jid = p.JID || p.jid || p.id || '';
            const pushName = p.PushName || p.pushName || p.DisplayName || p.Name || p.name || '';
            
            // Fallback: se PhoneNumber estiver vazio ou mascarado (com ·),
            // verificar se PushName contém dígitos que parecem um número de telefone
            if ((!phoneNumber || phoneNumber.includes('·')) && pushName) {
              const digitsFromName = pushName.replace(/\D/g, '');
              if (digitsFromName.length >= 10) {
                phoneNumber = digitsFromName;
              }
            }
            
            // Se phoneNumber está mascarado (contém ·), ignorar
            if (phoneNumber && phoneNumber.includes('·')) {
              phoneNumber = '';
            }
            
            return {
              // Prioriza PhoneNumber como identificador principal (quando disponível)
              jid: phoneNumber || jid,
              phoneNumber: phoneNumber || undefined,
              isAdmin: p.IsAdmin || p.isAdmin || false,
              isSuperAdmin: p.IsSuperAdmin || p.isSuperAdmin || false,
              name: pushName || undefined,
              // Guarda o JID original para casos onde só temos LID
              originalJid: jid,
            };
          }),
        };
      });

      setGroups(formattedGroups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast.error('Erro ao carregar grupos');
    } finally {
      setLoading(false);
    }
  };

  const filteredGroups = useMemo(() => 
    groups.filter((group) =>
      group.name.toLowerCase().includes(searchTerm.toLowerCase())
    ), 
    [groups, searchTerm]
  );

  const isSelected = useCallback((groupId: string) => 
    selectedGroups.some(g => g.id === groupId),
    [selectedGroups]
  );

  const toggleGroup = useCallback((group: Group) => {
    if (selectedGroups.some(g => g.id === group.id)) {
      onSelectionChange(selectedGroups.filter(g => g.id !== group.id));
    } else {
      onSelectionChange([...selectedGroups, group]);
    }
  }, [selectedGroups, onSelectionChange]);

  const selectAll = useCallback(() => {
    onSelectionChange(filteredGroups);
  }, [filteredGroups, onSelectionChange]);

  const clearSelection = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  const { totalMembers, totalRegularMembers } = useMemo(() => {
    const totalMembers = selectedGroups.reduce((acc, g) => acc + g.size, 0);
    const totalRegularMembers = selectedGroups.reduce((acc, g) => {
      const regular = g.participants.filter(p => !p.isAdmin && !p.isSuperAdmin);
      return acc + regular.length;
    }, 0);
    return { totalMembers, totalRegularMembers };
  }, [selectedGroups]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar grupos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            <CheckSquare className="w-4 h-4 mr-2" />
            Todos
          </Button>
          <Button variant="outline" size="sm" onClick={clearSelection}>
            <Square className="w-4 h-4 mr-2" />
            Limpar
          </Button>
        </div>
      </div>

      {/* Selection Counter */}
      {selectedGroups.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
          <Badge variant="secondary" className="gap-1">
            <MessageSquare className="w-3 h-3" />
            {selectedGroups.length} grupo{selectedGroups.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Users className="w-3 h-3" />
            {totalMembers} membro{totalMembers !== 1 ? 's' : ''} total
          </Badge>
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            {totalRegularMembers} não-admin{totalRegularMembers !== 1 ? 's' : ''}
          </Badge>
        </div>
      )}

      {/* Groups List */}
      {filteredGroups.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{searchTerm ? 'Nenhum grupo encontrado' : 'Nenhum grupo disponível'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredGroups.map((group) => {
            const selected = selectedGroups.some(g => g.id === group.id);
            const regularCount = group.participants.filter(p => !p.isAdmin && !p.isSuperAdmin).length;

            return (
              <Card
                key={group.id}
                className={`cursor-pointer transition-all duration-200 hover:shadow-md border-border/40 ${
                  selected ? 'ring-2 ring-primary bg-primary/5 border-primary/30' : 'hover:border-border/60'
                }`}
                onClick={() => toggleGroup(group)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleGroup(group)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    {group.pictureUrl ? (
                      <img
                        src={group.pictureUrl}
                        alt={group.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <Users className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{group.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {group.size} membro{group.size !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {regularCount} não-admin{regularCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default memo(GroupSelector);

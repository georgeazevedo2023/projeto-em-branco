import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, Search, RefreshCw, MessageSquare, WifiOff, ChevronRight } from 'lucide-react';

interface Instance {
  id: string;
  name: string;
  status: string;
  token: string;
  owner_jid: string | null;
  profile_pic_url: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface Group {
  id: string;
  name: string;
  subject: string;
  pictureUrl?: string;
  participants: Participant[];
  size: number;
}

interface Participant {
  id: string;
  name?: string;
  admin?: 'admin' | 'superadmin';
}

interface InstanceGroupsProps {
  instance: Instance;
}

const InstanceGroups = ({ instance }: InstanceGroupsProps) => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const isConnected = instance.status === 'connected' || instance.status === 'online';

  useEffect(() => {
    if (isConnected) {
      fetchGroups().then(() => setLastUpdate(new Date()));
    } else {
      setLoading(false);
    }
  }, [instance.id, isConnected]);

  const fetchGroups = async (): Promise<number> => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        toast.error('Sessão expirada');
        return 0;
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
      console.log('Groups API response:', data);
      console.log('Response type:', typeof data, 'Is array:', Array.isArray(data));
      
      // Normalizar resposta - backend já deve enviar array, mas ser tolerante
      let rawGroups: any[];
      if (Array.isArray(data)) {
        rawGroups = data;
      } else if (data?.groups && Array.isArray(data.groups)) {
        rawGroups = data.groups;
        console.log('Fallback: extracted from groups property');
      } else if (data?.data && Array.isArray(data.data)) {
        rawGroups = data.data;
        console.log('Fallback: extracted from data property');
      } else {
        console.log('Unexpected response format:', data);
        rawGroups = [];
      }
      
      console.log('Raw groups count:', rawGroups.length);
      
      if (rawGroups.length > 0) {
        const formattedGroups: Group[] = rawGroups.map((group: any) => {
          // UAZAPI retorna campos em PascalCase (JID, Name, Participants)
          const rawParticipants = group.Participants || group.participants || [];
          
          const participants = rawParticipants.map((p: any) => {
            // PhoneNumber contém o número real (ex: 558199669495@s.whatsapp.net)
            // JID/LID são IDs internos do WhatsApp (ex: 135300193980622@lid)
            const phoneNumber = p.PhoneNumber || p.phoneNumber || '';
            const jid = p.JID || p.jid || p.id || '';
            
            // Priorizar PhoneNumber (número real), usar JID como fallback
            const phoneId = phoneNumber || jid;
            
            // PushName é o nome que o usuário configurou no WhatsApp
            const name = p.PushName || p.pushName || p.DisplayName || p.Name || p.name || undefined;
            
            return {
              id: phoneId,
              name: name,
              admin: p.IsAdmin 
                ? (p.IsSuperAdmin ? 'superadmin' : 'admin') 
                : (p.isSuperAdmin ? 'superadmin' : (p.isAdmin ? 'admin' : undefined)),
            };
          });
          
          return {
            id: group.JID || group.jid || group.id,
            name: group.Name || group.name || group.Subject || group.Topic || group.subject || 'Grupo sem nome',
            subject: group.Subject || group.Topic || group.subject || '',
            pictureUrl: group.profilePicUrl || group.pictureUrl || group.PictureUrl,
            participants,
            size: participants.length || group.ParticipantCount || 0,
          };
        });
        console.log('Formatted groups:', formattedGroups.length, 'first:', formattedGroups[0]);
        setGroups(formattedGroups);
        return formattedGroups.length;
      } else {
        console.log('No groups found in response');
        setGroups([]);
        return 0;
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast.error('Erro ao carregar grupos');
      return 0;
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const previousCount = groups.length;
    let attempts = 0;
    const maxAttempts = 3;
    let currentCount = previousCount;
    
    while (attempts < maxAttempts) {
      attempts++;
      setSyncAttempt(attempts);
      
      currentCount = await fetchGroups();
      
      // Se encontrou mais grupos, para
      if (currentCount > previousCount) {
        break;
      }
      
      // Aguardar antes da próxima tentativa
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    setSyncAttempt(0);
    setRefreshing(false);
    setLastUpdate(new Date());
    
    if (currentCount > previousCount) {
      const newGroups = currentCount - previousCount;
      toast.success(`${newGroups} novo(s) grupo(s) encontrado(s)!`);
    } else {
      toast.info('Lista atualizada. Novos grupos podem levar alguns segundos para sincronizar com a API do WhatsApp.');
    }
  };

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatPhone = (jid: string) => {
    if (!jid) return 'Desconhecido';
    // Remove @s.whatsapp.net, @lid ou qualquer sufixo @...
    const phone = jid.split('@')[0];
    if (!phone) return 'Desconhecido';
    // Retornar apenas os dígitos, sem o sinal de +
    return phone;
  };

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
          <WifiOff className="w-16 h-16 text-muted-foreground" />
          <h3 className="text-lg font-medium">Instância Desconectada</h3>
          <p className="text-muted-foreground text-center">
            Conecte a instância para visualizar os grupos do WhatsApp
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com busca */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar grupos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing && syncAttempt > 0 
            ? `Sincronizando... (${syncAttempt}/3)` 
            : 'Atualizar'}
        </Button>
      </div>

      {/* Contador de grupos e última atualização */}
      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="gap-1">
          <MessageSquare className="w-3 h-3" />
          {filteredGroups.length} grupo{filteredGroups.length !== 1 ? 's' : ''}
        </Badge>
        {lastUpdate && (
          <span className="text-xs text-muted-foreground">
            Última atualização: {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Lista de grupos */}
      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <Users className="w-16 h-16 text-muted-foreground" />
            <h3 className="text-lg font-medium">Nenhum grupo encontrado</h3>
            <p className="text-muted-foreground text-center">
              {searchTerm
                ? 'Tente ajustar sua busca'
                : 'Esta instância não participa de nenhum grupo'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map((group) => (
            <Card
              key={group.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/dashboard/instances/${instance.id}/groups/${encodeURIComponent(group.id)}`)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Avatar className="w-12 h-12 border">
                  <AvatarImage src={group.pictureUrl} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Users className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h4 className="font-medium">{group.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {group.size} participante{group.size !== 1 ? 's' : ''}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default InstanceGroups;

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Users, Search, MessageSquare } from 'lucide-react';

interface Participant {
  id: string;
  name?: string;
  admin?: 'admin' | 'superadmin';
}

interface Group {
  id: string;
  name: string;
  subject: string;
  pictureUrl?: string;
  participants: Participant[];
  size: number;
}

interface Instance {
  id: string;
  name: string;
  token: string;
  status: string;
}

const GroupDetails = () => {
  const { instanceId, groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [instance, setInstance] = useState<Instance | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchInstanceAndGroup();
  }, [instanceId, groupId]);

  const fetchInstanceAndGroup = async () => {
    try {
      setLoading(true);
      
      // Buscar instância
      const { data: instanceData, error: instanceError } = await supabase
        .from('instances')
        .select('*')
        .eq('id', instanceId)
        .single();

      if (instanceError || !instanceData) {
        toast.error('Instância não encontrada');
        navigate('/dashboard/instances');
        return;
      }

      setInstance(instanceData);

      // Buscar grupos da instância
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
            token: instanceData.token,
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

      // Encontrar o grupo específico
      const decodedGroupId = decodeURIComponent(groupId || '');
      const targetGroup = rawGroups.find((g: any) => {
        const gId = g.JID || g.jid || g.id;
        return gId === decodedGroupId;
      });

      if (!targetGroup) {
        toast.error('Grupo não encontrado');
        navigate(`/dashboard/instances/${instanceId}?tab=groups`);
        return;
      }

      // Formatar grupo
      const rawParticipants = targetGroup.Participants || targetGroup.participants || [];
      const participants = rawParticipants.map((p: any) => {
        const phoneNumber = p.PhoneNumber || p.phoneNumber || '';
        const jid = p.JID || p.jid || p.id || '';
        const phoneId = phoneNumber || jid;
        const name = p.PushName || p.pushName || p.DisplayName || p.Name || p.name || undefined;
        
        return {
          id: phoneId,
          name: name,
          admin: p.IsAdmin 
            ? (p.IsSuperAdmin ? 'superadmin' : 'admin') 
            : (p.isSuperAdmin ? 'superadmin' : (p.isAdmin ? 'admin' : undefined)),
        };
      });

      setGroup({
        id: targetGroup.JID || targetGroup.jid || targetGroup.id,
        name: targetGroup.Name || targetGroup.name || targetGroup.Subject || targetGroup.Topic || targetGroup.subject || 'Grupo sem nome',
        subject: targetGroup.Subject || targetGroup.Topic || targetGroup.subject || '',
        pictureUrl: targetGroup.profilePicUrl || targetGroup.pictureUrl || targetGroup.PictureUrl,
        participants,
        size: participants.length || targetGroup.ParticipantCount || 0,
      });
    } catch (error) {
      console.error('Error fetching group:', error);
      toast.error('Erro ao carregar grupo');
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (jid: string) => {
    if (!jid) return 'Desconhecido';
    const phone = jid.split('@')[0];
    if (!phone) return 'Desconhecido';
    return phone;
  };

  const handleBack = () => {
    navigate(`/dashboard/instances/${instanceId}?tab=groups`);
  };

  // Ordenar participantes: superadmin > admin > membros
  const sortedParticipants = group?.participants
    ? [...group.participants].sort((a, b) => {
        const roleOrder: Record<string, number> = { 'superadmin': 0, 'admin': 1 };
        return (roleOrder[a.admin || ''] ?? 2) - (roleOrder[b.admin || ''] ?? 2);
      })
    : [];

  // Filtrar por busca
  const filteredParticipants = sortedParticipants.filter((p) => {
    const phone = formatPhone(p.id).toLowerCase();
    const name = (p.name || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return phone.includes(search) || name.includes(search);
  });

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
          <Users className="w-16 h-16 text-muted-foreground" />
          <h3 className="text-lg font-medium">Grupo não encontrado</h3>
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>

      {/* Informações do grupo */}
      <div className="flex items-center gap-4">
        <Avatar className="w-16 h-16 border">
          <AvatarImage src={group.pictureUrl} />
          <AvatarFallback className="bg-primary/10 text-primary">
            <Users className="w-8 h-8" />
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          <p className="text-muted-foreground">
            {group.size} participante{group.size !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Botão para enviar mensagem */}
      <Button 
        onClick={() => navigate(`/dashboard/instances/${instanceId}/groups/${groupId}/send`)}
        className="w-full sm:w-auto"
      >
        <MessageSquare className="w-4 h-4 mr-2" />
        Enviar Mensagem para o Grupo
      </Button>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar participante..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Badge com total filtrado */}
      {searchTerm && (
        <Badge variant="secondary">
          {filteredParticipants.length} de {sortedParticipants.length} participantes
        </Badge>
      )}

      {/* Grid de participantes - 3 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredParticipants.map((participant, idx) => (
          <div
            key={participant.id || idx}
            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
          >
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-secondary text-sm font-medium">
                {idx + 1}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {participant.name || formatPhone(participant.id)}
              </p>
              {participant.name && (
                <p className="text-sm text-muted-foreground truncate">
                  {formatPhone(participant.id)}
                </p>
              )}
            </div>
            {participant.admin && (
              <Badge variant="outline" className="text-xs shrink-0">
                {participant.admin === 'superadmin' ? 'Dono' : 'Admin'}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {/* Mensagem se não encontrar resultados */}
      {filteredParticipants.length === 0 && searchTerm && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 space-y-2">
            <Search className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum participante encontrado</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GroupDetails;

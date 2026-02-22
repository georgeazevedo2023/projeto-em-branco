import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Users, MessageSquare, Image } from 'lucide-react';
import SendMessageForm from '@/components/group/SendMessageForm';
import SendMediaForm from '@/components/group/SendMediaForm';

export interface Participant {
  jid: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

interface Group {
  id: string;
  name: string;
  pictureUrl?: string;
  size: number;
  participants: Participant[];
}

interface Instance {
  id: string;
  name: string;
  token: string;
  status: string;
}

const SendToGroup = () => {
  const { instanceId, groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [instance, setInstance] = useState<Instance | null>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);

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

      // Formatar grupo e participantes
      const rawParticipants = targetGroup.Participants || targetGroup.participants || [];
      
      const formattedParticipants: Participant[] = rawParticipants.map((p: any) => ({
        jid: p.JID || p.jid || p.id || '',
        isAdmin: p.IsAdmin || p.isAdmin || false,
        isSuperAdmin: p.IsSuperAdmin || p.isSuperAdmin || false,
      }));

      setParticipants(formattedParticipants);

      setGroup({
        id: targetGroup.JID || targetGroup.jid || targetGroup.id,
        name: targetGroup.Name || targetGroup.name || targetGroup.Subject || targetGroup.Topic || targetGroup.subject || 'Grupo sem nome',
        pictureUrl: targetGroup.profilePicUrl || targetGroup.pictureUrl || targetGroup.PictureUrl,
        size: rawParticipants.length || targetGroup.ParticipantCount || 0,
        participants: formattedParticipants,
      });
    } catch (error) {
      console.error('Error fetching group:', error);
      toast.error('Erro ao carregar grupo');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/dashboard/instances/${instanceId}/groups/${groupId}`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!group || !instance) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
          <Users className="w-16 h-16 text-muted-foreground" />
          <h3 className="text-lg font-medium">Grupo não encontrado</h3>
          <Button variant="outline" onClick={() => navigate(`/dashboard/instances/${instanceId}?tab=groups`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
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

      {/* Card de envio */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Enviar para o Grupo</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="text">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="text" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Texto
              </TabsTrigger>
              <TabsTrigger value="media" className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                Mídia
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="text">
              <SendMessageForm
                instanceToken={instance.token}
                groupJid={group.id}
                groupName={group.name}
                participants={participants}
              />
            </TabsContent>
            
            <TabsContent value="media">
              <SendMediaForm
                instanceToken={instance.token}
                groupJid={group.id}
                groupName={group.name}
                participants={participants}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default SendToGroup;

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, Headphones, Send, Users, Clock, BarChart, ShieldCheck, Columns3 } from 'lucide-react';
import DocumentViewer from './DocumentViewer';
import { instancesPrdContent } from '@/data/docs/instances-prd';
import { adminPrdContent } from '@/data/docs/admin-prd';
import { helpdeskPrdContent } from '@/data/docs/helpdesk-prd';
import { kanbanPrdContent } from '@/data/docs/kanban-prd';
import { broadcastLeadsPrdContent } from '@/data/docs/broadcast-leads-prd';
import { broadcastGroupsPrdContent } from '@/data/docs/broadcast-groups-prd';
import { helpdeskMediaPrdContent } from '@/data/docs/helpdesk-media-prd';
import { helpdeskChatFeaturesPrdContent } from '@/data/docs/helpdesk-chat-features-prd';
import { helpdeskFiltersContactPrdContent } from '@/data/docs/helpdesk-filters-contact-prd';

interface DocModule {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: 'complete' | 'coming_soon';
  version: string;
  date: string;
  content?: string;
}

const modules: DocModule[] = [
  {
    id: 'instances',
    name: 'Instâncias WhatsApp',
    description: 'Conexão, QR Code, sincronização UAZAPI, gerenciamento de acesso multi-tenant',
    icon: Server,
    status: 'complete',
    version: 'v1.1',
    date: '2026-03-02',
    content: instancesPrdContent,
  },
  {
    id: 'helpdesk',
    name: 'Helpdesk / Atendimento',
    description: 'Chat em tempo real, conversas, labels, departamentos, IA, webhooks',
    icon: Headphones,
    status: 'complete',
    version: 'v1.0',
    date: '2026-03-03',
    content: helpdeskPrdContent,
  },
  {
    id: 'helpdesk-media',
    name: 'Helpdesk: Mídia e Payloads',
    description: 'Recebimento, processamento e renderização de texto, imagem, áudio, vídeo, documento, sticker, contato e carrossel',
    icon: Headphones,
    status: 'complete',
    version: 'v1.0',
    date: '2026-03-06',
    content: helpdeskMediaPrdContent,
  },
  {
    id: 'helpdesk-chat-features',
    name: 'Helpdesk: Chat e Interações',
    description: 'Emojis, status, envio de imagem/documento, notas privadas, notificações, gravação de áudio, endpoints e payloads',
    icon: Headphones,
    status: 'complete',
    version: 'v1.0',
    date: '2026-03-06',
    content: helpdeskChatFeaturesPrdContent,
  },
  {
    id: 'helpdesk-filters-contact',
    name: 'Helpdesk: Filtros e Cartão de Contato',
    description: 'Filtros avançados, abas de status, cartão de contato, etiquetas, prioridade, agente, departamento, resumo IA e histórico',
    icon: Headphones,
    status: 'complete',
    version: 'v1.0',
    date: '2026-03-06',
    content: helpdeskFiltersContactPrdContent,
  },
  {
    id: 'broadcast-groups',
    name: 'Broadcast (Grupos)',
    description: 'Envio em massa para grupos, carrossel, templates, histórico',
    icon: Send,
    status: 'complete',
    version: 'v1.0',
    date: '2026-03-03',
    content: broadcastGroupsPrdContent,
  },
  {
    id: 'broadcast-leads',
    name: 'Broadcast (Leads)',
    description: 'Base de leads, verificação de números, envio individual em massa',
    icon: Users,
    status: 'complete',
    version: 'v1.0',
    date: '2026-03-03',
    content: broadcastLeadsPrdContent,
  },
  {
    id: 'scheduling',
    name: 'Agendamentos',
    description: 'Mensagens agendadas, recorrência, logs de execução',
    icon: Clock,
    status: 'coming_soon',
    version: '-',
    date: '-',
  },
  {
    id: 'kanban',
    name: 'CRM / Kanban',
    description: 'Boards, colunas, cards, campos dinâmicos, automações',
    icon: Columns3,
    status: 'complete',
    version: 'v1.0',
    date: '2026-03-03',
    content: kanbanPrdContent,
  },
  {
    id: 'dashboard',
    name: 'Dashboard / Analytics',
    description: 'Métricas, gráficos, filtros por instância/período',
    icon: BarChart,
    status: 'coming_soon',
    version: '-',
    date: '-',
  },
  {
    id: 'admin',
    name: 'Administração',
    description: 'Caixas de entrada, usuários, equipe, departamentos, permissões, herança de acesso',
    icon: ShieldCheck,
    status: 'complete',
    version: 'v1.0',
    date: '2026-03-03',
    content: adminPrdContent,
  },
];

const DocumentationTab: React.FC = () => {
  const [selectedModule, setSelectedModule] = useState<DocModule | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold tracking-tight">Documentação dos Módulos</h2>
        <p className="text-sm text-muted-foreground">
          PRDs completos com funcionalidades, endpoints, modelo de dados e permissões — prontos para replicação.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isAvailable = mod.status === 'complete';

          return (
            <Card
              key={mod.id}
              className={`group transition-all duration-200 ${
                isAvailable
                  ? 'cursor-pointer hover:border-primary/40 hover:shadow-md hover:shadow-primary/5'
                  : 'opacity-60 cursor-default'
              }`}
              onClick={() => isAvailable && setSelectedModule(mod)}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <Badge
                    variant={isAvailable ? 'default' : 'outline'}
                    className={`text-[10px] ${
                      isAvailable
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {isAvailable ? 'Completo' : 'Em breve'}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-foreground">{mod.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{mod.description}</p>
                </div>

                {isAvailable && (
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70 pt-1 border-t border-border/30">
                    <span>{mod.version}</span>
                    <span>•</span>
                    <span>{mod.date}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedModule && selectedModule.content && (
        <DocumentViewer
          open={!!selectedModule}
          onOpenChange={(open) => !open && setSelectedModule(null)}
          title={selectedModule.name}
          version={selectedModule.version}
          content={selectedModule.content}
        />
      )}
    </div>
  );
};

export default DocumentationTab;

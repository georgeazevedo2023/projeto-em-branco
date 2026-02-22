# PRD — WsmartQR
**Product Requirements Document**
**Versão:** 1.0
**Data:** Fevereiro 2026
**Status:** Em Desenvolvimento Ativo

---

## 1. Visão Geral do Produto

### 1.1 O que é o WsmartQR?
WsmartQR é uma **plataforma SaaS multi-tenant** para gerenciamento avançado de WhatsApp via API (UAZAPI). Ela permite que empresas gerenciem múltiplas instâncias de WhatsApp, disparos em massa, agendamento de mensagens, central de atendimento e base de leads — tudo em um único painel web.

### 1.2 Problema que Resolve
- Empresas que precisam operar múltiplas contas de WhatsApp sem acesso ao dispositivo físico
- Times de atendimento que precisam responder clientes via WhatsApp em equipe
- Marketing que precisa disparar mensagens em massa para grupos e leads
- Gestão que precisa de métricas e histórico de comunicação

### 1.3 Usuários-Alvo
| Perfil | Descrição |
|--------|-----------|
| **Super Admin** | Dono/gestor da plataforma. Gerencia instâncias, usuários e configurações globais |
| **Usuário Regular** | Operador de atendimento. Acessa apenas caixas de entrada atribuídas |

---

## 2. Arquitetura Técnica

### 2.1 Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Lovable Cloud (Supabase) — PostgreSQL, Auth, Storage, Edge Functions, Realtime
- **API WhatsApp:** UAZAPI (proxy via Edge Function)
- **Roteamento:** React Router v6 com lazy loading

### 2.2 Modelo de Dados Principal
```
instances ──── inboxes ──── conversations ──── conversation_messages
                  │               │
              inbox_users    contacts / labels
                  │
              user_instance_access

broadcast_logs
scheduled_messages / scheduled_message_logs
lead_databases / lead_database_entries
message_templates
user_profiles / user_roles
```

### 2.3 Papéis e Permissões
- `super_admin` — acesso total a todos os módulos
- `user` — acesso restrito ao módulo de Helpdesk (caixas atribuídas)
- Roles de caixa de entrada: `admin`, `gestor`, `agente`

---

## 3. Módulos do Sistema

### 3.1 🏠 Dashboard (Home)
**Acesso:** Super Admin apenas

**Funcionalidades:**
- Cards de estatísticas globais: total de instâncias, usuários, instâncias online/offline
- Lista de instâncias com status em tempo real (online/offline/desconectado)
- Estatísticas por instância: número de grupos e participantes (via API UAZAPI)
- Gráficos de leads do helpdesk: hoje vs ontem, e histórico diário (7 dias)
- Filtro por instância nos gráficos de helpdesk
- Botão "Sincronizar Instâncias" para atualizar dados da API
- Botão de criação de usuário rápido

**Métricas exibidas:**
- Total de instâncias / Online / Offline
- Total de usuários cadastrados
- Leads do helpdesk (novas conversas) hoje, ontem e total

---

### 3.2 📱 Instâncias
**Acesso:** Super Admin apenas

**Funcionalidades:**
- Listagem de todas as instâncias conectadas via UAZAPI
- Status em tempo real de cada instância (online/offline/qr/desconectado)
- Foto de perfil e número do dono da instância
- Sincronização de instâncias da API UAZAPI para o banco de dados local
- Visualização detalhada de cada instância:
  - Informações gerais (nome, status, token, JID do dono)
  - Lista de grupos vinculados
  - Histórico de conexões/desconexões
  - Estatísticas de uso

**Subpáginas de Instância:**
- **Grupos:** lista de grupos da instância com participantes e admins
- **Detalhes do Grupo:** envio de mensagens, agendamento, lista de participantes
- **Histórico:** log de eventos de conexão da instância

---

### 3.3 📢 Disparador de Grupos (Broadcaster)
**Acesso:** Super Admin apenas

**Fluxo em 3 passos:**
1. **Selecionar Instância** — escolhe qual WhatsApp vai disparar
2. **Selecionar Grupos** — filtra e seleciona grupos destino (com busca e seleção em massa)
3. **Compor Mensagem** — define conteúdo e configura o disparo

**Tipos de Mensagem Suportados:**
- Texto simples
- Imagem com legenda
- Vídeo com legenda
- Áudio (PTT)
- Documento/PDF
- Carousel interativo (botões + imagem por card)

**Configurações Avançadas de Disparo:**
- Delay aleatório entre mensagens (ex: 5–15 segundos)
- Opção de excluir admins dos grupos
- Seleção de participantes individuais dentro dos grupos
- Reenvio de broadcast anterior (via histórico)

**Templates de Mensagem:**
- Salvar mensagens como template para reutilização
- Categorização de templates
- Carregar template ao iniciar composição

**Histórico de Broadcasts:**
- Log completo de cada disparo
- Estatísticas: grupos atingidos, enviados com sucesso, falhas
- Duração do disparo
- Visualização do conteúdo enviado (incluindo carousel)
- Ação de reenviar broadcast

---

### 3.4 👥 Disparador de Leads (Leads Broadcaster)
**Acesso:** Super Admin apenas

**Conceito:** Disparo de mensagens para listas de contatos (leads) ao invés de grupos

**Funcionalidades:**
- Criação e gestão de Bases de Leads
- Importação de leads via arquivo Excel/CSV
- Verificação de número WhatsApp (via API)
- Exibição de status de verificação por lead
- Composição de mensagem com variáveis personalizadas (nome do lead)
- Disparo com delay configurável
- Histórico de disparos para leads

**Gestão de Bases:**
- Criar nova base de leads
- Editar nome/descrição de bases existentes
- Visualizar e filtrar leads por base
- Contagem de leads por base

---

### 3.5 🗓️ Mensagens Agendadas
**Acesso:** Super Admin apenas

**Funcionalidades:**
- Agendar mensagem para um grupo em data/hora específica
- Recorrência: diária, semanal, mensal (com dias específicos da semana)
- Tipos de mensagem: texto, imagem, vídeo, áudio, documento
- Delay aleatório configurável
- Opção de excluir admins
- Status de cada mensagem: pendente, enviada, falha, cancelada
- Log de execuções com estatísticas
- Cancelar/reagendar mensagens
- Edge Function `process-scheduled-messages` roda automaticamente

---

### 3.6 🎧 Central de Atendimento (HelpDesk)
**Acesso:** Todos os usuários (filtrado por caixas atribuídas)

**Modelo:** Estilo Chatwoot para gerenciamento de conversas WhatsApp em equipe

#### 3.6.1 Estrutura Multi-Inbox
- Cada caixa de entrada (inbox) é vinculada a uma instância WhatsApp
- Usuários têm papéis por caixa: admin, gestor, agente
- Conversas são isoladas por caixa
- Seletor de caixa no topo — trocar limpa a conversa ativa

#### 3.6.2 Lista de Conversas
- Exibe conversas ordenadas por última mensagem
- Filtros por status: abertas, pendentes, resolvidas
- Filtro por label/etiqueta
- Indicador visual de não lido (bolinha colorida)
- Foto de perfil do contato
- Prévia da última mensagem (com ícone para mídia)
- Indicador de prioridade (normal, alta, urgente)

#### 3.6.3 Chat Panel
- Histórico completo de mensagens da conversa
- Direção visual: mensagens recebidas (esquerda) / enviadas (direita)
- Suporte a tipos de mídia:
  - Texto
  - Imagem (com lightbox)
  - Vídeo (player nativo)
  - Áudio (player customizado com waveform)
  - Documento/PDF (download)
- Transcrição automática de áudio (via Edge Function `transcribe-audio`)
- Realtime: novas mensagens aparecem sem refresh
- Input de texto com suporte a emoji
- Envio de imagem, vídeo, áudio, documento (upload até 20MB)
- Botão de resposta inteligente (IA)

#### 3.6.4 Painel de Informações do Contato
- Nome, telefone, foto de perfil do contato
- Status da conversa (aberta/pendente/resolvida)
- Prioridade (normal/alta/urgente)
- Responsável (atribuição para agente)
- Etiquetas/labels (add/remove)
- Notas privadas (visíveis apenas internamente)
- Link para ativar/desativar IA da conversa

#### 3.6.5 Labels (Etiquetas)
- Criação de etiquetas por caixa de entrada
- Atribuição de cor personalizada
- Múltiplas etiquetas por conversa
- Filtro de conversas por etiqueta

#### 3.6.6 Webhooks
- Webhook de entrada: recebe eventos do UAZAPI
- Webhook de saída: dispara eventos para sistema externo (ex: n8n)
- Suporte a sincronização de conversas via Edge Function `sync-conversations`

#### 3.6.7 IA na Conversa
- Toggle para ativar/desativar IA por conversa
- Edge Function `activate-ia` para controle do status
- Status visível no painel da conversa

#### 3.6.8 Mobile
- Layout responsivo completo
- Navegação por vistas: lista → chat → info
- Header móvel com navegação contextual

---

### 3.7 👤 Gestão de Usuários
**Acesso:** Super Admin apenas

**Funcionalidades:**
- Listagem de todos os usuários cadastrados
- Criação de novo usuário (email + senha)
- Exclusão de usuário
- Atribuição de papel (super_admin / user)
- Gerenciamento de acesso às instâncias por usuário

---

### 3.8 📬 Gestão de Caixas de Entrada
**Acesso:** Super Admin apenas

**Funcionalidades:**
- Criar nova caixa de entrada vinculada a uma instância
- Configurar URL de webhook de entrada e saída
- Gerenciar usuários da caixa (adicionar/remover)
- Definir papel de cada usuário na caixa (admin/gestor/agente)
- Disponibilidade do agente (toggle is_available)

---

### 3.9 ⚙️ Configurações
**Acesso:** Super Admin apenas

**Funcionalidades:**
- Configurações globais da plataforma
- Perfil do usuário
- (Extensível para configurações de integração)

---

### 3.10 🔐 Autenticação
- Login com email/senha
- Sessão persistente
- Redirecionamento baseado em papel:
  - Super Admin → `/dashboard`
  - Usuário regular → `/dashboard/helpdesk`
- Proteção de rotas (ProtectedRoute / AdminRoute)

---

## 4. Edge Functions (Backend Serverless)

| Função | Descrição |
|--------|-----------|
| `uazapi-proxy` | Proxy para API UAZAPI (sem verificação JWT) |
| `whatsapp-webhook` | Recebe eventos do WhatsApp e salva no banco |
| `sync-conversations` | Sincroniza conversas de uma instância |
| `process-scheduled-messages` | Processa e dispara mensagens agendadas |
| `transcribe-audio` | Transcreve áudios recebidos via IA |
| `activate-ia` | Ativa/desativa IA em uma conversa |
| `fire-outgoing-webhook` | Dispara webhook de saída para sistemas externos |
| `admin-create-user` | Cria usuário no sistema (sem JWT) |
| `admin-delete-user` | Remove usuário do sistema (sem JWT) |
| `cleanup-old-media` | Remove mídia antiga do Storage (>30 dias) |

---

## 5. Integrações Externas

| Integração | Uso |
|------------|-----|
| **UAZAPI** | API WhatsApp — envio/recebimento de mensagens, grupos, participantes |
| **Lovable AI Gateway** | Transcrição de áudio, respostas inteligentes |
| **Supabase Storage** | Armazenamento de mídias do helpdesk (`helpdesk-media`) e carrosséis |
| **Supabase Realtime** | Atualizações ao vivo de mensagens e conversas |

---

## 6. Fluxos de Usuário

### 6.1 Fluxo de Atendimento (Agente)
```
Login → Selecionar Caixa de Entrada → Ver lista de conversas
→ Clicar em conversa → Ler histórico → Responder
→ Adicionar etiqueta / Mudar status / Atribuir responsável
→ Fechar conversa como "resolvida"
```

### 6.2 Fluxo de Disparo em Massa (Admin)
```
Dashboard → Broadcaster → Selecionar Instância
→ Selecionar Grupos (buscar/filtrar)
→ Compor Mensagem (tipo + conteúdo + configurações)
→ Confirmar Disparo → Monitorar no Histórico
```

### 6.3 Fluxo de Agendamento (Admin)
```
Dashboard → Mensagens Agendadas → Novo Agendamento
→ Selecionar Instância + Grupo → Definir data/hora
→ Configurar recorrência (opcional) → Salvar
```

---

## 7. Regras de Negócio

1. **Isolamento por caixa:** Conversas são visíveis apenas para usuários que pertencem à caixa de entrada correspondente
2. **Papéis hierárquicos:** `admin > gestor > agente` dentro de cada caixa
3. **Multi-instância:** Super Admin pode gerenciar N instâncias; cada usuário vê apenas as instâncias a que tem acesso
4. **Realtime obrigatório:** Novas mensagens devem aparecer sem refresh de página
5. **Limite de upload:** 20MB por arquivo de mídia
6. **Retenção de mídia:** Arquivos do helpdesk são removidos automaticamente após 30 dias
7. **Delay de disparo:** Obrigatório para evitar banimento do WhatsApp em disparos em massa
8. **Troca de caixa:** Ao trocar de caixa, a conversa ativa deve ser limpa imediatamente

---

## 8. Requisitos Não-Funcionais

| Requisito | Especificação |
|-----------|---------------|
| **Responsividade** | Layout funcional em mobile (≥360px) e desktop |
| **Performance** | Lazy loading de módulos; carregamento inicial < 3s |
| **Segurança** | RLS (Row Level Security) em todas as tabelas sensíveis |
| **Disponibilidade** | Dependente da infraestrutura Lovable Cloud |
| **Escalabilidade** | Multi-tenant por design; sem limite fixo de instâncias |

---

## 9. Status de Implementação

| Módulo | Status |
|--------|--------|
| Autenticação | ✅ Completo |
| Dashboard Home | ✅ Completo |
| Gestão de Instâncias | ✅ Completo |
| Broadcaster de Grupos | ✅ Completo |
| Broadcaster de Leads | ✅ Completo |
| Mensagens Agendadas | ✅ Completo |
| Central de Atendimento | ✅ Completo |
| Labels/Etiquetas | ✅ Completo |
| Notas Privadas | ✅ Completo |
| Envio de Documentos | ✅ Completo |
| Transcrição de Áudio | ✅ Completo |
| IA na Conversa | ✅ Completo |
| Gestão de Usuários | ✅ Completo |
| Gestão de Caixas | ✅ Completo |
| Webhook de Saída | ✅ Completo |
| Limpeza automática de mídia | ✅ Completo |
| Landing Page | ✅ Completo |

---

## 10. Histórico de Versões

| Data | Versão | Alteração |
|------|--------|-----------|
| Fev 2026 | 1.0 | Documento inicial — consolidação de todos os módulos desenvolvidos |

---

*Documento gerado automaticamente com base no código-fonte do WsmartQR em fevereiro de 2026.*

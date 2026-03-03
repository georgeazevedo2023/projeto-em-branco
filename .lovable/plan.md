

## PRD do Modulo Helpdesk / Atendimento

### Objetivo
Criar um PRD completo e detalhado do modulo de Helpdesk do WsmartQR, cobrindo todo o fluxo de atendimento: conversas, mensagens (texto, audio, imagem, documento, video, sticker, vCard, carrossel), labels, departamentos, IA, webhooks de entrada/saida, sincronizacao, transcricao de audio, resumos por IA, e notas privadas.

### Arquivos a Modificar

1. **Criar** `src/data/docs/helpdesk-prd.ts` -- PRD completo (~500 linhas) com todas as secoes abaixo
2. **Editar** `src/components/admin/DocumentationTab.tsx` -- Atualizar o modulo "Helpdesk / Atendimento" de `coming_soon` para `complete`, importar e vincular o conteudo

### Estrutura do PRD

1. **Visao Geral** -- Objetivo do modulo, multi-inbox, multi-departamento, atendimento em tempo real via WhatsApp

2. **Modelo de Dados** -- 7 tabelas documentadas com colunas, tipos e defaults:
   - `conversations` (inbox_id, contact_id, status, priority, assigned_to, department_id, is_read, last_message, ai_summary, status_ia)
   - `conversation_messages` (conversation_id, direction, content, media_type, media_url, sender_id, external_id, transcription)
   - `contacts` (jid, phone, name, profile_pic_url)
   - `labels` (name, color, inbox_id)
   - `conversation_labels` (conversation_id, label_id)
   - `departments` (name, inbox_id, is_default, description)
   - `department_members` (department_id, user_id)

3. **Politicas RLS** -- Documentar as politicas de cada tabela:
   - Conversations: acesso por inbox + filtro por departamento (agentes so veem seus departamentos, admin/gestor veem tudo)
   - Messages: acesso via conversa -> inbox
   - Labels/conversation_labels: acesso por inbox
   - Contacts: acesso via conversas que o usuario pode ver
   - Departments/department_members: SELECT por inbox, CRUD por super_admin

4. **Funcoes de Seguranca** -- Documentar funcoes usadas:
   - `has_inbox_access`, `get_inbox_role`, `is_inbox_member`, `is_super_admin`

5. **Status e Fluxo de Conversas**:
   - Status: aberta, pendente, resolvida
   - Prioridade: alta, media, baixa
   - Fluxo: webhook cria conversa -> agente atende -> muda status -> trigger auto-summarize ao resolver

6. **Edge Functions** -- 6 funcoes documentadas com endpoints, payloads e logica:
   - `whatsapp-webhook`: Recebe mensagens UAZAPI, normaliza payload, resolve instancia/inbox/contato, cria/atualiza conversa, salva mensagem, faz upload de midia para Storage, broadcast realtime, dispara transcricao de audio
   - `sync-conversations`: Sincroniza conversas existentes do UAZAPI para o banco, busca chats + mensagens em batch
   - `fire-outgoing-webhook`: Proxy seguro para enviar webhooks de saida (validacao SSRF), usado para notificar n8n/IA externa
   - `transcribe-audio`: Baixa audio, envia para Groq Whisper API, salva transcricao no banco, broadcast realtime
   - `summarize-conversation`: Gera resumo por IA (Groq LLaMA 3.3 70B), retorna JSON estruturado (reason, summary, resolution), persiste com expiracao de 60 dias
   - `auto-summarize`: Trigger automatico ao resolver conversa, backfill e processamento de conversas inativas

7. **Tipos de Midia Suportados**:
   - text, image, video, audio, document, sticker, contact (vCard), carousel
   - Upload para Storage: `helpdesk-media` (imagem, video, documento), `audio-messages` (audio)
   - Resolucao de URL: signed URLs para buckets privados, download persistente via UAZAPI

8. **Canais Realtime (Supabase Broadcast)**:
   - `helpdesk-realtime`: eventos `new-message`, `transcription-updated` (usado pelo ChatPanel)
   - `helpdesk-conversations`: eventos `new-message`, `assigned-agent`, `conversation_updated` (usado pela lista de conversas)

9. **Interface do Usuario** -- Componentes documentados:
   - `HelpDesk.tsx`: Pagina principal com filtros (status, inbox, departamento, label, atribuicao, prioridade, busca)
   - `ConversationList.tsx`: Lista de conversas com badges de departamento, agente, notas
   - `ConversationItem.tsx`: Card individual com avatar, prioridade, labels, ultimo preview
   - `ChatPanel.tsx`: Painel de chat com header (status, IA, notas), lista de mensagens, input
   - `ChatInput.tsx`: Compositor com envio de texto, notas privadas, audio, imagem, documento, labels, status, emoji
   - `MessageBubble.tsx`: Renderizacao de mensagens (todas as midias, carrossel, vCard, transcricao)
   - `ContactInfoPanel.tsx`: Painel lateral com dados do contato, labels, status, prioridade, agente, departamento, resumo IA, historico
   - `NotesPanel.tsx`: Drawer lateral com notas privadas
   - `ManageLabelsDialog.tsx`: CRUD de labels por inbox
   - `LabelPicker.tsx`: Popover para atribuir labels a conversas
   - `AudioPlayer.tsx`: Player customizado para audio

10. **Integracao com IA**:
    - `status_ia`: Campo na conversa que controla estado da IA (ligada/desligada)
    - Ativacao via webhook: ChatPanel chama `fire-outgoing-webhook` com `pausar_agente: 'nao'`
    - Desativacao automatica ao enviar mensagem manual (define `status_ia: 'desligada'`)
    - Resumos automaticos: trigger `trigger_auto_summarize` ao marcar conversa como resolvida

11. **Fluxos Operacionais**:
    - Fluxo de mensagem de entrada: UAZAPI -> webhook -> resolve inbox -> upsert contato -> find/create conversa -> salva mensagem -> upload midia -> broadcast -> transcricao
    - Fluxo de mensagem de saida: ChatInput -> uazapi-proxy -> salva no banco -> broadcast -> fire-outgoing-webhook
    - Auto-assign: Primeiro agente a responder e automaticamente atribuido
    - Sincronizacao: Botao na UI -> sync-conversations -> importa chats/mensagens do UAZAPI

12. **Secrets e Variaveis Necessarias**:
    - `GROQ_API_KEY` (transcricao e resumos)
    - `UAZAPI_SERVER_URL` (servidor UAZAPI)
    - `SUPABASE_SERVICE_ROLE_KEY` (operacoes privilegiadas)
    - `SUPABASE_ANON_KEY` (broadcast realtime)

13. **Storage Buckets**:
    - `helpdesk-media` (privado): imagens, videos, documentos
    - `audio-messages` (privado): audios enviados pelos atendentes
    - `carousel-images` (publico): imagens de carrossel

### Detalhes Tecnicos da Implementacao

- O arquivo `helpdesk-prd.ts` exportara uma constante `helpdeskPrdContent` como template literal string em Markdown
- O `DocumentationTab.tsx` sera atualizado para importar `helpdeskPrdContent`, mudar status para `complete`, versao `v1.0`, data `2026-03-03`
- O conteudo seguira o mesmo padrao de formatacao dos PRDs existentes (instances-prd, admin-prd)


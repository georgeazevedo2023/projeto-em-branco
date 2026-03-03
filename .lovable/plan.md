
## PRD do Modulo Broadcast (Leads)

### Objetivo
Criar um PRD completo e detalhado do modulo Broadcast de Leads do WsmartQR, documentando todo o fluxo de envio em massa para contatos individuais: selecao de instancia, gestao de bases de leads, importacao (colar, CSV/Excel, grupos, manual), verificacao de numeros, composicao e envio de mensagens (texto, midia, carrossel), templates, reenvio, persistencia de logs e integracao com HelpDesk.

### Arquivos a Modificar

1. **Criar** `src/data/docs/broadcast-leads-prd.ts` -- PRD completo (~450 linhas) exportando `broadcastLeadsPrdContent`
2. **Editar** `src/components/admin/DocumentationTab.tsx` -- Atualizar modulo "Broadcast (Leads)" de `coming_soon` para `complete`, importar e vincular conteudo

### Estrutura do PRD

1. **Visao Geral**
   - Envio em massa para contatos individuais via WhatsApp (diferente do broadcast para grupos)
   - Wizard de 3 etapas: Instancia -> Contatos/Base -> Mensagem
   - Suporte a reenvio a partir do historico

2. **Modelo de Dados** -- 3 tabelas principais:
   - `lead_databases` (id, name, description, user_id, instance_id, leads_count, created_at, updated_at)
   - `lead_database_entries` (id, database_id, phone, name, jid, source, group_name, is_verified, verified_name, verification_status)
   - `broadcast_logs` (id, user_id, instance_id, instance_name, message_type, content, media_url, carousel_data, groups_targeted, recipients_targeted/success/failed, exclude_admins, random_delay, status, error_message, started_at, completed_at, duration_seconds)
   - Tabelas auxiliares: `message_templates` (templates reutilizaveis)

3. **Politicas RLS** -- por tabela:
   - `lead_databases`: owner (user_id) tem ALL; super_admin tem SELECT
   - `lead_database_entries`: acesso via ownership da lead_database pai; super_admin SELECT
   - `broadcast_logs`: owner INSERT/SELECT/DELETE; super_admin SELECT/DELETE
   - `message_templates`: owner CRUD completo

4. **Interface do Usuario -- Componentes**:
   - `LeadsBroadcaster.tsx`: Pagina principal com wizard de 3 etapas, gestao de estado, reenvio via sessionStorage
   - `InstanceSelector.tsx`: Selecao de instancia WhatsApp conectada
   - `LeadImporter.tsx`: Importacao via 4 abas (colar numeros, CSV/Excel com mapeamento de colunas, extrair de grupos, adicionar manual)
   - `LeadList.tsx`: Lista paginada com busca, filtro por status de verificacao, selecao individual/em massa
   - `LeadDatabaseSelector.tsx`: Lista de bases salvas com acoes (selecionar, editar, gerenciar, excluir)
   - `LeadMessageForm.tsx`: Compositor de mensagem com 3 abas (texto, midia, carrossel), templates, delay configuravel, progresso com pause/cancel
   - `EditDatabaseDialog.tsx`: Edicao de nome/descricao da base
   - `ManageLeadDatabaseDialog.tsx`: Gestao de entradas (adicionar, buscar, paginar, excluir contatos)
   - `CreateLeadDatabaseDialog.tsx`: Criar base a partir de grupos selecionados (extrai nao-admins)
   - `MessagePreview.tsx`: Preview da mensagem formatada
   - `CarouselEditor.tsx` / `CarouselPreview.tsx`: Edicao e preview de carrossel
   - `TemplateSelector.tsx`: Selecao e salvamento de templates

5. **Importacao de Leads (LeadImporter)**:
   - **Colar numeros**: Textarea com numeros separados por quebra de linha, normaliza para JID
   - **CSV/Excel**: Upload com deteccao de delimitador, mapeamento de colunas (telefone obrigatorio, nome opcional), preview tabular
   - **Extrair de grupos**: Busca grupos da instancia via uazapi-proxy, seleciona grupos, extrai participantes nao-admin com deduplicacao
   - **Manual**: Formulario com telefone + nome opcional
   - Normalizacao: `parsePhoneToJid(phone)` -> remove caracteres, aplica prefixo 55, gera JID `{digits}@s.whatsapp.net`
   - Deduplicacao por telefone ao importar

6. **Verificacao de Numeros**:
   - Chamada `supabase.functions.invoke('uazapi-proxy', { action: 'check-numbers', instance_id, phones })` em batches de 50
   - Atualiza status: `valid`, `invalid`, `error`
   - Acoes pos-verificacao: "Remover invalidos", "Selecionar apenas validos"
   - Progresso visual durante verificacao

7. **Gestao de Bases de Leads**:
   - Criar nova base: importar leads -> nomear -> salvar (insere lead_databases + lead_database_entries)
   - Selecionar base existente: carrega entries com deduplicacao por phone
   - Multi-selecao de bases: combina entries de varias bases
   - Atualizar base: substitui todas entries e atualiza leads_count
   - Editar metadados: nome e descricao via EditDatabaseDialog
   - Gerenciar entradas: ManageLeadDatabaseDialog com busca, paginacao (30/pagina), adicionar contato, excluir contato
   - Excluir base: confirmacao com AlertDialog, cascade para entries

8. **Composicao e Envio de Mensagens (LeadMessageForm)**:
   - **Texto**: Textarea com contador de caracteres (max 4096), emoji picker
   - **Midia**: Upload de arquivo ou URL, tipos suportados (image/jpeg/png/gif/webp, video/mp4, audio/mpeg/ogg/mp3/wav), max 10MB, caption opcional
   - **Carrossel**: Editor visual com cards (imagem + texto + botoes URL/REPLY/CALL), upload de imagem por card
   - **Templates**: Carregar template salvo (texto/midia/carrossel), salvar novo template com nome e categoria
   - **Delay configuravel**: Presets de delay entre envios para anti-bloqueio
   - **Envio**: Loop pelos leads selecionados, chamada uazapi-proxy por numero (send-message, send-media, send-carousel)
   - **Progresso**: Card modal com barra de progresso, nome do contato atual, tempo decorrido/restante, pause/resume/cancel
   - **Persistencia**: Salva broadcast_log apos conclusao; salva no HelpDesk (saveToHelpdesk) cada mensagem enviada

9. **Reenvio (ResendOptionsDialog + BroadcastHistoryPage)**:
   - Historico de envios: BroadcastHistory lista logs com filtros
   - Reenvio: clique "Reenviar" -> ResendOptionsDialog (escolher destino: grupos ou leads, excluir admins)
   - Dados salvos em sessionStorage -> LeadsBroadcaster restaura instanceId, messageType, content, mediaUrl, carouselData
   - Banner visual indica reenvio ativo

10. **Edge Functions Utilizadas**:
    - `uazapi-proxy` com actions: `check-numbers` (verificacao), `send-message` (texto), `send-media` (midia), `send-carousel` (carrossel), `groups` (listar grupos para importacao)
    - Autenticacao JWT + resolucao de token da instancia via `resolveInstanceToken`

11. **Fluxos Operacionais**:
    - Envio completo: Selecionar instancia -> Selecionar/criar base -> Importar leads -> Verificar numeros -> Compor mensagem -> Enviar -> Log salvo
    - Reenvio: Historico -> Reenviar -> Selecionar instancia/base -> Mensagem pre-preenchida -> Enviar
    - Criar base de grupos: Broadcaster de Grupos -> Step 2 -> "Criar Base" -> CreateLeadDatabaseDialog -> Extrai nao-admins -> Salva

12. **Regras de Negocio**:
    - Bases de leads sao por usuario (RLS por user_id)
    - Deduplicacao por telefone ao importar e ao combinar bases
    - Normalizacao de telefone: remove +, espacos, hifens; aplica prefixo 55 para numeros curtos
    - Verificacao em batches de 50 numeros por chamada
    - Delay entre envios configuravel para evitar bloqueio do WhatsApp
    - Carrossel: upload de imagens para bucket `carousel-images` (publico)
    - HelpDesk: cada mensagem enviada e persistida como mensagem de saida na conversa do contato

### Detalhes de Implementacao

- `broadcast-leads-prd.ts` exporta `broadcastLeadsPrdContent` como template literal Markdown
- `DocumentationTab.tsx`: importar `broadcastLeadsPrdContent`, mudar status do modulo "Broadcast (Leads)" para `complete`, versao `v1.0`, data `2026-03-03`
- Seguir mesmo padrao de formatacao dos PRDs existentes (admin-prd, helpdesk-prd, kanban-prd)

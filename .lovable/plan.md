

## PRD do Modulo CRM / Kanban

### Objetivo
Criar um PRD completo e detalhado do modulo CRM/Kanban do WsmartQR, documentando boards, colunas (funil), cards, campos dinamicos, entidades reutilizaveis, controle de acesso (membros diretos + heranca via inbox), visibilidade (shared/private), drag-and-drop, automacoes por coluna, e filtros.

### Arquivos a Modificar

1. **Criar** `src/data/docs/kanban-prd.ts` -- PRD completo (~450 linhas)
2. **Editar** `src/components/admin/DocumentationTab.tsx` -- Atualizar modulo "CRM / Kanban" de `coming_soon` para `complete`, importar e vincular conteudo

### Estrutura do PRD

1. **Visao Geral**
   - CRM baseado em Kanban com boards personalizaveis, colunas representando etapas do funil, cards como leads/oportunidades
   - Multi-board, multi-inbox, campos dinamicos, entidades reutilizaveis
   - Acesso: super_admin cria/gerencia boards; membros diretos ou via inbox visualizam/editam

2. **Modelo de Dados** -- 7 tabelas:
   - `kanban_boards` (name, description, visibility shared/private, inbox_id, instance_id, created_by)
   - `kanban_columns` (board_id, name, color, position, automation_enabled, automation_message)
   - `kanban_cards` (board_id, column_id, title, assigned_to, created_by, tags[], position, notes)
   - `kanban_card_data` (card_id, field_id, value)
   - `kanban_fields` (board_id, name, field_type enum, options, is_primary, required, show_on_card, entity_id, position)
   - `kanban_entities` (board_id, name, position)
   - `kanban_entity_values` (entity_id, label, position)
   - `kanban_board_members` (board_id, user_id, role editor/viewer)

3. **Enums**:
   - `kanban_visibility`: shared, private
   - `kanban_field_type`: text, currency, date, select, entity_select

4. **Funcoes de Seguranca (SECURITY DEFINER)**:
   - `can_access_kanban_board(_user_id, _board_id)`: retorna true se super_admin, membro direto, ou membro de inbox vinculada
   - `can_access_kanban_card(_user_id, _card_id)`: verifica board access + visibilidade (private: so criador/atribuido)

5. **Politicas RLS** -- por tabela:
   - `kanban_boards`: super_admin CRUD total; SELECT para criador, membro direto, ou membro de inbox vinculada
   - `kanban_columns`: super_admin ALL; SELECT via `can_access_kanban_board`
   - `kanban_cards`: super_admin ALL; SELECT com filtro de visibilidade (shared: board access; private: criador ou atribuido); UPDATE/DELETE por criador/atribuido/board owner; INSERT por board access
   - `kanban_card_data`: super_admin ALL; CRUD via `can_access_kanban_card`
   - `kanban_fields`: super_admin ALL; SELECT via `can_access_kanban_board`
   - `kanban_entities` / `kanban_entity_values`: super_admin ALL; SELECT via board access

6. **Visibilidade dos Boards**:
   - `shared`: todos os membros (diretos + inbox) veem todos os cards
   - `private`: cada usuario so ve cards que criou ou que estao atribuidos a ele
   - Filtro aplicado no frontend (UX) e enforced pelo backend (RLS)

7. **Campos Dinamicos (Fields)**:
   - Tipos: text (texto curto), currency (moeda BRL formatada), date (calendario), select (opcoes fixas), entity_select (referencia a entidade reutilizavel)
   - Propriedades: is_primary (valor principal exibido no card), required (obrigatorio ao salvar), show_on_card (exibir valor na listagem)
   - Valores armazenados em `kanban_card_data` (card_id + field_id -> value)

8. **Entidades Reutilizaveis**:
   - Tabelas de valores compartilhados entre cards (ex: Origem do Lead, Produto, Etapa)
   - CRUD via EditBoardDialog aba "Entidades"
   - Vinculo: field com field_type=entity_select aponta para entity_id
   - Resolucao de labels: ao exibir card, converte UUID do value para label legivel

9. **Automacoes por Coluna**:
   - Cada coluna pode ter `automation_enabled` + `automation_message`
   - Ao mover card para coluna com automacao ativa, sistema exibe toast informativo
   - Preparado para disparo futuro via instancia WhatsApp (instance_id do board)

10. **Controle de Acesso e Membros**:
    - Heranca via inbox: se board tem inbox_id, todos os inbox_users tem acesso
    - Membros diretos: `kanban_board_members` com role `editor` ou `viewer`
    - Permissoes efetivas:
      - super_admin/gerente: sempre podem adicionar cards
      - editor (direto): pode adicionar cards
      - viewer (direto): visualizacao apenas
      - membro via inbox: acesso como editor (pode adicionar cards)
    - Aba "Acesso" no EditBoardDialog: mostra membros inbox + diretos, CRUD de membros diretos

11. **Drag and Drop**:
    - Biblioteca: @dnd-kit/core + @dnd-kit/sortable
    - Reordenacao de cards dentro da mesma coluna (vertical)
    - Mover cards entre colunas (drag over + drop)
    - Persistencia: atualiza column_id e position no Supabase apos drop
    - Sensors: PointerSensor (distance: 5px), TouchSensor (delay: 200ms, tolerance: 8px)
    - DragOverlay para feedback visual durante arraste

12. **Interface do Usuario** -- Componentes:
    - `KanbanCRM.tsx`: Lista de boards com busca, contagem de colunas/cards/membros, botao "Novo Quadro" (super_admin)
    - `BoardCard.tsx`: Card do board com badges (visibilidade, inbox, membros), acoes (editar, duplicar, excluir)
    - `KanbanBoard.tsx`: Visualizacao do board com header, busca, filtro por responsavel, scroll horizontal, DnD context
    - `KanbanColumn.tsx`: Coluna do funil com header colorido, contagem, area droppable, botao adicionar card inline
    - `KanbanCardItem.tsx`: Card individual com campo primario, campos show_on_card, tags coloridas, avatar do responsavel, botoes prev/next
    - `CardDetailSheet.tsx`: Sheet lateral para editar card (titulo, coluna, responsavel, tags, notas, campos dinamicos com DynamicFormField)
    - `DynamicFormField.tsx`: Renderizador generico de campos (text/currency/date/select/entity_select)
    - `CreateBoardDialog.tsx`: Dialog de criacao com nome, descricao, visibilidade, inbox
    - `EditBoardDialog.tsx`: Dialog completo com 5 abas (Geral, Colunas, Campos, Entidades, Acesso)

13. **Fluxos Operacionais**:
    - Criar board: super_admin -> CreateBoardDialog -> insere kanban_boards -> redireciona para lista
    - Configurar funil: EditBoardDialog aba Colunas -> adicionar/remover/reordenar colunas com cores
    - Definir campos: EditBoardDialog aba Campos -> tipos, opcoes, entidade, primary, required, show_on_card
    - Criar entidades: EditBoardDialog aba Entidades -> nome + lista de valores
    - Gerenciar acesso: EditBoardDialog aba Acesso -> vincular inbox ou adicionar membros diretos com role
    - Adicionar card: inline na coluna -> titulo -> insere com position e auto-assign (private)
    - Editar card: clique -> CardDetailSheet -> campos dinamicos, responsavel, tags, notas -> salva com upsert
    - Mover card: drag-and-drop ou botoes prev/next -> atualiza column_id + position
    - Duplicar board: BoardCard menu -> copia board + colunas + entidades + values + campos (com remapeamento de entity_id)
    - Excluir board: BoardCard menu -> confirmacao -> deleta board (cascade)

14. **Filtros e Busca**:
    - Busca global: filtra cards por titulo, tags, nome do responsavel
    - Filtro por responsavel: chips de membros que possuem cards atribuidos, clique para filtrar
    - Aplicados em tempo real no frontend (sem re-fetch)

15. **Regras de Negocio**:
    - Apenas super_admin pode criar, editar e excluir boards
    - Boards privados: auto-assign ao criar card (atribui ao usuario logado)
    - Campo primario: apenas um por board; exibido como titulo principal do card (substitui title)
    - Duplicacao: copia toda a estrutura exceto cards
    - Entidade referenciada por campo: ao excluir entidade, campo volta para tipo "text"
    - Cores de colunas: 10 opcoes pre-definidas ciclicas
    - Tags: hash-based color (5 cores Tailwind)

### Detalhes de Implementacao

- `kanban-prd.ts` exporta `kanbanPrdContent` como template literal Markdown
- `DocumentationTab.tsx`: importar `kanbanPrdContent`, mudar status para `complete`, versao `v1.0`, data `2026-03-03`
- Seguir mesmo padrao de formatacao dos PRDs existentes


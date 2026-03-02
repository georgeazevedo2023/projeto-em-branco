

## Módulo de Documentação no Admin Panel

### Objetivo
Criar uma nova aba "Documentação" no painel administrativo com PRDs detalhados e completos de cada módulo do sistema, começando pelo módulo de Instâncias. Cada documento incluirá funcionalidades, endpoints, design, modelo de dados e permissões -- tudo com opção de download em Markdown.

### Escopo Inicial
- Nova aba "Docs" no AdminPanel com listagem de módulos documentados
- Página de visualização de PRD com renderização Markdown
- Botão de download (.md)
- Primeiro documento: **Módulo de Instâncias** (baseado no PRD existente em `public/PRD_Modulo_Instancias.md`, atualizado com as mudanças de segurança recentes como `instance_id` no lugar de `token`)

---

### Detalhes Técnicos

#### 1. Novo componente: `src/components/admin/DocumentationTab.tsx`
- Lista de módulos documentados em cards (ícone, nome, versão, data, status)
- Cada card abre o documento completo em um dialog/sheet
- Módulos planejados: Instâncias, Helpdesk, Broadcast, Agendamentos, CRM/Kanban, Admin, Dashboard
- Badge de status: "Completo" / "Em breve"

#### 2. Novo componente: `src/components/admin/DocumentViewer.tsx`
- Recebe conteúdo Markdown como string
- Renderiza com formatação básica (headings, tabelas, code blocks) usando componentes shadcn
- Botão "Download .md" que gera arquivo e dispara download via `Blob` + `URL.createObjectURL`
- Não usará lib externa de Markdown -- renderização manual com `split` por seções para manter o bundle leve

#### 3. Dados dos documentos: `src/data/docs/instances-prd.ts`
- Exporta o conteúdo do PRD como template literal string
- Atualizado para refletir a mudança de segurança (tokens resolvidos server-side via `instance_id`)
- Baseado no `public/PRD_Modulo_Instancias.md` existente (751 linhas)

#### 4. Alterações no `AdminPanel.tsx`
- Adicionar nova tab "Docs" ao `TabsList` (ícone `FileText`)
- Adicionar `TabsContent value="docs"` que renderiza `<DocumentationTab />`

#### 5. Download
- Botão gera arquivo `.md` com nome formatado (ex: `PRD_Modulo_Instancias_v1.0.md`)
- Usa API nativa do browser (`Blob`, `createElement('a')`, `click()`)

---

### Estrutura dos cards de módulos

| Módulo | Status | Ícone |
|--------|--------|-------|
| Instâncias WhatsApp | Completo | Server |
| Helpdesk / Atendimento | Em breve | Headphones |
| Broadcast (Grupos) | Em breve | Send |
| Broadcast (Leads) | Em breve | Users |
| Agendamentos | Em breve | Clock |
| CRM / Kanban | Em breve | Kanban |
| Dashboard / Analytics | Em breve | BarChart |
| Administração | Em breve | ShieldCheck |

---

### Arquivos a criar/editar

1. **Criar** `src/data/docs/instances-prd.ts` -- conteúdo PRD atualizado
2. **Criar** `src/components/admin/DocumentationTab.tsx` -- listagem de módulos
3. **Criar** `src/components/admin/DocumentViewer.tsx` -- visualização + download
4. **Editar** `src/pages/dashboard/AdminPanel.tsx` -- adicionar aba "Docs"


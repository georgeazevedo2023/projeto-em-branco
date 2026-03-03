
## PRD do Modulo de Administracao

### Objetivo
Criar um PRD completo e detalhado do modulo de Administracao do WsmartQR, cobrindo: usuarios, permissoes (roles), instancias, caixas de entrada, departamentos, atendentes (equipe), herancas de acesso e Edge Functions administrativas. O documento sera adicionado ao sistema de documentacao existente.

### Escopo
O PRD documentara:
- Hierarquia de papeis (app_role + inbox_role)
- Modelo de dados completo (8 tabelas + enums + funcoes)
- Heranca de acesso: como super_admin herda acesso total, como inbox_role concede acesso a departamentos e conversas
- CRUD de usuarios via Edge Functions (create, update, delete)
- Gestao de caixas de entrada (inboxes) + webhooks
- Gestao de equipe (inbox_users) + departamentos (departments + department_members)
- Politicas RLS de todas as tabelas envolvidas
- Interface do usuario (abas do AdminPanel)
- Diagramas de fluxo de heranca de acesso

### Arquivos a Modificar

1. **Criar** `src/data/docs/admin-prd.ts` -- PRD completo (~400 linhas) cobrindo:
   - Visao geral e arquitetura de permissoes
   - Diagrama de heranca de acesso (super_admin > gerente > user; admin > gestor > agente)
   - Modelo de dados: user_profiles, user_roles, instances, user_instance_access, inboxes, inbox_users, departments, department_members
   - Funcoes de seguranca: is_super_admin, has_role, has_inbox_access, is_inbox_member, get_inbox_role
   - Politicas RLS por tabela
   - Edge Functions: admin-create-user, admin-update-user, admin-delete-user
   - Interface (abas: Caixas, Usuarios, Equipe, Departamentos, Backup, Docs)
   - Fluxos operacionais (criar usuario, atribuir instancia, criar inbox, adicionar atendente, criar departamento)
   - Regras de negocio e validacoes

2. **Editar** `src/components/admin/DocumentationTab.tsx` -- Atualizar o modulo "Administracao" de `coming_soon` para `complete` com o conteudo do PRD

### Conteudo do PRD (Estrutura)

1. **Visao Geral** -- Objetivo do modulo, publico-alvo (super_admin)
2. **Hierarquia de Papeis**
   - Papeis de aplicacao: super_admin, gerente, user (enum app_role)
   - Papeis de inbox: admin, gestor, agente (enum inbox_role)
   - Diagrama de heranca
3. **Modelo de Dados** -- 8 tabelas com colunas, tipos, defaults
4. **Funcoes de Seguranca (SECURITY DEFINER)** -- is_super_admin, has_role, has_inbox_access, is_inbox_member, get_inbox_role
5. **Politicas RLS** -- Tabela por tabela
6. **Edge Functions Administrativas** -- Endpoints, payloads, validacoes
7. **Interface do Usuario** -- Abas, funcionalidades, componentes
8. **Fluxos Operacionais** -- Passo a passo de cada operacao
9. **Heranca de Acesso** -- Como acesso flui: instancia > inbox > departamento > conversa
10. **Secrets e Variaveis** -- Configuracoes necessarias

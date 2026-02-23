

## Problema Identificado

As policies RLS da tabela `user_roles` estao todas como **RESTRICTIVE** (em vez de PERMISSIVE). Isso faz com que **todas** as policies precisem retornar `true` simultaneamente para liberar acesso. Como um usuario normal nao e super_admin, a combinacao das policies sempre bloqueia a leitura.

O resultado: a query `SELECT role FROM user_roles WHERE user_id = ...` retorna array vazio, e o AuthContext nao consegue identificar o role do usuario.

## Solucao

Recriar as 3 policies da tabela `user_roles` como **PERMISSIVE** (o padrao do Supabase). Com policies permissivas, basta **uma** delas retornar `true` para liberar o acesso.

## Etapas Tecnicas

1. **Criar uma migracao SQL** que:
   - Remove as 3 policies RESTRICTIVE existentes:
     - `Super admin can manage all roles`
     - `Super admin can view all roles`
     - `Users can view own roles`
   - Recria as mesmas 3 policies como PERMISSIVE (usando `CREATE POLICY ... AS PERMISSIVE`):
     - `Super admin can manage all roles` (ALL) - `is_super_admin(auth.uid())`
     - `Super admin can view all roles` (SELECT) - `is_super_admin(auth.uid())`  
     - `Users can view own roles` (SELECT) - `auth.uid() = user_id`

2. **Limpar dados orfaos** do usuario antigo (`66de650f...`) que ja nao existe no `auth.users`:
   - Remover roles do user_id `66de650f...` da tabela `user_roles`
   - Remover perfil do user_id `66de650f...` da tabela `user_profiles`

Nenhuma alteracao de codigo frontend e necessaria -- o problema e exclusivamente no banco de dados.


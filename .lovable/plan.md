

## Diagnostico Completo do Projeto

### Problema Critico: TODAS as tabelas com policies RESTRICTIVE

Apos corrigir `user_roles` e `user_profiles`, verifiquei que **todas as outras 26 tabelas** ainda possuem policies **RESTRICTIVE**. Isso causa o mesmo problema que impedia o login como super_admin -- quando ha multiplas policies RESTRICTIVE, **todas** precisam retornar `true` ao mesmo tempo, o que bloqueia acessos legitimos.

Tabelas afetadas (todas com RESTRICTIVE):
- `broadcast_logs` (5 policies)
- `contacts` (3 policies)
- `conversation_labels` (3 policies)
- `conversation_messages` (4 policies)
- `conversations` (4 policies)
- `inbox_users` (4 policies)
- `inboxes` (2 policies)
- `instance_connection_logs` (2 policies)
- `instances` (4 policies)
- `kanban_board_members` (2 policies)
- `kanban_boards` (5 policies)
- `kanban_card_data` (5 policies)
- `kanban_cards` (5 policies)
- `kanban_columns` (2 policies)
- `kanban_entities` (2 policies)
- `kanban_entity_values` (2 policies)
- `kanban_fields` (2 policies)
- `labels` (3 policies)
- `lead_database_entries` (2 policies)
- `lead_databases` (2 policies)
- `message_templates` (4 policies)
- `scheduled_message_logs` (2 policies)
- `scheduled_messages` (2 policies)
- `shift_report_configs` (1 policy)
- `shift_report_logs` (1 policy)
- `user_instance_access` (2 policies)

### Problema Secundario: CORS incompleto na Edge Function `uazapi-proxy`

O header `Access-Control-Allow-Headers` atual e:
```
authorization, x-client-info, apikey, content-type
```

Faltam os headers que o Supabase JS Client envia automaticamente:
```
x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version
```

### Problema: `config.toml` sem configuracao de edge functions

O arquivo `supabase/config.toml` so tem o `project_id`. Deveria ter a configuracao `verify_jwt = false` para as edge functions que precisam de validacao manual (como `uazapi-proxy`, `whatsapp-webhook`, etc.).

### O que esta OK

- Todas as 28 tabelas existem e tem RLS habilitado
- Triggers estao funcionando (auto_summarize, status_change, updated_at)
- Edge functions estao respondendo (logs mostram atividade recente com status 200)
- Autenticacao funciona (super_admin logando corretamente)
- Perfil do usuario carregando (user_profiles corrigido)
- Roles funcionando (user_roles corrigido)
- Secrets todas configuradas (UAZAPI_ADMIN_TOKEN, GROQ_API_KEY, etc.)
- Storage buckets criados (audio-messages, carousel-images, helpdesk-media)

---

## Plano de Correcao

### Etapa 1: Migracao SQL -- Corrigir TODAS as policies RESTRICTIVE

Criar uma migracao que faz DROP + CREATE de todas as policies de todas as tabelas afetadas, recriando-as como **PERMISSIVE** (o padrao). A logica de cada policy permanece identica, apenas muda o modo de `RESTRICTIVE` para `PERMISSIVE`.

Serao ~70 policies recriadas ao total, cobrindo as 26 tabelas listadas acima.

### Etapa 2: Corrigir CORS da Edge Function `uazapi-proxy`

Atualizar o `corsHeaders` em `supabase/functions/uazapi-proxy/index.ts` para incluir todos os headers necessarios:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}
```

### Etapa 3: Atualizar `supabase/config.toml`

Adicionar configuracao de edge functions com `verify_jwt = false` para funcoes que validam auth manualmente no codigo (como `uazapi-proxy`, `whatsapp-webhook`, `admin-create-user`, etc.).

### Nenhuma alteracao de codigo frontend necessaria

O problema e exclusivamente no banco de dados (policies) e configuracao de edge functions.


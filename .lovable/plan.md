## Ativar Cron Jobs com pg_cron + Intervalos Otimizados

### Passo 1: Habilitar extensoes pg_cron e pg_net

Criar uma migration SQL para habilitar as duas extensoes necessarias:

```text
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

### Passo 2: Criar os 3 cron jobs via SQL (insert direto, nao migration)

Como os cron jobs contem URLs e chaves especificas do projeto, serao criados via SQL direto (nao migration).

**Intervalos com +50% de economia:**


| Job                        | Original      | Novo intervalo     | Cron syntax   |
| -------------------------- | ------------- | ------------------ | ------------- |
| process-scheduled-messages | a cada 1 min  | a cada **1 hora**  | `*/2 * * * *` |
| auto-summarize (inactive)  | a cada 1 hora | a cada **2 horas** | `0 */2 * * *` |
| send-shift-report (hourly) | a cada 1 hora | a cada **2 horas** | `0 */2 * * *` |


**SQL para criar os 3 jobs:**

```text
-- Job 1: Processa mensagens agendadas a cada 2 minutos
SELECT cron.schedule(
  'process-scheduled-messages',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://crzcpnczpuzwieyzbqev.supabase.co/functions/v1/process-scheduled-messages',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyemNwbmN6cHV6d2lleXpicWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODI1NDUsImV4cCI6MjA4NzM1ODU0NX0.49SQU4odU9nNL9rdIXRsE92HFZFcrRmjQIuur5LRHh4"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- Job 2: Auto-resumo de conversas inativas a cada 2 horas
SELECT cron.schedule(
  'auto-summarize-inactive',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url:='https://crzcpnczpuzwieyzbqev.supabase.co/functions/v1/auto-summarize',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyemNwbmN6cHV6d2lleXpicWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODI1NDUsImV4cCI6MjA4NzM1ODU0NX0.49SQU4odU9nNL9rdIXRsE92HFZFcrRmjQIuur5LRHh4"}'::jsonb,
    body:='{"mode":"inactive","limit":20}'::jsonb
  ) AS request_id;
  $$
);

-- Job 3: Relatorio de turno a cada 2 horas
SELECT cron.schedule(
  'send-shift-reports-hourly',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url:='https://crzcpnczpuzwieyzbqev.supabase.co/functions/v1/send-shift-report',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyemNwbmN6cHV6d2lleXpicWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODI1NDUsImV4cCI6MjA4NzM1ODU0NX0.49SQU4odU9nNL9rdIXRsE92HFZFcrRmjQIuur5LRHh4"}'::jsonb,
    body:='{"mode":"cron"}'::jsonb
  ) AS request_id;
  $$
);
```

### Passo 3: Verificacao

Apos criar os jobs, consultar `cron.job` para confirmar que os 3 estao ativos.

### Impacto na economia

- **process-scheduled-messages**: 80% menos execucoes (de 1440/dia para 720/dia)
- **auto-summarize + send-shift-report**: 50% menos execucoes (de 24/dia para 12/dia cada)
- **Total**: de ~1488 execucoes/dia para ~744 execucoes/dia

### Secao tecnica

- A migration cria apenas as extensoes (pg_cron + pg_net)
- Os cron jobs sao criados via SQL direto (contem dados sensíveis como anon key)
- O `process-scheduled-messages` a cada 2 min pode ter delay maximo de 2 min para mensagens agendadas (aceitavel)
- O `send-shift-report` verifica internamente se e hora de enviar baseado no `send_hour` da config, entao rodar a cada 2h ainda funciona (pode ter delay de ate 1h)
- Nenhuma alteracao de codigo nas edge functions e necessaria
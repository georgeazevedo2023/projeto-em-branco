

## Corrigir mensagens outgoing do agente IA nao aparecendo no Helpdesk

### Problema identificado

O payload do n8n contem `status_ia: "ligada"`, o que faz a edge function entrar no bloco de processamento de `status_ia` (linha 92). Quando esse bloco nao encontra uma conversa aberta, ele retorna `status_ia_no_conversation` e **nunca processa a mensagem**, mesmo que o payload tambem contenha `content.text`.

Alem disso, o `inbox_id` no payload aponta para "Ibirajuba Teste" em vez de "Ibirajuba".

### Correcoes

**1. Corrigir o `inbox_id` no n8n**

Trocar no payload do n8n:
- De: `f851e9c8-f7a5-40bc-be12-697993fc5dbd` (Ibirajuba Teste)
- Para: `74c8fa53-45a7-4237-83f6-4d2548e083ed` (Ibirajuba)

**2. Corrigir a edge function `whatsapp-webhook`**

No bloco de `status_ia` (linha 164-168), quando nao encontra conversa aberta mas o payload contem conteudo de mensagem, ao inves de retornar early, permitir que o fluxo continue para o processamento de mensagem (que cria a conversa automaticamente).

Alteracao no arquivo `supabase/functions/whatsapp-webhook/index.ts`:

Linhas 164-168 - trocar o return early por um fall-through quando ha conteudo de mensagem:

```text
// Antes (retorna e ignora a mensagem):
if (!iaConv) {
  console.log('status_ia: no open conversation found')
  return new Response(...)
}

// Depois (permite processar a mensagem mesmo sem conversa existente):
if (!iaConv) {
  const hasMessageContent = payload.content?.text || unwrapped?.content?.text
  if (!hasMessageContent) {
    console.log('status_ia: no open conversation found and no message content')
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'status_ia_no_conversation' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  console.log('status_ia: no open conversation but has message content, falling through to message processing')
  resolvedInboxIdForMessage = resolvedInboxId
} else {
  // Conversa encontrada - atualiza status_ia e propaga IDs
  await supabase.from('conversations').update({ status_ia: statusIaPayload }).eq('id', iaConv.id)
  // ... resto do bloco existente de broadcast e propagacao
  resolvedInboxIdForMessage = resolvedInboxId
  resolvedConversationId = iaConv.id
}
```

### Secao tecnica

- A alteracao e apenas na edge function `whatsapp-webhook/index.ts`, linhas ~164-202
- O bloco de status_ia atualmente faz return early em 4 cenarios de erro. Apenas o cenario `no_conversation` precisa ser alterado para fazer fall-through quando ha conteudo de mensagem
- O fluxo de mensagem (a partir da linha 206) ja sabe criar conversas novas, entao a mensagem sera salva corretamente
- Apos o deploy, a mensagem do agente IA aparecera no helpdesk como `outgoing` (porque `fromMe: true`)
- O usuario tambem precisa corrigir o `inbox_id` no n8n para apontar para a inbox correta


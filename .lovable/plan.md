

## Migrar 4 Edge Functions de Lovable AI Gateway para Groq

### Funcoes Afetadas

1. **summarize-conversation** - Gera resumos de conversas via IA
2. **auto-summarize** - Resumo automatico quando conversa e resolvida
3. **analyze-summaries** - Analise de inteligencia de negocios
4. **send-shift-report** - Formata relatorio de turno com IA

### O que muda em cada funcao

Para cada uma das 4 funcoes, as alteracoes sao identicas em conceito:

| De (Lovable AI) | Para (Groq) |
|---|---|
| `LOVABLE_API_KEY` | `GROQ_API_KEY` |
| `https://ai.gateway.lovable.dev/v1/chat/completions` | `https://api.groq.com/openai/v1/chat/completions` |
| `google/gemini-3-flash-preview` | `llama-3.3-70b-versatile` |
| `google/gemini-2.5-flash` | `llama-3.3-70b-versatile` |
| `google/gemini-2.5-flash-lite` | `llama-3.1-8b-instant` |

### Detalhes por funcao

**1. summarize-conversation/index.ts**
- Linha 138: `LOVABLE_API_KEY` -> `GROQ_API_KEY`
- Linha 155: URL do gateway -> URL Groq
- Linha 158: Header Authorization usa `GROQ_API_KEY`
- Linha 162: modelo -> `llama-3.3-70b-versatile`

**2. auto-summarize/index.ts**
- Linha 12: variavel `LOVABLE_API_KEY` -> `GROQ_API_KEY`
- Linha 63: URL do gateway -> URL Groq
- Linha 66: Header Authorization usa `GROQ_API_KEY`
- Linha 70: modelo -> `llama-3.3-70b-versatile`
- Tambem corrigir CORS headers (linha 7 esta incompleto)

**3. analyze-summaries/index.ts**
- Linha 12: variavel `LOVABLE_API_KEY` -> `GROQ_API_KEY`
- Linhas 161 e 184: URLs do gateway -> URL Groq
- Linhas 164 e 187: Headers Authorization usam `GROQ_API_KEY`
- Linha 167: modelo principal -> `llama-3.3-70b-versatile`
- Linha 151: fallback -> `llama-3.1-8b-instant`

**4. send-shift-report/index.ts**
- Linha 12: variavel `LOVABLE_API_KEY` -> `GROQ_API_KEY`
- Linha 48: URL do gateway -> URL Groq
- Linha 51: Header Authorization usa `GROQ_API_KEY`
- Linha 55: modelo -> `llama-3.3-70b-versatile`

### Correcao adicional

A funcao `auto-summarize` tambem tem o CORS incompleto (faltam os headers `x-supabase-client-*`). Sera corrigido junto.

### A API Groq

A API Groq e compativel com o formato OpenAI, entao a estrutura do request/response permanece identica. So muda a URL base, a chave de API e os nomes dos modelos.

### Nenhuma alteracao de frontend necessaria

Todas as mudancas sao exclusivamente nas edge functions.


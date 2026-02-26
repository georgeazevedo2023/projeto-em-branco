

## Renomear "WsmartQR" para "WhatsPRO"

### Resumo

Substituir todas as ocorrencias do nome "WsmartQR" por "WhatsPRO" em toda a aplicacao visivel ao usuario. Documentos PRD nao serao alterados por serem arquivos de referencia interna.

### Arquivos a alterar

1. **`index.html`** — Titulo da aba e meta tags (og:title, twitter:title, og:description, twitter:description)
2. **`src/components/dashboard/Sidebar.tsx`** (linha 190) — Nome no menu lateral
3. **`src/components/dashboard/MobileHeader.tsx`** (linha 17) — Nome no header mobile
4. **`src/pages/Login.tsx`** (linha 48) — Nome na tela de login
5. **`src/pages/Index.tsx`** (linhas 33, 59) — Nome no header e footer da landing page
6. **`src/pages/dashboard/Settings.tsx`** (linha 216) — Subtitulo da pagina de configuracoes
7. **`src/components/landing/HeroSection.tsx`** (linhas 38, 65) — Texto do CTA e URL mockup
8. **`src/components/landing/UseCasesSection.tsx`** (linha 176) — Titulo da secao
9. **`src/components/landing/TransformationSection.tsx`** (linha 37) — Descricao da secao
10. **`src/components/landing/FAQSection.tsx`** (linha 13) — Resposta do FAQ
11. **`src/components/landing/TestimonialsSection.tsx`** (linha 10) — Depoimento
12. **`src/components/landing/FinalCTASection.tsx`** — Texto do CTA (se houver referencia)
13. **`src/index.css`** (linha 7) — Comentario do design system

### Escopo

- Substituicao direta de texto "WsmartQR" por "WhatsPRO" e "wsmartqr" por "whatspro"
- Nenhuma alteracao de logica ou estrutura
- PRDs em `/public/` nao serao alterados (documentacao interna)


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reasons } = await req.json();

    if (!reasons || !Array.isArray(reasons) || reasons.length === 0) {
      return new Response(JSON.stringify({ grouped: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If few reasons, no need for AI grouping
    if (reasons.length <= 3) {
      return new Response(JSON.stringify({ grouped: reasons }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reasonsList = reasons.map((r: any) => `- "${r.reason}" (${r.count}x)`).join("\n");

    const systemPrompt = `Você é um analista de atendimento ao cliente. Agrupe motivos de contato similares em categorias.

Regras:
- Agrupe motivos que são variações do mesmo tema em uma única categoria
- Use nomes curtos e claros para cada categoria (máximo 5 palavras)
- Some as contagens dos motivos agrupados
- Retorne no máximo 8 categorias, ordenadas por contagem decrescente
- Responda APENAS com JSON válido, sem markdown

Formato de resposta:
[{"category": "Nome da Categoria", "count": 10, "original_reasons": ["motivo1", "motivo2"]}]`;

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Motivos de contato:\n${reasonsList}` },
        ],
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      console.error("[group-reasons] AI error:", aiResponse.status);
      return new Response(JSON.stringify({ grouped: reasons }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const grouped = JSON.parse(cleaned);
      return new Response(JSON.stringify({ grouped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      console.error("[group-reasons] Failed to parse AI response:", rawContent);
      return new Response(JSON.stringify({ grouped: reasons }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[group-reasons] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chatid, phone, instanceId } = await req.json();

    if (!chatid || !phone) {
      return new Response(
        JSON.stringify({ error: "chatid and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhookResponse = await fetch(
      "https://fluxwebhook.wsmart.com.br/webhook/receb_out_neo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status_ia: "ligada",
          chatid,
          phone,
          instanceId,
        }),
      }
    );

    const responseText = await webhookResponse.text();
    console.log("activate-ia response:", webhookResponse.status, responseText.substring(0, 200));

    return new Response(
      JSON.stringify({ success: true, status: webhookResponse.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("activate-ia error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

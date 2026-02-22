import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { messageId, audioUrl, conversationId } = await req.json()

    if (!messageId || !audioUrl) {
      return new Response(JSON.stringify({ error: 'messageId and audioUrl required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY not configured')
      return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Transcribing audio for message:', messageId, 'url:', audioUrl.substring(0, 80))

    // Download audio file
    const audioResponse = await fetch(audioUrl)
    if (!audioResponse.ok) {
      console.error('Failed to download audio:', audioResponse.status)
      return new Response(JSON.stringify({ error: 'Failed to download audio' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const audioBlob = await audioResponse.blob()
    console.log('Audio downloaded, size:', audioBlob.size, 'type:', audioBlob.type)

    // Send to Groq Whisper API
    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.mp3')
    formData.append('model', 'whisper-large-v3')
    formData.append('temperature', '0')
    formData.append('language', 'pt')
    formData.append('response_format', 'verbose_json')
    formData.append('prompt', 'Conversa o áudio em texto de forma clara e precisa.')

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    })

    if (!groqResponse.ok) {
      const errText = await groqResponse.text()
      console.error('Groq API error:', groqResponse.status, errText)
      return new Response(JSON.stringify({ error: 'Groq transcription failed', details: errText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await groqResponse.json()
    const transcription = result.text || ''
    console.log('Transcription result:', transcription.substring(0, 100))

    // Update message in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: updateError } = await supabase
      .from('conversation_messages')
      .update({ transcription })
      .eq('id', messageId)

    if (updateError) {
      console.error('Failed to update transcription:', updateError)
      return new Response(JSON.stringify({ error: 'Failed to save transcription' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Transcription saved for message:', messageId)

    // Broadcast transcription update via Realtime REST API
    if (conversationId) {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
      const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!
      await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          messages: [{
            topic: 'helpdesk-realtime',
            event: 'transcription-updated',
            payload: { messageId, conversationId, transcription },
          }],
        }),
      }).then(r => console.log('Transcription broadcast status:', r.status))
        .catch(err => console.error('Transcription broadcast failed:', err))
    }

    return new Response(JSON.stringify({ ok: true, transcription }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Transcription error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

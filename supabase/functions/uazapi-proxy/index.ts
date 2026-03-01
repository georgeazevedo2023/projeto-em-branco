import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

/**
 * Resolve instance token server-side from instance_id.
 * Verifies the user has access to the instance via user_instance_access or is super_admin.
 * Returns the token or null if not found/unauthorized.
 */
async function resolveInstanceToken(
  userId: string,
  instanceId: string
): Promise<string | null> {
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Check user has access (super_admin or explicit access)
  const { data: roles } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['super_admin', 'gerente'])

  const isSuperAdmin = roles?.some(r => r.role === 'super_admin') ?? false

  if (!isSuperAdmin) {
    const { data: access } = await serviceClient
      .from('user_instance_access')
      .select('id')
      .eq('user_id', userId)
      .eq('instance_id', instanceId)
      .maybeSingle()

    if (!access) {
      console.error('User', userId, 'does not have access to instance', instanceId)
      return null
    }
  }

  // Fetch token
  const { data: instance, error } = await serviceClient
    .from('instances')
    .select('token')
    .eq('id', instanceId)
    .single()

  if (error || !instance) {
    console.error('Instance not found:', instanceId, error)
    return null
  }

  return instance.token
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token)
    
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = claimsData.user.id
    const body = await req.json()
    const { action, instanceName, groupjid } = body

    // Resolve instance token server-side from instance_id
    // Falls back to body.token for backward compatibility (will be removed)
    let instanceToken: string | null = null
    const instanceId = body.instance_id || body.instanceId
    
    if (instanceId) {
      instanceToken = await resolveInstanceToken(userId, instanceId)
      if (!instanceToken && action !== 'list') {
        return new Response(
          JSON.stringify({ error: 'Instance not found or access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // Legacy: accept token from body (backward compat)
      instanceToken = body.token || body.instanceToken || null
    }

    const uazapiUrl = Deno.env.get('UAZAPI_SERVER_URL') || 'https://wsmart.uazapi.com'
    const adminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN')

    if (!adminToken) {
      return new Response(
        JSON.stringify({ error: 'UAZAPI admin token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let response: Response

    switch (action) {
      case 'connect': {
        if (!instanceToken) {
          return new Response(
            JSON.stringify({ error: 'Instance token required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        console.log('Connecting instance (resolved server-side)')
        
        response = await fetch(`${uazapiUrl}/instance/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify({}),
        })
        
        console.log('Connect response status:', response.status)
        
        const connectRawText = await response.text()
        console.log('Connect response (first 500 chars):', connectRawText.substring(0, 500))
        
        let connectData: unknown
        try {
          connectData = JSON.parse(connectRawText)
        } catch {
          connectData = { raw: connectRawText }
        }
        
        return new Response(
          JSON.stringify(connectData),
          { 
            status: response.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      case 'status': {
        if (!instanceToken) {
          return new Response(
            JSON.stringify({ error: 'Instance token required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        response = await fetch(`${uazapiUrl}/instance/status`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
        })
        
        console.log('Status response status:', response.status)
        break
      }

      case 'list': {
        console.log('Fetching instances from:', `${uazapiUrl}/instance/all`)
        response = await fetch(`${uazapiUrl}/instance/all`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'admintoken': adminToken,
            'token': adminToken,
          },
        })
        console.log('UAZAPI response status:', response.status)
        break
      }

      case 'groups': {
        if (!instanceToken) {
          return new Response(
            JSON.stringify({ error: 'Instance token required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        const groupsResponse = await fetch(`${uazapiUrl}/group/list?noparticipants=false`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
        })
        console.log('Groups response status:', groupsResponse.status)
        
        const groupsData = await groupsResponse.json()
        
        let normalizedGroups: unknown[]
        if (Array.isArray(groupsData)) {
          normalizedGroups = groupsData
        } else if (groupsData?.groups && Array.isArray(groupsData.groups)) {
          normalizedGroups = groupsData.groups
        } else if (groupsData?.data && Array.isArray(groupsData.data)) {
          normalizedGroups = groupsData.data
        } else {
          console.log('Unexpected groups format:', JSON.stringify(groupsData).substring(0, 200))
          normalizedGroups = []
        }
        
        const groupsStatus = groupsResponse.ok ? 200 : 200
        return new Response(
          JSON.stringify(normalizedGroups),
          { 
            status: groupsStatus, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      case 'group-info': {
        if (!instanceToken || !groupjid) {
          return new Response(
            JSON.stringify({ error: 'Instance and group JID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        response = await fetch(`${uazapiUrl}/group/info`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify({ groupjid }),
        })
        break
      }

      case 'send-message': {
        if (!instanceToken || !groupjid || !body.message) {
          return new Response(
            JSON.stringify({ error: 'Instance, groupjid and message required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const message = String(body.message).trim()
        if (message.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Message cannot be empty' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        if (message.length > 4096) {
          return new Response(
            JSON.stringify({ error: 'Message too long (max 4096 characters)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const sendUrl = `${uazapiUrl}/send/text`
        const sendBody = {
          number: groupjid,
          text: message,
        }
        
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify(sendBody),
        })
        
        console.log('Send response status:', sendResponse.status)
        
        const rawText = await sendResponse.text()
        let sendData: unknown
        try {
          sendData = JSON.parse(rawText)
        } catch {
          sendData = { raw: rawText }
        }
        
        return new Response(
          JSON.stringify(sendData),
          { 
            status: sendResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      case 'send-media': {
        const mediaDestination = groupjid || body.jid
        if (!instanceToken || !mediaDestination || !body.mediaUrl || !body.mediaType) {
          return new Response(
            JSON.stringify({ error: 'Instance, groupjid/jid, mediaUrl and mediaType required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const mediaEndpoint = `${uazapiUrl}/send/media`
        
        const isBase64 = body.mediaUrl.startsWith('data:')
        const fileValue = isBase64 
          ? body.mediaUrl.split(',')[1] || body.mediaUrl
          : body.mediaUrl
        
        const mediaBody: Record<string, unknown> = {
          number: mediaDestination,
          type: body.mediaType,
          file: fileValue,
          text: body.caption || '',
        }
        
        if (body.mediaType === 'document' && body.filename) {
          mediaBody.docName = body.filename
        }
        
        const mediaResponse = await fetch(mediaEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify(mediaBody),
        })
        
        console.log('Media response status:', mediaResponse.status)
        
        const mediaRawText = await mediaResponse.text()
        
        let mediaData: unknown
        try {
          mediaData = JSON.parse(mediaRawText)
        } catch {
          mediaData = { raw: mediaRawText }
        }
        
        return new Response(
          JSON.stringify(mediaData),
          { 
            status: mediaResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      case 'send-carousel': {
        if (!instanceToken || !groupjid || !body.carousel) {
          return new Response(
            JSON.stringify({ error: 'Instance, groupjid and carousel required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const carouselEndpoint = `${uazapiUrl}/send/carousel`
        
        const isGroup = groupjid.endsWith('@g.us')
        
        let normalizedDestination = groupjid
        if (!groupjid.includes('@') && !isGroup) {
          normalizedDestination = `${groupjid}@s.whatsapp.net`
        }
        
        const isUuidLike = (str: string | undefined | null): boolean => {
          if (!str) return false;
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        };

        const processedCards = body.carousel.map((card: { text: string; image: string; buttons: Array<{ id?: string; text?: string; label?: string; type: string; url?: string; phone?: string }> }, idx: number) => {
          let imageValue = card.image
          if (card.image && card.image.startsWith('data:')) {
            imageValue = card.image.split(',')[1] || card.image
          }
          
          const processedButtons = card.buttons?.map((btn, btnIdx) => {
            const buttonText = btn.text ?? btn.label ?? '';
            
            let buttonId: string;
            switch (btn.type) {
              case 'URL':
                buttonId = btn.url ?? btn.id ?? '';
                break;
              case 'CALL':
                buttonId = btn.phone ?? btn.id ?? '';
                break;
              case 'COPY':
                buttonId = btn.id ?? buttonText;
                break;
              case 'REPLY':
              default:
                buttonId = isUuidLike(btn.id) ? buttonText : (btn.id ?? buttonText);
                break;
            }
            
            return {
              id: buttonId,
              text: buttonText,
              type: btn.type,
            };
          }) || []
          
          return {
            text: card.text,
            image: imageValue,
            buttons: processedButtons,
          }
        })
        
        const messageText = String(body.message ?? '').trim()

        const payloadCandidates: Array<Record<string, unknown>> = []
        
        if (isGroup) {
          payloadCandidates.push(
            { groupjid: groupjid, message: messageText, carousel: processedCards },
            { chatId: groupjid, message: messageText, carousel: processedCards },
            { phone: groupjid, message: messageText, carousel: processedCards },
            { number: groupjid, text: messageText, carousel: processedCards },
          )
        } else {
          payloadCandidates.push(
            { phone: normalizedDestination, message: messageText, carousel: processedCards },
            { number: normalizedDestination, text: messageText, carousel: processedCards },
            { phone: groupjid, message: messageText, carousel: processedCards },
            { number: groupjid, text: messageText, carousel: processedCards },
          )
        }

        let lastStatus = 500
        let lastRawText = ''

        for (let attempt = 0; attempt < payloadCandidates.length; attempt++) {
          const candidate = payloadCandidates[attempt]
          console.log(`Carousel attempt #${attempt + 1} payload keys:`, Object.keys(candidate).join(', '))

          const resp = await fetch(carouselEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': instanceToken,
            },
            body: JSON.stringify(candidate),
          })

          lastStatus = resp.status
          lastRawText = await resp.text()
          console.log(`Carousel attempt #${attempt + 1} status:`, lastStatus)

          if (resp.ok) {
            console.log(`Carousel SUCCESS with attempt #${attempt + 1}`)
            break
          }

          const lowered = lastRawText.toLowerCase()
          const shouldRetry = lowered.includes('missing required fields') || lowered.includes('missing')
          if (!shouldRetry) break
        }

        let carouselData: unknown
        try {
          carouselData = JSON.parse(lastRawText)
        } catch {
          carouselData = { raw: lastRawText }
        }

        return new Response(
          JSON.stringify(carouselData),
          {
            status: lastStatus,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      case 'check-numbers': {
        if (!instanceToken || !body.phones || !Array.isArray(body.phones)) {
          return new Response(
            JSON.stringify({ error: 'Instance and phones array required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        console.log('Checking', body.phones.length, 'numbers for WhatsApp registration')
        
        const checkResponse = await fetch(`${uazapiUrl}/chat/check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify({ numbers: body.phones }),
        })
        
        const checkRawText = await checkResponse.text()
        
        let checkData: unknown
        try {
          checkData = JSON.parse(checkRawText)
        } catch {
          checkData = { raw: checkRawText }
        }
        
        let users: unknown[]
        if (Array.isArray(checkData)) {
          users = checkData
        } else {
          users = (checkData as Record<string, unknown>)?.Users as unknown[] || 
                  (checkData as Record<string, unknown>)?.users as unknown[] || 
                  (checkData as Record<string, unknown>)?.data as unknown[] || 
                  []
        }
        
        return new Response(
          JSON.stringify({ users }),
          { status: checkResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'resolve-lids': {
        if (!instanceToken) {
          return new Response(
            JSON.stringify({ error: 'Instance required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        const groupJids: string[] = body.groupJids || []
        if (groupJids.length === 0) {
          return new Response(
            JSON.stringify({ error: 'groupJids array required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        const groupParticipants: Record<string, Array<{ jid: string; phone: string; name: string; isAdmin: boolean; isSuperAdmin: boolean }>> = {}
        
        for (const gjid of groupJids) {
          try {
            const infoResp = await fetch(`${uazapiUrl}/group/info`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'token': instanceToken,
              },
              body: JSON.stringify({ groupjid: gjid }),
            })
            
            if (!infoResp.ok) continue
            
            const infoData = await infoResp.json()
            const participants = infoData?.Participants || infoData?.participants || []
            
            groupParticipants[gjid] = (participants as Array<Record<string, unknown>>)
              .map(p => {
                const rawPhone = String(p.PhoneNumber || p.phoneNumber || '')
                const cleanPhone = rawPhone.replace(/\D/g, '')
                const hasValidPhone = cleanPhone.length >= 10 && !rawPhone.includes('·')
                const jid = String(p.JID || p.jid || '')
                
                return {
                  jid,
                  phone: hasValidPhone ? cleanPhone : '',
                  name: String(p.PushName || p.pushName || p.DisplayName || p.Name || p.name || ''),
                  isAdmin: Boolean(p.IsAdmin || p.isAdmin),
                  isSuperAdmin: Boolean(p.IsSuperAdmin || p.isSuperAdmin),
                  isLid: !hasValidPhone,
                }
              })
          } catch (err) {
            console.error('Error fetching group/info for', gjid, err)
          }
        }
        
        return new Response(
          JSON.stringify({ groupParticipants }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'download-media': {
        if (!body.fileUrl || !body.instanceId) {
          return new Response(
            JSON.stringify({ error: 'fileUrl and instanceId required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const serviceSupabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { data: inst, error: instError } = await serviceSupabase
          .from('instances')
          .select('token')
          .eq('id', body.instanceId)
          .single()

        if (instError || !inst) {
          return new Response(
            JSON.stringify({ error: 'Instance not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log('Proxying file download:', body.fileUrl.substring(0, 80))
        const fileResp = await fetch(body.fileUrl, {
          headers: { 'token': inst.token },
        })

        if (!fileResp.ok) {
          return new Response(
            JSON.stringify({ error: 'Failed to download file', status: fileResp.status }),
            { status: fileResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(fileResp.body, {
          headers: {
            ...corsHeaders,
            'Content-Type': fileResp.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Disposition': fileResp.headers.get('Content-Disposition') || 'inline',
          },
        })
      }

      case 'send-audio': {
        if (!instanceToken || !body.jid || !body.audio) {
          return new Response(
            JSON.stringify({ error: 'Instance, jid and audio (base64) required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const rawAudio = String(body.audio)
        const audioFile = rawAudio.includes(',') && rawAudio.startsWith('data:')
          ? rawAudio.split(',')[1]
          : rawAudio

        const audioEndpoint = `${uazapiUrl}/send/media`
        const audioBody = {
          number: body.jid,
          type: 'ptt',
          file: audioFile,
        }

        const audioResponse = await fetch(audioEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify(audioBody),
        })

        const audioRawText = await audioResponse.text()
        let audioData: unknown
        try {
          audioData = JSON.parse(audioRawText)
        } catch {
          audioData = { raw: audioRawText }
        }

        return new Response(
          JSON.stringify(audioData),
          { status: audioResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'send-chat': {
        if (!instanceToken || !body.jid || !body.message) {
          return new Response(
            JSON.stringify({ error: 'Instance, jid and message required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const chatEndpoint = `${uazapiUrl}/send/text`
        const chatBody = {
          number: body.jid,
          text: String(body.message).trim(),
        }

        const chatResponse = await fetch(chatEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify(chatBody),
        })

        const chatRawText = await chatResponse.text()
        let chatData: unknown
        try {
          chatData = JSON.parse(chatRawText)
        } catch {
          chatData = { raw: chatRawText }
        }

        return new Response(
          JSON.stringify(chatData),
          { status: chatResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // Parse response with resilience
    const rawText = await response.text()
    let data: unknown
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { raw: rawText }
    }

    return new Response(
      JSON.stringify(data),
      { 
        status: response.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

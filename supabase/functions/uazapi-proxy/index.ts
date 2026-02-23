import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    const body = await req.json()
    const { action, instanceName, token: bodyToken, groupjid, instanceToken: altToken } = body
    const instanceToken = bodyToken || altToken

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
        // Conforme documentação UAZAPI: token da instância no header, body vazio para QR Code
        if (!instanceToken) {
          return new Response(
            JSON.stringify({ error: 'Instance token required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        console.log('Connecting instance with token (first 10 chars):', instanceToken.substring(0, 10))
        
        response = await fetch(`${uazapiUrl}/instance/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify({}),
        })
        
        console.log('Connect response status:', response.status)
        
        // Log response body para debug
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
        // Verificar status da instância
        if (!instanceToken) {
          return new Response(
            JSON.stringify({ error: 'Instance token required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        console.log('Checking status with token (first 10 chars):', instanceToken.substring(0, 10))
        
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
        // List all instances
        console.log('Fetching instances from:', `${uazapiUrl}/instance/all`)
        console.log('Using admin token (first 10 chars):', adminToken?.substring(0, 10))
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
        // List groups for an instance
        if (!instanceToken) {
          return new Response(
            JSON.stringify({ error: 'Instance token required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        console.log('Fetching groups with token (first 10 chars):', instanceToken.substring(0, 10))
        const groupsResponse = await fetch(`${uazapiUrl}/group/list?noparticipants=false`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
        })
        console.log('Groups response status:', groupsResponse.status)
        
        const groupsData = await groupsResponse.json()
        console.log('Groups raw response type:', typeof groupsData, Array.isArray(groupsData) ? 'is array' : 'not array')
        
        // UAZAPI pode retornar { groups: [...] } ou array direto
        // Normalizar para sempre retornar array
        let normalizedGroups: unknown[]
        if (Array.isArray(groupsData)) {
          normalizedGroups = groupsData
        } else if (groupsData?.groups && Array.isArray(groupsData.groups)) {
          normalizedGroups = groupsData.groups
          console.log('Unwrapped groups from object, count:', normalizedGroups.length)
        } else if (groupsData?.data && Array.isArray(groupsData.data)) {
          normalizedGroups = groupsData.data
          console.log('Unwrapped groups from data, count:', normalizedGroups.length)
        } else {
          console.log('Unexpected groups format:', JSON.stringify(groupsData).substring(0, 200))
          normalizedGroups = []
        }
        
        // If upstream failed (e.g. WhatsApp disconnected), return empty array with 200
        // so the frontend doesn't crash - it just shows 0 groups for that instance
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
        // Get group info with participants
        if (!instanceToken || !groupjid) {
          return new Response(
            JSON.stringify({ error: 'Instance token and group JID required' }),
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
        // Send text message to group
        if (!instanceToken || !groupjid || !body.message) {
          return new Response(
            JSON.stringify({ error: 'Token, groupjid and message required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Validate message length (max 4096 characters)
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

        // UAZAPI uses /send/text endpoint for text messages (per documentation)
        const sendUrl = `${uazapiUrl}/send/text`
        const sendBody = {
          number: groupjid,
          text: message,
        }
        
        console.log('Sending message to:', sendUrl)
        console.log('Payload:', JSON.stringify(sendBody))
        console.log('Token (first 10 chars):', instanceToken.substring(0, 10))
        
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
        // Send media (image or document) to group or contact using unified /send/media endpoint
        const mediaDestination = groupjid || body.jid
        if (!instanceToken || !mediaDestination || !body.mediaUrl || !body.mediaType) {
          return new Response(
            JSON.stringify({ error: 'Token, groupjid/jid, mediaUrl and mediaType required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const mediaEndpoint = `${uazapiUrl}/send/media`
        
        // Check if it's base64 and extract only the data part (remove prefix like "data:image/png;base64,")
        const isBase64 = body.mediaUrl.startsWith('data:')
        const fileValue = isBase64 
          ? body.mediaUrl.split(',')[1] || body.mediaUrl  // Get only base64 content
          : body.mediaUrl  // URL as-is
        
        // Build payload according to UAZAPI documentation
        const mediaBody: Record<string, unknown> = {
          number: mediaDestination,
          type: body.mediaType,  // 'image' or 'document'
          file: fileValue,
          text: body.caption || '',  // UAZAPI uses 'text' not 'caption'
        }
        
        // For documents, add the filename
        if (body.mediaType === 'document' && body.filename) {
          mediaBody.docName = body.filename
        }
        
        console.log('Sending media to:', mediaEndpoint)
        console.log('Media type:', body.mediaType)
        console.log('Is Base64:', isBase64)
        console.log('Token (first 10 chars):', instanceToken.substring(0, 10))
        
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
        console.log('Media raw response:', mediaRawText.substring(0, 300))
        
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
        // Send carousel message to group or individual contact
        if (!instanceToken || !groupjid || !body.carousel) {
          return new Response(
            JSON.stringify({ error: 'Token, groupjid and carousel required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const carouselEndpoint = `${uazapiUrl}/send/carousel`
        
        // Detect destination type: group (@g.us) or individual contact
        const isGroup = groupjid.endsWith('@g.us')
        
        // Normalize destination - ensure proper suffix for contacts without @
        let normalizedDestination = groupjid
        if (!groupjid.includes('@') && !isGroup) {
          // It's a raw phone number, add WhatsApp suffix
          normalizedDestination = `${groupjid}@s.whatsapp.net`
        }
        
        console.log('Carousel destination type:', isGroup ? 'GROUP' : 'CONTACT')
        console.log('Normalized destination:', normalizedDestination)
        
        // Helper para detectar UUID
        const isUuidLike = (str: string | undefined | null): boolean => {
          if (!str) return false;
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        };

        // Process carousel cards - handle base64 images
        const processedCards = body.carousel.map((card: { text: string; image: string; buttons: Array<{ id?: string; text?: string; label?: string; type: string; url?: string; phone?: string }> }, idx: number) => {
          // Check if image is base64 and extract just the data
          let imageValue = card.image
          if (card.image && card.image.startsWith('data:')) {
            imageValue = card.image.split(',')[1] || card.image
          }
          
          // Build buttons array conforme documentação UAZAPI /send/carousel
          // Schema esperado: { id, text, type }
          // - text: texto exibido no botão
          // - id: valor do botão (URL para type=URL, telefone para CALL, texto resposta para REPLY/COPY)
          const processedButtons = card.buttons?.map((btn, btnIdx) => {
            // Aceitar btn.text (schema oficial) ou btn.label (frontend atual)
            const buttonText = btn.text ?? btn.label ?? '';
            
            // Determinar o valor do id conforme o tipo
            let buttonId: string;
            switch (btn.type) {
              case 'URL':
                // Para URL, o id deve ser a URL completa
                buttonId = btn.url ?? btn.id ?? '';
                break;
              case 'CALL':
                // Para CALL, o id deve ser o número de telefone
                buttonId = btn.phone ?? btn.id ?? '';
                break;
              case 'COPY':
                // Para COPY, o id é o texto a ser copiado
                buttonId = btn.id ?? buttonText;
                break;
              case 'REPLY':
              default:
                // Para REPLY, evitar enviar UUID como resposta
                buttonId = isUuidLike(btn.id) ? buttonText : (btn.id ?? buttonText);
                break;
            }
            
            return {
              id: buttonId,
              text: buttonText,
              type: btn.type,
            };
          }) || []
          
          console.log(`Card ${idx + 1} buttons:`, JSON.stringify(processedButtons))
          
          return {
            text: card.text,
            image: imageValue,
            buttons: processedButtons,
          }
        })
        
        const messageText = String(body.message ?? '').trim()

        // Build payload candidates based on destination type
        // UAZAPI may expect different field names for groups vs contacts
        // Common patterns: phone/message, number/text, chatId/message, groupjid
        const payloadCandidates: Array<Record<string, unknown>> = []
        
        if (isGroup) {
          // For groups, try group-specific field names first
          payloadCandidates.push(
            { groupjid: groupjid, message: messageText, carousel: processedCards },
            { chatId: groupjid, message: messageText, carousel: processedCards },
            { phone: groupjid, message: messageText, carousel: processedCards },
            { number: groupjid, text: messageText, carousel: processedCards },
          )
        } else {
          // For individual contacts, prioritize phone/number fields
          payloadCandidates.push(
            { phone: normalizedDestination, message: messageText, carousel: processedCards },
            { number: normalizedDestination, text: messageText, carousel: processedCards },
            { phone: groupjid, message: messageText, carousel: processedCards },
            { number: groupjid, text: messageText, carousel: processedCards },
          )
        }

        console.log('Sending carousel to:', carouselEndpoint)
        console.log('Token (first 10 chars):', instanceToken.substring(0, 10))
        console.log('Carousel cards count:', processedCards.length)
        console.log('Payload candidates count:', payloadCandidates.length)

        let lastStatus = 500
        let lastRawText = ''

        for (let attempt = 0; attempt < payloadCandidates.length; attempt++) {
          const candidate = payloadCandidates[attempt]
          console.log(`Carousel attempt #${attempt + 1} payload keys:`, Object.keys(candidate).join(', '))
          console.log(`Carousel attempt #${attempt + 1} payload:`, JSON.stringify(candidate).substring(0, 600))

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
          console.log(`Carousel attempt #${attempt + 1} raw response:`, lastRawText.substring(0, 500))

          // Success - break out of retry loop
          if (resp.ok) {
            console.log(`Carousel SUCCESS with attempt #${attempt + 1}`)
            break
          }

          // Only retry if it's a "Missing required fields" type error
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
        // Verify if phone numbers are registered on WhatsApp
        if (!instanceToken || !body.phones || !Array.isArray(body.phones)) {
          return new Response(
            JSON.stringify({ error: 'Instance token and phones array required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        console.log('Checking', body.phones.length, 'numbers for WhatsApp registration')
        
        // UAZAPI expects { numbers: [...] } not { phone: [...] }
        const checkResponse = await fetch(`${uazapiUrl}/chat/check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify({ numbers: body.phones }),
        })
        
        console.log('Check response status:', checkResponse.status)
        
        const checkRawText = await checkResponse.text()
        console.log('Check raw response (first 500 chars):', checkRawText.substring(0, 500))
        
        let checkData: unknown
        try {
          checkData = JSON.parse(checkRawText)
        } catch {
          checkData = { raw: checkRawText }
        }
        
        // Normalize response - UAZAPI returns array directly: [{query, isInWhatsapp, ...}, ...]
        // Or wrapped in { Users: [...] } or { users: [...] } or { data: [...] }
        let users: unknown[]
        if (Array.isArray(checkData)) {
          // Direct array response
          users = checkData
          console.log('Check response is direct array with', users.length, 'items')
        } else {
          // Try to extract from object wrapper
          users = (checkData as Record<string, unknown>)?.Users as unknown[] || 
                  (checkData as Record<string, unknown>)?.users as unknown[] || 
                  (checkData as Record<string, unknown>)?.data as unknown[] || 
                  []
          console.log('Check response extracted from object, items:', users.length)
        }
        
        return new Response(
          JSON.stringify({ users }),
          { status: checkResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'resolve-lids': {
        // Enrich participants: fetch ALL participants with real PhoneNumber from /group/info
        // Instead of trying to match LIDs (which have different JID formats), 
        // return all participants per group so frontend can replace masked data entirely
        if (!instanceToken) {
          return new Response(
            JSON.stringify({ error: 'Instance token required' }),
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
        
        console.log('Enriching participants from', groupJids.length, 'groups via /group/info')
        
        // For each group, fetch full info and return ALL participants with valid PhoneNumber
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
            
            if (!infoResp.ok) {
              console.log('group/info failed for', gjid, 'status:', infoResp.status)
              continue
            }
            
            const infoData = await infoResp.json()
            const participants = infoData?.Participants || infoData?.participants || []
            
        // Return ALL participants - those with valid phone get phone field,
        // those without (LIDs) keep their original JID for direct sending
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
            
            console.log('Group', gjid, ':', groupParticipants[gjid].length, 'participants with valid phone')
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
        // Download media file from UAZAPI with authenticated token (proxy for browser)
        if (!body.fileUrl || !body.instanceId) {
          return new Response(
            JSON.stringify({ error: 'fileUrl and instanceId required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Use service role to fetch instance token
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
        // Send audio/voice message (PTT) via /send/media with type 'ptt'
        console.log('send-audio: instanceToken?', !!instanceToken, 'jid?', !!body.jid, 'audio?', !!body.audio)
        if (!instanceToken || !body.jid || !body.audio) {
          return new Response(
            JSON.stringify({ error: 'Token, jid and audio (base64) required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Strip data URI prefix if present (e.g. "data:audio/ogg;base64,...")
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

        console.log('Sending audio PTT to:', body.jid)
        const audioResponse = await fetch(audioEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instanceToken,
          },
          body: JSON.stringify(audioBody),
        })

        console.log('Audio response status:', audioResponse.status)
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
        // Send text message to individual contact (used by helpdesk)
        if (!instanceToken || !body.jid || !body.message) {
          return new Response(
            JSON.stringify({ error: 'Token, jid and message required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const chatEndpoint = `${uazapiUrl}/send/text`
        const chatBody = {
          number: body.jid,
          text: String(body.message).trim(),
        }

        console.log('Sending chat to:', body.jid)
        const chatResponse = await fetch(chatEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': body.instanceToken || instanceToken,
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

    // Parse response with resilience (handle non-JSON responses)
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

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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const cutoff = thirtyDaysAgo.toISOString()

    console.log('Cleaning up media older than:', cutoff)

    const buckets = ['audio-messages', 'helpdesk-media']
    let totalDeleted = 0

    for (const bucket of buckets) {
      // List all folders (conversation IDs)
      const { data: folders, error: listErr } = await supabase.storage
        .from(bucket)
        .list('', { limit: 1000 })

      if (listErr) {
        console.error(`Error listing ${bucket}:`, listErr)
        continue
      }

      for (const folder of folders || []) {
        if (!folder.name) continue

        // List files in each folder
        const { data: files, error: filesErr } = await supabase.storage
          .from(bucket)
          .list(folder.name, { limit: 1000 })

        if (filesErr || !files) continue

        const oldFiles = files.filter(f => {
          if (!f.created_at) return false
          return new Date(f.created_at) < thirtyDaysAgo
        })

        if (oldFiles.length > 0) {
          const paths = oldFiles.map(f => `${folder.name}/${f.name}`)
          const { error: delErr } = await supabase.storage
            .from(bucket)
            .remove(paths)

          if (delErr) {
            console.error(`Error deleting from ${bucket}:`, delErr)
          } else {
            totalDeleted += paths.length
            console.log(`Deleted ${paths.length} files from ${bucket}/${folder.name}`)
          }
        }
      }
    }

    console.log('Cleanup complete. Total files deleted:', totalDeleted)

    return new Response(JSON.stringify({ ok: true, deleted: totalDeleted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

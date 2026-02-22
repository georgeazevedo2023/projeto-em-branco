import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate auth - must be super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!

    // Verify user is super_admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Use service role for admin queries
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle()

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: Super Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { action, table_name } = await req.json()

    let result: any = null

    switch (action) {
      case 'list-tables': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              t.table_name,
              t.table_type,
              (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) as column_count
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'table-columns': {
        if (!table_name) throw new Error('table_name required')
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              column_name,
              data_type,
              udt_name,
              is_nullable,
              column_default,
              character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '${table_name.replace(/'/g, "''")}'
            ORDER BY ordinal_position
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'table-data': {
        if (!table_name) throw new Error('table_name required')
        const safeName = table_name.replace(/[^a-zA-Z0-9_]/g, '')
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `SELECT * FROM public."${safeName}" ORDER BY created_at DESC NULLS LAST LIMIT 10000`
        })
        if (error) throw error
        result = data
        break
      }

      case 'schema': {
        // Get all CREATE TABLE statements
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              t.table_name,
              string_agg(
                '  ' || c.column_name || ' ' || 
                CASE 
                  WHEN c.udt_name = 'uuid' THEN 'UUID'
                  WHEN c.udt_name = 'text' THEN 'TEXT'
                  WHEN c.udt_name = 'bool' THEN 'BOOLEAN'
                  WHEN c.udt_name = 'int4' THEN 'INTEGER'
                  WHEN c.udt_name = 'int8' THEN 'BIGINT'
                  WHEN c.udt_name = 'float8' THEN 'DOUBLE PRECISION'
                  WHEN c.udt_name = 'timestamptz' THEN 'TIMESTAMP WITH TIME ZONE'
                  WHEN c.udt_name = 'jsonb' THEN 'JSONB'
                  WHEN c.udt_name = 'json' THEN 'JSON'
                  WHEN c.udt_name = '_text' THEN 'TEXT[]'
                  WHEN c.udt_name = '_int4' THEN 'INTEGER[]'
                  WHEN c.udt_name = '_uuid' THEN 'UUID[]'
                  ELSE UPPER(c.udt_name)
                END ||
                CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
                CASE WHEN c.column_default IS NOT NULL THEN ' DEFAULT ' || c.column_default ELSE '' END,
                E',\n' ORDER BY c.ordinal_position
              ) as columns_def
            FROM information_schema.tables t
            JOIN information_schema.columns c ON c.table_schema = t.table_schema AND c.table_name = t.table_name
            WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
            GROUP BY t.table_name
            ORDER BY t.table_name
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'primary-keys': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              tc.table_name,
              string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as pk_columns
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
            GROUP BY tc.table_name
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'foreign-keys': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT
              tc.table_name,
              kcu.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name,
              tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
            ORDER BY tc.table_name
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'rls-policies': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              schemaname,
              tablename,
              policyname,
              permissive,
              roles,
              cmd,
              qual,
              with_check
            FROM pg_policies
            WHERE schemaname = 'public'
            ORDER BY tablename, policyname
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'db-functions': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              p.proname as function_name,
              pg_get_function_arguments(p.oid) as arguments,
              pg_get_function_result(p.oid) as return_type,
              pg_get_functiondef(p.oid) as definition
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
            AND p.prokind = 'f'
            ORDER BY p.proname
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'triggers': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              trigger_name,
              event_manipulation,
              event_object_table,
              action_timing,
              action_statement
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            ORDER BY event_object_table, trigger_name
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'enums': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              t.typname as enum_name,
              string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE n.nspname = 'public'
            GROUP BY t.typname
            ORDER BY t.typname
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'storage-buckets': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
            FROM storage.buckets
            ORDER BY name
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'storage-policies': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
            FROM pg_policies
            WHERE schemaname = 'storage'
            ORDER BY tablename, policyname
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'users-list': {
        const { data: { users: authUsers }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
        if (error) throw error
        result = (authUsers || []).map(u => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          email_confirmed_at: u.email_confirmed_at,
          phone: u.phone,
          role: u.role,
          user_metadata: u.user_metadata,
        }))
        break
      }

      case 'indexes': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              indexname,
              tablename,
              indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname
          `
        })
        if (error) throw error
        result = data
        break
      }

      case 'rls-status': {
        const { data, error } = await adminClient.rpc('exec_sql', {
          query: `
            SELECT 
              relname as table_name,
              relrowsecurity as rls_enabled,
              relforcerowsecurity as rls_forced
            FROM pg_class
            WHERE relnamespace = 'public'::regnamespace
            AND relkind = 'r'
            ORDER BY relname
          `
        })
        if (error) throw error
        result = data
        break
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Backup error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
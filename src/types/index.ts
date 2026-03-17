// ── Instance ─────────────────────────────────────────────────────────
/** Superset of all Instance shapes used across the project.
 *  Components pick only the fields they need. */
export interface Instance {
  id: string;
  name: string;
  status: string;
  token?: string;
  owner_jid?: string | null;
  profile_pic_url?: string | null;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  disabled?: boolean;
  user_profiles?: {
    full_name: string | null;
    email: string;
  };
}

// ── Inbox ────────────────────────────────────────────────────────────
export interface Inbox {
  id: string;
  name: string;
  instance_id: string;
  webhook_outgoing_url?: string | null;
  webhook_url?: string | null;
  created_by?: string;
  created_at?: string;
}

// ── Label ────────────────────────────────────────────────────────────
export interface Label {
  id: string;
  name: string;
  color: string;
  inbox_id: string;
}

// ── AI Summary ───────────────────────────────────────────────────────
export interface AiSummary {
  reason: string;
  summary: string;
  resolution: string;
  generated_at: string;
  message_count: number;
}

// ── Conversation ─────────────────────────────────────────────────────
export interface Conversation {
  id: string;
  inbox_id: string;
  contact_id: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  department_id: string | null;
  is_read: boolean;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  ai_summary?: AiSummary | null;
  contact?: {
    id: string;
    name: string | null;
    phone: string;
    jid: string;
    profile_pic_url: string | null;
  };
  inbox?: {
    id: string;
    name: string;
    instance_id: string;
    webhook_outgoing_url?: string | null;
  };
  last_message?: string;
  department_name?: string;
}

// ── Message ──────────────────────────────────────────────────────────
export interface Message {
  id: string;
  conversation_id: string;
  direction: string;
  content: string | null;
  media_type: string;
  media_url: string | null;
  sender_id: string | null;
  external_id: string | null;
  created_at: string;
  transcription?: string | null;
}

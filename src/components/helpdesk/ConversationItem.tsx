import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { smartDateBR } from '@/lib/dateUtils';
import { ConversationLabels, type Label } from './ConversationLabels';
import { UserCheck, StickyNote, Building2 } from 'lucide-react';
import type { Conversation } from '@/pages/dashboard/HelpDesk';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
  labels?: Label[];
  agentName?: string | null;
  hasNotes?: boolean;
}

const priorityColors: Record<string, string> = {
  alta: 'bg-destructive',
  media: 'bg-warning',
  baixa: 'bg-primary',
};

export const ConversationItem = ({ conversation, isSelected, onClick, labels = [], agentName, hasNotes }: ConversationItemProps) => {
  const contact = conversation.contact;
  const name = contact?.name || contact?.phone || 'Desconhecido';
  const initials = name.charAt(0).toUpperCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left pl-4 pr-5 py-3.5 min-h-[64px] flex items-start gap-3 transition-colors hover:bg-secondary/50 active:bg-secondary/70',
        isSelected && 'bg-primary/10 border-l-2 border-primary',
        !conversation.is_read && 'bg-secondary/30'
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="w-10 h-10">
          <AvatarImage src={contact?.profile_pic_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card',
            priorityColors[conversation.priority] || 'bg-muted'
          )}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-sm truncate', !conversation.is_read && 'font-bold')}>
            {name}
          </span>
          <span className="text-xs text-muted-foreground/80 shrink-0 tabular-nums">
            {conversation.last_message_at
              ? smartDateBR(conversation.last_message_at)
              : ''}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate flex-1">
            {conversation.last_message || conversation.inbox?.name || ''}
          </p>
          {!conversation.is_read && (
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          )}
        </div>

        {(labels.length > 0 || agentName || hasNotes || conversation.department_name) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {conversation.department_name && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-primary bg-primary/10 rounded px-1 py-0.5">
                <Building2 className="w-2.5 h-2.5" />
                {conversation.department_name}
              </span>
            )}
            {agentName && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-secondary/50 rounded px-1 py-0.5">
                <UserCheck className="w-2.5 h-2.5" />
                {agentName}
              </span>
            )}
            {hasNotes && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-warning bg-secondary/50 rounded px-1 py-0.5">
                <StickyNote className="w-2.5 h-2.5" />
                Nota
              </span>
            )}
            {labels.length > 0 && <ConversationLabels labels={labels} size="sm" />}
          </div>
        )}
      </div>
    </button>
  );
};

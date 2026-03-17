

## Plan: Extract `useBroadcastSend` hook from `BroadcastMessageForm`

### Problem
`BroadcastMessageForm.tsx` has 1713 lines. The sending logic alone (text/media/carousel send loops, scheduling, progress tracking, broadcast logging) accounts for ~1050 lines that are purely imperative and have no JSX dependency.

### Approach
Create `src/hooks/useBroadcastSend.ts` that encapsulates all send orchestration, progress state, pause/cancel control, timing, and scheduling. The component keeps only form state (message, media, carousel) and UI rendering.

### New file: `src/hooks/useBroadcastSend.ts` (~600 lines)

Extracts from the component:
- **Progress state** (`SendProgress`, `elapsedTime`, timer `useEffect`)
- **Pause/resume/cancel** refs and handlers (`isPausedRef`, `isCancelledRef`, `handlePause`, `handleResume`, `handleCancel`)
- **`saveBroadcastLog()`** function
- **`handleSendText()`**, **`handleSendMedia()`**, **`handleSendCarousel()`** -- the three send loops with cancellation/pause/dedup/helpdesk logic
- **`handleScheduleText()`**, **`handleScheduleMedia()`** -- scheduling inserts
- **Time calculations**: `getEstimatedTime()`, `getRemainingTime()`, `formatDuration()`
- **Helper**: `delay()`, `waitWhilePaused()`, `getGroupDelay()`

#### Hook signature

```typescript
interface UseBroadcastSendParams {
  instance: Instance;
  selectedGroups: Group[];
  excludeAdmins: boolean;
  randomDelay: 'none' | '5-10' | '10-20';
  uniqueRegularMembers: { jid: string; groupName: string }[];
  selectedParticipants: Set<string>;
  onComplete?: () => void;
}

interface SendTextParams { message: string }
interface SendMediaParams { 
  mediaData: string; mediaType: MediaType; caption: string; 
  isPtt: boolean; filename: string; mediaUrl: string;
}
interface SendCarouselParams { carouselData: CarouselData }

function useBroadcastSend(params: UseBroadcastSendParams): {
  progress: SendProgress;
  elapsedTime: number;
  remainingTime: number | null;
  estimatedTime: { min: number; max: number } | null;
  isSending: boolean;
  isScheduling: boolean;
  formatDuration: (s: number) => string;
  handlePause: () => void;
  handleResume: () => void;
  handleCancel: () => void;
  handleCloseProgress: () => void;
  sendText: (p: SendTextParams) => Promise<void>;
  sendMedia: (p: SendMediaParams) => Promise<void>;
  sendCarousel: (p: SendCarouselParams) => Promise<void>;
  scheduleText: (p: SendTextParams & { config: ScheduleConfig }) => Promise<void>;
  scheduleMedia: (p: SendMediaParams & { config: ScheduleConfig }) => Promise<void>;
}
```

### Modified: `src/components/broadcast/BroadcastMessageForm.tsx` (~550 lines, down from 1713)

Keeps only:
- Form state (message, mediaUrl, caption, carousel, file, etc.)
- Computed validations (`canSend`, `canSchedule`)
- Template select/save handlers
- The `handleSend` dispatcher that calls `hook.sendText({ message })` etc.
- JSX rendering (tabs, inputs, preview, controls, dialogs)

### Key decisions
- Send functions receive their data as parameters (not closures over component state) to keep the hook decoupled from form internals
- The hook owns `progress`, `elapsedTime`, pause/cancel -- the component just passes them through to `BroadcastProgressModal` and `BroadcastSendControls`
- No behavior change; pure structural refactor

### Result
- Component drops from **1713 to ~550 lines** (68% reduction)
- Send logic becomes independently testable
- Clear separation: form UI vs. send orchestration


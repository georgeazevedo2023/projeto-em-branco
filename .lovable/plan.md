

# Plan: Optimize Codebase with Reusable Components

## Analysis Summary

After exploring the codebase, I identified several major duplication patterns across ~20+ files. The biggest wins come from:

1. **Duplicated `CopyableId` component** — identical in `AdminPanel.tsx` and `DepartmentsTab.tsx`
2. **Duplicated `EmptyState` component** — defined inline in `AdminPanel.tsx`, pattern repeated elsewhere
3. **Duplicated `formatPhone` utility** — 6+ different implementations across files
4. **Duplicated `sendToNumber`/`sendMediaToNumber`/`sendCarouselToNumber`** — nearly identical in `BroadcastMessageForm.tsx` (2367 lines) and `LeadMessageForm.tsx` (1320 lines)
5. **Duplicated `saveBroadcastLog`** — identical logic in both broadcast forms
6. **Duplicated `InitialData` interface and constants** — same types/limits in both broadcast forms
7. **Repeated `supabase.auth.getSession()` + error pattern** — 26+ files with the same boilerplate

---

## Plan

### 1. Create shared `CopyableId` component
- **New file**: `src/components/shared/CopyableId.tsx`
- Extract from `AdminPanel.tsx` and `DepartmentsTab.tsx` (both have identical code)
- Remove inline definitions from both files and import the shared component
- **~80 lines saved**

### 2. Create shared `EmptyState` component
- **New file**: `src/components/shared/EmptyState.tsx`
- Extract from `AdminPanel.tsx` bottom
- Import in `AdminPanel.tsx` and anywhere else showing empty states
- **~30 lines saved**

### 3. Create shared `formatPhone` utility
- **Add to**: `src/lib/phoneUtils.ts`
- Consolidate the 6+ duplicated `formatPhone` / `formatPhoneDisplay` / `formatPhoneForDisplay` functions into one unified utility with variants
- Update imports in: `AdminPanel.tsx`, `DepartmentsTab.tsx`, `ManageUserInstancesDialog.tsx`, `InstanceGroups.tsx`, `GroupDetails.tsx`, `LeadImporter.tsx`, `ManageLeadDatabaseDialog.tsx`
- **~60 lines saved**

### 4. Create shared broadcast sender utilities
- **New file**: `src/lib/broadcastSender.ts`
- Extract `sendToNumber`, `sendMediaToNumber`, `sendCarouselToNumber` from both `BroadcastMessageForm.tsx` and `LeadMessageForm.tsx`
- Extract shared constants (`MAX_MESSAGE_LENGTH`, `MAX_FILE_SIZE`, `SEND_DELAY_MS`, `ALLOWED_*_TYPES`)
- Extract shared `InitialData` interface and `SendProgress`-like types
- Extract `saveBroadcastLog` into a shared function
- **~300+ lines saved** across the two largest files

### 5. Create `useAuthSession` hook
- **New file**: `src/hooks/useAuthSession.ts`
- Simple helper: `getAccessToken(): Promise<string>` that wraps `supabase.auth.getSession()` with standard error handling
- Replace the repeated pattern in 26+ files
- **~100+ lines saved**

---

## Estimated Impact

| Component | Files affected | Lines saved |
|-----------|---------------|-------------|
| CopyableId | 2 | ~80 |
| EmptyState | 1-2 | ~30 |
| formatPhone | 7 | ~60 |
| broadcastSender | 2 | ~300 |
| useAuthSession | 10+ | ~100 |
| **Total** | **~20 files** | **~570+ lines** |

### Files to create
- `src/components/shared/CopyableId.tsx`
- `src/components/shared/EmptyState.tsx`
- `src/lib/phoneUtils.ts`
- `src/lib/broadcastSender.ts`
- `src/hooks/useAuthSession.ts`

### Files to modify
- `src/pages/dashboard/AdminPanel.tsx` — remove CopyableId, EmptyState, formatPhone inlines
- `src/components/dashboard/DepartmentsTab.tsx` — remove CopyableId, formatPhone inlines
- `src/components/dashboard/ManageUserInstancesDialog.tsx` — use shared formatPhone
- `src/components/instance/InstanceGroups.tsx` — use shared formatPhone
- `src/pages/dashboard/GroupDetails.tsx` — use shared formatPhone
- `src/components/broadcast/LeadImporter.tsx` — use shared formatPhone
- `src/components/broadcast/ManageLeadDatabaseDialog.tsx` — use shared formatPhone
- `src/components/broadcast/BroadcastMessageForm.tsx` — use shared sender/types/constants
- `src/components/broadcast/LeadMessageForm.tsx` — use shared sender/types/constants


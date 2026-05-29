# Settings and Profile Bugfix Design

## Overview

The SlideBot application has seven functional gaps across its account management, error handling, and session lifecycle features. The UI pages exist but contain non-functional buttons (Save Changes, Change Avatar, Security actions), hardcoded mock data (Sessions tab, Security tab), silent error swallowing (workspace fetch, session:join), and incomplete logout cleanup. This design formalizes the bug conditions, defines the expected correct behavior, hypothesizes root causes based on code analysis, and outlines a targeted fix strategy that preserves all existing working functionality.

## Glossary

- **Bug_Condition (C)**: The set of conditions under which the application exhibits defective behavior — non-functional UI actions, silent errors, hardcoded data display, or incomplete state cleanup
- **Property (P)**: The desired correct behavior when the bug condition holds — API calls fire, errors surface to users, real data displays or placeholder states show, and logout fully clears state
- **Preservation**: Existing behaviors that must remain unchanged — workspace fetching when API is available, settings page toggles, settings sync, healthy socket sessions, navigation routing, and auth guards
- **AccountPage**: The component at `apps/web/src/features/account/pages/AccountPage.tsx` that renders Profile, Sessions, Security, and Workspaces tabs
- **AppLayout**: The layout component at `apps/web/src/shared/layouts/AppLayout.tsx` containing the sidebar with workspace fetching and logout
- **sessionManager**: The class at `apps/web/src/features/collaboration/lib/sessionManager.ts` managing presenter session lifecycle via socket events
- **authStore**: Zustand store at `apps/web/src/features/auth/store/authStore.ts` managing authentication state
- **settingsStore**: Zustand store with `persist` middleware at `apps/web/src/features/settings/store/settingsStore.ts` using localStorage key `slidebot-settings`
- **workspaceStore**: Zustand store at `apps/web/src/features/workspaces/store/workspaceStore.ts` managing workspace list state

## Bug Details

### Bug Condition

The bugs manifest across seven distinct scenarios where user interactions or system events trigger code paths that are either unimplemented, improperly handled, or use hardcoded data instead of real integrations.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type UserAction | SystemEvent
  OUTPUT: boolean
  
  RETURN (input.type == 'CLICK_SAVE_CHANGES' AND input.context == 'account_profile_tab')
         OR (input.type == 'API_UNAVAILABLE' AND input.context == 'workspace_fetch')
         OR (input.type == 'SOCKET_EVENT_FAILURE' AND input.event == 'session:join')
         OR (input.type == 'VIEW_TAB' AND input.tab == 'sessions')
         OR (input.type == 'VIEW_TAB' AND input.tab == 'security')
         OR (input.type == 'CLICK_CHANGE_AVATAR' AND input.context == 'account_profile_tab')
         OR (input.type == 'CLICK_LOGOUT' AND input.context == 'sidebar')
END FUNCTION
```

### Examples

- **Save Changes**: User edits display name to "John Doe", clicks "Save Changes" → nothing happens, no network request fires, page reload reverts the name
- **Workspace fetch error**: API server is down, sidebar loads → `console.error` fires silently, workspace switcher shows empty dropdown with no explanation to user
- **Session join failure**: User navigates to a room, Redis is unavailable → `joinPresenterSession` throws unhandled error at the `throw new Error(ack.error ?? 'session:join failed')` line, no UI feedback shown
- **Sessions tab**: User clicks "Sessions" tab → sees hardcoded "Mac OS • Chrome" and "iOS • Safari" entries regardless of actual sessions
- **Security tab**: User clicks "Security" tab → sees "Last changed 3 months ago" and "Not enabled" with non-functional "Update" and "Enable" buttons
- **Change Avatar**: User clicks "Change Avatar" button → `<Button variant="secondary">` has no `onClick` handler, nothing happens
- **Logout**: User clicks logout → Supabase signs out, `clearAuth()` resets auth store, but `slidebot-settings` localStorage key and workspace store state persist, causing stale data on next login

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Workspace fetching and display in sidebar when API is available and user is authenticated
- Settings page rendering with all categories (Appearance, Collaboration, Performance, Presenter Controls, Notifications, Accessibility)
- Settings toggle persistence to localStorage and server sync via 2-second debounce to `/api/v1/users/me/settings`
- Healthy socket session joining, presenter session lifecycle, slide navigation, and collaboration features
- Navigation routing between Dashboard, Account, and Settings pages
- AuthGuard redirect to login for unauthenticated users
- Account page tab switching between Profile, Sessions, Security, and Workspaces

**Scope:**
All inputs that do NOT match the bug condition should be completely unaffected by this fix. This includes:
- Normal workspace fetching when API responds successfully
- Settings page interactions (toggles, resets)
- Successful socket session joins and presenter operations
- Navigation between pages
- Authentication flow (login, signup, OAuth)
- Room viewing and collaboration when connection is healthy

## Hypothesized Root Cause

Based on code analysis, the root causes are:

1. **Save Changes - No onClick handler or API call**: The "Save Changes" `<Button>` in `AccountPage.tsx` has no `onClick` handler. The `<input>` uses `defaultValue` (uncontrolled) so there's no state tracking the edited value. No API endpoint exists for profile updates (only `/me/settings` exists in `users.router.ts`).

2. **Workspace fetch error - catch(console.error)**: In `AppLayout.tsx` line `listWorkspaces().then(setWorkspaces).catch(console.error)` — the error is caught and logged to console only. No error state is set in the workspace store, and no UI feedback mechanism exists.

3. **Session join failure - unhandled throw**: In `sessionManager.ts`, `joinPresenterSession` throws `new Error(ack.error ?? 'session:join failed')` when `!ack.ok`. The caller `ensureSession` does not catch this error, and no UI error state is propagated to the room component.

4. **Sessions tab - hardcoded JSX**: The sessions tab in `AccountPage.tsx` renders static JSX with hardcoded "Mac OS • Chrome" and "iOS • Safari" entries. No API call or data fetching exists.

5. **Security tab - hardcoded JSX with no handlers**: The security tab renders static "Last changed 3 months ago" and "Not enabled" text. The "Update" and "Enable" buttons have no `onClick` handlers and no integration with Supabase auth management.

6. **Change Avatar - no onClick handler**: The `<Button variant="secondary">Change Avatar</Button>` has no `onClick` prop, no hidden file input, and no upload logic.

7. **Logout - incomplete cleanup**: The `signOut` function in `useAuth.ts` calls `supabase.auth.signOut()` and `clearAuth()` but does not clear the persisted zustand stores. The `settingsStore` uses `persist` middleware with key `slidebot-settings` which remains in localStorage. The `workspaceStore` retains in-memory state.

## Correctness Properties

Property 1: Bug Condition - Profile Save Persists Display Name

_For any_ user action where the user edits the display name field and clicks "Save Changes" on the Account profile tab, the fixed system SHALL make an API call to persist the updated display name, update the auth store with the new value, and provide visual feedback (success/error) to the user.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Workspace Fetch Error Shows User Feedback

_For any_ system event where the API is unavailable during workspace fetching in the AppLayout sidebar, the fixed system SHALL display a non-intrusive error indicator informing the user that workspaces could not be loaded and offer a retry mechanism.

**Validates: Requirements 2.2**

Property 3: Bug Condition - Session Join Failure Shows Error UI

_For any_ socket event where `session:join` fails (returns `!ack.ok` or throws), the fixed system SHALL catch the error, display a user-friendly message in the room UI explaining the connection issue, and offer "Retry" or "Go to Dashboard" actions.

**Validates: Requirements 2.3**

Property 4: Bug Condition - Sessions Tab Shows Real or Placeholder State

_For any_ user action where the user views the Account "Sessions" tab, the fixed system SHALL either fetch real session data from the backend or clearly indicate that session management is not yet available with an appropriate placeholder state.

**Validates: Requirements 2.4**

Property 5: Bug Condition - Security Tab Shows Coming Soon State

_For any_ user action where the user views the Account "Security" tab, the fixed system SHALL either connect to real password/2FA management via Supabase or clearly indicate these features are coming soon with visually disabled buttons.

**Validates: Requirements 2.5**

Property 6: Bug Condition - Change Avatar Opens File Picker

_For any_ user action where the user clicks "Change Avatar" on the Account profile tab, the fixed system SHALL open a file picker, allow image selection, upload the file, and update the avatar URL in the user's profile.

**Validates: Requirements 2.6**

Property 7: Bug Condition - Logout Clears All Local State

_For any_ user action where the user clicks the logout button, the fixed system SHALL sign out via Supabase, clear all local storage caches (settings store persisted state, workspace store state, any other persisted zustand state), and redirect to the login page with a clean state.

**Validates: Requirements 2.7**

Property 8: Preservation - Existing Functionality Unchanged

_For any_ input where the bug condition does NOT hold (API is available, socket is healthy, user interacts with settings page, navigates between pages, or uses collaboration features), the fixed system SHALL produce exactly the same behavior as the original system, preserving workspace display, settings persistence, session lifecycle, routing, and auth guards.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

**File**: `apps/web/src/features/account/pages/AccountPage.tsx`

**Specific Changes**:
1. **Profile Save Implementation**: Add controlled state for display name input, add `onClick` handler to "Save Changes" button that calls a new API endpoint (e.g., `PUT /api/v1/users/me/profile`), update auth store on success, show toast feedback
2. **Change Avatar Implementation**: Add hidden `<input type="file" accept="image/*">` element, wire "Change Avatar" button to trigger file input click, implement upload to storage (Supabase Storage or API endpoint), update avatar URL in auth store
3. **Sessions Tab - Placeholder State**: Replace hardcoded mock data with a "Coming Soon" placeholder UI that clearly communicates the feature is not yet available, remove fake session entries
4. **Security Tab - Coming Soon State**: Replace hardcoded mock data with a "Coming Soon" placeholder, disable buttons visually with tooltip explaining unavailability, remove fake "Last changed 3 months ago" text

**File**: `apps/web/src/shared/layouts/AppLayout.tsx`

**Specific Changes**:
5. **Workspace Fetch Error Handling**: Replace `.catch(console.error)` with proper error handling that sets an error state in workspace store (add `error` field), display inline error message in workspace switcher area with a retry button

**File**: `apps/web/src/features/workspaces/store/workspaceStore.ts`

**Specific Changes**:
6. **Add Error State**: Add `error: string | null` field and `setError` action to the workspace store to support error display in the sidebar

**File**: `apps/web/src/features/collaboration/lib/sessionManager.ts`

**Specific Changes**:
7. **Session Join Error Handling**: Wrap the `throw new Error(...)` in `joinPresenterSession` with proper error propagation to a UI-visible store (e.g., `syncStore.setConnectionStatus('error')` is already called, but the thrown error needs to be caught in `ensureSession` and surfaced to the room component with a user-friendly message and retry/navigate actions)

**File**: `apps/web/src/features/auth/hooks/useAuth.ts`

**Specific Changes**:
8. **Logout Cleanup**: Extend `signOut` to clear localStorage keys used by persisted zustand stores (`slidebot-settings` and any others), reset workspace store, and call `sessionManager.resetForLogout()` before navigating to login

**File**: `apps/api/src/modules/users/users.router.ts`

**Specific Changes**:
9. **Profile Update Endpoint**: Add `PUT /me/profile` endpoint that accepts `{ displayName, avatarUrl }` and updates the user's Supabase metadata or a local profile table
10. **Avatar Upload Endpoint**: Add `POST /me/avatar` endpoint that accepts multipart file upload, stores the image, and returns the URL

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate user interactions and system events for each bug scenario. Run these tests on the UNFIXED code to observe failures and confirm root causes.

**Test Cases**:
1. **Profile Save Test**: Simulate clicking "Save Changes" and assert an API call is made (will fail on unfixed code — no handler exists)
2. **Workspace Fetch Error Test**: Mock API failure and assert error UI appears in sidebar (will fail on unfixed code — only console.error fires)
3. **Session Join Failure Test**: Mock socket `session:join` returning `{ ok: false }` and assert error UI appears in room (will fail on unfixed code — unhandled throw)
4. **Sessions Tab Data Test**: Render Sessions tab and assert it does NOT contain hardcoded "Mac OS • Chrome" text (will fail on unfixed code)
5. **Security Tab Buttons Test**: Render Security tab and assert buttons are either functional or visually disabled with explanation (will fail on unfixed code)
6. **Avatar Button Test**: Simulate clicking "Change Avatar" and assert file picker opens (will fail on unfixed code — no handler)
7. **Logout Cleanup Test**: Simulate logout and assert localStorage is cleared (will fail on unfixed code — localStorage persists)

**Expected Counterexamples**:
- No network request fires when "Save Changes" is clicked
- No error UI appears when workspace fetch fails
- Unhandled error thrown when session:join fails
- Hardcoded mock data renders regardless of actual state
- Possible causes: missing onClick handlers, catch(console.error) pattern, unhandled promise rejection, static JSX without data fetching

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := executeFixedCode(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalBehavior(input) = fixedBehavior(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for settings interactions, workspace display, navigation, and session lifecycle, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Settings Persistence Preservation**: Verify settings toggles continue to persist to localStorage and sync to server after 2-second debounce
2. **Workspace Display Preservation**: Verify workspaces load and display correctly in sidebar when API is available
3. **Navigation Preservation**: Verify routing between Dashboard, Account, Settings continues working
4. **Session Lifecycle Preservation**: Verify healthy socket sessions join successfully and presenter features work
5. **Auth Guard Preservation**: Verify unauthenticated users are redirected to login

### Unit Tests

- Test profile save handler makes correct API call with updated display name
- Test avatar upload triggers file picker and handles upload response
- Test workspace store error state is set on fetch failure and cleared on retry success
- Test session join error is caught and propagated to UI store
- Test logout clears all localStorage keys and resets stores
- Test Sessions tab renders placeholder state instead of mock data
- Test Security tab renders coming-soon state with disabled buttons

### Property-Based Tests

- Generate random settings configurations and verify they persist correctly after fix (preservation)
- Generate random workspace lists and verify they display correctly when API succeeds (preservation)
- Generate random display name strings and verify profile save API call is made with correct payload (fix checking)
- Generate random error scenarios for workspace fetch and verify error UI always appears (fix checking)

### Integration Tests

- Test full profile edit flow: edit name → save → verify API call → verify store update → verify UI reflects new name
- Test full avatar flow: click change → select file → upload → verify avatar updates
- Test workspace error recovery: API down → error shown → API recovers → retry → workspaces display
- Test session join error recovery: socket fails → error UI → retry → successful join
- Test full logout flow: click logout → verify Supabase signOut → verify localStorage cleared → verify redirect to login → verify next login has clean state

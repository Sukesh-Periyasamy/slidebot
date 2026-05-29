# Implementation Plan

## Overview

This plan fixes seven functional gaps in the SlideBot settings, profile, and account management features using the bug condition methodology. The workflow follows: (1) write exploration tests to confirm bugs exist, (2) write preservation tests to capture existing correct behavior, (3) implement fixes, (4) verify all tests pass.

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Settings and Profile Non-Functional UI Actions
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the seven bugs exist
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases for each bug condition
  - Bug Condition from design: `isBugCondition(input)` returns true when:
    - `input.type == 'CLICK_SAVE_CHANGES' AND input.context == 'account_profile_tab'`
    - `input.type == 'API_UNAVAILABLE' AND input.context == 'workspace_fetch'`
    - `input.type == 'SOCKET_EVENT_FAILURE' AND input.event == 'session:join'`
    - `input.type == 'VIEW_TAB' AND input.tab == 'sessions'`
    - `input.type == 'VIEW_TAB' AND input.tab == 'security'`
    - `input.type == 'CLICK_CHANGE_AVATAR' AND input.context == 'account_profile_tab'`
    - `input.type == 'CLICK_LOGOUT' AND input.context == 'sidebar'`
  - Test assertions (Expected Behavior):
    - Profile Save: clicking "Save Changes" triggers an API call to persist display name
    - Workspace Fetch Error: when API fails, error UI with retry is shown (not just console.error)
    - Session Join Failure: when session:join fails, error UI appears in room (no unhandled throw)
    - Sessions Tab: does NOT render hardcoded "Mac OS • Chrome" mock data
    - Security Tab: buttons are disabled with "Coming Soon" state (not fake functional buttons)
    - Change Avatar: clicking "Change Avatar" triggers a file picker
    - Logout: clicking logout clears localStorage keys (`slidebot-settings`) and resets stores
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples found:
    - No network request fires when "Save Changes" is clicked (missing onClick handler)
    - No error UI appears when workspace fetch fails (catch(console.error) pattern)
    - Unhandled error thrown when session:join fails (no try/catch in ensureSession)
    - Hardcoded mock data renders in Sessions and Security tabs
    - No file picker opens on "Change Avatar" click (missing onClick handler)
    - localStorage `slidebot-settings` key persists after logout
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Settings, Workspace, Navigation, and Session Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (cases where isBugCondition returns false):
    - Observe: Settings page renders all categories (Appearance, Collaboration, Performance, Presenter Controls, Notifications, Accessibility) with functional toggles
    - Observe: Settings toggles persist to localStorage and sync to server via 2-second debounce to `/api/v1/users/me/settings`
    - Observe: Workspaces load and display correctly in sidebar when API is available
    - Observe: Navigation between Dashboard, Account, Settings routes correctly within AuthGuard
    - Observe: Healthy socket sessions join successfully via sessionManager
    - Observe: AuthGuard redirects unauthenticated users to login page
    - Observe: Account page tab switching between Profile, Sessions, Security, Workspaces works
  - Write property-based tests capturing observed behavior patterns:
    - For all valid settings configurations, toggling a setting persists it to localStorage
    - For all successful API responses with workspace lists, workspaces display in sidebar
    - For all authenticated navigation actions, routing resolves to correct page
    - For all healthy socket connections with `ack.ok === true`, session joins succeed without error
    - For all unauthenticated route visits, redirect to login occurs
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Implement Profile Save with controlled state, API call, and feedback
  - Add `useState` for display name (controlled input replacing `defaultValue`)
  - Add `onClick` handler to "Save Changes" button
  - Call `PUT /api/v1/users/me/profile` with `{ displayName }` payload
  - Update auth store with new display name on success
  - Show success/error toast feedback to user
  - _Bug_Condition: isBugCondition(input) where input.type == 'CLICK_SAVE_CHANGES' AND input.context == 'account_profile_tab'_
  - _Expected_Behavior: API call fires, auth store updates, visual feedback shown_
  - _Preservation: Settings page toggles, navigation, and auth guards unchanged_
  - _Requirements: 2.1_

- [ ] 4. Implement Workspace Fetch Error handling with error state and retry UI
  - Add `error: string | null` field and `setError` action to `workspaceStore.ts`
  - Replace `.catch(console.error)` in `AppLayout.tsx` with `.catch((err) => { setError(err.message) })`
  - Display inline error message in workspace switcher area when error state is set
  - Add retry button that re-triggers `listWorkspaces()` and clears error on success
  - _Bug_Condition: isBugCondition(input) where input.type == 'API_UNAVAILABLE' AND input.context == 'workspace_fetch'_
  - _Expected_Behavior: Error UI with retry shown instead of silent console.error_
  - _Preservation: Workspace fetching when API is available continues to work unchanged_
  - _Requirements: 2.2_

- [ ] 5. Implement Session Join Failure error handling with UI feedback
  - Wrap `joinPresenterSession` call in `ensureSession` with try/catch
  - On catch, set connection error state (e.g., `syncStore.setConnectionStatus('error')` with message)
  - Surface error to room UI component with user-friendly message
  - Offer "Retry" and "Go to Dashboard" action buttons in error state
  - _Bug_Condition: isBugCondition(input) where input.type == 'SOCKET_EVENT_FAILURE' AND input.event == 'session:join'_
  - _Expected_Behavior: Error caught, user-friendly message shown, retry/navigate actions available_
  - _Preservation: Healthy socket sessions continue to join successfully_
  - _Requirements: 2.3_

- [ ] 6. Replace Sessions Tab hardcoded mock data with "Coming Soon" placeholder
  - Remove hardcoded "Mac OS • Chrome" and "iOS • Safari" session entries
  - Add "Coming Soon" placeholder UI with appropriate icon and messaging
  - Communicate clearly that session management is not yet available
  - _Bug_Condition: isBugCondition(input) where input.type == 'VIEW_TAB' AND input.tab == 'sessions'_
  - _Expected_Behavior: Placeholder state shown instead of fake session data_
  - _Preservation: Tab switching continues to work, other tabs unaffected_
  - _Requirements: 2.4_

- [ ] 7. Replace Security Tab hardcoded mock data with disabled buttons and "Coming Soon" state
  - Remove hardcoded "Last changed 3 months ago" and "Not enabled" text
  - Add "Coming Soon" placeholder state for password and 2FA sections
  - Disable "Update" and "Enable" buttons visually with tooltip explaining unavailability
  - _Bug_Condition: isBugCondition(input) where input.type == 'VIEW_TAB' AND input.tab == 'security'_
  - _Expected_Behavior: Coming-soon state with disabled buttons shown instead of fake functional UI_
  - _Preservation: Tab switching continues to work, other tabs unaffected_
  - _Requirements: 2.5_

- [ ] 8. Implement Change Avatar with file input, upload logic, and avatar URL update
  - Add hidden `<input type="file" accept="image/*" ref={fileInputRef}>` element
  - Wire "Change Avatar" button `onClick` to trigger `fileInputRef.current.click()`
  - On file selection, upload to `POST /api/v1/users/me/avatar` endpoint
  - Update avatar URL in auth store on successful upload
  - Show loading state during upload and error feedback on failure
  - _Bug_Condition: isBugCondition(input) where input.type == 'CLICK_CHANGE_AVATAR' AND input.context == 'account_profile_tab'_
  - _Expected_Behavior: File picker opens, image uploads, avatar URL updates_
  - _Preservation: Profile tab layout and other buttons unchanged_
  - _Requirements: 2.6_

- [ ] 9. Implement Logout Cleanup to clear localStorage and reset all stores
  - In `useAuth.ts` `signOut` function, add `localStorage.removeItem('slidebot-settings')` before navigation
  - Reset workspace store state (call `useWorkspaceStore.getState().reset()` or equivalent)
  - Clear any other persisted zustand store keys from localStorage
  - Ensure redirect to login page happens after cleanup
  - _Bug_Condition: isBugCondition(input) where input.type == 'CLICK_LOGOUT' AND input.context == 'sidebar'_
  - _Expected_Behavior: Supabase signs out, all localStorage cleared, stores reset, redirect to login_
  - _Preservation: Auth guard redirect behavior unchanged, login flow unchanged_
  - _Requirements: 2.7_

- [ ] 10. Add Profile Update API endpoint (`PUT /me/profile`)
  - Add route handler in `users.router.ts` for `PUT /me/profile`
  - Accept `{ displayName, avatarUrl }` in request body
  - Validate input (displayName length, avatarUrl format)
  - Update user metadata in Supabase or local profile table
  - Return updated profile data in response
  - _Requirements: 2.1, 2.6_

- [ ] 11. Add Avatar Upload API endpoint (`POST /me/avatar`)
  - Add route handler in `users.router.ts` for `POST /me/avatar`
  - Accept multipart file upload (image files only)
  - Validate file type and size constraints
  - Store image in Supabase Storage or configured storage backend
  - Return the public URL of the uploaded avatar
  - _Requirements: 2.6_

- [ ] 12. Verify bug condition exploration test now passes
  - **Property 1: Expected Behavior** - Settings and Profile Non-Functional UI Actions
  - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
  - The test from task 1 encodes the expected behavior
  - When this test passes, it confirms the expected behavior is satisfied for all seven bugs
  - Run bug condition exploration test from step 1
  - **EXPECTED OUTCOME**: Test PASSES (confirms all bugs are fixed)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ] 13. Verify preservation tests still pass
  - **Property 2: Preservation** - Existing Settings, Workspace, Navigation, and Session Behavior
  - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
  - Run preservation property tests from step 2
  - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
  - Confirm all tests still pass after fix (no regressions introduced)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 14. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm all exploration and preservation tests pass
  - Verify no TypeScript compilation errors across modified files
  - Verify no lint errors in modified files
  - Ensure all tests pass, ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    ["1", "2"],
    ["3", "4", "5", "6", "7", "8", "9", "10", "11"],
    ["12", "13"],
    ["14"]
  ]
}
```

## Notes

- Tasks 1 and 2 are independent and can be worked on in parallel
- All implementation tasks (3-11) depend on tasks 1 and 2 being complete
- Implementation tasks 3-11 can be worked on in parallel with each other
- Verification tasks 12 and 13 must run after ALL implementation tasks are complete
- The checkpoint (task 14) is the final gate before the fix is considered done
- Files modified: `AccountPage.tsx`, `AppLayout.tsx`, `workspaceStore.ts`, `sessionManager.ts`, `useAuth.ts`, `users.router.ts`

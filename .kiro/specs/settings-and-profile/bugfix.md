# Bugfix Requirements Document

## Introduction

The SlideBot application has several functional gaps in its settings, profile, and account management features. While the UI pages exist (Settings at `/settings`, Account at `/account`, and logout in the sidebar), they contain non-functional elements, missing error handling, and hardcoded mock data. Additionally, console errors cascade when the API is unavailable because the frontend lacks graceful degradation for workspace fetching and session joining failures.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user clicks "Save Changes" on the Account profile tab THEN the system does nothing — no API call is made and the display name change is lost on page reload

1.2 WHEN the API server is unavailable and the AppLayout sidebar loads THEN the system silently swallows the workspace fetch error via `console.error` with no user-facing feedback, leaving the workspace switcher empty

1.3 WHEN the user navigates to a room and the `session:join` socket event fails (e.g., API/Redis unavailable) THEN the system throws an unhandled error at sessionManager.ts:564 with no user-friendly error message displayed

1.4 WHEN the user views the Account "Sessions" tab THEN the system displays hardcoded mock session data (Mac OS Chrome, iOS Safari) that does not reflect actual active sessions

1.5 WHEN the user views the Account "Security" tab THEN the system displays hardcoded mock data (password last changed, 2FA status) with non-functional "Update" and "Enable" buttons

1.6 WHEN the user clicks "Change Avatar" on the Account profile tab THEN the system does nothing — no file picker opens and no upload occurs

1.7 WHEN the user clicks the logout button in the sidebar THEN the system signs out via Supabase but does not clear local storage caches (settings, workspace state) potentially leaving stale data for the next login

### Expected Behavior (Correct)

2.1 WHEN the user clicks "Save Changes" on the Account profile tab THEN the system SHALL persist the updated display name to the backend via an API call and update the auth store with the new value

2.2 WHEN the API server is unavailable and the AppLayout sidebar loads THEN the system SHALL display a non-intrusive error indicator (e.g., toast or inline message) informing the user that workspaces could not be loaded, and offer a retry option

2.3 WHEN the `session:join` socket event fails THEN the system SHALL display a user-friendly error message in the room UI explaining the connection issue and offer a "Retry" or "Go to Dashboard" action instead of an unhandled exception

2.4 WHEN the user views the Account "Sessions" tab THEN the system SHALL either fetch real session data from the backend or clearly indicate that session management is not yet available (placeholder state)

2.5 WHEN the user views the Account "Security" tab THEN the system SHALL either connect to real password/2FA management via Supabase or clearly indicate these features are coming soon with disabled buttons

2.6 WHEN the user clicks "Change Avatar" on the Account profile tab THEN the system SHALL open a file picker allowing the user to select an image, upload it, and update their avatar URL in the profile

2.7 WHEN the user clicks the logout button THEN the system SHALL sign out via Supabase, clear all local storage caches (settings store, workspace store, any persisted zustand state), and redirect to the login page with a clean state

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the API server is available and the user is authenticated THEN the system SHALL CONTINUE TO fetch and display workspaces in the sidebar switcher correctly

3.2 WHEN the user navigates to the Settings page THEN the system SHALL CONTINUE TO display all settings categories (Appearance, Collaboration, Performance, Presenter Controls, Notifications, Accessibility) with functional toggles that persist to local storage

3.3 WHEN the user changes a setting on the Settings page THEN the system SHALL CONTINUE TO sync the updated settings to the server via the `/api/v1/users/me/settings` endpoint after a 2-second debounce

3.4 WHEN the user is in a room and the socket connection is healthy THEN the system SHALL CONTINUE TO successfully join the presenter session and display the presentation without errors

3.5 WHEN the user clicks navigation links in the sidebar (Dashboard, Account, Settings) THEN the system SHALL CONTINUE TO route to the correct pages within the AuthGuard-protected layout

3.6 WHEN the user is unauthenticated and visits a protected route THEN the system SHALL CONTINUE TO redirect to the login page via the AuthGuard component

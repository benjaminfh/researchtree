# UI Loading Indicators Scope

Checklist of user actions that trigger network requests, state changes, or navigation.
Use this as the implementation scope for spinners/loading states.

## Auth / Login / Password
- [ ] Sign in submit (server action, spinner) `app/login/LoginForm.tsx`
- [ ] Sign up submit (server action, spinner) `app/login/LoginForm.tsx`
- [ ] Forgot password link (navigation, spinner) `app/login/LoginForm.tsx`
- [ ] Request reset link submit (server action, spinner) `app/forgot-password/ForgotPasswordForm.tsx`
- [ ] Reset password submit (server action, spinner) `app/reset-password/ResetPasswordForm.tsx`
- [ ] Back to sign in links (navigation, spinner) `app/forgot-password/ForgotPasswordForm.tsx`, `app/reset-password/ResetPasswordForm.tsx`
- [ ] Check email "Back to sign in" link (navigation, spinner) `app/check-email/page.tsx`
- [ ] Waitlist "Request access" submit (server action, spinner) `app/waitlist/page.tsx`
- [ ] Waitlist "Apply access code" submit (server action, spinner) `app/waitlist/page.tsx`
- [ ] Waitlist "Back to sign in" link (navigation, spinner) `app/waitlist/page.tsx`

## Admin Waitlist
- [ ] Approve email submit (server action, spinner) `app/admin/waitlist/ApproveEmailForm.tsx`
- [ ] Approve pending request submit (server action, spinner) `app/admin/waitlist/page.tsx`
- [ ] Remove allowlisted email submit (server action, spinner) `app/admin/waitlist/page.tsx`

## Global Rail / Auth Popover
- [o] Rail collapse/expand (local state) `src/components/layout/RailLayout.tsx`
- [ ] Rail home link (navigation, spinner) `src/components/layout/RailLayout.tsx`
- [o] Account popover open/close (local state) `src/components/auth/AuthRailStatus.tsx`
- [ ] Sign out submit (server action, spinner) `src/components/auth/AuthRailStatus.tsx`
- [ ] Profile link (navigation, spinner) `src/components/auth/AuthRailStatus.tsx`
- [ ] AuthStatusPill sign out submit (server action, spinner) `src/components/auth/AuthStatusPill.tsx`

## Home Page
- [ ] Create workspace submit (client fetch, spinner) `src/components/projects/CreateProjectForm.tsx`
- [ ] Open project tile (navigation, spinner) `src/components/home/HomePageContent.tsx`
- [o] Archive/unarchive project (local state + localStorage) `src/components/home/HomePageContent.tsx`
- [ ] Token prompt "Go to Profile" (navigation, spinner) `src/components/home/HomePageContent.tsx`

## Projects List (if used)
- [o] Show/hide list toggle (local state) `src/components/projects/ProjectsList.tsx`
- [ ] Open workspace (navigation, spinner) `src/components/projects/ProjectsList.tsx`
- [o] Archive/Unarchive (local state) `src/components/projects/ProjectsList.tsx`

## Profile
- [ ] Save tokens (client fetch, spinner) `src/components/profile/ProfilePageClient.tsx`
- [o] Clear token buttons (local state) `src/components/profile/ProfilePageClient.tsx`
- [ ] Update password (client fetch, spinner) `src/components/profile/ProfilePageClient.tsx`

## Workspace / Project Detail
- [ ] Send message submit (streaming request, spinner) `src/components/workspace/WorkspaceClient.tsx`
- [o] Stop streaming (local state/abort) `src/components/workspace/WorkspaceClient.tsx`
- [o] Toggle thinking menu + select thinking (local state) `src/components/workspace/WorkspaceClient.tsx`
- [o] Toggle web search (local state + localStorage) `src/components/workspace/WorkspaceClient.tsx`
- [ ] Switch branch (client fetch, loading mocks) `src/components/workspace/WorkspaceClient.tsx`
- [ ] Create branch (client fetch, spinner + loading mocks) `src/components/workspace/WorkspaceClient.tsx`
- [ ] Edit message flow submit (client fetch, spinner + loading mocks) `src/components/workspace/WorkspaceClient.tsx`
- [ ] Merge modal open (client fetch for preview, loading mocks) `src/components/workspace/WorkspaceClient.tsx`
- [ ] Merge submit (client fetch + branch switch, spinner + loading mocks) `src/components/workspace/WorkspaceClient.tsx`
- [ ] Pin canvas diff to context (client fetch, spinner) `src/components/workspace/WorkspaceClient.tsx`
- [ ] Star/unstar message (client fetch, spinner) `src/components/workspace/WorkspaceClient.tsx`
- [o] Insights panel expand/collapse + tab switch (local state) `src/components/workspace/WorkspaceClient.tsx`
- [o] Graph mode switch + legend toggle (local state) `src/components/workspace/WorkspaceGraph.tsx`

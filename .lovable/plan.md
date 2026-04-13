

# Fix GSC OAuth Redirect URI Mismatch

## Problem
Google is rejecting the OAuth request because the redirect URIs your app sends don't match what's configured in your Google Cloud Console credentials.

Your app dynamically builds the redirect URI from `window.location.origin`, which produces different URLs depending on where you access the app:
- **Published**: `https://rank-radar-fec.lovable.app/`
- **Lovable preview**: `https://id-preview--8dea06cd-a816-4e6e-bf51-2eb81621f466.lovable.app/`

## Fix — Two parts

### 1. Update Google Cloud Console (you do this manually)
Go to **Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID → Edit**.

Under **Authorized redirect URIs**, add ALL of these:
- `https://rank-radar-fec.lovable.app`
- `https://id-preview--8dea06cd-a816-4e6e-bf51-2eb81621f466.lovable.app`

If you previously had a different URI there (like just the preview URL), keep it or replace it with both above.

Also under **Authorized JavaScript origins**, add:
- `https://rank-radar-fec.lovable.app`
- `https://id-preview--8dea06cd-a816-4e6e-bf51-2eb81621f466.lovable.app`

Save the credentials. Changes take effect within a few minutes.

### 2. Small code fix — ensure clean redirect URI (no trailing path)
The current code uses `window.location.origin + window.location.pathname` which could produce URIs like `https://rank-radar-fec.lovable.app/` with a trailing slash, or with query params in the path. I'll update it to use just `window.location.origin` to keep it clean and consistent with what's registered in Google.

**File**: `src/components/dashboard/SettingsTab.tsx`
- Line 61: Change `redirect_uri` from `${window.location.origin}${window.location.pathname}` to `window.location.origin`
- Line 83: Same change

### No edge function changes needed
The edge function correctly passes through whatever `redirect_uri` the client sends.

## Summary
The code change is trivial (2 lines). The main fix is adding both URLs to your Google Cloud Console credentials.


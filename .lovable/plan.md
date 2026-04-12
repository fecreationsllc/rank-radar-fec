

# Fix: Add "Add Client" button to the empty state

## Problem
You're logged in and see the "No clients yet" screen, but there's no obvious button to add your first client. The sidebar is rendering on the left with the "+ Add Client" button, but it may be hard to notice. More importantly, the empty state in the main content area should have a clear call-to-action button.

## Solution
Add an "Add your first client" button directly in the empty state message (the center of the screen), so you can click it right away without needing to find the sidebar button.

## Changes
**File: `src/pages/Index.tsx`**
- Add a "Add Client" button below the "Add your first client to start tracking rankings" text in the empty state
- The button will open the same AddClientModal

This is a small, single-file change.




# Add delete client functionality to sidebar

## Problem
No way to remove clients from the sidebar currently.

## Solution
Add a right-click context menu (or a small trash icon on hover) to each client in the sidebar, with a confirmation dialog before deleting. Deleting will remove the client and all related data (keywords, rank_history, etc.) from the database.

## Changes

### 1. `src/components/dashboard/ClientSidebar.tsx`
- Add a `Trash2` icon button that appears on hover for each client row
- Add an `AlertDialog` confirmation ("Delete client X? This will remove all keywords, rankings, and history.")
- Accept a new `onDeleteClient` prop
- On confirm, call `onDeleteClient(clientId)`

### 2. `src/pages/Index.tsx`
- Add a `handleDeleteClient` function that:
  - Deletes related rows (rank_history via keywords, keywords, client_cities, competitors, seo_suggestions) then the client itself from Supabase
  - Calls `refetchClients()`
  - If the deleted client was selected, resets selection
- Pass `onDeleteClient` to `ClientSidebar`

### Technical note
Since there are no foreign key cascades set up, we'll delete dependent records manually in order: rank_history (by keyword_ids), keywords, client_cities, competitors, seo_suggestions, then the client.


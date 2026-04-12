

# Add city search to Settings tab

## What it does
Adds a city search input to the Cities card in the Settings tab, reusing the same debounced `dataforseo-locations` edge function call pattern from `AddClientModal`. Users can search, select, and add new cities to an existing client.

## Changes

### `src/components/dashboard/SettingsTab.tsx`

1. **Add city search state** — `citySearch`, `cityResults`, `searching`, and a `searchTimeout` ref (same pattern as `AddClientModal`)

2. **Add debounced search handler** — `handleCitySearch(query)` with 300ms debounce, calling the `dataforseo-locations` edge function

3. **Add city to client** — `handleAddCity(location)` inserts into `client_cities` table with the client's ID, then refetches cities and clears search

4. **UI in the Cities card** — Add a search input with `Search` icon below the existing city list. Show a dropdown of results (with `Loader2` spinner while searching, "No cities found" when empty). Clicking a result adds it. Filter out cities already added.

5. **New imports** — `useRef` from React, `Search`, `Loader2` from lucide-react

No backend or edge function changes needed — reuses the existing `dataforseo-locations` function.


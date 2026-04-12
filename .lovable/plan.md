

# Fix city search autocomplete with debouncing

## Problem
The city search calls the edge function on every keystroke after 3 characters. Without debouncing, rapid typing fires multiple concurrent requests that can race and overwrite each other, making suggestions appear unreliable or missing.

## Solution
Add a debounce (300ms) to the city search input so the API call only fires after the user pauses typing. Also show a loading indicator while searching.

### Changes to `src/components/dashboard/AddClientModal.tsx`

1. **Add debounced search** — use a `useRef` timer to debounce `handleCitySearch` by 300ms. Each keystroke resets the timer; the API call only fires once typing pauses.

2. **Show loading state** — display a `Loader2` spinner inside the dropdown while `searching` is true, so the user knows results are loading.

3. **Show "No results" message** — when the search completes with 0 results and query length ≥ 3, show "No cities found" so the user knows the search worked.

No edge function changes needed — the API is working correctly.


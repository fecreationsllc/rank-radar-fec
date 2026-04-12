
Fix the sidebar button contrast by correcting the sidebar color token usage and overriding the button’s hover text color.

What’s actually wrong
- The sidebar in `src/pages/Index.tsx` uses `bg-sidebar-background`, but the Tailwind color that exists in `tailwind.config.ts` is `bg-sidebar`.
- The button in `src/components/dashboard/ClientSidebar.tsx` uses the shared `outline` variant, which includes `hover:text-accent-foreground`. On hover, that turns the text dark while the button background is also dark, so the label looks invisible.
- The screenshots match this exactly: washed-out/default text before hover, then dark text on dark fill on hover.

Files to update
1. `src/pages/Index.tsx`
- Change the sidebar wrapper from `bg-sidebar-background` to `bg-sidebar` so the sidebar uses the configured token consistently.

2. `src/components/dashboard/ClientSidebar.tsx`
- Keep the button visually outlined, but explicitly control both default and hover text/icon colors.
- Recommended class update:
```tsx
className="w-full justify-start border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
```
- This ensures:
  - visible text before hover
  - visible text after hover
  - border remains visible on the dark sidebar

Optional hardening
- If the icon still looks too dim, add an explicit icon color on the button or icon:
```tsx
<Plus className="h-4 w-4 mr-1 text-current" />
```
This keeps the icon synced with the text color.

Expected result
- “Add Client” is readable in both states:
  - default: light text on dark sidebar with visible outline
  - hover: light text on dark accent background

Technical note
- The custom color keys available from `tailwind.config.ts` are `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, and `border-sidebar-border`.
- `bg-sidebar-background` is not one of the generated utility names, which is likely contributing to the inconsistent appearance.

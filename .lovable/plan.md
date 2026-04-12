

# Fix: Make sidebar "Add Client" button always visible

## Problem
The "Add Client" button in the sidebar uses `variant="ghost"`, making it nearly invisible against the dark sidebar background until hovered.

## Solution
**File: `src/components/dashboard/ClientSidebar.tsx` (line 33)**
- Change the button from `variant="ghost"` to `variant="outline"` and add explicit border/text colors so it's always visible on the dark sidebar:
  ```tsx
  <Button variant="outline" size="sm" 
    className="w-full justify-start border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent" 
    onClick={onAddClient}>
  ```

This gives the button a visible border and text at all times.


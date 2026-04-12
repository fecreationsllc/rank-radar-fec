import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

interface ClientSidebarProps {
  clients: Tables<"clients">[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddClient: () => void;
  onDeleteClient: (id: string) => void;
}

export function ClientSidebar({ clients, selectedId, onSelect, onAddClient, onDeleteClient }: ClientSidebarProps) {
  const [deleteTarget, setDeleteTarget] = useState<Tables<"clients"> | null>(null);

  return (
    <div className="flex-1 overflow-auto py-2">
      {clients.map((client, i) => (
        <button
          key={client.id}
          onClick={() => onSelect(client.id)}
          className={`group w-full text-left px-4 py-2.5 transition-colors ${
            client.id === selectedId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-sm font-medium truncate text-sidebar-foreground flex-1">{client.name}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(client); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setDeleteTarget(client); } }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-sidebar-foreground/40 hover:text-red-400 flex-shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="text-xs text-sidebar-foreground/50 ml-[18px] truncate">{client.domain}</p>
        </button>
      ))}
      <div className="px-4 pt-3">
        <Button variant="outline" size="sm" className="w-full justify-start border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={onAddClient}>
          <Plus className="h-4 w-4 mr-1" /> Add Client
        </Button>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all keywords, ranking history, competitors, and suggestions for this client. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { onDeleteClient(deleteTarget.id); setDeleteTarget(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

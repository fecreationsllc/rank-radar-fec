import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

interface ClientSidebarProps {
  clients: Tables<"clients">[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddClient: () => void;
}

export function ClientSidebar({ clients, selectedId, onSelect, onAddClient }: ClientSidebarProps) {
  return (
    <div className="flex-1 overflow-auto py-2">
      {clients.map((client, i) => (
        <button
          key={client.id}
          onClick={() => onSelect(client.id)}
          className={`w-full text-left px-4 py-2.5 transition-colors ${
            client.id === selectedId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-sm font-medium truncate text-sidebar-foreground">{client.name}</span>
          </div>
          <p className="text-xs text-sidebar-foreground/50 ml-[18px] truncate">{client.domain}</p>
        </button>
      ))}
      <div className="px-4 pt-3">
        <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={onAddClient}>
          <Plus className="h-4 w-4 mr-1" /> Add Client
        </Button>
      </div>
    </div>
  );
}

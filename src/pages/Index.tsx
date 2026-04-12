import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tables } from "@/integrations/supabase/types";
import { ClientSidebar } from "@/components/dashboard/ClientSidebar";
import { ClientDashboard } from "@/components/dashboard/ClientDashboard";
import { AddClientModal } from "@/components/dashboard/AddClientModal";
import { Button } from "@/components/ui/button";
import { Radar } from "lucide-react";

export default function Index() {
  const { signOut } = useAuth();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [addClientOpen, setAddClientOpen] = useState(false);

  const { data: clients = [], refetch: refetchClients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data as Tables<"clients">[];
    },
  });

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? clients[0] ?? null;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-sidebar-border">
          <Radar className="h-5 w-5" />
          <span className="font-bold text-base">RankRadar</span>
        </div>
        <ClientSidebar
          clients={clients}
          selectedId={selectedClient?.id ?? null}
          onSelect={setSelectedClientId}
          onAddClient={() => setAddClientOpen(true)}
        />
        <div className="mt-auto p-4 border-t border-sidebar-border">
          <button onClick={signOut} className="text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-background overflow-auto">
        {selectedClient ? (
          <ClientDashboard client={selectedClient} refetchClients={refetchClients} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center space-y-2">
              <Radar className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-lg font-medium">No clients yet</p>
              <p className="text-sm">Add your first client to start tracking rankings.</p>
              <Button onClick={() => setAddClientOpen(true)} className="mt-4">+ Add Client</Button>
            </div>
          </div>
        )}
      </main>

      <AddClientModal
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
        onClientCreated={(id) => {
          refetchClients();
          setSelectedClientId(id);
          setAddClientOpen(false);
        }}
      />
    </div>
  );
}

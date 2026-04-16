import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Wand2, X } from "lucide-react";

const BLOCKED_TLDS = [".gov", ".mil"];

interface CompetitorsTabProps {
  client: Tables<"clients">;
}

export function CompetitorsTab({ client }: CompetitorsTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: competitors = [], isLoading } = useQuery({
    queryKey: ["competitors", client.id],
    queryFn: async () => {
      const { data } = await supabase.from("competitors").select("*").eq("client_id", client.id).order("created_at");
      return data ?? [];
    },
  });

  // Count tracked keywords for this client (to show shared count)
  const { data: keywordCount = 0 } = useQuery({
    queryKey: ["keyword-count", client.id],
    queryFn: async () => {
      const { count } = await supabase.from("keywords").select("*", { count: "exact", head: true }).eq("client_id", client.id);
      return count ?? 0;
    },
  });

  const visibleCompetitors = competitors.filter(
    (c) => !BLOCKED_TLDS.some((tld) => c.domain.endsWith(tld))
  );
  const atLimit = competitors.length >= 6;

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      await supabase.functions.invoke("discover-competitors", { body: { client_id: client.id } });
      queryClient.invalidateQueries({ queryKey: ["competitors", client.id] });
      toast({ title: "Competitors discovered" });
    } catch {
      toast({ title: "Discovery failed", variant: "destructive" });
    }
    setDiscovering(false);
  };

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    await supabase.from("competitors").insert({ client_id: client.id, domain: newDomain.trim(), is_auto_discovered: false });
    queryClient.invalidateQueries({ queryKey: ["competitors", client.id] });
    setNewDomain("");
    setAddOpen(false);
  };

  const handleToggle = async (comp: Tables<"competitors">) => {
    await supabase.from("competitors").update({ is_tracked: !comp.is_tracked }).eq("id", comp.id);
    queryClient.invalidateQueries({ queryKey: ["competitors", client.id] });
  };

  const handleRemove = async (id: string) => {
    await supabase.from("competitors").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["competitors", client.id] });
  };

  if (isLoading) return <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{competitors.length} / 6 competitors tracked</p>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" onClick={handleDiscover} disabled={discovering || atLimit}>
                    <Wand2 className={`h-4 w-4 mr-1 ${discovering ? "animate-pulse" : ""}`} /> Auto-discover
                  </Button>
                </span>
              </TooltipTrigger>
              {atLimit && <TooltipContent>Maximum 6 competitors reached</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button onClick={() => setAddOpen(true)} disabled={atLimit}>
                    <Plus className="h-4 w-4 mr-1" /> Add Competitor
                  </Button>
                </span>
              </TooltipTrigger>
              {atLimit && <TooltipContent>Maximum 6 competitors reached</TooltipContent>}
            </Tooltip>
          </div>
        </div>

        {competitors.length === 0 ? (
          <Card className="rounded-xl">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="font-medium">No competitors yet</p>
              <p className="text-sm mt-1">Run auto-discovery to find competitors for this client.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {competitors.map((comp) => (
              <Card key={comp.id} className="rounded-xl">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <a href={`https://${comp.domain}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:underline cursor-pointer">{comp.domain}</a>
                      {comp.is_auto_discovered && <Badge variant="secondary" className="mt-1 text-xs">Auto-discovered</Badge>}
                      <p className="text-xs text-muted-foreground mt-1">{keywordCount} tracked keywords</p>
                    </div>
                    <button onClick={() => handleRemove(comp.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-muted-foreground">Tracked</span>
                    <Switch checked={comp.is_tracked ?? false} onCheckedChange={() => handleToggle(comp)} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Competitor</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="competitor.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
              <Button onClick={handleAdd} className="w-full">Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

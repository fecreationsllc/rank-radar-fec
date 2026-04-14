import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PositionBadge } from "@/components/PositionBadge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, Search } from "lucide-react";

interface RankedKeyword {
  keyword: string;
  position: number | null;
  volume: number;
}

interface ImportRankedKeywordsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientDomain: string;
  onImported: () => void;
}

export function ImportRankedKeywordsModal({ open, onOpenChange, clientId, clientDomain, onImported }: ImportRankedKeywordsModalProps) {
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [keywords, setKeywords] = useState<RankedKeyword[]>([]);
  const [trackedSet, setTrackedSet] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setKeywords([]);
    setSelected(new Set());
    setFilter("");
    fetchData();
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch tracked keywords and primary city in parallel
      const [kwRes, cityRes] = await Promise.all([
        supabase.from("keywords").select("keyword").eq("client_id", clientId),
        supabase.from("client_cities").select("location_code, is_primary").eq("client_id", clientId),
      ]);

      const tracked = new Set((kwRes.data ?? []).map(k => k.keyword.toLowerCase()));
      setTrackedSet(tracked);

      const primaryCity = (cityRes.data ?? []).find(c => c.is_primary) ?? cityRes.data?.[0];
      if (!primaryCity) {
        toast({ title: "No city configured", description: "Add a city to this client first.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("get-ranked-keywords", {
        body: { domain: clientDomain, location_code: primaryCity.location_code },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const fetched: RankedKeyword[] = data?.keywords ?? [];
      setKeywords(fetched);

      // Pre-select untracked keywords
      const untracked = fetched.filter(k => !tracked.has(k.keyword.toLowerCase())).map(k => k.keyword);
      setSelected(new Set(untracked));
    } catch (e) {
      console.error("Import ranked keywords error:", e);
      toast({ title: "Failed to fetch ranked keywords", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!filter) return keywords;
    const f = filter.toLowerCase();
    return keywords.filter(k => k.keyword.toLowerCase().includes(f));
  }, [keywords, filter]);

  const selectableFiltered = useMemo(
    () => filtered.filter(k => !trackedSet.has(k.keyword.toLowerCase())),
    [filtered, trackedSet]
  );

  const allVisibleSelected = selectableFiltered.length > 0 && selectableFiltered.every(k => selected.has(k.keyword));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        selectableFiltered.forEach(k => next.delete(k.keyword));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        selectableFiltered.forEach(k => next.add(k.keyword));
        return next;
      });
    }
  };

  const toggleKeyword = (kw: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setAdding(true);
    try {
      const inserts = Array.from(selected).map(kw => ({ client_id: clientId, keyword: kw }));
      const { error } = await supabase.from("keywords").insert(inserts);
      if (error) throw error;

      toast({ title: `${inserts.length} keyword${inserts.length > 1 ? "s" : ""} added to tracking` });
      supabase.functions.invoke("sync-rankings", { body: { client_id: clientId } }).catch(() => {});
      supabase.functions.invoke("fetch-search-volume", { body: { client_id: clientId } }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", clientId] });
      queryClient.invalidateQueries({ queryKey: ["keywords-list", clientId] });
      onImported();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Failed to add keywords", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Import Ranked Keywords
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Fetching ranked keywords for {clientDomain}…</p>
          </div>
        ) : keywords.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No ranked keywords found for this domain.</p>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter keywords..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{selected.size} of {keywords.filter(k => !trackedSet.has(k.keyword.toLowerCase())).length} selected</p>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {allVisibleSelected ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1">
              {filtered.map(({ keyword, position, volume }) => {
                const isTracked = trackedSet.has(keyword.toLowerCase());
                return (
                  <label
                    key={keyword}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${isTracked ? "opacity-50 cursor-default" : "hover:bg-muted/50"}`}
                  >
                    <Checkbox
                      checked={isTracked ? false : selected.has(keyword)}
                      onCheckedChange={() => !isTracked && toggleKeyword(keyword)}
                      disabled={isTracked}
                    />
                    <span className="text-sm flex-1">{keyword}</span>
                    {isTracked && (
                      <span className="text-xs text-muted-foreground italic">Already tracked</span>
                    )}
                    <PositionBadge position={position} />
                    <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">{volume.toLocaleString()}/mo</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={loading || adding || selected.size === 0}>
            {adding ? "Adding..." : `Add ${selected.size} to Tracking`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface AddKeywordsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onKeywordsAdded: () => void;
}

export function AddKeywordsModal({ open, onOpenChange, clientId, onKeywordsAdded }: AddKeywordsModalProps) {
  const [text, setText] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const parsed = text.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean);
  const unique = [...new Set(parsed)];

  const handleSave = async () => {
    if (unique.length === 0) return;
    setSaving(true);
    const inserts = unique.map((kw) => ({ client_id: clientId, keyword: kw, target_url: targetUrl || null }));
    const { error } = await supabase.from("keywords").insert(inserts);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: `${unique.length} keywords added` });
      // Trigger sync and volume fetch for this client
      supabase.functions.invoke("sync-rankings", { body: { client_id: clientId } }).catch(() => {});
      supabase.functions.invoke("fetch-search-volume", { body: { client_id: clientId } }).catch(() => {});
      onKeywordsAdded();
      setText("");
      setTargetUrl("");
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Keywords</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Keywords</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste keywords, one per line or comma-separated" rows={5} />
          </div>
          <div className="space-y-2">
            <Label>Target URL (optional, applies to all)</Label>
            <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://example.com/page" />
          </div>
          {unique.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {unique.length} keyword{unique.length > 1 ? "s" : ""}
              <div className="flex flex-wrap gap-1 mt-2">
                {unique.slice(0, 8).map((kw) => <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>)}
                {unique.length > 8 && <Badge variant="outline" className="text-xs">+{unique.length - 8}</Badge>}
              </div>
            </div>
          )}
          <Button onClick={handleSave} className="w-full" disabled={unique.length === 0 || saving}>
            {saving ? "Saving..." : `Save ${unique.length} Keywords`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

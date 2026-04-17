import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";

interface KeywordSuggestion {
  keyword: string;
  volume: number;
  isLowVolume?: boolean;
}

interface SuggestKeywordsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keywords: KeywordSuggestion[];
  loading: boolean;
  onAdd: (keywords: string[]) => void;
}

export function SuggestKeywordsModal({ open, onOpenChange, keywords, loading, onAdd }: SuggestKeywordsModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(keywords.map(k => k.keyword)));

  // Sync selected when keywords change
  const prevKeywordsRef = useState(keywords)[0];
  if (prevKeywordsRef !== keywords && keywords.length > 0) {
    setSelected(new Set(keywords.map(k => k.keyword)));
  }

  const toggleKeyword = (kw: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === keywords.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(keywords.map(k => k.keyword)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Suggested Keywords
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing your website and fetching search volumes…</p>
          </div>
        ) : keywords.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No keywords found with sufficient search volume. Your coverage looks good!</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{selected.size} of {keywords.length} selected</p>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selected.size === keywords.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {keywords.map(({ keyword, volume, isLowVolume }) => (
                <label key={keyword} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={selected.has(keyword)} onCheckedChange={() => toggleKeyword(keyword)} />
                  <span className="text-sm flex-1 flex items-center gap-2">
                    {keyword}
                    {isLowVolume && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                        Low volume
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{volume.toLocaleString()}/mo</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onAdd(Array.from(selected))}
            disabled={loading || selected.size === 0}
          >
            Add {selected.size} Keyword{selected.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

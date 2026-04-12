import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, Json } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

interface SuggestionsTabProps {
  client: Tables<"clients">;
}

interface Suggestion {
  rank: number;
  title: string;
  description: string;
  impact: string;
  effort: string;
  keywords_affected: string[];
}

export function SuggestionsTab({ client }: SuggestionsTabProps) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: latestSuggestion, isLoading } = useQuery({
    queryKey: ["suggestions", client.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("seo_suggestions")
        .select("*")
        .eq("client_id", client.id)
        .order("generated_at", { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await supabase.functions.invoke("generate-suggestions", { body: { client_id: client.id } });
      queryClient.invalidateQueries({ queryKey: ["suggestions", client.id] });
      toast({ title: "Suggestions generated" });
    } catch {
      toast({ title: "Generation failed", variant: "destructive" });
    }
    setGenerating(false);
  };

  if (isLoading) return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>;

  const suggestions: Suggestion[] = latestSuggestion
    ? (parseSuggestions(latestSuggestion.suggestions))
    : [];

  if (!latestSuggestion) {
    return (
      <Card className="rounded-xl">
        <CardContent className="py-12 text-center">
          <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No suggestions yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Generate AI-powered SEO recommendations for this client.</p>
          <Button onClick={handleGenerate} disabled={generating}>
            <Sparkles className="h-4 w-4 mr-1" /> Generate Suggestions
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Generated on {format(new Date(latestSuggestion.generated_at), "MMMM d, yyyy")}
        </p>
        <Button variant="outline" onClick={handleGenerate} disabled={generating}>
          <RefreshCw className={`h-4 w-4 mr-1 ${generating ? "animate-spin" : ""}`} /> Regenerate
        </Button>
      </div>

      <div className="grid gap-4">
        {suggestions.map((s) => (
          <Card key={s.rank} className="rounded-xl">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
                  {s.rank}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[15px] text-foreground">{s.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant={s.impact === "high" ? "default" : "secondary"} className={s.impact === "high" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                      {s.impact === "high" ? "High Impact" : "Medium Impact"}
                    </Badge>
                    <Badge variant="outline">
                      {s.effort === "low" ? "Low Effort" : s.effort === "medium" ? "Medium Effort" : "High Effort"}
                    </Badge>
                    {s.keywords_affected?.map((kw) => (
                      <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function parseSuggestions(json: Json): Suggestion[] {
  try {
    if (typeof json === "object" && json !== null && "suggestions" in json) {
      return (json as any).suggestions;
    }
    if (Array.isArray(json)) return json as any;
    return [];
  } catch {
    return [];
  }
}

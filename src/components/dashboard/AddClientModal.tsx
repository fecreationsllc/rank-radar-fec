import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cleanDomain } from "@/lib/rank-utils";
import { Check, Copy, Search, X } from "lucide-react";

interface AddClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientCreated: (id: string) => void;
}

interface LocationResult {
  location_name: string;
  location_code: number;
}

export function AddClientModal({ open, onOpenChange, onClientCreated }: AddClientModalProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [clientId, setClientId] = useState("");
  const [reportToken, setReportToken] = useState("");

  // City search
  const [citySearch, setCitySearch] = useState("");
  const [cityResults, setCityResults] = useState<LocationResult[]>([]);
  const [selectedCities, setSelectedCities] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Keywords
  const [keywordsText, setKeywordsText] = useState("");
  const [parsedKeywords, setParsedKeywords] = useState<string[]>([]);

  const { toast } = useToast();

  const reset = () => {
    setStep(1);
    setName("");
    setDomain("");
    setAlertEmail("");
    setCitySearch("");
    setCityResults([]);
    setSelectedCities([]);
    setKeywordsText("");
    setParsedKeywords([]);
  };

  const handleStep1 = async () => {
    const cleanedDomain = cleanDomain(domain);
    const { data, error } = await supabase.from("clients").insert({ name, domain: cleanedDomain, alert_email: alertEmail || null }).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setClientId(data.id);
    setReportToken(data.report_token ?? "");
    setStep(2);
  };

  const handleCitySearch = async (query: string) => {
    setCitySearch(query);
    if (query.length < 3) { setCityResults([]); return; }
    setSearching(true);
    try {
      // Use edge function to proxy DataForSEO call
      const { data } = await supabase.functions.invoke("dataforseo-locations", { body: { query } });
      setCityResults(data?.locations ?? []);
    } catch { setCityResults([]); }
    setSearching(false);
  };

  const handleSelectCity = (loc: LocationResult) => {
    if (!selectedCities.find((c) => c.location_code === loc.location_code)) {
      setSelectedCities([...selectedCities, loc]);
    }
    setCitySearch("");
    setCityResults([]);
  };

  const handleStep2 = async () => {
    if (selectedCities.length === 0) { toast({ title: "Select at least one city", variant: "destructive" }); return; }
    const cityInserts = selectedCities.map((c, i) => ({
      client_id: clientId,
      city_name: c.location_name,
      location_code: c.location_code,
      is_primary: i === 0,
    }));
    await supabase.from("client_cities").insert(cityInserts);
    setStep(3);
  };

  const handleParseKeywords = (text: string) => {
    setKeywordsText(text);
    const kws = text.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean);
    setParsedKeywords([...new Set(kws)]);
  };

  const handleStep3 = async () => {
    if (parsedKeywords.length === 0) { toast({ title: "Add at least one keyword", variant: "destructive" }); return; }
    const inserts = parsedKeywords.map((kw) => ({ client_id: clientId, keyword: kw }));
    await supabase.from("keywords").insert(inserts);

    // Trigger competitor discovery
    supabase.functions.invoke("discover-competitors", { body: { client_id: clientId } }).catch(() => {});

    setStep(4);
  };

  const handleSyncNow = async () => {
    await supabase.functions.invoke("sync-rankings", { body: { client_id: clientId } });
    toast({ title: "Sync started!" });
  };

  const reportUrl = `${window.location.origin}/report/${reportToken}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Add Client — Basic Info"}
            {step === 2 && "Add Client — Cities"}
            {step === 3 && "Add Client — Keywords"}
            {step === 4 && "Client Created!"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Plumbing" />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acmeplumbing.com" />
            </div>
            <div className="space-y-2">
              <Label>Alert Email (optional)</Label>
              <Input type="email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="owner@acme.com" />
            </div>
            <Button onClick={handleStep1} className="w-full" disabled={!name || !domain}>Next</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Which city are you tracking rankings in?</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={citySearch} onChange={(e) => handleCitySearch(e.target.value)} placeholder="Search cities..." className="pl-9" />
            </div>
            {cityResults.length > 0 && (
              <div className="border rounded-lg max-h-40 overflow-auto">
                {cityResults.map((loc) => (
                  <button key={loc.location_code} className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => handleSelectCity(loc)}>
                    {loc.location_name}
                  </button>
                ))}
              </div>
            )}
            {selectedCities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCities.map((c) => (
                  <Badge key={c.location_code} variant="secondary" className="gap-1">
                    {c.location_name}
                    <button onClick={() => setSelectedCities(selectedCities.filter((s) => s.location_code !== c.location_code))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Button onClick={handleStep2} className="w-full" disabled={selectedCities.length === 0}>Next</Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Keywords</Label>
              <Textarea value={keywordsText} onChange={(e) => handleParseKeywords(e.target.value)} placeholder="Paste keywords, one per line or comma-separated" rows={5} />
            </div>
            {parsedKeywords.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {parsedKeywords.length} keyword{parsedKeywords.length > 1 ? "s" : ""} detected
                <div className="flex flex-wrap gap-1 mt-2">
                  {parsedKeywords.slice(0, 10).map((kw) => <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>)}
                  {parsedKeywords.length > 10 && <Badge variant="outline" className="text-xs">+{parsedKeywords.length - 10} more</Badge>}
                </div>
              </div>
            )}
            <Button onClick={handleStep3} className="w-full" disabled={parsedKeywords.length === 0}>Save Keywords</Button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-medium text-foreground">Client ready!</p>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Shareable Report Link</Label>
              <div className="flex gap-2">
                <Input value={reportUrl} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(reportUrl); toast({ title: "Copied!" }); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleSyncNow}>Run First Sync</Button>
              <Button className="flex-1" onClick={() => { onClientCreated(clientId); reset(); }}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

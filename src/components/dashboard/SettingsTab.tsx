import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Copy, Loader2, Search, Trash2, X, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

interface SettingsTabProps {
  client: Tables<"clients">;
  refetchClients: () => void;
}

interface LocationResult {
  location_name: string;
  location_code: number;
}

export function SettingsTab({ client, refetchClients }: SettingsTabProps) {
  const [name, setName] = useState(client.name);
  const [domain, setDomain] = useState(client.domain);
  const [alertEmail, setAlertEmail] = useState(client.alert_email ?? "");
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [connectingGsc, setConnectingGsc] = useState(false);

  // City search state
  const [citySearch, setCitySearch] = useState("");
  const [cityResults, setCityResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const { data: cities = [], refetch: refetchCities } = useQuery({
    queryKey: ["cities", client.id],
    queryFn: async () => {
      const { data } = await supabase.from("client_cities").select("*").eq("client_id", client.id);
      return data ?? [];
    },
  });

  const { data: gscStatus, refetch: refetchGscStatus } = useQuery({
    queryKey: ["gsc-status"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("gsc-auth", { body: { action: "status" } });
      return data as { connected: boolean; connected_at?: string };
    },
  });

  // Handle GSC OAuth callback
  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      setConnectingGsc(true);
      const redirectUri = window.location.origin;
      supabase.functions.invoke("gsc-auth", {
        body: { action: "exchange_code", code, redirect_uri: redirectUri },
      }).then(({ data, error }) => {
        if (error || data?.error) {
          toast({ title: "GSC connection failed", description: data?.error || error?.message, variant: "destructive" });
        } else {
          toast({ title: "Google Search Console connected!" });
          refetchGscStatus();
        }
        setConnectingGsc(false);
        // Clean URL
        searchParams.delete("code");
        searchParams.delete("scope");
        setSearchParams(searchParams, { replace: true });
      });
    }
  }, []);

  const handleConnectGsc = async () => {
    setConnectingGsc(true);
    try {
      const redirectUri = window.location.origin;
      const { data } = await supabase.functions.invoke("gsc-auth", {
        body: { action: "get_auth_url", redirect_uri: redirectUri },
      });
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch (e: any) {
      toast({ title: "Failed to start OAuth", description: e.message, variant: "destructive" });
      setConnectingGsc(false);
    }
  };

  const handleDisconnectGsc = async () => {
    await supabase.functions.invoke("gsc-auth", { body: { action: "disconnect" } });
    refetchGscStatus();
    toast({ title: "GSC disconnected" });
  };

  const handleSave = async () => {
    await supabase.from("clients").update({ name, domain, alert_email: alertEmail || null }).eq("id", client.id);
    refetchClients();
    toast({ title: "Client updated" });
  };

  const handleDeleteClient = async () => {
    await supabase.from("clients").delete().eq("id", client.id);
    refetchClients();
    toast({ title: "Client deleted" });
  };

  const handleRemoveCity = async (cityId: string) => {
    await supabase.from("client_cities").delete().eq("id", cityId);
    refetchCities();
  };

  const handleCitySearch = (query: string) => {
    setCitySearch(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.length < 3) { setCityResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke("dataforseo-locations", { body: { query } });
        const results: LocationResult[] = data?.locations ?? [];
        // Filter out already-added cities
        const existingCodes = new Set(cities.map((c) => c.location_code));
        setCityResults(results.filter((r) => !existingCodes.has(r.location_code)));
      } catch { setCityResults([]); }
      setSearching(false);
    }, 300);
  };

  const handleAddCity = async (loc: LocationResult) => {
    await supabase.from("client_cities").insert({
      client_id: client.id,
      city_name: loc.location_name,
      location_code: loc.location_code,
      is_primary: cities.length === 0,
    });
    setCitySearch("");
    setCityResults([]);
    refetchCities();
    toast({ title: `Added ${loc.location_name}` });
  };

  const reportUrl = `${window.location.origin}/report/${client.report_token}`;

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="rounded-xl">
        <CardHeader><CardTitle>Client Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Client Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Domain</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Alert Email</Label>
            <Input type="email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="alerts@example.com" />
          </div>
          <Button onClick={handleSave}>Save Changes</Button>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader><CardTitle>Cities</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cities.map((city) => (
            <div key={city.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{city.city_name}</p>
                <p className="text-xs text-muted-foreground">Code: {city.location_code}</p>
              </div>
              <button onClick={() => handleRemoveCity(city.id)} className="text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {cities.length === 0 && <p className="text-sm text-muted-foreground">No cities configured.</p>}

          <div className="pt-2 space-y-2">
            <Label className="text-sm">Add a city</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={citySearch} onChange={(e) => handleCitySearch(e.target.value)} placeholder="Search cities..." className="pl-9" />
            </div>
            {searching && (
              <div className="border rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            )}
            {!searching && cityResults.length > 0 && (
              <div className="border rounded-lg max-h-40 overflow-auto">
                {cityResults.map((loc) => (
                  <button key={loc.location_code} className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => handleAddCity(loc)}>
                    {loc.location_name}
                  </button>
                ))}
              </div>
            )}
            {!searching && cityResults.length === 0 && citySearch.length >= 3 && (
              <p className="text-sm text-muted-foreground">No cities found</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader><CardTitle>Shareable Report</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input value={reportUrl} readOnly className="text-sm" />
            <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(reportUrl); toast({ title: "Link copied!" }); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader><CardTitle>Google Search Console</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {gscStatus?.connected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Connected</p>
                  <p className="text-xs text-muted-foreground">
                    Since {gscStatus.connected_at ? new Date(gscStatus.connected_at).toLocaleDateString() : "recently"}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleDisconnectGsc}>
                <XCircle className="h-4 w-4 mr-1" /> Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Not connected</p>
              </div>
              <Button onClick={handleConnectGsc} disabled={connectingGsc} size="sm">
                {connectingGsc ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Connect Google
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-destructive/30">
        <CardHeader><CardTitle className="text-destructive">Danger Zone</CardTitle></CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive"><Trash2 className="h-4 w-4 mr-1" /> Delete Client</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete all keywords, rankings, and data for this client.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteClient}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

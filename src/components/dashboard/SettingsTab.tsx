import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Copy, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SettingsTabProps {
  client: Tables<"clients">;
  refetchClients: () => void;
}

export function SettingsTab({ client, refetchClients }: SettingsTabProps) {
  const [name, setName] = useState(client.name);
  const [domain, setDomain] = useState(client.domain);
  const [alertEmail, setAlertEmail] = useState(client.alert_email ?? "");
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: cities = [], refetch: refetchCities } = useQuery({
    queryKey: ["cities", client.id],
    queryFn: async () => {
      const { data } = await supabase.from("client_cities").select("*").eq("client_id", client.id);
      return data ?? [];
    },
  });

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

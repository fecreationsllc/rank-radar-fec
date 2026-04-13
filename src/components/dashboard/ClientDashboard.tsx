import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KeywordsTab } from "@/components/dashboard/KeywordsTab";
import { CompetitorsTab } from "@/components/dashboard/CompetitorsTab";
import { SuggestionsTab } from "@/components/dashboard/SuggestionsTab";
import { SettingsTab } from "@/components/dashboard/SettingsTab";
import { CostsTab } from "@/components/dashboard/CostsTab";

interface ClientDashboardProps {
  client: Tables<"clients">;
  refetchClients: () => void;
}

export function ClientDashboard({ client, refetchClients }: ClientDashboardProps) {
  const [activeTab, setActiveTab] = useState("keywords");

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{client.name}</h1>
          <p className="text-sm text-muted-foreground">{client.domain}</p>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="keywords">Keywords</TabsTrigger>
            <TabsTrigger value="competitors">Competitors</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
            <TabsTrigger value="costs">Costs</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === "keywords" && <KeywordsTab client={client} />}
        {activeTab === "competitors" && <CompetitorsTab client={client} />}
        {activeTab === "suggestions" && <SuggestionsTab client={client} />}
        {activeTab === "costs" && <CostsTab client={client} />}
        {activeTab === "settings" && <SettingsTab client={client} refetchClients={refetchClients} />}
      </div>
    </div>
  );
}

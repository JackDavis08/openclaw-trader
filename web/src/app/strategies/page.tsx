"use client";

import { useStrategies } from "@/hooks/use-dashboard";
import { useToggleScenario } from "@/hooks/use-mutations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";
import { Layers } from "lucide-react";

export default function StrategiesPage() {
  const { data: strategies, isLoading } = useStrategies();
  const toggle = useToggleScenario();

  if (isLoading) return <TableSkeleton rows={6} />;

  if (!strategies || strategies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
        <Layers className="w-8 h-8" />
        <p className="text-sm">No strategy profiles found</p>
        <p className="text-xs">
          Add YAML files to <code className="bg-muted px-1.5 py-0.5 rounded">config/strategies/</code>
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {strategies.map((strat) => (
        <Card key={strat.id} className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {strat.name}
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-neutral-accent/40 text-neutral-accent"
              >
                {strat.plugin}
              </Badge>
            </CardTitle>
            {strat.description && (
              <p className="text-xs text-muted-foreground mt-1">{strat.description}</p>
            )}
          </CardHeader>
          <CardContent className="pb-3">
            {strat.scenarios.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No linked scenarios</p>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  Scenarios
                </div>
                {strat.scenarios.map((sc) => (
                  <div
                    key={sc.id}
                    className="flex items-center justify-between py-1 px-2 rounded bg-muted/30"
                  >
                    <span className="text-xs font-mono">{sc.name}</span>
                    <Switch
                      checked={sc.enabled}
                      onCheckedChange={(checked) =>
                        toggle.mutate({ id: sc.id, enabled: checked })
                      }
                      disabled={toggle.isPending}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

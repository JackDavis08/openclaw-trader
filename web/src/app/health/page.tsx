"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useHealth, useHealthSnapshot, useLogs } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Search,
  Server,
  Cpu,
  HardDrive,
} from "lucide-react";

const statusIcons: Record<string, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
  never: Clock,
};
const statusColors: Record<string, string> = {
  ok: "text-profit",
  warn: "text-yellow-500",
  error: "text-loss",
  never: "text-muted-foreground",
};

export default function HealthPage() {
  const { data: health } = useHealth();
  const { data: snapshot, isLoading: snapshotLoading } = useHealthSnapshot();

  return (
    <div className="space-y-4">
      {/* Server Info Cards */}
      {health && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-2 text-muted-foreground text-[11px] mb-1">
                <Server className="w-3 h-3" /> Status
              </div>
              <div className="text-lg font-bold text-profit">
                {health.status.toUpperCase()}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-2 text-muted-foreground text-[11px] mb-1">
                <Clock className="w-3 h-3" /> Uptime
              </div>
              <div className="text-lg font-bold font-mono">
                {formatUptime(health.uptime)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-2 text-muted-foreground text-[11px] mb-1">
                <Cpu className="w-3 h-3" /> Heap Used
              </div>
              <div className="text-lg font-bold font-mono">
                {formatBytes(health.memory.heapUsed)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-2 text-muted-foreground text-[11px] mb-1">
                <HardDrive className="w-3 h-3" /> RSS
              </div>
              <div className="text-lg font-bold font-mono">
                {formatBytes(health.memory.rss)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Health Snapshot */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Task Health Check
            {snapshot?.checkedAt && (
              <span className="ml-2 text-xs font-normal">
                Last checked: {new Date(snapshot.checkedAt).toLocaleString()}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          {snapshotLoading ? (
            <TableSkeleton rows={5} />
          ) : !snapshot || snapshot.results.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No health snapshot available. Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">npm run health:check</code> to generate one.
            </div>
          ) : (
            <div className="space-y-1.5">
              {snapshot.results.map((task) => {
                const Icon = statusIcons[task.status] ?? Clock;
                const color = statusColors[task.status] ?? "text-muted-foreground";
                return (
                  <div
                    key={task.name}
                    className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary/30"
                  >
                    <Icon className={cn("w-4 h-4 flex-shrink-0", color)} />
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">
                      {task.name}
                    </span>
                    {!task.enabled && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30 text-muted-foreground">
                        DISABLED
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        task.status === "ok" && "border-profit/40 text-profit",
                        task.status === "warn" && "border-yellow-500/40 text-yellow-500",
                        task.status === "error" && "border-loss/40 text-loss",
                        task.status === "never" && "border-muted-foreground/40 text-muted-foreground",
                      )}
                    >
                      {task.status.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {task.message}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Viewer */}
      <LogViewer />
    </div>
  );
}

function LogViewer() {
  const { data } = useLogs(300);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showLevel, setShowLevel] = useState({ info: true, warn: true, error: true });

  const lines = useMemo(() => data?.lines ?? [], [data?.lines]);

  const filtered = useMemo(() => {
    return lines.filter((line) => {
      const lower = line.toLowerCase();
      if (!showLevel.info && (lower.includes("[info]") || lower.includes(" info "))) return false;
      if (!showLevel.warn && (lower.includes("[warn]") || lower.includes(" warn "))) return false;
      if (!showLevel.error && (lower.includes("[error]") || lower.includes(" error "))) return false;
      if (searchQuery.trim() && !lower.includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [lines, showLevel, searchQuery]);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filtered, autoScroll]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Live Logs
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              className="pl-8 h-8 w-48 bg-secondary border-border text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Switch
                checked={showLevel.info}
                onCheckedChange={(v) => setShowLevel((s) => ({ ...s, info: v }))}
                className="h-4 w-7"
              />
              <span className="text-green-400">INFO</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Switch
                checked={showLevel.warn}
                onCheckedChange={(v) => setShowLevel((s) => ({ ...s, warn: v }))}
                className="h-4 w-7"
              />
              <span className="text-yellow-400">WARN</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Switch
                checked={showLevel.error}
                onCheckedChange={(v) => setShowLevel((s) => ({ ...s, error: v }))}
                className="h-4 w-7"
              />
              <span className="text-red-400">ERROR</span>
            </label>
          </div>
          <div className="flex-1" />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <Switch
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
              className="h-4 w-7"
            />
            Auto-scroll
          </label>
        </div>

        {/* Terminal */}
        <div className="bg-black/60 rounded-lg p-3 h-[400px] overflow-y-auto font-mono text-[11px] leading-5">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">No logs available</div>
          ) : (
            filtered.map((line, i) => (
              <div key={i} className={getLogLineColor(line)}>
                {line}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </CardContent>
    </Card>
  );
}

function getLogLineColor(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("[error]") || lower.includes(" error ")) return "text-red-400";
  if (lower.includes("[warn]") || lower.includes(" warn ")) return "text-yellow-400";
  if (lower.includes("[info]") || lower.includes(" info ")) return "text-green-400/80";
  return "text-muted-foreground";
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

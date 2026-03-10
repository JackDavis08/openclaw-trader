"use client";

import { Card, CardContent } from "@/components/ui/card";

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="bg-card border-border animate-pulse">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="h-3 w-20 bg-muted rounded mb-3" />
            <div className="h-6 w-28 bg-muted rounded mb-1" />
            <div className="h-3 w-16 bg-muted rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <Card className="bg-card border-border animate-pulse">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="h-4 w-24 bg-muted rounded mb-4" />
        <div className="h-[280px] bg-muted/50 rounded" />
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="bg-card border-border animate-pulse">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="h-4 w-24 bg-muted rounded mb-4" />
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-8 bg-muted/50 rounded" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

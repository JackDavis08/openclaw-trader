import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Card className="bg-card border-border max-w-sm w-full">
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          <div className="text-5xl font-bold font-mono text-muted-foreground">404</div>
          <p className="text-muted-foreground text-sm">Page not found</p>
          <Link
            href="/"
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Back to Dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

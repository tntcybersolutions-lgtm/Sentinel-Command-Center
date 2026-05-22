import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertCircle, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-card-border bg-card">
        <CardContent className="pt-8 pb-6 px-6 space-y-5 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-red-400" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
            <p className="text-sm text-muted-foreground">The page you\u2019re looking for doesn\u2019t exist, was moved, or hasn\u2019t been built yet.</p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => window.history.back()} className="gap-2"><ArrowLeft className="h-3.5 w-3.5" />Back</Button>
            <Button size="sm" asChild className="gap-2"><Link href="/"><Home className="h-3.5 w-3.5" />Home</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

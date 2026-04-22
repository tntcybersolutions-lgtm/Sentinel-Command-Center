import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, CheckCircle, XCircle, AlertCircle, ArrowLeft, Link2, Key, RotateCw } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HealthCheck {
  domain: string;
  connected: boolean;
  lastTokenRefreshAt: string | null;
  canListRoot: boolean;
  rootChildCount: number;
  error?: string;
  tokenValid?: boolean;
}

interface AuthAttempt {
  id: number;
  tenantId: string;
  attemptType: string;
  endpointUrl: string;
  redirectUri: string | null;
  clientIdMasked: string | null;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  success: boolean;
  hasRefreshToken: boolean | null;
  createdAt: string;
}

export default function EgnyteDiagnostics() {
  const { toast } = useToast();
  const [debugToken, setDebugToken] = useState("");
  const [showDebugToken, setShowDebugToken] = useState(false);

  const healthQuery = useQuery<HealthCheck>({
    queryKey: ["/api/admin/egnyte/health"],
    refetchInterval: 10000,
  });

  const diagnosticsQuery = useQuery<{ attempts: AuthAttempt[] }>({
    queryKey: ["/api/admin/egnyte/diagnostics"],
    refetchInterval: 5000,
  });

  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/egnyte/refresh");
      return response.json();
    },
    onSuccess: (data: { success: boolean; message: string; error?: string }) => {
      if (data.success) {
        toast({ title: "Token Refreshed", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/egnyte/health"] });
      } else {
        toast({ title: "Refresh Failed", description: data.error || data.message, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Refresh Failed", description: error.message, variant: "destructive" });
    },
  });

  const debugConnectMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("POST", "/api/egnyte/connect-token", { accessToken: token });
      return response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string; error?: string }) => {
      if (data.success !== false) {
        toast({ title: "Debug Token Connected", description: "Token saved, sync will start automatically" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/egnyte/health"] });
        queryClient.invalidateQueries({ queryKey: ["/api/egnyte/status"] });
        setDebugToken("");
        setShowDebugToken(false);
      } else {
        toast({ title: "Connection Failed", description: data.error || data.message, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/egnyte/health"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/egnyte/diagnostics"] });
  };

  const health = healthQuery.data;
  const attempts = diagnosticsQuery.data?.attempts || [];

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/integrations">
          <Button variant="ghost" size="icon" data-testid="button-back-integrations">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Egnyte OAuth Diagnostics</h1>
          <p className="text-muted-foreground">Debug Egnyte authentication and token exchange</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            data-testid="button-refresh-diagnostics"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Connect, refresh token, or debug</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button 
              onClick={() => window.location.href = "/api/admin/egnyte/connect"}
              data-testid="button-oauth-connect"
            >
              <Link2 className="h-4 w-4 mr-2" />
              Connect via OAuth
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => refreshTokenMutation.mutate()}
              disabled={refreshTokenMutation.isPending || !health?.connected}
              data-testid="button-refresh-token"
            >
              <RotateCw className="h-4 w-4 mr-2" />
              Refresh Token
            </Button>
            
            <Button 
              variant="ghost"
              onClick={() => setShowDebugToken(!showDebugToken)}
              data-testid="button-toggle-debug"
            >
              <Key className="h-4 w-4 mr-2" />
              Debug: Paste Token
            </Button>
          </div>
          
          {showDebugToken && (
            <div className="mt-4 p-4 border rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground mb-2">
                Debug fallback: Paste an access token directly (for testing only)
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Access token"
                  value={debugToken}
                  onChange={(e) => setDebugToken(e.target.value)}
                  className="flex-1"
                  data-testid="input-debug-token"
                />
                <Button 
                  size="sm"
                  onClick={() => debugConnectMutation.mutate(debugToken)}
                  disabled={!debugToken || debugConnectMutation.isPending}
                  data-testid="button-debug-connect"
                >
                  Connect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {health?.canListRoot ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : health?.connected ? (
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            Health Check
          </CardTitle>
          <CardDescription>Current Egnyte connection status</CardDescription>
        </CardHeader>
        <CardContent>
          {healthQuery.isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : health ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-xs text-muted-foreground">Domain</p>
                  <p className="font-medium" data-testid="text-health-domain">{health.domain}</p>
                </div>
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-xs text-muted-foreground">Connected</p>
                  <Badge variant={health.connected ? "default" : "secondary"} data-testid="badge-health-connected">
                    {health.connected ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-xs text-muted-foreground">Can List Root</p>
                  <Badge variant={health.canListRoot ? "default" : "destructive"} data-testid="badge-health-canlistroot">
                    {health.canListRoot ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-xs text-muted-foreground">Root Child Count</p>
                  <p className="font-medium" data-testid="text-health-rootchildcount">{health.rootChildCount}</p>
                </div>
              </div>
              
              <div className="p-3 rounded-md bg-muted">
                <p className="text-xs text-muted-foreground">Last Token Refresh</p>
                <p className="font-medium" data-testid="text-health-lastrefresh">
                  {health.lastTokenRefreshAt ? new Date(health.lastTokenRefreshAt).toLocaleString() : "Never"}
                </p>
              </div>
              
              {health.error && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive">
                  <p className="text-xs text-destructive font-medium">Error</p>
                  <p className="text-sm text-destructive" data-testid="text-health-error">{health.error}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-destructive">Failed to load health check</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OAuth Attempts History</CardTitle>
          <CardDescription>Last 20 authentication/token exchange attempts with timestamps</CardDescription>
        </CardHeader>
        <CardContent>
          {diagnosticsQuery.isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : attempts.length === 0 ? (
            <p className="text-muted-foreground">No authentication attempts recorded yet. Try connecting to Egnyte.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {attempts.map((attempt) => (
                <div 
                  key={attempt.id} 
                  className={`p-4 rounded-md border ${attempt.success ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}
                  data-testid={`card-auth-attempt-${attempt.id}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {attempt.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <Badge variant="outline">{attempt.attemptType}</Badge>
                      {attempt.statusCode && (
                        <Badge variant={attempt.statusCode >= 200 && attempt.statusCode < 300 ? "default" : "destructive"}>
                          HTTP {attempt.statusCode}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(attempt.createdAt).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="grid gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Endpoint: </span>
                      <code className="text-xs bg-muted px-1 rounded">{attempt.endpointUrl}</code>
                    </div>
                    
                    {attempt.redirectUri && (
                      <div>
                        <span className="text-muted-foreground">Redirect URI: </span>
                        <code className="text-xs bg-muted px-1 rounded break-all">{attempt.redirectUri}</code>
                      </div>
                    )}
                    
                    {attempt.clientIdMasked && (
                      <div>
                        <span className="text-muted-foreground">Client ID: </span>
                        <code className="text-xs bg-muted px-1 rounded">{attempt.clientIdMasked}</code>
                      </div>
                    )}
                    
                    {attempt.hasRefreshToken !== null && (
                      <div>
                        <span className="text-muted-foreground">Has Refresh Token: </span>
                        <Badge variant={attempt.hasRefreshToken ? "default" : "secondary"} className="text-xs">
                          {attempt.hasRefreshToken ? "Yes" : "No"}
                        </Badge>
                      </div>
                    )}
                    
                    {attempt.errorMessage && (
                      <div className="mt-2 p-2 bg-destructive/10 rounded">
                        <span className="text-destructive font-medium text-xs">Error: </span>
                        <span className="text-destructive text-xs">{attempt.errorMessage}</span>
                      </div>
                    )}
                    
                    {attempt.responseBody && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer">Response Body</summary>
                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">{attempt.responseBody}</pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

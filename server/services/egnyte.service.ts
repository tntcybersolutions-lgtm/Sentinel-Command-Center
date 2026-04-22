import { db } from "../db";
import { integrationHealth, egnyteAuthAttempts } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

const EGNYTE_DOMAIN = process.env.EGNYTE_DOMAIN || "tntcyber";
const EGNYTE_CLIENT_ID = process.env.EGNYTE_CLIENT_ID;
const EGNYTE_CLIENT_SECRET = process.env.EGNYTE_CLIENT_SECRET;
const TENANT_ID = "blackhawk-default";

// Mask sensitive data for logging - show first 6 + last 4 chars
function maskSecret(value: string | undefined): string {
  if (!value) return "[NOT SET]";
  if (value.length < 10) return "[too short to mask]";
  return `${value.substring(0, 6)}...${value.substring(value.length - 4)}`;
}

// Sanitize response body (remove tokens/secrets)
function sanitizeResponseBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed.access_token) parsed.access_token = maskSecret(parsed.access_token);
    if (parsed.refresh_token) parsed.refresh_token = maskSecret(parsed.refresh_token);
    return JSON.stringify(parsed);
  } catch {
    // If not JSON, mask anything that looks like a token
    return body.replace(/[a-zA-Z0-9_-]{20,}/g, (match) => maskSecret(match));
  }
}

interface EgnyteTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface EgnyteFile {
  path: string;
  name: string;
  is_folder: boolean;
  size?: number;
  last_modified?: string;
  entry_id?: string;
  checksum?: string;
}

interface EgnyteFolderListing {
  path: string;
  name: string;
  folder_id: string;
  is_folder: boolean;
  files?: EgnyteFile[];
  folders?: EgnyteFile[];
  total_count?: number;
}

interface EgnyteConnectionMeta {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  domain: string;
  lastTokenRefreshAt?: string;
}

interface EgnyteHealthCheck {
  domain: string;
  connected: boolean;
  lastTokenRefreshAt: string | null;
  canListRoot: boolean;
  rootChildCount: number;
  error?: string;
  tokenValid?: boolean;
}

class EgnyteService {
  private baseUrl = `https://${EGNYTE_DOMAIN}.egnyte.com`;

  // Log auth attempt to database for diagnostics
  private async logAuthAttempt(params: {
    attemptType: string;
    endpointUrl: string;
    redirectUri?: string;
    statusCode?: number;
    responseBody?: string;
    errorMessage?: string;
    success: boolean;
    hasRefreshToken?: boolean;
  }): Promise<void> {
    try {
      await db.insert(egnyteAuthAttempts).values({
        tenantId: TENANT_ID,
        attemptType: params.attemptType,
        endpointUrl: params.endpointUrl,
        redirectUri: params.redirectUri || null,
        clientIdMasked: maskSecret(EGNYTE_CLIENT_ID),
        statusCode: params.statusCode || null,
        responseBody: params.responseBody ? sanitizeResponseBody(params.responseBody) : null,
        errorMessage: params.errorMessage || null,
        success: params.success,
        hasRefreshToken: params.hasRefreshToken,
      });
    } catch (e) {
      console.error("[Egnyte] Failed to log auth attempt:", e);
    }
  }

  // Get recent auth attempts for diagnostics
  async getAuthAttempts(limit: number = 20): Promise<typeof egnyteAuthAttempts.$inferSelect[]> {
    return db.select().from(egnyteAuthAttempts)
      .where(eq(egnyteAuthAttempts.tenantId, TENANT_ID))
      .orderBy(desc(egnyteAuthAttempts.createdAt))
      .limit(limit);
  }

  getAuthorizationUrl(redirectUri: string, state: string): string {
    // For Public Applications: Authorization Code flow
    // For Internal Applications: This won't work - use authenticateWithPassword() instead
    const authUrl = `${this.baseUrl}/puboauth/token`;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: EGNYTE_CLIENT_ID || "",
      redirect_uri: redirectUri,
      scope: "Egnyte.filesystem",
      state: state,
    });
    const fullUrl = `${authUrl}?${params.toString()}`;
    
    console.log("\n========== EGNYTE AUTHORIZATION URL DEBUG ==========");
    console.log(`[1] Authorization URL: ${authUrl}`);
    console.log(`[2] redirect_uri: ${redirectUri}`);
    console.log(`[3] client_id: ${maskSecret(EGNYTE_CLIENT_ID)}`);
    console.log(`[4] Full URL: ${fullUrl}`);
    console.log("=====================================================\n");
    
    this.logAuthAttempt({
      attemptType: "authorization_url",
      endpointUrl: authUrl,
      redirectUri,
      success: true,
    });
    
    return fullUrl;
  }

  // Resource Owner Password flow for Internal Applications
  async authenticateWithPassword(username: string, password: string): Promise<EgnyteTokenResponse> {
    const tokenEndpoint = `${this.baseUrl}/puboauth/token`;
    
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    
    const body = new URLSearchParams({
      grant_type: "password",
      username: username,
      password: password,
      client_id: EGNYTE_CLIENT_ID || "",
      client_secret: EGNYTE_CLIENT_SECRET || "",
      scope: "Egnyte.filesystem",
    });

    console.log("\n========== EGNYTE RESOURCE OWNER AUTH DEBUG ==========");
    console.log(`[1] Token endpoint: ${tokenEndpoint}`);
    console.log(`[2] grant_type: password`);
    console.log(`[3] username: ${username}`);
    console.log(`[4] password: [REDACTED]`);
    console.log(`[5] client_id (first6+last4): ${maskSecret(EGNYTE_CLIENT_ID)}`);
    console.log(`[6] client_secret set: ${EGNYTE_CLIENT_SECRET ? 'YES' : 'NO'}`);
    console.log(`[7] scope: Egnyte.filesystem`);
    console.log("=======================================================\n");

    let response: Response;
    let responseText: string;
    
    try {
      response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: headers,
        body: body,
      });
      
      responseText = await response.text();
      
      console.log("\n========== EGNYTE RESOURCE OWNER AUTH RESPONSE ==========");
      console.log(`[8] HTTP Status Code: ${response.status}`);
      console.log(`[9] Response Body: ${sanitizeResponseBody(responseText)}`);
      
      if (response.ok) {
        const tokenData = JSON.parse(responseText) as EgnyteTokenResponse;
        console.log(`[10] Has access_token: ${!!tokenData.access_token}`);
        console.log(`[11] Has refresh_token: ${!!tokenData.refresh_token}`);
        console.log(`[12] Token type: ${tokenData.token_type}`);
        console.log(`[13] Expires in: ${tokenData.expires_in} seconds`);
        console.log("==========================================================\n");
        
        await this.logAuthAttempt({
          attemptType: "password_grant",
          endpointUrl: tokenEndpoint,
          statusCode: response.status,
          responseBody: sanitizeResponseBody(responseText),
          success: true,
          hasRefreshToken: !!tokenData.refresh_token,
        });
        
        return tokenData;
      } else {
        console.log("==========================================================\n");
        
        await this.logAuthAttempt({
          attemptType: "password_grant",
          endpointUrl: tokenEndpoint,
          statusCode: response.status,
          responseBody: sanitizeResponseBody(responseText),
          errorMessage: `HTTP ${response.status}: ${responseText}`,
          success: false,
          hasRefreshToken: false,
        });
        
        throw new Error(`Egnyte auth failed: HTTP ${response.status} - ${responseText}`);
      }
    } catch (error: any) {
      console.error("Egnyte resource owner auth error:", error.message);
      throw error;
    }
  }

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<EgnyteTokenResponse> {
    const tokenEndpoint = `${this.baseUrl}/puboauth/token`;
    
    // Headers being sent - EXPLICITLY NO X-Egnyte-API-Key
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    
    // Log comprehensive debug info BEFORE the request
    console.log("\n========== EGNYTE TOKEN EXCHANGE DEBUG ==========");
    console.log(`[1] Token endpoint: ${tokenEndpoint}`);
    console.log(`[2] client_id (first6+last4): ${maskSecret(EGNYTE_CLIENT_ID)}`);
    console.log(`[3] client_secret set: ${EGNYTE_CLIENT_SECRET ? 'YES' : 'NO'}`);
    console.log(`[4] redirect_uri: ${redirectUri}`);
    console.log(`[5] code (first6+last4): ${maskSecret(code)}`);
    console.log(`[6] grant_type: authorization_code`);
    console.log(`[7] X-Egnyte-API-Key header sent: FALSE`);
    console.log(`[8] Headers: ${JSON.stringify(headers)}`);
    console.log("=================================================\n");
    
    const body = new URLSearchParams({
      client_id: EGNYTE_CLIENT_ID || "",
      client_secret: EGNYTE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      code: code,
      grant_type: "authorization_code",
    });

    let response: Response;
    let responseText: string;
    
    try {
      response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: headers,
        body: body,
      });
      
      responseText = await response.text();
      
      // Log response debug info
      console.log("\n========== EGNYTE TOKEN EXCHANGE RESPONSE ==========");
      console.log(`[6] HTTP Status Code: ${response.status}`);
      console.log(`[7] Response Body: ${sanitizeResponseBody(responseText)}`);
      
      if (response.ok) {
        const tokenData = JSON.parse(responseText) as EgnyteTokenResponse;
        console.log(`[8] Has refresh_token: ${!!tokenData.refresh_token}`);
        console.log(`[9] Token type: ${tokenData.token_type}`);
        console.log(`[10] Expires in: ${tokenData.expires_in} seconds`);
        console.log("====================================================\n");
        
        // Log success to diagnostics
        await this.logAuthAttempt({
          attemptType: "token_exchange",
          endpointUrl: tokenEndpoint,
          redirectUri,
          statusCode: response.status,
          responseBody: responseText,
          success: true,
          hasRefreshToken: !!tokenData.refresh_token,
        });
        
        return tokenData;
      } else {
        console.log("[8] ERROR: Token exchange failed");
        console.log("====================================================\n");
        
        // Log failure to diagnostics
        await this.logAuthAttempt({
          attemptType: "token_exchange",
          endpointUrl: tokenEndpoint,
          redirectUri,
          statusCode: response.status,
          responseBody: responseText,
          errorMessage: `HTTP ${response.status}: ${responseText}`,
          success: false,
          hasRefreshToken: false,
        });
        
        throw new Error(`Egnyte token exchange failed (HTTP ${response.status}): ${responseText}`);
      }
    } catch (error: any) {
      if (!error.message?.includes("token exchange failed")) {
        console.log("\n========== EGNYTE TOKEN EXCHANGE ERROR ==========");
        console.log(`[ERROR] ${error.message}`);
        console.log("=================================================\n");
        
        await this.logAuthAttempt({
          attemptType: "token_exchange",
          endpointUrl: tokenEndpoint,
          redirectUri,
          errorMessage: error.message,
          success: false,
          hasRefreshToken: false,
        });
      }
      throw error;
    }
  }

  async authenticateInternalApp(username: string, password: string): Promise<EgnyteTokenResponse> {
    if (!EGNYTE_CLIENT_ID || !EGNYTE_CLIENT_SECRET) {
      throw new Error("Egnyte client credentials not configured");
    }

    const tokenEndpoint = `${this.baseUrl}/puboauth/token`;
    
    console.log("\n========== EGNYTE PASSWORD GRANT DEBUG ==========");
    console.log(`[1] Token endpoint URL: ${tokenEndpoint}`);
    console.log(`[2] Username: ${username}`);
    console.log(`[3] client_id: ${maskSecret(EGNYTE_CLIENT_ID)}`);
    console.log(`[4] grant_type: password`);
    console.log("=================================================\n");

    let response: Response;
    let responseText: string;
    
    try {
      response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: EGNYTE_CLIENT_ID,
          client_secret: EGNYTE_CLIENT_SECRET,
          username: username,
          password: password,
          grant_type: "password",
          scope: "Egnyte.filesystem",
        }),
      });

      responseText = await response.text();
      
      console.log("\n========== EGNYTE PASSWORD GRANT RESPONSE ==========");
      console.log(`[5] HTTP Status Code: ${response.status}`);
      console.log(`[6] Response Body: ${sanitizeResponseBody(responseText)}`);
      
      if (response.ok) {
        const tokenData = JSON.parse(responseText) as EgnyteTokenResponse;
        console.log(`[7] Has refresh_token: ${!!tokenData.refresh_token}`);
        console.log("====================================================\n");
        
        await this.logAuthAttempt({
          attemptType: "password_grant",
          endpointUrl: tokenEndpoint,
          statusCode: response.status,
          responseBody: responseText,
          success: true,
          hasRefreshToken: !!tokenData.refresh_token,
        });
        
        return tokenData;
      } else {
        console.log("[7] ERROR: Password grant failed");
        console.log("====================================================\n");
        
        await this.logAuthAttempt({
          attemptType: "password_grant",
          endpointUrl: tokenEndpoint,
          statusCode: response.status,
          responseBody: responseText,
          errorMessage: `HTTP ${response.status}: ${responseText}`,
          success: false,
          hasRefreshToken: false,
        });
        
        throw new Error(`Egnyte authentication failed (HTTP ${response.status}): ${responseText}`);
      }
    } catch (error: any) {
      if (!error.message?.includes("authentication failed")) {
        console.log("\n========== EGNYTE PASSWORD GRANT ERROR ==========");
        console.log(`[ERROR] ${error.message}`);
        console.log("=================================================\n");
        
        await this.logAuthAttempt({
          attemptType: "password_grant",
          endpointUrl: tokenEndpoint,
          errorMessage: error.message,
          success: false,
          hasRefreshToken: false,
        });
      }
      throw error;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<EgnyteTokenResponse> {
    const tokenEndpoint = `${this.baseUrl}/puboauth/token`;
    
    console.log("\n========== EGNYTE TOKEN REFRESH DEBUG ==========");
    console.log(`[1] Token endpoint URL: ${tokenEndpoint}`);
    console.log(`[2] refresh_token: ${maskSecret(refreshToken)}`);
    console.log(`[3] client_id: ${maskSecret(EGNYTE_CLIENT_ID)}`);
    console.log("=================================================\n");
    
    let response: Response;
    let responseText: string;
    
    try {
      response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: EGNYTE_CLIENT_ID || "",
          client_secret: EGNYTE_CLIENT_SECRET || "",
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      responseText = await response.text();
      
      console.log("\n========== EGNYTE TOKEN REFRESH RESPONSE ==========");
      console.log(`[4] HTTP Status Code: ${response.status}`);
      console.log(`[5] Response Body: ${sanitizeResponseBody(responseText)}`);
      
      if (response.ok) {
        const tokenData = JSON.parse(responseText) as EgnyteTokenResponse;
        console.log(`[6] Has new refresh_token: ${!!tokenData.refresh_token}`);
        console.log("====================================================\n");
        
        await this.logAuthAttempt({
          attemptType: "token_refresh",
          endpointUrl: tokenEndpoint,
          statusCode: response.status,
          responseBody: responseText,
          success: true,
          hasRefreshToken: !!tokenData.refresh_token,
        });
        
        return tokenData;
      } else {
        console.log("[6] ERROR: Token refresh failed");
        console.log("====================================================\n");
        
        await this.logAuthAttempt({
          attemptType: "token_refresh",
          endpointUrl: tokenEndpoint,
          statusCode: response.status,
          responseBody: responseText,
          errorMessage: `HTTP ${response.status}: ${responseText}`,
          success: false,
          hasRefreshToken: false,
        });
        
        throw new Error(`Egnyte token refresh failed (HTTP ${response.status}): ${responseText}`);
      }
    } catch (error: any) {
      if (!error.message?.includes("refresh failed")) {
        await this.logAuthAttempt({
          attemptType: "token_refresh",
          endpointUrl: tokenEndpoint,
          errorMessage: error.message,
          success: false,
          hasRefreshToken: false,
        });
      }
      throw error;
    }
  }

  async saveConnection(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const now = new Date().toISOString();
    
    const meta: EgnyteConnectionMeta = {
      accessToken,
      refreshToken,
      expiresAt,
      domain: EGNYTE_DOMAIN,
      lastTokenRefreshAt: now,
    };

    console.log(`[Egnyte] Saving connection - has refresh_token: ${!!refreshToken}, expires: ${expiresAt}`);

    const existing = await db.select().from(integrationHealth)
      .where(and(
        eq(integrationHealth.tenantId, TENANT_ID),
        eq(integrationHealth.integrationKey, "egnyte")
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(integrationHealth)
        .set({
          status: "connected",
          lastSuccessAt: new Date(),
          metaJson: meta,
        })
        .where(eq(integrationHealth.id, existing[0].id));
    } else {
      await db.insert(integrationHealth).values({
        tenantId: TENANT_ID,
        integrationKey: "egnyte",
        status: "connected",
        lastSuccessAt: new Date(),
        metaJson: meta,
      });
    }
    
    console.log(`[Egnyte] Connection saved successfully`);
  }

  async saveDirectToken(accessToken: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 10).toISOString();
    const now = new Date().toISOString();
    
    const meta: EgnyteConnectionMeta = {
      accessToken,
      refreshToken: "",
      expiresAt,
      domain: EGNYTE_DOMAIN,
      lastTokenRefreshAt: now,
    };

    const existing = await db.select().from(integrationHealth)
      .where(and(
        eq(integrationHealth.tenantId, TENANT_ID),
        eq(integrationHealth.integrationKey, "egnyte")
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(integrationHealth)
        .set({
          status: "connected",
          lastSuccessAt: new Date(),
          metaJson: meta,
        })
        .where(eq(integrationHealth.id, existing[0].id));
    } else {
      await db.insert(integrationHealth).values({
        tenantId: TENANT_ID,
        integrationKey: "egnyte",
        status: "connected",
        lastSuccessAt: new Date(),
        metaJson: meta,
      });
    }
    console.log("[Egnyte] Direct access token saved successfully for domain:", EGNYTE_DOMAIN);
  }

  async testConnection(): Promise<{ success: boolean; message: string; user?: any }> {
    const connection = await this.getConnection();
    if (!connection) {
      return { success: false, message: "No connection stored in database" };
    }

    try {
      const response = await fetch(`${this.baseUrl}/pubapi/v1/userinfo`, {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, message: `API error (HTTP ${response.status}): ${error}` };
      }

      const user = await response.json();
      return { success: true, message: "Connected successfully", user };
    } catch (error: any) {
      return { success: false, message: `Connection failed: ${error.message}` };
    }
  }

  // Health check endpoint
  async healthCheck(): Promise<EgnyteHealthCheck> {
    const result: EgnyteHealthCheck = {
      domain: EGNYTE_DOMAIN,
      connected: false,
      lastTokenRefreshAt: null,
      canListRoot: false,
      rootChildCount: 0,
    };

    try {
      const [connection] = await db.select().from(integrationHealth)
        .where(and(
          eq(integrationHealth.tenantId, TENANT_ID),
          eq(integrationHealth.integrationKey, "egnyte"),
          eq(integrationHealth.status, "connected")
        ))
        .limit(1);

      if (!connection || !connection.metaJson) {
        result.error = "No Egnyte connection found in database";
        return result;
      }

      const meta = connection.metaJson as EgnyteConnectionMeta;
      result.lastTokenRefreshAt = meta.lastTokenRefreshAt || null;
      result.connected = true;

      // Test token validity with userinfo
      const userinfoResponse = await fetch(`${this.baseUrl}/pubapi/v1/userinfo`, {
        headers: {
          Authorization: `Bearer ${meta.accessToken}`,
        },
      });

      if (!userinfoResponse.ok) {
        result.tokenValid = false;
        result.error = `Token invalid (HTTP ${userinfoResponse.status}): ${await userinfoResponse.text()}`;
        return result;
      }
      
      result.tokenValid = true;

      // Try to list /Shared/Black Hawk Construction
      const rootPath = "/Shared/Black Hawk Construction";
      const listResponse = await fetch(`${this.baseUrl}/pubapi/v1/fs${encodeURI(rootPath)}`, {
        headers: {
          Authorization: `Bearer ${meta.accessToken}`,
        },
      });

      if (listResponse.ok) {
        const listing = await listResponse.json();
        result.canListRoot = true;
        result.rootChildCount = (listing.folders?.length || 0) + (listing.files?.length || 0);
      } else {
        const errorText = await listResponse.text();
        result.error = `Cannot list root (HTTP ${listResponse.status}): ${errorText}`;
      }

    } catch (error: any) {
      result.error = `Health check error: ${error.message}`;
    }

    return result;
  }

  // Manually refresh the stored token
  async refreshStoredToken(): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const [connection] = await db.select().from(integrationHealth)
        .where(and(
          eq(integrationHealth.tenantId, TENANT_ID),
          eq(integrationHealth.integrationKey, "egnyte"),
          eq(integrationHealth.status, "connected")
        ))
        .limit(1);

      if (!connection || !connection.metaJson) {
        return { success: false, message: "No connection found", error: "No Egnyte connection in database" };
      }

      const meta = connection.metaJson as EgnyteConnectionMeta;
      
      if (!meta.refreshToken) {
        return { success: false, message: "No refresh token", error: "Connection has no refresh token stored" };
      }

      console.log("[Egnyte] Manually refreshing token...");
      const newTokens = await this.refreshAccessToken(meta.refreshToken);
      await this.saveConnection(
        newTokens.access_token, 
        newTokens.refresh_token || meta.refreshToken, 
        newTokens.expires_in
      );

      return { 
        success: true, 
        message: `Token refreshed successfully. Expires in ${newTokens.expires_in} seconds` 
      };
    } catch (error: any) {
      return { success: false, message: "Refresh failed", error: error.message };
    }
  }

  async getConnection(): Promise<{ accessToken: string; refreshToken: string } | null> {
    const [connection] = await db.select().from(integrationHealth)
      .where(and(
        eq(integrationHealth.tenantId, TENANT_ID),
        eq(integrationHealth.integrationKey, "egnyte"),
        eq(integrationHealth.status, "connected")
      ))
      .limit(1);

    if (!connection || !connection.metaJson) return null;

    const meta = connection.metaJson as EgnyteConnectionMeta;
    
    // Auto-refresh if expired
    if (new Date(meta.expiresAt) < new Date() && meta.refreshToken) {
      console.log("[Egnyte] Token expired, attempting refresh...");
      try {
        const newTokens = await this.refreshAccessToken(meta.refreshToken);
        await this.saveConnection(newTokens.access_token, newTokens.refresh_token || meta.refreshToken, newTokens.expires_in);
        return { accessToken: newTokens.access_token, refreshToken: newTokens.refresh_token || meta.refreshToken };
      } catch (error) {
        console.error("[Egnyte] Failed to refresh token:", error);
        return null;
      }
    }

    return { accessToken: meta.accessToken, refreshToken: meta.refreshToken };
  }

  async disconnectEgnyte(): Promise<void> {
    await db.update(integrationHealth)
      .set({ status: "disconnected" })
      .where(and(
        eq(integrationHealth.tenantId, TENANT_ID),
        eq(integrationHealth.integrationKey, "egnyte")
      ));
  }

  async listFolder(path: string = "/Shared"): Promise<EgnyteFolderListing | null> {
    const connection = await this.getConnection();
    if (!connection) return null;

    const response = await fetch(`${this.baseUrl}/pubapi/v1/fs${encodeURI(path)}`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Egnyte] Folder listing failed for ${path}:`, error);
      return null;
    }

    return response.json();
  }

  async downloadFile(path: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const connection = await this.getConnection();
    if (!connection) return null;

    const response = await fetch(`${this.baseUrl}/pubapi/v1/fs-content${encodeURI(path)}`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Egnyte] File download failed:", error);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "application/octet-stream";

    return { buffer, contentType };
  }

  async searchFiles(query: string): Promise<EgnyteFile[]> {
    const connection = await this.getConnection();
    if (!connection) return [];

    const response = await fetch(`${this.baseUrl}/pubapi/v1/search?query=${encodeURIComponent(query)}`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Egnyte] Search failed:", error);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  }

  async getUserInfo(): Promise<{ username: string; email: string } | null> {
    const connection = await this.getConnection();
    if (!connection) return null;

    const response = await fetch(`${this.baseUrl}/pubapi/v1/userinfo`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
      },
    });

    if (!response.ok) return null;

    return response.json();
  }

  isConfigured(): boolean {
    return !!(EGNYTE_CLIENT_ID && EGNYTE_CLIENT_SECRET && EGNYTE_DOMAIN);
  }
}

export const egnyteService = new EgnyteService();

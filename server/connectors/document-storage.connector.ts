/**
 * Document Storage Connector Factory
 * Provides the appropriate storage provider based on environment configuration
 * 
 * PRODUCTION: Uses real Egnyte API
 * TESTING: Uses mock provider for automated tests only
 */

import type { IDocumentStorageConnector, IDocumentStorageProvider } from "./document-storage.interface";
import { EgnyteProvider } from "./egnyte.provider";
import { MockProvider } from "./mock.provider";

class DocumentStorageConnector implements IDocumentStorageConnector {
  private provider: IDocumentStorageProvider;
  private isProductionMode: boolean;

  constructor() {
    this.isProductionMode = this.shouldUseProduction();
    
    if (this.isProductionMode) {
      this.provider = new EgnyteProvider();
      console.log("[DocumentStorage] Initialized with Egnyte provider (production mode)");
    } else {
      this.provider = new MockProvider();
      console.log("[DocumentStorage] WARNING: Using mock provider (test mode only)");
    }
  }

  private shouldUseProduction(): boolean {
    const egnyteConfigured = !!(
      process.env.EGNYTE_DOMAIN &&
      process.env.EGNYTE_CLIENT_ID &&
      process.env.EGNYTE_CLIENT_SECRET
    );
    
    const isTest = process.env.NODE_ENV === "test";
    
    // SECURITY: Only allow mock provider in test environment
    const forceMock = process.env.DOCUMENT_STORAGE_MOCK === "true" && isTest;

    if (isTest || forceMock) {
      return false;
    }

    return egnyteConfigured;
  }

  getProvider(): IDocumentStorageProvider {
    return this.provider;
  }

  getProviderName(): string {
    return this.provider.providerName;
  }

  isProduction(): boolean {
    return this.isProductionMode;
  }

  switchToMock(): void {
    // SECURITY: Block mock provider in non-test environments
    if (process.env.NODE_ENV !== "test") {
      console.error("[DocumentStorage] BLOCKED: Cannot switch to mock provider in production");
      throw new Error("Mock provider is only available in test environment");
    }
    this.provider = new MockProvider();
    this.isProductionMode = false;
  }

  switchToProduction(): void {
    this.provider = new EgnyteProvider();
    this.isProductionMode = true;
  }
}

export const documentStorageConnector = new DocumentStorageConnector();

export function getDocumentStorage(): IDocumentStorageProvider {
  return documentStorageConnector.getProvider();
}

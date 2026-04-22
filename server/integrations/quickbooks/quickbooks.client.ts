import { auditService } from "../../services/audit.service";
import { approvalService } from "../../services/approval.service";

interface QuickBooksTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  realmId: string;
}

interface QuickBooksCustomer {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  Balance: number;
  Active: boolean;
}

interface QuickBooksVendor {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  Balance: number;
  Active: boolean;
}

interface QuickBooksInvoice {
  Id: string;
  DocNumber: string;
  TxnDate: string;
  DueDate: string;
  CustomerRef: { value: string; name: string };
  Line: Array<{
    Id: string;
    Description?: string;
    Amount: number;
    DetailType: string;
    SalesItemLineDetail?: {
      ItemRef: { value: string; name: string };
      Qty: number;
      UnitPrice: number;
    };
  }>;
  TotalAmt: number;
  Balance: number;
  EmailStatus: string;
  BillEmail?: { Address: string };
}

interface QuickBooksPayment {
  Id: string;
  TxnDate: string;
  CustomerRef: { value: string; name: string };
  TotalAmt: number;
  PaymentMethodRef?: { value: string; name: string };
  DepositToAccountRef?: { value: string; name: string };
  Line: Array<{
    Amount: number;
    LinkedTxn: Array<{ TxnId: string; TxnType: string }>;
  }>;
}

interface QuickBooksBill {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate: string;
  VendorRef: { value: string; name: string };
  Line: Array<{
    Id: string;
    Description?: string;
    Amount: number;
    DetailType: string;
    AccountBasedExpenseLineDetail?: {
      AccountRef: { value: string; name: string };
    };
  }>;
  TotalAmt: number;
  Balance: number;
}

interface QuickBooksAccount {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType: string;
  CurrentBalance: number;
  Active: boolean;
}

interface QuickBooksExpense {
  Id: string;
  TxnDate: string;
  PaymentType: string;
  AccountRef: { value: string; name: string };
  EntityRef?: { value: string; name: string; type: string };
  Line: Array<{
    Amount: number;
    Description?: string;
    DetailType: string;
    AccountBasedExpenseLineDetail?: {
      AccountRef: { value: string; name: string };
    };
  }>;
  TotalAmt: number;
}

interface QuickBooksProject {
  Id: string;
  DisplayName: string;
  CustomerRef: { value: string; name: string };
  Description?: string;
  Status: string;
}

export class QuickBooksClient {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private baseUrl: string;
  private tokens: QuickBooksTokens | null = null;
  private environment: "sandbox" | "production";

  constructor(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    environment: "sandbox" | "production" = "production"
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.environment = environment;
    this.baseUrl =
      environment === "sandbox"
        ? "https://sandbox-quickbooks.api.intuit.com"
        : "https://quickbooks.api.intuit.com";
  }

  getAuthorizationUrl(state: string): string {
    const scopes = encodeURIComponent("com.intuit.quickbooks.accounting");
    const baseAuthUrl = "https://appcenter.intuit.com/connect/oauth2";
    return `${baseAuthUrl}?client_id=${this.clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(this.redirectUri)}&state=${state}`;
  }

  async exchangeCodeForTokens(
    code: string,
    realmId: string
  ): Promise<QuickBooksTokens> {
    const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    const data = await response.json();
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      realmId,
    };

    return this.tokens;
  }

  async refreshAccessToken(): Promise<QuickBooksTokens> {
    if (!this.tokens) {
      throw new Error("No tokens available to refresh");
    }

    const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.tokens.refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const data = await response.json();
    this.tokens = {
      ...this.tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return this.tokens;
  }

  setTokens(tokens: QuickBooksTokens): void {
    this.tokens = tokens;
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      throw new Error("QuickBooks not authenticated");
    }

    if (Date.now() >= this.tokens.expiresAt - 60000) {
      await this.refreshAccessToken();
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.ensureValidToken();

    const url = `${this.baseUrl}/v3/company/${this.tokens!.realmId}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.tokens!.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QuickBooks API error: ${error}`);
    }

    return response.json();
  }

  async queryCustomers(
    whereClause?: string
  ): Promise<{ QueryResponse: { Customer: QuickBooksCustomer[] } }> {
    const query = whereClause
      ? `SELECT * FROM Customer WHERE ${whereClause}`
      : "SELECT * FROM Customer";
    return this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
  }

  async getCustomer(
    customerId: string
  ): Promise<{ Customer: QuickBooksCustomer }> {
    return this.makeRequest(`/customer/${customerId}`);
  }

  async createCustomer(customerData: {
    DisplayName: string;
    CompanyName?: string;
    PrimaryEmailAddr?: { Address: string };
    PrimaryPhone?: { FreeFormNumber: string };
    BillAddr?: {
      Line1?: string;
      City?: string;
      CountrySubDivisionCode?: string;
      PostalCode?: string;
    };
  }): Promise<{ Customer: QuickBooksCustomer }> {
    return this.makeRequest("/customer", {
      method: "POST",
      body: JSON.stringify(customerData),
    });
  }

  async queryVendors(
    whereClause?: string
  ): Promise<{ QueryResponse: { Vendor: QuickBooksVendor[] } }> {
    const query = whereClause
      ? `SELECT * FROM Vendor WHERE ${whereClause}`
      : "SELECT * FROM Vendor";
    return this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
  }

  async getVendor(vendorId: string): Promise<{ Vendor: QuickBooksVendor }> {
    return this.makeRequest(`/vendor/${vendorId}`);
  }

  async createVendor(vendorData: {
    DisplayName: string;
    CompanyName?: string;
    PrimaryEmailAddr?: { Address: string };
    PrimaryPhone?: { FreeFormNumber: string };
    BillAddr?: {
      Line1?: string;
      City?: string;
      CountrySubDivisionCode?: string;
      PostalCode?: string;
    };
  }): Promise<{ Vendor: QuickBooksVendor }> {
    return this.makeRequest("/vendor", {
      method: "POST",
      body: JSON.stringify(vendorData),
    });
  }

  async queryInvoices(
    whereClause?: string
  ): Promise<{ QueryResponse: { Invoice: QuickBooksInvoice[] } }> {
    const query = whereClause
      ? `SELECT * FROM Invoice WHERE ${whereClause}`
      : "SELECT * FROM Invoice ORDERBY TxnDate DESC MAXRESULTS 100";
    return this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
  }

  async getInvoice(invoiceId: string): Promise<{ Invoice: QuickBooksInvoice }> {
    return this.makeRequest(`/invoice/${invoiceId}`);
  }

  async createInvoice(invoiceData: {
    CustomerRef: { value: string };
    Line: Array<{
      Description?: string;
      Amount: number;
      DetailType: "SalesItemLineDetail";
      SalesItemLineDetail: {
        ItemRef: { value: string };
        Qty: number;
        UnitPrice: number;
      };
    }>;
    DueDate?: string;
    BillEmail?: { Address: string };
  }): Promise<{ Invoice: QuickBooksInvoice }> {
    return this.makeRequest("/invoice", {
      method: "POST",
      body: JSON.stringify(invoiceData),
    });
  }

  async sendInvoice(invoiceId: string, email?: string): Promise<{ Invoice: QuickBooksInvoice }> {
    const emailParam = email ? `?sendTo=${encodeURIComponent(email)}` : "";
    return this.makeRequest(`/invoice/${invoiceId}/send${emailParam}`, {
      method: "POST",
    });
  }

  async queryPayments(
    whereClause?: string
  ): Promise<{ QueryResponse: { Payment: QuickBooksPayment[] } }> {
    const query = whereClause
      ? `SELECT * FROM Payment WHERE ${whereClause}`
      : "SELECT * FROM Payment ORDERBY TxnDate DESC MAXRESULTS 100";
    return this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
  }

  async getPayment(paymentId: string): Promise<{ Payment: QuickBooksPayment }> {
    return this.makeRequest(`/payment/${paymentId}`);
  }

  async createPayment(paymentData: {
    CustomerRef: { value: string };
    TotalAmt: number;
    Line?: Array<{
      Amount: number;
      LinkedTxn: Array<{ TxnId: string; TxnType: "Invoice" }>;
    }>;
    PaymentMethodRef?: { value: string };
  }): Promise<{ Payment: QuickBooksPayment }> {
    return this.makeRequest("/payment", {
      method: "POST",
      body: JSON.stringify(paymentData),
    });
  }

  async queryBills(
    whereClause?: string
  ): Promise<{ QueryResponse: { Bill: QuickBooksBill[] } }> {
    const query = whereClause
      ? `SELECT * FROM Bill WHERE ${whereClause}`
      : "SELECT * FROM Bill ORDERBY TxnDate DESC MAXRESULTS 100";
    return this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
  }

  async getBill(billId: string): Promise<{ Bill: QuickBooksBill }> {
    return this.makeRequest(`/bill/${billId}`);
  }

  async createBill(billData: {
    VendorRef: { value: string };
    Line: Array<{
      Description?: string;
      Amount: number;
      DetailType: "AccountBasedExpenseLineDetail";
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: string };
      };
    }>;
    DueDate?: string;
  }): Promise<{ Bill: QuickBooksBill }> {
    return this.makeRequest("/bill", {
      method: "POST",
      body: JSON.stringify(billData),
    });
  }

  async queryAccounts(
    whereClause?: string
  ): Promise<{ QueryResponse: { Account: QuickBooksAccount[] } }> {
    const query = whereClause
      ? `SELECT * FROM Account WHERE ${whereClause}`
      : "SELECT * FROM Account";
    return this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
  }

  async getAccount(accountId: string): Promise<{ Account: QuickBooksAccount }> {
    return this.makeRequest(`/account/${accountId}`);
  }

  async queryPurchases(
    whereClause?: string
  ): Promise<{ QueryResponse: { Purchase: QuickBooksExpense[] } }> {
    const query = whereClause
      ? `SELECT * FROM Purchase WHERE ${whereClause}`
      : "SELECT * FROM Purchase ORDERBY TxnDate DESC MAXRESULTS 100";
    return this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
  }

  async createExpense(expenseData: {
    PaymentType: "Cash" | "Check" | "CreditCard";
    AccountRef: { value: string };
    Line: Array<{
      Amount: number;
      Description?: string;
      DetailType: "AccountBasedExpenseLineDetail";
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: string };
      };
    }>;
    EntityRef?: { value: string; type: "Vendor" };
  }): Promise<{ Purchase: QuickBooksExpense }> {
    return this.makeRequest("/purchase", {
      method: "POST",
      body: JSON.stringify(expenseData),
    });
  }

  async getCompanyInfo(): Promise<{
    CompanyInfo: {
      CompanyName: string;
      LegalName: string;
      CompanyAddr: {
        Line1?: string;
        City?: string;
        CountrySubDivisionCode?: string;
        PostalCode?: string;
      };
      Email?: { Address: string };
      WebAddr?: { URI: string };
      FiscalYearStartMonth: string;
    };
  }> {
    return this.makeRequest("/companyinfo/" + this.tokens!.realmId);
  }

  async getReportProfitAndLoss(
    startDate: string,
    endDate: string
  ): Promise<{
    Header: { Time: string; StartPeriod: string; EndPeriod: string };
    Rows: { Row: Array<{ ColData: Array<{ value: string }> }> };
  }> {
    return this.makeRequest(
      `/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`
    );
  }

  async getReportBalanceSheet(
    asOfDate: string
  ): Promise<{
    Header: { Time: string; StartPeriod: string; EndPeriod: string };
    Rows: { Row: Array<{ ColData: Array<{ value: string }> }> };
  }> {
    return this.makeRequest(`/reports/BalanceSheet?as_of=${asOfDate}`);
  }

  async getReportAgedReceivables(): Promise<{
    Header: { Time: string };
    Rows: { Row: Array<{ ColData: Array<{ value: string }> }> };
  }> {
    return this.makeRequest("/reports/AgedReceivables");
  }

  async getReportAgedPayables(): Promise<{
    Header: { Time: string };
    Rows: { Row: Array<{ ColData: Array<{ value: string }> }> };
  }> {
    return this.makeRequest("/reports/AgedPayables");
  }
}

// Simple in-memory token store for QuickBooks credentials per tenant
// In production, this should be persisted to the database
const tokenStore = new Map<string, QuickBooksTokens>();

export class QuickBooksService {
  private client: QuickBooksClient | null = null;
  private appTenantId: string;
  private isAuthenticated: boolean = false;

  constructor(appTenantId: string) {
    this.appTenantId = appTenantId;

    const clientId = process.env.QUICKBOOKS_CLIENT_ID;
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
    const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || "https://localhost/callback";
    const environment = (process.env.QUICKBOOKS_ENVIRONMENT as "sandbox" | "production") || "sandbox";

    if (clientId && clientSecret) {
      this.client = new QuickBooksClient(
        clientId,
        clientSecret,
        redirectUri,
        environment
      );
      
      // Restore tokens from store if available
      const storedTokens = tokenStore.get(appTenantId);
      if (storedTokens) {
        this.client.setTokens(storedTokens);
        this.isAuthenticated = true;
      }
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  hasValidAuth(): boolean {
    return this.isAuthenticated && this.client !== null;
  }

  getAuthorizationUrl(state: string): string | null {
    if (!this.client) return null;
    return this.client.getAuthorizationUrl(state);
  }

  async authenticate(code: string, realmId: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const tokens = await this.client.exchangeCodeForTokens(code, realmId);
      
      // Store tokens for persistence across requests
      tokenStore.set(this.appTenantId, tokens);
      this.isAuthenticated = true;
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_authenticated",
        actor: "system",
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { realmId },
      });

      return true;
    } catch (error) {
      console.error("QuickBooks authentication error:", error);
      return false;
    }
  }

  setTokens(tokens: QuickBooksTokens): void {
    if (this.client) {
      this.client.setTokens(tokens);
      tokenStore.set(this.appTenantId, tokens);
      this.isAuthenticated = true;
    }
  }

  clearAuth(): void {
    tokenStore.delete(this.appTenantId);
    this.isAuthenticated = false;
  }

  async getCustomers(actor: string): Promise<QuickBooksCustomer[]> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return [];
    }

    try {
      const result = await this.client.queryCustomers();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_customers_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { count: result.QueryResponse.Customer?.length || 0 },
      });

      return result.QueryResponse.Customer || [];
    } catch (error) {
      console.error("Error fetching QuickBooks customers:", error);
      return [];
    }
  }

  async getVendors(actor: string): Promise<QuickBooksVendor[]> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return [];
    }

    try {
      const result = await this.client.queryVendors();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_vendors_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { count: result.QueryResponse.Vendor?.length || 0 },
      });

      return result.QueryResponse.Vendor || [];
    } catch (error) {
      console.error("Error fetching QuickBooks vendors:", error);
      return [];
    }
  }

  async getInvoices(actor: string): Promise<QuickBooksInvoice[]> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return [];
    }

    try {
      const result = await this.client.queryInvoices();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_invoices_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { count: result.QueryResponse.Invoice?.length || 0 },
      });

      return result.QueryResponse.Invoice || [];
    } catch (error) {
      console.error("Error fetching QuickBooks invoices:", error);
      return [];
    }
  }

  async createInvoice(
    actor: string,
    invoiceData: {
      customerId: string;
      lines: Array<{
        description?: string;
        amount: number;
        itemId: string;
        quantity: number;
        unitPrice: number;
      }>;
      dueDate?: string;
      email?: string;
    }
  ): Promise<{ invoice?: QuickBooksInvoice; approvalRequired?: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      "integration",
      "quickbooks",
      "invoice_create"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType: "integration",
        entityId: "quickbooks",
        actionType: "invoice_create",
        requestedBy: actor,
        metadata: invoiceData,
      });

      return { approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("QuickBooks client not configured");
    }

    const result = await this.client.createInvoice({
      CustomerRef: { value: invoiceData.customerId },
      Line: invoiceData.lines.map((line) => ({
        Description: line.description,
        Amount: line.amount,
        DetailType: "SalesItemLineDetail" as const,
        SalesItemLineDetail: {
          ItemRef: { value: line.itemId },
          Qty: line.quantity,
          UnitPrice: line.unitPrice,
        },
      })),
      DueDate: invoiceData.dueDate,
      BillEmail: invoiceData.email ? { Address: invoiceData.email } : undefined,
    });

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "quickbooks_invoice_created",
      actor,
      entityType: "invoice",
      entityId: result.Invoice.Id,
      afterJson: { 
        invoiceId: result.Invoice.Id, 
        docNumber: result.Invoice.DocNumber,
        totalAmount: result.Invoice.TotalAmt,
      },
    });

    return { invoice: result.Invoice };
  }

  async sendInvoice(
    actor: string,
    invoiceId: string,
    email?: string
  ): Promise<{ success: boolean; approvalRequired?: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      "invoice",
      invoiceId,
      "invoice_send"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType: "invoice",
        entityId: invoiceId,
        actionType: "invoice_send",
        requestedBy: actor,
        metadata: { email },
      });

      return { success: false, approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("QuickBooks client not configured");
    }

    await this.client.sendInvoice(invoiceId, email);

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "quickbooks_invoice_sent",
      actor,
      entityType: "invoice",
      entityId: invoiceId,
      afterJson: { email },
    });

    return { success: true };
  }

  async getPayments(actor: string): Promise<QuickBooksPayment[]> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return [];
    }

    try {
      const result = await this.client.queryPayments();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_payments_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { count: result.QueryResponse.Payment?.length || 0 },
      });

      return result.QueryResponse.Payment || [];
    } catch (error) {
      console.error("Error fetching QuickBooks payments:", error);
      return [];
    }
  }

  async recordPayment(
    actor: string,
    paymentData: {
      customerId: string;
      amount: number;
      invoiceId?: string;
      paymentMethodId?: string;
    }
  ): Promise<{ payment?: QuickBooksPayment; approvalRequired?: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      "integration",
      "quickbooks",
      "payment_record"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType: "integration",
        entityId: "quickbooks",
        actionType: "payment_record",
        requestedBy: actor,
        metadata: paymentData,
      });

      return { approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("QuickBooks client not configured");
    }

    const result = await this.client.createPayment({
      CustomerRef: { value: paymentData.customerId },
      TotalAmt: paymentData.amount,
      Line: paymentData.invoiceId
        ? [
            {
              Amount: paymentData.amount,
              LinkedTxn: [{ TxnId: paymentData.invoiceId, TxnType: "Invoice" }],
            },
          ]
        : undefined,
      PaymentMethodRef: paymentData.paymentMethodId
        ? { value: paymentData.paymentMethodId }
        : undefined,
    });

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "quickbooks_payment_recorded",
      actor,
      entityType: "payment",
      entityId: result.Payment.Id,
      afterJson: { 
        paymentId: result.Payment.Id, 
        amount: result.Payment.TotalAmt,
      },
    });

    return { payment: result.Payment };
  }

  async getBills(actor: string): Promise<QuickBooksBill[]> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return [];
    }

    try {
      const result = await this.client.queryBills();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_bills_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { count: result.QueryResponse.Bill?.length || 0 },
      });

      return result.QueryResponse.Bill || [];
    } catch (error) {
      console.error("Error fetching QuickBooks bills:", error);
      return [];
    }
  }

  async createBill(
    actor: string,
    billData: {
      vendorId: string;
      lines: Array<{
        description?: string;
        amount: number;
        accountId: string;
      }>;
      dueDate?: string;
    }
  ): Promise<{ bill?: QuickBooksBill; approvalRequired?: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      "integration",
      "quickbooks",
      "bill_create"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType: "integration",
        entityId: "quickbooks",
        actionType: "bill_create",
        requestedBy: actor,
        metadata: billData,
      });

      return { approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("QuickBooks client not configured");
    }

    const result = await this.client.createBill({
      VendorRef: { value: billData.vendorId },
      Line: billData.lines.map((line) => ({
        Description: line.description,
        Amount: line.amount,
        DetailType: "AccountBasedExpenseLineDetail" as const,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: line.accountId },
        },
      })),
      DueDate: billData.dueDate,
    });

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "quickbooks_bill_created",
      actor,
      entityType: "bill",
      entityId: result.Bill.Id,
      afterJson: { 
        billId: result.Bill.Id, 
        totalAmount: result.Bill.TotalAmt,
      },
    });

    return { bill: result.Bill };
  }

  async getExpenses(actor: string): Promise<QuickBooksExpense[]> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return [];
    }

    try {
      const result = await this.client.queryPurchases();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_expenses_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { count: result.QueryResponse.Purchase?.length || 0 },
      });

      return result.QueryResponse.Purchase || [];
    } catch (error) {
      console.error("Error fetching QuickBooks expenses:", error);
      return [];
    }
  }

  async createExpense(
    actor: string,
    expenseData: {
      paymentType: "Cash" | "Check" | "CreditCard";
      bankAccountId: string;
      vendorId?: string;
      lines: Array<{
        amount: number;
        description?: string;
        expenseAccountId: string;
      }>;
    }
  ): Promise<{ expense?: QuickBooksExpense; approvalRequired?: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      "integration",
      "quickbooks",
      "expense_create"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType: "integration",
        entityId: "quickbooks",
        actionType: "expense_create",
        requestedBy: actor,
        metadata: expenseData,
      });

      return { approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("QuickBooks client not configured");
    }

    const result = await this.client.createExpense({
      PaymentType: expenseData.paymentType,
      AccountRef: { value: expenseData.bankAccountId },
      Line: expenseData.lines.map((line) => ({
        Amount: line.amount,
        Description: line.description,
        DetailType: "AccountBasedExpenseLineDetail" as const,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: line.expenseAccountId },
        },
      })),
      EntityRef: expenseData.vendorId
        ? { value: expenseData.vendorId, type: "Vendor" }
        : undefined,
    });

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "quickbooks_expense_created",
      actor,
      entityType: "expense",
      entityId: result.Purchase.Id,
      afterJson: { 
        expenseId: result.Purchase.Id, 
        totalAmount: result.Purchase.TotalAmt,
      },
    });

    return { expense: result.Purchase };
  }

  async getAccounts(actor: string): Promise<QuickBooksAccount[]> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return [];
    }

    try {
      const result = await this.client.queryAccounts();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_accounts_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { count: result.QueryResponse.Account?.length || 0 },
      });

      return result.QueryResponse.Account || [];
    } catch (error) {
      console.error("Error fetching QuickBooks accounts:", error);
      return [];
    }
  }

  async getCompanyInfo(actor: string): Promise<{
    companyName: string;
    legalName: string;
    address?: {
      line1?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    };
    email?: string;
    website?: string;
  } | null> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return null;
    }

    try {
      const result = await this.client.getCompanyInfo();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_company_info_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
      });

      return {
        companyName: result.CompanyInfo.CompanyName,
        legalName: result.CompanyInfo.LegalName,
        address: {
          line1: result.CompanyInfo.CompanyAddr?.Line1,
          city: result.CompanyInfo.CompanyAddr?.City,
          state: result.CompanyInfo.CompanyAddr?.CountrySubDivisionCode,
          postalCode: result.CompanyInfo.CompanyAddr?.PostalCode,
        },
        email: result.CompanyInfo.Email?.Address,
        website: result.CompanyInfo.WebAddr?.URI,
      };
    } catch (error) {
      console.error("Error fetching QuickBooks company info:", error);
      return null;
    }
  }

  async getProfitAndLossReport(
    actor: string,
    startDate: string,
    endDate: string
  ): Promise<{ Header: any; Rows: any } | null> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return null;
    }

    try {
      const result = await this.client.getReportProfitAndLoss(startDate, endDate);
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_pl_report_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { startDate, endDate },
      });

      return result;
    } catch (error) {
      console.error("Error fetching QuickBooks P&L report:", error);
      return null;
    }
  }

  async getBalanceSheet(
    actor: string,
    asOfDate: string
  ): Promise<{ Header: any; Rows: any } | null> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return null;
    }

    try {
      const result = await this.client.getReportBalanceSheet(asOfDate);
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_balance_sheet_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
        afterJson: { asOfDate },
      });

      return result;
    } catch (error) {
      console.error("Error fetching QuickBooks balance sheet:", error);
      return null;
    }
  }

  async getAgedReceivables(actor: string): Promise<{ Header: any; Rows: any } | null> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return null;
    }

    try {
      const result = await this.client.getReportAgedReceivables();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_aged_receivables_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
      });

      return result;
    } catch (error) {
      console.error("Error fetching QuickBooks aged receivables:", error);
      return null;
    }
  }

  async getAgedPayables(actor: string): Promise<{ Header: any; Rows: any } | null> {
    if (!this.client) {
      console.warn("QuickBooks client not configured");
      return null;
    }

    try {
      const result = await this.client.getReportAgedPayables();
      
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "quickbooks_aged_payables_fetched",
        actor,
        entityType: "integration",
        entityId: "quickbooks",
      });

      return result;
    } catch (error) {
      console.error("Error fetching QuickBooks aged payables:", error);
      return null;
    }
  }
}

export function createQuickBooksService(appTenantId: string): QuickBooksService {
  return new QuickBooksService(appTenantId);
}

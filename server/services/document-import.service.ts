import { db } from "../db";
import { knowledgeDocuments, subcontractors } from "@shared/schema";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";
import { auditService } from "./audit.service";
import * as fs from "fs";
import * as path from "path";

const DEFAULT_TENANT_ID = "blackhawk-default";

interface DocumentCategory {
  category: string;
  subCategory: string;
  documentType: string;
}

function categorizeDocument(filename: string, filePath: string = ""): DocumentCategory {
  const lowerName = filename.toLowerCase();
  const lowerPath = filePath.toLowerCase();
  
  if (lowerName.includes("tax") || lowerName.includes("1099") || lowerName.includes("federal") || lowerName.includes("state")) {
    const year = lowerName.match(/20\d{2}/)?.[0] || "unknown";
    if (lowerName.includes("personal") || lowerName.includes("hueser")) {
      return { category: "Tax", subCategory: `Personal/${year}`, documentType: "tax_documents" };
    }
    if (lowerName.includes("federal")) {
      return { category: "Tax", subCategory: `${year}/Federal`, documentType: "tax_documents" };
    }
    if (lowerName.includes("state")) {
      return { category: "Tax", subCategory: `${year}/State`, documentType: "tax_documents" };
    }
    return { category: "Tax", subCategory: year, documentType: "tax_documents" };
  }
  
  if (lowerName.includes("w9") || lowerName.includes("w-9")) {
    return { category: "Legal", subCategory: "Tax Forms", documentType: "company_info" };
  }
  
  if (lowerName.includes("license") || lowerName.includes("builder")) {
    return { category: "Legal", subCategory: "Licenses", documentType: "certifications" };
  }
  
  if (lowerName.includes("amend") || lowerName.includes("trade_name")) {
    return { category: "Legal", subCategory: "Corporate", documentType: "company_info" };
  }
  
  if (lowerName.includes("insurance") || lowerName.includes("audit")) {
    return { category: "Compliance", subCategory: "Insurance", documentType: "insurance" };
  }
  
  if (lowerName.includes("travelers")) {
    return { category: "Compliance", subCategory: "Insurance", documentType: "insurance" };
  }
  
  if (lowerName.includes("goldman") || lowerName.includes("small_business")) {
    return { category: "Finance", subCategory: "Funding", documentType: "company_info" };
  }
  
  if (lowerName.includes("directory") || lowerName.includes("company")) {
    return { category: "Contacts", subCategory: "Vendors", documentType: "subcontractors" };
  }
  
  // Dave Hueser personal documents
  if (lowerName.includes("resume") || lowerName.includes("cv")) {
    return { category: "Personnel", subCategory: "Resumes", documentType: "company_info" };
  }
  
  if (lowerName.includes("i-9") || lowerName.includes("i9") || lowerName.includes("e-verify")) {
    return { category: "Personnel", subCategory: "Employment Verification", documentType: "company_info" };
  }
  
  if (lowerName.includes("dl") || lowerName.includes("driver") || lowerName.includes("license") || lowerName.includes("licensure")) {
    return { category: "Personnel", subCategory: "Licenses", documentType: "certifications" };
  }
  
  if (lowerName.includes("ss card") || lowerName.includes("social security")) {
    return { category: "Personnel", subCategory: "Identity", documentType: "company_info" };
  }
  
  if (lowerName.includes("pfs") || lowerName.includes("personal financial")) {
    return { category: "Finance", subCategory: "Personal Financial Statements", documentType: "company_info" };
  }
  
  if (lowerName.includes("icc") || lowerName.includes("test results")) {
    return { category: "Certifications", subCategory: "Testing", documentType: "certifications" };
  }
  
  if (lowerName.includes("self certification") || lowerName.includes("certification")) {
    return { category: "Certifications", subCategory: "Self-Certification", documentType: "certifications" };
  }
  
  if (lowerName.includes("voucher") || lowerName.includes("letter")) {
    return { category: "Tax", subCategory: "Correspondence", documentType: "tax_documents" };
  }
  
  if (lowerName.includes("1040")) {
    const yearMatch = lowerName.match(/20\d{2}/);
    const year = yearMatch ? yearMatch[0] : "Personal";
    return { category: "Tax", subCategory: `${year}/Personal`, documentType: "tax_documents" };
  }
  
  if (lowerName.includes("aca")) {
    return { category: "Certifications", subCategory: "Professional", documentType: "certifications" };
  }
  
  // Company photos and branding
  if (lowerName.includes("photo") || lowerName.includes("profile picture") || lowerName.includes("headshot")) {
    return { category: "Company", subCategory: "Photos", documentType: "company_info" };
  }
  
  if (lowerName.includes("logo") || lowerName.includes(".bmp") || lowerName.includes(".eps")) {
    return { category: "Company", subCategory: "Branding", documentType: "company_info" };
  }
  
  if (lowerName.includes("sdvosb")) {
    return { category: "Certifications", subCategory: "SDVOSB", documentType: "certifications" };
  }
  
  // Background checks
  if (lowerName.includes("background") || lowerName.includes("oscc") || lowerName.includes("level 3")) {
    return { category: "Personnel", subCategory: "Background Checks", documentType: "company_info" };
  }
  
  // Insurance documents
  if (lowerName.includes("policy") || lowerName.includes("coi") || lowerName.includes("umbrella") || lowerName.includes("cyber") || lowerName.includes("inland marine")) {
    return { category: "Insurance", subCategory: "Policies", documentType: "insurance" };
  }
  
  if (lowerName.includes("loss run") || lowerName.includes("claims")) {
    return { category: "Insurance", subCategory: "Claims History", documentType: "insurance" };
  }
  
  if (lowerName.includes("declaration") || lowerName.includes("ipfs") || lowerName.includes("invoice")) {
    return { category: "Insurance", subCategory: "Billing", documentType: "insurance" };
  }
  
  // Financial statements
  if (lowerName.includes("balance sheet") || lowerName.includes("profit") || lowerName.includes("loss report")) {
    return { category: "Finance", subCategory: "Financial Statements", documentType: "company_info" };
  }
  
  // Bonding documents
  if (lowerName.includes("bond") || lowerName.includes("gia") || lowerName.includes("surety")) {
    return { category: "Bonding", subCategory: "Bonds", documentType: "bonding" };
  }
  
  // IRS documents
  if (lowerName.includes("irs")) {
    return { category: "Tax", subCategory: "IRS Correspondence", documentType: "tax_documents" };
  }
  
  // Project pictures
  if (lowerName.includes("project") || lowerName.includes("house") || lowerName.includes("layout")) {
    return { category: "Projects", subCategory: "Photos", documentType: "company_info" };
  }
  
  // USAA/Banking
  if (lowerName.includes("usaa") || lowerName.includes("bank") || lowerName.includes("credit card")) {
    return { category: "Finance", subCategory: "Banking", documentType: "company_info" };
  }
  
  // Auto/Vehicle documents
  if (lowerName.includes("auto") || lowerName.includes("vehicle") || lowerName.includes("ram") || lowerName.includes("trx")) {
    return { category: "Insurance", subCategory: "Auto", documentType: "insurance" };
  }
  
  // Legal/Construction documents (Goosmann Law)
  if (lowerName.includes("lien") || lowerName.includes("waiver")) {
    return { category: "Legal", subCategory: "Lien Waivers", documentType: "legal" };
  }
  
  if (lowerName.includes("change order") || lowerName.includes("co1") || lowerName.includes("co2")) {
    return { category: "Projects", subCategory: "Change Orders", documentType: "contracts" };
  }
  
  if (lowerName.includes("pay app") || lowerName.includes("payment application") || lowerName.includes("payapp")) {
    return { category: "Projects", subCategory: "Pay Applications", documentType: "contracts" };
  }
  
  if (lowerName.includes("punch list") || lowerName.includes("punchlist")) {
    return { category: "Projects", subCategory: "Punch Lists", documentType: "contracts" };
  }
  
  if (lowerName.includes("subcontract") || lowerName.includes("contract") || lowerName.includes("agreement")) {
    return { category: "Legal", subCategory: "Contracts", documentType: "contracts" };
  }
  
  if (lowerName.includes("delay letter") || lowerName.includes("letter")) {
    return { category: "Legal", subCategory: "Correspondence", documentType: "legal" };
  }
  
  if (lowerName.includes("back charge") || lowerName.includes("backcharge")) {
    return { category: "Projects", subCategory: "Back Charges", documentType: "contracts" };
  }
  
  if (lowerName.includes("closeout") || lowerName.includes("health inspection")) {
    return { category: "Projects", subCategory: "Closeout", documentType: "contracts" };
  }
  
  if (lowerName.includes("bond claim") || lowerName.includes("settlement")) {
    return { category: "Legal", subCategory: "Claims", documentType: "legal" };
  }
  
  if (lowerName.includes("daily log") || lowerName.includes("dailylog")) {
    return { category: "Projects", subCategory: "Daily Logs", documentType: "contracts" };
  }
  
  if (lowerName.includes("retainage")) {
    return { category: "Projects", subCategory: "Retainage", documentType: "contracts" };
  }
  
  // CPA/Accounting documents
  if (lowerName.includes("w2") || lowerName.includes("w-2")) {
    return { category: "Tax", subCategory: "W2 Forms", documentType: "tax_documents" };
  }
  
  if (lowerName.includes("1099")) {
    return { category: "Tax", subCategory: "1099 Forms", documentType: "tax_documents" };
  }
  
  if (lowerName.includes("1098")) {
    return { category: "Tax", subCategory: "1098 Forms", documentType: "tax_documents" };
  }
  
  if (lowerName.includes("voucher") || lowerName.includes("payment voucher")) {
    return { category: "Tax", subCategory: "Vouchers", documentType: "tax_documents" };
  }
  
  if (lowerName.includes("articles of corp") || lowerName.includes("certificate of org") || lowerName.includes("good standing")) {
    return { category: "Legal", subCategory: "Corporate Documents", documentType: "legal" };
  }
  
  if (lowerName.includes("franchise tax") || lowerName.includes("taxpayer number") || lowerName.includes("workforce tax")) {
    return { category: "Tax", subCategory: "State Tax", documentType: "tax_documents" };
  }
  
  if (lowerName.includes("engagement agreement") || lowerName.includes("engmt agmt")) {
    return { category: "Legal", subCategory: "Agreements", documentType: "contracts" };
  }
  
  if (lowerName.includes("retirement") || lowerName.includes("roth") || lowerName.includes("401k")) {
    return { category: "Finance", subCategory: "Retirement", documentType: "company_info" };
  }
  
  if (lowerName.includes("dental") || lowerName.includes("life insurance") || lowerName.includes("health insurance")) {
    return { category: "Insurance", subCategory: "Benefits", documentType: "insurance" };
  }
  
  if (lowerName.includes("tesla") || lowerName.includes("clean vehicle") || lowerName.includes("sales contract")) {
    return { category: "Finance", subCategory: "Vehicle", documentType: "company_info" };
  }
  
  if (lowerName.includes("va document") || lowerName.includes("veteran")) {
    return { category: "Personnel", subCategory: "VA Documents", documentType: "company_info" };
  }
  
  if (lowerName.includes("trade name") || lowerName.includes("acknowledgment") || lowerName.includes("certificate")) {
    return { category: "Legal", subCategory: "Registrations", documentType: "legal" };
  }
  
  // Templates and business documents
  if (lowerName.includes("templet") || lowerName.includes("template") || lowerName.includes("sample")) {
    return { category: "Templates", subCategory: "Forms", documentType: "company_info" };
  }
  
  if (lowerName.includes("capability statement")) {
    return { category: "Company", subCategory: "Marketing", documentType: "company_info" };
  }
  
  if (lowerName.includes("past performance") || lowerName.includes("cpar")) {
    return { category: "Projects", subCategory: "Past Performance", documentType: "contracts" };
  }
  
  if (lowerName.includes("emr") || lowerName.includes("safety manual")) {
    return { category: "Compliance", subCategory: "Safety", documentType: "company_info" };
  }
  
  if (lowerName.includes("bid bond") || lowerName.includes("bid package") || lowerName.includes("bid list") || lowerName.includes("bid tracker")) {
    return { category: "Bids", subCategory: "Bid Documents", documentType: "contracts" };
  }
  
  if (lowerName.includes("estimate") || lowerName.includes("proposal")) {
    return { category: "Bids", subCategory: "Estimates", documentType: "contracts" };
  }
  
  if (lowerName.includes("submittal")) {
    return { category: "Projects", subCategory: "Submittals", documentType: "contracts" };
  }
  
  if (lowerName.includes("project outlook")) {
    return { category: "Projects", subCategory: "Planning", documentType: "contracts" };
  }
  
  if (lowerName.includes("company directory") || lowerName.includes("directory")) {
    return { category: "Company", subCategory: "Organization", documentType: "company_info" };
  }
  
  // Logos and branding
  if (lowerName.includes("logo") || lowerName.includes("starmark") || lowerName.includes("advantage") || lowerPath.includes("logo")) {
    return { category: "Company", subCategory: "Branding", documentType: "company_info" };
  }
  
  // Team photos
  if (lowerName.includes("hueser") || lowerName.includes("kosmicki") || lowerPath.includes("company photos") || lowerPath.includes("bradley") || lowerPath.includes("dave") || lowerPath.includes("nolan")) {
    return { category: "Personnel", subCategory: "Team Photos", documentType: "company_info" };
  }
  
  // GSA related
  if (lowerName.includes("gsa") || lowerPath.includes("gsa")) {
    return { category: "Certifications", subCategory: "GSA", documentType: "company_info" };
  }
  
  // Engineering association logos
  if (lowerName.includes("asce") || lowerName.includes("asme") || lowerName.includes("aspe") || lowerName.includes("aee")) {
    return { category: "Company", subCategory: "Affiliations", documentType: "company_info" };
  }
  
  // Past project pictures
  if (lowerPath.includes("past project") || lowerPath.includes("project pictures") || lowerName.includes("va omaha") || lowerName.includes("chiller") || lowerName.includes("deer creek") || lowerName.includes("gavin") || lowerName.includes("westside")) {
    return { category: "Projects", subCategory: "Photo Documentation", documentType: "company_info" };
  }
  
  // Slide decks / presentations
  if (lowerName.includes("slide deck") || lowerName.includes("presentation")) {
    return { category: "Company", subCategory: "Presentations", documentType: "company_info" };
  }
  
  // Job contracts
  if (lowerName.includes("job contract")) {
    return { category: "Legal", subCategory: "Contracts", documentType: "contracts" };
  }
  
  // Hardhat / branding images
  if (lowerName.includes("hardhat")) {
    return { category: "Company", subCategory: "Branding", documentType: "company_info" };
  }
  
  return { category: "General", subCategory: "Uncategorized", documentType: "company_info" };
}

function extractMetadata(filename: string, content?: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    originalFilename: filename,
    importedAt: new Date().toISOString(),
  };
  
  const yearMatch = filename.match(/20\d{2}/);
  if (yearMatch) {
    metadata.year = yearMatch[0];
  }
  
  if (filename.toLowerCase().includes("blackhawk")) {
    metadata.company = "Blackhawk Construction LLC";
    metadata.ein = "83-3638177";
  }
  
  return metadata;
}

export class DocumentImportService {
  private bucketId: string;
  
  constructor() {
    this.bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || "replit-objstore-c6fe9ea2-c700-4765-b89e-6724876a539d";
  }
  
  async uploadFileToStorage(filePath: string, destinationPath: string): Promise<string> {
    const bucket = objectStorageClient.bucket(this.bucketId);
    const file = bucket.file(destinationPath);
    
    const fileBuffer = fs.readFileSync(filePath);
    await file.save(fileBuffer);
    
    return `/${this.bucketId}/${destinationPath}`;
  }
  
  async importDocument(filePath: string, actorId: string = "system"): Promise<{ id: string; title: string; storagePath: string }> {
    const filename = path.basename(filePath);
    const cleanFilename = filename.replace(/_\d{13,}/, "").replace(/\.[^.]+$/, "");
    const title = cleanFilename.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    
    const { category, subCategory, documentType } = categorizeDocument(filename, filePath);
    const metadata = extractMetadata(filename);
    
    const ext = path.extname(filename);
    const storagePath = `.private/documents/${category}/${subCategory}/${filename}`;
    
    const objectPath = await this.uploadFileToStorage(filePath, storagePath);
    
    const [doc] = await db.insert(knowledgeDocuments)
      .values({
        tenantId: DEFAULT_TENANT_ID,
        title,
        content: `Document: ${title}\nCategory: ${category}/${subCategory}\nFile: ${filename}`,
        documentType,
        sourceUrl: objectPath,
        sourceSystem: "uploaded",
        metadata: {
          ...metadata,
          category,
          subCategory,
          fileSize: fs.statSync(filePath).size,
          mimeType: this.getMimeType(ext),
        },
        status: "active",
      })
      .returning();
    
    await auditService.logEvent({
      tenantId: DEFAULT_TENANT_ID,
      eventType: "document.imported",
      actor: actorId,
      entityType: "knowledge_document",
      entityId: doc.id,
      afterJson: { title, category, subCategory, storagePath },
    });
    
    return { id: doc.id, title, storagePath: objectPath };
  }
  
  async importSubcontractorsFromCSV(csvPath: string, actorId: string = "system"): Promise<{ imported: number; errors: string[] }> {
    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n");
    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    
    let imported = 0;
    const errors: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      try {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const values = this.parseCSVLine(line);
        if (values.length < 4) continue;
        
        const companyName = values[0]?.trim();
        if (!companyName) continue;
        
        const city = values[4]?.trim() || "";
        const state = values[5]?.trim() || "";
        const phone = values[7]?.trim() || "";
        const email = values[11]?.trim() || "";
        
        const trade = this.inferTrade(companyName);
        
        await db.insert(subcontractors)
          .values({
            tenantId: DEFAULT_TENANT_ID,
            companyName,
            contactPhone: phone || null,
            contactEmail: email || null,
            trade,
            notes: city && state ? `Location: ${city}, ${state}` : null,
            status: "active",
          })
          .onConflictDoNothing();
        
        imported++;
      } catch (err) {
        errors.push(`Line ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
    
    await auditService.logEvent({
      tenantId: DEFAULT_TENANT_ID,
      eventType: "subcontractors.bulk_imported",
      actor: actorId,
      entityType: "subcontractor",
      entityId: "bulk",
      afterJson: { imported, errorCount: errors.length },
    });
    
    return { imported, errors };
  }
  
  async importVerifiedSubcontractors(subsList: Array<{
    name: string;
    trade: string;
    laborOnly: boolean;
    coiProvided: boolean;
    totalPayments: number;
  }>, actorId: string = "system"): Promise<{ imported: number }> {
    let imported = 0;
    
    for (const sub of subsList) {
      try {
        await db.insert(subcontractors)
          .values({
            tenantId: DEFAULT_TENANT_ID,
            companyName: sub.name,
            trade: sub.trade,
            insuranceVerified: sub.coiProvided,
            notes: `Payments: $${sub.totalPayments.toLocaleString()}. Labor only: ${sub.laborOnly ? "Yes" : "No"}`,
            status: "preferred",
          })
          .onConflictDoNothing();
        
        imported++;
      } catch (err) {
        console.error(`Error importing ${sub.name}:`, err);
      }
    }
    
    return { imported };
  }
  
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    
    return result;
  }
  
  private inferTrade(companyName: string): string {
    const name = companyName.toLowerCase();
    
    if (name.includes("electric")) return "Electrical";
    if (name.includes("plumb")) return "Plumbing";
    if (name.includes("hvac") || name.includes("heating") || name.includes("air")) return "HVAC";
    if (name.includes("roof")) return "Roofing";
    if (name.includes("concrete") || name.includes("mason")) return "Concrete/Masonry";
    if (name.includes("paint")) return "Painting";
    if (name.includes("carpet") || name.includes("floor")) return "Flooring";
    if (name.includes("glass") || name.includes("window")) return "Glass/Windows";
    if (name.includes("door")) return "Doors";
    if (name.includes("steel") || name.includes("metal")) return "Steel/Metal";
    if (name.includes("drywall")) return "Drywall";
    if (name.includes("landscape")) return "Landscaping";
    if (name.includes("demolition")) return "Demolition";
    if (name.includes("excavat") || name.includes("trench")) return "Excavation";
    if (name.includes("insulation")) return "Insulation";
    if (name.includes("fire") || name.includes("sprinkler")) return "Fire Protection";
    if (name.includes("elevator") || name.includes("lift")) return "Elevators";
    if (name.includes("cabinet") || name.includes("millwork")) return "Millwork";
    if (name.includes("security") || name.includes("alarm")) return "Security Systems";
    if (name.includes("architect")) return "Architecture";
    if (name.includes("engineer")) return "Engineering";
    
    return "General Construction";
  }
  
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".doc": "application/msword",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xls": "application/vnd.ms-excel",
      ".csv": "text/csv",
      ".txt": "text/plain",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".zip": "application/zip",
    };
    return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
  }
}

export const documentImportService = new DocumentImportService();

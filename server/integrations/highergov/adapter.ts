import crypto from "crypto";
import { getOpportunity, searchOpportunities } from "../../connectors/highergov";

export type HGOpportunity = any;
export type HGAward = any;
export type HGForecast = any;
export type HGTaskOrder = any;

export type HGDocument = {
  name: string;
  url: string;
  type?: string | null;
  fileName?: string | null;
};

export type NormalizedDoc = { fileName: string; name: string; url: string; type: string };

function s(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

function fileNameFromUrl(u: string) {
  try {
    const noQuery = u.split("?")[0];
    return decodeURIComponent(noQuery.split("/").pop() || "document");
  } catch {
    return u.split("?")[0].split("/").pop() || "document";
  }
}

function addDoc(out: NormalizedDoc[], seen: Set<string>, url: string, name?: string | null, type?: string | null) {
  const u = url.trim();
  if (!u || seen.has(u)) return;
  seen.add(u);

  const fn = fileNameFromUrl(u);
  out.push({
    url: u,
    fileName: fn,
    name: name?.trim() || fn,
    type: type?.trim() || "document",
  });
}

function extractDocsFromRaw(raw: any): NormalizedDoc[] {
  const out: NormalizedDoc[] = [];
  const seen = new Set<string>();

  if (!raw || typeof raw !== "object") return out;

  const candidates: any[] = [];

  if (Array.isArray((raw as any).attachments)) candidates.push(...(raw as any).attachments);
  if (Array.isArray((raw as any).documents)) candidates.push(...(raw as any).documents);
  if (Array.isArray((raw as any).resource_links)) candidates.push(...(raw as any).resource_links);
  if (Array.isArray((raw as any).resourceLinks)) candidates.push(...(raw as any).resourceLinks);
  if (Array.isArray((raw as any).files)) candidates.push(...(raw as any).files);
  if (Array.isArray((raw as any).links)) candidates.push(...(raw as any).links);

  if (Array.isArray((raw as any).data?.attachments)) candidates.push(...(raw as any).data.attachments);
  if (Array.isArray((raw as any).data?.documents)) candidates.push(...(raw as any).data.documents);

  for (const item of candidates) {
    const url =
      s(item?.url) ||
      s(item?.href) ||
      s(item?.link) ||
      s(item?.downloadUrl) ||
      s(item?.download_url);

    if (!url) continue;

    const name = s(item?.name) || s(item?.title) || s(item?.label) || null;
    const type = s(item?.type) || s(item?.category) || s(item?.mimeType) || null;

    addDoc(out, seen, url, name, type);
  }

  if ((raw as any).attachments && !Array.isArray((raw as any).attachments) && typeof (raw as any).attachments === "object") {
    for (const [k, v] of Object.entries((raw as any).attachments)) {
      const url = s(v);
      if (url) addDoc(out, seen, url, k, "attachment");
    }
  }

  return out;
}

const MOCK_OPPORTUNITIES: HGOpportunity[] = [
  {
    id: "mock-opp-1",
    title: "Mock HigherGov Opportunity",
    raw: {
      attachments: [{ name: "Mock SOW", url: "https://example.com/mock-sow.pdf", type: "pdf" }],
    },
  },
];

const MOCK_DOCUMENTS: Record<string, HGDocument[]> = {
  "mock-opp-1": [{ name: "Mock SOW", url: "https://example.com/mock-sow.pdf", type: "pdf" }],
};

export class HigherGovAdapter {
  private useLiveApi: boolean;
  private simulateVariation: boolean;

  constructor(options?: { simulateVariation?: boolean }) {
    this.useLiveApi = !!process.env.HIGHERGOV_API_KEY && !!process.env.HIGHERGOV_BASE_URL;
    this.simulateVariation = !!options?.simulateVariation;
  }

  static computeHash(payload: any): string {
    return crypto.createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
  }

  async listOpportunities(_updatedSince?: Date): Promise<HGOpportunity[]> {
    if (!this.useLiveApi) return MOCK_OPPORTUNITIES;

    const res = await searchOpportunities({ page: 1, limit: 50 });
    return (res as any)?.opportunities || [];
  }

  async listAwards(_updatedSince?: Date): Promise<HGAward[]> {
    return [];
  }

  async listForecasts(_updatedSince?: Date): Promise<HGForecast[]> {
    return [];
  }

  async listTaskOrders(_updatedSince?: Date): Promise<HGTaskOrder[]> {
    return [];
  }

  async getDocuments(entityId: string): Promise<HGDocument[]> {
    if (!this.useLiveApi) return MOCK_DOCUMENTS[entityId] || [];

    const opp = await getOpportunity(entityId);
    const raw = (opp as any)?.raw || opp;

    const docs = extractDocsFromRaw(raw);
    return docs.map(d => ({ name: d.name, url: d.url, type: d.type, fileName: d.fileName }));
  }

  async listDocuments(entityId: string): Promise<NormalizedDoc[]> {
    const docs = await this.getDocuments(entityId);

    const out: NormalizedDoc[] = [];
    const seen = new Set<string>();

    for (const d of docs || []) {
      const url = s((d as any)?.url);
      if (!url) continue;

      const name = s((d as any)?.name) || s((d as any)?.fileName) || null;
      const type = s((d as any)?.type) || "document";

      addDoc(out, seen, url, name, type);
    }

    if (this.simulateVariation && out.length) {
      // no-op
    }

    return out;
  }
}

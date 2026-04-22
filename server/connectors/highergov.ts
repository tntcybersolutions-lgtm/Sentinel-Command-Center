export interface HigherGovSearchParams {
  query?: string;
  naics?: string;
  setAside?: string;
  agency?: string;
  state?: string;
  page?: number;
  limit?: number;
}

export interface HigherGovOpportunity {
  id: string;
  title: string;
  description?: string;
  agency?: string;
  naics?: string;
  setAside?: string;
  value?: number;
  postedDate?: string;
  dueDate?: string;
  url?: string;
  source: "highergov";
  raw?: Record<string, unknown>;
}

export interface HigherGovSearchResult {
  opportunities: HigherGovOpportunity[];
  total: number;
  page: number;
}

function getConfig() {
  const apiKey = process.env.HIGHERGOV_API_KEY;
  const baseUrl = process.env.HIGHERGOV_BASE_URL;

  const errors: string[] = [];
  if (!apiKey) errors.push("HIGHERGOV_API_KEY");
  if (!baseUrl) errors.push("HIGHERGOV_BASE_URL");

  if (errors.length > 0) {
    return {
      configured: false as const,
      error: `HigherGov not configured: missing ${errors.join(", ")}`,
    };
  }

  return {
    configured: true as const,
    apiKey: apiKey!,
    baseUrl: baseUrl!.replace(/\/+$/, ""),
  };
}

export async function searchOpportunities(
  params: HigherGovSearchParams
): Promise<HigherGovSearchResult> {
  const config = getConfig();
  if (!config.configured) {
    throw new Error(config.error);
  }

  const url = new URL(`${config.baseUrl}/opportunities`);
  if (params.query) url.searchParams.set("q", params.query);
  if (params.naics) url.searchParams.set("naics", params.naics);
  if (params.setAside) url.searchParams.set("set_aside", params.setAside);
  if (params.agency) url.searchParams.set("agency", params.agency);
  if (params.state) url.searchParams.set("state", params.state);
  if (params.page) url.searchParams.set("page", String(params.page));
  if (params.limit) url.searchParams.set("limit", String(params.limit));

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `HigherGov API error ${resp.status}: ${text.slice(0, 500)}`
    );
  }

  const data = await resp.json();
  return {
    opportunities: Array.isArray(data.results)
      ? data.results.map(mapRaw)
      : [],
    total: data.total ?? 0,
    page: params.page ?? 1,
  };
}

export async function getOpportunity(
  id: string
): Promise<HigherGovOpportunity> {
  const config = getConfig();
  if (!config.configured) {
    throw new Error(config.error);
  }

  const resp = await fetch(`${config.baseUrl}/opportunities/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `HigherGov API error ${resp.status}: ${text.slice(0, 500)}`
    );
  }

  const data = await resp.json();
  return mapRaw(data);
}

function mapRaw(raw: Record<string, unknown>): HigherGovOpportunity {
  return {
    id: String(raw.id ?? raw.solicitation_id ?? ""),
    title: String(raw.title ?? raw.solicitation_title ?? ""),
    description: raw.description ? String(raw.description) : undefined,
    agency: raw.agency ? String(raw.agency) : undefined,
    naics: raw.naics ? String(raw.naics) : undefined,
    setAside: raw.set_aside ? String(raw.set_aside) : undefined,
    value: raw.value != null ? Number(raw.value) : undefined,
    postedDate: raw.posted_date ? String(raw.posted_date) : undefined,
    dueDate: raw.due_date ? String(raw.due_date) : undefined,
    url: raw.url ? String(raw.url) : undefined,
    source: "highergov",
    raw,
  };
}

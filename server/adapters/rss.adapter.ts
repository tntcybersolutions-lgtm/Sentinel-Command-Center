import { BaseAdapter, RawItem, NormalizedOpportunity, AdapterConfig } from "./adapter.types";

interface RssChannel {
  title: string;
  link: string;
  description: string;
  item: RssItem[];
}

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  guid?: string;
  category?: string;
}

export class RssAdapter extends BaseAdapter {
  readonly type = 'rss' as const;
  readonly name = 'RSS Feed Adapter';
  readonly parserVersion = '1.0';
  
  private feedUrl: string = '';

  configure(config: AdapterConfig): void {
    super.configure(config);
    this.feedUrl = (config.credentials?.feedUrl) || '';
  }

  async testConnection(): Promise<boolean> {
    if (!this.feedUrl) return false;
    
    try {
      const response = await fetch(this.feedUrl, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchRawItems(): Promise<RawItem[]> {
    if (!this.feedUrl) {
      throw new Error('RSS feed URL not configured');
    }

    await this.rateLimit();
    
    const response = await fetch(this.feedUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.statusText}`);
    }

    const xml = await response.text();
    const items = this.parseRssFeed(xml);
    const rawItems: RawItem[] = [];

    for (const item of items) {
      const contentHash = await this.hashContent(JSON.stringify(item));
      rawItems.push({
        externalId: item.guid || item.link || `item-${Date.now()}`,
        rawData: item as unknown as Record<string, unknown>,
        contentHash,
        retrievedAt: new Date(),
      });
    }

    return rawItems;
  }

  normalizeItem(raw: RawItem): NormalizedOpportunity {
    const data = raw.rawData as unknown as RssItem;
    
    return {
      externalId: raw.externalId,
      title: data.title || 'Untitled',
      synopsis: data.description,
      url: data.link,
      status: 'open',
      postedAt: data.pubDate ? new Date(data.pubDate) : undefined,
    };
  }

  private parseRssFeed(xml: string): RssItem[] {
    const items: RssItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      items.push({
        title: this.extractTag(itemXml, 'title') || '',
        link: this.extractTag(itemXml, 'link') || '',
        description: this.extractTag(itemXml, 'description') || '',
        pubDate: this.extractTag(itemXml, 'pubDate'),
        guid: this.extractTag(itemXml, 'guid'),
        category: this.extractTag(itemXml, 'category'),
      });
    }

    return items;
  }

  private extractTag(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>|<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? (match[1] || match[2])?.trim() : undefined;
  }
}

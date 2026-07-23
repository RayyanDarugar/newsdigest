// lib/digest/config.ts
export interface IndustryConfig {
  slug: string;
  name: string;
  subreddits: string[];
}

export const INDUSTRIES: IndustryConfig[] = [
  { slug: "sports-management", name: "Sports Management", subreddits: ["SportsBusiness"] },
  { slug: "media", name: "Media", subreddits: ["mediaindustry"] },
  { slug: "manufacturing", name: "Manufacturing", subreddits: ["manufacturing"] },
  { slug: "consulting", name: "Consulting", subreddits: ["consulting"] },
  { slug: "contracting", name: "Contracting", subreddits: ["Construction"] },
  { slug: "brick-and-mortar", name: "Brick & Mortar", subreddits: ["retail"] },
  { slug: "energy", name: "Energy", subreddits: ["energy"] },
  { slug: "logistics", name: "Logistics", subreddits: ["logistics"] },
  { slug: "real-estate", name: "Real Estate", subreddits: ["CommercialRealEstate", "realestateinvesting"] },
  { slug: "agriculture", name: "Agriculture", subreddits: ["agriculture"] },
];

export interface NewsFeedConfig {
  url: string;
  label: string;
}

// No API key needed — BBC's public RSS feeds.
export const NEWS_FEEDS: NewsFeedConfig[] = [
  { url: "http://feeds.bbci.co.uk/news/world/rss.xml", label: "BBC World" },
  { url: "http://feeds.bbci.co.uk/news/business/rss.xml", label: "BBC Business" },
];

export interface MarketTickerConfig {
  symbol: string;
  label: string;
}

// No API key needed — Yahoo Finance's public chart endpoint.
export const MARKET_TICKERS: MarketTickerConfig[] = [
  { symbol: "SPY", label: "S&P 500 (SPY)" },
  { symbol: "XLE", label: "Energy sector (XLE)" },
  { symbol: "XLRE", label: "Real estate sector (XLRE)" },
  { symbol: "IYT", label: "Transports (IYT)" },
];

export const CATEGORY_SLUGS = [
  "big_event",
  "world_news",
  "community_sentiment",
  "industry_events",
  "finance",
  "opportunities",
] as const;

export interface WikiSearchResult {
  content: {
    id: string;
    type: string;
    status: string;
    title: string;
    restrictions: Record<string, any>;
    _links: {
      webui: string;
      tinyui: string;
      self: string;
    };
    _expandable: Record<string, string>;
  };
  title: string;
  excerpt: string;
  url: string;
  resultGlobalContainer: {
    title: string;
    displayUrl: string;
  };
  entityType: string;
  iconCssClass: string;
  lastModified: string;
  friendlyLastModified: string;
  timestamp: number;
}

export interface WikiSearchResponse {
  results: WikiSearchResult[];
  start: number;
  limit: number;
  size: number;
  totalSize: number;
  cqlQuery: string;
  searchDuration: number;
  _links: {
    base: string;
    context: string;
  };
}

export interface SearchSummary {
  totalResults: number;
  searchDuration: number;
  query: string;
  results: Array<{
    id: string;
    title: string;
    type: string;
    url: string;
    space: string;
    lastModified: string;
    excerpt: string;
  }>;
}

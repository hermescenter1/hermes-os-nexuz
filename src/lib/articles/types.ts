// Phase 72.5 — Hermes Industrial Journal & Expert Network — type definitions

export type ArtStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
export type ArtVisibility = "PUBLIC" | "UNLISTED" | "PRIVATE";
export type ArtContentType =
  | "TECHNICAL_ARTICLE"
  | "INDUSTRIAL_CASE_STUDY"
  | "TROUBLESHOOTING_REPORT"
  | "PROJECT_REPORT"
  | "MAINTENANCE_INSIGHT"
  | "PLC_SCADA_TUTORIAL"
  | "FAILURE_ANALYSIS"
  | "ASSET_RELIABILITY_NOTE"
  | "ENGINEERING_OPINION"
  | "RESEARCH_SUMMARY"
  | "FIELD_COMMISSIONING_NOTE"
  | "SAFETY_COMPLIANCE_NOTE";
export type ArtLanguage = "EN" | "FA";
export type ArtReactionType = "INSIGHTFUL" | "HELPFUL" | "DETAILED" | "PRACTICAL";

export interface ArticleAuthorProfile {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  company: string | null;
  roleTitle: string | null;
  expertiseAreas: string[];
  location: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  followerCount: number;
  articleCount: number;
  totalViews: number;
  totalSaves: number;
  verifiedExpert: boolean;
  industrialCredibilityScore: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleCategory {
  id: string;
  slug: string;
  name: string;
  nameFa: string;
  description: string | null;
  color: string;
  isActive: boolean;
  sortOrder: number;
  articleCount?: number;
}

export interface ArticleTag {
  id: string;
  slug: string;
  name: string;
  nameFa: string | null;
  articleCount?: number;
}

export interface ArticleKnowledgeMetadata {
  knowledgeEligible: boolean;
  reviewedForKnowledge: boolean;
  articleQualityScore: number | null;
  sourceReliability: string | null;
  evidenceLevel: string | null;
  industrialDomain: string | null;
  linkedAssetType: string | null;
  linkedFailureMode: string | null;
  linkedTechnology: string | null;
  linkedStandard: string | null;
  linkedVendor: string | null;
  linkedPLCPlatform: string | null;
  linkedMaintenanceDomain: string | null;
  safetyCritical: boolean;
  humanReviewed: boolean;
}

export interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  excerpt: string | null;
  coverImageUrl: string | null;
  language: ArtLanguage;
  contentType: ArtContentType;
  status: ArtStatus;
  visibility: ArtVisibility;
  authorId: string;
  author: ArticleAuthorProfile;
  categoryId: string | null;
  category: ArticleCategory | null;
  tags: ArticleTag[];
  readingTimeMinutes: number;
  publishedAt: string | null;
  rejectionReason: string | null;
  viewCount: number;
  saveCount: number;
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
  updatedAt: string;
  knowledgeMetadata?: ArticleKnowledgeMetadata | null;
}

export interface ArticleDetail extends ArticleListItem {
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  noIndex: boolean;
  knowledgeMetadata: ArticleKnowledgeMetadata | null;
}

export interface ArticleFeed {
  featured: ArticleListItem | null;
  editorsPicks: ArticleListItem[];
  trending: ArticleListItem[];
  latest: ArticleListItem[];
  caseStudies: ArticleListItem[];
  categories: ArticleCategory[];
  topAuthors: ArticleAuthorProfile[];
  totalArticles: number;
}

export interface ArticleFilters {
  status?: ArtStatus;
  visibility?: ArtVisibility;
  contentType?: ArtContentType;
  language?: ArtLanguage;
  categorySlug?: string;
  tagSlug?: string;
  authorHandle?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ArticleModerationItem extends ArticleListItem {
  rejectionReason: string | null;
}

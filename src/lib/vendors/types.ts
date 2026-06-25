export type VendorType =
  | "TECHNOLOGY_PROVIDER"
  | "SYSTEM_INTEGRATOR"
  | "SERVICE_PROVIDER"
  | "MANUFACTURER"
  | "DISTRIBUTOR"
  | "CONSULTANT"
  | "TRAINING_PROVIDER";

export type VendorTier = "PREMIUM" | "CERTIFIED" | "STANDARD";

export type VendorStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";

export type VendorComplianceStatus =
  | "PENDING"
  | "COMPLIANT"
  | "NON_COMPLIANT"
  | "UNDER_REVIEW"
  | "EXEMPT";

export type VendorDocType =
  | "CERTIFICATION"
  | "INSURANCE"
  | "COMPANY_REGISTRATION"
  | "PRODUCT_CATALOG"
  | "CASE_STUDY"
  | "PARTNERSHIP_AGREEMENT"
  | "NDA"
  | "OTHER";

export interface VendorCategoryItem {
  id:            string;
  slug:          string;
  nameEn:        string;
  nameFa:        string;
  descriptionEn: string | null;
  descriptionFa: string | null;
  icon:          string | null;
  sortOrder:     number;
  isActive:      boolean;
}

export interface VendorCapabilityItem {
  id:         string;
  nameEn:     string;
  nameFa:     string;
  category:   string;
  level:      string;
  isVerified: boolean;
}

export interface VendorServiceItem {
  id:            string;
  nameEn:        string;
  nameFa:        string;
  descriptionEn: string | null;
  descriptionFa: string | null;
  category:      string | null;
  priceModel:    string | null;
  isActive:      boolean;
}

export interface VendorProductItem {
  id:            string;
  nameEn:        string;
  nameFa:        string;
  descriptionEn: string | null;
  descriptionFa: string | null;
  category:      string | null;
  skuCode:       string | null;
  imageUrl:      string | null;
  productUrl:    string | null;
  isActive:      boolean;
}

export interface VendorComplianceRecordItem {
  id:             string;
  complianceType: string;
  status:         VendorComplianceStatus;
  certBody:       string | null;
  certNumber:     string | null;
  issuedAt:       string | null;
  expiresAt:      string | null;
}

export interface VendorListItem {
  id:                  string;
  slug:                string;
  nameEn:              string;
  nameFa:              string;
  logoUrl:             string | null;
  websiteUrl:          string | null;
  headquartersCity:    string | null;
  headquartersCountry: string;
  vendorType:          VendorType;
  tier:                VendorTier;
  status:              VendorStatus;
  isVerified:          boolean;
  isFeatured:          boolean;
  complianceStatus:    VendorComplianceStatus;
  regionsServed:       string[];
  performanceScore:    number | null;
  averageRating:       number | null;
  reviewCount:         number;
  category:            VendorCategoryItem | null;
  _count:              { services: number; products: number; capabilities: number };
  createdAt:           string;
}

export interface VendorDetailItem extends VendorListItem {
  descriptionEn:     string | null;
  descriptionFa:     string | null;
  contactEmail:      string | null;
  contactPhone:      string | null;
  foundedYear:       number | null;
  employeeCount:     string | null;
  capabilities:      VendorCapabilityItem[];
  services:          VendorServiceItem[];
  products:          VendorProductItem[];
  complianceRecords: VendorComplianceRecordItem[];
}

export interface VendorOnboardingRequestItem {
  id:                  string;
  companyNameEn:       string;
  companyNameFa:       string | null;
  websiteUrl:          string | null;
  headquartersCity:    string | null;
  headquartersCountry: string;
  contactNameEn:       string;
  contactEmail:        string;
  contactPhone:        string | null;
  contactTitle:        string | null;
  vendorType:          string;
  categorySlug:        string | null;
  servicesOffered:     string[];
  industrialExpertise: string[];
  regionsServed:       string[];
  certifications:      string[];
  companyDescEn:       string | null;
  status:              string;
  reviewedBy:          string | null;
  rejectionReason:     string | null;
  privacyAccepted:     boolean;
  termsAccepted:       boolean;
  gdprAccepted:        boolean;
  submittedAt:         string;
  createdAt:           string;
}

export interface VendorApplyPayload {
  companyNameEn:       string;
  companyNameFa?:      string;
  websiteUrl?:         string;
  headquartersCity?:   string;
  headquartersCountry?: string;
  foundedYear?:        number;
  employeeCount?:      string;
  contactNameEn:       string;
  contactNameFa?:      string;
  contactEmail:        string;
  contactPhone?:       string;
  contactTitle?:       string;
  vendorType:          VendorType;
  categorySlug?:       string;
  servicesOffered:     string[];
  industrialExpertise: string[];
  regionsServed:       string[];
  certifications:      string[];
  companyDescEn?:      string;
  companyDescFa?:      string;
  privacyAccepted:     boolean;
  termsAccepted:       boolean;
  gdprAccepted:        boolean;
}

export const VENDOR_TYPES: VendorType[] = [
  "TECHNOLOGY_PROVIDER",
  "SYSTEM_INTEGRATOR",
  "SERVICE_PROVIDER",
  "MANUFACTURER",
  "DISTRIBUTOR",
  "CONSULTANT",
  "TRAINING_PROVIDER",
];

export const VENDOR_TIERS: VendorTier[] = ["PREMIUM", "CERTIFIED", "STANDARD"];

export const INDUSTRIAL_EXPERTISE_OPTIONS = [
  "PLC Programming",
  "SCADA Systems",
  "HMI Design",
  "OT Cybersecurity",
  "Industrial AI",
  "IIoT Connectivity",
  "Process Automation",
  "Electrical Engineering",
  "Instrumentation",
  "Industrial Networking",
  "MES/ERP Integration",
  "Digital Twin",
  "Predictive Maintenance",
  "Energy Management",
  "Safety Systems (SIL)",
] as const;

export const REGIONS_OPTIONS = [
  "Iran",
  "Middle East (MENA)",
  "Central Asia",
  "Europe",
  "Asia Pacific",
  "North America",
  "Global",
] as const;

export const CERTIFICATIONS_OPTIONS = [
  "ISO 9001",
  "ISO 27001",
  "ISO 45001",
  "IEC 62443",
  "CE Marking",
  "ATEX",
  "UL Listed",
  "TÜV Certified",
  "Siemens Solution Partner",
  "Schneider Electric Partner",
  "ABB Authorized Partner",
  "Rockwell Automation Partner",
] as const;

export const SERVICES_OPTIONS = [
  "PLC Engineering",
  "SCADA Design & Integration",
  "HMI Development",
  "Industrial Cybersecurity",
  "Industrial AI Solutions",
  "IIoT Platform Integration",
  "Control Panel Manufacturing",
  "Field Instrumentation",
  "Commissioning & Start-up",
  "Maintenance & Support",
  "Training & Certification",
  "Digital Transformation Consulting",
] as const;

import { gtagReady } from "./gtag";

export type AnalyticsEvent =
  | "login"
  | "logout"
  | "sign_up"
  | "candidate_registration"
  | "apply_job"
  | "enroll_course"
  | "download_certificate"
  | "contact_form_submit"
  | "search"
  | "knowledge_graph_search"
  | "brain_query"
  | "platform_demo_request";

export interface EventParams {
  method?:      string;
  search_term?: string;
  item_id?:     string;
  item_name?:   string;
  category?:    string;
}

export function trackEvent(name: AnalyticsEvent, params?: EventParams): void {
  if (!gtagReady()) return;
  window.gtag("event", name, params ?? {});
}

export const track = {
  login:                  (method = "email") => trackEvent("login",                  { method }),
  logout:                 ()                 => trackEvent("logout"),
  signup:                 (method = "email") => trackEvent("sign_up",                { method }),
  candidateRegistration:  ()                 => trackEvent("candidate_registration"),
  applyJob:               (id: string, name: string) => trackEvent("apply_job",      { item_id: id, item_name: name }),
  enrollCourse:           (id: string, name: string) => trackEvent("enroll_course",  { item_id: id, item_name: name }),
  downloadCertificate:    (id: string)       => trackEvent("download_certificate",   { item_id: id }),
  contactForm:            ()                 => trackEvent("contact_form_submit"),
  search:                 (term: string)     => trackEvent("search",                 { search_term: term }),
  knowledgeGraphSearch:   (term: string)     => trackEvent("knowledge_graph_search", { search_term: term }),
  brainQuery:             ()                 => trackEvent("brain_query"),
  platformDemoRequest:    ()                 => trackEvent("platform_demo_request"),
} as const;

export const TRACKED_EVENTS: Array<{ event: AnalyticsEvent; description: string }> = [
  { event: "login",                  description: "User signed in" },
  { event: "logout",                 description: "User signed out" },
  { event: "sign_up",                description: "New account registered" },
  { event: "candidate_registration", description: "Candidate portal registration" },
  { event: "apply_job",              description: "Job application submitted" },
  { event: "enroll_course",          description: "Academy course enrollment" },
  { event: "download_certificate",   description: "Training certificate downloaded" },
  { event: "contact_form_submit",    description: "Contact form submitted" },
  { event: "search",                 description: "Site search performed" },
  { event: "knowledge_graph_search", description: "Knowledge graph queried" },
  { event: "brain_query",            description: "AI Brain queried" },
  { event: "platform_demo_request",  description: "Demo request initiated" },
];

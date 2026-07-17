/**
 * PHASE 87G — CRM & sales-operations experience.
 *
 * The premium /crm landing surface + shared CRM primitives on the 87B design
 * system, reusing the dashboard-experience layout blocks (AttentionPanel,
 * SafeActionGrid, states) instead of duplicating them. Presentation only:
 * data comes from the EXISTING /api/crm endpoints; authorization stays with
 * the API + RequireCapability("admin") in the /crm layout, unchanged.
 */
export { CrmCommandClient } from "./CrmCommandClient";
export { CrmSubNav } from "./CrmSubNav";
export { LeadStatusBadge, StageBadge } from "./LeadStatusBadge";
export { deriveCrmAttention, formatMoney, type CrmAttentionItem } from "./logic";

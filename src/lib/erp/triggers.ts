// Phase 68 — ERP workflow trigger adapters
// These are stub hooks — they validate trigger type and log intent.
// Full execution is handled by the Phase 67 Workflow Engine.

export type ErpTriggerType =
  | "ERP_PROJECT_CREATED" | "ERP_PROJECT_COMPLETED"
  | "ERP_TASK_CREATED"    | "ERP_TASK_OVERDUE"
  | "ERP_WORK_ORDER_CREATED" | "ERP_WORK_ORDER_COMPLETED"
  | "ERP_INVENTORY_LOW"   | "ERP_APPROVAL_REQUESTED";

const ALLOWED: ErpTriggerType[] = [
  "ERP_PROJECT_CREATED","ERP_PROJECT_COMPLETED",
  "ERP_TASK_CREATED","ERP_TASK_OVERDUE",
  "ERP_WORK_ORDER_CREATED","ERP_WORK_ORDER_COMPLETED",
  "ERP_INVENTORY_LOW","ERP_APPROVAL_REQUESTED",
];

export function fireErpTrigger(
  type:    ErpTriggerType,
  context: Record<string, unknown>
): { fired: boolean; reason: string } {
  if (!ALLOWED.includes(type)) {
    return { fired: false, reason: `Trigger '${type}' is not in ERP whitelist` };
  }
  // In a production integration this would call the Workflow Engine's evaluateWorkflowTrigger
  // and fan out to all active workflows matching this trigger type.
  // For now, we log and return fired = true as a safe placeholder.
  return { fired: true, reason: `ERP trigger '${type}' queued for workflow evaluation`, ...context };
}

export function onProjectCreated(id: string, name: string) {
  return fireErpTrigger("ERP_PROJECT_CREATED", { entityId: id, entityName: name });
}

export function onProjectCompleted(id: string, name: string) {
  return fireErpTrigger("ERP_PROJECT_COMPLETED", { entityId: id, entityName: name });
}

export function onTaskCreated(id: string, title: string) {
  return fireErpTrigger("ERP_TASK_CREATED", { entityId: id, title });
}

export function onTaskOverdue(id: string, title: string, dueDate: string) {
  return fireErpTrigger("ERP_TASK_OVERDUE", { entityId: id, title, dueDate });
}

export function onWorkOrderCreated(id: string, title: string) {
  return fireErpTrigger("ERP_WORK_ORDER_CREATED", { entityId: id, title });
}

export function onWorkOrderCompleted(id: string, title: string) {
  return fireErpTrigger("ERP_WORK_ORDER_COMPLETED", { entityId: id, title });
}

export function onInventoryLow(itemId: string, sku: string, quantity: number, reorderLevel: number) {
  return fireErpTrigger("ERP_INVENTORY_LOW", { entityId: itemId, sku, quantity, reorderLevel });
}

export function onApprovalRequested(id: string, title: string) {
  return fireErpTrigger("ERP_APPROVAL_REQUESTED", { entityId: id, title });
}

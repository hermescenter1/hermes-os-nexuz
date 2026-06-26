// Phase 70 — CMMS KPI calculations (MTBF, MTTR, Availability, Compliance)

import type {
  MaintenanceTask, MaintenanceFailure, MaintenanceDowntime, CmmsKpis,
} from "./types";

export function computeKpis(
  tasks:    MaintenanceTask[],
  failures: MaintenanceFailure[],
  downtime: MaintenanceDowntime[],
): CmmsKpis {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;

  // MTBF — mean time between failures (hours)
  // = (Total operating time) / (Number of failures)
  const resolvedFailures = failures.filter(f => f.resolvedAt);
  const totalDowntimeHours = downtime.reduce((sum, d) => {
    return sum + (d.durationMinutes ?? 0) / 60;
  }, 0);
  const operatingHours = 30 * 24 - totalDowntimeHours; // assume 30-day window
  const mtbf = resolvedFailures.length > 0
    ? Math.round((operatingHours / resolvedFailures.length) * 10) / 10
    : 720;

  // MTTR — mean time to repair (hours)
  const repairTimes: number[] = resolvedFailures
    .filter(f => f.occurredAt && f.resolvedAt)
    .map(f => {
      const occurred = new Date(f.occurredAt).getTime();
      const resolved = new Date(f.resolvedAt!).getTime();
      return (resolved - occurred) / 3600000;
    });
  const mttr = repairTimes.length > 0
    ? Math.round((repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length) * 10) / 10
    : 0;

  // Availability = (Total time - Downtime) / Total time × 100
  const totalMinutes = 30 * 24 * 60;
  const unplannedDowntime = downtime
    .filter(d => d.reason !== "PLANNED_MAINTENANCE")
    .reduce((sum, d) => sum + (d.durationMinutes ?? 0), 0);
  const availability = Math.round(((totalMinutes - unplannedDowntime) / totalMinutes) * 1000) / 10;

  // Maintenance compliance = completed on-time / total scheduled
  const scheduledLast30 = tasks.filter(t => {
    const sd = t.scheduledDate ? new Date(t.scheduledDate).getTime() : 0;
    return sd >= thirtyDaysAgo && sd <= now && t.workOrderType === "PLANNED";
  });
  const completedOnTime = scheduledLast30.filter(t => {
    if (t.status !== "COMPLETED" || !t.completedAt || !t.dueDate) return false;
    return new Date(t.completedAt).getTime() <= new Date(t.dueDate).getTime();
  });
  const maintenanceCompliance = scheduledLast30.length > 0
    ? Math.round((completedOnTime.length / scheduledLast30.length) * 1000) / 10
    : 100;

  // Overdue count
  const overdueCount = tasks.filter(t => t.status === "OVERDUE").length;

  // Emergency work %
  const totalTasks30 = tasks.filter(t => {
    const created = new Date(t.createdAt).getTime();
    return created >= thirtyDaysAgo;
  });
  const emergencyTasks = totalTasks30.filter(t => t.workOrderType === "EMERGENCY");
  const emergencyWorkPct = totalTasks30.length > 0
    ? Math.round((emergencyTasks.length / totalTasks30.length) * 1000) / 10
    : 0;

  // Technician utilization (simplified: actual hours / estimated hours)
  const completedTasks = tasks.filter(t => t.status === "COMPLETED" && t.actualHours && t.estimatedHours);
  const totalActual = completedTasks.reduce((s, t) => s + (t.actualHours ?? 0), 0);
  const totalEstimated = completedTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
  const technicianUtilization = totalEstimated > 0
    ? Math.round((totalActual / totalEstimated) * 1000) / 10
    : 85;

  // Total downtime hours
  const totalDowntimeHoursAll = Math.round(totalDowntimeHours * 10) / 10;

  // Costs not available at KPI level — zero placeholder
  const totalCost = 0;

  const failureCount = failures.filter(f => {
    const occurred = new Date(f.occurredAt).getTime();
    return occurred >= thirtyDaysAgo;
  }).length;

  const completedThisMonth = tasks.filter(t => {
    if (t.status !== "COMPLETED" || !t.completedAt) return false;
    return new Date(t.completedAt).getTime() >= thirtyDaysAgo;
  }).length;

  const scheduledThisMonth = tasks.filter(t => {
    const sd = t.scheduledDate ? new Date(t.scheduledDate).getTime() : 0;
    return sd >= thirtyDaysAgo;
  }).length;

  return {
    mtbf,
    mttr,
    availability,
    maintenanceCompliance,
    overdueCount,
    emergencyWorkPct,
    technicianUtilization,
    totalDowntimeHours: totalDowntimeHoursAll,
    totalCost,
    failureCount,
    completedThisMonth,
    scheduledThisMonth,
  };
}

export function computeDowntimeTrend(
  downtime: MaintenanceDowntime[],
): { month: string; minutes: number }[] {
  const months: Record<string, number> = {};
  downtime.forEach(d => {
    const m = d.startedAt.slice(0, 7);
    months[m] = (months[m] ?? 0) + (d.durationMinutes ?? 0);
  });
  return Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, minutes]) => ({ month, minutes }));
}

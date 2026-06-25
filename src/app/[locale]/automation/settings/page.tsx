export const dynamic = "force-dynamic";

export default function AutomationSettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Automation Settings</h1>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">General</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <div className="font-medium">Workflow Engine Mode</div>
              <div className="text-muted-foreground text-xs">All actions are deterministic and whitelisted.</div>
            </div>
            <span className="px-2 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400 text-xs font-medium">Deterministic</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <div className="font-medium">Audit Trail</div>
              <div className="text-muted-foreground text-xs">All workflow events are logged for compliance.</div>
            </div>
            <span className="px-2 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400 text-xs font-medium">Enabled</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <div className="font-medium">RBAC Protection</div>
              <div className="text-muted-foreground text-xs">Admin and authoring roles required to manage workflows.</div>
            </div>
            <span className="px-2 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400 text-xs font-medium">Enforced</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Simulation Mode</div>
              <div className="text-muted-foreground text-xs">Test workflows without real side effects.</div>
            </div>
            <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 text-xs font-medium">Available</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">About</h2>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Hermes OS Workflow Automation Engine — Phase 67</p>
          <p>12 Prisma models · 13 API routes · 6 built-in templates</p>
          <p>All workflow actions are whitelisted. No AI-generated uncontrolled actions.</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  Drawer,
  EmptyState,
  FormField,
  IconButton,
  InsightCard,
  Input,
  KpiCard,
  Radio,
  Skeleton,
  StatusIndicator,
  Switch,
  Tabs,
  TechnicalValue,
  Textarea,
  Tooltip,
} from "@/components/ds";

/**
 * Non-routable development FIXTURE for the Hermes Design System.
 *
 * This component is intentionally NOT wired to any route (the earlier
 * `[locale]/ds-showcase` route was removed in the PHASE 87B amendment so the
 * showcase can never be reachable — in production or otherwise). It exists only
 * as a local development reference: import and render it ad-hoc in a scratch
 * page, or point a future Storybook/story at it. Nothing in the app imports it,
 * so it is never bundled or served. Demonstrates variants, states, RTL/LTR, and
 * technical LTR isolation inside Persian.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-role-h3 font-semibold text-text-primary">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function DsShowcase() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState("evidence");
  const [switchOn, setSwitchOn] = useState(true);

  return (
    <div className="min-h-screen bg-background-base p-8 text-text-primary">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="flex flex-col gap-2">
          <span className="text-label-compact font-semibold uppercase tracking-wide text-brand-primary">
            PHASE 87B · Development showcase
          </span>
          <h1 className="text-role-h1 font-bold">Hermes Design System</h1>
          <p className="text-body-lg text-text-secondary">Canonical components on the approved token foundation.</p>
        </header>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Request a Demo</Button>
            <Button variant="secondary">Explore</Button>
            <Button variant="tertiary">Learn more</Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="primary" loading>
              Saving
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <IconButton aria-label="Settings" icon="⚙" />
            <Tooltip content="Opens Industrial Brain">
              <Button variant="secondary" size="sm">
                Hover me
              </Button>
            </Tooltip>
          </div>
        </Section>

        <Section title="Inputs & validation">
          <div className="grid max-w-md gap-4">
            <FormField label="Asset tag" description="Site B compressor line">
              <Input placeholder="e.g. PT-4012" />
            </FormField>
            <FormField label="Email" error="Enter a valid work email address.">
              <Input type="email" dir="ltr" defaultValue="engineer@" error />
            </FormField>
            <FormField label="Notes">
              <Textarea placeholder="Observations…" />
            </FormField>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-label">
                <Checkbox defaultChecked /> Remember me
              </label>
              <label className="flex items-center gap-2 text-label">
                <Radio name="demo" defaultChecked /> Option A
              </label>
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} aria-label="Live mode" />
            </div>
          </div>
        </Section>

        <Section title="Badges & status">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="brand">Brand</Badge>
            <Badge variant="success">Verified</Badge>
            <Badge variant="warning">Review</Badge>
            <Badge variant="danger">Contradiction</Badge>
            <Badge variant="information">Info</Badge>
            <Badge variant="hypothesis">Hypothesis</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <StatusIndicator status="success" label="12 sites online" />
            <StatusIndicator status="warning" label="1 gateway degraded" />
            <StatusIndicator status="danger" label="3 critical alarms" pulse />
            <StatusIndicator status="neutral" label="Idle" />
          </div>
        </Section>

        <Section title="Cards">
          <div className="grid gap-4 md:grid-cols-3">
            <Card variant="standard">
              <p className="text-label font-semibold">Standard (E1)</p>
              <p className="text-body text-text-secondary">Resting surface.</p>
            </Card>
            <Card variant="elevated">
              <p className="text-label font-semibold">Elevated (E2)</p>
              <p className="text-body text-text-secondary">Raised panel.</p>
            </Card>
            <Card variant="interactive" tabIndex={0} role="button">
              <p className="text-label font-semibold">Interactive</p>
              <p className="text-body text-text-secondary">Hover / focus me.</p>
            </Card>
            <KpiCard label="OEE" value="96.1%" delta="up" deltaLabel="+1.2 pts" />
            <KpiCard label="Open cases" value="23" delta="down" deltaLabel="-4" />
            <InsightCard eyebrow="Intelligence insight" title="Bearing wear on P-204" confidence="Confidence: HIGH · 0.86">
              Vibration RMS <TechnicalValue>+18%</TechnicalValue> over 14 days while load held constant.
            </InsightCard>
          </div>
        </Section>

        <Section title="Alerts">
          <Alert variant="information" title="Deterministic analysis">
            This module runs a deterministic reasoning pipeline.
          </Alert>
          <Alert variant="warning" title="Incomplete evidence">
            A recent FFT spectrum is required to confirm the hypothesis.
          </Alert>
          <Alert variant="danger" title="Failed interlock">
            Safety interlock did not confirm — action blocked.
          </Alert>
        </Section>

        <Section title="Loading, empty & error states">
          <div className="grid gap-4 md:grid-cols-3">
            <Card aria-busy>
              <div className="flex flex-col gap-2">
                <Skeleton shape="text" width="60%" />
                <Skeleton height={40} />
                <Skeleton shape="text" width="40%" />
              </div>
            </Card>
            <Card padded={false}>
              <EmptyState icon="◎" title="No analyses yet" message="Ask an engineering question to begin." action={<Button size="sm">Ask Hermes</Button>} />
            </Card>
          </div>
        </Section>

        <Section title="Tabs & overlays">
          <Tabs
            aria-label="Reasoning sections"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "evidence", label: "Evidence" },
              { value: "contradictions", label: "Contradictions" },
              { value: "missing", label: "Missing" },
            ]}
          />
          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="text-body text-text-secondary">
            Selected: {tab}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
              Open drawer
            </Button>
          </div>
        </Section>

        <Section title="RTL / LTR & technical isolation">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <p className="mb-2 text-label-compact uppercase text-text-muted">English · LTR</p>
              <p className="text-body">
                Sensor <TechnicalValue>PT-4012</TechnicalValue> reads <TechnicalValue>6.2 bar</TechnicalValue>.
              </p>
            </Card>
            <div dir="rtl">
              <Card>
                <p className="mb-2 text-label-compact uppercase text-text-muted">فارسی · RTL</p>
                <p className="text-body">
                  فشار سنسور <TechnicalValue>PT-4012</TechnicalValue> برابر <TechnicalValue>6.2 bar</TechnicalValue> است.
                </p>
              </Card>
            </div>
          </div>
        </Section>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Save as Case"
        description="This will persist the analysis to the case library."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              Save
            </Button>
          </>
        }
      >
        Focus is trapped here; Escape or the backdrop closes it.
      </Dialog>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} side="end" title="Context panel">
        The drawer anchors to the inline-end edge and mirrors under RTL.
      </Drawer>
    </div>
  );
}

/**
 * /{locale}/dashboard/clients/new — record a customer of the active organization.
 * Only `manage_customers` holders get the form; the API enforces the same rule.
 */
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { resolveCustomerPageScope } from "@/lib/customers/page-scope";
import { eligibleOwners } from "@/lib/customers/service";
import { ExecutiveScopeNotice } from "@/components/executive/ExecutiveScopeNotice";
import { Panel } from "@/components/executive/ExecutiveSummaryView";
import { CustomerForm } from "@/components/tenant-customers/CustomerForm";
import { customerFormLabels } from "@/components/tenant-customers/labels";

export const metadata = noIndexMetadata("New customer");
export const dynamic = "force-dynamic";

export default async function NewCustomerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("executive");
  const resolved = await resolveCustomerPageScope();
  const listHref = `/${locale}/dashboard/clients`;

  let body: React.ReactNode;
  if (!resolved.ok) {
    body = <ExecutiveScopeNotice code={resolved.code} memberships={resolved.memberships} />;
  } else if (!resolved.scope.canManage) {
    body = <p className="text-sm text-muted">{t("customers.readOnly")}</p>;
  } else {
    const { scope } = resolved;
    const owners = await eligibleOwners({ organizationId: scope.organizationId, userId: scope.userId, correlationId: "page" }).catch(() => []);
    body = (
      <Panel title={t("customers.newTitle")} lede={t("customers.newLede")}>
        <CustomerForm
          mode="create"
          listHref={listHref}
          owners={owners}
          initial={{
            displayName: "",
            legalName: null,
            status: "ACTIVE",
            email: null,
            phone: null,
            city: null,
            country: null,
            notes: null,
            followUpOwnerId: scope.userId,
            nextActionAt: null,
            nextActionNote: null,
          }}
          labels={customerFormLabels(k => t(k as never), "create")}
        />
      </Panel>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 px-6 sm:px-8">
        <Link href={listHref} className="text-sm text-muted underline">
          {t("customers.back")}
        </Link>
        <PageHeader eyebrow={t("eyebrow")} title={t("customers.newTitle")} level="page" />
        {body}
      </div>
    </AppShell>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_DESIGN, SAMPLE_CERTIFICATE, toDesign } from "@/lib/certificate-design";
import { certificateCodes } from "@/lib/lms/certificates";
import { Breadcrumbs, PageHeader } from "@/components/dashboard/ui";
import { DeleteButton } from "@/components/admin/forms";
import { TemplateEditor } from "@/components/admin/TemplateEditor";
import { deleteTemplate } from "../../actions";

export const metadata: Metadata = { title: "Certificate template" };

export default async function TemplatePage({ params }: PageProps<"/admin/certificates/templates/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const template = id === "new" ? null : await prisma.certificateTemplate.findUnique({ where: { id } });
  if (id !== "new" && !template) notFound();

  const { qrSvg, barcodeSvg } = certificateCodes(SAMPLE_CERTIFICATE.serial);
  const title = template?.name ?? "New template";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Certificates", href: "/admin/certificates?tab=templates" },
          { label: title },
        ]}
      />
      <PageHeader
        eyebrow="Certificate template"
        title={title}
        description="Choose the layout, colours and wording. Certificates already issued with this template update too."
        actions={
          template &&
          !template.isDefault && (
            <DeleteButton
              onDelete={deleteTemplate.bind(null, template.id)}
              confirmText={`Delete “${template.name}”? Courses and certificates using it switch to the default template.`}
              label="Delete"
            />
          )
        }
      />
      <TemplateEditor
        id={template?.id ?? null}
        initial={template ? toDesign(template) : DEFAULT_DESIGN}
        initialName={template?.name ?? ""}
        qrSvg={qrSvg}
        barcodeSvg={barcodeSvg}
      />
    </div>
  );
}

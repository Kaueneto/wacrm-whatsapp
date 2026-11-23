import { TemplateManager } from '@/components/campaigns/template-manager';

export default async function TemplatePage({ params }: PageProps<'/campaigns/templates/[id]'>) {
  const { id } = await params;
  return <TemplateManager templateId={id} />;
}

export default function OrganizationLoading() {
  return (
    <div
      role="status"
      aria-label="Carregando usuários e equipes"
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Usuários e equipes</h1>
        <p className="text-muted-foreground text-sm">
          Organize as pessoas e a estrutura de atendimento da empresa.
        </p>
      </div>
      <div className="bg-muted h-10 w-64 animate-pulse rounded-lg motion-reduce:animate-none" />
      <div className="border-border bg-card h-[65vh] animate-pulse rounded-xl border motion-reduce:animate-none" />
      <span className="sr-only">Carregando estrutura…</span>
    </div>
  );
}

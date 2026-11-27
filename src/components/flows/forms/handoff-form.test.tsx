import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/pt.json";
import { HandoffForm } from "./handoff-form";
import type { HandoffNodeConfig } from "@/lib/flows/types";

const { useRoutingCatalog } = vi.hoisted(() => ({ useRoutingCatalog: vi.fn() }));
vi.mock("../routing-catalog", () => ({ useRoutingCatalog }));

const organization = {
  departments: [{ id: "department", name: "Financeiro" }],
  teams: [{ id: "team", name: "Cobrança", department_id: "department" }],
  members: [{ team_id: "team", user_id: "agent" }],
};

function render(cfg: HandoffNodeConfig) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="pt" messages={messages} timeZone="America/Sao_Paulo">
      <HandoffForm cfg={cfg} onUpdateConfig={() => {}} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => useRoutingCatalog.mockReset());

describe("handoff catalog loading", () => {
  it("keeps the saved destination while loading without declaring it unavailable", () => {
    useRoutingCatalog.mockReturnValue({
      organization: { data: null, error: false },
      roster: { data: null, error: false },
    });
    const html = render({ mode: "specific", team_id: "team", assign_to: "agent" });
    expect(html).toContain('value="team" selected=""');
    expect(html).toContain('value="agent" selected=""');
    expect(html).toContain("Carregando destinos");
    expect(html).not.toContain("Destino indisponível");
  });

  it("enables the team selector while the agent selector is still loading", () => {
    useRoutingCatalog.mockReturnValue({
      organization: { data: organization, error: false },
      roster: { data: null, error: false },
    });
    const html = render({ mode: "specific", team_id: "team" });
    const selects = html.match(/<select[^>]*>/g) ?? [];
    expect(selects).toHaveLength(3);
    expect(selects[0]).not.toContain("disabled");
    expect(selects[2]).toContain("disabled");
    expect(html).toContain("Financeiro");
    expect(html).toContain("Cobrança");
  });

  it("does not block queue routing when only the roster request fails", () => {
    useRoutingCatalog.mockReturnValue({
      organization: { data: organization, error: false },
      roster: { data: null, error: true },
    });
    const html = render({ mode: "queue", team_id: "team" });
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/<select[^>]*\sdisabled/);
    expect(html).toContain("Cobrança");
  });

  it("only offers members of the destination team for a specific assignment", () => {
    useRoutingCatalog.mockReturnValue({
      organization: { data: organization, error: false },
      roster: { data: { members: [
        { user_id: "agent", full_name: "Ana", role: "agent" },
        { user_id: "another-team", full_name: "Bruno", role: "agent" },
      ] }, error: false },
    });
    const html = render({ mode: "specific", team_id: "team", assign_to: "agent" });
    expect(html).toContain('value="agent" selected=""');
    expect(html).toContain("Ana");
    expect(html).not.toContain("Bruno");
  });
});

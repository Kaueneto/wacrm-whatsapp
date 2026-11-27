"use client";

import { useTranslations } from "next-intl";
import type { HandoffNodeConfig } from "@/lib/flows/types";
import { TextRow } from "./fields";
import { useRoutingCatalog } from "../routing-catalog";

export function HandoffForm({
  cfg,
  onUpdateConfig,
}: {
  cfg: HandoffNodeConfig;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("Flows.builder.form");
  const catalog = useRoutingCatalog();
  const organization = catalog.organization.data;
  const members = catalog.roster.data?.members ?? [];
  const mode = cfg.mode ?? (cfg.assign_to ? "specific" : "legacy");
  const error = catalog.organization.error || (mode === "specific" && catalog.roster.error);
  const eligible = members.filter(
    (member) =>
      ["owner", "admin", "supervisor", "agent"].includes(member.role) &&
      (!cfg.team_id ||
        organization?.members.some(
          (link) =>
            link.team_id === cfg.team_id && link.user_id === member.user_id,
        )),
  );
  const selectClass =
    "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";
  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="text-destructive text-xs">
          {t("routingLoadError")}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              if (catalog.organization.error) catalog.organization.retry();
              if (catalog.roster.error) catalog.roster.retry();
            }}
          >
            {t("routingRetry")}
          </button>
        </div>
      )}
      <label className="block space-y-1 text-xs">
        <span>{t("routingTeam")}</span>
        <select
          className={selectClass}
          disabled={!organization}
          value={cfg.team_id ?? ""}
          onChange={(event) =>
            onUpdateConfig({
              team_id: event.target.value,
              assign_to: "",
              mode: mode === "legacy" ? "queue" : mode,
            })
          }
        >
          <option value="">{t(organization ? "routingKeepTeam" : catalog.organization.error ? "routingLoadError" : "routingLoading")}</option>
          {organization?.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {
                organization.departments.find(
                  (department) => department.id === team.department_id,
                )?.name
              }{" "}
              / {team.name}
            </option>
          ))}
          {cfg.team_id &&
            !organization?.teams.some((team) => team.id === cfg.team_id) && (
              <option value={cfg.team_id}>{t(organization ? "routingUnavailable" : catalog.organization.error ? "routingLoadError" : "routingLoading")}</option>
            )}
        </select>
      </label>
      <label className="block space-y-1 text-xs">
        <span>{t("routingMode")}</span>
        <select
          className={selectClass}
          value={mode}
          onChange={(event) =>
            onUpdateConfig({ mode: event.target.value, assign_to: "" })
          }
        >
          {mode === "legacy" && (
            <option value="legacy">{t("routingLegacy")}</option>
          )}
          <option value="queue">{t("routingQueue")}</option>
          <option value="team_queue">{t("routingTeamQueue")}</option>
          <option value="round_robin">{t("routingRoundRobin")}</option>
          <option value="specific">{t("routingSpecific")}</option>
        </select>
      </label>
      {mode === "specific" && (
        <label className="block space-y-1 text-xs">
          <span>{t("routingAgent")}</span>
          <select
            className={selectClass}
            disabled={!organization || !catalog.roster.data}
            value={cfg.assign_to ?? ""}
            onChange={(event) =>
              onUpdateConfig({
                mode: "specific",
                assign_to: event.target.value,
              })
            }
          >
            <option value="">{t(catalog.roster.data ? "routingChooseAgent" : catalog.roster.error ? "routingLoadError" : "routingLoading")}</option>
            {eligible.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name}
              </option>
            ))}
            {cfg.assign_to &&
              !eligible.some((member) => member.user_id === cfg.assign_to) && (
                <option value={cfg.assign_to}>{t(catalog.roster.data && organization ? "routingUnavailable" : error ? "routingLoadError" : "routingLoading")}</option>
              )}
          </select>
        </label>
      )}
      {(mode === "queue" || mode === "team_queue" || mode === "round_robin") && (
        <p role="note" className="bg-muted rounded-md border p-3 text-xs">
          {t(mode === "queue" ? "routingQueueHelp" : mode === "team_queue" ? "routingTeamQueueHelp" : "routingRoundRobinHelp")}
        </p>
      )}
      <p className="text-muted-foreground text-xs">{t("routingHelp")}</p>
      <TextRow
        label={t("internalNote")}
        value={cfg.note ?? ""}
        onChange={(note) => onUpdateConfig({ note })}
        rows={2}
      />
    </div>
  );
}

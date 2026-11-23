"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { HandoffNodeConfig } from "@/lib/flows/types";
import { TextRow } from "./fields";

interface Organization {
  departments: { id: string; name: string }[];
  teams: { id: string; name: string; department_id: string }[];
  members: { team_id: string; user_id: string }[];
}

export function HandoffForm({
  cfg,
  onUpdateConfig,
}: {
  cfg: HandoffNodeConfig;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("Flows.builder.form");
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<
    { user_id: string; full_name: string; role: string }[]
  >([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mode = cfg.mode ?? (cfg.assign_to ? "specific" : "legacy");
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/account/teams", { cache: "no-store" }),
      fetch("/api/account/members", { cache: "no-store" }),
    ])
      .then(async ([teamResponse, memberResponse]) => {
        if (!teamResponse.ok || !memberResponse.ok) throw new Error();
        const [teams, roster] = await Promise.all([
          teamResponse.json(),
          memberResponse.json(),
        ]);
        if (active) {
          setOrganization(teams);
          setMembers(roster.members);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
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
              setError(false);
              setAttempt(attempt + 1);
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
          disabled={!organization || error}
          value={cfg.team_id ?? ""}
          onChange={(event) =>
            onUpdateConfig({
              team_id: event.target.value,
              assign_to: "",
              mode: mode === "legacy" ? "queue" : mode,
            })
          }
        >
          <option value="">{t("routingKeepTeam")}</option>
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
              <option value={cfg.team_id}>{t("routingUnavailable")}</option>
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
          <option value="round_robin">{t("routingRoundRobin")}</option>
          <option value="specific">{t("routingSpecific")}</option>
        </select>
      </label>
      {mode === "specific" && (
        <label className="block space-y-1 text-xs">
          <span>{t("routingAgent")}</span>
          <select
            className={selectClass}
            disabled={!organization || error}
            value={cfg.assign_to ?? ""}
            onChange={(event) =>
              onUpdateConfig({
                mode: "specific",
                assign_to: event.target.value,
              })
            }
          >
            <option value="">{t("routingChooseAgent")}</option>
            {eligible.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name}
              </option>
            ))}
            {cfg.assign_to &&
              !eligible.some((member) => member.user_id === cfg.assign_to) && (
                <option value={cfg.assign_to}>{t("routingUnavailable")}</option>
              )}
          </select>
        </label>
      )}
      {(mode === "queue" || mode === "round_robin") && (
        <p role="note" className="bg-muted rounded-md border p-3 text-xs">
          {t(mode === "queue" ? "routingQueueHelp" : "routingRoundRobinHelp")}
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

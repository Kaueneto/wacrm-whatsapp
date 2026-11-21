'use client';

import { useEffect, useState } from 'react';

export function RoutingTeamSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [teams, setTeams] = useState<
    { id: string; name: string; department_id: string }[]
  >([]);
  const [departments, setDepartments] = useState<
    { id: string; name: string }[]
  >([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch('/api/account/teams', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (active) {
          setTeams(data.teams);
          setDepartments(data.departments);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="space-y-1">
      <select
        aria-label="Equipe de destino"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-muted text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
      >
        <option value="">Manter equipe atual</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {departments.find((d) => d.id === team.department_id)?.name} /{' '}
            {team.name}
          </option>
        ))}
        {value && !teams.some((team) => team.id === value) && (
          <option value={value}>Equipe indisponível</option>
        )}
      </select>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          Não foi possível carregar as equipes.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        O rodízio considera os atendentes online da equipe. Se não houver
        ninguém disponível, o atendimento aguarda na fila.
      </p>
    </div>
  );
}

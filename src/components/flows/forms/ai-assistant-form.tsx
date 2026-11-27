'use client';

import { useTranslations } from 'next-intl';
import type { AiAssistantNodeConfig } from '@/lib/flows/types';
import { TextRow } from './fields';
import { useRoutingCatalog } from '../routing-catalog';

export function AiAssistantForm({
  cfg,
  onUpdateConfig,
}: {
  cfg: AiAssistantNodeConfig;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations('Flows.builder.form');
  const { organization: resource } = useRoutingCatalog();
  const organization = resource.data;
  const error = resource.error;
  const selectClass =
    'border-input bg-background h-9 w-full rounded-md border px-3 text-sm';
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground rounded-md border p-3 text-xs">
        {t('aiNodeHelp')}
      </p>
      <label className="block space-y-1 text-xs">
        <span>{t('aiFallbackTeam')}</span>
        <select
          className={selectClass}
          value={cfg.team_id || ''}
          disabled={!organization || error}
          onChange={(event) => onUpdateConfig({ team_id: event.target.value })}
        >
          <option value="">{t(organization ? 'aiChooseTeam' : error ? 'routingLoadError' : 'routingLoading')}</option>
          {organization?.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {
                organization.departments.find(
                  (department) => department.id === team.department_id
                )?.name
              }{' '}
              / {team.name}
            </option>
          ))}
          {cfg.team_id &&
            !organization?.teams.some((team) => team.id === cfg.team_id) && (
              <option value={cfg.team_id}>{t(organization ? 'routingUnavailable' : error ? 'routingLoadError' : 'routingLoading')}</option>
            )}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {t('routingLoadError')}{' '}
          <button
            type="button"
            className="underline"
            onClick={resource.retry}
          >
            {t('routingRetry')}
          </button>
        </p>
      )}
      <TextRow
        label={t('aiWelcome')}
        value={cfg.welcome_message || ''}
        onChange={(value) => onUpdateConfig({ welcome_message: value })}
        rows={3}
      />
      <TextRow
        label={t('aiInstructions')}
        value={cfg.instructions || ''}
        onChange={(value) => onUpdateConfig({ instructions: value })}
        rows={4}
      />
      <p className="text-muted-foreground text-xs">{t('aiInstructionsHelp')}</p>
      <TextRow
        label={t('aiInternalNote')}
        value={cfg.note || ''}
        onChange={(value) => onUpdateConfig({ note: value })}
        rows={2}
      />
      <label className="block space-y-1 text-xs">
        <span>{t('aiHumanDistribution')}</span>
        <select
          className={selectClass}
          value={cfg.handoff_mode || 'round_robin'}
          onChange={(event) =>
            onUpdateConfig({ handoff_mode: event.target.value })
          }
        >
          <option value="round_robin">{t('routingRoundRobin')}</option>
          <option value="queue">{t('routingQueue')}</option>
        </select>
      </label>
      <p className="text-muted-foreground text-xs">
        {t('aiHumanDistributionHelp')}
      </p>
      <TextRow
        label={t('aiFallbackMessage')}
        value={cfg.fallback_message || ''}
        onChange={(value) => onUpdateConfig({ fallback_message: value })}
        rows={3}
      />
    </div>
  );
}

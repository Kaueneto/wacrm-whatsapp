import {
  parsePortfolioSetup,
  type CollectionStage,
  type PortfolioSetup,
  type ProjectRule,
} from './setup';

export interface RuleDraft {
  id: string;
  name: string;
  company: string;
  work: string;
  stages: CollectionStage[];
  isDefault: boolean;
  isNew: boolean;
  baseline: string | null;
}

const stagesVersion = (stages: CollectionStage[]) =>
  JSON.stringify(
    stages.map(({ id, name, fromDay }) => ({ id, name, fromDay }))
  );
const ruleVersion = (rule: ProjectRule) =>
  JSON.stringify({
    id: rule.id,
    name: rule.name,
    company: rule.company,
    work: rule.work,
    stages: stagesVersion(rule.stages),
  });

export function ruleDraft(
  setup: PortfolioSetup,
  rule?: ProjectRule
): RuleDraft {
  return rule
    ? {
        ...structuredClone(rule),
        isDefault: false,
        isNew: false,
        baseline: ruleVersion(rule),
      }
    : {
        id: 'default',
        name: 'Régua padrão',
        company: '',
        work: '',
        stages: structuredClone(setup.stages),
        isDefault: true,
        isNew: false,
        baseline: stagesVersion(setup.stages),
      };
}
export function newRuleDraft(setup: PortfolioSetup): RuleDraft {
  return {
    id: `rule-${crypto.randomUUID()}`,
    name: '',
    company: '',
    work: '',
    stages: structuredClone(setup.stages),
    isDefault: false,
    isNew: true,
    baseline: null,
  };
}
export function saveRuleDraft(
  setup: PortfolioSetup,
  draft: RuleDraft
): PortfolioSetup {
  if (draft.isDefault) {
    if (draft.baseline !== stagesVersion(setup.stages))
      throw new Error(
        'A régua padrão foi alterada por outra edição. Atualize a página e reabra os detalhes.'
      );
    return parsePortfolioSetup({ ...setup, stages: draft.stages });
  }
  const existing = setup.projectRules.find((rule) => rule.id === draft.id);
  if (!draft.isNew && (!existing || ruleVersion(existing) !== draft.baseline))
    throw new Error(
      'Esta régua foi alterada ou excluída por outra edição. Atualize a página e reabra os detalhes.'
    );
  if (draft.isNew && existing)
    throw new Error('Já existe uma régua com esse identificador.');
  if (
    setup.projectRules.some(
      (rule) =>
        rule.id !== draft.id &&
        rule.company === draft.company &&
        rule.work.toUpperCase() === draft.work.toUpperCase()
    )
  )
    throw new Error(
      `Já existe uma régua para ${draft.company}|${draft.work}. Abra a régua existente para editar.`
    );
  const rule: ProjectRule = {
    id: draft.id,
    name: draft.name,
    company: draft.company,
    work: draft.work,
    stages: draft.stages,
  };
  return parsePortfolioSetup({
    ...setup,
    projectRules: draft.isNew
      ? [...setup.projectRules, rule]
      : setup.projectRules.map((item) => (item.id === draft.id ? rule : item)),
  });
}
export function removeRule(
  setup: PortfolioSetup,
  draft: RuleDraft
): PortfolioSetup {
  if (draft.isDefault) throw new Error('A régua padrão não pode ser excluída.');
  const existing = setup.projectRules.find((rule) => rule.id === draft.id);
  if (!existing || ruleVersion(existing) !== draft.baseline)
    throw new Error(
      'Esta régua foi alterada. Atualize a página e reabra os detalhes antes de excluir.'
    );
  return parsePortfolioSetup({
    ...setup,
    projectRules: setup.projectRules.filter((rule) => rule.id !== draft.id),
  });
}

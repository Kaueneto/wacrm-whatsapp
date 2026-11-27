import { describe, expect, it } from 'vitest';
import {
  defaultPortfolioSetup,
  parsePortfolioSetup,
  stagesForProject,
} from './setup';
import { newRuleDraft, removeRule, ruleDraft, saveRuleDraft } from './rules';

function setup() {
  const base = defaultPortfolioSetup();
  return parsePortfolioSetup({
    ...base,
    projectRules: [
      {
        id: 'rule-one',
        name: 'Porto Seguro',
        company: '1',
        work: 'PSG01',
        stages: base.stages,
      },
    ],
  });
}
describe('table and modal collection rules', () => {
  it('edits an isolated draft so cancelling cannot change the saved rule', () => {
    const original = setup(),
      before = structuredClone(original);
    const draft = ruleDraft(original, original.projectRules[0]);
    draft.name = 'Alterada';
    draft.stages[0].name = 'Etapa alterada';
    draft.stages.push({ id: 'extra', name: 'Extra', fromDay: 100 });
    expect(original).toEqual(before);
  });
  it('saves a new project rule without modifying the default stages or unrelated configuration', () => {
    const original = setup();
    const draft = newRuleDraft(original);
    Object.assign(draft, {
      name: 'Teste fiscal',
      company: '900',
      work: '00001',
    });
    const latest = {
      ...original,
      minimumDays: 5,
      scope: {
        mode: 'selected' as const,
        projects: [{ company: '900', work: '00001' }],
      },
    };
    const saved = saveRuleDraft(latest, draft);
    expect(saved.projectRules).toHaveLength(2);
    expect(saved.projectRules[1]).toMatchObject({
      name: 'Teste fiscal',
      company: '900',
      work: '00001',
    });
    expect(saved.stages).toEqual(original.stages);
    expect(saved.minimumDays).toBe(5);
    expect(saved.scope).toEqual(latest.scope);
    expect(original.projectRules).toHaveLength(1);
  });
  it('updates the selected project rule and preserves other rules', () => {
    const original = setup();
    const draft = ruleDraft(original, original.projectRules[0]);
    draft.stages = [
      { id: 'twenty', name: '20 dias', fromDay: 20 },
      { id: 'thirty', name: '30 dias', fromDay: 30 },
    ];
    const saved = saveRuleDraft(original, draft);
    expect(stagesForProject(saved, '1', 'PSG01')).toEqual(draft.stages);
    expect(stagesForProject(saved, '900', '00001')).toEqual(original.stages);
  });
  it('rejects a duplicate company/work binding ignoring work code case', () => {
    const original = setup(),
      draft = newRuleDraft(original);
    Object.assign(draft, { name: 'Duplicada', company: '1', work: 'psg01' });
    expect(() => saveRuleDraft(original, draft)).toThrow('Já existe uma régua');
  });
  it('rejects duplicate or out-of-order stage days instead of saving an ambiguous trail', () => {
    const original = setup(),
      draft = ruleDraft(original);
    draft.stages[1].fromDay = draft.stages[0].fromDay;
    expect(() => saveRuleDraft(original, draft)).toThrow('ordem crescente');
  });
  it('prevents overwriting a rule changed since the modal opened', () => {
    const original = setup(),
      draft = ruleDraft(original, original.projectRules[0]);
    const latest = structuredClone(original);
    latest.projectRules[0].name = 'Outra edição';
    expect(() => saveRuleDraft(latest, draft)).toThrow('outra edição');
    expect(() => removeRule(latest, draft)).toThrow('alterada');
  });
  it('accepts equivalent JSON objects with a different property order', () => {
    const original = setup(),
      draft = ruleDraft(original, original.projectRules[0]);
    const one = original.projectRules[0];
    const latest = {
      ...original,
      projectRules: [
        {
          stages: one.stages,
          work: one.work,
          company: one.company,
          name: one.name,
          id: one.id,
        },
      ],
    };
    expect(saveRuleDraft(latest, draft).projectRules).toHaveLength(1);
  });
  it('deletes only the selected rule and lets its project fall back to the default', () => {
    const original = setup(),
      draft = ruleDraft(original, original.projectRules[0]);
    const saved = removeRule(original, draft);
    expect(saved.projectRules).toEqual([]);
    expect(stagesForProject(saved, '1', 'PSG01')).toEqual(saved.stages);
    expect(() => removeRule(original, ruleDraft(original))).toThrow(
      'padrão não pode'
    );
  });
});

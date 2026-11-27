import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RuleJourney } from './rule-journey';

const stages = [
  { id: 'twenty', name: 'Contato inicial', fromDay: 20 },
  { id: 'thirty', name: 'Segundo contato', fromDay: 30 },
];
describe('live rule journey preview', () => {
  it('renders the names and intervals supplied by the current editor draft', () => {
    const initial = renderToStaticMarkup(
      createElement(RuleJourney, {
        stages,
        mode: 'editor',
        currentStageId: 'twenty',
        selectedStageId: 'twenty',
      })
    );
    expect(initial).toContain('Contato inicial');
    expect(initial).toContain('20–29 dias');
    const changed = renderToStaticMarkup(
      createElement(RuleJourney, {
        stages: [stages[0], { ...stages[1], name: 'Notificação', fromDay: 45 }],
        mode: 'editor',
      })
    );
    expect(changed).toContain('Notificação');
    expect(changed).toContain('20–44 dias');
    expect(changed).not.toContain('Segundo contato');
  });
  it('distinguishes a stage under construction from an actual current contract stage', () => {
    const preview = renderToStaticMarkup(
      createElement(RuleJourney, {
        stages,
        mode: 'editor',
        currentStageId: 'twenty',
      })
    );
    expect(preview).toContain('etapa em edição');
    expect(preview).not.toContain('aria-current="step"');
    const actual = renderToStaticMarkup(
      createElement(RuleJourney, { stages, currentStageId: 'twenty' })
    );
    expect(actual).toContain('aria-current="step"');
  });
  it('flags incomplete thresholds without displaying inverted day ranges', () => {
    const markup = renderToStaticMarkup(
      createElement(RuleJourney, {
        stages: [stages[1], stages[0]],
        mode: 'editor',
      })
    );
    expect(markup).toContain('Revisar ordem dos dias');
    expect(markup).not.toContain('30–19 dias');
  });
});

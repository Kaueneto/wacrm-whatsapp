import { describe, expect, it } from 'vitest';
import {
  insertText,
  insertTemplateVariable,
  toggleTextFormat,
} from './text-editing';

describe('template body editing', () => {
  it('inserts at the caret and keeps surrounding content intact', () => {
    expect(insertTemplateVariable('Olá , tudo bem?', 4, 4)).toEqual({
      text: 'Olá {{1}}, tudo bem?',
      start: 9,
      end: 9,
    });
    expect(insertText('Olá cliente!', 4, 11, '😊')).toEqual({
      text: 'Olá 😊!',
      start: 6,
      end: 6,
    });
  });
  it("uses the first free number and reuses a removed variable's number", () => {
    expect(insertTemplateVariable('{{1}} {{3}} ', 12, 12).text).toBe(
      '{{1}} {{3}} {{2}}'
    );
    expect(insertTemplateVariable('{{1}} {{2}}', 0, 5).text).toBe(
      '{{1}} {{2}}'
    );
  });
  it('advances beyond nine and recognizes manually typed spacing', () => {
    const text = Array.from({ length: 10 }, (_, i) => `{{ ${i + 1} }}`).join(
      ' '
    );
    expect(insertTemplateVariable(text, text.length, text.length).text).toBe(
      text + '{{11}}'
    );
  });
  it('toggles formatting while keeping the inner selection', () => {
    const formatted = toggleTextFormat('Olá mundo', 4, 9, '*');
    expect(formatted).toEqual({ text: 'Olá *mundo*', start: 5, end: 10 });
    expect(
      toggleTextFormat(formatted.text, formatted.start, formatted.end, '*')
    ).toEqual({ text: 'Olá mundo', start: 4, end: 9 });
  });
  it('places the cursor between markers when no text is selected', () => {
    expect(toggleTextFormat('Olá ', 4, 4, '_')).toEqual({
      text: 'Olá __',
      start: 5,
      end: 5,
    });
    expect(toggleTextFormat('```código```', 0, 12, '```')).toEqual({
      text: 'código',
      start: 0,
      end: 6,
    });
  });
});

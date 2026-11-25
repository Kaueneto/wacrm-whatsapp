import { expect, it } from 'vitest';
import { withAgentSignature } from './agent-signature';
it('prefixes the actual sender name without duplicating the signature', () => {
  expect(withAgentSignature('Olá!', 'Ana Carolina')).toBe(
    '*Ana Carolina*\n\nOlá!'
  );
  expect(withAgentSignature('*Ana Carolina*\n\nOlá!', 'Ana Carolina')).toBe(
    '*Ana Carolina*\n\nOlá!'
  );
  expect(withAgentSignature('*Ana Carolina*\nOlá!', 'Ana Carolina')).toBe(
    '*Ana Carolina*\n\nOlá!'
  );
});
it('keeps multiline text and removes markup and line breaks from names', () => {
  expect(
    withAgentSignature('Olá!\nComo posso ajudar?', ' *Ana*\nCarolina ')
  ).toBe('*Ana Carolina*\n\nOlá!\nComo posso ajudar?');
  expect(withAgentSignature('', 'Ana')).toBe('');
  expect(withAgentSignature('Olá!', ' ')).toBe('Olá!');
});

import { expect, it } from 'vitest';
import { uauErrorDetail } from './error-detail';
it('extracts business and field validation errors without exposing credentials', () => {
  expect(uauErrorDetail({ Mensagem: 'Dados inválidos', Descricao: 'Categoria sem workflow', ModelState: { 'atendimento.usrcad_atd': ['Usuário não encontrado'] } }))
    .toBe('Dados inválidos · Categoria sem workflow · atendimento.usrcad_atd: Usuário não encontrado');
  expect(uauErrorDetail({ Mensagem: 'Erro key-secret pass-secret Bearer abc.def' }, ['key-secret', 'pass-secret']))
    .toBe('Erro [oculto] [oculto] Bearer [oculto]');
  expect(uauErrorDetail({ _ListaErros: ['Categoria inválida'] })).toBe('Categoria inválida');
});
it('does not dump HTML, truncated JSON or stack traces and bounds the displayed reason', () => {
  expect(uauErrorDetail('<html>server error</html>')).toBe('');
  expect(uauErrorDetail('{"error":"truncated')).toBe('');
  expect(uauErrorDetail({ Detalhe: 'Regra de negócio\r\n at InternalMethod()' })).toBe('Regra de negócio');
  expect(uauErrorDetail({ Mensagem: 'a'.repeat(2000) })).toHaveLength(600);
});

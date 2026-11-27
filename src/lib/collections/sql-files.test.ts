import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const directory = 'docs/integrations/uau/sql/';
const read = (name: string) => readFileSync(directory + name, 'utf8');
const pilot = read('teste-sincronizacao-900-00001.sql');
function expand(sql: string) {
  return sql
    .replaceAll('<EmpresaObra>', "'900|00001'")
    .replaceAll('<MinimoDiasAtraso>', '1')
    .replaceAll('<Pagina>', '1')
    .replaceAll('<TamanhoPagina>', '100')
    .replaceAll(
      '<ContratosXml>',
      `N'<contratos><contrato empresa="900" obra="00001" venda="1" /></contratos>'`
    );
}
describe('UAU portfolio SQL delivery', () => {
  it.each([
    'sincronizacao-01-inadimplencia.sql',
    'sincronizacao-02-conciliacao.sql',
  ])('keeps the SSMS pilot identical to the parameterized query %s', (name) => {
    expect(pilot).toContain(expand(read(name)));
  });
  it('uses XML for contract input and protects every JSON collection against NULL', () => {
    expect(pilot).not.toMatch(/\bOPENJSON\s*\(/i);
    expect(pilot).toContain(".nodes('/contratos/contrato')");
    const protectedCollections = [
      ...pilot.matchAll(
        /FOR JSON PATH, INCLUDE_NULL_VALUES\), N'\[\]'\) AS (\w+Json)/g
      ),
    ];
    expect(protectedCollections).toHaveLength(8);
  });
});

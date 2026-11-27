import { describe,expect,it } from 'vitest';
import { normalizeProjectCatalog } from './project-catalog';
describe('UAU company/work catalog',()=>{
 it('returns identifiers and names without exposing company tax IDs, addresses or phones',()=>{
   const result=normalizeProjectCatalog([{Codigo_emp:900,Desc_emp:'EMPRESA TESTE',CGC_emp:'private-tax-id',Endereco_emp:'private-address',Fone_emp:'private-phone'}],[{Empresa_obr:900,Cod_obr:'00001',Descr_obr:'KAPTA',Ender_obr:'private-work-address'}]);
   expect(result).toEqual({companies:[{code:'900',name:'EMPRESA TESTE'}],works:[{company:'900',code:'00001',name:'KAPTA',source:'uau'}]});
   expect(JSON.stringify(result)).not.toContain('private');
 });
 it('keeps the same work code distinct between companies and preserves leading zeros',()=>{
   const result=normalizeProjectCatalog([{Codigo_emp:1,Desc_emp:'A'},{Codigo_emp:2,Desc_emp:'B'}],[{Empresa_obr:1,Cod_obr:'00001',Descr_obr:'Obra A'},{Empresa_obr:2,Cod_obr:'00001',Descr_obr:'Obra B'}]);
   expect(result.works).toHaveLength(2);expect(result.works.map(w=>w.code)).toEqual(['00001','00001']);expect(new Set(result.works.map(w=>w.company)).size).toBe(2);
 });
 it('does not silently discard an unrecognized ERP schema',()=>{expect(()=>normalizeProjectCatalog([{Unknown:900}],[])).toThrow('formato desconhecido');});
});

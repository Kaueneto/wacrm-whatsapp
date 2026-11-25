import { describe, expect, it } from 'vitest';
import { attendanceCategories } from './attendance-categories';

describe('UAU category dataset', () => {
  it('offers only positive workflow links for creation, including when the ERP serializes the link as text', () => {
    const records = [null, 'null', 0, '0', -1, 'invalid', 12, '13'].map(
      (link, index) => ({
        Codigo_cger: `00${index}`,
        Desc_cger: `Categoria ${index}`,
        AtInat_cger: 0,
        NumVcwf_CGer: link,
      })
    );
    expect(
      attendanceCategories([{ MyTable: records }], {
        requireWorkflow: true,
      }).map((c) => c.code)
    ).toEqual(['006', '007']);
    expect(attendanceCategories([{ MyTable: records }])).toHaveLength(8);
  });
  const category = {
    Codigo_cger: '001',
    Desc_cger: 'Financeiro',
    AtInat_cger: 0,
    CodCategPai_cger: 'null',
    NumVcwf_CGer: 'null',
  };
  it('ignores the CLR metadata row, retains MyTable data and preserves leading zeros', () => {
    const schema = Object.fromEntries(
      Object.keys(category).map((key) => [
        key,
        'System.String, mscorlib, Version=4.0.0.0, Culture=neutral',
      ])
    );
    expect(attendanceCategories([{ MyTable: [schema, category] }])).toEqual([
      { code: '001', name: 'Financeiro', parentCode: null, workflowLink: null },
    ]);
  });
  it('omits inactive categories and retains parent and workflow identifiers', () => {
    expect(
      attendanceCategories([
        { ...category, AtInat_cger: 1 },
        {
          ...category,
          Codigo_cger: '001.01',
          CodCategPai_cger: '001',
          NumVcwf_CGer: 12,
        },
      ])
    ).toEqual([
      {
        code: '001.01',
        name: 'Financeiro',
        parentCode: '001',
        workflowLink: 12,
      },
    ]);
  });
  it('accepts a schema-only table as empty, but rejects malformed real records', () => {
    expect(attendanceCategories([{ MyTable: [] }])).toEqual([]);
    expect(() =>
      attendanceCategories([{ ...category, Codigo_cger: null }])
    ).toThrow();
    expect(() => attendanceCategories([{ Codigo_cger: '001' }])).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import {
  IMPORT_ENTITIES,
  autoMap,
  getImportEntity,
  parseCsv,
  validateRows,
} from '@/lib/csv/import';
import { escapeCsvCell, objectsToCsv, toCsv } from '@/lib/csv/client';

const clients = getImportEntity('client')!;

describe('parseCsv', () => {
  it('reads headers and rows', () => {
    const { headers, rows, errors } = parseCsv('Name,Website\nKestrel,https://kestrel.test\n');
    expect(headers).toEqual(['Name', 'Website']);
    expect(rows).toEqual([{ Name: 'Kestrel', Website: 'https://kestrel.test' }]);
    expect(errors).toEqual([]);
  });

  it('trims header whitespace so a hand-edited export still maps', () => {
    expect(parseCsv(' Name , Website \nA,B\n').headers).toEqual(['Name', 'Website']);
  });

  it('drops entirely blank lines', () => {
    const { rows } = parseCsv('Name\nKestrel\n\n\nLumen\n');
    expect(rows.map((r) => r.Name)).toEqual(['Kestrel', 'Lumen']);
  });

  it('handles quoted fields containing commas and newlines', () => {
    const { rows } = parseCsv('Name,Notes\n"Kestrel, Inc.","line one\nline two"\n');
    expect(rows[0].Name).toBe('Kestrel, Inc.');
    expect(rows[0].Notes).toBe('line one\nline two');
  });
});

describe('autoMap', () => {
  it('matches on the field key, label and aliases, ignoring case and punctuation', () => {
    const mapping = autoMap(clients, ['Client Name', 'Website', 'MRR']);
    expect(mapping.name).toBe('Client Name');
    expect(mapping.website).toBe('Website');
    expect(mapping.monthly_retainer).toBe('MRR');
  });

  it('leaves unrecognised headers unmapped rather than guessing', () => {
    const mapping = autoMap(clients, ['Something Unrelated']);
    expect(Object.values(mapping)).not.toContain('Something Unrelated');
  });
});

describe('validateRows', () => {
  const mapping = { name: 'Name', website: 'Website', monthly_retainer: 'Retainer' };

  it('accepts a good row', () => {
    const { issues, valid } = validateRows(
      clients,
      [{ Name: 'Kestrel Robotics', Website: 'https://kestrel.test', Retainer: '4500' }],
      mapping,
    );
    expect(issues).toEqual([]);
    expect(valid).toEqual([
      { name: 'Kestrel Robotics', website: 'https://kestrel.test', monthly_retainer: 4500 },
    ]);
  });

  it('reports a missing required field with the spreadsheet row number', () => {
    const { issues, valid } = validateRows(clients, [{ Name: '', Website: 'x' }], mapping);
    expect(valid).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ row: 2, field: 'name' });
  });

  it('strips currency formatting from numbers', () => {
    const { valid } = validateRows(
      clients,
      [{ Name: 'A', Retainer: '$4,500.50' }],
      mapping,
    );
    expect(valid[0].monthly_retainer).toBe(4500.5);
  });

  it('rejects a number it cannot read rather than importing a zero', () => {
    const { issues, valid } = validateRows(clients, [{ Name: 'A', Retainer: 'about five' }], mapping);
    expect(valid).toEqual([]);
    expect(issues[0].message).toMatch(/not a number/);
  });

  it('rejects an unparseable date', () => {
    const entity = getImportEntity('client')!;
    const { issues } = validateRows(
      entity,
      [{ Name: 'A', Start: 'sometime next spring' }],
      { name: 'Name', contract_start: 'Start' },
    );
    expect(issues.some((i) => /not a date/.test(i.message))).toBe(true);
  });

  it('rejects an invalid email address', () => {
    const contacts = getImportEntity('contact')!;
    const emailField = contacts.fields.find((f) => f.key === 'email');
    expect(emailField).toBeDefined();
    const { issues } = validateRows(
      contacts,
      [{ Name: 'Dana Ortiz', Email: 'dana(at)example.com' }],
      { name: 'Name', full_name: 'Name', email: 'Email' },
    );
    expect(issues.some((i) => i.field === 'email')).toBe(true);
  });

  it('keeps good rows when other rows fail, so one bad line does not stop an import', () => {
    const { issues, valid } = validateRows(
      clients,
      [{ Name: 'Good' }, { Name: '' }, { Name: 'Also good' }],
      mapping,
    );
    expect(valid).toHaveLength(2);
    expect(issues).toHaveLength(1);
    expect(issues[0].row).toBe(3);
  });
});

describe('import entity definitions', () => {
  it('gives every entity duplicate keys, so a re-import updates rather than duplicates', () => {
    for (const entity of IMPORT_ENTITIES) {
      expect(entity.duplicateKeys.length).toBeGreaterThan(0);
      for (const key of entity.duplicateKeys) {
        expect(entity.fields.some((f) => f.key === key)).toBe(true);
      }
    }
  });

  it('requires a write permission for every entity', () => {
    for (const entity of IMPORT_ENTITIES) {
      expect(entity.permission).toMatch(/:(write|user_admin)$/);
    }
  });
});

describe('csv export', () => {
  it('quotes cells that would otherwise break the file', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('with,comma')).toBe('"with,comma"');
    expect(escapeCsvCell('with"quote')).toBe('"with""quote"');
    expect(escapeCsvCell('with\nnewline')).toBe('"with\nnewline"');
  });

  it('renders null and undefined as empty rather than the word "null"', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('round-trips through parseCsv', () => {
    const csv = objectsToCsv([{ name: 'Kestrel, Inc.', notes: 'said "hello"' }], ['name', 'notes']);
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual({ name: 'Kestrel, Inc.', notes: 'said "hello"' });
  });

  it('writes one line per row', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']]).split('\n')).toHaveLength(2);
  });
});

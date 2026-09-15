import Papa from 'papaparse';
import { z } from 'zod';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return {
    headers: result.meta.fields ?? [],
    rows: result.data.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== '')),
    errors: result.errors.slice(0, 20).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
  };
}

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  /** Header names commonly used for this field, for auto-mapping. */
  aliases?: string[];
  hint?: string;
}

export interface ImportEntity {
  id: string;
  label: string;
  description: string;
  table: string;
  permission: 'crm:write' | 'task:write' | 'team:write' | 'finance:write' | 'investor:write' | 'partnership:write' | 'parfax:user_admin';
  /** Columns used to detect an existing record. */
  duplicateKeys: string[];
  fields: ImportField[];
  /** True when the target table has a company_id column. */
  companyScoped: boolean;
}

export const IMPORT_ENTITIES: ImportEntity[] = [
  {
    id: 'client',
    label: 'Clients',
    description: 'Accounts you deliver work for.',
    table: 'clients',
    permission: 'crm:write',
    duplicateKeys: ['name'],
    companyScoped: true,
    fields: [
      { key: 'name', label: 'Client name', required: true, aliases: ['client', 'account', 'company name'] },
      { key: 'status', label: 'Status', aliases: ['stage', 'client status'], hint: 'prospect, active, paused, former, referral_partner' },
      { key: 'website', label: 'Website', aliases: ['url', 'site'] },
      { key: 'monthly_retainer', label: 'Monthly retainer', aliases: ['retainer', 'mrr'] },
      { key: 'contract_value', label: 'Contract value', aliases: ['acv', 'annual value'] },
      { key: 'contract_start', label: 'Contract start', aliases: ['start date'] },
      { key: 'contract_end', label: 'Contract end', aliases: ['end date'] },
      { key: 'renewal_date', label: 'Renewal date', aliases: ['renews'] },
      { key: 'health_score', label: 'Health score', aliases: ['health'] },
      { key: 'goals', label: 'Goals' },
      { key: 'risks', label: 'Risks' },
    ],
  },
  {
    id: 'contact',
    label: 'Contacts',
    description: 'People at clients, partners and investors.',
    table: 'contacts',
    permission: 'crm:write',
    duplicateKeys: ['email'],
    companyScoped: true,
    fields: [
      { key: 'first_name', label: 'First name', required: true, aliases: ['first', 'given name'] },
      { key: 'last_name', label: 'Last name', aliases: ['last', 'surname', 'family name'] },
      { key: 'email', label: 'Email', aliases: ['email address', 'e-mail'] },
      { key: 'phone', label: 'Phone', aliases: ['telephone', 'mobile'] },
      { key: 'title', label: 'Job title', aliases: ['role', 'position'] },
      { key: 'linkedin_url', label: 'LinkedIn', aliases: ['linkedin'] },
      { key: 'city', label: 'City' },
      { key: 'country', label: 'Country' },
      { key: 'description', label: 'Notes', aliases: ['note', 'comments'] },
    ],
  },
  {
    id: 'organization',
    label: 'Organizations',
    description: 'Companies you work with in any capacity.',
    table: 'organizations',
    permission: 'crm:write',
    duplicateKeys: ['name'],
    companyScoped: true,
    fields: [
      { key: 'name', label: 'Name', required: true, aliases: ['company', 'organisation'] },
      { key: 'domain', label: 'Domain', aliases: ['website domain'] },
      { key: 'website', label: 'Website', aliases: ['url'] },
      { key: 'industry', label: 'Industry', aliases: ['sector'] },
      { key: 'city', label: 'City' },
      { key: 'country', label: 'Country' },
      { key: 'description', label: 'Description', aliases: ['about', 'notes'] },
    ],
  },
  {
    id: 'investor',
    label: 'Investors',
    description: 'Funds and angels in the fundraising pipeline.',
    table: 'investors',
    permission: 'investor:write',
    duplicateKeys: ['name'],
    companyScoped: false,
    fields: [
      { key: 'name', label: 'Fund or investor name', required: true, aliases: ['fund', 'investor', 'firm'] },
      { key: 'website', label: 'Website', aliases: ['url'] },
      { key: 'investor_type', label: 'Type', hint: 'vc, angel, family_office, strategic, pe, accelerator, syndicate, debt, other' },
      { key: 'check_size_min', label: 'Minimum check', aliases: ['min check'] },
      { key: 'check_size_max', label: 'Maximum check', aliases: ['max check'] },
      { key: 'geography', label: 'Geography', aliases: ['region', 'location'] },
      { key: 'warm_intro_source', label: 'Warm intro via', aliases: ['intro', 'referred by'] },
      { key: 'pipeline_stage', label: 'Pipeline stage', aliases: ['stage'] },
      { key: 'potential_amount', label: 'Potential amount', aliases: ['target', 'ask'] },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    id: 'member',
    label: 'Team members',
    description: 'Employees and contractors, including a Gusto CSV export.',
    table: 'members',
    permission: 'team:write',
    duplicateKeys: ['email'],
    companyScoped: true,
    fields: [
      { key: 'full_name', label: 'Full name', required: true, aliases: ['name', 'employee name'] },
      { key: 'email', label: 'Email', aliases: ['work email'] },
      { key: 'title', label: 'Job title', aliases: ['role', 'position'] },
      { key: 'kind', label: 'Type', hint: 'employee, contractor, agency, advisor' },
      { key: 'employment_type', label: 'Employment type', hint: 'full_time, part_time, contract, hourly, project' },
      { key: 'start_date', label: 'Start date', aliases: ['hire date'] },
      { key: 'location', label: 'Location' },
      { key: 'capacity_hours', label: 'Capacity (hours/week)', aliases: ['hours'] },
    ],
  },
  {
    id: 'invoice',
    label: 'Invoices',
    description: 'Billing history from an accounting or invoicing export.',
    table: 'invoices',
    permission: 'finance:write',
    duplicateKeys: ['number'],
    companyScoped: true,
    fields: [
      { key: 'number', label: 'Invoice number', required: true, aliases: ['invoice', 'invoice #', 'reference'] },
      { key: 'status', label: 'Status', hint: 'draft, open, paid, past_due, void, uncollectible' },
      { key: 'issue_date', label: 'Issue date', required: true, aliases: ['date', 'invoice date'] },
      { key: 'due_date', label: 'Due date', aliases: ['due'] },
      { key: 'total', label: 'Total', required: true, aliases: ['amount', 'total amount'] },
      { key: 'amount_paid', label: 'Amount paid', aliases: ['paid'] },
      { key: 'currency', label: 'Currency' },
      { key: 'description', label: 'Description', aliases: ['memo', 'notes'] },
    ],
  },
  {
    id: 'parfax_user',
    label: 'ParFax users',
    description: 'A user export from the current ParFax platform.',
    table: 'parfax_users',
    permission: 'parfax:user_admin',
    duplicateKeys: ['email'],
    companyScoped: false,
    fields: [
      { key: 'email', label: 'Email', required: true, aliases: ['email address'] },
      { key: 'external_id', label: 'External id', aliases: ['id', 'user id', 'uid'] },
      { key: 'name', label: 'Name', aliases: ['full name', 'display name'] },
      { key: 'handle', label: 'Handle', aliases: ['username'] },
      { key: 'plan', label: 'Plan', hint: 'free, plus, pro, team, lifetime' },
      { key: 'status', label: 'Status', hint: 'active, suspended, deleted, pending' },
      { key: 'signup_at', label: 'Signed up', aliases: ['created', 'created at', 'registered'] },
      { key: 'last_active_at', label: 'Last active', aliases: ['last seen'] },
      { key: 'country', label: 'Country' },
      { key: 'region', label: 'Region', aliases: ['state'] },
      { key: 'acquisition_source', label: 'Source', aliases: ['channel', 'utm source'] },
    ],
  },
];

export function getImportEntity(id: string) {
  return IMPORT_ENTITIES.find((e) => e.id === id);
}

/** Guesses a header → field mapping from exact and alias matches. */
export function autoMap(entity: ImportEntity, headers: string[]): Record<string, string> {
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byNormalised = new Map(headers.map((h) => [normalise(h), h]));
  const mapping: Record<string, string> = {};
  for (const field of entity.fields) {
    const candidates = [field.key, field.label, ...(field.aliases ?? [])];
    for (const candidate of candidates) {
      const match = byNormalised.get(normalise(candidate));
      if (match) {
        mapping[field.key] = match;
        break;
      }
    }
  }
  return mapping;
}

export interface ValidationIssue {
  row: number;
  field: string;
  message: string;
  value: string;
}

const DATE_FIELDS = /(_at|_date|^signup)/;
const NUMBER_FIELDS = /(amount|value|total|paid|retainer|score|hours|size_min|size_max|capacity)/;

/**
 * Validates mapped rows before anything is written. Returns per-row issues so
 * the preview can show exactly what will fail and why.
 */
export function validateRows(
  entity: ImportEntity,
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): { issues: ValidationIssue[]; valid: Record<string, unknown>[] } {
  const issues: ValidationIssue[] = [];
  const valid: Record<string, unknown>[] = [];

  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // account for the header row
    const record: Record<string, unknown> = {};
    let rowOk = true;

    for (const field of entity.fields) {
      const header = mapping[field.key];
      const rawValue = header ? String(raw[header] ?? '').trim() : '';

      if (!rawValue) {
        if (field.required) {
          issues.push({ row: rowNumber, field: field.key, message: `${field.label} is required`, value: '' });
          rowOk = false;
        }
        continue;
      }

      if (DATE_FIELDS.test(field.key)) {
        const parsed = new Date(rawValue);
        if (Number.isNaN(parsed.getTime())) {
          issues.push({ row: rowNumber, field: field.key, message: `${field.label} is not a date`, value: rawValue });
          rowOk = false;
          continue;
        }
        record[field.key] = field.key.endsWith('_date') ? parsed.toISOString().slice(0, 10) : parsed;
        continue;
      }

      if (NUMBER_FIELDS.test(field.key)) {
        const cleaned = rawValue.replace(/[^0-9.\-]/g, '');
        const num = Number(cleaned);
        if (!Number.isFinite(num)) {
          issues.push({ row: rowNumber, field: field.key, message: `${field.label} is not a number`, value: rawValue });
          rowOk = false;
          continue;
        }
        record[field.key] = num;
        continue;
      }

      if (field.key === 'email' && !z.string().email().safeParse(rawValue).success) {
        issues.push({ row: rowNumber, field: field.key, message: 'Not a valid email address', value: rawValue });
        rowOk = false;
        continue;
      }

      record[field.key] = rawValue;
    }

    if (rowOk && Object.keys(record).length) valid.push(record);
  });

  return { issues, valid };
}

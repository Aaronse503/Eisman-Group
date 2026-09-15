export type ProviderId =
  | 'clickup'
  | 'stripe'
  | 'gusto'
  | 'google_calendar'
  | 'parfax_crm'
  | 'anthropic'
  | 'email';

export interface ProviderCredentialField {
  key: string;
  label: string;
  type: 'password' | 'text' | 'url';
  required: boolean;
  placeholder?: string;
  help?: string;
  /** Environment variable that supplies this value when set on the server. */
  envVar?: string;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  tagline: string;
  category: 'work' | 'finance' | 'people' | 'calendar' | 'product' | 'ai' | 'comms';
  /** Holding-level providers have one connection; company-level have one each. */
  scope: 'company' | 'holding';
  authType: 'api_key' | 'oauth' | 'api_key_or_base_url';
  credentialFields: ProviderCredentialField[];
  /** Permission scopes requested from the provider, shown on the card. */
  requestedScopes: string[];
  /** Entities this adapter can read. */
  syncs: string[];
  /** True when this provider can write back — always off until enabled. */
  writeCapable: boolean;
  /** Whether a demo mode exists that produces clearly-labelled sample data. */
  supportsDemo: boolean;
  /** Set up instructions rendered on the integration card. */
  setupSteps: string[];
  docsUrl?: string;
  /** Present but not implemented; the card says so rather than pretending. */
  status: 'available' | 'planned';
  plannedNote?: string;
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'clickup',
    name: 'ClickUp',
    tagline: 'Two-way task and project structure from your ClickUp workspace.',
    category: 'work',
    scope: 'company',
    authType: 'api_key',
    credentialFields: [
      { key: 'apiToken', label: 'Personal API token', type: 'password', required: true, placeholder: 'pk_...', envVar: 'CLICKUP_API_TOKEN', help: 'ClickUp → Settings → Apps → API Token.' },
      { key: 'teamId', label: 'Workspace (team) ID', type: 'text', required: true, placeholder: '9001234567', envVar: 'CLICKUP_TEAM_ID', help: 'The numeric id in your ClickUp URL.' },
    ],
    requestedScopes: ['read:spaces', 'read:folders', 'read:lists', 'read:tasks', 'read:comments'],
    syncs: ['Spaces', 'Folders', 'Lists', 'Tasks', 'Subtasks', 'Assignees', 'Statuses', 'Priorities', 'Due dates', 'Comments'],
    writeCapable: true,
    supportsDemo: true,
    setupSteps: [
      'In ClickUp, open Settings → Apps and generate a personal API token.',
      'Copy your workspace (team) id from the ClickUp URL: app.clickup.com/<teamId>/…',
      'Paste both here, or set CLICKUP_API_TOKEN and CLICKUP_TEAM_ID on the server.',
      'Run a manual sync, then map each ClickUp space to a company and client.',
    ],
    docsUrl: 'https://developer.clickup.com/docs',
    status: 'available',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    tagline: 'Customers, invoices, payments, refunds and subscription revenue.',
    category: 'finance',
    scope: 'company',
    authType: 'api_key',
    credentialFields: [
      { key: 'secretKey', label: 'Restricted API key', type: 'password', required: true, placeholder: 'rk_live_…', envVar: 'STRIPE_SECRET_KEY', help: 'Use a restricted key with read-only permissions.' },
      { key: 'webhookSecret', label: 'Webhook signing secret', type: 'password', required: false, placeholder: 'whsec_…', envVar: 'STRIPE_WEBHOOK_SECRET' },
    ],
    requestedScopes: ['customers:read', 'invoices:read', 'charges:read', 'subscriptions:read', 'refunds:read'],
    syncs: ['Customers', 'Invoices', 'Payments', 'Failed payments', 'Refunds', 'Subscriptions'],
    writeCapable: false,
    supportsDemo: true,
    setupSteps: [
      'In Stripe, go to Developers → API keys → Restricted keys and create a key.',
      'Grant read permissions for Customers, Invoices, Charges, Refunds and Subscriptions. Leave every write permission off.',
      'Paste the key here, or set STRIPE_SECRET_KEY on the server.',
      'Optionally add a webhook to /api/webhooks/stripe and paste the signing secret.',
    ],
    docsUrl: 'https://docs.stripe.com/keys',
    status: 'available',
  },
  {
    id: 'gusto',
    name: 'Gusto',
    tagline: 'Payroll totals, contractors and contractor payments.',
    category: 'people',
    scope: 'company',
    authType: 'api_key',
    credentialFields: [
      { key: 'accessToken', label: 'Access token', type: 'password', required: true, envVar: 'GUSTO_ACCESS_TOKEN', help: 'Issued by the Gusto OAuth app for your company.' },
      { key: 'companyId', label: 'Gusto company ID', type: 'text', required: true, envVar: 'GUSTO_COMPANY_ID' },
      { key: 'apiBase', label: 'API base URL', type: 'url', required: false, placeholder: 'https://api.gusto.com', envVar: 'GUSTO_API_BASE', help: 'Use https://api.gusto-demo.com for the Gusto sandbox.' },
    ],
    requestedScopes: ['companies:read', 'employees:read', 'contractors:read', 'payrolls:read', 'contractor_payments:read'],
    syncs: ['Employees (non-sensitive fields)', 'Contractors', 'Departments', 'Contractor payments', 'Payroll totals'],
    writeCapable: false,
    supportsDemo: true,
    setupSteps: [
      'Create a Gusto developer application and complete the OAuth flow for your company.',
      'Store the resulting access token as GUSTO_ACCESS_TOKEN, and the company id as GUSTO_COMPANY_ID.',
      'If a required endpoint is unavailable on your Gusto plan, use CSV import under Team → Import instead.',
      'Social security numbers and full bank details are never requested, stored or displayed.',
    ],
    docsUrl: 'https://docs.gusto.com/app-integrations/docs',
    status: 'available',
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    tagline: 'Calendar events, attendees and meeting links across calendars.',
    category: 'calendar',
    scope: 'company',
    authType: 'oauth',
    credentialFields: [
      { key: 'clientId', label: 'OAuth client ID', type: 'text', required: true, envVar: 'GOOGLE_CLIENT_ID' },
      { key: 'clientSecret', label: 'OAuth client secret', type: 'password', required: true, envVar: 'GOOGLE_CLIENT_SECRET' },
      { key: 'redirectUri', label: 'Redirect URI', type: 'url', required: true, placeholder: 'https://your-app/api/integrations/google_calendar/callback', envVar: 'GOOGLE_REDIRECT_URI' },
    ],
    requestedScopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    syncs: ['Calendars', 'Events', 'Attendees', 'Conference links', 'Time zones'],
    writeCapable: true,
    supportsDemo: true,
    setupSteps: [
      'In Google Cloud Console, create an OAuth 2.0 Client ID of type "Web application".',
      'Add the redirect URI shown above to the authorised redirect URIs.',
      'Enable the Google Calendar API for the project.',
      'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI, then click Connect to run the consent flow.',
      'Only calendar scopes are requested. Your Google password is never seen or stored by this application.',
    ],
    docsUrl: 'https://developers.google.com/calendar/api/guides/auth',
    status: 'available',
  },
  {
    id: 'parfax_crm',
    name: 'ParFax CRM / production database',
    tagline: 'Provider-neutral connector for the live ParFax platform.',
    category: 'product',
    scope: 'company',
    authType: 'api_key_or_base_url',
    credentialFields: [
      { key: 'apiBase', label: 'API base URL', type: 'url', required: true, placeholder: 'https://api.parfax.example/v1', envVar: 'PARFAX_API_BASE' },
      { key: 'apiKey', label: 'API key', type: 'password', required: true, envVar: 'PARFAX_API_KEY' },
    ],
    requestedScopes: ['users:read', 'subscriptions:read', 'scans:read', 'partners:read', 'support:read'],
    syncs: ['Users', 'Organizations', 'Partners', 'Subscriptions', 'Payments', 'Scans', 'Clubs', 'Marketplace activity', 'Support issues', 'Account notes'],
    writeCapable: true,
    supportsDemo: true,
    setupSteps: [
      'Identify the current ParFax system of record and its API or database export format.',
      'Provide the API base URL and a read-only key, or use the CSV/JSON import wizard instead.',
      'Review the generated field-mapping proposal and mark the source of truth for each field.',
      'The connector starts read-only. Write-back requires explicit, separately audited approval.',
    ],
    status: 'available',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    tagline: 'Document summarisation and cited answers in the Knowledge Hub.',
    category: 'ai',
    scope: 'holding',
    authType: 'api_key',
    credentialFields: [
      { key: 'apiKey', label: 'API key', type: 'password', required: true, placeholder: 'sk-ant-…', envVar: 'ANTHROPIC_API_KEY' },
      { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'claude-sonnet-5', envVar: 'ANTHROPIC_MODEL' },
    ],
    requestedScopes: ['messages:create'],
    syncs: ['Document summaries', 'Key points', 'Action-item extraction', 'Cited answers'],
    writeCapable: false,
    supportsDemo: true,
    setupSteps: [
      'Create an API key at console.anthropic.com.',
      'Set ANTHROPIC_API_KEY on the server, or paste it here to store it encrypted.',
      'Without a key the Knowledge Hub falls back to a local extractive summariser, which quotes source text rather than generating new prose.',
    ],
    docsUrl: 'https://docs.anthropic.com',
    status: 'available',
  },
  {
    id: 'email',
    name: 'Email provider',
    tagline: 'Outbound sending for investor and partnership sequences.',
    category: 'comms',
    scope: 'holding',
    authType: 'api_key',
    credentialFields: [],
    requestedScopes: [],
    syncs: [],
    writeCapable: true,
    supportsDemo: false,
    setupSteps: [
      'Not implemented. Message templates and drafts exist today, and nothing is sent automatically.',
      'When an email provider is added, sending will require explicit per-message approval.',
    ],
    status: 'planned',
    plannedNote:
      'Planned. Drafting and templates work today; no sending integration is connected, and no message leaves this system.',
  },
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_BY_ID.get(id as ProviderId);
}

-- Additional integration providers.
--
-- These are recorded as planned in the provider registry: the rows exist so
-- the Integrations page can list them honestly as not connected, and nothing
-- reads from or writes to any of these services yet.

alter table integration_connections
  drop constraint if exists integration_connections_provider_check;

alter table integration_connections
  add constraint integration_connections_provider_check
  check (provider in (
    'clickup','stripe','gusto','google_calendar','parfax_crm','anthropic','email',
    'slack','notion','metricool','otter','linkedin'));

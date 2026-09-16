import { describe, expect, it } from 'vitest';
import { routeForEntity, routeForHref, routeForNotification } from '@/lib/deep-links';

/**
 * A notification is written once, by the server, for both applications — so it
 * carries a web path. Opening it on a phone has to land on the mobile screen
 * for the same record, or somewhere sensible, and never on a blank page.
 */

const ID = '3f1c8a52-9d64-4a1e-8b7c-2e5f0a9b1d33';

describe('from the record a notification is about', () => {
  it('opens the record itself where there is a screen for it', () => {
    expect(routeForEntity('task', ID)).toBe(`/task/${ID}`);
    expect(routeForEntity('client', ID)).toBe(`/client/${ID}`);
    expect(routeForEntity('contact', ID)).toBe(`/contact/${ID}`);
  });

  it('opens the pipeline where the record has no screen of its own', () => {
    expect(routeForEntity('investor', ID)).toBe('/pipeline/investor');
    expect(routeForEntity('partnership', ID)).toBe('/pipeline/partnership');
    expect(routeForEntity('meeting', ID)).toBe('/(tabs)/calendar');
  });

  it('returns nothing for a record the app does not show', () => {
    expect(routeForEntity('invoice', ID)).toBeNull();
    expect(routeForEntity(null)).toBeNull();
    expect(routeForEntity('task', null)).toBeNull();
  });
});

describe('from a web path', () => {
  it('translates a record path to its mobile screen', () => {
    expect(routeForHref(`/tasks/${ID}`)).toBe(`/task/${ID}`);
    expect(routeForHref(`/crm/clients/${ID}`)).toBe(`/client/${ID}`);
    expect(routeForHref(`/crm/contacts/${ID}`)).toBe(`/contact/${ID}`);
    expect(routeForHref(`/investors/${ID}`)).toBe('/pipeline/investor');
  });

  it('translates a list path to its tab', () => {
    expect(routeForHref('/tasks')).toBe('/(tabs)/tasks');
    expect(routeForHref('/crm')).toBe('/(tabs)/crm');
    expect(routeForHref('/calendar/')).toBe('/(tabs)/calendar');
    expect(routeForHref('/')).toBe('/(tabs)');
  });

  it('accepts a full URL as well as a path', () => {
    expect(routeForHref(`https://command.example.test/tasks/${ID}`)).toBe(`/task/${ID}`);
  });

  it('refuses anything that is not a path this app knows', () => {
    expect(routeForHref('/finance/invoices')).toBeNull();
    expect(routeForHref('/tasks/not-a-uuid')).toBeNull();
    expect(routeForHref('javascript:alert(1)')).toBeNull();
    expect(routeForHref('//evil.example.test/tasks')).toBeNull();
    expect(routeForHref(undefined)).toBeNull();
  });
});

describe('a tapped notification', () => {
  it('prefers the record it names over the path it carries', () => {
    expect(routeForNotification({ entityType: 'task', entityId: ID, href: '/finance' })).toBe(
      `/task/${ID}`,
    );
  });

  it('falls back to the path when the record has no screen', () => {
    expect(routeForNotification({ entityType: 'invoice', entityId: ID, href: '/tasks' })).toBe(
      '/(tabs)/tasks',
    );
  });

  it('stays where it is when there is nothing to open', () => {
    expect(routeForNotification({ entityType: 'invoice', entityId: ID, href: '/finance' })).toBeNull();
    expect(routeForNotification(null)).toBeNull();
  });
});

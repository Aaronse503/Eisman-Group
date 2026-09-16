/**
 * Everything both applications agree on: who may do what, what a valid record
 * looks like, how a figure is written, and the shape of the API between them.
 *
 * Nothing in here may import from a platform: no React, no Next, no React
 * Native, no database driver. If it cannot run in both a server and a phone,
 * it does not belong here.
 */
export * from './permissions';
export * from './dates';
export * from './format';
export * from './api-types';

export * from './domain/crm';
export * from './domain/growth';
export * from './domain/meetings';
export * from './domain/tasks';

export * from './validation/schemas';
export * from './validation/crm';
export * from './validation/tasks';
export * from './validation/team';
export * from './validation/finance';
export * from './validation/growth';
export * from './validation/meetings';
export * from './validation/parfax';
export * from './validation/demo';

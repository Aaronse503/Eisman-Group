import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
import { sql, asUser } from '../../src/lib/db/client';

async function main() {
  const [owner] = await sql<{ id: string }>(`select id from users where email = 'aaron@eismandigital.com'`);
  const [viewer] = await sql<{ id: string }>(`select id from users where email like 'val.viewer@%'`);
  const [parfaxAdmin] = await sql<{ id: string }>(`select id from users where email like 'jordan.parfax@%'`);
  const [am] = await sql<{ id: string }>(`select id from users where email like 'priya.am@%'`);

  const count = async (uid: string | null, table: string) =>
    asUser(uid, async (db) => (await db.query<{ c: number }>(`select count(*)::int as c from ${table}`))[0]!.c);

  const rows: [string, unknown][] = [
    ['service clients', (await sql<{c:number}>(`select count(*)::int c from clients`))[0]!.c],
    ['owner clients', await count(owner!.id, 'clients')],
    ['ED viewer clients', await count(viewer!.id, 'clients')],
    ['ParFax admin ED-clients', await count(parfaxAdmin!.id, 'clients')],
    ['ParFax admin partnerships', await count(parfaxAdmin!.id, 'partnerships')],
    ['ED viewer partnerships', await count(viewer!.id, 'partnerships')],
    ['anonymous clients', await count(null, 'clients')],
    ['ED viewer parfax_users', await count(viewer!.id, 'parfax_users')],
    ['ParFax admin parfax_users', await count(parfaxAdmin!.id, 'parfax_users')],
  ];

  const before = (await sql<{ name: string }>(`select name from clients order by name limit 1`))[0]!.name;
  let writeErr = '';
  try {
    await asUser(viewer!.id, (db) => db.query(`update clients set name = 'RLS-BREACH'`));
  } catch (e) { writeErr = (e as Error).message.split('\n')[0]!; }
  const breached = (await sql<{c:number}>(`select count(*)::int c from clients where name='RLS-BREACH'`))[0]!.c;
  rows.push(['viewer UPDATE blocked', breached === 0 ? `yes (${writeErr || 'zero rows visible'})` : `NO — ${breached} rows changed`]);

  let amWrite = 'no';
  try {
    await asUser(am!.id, (db) => db.query(`update clients set next_action = 'am-write-ok' where name = $1`, [before]));
    amWrite = (await sql<{c:number}>(`select count(*)::int c from clients where next_action='am-write-ok'`))[0]!.c ? 'yes' : 'no';
  } catch (e) { amWrite = `error: ${(e as Error).message.slice(0, 60)}`; }
  rows.push(['account manager UPDATE allowed', amWrite]);

  for (const [k, v] of rows) console.log(`${k.padEnd(32)} ${v}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

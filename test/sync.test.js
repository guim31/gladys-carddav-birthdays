// -----------------------------------------------------------------------------
// Synchronization against the SDK's fake Gladys and the replayed Radicale:
// calendars, events, window, errors, and nothing written when nothing moved.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOW, account, createWorld } from './helpers/world.js';

const BIRTHDAYS = 'ext:test-integration:alice:birthday';
const ANNIVERSARIES = 'ext:test-integration:alice:anniversary';
const DAY = 86_400_000;

test('a Birthdays calendar per user, one full-day event per date of the coming year', async () => {
  const world = await createWorld();
  assert.deepEqual(
    world.fake.calendars.map((c) => [c.external_id, c.name, c.user]),
    [[BIRTHDAYS, 'Anniversaires', 'alice']],
  );
  assert.equal(
    world.calendarNamed('Anniversaires').description,
    "5 date(s) lue(s) dans votre carnet d'adresses CardDAV.",
  );
  assert.deepEqual(
    world.eventsOf(BIRTHDAYS).map((e) => [e.start, e.end, e.name, e.full_day]),
    [
      ['2026-11-16', '2026-11-17', 'Anniversaire de Paul Leroy', true],
      ['2026-11-18', '2026-11-19', "Anniversaire d'Émilie Durand", true],
      // 29 February in a common year: the 28th.
      ['2027-02-28', '2027-03-01', 'Anniversaire de Léo Bissextile (27 ans)', true],
      ['2027-04-12', '2027-04-13', 'Anniversaire de Marie Martin (35 ans)', true],
    ],
  );
  for (const event of world.eventsOf(BIRTHDAYS)) {
    assert.match(event.external_id, /^ext:test-integration:alice:birthday:[0-9a-f]{16}:\d{4}$/);
  }
});

test('the anniversaries in a second calendar, on request, and gone when switched off', async () => {
  const world = await createWorld({ accounts: [account('alice', { anniversaries: true })] });
  assert.deepEqual(
    world.eventsOf(ANNIVERSARIES).map((e) => [e.start, e.name]),
    [
      ['2027-06-20', "Anniversaire de mariage d'Émilie Durand (12 ans)"],
      ['2027-09-04', 'Anniversaire de mariage de Paul Leroy (17 ans)'],
    ],
  );
  await world.editAccount('alice', { anniversaries: false });
  assert.deepEqual(
    world.fake.calendars.map((c) => c.external_id),
    [BIRTHDAYS],
  );
  assert.equal(world.eventsOf(ANNIVERSARIES).length, 0);
});

test('the language of the owner, and no age when asked', async () => {
  const world = await createWorld({ accounts: [account('alice', { show_age: false }, 'en')] });
  assert.equal(world.fake.calendars[0].name, 'Birthdays');
  assert.deepEqual(
    world.eventsOf(BIRTHDAYS).map((e) => e.name),
    [
      "Paul Leroy's birthday",
      "Émilie Durand's birthday",
      "Léo Bissextile's birthday",
      "Marie Martin's birthday",
    ],
  );
});

test('nothing is written again while nothing changed; the window slides at midnight', async () => {
  const world = await createWorld();
  const writes = () =>
    world.fake.requests.filter((r) => r.method === 'POST' && r.path.startsWith('/calendar')).length;
  const before = writes();
  await world.resync();
  assert.equal(writes(), before);
  // Two days later the window moves: one write, Paul's birthday kept (a week back).
  world.clock.now = NOW + 2 * DAY;
  await world.resync({ fetch: false });
  assert.equal(writes(), before + 1);
  assert.equal(world.eventsOf(BIRTHDAYS)[0].start, '2026-11-16');
});

test('a wrong password: the calendar says why, the events stay', async () => {
  const world = await createWorld();
  world.server.password = 'changed';
  await world.resync();
  await world.resync();
  assert.match(world.fake.calendars[0].description, /identifiant ou mot de passe refusé/);
  assert.equal(world.eventsOf(BIRTHDAYS).length, 4);
  world.server.password = 'test-app-password';
  await world.resync();
  assert.match(world.fake.calendars[0].description, /5 date/);
});

test('a server that never answered: the calendar exists, empty, with the reason', async () => {
  const world = await createWorld({
    accounts: [account('alice', { server_url: 'http://192.0.2.10:5232/nobody/' })],
  });
  assert.equal(world.fake.calendars.length, 1);
  assert.match(world.fake.calendars[0].description, /aucun service CardDAV/);
  assert.equal(world.eventsOf(BIRTHDAYS).length, 0);
  assert.ok(world.syncer.ready);
});

test('a calendar switched off (sync: false) is left alone, the account disabled is forgotten', async () => {
  const world = await createWorld();
  world.fake.calendars[0].sync = false;
  await world.fake.calendarAccountUpdated('alice');
  await world.app.idle();
  assert.equal(world.syncer.users.get('alice').calendars.birthday.sync, false);
  world.fake.calendarAccounts.length = 0;
  await world.fake.calendarAccountUpdated('alice');
  await world.app.idle();
  assert.equal(world.syncer.users.size, 0);
});

test('two users: user-scoped ids, no collision', async () => {
  const world = await createWorld({ accounts: [account('alice'), account('bob', {}, 'de')] });
  assert.deepEqual(
    world.fake.calendars.map((c) => [c.external_id, c.name]),
    [
      [BIRTHDAYS, 'Anniversaires'],
      ['ext:test-integration:bob:birthday', 'Geburtstage'],
    ],
  );
  assert.equal(world.fake.calendarEvents.length, 8);
  assert.equal(
    world.eventsOf('ext:test-integration:bob:birthday')[2].name,
    'Geburtstag von Léo Bissextile (27 Jahre)',
  );
});

async function captureLogs(t, fn) {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  for (const stream of [process.stdout, process.stderr]) {
    t.mock.method(stream, 'write', (chunk) => {
      lines.push(...String(chunk).split('\n').filter(Boolean));
      return true;
    });
  }
  try {
    await fn();
  } finally {
    t.mock.restoreAll();
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  }
  return lines;
}

test('a normal synchronization and the reminders write nothing at the info level', async (t) => {
  const world = await createWorld();
  await world.share('Anniversaires');
  const lines = await captureLogs(t, async () => {
    world.clock.now = NOW + DAY;
    await world.resync();
    await world.resync({ fetch: false });
    await world.app.tick();
  });
  assert.deepEqual(lines, []);
});

test('a failing server: one warning, then one line when it is back', async (t) => {
  const world = await createWorld();
  const lines = await captureLogs(t, async () => {
    world.server.down = true;
    await world.resync();
    await world.resync();
    await world.resync();
    world.server.down = false;
    await world.resync();
  });
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /WARN.*not read: server unreachable \(ECONNREFUSED\)/);
  assert.match(lines[1], /INFO.*read again/);
  assert.ok(!lines.join('').includes('test-app-password'));
});

test('the write limiter waits once 25 writes were made within a minute', async () => {
  const { createLimiter } = await import('../src/syncer.js');
  let now = 0;
  const waits = [];
  const limit = createLimiter({
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  });
  for (let i = 0; i < 26; i += 1) {
    await limit();
  }
  assert.deepEqual(waits, [60_000]);
});

test('more than 500 events: disjoint windows cut between two days', async () => {
  const { chunkByDate } = await import('../src/birthdays.js');
  const list = Array.from({ length: 1200 }, (_, i) => ({
    date: `2027-01-${String((i % 28) + 1).padStart(2, '0')}`,
  })).sort((a, b) => a.date.localeCompare(b.date));
  const chunks = chunkByDate(list, '2026-12-25', '2027-12-25', 500);
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0].fromDate, '2026-12-25');
  assert.equal(chunks.at(-1).toDate, '2027-12-26');
  for (let i = 1; i < chunks.length; i += 1) {
    assert.equal(chunks[i].fromDate, chunks[i - 1].toDate);
    assert.ok(
      chunks[i].items.every(
        (item) => item.date >= chunks[i].fromDate && item.date < chunks[i].toDate,
      ),
    );
  }
  assert.ok(chunks.every((chunk) => chunk.items.length <= 500));
  assert.equal(
    chunks.reduce((n, c) => n + c.items.length, 0),
    1200,
  );
});

test('an account switched off and on again gets its calendar back, in full', async () => {
  const world = await createWorld();
  const accounts = [...world.fake.calendarAccounts];
  // The core destroys the calendars of a disabled account.
  world.fake.calendarAccounts.length = 0;
  await world.gladys.deleteCalendar(BIRTHDAYS).catch(() => {});
  world.fake.calendars = [];
  world.fake.calendarEvents = [];
  await world.fake.calendarAccountUpdated('alice');
  await world.app.idle();
  world.fake.calendarAccounts.push(...accounts);
  await world.fake.calendarAccountUpdated('alice');
  await world.app.idle();
  assert.equal(world.fake.calendars.length, 1);
  assert.equal(world.eventsOf(BIRTHDAYS).length, 4);
});

test('anniversaries off and on, sync off and on: the events come back at once', async () => {
  const world = await createWorld({ accounts: [account('alice', { anniversaries: true })] });
  await world.editAccount('alice', { anniversaries: false });
  await world.editAccount('alice', { anniversaries: true });
  assert.equal(world.eventsOf(ANNIVERSARIES).length, 2);

  // The core empties a calendar switched off.
  const calendar = world.fake.calendars.find((c) => c.external_id === BIRTHDAYS);
  calendar.sync = false;
  world.fake.calendarEvents = world.fake.calendarEvents.filter(
    (e) => e.calendar_external_id !== BIRTHDAYS,
  );
  await world.fake.calendarAccountUpdated('alice');
  await world.app.idle();
  calendar.sync = true;
  await world.fake.calendarAccountUpdated('alice');
  await world.app.idle();
  assert.equal(world.eventsOf(BIRTHDAYS).length, 4);
});

test('a wrong password is not retried quickly, a server down is', async () => {
  const world = await createWorld();
  world.server.password = 'changed';
  let result = await world.syncer.syncAll();
  assert.deepEqual(
    result.failures.map((f) => f.retry),
    [false],
  );
  world.server.password = 'test-app-password';
  world.server.down = true;
  result = await world.syncer.syncAll();
  assert.deepEqual(
    result.failures.map((f) => f.retry),
    [true],
  );
});

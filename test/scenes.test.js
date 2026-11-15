// -----------------------------------------------------------------------------
// The daily reminders, the scene action and the widget: shared calendars
// only, once a day at the chosen hour.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { NOW, account, createWorld } from './helpers/world.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('no reminder for a private calendar, nor before the chosen hour', async () => {
  const world = await createWorld();
  world.clock.now = NOW + 2 * HOUR; // 09:00 in Paris
  assert.equal(await world.app.tick(), 0);
  await world.share('Anniversaires');
  world.clock.now = NOW + 0.5 * HOUR; // 07:30
  assert.equal(await world.app.tick(), 0);
  assert.equal(world.fake.sceneEvents.length, 0);
});

test('at 08:00, one event per date 0, 1, 2, 3, 7, 14 or 30 days ahead, once a day', async () => {
  const world = await createWorld();
  await world.share('Anniversaires');
  world.clock.now = NOW + HOUR + 60_000; // 08:01
  assert.equal(await world.app.tick(), 2);
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: 'birthday_reminder',
      data: {
        days_before: 1,
        kind: 'birthday',
        name: 'Paul Leroy',
        kind_label: 'Anniversaires',
        age: null,
        date: 'lundi 16 novembre',
        message: 'Anniversaire de Paul Leroy : Demain, lundi 16 novembre.',
        user: 'Alice',
      },
    },
    {
      key: 'birthday_reminder',
      data: {
        days_before: 3,
        kind: 'birthday',
        name: 'Émilie Durand',
        kind_label: 'Anniversaires',
        age: null,
        date: 'mercredi 18 novembre',
        message: "Anniversaire d'Émilie Durand : Dans 3 jours, mercredi 18 novembre.",
        user: 'Alice',
      },
    },
  ]);
  world.clock.now += 10 * 60_000;
  assert.equal(await world.app.tick(), 0);
  assert.equal(world.saved.state.reminded, '2026-11-15');
  // The next day: Paul's own day.
  world.clock.now = NOW + DAY + HOUR + 60_000;
  assert.equal(await world.app.tick(), 2);
  assert.deepEqual(
    world.fake.sceneEvents.slice(2).map((event) => [event.data.name, event.data.days_before]),
    [
      ['Paul Leroy', 0],
      ['Émilie Durand', 2],
    ],
  );
});

test('a restart after the reminders does not repeat them; an hour long past is skipped', async () => {
  // A fresh load of the saved state, as after a restart.
  const fresh = await createWorld({ config: { notify_hour: '7' } });
  await fresh.share('Anniversaires');
  fresh.saved.state = { reminded: '2026-11-15' };
  fresh.clock.now = NOW + 60_000;
  assert.equal(await fresh.app.tick(), 0);

  const late = await createWorld({ config: { notify_hour: '7' } });
  await late.share('Anniversaires');
  late.clock.now = NOW + 3 * HOUR; // 10:00, the 07:00 reminders are three hours late
  assert.equal(await late.app.tick(), 0);
  assert.equal(late.saved.state.reminded, '2026-11-15');
});

test('the scene action: the next date, the days left, the names of the day', async () => {
  const world = await createWorld({ accounts: [account('alice', { anniversaries: true })] });
  let ack = await world.fake.sceneAction('next_birthday', {});
  assert.equal(ack.data.outputs.found, 0);
  await world.share('Anniversaires');
  ack = await world.fake.sceneAction('next_birthday', {});
  assert.deepEqual(ack.data.outputs, {
    found: 1,
    name: 'Paul Leroy',
    kind: 'birthday',
    days: 1,
    date: 'lundi 16 novembre',
    message: 'Anniversaire de Paul Leroy : Demain, lundi 16 novembre.',
    age: 0,
    today_count: 0,
    today_names: '',
  });
  // Anniversaries: their calendar is still private.
  ack = await world.fake.sceneAction('next_birthday', { kind: 'anniversary' });
  assert.equal(ack.data.outputs.found, 0);
  await world.share('Anniversaires de mariage');
  ack = await world.fake.sceneAction('next_birthday', { kind: 'anniversary' });
  assert.equal(ack.data.outputs.name, 'Émilie Durand');
  assert.equal(ack.data.outputs.age, 12);
  world.clock.now = NOW + DAY;
  ack = await world.fake.sceneAction('next_birthday', {});
  assert.equal(ack.data.outputs.today_count, 1);
  assert.equal(ack.data.outputs.today_names, 'Paul Leroy');
});

test('the widget: the next birthdays, valid for the core, in the viewer language', async () => {
  const world = await createWorld({ accounts: [account('alice', { anniversaries: true })] });
  let ack = await world.fake.widgetGet('birthdays', { settings: {}, language: 'fr' });
  assert.match(ack.data.content.components[0].text, /Aucun calendrier/);
  await world.share('Anniversaires');
  await world.share('Anniversaires de mariage');
  world.clock.now = NOW + DAY;
  ack = await world.fake.widgetGet('birthdays', { settings: { count: '3' }, language: 'en' });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const [list] = ack.data.content.components;
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge?.text ?? null]),
    [
      ['Paul Leroy', 'Today · Monday 16 November', 'Today'],
      ['Émilie Durand', 'In 2 days · Wednesday 18 November', null],
      ['Léo Bissextile', 'In 104 days · Sunday 28 February · 27 years', null],
    ],
  );
  ack = await world.fake.widgetGet('birthdays', {
    settings: { count: '8', anniversaries: false, show_age: false },
    language: 'de',
  });
  const titles = ack.data.content.components[0].items.map((item) => item.subtitle);
  assert.equal(titles.length, 5);
  assert.ok(titles.every((subtitle) => !/Jahr|Hochzeit/.test(subtitle)));
});

test('contacts never read (server down since start-up): the reminders wait for them', async () => {
  const world = await createWorld();
  await world.share('Anniversaires');
  // A restart with the server down: nothing in memory.
  world.server.down = true;
  world.syncer.source.forget('alice');
  world.syncer.users.get('alice').entries = [];
  await world.resync();
  assert.ok(world.syncer.waitingForContacts());
  world.clock.now = NOW + HOUR + 60_000; // 08:01
  assert.equal(await world.app.tick(), 0);
  assert.equal(world.saved.state.reminded, undefined);
  world.server.down = false;
  await world.resync();
  world.clock.now = NOW + HOUR + 20 * 60_000; // 08:20
  assert.equal(await world.app.tick(), 2);
});

test('a wrong password for one user does not hold back the reminders of the others', async () => {
  const world = await createWorld({
    accounts: [account('alice'), account('bob', { password: 'wrong' })],
  });
  for (const calendar of world.fake.calendars) {
    calendar.shared = true;
  }
  await world.resync();
  assert.equal(world.syncer.waitingForContacts(), false);
  world.clock.now = NOW + HOUR + 60_000;
  assert.equal(await world.app.tick(), 2);
});

test('a server down for the whole grace hour: what is known is sent at its end', async () => {
  const world = await createWorld({ accounts: [account('alice'), account('bob')] });
  for (const calendar of world.fake.calendars) {
    calendar.shared = true;
  }
  world.server.down = true;
  world.syncer.source.forget('bob');
  world.syncer.users.get('bob').entries = [];
  await world.resync();
  world.clock.now = NOW + HOUR + 60_000;
  assert.equal(await world.app.tick(), 0);
  world.clock.now = NOW + 2 * HOUR + 60_000; // grace hour over
  assert.equal(await world.app.tick(), 2);
});

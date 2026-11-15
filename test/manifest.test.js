// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  ACCOUNT_DEFAULTS,
  DEFAULT_CONFIG,
  LANGUAGES,
  NOTIFY_HOURS,
  SYNC_HOURS,
} from '../src/config.js';
import { registerHandlers } from '../src/app.js';
import { KINDS, REMIND_DAYS, SCENE_ACTIONS, SCENE_TRIGGER_KEYS } from '../src/scenes.js';
import { BIRTHDAYS_WIDGET, WIDGET_COUNTS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionsOf = (field) => field.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

test('a local calendar integration, for Gladys 5.2.0 and later', () => {
  // `type: "calendar"` and `account_schema` came with 5.2.0.
  assert.equal(manifest.type, 'calendar');
  assert.equal(manifest.gladys_version, '>=5.2.0');
  assert.deepEqual(manifest.categories, ['services']);
  assert.deepEqual(manifest.transports, ['local']);
});

test('the account fields are the ones the code reads', () => {
  const fields = manifest.account_schema.filter((entry) => entry.type !== 'section');
  assert.deepEqual(keysOf(fields).sort(), Object.keys(ACCOUNT_DEFAULTS).sort());
  for (const key of ['server_url', 'username', 'password']) {
    assert.equal(field(fields, key).required, true, key);
  }
  assert.equal(field(fields, 'password').type, 'secret');
  assert.equal(field(fields, 'anniversaries').default, ACCOUNT_DEFAULTS.anniversaries);
  assert.equal(field(fields, 'show_age').default, ACCOUNT_DEFAULTS.show_age);
});

test('config_schema defaults and choices are the ones of the code', () => {
  const settings = manifest.config_schema.filter((item) => item.type !== 'section');
  for (const entry of settings) {
    assert.equal(DEFAULT_CONFIG[entry.key], entry.default, `default of ${entry.key}`);
  }
  assert.deepEqual(Object.keys(DEFAULT_CONFIG).sort(), keysOf(settings).sort());
  assert.deepEqual(optionsOf(field(settings, 'sync_hours')), SYNC_HOURS);
  assert.deepEqual(optionsOf(field(settings, 'notify_hour')), NOTIFY_HOURS);
  assert.deepEqual(optionsOf(field(settings, 'language')), LANGUAGES);
});

test('every declared scene action and widget has a handler', async () => {
  const gladys = createFakeGladys();
  registerHandlers(gladys, {
    timers: false,
    store: { load: async () => ({}), save: async () => {} },
  });
  assert.equal(manifest.actions, undefined);
  assert.deepEqual(keysOf(manifest.scene_actions), Object.keys(SCENE_ACTIONS));
  for (const key of keysOf(manifest.scene_actions)) {
    const ack = await gladys.fake.sceneAction(key, {});
    assert.equal(ack.success, true, `${key}: ${ack.error}`);
    assert.deepEqual(
      Object.keys(ack.data.outputs),
      keysOf(field(manifest.scene_actions, key).outputs),
    );
  }
  const action = field(manifest.scene_actions, 'next_birthday');
  assert.deepEqual(optionsOf(field(action.fields, 'kind')), KINDS);
  assert.deepEqual(keysOf(manifest.widgets), [BIRTHDAYS_WIDGET]);
  const ack = await gladys.fake.widgetGet(BIRTHDAYS_WIDGET, { settings: {}, language: 'en' });
  assert.equal(ack.success, true);
});

test('the scene trigger fired by the code is the declared one, with its filters', async () => {
  const { reminderEvents } = await import('../src/scenes.js');
  assert.deepEqual(keysOf(manifest.scene_triggers), SCENE_TRIGGER_KEYS);
  const trigger = field(manifest.scene_triggers, 'birthday_reminder');
  assert.deepEqual(optionsOf(field(trigger.fields, 'days_before')), REMIND_DAYS);
  assert.deepEqual(optionsOf(field(trigger.fields, 'kind')), KINDS);
  const [event] = reminderEvents(
    [{ key: 'k', kind: 'birthday', name: 'A', month: 1, day: 2, year: 1990, user: 'Alice' }],
    '2026-01-02',
    'en',
  );
  // Every filter and every variable is in the data the code sends.
  for (const key of [...keysOf(trigger.fields), ...keysOf(trigger.variables)]) {
    assert.ok(key in event.data, key);
  }
  assert.deepEqual(Object.keys(event.data).sort(), keysOf(trigger.variables).sort());
});

test('the widget settings are the ones the code reads', () => {
  const [widget] = manifest.widgets;
  assert.deepEqual(keysOf(widget.settings), ['count', 'anniversaries', 'show_age']);
  assert.deepEqual(optionsOf(field(widget.settings, 'count')), WIDGET_COUNTS);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.equal(
    manifest.docker_image,
    `ghcr.io/guim31/gladys-carddav-birthdays:${manifest.version}`,
  );
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-carddav-birthdays/main/cover.png',
  );
});

test('section fields are purely presentational', () => {
  for (const section of [...manifest.config_schema, ...manifest.account_schema].filter(
    (entry) => entry.type === 'section',
  )) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
  }
});

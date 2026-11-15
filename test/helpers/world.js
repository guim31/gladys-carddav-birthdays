// -----------------------------------------------------------------------------
// Test helpers: the SDK's fake Gladys (which checks the calendar contract like
// the core: enabled users, `sync: false` → 403, window overlap, prune), a
// settable clock, no timers, and a CardDAV server replayed from a real
// Radicale session (test/fixtures/radicale-session.json). Times are read in
// Europe/Paris, the TZ the supervisor injects for a French instance.
// -----------------------------------------------------------------------------

import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { CardDavClient } from '../../src/carddav.js';
import { ContactSource } from '../../src/contacts.js';

process.env.TZ = 'Europe/Paris';

export const NOW = Date.parse('2026-11-15T06:00:00.000Z'); // Sunday 15 November 2026, 07:00 in Paris
export const SERVER = 'http://192.0.2.10:5232';
export const PASSWORD = 'test-app-password';

export const SESSION = JSON.parse(
  await readFile(new URL('../fixtures/radicale-session.json', import.meta.url), 'utf8'),
);

/**
 * A fake fetch that answers like the recorded Radicale: same method, URL and
 * depth. `server.down` → network error; `server.password` is the only one
 * accepted (Basic).
 */
export function createServer() {
  const server = {
    down: false,
    password: PASSWORD,
    requests: [],
    // Changed answers, by `METHOD url depth`.
    overrides: new Map(),
    fetch: async (url, init = {}) => {
      server.requests.push({
        url,
        method: init.method,
        headers: init.headers ?? {},
        body: init.body,
      });
      if (server.down) {
        const err = new TypeError('fetch failed');
        err.cause = { code: 'ECONNREFUSED' };
        throw err;
      }
      const expected = `Basic ${Buffer.from(`alice:${server.password}`).toString('base64')}`;
      if (init.headers?.Authorization !== expected) {
        return new Response('', {
          status: 401,
          headers: { 'www-authenticate': 'Basic realm="Radicale"' },
        });
      }
      const depth = init.headers?.Depth ?? null;
      const key = `${init.method} ${url} ${depth}`;
      const entry =
        server.overrides.get(key) ??
        SESSION.find(
          (item) => item.method === init.method && item.url === url && item.depth === depth,
        );
      if (!entry) {
        return new Response('', { status: 404 });
      }
      return new Response(entry.status === 301 ? null : entry.body, {
        status: entry.status,
        headers: entry.headers,
      });
    },
  };
  return server;
}

export function account(selector, config = {}, language = 'fr') {
  const firstName = selector[0].toUpperCase() + selector.slice(1);
  return {
    user: { selector, first_name: firstName, language },
    config: { server_url: `${SERVER}/`, username: 'alice', password: PASSWORD, ...config },
  };
}

/**
 * @param {object} [options]
 * @param {object[]} [options.accounts] calendar accounts
 * @param {object} [options.config] admin config
 * @param {object[]} [options.calendars] calendars already in Gladys
 * @param {number} [options.now]
 * @param {object} [options.logger]
 */
export async function createWorld(options = {}) {
  const clock = { now: options.now ?? NOW };
  const server = createServer();
  const saved = { state: {} };
  const gladys = createFakeGladys({
    config: options.config ?? {},
    calendarAccounts: options.accounts ?? [account('alice')],
    calendars: options.calendars ?? [],
    logger: options.logger,
  });
  const app = registerHandlers(gladys, {
    now: () => clock.now,
    sleep: async () => {},
    timers: false,
    source: new ContactSource({
      createClient: (opts) => new CardDavClient({ ...opts, fetch: server.fetch }),
    }),
    store: {
      load: async () => ({ ...saved.state }),
      save: async (state) => {
        saved.state = { ...state };
      },
    },
  });
  await gladys.connect();
  await app.idle();
  return {
    gladys,
    fake: gladys.fake,
    app,
    syncer: app.syncer,
    server,
    clock,
    saved,
    eventsOf(calendarExternalId) {
      return gladys.fake.calendarEvents
        .filter((event) => event.calendar_external_id === calendarExternalId)
        .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
    },
    calendarNamed(name) {
      return gladys.fake.calendars.find((calendar) => calendar.name === name);
    },
    /** The user shares a calendar (the toggle of "My calendars"). */
    async share(name, shared = true) {
      const calendar = gladys.fake.calendars.find((entry) => entry.name === name);
      calendar.shared = shared;
      await gladys.fake.calendarAccountUpdated(calendar.user);
      await app.idle();
    },
    async editAccount(selector, config) {
      const entry = gladys.fake.calendarAccounts.find((a) => a.user.selector === selector);
      entry.config = { ...entry.config, ...config };
      await gladys.fake.calendarAccountUpdated(selector);
      await app.idle();
    },
    async resync(options) {
      await app.syncer.syncAll(options);
      await app.idle();
    },
  };
}

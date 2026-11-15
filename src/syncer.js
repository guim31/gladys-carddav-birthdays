// -----------------------------------------------------------------------------
// Synchronization: for every user who enabled the integration, a "Birthdays"
// calendar (and a "Wedding anniversaries" one if they asked for it), filled
// with the occurrences of a sliding window: a week back, a year ahead. Every
// publication carries its window, so the core prunes what the address book
// no longer holds (a contact deleted, a date corrected).
//
// Identifiers: calendar `<user>:birthday` / `<user>:anniversary`, event
// `<user>:<kind>:<contact key>:<year>`, the contact key being a hash of the
// vCard UID. Nothing is written when nothing changed.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { chunkByDate, occurrences } from './birthdays.js';
import { languageOf, parseAccount } from './config.js';
import { ContactSource } from './contacts.js';
import { CALENDAR_TEXT, ERROR_TEXT, TEXT, eventName, pick } from './i18n.js';
import { addDays, addMonths, localDate, localTime } from './time.js';

const logger = createLogger({ name: 'sync' });

export const KINDS = ['birthday', 'anniversary'];
export const PAST_DAYS = 7;
export const AHEAD_MONTHS = 12;
export const PERMANENT = ['auth', 'invalid_url', 'not_found', 'no_address_book'];
export const COLORS = { birthday: '#e64980', anniversary: '#7048e8' };

/** A short reason for the logs, never a secret. */
export const describe = (err) => err?.message ?? String(err);

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Write limiter: the core accepts 30 calendar writes per minute per
 * integration (429 beyond). Keeps a margin, waits when the minute is full.
 */
export function createLimiter({ now = Date.now, sleep, perMinute = 25 } = {}) {
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const stamps = [];
  return async function limit() {
    for (;;) {
      const t = now();
      while (stamps.length > 0 && stamps[0] <= t - 60_000) {
        stamps.shift();
      }
      if (stamps.length < perMinute) {
        stamps.push(t);
        return;
      }
      await wait(stamps[0] + 60_000 - t);
    }
  };
}

export class Syncer {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {() => number} options.now
   * @param {() => Promise<void>} [options.limit] write limiter
   * @param {ContactSource} [options.source]
   */
  constructor({ gladys, now, limit, source }) {
    this.gladys = gladys;
    this.now = now;
    this.limit = limit ?? (async () => {});
    this.source = source ?? new ContactSource();
    /** userSelector → { selector, name, language, entries, calendars: { kind: { shared, sync } }, error } */
    this.users = new Map();
    /** calendar or event-window id → hash of what was last written */
    this.written = new Map();
    this.ready = false;
    this.running = Promise.resolve();
  }

  /** Runs the synchronizations one after the other. */
  queue(task) {
    const run = this.running.then(task, task);
    this.running = run.catch(() => {});
    return run;
  }

  /** After a reconnection, everything is written again once. */
  forgetWrites() {
    this.written.clear();
  }

  /**
   * Every enabled user, re-read from the core (the resync contract).
   * @param {{ fetch?: boolean }} [options] false: republish from the cache only (daily slide)
   */
  syncAll({ fetch = true } = {}) {
    return this.queue(async () => {
      const accounts = await this.gladys.getCalendarAccounts();
      const calendars = await this.gladys.getCalendars();
      const enabled = new Set(accounts.map((account) => account.user.selector));
      for (const selector of this.users.keys()) {
        if (!enabled.has(selector)) {
          this.dropUser(selector);
        }
      }
      const failures = [];
      for (const account of accounts) {
        const own = calendars.filter((calendar) => calendar.user === account.user.selector);
        const failure = await this.syncAccount(account, own, { fetch });
        if (failure) {
          failures.push({ ...failure, text: `${account.user.selector}: ${failure.text}` });
        }
      }
      this.ready = true;
      return { users: accounts.length, failures };
    });
  }

  /** One user, after they enabled, disabled or changed their account. */
  syncUser(selector) {
    return this.queue(async () => {
      const account = (await this.gladys.getCalendarAccounts()).find(
        (entry) => entry.user.selector === selector,
      );
      if (!account) {
        // Disabled: the core already destroyed their calendars.
        this.dropUser(selector);
        return { users: 0, failures: [] };
      }
      const failure = await this.syncAccount(account, await this.gladys.getCalendars(selector));
      return {
        users: 1,
        failures: failure ? [{ ...failure, text: `${selector}: ${failure.text}` }] : [],
      };
    });
  }

  /** A user gone: their cache and the memory of what was written for them. */
  dropUser(selector) {
    this.users.delete(selector);
    this.source.forget(selector);
    this.forgetWritten(`calendars:${selector}`);
    this.forgetWritten(this.calendarId(selector, ''));
  }

  /** Forgets the writes whose id starts with `prefix`: they will be made again. */
  forgetWritten(prefix) {
    for (const id of [...this.written.keys()]) {
      if (id.startsWith(prefix)) {
        this.written.delete(id);
      }
    }
  }

  calendarId(selector, kind) {
    return this.gladys.externalId(`${selector}:${kind}`);
  }

  /** The local days of the window, both included. */
  window() {
    const today = localDate(this.now());
    return { today, fromDate: addDays(today, -PAST_DAYS), toDate: addMonths(today, AHEAD_MONTHS) };
  }

  /**
   * Reads the address books of a user and writes their calendars.
   * @returns {Promise<string|null>} the reason of a failure, or null
   */
  async syncAccount(account, existing, { fetch = true } = {}) {
    const { selector } = account.user;
    const language = languageOf(account.user.language);
    const settings = parseAccount(account.config);
    const previous = this.users.get(selector);

    let entries = this.source.cached(selector, settings);
    let error = null;
    if (fetch || entries === null) {
      try {
        const result = await this.source.load(selector, settings);
        entries = result.entries;
        logger.debug(
          `${selector}: ${result.books} address book(s), ${result.downloaded} card(s) downloaded, ${entries.length} date(s)`,
        );
      } catch (err) {
        error = err;
      }
    }
    if (error && previous?.error?.code !== error.code) {
      logger.warn(`${selector}: address book not read: ${describe(error)}`);
    } else if (!error && previous?.error) {
      logger.info(`${selector}: address book read again`);
    }

    const kinds = settings.anniversaries ? KINDS : ['birthday'];
    const names = pick(CALENDAR_TEXT, language);
    const description = (kind) => {
      if (error) {
        return pick(ERROR_TEXT, language)[error.code] ?? pick(ERROR_TEXT, language).http;
      }
      const count = (entries ?? []).filter((entry) => entry.kind === kind).length;
      return pick(TEXT, language).description(count);
    };
    const calendars = kinds.map((kind) => ({
      external_id: this.calendarId(selector, kind),
      name: names[kind],
      description: description(kind),
      color: COLORS[kind],
    }));
    // A calendar Gladys does not hold (created by this push, or destroyed and
    // created again: account off and on, anniversaries off and on) gets
    // everything written, whatever was written before.
    const held = new Set(existing.map((calendar) => calendar.external_id));
    if (calendars.some((calendar) => !held.has(calendar.external_id))) {
      this.forgetWritten(`calendars:${selector}`);
    }
    const failures = [];
    const write = async (id, value, fn) => {
      const digest = hash(value);
      if (this.written.get(id) === digest) {
        return;
      }
      await this.limit();
      await fn();
      this.written.set(id, digest);
    };
    try {
      await write(`calendars:${selector}`, calendars, () =>
        this.gladys.publishCalendars(selector, calendars),
      );
    } catch (err) {
      failures.push(describe(err));
    }
    // Anniversaries switched off: their calendar goes, with its events.
    const kept = new Set(calendars.map((calendar) => calendar.external_id));
    for (const calendar of existing) {
      if (!kept.has(calendar.external_id)) {
        try {
          await this.limit();
          await this.gladys.deleteCalendar(calendar.external_id);
          this.forgetWritten(`${calendar.external_id}#`);
        } catch (err) {
          failures.push(describe(err));
        }
      }
    }

    const flags = {};
    const { fromDate, toDate } = this.window();
    for (const kind of kinds) {
      const calendarId = this.calendarId(selector, kind);
      const stored = existing.find((calendar) => calendar.external_id === calendarId);
      flags[kind] = { shared: stored?.shared === true, sync: stored?.sync !== false };
      // Not held, or switched off (`sync: false` empties it): written in full
      // when it comes back.
      if (!stored || !flags[kind].sync) {
        this.forgetWritten(`${calendarId}#`);
      }
      // Never read yet: nothing to write, the next reading fills the calendar.
      // `sync: false` is the user saying no: the core would answer 403.
      if (entries === null || !flags[kind].sync) {
        continue;
      }
      const list = occurrences(
        entries.filter((entry) => entry.kind === kind),
        fromDate,
        toDate,
      );
      const chunks = chunkByDate(list, fromDate, toDate);
      // Fewer requests than before: the first window now covers the others.
      for (const id of [...this.written.keys()]) {
        if (id.startsWith(`${calendarId}#`) && Number(id.split('#')[1]) >= chunks.length) {
          this.written.delete(id);
        }
      }
      for (const [index, chunk] of chunks.entries()) {
        const events = chunk.items.map((item) => ({
          external_id: this.gladys.externalId(`${selector}:${kind}:${item.key}:${item.year}`),
          name: eventName(item, language, settings.showAge),
          start: item.date,
          end: addDays(item.date, 1),
          full_day: true,
        }));
        const window = {
          from: new Date(localTime(chunk.fromDate, 0)).toISOString(),
          to: new Date(localTime(chunk.toDate, 0)).toISOString(),
        };
        try {
          await write(`${calendarId}#${index}`, { events, window }, () =>
            this.gladys.publishCalendarEvents(calendarId, events, window),
          );
        } catch (err) {
          // Switched off (403) or account disabled (404) since the list was
          // read: the user's notification follows.
          if (err?.status === 403 || err?.status === 404) {
            flags[kind].sync = false;
            this.forgetWritten(`${calendarId}#`);
            break;
          }
          failures.push(describe(err));
        }
      }
    }

    this.users.set(selector, {
      selector,
      name: account.user.first_name || selector,
      language,
      entries: entries ?? [],
      calendars: flags,
      error: error ? { code: error.code ?? 'http', message: describe(error) } : null,
    });
    if (failures.length > 0) {
      return { text: failures.join('; '), retry: true };
    }
    if (error) {
      // A wrong password or address stays wrong until the user fixes it
      // (which notifies us): no quick retries, they would only feed the
      // server's brute-force protection.
      return { text: describe(error), retry: !PERMANENT.includes(error.code) };
    }
    return null;
  }

  /**
   * A user whose shared calendar has never been read because of a passing
   * error (server down since the start): the reminders of the day would miss
   * their contacts. A permanent error (wrong password) is not waited for.
   */
  waitingForContacts() {
    return [...this.users.values()].some(
      (user) =>
        user.error &&
        !PERMANENT.includes(user.error.code) &&
        user.entries.length === 0 &&
        Object.values(user.calendars).some((flags) => flags.shared && flags.sync),
    );
  }

  /**
   * The dates of the shared calendars only: what the household sees, the
   * only ones the scenes and the dashboard use (like the core's calendar
   * scenes). The same contact in two shared books of the house counts once.
   */
  sharedEntries() {
    const seen = new Set();
    const list = [];
    for (const user of this.users.values()) {
      for (const entry of user.entries) {
        const flags = user.calendars[entry.kind];
        if (!flags?.shared || !flags.sync) {
          continue;
        }
        const id = `${entry.kind}:${entry.name}:${entry.month}-${entry.day}`;
        if (!seen.has(id)) {
          seen.add(id);
          list.push({ ...entry, user: user.name });
        }
      }
    }
    return list;
  }
}

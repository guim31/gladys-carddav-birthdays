// -----------------------------------------------------------------------------
// Wiring between the Gladys SDK and the address books: the handlers, the
// periodic reading, the daily slide of the window, the daily reminders.
// Takes the SDK client as a parameter so the tests drive it with the SDK's
// fake Gladys.
// -----------------------------------------------------------------------------

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { SCENE_ACTIONS, reminderEvents } from './scenes.js';
import { Syncer, createLimiter, describe } from './syncer.js';
import { BIRTHDAYS_WIDGET, birthdaysContent } from './widgets.js';
import { addDays, localDate, localTime } from './time.js';

const logger = createLogger({ name: 'app' });

// The reminder clock looks every 30 s.
export const TICK_MS = 30_000;
// A reminder hour missed by more than this (container stopped, Gladys down)
// is skipped for the day: a birthday message at 23:00 helps nobody.
export const REMINDER_GRACE_MINUTES = 60;
// The window slides once a day, a few minutes after local midnight.
const DAILY_AT_MINUTES = 5;
// A failed synchronization (server down, core still starting) is retried
// after 30 s, then twice as late each time, up to 15 minutes.
const RETRY_MIN_MS = 30_000;
const RETRY_MAX_MS = 15 * 60_000;
export const STATE_FILE = '/data/state.json';

/** The day of the last reminders, kept in /data so that a restart does not repeat them. */
export function fileStore(path = STATE_FILE) {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch {
        return {};
      }
    },
    async save(state) {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(state));
      } catch (err) {
        logger.debug(`State not saved: ${describe(err)}`);
      }
    },
  };
}

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [deps] test seams
 * @param {() => number} [deps.now]
 * @param {boolean} [deps.timers] false: no timers (tests drive `tick()`)
 * @param {(ms: number) => Promise<void>} [deps.sleep] for the write limiter
 * @param {import('./contacts.js').ContactSource} [deps.source]
 * @param {{ load: () => Promise<object>, save: (state: object) => Promise<void> }} [deps.store]
 */
export function registerHandlers(gladys, deps = {}) {
  const now = deps.now ?? Date.now;
  const useTimers = deps.timers !== false;
  const store = deps.store ?? fileStore();
  let config = normalizeConfig();
  let state = null;
  let syncTimer = null;
  let dailyTimer = null;
  let tickTimer = null;
  let retryTimer = null;
  let retryMs = RETRY_MIN_MS;
  let stopped = false;
  let pending = Promise.resolve();
  // The day the reminders were held back for contacts not read yet.
  let waitedOn = null;

  const syncer = new Syncer({
    gladys,
    now,
    limit: createLimiter({ now, sleep: deps.sleep }),
    source: deps.source,
  });

  const refreshWidget = () => gladys.requestWidgetRefresh(BIRTHDAYS_WIDGET);

  async function run(label, fn) {
    try {
      const result = await fn();
      // Per-user reading errors are logged by the syncer, once per change.
      if (result.failures.length > 0) {
        logger.debug(`${label}: ${result.failures.map((failure) => failure.text).join('; ')}`);
      }
      if (result.failures.some((failure) => failure.retry)) {
        scheduleRetry(label);
      } else {
        clearTimeout(retryTimer);
        retryTimer = null;
        retryMs = RETRY_MIN_MS;
      }
      refreshWidget();
      return result;
    } catch (err) {
      // The core itself refused (starting, 429): one line per streak.
      if (retryMs === RETRY_MIN_MS) {
        logger.error(`${label} failed: ${describe(err)}`);
      } else {
        logger.debug(`${label} failed again: ${describe(err)}`);
      }
      scheduleRetry(label);
      return undefined;
    }
  }

  function scheduleRetry(label) {
    if (!useTimers || stopped || retryTimer) {
      return;
    }
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (gladys.connected !== false) {
        await run(label, () => syncer.syncAll());
      }
    }, retryMs);
    retryTimer.unref?.();
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
  }

  function minutesOfDay(timestamp) {
    const date = new Date(timestamp);
    return date.getHours() * 60 + date.getMinutes();
  }

  /** Fires the reminders of the day once, at the chosen hour. */
  async function tick() {
    if (!syncer.ready) {
      return 0;
    }
    state ??= await store.load();
    const t = now();
    const today = localDate(t);
    const start = Number(config.notify_hour) * 60;
    const minutes = minutesOfDay(t);
    if (state.reminded === today || minutes < start) {
      return 0;
    }
    const late = minutes >= start + REMINDER_GRACE_MINUTES;
    // Contacts not read yet (server down at start-up): wait for the retries
    // within the grace period, then send what is known.
    if (syncer.waitingForContacts() && !late) {
      waitedOn = today;
      return 0;
    }
    state = { ...state, reminded: today };
    await store.save(state);
    if (late && waitedOn !== today) {
      logger.debug(`Reminders of ${today} skipped: the hour is long past`);
      return 0;
    }
    const events = reminderEvents(syncer.sharedEntries(), today, config.language);
    for (const event of events) {
      try {
        await gladys.publishSceneEvent(event.key, event.data);
      } catch (err) {
        logger.warn(`Scene trigger ${event.key} not sent: ${describe(err)}`);
      }
    }
    logger.debug(`${events.length} reminder(s) sent to the scenes`);
    return events.length;
  }

  function scheduleSync() {
    clearInterval(syncTimer);
    if (!useTimers || stopped) {
      return;
    }
    syncTimer = setInterval(
      () => {
        if (gladys.connected !== false) {
          pending = run('Synchronization', () => syncer.syncAll());
        }
      },
      Number(config.sync_hours) * 3_600_000,
    );
    syncTimer.unref?.();
  }

  function scheduleDaily() {
    clearTimeout(dailyTimer);
    if (!useTimers || stopped) {
      return;
    }
    const next = localTime(addDays(localDate(now()), 1), DAILY_AT_MINUTES);
    dailyTimer = setTimeout(
      async () => {
        if (gladys.connected !== false) {
          // The window slides: computed from what was read, no download.
          await run('Daily update', () => syncer.syncAll({ fetch: false }));
        }
        scheduleDaily();
      },
      Math.max(60_000, next - now()),
    );
    dailyTimer.unref?.();
  }

  function startTicking() {
    clearInterval(tickTimer);
    if (!useTimers || stopped) {
      return;
    }
    tickTimer = setInterval(() => {
      tick().catch((err) => logger.warn(`Reminder check failed: ${describe(err)}`));
    }, TICK_MS);
    tickTimer.unref?.();
  }

  function stopTimers() {
    clearTimeout(retryTimer);
    retryTimer = null;
    clearTimeout(dailyTimer);
    clearInterval(syncTimer);
    clearInterval(tickTimer);
  }

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
    } catch (err) {
      logger.error(`Could not read the configuration: ${describe(err)}`);
    }
    // The resync contract of the calendar type: an account enabled or a
    // calendar switched back on while disconnected is only known by
    // re-reading everything, and written again once.
    syncer.forgetWrites();
    pending = run('Synchronization', () => syncer.syncAll());
    scheduleSync();
    scheduleDaily();
    startTicking();
  });

  gladys.on('disconnected', stopTimers);

  gladys.onConfigUpdated(async (newConfig) => {
    const previous = config;
    config = normalizeConfig(newConfig);
    logger.info('Configuration updated');
    if (previous.sync_hours !== config.sync_hours) {
      scheduleSync();
    }
  });

  gladys.onCalendarAccountUpdated(async (userSelector) => {
    logger.info(`Account of ${userSelector} updated`);
    pending = run('Synchronization', () => syncer.syncUser(userSelector));
  });

  gladys.onSceneAction('next_birthday', (fields) =>
    SCENE_ACTIONS.next_birthday({ syncer, config, now: now() }, fields),
  );

  gladys.onWidgetGet(BIRTHDAYS_WIDGET, async ({ settings, language }) =>
    birthdaysContent(syncer, { settings, language, now: now() }),
  );

  return {
    syncer,
    tick,
    /** Resolves once the synchronization in progress is over (tests). */
    idle: async () => {
      await pending;
      await syncer.running;
    },
    async stop() {
      stopped = true;
      stopTimers();
    },
  };
}

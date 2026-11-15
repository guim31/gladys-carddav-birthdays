// -----------------------------------------------------------------------------
// Scene trigger and action (manifest `scene_triggers` / `scene_actions`).
//
// The core already offers "an event is coming" on any shared calendar, which
// these calendars feed, but only by minutes before the start of an event.
// What the integration adds:
//
//   - trigger `birthday_reminder`: once a day, at the chosen hour, for every
//     date of the day or N days ahead (N a filter of the scene: 0, 1, 2, 3,
//     7, 14 or 30), with a ready-made sentence;
//   - action `next_birthday`: the next date, the days left, the age, and the
//     names of the day. `found` is a number (1/0): the core's "condition on
//     variables" compares strictly.
//
// Like the core's calendar scenes, only SHARED calendars are involved.
// -----------------------------------------------------------------------------

import { upcoming } from './birthdays.js';
import { CALENDAR_TEXT, TEXT, eventName, formatDay, pick, whenText } from './i18n.js';
import { KINDS } from './syncer.js';
import { localDate } from './time.js';

export const TRIGGERS = { BIRTHDAY_REMINDER: 'birthday_reminder' };
export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);
export const REMIND_DAYS = ['0', '1', '2', '3', '7', '14', '30'];
export { KINDS };

/** The sentence of an upcoming date: "Marie's birthday (34): Tomorrow." */
export function sentence(item, language) {
  return pick(TEXT, language).message(
    eventName(item, language),
    `${whenText(item.days, language)}, ${formatDay(item.date, language)}`,
  );
}

/**
 * The scene events of the day: every date `REMIND_DAYS` days ahead.
 * @returns {{ key: string, data: object }[]}
 */
export function reminderEvents(entries, today, language) {
  const kinds = pick(CALENDAR_TEXT, language);
  return upcoming(entries, today)
    .filter((item) => REMIND_DAYS.includes(String(item.days)))
    .map((item) => ({
      key: TRIGGERS.BIRTHDAY_REMINDER,
      data: {
        days_before: item.days,
        kind: item.kind,
        name: item.name,
        kind_label: kinds[item.kind],
        age: item.age,
        date: formatDay(item.date, language),
        message: sentence(item, language),
        user: item.user ?? null,
      },
    }));
}

export const SCENE_ACTIONS = {
  /**
   * @param {{ syncer: import('./syncer.js').Syncer, config: object, now: number }} context
   * @param {{ kind?: string }} fields
   */
  next_birthday({ syncer, config, now }, fields = {}) {
    const language = config.language;
    const today = localDate(now);
    const wanted = KINDS.includes(fields.kind) ? [fields.kind] : KINDS;
    const list = upcoming(
      syncer.sharedEntries().filter((entry) => wanted.includes(entry.kind)),
      today,
    );
    const todays = list.filter((item) => item.days === 0);
    const next = list[0];
    return {
      found: next ? 1 : 0,
      name: next?.name ?? '',
      kind: next?.kind ?? '',
      days: next ? next.days : -1,
      date: next ? formatDay(next.date, language) : '',
      message: next ? sentence(next, language) : pick(TEXT, language).none,
      age: next?.age ?? 0,
      today_count: todays.length,
      today_names: todays.map((item) => item.name).join(', '),
    };
  },
};

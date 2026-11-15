// -----------------------------------------------------------------------------
// Dashboard widget "Birthdays": the next dates of the shared calendars, the
// ones of the day first. Shared calendars only: a dashboard is seen by the
// whole household.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { upcoming } from './birthdays.js';
import { CALENDAR_TEXT, TEXT, formatDay, pick, whenText } from './i18n.js';
import { localDate } from './time.js';

export const BIRTHDAYS_WIDGET = 'birthdays';
export const WIDGET_COUNTS = ['3', '5', '8'];

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The widget content.
 * @param {import('./syncer.js').Syncer} syncer
 * @param {{ settings?: object, language?: string, now: number }} request
 */
export function birthdaysContent(syncer, { settings = {}, language = 'en', now }) {
  const text = pick(TEXT, language);
  if (!syncer.ready) {
    return {
      ttl_seconds: 30,
      components: [{ type: 'text', variant: 'caption', text: text.loading }],
    };
  }
  const entries = syncer
    .sharedEntries()
    .filter((entry) => settings.anniversaries !== false || entry.kind === 'birthday');
  if (entries.length === 0) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: text.noShared }],
    };
  }
  const count = Number(WIDGET_COUNTS.includes(String(settings.count)) ? settings.count : '5');
  const list = upcoming(entries, localDate(now))
    .filter((item) => item.days <= 366)
    .slice(0, count);
  if (list.length === 0) {
    return {
      ttl_seconds: 3600,
      components: [{ type: 'text', variant: 'caption', text: text.nothing }],
    };
  }
  const kinds = pick(CALENDAR_TEXT, language);
  return {
    // The list moves at midnight: an hour is fine-grained enough.
    ttl_seconds: 3600,
    components: [
      {
        type: 'card-list',
        display: 'list',
        items: list.map((item) => {
          const parts = [whenText(item.days, language), formatDay(item.date, language)];
          if (item.age && settings.show_age !== false) {
            parts.push(text.years(item.age));
          }
          if (item.kind === 'anniversary') {
            parts.push(kinds.anniversary);
          }
          return {
            title: truncate(item.name, 60),
            subtitle: truncate(parts.join(' · '), 120),
            ...(item.days === 0
              ? { badge: { text: truncate(text.today, 16), color: WIDGET_COLORS.SUCCESS } }
              : {}),
          };
        }),
      },
    ],
  };
}

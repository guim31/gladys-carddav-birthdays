// -----------------------------------------------------------------------------
// The dates of the contacts, on the calendar: pure functions over local
// calendar days (`YYYY-MM-DD`, see time.js).
//
// A date born on 29 February is celebrated on 28 February in the other years
// (the most common custom; the day stays in the right month).
// -----------------------------------------------------------------------------

import { addDays, daysBetween } from './time.js';

const pad = (number) => String(number).padStart(2, '0');
const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The local date of a contact date in a given year. */
export function dateIn(entry, year) {
  const day = entry.month === 2 && entry.day === 29 && !isLeap(year) ? 28 : entry.day;
  return `${year}-${pad(entry.month)}-${pad(day)}`;
}

/**
 * Every occurrence of the dates between two local days, both included.
 * @param {{ key: string, kind: string, name: string, month: number, day: number, year: number|null }[]} entries
 * @returns {{ key: string, kind: string, name: string, date: string, year: number, age: number|null }[]}
 */
export function occurrences(entries, fromDate, toDate) {
  const first = Number(fromDate.slice(0, 4));
  const last = Number(toDate.slice(0, 4));
  const list = [];
  for (const entry of entries) {
    for (let year = first; year <= last; year += 1) {
      // Not before the date itself (no "0 years").
      if (entry.year !== null && year <= entry.year) {
        continue;
      }
      const date = dateIn(entry, year);
      if (date < fromDate || date > toDate) {
        continue;
      }
      list.push({
        key: entry.key,
        kind: entry.kind,
        name: entry.name,
        date,
        year,
        age: entry.year === null ? null : year - entry.year,
      });
    }
  }
  return list.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/**
 * The next occurrence of each date from `today` (included), sorted, with
 * the days left.
 * @returns {{ key, kind, name, date, year, age, days }[]}
 */
export function upcoming(entries, today) {
  const year = Number(today.slice(0, 4));
  return entries
    .map((entry) => {
      let next = entry.year !== null && year <= entry.year ? entry.year + 1 : year;
      let date = dateIn(entry, next);
      if (date < today) {
        next += 1;
        date = dateIn(entry, next);
      }
      return {
        ...entry,
        date,
        year: next,
        age: entry.year === null ? null : next - entry.year,
        days: daysBetween(today, date),
      };
    })
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

/**
 * Splits a sorted list of occurrences into requests of at most `max`
 * events, cut between two days: the core takes 500 events per request, and
 * one window per request (a window replaces its content).
 * @returns {{ fromDate: string, toDate: string, items: object[] }[]} `toDate` exclusive
 */
export function chunkByDate(list, fromDate, endDate, max = 500) {
  // Whole days only: a day never straddles two requests.
  const days = [];
  for (const item of list) {
    const last = days[days.length - 1];
    if (last && last.date === item.date) {
      last.items.push(item);
    } else {
      days.push({ date: item.date, items: [item] });
    }
  }
  const chunks = [];
  let current = { fromDate, items: [] };
  for (const day of days) {
    if (current.items.length > 0 && current.items.length + day.items.length > max) {
      current.toDate = day.date;
      chunks.push(current);
      current = { fromDate: day.date, items: [] };
    }
    // More than `max` on a single day: the rest is dropped, never a 400.
    current.items.push(...day.items.slice(0, max));
  }
  current.toDate = addDays(endDate, 1);
  chunks.push(current);
  return chunks;
}

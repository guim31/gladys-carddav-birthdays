// -----------------------------------------------------------------------------
// Settings. The admin `config_schema` holds what applies to everyone (how
// often the address books are read, when the reminders fire, the language of
// the scene texts); each user's `account_schema` holds their CardDAV account.
// Defaults mirror the manifest (test/manifest.test.js).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const SYNC_HOURS = ['1', '6', '24'];
export const NOTIFY_HOURS = ['7', '8', '9', '10', '12', '18'];

export const DEFAULT_CONFIG = {
  sync_hours: '6',
  notify_hour: '8',
  language: 'fr',
};

export const ACCOUNT_DEFAULTS = {
  server_url: '',
  username: '',
  password: '',
  address_books: '',
  anniversaries: false,
  show_age: true,
};

/** The admin settings, with defaults for anything missing or unknown. */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG };
  if (SYNC_HOURS.includes(String(raw?.sync_hours))) {
    config.sync_hours = String(raw.sync_hours);
  }
  if (NOTIFY_HOURS.includes(String(raw?.notify_hour))) {
    config.notify_hour = String(raw.notify_hour);
  }
  if (LANGUAGES.includes(raw?.language)) {
    config.language = raw.language;
  }
  return config;
}

const bool = (value, fallback) => {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return fallback;
};

/** Lowercase, without accents nor extra blanks: "Carnet  Pro" matches "carnet pro". */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** One user's account values (`getCalendarAccounts()[].config`). */
export function parseAccount(values = {}) {
  const account = {
    serverUrl: String(values?.server_url ?? '').trim(),
    username: String(values?.username ?? '').trim(),
    password: String(values?.password ?? ''),
    addressBooks: String(values?.address_books ?? '')
      .split(/[,;\n]/)
      .map(fold)
      .filter(Boolean),
    anniversaries: bool(values?.anniversaries, ACCOUNT_DEFAULTS.anniversaries),
    showAge: bool(values?.show_age, ACCOUNT_DEFAULTS.show_age),
  };
  // What identifies the source of the contacts: a change empties the cache.
  // The password enters as a hash only, the fingerprint is never logged.
  account.fingerprint = createHash('sha256')
    .update(
      JSON.stringify([account.serverUrl, account.username, account.password, account.addressBooks]),
    )
    .digest('hex');
  return account;
}

/** A supported language, else the fallback. */
export function languageOf(value, fallback = DEFAULT_CONFIG.language) {
  const short = String(value ?? '')
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES.includes(short) ? short : fallback;
}

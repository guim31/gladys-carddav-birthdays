// -----------------------------------------------------------------------------
// Texts produced by the container, in the four languages of the Gladys
// interface. Event names and calendar descriptions follow the language of
// the user who owns the calendar; scene texts follow the `language` setting
// (a scene event carries no user); the widget the language of the viewer.
// -----------------------------------------------------------------------------

export const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

// French elides "de" before a vowel: "Anniversaire d'Émilie".
const ofFr = (name) => (/^[aeiouàâäéèêëîïôöùûüœæ]/i.test(name) ? `d'${name}` : `de ${name}`);

/** Event names: `age` is the age reached, or the years of marriage, or null. */
export const EVENT_TEXT = {
  en: {
    birthday: (name, age) => `${name}'s birthday${age ? ` (${age})` : ''}`,
    anniversary: (name, age) =>
      `${name}: wedding anniversary${age ? ` (${age} year${age > 1 ? 's' : ''})` : ''}`,
  },
  fr: {
    birthday: (name, age) =>
      `Anniversaire ${ofFr(name)}${age ? ` (${age} an${age > 1 ? 's' : ''})` : ''}`,
    anniversary: (name, age) =>
      `Anniversaire de mariage ${ofFr(name)}${age ? ` (${age} an${age > 1 ? 's' : ''})` : ''}`,
  },
  de: {
    birthday: (name, age) =>
      `Geburtstag von ${name}${age ? ` (${age} ${age > 1 ? 'Jahre' : 'Jahr'})` : ''}`,
    anniversary: (name, age) =>
      `Hochzeitstag von ${name}${age ? ` (${age} ${age > 1 ? 'Jahre' : 'Jahr'})` : ''}`,
  },
  es: {
    birthday: (name, age) =>
      `Cumpleaños de ${name}${age ? ` (${age} año${age > 1 ? 's' : ''})` : ''}`,
    anniversary: (name, age) =>
      `Aniversario de boda de ${name}${age ? ` (${age} año${age > 1 ? 's' : ''})` : ''}`,
  },
};

/** Calendar names and kinds. */
export const CALENDAR_TEXT = {
  en: { birthday: 'Birthdays', anniversary: 'Wedding anniversaries' },
  fr: { birthday: 'Anniversaires', anniversary: 'Anniversaires de mariage' },
  de: { birthday: 'Geburtstage', anniversary: 'Hochzeitstage' },
  es: { birthday: 'Cumpleaños', anniversary: 'Aniversarios de boda' },
};

/** Why the address book could not be read: in the calendar description. */
export const ERROR_TEXT = {
  en: {
    invalid_url: 'Last reading failed: the server address is missing or is not an http(s) URL.',
    auth: 'Last reading failed: wrong user name or password (use an app password).',
    unreachable: 'Last reading failed: the CardDAV server does not answer.',
    not_found: 'Last reading failed: no CardDAV service at this address.',
    http: 'Last reading failed: the server gave an unexpected answer. See the logs.',
    no_address_book: 'Last reading failed: no address book found (check its name).',
  },
  fr: {
    invalid_url:
      "Dernière lecture ratée : adresse du serveur absente ou qui n'est pas une URL http(s).",
    auth: "Dernière lecture ratée : identifiant ou mot de passe refusé (utilisez un mot de passe d'application).",
    unreachable: 'Dernière lecture ratée : le serveur CardDAV ne répond pas.',
    not_found: 'Dernière lecture ratée : aucun service CardDAV à cette adresse.',
    http: 'Dernière lecture ratée : réponse inattendue du serveur. Voir les journaux.',
    no_address_book: 'Dernière lecture ratée : aucun carnet trouvé (vérifiez son nom).',
  },
  de: {
    invalid_url: 'Letztes Lesen fehlgeschlagen: Serveradresse fehlt oder ist keine http(s)-URL.',
    auth: 'Letztes Lesen fehlgeschlagen: Benutzername oder Passwort abgelehnt (nutze ein App-Passwort).',
    unreachable: 'Letztes Lesen fehlgeschlagen: Der CardDAV-Server antwortet nicht.',
    not_found: 'Letztes Lesen fehlgeschlagen: kein CardDAV-Dienst unter dieser Adresse.',
    http: 'Letztes Lesen fehlgeschlagen: unerwartete Antwort des Servers. Siehe die Protokolle.',
    no_address_book: 'Letztes Lesen fehlgeschlagen: kein Adressbuch gefunden (prüfe seinen Namen).',
  },
  es: {
    invalid_url: 'Última lectura fallida: falta la dirección del servidor o no es una URL http(s).',
    auth: 'Última lectura fallida: usuario o contraseña rechazados (use una contraseña de aplicación).',
    unreachable: 'Última lectura fallida: el servidor CardDAV no responde.',
    not_found: 'Última lectura fallida: ningún servicio CardDAV en esta dirección.',
    http: 'Última lectura fallida: respuesta inesperada del servidor. Consulte los registros.',
    no_address_book: 'Última lectura fallida: ninguna libreta encontrada (compruebe su nombre).',
  },
};

/** Other texts: calendar descriptions, widget, scenes. */
export const TEXT = {
  en: {
    description: (count) => `${count} date(s) read from your CardDAV address book.`,
    today: 'Today',
    tomorrow: 'Tomorrow',
    inDays: (days) => `In ${days} days`,
    years: (age) => `${age} year${age > 1 ? 's' : ''}`,
    loading: 'Reading the address books…',
    noShared:
      'No shared birthday calendar. Share one in Integrations → CardDAV Birthdays → My calendars.',
    nothing: 'No birthday in the coming year.',
    none: 'No birthday ahead.',
    message: (title, when) => `${title}: ${when}.`,
  },
  fr: {
    description: (count) => `${count} date(s) lue(s) dans votre carnet d'adresses CardDAV.`,
    today: "Aujourd'hui",
    tomorrow: 'Demain',
    inDays: (days) => `Dans ${days} jours`,
    years: (age) => `${age} an${age > 1 ? 's' : ''}`,
    loading: 'Lecture des carnets d’adresses…',
    noShared:
      'Aucun calendrier d’anniversaires partagé. Partagez-en un dans Intégrations → CardDAV Birthdays → Mes calendriers.',
    nothing: "Aucun anniversaire dans l'année à venir.",
    none: 'Aucun anniversaire à venir.',
    message: (title, when) => `${title} : ${when}.`,
  },
  de: {
    description: (count) => `${count} Datum/Daten aus deinem CardDAV-Adressbuch gelesen.`,
    today: 'Heute',
    tomorrow: 'Morgen',
    inDays: (days) => `In ${days} Tagen`,
    years: (age) => `${age} ${age > 1 ? 'Jahre' : 'Jahr'}`,
    loading: 'Adressbücher werden gelesen…',
    noShared:
      'Kein geteilter Geburtstagskalender. Teile einen unter Integrationen → CardDAV Birthdays → Meine Kalender.',
    nothing: 'Kein Geburtstag im kommenden Jahr.',
    none: 'Kein Geburtstag in Sicht.',
    message: (title, when) => `${title}: ${when}.`,
  },
  es: {
    description: (count) => `${count} fecha(s) leída(s) de su libreta de direcciones CardDAV.`,
    today: 'Hoy',
    tomorrow: 'Mañana',
    inDays: (days) => `Dentro de ${days} días`,
    years: (age) => `${age} año${age > 1 ? 's' : ''}`,
    loading: 'Leyendo las libretas de direcciones…',
    noShared:
      'Ningún calendario de cumpleaños compartido. Comparta uno en Integraciones → CardDAV Birthdays → Mis calendarios.',
    nothing: 'Ningún cumpleaños en el próximo año.',
    none: 'Ningún cumpleaños próximo.',
    message: (title, when) => `${title}: ${when}.`,
  },
};

/** The table of a language, English when unknown. */
export function pick(table, language) {
  return table[language] ?? table.en;
}

/** `Saturday 18 November` of a `YYYY-MM-DD` date. */
export function formatDay(dateString, language) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "Today", "Tomorrow", "In 3 days". */
export function whenText(days, language) {
  const text = pick(TEXT, language);
  if (days === 0) {
    return text.today;
  }
  return days === 1 ? text.tomorrow : text.inDays(days);
}

/** The event name of an occurrence. */
export function eventName(occurrence, language, showAge = true) {
  return pick(EVENT_TEXT, language)
    [occurrence.kind](occurrence.name, showAge ? occurrence.age : null)
    .slice(0, 100);
}

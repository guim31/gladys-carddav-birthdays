// -----------------------------------------------------------------------------
// vCard reading (3.0 and 4.0, the 2.1 of old phones as far as it goes): only
// what the calendar needs, the display name and the dates. Nothing else of a
// contact is ever kept.
//
// The dates seen in the wild:
//   BDAY:1985-04-12            BDAY:19850412          BDAY;VALUE=date:--0412
//   BDAY:--04-12               BDAY:1985-04-12T00:00:00Z
//   BDAY;X-APPLE-OMIT-YEAR=1604:1604-04-12   (Apple, year not known)
//   ANNIVERSARY:20100612       X-ANNIVERSARY:2010-06-12   (Evolution, KDE)
//   item1.X-ABDATE:2010-06-12 + item1.X-ABLabel:_$!<Anniversary>!$_ (Apple)
// -----------------------------------------------------------------------------

// A year before this one is a placeholder ("0000", "1604", "1900" of some
// phones): the date is kept, the age is not.
export const MIN_YEAR = 1901;

/** Joins the folded lines (RFC 6350 3.2): a line starting with a blank continues the previous one. */
export function unfold(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '');
}

/** The text value of a property: `\,` `\;` `\n` `\\` (RFC 6350 3.4). */
export function unescapeText(value) {
  return value.replace(/\\([\\,;nN])/g, (_, char) => (char === 'n' || char === 'N' ? '\n' : char));
}

/**
 * One content line: `group.NAME;PARAM=a,b;FLAG:value`, the value being
 * everything after the first colon outside a quoted parameter.
 * @returns {{ group: string|null, name: string, params: Record<string, string>, value: string }|null}
 */
export function parseLine(line) {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) {
    return null;
  }
  const [head, ...rawParams] = line.slice(0, colon).split(';');
  const dot = head.lastIndexOf('.');
  const params = {};
  for (const raw of rawParams) {
    const equal = raw.indexOf('=');
    // vCard 2.1 bare parameters (`TEL;HOME:`) are types.
    const key = (equal === -1 ? 'TYPE' : raw.slice(0, equal)).trim().toUpperCase();
    const value = (equal === -1 ? raw : raw.slice(equal + 1)).replace(/"/g, '').trim();
    params[key] = params[key] ? `${params[key]},${value}` : value;
  }
  return {
    group: dot === -1 ? null : head.slice(0, dot).toLowerCase(),
    name: head
      .slice(dot + 1)
      .trim()
      .toUpperCase(),
    params,
    value: line.slice(colon + 1),
  };
}

/** Decodes a vCard 2.1 quoted-printable value (UTF-8 assumed). */
function decodeQuotedPrintable(value) {
  const bytes = [];
  const text = value.replace(/=\n/g, '');
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(text[i], 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * A vCard date, with or without its year.
 * @returns {{ month: number, day: number, year: number|null }|null} `null` for
 *   free text (`VALUE=text:circa 1800`) or an impossible date.
 */
export function parseDate(value, params = {}) {
  if (String(params.VALUE ?? '').toLowerCase() === 'text') {
    return null;
  }
  const text = String(value ?? '').trim();
  let year = null;
  let month;
  let day;
  let match = text.match(/^--(\d{2})-?(\d{2})(?:$|T)/);
  if (match) {
    [, month, day] = match.map(Number);
  } else if ((match = text.match(/^(\d{4})-?(\d{2})-?(\d{2})(?:$|T)/))) {
    [, year, month, day] = match.map(Number);
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
    return null;
  }
  const omitted = Number(params['X-APPLE-OMIT-YEAR']);
  if (year !== null && (year < MIN_YEAR || year === omitted)) {
    year = null;
  }
  if (year !== null && month === 2 && day === 29 && !isLeap(year)) {
    return null;
  }
  return { month, day, year };
}

/** The display name: FN, else the given and family names of N, else ORG. */
function displayName(props) {
  const fn = props.find((prop) => prop.name === 'FN');
  const clean = (text) => text.replace(/\s+/g, ' ').trim();
  if (fn && clean(fn.text)) {
    return clean(fn.text);
  }
  const n = props.find((prop) => prop.name === 'N');
  if (n) {
    // N: family;given;additional;prefixes;suffixes
    const parts = n.value.split(/(?<!\\);/).map(unescapeText);
    const name = clean([parts[3], parts[1], parts[2], parts[0], parts[4]].join(' '));
    if (name) {
      return name;
    }
  }
  const org = props.find((prop) => prop.name === 'ORG');
  return org
    ? clean(
        org.value
          .split(/(?<!\\);/)
          .map(unescapeText)
          .join(' '),
      )
    : '';
}

const ANNIVERSARY_LABEL =
  /anniversary|_\$!<anniversary>!\$_|jubil|aniversario|anniversaire|hochzeit/i;

/**
 * The calendar-relevant content of one vCard.
 * @returns {{ uid: string|null, name: string, birthday: object|null, anniversary: object|null, group: boolean }}
 */
export function parseVCard(text) {
  const props = [];
  for (const line of unfold(text).split('\n')) {
    const prop = parseLine(line);
    if (!prop) {
      continue;
    }
    let value = prop.value;
    if (String(prop.params.ENCODING ?? '').toUpperCase() === 'QUOTED-PRINTABLE') {
      value = decodeQuotedPrintable(value);
    }
    props.push({ ...prop, value, text: unescapeText(value) });
  }
  const first = (name) => props.find((prop) => prop.name === name);
  const kind = (first('KIND') ?? first('X-ADDRESSBOOKSERVER-KIND'))?.text.trim().toLowerCase();

  const date = (prop) => (prop ? parseDate(prop.value, prop.params) : null);
  const birthday = props
    .filter((prop) => prop.name === 'BDAY')
    .map(date)
    .find(Boolean);

  let anniversary = props
    .filter((prop) => prop.name === 'ANNIVERSARY' || prop.name === 'X-ANNIVERSARY')
    .map(date)
    .find(Boolean);
  if (!anniversary) {
    // Apple: a labelled date of the same group.
    const labels = new Map(
      props
        .filter((prop) => prop.name === 'X-ABLABEL' && prop.group)
        .map((prop) => [prop.group, prop.text]),
    );
    anniversary = props
      .filter(
        (prop) =>
          prop.name === 'X-ABDATE' && prop.group && ANNIVERSARY_LABEL.test(labels.get(prop.group)),
      )
      .map(date)
      .find(Boolean);
  }

  return {
    uid: first('UID')?.text.trim() || null,
    name: displayName(props),
    birthday: birthday ?? null,
    anniversary: anniversary ?? null,
    group: kind === 'group' || kind === 'org',
  };
}

/**
 * The dates of a contact, ready for the calendar: an entry per kind, with
 * only the name and the date (the privacy promise of the integration).
 * @returns {{ kind: 'birthday'|'anniversary', name: string, month: number, day: number, year: number|null }[]}
 */
export function contactDates(card) {
  if (card.group || !card.name) {
    return [];
  }
  const name = card.name.slice(0, 80);
  const list = [];
  if (card.birthday) {
    list.push({ kind: 'birthday', name, ...card.birthday });
  }
  if (card.anniversary) {
    list.push({ kind: 'anniversary', name, ...card.anniversary });
  }
  return list;
}

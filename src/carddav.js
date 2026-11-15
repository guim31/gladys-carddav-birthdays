// -----------------------------------------------------------------------------
// A small CardDAV client (RFC 6352 over WebDAV), read-only: discovery of the
// address books, change detection, download of the cards.
//
//   discovery   the URL itself if it is an address book; else
//               current-user-principal -> addressbook-home-set -> the
//               address books under it. A bare server address tries
//               /.well-known/carddav first (RFC 6764).
//   changes     getctag (CalendarServer) or sync-token per address book: the
//               same value means nothing to download. Otherwise one PROPFIND
//               lists the etags, and only the new or changed cards are
//               fetched (addressbook-multiget, by batches).
//   auth        Basic, or Digest when the server asks for it (Baïkal).
//
// Credentials are only ever sent to the host of the configured URL or to a
// host of the same domain (iCloud answers from pNN-contacts.icloud.com).
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

export const TIMEOUT_MS = 20_000;
export const MULTIGET_BATCH = 100;

export class CardDavError extends Error {
  /**
   * @param {'invalid_url'|'auth'|'unreachable'|'not_found'|'http'|'no_address_book'} code
   * @param {string} message never a secret, never a URL with credentials
   */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  // SabreDAV (Nextcloud, Baïkal) escapes the CR of each vCard line as `&#13;`.
  htmlEntities: true,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ['response', 'propstat', 'href'].includes(name),
});

const NS =
  'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/"';
const PROPFIND_DISCOVERY = `<?xml version="1.0" encoding="utf-8"?><d:propfind ${NS}><d:prop><d:resourcetype/><d:displayname/><d:current-user-principal/><c:addressbook-home-set/><cs:getctag/><d:sync-token/></d:prop></d:propfind>`;
const PROPFIND_ETAGS = `<?xml version="1.0" encoding="utf-8"?><d:propfind ${NS}><d:prop><d:resourcetype/><d:getetag/><d:getcontenttype/></d:prop></d:propfind>`;
const multigetBody = (hrefs) =>
  `<?xml version="1.0" encoding="utf-8"?><c:addressbook-multiget ${NS}><d:prop><d:getetag/><c:address-data/></d:prop>${hrefs
    .map((href) => `<d:href>${escapeXml(href)}</d:href>`)
    .join('')}</c:addressbook-multiget>`;

function escapeXml(text) {
  return text.replace(
    /[<>&'"]/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char],
  );
}

const md5 = (text) => createHash('md5').update(text).digest('hex');
const text = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return String(value['#text'] ?? '');
  }
  return String(value);
};
const firstHref = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const href = Array.isArray(value.href) ? value.href[0] : value.href;
  return href ? text(href).trim() : null;
};

// Providers known to answer from sibling hosts (contacts.icloud.com sends the
// client to pNN-contacts.icloud.com). Anywhere else, the exact host only: a
// shared suffix (co.uk, duckdns.org) proves nothing.
const SIBLING_DOMAINS = ['icloud.com'];

/** Where the credentials may go: the same host, or a sibling of a known provider. */
export function sameSite(a, b) {
  const hostA = new URL(a).hostname.toLowerCase();
  const hostB = new URL(b).hostname.toLowerCase();
  if (hostA === hostB) {
    return true;
  }
  const under = (host, domain) => host === domain || host.endsWith(`.${domain}`);
  return SIBLING_DOMAINS.some((domain) => under(hostA, domain) && under(hostB, domain));
}

/** A URL compared by its decoded path: servers differ in percent-encoding. */
export function urlKey(url) {
  const parsed = new URL(url);
  let path = parsed.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the raw path.
  }
  return `${parsed.host.toLowerCase()}${path.replace(/\/+$/, '')}`;
}

/** The digest `Authorization` header for one request (RFC 7616, MD5 or SHA-256, qop=auth). */
export function digestHeader(challenge, { username, password, method, uri, nc, cnonce }) {
  const params = {};
  for (const match of challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) {
    params[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  const qop = (params.qop ?? '')
    .split(',')
    .map((value) => value.trim())
    .includes('auth')
    ? 'auth'
    : null;
  const ncText = String(nc).padStart(8, '0');
  const algorithm = (params.algorithm ?? 'MD5').toUpperCase();
  const h = algorithm.startsWith('SHA-256')
    ? (value) => createHash('sha256').update(value).digest('hex')
    : md5;
  let ha1 = h(`${username}:${params.realm}:${password}`);
  if (algorithm.endsWith('-SESS')) {
    ha1 = h(`${ha1}:${params.nonce}:${cnonce}`);
  }
  const ha2 = h(`${method}:${uri}`);
  const response = qop
    ? h(`${ha1}:${params.nonce}:${ncText}:${cnonce}:${qop}:${ha2}`)
    : h(`${ha1}:${params.nonce}:${ha2}`);
  const parts = [
    `username="${String(username).replace(/["\\]/g, '\\$&')}"`,
    `realm="${params.realm}"`,
    `nonce="${params.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (params.algorithm) {
    parts.push(`algorithm=${params.algorithm}`);
  }
  if (params.opaque !== undefined) {
    parts.push(`opaque="${params.opaque}"`);
  }
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${ncText}`, `cnonce="${cnonce}"`);
  }
  return `Digest ${parts.join(', ')}`;
}

/** The `<response>` elements of a multistatus body, with their 200 props merged. */
export function parseMultistatus(xml, baseUrl) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new CardDavError('http', 'unreadable WebDAV answer');
  }
  const responses = doc?.multistatus?.response ?? [];
  return responses.map((response) => {
    const href = text(response.href?.[0]).trim();
    const props = {};
    for (const propstat of response.propstat ?? []) {
      if (/\s2\d\d\s/.test(` ${text(propstat.status)} `) || propstat.status === undefined) {
        Object.assign(props, propstat.prop ?? {});
      }
    }
    return { href, url: href ? new URL(href, baseUrl).href : baseUrl, props };
  });
}

const trimSlash = (url) => url.replace(/\/+$/, '');
const isAddressBook = (props) =>
  typeof props.resourcetype === 'object' &&
  props.resourcetype !== null &&
  'addressbook' in props.resourcetype;
const isCollection = (props) =>
  typeof props.resourcetype === 'object' &&
  props.resourcetype !== null &&
  'collection' in props.resourcetype;

export class CardDavClient {
  /**
   * @param {object} options
   * @param {string} options.url what the user typed
   * @param {string} options.username
   * @param {string} options.password
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, username, password, fetch: fetchImpl, timeoutMs = TIMEOUT_MS }) {
    let parsed;
    try {
      parsed = new URL(String(url ?? '').trim());
    } catch {
      throw new CardDavError('invalid_url', 'the server address is not a URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new CardDavError(
        'invalid_url',
        'the server address must start with http:// or https://',
      );
    }
    // Credentials typed into the URL go to the fields, never into the logs.
    this.username = username || decodeURIComponent(parsed.username);
    this.password = password || decodeURIComponent(parsed.password);
    parsed.username = '';
    parsed.password = '';
    this.url = parsed.href;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeoutMs = timeoutMs;
    this.digest = null;
  }

  authorization(method, url) {
    // A challenge belongs to the host that sent it.
    if (this.digest && this.digest.host === new URL(url).host) {
      this.digest.nc += 1;
      const target = new URL(url);
      return digestHeader(this.digest.challenge, {
        username: this.username,
        password: this.password,
        method,
        uri: target.pathname + target.search,
        nc: this.digest.nc,
        cnonce: randomBytes(8).toString('hex'),
      });
    }
    return `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
  }

  /**
   * One WebDAV request. Follows redirects (PROPFIND kept, credentials
   * resent only on the same site) and answers a Digest challenge once.
   * @returns {Promise<{ status: number, url: string, body: string }>}
   */
  async request(method, url, { depth, body } = {}, attempt = 0) {
    if (!sameSite(this.url, url)) {
      throw new CardDavError(
        'http',
        `the server pointed to another domain (${new URL(url).hostname})`,
      );
    }
    let response;
    try {
      response = await this.fetch(url, {
        method,
        redirect: 'manual',
        headers: {
          Authorization: this.authorization(method, url),
          'Content-Type': 'application/xml; charset=utf-8',
          ...(depth === undefined ? {} : { Depth: String(depth) }),
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const reason = err?.cause?.code ?? err?.name ?? 'network error';
      throw new CardDavError('unreachable', `server unreachable (${reason})`);
    }
    if ([301, 302, 303, 307, 308].includes(response.status) && attempt < 5) {
      const location = response.headers.get('location');
      await response.body?.cancel?.();
      if (location) {
        if (url.startsWith('https:') && !new URL(location, url).href.startsWith('https:')) {
          throw new CardDavError('http', 'the server redirected to an unencrypted address');
        }
        return this.request(method, new URL(location, url).href, { depth, body }, attempt + 1);
      }
    }
    if (response.status === 401) {
      const challenge = response.headers.get('www-authenticate') ?? '';
      await response.body?.cancel?.();
      const stale = /stale="?true/i.test(challenge);
      const host = new URL(url).host;
      const fresh = !this.digest || this.digest.host !== host || stale;
      if (/^\s*digest/i.test(challenge) && fresh && attempt < 6) {
        this.digest = { challenge, nc: 0, host };
        return this.request(method, url, { depth, body }, attempt + 1);
      }
      throw new CardDavError('auth', 'wrong user name or password (HTTP 401)');
    }
    if (response.status === 403) {
      await response.body?.cancel?.();
      throw new CardDavError('auth', 'access refused (HTTP 403)');
    }
    if (response.status === 404) {
      await response.body?.cancel?.();
      throw new CardDavError('not_found', 'no CardDAV service at this address (HTTP 404)');
    }
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel?.();
      throw new CardDavError('http', `HTTP ${response.status}`);
    }
    return { status: response.status, url, body: await response.text() };
  }

  async propfind(url, depth, body = PROPFIND_DISCOVERY) {
    const answer = await this.request('PROPFIND', url, { depth, body });
    return parseMultistatus(answer.body, answer.url);
  }

  /**
   * The address books of the account.
   * @returns {Promise<{ url: string, name: string, ctag: string|null }[]>}
   */
  async discover() {
    const start = new URL(this.url);
    const candidates = [this.url];
    if (start.pathname === '/' || start.pathname === '') {
      candidates.unshift(new URL('/.well-known/carddav', start).href);
    }
    let lastError = null;
    for (const candidate of candidates) {
      try {
        const books = await this.discoverFrom(candidate);
        if (books.length > 0) {
          return books;
        }
      } catch (err) {
        if (err.code === 'auth' || err.code === 'unreachable') {
          throw err;
        }
        lastError = err;
      }
    }
    throw (
      lastError ?? new CardDavError('no_address_book', 'no address book found for this account')
    );
  }

  async discoverFrom(url) {
    const [self] = await this.propfind(url, 0);
    if (!self) {
      return [];
    }
    if (isAddressBook(self.props)) {
      return [book(self)];
    }
    let home = firstHref(self.props['addressbook-home-set']);
    const principal = firstHref(self.props['current-user-principal']);
    if (!home && principal) {
      const [me] = await this.propfind(new URL(principal, self.url).href, 0);
      home = firstHref(me?.props['addressbook-home-set']);
    }
    const listFrom = home ? new URL(home, self.url).href : self.url;
    const children = await this.propfind(listFrom, 1);
    return children.filter((entry) => isAddressBook(entry.props)).map(book);
  }

  /**
   * Nextcloud's "system" address book holds every user of the instance
   * (birthdays of colleagues included): left out unless named in the
   * account's list.
   */
  static isSystemBook(bookUrl) {
    return /\/z-server-generated--system\/?$/.test(new URL(bookUrl).pathname);
  }

  /**
   * The cards of an address book: `href -> etag`.
   * @returns {Promise<Map<string, string>>}
   */
  async etags(bookUrl) {
    const entries = await this.propfind(bookUrl, 1, PROPFIND_ETAGS);
    const map = new Map();
    for (const entry of entries) {
      if (trimSlash(entry.url) === trimSlash(bookUrl) || isCollection(entry.props)) {
        continue;
      }
      const type = text(entry.props.getcontenttype).toLowerCase();
      if (type && !type.includes('vcard') && !entry.url.endsWith('.vcf')) {
        continue;
      }
      map.set(entry.url, text(entry.props.getetag).trim());
    }
    return map;
  }

  /**
   * The vCards of the given cards.
   * @returns {Promise<{ url: string, etag: string, data: string }[]>}
   */
  async multiget(bookUrl, urls) {
    const cards = [];
    for (let i = 0; i < urls.length; i += MULTIGET_BATCH) {
      const batch = urls.slice(i, i + MULTIGET_BATCH);
      // Matched by decoded path: the answer may encode `@` or `:` otherwise.
      const asked = new Map(batch.map((url) => [urlKey(url), url]));
      const hrefs = batch.map((url) => new URL(url).pathname);
      const answer = await this.request('REPORT', bookUrl, { depth: 1, body: multigetBody(hrefs) });
      for (const entry of parseMultistatus(answer.body, answer.url)) {
        const data = text(entry.props['address-data']);
        // Only what was asked: a server answering more must not count twice.
        const url = asked.get(urlKey(entry.url));
        if (url && data.includes('BEGIN:VCARD')) {
          cards.push({ url, etag: text(entry.props.getetag).trim(), data });
        }
      }
    }
    return cards;
  }
}

function book(entry) {
  const ctag = text(entry.props.getctag).trim() || text(entry.props['sync-token']).trim() || null;
  const name = text(entry.props.displayname).trim();
  const url = entry.url.endsWith('/') ? entry.url : `${entry.url}/`;
  return {
    url,
    name: name || decodeURIComponent(url.split('/').filter(Boolean).pop() ?? ''),
    ctag,
  };
}

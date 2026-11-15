// -----------------------------------------------------------------------------
// The CardDAV client, against the answers of a real Radicale (replayed) and
// a few hand-made ones: discovery, change detection, auth, errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardDavClient, CardDavError, digestHeader, sameSite } from '../src/carddav.js';
import { ContactSource } from '../src/contacts.js';
import { parseAccount } from '../src/config.js';
import { PASSWORD, SERVER, SESSION, createServer } from './helpers/world.js';

const client = (server, url = `${SERVER}/`, password = PASSWORD) =>
  new CardDavClient({ url, username: 'alice', password, fetch: server.fetch });

test('discovery from the bare server: .well-known, principal, home, address books', async () => {
  const server = createServer();
  const books = await client(server).discover();
  assert.equal(books.length, 1);
  assert.equal(books[0].url, `${SERVER}/alice/contacts/`);
  assert.equal(books[0].name, 'Contacts');
  assert.ok(books[0].ctag);
  assert.equal(server.requests[0].url, `${SERVER}/.well-known/carddav`);
});

test('the address of one address book is used as is', async () => {
  const server = createServer();
  const self = SESSION[4].body; // PROPFIND depth 1 of the book: its first response is the book
  server.overrides.set(`PROPFIND ${SERVER}/alice/contacts/ 0`, {
    status: 207,
    body: self,
    headers: {},
  });
  const books = await client(server, `${SERVER}/alice/contacts/`).discover();
  assert.deepEqual(
    books.map((book) => book.url),
    [`${SERVER}/alice/contacts/`],
  );
});

test('every card is downloaded once, then nothing while the ctag does not move', async () => {
  const server = createServer();
  const source = new ContactSource({
    createClient: (options) => new CardDavClient({ ...options, fetch: server.fetch }),
  });
  const account = parseAccount({ server_url: `${SERVER}/`, username: 'alice', password: PASSWORD });
  const first = await source.load('alice', account);
  assert.equal(first.downloaded, 6);
  assert.equal(first.entries.length, 7);
  const second = await source.load('alice', account);
  assert.equal(second.downloaded, 0);
  assert.equal(server.requests.filter((r) => r.method === 'REPORT').length, 1);
  assert.deepEqual(second.entries, first.entries);
});

test('a changed ctag: only the card whose etag moved is downloaded, a deleted one goes', async () => {
  const server = createServer();
  const source = new ContactSource({
    createClient: (options) => new CardDavClient({ ...options, fetch: server.fetch }),
  });
  const account = parseAccount({ server_url: `${SERVER}/`, username: 'alice', password: PASSWORD });
  await source.load('alice', account);
  const home = SESSION.find(
    (e) => e.method === 'PROPFIND' && e.url === `${SERVER}/alice/` && e.depth === '1',
  );
  server.overrides.set(`PROPFIND ${SERVER}/alice/ 1`, {
    ...home,
    body: home.body
      .replace(/<CS:getctag>[^<]*</, '<CS:getctag>"new-ctag"<')
      .replace(/<sync-token>[^<]*</, '<sync-token>new<'),
  });
  const list = SESSION.find(
    (e) => e.method === 'PROPFIND' && e.url === `${SERVER}/alice/contacts/`,
  );
  // Marie's card changed, the plumber's card is gone.
  const changed = list.body
    .replace(
      /(marie-3\.0\.vcf<\/href><propstat><prop>(?:(?!<\/prop>).)*?<getetag>)"[^"]*"/s,
      '$1"changed"',
    )
    .replace(/<response><href>\/alice\/contacts\/no-date\.vcf<\/href>.*?<\/response>/s, '');
  assert.notEqual(changed, list.body);
  server.overrides.set(`PROPFIND ${SERVER}/alice/contacts/ 1`, { ...list, body: changed });
  const report = SESSION.find((e) => e.method === 'REPORT');
  server.overrides.set(`REPORT ${SERVER}/alice/contacts/ 1`, {
    ...report,
    body: report.body.replace('BDAY:1992-04-12', 'BDAY:1992-04-13'),
  });
  const result = await source.load('alice', account);
  assert.equal(result.downloaded, 1);
  const multiget = server.requests.filter((r) => r.method === 'REPORT').at(-1).body;
  assert.match(multiget, /marie-3\.0\.vcf/);
  assert.doesNotMatch(multiget, /emilie/);
  const marie = result.entries.find((entry) => entry.name === 'Marie Martin');
  assert.equal(marie.day, 13);
});

test('errors: wrong password, server down, nothing at the address, bad URL', async () => {
  const server = createServer();
  await assert.rejects(client(server, `${SERVER}/`, 'wrong').discover(), { code: 'auth' });
  server.down = true;
  await assert.rejects(client(server).discover(), (err) => {
    assert.equal(err.code, 'unreachable');
    assert.match(err.message, /ECONNREFUSED/);
    return true;
  });
  server.down = false;
  await assert.rejects(client(server, `${SERVER}/nobody/`).discover(), { code: 'not_found' });
  assert.throws(() => client(server, 'ftp://example.com'), CardDavError);
  assert.throws(() => client(server, 'not a url'), { code: 'invalid_url' });
});

test('credentials in the URL move to the fields and never stay in the address', () => {
  const c = new CardDavClient({
    url: 'https://bob:secret@dav.example.com/',
    fetch: async () => {},
  });
  assert.equal(c.url, 'https://dav.example.com/');
  assert.equal(c.username, 'bob');
  assert.equal(c.password, 'secret');
});

test('credentials are never sent to another domain', async () => {
  const requests = [];
  const fetch = async (url) => {
    requests.push(url);
    return new Response(null, { status: 301, headers: { location: 'https://evil.example.org/' } });
  };
  const c = new CardDavClient({
    url: 'https://dav.example.com/dav/',
    username: 'a',
    password: 'b',
    fetch,
  });
  await assert.rejects(c.discover(), /another domain/);
  assert.ok(requests.every((url) => new URL(url).hostname === 'dav.example.com'));
  assert.equal(sameSite('https://contacts.icloud.com/', 'https://p42-contacts.icloud.com/x'), true);
  assert.equal(sameSite('http://192.0.2.10:5232/', 'http://192.0.2.11:5232/'), false);
});

test('Digest authentication (RFC 2617 example), as Baïkal asks', async () => {
  const header = digestHeader(
    'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
    {
      username: 'Mufasa',
      password: 'Circle Of Life',
      method: 'GET',
      uri: '/dir/index.html',
      nc: 1,
      cnonce: '0a4f113b',
    },
  );
  assert.match(header, /response="6629fae49393a05397450978507c4ef1"/);
  assert.match(header, /nc=00000001/);

  // A server that answers 401 Digest: the client answers the challenge.
  const seen = [];
  const fetch = async (url, init) => {
    seen.push(init.headers.Authorization);
    if (!init.headers.Authorization.startsWith('Digest')) {
      return new Response('', {
        status: 401,
        headers: {
          'www-authenticate': 'Digest realm="BaikalDAV", qop="auth", nonce="abc", opaque="def"',
        },
      });
    }
    return new Response(SESSION[4].body, { status: 207 });
  };
  const c = new CardDavClient({
    url: `${SERVER}/alice/contacts/`,
    username: 'alice',
    password: 'x',
    fetch,
  });
  const books = await c.discover();
  assert.equal(books.length, 1);
  assert.match(seen[0], /^Basic /);
  assert.match(seen[1], /^Digest username="alice", realm="BaikalDAV"/);
});

test('SabreDAV (Nextcloud, Baïkal): the CR of each line escaped as &#13;, hrefs encoded otherwise', async () => {
  const body =
    '<?xml version="1.0"?>\n<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:response><d:href>/remote.php/dav/addressbooks/users/marie%40example.com/contacts/A%3A1.vcf</d:href><d:propstat><d:prop><d:getetag>&quot;e1&quot;</d:getetag><card:address-data>BEGIN:VCARD&#13;\nVERSION:3.0&#13;\nFN:Marie &amp; Paul&#13;\nBDAY:1985-04-12&#13;\nUID:a1&#13;\nEND:VCARD&#13;\n</card:address-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>';
  const fetch = async () => new Response(body, { status: 207 });
  const book =
    'https://cloud.example.com/remote.php/dav/addressbooks/users/marie@example.com/contacts/';
  const c = new CardDavClient({ url: book, username: 'm', password: 'p', fetch });
  const [card] = await c.multiget(book, [`${book}A:1.vcf`]);
  assert.equal(card.url, `${book}A:1.vcf`);
  const { parseVCard, contactDates } = await import('../src/vcard.js');
  assert.deepEqual(contactDates(parseVCard(card.data)), [
    { kind: 'birthday', name: 'Marie & Paul', month: 4, day: 12, year: 1985 },
  ]);
});

test('no credentials over an https → http redirect, nor to a host sharing only a suffix', async () => {
  const fetch = async () =>
    new Response(null, { status: 301, headers: { location: 'http://dav.example.com/' } });
  const c = new CardDavClient({
    url: 'https://dav.example.com/dav/',
    username: 'a',
    password: 'b',
    fetch,
  });
  await assert.rejects(c.discover(), /unencrypted/);
  assert.equal(sameSite('https://a.example.co.uk/', 'https://b.example.co.uk/'), false);
  assert.equal(sameSite('https://me.duckdns.org/', 'https://you.duckdns.org/'), false);
});

test('a card listed but not returned by the server is kept, and asked again next time', async () => {
  const server = createServer();
  const source = new ContactSource({
    createClient: (options) => new CardDavClient({ ...options, fetch: server.fetch }),
  });
  const account = parseAccount({ server_url: `${SERVER}/`, username: 'alice', password: PASSWORD });
  const first = await source.load('alice', account);
  // The book changes, and the REPORT answers nothing.
  const home = SESSION.find(
    (e) => e.method === 'PROPFIND' && e.url === `${SERVER}/alice/` && e.depth === '1',
  );
  server.overrides.set(`PROPFIND ${SERVER}/alice/ 1`, {
    ...home,
    body: home.body
      .replace(/<CS:getctag>[^<]*</, '<CS:getctag>"x"<')
      .replace(/<sync-token>[^<]*</, '<sync-token>x<'),
  });
  const list = SESSION.find(
    (e) => e.method === 'PROPFIND' && e.url === `${SERVER}/alice/contacts/`,
  );
  server.overrides.set(`PROPFIND ${SERVER}/alice/contacts/ 1`, {
    ...list,
    body: list.body.replaceAll(/<getetag>"[^"]*"/g, '<getetag>"other"'),
  });
  server.overrides.set(`REPORT ${SERVER}/alice/contacts/ 1`, {
    status: 207,
    headers: {},
    body: '<?xml version="1.0"?><multistatus xmlns="DAV:"></multistatus>',
  });
  const second = await source.load('alice', account);
  const sorted = (list) => list.map((e) => `${e.kind}:${e.key}`).sort();
  assert.deepEqual(sorted(second.entries), sorted(first.entries));
  assert.equal(source.cache.get('alice').books.get(`${SERVER}/alice/contacts/`).ctag, null);
});

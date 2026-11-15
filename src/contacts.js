// -----------------------------------------------------------------------------
// The dates of one user's address books, kept up to date at the lowest cost:
// an address book whose ctag/sync-token did not move is not read again, and
// of a changed one only the new or modified cards are downloaded.
//
// The cache lives in memory only and holds, per card, its etag, a hash of
// its UID and the names and dates it carries. Nothing else of a contact is
// kept, nothing is written to disk.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { CardDavClient, CardDavError } from './carddav.js';
import { fold } from './config.js';
import { contactDates, parseVCard } from './vcard.js';

// A safety net for a huge or looping server, not a limit anyone should meet.
export const MAX_CARDS = 20_000;

const keyOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

export class ContactSource {
  /**
   * @param {object} [options]
   * @param {(options: object) => CardDavClient} [options.createClient] test seam
   */
  constructor({ createClient } = {}) {
    this.createClient = createClient ?? ((options) => new CardDavClient(options));
    /** userSelector → { fingerprint, books: Map<url, { ctag, cards: Map<url, card> }> } */
    this.cache = new Map();
  }

  /** The dates last read for this account, or null (never read, or other account). */
  cached(selector, account) {
    const entry = this.cache.get(selector);
    return entry && entry.fingerprint === account.fingerprint ? collect(entry.books) : null;
  }

  forget(selector) {
    this.cache.delete(selector);
  }

  /**
   * Reads the address books (what changed only) and returns every date.
   * @returns {Promise<{ entries: object[], books: number, downloaded: number }>}
   */
  async load(selector, account) {
    if (!account.serverUrl || !account.username || !account.password) {
      throw new CardDavError('invalid_url', 'the account is not filled in');
    }
    const client = this.createClient({
      url: account.serverUrl,
      username: account.username,
      password: account.password,
    });
    let entry = this.cache.get(selector);
    if (!entry || entry.fingerprint !== account.fingerprint) {
      entry = { fingerprint: account.fingerprint, books: new Map() };
    }
    let books = await client.discover();
    if (account.addressBooks.length > 0) {
      books = books.filter((book) => account.addressBooks.includes(fold(book.name)));
      if (books.length === 0) {
        throw new CardDavError('no_address_book', 'no address book of this name');
      }
    }

    const next = new Map();
    let downloaded = 0;
    let total = 0;
    for (const book of books) {
      const previous = entry.books.get(book.url);
      if (previous && book.ctag && previous.ctag === book.ctag) {
        next.set(book.url, previous);
        total += previous.cards.size;
        continue;
      }
      const etags = await client.etags(book.url);
      const cards = new Map();
      const missing = [];
      for (const [url, etag] of etags) {
        if (total + cards.size + missing.length >= MAX_CARDS) {
          break;
        }
        const known = previous?.cards.get(url);
        if (known && etag && known.etag === etag) {
          cards.set(url, known);
        } else {
          missing.push(url);
        }
      }
      for (const card of await client.multiget(book.url, missing)) {
        const parsed = parseVCard(card.data);
        const key = keyOf(parsed.uid ?? card.url);
        cards.set(card.url, {
          etag: card.etag,
          dates: contactDates(parsed).map((date) => ({ ...date, key })),
        });
        downloaded += 1;
      }
      next.set(book.url, { ctag: book.ctag, cards });
      total += cards.size;
    }
    entry.books = next;
    this.cache.set(selector, entry);
    return { entries: collect(next), books: books.length, downloaded };
  }
}

/** Every date of the books, one per contact and kind (the same card in two books counts once). */
function collect(books) {
  const seen = new Set();
  const entries = [];
  for (const book of books.values()) {
    for (const card of book.cards.values()) {
      for (const date of card.dates) {
        const id = `${date.kind}:${date.key}`;
        if (!seen.has(id)) {
          seen.add(id);
          entries.push(date);
        }
      }
    }
  }
  return entries;
}

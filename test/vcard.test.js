// -----------------------------------------------------------------------------
// vCard reading: the dates of real cards (3.0 Nextcloud/Sabre, 4.0, Apple),
// and nothing else of the contact.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contactDates, parseDate, parseVCard, unfold } from '../src/vcard.js';

const card = async (name) =>
  parseVCard(await readFile(new URL(`./fixtures/vcards/${name}`, import.meta.url), 'utf8'));

test('a vCard 3.0 birthday with its year, and nothing else of the contact', async () => {
  const marie = await card('marie-3.0.vcf');
  assert.deepEqual(contactDates(marie), [
    { kind: 'birthday', name: 'Marie Martin', month: 4, day: 12, year: 1992 },
  ]);
  // Phone, e-mail, address and note never reach the calendar.
  assert.ok(!JSON.stringify(contactDates(marie)).includes('example.com'));
});

test('vCard 4.0: a birthday without year (--MMDD) and an ANNIVERSARY', async () => {
  assert.deepEqual(contactDates(await card('emilie-4.0-no-year.vcf')), [
    { kind: 'birthday', name: 'Émilie Durand', month: 11, day: 18, year: null },
    { kind: 'anniversary', name: 'Émilie Durand', month: 6, day: 20, year: 2015 },
  ]);
});

test('Apple: year omitted (1604) and the labelled anniversary date', async () => {
  assert.deepEqual(contactDates(await card('paul-apple-omit-year.vcf')), [
    { kind: 'birthday', name: 'Paul Leroy', month: 11, day: 16, year: null },
    { kind: 'anniversary', name: 'Paul Leroy', month: 9, day: 4, year: 2010 },
  ]);
});

test('29 February, a contact without date, a date-time and a long name', async () => {
  assert.deepEqual(contactDates(await card('leo-29-february.vcf')), [
    { kind: 'birthday', name: 'Léo Bissextile', month: 2, day: 29, year: 2000 },
  ]);
  assert.deepEqual(contactDates(await card('no-date.vcf')), []);
  const [hugo] = contactDates(await card('hugo-long-name.vcf'));
  assert.equal(hugo.name.length, 80);
  assert.deepEqual([hugo.month, hugo.day, hugo.year], [11, 16, 2026]);
});

test('the date formats seen in the wild', () => {
  assert.deepEqual(parseDate('19850412'), { month: 4, day: 12, year: 1985 });
  assert.deepEqual(parseDate('1985-04-12T00:00:00.000+00:00'), { month: 4, day: 12, year: 1985 });
  assert.deepEqual(parseDate('--04-12'), { month: 4, day: 12, year: null });
  assert.deepEqual(parseDate('0000-04-12'), { month: 4, day: 12, year: null });
  assert.deepEqual(parseDate('1900-04-12'), { month: 4, day: 12, year: null });
  assert.equal(parseDate('circa 1800', { VALUE: 'text' }), null);
  assert.equal(parseDate('1985-02-30'), null);
  assert.equal(parseDate('2001-02-29'), null);
  assert.deepEqual(parseDate('--0229'), { month: 2, day: 29, year: null });
});

test('folded lines, escapes, N without FN, groups and quoted-printable', () => {
  assert.equal(unfold('FN:Jean-\r\n Pierre'), 'FN:Jean-Pierre');
  const parsed = parseVCard(
    'BEGIN:VCARD\nVERSION:2.1\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:L=C3=A9a;Zo=C3=A9;;;\nBDAY:1990-01-02\nEND:VCARD',
  );
  assert.equal(parsed.name, 'Zoé Léa');
  const escaped = parseVCard('BEGIN:VCARD\nFN:Dupont\\, Jean\nX-ANNIVERSARY:2001-05-05\nEND:VCARD');
  assert.equal(escaped.name, 'Dupont, Jean');
  assert.deepEqual(escaped.anniversary, { month: 5, day: 5, year: 2001 });
  const group = parseVCard(
    'BEGIN:VCARD\nVERSION:4.0\nKIND:group\nFN:Famille\nBDAY:--0101\nEND:VCARD',
  );
  assert.deepEqual(contactDates(group), []);
  const org = parseVCard('BEGIN:VCARD\nORG:ACME;R&D\nBDAY:--0101\nEND:VCARD');
  assert.equal(org.name, 'ACME R&D');
});

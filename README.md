# CardDAV Birthdays for Gladys Assistant

The birthdays of your contacts in the [Gladys Assistant](https://gladysassistant.com) calendar. Connect the
CardDAV address book your phone already syncs with (Nextcloud, iCloud, Radicale, Baïkal…): each contact with a
birth date becomes a yearly full-day event, "Marie Martin's birthday (34)", kept up to date as your contacts
change. Wedding anniversaries can follow in a second calendar, and the scenes and the dashboard know who comes
next.

This is an **external integration** of type `calendar` (Gladys 5.2.0 or later): it runs in its own sandboxed
container and pushes calendars and events into the core calendar store, per user. Each user connects their own
address book; it only reads (`transports: local`: your own server, or the CardDAV service you already use).

> Tested against a real Radicale server (discovery, change detection, wrong password, server down) and with
> the SDK's fake Gladys; not tried with a real Nextcloud, iCloud or Baïkal account, nor on a real Gladys
> instance. Feedback welcome on the Gladys forum or in the issues.

It does not overlap the other birthday integrations of the store: `gladys-anniversaries` keeps a list typed by
hand in Gladys, `gladys-monica` reads a Monica CRM; this one reads the contacts you already have on your phone.

## Features

- **Per user**: every member of the household enables the integration in **My calendars** with their CardDAV
  account; their calendars stay private until they share them.
- **CardDAV**: discovery of the address books (`.well-known/carddav`, principal, home set) or the address of
  one book; Basic and Digest authentication; only the changed cards are downloaded (ctag/sync-token, etags).
- **vCard 3.0 and 4.0**: `BDAY` with or without year (`--MMDD`), date-times, Apple's omitted year (1604) and
  labelled anniversary, `ANNIVERSARY` / `X-ANNIVERSARY`, 29 February (28 February in common years).
- **Calendars**: "Birthdays" and, on request, "Wedding anniversaries", a week back and a year ahead, slid
  every night, with the age when the year is known (optional).
- **Scene trigger** "Birthday reminder" every day at the chosen time: on the day, or 1, 2, 3, 7, 14 or 30
  days before, with a ready-made sentence.
- **Scene action** "Get the next birthday": who, in how many days, how old, the birthdays of the day.
- **Dashboard widget** "Birthdays": the next ones, today's marked.
- Four languages (English, French, German, Spanish): the calendars follow the language of their owner.

## Requirements

- Gladys Assistant **5.2.0 or later** (calendar integrations).
- A CardDAV address book: Nextcloud, iCloud (app-specific password), Radicale, Baïkal, or any RFC 6352
  server. **Google Contacts is not supported**: Google's CardDAV only accepts OAuth sign-in.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-carddav-birthdays`.
2. Each user opens **Integrations → CardDAV Birthdays**, fills in **My calendars** (server address, user name,
   app password) and clicks **Enable**.
3. Share the calendar in the list under the form to see it on the dashboard and use it in scenes.

The user documentation, in [English](docs/en.md), [French](docs/fr.md), [German](docs/de.md) and
[Spanish](docs/es.md), details every server and field.

## Limits

- Read only; one CardDAV account per user (several address books of it).
- The address books are read every 1, 6 or 24 hours (administrator setting).
- Google Contacts is not supported (OAuth only).
- A reminder hour missed by more than an hour (integration stopped) is skipped for the day.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys (`@gladysassistant/integration-sdk/testing`) and a replay of a
real Radicale session (`test/fixtures/radicale-session.json`), in the `Europe/Paris` time zone, with an
injectable clock. See [`CLAUDE.md`](CLAUDE.md) for the architecture and the rules of the repository. Releases
go through **Actions → Release**, which bumps the version, rolls [`CHANGELOG.md`](CHANGELOG.md) and builds the
multi-arch image on `ghcr.io`.

## Credits

- Built on the official [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js) (Apache-2.0).
- XML parsing by [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) (MIT).
- Tested against [Radicale](https://radicale.org) (GPL-3.0, test only, not shipped).
- Requested in the Gladys community list of integrations to bring to the store ("Anniversaires CardDAV").

Not affiliated with Apple, Nextcloud, Google or the authors of Radicale and Baïkal.

## License

[Apache-2.0](LICENSE)

# CardDAV Birthdays

The birthdays of your contacts, in the Gladys calendar. Connect the CardDAV address book your phone
already syncs with (Nextcloud, iCloud, Radicale, Baïkal…): each contact with a birth date becomes a
yearly event, "Marie Martin's birthday (34)", kept up to date as your contacts change. Wedding
anniversaries can follow in a second calendar.

Tested against a real Radicale server. Nextcloud, iCloud and Baïkal follow the same standard but were
not tried with a real account: feedback welcome.

## What you get

- **A "Birthdays" calendar per user**, filled a year ahead with one full-day event per birthday, with
  the age when the year of birth is known. It appears in the Gladys calendar view like any other
  calendar.
- **A "Wedding anniversaries" calendar**, if you ask for it, from the `ANNIVERSARY` date of the
  contacts.
- **A scene trigger** every morning at the chosen time: a birthday today, tomorrow, or 2, 3, 7, 14 or
  30 days ahead, with a ready-made sentence to send or to speak.
- **A scene action** giving the next birthday: who, in how many days, how old, and the birthdays of
  the day.
- **A dashboard widget** listing the next birthdays.
- Because they are ordinary calendars, the built-in Gladys scenes work too: "an event is coming".

## Connect your address book

Each user connects their own address book: open **Integrations → CardDAV Birthdays**, then the **My
calendars** block, fill in the fields and **Enable**.

- **CardDAV server address**: the address of the server (the integration finds the address books
  itself), or the address of one address book.
- **User name** and **Password or app password**: use an app password whenever the service offers
  one. The password is kept by Gladys and never written in the logs.
- **Address books**: names of the address books to read, separated by commas. Empty: all of them.
- **Also add wedding anniversaries**: a second calendar with the `ANNIVERSARY` dates.
- **Show the age in the event names**: "Marie Martin's birthday (34)", or just "Marie Martin's
  birthday".

Then **share** the calendar (toggle in the same block): only shared calendars reach the dashboard,
the scenes and the other members of the household.

### Nextcloud

Address `https://cloud.example.com/remote.php/dav`, your user name, and an app password created in
**Settings → Security → Devices & sessions**. Nextcloud's system address book (every user of the
instance) is left out unless you name it.

### iCloud

Address `https://contacts.icloud.com`, your Apple ID e-mail, and an app-specific password created on
appleid.apple.com (**Sign-In and Security → App-Specific Passwords**). Your usual password is refused.

### Radicale, Baïkal and other servers

The address of the server, for example `http://192.168.1.10:5232/` for Radicale or
`https://dav.example.com/dav.php` for Baïkal. Basic and Digest authentication are both supported.

### Google Contacts

Not supported: Google's CardDAV only accepts OAuth sign-in, which Gladys calendar integrations do not
offer yet. Your Google contacts can still come in through another server that syncs them.

## Administrator settings

- **Read the address books**: every hour, every 6 hours (default) or once a day. Only what changed is
  downloaded; a change of account is read at once.
- **Time of the scene reminders**: when the "Birthday reminder" trigger fires each day (08:00 by
  default).
- **Language of the scene texts**: the sentences and dates handed to scenes. Calendars follow the
  language of their owner, the widget the language of the viewer.

## In Gladys

The events are full-day events, from a week back to a year ahead; the window slides every night. A
birthday on 29 February is celebrated on 28 February in common years. A year of birth missing, or
written as a placeholder (Apple's 1604, 0000, 1900), gives an event without the age.

## Dashboard widget

Add the **Birthdays** widget to a dashboard: the next birthdays of the shared calendars, the ones of
the day marked "Today". Settings: how many (3, 5 or 8), show the wedding anniversaries or not, show
the age or not.

## Scene trigger

**Birthday reminder**: every day at the chosen time, once per birthday of a shared calendar.

- **When**: on the day, or 1, 2, 3, 7, 14 or 30 days before.
- **Kind**: birthdays, wedding anniversaries, or both.
- **Contact**: the exact name of a contact, or empty for anyone.

Variables: the name, a ready-made sentence ("Marie Martin's birthday (34): Tomorrow, Monday 16
November."), the days left, the age, the date, the kind and the owner of the address book.

## Scene action

**Get the next birthday** (kind optional): found (1 or 0), name, kind, days left, date, a ready-made
sentence, the age (0 when unknown), the number of birthdays today and their names.

## Scene examples

- Every morning at 08:00, "Birthday reminder" on the day → send the sentence on Telegram.
- "Birthday reminder" 7 days before, kind "birthdays" → "Think about the present for {{name}}".
- When you come home, "Get the next birthday", then if "birthdays today" is above 0 → have the
  speaker say the names.

## Troubleshooting

- **The calendar is empty**: its description in **My calendars** says why the last reading failed
  (wrong password, server not answering, no address book of this name).
- **Wrong user name or password**: iCloud and Nextcloud with two-factor sign-in need an app password.
- **Nothing in the widget or the scenes**: share the calendar in **My calendars**.
- **Logs**: Integrations → CardDAV Birthdays → Logs; set `LOG_LEVEL=debug` for the details of each
  reading.

## Limits

- Read only: nothing is ever written to your address book.
- One CardDAV account per user; several address books of that account can be read.
- Contacts are read every hour at best: a birthday added on the phone appears at the next reading.
- Google Contacts is not supported (see above).
- Tested against Radicale only. Nextcloud, iCloud and Baïkal: feedback welcome.

## Privacy

Only the display name and the dates of a contact are read and kept, in memory; phone numbers,
addresses, e-mails and notes never leave the integration. The calendars stay private to their owner
until shared. The server address, user name and password are stored by Gladys like any other setting;
the integration writes nothing but the date of the last reminders in its `/data` volume.

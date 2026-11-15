# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-15

### Added

- The birthdays of the contacts of a CardDAV address book (Nextcloud, iCloud,
  Radicale, Baïkal…) as a "Birthdays" calendar per user, a year ahead, with the
  age when the year of birth is known.
- Wedding anniversaries (`ANNIVERSARY`) in a second calendar, on request.
- vCard 3.0 and 4.0 dates with or without year, Apple's labelled dates and
  omitted years, 29 February celebrated on 28 February in common years.
- Address book discovery (`.well-known/carddav`), Basic and Digest
  authentication, download of the changed cards only (ctag and etags).
- Scene trigger "Birthday reminder" (on the day or 1 to 30 days before, at the
  chosen time), scene action "Get the next birthday", dashboard widget
  "Birthdays".
- English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-carddav-birthdays/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-carddav-birthdays/releases/tag/v1.0.0

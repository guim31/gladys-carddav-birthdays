# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

- **Secrets**: each user's CardDAV server address, user name and password are
  stored by Gladys (account values of the calendar integration) and handed to
  the container in memory. The integration never logs them, never writes them
  to disk, and sends the credentials only to the configured host or to a host
  of the same domain (a redirect elsewhere is refused).
- **Data**: only the display name and the dates of the contacts are kept, in
  memory; they are pushed to the Gladys calendar of their owner. `/data` holds
  one file, the date of the last scene reminders.
- **Network**: outgoing HTTP(S) requests to the CardDAV servers configured by
  the users (WebDAV `PROPFIND` and `REPORT`, read only), and to the Gladys
  host API. No port is opened.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the CardDAV servers the integration talks to.

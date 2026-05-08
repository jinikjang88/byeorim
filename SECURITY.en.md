# Security Policy

> Korean original: [SECURITY.md](SECURITY.md). If this translation falls out of sync, the Korean version is canonical.

Byeorim is a free open-source prototype, but it works with user-domain catalogs and dependency graphs. Security issues are taken seriously. This document explains how to report a flaw and how it gets handled.

## What counts as a security issue

If your finding fits one of the cases below, use the security channel instead of the regular issue tracker.

- Flaws that lead to arbitrary code execution (e.g., a catalog file escaping the sandbox)
- Authentication or authorization bypass
- Flaws that leak data outside without the user's knowledge
- A known vulnerability in a dependency that propagates to Byeorim
- Path traversal or arbitrary file read/write

Regular bugs (a command behaving against intent, a wrong message, a performance issue) are not security issues. Open them at the regular [GitHub Issues](https://github.com/jinikjang88/byeorim/issues).

## How to report

Report through [GitHub Private Security Advisories](https://github.com/jinikjang88/byeorim/security/advisories/new).

This channel is visible only to the maintainer and stays private until a patch is ready. Posting a security flaw on the public tracker exposes other users before a fix exists. Use the private channel first.

The following details speed up triage.

- Minimal steps to reproduce
- Scope of impact (which data, which command)
- Confirmed Byeorim version and Node.js version
- A patch suggestion, if you have one

## Response commitments

Byeorim runs on a single maintainer, so 24/7 response cannot be promised. The following commitments still hold.

- First response within 5 business days of the report
- An impact assessment shared with the reporter once the flaw is confirmed
- Status updates while the patch is being prepared
- Disclosure timing decided together with the reporter (coordinated disclosure)
- Reporter credit in the release notes and the security advisory if they want; anonymous handling otherwise

## Supported versions

Byeorim is in the 0.x stage. Until the API stabilizes, only one active line is maintained.

| Version | Security patches |
|---------|------------------|
| Latest 0.x | Supported |
| Older | Not supported |

The table will be updated when 1.0 ships.

## Safe-use guidance

The following habits reduce the impact of any flaw while you use Byeorim.

- Do not import a YAML catalog from an untrusted source without review. An unreviewed import can poison the dependency graph or block definitions.
- When you share the `.byeorim/` directory externally, remember it may contain user notes such as `diary.md`.
- Use a current [Node.js LTS](https://nodejs.org/en/about/previous-releases) line. End-of-life versions are not supported.

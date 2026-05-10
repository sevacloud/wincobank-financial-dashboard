# Security Policy

## Credential Handling

No credentials, API keys, or secrets are ever stored in this codebase.

- The QuickFile API key is encrypted with AES-256-CBC before being written to
  the WordPress database (`wp_options`). The encryption key is derived at
  runtime from WordPress's own `AUTH_KEY` and `SECURE_AUTH_KEY` constants,
  which live only in `wp-config.php` and are never committed to version control.
- All QuickFile API calls are made server-side in PHP only. No credentials are
  passed to the browser or included in JavaScript bundles.
- The dashboard REST endpoints require an authenticated WordPress session with
  the `wincobank_trustee` role (or `manage_options` capability). Unauthenticated
  requests are rejected before any data is fetched.
- Responses are cached server-side using WordPress transients. The cache is
  flushed via an admin-only action; cached data is never sent to unauthenticated
  users.

## Supported Versions

Security fixes are applied to the current release on the `main` branch only.

## Reporting a Vulnerability

If you discover a security vulnerability in this plugin, please **do not** open
a public GitHub issue.

Report it confidentially by email to:

**security@wincobank.org.uk**

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (if safe to share)
- The version of the plugin and WordPress you are running

We will acknowledge receipt within 5 business days and aim to issue a fix or
mitigation within 30 days of a confirmed report.

# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| Latest (`master`) | ✅ |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it by emailing:

**avikheni35@gmail.com**

Include as much of the following as possible:

- Type of vulnerability (e.g. SQL injection, XSS, authentication bypass)
- File paths and line numbers of the affected source code
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue

You will receive a response within **48 hours**. We ask that you give us reasonable time to address the issue before any public disclosure.

## Security Considerations

This application handles:

- **Financial data** subject to GoBD — journal entries and cash book records are integrity-hashed (SHA-256); tampering is a compliance violation
- **Encrypted fields** — AES-256-GCM encryption for sensitive fields; `FIELD_ENCRYPTION_KEY` exposure is a critical vulnerability
- **Authentication tokens** — JWT access tokens (in-memory only) and refresh tokens (HttpOnly cookie, stored hashed)
- **Multi-tenant data** — all queries must be scoped to `tenantId`; cross-tenant data leakage is a critical vulnerability
- **Accounting periods** — bypassing `requireOpenPeriod` middleware to write to locked periods is a critical vulnerability

If your finding relates to any of the above, please mark it as **High Priority** in your report.

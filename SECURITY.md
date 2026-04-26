# Security Policy

TraceMind handles model-provider credentials, uploaded papers, extracted research assets, and generated research notes. Treat all of those as sensitive unless they are intentionally shared.

## Reporting a Vulnerability

If you find a vulnerability, please open a private security advisory on GitHub when available. If that is not available, create an issue with minimal reproduction details and avoid posting secrets, tokens, private PDFs, or personal data.

## Supported Branch

Security fixes should target `main`.

## Credential Rules

- Never commit real API keys.
- Never hardcode provider credentials in frontend code.
- Use `.env` only for local bootstrap.
- Prefer the backend model-configuration API for persisted provider settings.
- Rotate any credential that may have been committed, logged, or shared.

## Data Rules

- Do not commit local uploads, private PDFs, screenshots, or Playwright result folders.
- Keep generated demo data free of private or licensed content unless distribution is permitted.
- When adding export features, preserve citation and source metadata.

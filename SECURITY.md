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
- Treat model prompts, extracted notes, and topic memory as potentially sensitive research material.
- Prefer explicit user action before sending uploaded or extracted content to external model providers.

## AI Safety Posture

TraceMind should make uncertainty visible. Security and trust issues are not limited to credentials; they also include misleading evidence chains, hidden model assumptions, and accidental disclosure of private research context.

When changing AI-assisted features, check that:

- The UI does not present model output as verified fact without evidence.
- Source metadata is preserved when content is summarized, exported, or transformed.
- External-provider calls stay behind backend services and do not expose credentials to the frontend.
- Logs avoid storing private document text, API keys, or full prompts unless explicitly intended for local debugging.

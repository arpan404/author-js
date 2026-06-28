# Security policy

## Supported versions

Author JS is pre-1.0. Security fixes target the latest published version.

## Reporting a vulnerability

Please do not open a public issue for security reports.

Report vulnerabilities by emailing Arpan Bhandari or by opening a private GitHub security advisory if available on the repository.

Include:

- affected version or commit
- reproduction steps
- impact
- suggested fix, if known

## Security model

Frontend authorization is only UX. Backend checks are the security boundary.

Use server-side Author JS checks before mutating or returning protected data.

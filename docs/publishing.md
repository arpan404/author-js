# Publishing

author.js publishes to npm as `author-js` from GitHub Actions.

## Required secret

Set this repository secret before the first release:

- `NPM_TOKEN` — npm automation token with publish access

## Release checklist

1. Update `package.json` version.
2. Update `CHANGELOG.md`.
3. Run local checks:

   ```bash
   bun run check
   docker compose up -d --wait
   bun run test:integration
   docker compose down
   npm pack --dry-run
   ```

4. Commit and push.
5. Create a GitHub release for the version tag, for example `v0.1.0`.
6. The `Publish to npm` workflow runs checks, real service integration tests, and `npm publish --provenance --access public`.

## Manual publish

Use the `Publish to npm` workflow dispatch when you need to publish manually. The `tag` input controls the npm dist-tag, usually `latest`.

## Release notes

GitHub release notes are grouped by labels using `.github/release.yml`.

Recommended PR labels:

- `feature`
- `fix`
- `documentation`
- `dependencies`
- `breaking-change`

## Failed publish recovery

If tests fail, fix the commit and rerun the workflow.

If npm publish fails after the version is already published, bump to a new patch version. npm versions are immutable.

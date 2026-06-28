# Publishing

This repo publishes `author-js` to npm from GitHub Actions.

## Required secret

Add this repository secret:

- `NPM_TOKEN`: npm automation token with publish access

## Release flow

1. Bump `package.json` version.
2. Run checks locally:

   ```bash
   bun run check
   npm pack --dry-run
   ```

3. Commit and push.
4. Create a GitHub release.
5. The `Publish to npm` workflow runs `npm publish --provenance --access public`.

## Manual publish

Use the `Publish to npm` workflow dispatch and choose an npm dist-tag, usually `latest`.

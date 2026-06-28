# Publishing

author.js publishes to npm as `author-js` from GitHub Actions.

## Secret

Repository secret required:

- `NPM_TOKEN` — npm automation token with publish access

## Release

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

Trigger the `Publish to npm` workflow and choose an npm dist-tag (usually `latest`).

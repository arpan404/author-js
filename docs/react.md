# React

The React adapter is for UI decisions: hiding buttons, showing fallbacks, and keeping screens consistent with your permission model.

It is not a security boundary. Always enforce the same action on the backend before returning protected data or mutating state.

## Provider

Wrap the part of your app that needs permission checks:

```tsx
import { AuthorProvider } from "author-js/react";

<AuthorProvider authorization={author} entity={user}>
  <App />
</AuthorProvider>;
```

The provider accepts:

- `authorization`: an Author JS instance
- `entity`: default actor for checks
- `mode`: defaults to `frontend`

## Can

Render children when the check allows:

```tsx
import { Can } from "author-js/react";

<Can do="update" on="Project" resource={project}>
  <EditButton />
</Can>;
```

Render a fallback when denied:

```tsx
<Can
  do="update"
  on="Project"
  resource={project}
  fallback={<DisabledEditButton />}
>
  <EditButton />
</Can>
```

While loading, `Can` renders `null`.

## Cannot

Render children when the check denies:

```tsx
import { Cannot } from "author-js/react";

<Cannot do="delete" on="Project" resource={project}>
  <p>You cannot delete this project.</p>
</Cannot>;
```

## useCan

Use the hook when you need custom loading, error, or layout behavior.

```tsx
import { useCan } from "author-js/react";

function EditProjectButton({ project }: { project: Project }) {
  const result = useCan({
    do: "update",
    on: "Project",
    resource: project,
  });

  if (result.loading) return null;
  if (result.error) return <span>Could not check permissions</span>;
  if (!result.allowed) return null;

  return <EditButton />;
}
```

Return shape:

```ts
type UseCanResult = {
  allowed: boolean;
  loading: boolean;
  error: Error | null;
  decision: Decision | null;
};
```

## Entity override

Use `i` to check permissions for a different entity than the provider default:

```tsx
<Can i={serviceAccount} do="read" on="Project" resource={project}>
  <span>Service account can read this project</span>
</Can>
```

## Context

Pass additional policy context:

```tsx
<Can
  do="read"
  on="Report"
  resource={report}
  context={{ ip: clientIp, tenantId }}
>
  <ReportPreview />
</Can>
```

## Practical advice

- Use React checks for UX only.
- Keep frontend policies limited to data that is safe to expose.
- Prefer backend checks for anything sensitive.
- Use fallbacks for disabled states when hiding UI would be confusing.

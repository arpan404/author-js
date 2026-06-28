# React

The React adapter helps you render UI based on authorization decisions.

It should not be your security boundary. Always enforce permissions again on the backend before reading or changing protected data.

## Provider

Wrap the part of your app that needs permission checks.

```tsx
import { AuthorProvider } from "author-js/react";

<AuthorProvider authorization={author} entity={user}>
  <App />
</AuthorProvider>;
```

Props:

| Prop | Description |
| --- | --- |
| `authorization` | Author JS instance |
| `entity` | default actor for child checks |
| `mode` | defaults to `frontend` |
| `context` | default context passed to child checks |
| `children` | React children |

Provider context is useful for values every check needs, such as tenant ID or rollout bucket:

```tsx
<AuthorProvider authorization={author} entity={user} context={{ tenantId }}>
  <App />
</AuthorProvider>
```

## Can

Render children when the check is allowed.

```tsx
import { Can } from "author-js/react";

<Can do="update" on="Project" resource={project}>
  <EditButton />
</Can>;
```

Add a fallback for denied checks:

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

`Can` renders `null` while loading.

## Cannot

Render children when the check is denied.

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
  const permission = useCan({
    do: "update",
    on: "Project",
    resource: project,
  });

  if (permission.loading) return null;
  if (permission.error) return <span>Could not check permissions</span>;
  if (!permission.allowed) return null;

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

Use `i` when a check should run for a different actor than the provider default.

```tsx
<Can i={serviceAccount} do="read" on="Project" resource={project}>
  <span>Service account can read this project</span>
</Can>
```

## Context

Pass request or UI context to policies. Component context is merged with provider context and overrides matching keys.

```tsx
<Can
  do="read"
  on="Report"
  resource={report}
  context={{ tenantId, rollout: "beta" }}
>
  <ReportPreview />
</Can>
```

## Practical guidance

- Use React checks to improve UX, not to protect data.
- Keep frontend policies limited to data that is safe to expose in the browser.
- Prefer disabled fallbacks when hiding the action would confuse users.
- Use backend `.throw()` or framework middleware for real enforcement.

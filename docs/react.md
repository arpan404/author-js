# React

React checks are for UI rendering only. Always enforce the same authorization rules on the backend.

```tsx
import { AuthorProvider, Can, Cannot, useCan } from "author-js/react";

<AuthorProvider authorization={author} entity={user}>
  <Can do="update" on="Project" resource={project} fallback={<DisabledEditButton />}>
    <EditButton />
  </Can>

  <Cannot do="delete" on="Project" resource={project}>
    <p>You cannot delete this project.</p>
  </Cannot>
</AuthorProvider>;
```

## Hook

```tsx
const result = useCan({ do: "update", on: "Project", resource: project });

if (result.loading) return null;
if (result.error) return <p>Permission check failed</p>;
return result.allowed ? <EditButton /> : null;
```

`useCan` returns:

```ts
type UseCanResult = {
  allowed: boolean;
  loading: boolean;
  error: Error | null;
  decision: Decision | null;
};
```

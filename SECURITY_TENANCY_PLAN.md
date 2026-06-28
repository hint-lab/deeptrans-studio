# Tenant and User Permission Plan

This project uses a deliberately split permission model:

- Read access can be tenant-scoped where collaboration is expected.
- Write access must be user-owner scoped unless a future explicit membership/role model is added.
- Client-provided `tenantId`, `userId`, upload namespace, or resource owner is not trusted.

## Boundaries

| Resource | Read guard | Write guard | Rule |
| --- | --- | --- | --- |
| Project | `requireOwnedProject` | `requireWritableProject` | Same-tenant users may read tenant projects; only `project.userId` can mutate/delete/configure. |
| Document | `requireOwnedDocument` | `requireWritableDocument` | Same-tenant users may read project documents; only the project owner can mutate document state/content. |
| Document item | `requireOwnedDocumentItem` | `requireWritableDocumentItem` | Same-tenant users may read segments; only the project owner can edit, run batch writebacks, or change workflow state. |
| Dictionary | `requireAccessibleDictionary` | `requireWritableDictionary` | Public is read-only; private is creator-only; project dictionaries are writable only through an owner-owned project binding. |
| Translation memory | `requireOwnedMemory` | `requireOwnedMemory` | Translation memories are user-owned; same-tenant users cannot read/write each other's memory libraries. |
| Upload objects | `assertReadableObject` / project read | `resolveUploadNamespace` / project write | Project uploads require project write access; user temporary uploads are scoped to `users/{userId}/uploads`. |
| Worker jobs | Owner payload plus server-side recheck | Owner payload plus server-side recheck | Worker DB writebacks must recheck resource ownership instead of trusting queue payloads alone. |

## Current Enforcement Points

- `src/lib/guards.ts`: central session-backed guards.
- `src/server/document-item-access.ts`: sessionless worker-safe document item write check.
- `src/actions/batch-pre-translate.ts` and `src/actions/batch-quality-assure.ts`: batch start/persist use writable item guards and Redis batch owner keys.
- `src/worker/index.ts`: worker writebacks recheck item/memory ownership before DB writes.
- `src/actions/dictionary.ts`: project dictionary writes require owner-owned project binding; shared dictionary deletion is blocked.
- `src/actions/project-bindings.ts`: project resource binding configuration requires project write access.
- `src/app/api/projects/[id]/*`: parse, segment, terms, apply, init persist, delete use write guards where they mutate state.

## Required Verification

Run these before merging permission changes:

```bash
yarn type-check
yarn security:scan
yarn security:verify
yarn lint
yarn build:worker
yarn build
git diff --check
```

`security:verify` runs DB-backed checks only when `DATABASE_URL` is set. A local ephemeral Postgres can be used:

```bash
tmpdir=$(mktemp -d /tmp/deeptrans-studio-pg-XXXXXX)
initdb -D "$tmpdir" --auth=trust --username=postgres
pg_ctl -D "$tmpdir" -o "-p 55432 -k /tmp" -l "$tmpdir/postgres.log" start
createdb -h /tmp -p 55432 -U postgres deeptrans_smoke
psql -h /tmp -p 55432 -U postgres -d deeptrans_smoke -c 'CREATE EXTENSION IF NOT EXISTS vector;'
DATABASE_URL="postgresql://postgres@localhost:55432/deeptrans_smoke" yarn db:push
DATABASE_URL="postgresql://postgres@localhost:55432/deeptrans_smoke" yarn security:verify
pg_ctl -D "$tmpdir" -m fast stop
rm -rf "$tmpdir"
```

## Red Lines

- Do not use tenant match as write permission.
- Do not add exported Server Actions that accept `tenantId`, `userId`, or owner scope from the client.
- Do not let `src/server`, `src/agents`, or `src/worker` import `src/actions`.
- Do not write worker DB updates from queue payload IDs without an owner recheck.
- Do not restore `global-memory` or any unauthenticated memory fallback.
- Do not create project/object upload namespaces from client-supplied names.
- Do not delete shared dictionaries through a project-owner path.

## Future Work

If team editing is required, add an explicit membership model such as `ProjectMember(projectId, userId, role)` and make write guards check role-specific permissions. Do not widen `ownedBy()` for writes.

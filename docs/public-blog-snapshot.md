# Public blog snapshot source and dry-run

## Export an exact trusted source

When the authoritative blog database is reachable, export all and only
published posts with an explicit destination:

```bash
mkdir -p /absolute/private/directory

NAEZIP_ENV_FILE=/absolute/private/.env.local \
npm run blog:source:export -- \
  --output /absolute/private/directory/public-blog-source.json
```

The exporter runs one read-only `SELECT`. Categories are derived exclusively
from published posts, and the result preserves post/category IDs, slugs,
titles, excerpts, cover image URLs, publication/update timestamps, category
names, MDX, and explicit `status="published"` fields.

Before touching the destination it runs the production snapshot preflight,
including the 43-post floor and strict MDX validation. It then atomically
replaces only an absent or regular destination file, installs mode `0600`, and
refuses a symlink. The parent directory must already exist. Query, validation,
or write failures do not print content or `DATABASE_URL`; a failed validation
cannot replace the previous successful export.

This is a manual recovery/export command. Do not run it repeatedly while the
database is returning a quota error, and do not place its private output in the
repository.

## Build the local serving snapshot

This command builds the public blog snapshot from an explicit trusted export:

```bash
npm run blog:snapshot:dry-run -- \
  --source /absolute/path/to/public-blog-source.json
```

The command is deliberately offline-only. It writes under
`.local/public-blog-snapshot-dry-run` by default and cannot upload to Blob,
query a database, silently lower the 43-post production floor, or set
`NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL`.

The source must be exact `naezip.public-blog.source.v1` JSON. Unknown fields,
drafts, noncanonical UUIDs/slugs/timestamps, duplicate IDs/slugs, category
mismatches, and MDX that fails the site's strict publication preflight are all
rejected before an artifact is written.

```json
{
  "schema": "naezip.public-blog.source.v1",
  "generatedAt": "2026-08-17T01:02:03.000Z",
  "categories": [
    {
      "id": "10000000-0000-4000-8000-000000000001",
      "slug": "market",
      "name": "시장"
    }
  ],
  "posts": [
    {
      "id": "20000000-0000-4000-8000-000000000001",
      "slug": "example-post",
      "title": "예시 글",
      "excerpt": null,
      "coverImageUrl": null,
      "publishedAt": "2026-08-16T01:00:00.000Z",
      "categorySlug": "market",
      "categoryName": "시장",
      "mdxContent": "# 예시\n\n본문",
      "updatedAt": "2026-08-16T02:00:00.000Z",
      "status": "published"
    }
  ]
}
```

`generatedAt` is part of the trusted export, so equal content produces equal
bytes, release ID, and paths regardless of input order or build time. A
release-scoped payload and manifest are installed atomically; the discovery
manifest at `public-blog/v1/manifest.json` is replaced last.

This dry-run output is not sufficient to activate the site reader. Remote
publication and runtime activation must remain disabled until a complete
trusted source has been recovered and separately reviewed.

### One-time empty-library bootstrap

When the previous library has been deliberately abandoned, a separate reset
path can create a canonical snapshot with exactly zero posts and zero
categories. Create a private `naezip.public-blog.source.v1` file with a
canonical current `generatedAt` and empty `categories`/`posts` arrays, then run:

```bash
npm run blog:snapshot:dry-run -- \
  --source /absolute/private/public-blog-empty-source.json \
  --confirm-empty-bootstrap
```

The flag accepts only the exact `0 posts / 0 categories` state. It cannot
publish a partial library or lower the normal 43-post floor. The database
exporter never enables this mode, so a failed query cannot be mistaken for an
intentional reset.

## Explicit Vercel Blob publication

Only after the trusted source and dry-run have been reviewed, publish with the
separate production command:

```bash
NAEZIP_ENV_FILE=/absolute/private/.env.local \
npm run blog:snapshot:publish -- \
  --source /absolute/private/public-blog-source.json \
  --confirm-release 20260817T010203Z-0123456789ab \
  --confirm-production
```

Copy `--confirm-release` exactly from the reviewed dry-run output. The remote
publisher rebuilds the candidate and compares its deterministic release ID with
that approval before any Blob management or public request. A missing, malformed,
duplicate, or mismatched approval fails without reading or writing the remote
store. The separate `--confirm-production` flag is also required.

Publishing a reviewed empty bootstrap requires every normal approval plus the
dedicated reset confirmation:

```bash
NAEZIP_ENV_FILE=/absolute/private/.env.local \
npm run blog:snapshot:publish -- \
  --source /absolute/private/public-blog-empty-source.json \
  --confirm-release 20260823T010203Z-0123456789ab \
  --confirm-production \
  --confirm-empty-bootstrap
```

An empty bootstrap is create-only: it may seed an absent discovery manifest or
repeat the exact same bytes, but it cannot replace an existing blog release.
Deploy the empty-capable reader before publishing this discovery manifest.

The private environment file must contain the dedicated
`NAEZIP_BLOG_SNAPSHOT_BLOB_READ_WRITE_TOKEN` and the matching public origin in
`NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL`. The command never falls back to the
generic `BLOB_READ_WRITE_TOKEN`.

The payload and release manifest are immutable one-year-cache objects. The
60-second discovery manifest is written last with ETag conditional replacement
and anti-regression/conflict checks. A successful command also downloads and
validates the manifest and payload through both Blob management access and the
unauthenticated public reader. Retention is intentionally outside this command.

## Runtime source selection

Public routes require `NAEZIP_PUBLIC_BLOG_SOURCE=snapshot` together with
`NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL` in Preview and Production. Missing or
unknown source selection fails closed, and `database` mode is rejected on
Vercel Preview/Production. Local maintenance may explicitly select
`NAEZIP_PUBLIC_BLOG_SOURCE=database`; admin authoring remains database-backed.

## Append-only growth from the empty baseline

The normal publisher still refuses 1–42 posts. Until the new library reaches 43
posts, export only posts published at or after the empty release timestamp:

```bash
NAEZIP_ENV_FILE=/absolute/private/.env.local \
npm run blog:source:export -- \
  --output /absolute/private/public-blog-source.json \
  --confirm-bootstrap-continuation \
  --lineage-started-at 2026-08-23T01:02:03.000Z
```

`--lineage-started-at` is an inclusive parameterized `created_at` cutoff. It
prevents abandoned pre-bootstrap rows that remain in the database from entering
the new source, even if an old draft is published later. Use the empty release's
exact `generatedAt` value.

Build and review the candidate with the matching continuation mode:

```bash
npm run blog:snapshot:dry-run -- \
  --source /absolute/private/public-blog-source.json \
  --confirm-bootstrap-continuation
```

Then approve both the candidate and the currently published predecessor:

```bash
NAEZIP_ENV_FILE=/absolute/private/.env.local \
npm run blog:snapshot:publish -- \
  --source /absolute/private/public-blog-source.json \
  --confirm-release 20260824T010203Z-0123456789ab \
  --confirm-current-release 20260823T010203Z-abcdef012345 \
  --confirm-production \
  --confirm-bootstrap-continuation
```

The store verifies both payloads and permits only a strictly newer, larger,
append-only candidate: every existing post and category must remain byte-exact.
The predecessor release is ETag-bound, so competing writers cannot skip or
rewrite history. Use continuation for the 42-to-43 transition as well; normal
43+ publication may resume only after the current discovery contains 43 posts.

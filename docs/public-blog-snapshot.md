# Public blog snapshot dry-run

This command builds the public blog snapshot from an explicit trusted export:

```bash
npm run blog:snapshot:dry-run -- \
  --source /absolute/path/to/public-blog-source.json
```

The command is deliberately offline-only. It writes under
`.local/public-blog-snapshot-dry-run` by default and cannot upload to Blob,
query a database, lower the 43-post production floor, or set
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

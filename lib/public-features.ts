/**
 * Public columns are paused until the owner is ready to publish again.
 * Keep one build-time policy for the server, navigation and public feeds.
 * Re-enable with a reviewed code change and deployment, not by deleting content
 * or changing the independent admin/preview/publishing data paths.
 */
export function isPublicBlogEnabled(): boolean {
  return false;
}

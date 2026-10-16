# Shared storage across hosts

Cloudflare and Render use the same D1 database. Sites can use that database through
the server-only signed D1 transport exposed by the existing Render service.
The Sites native DB binding remains available as `LEGACY_DB`; it is never erased.
Browser API calls remain on their current origin. Each host keeps its own secure
email session cookie, while the verified email account and learning state live in
the common database.

## Configuration

- Render: `SHARED_D1_SECRET`, a random 32-byte hexadecimal signing secret.
- Sites: the same secret, `SHARED_D1_ENDPOINT` pointing to the Render HTTPS origin,
  and `SHARED_D1_MODE=preview` or `active`.
- Initial owner migration only: `SHARED_MIGRATION_OWNER_EMAIL` identifies the
  verified destination email. `EDITOR_EMAIL` must match the gateway-authenticated
  source owner. These values belong in runtime secrets, never source files.
- `SHARED_MIGRATION_APPLY=1` permits the reviewed merge. While preview mode and
  this switch are both enabled, legacy learning-state writes are paused.

The signed endpoint accepts only bounded prepared queries against the application
tables. Signatures cover the exact request, timestamp and nonce. Redirects and
replayed requests are rejected. It exposes neither a browser API key nor the
Cloudflare D1 token.

## Migration

1. Deploy the signed transport on Render. New recovery tables are created without
   modifying existing account rows.
2. Deploy Sites in preview mode. Its browser still uses the original database.
3. Call the authenticated owner's learning summary to preserve both snapshots and
   inspect the proposed merge. The destination must already be a verified email
   account; an unrelated visitor cannot claim the old owner data.
4. Apply after checking the preview. Writes use revision checks. Old snapshots
   remain in `sync_legacy_backups`, and the original Sites DB remains intact.
5. Set Sites to active mode. Its email login, learning records, lessons and word
   cards now use the same database as the other hosts. Trusted GPT identity is
   resolved through `sync_account_links` for account-scoped MCP reads.

Recovery adds absent records exactly as saved. It never replays answers or
invents learning events. Conflicting records retain the destination version and
are reported for review; the complete source version remains in the backup.
Do not delete recovery tables or rotate a signing secret on only one side.

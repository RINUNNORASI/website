import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// One canonical snapshot per trusted Sites account. Revisions protect concurrent edits.
export const learningState = sqliteTable('learning_state', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull(),
  payloadJson: text('payload_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Shared editorial content only: this table never stores users' answers or scores.
export const lessons = sqliteTable('lessons', {
  id: text('id').primaryKey(),
  learningDate: text('learning_date').notNull().unique(),
  payloadJson: text('payload_json').notNull(),
  createdAt: text('created_at').notNull(),
});

// Editorial word explanations are separate from all personal progress and mastery state.
export const wordCards = sqliteTable('word_cards', {
  word: text('word').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Provider identities are verified by Supabase; this mapping retains the learner's stable D1 owner.
export const authAccounts = sqliteTable('auth_accounts', {
  providerSubject: text('provider_subject').primaryKey(),
  userId: text('user_id').notNull().unique(),
  email: text('email').notNull(),
  legacyLinkDecided: integer('legacy_link_decided').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Cookies are hashed; encrypted provider credentials are authenticated to that exact hash.
export const authSessions = sqliteTable('auth_sessions', {
  sessionHash: text('session_hash').primaryKey(),
  providerSubject: text('provider_subject').notNull(),
  tokensCiphertext: text('tokens_ciphertext').notNull(),
  expiresAt: integer('expires_at').notNull(),
  providerExpiresAt: integer('provider_expires_at').notNull(),
  version: integer('version').notNull(),
  refreshLockUntil: integer('refresh_lock_until').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

// HMAC keys conceal the email/IP used by shared rate limits; counters precede external requests.
export const authRateLimits = sqliteTable('auth_rate_limits', {
  rateKey: text('rate_key').primaryKey(),
  windowStartedAt: integer('window_started_at').notNull(),
  attempts: integer('attempts').notNull(),
  blockedUntil: integer('blocked_until').notNull(),
});

// A short-lived browser-bound PKCE verifier is claimed once, before exchanging a magic link.
export const authPendingLogins = sqliteTable('auth_pending_logins', {
  loginHash: text('login_hash').primaryKey(),
  verifierCiphertext: text('verifier_ciphertext').notNull(),
  expectedEmail: text('expected_email').notNull(),
  expiresAt: integer('expires_at').notNull(),
  claimedAt: integer('claimed_at').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

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

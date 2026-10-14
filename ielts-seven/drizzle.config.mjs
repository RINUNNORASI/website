import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.mjs',
  out: './drizzle',
  dialect: 'sqlite',
});

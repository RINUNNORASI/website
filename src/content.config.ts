import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const notes = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    language: z.enum(['zh', 'en']),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    date: z.coerce.date(),
  }),
});

export const collections = { notes };

import { z } from 'zod';

// Jisho API types

export const JishoApiEntrySchema = z
  .object({
    slug: z.string(),
    senses: z.array(
      z
        .object({
          english_definitions: z.array(z.string()),
          parts_of_speech: z.array(z.string())
        })
        .nonstrict()
    ),
    japanese: z.array(
      z
        .object({
          word: z.string().optional(),
          reading: z.string().optional()
        })
        .nonstrict()
    ),
    is_common: z.boolean().optional()
  })
  .nonstrict();

export type JishoApiEntry = z.infer<typeof JishoApiEntrySchema>;

const JishoApiResponseSchema = z.object({
  data: z.array(JishoApiEntrySchema)
});

// Fetches a word from Jisho

export async function fetchWord(word: string): Promise<JishoApiEntry[]> {
  const response = await fetch(`https://jisho.org/api/v1/search/words?keyword=${word}`);
  const json = await response.json();

  const validation = JishoApiResponseSchema.parse(json);

  // TODO test error here
  return validation.data;
}

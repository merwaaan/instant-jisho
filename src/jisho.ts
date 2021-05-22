import { z } from 'zod';

// Results from the API

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

export const JishoApiResponseSchema = z.object({
  data: z.array(JishoApiEntrySchema)
});

export type JishoApiResponse = z.infer<typeof JishoApiResponseSchema>;

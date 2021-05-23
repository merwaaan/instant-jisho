import { fit, FuriganaMatch } from 'furigana';
import { toRomaji } from 'wanakana';
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

export async function fetchWord(word: string): Promise<JishoApiEntry | null> {
  const response = await fetch(`https://jisho.org/api/v1/search/words?keyword=${word}`);
  const json = await response.json();

  const validation = JishoApiResponseSchema.parse(json);

  // TODO test error here

  // Jisho returns multiple entries.
  // First, we look for the entry with the searched text (not necessarily the first one).
  // If not found, we fallback to the first entry if it exists.
  return validation.data.find((entry) => entry.slug === word) ?? validation.data[0] ?? null;
}

export function entryToRomaji(entry: JishoApiEntry): string | null {
  const kanas = entry.japanese[0]?.reading;
  return kanas ? toRomaji(kanas) : null;
}

export function entryToFurigana(entry: JishoApiEntry): FuriganaMatch[] {
  // Writing and reading provided: try to fit them into a furigana

  const rw = entry.japanese.find((j) => j.word !== undefined && j.reading !== undefined);

  if (rw) {
    const fitted = fit(rw.word!, rw.reading!, { type: 'object', kanaReading: false });
    if (fitted) {
      return fitted;
    }
  }

  // Not enough data, or fitting failed: return the slug as the writing, without decoration kanas

  return [{ w: entry.slug }];
}

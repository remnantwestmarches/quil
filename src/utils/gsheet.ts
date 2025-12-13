import axios from 'axios';
import { parse } from 'csv-parse/sync';
import type { SheetStory } from '../commands/library.js';

type RawStory = {
  title: string | undefined;
  genre: string | undefined;
  content: string | undefined;
};

function isValidStory(
  story: RawStory
): story is SheetStory {
  return (
    typeof story.title === 'string' &&
    typeof story.genre === 'string' &&
    typeof story.content === 'string'
  );
}

export async function fetchStoriesFromGoogleSheet(): Promise<SheetStory[]> {
    
    const LIBRARY_SHEET_ID = '1gIqy0R-jj3OdH3rtfSqjwrt5COdfRN-_pTVyVQOwsnI';
    const url = `https://docs.google.com/spreadsheets/d/${LIBRARY_SHEET_ID}/export?format=csv&gid=0`;

    const response = await axios.get<string>(url, {
    responseType: 'text',
    timeout: 10_000,
    validateStatus: status => status === 200,
    });

    // Basic sanity check: Google sometimes returns HTML error pages
    if (response.data.startsWith('<')) {
        throw new Error('Google Sheet returned non-CSV content');
    }

    const records = parse(response.data, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  return records
    .filter(row => row.length >= 3)
    .map(row => ({
      title: row[0]?.trim(),
      genre: row[1]?.trim(),
      content: row[2]?.trim(),
    }))
    .filter(isValidStory);
}
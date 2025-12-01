import axios from 'axios';
import { parse } from 'csv-parse/sync';

// --- Interfaces ---

interface LootItem {
  min: number;
  max: number;
  name: string;
}

interface LootTable {
  name: string;
  items: LootItem[];
  totalRange: number; // usually 100, but derived from data
}

// --- Constants ---

const SHEET_ID = '14abo_G31jrALQvm9Jy4WfcYFozfG9SknekJs7iJJTp0';
// We use the export endpoint to get raw CSV data
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

// --- Service Class ---

export class LootService {
  private tables: Map<string, LootTable> = new Map();
  private isLoaded: boolean = false;

  /**
   * Fetches and parses the Google Sheet.
   * Call this once during bot startup.
   */
  public async loadTables(): Promise<void> {
    try {
      const response = await axios.get(CSV_URL);
      const rows = parse(response.data, {
        skip_empty_lines: true,
        from_line: 1,
      }) as string[][];

      let currentTableName: string | null = null;
      let currentItems: LootItem[] = [];

      for (const row of rows) {
        // Ensure we only use Column A (index 0) and Column B (index 1)
        const colA = row[0]?.trim() || '';
        const colB = row[1]?.trim() || '';

        // Attempt to parse a dice range from Column A
        const range = this.parseRange(colA);

        if (range) {
          // Case 1: It is a valid item row
          if (currentTableName && colB) {
            currentItems.push({
              min: range.min,
              max: range.max,
              name: colB,
            });
          }
        } else {
          // Case 2: It is not a range. It might be a Table Header.
          // Heuristic: If A or B contains text but isn't a range, we treat it as a new table start.
          // We ignore empty rows or purely metadata rows based on the prompt instructions,
          // but we must detect headers to group items.
          
          const potentialName = colA;
          
          if (potentialName && potentialName.toLocaleLowerCase().includes("table")) {
            // Save the previous table if it existed
            if (currentTableName && currentItems.length > 0) {
              this.saveTable(currentTableName, currentItems);
            }

            // Start new table context
            // Normalize name for easier lookup (lowercase, trimmed)
            currentTableName = potentialName.toLowerCase();
            currentItems = [];
          }
        }
      }

      // Save the final table after loop ends
      if (currentTableName && currentItems.length > 0) {
        this.saveTable(currentTableName, currentItems);
      }

      this.isLoaded = true;
      console.log(`Loot tables loaded. Found ${this.tables.size} tables.`);

    } catch (error) {
      console.error('Failed to load loot tables:', error);
      throw error;
    }
  }

  /**
   * Helper to finalize a table and store it in the Map
   */
  private saveTable(name: string, items: LootItem[]) {
    // Calculate max range (e.g. if items go 1-100, max is 100)
    // We assume the table is sorted or we just find the mathematical max
    const maxRange = items.reduce((max, item) => (item.max > max ? item.max : max), 0);
    
    this.tables.set(name, {
      name,
      items,
      totalRange: maxRange
    });
  }

  /**
   * Parses string ranges like "1", "1-5", "01-05", "50-100"
   */
  private parseRange(input: string): { min: number, max: number } | null {
    // Regex matches "123" or "123-456" or "123 - 456" (handles hyphens and en-dashes)
    const match = input.match(/^(\d+)(?:[\s\-–]+(\d+))?$/);
    
    if (!match) return null;

    const min = parseInt(match[1] ?? "0", 10);
    // If second group exists, use it; otherwise it's a single number range (min == max)
    const max = match[2] ? parseInt(match[2], 10) : min;

    return { min, max };
  }

  /**
   * Main logic for the Slash Command
   */
  public processCommand(tableInput: string, type: string, rolls: number): string[] {
    if (!this.isLoaded) {
      throw new Error("Tables are not loaded yet.");
    }

    // Normalize inputs
    const normalizedTableKey = tableInput.toLowerCase().trim();
    const normalizedType = type.toLowerCase().trim();

    // 1. Find the table
    // We check for exact match or partial inclusion if exact fails
    let targetTable = this.tables.get(normalizedTableKey);
    
    if (!targetTable) {
      // Fallback: try to find a table that contains the input string (e.g. input "A" matches "Magic Item Table A")
      for (const [key, table] of this.tables.entries()) {
        if (key.includes(normalizedTableKey)) {
          targetTable = table;
          break;
        }
      }
    }

    if (!targetTable) {
      return [`Error: Could not find table matching "${tableInput}".`];
    }

    const results: string[] = [];

    // 2. Handle Logic based on Type
    // "On both types mission and gambling ... roll ... equal to the 'rolls' input"
    if (normalizedType === 'mission' || normalizedType === 'gambling') {
      
      for (let i = 0; i < rolls; i++) {
        // Generate random integer from 1 to maxRange
        const rollResult = Math.floor(Math.random() * targetTable.totalRange) + 1;
        
        // Find item matching the roll
        const item = targetTable.items.find(
          (it) => rollResult >= it.min && rollResult <= it.max
        );

        if (item) {
          results.push(item.name);
        } else {
          results.push(`Nothing (Roll: ${rollResult})`);
        }
      }

    } else if (normalizedType === 'purchase') {
      // Logic for purchase is not explicitly defined as a rolling action in the prompt.
      // Usually this implies listing items or checking availability.
      // Since the prompt allows stopping at generation and emphasizes rolling for the other types,
      // we return a status or empty list here.
      results.push("Purchase mode: No rolls performed."); 
    } else {
      results.push(`Error: Unknown type "${type}". Valid types: purchase, mission, gambling.`);
    }

    return results;
  }
}

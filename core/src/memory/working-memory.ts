import type { WorkingMemoryEntry } from "./types.js";

/**
 * Sliding in-process window for the current conversation.
 * Char budget is a coarse token proxy — kept conservative for small local models.
 */
const DEFAULT_MAX_TURNS = 20;
const DEFAULT_CHAR_BUDGET = 12_000;

export class WorkingMemory {
  private readonly entries: WorkingMemoryEntry[] = [];
  private readonly maxTurns: number;
  private readonly charBudget: number;

  constructor(opts?: { maxTurns?: number; charBudget?: number }) {
    this.maxTurns = opts?.maxTurns ?? DEFAULT_MAX_TURNS;
    this.charBudget = opts?.charBudget ?? DEFAULT_CHAR_BUDGET;
  }

  push(entry: WorkingMemoryEntry): void {
    this.entries.push(entry);
    this.trim();
  }

  getAll(): WorkingMemoryEntry[] {
    return [...this.entries];
  }

  /**
   * Returns entries that fit within the character budget, taking the most
   * recent turns first (tail-first slicing).
   */
  getWithinBudget(): WorkingMemoryEntry[] {
    let budget = this.charBudget;
    const result: WorkingMemoryEntry[] = [];

    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      const cost = entry.content.length + 20;
      if (budget - cost < 0) break;
      budget -= cost;
      result.unshift(entry);
    }

    return result;
  }

  get length(): number {
    return this.entries.length;
  }

  private trim(): void {
    while (this.entries.length > this.maxTurns) {
      this.entries.shift();
    }
  }
}

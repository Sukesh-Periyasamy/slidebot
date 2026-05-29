import type { TimingContext as ITimingContext } from './frameBudgetScheduler.types';

/**
 * Detects the best available high-resolution time source.
 * Prefers performance.now() for sub-millisecond precision,
 * falls back to Date.now() when unavailable (e.g., some worker contexts).
 */
function detectTimeSource(): () => number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return () => performance.now();
  }
  return () => Date.now();
}

/** Default time source, detected once at module load. */
const defaultGetNow = detectTimeSource();

/**
 * Lightweight timing helper passed through a render pass to track elapsed time
 * and provide budget-checking utilities.
 *
 * The start time is captured at construction, and elapsed() / isOverBudget()
 * are called throughout the render pass to enforce the frame budget.
 */
export class TimingContext implements ITimingContext {
  readonly startTime: number;
  readonly budgetMs: number;
  readonly forceComplete: boolean;

  private readonly getNow: () => number;

  /**
   * @param budgetMs - The frame budget in milliseconds.
   * @param forceComplete - When true, isOverBudget() always returns false (convergence guarantee).
   * @param getNow - Optional time source function for testability. Defaults to performance.now() or Date.now() fallback.
   */
  constructor(budgetMs: number, forceComplete: boolean = false, getNow?: () => number) {
    this.budgetMs = budgetMs;
    this.forceComplete = forceComplete;
    this.getNow = getNow ?? defaultGetNow;
    this.startTime = this.getNow();
  }

  /** Returns elapsed time since start in milliseconds. */
  elapsed(): number {
    return this.getNow() - this.startTime;
  }

  /**
   * Returns true if elapsed time exceeds the budget.
   * Always returns false when forceComplete is true (convergence guarantee —
   * ensures all remaining work completes regardless of budget).
   */
  isOverBudget(): boolean {
    if (this.forceComplete) {
      return false;
    }
    return this.elapsed() > this.budgetMs;
  }
}

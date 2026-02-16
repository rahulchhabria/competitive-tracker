/**
 * Utility for handling graceful cancellation of long-running processes
 */
export class CancellationToken {
  private cancelled = false;
  private listeners: (() => void)[] = [];

  /**
   * Check if cancellation has been requested
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Request cancellation
   */
  cancel(): void {
    if (!this.cancelled) {
      this.cancelled = true;
      // Notify all listeners
      this.listeners.forEach(listener => listener());
    }
  }

  /**
   * Register a callback to be called when cancellation is requested
   */
  onCancel(callback: () => void): void {
    this.listeners.push(callback);
  }

  /**
   * Throw an error if cancellation has been requested
   */
  throwIfCancelled(): void {
    if (this.cancelled) {
      throw new CancellationError();
    }
  }
}

/**
 * Error thrown when an operation is cancelled
 */
export class CancellationError extends Error {
  constructor() {
    super('Operation cancelled by user');
    this.name = 'CancellationError';
  }
}

/**
 * Setup signal handlers for graceful shutdown
 */
export function setupSignalHandlers(token: CancellationToken): void {
  const handler = () => {
    console.log('\n\n⚠️  Cancellation requested. Finishing current operation and cleaning up...');
    token.cancel();
  };

  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
}

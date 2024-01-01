export const E_CANCELED = new Error("request for lock canceled");

export interface SemaphoreInterface {
  acquire(weight?: number): Promise<[number, SemaphoreInterface.Releaser]>;

  runExclusive<T>(
    callback: SemaphoreInterface.Worker<T>,
    weight?: number,
  ): Promise<T>;

  waitForUnlock(weight?: number): Promise<void>;

  isLocked(): boolean;

  getValue(): number;

  setValue(value: number): void;

  release(weight?: number): void;

  cancel(): void;
}

export declare namespace SemaphoreInterface {
  interface Releaser {
    (): void;
  }

  interface Worker<T> {
    (value: number): Promise<T> | T;
  }
}

export interface QueueEntry {
  resolve(result: [number, SemaphoreInterface.Releaser]): void;
  reject(error: unknown): void;
}

export class Semaphore implements SemaphoreInterface {
  constructor(
    private _value: number,
    private _cancelError: Error = E_CANCELED,
  ) {}

  acquire(weight = 1): Promise<[number, SemaphoreInterface.Releaser]> {
    if (weight <= 0) {
      throw new Error(`invalid weight ${weight}: must be positive`);
    }

    return new Promise((resolve, reject) => {
      if (!this._weightedQueues[weight - 1]) {
        this._weightedQueues[weight - 1] = [];
      }
      this._weightedQueues[weight - 1].push({ resolve, reject });

      this._dispatch();
    });
  }

  async runExclusive<T>(
    callback: SemaphoreInterface.Worker<T>,
    weight = 1,
  ): Promise<T> {
    const [value, release] = await this.acquire(weight);

    try {
      return await callback(value);
    } finally {
      release();
    }
  }

  waitForUnlock(weight = 1): Promise<void> {
    if (weight <= 0) {
      throw new Error(`invalid weight ${weight}: must be positive`);
    }

    return new Promise((resolve) => {
      if (!this._weightedWaiters[weight - 1]) {
        this._weightedWaiters[weight - 1] = [];
      }
      this._weightedWaiters[weight - 1].push(resolve);

      this._dispatch();
    });
  }

  isLocked(): boolean {
    return this._value <= 0;
  }

  getValue(): number {
    return this._value;
  }

  setValue(value: number): void {
    this._value = value;
    this._dispatch();
  }

  release(weight = 1): void {
    if (weight <= 0) {
      throw new Error(`invalid weight ${weight}: must be positive`);
    }

    this._value += weight;
    this._dispatch();
  }

  cancel(): void {
    this._weightedQueues.forEach((queue) =>
      queue.forEach((entry) => entry.reject(this._cancelError))
    );
    this._weightedQueues = [];
  }

  private _dispatch(): void {
    for (let weight = this._value; weight > 0; weight--) {
      const queueEntry = this._weightedQueues[weight - 1]?.shift();
      if (!queueEntry) continue;

      const previousValue = this._value;
      const previousWeight = weight;

      this._value -= weight;
      weight = this._value + 1;

      queueEntry.resolve([previousValue, this._newReleaser(previousWeight)]);
    }

    this._drainUnlockWaiters();
  }

  private _newReleaser(weight: number): () => void {
    let called = false;

    return () => {
      if (called) return;
      called = true;

      this.release(weight);
    };
  }

  private _drainUnlockWaiters(): void {
    for (let weight = this._value; weight > 0; weight--) {
      if (!this._weightedWaiters[weight - 1]) continue;

      this._weightedWaiters[weight - 1].forEach((waiter) => waiter());
      this._weightedWaiters[weight - 1] = [];
    }
  }

  private _weightedQueues: Array<Array<QueueEntry>> = [];
  private _weightedWaiters: Array<Array<() => void>> = [];
}

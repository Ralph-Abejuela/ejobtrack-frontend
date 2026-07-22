// ── Gmail 429 rate-limit retry queue ─────────────────────────────────────
// Persisted in localStorage. Message-level granularity — only getMessage()
// failures go in here. The retry loop runs in a separate hook.

const QUEUE_KEY = "gmail_retry_queue";
const BATCH_COOLDOWN_KEY = "gmail_batch_last_ms";
const COOLDOWN_MS = 120_000; // 2 minutes

/** Backoff intervals by retry index (0-based). */
const BACKOFF_MS = [30_000, 120_000, 600_000]; // 30s, 2min, 10min
const EXTENDED_BACKOFF_MS = 1_800_000; // 30min after 3+ retries

export interface RetryEntry {
	/** Gmail message ID */
	emailId: string;
	/** ISO timestamp of next allowed retry */
	nextAttempt: string;
	/** How many times we've retried so far (starts at 1) */
	retryCount: number;
	/** When this entry was first created (epoch ms) */
	createdAt: number;
	/** Last error message (for debugging) */
	lastError: string;
}

// ── Queue read / write ────────────────────────────────────────────────────

function readQueue(): RetryEntry[] {
	try {
		const raw = localStorage.getItem(QUEUE_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		console.warn("[retry-queue] Failed to read queue");
		return [];
	}
}

function writeQueue(entries: RetryEntry[]): void {
	try {
		localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
	} catch {
		console.warn("[retry-queue] Failed to write queue");
	}
}

// ── Public API ────────────────────────────────────────────────────────────

/** Add a rate-limited email to the retry queue. No-op if already queued. */
export function enqueue(emailId: string, error: string): void {
	const entries = readQueue();
	if (entries.some((e) => e.emailId === emailId)) return;

	const now = Date.now();
	entries.push({
		emailId,
		nextAttempt: new Date(now + BACKOFF_MS[0]).toISOString(),
		retryCount: 1,
		createdAt: now,
		lastError: error,
	});
	writeQueue(entries);
}

/** Get entries whose nextAttempt has passed, sorted soonest-first. */
export function getPendingEntries(): RetryEntry[] {
	const now = Date.now();
	return readQueue()
		.filter((e) => new Date(e.nextAttempt).getTime() <= now)
		.sort(
			(a, b) =>
				new Date(a.nextAttempt).getTime() - new Date(b.nextAttempt).getTime(),
		);
}

/** Remove an entry from the queue (success or non-retriable error). */
export function removeEntry(emailId: string): void {
	const entries = readQueue().filter((e) => e.emailId !== emailId);
	writeQueue(entries);
}

/**
 * Increment retry count and recalculate nextAttempt with backoff.
 * After 3 retries, escalates to 30min intervals indefinitely.
 */
export function bumpRetry(emailId: string, error: string): void {
	const entries = readQueue();
	const idx = entries.findIndex((e) => e.emailId === emailId);
	if (idx === -1) {
		console.warn("[retry-queue] bumpRetry: entry not found:", emailId);
		return;
	}

	const entry = entries[idx];
	const nextRetry = entry.retryCount + 1;
	const delayMs =
		nextRetry - 1 < BACKOFF_MS.length
			? BACKOFF_MS[nextRetry - 1]
			: EXTENDED_BACKOFF_MS;

	entries[idx] = {
		...entry,
		retryCount: nextRetry,
		nextAttempt: new Date(Date.now() + delayMs).toISOString(),
		lastError: error,
	};
	writeQueue(entries);
}

/** Total entries in the queue. */
export function getQueueSize(): number {
	return readQueue().length;
}

/** Clear all pending retries (used on sign-out). */
export function clearQueue(): void {
	localStorage.removeItem(QUEUE_KEY);
}

// ── Batch cooldown tracking ──────────────────────────────────────────────
// Prevents retry loop from running right after a main poller batch, which
// would double-dip into Gmail rate limits.

/** Record that a main poller batch just finished. */
export function markBatchCompleted(): void {
	localStorage.setItem(BATCH_COOLDOWN_KEY, String(Date.now()));
}

/** Check if we're still in the cooldown window after a batch. */
export function isInCooldown(): boolean {
	const lastBatch = Number(localStorage.getItem(BATCH_COOLDOWN_KEY) ?? "0");
	return Date.now() - lastBatch < COOLDOWN_MS;
}

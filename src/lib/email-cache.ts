import Dexie, { type EntityTable } from "dexie";
import type { ParsedEmail } from "./gmail";

export interface EmailRecord extends ParsedEmail {
	/** Primary key — same as message id */
	id: string;
	/** The Google account email that fetched this message */
	userEmail: string;
	/** Cached at timestamp (epoch ms) */
	cachedAt: number;
}

const DB_NAME = "ejobtrack";
const MAX_EMAILS_PER_USER = 10_000;

function syncKey(userEmail: string): string {
	return `email_last_sync_ms_${userEmail}`;
}

const db = new Dexie(DB_NAME) as Dexie & {
	emails: EntityTable<EmailRecord, "id">;
};

// Schema version 2 — added userEmail for per-account isolation
db.version(2).stores({
	emails: "id, internalDate, cachedAt, userEmail, [userEmail+internalDate]",
});

// ── Cache operations ──────────────────────────────────────────────────────

/** Insert or update emails in cache for a specific user, then evict oldest if over limit. */
export async function storeEmails(
	userEmail: string,
	emails: ParsedEmail[],
): Promise<void> {
	const now = Date.now();
	const records: EmailRecord[] = emails.map((e) => ({
		...e,
		userEmail,
		cachedAt: now,
	}));

	await db.transaction("rw", db.emails, async () => {
		for (const rec of records) {
			await db.emails.put(rec);
		}

		// Evict oldest for THIS user if over MAX_EMAILS_PER_USER
		const count = await db.emails.where({ userEmail }).count();
		if (count > MAX_EMAILS_PER_USER) {
			const excess = count - MAX_EMAILS_PER_USER;
			const toDelete = await db.emails
				.where({ userEmail })
				.sortBy("internalDate") // oldest first
				.then((sorted) => sorted.slice(0, excess))
				.then((records) => records.map((r) => r.id));

			if (toDelete.length > 0) {
				await db.emails.bulkDelete(toDelete);
			}
		}
	});
}

/** Get first page of cached emails (newest first). Used for initial load. */
export async function getCachedEmails(
	userEmail: string,
	page: number,
	pageSize: number,
): Promise<{ emails: EmailRecord[]; total: number }> {
	const total = await db.emails.where({ userEmail }).count();
	const emails = await db.emails
		.where("[userEmail+internalDate]")
		.between([userEmail, ""], [userEmail, "\uffff"])
		.reverse()
		.offset((page - 1) * pageSize)
		.limit(pageSize)
		.toArray();

	return { emails, total };
}

/**
 * Load next batch from cache using raw offset (how many already loaded).
 * Returns partial batch (< limit) when cache doesn't have that many.
 */
export async function loadNextBatch(
	userEmail: string,
	alreadyLoaded: number,
	limit: number,
): Promise<EmailRecord[]> {
	return await db.emails
		.where("[userEmail+internalDate]")
		.between([userEmail, ""], [userEmail, "\uffff"])
		.reverse()
		.offset(alreadyLoaded)
		.limit(limit)
		.toArray();
}

/** Get total cached email count for user. */
export async function countCached(userEmail: string): Promise<number> {
	return db.emails.where({ userEmail }).count();
}

/** Check if a specific email id exists in cache for the given user. */
export async function hasCachedEmail(
	userEmail: string,
	id: string,
): Promise<boolean> {
	const record = await db.emails.get(id);
	return !!record && record.userEmail === userEmail;
}

/** Update just the body fields on a cached email (lazy load). */
export async function updateEmailBody(
	id: string,
	body: string,
	bodyHtml: string,
	bodyType: "text/plain" | "text/html" | "unknown",
	bodyClean?: string,
): Promise<void> {
	await db.emails.update(id, {
		body,
		bodyHtml,
		bodyClean: bodyClean || undefined,
		bodyType,
	});
}

/** Clear cached emails for a specific user. */
export async function clearUserCache(userEmail: string): Promise<void> {
	await db.emails.where({ userEmail }).delete();
	localStorage.removeItem(syncKey(userEmail));
}

// ── Sync timestamp (per-user) ─────────────────────────────────────────────

export function getLastSyncTime(userEmail: string): number {
	const val = localStorage.getItem(syncKey(userEmail));
	return val ? Number(val) : 0;
}

export function setLastSyncTime(userEmail: string, ms?: number): void {
	localStorage.setItem(syncKey(userEmail), String(ms ?? Date.now()));
}

export function shouldRefresh(userEmail: string, hours = 1): boolean {
	const last = getLastSyncTime(userEmail);
	if (last === 0) return true;
	return Date.now() - last > hours * 60 * 60 * 1000;
}

export { db };

import Dexie, { type EntityTable } from "dexie";

// ── Types ──────────────────────────────────────────────────────────────────

export interface JobCrawlState {
	/** Primary key = userEmail */
	userEmail: string;
	/** Newest email internalDate seen (epoch ms) */
	newestTs: number | null;
	/** Oldest email internalDate seen (epoch ms) */
	oldestTs: number | null;
	/** Total unique jobs found across all cycles */
	totalJobs: number;
	/** When this cycle began (epoch ms) */
	cycleStartedAt: number;
	/** Emails scanned in the current cycle */
	cycleScanned: number;
}

export interface JobScannedEmail {
	/** Primary key = Gmail message id */
	id: string;
	userEmail: string;
}

const db = new Dexie("ejobtrack_job_crawl") as Dexie & {
	state: EntityTable<JobCrawlState, "userEmail">;
	scanned: EntityTable<JobScannedEmail, "id">;
};

db.version(1).stores({
	state: "userEmail",
	scanned: "id, userEmail",
});

export { db };

// ── Crawl state ops ───────────────────────────────────────────────────────

export async function getCrawlState(
	userEmail: string,
): Promise<JobCrawlState | undefined> {
	return db.state.get(userEmail);
}

export async function initCrawlCycle(userEmail: string): Promise<void> {
	const existing = await db.state.get(userEmail);
	await db.state.put({
		userEmail,
		newestTs: existing?.newestTs ?? null,
		oldestTs: existing?.oldestTs ?? null,
		totalJobs: existing?.totalJobs ?? 0,
		cycleStartedAt: Date.now(),
		cycleScanned: 0,
	});
}

export async function updateCrawlBoundaries(
	userEmail: string,
	newestTs: number,
	oldestTs: number,
): Promise<void> {
	const state = await db.state.get(userEmail);
	if (!state) return;

	await db.state.put({
		...state,
		newestTs:
			state.newestTs != null ? Math.max(state.newestTs, newestTs) : newestTs,
		oldestTs:
			state.oldestTs != null ? Math.min(state.oldestTs, oldestTs) : oldestTs,
	});
}

export async function incrementCycleScanned(
	userEmail: string,
	count: number,
): Promise<number> {
	const state = await db.state.get(userEmail);
	if (!state) return 0;

	const newTotal = state.cycleScanned + count;
	await db.state.put({ ...state, cycleScanned: newTotal });
	return newTotal;
}

export async function incrementTotalJobs(
	userEmail: string,
	count: number,
): Promise<number> {
	const state = await db.state.get(userEmail);
	if (!state) return 0;

	const newTotal = state.totalJobs + count;
	await db.state.put({ ...state, totalJobs: newTotal });
	return newTotal;
}

/** Total jobs found across all cycles. */
export async function getTotalJobs(userEmail: string): Promise<number> {
	const state = await db.state.get(userEmail);
	return state?.totalJobs ?? 0;
}

// ── Scanned email dedup ────────────────────────────────────────────────────

export async function markScanned(
	userEmail: string,
	ids: string[],
): Promise<void> {
	await db.transaction("rw", db.scanned, async () => {
		for (const id of ids) {
			await db.scanned.put({ id, userEmail });
		}
	});
}

export async function isScanned(id: string): Promise<boolean> {
	return !!(await db.scanned.get(id));
}

export async function getScannedCount(userEmail: string): Promise<number> {
	return db.scanned.where({ userEmail }).count();
}

// ── Reset ─────────────────────────────────────────────────────────────────

export async function resetJobCrawl(userEmail: string): Promise<void> {
	await db.state.delete(userEmail);
	await db.scanned.where({ userEmail }).delete();
}

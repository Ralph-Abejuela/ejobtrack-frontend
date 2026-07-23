import Dexie, { type EntityTable } from "dexie";
import { JobStatus, type JobApplication } from "@/lib/jobs/types";

interface DupIndexEntry {
	/** Primary key: `${userEmail}:${normalizedTitle}` */
	title: string;
	userEmail: string;
	jobIds: string[];
}

const db = new Dexie("ejobtrack_jobs") as Dexie & {
	jobs: EntityTable<JobApplication, "id">;
	dupIndex: EntityTable<DupIndexEntry, "title">;
};

db.version(1).stores({
	// id = `${userEmail}:${platform}:${normalisedCompany}:${normalisedJobTitle}`
	jobs: "id, userEmail, platform, status, company, jobTitle, date, createdAt, updatedAt, [platform+status], [userEmail+status]",
});

db.version(3).stores({
	jobs: "id, userEmail, platform, status, company, jobTitle, date, createdAt, updatedAt, [platform+status], [userEmail+status], [userEmail+deleted]",
	dupIndex: "&title",
});

db.version(4)
	.stores({
		jobs: "id, userEmail, platform, status, company, jobTitle, date, createdAt, updatedAt, [platform+status], [userEmail+status], [userEmail+deleted]",
		dupIndex: "&title, userEmail",
	})
	.upgrade(async (tx) => {
		// Old dupIndex has bare titles without userEmail prefix — clear, will rebuild
		await tx.table("dupIndex").clear();
	});

export { db };

// ── CRUD operations (ALL scoped by userEmail) ─────────────────────────────

export async function storeJob(job: JobApplication): Promise<void> {
	await db.jobs.put(job);
}

export async function getAllJobs(userEmail: string): Promise<JobApplication[]> {
	return db.jobs.where({ userEmail }).reverse().sortBy("date");
}

export async function getJobsByStatus(
	userEmail: string,
	status: JobStatus,
): Promise<JobApplication[]> {
	return db.jobs
		.where("[userEmail+status]")
		.equals([userEmail, status])
		.reverse()
		.sortBy("date");
}

export async function getJobsByPlatform(
	userEmail: string,
	platform: string,
): Promise<JobApplication[]> {
	return db.jobs.where({ userEmail, platform }).reverse().sortBy("date");
}

export async function getJob(id: string): Promise<JobApplication | undefined> {
	return db.jobs.get(id);
}

export async function updateJobStatus(
	id: string,
	status: JobStatus,
	change: { date: string; emailId: string },
): Promise<void> {
	const job = await db.jobs.get(id);
	if (!job) return;

	job.status = status;
	job.updatedAt = Date.now();
	job.history = [
		...job.history,
		{ status, date: change.date, emailId: change.emailId },
	];

	// Update sort date to reflect latest change (email or manual)
	job.date = change.date;

	await db.jobs.put(job);
}

export async function deleteHistoryEntry(
	id: string,
	index: number,
): Promise<void> {
	const job = await db.jobs.get(id);
	if (!job) return;

	const removed = job.history[index];
	job.history = job.history.filter((_, i) => i !== index);

	// Revert job.status + date to the last remaining history entry, or UNKNOWN
	if (removed && job.history.length > 0) {
		const last = job.history[job.history.length - 1];
		job.status = last.status as JobStatus;
		job.date = last.date;
	} else if (job.history.length === 0) {
		job.status = JobStatus.UNKNOWN;
		job.date = new Date(0).toISOString();
	}

	job.updatedAt = Date.now();
	await db.jobs.put(job);
}

export async function deleteJob(userEmail: string, id: string): Promise<void> {
	const job = await db.jobs.get(id);
	if (!job || job.userEmail !== userEmail) return;
	await db.jobs.delete(id);
}

/** Soft-delete a job: mark as deleted and remove from duplicate index. */
export async function softDeleteJob(
	userEmail: string,
	id: string,
): Promise<boolean> {
	const job = await db.jobs.get(id);
	if (!job || job.userEmail !== userEmail) return false;

	await db.transaction("rw", db.jobs, async () => {
		await db.jobs.put({ ...job, deleted: true, updatedAt: Date.now() });
	});
	// Remove from duplicate index
	await removeFromDuplicateIndex(userEmail, job.id, job.jobTitle);

	return true;
}

/** Update a job's title. */
export async function updateJobTitle(
	userEmail: string,
	id: string,
	newTitle: string,
): Promise<boolean> {
	const job = await db.jobs.get(id);
	if (!job || job.userEmail !== userEmail) return false;

	const oldTitle = job.jobTitle;

	await db.transaction("rw", db.jobs, async () => {
		await db.jobs.put({ ...job, jobTitle: newTitle, updatedAt: Date.now() });
	});
	// Move in duplicate index
	await moveInDuplicateIndex(userEmail, job.id, oldTitle, newTitle);

	return true;
}

export async function getStatusCounts(
	userEmail: string,
): Promise<Record<string, number>> {
	const jobs = await db.jobs.where({ userEmail }).toArray();
	const counts: Record<string, number> = {};
	for (const j of jobs) {
		counts[j.status] = (counts[j.status] ?? 0) + 1;
	}
	return counts;
}

/** Get soft-deleted jobs sorted by deletion time (descending). */
export async function getDeletedJobs(
	userEmail: string,
): Promise<JobApplication[]> {
	const all = await db.jobs.where({ userEmail, deleted: true }).toArray();
	return all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/** Restore a soft-deleted job, removing the deleted flag. */
export async function restoreDeletedJob(
	userEmail: string,
	id: string,
): Promise<boolean> {
	const job = await db.jobs.get(id);
	if (!job || job.userEmail !== userEmail || !job.deleted) return false;

	await db.transaction("rw", db.jobs, async () => {
		const restored: JobApplication = {
			...job,
			deleted: false,
			updatedAt: Date.now(),
		};
		await db.jobs.put(restored);
	});
	// Re-add to duplicate index
	await addToDuplicateIndex(userEmail, { id: job.id, jobTitle: job.jobTitle });

	return true;
}

export async function clearUserJobs(userEmail: string): Promise<void> {
	await db.jobs.where({ userEmail }).delete();
}

// ── Merge / Dedup ──────────────────────────────────────────────────────────

// ── Resolution history / Undo ──────────────────────────────────────────

function resolutionKey(email: string): string {
	return `resolution_history_${email}`;
}
function removedPrefix(email: string): string {
	return `removed_job_${email}_`;
}
const MAX_RESOLUTIONS = 20;

export interface ResolutionEntry {
	groupKey: string;
	action: "merge" | "ignore" | "merge-undo" | "ignore-undo";
	timestamp: number;
	keepId?: string;
	removeId?: string;
}

function getResolutions(userEmail: string): ResolutionEntry[] {
	try {
		const raw = localStorage.getItem(resolutionKey(userEmail));
		return raw ? JSON.parse(raw) : [];
	} catch {
		console.warn("[jobs-db] Failed to read resolutions");
		return [];
	}
}

function saveResolution(userEmail: string, entry: ResolutionEntry): void {
	const all = getResolutions(userEmail);
	all.unshift(entry);
	// Cap at MAX_RESOLUTIONS
	if (all.length > MAX_RESOLUTIONS) {
		const removed = all.splice(MAX_RESOLUTIONS);
		// Clean up old snapshot data
		for (const r of removed) {
			if (r.action === "merge") {
				localStorage.removeItem(`${removedPrefix(userEmail)}${r.timestamp}`);
			}
		}
	}
	localStorage.setItem(resolutionKey(userEmail), JSON.stringify(all));
}

function clearResolutionSnapshots(userEmail: string): void {
	const all = getResolutions(userEmail);
	for (const r of all) {
		if (r.action === "merge" || r.action === "merge-undo") {
			localStorage.removeItem(`${removedPrefix(userEmail)}${r.timestamp}`);
		}
	}
	localStorage.removeItem(resolutionKey(userEmail));
}

/** Get past resolution actions for the user. */
export function getResolutionHistory(userEmail: string): ResolutionEntry[] {
	return getResolutions(userEmail);
}

/** Dismiss all resolution history. */
export function clearResolutionHistory(userEmail: string): void {
	clearResolutionSnapshots(userEmail);
}

/** Dismissal map: groupKey → job count at time of dismissal. */
export interface DismissalMap {
	[groupKey: string]: number;
}

/** Remove a group from the dismissed set (undo ignore). */
export function unIgnoreGroup(groupKey: string): void {
	try {
		const raw = localStorage.getItem("dismissed_dup_groups");
		if (!raw) return;
		const parsed = JSON.parse(raw);
		const map = Array.isArray(parsed)
			? Object.fromEntries(parsed.map((k: string) => [k, -1]))
			: parsed;
		delete map[groupKey];
		localStorage.setItem("dismissed_dup_groups", JSON.stringify(map));
	} catch {
		console.warn("[jobs-db] Failed to un-ignore group");
	}
}

/**
 * Check if a group was dismissed with fewer jobs than it has now.
 * Returns the updated DismissalMap if auto-un-ignore should happen.
 * Does NOT touch localStorage — caller manages persistence.
 */
export function pruneStaleDismissals(
	map: DismissalMap,
	groups: { groupKey: string; count: number }[],
): DismissalMap {
	let changed = false;
	for (const g of groups) {
		if (map[g.groupKey] !== undefined && map[g.groupKey] < g.count) {
			delete map[g.groupKey];
			changed = true;
		}
	}
	return changed ? { ...map } : map;
}

/** Group of records that are likely the same job with slightly different names. */
export interface DuplicateGroup {
	groupKey: string; // `${platform}:${normalizedTitle}`
	canonicalCompany: string; // longest company name in the group
	jobs: JobApplication[];
}

// ── Duplicate index (incremental hash) ─────────────────────────────────────

/** Normalize a string for hash key. */
function normalizeTitle(title: string): string {
	return title.toLowerCase().replace(/\s+/g, " ");
}

/** Build the entire dupIndex from scratch for a user. */
export async function buildDuplicateIndex(userEmail: string): Promise<void> {
	const jobs = await db.jobs.where({ userEmail }).toArray();

	const groups = new Map<string, string[]>();
	for (const j of jobs) {
		const key = normalizeTitle(j.jobTitle);
		const arr = groups.get(key) ?? [];
		arr.push(j.id);
		groups.set(key, arr);
	}

	// Only delete entries for this user (key prefixed with userEmail)
	await db.dupIndex.where({ userEmail }).delete();
	for (const [title, jobIds] of groups) {
		const scopedTitle = `${userEmail}:${title}`;
		await db.dupIndex.put({ title: scopedTitle, userEmail, jobIds });
	}
}

/** Check if dupIndex has data for this user — if not, build it. */
export async function ensureDuplicateIndex(userEmail: string): Promise<void> {
	const count = await db.dupIndex.where({ userEmail }).count();
	if (count === 0) {
		await buildDuplicateIndex(userEmail);
	}
}

/** Add (or update) a job's entry in the dupIndex. */
export async function addToDuplicateIndex(
	userEmail: string,
	job: { id: string; jobTitle: string },
): Promise<void> {
	const title = `${userEmail}:${normalizeTitle(job.jobTitle)}`;
	const existing = await db.dupIndex.get(title);
	if (existing) {
		if (!existing.jobIds.includes(job.id)) {
			existing.jobIds.push(job.id);
			await db.dupIndex.put(existing);
		}
	} else {
		await db.dupIndex.put({ title, userEmail, jobIds: [job.id] });
	}
}

/** Remove a job id from the dupIndex, cleaning up empty entries. */
export async function removeFromDuplicateIndex(
	userEmail: string,
	jobId: string,
	jobTitle: string,
): Promise<void> {
	const title = `${userEmail}:${normalizeTitle(jobTitle)}`;
	const existing = await db.dupIndex.get(title);
	if (!existing) return;
	existing.jobIds = existing.jobIds.filter((id) => id !== jobId);
	if (existing.jobIds.length === 0) {
		await db.dupIndex.delete(title);
	} else {
		await db.dupIndex.put(existing);
	}
}

/** Move a job from one title group to another (e.g. after edit). */
export async function moveInDuplicateIndex(
	userEmail: string,
	jobId: string,
	oldTitle: string,
	newTitle: string,
): Promise<void> {
	if (normalizeTitle(oldTitle) === normalizeTitle(newTitle)) return;
	await removeFromDuplicateIndex(userEmail, jobId, oldTitle);
	await addToDuplicateIndex(userEmail, { id: jobId, jobTitle: newTitle });
}

/**
 * Get all duplicate groups using the incremental index.
 * Only fetches full job data for groups with ≥2 entries.
 */
export async function getDuplicateGroups(
	userEmail: string,
): Promise<DuplicateGroup[]> {
	const entries = await db.dupIndex.where({ userEmail }).toArray();
	const groups = entries.filter((e) => e.jobIds.length >= 2);

	const allIds = groups.flatMap((g) => g.jobIds);
	if (allIds.length === 0) return [];

	const jobs = await db.jobs.where("id").anyOf(allIds).toArray();
	const jobMap = new Map(jobs.map((j) => [j.id, j]));

	const result: DuplicateGroup[] = [];
	for (const group of groups) {
		const groupJobs = group.jobIds
			.map((id) => jobMap.get(id))
			.filter((j): j is JobApplication => !!j);

		if (groupJobs.length < 2) continue;
		groupJobs.sort((a, b) => b.company.length - a.company.length);
		result.push({
			groupKey: group.title,
			canonicalCompany: groupJobs[0].company,
			jobs: groupJobs,
		});
	}

	return result;
}

/**
 * Merge two job records: transfer history from removeId into keepId, then delete removeId.
 * The kept record keeps its id, company, and latest status.
 * Saves snapshots to localStorage for undo support.
 */
export async function mergeJobs(
	userEmail: string,
	keepId: string,
	removeId: string,
): Promise<{
	keepId: string;
	removeId: string;
	groupKey: string;
} | null> {
	const keep = await db.jobs.get(keepId);
	const remove = await db.jobs.get(removeId);

	if (!keep || !remove) return null;
	if (keep.userEmail !== userEmail || remove.userEmail !== userEmail)
		return null;

	const groupKey = `${remove.platform}:${remove.jobTitle.toLowerCase().replace(/\s+/g, " ")}`;

	// Snapshot both records before mutating
	const keepSnapshot = { ...keep };
	const removeSnapshot = { ...remove };

	// Merge history: all from remove + existing from keep, sorted by date
	const merged = [...remove.history, ...keep.history].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);

	// Keep the latest date/status/emailId from whichever is newer
	const keepDate = new Date(keep.date).getTime();
	const removeDate = new Date(remove.date).getTime();

	await db.transaction("rw", db.jobs, async () => {
		await db.jobs.put({
			...keep,
			history: merged,
			date: keepDate >= removeDate ? keep.date : remove.date,
			emailId: keepDate >= removeDate ? keep.emailId : remove.emailId,
			updatedAt: Date.now(),
		});
		await db.jobs.delete(removeId);
	});

	// Update duplicate index
	await removeFromDuplicateIndex(userEmail, removeId, remove.jobTitle);
	await addToDuplicateIndex(userEmail, { id: keepId, jobTitle: keep.jobTitle });

	const entry: ResolutionEntry = {
		groupKey,
		action: "merge",
		timestamp: Date.now(),
		keepId,
		removeId,
	};
	// Store snapshots so we can undo
	try {
		localStorage.setItem(
			`${removedPrefix(userEmail)}${entry.timestamp}`,
			JSON.stringify({ keepSnapshot, removeSnapshot }),
		);
	} catch {
		console.warn("[jobs-db] localStorage full, undo snapshots not saved");
	}
	saveResolution(userEmail, entry);

	return { keepId, removeId, groupKey };
}

/**
 * Merge multiple jobs into one. If newCompany/newTitle are provided, the
 * kept record gets those values; otherwise the longest company name and
 * the existing jobTitle are used. All selected jobs' history is consolidated.
 */
export async function mergeIntoNew(
	userEmail: string,
	jobIds: string[],
	newCompany?: string,
	newTitle?: string,
): Promise<boolean> {
	if (jobIds.length < 2) return false;

	const records = await Promise.all(jobIds.map((id) => db.jobs.get(id)));
	const valid = records.filter(
		(r): r is JobApplication => r !== undefined && r.userEmail === userEmail,
	);
	if (valid.length < 2) return false;

	// Pick keep: longest company name, or first if equal
	valid.sort((a, b) => b.company.length - a.company.length);
	const keep = valid[0];
	const toRemove = valid.slice(1);

	// Snapshot all records before mutating
	const keepSnapshot = { ...keep };
	const removeSnapshots = toRemove.map((r) => ({ ...r }));

	// Merge history from all, sorted by date
	const merged = toRemove
		.flatMap((r) => r.history)
		.concat(keep.history)
		.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

	// Keep the latest date/status/emailId
	const allDates = valid.map((r) => ({
		date: r.date,
		emailId: r.emailId,
		status: r.status,
		ts: new Date(r.date).getTime(),
	}));
	allDates.sort((a, b) => b.ts - a.ts);
	const latest = allDates[0];

	await db.transaction("rw", db.jobs, async () => {
		await db.jobs.put({
			...keep,
			company: newCompany ?? keep.company,
			jobTitle: newTitle ?? keep.jobTitle,
			history: merged,
			date: latest.date,
			emailId: latest.emailId,
			status: latest.status,
			updatedAt: Date.now(),
		});
		for (const r of toRemove) {
			await db.jobs.delete(r.id);
		}
	});

	// Update duplicate index
	for (const r of toRemove) {
		await removeFromDuplicateIndex(userEmail, r.id, r.jobTitle);
	}
	await addToDuplicateIndex(userEmail, {
		id: keep.id,
		jobTitle: newTitle ?? keep.jobTitle,
	});

	const groupKey = (newTitle ?? keep.jobTitle)
		.toLowerCase()
		.replace(/\s+/g, " ");
	const entry: ResolutionEntry = {
		groupKey,
		action: "merge",
		timestamp: Date.now(),
		keepId: keep.id,
		removeId: toRemove.map((r) => r.id).join(","),
	};
	// Store snapshots so undo can restore
	try {
		localStorage.setItem(
			`${removedPrefix(userEmail)}${entry.timestamp}`,
			JSON.stringify({
				keepSnapshot,
				removeSnapshot: removeSnapshots,
			}),
		);
	} catch {
		console.warn("[jobs-db] localStorage full, undo snapshots not saved");
	}
	saveResolution(userEmail, entry);

	return true;
}

/**
 * Undo a previous merge: restore the removed record and revert the kept record
 * to its pre-merge state.
 */
export async function undoMerge(
	userEmail: string,
	timestamp: number,
): Promise<boolean> {
	const all = getResolutions(userEmail);
	const entry = all.find(
		(r) => r.timestamp === timestamp && r.action === "merge",
	);
	if (!entry || !entry.keepId || !entry.removeId) return false;

	// Retrieve snapshots
	try {
		const raw = localStorage.getItem(`${removedPrefix(userEmail)}${timestamp}`);
		if (!raw) return false;
		const { keepSnapshot, removeSnapshot } = JSON.parse(raw);

		await db.transaction("rw", db.jobs, async () => {
			// Revert keep to pre-merge state
			await db.jobs.put(keepSnapshot);
			// Restore removed record(s) — array or single
			if (Array.isArray(removeSnapshot)) {
				for (const rec of removeSnapshot) {
					await db.jobs.put(rec);
				}
			} else {
				await db.jobs.put(removeSnapshot);
			}
		});

		// Rebuild duplicate index — safest after undo (titles/IDs may differ)
		const keepUserEmail = keepSnapshot.userEmail ?? userEmail;
		await addToDuplicateIndex(keepUserEmail, {
			id: keepSnapshot.id,
			jobTitle: keepSnapshot.jobTitle,
		});
		if (Array.isArray(removeSnapshot)) {
			for (const rec of removeSnapshot) {
				await addToDuplicateIndex(rec.userEmail ?? userEmail, {
					id: rec.id,
					jobTitle: rec.jobTitle,
				});
			}
		} else {
			await addToDuplicateIndex(removeSnapshot.userEmail ?? userEmail, {
				id: removeSnapshot.id,
				jobTitle: removeSnapshot.jobTitle,
			});
		}

		// Remove snapshots
		localStorage.removeItem(`${removedPrefix(userEmail)}${timestamp}`);
		// Mark as undone in history
		const updated = all.map((r) =>
			r.timestamp === timestamp ? { ...r, action: "merge-undo" as const } : r,
		);
		localStorage.setItem(resolutionKey(userEmail), JSON.stringify(updated));

		return true;
	} catch (err) {
		console.warn("[jobs-db] Failed to undo merge:", err);
		return false;
	}
}

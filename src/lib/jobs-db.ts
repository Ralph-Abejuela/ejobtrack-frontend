import Dexie, { type EntityTable } from "dexie";
import type { JobApplication, JobStatus } from "@/lib/jobs/types";

const db = new Dexie("ejobtrack_jobs") as Dexie & {
	jobs: EntityTable<JobApplication, "id">;
};

db.version(1).stores({
	// id = `${userEmail}:${platform}:${normalisedCompany}:${normalisedJobTitle}`
	jobs: "id, userEmail, platform, status, company, jobTitle, date, createdAt, updatedAt, [platform+status], [userEmail+status]",
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

	await db.jobs.put(job);
}

export async function deleteJob(userEmail: string, id: string): Promise<void> {
	const job = await db.jobs.get(id);
	if (!job || job.userEmail !== userEmail) return;
	await db.jobs.delete(id);
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

export async function clearUserJobs(userEmail: string): Promise<void> {
	await db.jobs.where({ userEmail }).delete();
}

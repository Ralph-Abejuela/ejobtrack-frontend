import { useEffect, useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listMessages, getMessage, parseMessage } from "@/lib/gmail";
import { parseEmail } from "@/lib/jobs/registry";
import { getAllJobs, getStatusCounts, storeJob } from "@/lib/jobs-db";
import { markScanned, isScanned } from "@/lib/jobs-cache";
import type { JobApplication } from "@/lib/jobs/types";

const PAGE_SIZE = 25;

interface JobPollerState {
	syncing: boolean;
	lastSyncTime: number;
	newCount: number;
	syncError: string | null;
}

/** Epoch ms → YYYY/MM/DD for Gmail search. */
function tsToGmailDate(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse a list of Gmail messages for job applications and store results. */
async function processEmails(
	accessToken: string,
	userEmail: string,
	ids: string[],
): Promise<{ newJobs: number }> {
	const emails = (
		await Promise.all(
			ids.map(async (id) => {
				try {
					return parseMessage(await getMessage(accessToken, id, "full"));
				} catch {
					return null;
				}
			}),
		)
	).filter((e): e is NonNullable<typeof e> => e !== null);

	let newJobs = 0;
	const scannedIds: string[] = [];

	for (const email of emails) {
		if (await isScanned(email.id)) continue;
		scannedIds.push(email.id);

		const result = parseEmail(email);
		if (!result) continue;

		const jobId = `${userEmail}:${result.platform}:${result.company
			.toLowerCase()
			.replace(/\s+/g, " ")}:${result.jobTitle
			.toLowerCase()
			.replace(/\s+/g, " ")}`;

		const existing = await getAllJobs(userEmail);
		const dup = existing.find((j) => j.id === jobId);

		if (dup) {
			if (dup.emailId === email.id) continue;

			const newTs = Number(email.internalDate);
			const oldTs = new Date(dup.date).getTime();
			const isNewer = newTs > oldTs;

			// Always add to history
			dup.history = [
				...dup.history,
				{
					status: result.status,
					date: new Date(newTs).toISOString(),
					emailId: email.id,
				},
			];

			if (isNewer) {
				// Newer email — update status and fields
				dup.status = result.status;
				dup.date = new Date(newTs).toISOString();
				dup.emailId = email.id;
				dup.subject = email.subject;
				dup.snippet = email.snippet;
				if (email.body) dup.body = email.body;
				if (result.url) dup.url = result.url;
			}

			dup.updatedAt = Date.now();
			await storeJob(dup);
		} else {
			await storeJob({
				...result,
				id: jobId,
				userEmail,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				history: [
					{
						status: result.status,
						date: new Date(Number(email.internalDate)).toISOString(),
						emailId: email.id,
					},
				],
			});
			newJobs++;
		}
	}

	if (scannedIds.length > 0) {
		await markScanned(userEmail, scannedIds);
	}

	return { newJobs };
}

export function useJobPoller() {
	const { user, accessToken } = useAuth();
	const userEmail = user?.email ?? "";

	const [jobs, setJobs] = useState<JobApplication[]>([]);
	const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
	const [state, setState] = useState<JobPollerState>({
		syncing: false,
		lastSyncTime: 0,
		newCount: 0,
		syncError: null,
	});

	const pollingRef = useRef(false);

	const loadJobs = useCallback(async () => {
		if (!userEmail) return;
		setJobs(await getAllJobs(userEmail));
		setStatusCounts(await getStatusCounts(userEmail));
	}, [userEmail]);

	useEffect(() => {
		loadJobs();
	}, [loadJobs]);

	/**
	 * Fetch latest 50 emails (initial popup).
	 * Re-fetches on first call or when oldestTs is null.
	 */
	const initialSync = useCallback(async () => {
		if (!accessToken || !userEmail || pollingRef.current) return;

		pollingRef.current = true;
		setState((s) => ({ ...s, syncing: true, syncError: null }));

		try {
			const listRes = await listMessages(accessToken, {
				maxResults: PAGE_SIZE,
			});
			const { newJobs } = await processEmails(
				accessToken,
				userEmail,
				listRes.messages.map((m) => m.id),
			);

			// Store boundaries
			if (listRes.messages.length > 0) {
				const full = await Promise.all(
					listRes.messages.map(async (m) => {
						try {
							return parseMessage(await getMessage(accessToken, m.id, "full"));
						} catch {
							return null;
						}
					}),
				);
				const valid = full.filter(
					(e): e is NonNullable<typeof e> => e !== null,
				);
				if (valid.length > 0) {
					const ts = valid.map((e) => Number(e.internalDate));
					const newest = Math.max(...ts);
					const oldest = Math.min(...ts);
					await setCrawlState(userEmail, {
						newestTs: newest,
						oldestTs: oldest,
						totalJobs: getCrawlState(userEmail).totalJobs,
					});
				}
			}

			await loadJobs();
			const nowMs = Date.now();
			localStorage.setItem(`job_sync_ms_${userEmail}`, String(nowMs));
			setState((s) => ({
				...s,
				syncing: false,
				lastSyncTime: nowMs,
				newCount: newJobs,
			}));
		} catch (err) {
			setState((s) => ({
				...s,
				syncing: false,
				syncError: err instanceof Error ? err.message : "Sync failed",
			}));
		} finally {
			pollingRef.current = false;
		}
	}, [accessToken, userEmail, loadJobs]);

	/**
	 * Hourly poll: check for new emails since newestTs.
	 * Only runs if >1h since last check.
	 */
	const checkNewEmails = useCallback(async () => {
		if (!accessToken || !userEmail || pollingRef.current) return;

		const crawl = await getCrawlState(userEmail);
		if (!crawl?.newestTs) return;

		const lastCheck = Number(
			localStorage.getItem(`job_forward_ms_${userEmail}`) ?? "0",
		);
		if (Date.now() - lastCheck < 60 * 60 * 1000) return;

		pollingRef.current = true;
		setState((s) => ({ ...s, syncing: true, syncError: null }));

		try {
			const listRes = await listMessages(accessToken, {
				maxResults: PAGE_SIZE,
				q: `after:${tsToGmailDate(crawl.newestTs)}`,
			});

			const { newJobs } = await processEmails(
				accessToken,
				userEmail,
				listRes.messages.map((m) => m.id),
			);

			if (listRes.messages.length > 0) {
				const full = await Promise.all(
					listRes.messages.map(async (m) => {
						try {
							return parseMessage(await getMessage(accessToken, m.id, "full"));
						} catch {
							return null;
						}
					}),
				);
				const valid = full.filter(
					(e): e is NonNullable<typeof e> => e !== null,
				);
				if (valid.length > 0) {
					const newest = Math.max(...valid.map((e) => Number(e.internalDate)));
					await setCrawlState(userEmail, {
						newestTs: Math.max(crawl.newestTs, newest),
					});
				}
			}

			localStorage.setItem(`job_forward_ms_${userEmail}`, String(Date.now()));
			await loadJobs();
			setState((s) => ({ ...s, syncing: false, newCount: newJobs }));
		} catch (err) {
			setState((s) => ({
				...s,
				syncing: false,
				syncError:
					err instanceof Error ? err.message : "New email check failed",
			}));
		} finally {
			pollingRef.current = false;
		}
	}, [accessToken, userEmail, loadJobs]);

	/**
	 * Load more: scan the next 50 emails older than the oldest cached.
	 */
	const loadMore = useCallback(async () => {
		if (!accessToken || !userEmail || pollingRef.current) return;

		const crawl = await getCrawlState(userEmail);
		if (!crawl?.oldestTs) return;

		pollingRef.current = true;
		setState((s) => ({ ...s, syncing: true, syncError: null }));

		try {
			const listRes = await listMessages(accessToken, {
				maxResults: PAGE_SIZE,
				q: `before:${tsToGmailDate(crawl.oldestTs)}`,
			});

			const { newJobs } = await processEmails(
				accessToken,
				userEmail,
				listRes.messages.map((m) => m.id),
			);

			if (listRes.messages.length > 0) {
				const full = await Promise.all(
					listRes.messages.map(async (m) => {
						try {
							return parseMessage(await getMessage(accessToken, m.id, "full"));
						} catch {
							return null;
						}
					}),
				);
				const valid = full.filter(
					(e): e is NonNullable<typeof e> => e !== null,
				);
				if (valid.length > 0) {
					const oldest = Math.min(...valid.map((e) => Number(e.internalDate)));
					await setCrawlState(userEmail, {
						oldestTs: Math.min(crawl.oldestTs, oldest),
					});
				}
			}

			await loadJobs();
			const nowMs = Date.now();
			localStorage.setItem(`job_sync_ms_${userEmail}`, String(nowMs));
			setState((s) => ({
				...s,
				syncing: false,
				lastSyncTime: nowMs,
				newCount: newJobs,
			}));
		} catch (err) {
			setState((s) => ({
				...s,
				syncing: false,
				syncError: err instanceof Error ? err.message : "Load more failed",
			}));
		} finally {
			pollingRef.current = false;
		}
	}, [accessToken, userEmail, loadJobs]);

	// --- Initial sync on mount if never synced ---
	useEffect(() => {
		if (!accessToken || !userEmail) return;
		const crawl = getCrawlState(userEmail);
		if (!crawl.oldestTs) {
			initialSync();
		}
	}, [accessToken, userEmail, initialSync]);

	useEffect(() => {
		if (!accessToken || !userEmail) return;
		const id = setInterval(() => checkNewEmails(), 60 * 60 * 1000);
		return () => clearInterval(id);
	}, [accessToken, userEmail, checkNewEmails]);

	return {
		jobs,
		statusCounts,
		state,
		/** Load next 50 older emails */
		loadMore,
		/** Check for new emails (hourly poll calls this) */
		checkNewEmails,
		/** Initial fetch on mount */
		initialSync,
		reload: loadJobs,
	};
}

interface CrawlState {
	userEmail: string;
	newestTs: number | null;
	oldestTs: number | null;
	totalJobs: number;
}

function getCrawlState(userEmail: string): CrawlState {
	try {
		const raw = localStorage.getItem(`job_crawl_${userEmail}`);
		if (raw) return JSON.parse(raw) as CrawlState;
	} catch {
		/* ignore */
	}
	return { userEmail, newestTs: null, oldestTs: null, totalJobs: 0 };
}

function setCrawlState(
	userEmail: string,
	partial: Partial<{ newestTs: number; oldestTs: number; totalJobs: number }>,
): void {
	const existing = getCrawlState(userEmail);
	const merged = { ...existing, ...partial, userEmail };
	localStorage.setItem(`job_crawl_${userEmail}`, JSON.stringify(merged));
}

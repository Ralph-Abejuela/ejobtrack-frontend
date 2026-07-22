import { useEffect, useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listMessages, getMessage, parseMessage } from "@/lib/gmail";
import { parseEmail } from "@/lib/jobs/registry";
import {
	getAllJobs,
	getStatusCounts,
	storeJob,
	addToDuplicateIndex,
} from "@/lib/jobs-db";
import { markScanned, isScanned, getScannedCount } from "@/lib/jobs-cache";
import { classifyEmail } from "@/lib/classify-email";
import type { JobApplication } from "@/lib/jobs/types";
import { stringSimilarity, COMPANY_SIMILARITY_THRESHOLD } from "@/lib/utils";
import { capture } from "./analytics";

const PAGE_SIZE = 25;

interface JobPollerState {
	syncing: boolean;
	lastSyncTime: number;
	newCount: number;
	syncError: string | null;
	/** Total emails ever scanned (from Dexie) */
	scannedCount: number;
	/** Oldest scanned email date as ISO string */
	oldestScanned: string | null;
	/** Progress: emails processed in current batch */
	batchProcessed: number;
	/** Progress: total emails in current batch */
	batchTotal: number;
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
	onProgress?: (processed: number, total: number) => void,
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

	await capture("emails_fetched", {
		count: emails.length,
		user: userEmail,
	});

	let newJobs = 0;
	const scannedIds: string[] = [];
	const total = emails.length;

	for (let i = 0; i < total; i++) {
		const email = emails[i];
		onProgress?.(i + 1, total);
		if (import.meta.env.DEV) console.log(email);
		if (await isScanned(email.id)) continue;
		scannedIds.push(email.id);

		// Semantic check — blocks newsletters and non-job emails
		const isJob = await classifyEmail(email.subject, email.body);
		if (isJob === false) {
			await markScanned(userEmail, [email.id]);
			continue;
		}

		const results = parseEmail(email);
		if (!results) continue;

		const existing = await getAllJobs(userEmail);

		for (const result of results) {
			const normalizedCompany = result.company
				.toLowerCase()
				.replace(/\s+/g, " ");
			const normalizedTitle = result.jobTitle
				.toLowerCase()
				.replace(/\s+/g, " ");
			const jobId = `${userEmail}:${result.platform}:${normalizedCompany}:${normalizedTitle}`;

			// 1. Exact match by ID
			let dup = existing.find((j) => j.id === jobId);

			// 2. Fuzzy match: same platform + same title, different but similar company
			if (!dup) {
				const fuzzy = existing.filter(
					(j) =>
						j.platform === result.platform &&
						j.jobTitle.toLowerCase().replace(/\s+/g, " ") === normalizedTitle &&
						j.id !== jobId &&
						stringSimilarity(j.company, result.company) >=
							COMPANY_SIMILARITY_THRESHOLD,
				);
				if (fuzzy.length > 0) {
					// Use the more complete company name
					fuzzy.sort((a, b) => b.company.length - a.company.length);
					dup = fuzzy[0];
					// Update existing record with fuller company name
					dup.company =
						result.company.length > dup.company.length
							? result.company
							: dup.company;
				}
			}

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
				// Ensure duplicate index has this job
				await addToDuplicateIndex({ id: dup.id, jobTitle: dup.jobTitle });
			} else {
				const newJob = {
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
				};
				await storeJob(newJob);
				await addToDuplicateIndex({ id: newJob.id, jobTitle: newJob.jobTitle });
				newJobs++;
			}
		}
	}

	if (scannedIds.length > 0) {
		await markScanned(userEmail, scannedIds);
	}

	await capture("batch_processed", {
		emails_processed: scannedIds.length,
		new_jobs: newJobs,
	});

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
		scannedCount: 0,
		oldestScanned: null,
		batchProcessed: 0,
		batchTotal: 0,
	});

	const pollingRef = useRef(false);

	const loadJobs = useCallback(async () => {
		if (!userEmail) return;
		setJobs(await getAllJobs(userEmail));
		setStatusCounts(await getStatusCounts(userEmail));
	}, [userEmail]);

	const loadScanStats = useCallback(async () => {
		if (!userEmail) return;
		const [count, crawled] = await Promise.all([
			getScannedCount(userEmail),
			getCrawlState(userEmail),
		]);
		setState((s) => ({
			...s,
			scannedCount: count,
			oldestScanned: crawled.oldestTs
				? new Date(crawled.oldestTs).toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: "numeric",
					})
				: null,
		}));
	}, [userEmail]);

	useEffect(() => {
		loadJobs();
		loadScanStats();
	}, [loadJobs, loadScanStats]);

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
			const ids = listRes.messages.map((m) => m.id);
			const { newJobs } = await processEmails(
				accessToken,
				userEmail,
				ids,
				(processed, total) =>
					setState((s) => ({
						...s,
						batchProcessed: processed,
						batchTotal: total,
					})),
			);

			// Store boundaries
			await setCrawlState(userEmail, {
				newestTs: 0,
				oldestTs: 0,
			});

			let oldestTs: number | null = null;
			if (ids.length > 0) {
				const full = await Promise.all(
					ids.map(async (id) => {
						try {
							return parseMessage(await getMessage(accessToken, id, "full"));
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
					oldestTs = Math.min(...ts);
					await setCrawlState(userEmail, {
						newestTs: newest,
						oldestTs: oldestTs,
					});
				}
			}

			await loadJobs();
			const [scannedCount] = await Promise.all([getScannedCount(userEmail)]);
			const nowMs = Date.now();
			localStorage.setItem(`job_sync_ms_${userEmail}`, String(nowMs));
			setState((s) => ({
				...s,
				syncing: false,
				batchProcessed: 0,
				batchTotal: 0,
				lastSyncTime: nowMs,
				newCount: newJobs,
				scannedCount,
				oldestScanned: oldestTs
					? new Date(oldestTs).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						})
					: null,
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
	}, [accessToken, userEmail, loadJobs, loadScanStats]);

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

			const ids = listRes.messages.map((m) => m.id);
			const { newJobs } = await processEmails(
				accessToken,
				userEmail,
				ids,
				(processed, total) =>
					setState((s) => ({
						...s,
						batchProcessed: processed,
						batchTotal: total,
					})),
			);

			if (ids.length > 0) {
				const full = await Promise.all(
					ids.map(async (id) => {
						try {
							return parseMessage(await getMessage(accessToken, id, "full"));
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
			const scannedCount = await getScannedCount(userEmail);
			setState((s) => ({
				...s,
				syncing: false,
				batchProcessed: 0,
				batchTotal: 0,
				newCount: newJobs,
				scannedCount,
			}));
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
	}, [accessToken, userEmail, loadJobs, loadScanStats]);

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

			const ids = listRes.messages.map((m) => m.id);
			const { newJobs } = await processEmails(
				accessToken,
				userEmail,
				ids,
				(processed, total) =>
					setState((s) => ({
						...s,
						batchProcessed: processed,
						batchTotal: total,
					})),
			);

			if (ids.length > 0) {
				const full = await Promise.all(
					ids.map(async (id) => {
						try {
							return parseMessage(await getMessage(accessToken, id, "full"));
						} catch {
							return null;
						}
					}),
				);
				const valid = full.filter(
					(e): e is NonNullable<typeof e> => e !== null,
				);

				if (valid.length > 0) {
					const oldestBatch = Math.min(
						...valid.map((e) => Number(e.internalDate)),
					);
					await setCrawlState(userEmail, {
						oldestTs: Math.min(crawl.oldestTs, oldestBatch),
					});
				}
			}

			await loadJobs();
			const [scannedCount, updatedCrawl] = await Promise.all([
				getScannedCount(userEmail),
				getCrawlState(userEmail),
			]);
			const nowMs = Date.now();
			localStorage.setItem(`job_sync_ms_${userEmail}`, String(nowMs));
			setState((s) => ({
				...s,
				syncing: false,
				batchProcessed: 0,
				batchTotal: 0,
				lastSyncTime: nowMs,
				newCount: newJobs,
				scannedCount,
				oldestScanned: updatedCrawl.oldestTs
					? new Date(updatedCrawl.oldestTs).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						})
					: null,
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
	}, [accessToken, userEmail, loadJobs, loadScanStats]);

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
	totalEstimate: number;
}

function getCrawlState(userEmail: string): CrawlState {
	try {
		const raw = localStorage.getItem(`job_crawl_${userEmail}`);
		if (raw) return JSON.parse(raw) as CrawlState;
	} catch {
		/* ignore */
	}
	return {
		userEmail,
		newestTs: null,
		oldestTs: null,
		totalJobs: 0,
		totalEstimate: 0,
	};
}

function setCrawlState(
	userEmail: string,
	partial: Partial<
		Pick<CrawlState, "newestTs" | "oldestTs" | "totalJobs" | "totalEstimate">
	>,
): void {
	const existing = getCrawlState(userEmail);
	const merged = { ...existing, ...partial, userEmail };
	localStorage.setItem(`job_crawl_${userEmail}`, JSON.stringify(merged));
}

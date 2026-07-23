import {
	createContext,
	useContext,
	useState,
	useCallback,
	useMemo,
	useEffect,
	useRef,
	type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import { useJobPoller } from "@/lib/use-job-poller";
import {
	getDuplicateGroups,
	ensureDuplicateIndex,
	mergeIntoNew,
	undoMerge,
	pruneStaleDismissals,
	unIgnoreGroup,
	getResolutionHistory,
	restoreDeletedJob,
	type DismissalMap,
	deleteHistoryEntry,
	updateJobStatus,
	softDeleteJob,
	updateJobTitle,
	type DuplicateGroup,
	type ResolutionEntry,
} from "@/lib/jobs-db";
import { storeEmails, db as emailDb } from "@/lib/email-cache";
import { getMessage, parseMessage } from "@/lib/gmail";
import { JobStatus, type JobApplication } from "@/lib/jobs/types";
import { toast } from "sonner";
import { STATUS_ORDER } from "./config";

interface SelectedEmail {
	subject: string;
	from: string;
	body: string;
}

interface JobContextValue {
	// Auth
	userEmail: string;
	accessToken: string | null;

	// Loading state
	loaded: boolean;

	// Jobs data
	jobs: JobApplication[];
	statusCounts: Record<string, number>;
	state: ReturnType<typeof useJobPoller>["state"];
	loadMore: () => void;
	reload: () => Promise<void>;
	grouped: Record<string, JobApplication[]>;

	// Expanded job
	expandedJob: string | null;
	setExpandedJob: (id: string | null) => void;

	// Duplicate detection
	duplicates: DuplicateGroup[];
	visibleDuplicates: DuplicateGroup[];
	showDuplicates: boolean;
	setShowDuplicates: (v: boolean) => void;
	dismissed: DismissalMap;
	selectedJobs: Set<string>;
	merging: string | null;
	handleDismiss: (groupKey: string) => void;
	toggleSelect: (jobId: string) => void;
	handleMergeSelected: (groupKey: string) => void;

	// Resolution history
	resolutionHistory: ResolutionEntry[];
	refreshResolutionHistory: () => void;
	showHistory: boolean;
	setShowHistory: (v: boolean) => void;
	undoing: boolean;

	// Hidden (soft-deleted) jobs
	hiddenJobs: JobApplication[];
	restoringId: string | null;
	handleRestore: (jobId: string) => Promise<void>;

	// Timeline email
	activeEmailId: string | null;
	setActiveEmailId: (id: string | null) => void;
	selectedEmail: SelectedEmail | null;
	fetchingEmail: boolean;

	// Actions
	handleStatusUpdate: (jobId: string, status: JobStatus) => void;
	handleDeleteHistoryEntry: (jobId: string, index: number) => Promise<void>;
	handleDeleteJob: (jobId: string) => Promise<void>;
	handleUpdateJobTitle: (jobId: string, newTitle: string) => Promise<void>;
}

const JobContext = createContext<JobContextValue | null>(null);

export function JobProvider({ children }: { children: ReactNode }) {
	const { user, accessToken } = useAuth();
	const { jobs, statusCounts, loaded, state, loadMore, reload } =
		useJobPoller();

	// ── All useState declarations (order-independent) ──
	const [expandedJob, setExpandedJob] = useState<string | null>(null);
	const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
	const [showDuplicates, setShowDuplicates] = useState(false);
	const [merging, setMerging] = useState<string | null>(null);
	const [dismissed, setDismissed] = useState<DismissalMap>({});
	const [selectedJobs, setSelectedJobs] = useState<Set<string>>(
		() => new Set(),
	);

	const [restoringId, setRestoringId] = useState<string | null>(null);
	const [resolutionHistory, setResolutionHistory] = useState<ResolutionEntry[]>(
		[],
	);
	const [showHistory, setShowHistory] = useState(false);
	const [undoing, setUndoing] = useState(false);
	const [activeEmailId, setActiveEmailId] = useState<string | null>(null);
	const [selectedEmail, setSelectedEmail] = useState<SelectedEmail | null>(
		null,
	);
	const [fetchingEmail, setFetchingEmail] = useState(false);

	// ── Reset all user-scoped state when account changes ──
	const prevEmailRef = useRef<string | null>(null);

	useEffect(() => {
		const email = user?.email ?? null;
		if (email === prevEmailRef.current) return;
		prevEmailRef.current = email;

		// Wipe stale state from previous account
		setDuplicates([]);
		setShowDuplicates(false);
		setShowHistory(false);
		setExpandedJob(null);
		setActiveEmailId(null);
		setSelectedEmail(null);
		setFetchingEmail(false);
		setSelectedJobs(new Set());
		setMerging(null);

		if (!email) {
			setDismissed({});
			setResolutionHistory([]);
			return;
		}

		// Load user-scoped dismissals
		const dismissedKey = `dismissed_dup_groups_${email}`;
		try {
			const raw = localStorage.getItem(dismissedKey);
			if (raw) {
				const parsed = JSON.parse(raw);
				setDismissed(
					Array.isArray(parsed)
						? Object.fromEntries(parsed.map((k: string) => [k, -1]))
						: parsed,
				);
			} else {
				// Migrate from old non-scoped key if this email never dismissed before
				const oldRaw = localStorage.getItem("dismissed_dup_groups");
				if (oldRaw) {
					localStorage.setItem(dismissedKey, oldRaw);
					localStorage.removeItem("dismissed_dup_groups");
					const parsed = JSON.parse(oldRaw);
					setDismissed(
						Array.isArray(parsed)
							? Object.fromEntries(parsed.map((k: string) => [k, -1]))
							: parsed,
					);
				} else {
					setDismissed({});
				}
			}
		} catch {
			setDismissed({});
		}

		if (email) {
			setResolutionHistory(getResolutionHistory(email));
		}
	}, [user?.email]);

	// ── Fetch duplicates when user or jobs change ──
	useEffect(() => {
		if (!user?.email) {
			setDuplicates([]);
			return;
		}
		(async () => {
			await ensureDuplicateIndex(user.email);
			const result = await getDuplicateGroups(user.email);
			setDuplicates(result);

			// Auto un-ignore dismissed groups when new jobs joined them
			const groups = result.map((g) => ({
				groupKey: g.groupKey,
				count: g.jobs.length,
			}));
			const fresh = pruneStaleDismissals(dismissed, groups);
			setDismissed((prev) => {
				const prevKeys = Object.keys(prev);
				const freshKeys = Object.keys(fresh);
				const changed =
					prevKeys.length !== freshKeys.length ||
					prevKeys.some((k) => prev[k] !== fresh[k]);
				return changed ? fresh : prev;
			});
		})();
	}, [user?.email, jobs]);

	// ── Derived / memoized values ──
	const visibleDuplicates = useMemo(
		() => duplicates.filter((g) => dismissed[g.groupKey] === undefined),
		[duplicates, dismissed],
	);

	const persistDismissed = useCallback(
		(next: DismissalMap) => {
			const key = user?.email
				? `dismissed_dup_groups_${user.email}`
				: "dismissed_dup_groups";
			localStorage.setItem(key, JSON.stringify(next));
		},
		[user?.email],
	);

	const handleDismiss = useCallback(
		(groupKey: string) => {
			const group = duplicates.find((g) => g.groupKey === groupKey);
			const count = group?.jobs.length ?? -1;
			setDismissed((prev) => {
				const next = { ...prev, [groupKey]: count };
				persistDismissed(next);
				return next;
			});
			if (user?.email) getResolutionHistory(user.email); // ensure fresh
			toast("Duplicate group ignored", {
				position: "bottom-right",
				action: {
					label: "Undo ignore",
					onClick: () => {
						unIgnoreGroup(groupKey);
						setDismissed((prev) => {
							const next = { ...prev };
							delete next[groupKey];
							persistDismissed(next);
							return next;
						});
					},
				},
			});
		},
		[duplicates, persistDismissed],
	);

	const toggleSelect = useCallback((jobId: string) => {
		setSelectedJobs((prev) => {
			const next = new Set(prev);
			if (next.has(jobId)) next.delete(jobId);
			else next.add(jobId);
			return next;
		});
	}, []);

	// ── Hidden (soft-deleted) jobs ──
	const hiddenJobs = useMemo(
		() =>
			jobs
				.filter((j) => j.deleted)
				.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
		[jobs],
	);

	const refreshResolutionHistory = useCallback(() => {
		if (user?.email) {
			setResolutionHistory(getResolutionHistory(user.email));
		}
	}, [user?.email]);

	useEffect(() => {
		if (activeEmailId === "manual") {
			Promise.resolve().then(() => {
				setSelectedEmail({ subject: "—", from: "—", body: "Set by user" });
				setFetchingEmail(false);
			});
			return;
		}
		if (!activeEmailId || !accessToken) {
			setSelectedEmail(null);
			setFetchingEmail(false);
			return;
		}

		let cancelled = false;
		setFetchingEmail(true);

		(async () => {
			// 1. Try cache first
			if (!cancelled) {
				const cached = await emailDb.emails.get(activeEmailId);
				if (!cancelled && cached) {
					setSelectedEmail({
						subject: cached.subject,
						from: cached.from,
						body: cached.body || cached.snippet || "(no body)",
					});
					setFetchingEmail(false);
					return;
				}
			}

			// 2. Cache miss — fetch from Gmail API
			try {
				const msg = await getMessage(accessToken, activeEmailId);
				if (cancelled) return;
				const parsed = parseMessage(msg);
				const data: SelectedEmail = {
					subject: parsed.subject,
					from: parsed.from,
					body: parsed.body || parsed.snippet || "(no body)",
				};
				// 3. Cache for future loads
				storeEmails(user!.email, [parsed]);
				if (cancelled) return;
				setSelectedEmail(data);
			} catch {
				if (cancelled) return;
				setSelectedEmail(null);
			} finally {
				if (!cancelled) setFetchingEmail(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [activeEmailId, accessToken, user?.email]);

	// ── Derived ──
	const grouped = useMemo(() => {
		const active = jobs.filter((j) => !j.deleted);
		const map: Record<string, JobApplication[]> = {};
		for (const s of STATUS_ORDER) map[s] = [];
		for (const j of active) {
			if (map[j.status]) map[j.status].push(j);
		}
		return map;
	}, [jobs]);

	// ── Actions that need email ──
	const handleMergeSelected = useCallback(
		async (groupKey: string) => {
			if (selectedJobs.size < 2 || !user?.email) return;
			const ids = [...selectedJobs];
			setMerging(`selected:${groupKey}`);
			try {
				const ok = await mergeIntoNew(user.email, ids);
				if (ok) {
					await reload();
					setResolutionHistory(getResolutionHistory(user.email));
					setSelectedJobs(new Set());
					const ts = getResolutionHistory(user.email)[0]?.timestamp;
					toast(`Merged ${ids.length} records`, {
						position: "bottom-right",
						action: {
							label: "Undo merge",
							onClick: () => {
								if (!ts) return;
								setUndoing(true);
								undoMerge(user.email, ts)
									.then((ok) => {
										if (ok) {
											setResolutionHistory(getResolutionHistory(user.email));
											reload();
										}
									})
									.finally(() => setUndoing(false));
							},
						},
					});
				}
			} finally {
				setMerging(null);
			}
		},
		[selectedJobs, user?.email, reload],
	);

	const handleStatusUpdate = useCallback(
		async (jobId: string, status: JobStatus) => {
			await updateJobStatus(jobId, status, {
				date: new Date().toISOString(),
				emailId: "manual",
			});
			await reload();
		},
		[reload],
	);

	const handleDeleteJob = useCallback(
		async (jobId: string) => {
			if (!user?.email) return;
			await softDeleteJob(user.email, jobId);
			toast("Job hidden");
			await reload();
		},
		[user?.email, reload],
	);

	const handleDeleteHistoryEntry = useCallback(
		async (jobId: string, index: number) => {
			await deleteHistoryEntry(jobId, index);
			toast("Status removed from timeline");
			await reload();
		},
		[reload],
	);

	const handleUpdateJobTitle = useCallback(
		async (jobId: string, newTitle: string) => {
			if (!user?.email) return;
			await updateJobTitle(user.email, jobId, newTitle);
			toast("Job title updated");
			await reload();
		},
		[user?.email, reload],
	);

	const handleRestore = useCallback(
		async (jobId: string) => {
			if (!user?.email) return;
			setRestoringId(jobId);
			try {
				const ok = await restoreDeletedJob(user.email, jobId);
				if (ok) {
					toast("Job restored");
					setResolutionHistory(getResolutionHistory(user.email));
					await reload();
				}
			} finally {
				setRestoringId(null);
			}
		},
		[user?.email, reload],
	);

	const userEmail = user?.email ?? "";

	return (
		<JobContext.Provider
			value={{
				userEmail,
				accessToken,
				loaded,
				jobs,
				statusCounts,
				state,
				loadMore,
				reload,
				grouped,
				expandedJob,
				setExpandedJob,
				duplicates,
				visibleDuplicates,
				showDuplicates,
				setShowDuplicates,
				dismissed,
				selectedJobs,
				merging,
				handleDismiss,
				toggleSelect,
				handleMergeSelected,
				resolutionHistory,
				refreshResolutionHistory,
				showHistory,
				setShowHistory,
				undoing,
				hiddenJobs,
				restoringId,
				handleRestore,
				activeEmailId,
				setActiveEmailId,
				selectedEmail,
				fetchingEmail,
				handleDeleteHistoryEntry,
				handleDeleteJob,
				handleUpdateJobTitle,
				handleStatusUpdate,
			}}
		>
			{children}
		</JobContext.Provider>
	);
}

export function useJobContext(): JobContextValue {
	const ctx = useContext(JobContext);
	if (!ctx) throw new Error("useJobContext must be used inside <JobProvider>");
	return ctx;
}

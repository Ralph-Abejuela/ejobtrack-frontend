import {
	createContext,
	useContext,
	useState,
	useCallback,
	useMemo,
	useEffect,
	type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import { useJobPoller } from "@/lib/use-job-poller";
import {
	getDuplicateGroups,
	ensureDuplicateIndex,
	mergeJobs,
	mergeIntoNew,
	undoMerge,
	unIgnoreGroup,
	getResolutionHistory,
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
	dismissed: Set<string>;
	selectedJobs: Set<string>;
	merging: string | null;
	handleDismiss: (groupKey: string) => void;
	toggleSelect: (jobId: string) => void;
	handleMergeSelected: (groupKey: string) => void;
	handleMergeNew: (groupKey: string, company: string, title: string) => void;

	// Merge into New modal
	mergeNewModal: { groupKey: string } | null;
	setMergeNewModal: (v: { groupKey: string } | null) => void;

	// Resolution history
	resolutionHistory: ResolutionEntry[];
	showHistory: boolean;
	setShowHistory: (v: boolean) => void;
	undoing: boolean;

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
	const { jobs, statusCounts, state, loadMore, reload } = useJobPoller();

	// ── Expanded job ──
	const [expandedJob, setExpandedJob] = useState<string | null>(null);

	// ── Duplicate detection ──
	const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
	const [showDuplicates, setShowDuplicates] = useState(false);
	const [merging, setMerging] = useState<string | null>(null);
	const [dismissed, setDismissed] = useState<Set<string>>(() => {
		try {
			const raw = localStorage.getItem("dismissed_dup_groups");
			return new Set<string>(raw ? JSON.parse(raw) : []);
		} catch {
			return new Set<string>();
		}
	});
	const [selectedJobs, setSelectedJobs] = useState<Set<string>>(
		() => new Set(),
	);

	useEffect(() => {
		if (!user?.email) {
			setDuplicates([]);
			return;
		}
		(async () => {
			await ensureDuplicateIndex(user.email);
			const result = await getDuplicateGroups();
			setDuplicates(result);
		})();
	}, [user?.email, jobs]);

	const visibleDuplicates = useMemo(
		() => duplicates.filter((g) => !dismissed.has(g.groupKey)),
		[duplicates, dismissed],
	);

	const handleDismiss = useCallback((groupKey: string) => {
		setDismissed((prev) => {
			const next = new Set(prev);
			next.add(groupKey);
			localStorage.setItem("dismissed_dup_groups", JSON.stringify([...next]));
			return next;
		});
		getResolutionHistory(); // ensure fresh
		toast("Duplicate group ignored", {
			position: "bottom-right",
			action: {
				label: "Undo ignore",
				onClick: () => {
					unIgnoreGroup(groupKey);
					setDismissed((prev) => {
						const next = new Set(prev);
						next.delete(groupKey);
						return next;
					});
				},
			},
		});
	}, []);

	const toggleSelect = useCallback((jobId: string) => {
		setSelectedJobs((prev) => {
			const next = new Set(prev);
			if (next.has(jobId)) next.delete(jobId);
			else next.add(jobId);
			return next;
		});
	}, []);

	// ── Merge into New modal ──
	const [mergeNewModal, setMergeNewModal] = useState<{
		groupKey: string;
	} | null>(null);

	// ── Resolution history ──
	const [resolutionHistory, setResolutionHistory] = useState<ResolutionEntry[]>(
		() => getResolutionHistory(),
	);
	const [showHistory, setShowHistory] = useState(false);
	const [undoing, setUndoing] = useState(false);

	// ── Timeline email ──
	const [activeEmailId, setActiveEmailId] = useState<string | null>(null);
	const [selectedEmail, setSelectedEmail] = useState<SelectedEmail | null>(
		null,
	);
	const [fetchingEmail, setFetchingEmail] = useState(false);

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

		// Try Dexie cache first
		(async () => {
			if (cancelled) return;
			const cached = await emailDb.emails.get(activeEmailId);
			if (cancelled) return;
			if (cached) {
				setSelectedEmail({
					subject: cached.subject,
					from: cached.from,
					body: cached.body || cached.snippet || "(no body)",
				});
				setFetchingEmail(false);
				return; // cache hit
			}

			// Cache miss — fetch from Gmail API
			try {
				const msg = await getMessage(accessToken, activeEmailId);
				if (cancelled) return;
				const parsed = parseMessage(msg);
				const data: SelectedEmail = {
					subject: parsed.subject,
					from: parsed.from,
					body: parsed.body || parsed.snippet || "(no body)",
				};
				// Persist to Dexie cache for future loads
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
					setResolutionHistory(getResolutionHistory());
					setSelectedJobs(new Set());
					const ts = getResolutionHistory()[0]?.timestamp;
					toast(`Merged ${ids.length} records`, {
						position: "bottom-right",
						action: {
							label: "Undo merge",
							onClick: () => {
								if (!ts) return;
								setUndoing(true);
								undoMerge(ts)
									.then((ok) => {
										if (ok) {
											setResolutionHistory(getResolutionHistory());
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

	const handleMergeNew = useCallback(
		async (groupKey: string, company: string, title: string) => {
			const ids = [...selectedJobs];
			if (ids.length < 2 || !user?.email) return;
			setMerging(`new:${groupKey}`);
			try {
				const ok = await mergeIntoNew(user.email, ids, company, title);
				if (ok) {
					await reload();
					setResolutionHistory(getResolutionHistory());
					setSelectedJobs(new Set());
					setMergeNewModal(null);
					const ts = getResolutionHistory()[0]?.timestamp;
					toast(`Merged into "${company}"`, {
						position: "bottom-right",
						action: {
							label: "Undo merge",
							onClick: () => {
								if (!ts) return;
								setUndoing(true);
								undoMerge(ts)
									.then((ok) => {
										if (ok) {
											setResolutionHistory(getResolutionHistory());
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

	const handleMerge = useCallback(
		async (keepId: string, removeId: string) => {
			if (!user?.email) return;
			setMerging(`${keepId}:${removeId}`);
			try {
				const result = await mergeJobs(user.email, keepId, removeId);
				await reload();
				setResolutionHistory(getResolutionHistory());

				if (result) {
					const ts = getResolutionHistory()[0]?.timestamp;
					toast("Merged duplicate", {
						position: "bottom-right",
						action: {
							label: "Undo merge",
							onClick: () => {
								if (!ts) return;
								setUndoing(true);
								undoMerge(ts)
									.then((ok) => {
										if (ok) {
											setResolutionHistory(getResolutionHistory());
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
		[user?.email, reload],
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

	const userEmail = user?.email ?? "";

	return (
		<JobContext.Provider
			value={{
				userEmail,
				accessToken,
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
				handleMergeNew,
				mergeNewModal,
				setMergeNewModal,
				resolutionHistory,
				showHistory,
				setShowHistory,
				undoing,
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

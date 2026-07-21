import { createFileRoute } from "@tanstack/react-router";
import { useJobPoller } from "@/lib/use-job-poller";
import { useAuth } from "@/lib/auth";
import { updateJobStatus } from "@/lib/jobs-db";
import { JobStatus, type JobApplication } from "@/lib/jobs/types";
import { useState, useCallback, useMemo } from "react";
import {
	Loader2,
	RefreshCw,
	Briefcase,
	CheckCircle2,
	Eye,
	CalendarCheck,
	Award,
	XCircle,
	HelpCircle,
	ChevronDown,
	ChevronUp,
	ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/jobs")({
	component: JobsPage,
});

const STATUS_CONFIG: Record<
	string,
	{ label: string; icon: typeof CheckCircle2; color: string; bg: string }
> = {
	[JobStatus.APPLIED]: {
		label: "Applied",
		icon: CheckCircle2,
		color: "text-blue-600 dark:text-blue-400",
		bg: "bg-blue-50 dark:bg-blue-950",
	},
	[JobStatus.VIEWED]: {
		label: "Viewed",
		icon: Eye,
		color: "text-purple-600 dark:text-purple-400",
		bg: "bg-purple-50 dark:bg-purple-950",
	},
	[JobStatus.INTERVIEW]: {
		label: "Interview",
		icon: CalendarCheck,
		color: "text-amber-600 dark:text-amber-400",
		bg: "bg-amber-50 dark:bg-amber-950",
	},
	[JobStatus.OFFER]: {
		label: "Offer",
		icon: Award,
		color: "text-green-600 dark:text-green-400",
		bg: "bg-green-50 dark:bg-green-950",
	},
	[JobStatus.REJECTED]: {
		label: "Rejected",
		icon: XCircle,
		color: "text-red-600 dark:text-red-400",
		bg: "bg-red-50 dark:bg-red-950",
	},
	[JobStatus.UNKNOWN]: {
		label: "Unknown",
		icon: HelpCircle,
		color: "text-gray-500",
		bg: "bg-gray-50 dark:bg-gray-950",
	},
};

const STATUS_ORDER = [
	JobStatus.APPLIED,
	JobStatus.VIEWED,
	JobStatus.INTERVIEW,
	JobStatus.OFFER,
	JobStatus.REJECTED,
	JobStatus.UNKNOWN,
];

function JobsPage() {
	const { user } = useAuth();
	const { jobs, statusCounts, state, loadMore, reload } = useJobPoller();
	const [expandedJob, setExpandedJob] = useState<string | null>(null);

	// Group jobs by status
	const grouped = useMemo(() => {
		const map: Record<string, JobApplication[]> = {};
		for (const s of STATUS_ORDER) map[s] = [];
		for (const j of jobs) {
			if (map[j.status]) map[j.status].push(j);
		}
		return map;
	}, [jobs]);

	const handleStatusUpdate = useCallback(
		async (jobId: string, newStatus: JobStatus) => {
			await updateJobStatus(jobId, newStatus, {
				date: new Date().toISOString(),
				emailId: "manual",
			});
			await reload();
		},
		[reload],
	);

	if (!user) {
		return (
			<div className="flex items-center justify-center py-20 text-muted-foreground">
				<p className="text-sm">Sign in to track your job applications.</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
					<Briefcase className="size-6" /> Job Applications
				</h1>
				<div className="flex items-center gap-3">
					{state.syncing && (
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							<Loader2 className="size-3 animate-spin" /> Syncing…
						</span>
					)}
					<button
						onClick={() => loadMore()}
						disabled={state.syncing}
						className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
					>
						<RefreshCw
							className={`size-4 ${state.syncing ? "animate-spin" : ""}`}
						/>
						Load Older Emails
					</button>
				</div>
			</div>

			{state.syncError && (
				<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
					{state.syncError}
				</div>
			)}

			{/* Summary cards */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
				{STATUS_ORDER.map((s) => {
					const cfg = STATUS_CONFIG[s];
					const Icon = cfg.icon;
					const count = statusCounts[s] ?? 0;
					return (
						<div key={s} className="rounded-lg border p-3">
							<div className="flex items-center gap-2">
								<Icon className={`size-4 ${cfg.color}`} />
								<span className="text-sm font-medium">{cfg.label}</span>
							</div>
							<p className={`mt-1 text-2xl font-bold ${cfg.color}`}>{count}</p>
						</div>
					);
				})}
			</div>

			{/* Grouped sections */}
			{jobs.length === 0 && !state.syncing && (
				<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
					No job applications tracked yet. Click Load Older Emails to fetch from
					your inbox.
				</div>
			)}

			{STATUS_ORDER.map((status) => {
				const sectionJobs = grouped[status];
				if (sectionJobs.length === 0) return null;
				const cfg = STATUS_CONFIG[status];
				const Icon = cfg.icon;

				return (
					<section key={status} className="space-y-2">
						<h2
							className={`flex items-center gap-2 text-sm font-semibold ${cfg.color}`}
						>
							<Icon className="size-4" />
							{cfg.label}
							<span className="text-xs text-muted-foreground font-normal">
								({sectionJobs.length})
							</span>
						</h2>

						<div className="divide-y rounded-lg border">
							{sectionJobs.map((job) => {
								const isExpanded = expandedJob === job.id;
								return (
									<div key={job.id}>
										<button
											onClick={() => setExpandedJob(isExpanded ? null : job.id)}
											className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">
													{job.jobTitle}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{job.company} ·{" "}
													<span className="capitalize">{job.platform}</span>
												</p>
											</div>
											<span className="shrink-0 text-xs text-muted-foreground">
												{formatDate(job.date)}
											</span>
											{isExpanded ? (
												<ChevronUp className="size-4 shrink-0 text-muted-foreground" />
											) : (
												<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
											)}
										</button>

										{isExpanded && (
											<div className="border-t px-4 pb-4 pt-3">
												{/* Timeline */}
												<Timeline history={job.history} />

												{/* Details */}
												<div className="mt-4 space-y-2 text-xs text-muted-foreground">
													<div className="flex flex-wrap gap-x-4 gap-y-1">
														<span>
															<strong>Subject:</strong> {job.subject}
														</span>
														<span>
															<strong>From:</strong> {job.from}
														</span>
														{job.url && (
															<a
																href={job.url}
																target="_blank"
																rel="noopener noreferrer"
																className="inline-flex items-center gap-1 text-primary hover:underline"
															>
																<ExternalLink className="size-3" />
																View Job Posting
															</a>
														)}
													</div>

													<div className="flex items-center gap-2">
														<label className="text-xs text-muted-foreground">
															Status:
														</label>
														<select
															value={job.status}
															onChange={(e) =>
																handleStatusUpdate(
																	job.id,
																	e.target.value as JobStatus,
																)
															}
															className="rounded border px-2 py-1 text-xs"
														>
															{STATUS_ORDER.map((s) => (
																<option key={s} value={s}>
																	{STATUS_CONFIG[s]?.label ?? s}
																</option>
															))}
														</select>
													</div>
												</div>

												{/* Body */}
												<pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-3 font-sans text-xs leading-relaxed">
													{job.body || "(no body)"}
												</pre>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</section>
				);
			})}

			<p className="text-xs text-muted-foreground">
				{state.lastSyncTime > 0 &&
					`Last synced ${formatTimeAgo(state.lastSyncTime)}`}
				{state.newCount > 0 && ` · ${state.newCount} new updates`}
			</p>
		</div>
	);
}

/** Horizontal timeline showing status progression left to right. */
function Timeline({
	history,
}: {
	history: { status: string; date: string }[];
}) {
	// Sort by date ascending (oldest first = leftmost)
	const sorted = [...history].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);

	if (sorted.length < 2) {
		// Single event — just show it as a single dot
		const h = sorted[0];
		if (!h) return null;
		const cfg = STATUS_CONFIG[h.status] ?? STATUS_CONFIG.unknown;
		const Icon = cfg.icon;
		return (
			<div className="flex items-center justify-center gap-2 py-2">
				<div className={`rounded-full p-1.5 ${cfg.bg}`}>
					<Icon className={`size-4 ${cfg.color}`} />
				</div>
				<div className="text-xs">
					<span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
					<span className="ml-1.5 text-muted-foreground">
						{formatDate(h.date)}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-center justify-center gap-0 py-3">
			{sorted.map((h, i) => {
				const cfg = STATUS_CONFIG[h.status] ?? STATUS_CONFIG.unknown;
				const Icon = cfg.icon;
				const isLast = i === sorted.length - 1;
				return (
					<div key={i} className="flex items-center">
						{/* Dot + label */}
						<div className="flex flex-col items-center gap-1">
							<div className={`rounded-full p-1.5 ${cfg.bg}`}>
								<Icon className={`size-3.5 ${cfg.color}`} />
							</div>
							<span
								className={`text-[10px] font-medium leading-tight ${cfg.color}`}
							>
								{cfg.label}
							</span>
							<span className="text-[10px] text-muted-foreground leading-tight">
								{formatDate(h.date)}
							</span>
						</div>
						{/* Connector line */}
						{!isLast && <div className="mx-1 h-px w-8 bg-border sm:w-12" />}
					</div>
				);
			})}
		</div>
	);
}

function formatDate(dateStr: string): string {
	if (!dateStr) return "";
	try {
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return dateStr;
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch {
		return dateStr;
	}
}

function formatTimeAgo(ms: number): string {
	const delta = Date.now() - ms;
	const mins = Math.floor(delta / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

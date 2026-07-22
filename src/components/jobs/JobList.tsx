import type { JobApplication } from "@/lib/jobs/types";
import { JobStatus } from "@/lib/jobs/types";
import { STCFG, STATUS_ORDER } from "./config";
import JobCard from "./JobCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";

interface JobListProps {
	jobs: JobApplication[];
	grouped: Record<string, JobApplication[]>;
	expandedJob: string | null;
	activeEmailId: string | null;
	selectedEmail: { subject: string; from: string; body: string } | null;
	fetchingEmail: boolean;
	onToggleExpand: (jobId: string) => void;
	onSelectEmail: (id: string | null) => void;
	onStatusUpdate: (jobId: string, status: JobStatus) => void;
	onDeleteHistoryEntry: (jobId: string, index: number) => void;
	onDelete: (jobId: string) => void;
	onUpdateTitle: (jobId: string, newTitle: string) => void;
	syncing: boolean;
	lastSyncTime: number;
	newCount: number;
}

export default function JobList({
	jobs,
	grouped,
	expandedJob,
	activeEmailId,
	selectedEmail,
	fetchingEmail,
	onToggleExpand,
	onSelectEmail,
	onStatusUpdate,
	onDeleteHistoryEntry,
	onDelete,
	onUpdateTitle,
	syncing,
	lastSyncTime,
	newCount,
}: JobListProps) {
	if (jobs.length === 0) {
		if (syncing) {
			return (
				<div className="space-y-4">
					{Array.from({ length: 3 }).map((_, i) => (
						<div
							key={i}
							className="flex flex-col gap-2 rounded-lg border bg-card p-4"
						>
							<div className="flex items-center justify-between">
								<Skeleton className="h-5 w-48" />
								<Skeleton className="h-4 w-20" />
							</div>
							<Skeleton className="h-4 w-64" />
							<Skeleton className="h-3 w-40" />
						</div>
					))}
					<div className="flex justify-center">
						<Skeleton className="h-4 w-36" />
					</div>
				</div>
			);
		}

		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>No job applications yet</EmptyTitle>
					<EmptyDescription>
						Click Load Older Emails to fetch from your inbox.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<>
			{STATUS_ORDER.map((status) => {
				const sectionJobs = grouped[status];
				if (sectionJobs.length === 0) return null;
				const cfg = STCFG[status];
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

						<div className="divide-y rounded-lg border bg-card">
							{sectionJobs.map((job) => (
								<JobCard
									key={job.id}
									job={job}
									isExpanded={expandedJob === job.id}
									activeEmailId={activeEmailId}
									selectedEmail={selectedEmail}
									fetchingEmail={fetchingEmail}
									onToggle={() => {
										onToggleExpand(job.id);
										requestAnimationFrame(() => {
											document.getElementById(job.id)?.scrollIntoView({
												behavior: "smooth",
												block: "center",
											});
										});
									}}
									onSelectEmail={onSelectEmail}
									onStatusUpdate={onStatusUpdate}
									onDeleteHistoryEntry={onDeleteHistoryEntry}
									onDelete={onDelete}
									onUpdateTitle={onUpdateTitle}
								/>
							))}
						</div>
					</section>
				);
			})}

			{(lastSyncTime > 0 || newCount > 0) && (
				<p className="text-xs text-muted-foreground">
					{lastSyncTime > 0 && `Last synced ${formatTimeAgo(lastSyncTime)}`}
					{newCount > 0 && ` · ${newCount} new updates`}
				</p>
			)}
		</>
	);
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

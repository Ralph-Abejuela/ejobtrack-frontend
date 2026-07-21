import { ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react";
import { JobStatus, type JobApplication } from "@/lib/jobs/types";
import { formatDate } from "@/lib/utils";
import Timeline from "./Timeline";
import { STCFG } from "./config";

interface JobCardProps {
	job: JobApplication;
	isExpanded: boolean;
	activeEmailId: string | null;
	selectedEmail: { subject: string; from: string; body: string } | null;
	fetchingEmail: boolean;
	onToggle: () => void;
	onSelectEmail: (id: string | null) => void;
	onStatusUpdate: (jobId: string, status: JobStatus) => void;
}

export default function JobCard({
	job,
	isExpanded,
	activeEmailId,
	selectedEmail,
	fetchingEmail,
	onToggle,
	onSelectEmail,
	onStatusUpdate,
}: JobCardProps) {
	const selEntry = activeEmailId
		? job.history.find((h) => h.emailId === activeEmailId)
		: null;

	return (
		<div id={job.id}>
			<button
				onClick={onToggle}
				className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
			>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">{job.jobTitle}</p>
					<p className="truncate text-xs text-muted-foreground">
						{job.company} · <span className="capitalize">{job.platform}</span>
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
					<Timeline
						history={job.history}
						selectedEmailId={activeEmailId}
						onSelect={onSelectEmail}
					/>

					<div className="mt-4 space-y-2 text-xs text-muted-foreground">
						{selEntry && (
							<div className="rounded border border-amber-200 bg-amber-50/50 px-2 py-1.5 dark:border-amber-800 dark:bg-amber-950/30">
								<p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
									Email from {formatDate(selEntry.date)}
									{" · "}
									{STCFG[selEntry.status]?.label ?? selEntry.status}
								</p>
							</div>
						)}

						<div className="flex flex-wrap gap-x-4 gap-y-1">
							<span>
								<strong>Subject:</strong>{" "}
								{fetchingEmail ? (
									<Loader2 className="inline size-3 animate-spin" />
								) : (
									(selectedEmail?.subject ?? job.subject)
								)}
							</span>
							<span>
								<strong>From:</strong>{" "}
								{fetchingEmail ? (
									<Loader2 className="inline size-3 animate-spin" />
								) : (
									(selectedEmail?.from ?? job.from)
								)}
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
							<a
								href={`https://mail.google.com/mail/u/0/#inbox/${activeEmailId ?? job.emailId}`}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-primary hover:underline"
							>
								<ExternalLink className="size-3" />
								{activeEmailId
									? "Open this email in Gmail"
									: "Open latest email in Gmail"}
							</a>
						</div>

						<div className="flex items-center gap-2">
							<label className="text-xs text-muted-foreground">Status:</label>
							<select
								value={job.status}
								onChange={(e) =>
									onStatusUpdate(job.id, e.target.value as JobStatus)
								}
								className="rounded border px-2 py-1 text-xs"
							>
								{Object.values(JobStatus).map((s) => (
									<option key={s} value={s}>
										{STCFG[s]?.label ?? s}
									</option>
								))}
							</select>
						</div>
					</div>

					<pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-3 font-sans text-xs leading-relaxed">
						{fetchingEmail
							? "Loading…"
							: (selectedEmail?.body ?? (job.body || "(no body)"))}
					</pre>
				</div>
			)}
		</div>
	);
}

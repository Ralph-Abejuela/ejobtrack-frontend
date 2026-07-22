import {
	ExternalLink,
	Pencil,
	Trash2,
	Loader2,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { JobStatus, type JobApplication } from "@/lib/jobs/types";
import { formatDate } from "@/lib/utils";
import Timeline from "./Timeline";
import { STCFG } from "./config";
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";

interface JobCardProps {
	job: JobApplication;
	isExpanded: boolean;
	activeEmailId: string | null;
	selectedEmail: { subject: string; from: string; body: string } | null;
	fetchingEmail: boolean;
	onToggle: () => void;
	onSelectEmail: (id: string | null) => void;
	onStatusUpdate: (jobId: string, status: JobStatus) => void;
	onDeleteHistoryEntry: (jobId: string, index: number) => void;
	onDelete: (jobId: string) => void;
	onUpdateTitle: (jobId: string, newTitle: string) => void;
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
	onDeleteHistoryEntry,
	onDelete,
	onUpdateTitle,
}: JobCardProps) {
	const [editingTitle, setEditingTitle] = useState(false);
	const [titleDraft, setTitleDraft] = useState(job.jobTitle);

	const selEntry = activeEmailId
		? job.history.find((h) => h.emailId === activeEmailId)
		: null;

	const handleSaveTitle = () => {
		const trimmed = titleDraft.trim();
		if (trimmed && trimmed !== job.jobTitle) {
			onUpdateTitle(job.id, trimmed);
		}
		setEditingTitle(false);
	};

	return (
		<Collapsible
			id={job.id}
			open={isExpanded}
			onOpenChange={(open) => {
				if (open !== isExpanded) onToggle();
			}}
		>
			<CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30">
				<div className="min-w-0 flex-1">
					{editingTitle ? (
						<div
							className="flex items-center gap-1"
							onClick={(e) => e.stopPropagation()}
						>
							<Input
								value={titleDraft}
								onChange={(e) => setTitleDraft(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSaveTitle();
									if (e.key === "Escape") setEditingTitle(false);
								}}
								autoFocus
								className="flex-1"
							/>
						</div>
					) : (
						<p className="truncate text-sm font-medium">{job.jobTitle}</p>
					)}
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
			</CollapsibleTrigger>

			<CollapsibleContent>
				<div className="border-t px-4 pb-4 pt-3">
					<Timeline
						history={job.history}
						jobId={job.id}
						selectedEmailId={activeEmailId}
						onSelect={onSelectEmail}
						onDeleteEntry={onDeleteHistoryEntry}
					/>

					<div className="mt-4 space-y-2 text-xs text-muted-foreground">
						{selEntry && (
							<div className="rounded border border-amber-200 bg-amber-50/50 px-2 py-1.5 dark:border-amber-800 dark:bg-amber-950/30">
								<p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
									{selEntry.emailId === "manual"
										? `Set by user on ${formatDate(selEntry.date)}`
										: `Email from ${formatDate(selEntry.date)}`}
									{" · "}
									{STCFG[selEntry.status]?.label ?? selEntry.status}
								</p>
							</div>
						)}

						<div className="flex flex-wrap gap-x-4 gap-y-1">
							{selEntry?.emailId !== "manual" && (
								<>
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
								</>
							)}
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
								href={`https://mail.google.com/mail/u/0/#inbox/${activeEmailId === "manual" ? job.emailId : (activeEmailId ?? job.emailId)}`}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-primary hover:underline"
							>
								<ExternalLink className="size-3" />
								{activeEmailId && activeEmailId !== "manual"
									? "Open this email in Gmail"
									: "Open latest email in Gmail"}
							</a>
						</div>

						<div className="flex items-center gap-2">
							<label className="text-xs text-muted-foreground">Status:</label>
							<Select
								value={job.status}
								onValueChange={(val) =>
									onStatusUpdate(job.id, val as JobStatus)
								}
							>
								<SelectTrigger className="w-36">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.values(JobStatus).map((s) => (
										<SelectItem key={s} value={s}>
											{STCFG[s]?.label ?? s}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex items-center gap-2 pt-1">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setEditingTitle(true);
									setTitleDraft(job.jobTitle);
								}}
							>
								<Pencil data-icon="inline-start" />
								Edit Title
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => onDelete(job.id)}
							>
								<Trash2 data-icon="inline-start" />
								Hide Job
							</Button>
						</div>
					</div>

					{selEntry?.emailId !== "manual" && (
						<pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-3 font-sans text-xs leading-relaxed">
							{fetchingEmail
								? "Loading…"
								: (selectedEmail?.body ?? (job.body || "(no body)"))}
						</pre>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

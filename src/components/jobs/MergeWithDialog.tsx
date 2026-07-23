import { useState, useMemo } from "react";
import { Search, Loader2, Merge } from "lucide-react";
import type { JobApplication } from "@/lib/jobs/types";
import { STCFG } from "./config";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface MergeWithDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sourceJob: JobApplication;
	jobs: JobApplication[];
	onMerge: (sourceJobId: string, selectedJobIds: string[]) => void;
	merging: boolean;
}

export default function MergeWithDialog({
	open,
	onOpenChange,
	sourceJob,
	jobs,
	onMerge,
	merging,
}: MergeWithDialogProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	// Reset state when dialog opens
	const handleOpenChange = (newOpen: boolean) => {
		// Block close on backdrop when jobs selected
		if (!newOpen && selectedIds.size > 0) return;
		if (!newOpen) {
			setSearchQuery("");
			setSelectedIds(new Set());
		}
		onOpenChange(newOpen);
	};

	const filtered = useMemo(() => {
		const q = searchQuery.toLowerCase().trim();
		return q
			? jobs.filter(
					(j) =>
						j.jobTitle.toLowerCase().includes(q) ||
						j.company.toLowerCase().includes(q) ||
						j.subject.toLowerCase().includes(q) ||
						j.from.toLowerCase().includes(q),
				)
			: jobs;
	}, [jobs, searchQuery]);

	const toggleSelected = (jobId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(jobId)) next.delete(jobId);
			else next.add(jobId);
			return next;
		});
	};

	const handleMerge = () => {
		if (selectedIds.size === 0) return;
		onMerge(sourceJob.id, [...selectedIds]);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-lg"
				showCloseButton={selectedIds.size === 0}
			>
				<DialogHeader>
					<DialogTitle>Merge with "{sourceJob.jobTitle}"</DialogTitle>
					<DialogDescription>
						Select jobs to merge into "{sourceJob.company} —{" "}
						{sourceJob.jobTitle}". Their history will be consolidated into
						this record.
					</DialogDescription>
				</DialogHeader>

				<div className="relative">
					<Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search by title, company, subject or sender…"
						className="pl-8"
						autoFocus
					/>
				</div>

				<div className="max-h-72 space-y-1 overflow-y-auto">
					{filtered.length === 0 ? (
						<p className="py-4 text-center text-xs text-muted-foreground">
							No jobs found
						</p>
					) : (
						filtered.map((job) => {
							const checked = selectedIds.has(job.id);
							return (
								<label
									key={job.id}
									className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-xs transition-colors hover:bg-muted/50"
								>
									<Checkbox
										checked={checked}
										onCheckedChange={() => toggleSelected(job.id)}
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">{job.jobTitle}</p>
										<p className="truncate text-muted-foreground">
											{job.company} ·{" "}
											<span className="capitalize">{job.platform}</span>
										</p>
									</div>
									<span
										className={`shrink-0 text-[10px] ${STCFG[job.status]?.color ?? "text-muted-foreground"}`}
									>
										{STCFG[job.status]?.label ?? job.status}
									</span>
								</label>
							);
						})
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={merging}
					>
						Cancel
					</Button>
					<Button
						onClick={handleMerge}
						disabled={selectedIds.size === 0 || merging}
					>
						{merging ? (
							<Loader2 data-icon="inline-start" className="animate-spin" />
						) : (
							<Merge data-icon="inline-start" />
						)}
						Merge {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

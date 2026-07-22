import {
	AlertTriangle,
	ChevronDown,
	ChevronUp,
	Merge,
	Loader2,
} from "lucide-react";
import type { DuplicateGroup } from "@/lib/jobs-db";
import { STCFG } from "./config";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface DuplicatesPanelProps {
	visibleDuplicates: DuplicateGroup[];
	selectedJobs: ReadonlySet<string>;
	merging: string | null;
	showDuplicates: boolean;
	onToggleDuplicates: () => void;
	onDismiss: (groupKey: string) => void;
	onToggleSelect: (jobId: string) => void;
	onMergeSelected: (groupKey: string) => void;
	onMergeNew: (groupKey: string) => void;
	onScrollToJob: (jobId: string) => void;
}

export default function DuplicatesPanel({
	visibleDuplicates,
	selectedJobs,
	merging,
	showDuplicates,
	onToggleDuplicates,
	onDismiss,
	onToggleSelect,
	onMergeSelected,
	onMergeNew,
	onScrollToJob,
}: DuplicatesPanelProps) {
	if (visibleDuplicates.length === 0) return null;

	return (
		<div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-border dark:bg-card">
			<Button
				variant="ghost"
				onClick={onToggleDuplicates}
				className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-300"
			>
				<AlertTriangle className="size-4" />
				{visibleDuplicates.length} duplicate group
				{visibleDuplicates.length !== 1 ? "s" : ""} found
				{showDuplicates ? (
					<ChevronUp className="ml-auto size-4" />
				) : (
					<ChevronDown className="ml-auto size-4" />
				)}
			</Button>

			{showDuplicates && (
				<div className="space-y-3 border-t border-amber-200 px-4 py-3 dark:border-border">
					<p className="text-xs text-amber-700 dark:text-amber-400/70">
						Same job title, multiple company names — select records to merge or
						merge into a new entry.
					</p>

					{visibleDuplicates.map((group) => {
						const selCount = group.jobs.filter((j) =>
							selectedJobs.has(j.id),
						).length;
						return (
							<div
								key={group.groupKey}
								className="rounded-lg border border-amber-300 bg-white p-3 dark:border-border dark:bg-muted"
							>
								<div className="flex items-center justify-between gap-2">
									<p className="truncate text-xs font-medium text-amber-900 dark:text-amber-300">
										{group.jobs[0].jobTitle}
									</p>
									<Button
										variant="ghost"
										size="xs"
										onClick={() => onDismiss(group.groupKey)}
									>
										Ignore
									</Button>
								</div>

								<div className="mt-2 space-y-1">
									{group.jobs.map((j) => {
										const checked = selectedJobs.has(j.id);
										return (
											<div
												key={j.id}
												className="flex items-center gap-2 rounded px-2 py-1 text-xs"
											>
												<Checkbox
													checked={checked}
													onCheckedChange={() => onToggleSelect(j.id)}
												/>
												<Button
													variant="ghost"
													size="xs"
													onClick={() => onScrollToJob(j.id)}
													className="min-w-0 flex-1 truncate text-left hover:underline"
												>
													{j.company}
													{checked && (
														<span className="ml-1.5 text-[10px] text-amber-400">
															selected
														</span>
													)}
												</Button>
												<span className="shrink-0 text-muted-foreground">
													{STCFG[j.status]?.label ?? j.status}
												</span>
											</div>
										);
									})}
								</div>

								<div className="mt-2 flex items-center gap-2">
									<Button
										variant="outline"
										size="xs"
										onClick={() => onMergeSelected(group.groupKey)}
										disabled={
											merging === `selected:${group.groupKey}` || selCount < 2
										}
									>
										{merging === `selected:${group.groupKey}` ? (
											<Loader2
												data-icon="inline-start"
												className="animate-spin"
											/>
										) : (
											<Merge data-icon="inline-start" />
										)}
										Merge selected{selCount >= 2 ? ` (${selCount})` : ""}
									</Button>
									<Button
										variant="outline"
										size="xs"
										onClick={() => onMergeNew(group.groupKey)}
										disabled={selCount < 2}
									>
										Merge into new…
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

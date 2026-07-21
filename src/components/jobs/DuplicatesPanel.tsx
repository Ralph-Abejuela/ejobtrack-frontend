import {
	AlertTriangle,
	ChevronDown,
	ChevronUp,
	Square,
	CheckSquare,
	Merge,
	Loader2,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";
import type { DuplicateGroup, ResolutionEntry } from "@/lib/jobs-db";
import { STCFG } from "./config";

interface DuplicatesPanelProps {
	visibleDuplicates: DuplicateGroup[];
	selectedJobs: ReadonlySet<string>;
	merging: string | null;
	showDuplicates: boolean;
	showHistory: boolean;
	resolutionHistory: ResolutionEntry[];
	undoing: boolean;
	onToggleDuplicates: () => void;
	onToggleHistory: () => void;
	onDismiss: (groupKey: string) => void;
	onToggleSelect: (jobId: string) => void;
	onMergeSelected: (groupKey: string) => void;
	onMergeNew: (groupKey: string) => void;
	onScrollToJob: (jobId: string) => void;
	onUndoMerge: (timestamp: number) => void;
}

export default function DuplicatesPanel({
	visibleDuplicates,
	selectedJobs,
	merging,
	showDuplicates,
	showHistory,
	resolutionHistory,
	undoing,
	onToggleDuplicates,
	onToggleHistory,
	onDismiss,
	onToggleSelect,
	onMergeSelected,
	onMergeNew,
	onScrollToJob,
	onUndoMerge,
}: DuplicatesPanelProps) {
	if (visibleDuplicates.length === 0) return null;

	return (
		<div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
			<button
				onClick={onToggleDuplicates}
				className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-200"
			>
				<AlertTriangle className="size-4" />
				{visibleDuplicates.length} duplicate group
				{visibleDuplicates.length !== 1 ? "s" : ""} found
				{showDuplicates ? (
					<ChevronUp className="ml-auto size-4" />
				) : (
					<ChevronDown className="ml-auto size-4" />
				)}
			</button>

			{showDuplicates && (
				<div className="space-y-3 border-t border-amber-200 px-4 py-3 dark:border-amber-800">
					<p className="text-xs text-amber-700 dark:text-amber-300">
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
								className="rounded-lg border border-amber-300 bg-white p-3 dark:border-amber-700 dark:bg-amber-900/30"
							>
								<div className="flex items-center justify-between gap-2">
									<p className="truncate text-xs font-medium text-amber-900 dark:text-amber-100">
										{group.jobs[0].jobTitle}
									</p>
									<button
										onClick={() => onDismiss(group.groupKey)}
										className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-800"
									>
										Ignore
									</button>
								</div>

								<div className="mt-2 space-y-1">
									{group.jobs.map((j) => {
										const checked = selectedJobs.has(j.id);
										return (
											<div
												key={j.id}
												className="flex items-center gap-2 rounded px-2 py-1 text-xs"
											>
												<button
													onClick={() => onToggleSelect(j.id)}
													className="shrink-0"
												>
													{checked ? (
														<CheckSquare className="size-4 text-amber-600" />
													) : (
														<Square className="size-4 text-amber-400" />
													)}
												</button>
												<button
													onClick={() => onScrollToJob(j.id)}
													className="min-w-0 flex-1 truncate text-left hover:underline"
												>
													{j.company}
													{checked && (
														<span className="ml-1.5 text-[10px] text-amber-500">
															selected
														</span>
													)}
												</button>
												<span className="shrink-0 text-muted-foreground">
													{STCFG[j.status]?.label ?? j.status}
												</span>
											</div>
										);
									})}
								</div>

								<div className="mt-2 flex items-center gap-2">
									<button
										onClick={() => onMergeSelected(group.groupKey)}
										disabled={
											merging === `selected:${group.groupKey}` || selCount < 2
										}
										className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:hover:bg-amber-800"
									>
										{merging === `selected:${group.groupKey}` ? (
											<Loader2 className="size-3 animate-spin" />
										) : (
											<Merge className="size-3" />
										)}
										Merge selected{selCount >= 2 ? ` (${selCount})` : ""}
									</button>
									<button
										onClick={() => onMergeNew(group.groupKey)}
										disabled={selCount < 2}
										className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:hover:bg-amber-800"
									>
										Merge into new…
									</button>
								</div>
							</div>
						);
					})}

					<ResolutionHistory
						showHistory={showHistory}
						resolutionHistory={resolutionHistory}
						undoing={undoing}
						onToggleHistory={onToggleHistory}
						onUndoMerge={onUndoMerge}
					/>
				</div>
			)}
		</div>
	);
}

function ResolutionHistory({
	showHistory,
	resolutionHistory,
	undoing,
	onToggleHistory,
	onUndoMerge,
}: {
	showHistory: boolean;
	resolutionHistory: ResolutionEntry[];
	undoing: boolean;
	onToggleHistory: () => void;
	onUndoMerge: (timestamp: number) => void;
}) {
	return (
		<>
			<button
				onClick={onToggleHistory}
				className="flex w-full items-center gap-1.5 pt-2 text-[11px] font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
			>
				{showHistory ? (
					<ChevronUp className="size-3" />
				) : (
					<ChevronDown className="size-3" />
				)}
				History ({resolutionHistory.length})
			</button>
			{showHistory && (
				<div className="mt-2 space-y-1">
					{resolutionHistory.length === 0 && (
						<p className="text-[11px] text-amber-500">No history yet.</p>
					)}
					{resolutionHistory.map((r) => (
						<div
							key={r.timestamp}
							className="flex items-center gap-2 rounded px-2 py-1 text-[11px]"
						>
							<span
								className={
									r.action === "ignore" ? "text-amber-500" : "text-emerald-500"
								}
							>
								{r.action === "ignore" || r.action === "ignore-undo"
									? "Ignored"
									: r.action === "merge-undo"
										? "Merge undone"
										: "Merged"}
							</span>
							<span className="text-amber-700 dark:text-amber-300">
								{r.groupKey.split(":")[1] ?? r.groupKey}
							</span>
							<span className="ml-auto text-amber-400">
								{formatTimeAgo(r.timestamp)}
							</span>
							{r.action === "merge" && (
								<button
									onClick={() => onUndoMerge(r.timestamp)}
									disabled={undoing}
									className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-100 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-800"
								>
									{undoing ? (
										<Loader2 className="size-3 animate-spin" />
									) : (
										"Undo merge"
									)}
								</button>
							)}
							{(r.action === "ignore" || r.action === "merge-undo") && (
								<span className="text-[10px] text-amber-400">undone</span>
							)}
						</div>
					))}
				</div>
			)}
		</>
	);
}

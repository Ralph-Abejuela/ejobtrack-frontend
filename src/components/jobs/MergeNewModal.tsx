import { useState } from "react";
import { X, Merge, Loader2 } from "lucide-react";
import type { DuplicateGroup } from "@/lib/jobs-db";
import type { JobApplication } from "@/lib/jobs/types";

interface MergeNewModalProps {
	groupKey: string;
	selectedJobs: ReadonlySet<string>;
	duplicates: DuplicateGroup[];
	merging: string | null;
	onMerge: (groupKey: string, company: string, title: string) => void;
	onClose: () => void;
}

export default function MergeNewModal({
	groupKey,
	selectedJobs,
	duplicates,
	merging,
	onMerge,
	onClose,
}: MergeNewModalProps) {
	const group = duplicates.find((g) => g.groupKey === groupKey);
	const selItems = group?.jobs.filter((j) => selectedJobs.has(j.id)) ?? [];
	const longestCompany = selItems.reduce(
		(a, b) => (a.company.length >= b.company.length ? a : b),
		{ company: "" } as JobApplication,
	).company;
	const title = selItems[0]?.jobTitle ?? "";

	const [company, setCompany] = useState(longestCompany);
	const [jobTitle, setJobTitle] = useState(title);

	const isMerging = merging === `new:${groupKey}`;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
			<div className="mx-4 w-full max-w-md rounded-lg border bg-white p-5 shadow-xl dark:bg-gray-900">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-semibold">Merge into New Entry</h3>
					<button
						onClick={onClose}
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="size-4" />
					</button>
				</div>

				<p className="mt-1 text-xs text-muted-foreground">
					{selItems.length} record{selItems.length !== 1 ? "s" : ""} selected.
					All history will be consolidated.
				</p>

				<div className="mt-4 space-y-3">
					<label className="block text-xs font-medium">
						Company
						<input
							value={company}
							onChange={(e) => setCompany(e.target.value)}
							className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
						/>
					</label>
					<label className="block text-xs font-medium">
						Job Title
						<input
							value={jobTitle}
							onChange={(e) => setJobTitle(e.target.value)}
							className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
						/>
					</label>
				</div>

				<div className="mt-5 flex items-center justify-end gap-2">
					<button
						onClick={onClose}
						disabled={isMerging}
						className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						onClick={() => onMerge(groupKey, company.trim(), jobTitle.trim())}
						disabled={isMerging || !company.trim() || !jobTitle.trim()}
						className="inline-flex items-center gap-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
					>
						{isMerging ? (
							<Loader2 className="size-3 animate-spin" />
						) : (
							<Merge className="size-3" />
						)}
						Merge
					</button>
				</div>
			</div>
		</div>
	);
}

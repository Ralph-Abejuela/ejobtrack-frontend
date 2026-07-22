import { useState } from "react";
import { Merge, Loader2 } from "lucide-react";
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
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent showCloseButton={false} className="max-w-md sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Merge into New Entry</DialogTitle>
					<DialogDescription>
						{selItems.length} record{selItems.length !== 1 ? "s" : ""} selected.
						All history will be consolidated.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<label className="flex flex-col gap-1 text-xs font-medium">
						Company
						<Input
							value={company}
							onChange={(e) => setCompany(e.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium">
						Job Title
						<Input
							value={jobTitle}
							onChange={(e) => setJobTitle(e.target.value)}
						/>
					</label>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={onClose}
						disabled={isMerging}
					>
						Cancel
					</Button>
					<Button
						variant="default"
						onClick={() => onMerge(groupKey, company.trim(), jobTitle.trim())}
						disabled={isMerging || !company.trim() || !jobTitle.trim()}
					>
						{isMerging ? (
							<Loader2 data-icon="inline-start" className="animate-spin" />
						) : (
							<Merge data-icon="inline-start" />
						)}
						Merge
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

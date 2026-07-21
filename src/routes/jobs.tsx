import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useJobContext, JobProvider } from "@/components/jobs/JobContext";
import { undoMerge, getResolutionHistory } from "@/lib/jobs-db";
import { useState, useCallback } from "react";
import { Loader2, RefreshCw, Briefcase } from "lucide-react";
import StatusSummary from "@/components/jobs/StatusSummary";
import DuplicatesPanel from "@/components/jobs/DuplicatesPanel";
import JobList from "@/components/jobs/JobList";
import MergeNewModal from "@/components/jobs/MergeNewModal";

export const Route = createFileRoute("/jobs")({
	component: () => (
		<JobProvider>
			<JobsPageInner />
		</JobProvider>
	),
});

function JobsPageInner() {
	const { user } = useAuth();

	if (!user) {
		return (
			<div className="flex items-center justify-center py-20 text-muted-foreground">
				<p className="text-sm">Sign in to track your job applications.</p>
			</div>
		);
	}

	return <JobsContent />;
}

function JobsContent() {
	const {
		jobs,
		statusCounts,
		state,
		loadMore,
		reload,
		grouped,
		expandedJob,
		setExpandedJob,
		visibleDuplicates,
		selectedJobs,
		merging,
		showDuplicates,
		setShowDuplicates,
		showHistory,
		setShowHistory,
		resolutionHistory,
		activeEmailId,
		setActiveEmailId,
		selectedEmail,
		fetchingEmail,
		handleDismiss,
		toggleSelect,
		handleMergeSelected,
		handleMergeNew,
		mergeNewModal,
		setMergeNewModal,
		handleStatusUpdate,
	} = useJobContext();

	const [undoingMerge, setUndoingMerge] = useState(false);

	const handleUndoMerge = useCallback(
		async (timestamp: number) => {
			setUndoingMerge(true);
			try {
				const ok = await undoMerge(timestamp);
				if (ok) {
					getResolutionHistory();
					await reload();
				}
			} finally {
				setUndoingMerge(false);
			}
		},
		[reload],
	);

	const handleToggleExpand = useCallback(
		(jobId: string) => {
			setExpandedJob(expandedJob === jobId ? null : jobId);
		},
		[expandedJob, setExpandedJob],
	);

	return (
		<div className="space-y-6">
			{/* Header */}
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

			{/* Sync error */}
			{state.syncError && (
				<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
					{state.syncError}
				</div>
			)}

			{/* Duplicates */}
			<DuplicatesPanel
				visibleDuplicates={visibleDuplicates}
				selectedJobs={selectedJobs}
				merging={merging}
				showDuplicates={showDuplicates}
				showHistory={showHistory}
				resolutionHistory={resolutionHistory}
				undoing={undoingMerge}
				onToggleDuplicates={() => setShowDuplicates(!showDuplicates)}
				onToggleHistory={() => setShowHistory(!showHistory)}
				onDismiss={handleDismiss}
				onToggleSelect={toggleSelect}
				onMergeSelected={handleMergeSelected}
				onMergeNew={(gk) => setMergeNewModal({ groupKey: gk })}
				onScrollToJob={(jobId) => {
					setExpandedJob(expandedJob === jobId ? null : jobId);
					requestAnimationFrame(() => {
						document
							.getElementById(jobId)
							?.scrollIntoView({ behavior: "smooth", block: "center" });
					});
				}}
				onUndoMerge={handleUndoMerge}
			/>

			{/* Merge into New modal */}
			{mergeNewModal && (
				<MergeNewModal
					groupKey={mergeNewModal.groupKey}
					selectedJobs={selectedJobs}
					duplicates={visibleDuplicates}
					merging={merging}
					onMerge={handleMergeNew}
					onClose={() => setMergeNewModal(null)}
				/>
			)}

			{/* Status summary */}
			<StatusSummary statusCounts={statusCounts} />

			{/* Job list grouped by status */}
			<JobList
				jobs={jobs}
				grouped={grouped}
				expandedJob={expandedJob}
				activeEmailId={activeEmailId}
				selectedEmail={selectedEmail}
				fetchingEmail={fetchingEmail}
				onToggleExpand={handleToggleExpand}
				onSelectEmail={setActiveEmailId}
				onStatusUpdate={handleStatusUpdate}
				syncing={state.syncing}
				lastSyncTime={state.lastSyncTime}
				newCount={state.newCount}
			/>
		</div>
	);
}

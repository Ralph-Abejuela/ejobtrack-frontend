import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useJobContext, JobProvider } from "@/components/jobs/JobContext";
import { undoMerge, getResolutionHistory } from "@/lib/jobs-db";
import { useState, useCallback } from "react";
import { Loader2, RefreshCw, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress, ProgressLabel } from "@/components/ui/progress";
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
		handleDeleteHistoryEntry,
		handleDeleteJob,
		handleUpdateJobTitle,
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
			if (expandedJob === jobId) {
				setExpandedJob(null); // collapse
			} else {
				setExpandedJob(jobId);
				// Reset email view to this job's latest email
				const newJob = jobs.find((j) => j.id === jobId);
				if (newJob) setActiveEmailId(newJob.emailId);
			}
		},
		[expandedJob, setExpandedJob, jobs, setActiveEmailId],
	);

	return (
		<div className="flex flex-col gap-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
					<Briefcase className="size-6" /> Job Applications
				</h1>
				<div className="flex items-center gap-3">
					<span className="hidden sm:inline text-xs text-muted-foreground">
						{state.scannedCount > 0 && (
							<>
								{state.scannedCount.toLocaleString()} scanned
								{state.oldestScanned && (
									<>
										{" \u00B7 "}since {state.oldestScanned}
									</>
								)}
							</>
						)}
					</span>
					{state.syncing && (
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							<Loader2 className="size-3 animate-spin" /> Syncing…
						</span>
					)}
					<Button
						variant="outline"
						onClick={() => loadMore()}
						disabled={state.syncing}
					>
						<RefreshCw
							data-icon="inline-start"
							className={state.syncing ? "animate-spin" : ""}
						/>
						Load Older
					</Button>
				</div>
			</div>

			{/* Progress bar — shown during sync */}
			{state.syncing && state.batchTotal > 0 && (
				<Progress value={(state.batchProcessed / state.batchTotal) * 100}>
					<ProgressLabel>
						Processing {state.batchProcessed} / {state.batchTotal} emails
					</ProgressLabel>
				</Progress>
			)}

			{/* Sync error */}
			{state.syncError && (
				<Alert variant="destructive">
					<AlertTitle>Sync Error</AlertTitle>
					<AlertDescription>{state.syncError}</AlertDescription>
				</Alert>
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
				jobs={jobs.filter((j) => !j.deleted)}
				grouped={grouped}
				expandedJob={expandedJob}
				activeEmailId={activeEmailId}
				selectedEmail={selectedEmail}
				fetchingEmail={fetchingEmail}
				onToggleExpand={handleToggleExpand}
				onSelectEmail={setActiveEmailId}
				onStatusUpdate={handleStatusUpdate}
				onDeleteHistoryEntry={handleDeleteHistoryEntry}
				onDelete={handleDeleteJob}
				onUpdateTitle={handleUpdateJobTitle}
				syncing={state.syncing}
				lastSyncTime={state.lastSyncTime}
				newCount={state.newCount}
			/>
		</div>
	);
}

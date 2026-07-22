import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useJobContext, JobProvider } from "@/components/jobs/JobContext";
import { undoMerge } from "@/lib/jobs-db";
import HiddenJobsPanel from "@/components/jobs/HiddenJobsPanel";
import {
	Sheet,
	SheetTrigger,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useState, useCallback } from "react";
import {
	Loader2,
	RefreshCw,
	Briefcase,
	History as HistoryIcon,
} from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import StatusSummary from "@/components/jobs/StatusSummary";
import { JobsPageSkeleton } from "@/components/jobs/JobsPageSkeleton";
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
	const { user, loading } = useAuth();

	if (loading) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="flex flex-col items-center gap-3">
					<div className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
					<p className="text-sm text-muted-foreground">Loading…</p>
				</div>
			</div>
		);
	}

	if (!user) {
		return (
			<div className="flex flex-col items-center justify-center gap-6 py-20">
				<Briefcase className="size-12 text-muted-foreground" />
				<div className="text-center space-y-2">
					<h2 className="text-xl font-semibold">Sign in to start tracking</h2>
					<p className="text-sm text-muted-foreground">
						Connect your Google account to automatically scan for job
						applications.
					</p>
				</div>
				<GoogleSignInButton />
			</div>
		);
	}

	return <JobsContent />;
}

function JobsContent() {
	const {
		jobs,
		loaded,
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
		resolutionHistory,
		refreshResolutionHistory,
		hiddenJobs,
		restoringId,
		handleRestore,
	} = useJobContext();

	const [undoingMerge, setUndoingMerge] = useState(false);

	const handleUndoMerge = useCallback(
		async (timestamp: number) => {
			setUndoingMerge(true);
			try {
				const ok = await undoMerge(timestamp);
				if (ok) {
					refreshResolutionHistory();
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
				setExpandedJob(null);
			} else {
				setExpandedJob(jobId);
				const newJob = jobs.find((j) => j.id === jobId);
				if (newJob) setActiveEmailId(newJob.emailId);
			}
		},
		[expandedJob, setExpandedJob, jobs, setActiveEmailId],
	);

	if (!loaded) return <JobsPageSkeleton />;

	return (
		<div className="mx-auto md:min-w-2xl w-full max-w-2xl my-6 flex flex-col gap-6">
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

			{state.syncing && state.batchTotal > 0 && (
				<Progress value={(state.batchProcessed / state.batchTotal) * 100}>
					<ProgressLabel>
						Processing {state.batchProcessed} / {state.batchTotal} emails
					</ProgressLabel>
				</Progress>
			)}

			{state.syncError && (
				<Alert variant="destructive">
					<AlertTitle>Sync Error</AlertTitle>
					<AlertDescription>{state.syncError}</AlertDescription>
				</Alert>
			)}

			<div className="flex items-center gap-2">
				<Sheet>
					<SheetTrigger render={<Button variant="outline" size="sm" />}>
						<HistoryIcon data-icon="inline-start" />
						History &amp; Hidden
					</SheetTrigger>
					<SheetContent side="right">
						<SheetHeader>
							<SheetTitle>History &amp; Hidden Jobs</SheetTitle>
						</SheetHeader>
						<div className="flex-1 overflow-y-auto">
							<HiddenJobsPanel
								resolutionHistory={resolutionHistory}
								deletedJobs={hiddenJobs}
								restoringId={restoringId}
								onRestore={handleRestore}
								onUndoMerge={handleUndoMerge}
								undoing={undoingMerge}
							/>
						</div>
					</SheetContent>
				</Sheet>
			</div>

			<DuplicatesPanel
				visibleDuplicates={visibleDuplicates}
				selectedJobs={selectedJobs}
				merging={merging}
				showDuplicates={showDuplicates}
				onToggleDuplicates={() => setShowDuplicates(!showDuplicates)}
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
			/>

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

			<StatusSummary statusCounts={statusCounts} />

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

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
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import StatusSummary from "@/components/jobs/StatusSummary";
import { JobsPageSkeleton } from "@/components/jobs/JobsPageSkeleton";
import DuplicatesPanel from "@/components/jobs/DuplicatesPanel";
import JobList from "@/components/jobs/JobList";

export const Route = createFileRoute("/jobs")({
	component: () => (
		<JobProvider>
			<JobsPageInner />
		</JobProvider>
	),
});

function JobsPageInner() {
	const { user, loading, signIn } = useAuth();

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
				<Button
					onClick={signIn}
					disabled={loading}
					className={
						"gap-2.5 h-auto px-6 py-[10px] " +
						"bg-white text-[#1F1F1F] " +
						"border border-[#747775] " +
						"font-['Google_Sans',system-ui,sans-serif] font-medium " +
						"text-sm leading-5 " +
						"hover:bg-[#F8F8F8] hover:text-[#1F1F1F] " +
						"dark:bg-[#131314] dark:text-[#E3E3E3] dark:border-[#8E918F] " +
						"dark:hover:bg-[#1A1A1A] dark:hover:text-[#E3E3E3] " +
						"shadow-none"
					}
				>
					{loading ? (
						<Loader2 className="size-5 animate-spin" />
					) : (
						<svg
							className="size-5 shrink-0"
							viewBox="0 0 40 40"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							aria-hidden="true"
						>
							<path
								d="M20 0.5C30.7696 0.5 39.5 9.23045 39.5 20C39.5 30.7696 30.7696 39.5 20 39.5C9.23045 39.5 0.5 30.7696 0.5 20C0.5 9.23045 9.23045 0.5 20 0.5Z"
								fill="white"
							/>
							<path
								d="M20 0.5C30.7696 0.5 39.5 9.23045 39.5 20C39.5 30.7696 30.7696 39.5 20 39.5C9.23045 39.5 0.5 30.7696 0.5 20C0.5 9.23045 9.23045 0.5 20 0.5Z"
								stroke="#747775"
							/>
							<path
								d="M29.3987 18.1814H19.9849V22.0445H25.3598C25.1286 23.294 24.4294 24.3596 23.3676 25.0712C22.4746 25.6716 21.3266 26.0211 19.9849 26.0211C17.3864 26.0211 15.1823 24.2666 14.3947 21.9004C14.1952 21.2989 14.0853 20.6599 14.0853 19.9983C14.0853 19.3367 14.1952 18.6966 14.3947 18.0962C15.1823 15.7311 17.3864 13.9755 19.9849 13.9755C21.4524 13.9755 22.767 14.4816 23.8039 15.4713L26.6653 12.6057C24.936 10.9908 22.6786 10 19.9849 10C16.0832 10 12.705 12.2414 11.0618 15.5076C10.383 16.8592 10 18.3834 10 19.9994C10 21.6155 10.383 23.1396 11.0618 24.4913C12.705 27.7597 16.0832 30 19.9849 30C22.6797 30 24.9485 29.1137 26.6018 27.5861C28.4887 25.8452 29.5732 23.2702 29.5732 20.2275C29.5732 19.5182 29.5131 18.835 29.3987 18.1825V18.1814Z"
								fill="#4285F4"
							/>
						</svg>
					)}
					{loading ? "Signing in…" : "Sign in with Google"}
				</Button>
			</div>
		);
	}

	return <JobsContent />;
}

function JobsContent() {
	const { user } = useAuth();
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
			if (!user?.email) return;
			setUndoingMerge(true);
			try {
				const ok = await undoMerge(user.email, timestamp);
				if (ok) {
					refreshResolutionHistory();
					await reload();
				}
			} finally {
				setUndoingMerge(false);
			}
		},
		[user?.email, reload],
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
				onScrollToJob={(jobId) => {
					setExpandedJob(expandedJob === jobId ? null : jobId);
					requestAnimationFrame(() => {
						document
							.getElementById(jobId)
							?.scrollIntoView({ behavior: "smooth", block: "center" });
					});
				}}
			/>

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

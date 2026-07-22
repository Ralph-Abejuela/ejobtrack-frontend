import { Skeleton } from "@/components/ui/skeleton";

export function JobsPageSkeleton() {
	return (
		<div className="mx-auto md:min-w-2xl w-full max-w-2xl my-6 flex flex-col gap-6">
			{/* Title row */}
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-56" />
				<Skeleton className="h-9 w-28" />
			</div>

			{/* Status summary cards */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<div
						key={i}
						className="flex flex-col gap-2 rounded-lg border bg-card p-4"
					>
						<div className="flex items-center gap-2">
							<Skeleton className="size-5 shrink-0 rounded-full" />
							<Skeleton className="h-4 w-16" />
						</div>
						<Skeleton className="mt-1 h-7 w-10" />
					</div>
				))}
			</div>

			{/* Section header */}
			<div className="flex items-center gap-2">
				<Skeleton className="size-4 shrink-0 rounded-full" />
				<Skeleton className="h-5 w-24" />
			</div>

			{/* Job card skeletons */}
			<div className="divide-y rounded-lg border bg-card">
				{Array.from({ length: 4 }).map((_, i) => {
					const widths = ["w-52", "w-48", "w-56", "w-44"];
					const subWidths = ["w-36", "w-40", "w-32", "w-28"];
					return (
						<div
							key={i}
							className="flex items-center justify-between px-4 py-3"
						>
							<div className="flex flex-col gap-1.5">
								<Skeleton className={`h-4 ${widths[i]}`} />
								<Skeleton className={`h-3 ${subWidths[i]}`} />
							</div>
							<Skeleton className="h-3 w-14 shrink-0" />
						</div>
					);
				})}
			</div>
		</div>
	);
}

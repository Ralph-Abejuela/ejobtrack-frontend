import { X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { STCFG } from "./config";

interface TimelineProps {
	history: { status: string; date: string; emailId: string }[];
	jobId: string;
	selectedEmailId: string | null;
	onSelect: (emailId: string | null) => void;
	onDeleteEntry: (jobId: string, index: number) => void;
}

export default function Timeline({
	history,
	jobId,
	selectedEmailId,
	onSelect,
	onDeleteEntry,
}: TimelineProps) {
	const sorted = [...history].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);

	const handleClick = (h: (typeof sorted)[number]) => {
		onSelect(selectedEmailId === h.emailId ? null : h.emailId);
	};

	if (sorted.length < 2) {
		const h = sorted[0];
		if (!h) return null;
		const cfg = STCFG[h.status] ?? STCFG.unknown;
		const Icon = cfg.icon;
		const isSelected = selectedEmailId === h.emailId;
		const isManual = h.emailId === "manual";
		return (
			<div className="relative flex items-center justify-center">
				<button
					onClick={() => handleClick(h)}
					className={`flex w-full items-center justify-center gap-2 rounded py-2 transition-colors hover:bg-muted/40 ${isSelected ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
				>
					<div className={`rounded-full p-1.5 ${cfg.bg}`}>
						<Icon className={`size-4 ${cfg.color}`} />
					</div>
					<div className="text-xs">
						<span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
						<span className="ml-1.5 text-muted-foreground">
							{formatDate(h.date)}
						</span>
						{isManual && (
							<span className="ml-1.5 italic text-muted-foreground/60">
								set by user
							</span>
						)}
					</div>
				</button>
				{isManual && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onDeleteEntry(jobId, 0);
						}}
						className="absolute -right-1 top-0 rounded-full p-0.5 text-muted-foreground/40 transition-colors hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/30"
						title="Remove from timeline"
					>
						<X className="size-3" />
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="flex items-center justify-center gap-0 py-3">
			{sorted.map((h, i) => {
				const cfg = STCFG[h.status] ?? STCFG.unknown;
				const Icon = cfg.icon;
				const isLast = i === sorted.length - 1;
				const isSelected = selectedEmailId === h.emailId;
				const isManual = h.emailId === "manual";
				return (
					<div key={i} className="relative flex items-center">
						<button
							onClick={() => handleClick(h)}
							className={`flex items-center rounded p-1 transition-colors hover:bg-muted/40 ${isSelected ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
						>
							<div className="flex flex-col items-center gap-1">
								<div className={`rounded-full p-1.5 ${cfg.bg}`}>
									<Icon className={`size-3.5 ${cfg.color}`} />
								</div>
								<span
									className={`text-[10px] font-medium leading-tight ${cfg.color}`}
								>
									{cfg.label}
								</span>
								<span className="text-[10px] text-muted-foreground leading-tight">
									{formatDate(h.date)}
								</span>
								{isManual && (
									<span className="text-[9px] italic leading-tight text-muted-foreground/50">
										manual
									</span>
								)}
							</div>
						</button>
						{isManual && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onDeleteEntry(jobId, i);
								}}
								className="absolute -right-2.5 -top-1 rounded-full p-0.5 text-muted-foreground/40 transition-colors hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/30"
								title="Remove from timeline"
							>
								<X className="size-2.5" />
							</button>
						)}
						{!isLast && <div className="mx-1 h-px w-8 bg-border sm:w-12" />}
					</div>
				);
			})}
		</div>
	);
}

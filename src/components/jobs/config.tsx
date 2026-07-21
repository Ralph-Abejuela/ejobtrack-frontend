import {
	CheckCircle2,
	Eye,
	CalendarCheck,
	Award,
	XCircle,
	HelpCircle,
	type LucideIcon,
} from "lucide-react";
import { JobStatus } from "@/lib/jobs/types";

export const STATUS_ORDER = [
	JobStatus.APPLIED,
	JobStatus.VIEWED,
	JobStatus.INTERVIEW,
	JobStatus.OFFER,
	JobStatus.REJECTED,
	JobStatus.UNKNOWN,
] as const;

export const STCFG: Record<
	string,
	{ label: string; icon: LucideIcon; color: string; bg: string }
> = {
	[JobStatus.APPLIED]: {
		label: "Applied",
		icon: CheckCircle2,
		color: "text-blue-600 dark:text-blue-400",
		bg: "bg-blue-50 dark:bg-blue-950",
	},
	[JobStatus.VIEWED]: {
		label: "Viewed",
		icon: Eye,
		color: "text-purple-600 dark:text-purple-400",
		bg: "bg-purple-50 dark:bg-purple-950",
	},
	[JobStatus.INTERVIEW]: {
		label: "Interview",
		icon: CalendarCheck,
		color: "text-amber-600 dark:text-amber-400",
		bg: "bg-amber-50 dark:bg-amber-950",
	},
	[JobStatus.OFFER]: {
		label: "Offer",
		icon: Award,
		color: "text-green-600 dark:text-green-400",
		bg: "bg-green-50 dark:bg-green-950",
	},
	[JobStatus.REJECTED]: {
		label: "Rejected",
		icon: XCircle,
		color: "text-red-600 dark:text-red-400",
		bg: "bg-red-50 dark:bg-red-950",
	},
	[JobStatus.UNKNOWN]: {
		label: "Unknown",
		icon: HelpCircle,
		color: "text-gray-500",
		bg: "bg-gray-50 dark:bg-gray-950",
	},
};

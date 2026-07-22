import { STCFG, STATUS_ORDER } from "./config";
import { Card, CardContent } from "@/components/ui/card";

export default function StatusSummary({
	statusCounts,
}: {
	statusCounts: Record<string, number>;
}) {
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
			{STATUS_ORDER.map((s) => {
				const cfg = STCFG[s];
				const Icon = cfg.icon;
				const count = statusCounts[s] ?? 0;
				return (
					<Card key={s} size="sm">
						<CardContent className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<Icon
									className={`size-5 shrink-0 ${cfg.color}`}
									strokeWidth={1.5}
								/>
								<span className="text-sm font-medium">{cfg.label}</span>
							</div>
							<p className={`text-2xl font-bold ${cfg.color}`}>{count}</p>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}

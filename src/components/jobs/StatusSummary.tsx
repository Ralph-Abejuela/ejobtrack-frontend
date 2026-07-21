import { STCFG, STATUS_ORDER } from "./config";

export default function StatusSummary({
	statusCounts,
}: {
	statusCounts: Record<string, number>;
}) {
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
			{STATUS_ORDER.map((s) => {
				const cfg = STCFG[s];
				const Icon = cfg.icon;
				const count = statusCounts[s] ?? 0;
				return (
					<div key={s} className="rounded-lg border p-3">
						<div className="flex items-center gap-2">
							<Icon className={`size-4 ${cfg.color}`} />
							<span className="text-sm font-medium">{cfg.label}</span>
						</div>
						<p className={`mt-1 text-2xl font-bold ${cfg.color}`}>{count}</p>
					</div>
				);
			})}
		</div>
	);
}

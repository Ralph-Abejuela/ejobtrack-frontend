import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

/**
 * Catches uncaught React errors and shows a fallback UI instead of blank page.
 * Wraps the app in main.tsx.
 */
export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[ErrorBoundary]", error, info.componentStack);
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback;

			return (
				<div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
					<AlertCircle className="size-12 text-destructive" />
					<h2 className="text-xl font-semibold">Something went wrong</h2>
					<p className="max-w-md text-sm text-muted-foreground">
						{this.state.error?.message || "An unexpected error occurred."}
					</p>
					<Button onClick={this.handleReset}>
						<RefreshCw data-icon="inline-start" />
						Try Again
					</Button>
				</div>
			);
		}

		return this.props.children;
	}
}

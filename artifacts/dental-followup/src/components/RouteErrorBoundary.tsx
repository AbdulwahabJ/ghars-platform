import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => Promise<unknown>;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route render failed", error, info);
  }

  private retry = async () => {
    await this.props.onRetry();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const isArabic = document.documentElement.lang !== "en";
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <section
          className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm"
          role="alert"
        >
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <h1 className="mb-5 text-xl font-bold text-foreground">
            {isArabic
              ? "تعذر تحميل هذا الجزء من الصفحة."
              : "Unable to load this section."}
          </h1>
          <Button onClick={() => void this.retry()} variant="outline">
            {isArabic ? "إعادة المحاولة" : "Retry"}
          </Button>
        </section>
      </main>
    );
  }
}
import React from "react";
import { c, log } from "architecture";
import { t } from "architecture/lang";

interface HookErrorBoundaryProps {
  children: React.ReactNode;
}

interface HookErrorBoundaryState {
  error: Error | null;
}

/**
 * Guards the property-hooks React tree (#327 hardening). React unmounts an entire root when a render or
 * effect throws — which is exactly the "all my hooks disappeared until I reopened settings" symptom. This
 * boundary catches any such throw, **logs the real error** (so it is diagnosable), and shows a recoverable
 * fallback instead of a blank panel, so a single bad hook can never wipe the whole configuration UI.
 */
export class HookErrorBoundary extends React.Component<HookErrorBoundaryProps, HookErrorBoundaryState> {
  constructor(props: HookErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): HookErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    log.error("[PropertyHooks] the hooks settings UI crashed while rendering", error, info?.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className={c("property-hooks-error")}>
          <div className={c("property-hooks-error-title")}>{t("property_hooks_render_error")}</div>
          <div className={c("property-hooks-error-detail")}>{this.state.error.message}</div>
          <button className={c("property-hooks-btn", "property-hooks-btn--cta")} onClick={this.reset}>
            {t("property_hooks_reload")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

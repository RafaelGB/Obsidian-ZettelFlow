import React, { Component, ErrorInfo, ReactNode } from "react";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import {
  RecoveryAction,
  describeFailure,
  recoveryActions,
} from "./wizardRecovery";

export interface WizardErrorBoundaryProps {
  children: ReactNode;
  /** What broke, for the message and the log line. */
  label: string;
  /** Recoveries the host can actually perform; an absent handler is not offered. */
  onRetry?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  onBuild?: () => void;
}

interface BoundaryState {
  failure?: string;
  retried: boolean;
}

type LocaleKey = Parameters<typeof t>[0];

/** Literal keys, so the #320 unrendered-strings guardrail can see all four. */
const LABELS: Record<RecoveryAction, LocaleKey> = {
  retry: "wizard_error_retry",
  back: "wizard_error_back",
  skip: "wizard_error_skip",
  build: "wizard_error_build",
};

/**
 * Contains a component that throws while rendering (#417, epic #405).
 *
 * React unmounts the whole tree on an uncaught render error, so one broken step used to leave an
 * empty modal — no message, no failing step named, and no way to keep the answers already given.
 * This keeps the wizard on screen, says what failed, logs it, and offers only the recoveries that
 * exist in that situation. It is the same discipline #327 applied to the hooks panel: one bad row
 * can never blank the rest.
 */
export class WizardErrorBoundary extends Component<WizardErrorBoundaryProps, BoundaryState> {
  constructor(props: WizardErrorBoundaryProps) {
    super(props);
    this.state = { retried: false };
  }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { failure: describeFailure(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    log.error(
      `[note builder] ${this.props.label} failed to render: ${describeFailure(error)}${
        info.componentStack ? ` — ${info.componentStack.trim().split("\n")[0]}` : ""
      }`
    );
  }

  private handlers(): Partial<Record<RecoveryAction, () => void>> {
    return {
      retry: () => {
        // A second failure must report itself rather than offering the same button again.
        this.setState({ failure: undefined, retried: true });
        this.props.onRetry?.();
      },
      back: this.props.onBack,
      skip: this.props.onSkip,
      build: this.props.onBuild,
    };
  }

  render(): ReactNode {
    const { failure, retried } = this.state;
    if (!failure) return this.props.children;

    const handlers = this.handlers();
    const offered = recoveryActions({
      canGoBack: Boolean(this.props.onBack),
      canSkip: Boolean(this.props.onSkip),
      hasContent: Boolean(this.props.onBuild),
      retried,
    });

    return (
      <div className={c("wizard-state", "wizard-state-error")} role="alert">
        <Icon name="alert-triangle" />
        <div className={c("wizard-error-body")}>
          <p className={c("wizard-state-message")}>
            {t("wizard_error_title", this.props.label)}
          </p>
          <p className={c("wizard-error-detail")}>{failure}</p>
          <div className={c("wizard-error-actions")}>
            {offered.map((action) => {
              const handler = handlers[action];
              if (!handler) return null;
              return (
                <button key={action} type="button" onClick={handler}>
                  {t(LABELS[action])}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
}

export interface WizardStep {
  label: string;
  disabled?: boolean;
}

interface WizardStepsProps {
  steps: WizardStep[];
  activeIndex: number;
}

/** Step header from the prototype's "Create event wizard" screen. */
export function WizardSteps({ steps, activeIndex }: WizardStepsProps) {
  return (
    <ol className="steps" aria-label="Create event progress">
      {steps.map((step, i) => {
        const active = i === activeIndex;
        const className = [
          'step',
          active && 'step--active',
          step.disabled && 'step--disabled',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li key={step.label} className={className} aria-current={active ? 'step' : undefined}>
            <span className="step__index">Step {i + 1}</span>
            <span className="step__label">{step.label}</span>
            {step.disabled && <span className="sr-only"> (coming soon)</span>}
          </li>
        );
      })}
    </ol>
  );
}

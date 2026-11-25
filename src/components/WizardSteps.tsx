import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  return (
    <ol className="steps" aria-label={t('wizard.progressLabel')}>
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
            <span className="step__index">{t('wizard.step', { n: i + 1 })}</span>
            <span className="step__label">{step.label}</span>
            {step.disabled && <span className="sr-only"> {t('wizard.comingSoon')}</span>}
          </li>
        );
      })}
    </ol>
  );
}

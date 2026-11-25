import { useTranslation } from 'react-i18next';
import { WizardSteps } from '../../components/WizardSteps';

export type SetupStep = 'details' | 'tickets' | 'activation' | 'review';

const STEPS: { step: SetupStep; labelKey: `wizard.steps.${'details' | 'tickets' | 'activation' | 'review'}` }[] = [
  { step: 'details', labelKey: 'wizard.steps.details' },
  { step: 'tickets', labelKey: 'wizard.steps.tickets' },
  { step: 'activation', labelKey: 'wizard.steps.activation' },
  { step: 'review', labelKey: 'wizard.steps.review' },
];

/** The four-step header from prototype screen 3. */
export function SetupSteps({ active }: { active: SetupStep }) {
  const { t } = useTranslation();
  return (
    <WizardSteps
      steps={STEPS.map(({ labelKey }) => ({ label: t(labelKey) }))}
      activeIndex={STEPS.findIndex((s) => s.step === active)}
    />
  );
}

import { useTranslation } from 'react-i18next';
import GuidedTour, { type TourStep } from '@/components/GuidedTour';

export type TranslatedTourTarget = {
  target: string;
  /** Translation suffix. Defaults to the target name. */
  key?: string;
};

type TranslatedGuidedTourProps = {
  tourKey: string;
  targets: TranslatedTourTarget[];
};

/**
 * Keeps page tours consistent and localised. Text lives at:
 * app_profile.guided_tours.<tourKey>.<stepKey>_{title,desc}
 */
export default function TranslatedGuidedTour({ tourKey, targets }: TranslatedGuidedTourProps) {
  const { t } = useTranslation();
  const steps: TourStep[] = targets.map(({ target, key = target }) => ({
    target,
    title: t(`app_profile.guided_tours.${tourKey}.${key}_title`),
    description: t(`app_profile.guided_tours.${tourKey}.${key}_desc`),
  }));

  return <GuidedTour tourKey={tourKey} steps={steps} />;
}

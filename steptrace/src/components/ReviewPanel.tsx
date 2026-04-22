import { Button, Title2, Title3, Text, Divider } from '@fluentui/react-components';
import { ArrowExportRegular, CameraOff24Regular } from '@fluentui/react-icons';
import { useTranslation } from 'react-i18next';
import type { Session, Step, Highlight, Spotlight } from '../types';
import { StepCard } from './StepCard';

interface Props {
  session: Session;
  steps: Step[];
  sessionsDir: string;
  onDelete: (id: string) => void;
  onAnnotate: (id: string, text: string) => void;
  onHighlight: (id: string, h: Highlight) => void;
  onSpotlight: (id: string, s: Spotlight | null) => void;
  onCrop: (id: string, x: number, y: number, w: number, h: number) => Promise<void>;
  onUpdateLogNote: (id: string, note: string | undefined) => void;
  onDeleteLogSnippet: (id: string) => void;
  onExport: () => void;
  onDuplicate: (id: string) => void;
}

export function ReviewPanel({
  session, steps, sessionsDir, onDelete, onAnnotate, onHighlight, onSpotlight,
  onCrop, onUpdateLogNote, onDeleteLogSnippet, onExport, onDuplicate,
}: Props) {
  const { t } = useTranslation();
  const duration = session.ended_at
    ? Math.round(
        (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000
      )
    : 0;

  const isEmpty = steps.length === 0;

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title2>{t('review.title')}</Title2>
          <Text size={300} style={{ color: 'var(--colorNeutralForeground3)' }}>
            {steps.length === 1 ? t('review.step_count', { count: 1 }) : t('review.step_count_plural', { count: steps.length })}
            {' · '}
            {t('review.duration', { min: Math.floor(duration / 60), sec: duration % 60 })}
          </Text>
        </div>
        <Button
          appearance="primary"
          icon={<ArrowExportRegular />}
          onClick={onExport}
          disabled={isEmpty}
          title={isEmpty ? t('review.export_disabled_title') : t('review.export_title')}
        >
          {t('review.export')}
        </Button>
      </div>
      <Divider style={{ marginBottom: 16 }} />

      {isEmpty ? (
        <div
          className="strider-fadein"
          style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '48px 16px', gap: 12, textAlign: 'center',
            border: '1px dashed var(--colorNeutralStroke2)',
            borderRadius: 8,
            background: 'var(--colorNeutralBackground2)',
          }}
        >
          <CameraOff24Regular
            style={{
              width: 48, height: 48,
              color: 'var(--colorNeutralForeground3)',
            }}
          />
          <Title3>{t('review.empty_title')}</Title3>
          <Text size={200} style={{ color: 'var(--colorNeutralForeground3)', maxWidth: 440 }}>
            {t('review.empty_hint')}
          </Text>
        </div>
      ) : (
        steps.map(step => (
          <StepCard
            key={step.id}
            step={step}
            sessionsDir={sessionsDir}
            onDelete={onDelete}
            onAnnotate={onAnnotate}
            onHighlight={onHighlight}
            onSpotlight={onSpotlight}
            onCrop={onCrop}
            onUpdateLogNote={onUpdateLogNote}
            onDeleteLogSnippet={onDeleteLogSnippet}
            onDuplicate={onDuplicate}
          />
        ))
      )}
    </div>
  );
}

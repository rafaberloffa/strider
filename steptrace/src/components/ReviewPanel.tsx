import { Button, Title2, Title3, Text, Divider } from '@fluentui/react-components';
import { ArrowExportRegular, CameraOff24Regular } from '@fluentui/react-icons';
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
}

export function ReviewPanel({
  session, steps, sessionsDir, onDelete, onAnnotate, onHighlight, onSpotlight,
  onCrop, onUpdateLogNote, onDeleteLogSnippet, onExport,
}: Props) {
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
          <Title2>Revisão da Sessão</Title2>
          <Text size={300} style={{ color: 'var(--colorNeutralForeground3)' }}>
            {steps.length} passos · {Math.floor(duration / 60)}min {duration % 60}s
          </Text>
        </div>
        <Button
          appearance="primary"
          icon={<ArrowExportRegular />}
          onClick={onExport}
          disabled={isEmpty}
          title={isEmpty ? 'Sem passos para exportar' : 'Exportar sessão'}
        >
          Exportar
        </Button>
      </div>
      <Divider style={{ marginBottom: 16 }} />

      {isEmpty ? (
        <div
          className="steptrace-fadein"
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
          <Title3>Nenhum passo capturado</Title3>
          <Text size={200} style={{ color: 'var(--colorNeutralForeground3)', maxWidth: 440 }}>
            Nenhuma mudança de foco foi detectada nesta sessão. Inicie uma nova gravação
            (<strong>Win+Shift+R</strong>) e alterne entre janelas para capturar passos.
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
          />
        ))
      )}
    </div>
  );
}

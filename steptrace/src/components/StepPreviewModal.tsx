import { Dialog, DialogSurface, DialogBody, DialogTitle, Button, Text } from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import type { Step } from '../types';

interface Props {
  step: Step | null;
  sessionsDir: string;
  onClose: () => void;
}

export function StepPreviewModal({ step, sessionsDir, onClose }: Props) {
  const { t, i18n } = useTranslation();
  if (!step) return null;
  const rawPath = `${sessionsDir}/${step.session_id}/${step.image_path}`.replace(/\\/g, '/');
  const src = convertFileSrc(rawPath, 'asset');
  const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(step.timestamp));

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '92vw', width: 'auto' }}>
        <DialogBody>
          <DialogTitle
            action={<Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} />}
          >
            {t('step_preview.title', { seq: step.sequence })} — {step.window_title}
          </DialogTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '80vh', overflow: 'auto' }}>
            <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
              {time} · {step.process_name} · {step.monitor_label}
            </Text>
            <img
              src={src}
              alt={t('step_preview.alt', { seq: step.sequence })}
              style={{
                maxWidth: '100%',
                height: 'auto',
                border: '1px solid var(--colorNeutralStroke1)',
                borderRadius: 4,
              }}
            />
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

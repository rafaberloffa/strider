import { Dialog, DialogSurface, DialogBody, DialogTitle, Button, Text } from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Step } from '../types';

interface Props {
  step: Step | null;
  sessionsDir: string;
  onClose: () => void;
}

export function StepPreviewModal({ step, sessionsDir, onClose }: Props) {
  if (!step) return null;
  const rawPath = `${sessionsDir}/${step.session_id}/${step.image_path}`.replace(/\\/g, '/');
  const src = convertFileSrc(rawPath, 'asset');
  const time = new Date(step.timestamp).toLocaleTimeString('pt-BR');

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '92vw', width: 'auto' }}>
        <DialogBody>
          <DialogTitle
            action={<Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} />}
          >
            Passo #{step.sequence} — {step.window_title}
          </DialogTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '80vh', overflow: 'auto' }}>
            <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
              {time} · {step.process_name} · {step.monitor_label}
            </Text>
            <img
              src={src}
              alt={`Passo ${step.sequence}`}
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

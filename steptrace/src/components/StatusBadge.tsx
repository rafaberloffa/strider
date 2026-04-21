import { Badge } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import type { AppStatus } from '../types';

interface Props { status: AppStatus; }

export function StatusBadge({ status }: Props) {
  const { t } = useTranslation();
  const map = {
    idle:      { color: 'subtle'  as const, label: t('status.idle') },
    recording: { color: 'danger'  as const, label: t('status.recording') },
    paused:    { color: 'warning' as const, label: t('status.paused') },
  };
  const { color, label } = map[status];
  return (
    <Badge
      color={color}
      size="large"
      className={status === 'recording' ? 'strider-recording-badge' : undefined}
    >
      {label}
    </Badge>
  );
}

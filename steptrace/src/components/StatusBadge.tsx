import { Badge } from '@fluentui/react-components';
import type { AppStatus } from '../types';

interface Props { status: AppStatus; }

export function StatusBadge({ status }: Props) {
  const map = {
    idle:      { color: 'subtle'  as const, label: 'Pronto' },
    recording: { color: 'danger'  as const, label: '● Gravando' },
    paused:    { color: 'warning' as const, label: '⏸ Pausado' },
  };
  const { color, label } = map[status];
  return (
    <Badge
      color={color}
      size="large"
      className={status === 'recording' ? 'steptrace-recording-badge' : undefined}
    >
      {label}
    </Badge>
  );
}

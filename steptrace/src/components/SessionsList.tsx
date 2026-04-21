import { Card, Button, Text, Divider, Title3 } from '@fluentui/react-components';
import { Open24Regular, Delete24Regular } from '@fluentui/react-icons';
import { useTranslation } from 'react-i18next';
import type { SessionMeta } from '../types';
import { formatDuration } from '../utils/format';

interface Props {
  sessions: SessionMeta[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SessionsList({ sessions, onOpen, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  if (sessions.length === 0) {
    return (
      <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
        {t('sessions_list.empty')}
      </Text>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 640 }}>
      <Title3>{t('sessions_list.title')}</Title3>
      <Divider />
      {sessions.map(s => {
        const when = new Intl.DateTimeFormat(i18n.language, {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).format(new Date(s.started_at));
        const dur = formatDuration(s.started_at, s.ended_at);
        return (
          <Card key={s.id} style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text weight="semibold">{when}</Text>
                <br />
                <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
                  {t('sessions_list.step_count', { count: s.step_count })} {dur && `· ${dur}`}
                </Text>
              </div>
              <Button icon={<Open24Regular />} onClick={() => onOpen(s.id)}>{t('sessions_list.open')}</Button>
              <Button
                appearance="subtle"
                icon={<Delete24Regular />}
                onClick={() => onDelete(s.id)}
                title={t('sessions_list.delete')}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

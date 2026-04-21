import { Card, Button, Text, Divider, Title3 } from '@fluentui/react-components';
import { Open24Regular, Delete24Regular } from '@fluentui/react-icons';
import type { SessionMeta } from '../types';
import { formatDuration } from '../utils/format';

interface Props {
  sessions: SessionMeta[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SessionsList({ sessions, onOpen, onDelete }: Props) {
  if (sessions.length === 0) {
    return (
      <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
        Nenhuma sessão salva. (sessões são apagadas após o tempo configurado)
      </Text>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 640 }}>
      <Title3>Sessões recentes</Title3>
      <Divider />
      {sessions.map(s => {
        const when = new Date(s.started_at).toLocaleString('pt-BR');
        const dur = formatDuration(s.started_at, s.ended_at);
        return (
          <Card key={s.id} style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text weight="semibold">{when}</Text>
                <br />
                <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
                  {s.step_count} passos {dur && `· ${dur}`}
                </Text>
              </div>
              <Button icon={<Open24Regular />} onClick={() => onOpen(s.id)}>Abrir</Button>
              <Button
                appearance="subtle"
                icon={<Delete24Regular />}
                onClick={() => onDelete(s.id)}
                title="Apagar"
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

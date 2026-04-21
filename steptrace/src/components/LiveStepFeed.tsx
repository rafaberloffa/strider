import { Text, Badge } from '@fluentui/react-components';
import { ChevronDown20Regular, ChevronUp20Regular } from '@fluentui/react-icons';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import type { Step } from '../types';

interface Props {
  steps: Step[];
  sessionsDir: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onItemClick: (step: Step) => void;
}

export function LiveStepFeed({
  steps, sessionsDir, collapsed, onToggleCollapse, onItemClick,
}: Props) {
  const { t, i18n } = useTranslation();
  const recent = steps.slice(-50).slice().reverse();

  return (
    <div style={{
      borderTop: '1px solid var(--colorNeutralStroke1)',
      background: 'var(--colorNeutralBackground2)',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      height: collapsed ? 32 : 148,
      transition: 'height 0.18s ease',
      overflow: 'hidden',
    }}>
      <div
        onClick={onToggleCollapse}
        style={{
          height: 32,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--colorNeutralStroke1)',
        }}
      >
        {collapsed ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
        <Text size={200} weight="semibold">{t('live_feed.title')}</Text>
        <Badge appearance="filled" color="informative" size="small">{steps.length}</Badge>
        <Text size={100} style={{ color: 'var(--colorNeutralForeground3)' }}>
          {steps.length === 1 ? t('live_feed.step_count_one') : t('live_feed.step_count_other', { count: steps.length })}
        </Text>
      </div>

      {!collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: 4 }}>
          {recent.length === 0 && (
            <Text size={200} style={{ color: 'var(--colorNeutralForeground3)', padding: '8px 8px' }}>
              {t('live_feed.waiting')}
            </Text>
          )}
          {recent.map(step => {
            const rawPath = `${sessionsDir}/${step.session_id}/${step.image_path}`.replace(/\\/g, '/');
            const src = convertFileSrc(rawPath, 'asset');
            const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(step.timestamp));
            const isClick = step.action_type === 'click';

            return (
              <div
                key={step.id}
                className="strider-fadein"
                onClick={() => onItemClick(step)}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--colorNeutralBackground3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '3px 6px',
                  borderRadius: 4,
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              >
                <img
                  src={src}
                  alt=""
                  style={{ width: 88, height: 52, objectFit: 'cover', borderRadius: 3, flexShrink: 0, border: '1px solid var(--colorNeutralStroke1)' }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Badge size="small" appearance="outline" color={isClick ? 'danger' : 'informative'}>
                      #{step.sequence}
                    </Badge>
                    {isClick && <Badge size="small" appearance="filled" color="danger">{t('stepcard.click_badge')}</Badge>}
                  </div>
                  <Text
                    size={200}
                    weight="semibold"
                    style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {step.window_title}
                  </Text>
                  <Text size={100} style={{ color: 'var(--colorNeutralForeground3)' }}>
                    {step.process_name} · {time}
                  </Text>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

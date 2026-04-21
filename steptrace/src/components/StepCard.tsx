import { useState, useRef, useMemo } from 'react';
import {
  Card, CardHeader, Button, Textarea, Text, Tooltip, Badge, Input,
} from '@fluentui/react-components';
import {
  Delete24Regular, Note24Regular, Dismiss20Regular,
  PaintBrush24Regular, Crop24Regular, Dismiss16Regular, ZoomIn24Regular,
} from '@fluentui/react-icons';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import type { Step, Highlight, Spotlight } from '../types';

interface Props {
  step: Step;
  onDelete: (id: string) => void;
  onAnnotate: (id: string, text: string) => void;
  onHighlight: (id: string, h: Highlight) => void;
  onSpotlight: (id: string, s: Spotlight | null) => void;
  onCrop: (id: string, x: number, y: number, w: number, h: number) => Promise<void>;
  onUpdateLogNote: (id: string, note: string | undefined) => void;
  onDeleteLogSnippet: (id: string) => void;
  sessionsDir: string;
}

type Mode = 'none' | 'highlight' | 'spotlight' | 'crop';

export function StepCard({
  step, onDelete, onAnnotate, onHighlight, onSpotlight, onCrop,
  onUpdateLogNote, onDeleteLogSnippet, sessionsDir,
}: Props) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [annotation, setAnnotation] = useState(step.annotation ?? '');
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(step.log_snippet?.note ?? '');
  const [mode, setMode] = useState<Mode>('none');
  const [selection, setSelection] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [natSize, setNatSize] = useState<{ w: number; h: number } | null>(null);
  const [cropBust, setCropBust] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const rawPath = `${sessionsDir}/${step.session_id}/${step.image_path}`.replace(/\\/g, '/');
  const imageSrc = useMemo(
    () => {
      const base = convertFileSrc(rawPath, 'asset');
      const baseline = `?t=${encodeURIComponent(step.timestamp)}`;
      const bust = step.highlight || cropBust > 0 ? `&b=${Date.now()}_${cropBust}` : '';
      return base + baseline + bust;
    },
    [rawPath, step.timestamp, step.highlight, cropBust],
  );
  const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(step.timestamp));

  const handleImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (mode !== 'highlight' || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;
    onHighlight(step.id, {
      kind: 'point',
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      color: '#FF6B35',
    });
    setMode('none');
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if ((mode !== 'spotlight' && mode !== 'crop') || !imgRef.current) return;
    e.preventDefault();
    const rect = imgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    setSelection({ sx, sy, cx: sx, cy: sy });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!selection || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    setSelection(prev => prev
      ? { ...prev, cx: e.clientX - rect.left, cy: e.clientY - rect.top }
      : null);
  };

  const handleMouseUp = (_e: React.MouseEvent<HTMLImageElement>) => {
    if (!selection || !imgRef.current) return;
    const activeMode = mode;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;
    const x = Math.min(selection.sx, selection.cx) * scaleX;
    const y = Math.min(selection.sy, selection.cy) * scaleY;
    const w = Math.abs(selection.cx - selection.sx) * scaleX;
    const h = Math.abs(selection.cy - selection.sy) * scaleY;
    setSelection(null);
    setMode('none');
    if (w > 10 && h > 10) {
      if (activeMode === 'spotlight') {
        onSpotlight(step.id, { x, y, w, h });
      } else if (activeMode === 'crop') {
        onCrop(step.id, Math.round(x), Math.round(y), Math.round(w), Math.round(h))
          .then(() => setCropBust(b => b + 1));
      }
    }
  };

  const handleMouseLeave = () => {
    if (selection) setSelection(null);
  };

  const saveAnnotation = () => { onAnnotate(step.id, annotation); setEditing(false); };
  const clearAnnotation = () => { onAnnotate(step.id, ''); setAnnotation(''); setEditing(false); };

  const saveNote = () => { onUpdateLogNote(step.id, noteText.trim() || undefined); setEditingNote(false); };

  const spotOverlay = step.spotlight && natSize ? (() => {
    const { x, y, w, h } = step.spotlight!;
    const pL = (x / natSize.w) * 100;
    const pT = (y / natSize.h) * 100;
    const pW = (w / natSize.w) * 100;
    const pH = (h / natSize.h) * 100;
    const dim: React.CSSProperties = { position: 'absolute', background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' };
    return (
      <>
        <div style={{ ...dim, top: 0, left: 0, right: 0, height: `${pT}%` }} />
        <div style={{ ...dim, top: `${pT + pH}%`, left: 0, right: 0, bottom: 0 }} />
        <div style={{ ...dim, top: `${pT}%`, left: 0, width: `${pL}%`, height: `${pH}%` }} />
        <div style={{ ...dim, top: `${pT}%`, left: `${pL + pW}%`, right: 0, height: `${pH}%` }} />
      </>
    );
  })() : null;

  const isClick = step.action_type === 'click';

  return (
    <Card style={{ marginBottom: 12 }}>
      <CardHeader
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isClick && <Badge size="small" appearance="filled" color="danger">{t('stepcard.click_badge')}</Badge>}
            <Text weight="semibold">{step.window_title}</Text>
          </div>
        }
        description={
          <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
            {time} · {step.process_name} · {step.monitor_label}
          </Text>
        }
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <Tooltip content={mode === 'highlight' ? t('stepcard.mark_point_hint') : t('stepcard.mark_point')} relationship="label">
              <Button
                appearance={mode === 'highlight' ? 'primary' : 'subtle'}
                icon={<PaintBrush24Regular />}
                onClick={() => setMode(m => m === 'highlight' ? 'none' : 'highlight')}
              />
            </Tooltip>
            <Tooltip content={mode === 'spotlight' ? t('stepcard.spotlight_hint') : t('stepcard.spotlight')} relationship="label">
              <Button
                appearance={mode === 'spotlight' ? 'primary' : 'subtle'}
                icon={<ZoomIn24Regular />}
                onClick={() => setMode(m => m === 'spotlight' ? 'none' : 'spotlight')}
              />
            </Tooltip>
            {step.spotlight && (
              <Tooltip content={t('stepcard.remove_spotlight')} relationship="label">
                <Button appearance="subtle" icon={<Dismiss16Regular />} onClick={() => onSpotlight(step.id, null)} />
              </Tooltip>
            )}
            <Tooltip content={mode === 'crop' ? t('stepcard.crop_hint') : t('stepcard.crop')} relationship="label">
              <Button
                appearance={mode === 'crop' ? 'primary' : 'subtle'}
                icon={<Crop24Regular />}
                onClick={() => setMode(m => m === 'crop' ? 'none' : 'crop')}
              />
            </Tooltip>
            <Tooltip content={t('stepcard.delete')} relationship="label">
              <Button appearance="subtle" icon={<Delete24Regular />} onClick={() => onDelete(step.id)} />
            </Tooltip>
          </div>
        }
      />

      <div style={{ position: 'relative' }}>
        <img
          ref={imgRef}
          src={imageSrc}
          alt={t('step_preview.alt', { seq: step.sequence })}
          onClick={handleImgClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onLoad={e =>
            setNatSize({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          draggable={false}
          style={{
            width: '100%',
            borderRadius: 4,
            border: '1px solid var(--colorNeutralStroke1)',
            cursor: mode !== 'none' ? 'crosshair' : 'default',
            display: 'block',
            userSelect: 'none',
          }}
        />
        {spotOverlay}
        {selection && (
          <div style={{
            position: 'absolute',
            left: Math.min(selection.sx, selection.cx),
            top: Math.min(selection.sy, selection.cy),
            width: Math.abs(selection.cx - selection.sx),
            height: Math.abs(selection.cy - selection.sy),
            border: `2px dashed ${mode === 'crop' ? '#e74856' : '#0078d4'}`,
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {step.log_snippet && (
        <div style={{ marginTop: 8, background: 'var(--colorNeutralBackground3)', borderRadius: 4, padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text size={100} style={{ color: 'var(--colorNeutralForeground3)' }}>
              {t('stepcard.log_header', {
                timestamp: step.log_snippet.captured_at.length >= 19
                  ? step.log_snippet.captured_at.slice(11, 19)
                  : step.log_snippet.captured_at,
              })}
            </Text>
            <Button
              appearance="subtle"
              size="small"
              icon={<Dismiss16Regular />}
              onClick={() => onDeleteLogSnippet(step.id)}
              title={t('stepcard.remove_log')}
            />
          </div>
          <pre style={{ fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
            {step.log_snippet.text}
          </pre>
          {editingNote ? (
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <Input
                value={noteText}
                onChange={(_, d) => setNoteText(d.value)}
                placeholder={t('stepcard.log_note_placeholder')}
                size="small"
                style={{ flex: 1 }}
              />
              <Button size="small" appearance="primary" onClick={saveNote}>{t('stepcard.save')}</Button>
              <Button size="small" appearance="subtle" onClick={() => setEditingNote(false)}>{t('stepcard.cancel')}</Button>
            </div>
          ) : (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              {step.log_snippet.note && (
                <Text size={200} style={{ flex: 1, color: 'var(--colorNeutralForeground2)' }}>
                  📝 {step.log_snippet.note}
                </Text>
              )}
              <Button
                appearance="subtle"
                size="small"
                onClick={() => { setNoteText(step.log_snippet?.note ?? ''); setEditingNote(true); }}
              >
                {step.log_snippet.note ? t('stepcard.edit_note') : t('stepcard.add_note')}
              </Button>
            </div>
          )}
        </div>
      )}

      {editing ? (
        <div style={{ marginTop: 8 }}>
          <Textarea
            value={annotation}
            onChange={(_, d) => setAnnotation(d.value)}
            placeholder={t('stepcard.annotation_placeholder')}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button appearance="primary" size="small" onClick={saveAnnotation}>{t('stepcard.save')}</Button>
            <Button appearance="subtle" size="small" onClick={() => setEditing(false)}>{t('stepcard.cancel')}</Button>
            {step.annotation && (
              <Button appearance="subtle" size="small" icon={<Dismiss20Regular />} onClick={clearAnnotation}>
                {t('stepcard.clear')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          {step.annotation && (
            <Text size={200} style={{ flex: 1 }}>{step.annotation}</Text>
          )}
          <Button
            appearance="subtle"
            icon={<Note24Regular />}
            size="small"
            onClick={() => { setAnnotation(step.annotation ?? ''); setEditing(true); }}
          >
            {step.annotation ? t('stepcard.edit') : t('stepcard.annotate')}
          </Button>
        </div>
      )}
    </Card>
  );
}

import { useState, useEffect } from 'react';
import {
  Button, Input, Label, Field, Switch, Title2, Divider, Dropdown, Option, Text,
} from '@fluentui/react-components';
import type { AppConfig } from '../types';

interface Props {
  config: AppConfig;
  onSave: (cfg: AppConfig) => void;
  onBack: () => void;
  onOpenFolder: () => void;
}

export function SettingsPanel({ config, onSave, onBack, onOpenFolder }: Props) {
  const [draft, setDraft] = useState<AppConfig>(config);
  useEffect(() => setDraft(config), [config]);

  const update = <K extends keyof AppConfig>(k: K, v: AppConfig[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const restore = () => setDraft({
    ...draft,
    export_name_template: 'steptrace_{yyyy}-{MM}-{dd}_{HH}{mm}',
    auto_purge_hours: 1,
    image_quality: 'high',
    embed_images_default: true,
  });

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Title2>Configurações</Title2>
      <Divider />

      <Field label="Pasta de sessões">
        <div style={{ display: 'flex', gap: 8 }}>
          <Input value={draft.sessions_dir} readOnly style={{ flex: 1 }} />
          <Button onClick={onOpenFolder}>Abrir</Button>
        </div>
      </Field>

      <Field
        label="Template de nome para exportação"
        hint="Placeholders: {yyyy} {MM} {dd} {HH} {mm} {ss}"
      >
        <Input
          value={draft.export_name_template}
          onChange={(_, d) => update('export_name_template', d.value)}
        />
      </Field>

      <Field label="Auto-remover sessões após (horas, 0 = nunca)">
        <Input
          type="number"
          value={String(draft.auto_purge_hours)}
          onChange={(_, d) => update('auto_purge_hours', Math.max(0, parseInt(d.value) || 0))}
        />
      </Field>

      <Field label="Qualidade da imagem">
        <Dropdown
          value={draft.image_quality}
          selectedOptions={[draft.image_quality]}
          onOptionSelect={(_, d) => update('image_quality', d.optionValue ?? 'high')}
        >
          <Option value="high">Alta</Option>
          <Option value="medium">Média</Option>
          <Option value="low">Baixa</Option>
        </Dropdown>
      </Field>

      <Switch
        checked={draft.embed_images_default}
        onChange={(_, d) => update('embed_images_default', d.checked)}
        label="Embutir imagens em base64 por padrão no Markdown"
      />

      <Divider />
      <Label weight="semibold">Hotkeys</Label>
      <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
        Iniciar: {draft.hotkey_start} · Pausar: {draft.hotkey_pause} · Parar: {draft.hotkey_stop}
        {' · '}Anotar: {draft.hotkey_annotate} · Capturar: {draft.hotkey_capture}
      </Text>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button appearance="primary" onClick={() => onSave(draft)}>Salvar</Button>
        <Button appearance="secondary" onClick={onBack}>Cancelar</Button>
        <Button appearance="subtle" onClick={restore}>Restaurar padrões</Button>
      </div>
    </div>
  );
}

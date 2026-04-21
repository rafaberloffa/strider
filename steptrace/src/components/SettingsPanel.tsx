import { useState, useEffect } from 'react';
import {
  Button, Input, Label, Field, Switch, Title2, Divider, Dropdown, Option, Text,
} from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';
import type { AppConfig } from '../types';

interface Props {
  config: AppConfig;
  onSave: (cfg: AppConfig) => void;
  onBack: () => void;
  onOpenFolder: () => void;
}

export function SettingsPanel({ config, onSave, onBack, onOpenFolder }: Props) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<AppConfig>(config);
  useEffect(() => setDraft(config), [config]);

  const update = <K extends keyof AppConfig>(k: K, v: AppConfig[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const restore = () => setDraft({
    ...draft,
    export_name_template: 'strider_{yyyy}-{MM}-{dd}_{HH}{mm}',
    auto_purge_hours: 1,
    image_quality: 'high',
    embed_images_default: true,
  });

  const handleLanguageChange = (code: string) => {
    update('language', code);
    i18n.changeLanguage(code);
  };

  const currentLang = draft.language ?? i18n.language;

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Title2>{t('settings.title')}</Title2>
      <Divider />

      <Field label={t('settings.sessions_dir_label')}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input value={draft.sessions_dir} readOnly style={{ flex: 1 }} />
          <Button onClick={onOpenFolder}>{t('settings.sessions_dir_open')}</Button>
        </div>
      </Field>

      <Field
        label={t('settings.export_template_label')}
        hint={t('settings.export_template_hint')}
      >
        <Input
          value={draft.export_name_template}
          onChange={(_, d) => update('export_name_template', d.value)}
        />
      </Field>

      <Field label={t('settings.auto_purge_label')}>
        <Input
          type="number"
          value={String(draft.auto_purge_hours)}
          onChange={(_, d) => update('auto_purge_hours', Math.max(0, parseInt(d.value) || 0))}
        />
      </Field>

      <Field label={t('settings.image_quality_label')}>
        <Dropdown
          value={draft.image_quality}
          selectedOptions={[draft.image_quality]}
          onOptionSelect={(_, d) => update('image_quality', d.optionValue ?? 'high')}
        >
          <Option value="high">{t('settings.quality_high')}</Option>
          <Option value="medium">{t('settings.quality_medium')}</Option>
          <Option value="low">{t('settings.quality_low')}</Option>
        </Dropdown>
      </Field>

      <Switch
        checked={draft.embed_images_default}
        onChange={(_, d) => update('embed_images_default', d.checked)}
        label={t('settings.embed_images_label')}
      />

      <Divider />
      <Label weight="semibold">{t('settings.language_label')}</Label>
      <Dropdown
        value={SUPPORTED_LANGUAGES.find(l => l.code === currentLang)?.label ?? currentLang}
        selectedOptions={[currentLang]}
        onOptionSelect={(_, d) => handleLanguageChange(d.optionValue ?? 'pt-BR')}
      >
        {SUPPORTED_LANGUAGES.map(lang => (
          <Option key={lang.code} value={lang.code}>{lang.label}</Option>
        ))}
      </Dropdown>

      <Divider />
      <Label weight="semibold">{t('settings.hotkeys_label')}</Label>
      <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
        {t('settings.hotkeys_display', {
          start: draft.hotkey_start,
          pause: draft.hotkey_pause,
          stop: draft.hotkey_stop,
          annotate: draft.hotkey_annotate,
          capture: draft.hotkey_capture,
        })}
      </Text>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button appearance="primary" onClick={() => onSave(draft)}>{t('settings.save')}</Button>
        <Button appearance="secondary" onClick={onBack}>{t('settings.cancel')}</Button>
        <Button appearance="subtle" onClick={restore}>{t('settings.restore_defaults')}</Button>
      </div>
    </div>
  );
}

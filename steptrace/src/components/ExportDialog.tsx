import { useState, useEffect } from 'react';
import {
  Dialog, DialogSurface, DialogTitle, DialogBody,
  DialogActions, DialogContent, Button, Switch, Input, Field,
} from '@fluentui/react-components';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { renderTemplate, sanitize } from '../utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  template: string;
  defaultEmbed: boolean;
  onDone: (files: string[], outputDir: string) => void;
  onError: (msg: string) => void;
}

export function ExportDialog({
  open: isOpen, onClose, sessionId, template, defaultEmbed, onDone, onError,
}: Props) {
  const { t } = useTranslation();
  const [embedImages, setEmbedImages] = useState(defaultEmbed);
  const [filename, setFilename] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFilename(sanitize(renderTemplate(template)));
      setEmbedImages(defaultEmbed);
      setOutputDir('');
    }
  }, [isOpen, template, defaultEmbed]);

  const pickFolder = async () => {
    const path = await open({ directory: true, title: t('export.choose_folder_dialog') });
    if (path) setOutputDir(String(path));
  };

  const handleExport = async () => {
    if (!outputDir) { onError(t('export.error_no_folder')); return; }
    if (!filename.trim()) { onError(t('export.error_no_filename')); return; }

    setExporting(true);
    try {
      const files = await invoke<string[]>('export_session', {
        sessionId,
        formats: ['markdown'],
        embedImages,
        outputDir,
        filenameBase: sanitize(filename.trim()),
      });
      onDone(files, outputDir);
      onClose();
    } catch (e) {
      onError(String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 480 }}>
        <DialogTitle>{t('export.title')}</DialogTitle>
        <DialogBody>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Switch
                checked={embedImages}
                onChange={(_, d) => setEmbedImages(d.checked)}
                label={t('export.embed_images')}
              />
              <Field label={t('export.filename_label')}>
                <Input
                  value={filename}
                  onChange={(_, d) => setFilename(d.value)}
                  placeholder={t('export.filename_placeholder')}
                />
              </Field>
              <Field label={t('export.folder_label')}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    value={outputDir}
                    onChange={(_, d) => setOutputDir(d.value)}
                    placeholder={t('export.folder_placeholder')}
                    style={{ flex: 1 }}
                  />
                  <Button onClick={pickFolder}>{t('export.choose_folder')}</Button>
                </div>
              </Field>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>{t('export.cancel')}</Button>
            <Button appearance="primary" onClick={handleExport} disabled={exporting}>
              {exporting ? t('export.exporting') : t('export.export')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

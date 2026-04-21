import { useState, useEffect } from 'react';
import {
  Dialog, DialogSurface, DialogTitle, DialogBody,
  DialogActions, DialogContent, Button, Switch, Input, Field,
} from '@fluentui/react-components';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
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
    const path = await open({ directory: true, title: 'Escolha a pasta de destino' });
    if (path) setOutputDir(String(path));
  };

  const handleExport = async () => {
    if (!outputDir) { onError('Escolha uma pasta de destino.'); return; }
    if (!filename.trim()) { onError('Informe o nome do arquivo.'); return; }

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
        <DialogTitle>Exportar sessão (Markdown)</DialogTitle>
        <DialogBody>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Switch
                checked={embedImages}
                onChange={(_, d) => setEmbedImages(d.checked)}
                label="Embutir imagens em base64 (recomendado para IA)"
              />
              <Field label="Nome do arquivo (sem extensão)">
                <Input
                  value={filename}
                  onChange={(_, d) => setFilename(d.value)}
                  placeholder="meu_export"
                />
              </Field>
              <Field label="Pasta de destino">
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    value={outputDir}
                    onChange={(_, d) => setOutputDir(d.value)}
                    placeholder="Clique em Escolher..."
                    style={{ flex: 1 }}
                  />
                  <Button onClick={pickFolder}>Escolher...</Button>
                </div>
              </Field>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Cancelar</Button>
            <Button appearance="primary" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exportando...' : 'Exportar'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

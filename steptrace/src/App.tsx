import { useState, useEffect } from 'react';
import {
  Button, Toolbar, ToolbarButton, Text, Toast, ToastTitle,
  ToastBody, Toaster, useToastController, useId, Tooltip, Spinner,
} from '@fluentui/react-components';
import {
  Record24Regular, Pause24Regular, Stop24Regular, Settings24Regular,
  Folder24Regular, FolderOpen20Regular, Camera24Regular,
} from '@fluentui/react-icons';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { StatusBadge } from './components/StatusBadge';
import { ReviewPanel } from './components/ReviewPanel';
import { ExportDialog } from './components/ExportDialog';
import { SessionsList } from './components/SessionsList';
import { SettingsPanel } from './components/SettingsPanel';
import { LiveStepFeed } from './components/LiveStepFeed';
import { StepPreviewModal } from './components/StepPreviewModal';
import { useSession } from './hooks/useSession';
import { useClipboardDetect } from './hooks/useClipboardDetect';
import type { Step } from './types';
import './App.css';

type View = 'home' | 'review' | 'settings';

export default function App() {
  const {
    status, session, steps, sessionsDir, config, recentSessions,
    startRecording, pauseRecording, resumeRecording, stopRecording,
    deleteStep, addAnnotation, addLogSnippet, updateLogNote, deleteLogSnippet,
    addHighlight, setSpotlight, cropStepImage, captureNow,
    loadSession, deleteSession, saveConfig, loadRecentSessions, clearSession,
  } = useSession();

  const [view, setView] = useState<View>('home');
  const [exportOpen, setExportOpen] = useState(false);
  const [feedCollapsed, setFeedCollapsed] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [previewStep, setPreviewStep] = useState<Step | null>(null);

  const toasterId = useId('toaster');
  const { dispatchToast } = useToastController(toasterId);

  const toast = (intent: 'success' | 'error' | 'info', title: string, body?: string) => {
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
        {body && <ToastBody>{body}</ToastBody>}
      </Toast>,
      { intent, timeout: 4500 }
    );
  };

  useClipboardDetect({
    onAttach: addLogSnippet,
    dispatchToast,
  });

  useEffect(() => {
    const un = listen<string>('capture-blocked', e => {
      toast('error', 'Captura não realizada', e.payload);
    });
    return () => { un.then(fn => fn()); };
  }, []);

  // Auto navigate to review when session stops
  useEffect(() => {
    if (status === 'idle' && session?.ended_at && steps.length > 0 && view === 'home') {
      setView('review');
    }
  }, [status, session?.ended_at, steps.length, view]);

  const handleStop = async () => {
    const finished = await stopRecording();
    if (finished) setView('review');
  };

  const handleCaptureNow = async () => {
    const step = await captureNow(true);
    if (step) {
      setCaptureFlash(true);
      setTimeout(() => setCaptureFlash(false), 350);
    } else {
      toast('error', 'Captura não realizada', 'Alterne para a janela alvo e tente novamente.');
    }
  };

  const handleOpenSession = async (id: string) => {
    const s = await loadSession(id);
    if (s) setView('review');
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    toast('success', 'Sessão apagada');
  };

  const openSessionsFolder = () => invoke('open_sessions_folder').catch(e => toast('error', String(e)));

  const handleExportDone = (files: string[], outputDir: string) => {
    dispatchToast(
      <Toast>
        <ToastTitle
          action={
            <Button
              appearance="primary"
              size="small"
              icon={<FolderOpen20Regular />}
              onClick={() => invoke('open_path', { path: outputDir })}
            >
              Abrir pasta
            </Button>
          }
        >
          Exportação concluída
        </ToastTitle>
        <ToastBody>
          <Text size={100} style={{ fontFamily: 'monospace' }}>
            {files.map(f => f.split(/[\\/]/).pop()).join('  ·  ')}
          </Text>
        </ToastBody>
      </Toast>,
      { intent: 'success', timeout: 8000 }
    );
  };

  const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
  const isActive = status === 'recording' || status === 'paused';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Toaster toasterId={toasterId} position="top-end" />

      <Toolbar style={{ padding: '8px 16px', borderBottom: '1px solid var(--colorNeutralStroke1)', gap: 8 }}>
        <StatusBadge status={status} />
        <div style={{ flex: 1 }} />

        {status === 'idle' && view === 'home' && (
          <Tooltip content="Iniciar gravação  ·  Win+Shift+R" relationship="label" withArrow>
            <ToolbarButton icon={<Record24Regular />} onClick={startRecording}>Iniciar</ToolbarButton>
          </Tooltip>
        )}
        {status === 'recording' && (
          <>
            <Tooltip content="Capturar agora  ·  Win+Shift+C" relationship="label" withArrow>
              <ToolbarButton
                icon={<Camera24Regular />}
                className={captureFlash ? 'steptrace-capture-flash' : undefined}
                onClick={handleCaptureNow}
              >
                Capturar
              </ToolbarButton>
            </Tooltip>
            <Tooltip content="Pausar  ·  Win+Shift+P" relationship="label" withArrow>
              <ToolbarButton icon={<Pause24Regular />} onClick={pauseRecording}>Pausar</ToolbarButton>
            </Tooltip>
            <Tooltip content="Parar gravação  ·  Win+Shift+S" relationship="label" withArrow>
              <ToolbarButton icon={<Stop24Regular />} onClick={handleStop}>Parar</ToolbarButton>
            </Tooltip>
          </>
        )}
        {status === 'paused' && (
          <>
            <Tooltip content="Retomar  ·  Win+Shift+P" relationship="label" withArrow>
              <ToolbarButton icon={<Record24Regular />} onClick={resumeRecording}>Retomar</ToolbarButton>
            </Tooltip>
            <Tooltip content="Parar gravação  ·  Win+Shift+S" relationship="label" withArrow>
              <ToolbarButton icon={<Stop24Regular />} onClick={handleStop}>Parar</ToolbarButton>
            </Tooltip>
          </>
        )}
        {view !== 'home' && (
          <Button
            appearance="subtle"
            onClick={() => { clearSession(); setView('home'); loadRecentSessions(); }}
            style={{ marginLeft: 4 }}
          >
            ← Voltar
          </Button>
        )}
        {view === 'home' && status === 'idle' && (
          <>
            <Tooltip content="Abrir pasta de sessões" relationship="label" withArrow>
              <ToolbarButton icon={<Folder24Regular />} onClick={openSessionsFolder} />
            </Tooltip>
            <Tooltip content="Configurações" relationship="label" withArrow>
              <ToolbarButton icon={<Settings24Regular />} onClick={() => setView('settings')} />
            </Tooltip>
          </>
        )}
      </Toolbar>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {view === 'home' && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-start',
            paddingTop: 32, gap: 24,
          }}>
            <div style={{ textAlign: 'center' }}>
              <Text size={600} weight="semibold">StepTrace</Text>
              <br />
              <Text size={300} style={{ color: 'var(--colorNeutralForeground3)' }}>
                {status === 'idle'
                  ? 'Clique em Iniciar ou pressione Win+Shift+R para gravar.'
                  : `${status === 'recording' ? '● Gravando' : '⏸ Pausado'} — ${steps.length} passo${steps.length !== 1 ? 's' : ''}.`}
              </Text>
            </div>

            {isActive && (
              <div
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 8, width: '100%', maxWidth: 480,
                  padding: '16px 20px',
                  border: '1px solid var(--colorNeutralStroke2)',
                  borderRadius: 8,
                  background: 'var(--colorNeutralBackground2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {status === 'recording' ? (
                    <Spinner size="tiny" />
                  ) : (
                    <Text size={300}>⏸</Text>
                  )}
                  <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
                    {status === 'recording'
                      ? 'Aguardando próxima mudança de foco...'
                      : 'Captura pausada. Retome para continuar.'}
                  </Text>
                </div>
                {lastStep && (
                  <div
                    key={lastStep.id}
                    className="steptrace-fadein"
                    style={{
                      width: '100%', marginTop: 4,
                      display: 'flex', flexDirection: 'column', gap: 2,
                      paddingTop: 8, borderTop: '1px solid var(--colorNeutralStroke2)',
                    }}
                  >
                    <Text size={200} weight="semibold">
                      Último passo: #{lastStep.sequence}
                    </Text>
                    <Text size={100} style={{ color: 'var(--colorNeutralForeground3)' }}>
                      {lastStep.process_name} — {lastStep.window_title.slice(0, 80)}
                    </Text>
                  </div>
                )}
              </div>
            )}

            {status === 'idle' && (
              <SessionsList
                sessions={recentSessions}
                onOpen={handleOpenSession}
                onDelete={handleDeleteSession}
              />
            )}
          </div>
        )}
        {view === 'review' && session && (
          <ReviewPanel
            session={session}
            steps={steps}
            sessionsDir={sessionsDir}
            onDelete={deleteStep}
            onAnnotate={addAnnotation}
            onHighlight={addHighlight}
            onSpotlight={setSpotlight}
            onCrop={cropStepImage}
            onUpdateLogNote={updateLogNote}
            onDeleteLogSnippet={deleteLogSnippet}
            onExport={() => setExportOpen(true)}
          />
        )}
        {view === 'settings' && config && (
          <SettingsPanel
            config={config}
            onSave={async cfg => {
              await saveConfig(cfg);
              toast('success', 'Configurações salvas');
              setView('home');
            }}
            onBack={() => setView('home')}
            onOpenFolder={openSessionsFolder}
          />
        )}
      </div>

      {isActive && (
        <LiveStepFeed
          steps={steps}
          sessionsDir={sessionsDir}
          collapsed={feedCollapsed}
          onToggleCollapse={() => setFeedCollapsed(c => !c)}
          onItemClick={s => setPreviewStep(s)}
        />
      )}

      <StepPreviewModal
        step={previewStep}
        sessionsDir={sessionsDir}
        onClose={() => setPreviewStep(null)}
      />

      {session && config && (
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          sessionId={session.id}
          template={config.export_name_template}
          defaultEmbed={config.embed_images_default}
          onDone={handleExportDone}
          onError={msg => toast('error', 'Falha na exportação', msg)}
        />
      )}
    </div>
  );
}

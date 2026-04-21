---
todos:
  - id: log-snippet-return
    content: "FASE 1.5.1 — Backend retorna LogSnippet em add_log_snippet e update_log_note; frontend consome o retorno"
  - id: capture-feedback
    content: "FASE 1.5.2 — Toast de erro em captura manual (botão + hotkey Win+Shift+C) quando não há janela alvo"
  - id: livefeed-preview
    content: "FASE 1.5.3 — LiveStepFeed: clicar em item abre modal de preview da imagem em tamanho natural"
---

# Plano de Melhorias 1.5 — UX polish 2 + higiene de contrato

Continuação do [melhorias-plan-01.md](melhorias-plan-01.md). Fase 1 entregue e auditada
(dedupe focus vs click, `allow_fallback` em `capture_by_hwnd`, `natSize` no spotlight
overlay, `hotkeys.rs` removido). Este patch agrupa 3 itens de baixo risco, alto valor,
que fecham rebarbas identificadas durante a auditoria e durante o uso real.

Itens do backlog da Fase 2 (crop, AnnotationPopup hotkey-driven, CapsLock highlight,
pulse do tray, refactor TrayMenu) permanecem adiados — seguem em
[melhorias-plan-01.md § FASE 2 — Futuro](melhorias-plan-01.md).

## Decisões travadas

- Nenhum item aqui mexe em `AppState`, `AppConfig`, `Session` ou `Step` (estruturas
  persistidas). Apenas novas assinaturas de comandos e componentes de UI.
- Nenhum item aqui mexe nas threads de captura, focus watcher, mouse watcher ou
  clipboard watcher.
- Pulse do tray e refactor pause/resume/stop ficam fora — alto custo/risco para ganho
  estético nesta janela.

---

## FASE 1.5 — Patch

Ordem recomendada: 1 → 2 → 3 (backend primeiro para evitar retrabalho em tipos).

---

### 1.5.1 — Backend retorna `LogSnippet` (~20min)

**Problema**

`steptrace/src/hooks/useSession.ts:96-112` atualiza o estado React de forma otimista
inventando o `captured_at`:

```ts
{ text: log, captured_at: new Date().toISOString() }
```

Backend em `steptrace/src-tauri/src/lib.rs` (função `add_log_snippet`) usa
`chrono::Local::now().to_rfc3339()` — timezone local. Frontend otimista usa UTC `Z`.
`StepCard.tsx` extrai hora via `captured_at.slice(11, 19)` — mostra UTC no primeiro
render, local depois de reload. Divergência silenciosa; quebra se um lado mudar
formato.

**Solução**

Backend retorna o `LogSnippet` recém-criado/atualizado. Frontend consome o retorno
em vez de inventar timestamp.

**Mudanças em `steptrace/src-tauri/src/lib.rs`**

```rust
#[tauri::command]
fn add_log_snippet(
    state: State<AppState>,
    step_id: String,
    log: String,
) -> Result<LogSnippet, String> {
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let step = session.steps.iter_mut()
        .find(|s| s.id == step_id)
        .ok_or("Step não encontrado")?;
    let snippet = LogSnippet {
        text: log,
        note: None,
        captured_at: chrono::Local::now().to_rfc3339(),
    };
    step.log_snippet = Some(snippet.clone());
    drop(session_lock);
    persist_current(&state);
    Ok(snippet)
}

#[tauri::command]
fn update_log_note(
    state: State<AppState>,
    step_id: String,
    note: Option<String>,
) -> Result<Option<LogSnippet>, String> {
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let step = session.steps.iter_mut()
        .find(|s| s.id == step_id)
        .ok_or("Step não encontrado")?;
    if let Some(ref mut snippet) = step.log_snippet {
        snippet.note = note.filter(|n| !n.trim().is_empty());
    }
    let out = step.log_snippet.clone();
    drop(session_lock);
    persist_current(&state);
    Ok(out)
}
```

`delete_log_snippet` permanece retornando `()`.

**Mudanças em `steptrace/src/hooks/useSession.ts`**

```ts
const addLogSnippet = useCallback(async (stepId: string, log: string) => {
  try {
    const snippet = await invoke<LogSnippet>('add_log_snippet', { stepId, log });
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, log_snippet: snippet } : s));
  } catch (e) { setError(String(e)); }
}, []);

const updateLogNote = useCallback(async (stepId: string, note: string | undefined) => {
  try {
    const snippet = await invoke<LogSnippet | null>(
      'update_log_note',
      { stepId, note: note || null },
    );
    setSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, log_snippet: snippet ?? undefined }
      : s));
  } catch (e) { setError(String(e)); }
}, []);
```

Importar `LogSnippet` de `../types`.

**Armadilha**

`snippet.clone()` é obrigatório antes de mover para `step.log_snippet` — sem o clone
o compilador reclama que o valor foi movido e não pode ser retornado.

**Validação**

- `cargo check` clean.
- `tsc --noEmit` clean.
- Manual: anexar log → hora exibida no `StepCard` bate com `Local::now()` do backend.

---

### 1.5.2 — Feedback de erro em captura manual (~25min)

**Problema**

Dois caminhos de captura manual falham silenciosamente:

1. **Botão "Capturar"** (`steptrace/src/App.tsx:67-73`): `handleCaptureNow` chama
   `captureNow(true)` — se retornar `null` (erro), `setCaptureFlash` não dispara e
   nada avisa o usuário. Hook seta `error` mas nenhum componente lê.
2. **Hotkey `Win+Shift+C`** (branch `"capture"` de `register_hotkeys` em
   `steptrace/src-tauri/src/lib.rs`): se o foreground é o próprio StepTrace
   (`is_own_process_hwnd(hwnd)` true) ou `hwnd == 0`, a função retorna sem fazer
   nada. Usuário pressiona e não entende por que nada aconteceu.

**Solução**

- Backend emite evento `capture-blocked` com motivo quando hwnd é zero ou próprio.
- Frontend escuta e dispara toast.
- Botão dispara toast quando `captureNow` retorna null.

**Mudanças em `steptrace/src-tauri/src/lib.rs`**

No branch `"capture"` de `register_hotkeys`:

```rust
"capture" => {
    let hwnd = get_foreground_hwnd();
    if hwnd == 0 {
        let _ = handle.emit("capture-blocked", "Nenhuma janela em foreground.");
        return;
    }
    if is_own_process_hwnd(hwnd) {
        let _ = handle.emit(
            "capture-blocked",
            "StepTrace está em foco. Alterne para a janela alvo antes do atalho.",
        );
        return;
    }
    if let Err(e) = do_capture_step(
        &state, &handle, hwnd, session::ActionType::Focus, None, false,
    ) {
        let _ = handle.emit("capture-blocked", format!("Falha: {}", e));
    }
}
```

`Emitter` já está importado em `lib.rs`, `handle` já está no escopo da closure.

**Mudanças em `steptrace/src/App.tsx`**

Adicionar listener e melhorar `handleCaptureNow`:

```tsx
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
  const un = listen<string>('capture-blocked', e => {
    toast('error', 'Captura não realizada', e.payload);
  });
  return () => { un.then(fn => fn()); };
}, []);

const handleCaptureNow = async () => {
  const step = await captureNow(true);
  if (step) {
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 350);
  } else {
    toast('error', 'Captura não realizada',
      'Alterne para a janela alvo e tente novamente.');
  }
};
```

**Armadilha**

Não adicionar o listener de `capture-blocked` em `useSession.ts` — toast precisa
do `dispatchToast` que é local do `App.tsx`. Manter separação.

**Validação**

- `Win+Shift+C` com StepTrace em foco → toast "Alterne para a janela alvo...".
- Botão "Capturar" sem ter trocado janela previamente → toast de erro.
- `Win+Shift+C` com janela externa em foco → captura normal, sem toast.
- `Win+Shift+C` durante idle (sem recording) → backend já bloqueia em `capture_now`,
  mas hotkey chega direto no `do_capture_step`. Adicionar checagem:

```rust
if *state.status.lock().unwrap() != AppStatus::Recording {
    let _ = handle.emit("capture-blocked", "Inicie uma gravação primeiro.");
    return;
}
```

Antes do `get_foreground_hwnd()`.

---

### 1.5.3 — LiveStepFeed: preview em modal (~35min)

**Problema**

`steptrace/src/components/LiveStepFeed.tsx` tem prop `onItemClick` que é no-op em
`steptrace/src/App.tsx:284-286`. Na auditoria anterior o `cursor: pointer` foi
removido para não mentir sobre afordância. Implementar a ação: clicar abre modal
com screenshot em tamanho natural.

**Solução**

Componente novo `StepPreviewModal.tsx` com Dialog Fluent UI. Reaproveita
`convertFileSrc`. Read-only.

**Novo arquivo `steptrace/src/components/StepPreviewModal.tsx`**

```tsx
import { Dialog, DialogSurface, DialogBody, DialogTitle, Button, Text } from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Step } from '../types';

interface Props {
  step: Step | null;
  sessionsDir: string;
  onClose: () => void;
}

export function StepPreviewModal({ step, sessionsDir, onClose }: Props) {
  if (!step) return null;
  const rawPath = `${sessionsDir}/${step.session_id}/${step.image_path}`.replace(/\\/g, '/');
  const src = convertFileSrc(rawPath, 'asset');
  const time = new Date(step.timestamp).toLocaleTimeString('pt-BR');

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '92vw', width: 'auto' }}>
        <DialogBody>
          <DialogTitle
            action={<Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} />}
          >
            Passo #{step.sequence} — {step.window_title}
          </DialogTitle>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            maxHeight: '80vh', overflow: 'auto',
          }}>
            <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
              {time} · {step.process_name} · {step.monitor_label}
            </Text>
            <img
              src={src}
              alt={`Passo ${step.sequence}`}
              style={{
                maxWidth: '100%', height: 'auto',
                border: '1px solid var(--colorNeutralStroke1)', borderRadius: 4,
              }}
            />
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
```

**Mudanças em `steptrace/src/components/LiveStepFeed.tsx`**

Restaurar cursor e hover (agora há ação):

```tsx
style={{
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '3px 6px',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
}}
onMouseEnter={e => (e.currentTarget.style.background = 'var(--colorNeutralBackground3)')}
onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
```

**Mudanças em `steptrace/src/App.tsx`**

```tsx
import { StepPreviewModal } from './components/StepPreviewModal';
import type { Step } from './types';

const [previewStep, setPreviewStep] = useState<Step | null>(null);

// JSX do LiveStepFeed:
<LiveStepFeed
  steps={steps}
  sessionsDir={sessionsDir}
  collapsed={feedCollapsed}
  onToggleCollapse={() => setFeedCollapsed(c => !c)}
  onItemClick={s => setPreviewStep(s)}
/>

// Antes do ExportDialog no final do return:
<StepPreviewModal
  step={previewStep}
  sessionsDir={sessionsDir}
  onClose={() => setPreviewStep(null)}
/>
```

**Armadilha**

- Não reutilizar `ExportDialog` ou outro Dialog do app — modais Fluent UI guardam
  estado local; misturar causa bugs sutis de foco.
- Não chamar `setView('review')` no clique do feed — preview é in-place, não
  navega. Review continua sendo destino pós-stop.
- O `LiveStepFeed` continua recebendo `step-captured` durante o modal aberto —
  isso é desejado, o usuário pode fechar e continuar vendo novos passos.

**Validação**

- Durante gravação, clicar item do LiveStepFeed abre modal com imagem útil.
- Fechar (X ou clicar fora) volta ao fluxo sem side-effects em outros estados.
- Novos steps capturados enquanto modal aberto aparecem no feed ao fechar.

---

## Escopo fora deste patch

Não tocar em:

- Estruturas `AppState`, `AppConfig`, `Session`, `Step`, `Highlight`, `Spotlight`.
- `register_hotkeys` — apenas o branch `"capture"`.
- Threads `start_capture_thread`, `start_click_capture_thread`, `start_purge_loop`.
- `capture.rs`, `mouse_watcher.rs`, `focus_watcher.rs`, `clipboard.rs`.
- `ReviewPanel`, `StepCard`, `ExportDialog`, `SettingsPanel`, `SessionsList`.
- `App.css` (nenhum keyframe novo necessário).

Se bater dúvida sobre mudar algo fora do escopo, PAUSAR e perguntar antes.

---

## Validação final

1. `cargo check` → 0 warnings, 0 errors.
2. `npx tsc --noEmit` → clean.
3. Smoke manual:
   - Anexar log → timestamp no card coerente com hora local, sem salto ao reabrir sessão.
   - Botão "Capturar" sem trocar janela → toast de erro.
   - `Win+Shift+C` com StepTrace em foco → toast de erro.
   - `Win+Shift+C` fora de gravação (idle) → toast "Inicie uma gravação primeiro.".
   - Clicar item do LiveStepFeed → modal abre, fecha, feed continua recebendo passos.

Sem `npm run tauri build` neste patch (bundle já existe da Fase 1).

---

## Estimativa

- 1.5.1: ~20min
- 1.5.2: ~25min
- 1.5.3: ~35min
- **Total: ~1h20 com validação**

---

## Pontos abertos antes de executar

Nenhum. Ao confirmar, executar na ordem 1 → 2 → 3.

---
todos:
  - id: cleanup-pdf
    content: "FASE 1.1 — Remover PDF (cargo deps + lib.rs match + ExportDialog + README)"
  - id: capture-manual
    content: "FASE 1.2 — Captura manual: helper compartilhado, hotkey Win+Shift+C, botão UI usando last_external_foreground"
  - id: live-log
    content: "FASE 1.3 — Live capture log: painel inferior fixo collapsible com cards horizontais"
  - id: clipboard-refactor
    content: "FASE 1.4 — Clipboard refactor: useClipboardDetect.ts + LogSnippet com note + delete/edit"
  - id: spotlight
    content: "FASE 1.5 — Spotlight estratégia B (dim only): overlay CSS no review + raster no export"
  - id: click-marker
    content: "FASE 1.6 — Click marker via WH_MOUSE_LL: cada clique gera step novo com marker vermelho no ponto"
  - id: future-stub
    content: "FASE 2 (futuro) — Crop, AnnotationPopup, CapsLock highlight, tray pulse"
---

# Próximas melhorias — Plano em 2 fases

Decisões já travadas com o usuário:
- Click marker: cada clique = STEP NOVO (modelo Steps Recorder do Windows). Regra "sem hook global" relaxada — projeto é open-source e visa substituir o Steps Recorder.
- Live log: painel inferior fixo (estilo terminal/log).
- AnnotationPopup: deferida para Fase 2 (anotação pós-produção já cobre).
- Spotlight: estratégia B (não-destrutivo) + dim escuro uniforme apenas.
- Crop: deferido para Fase 2.
- Cleanup PDF: in-scope na Fase 1.

---

## FASE 1 — Agora

Ordem importa: itens posteriores reaproveitam código de itens anteriores (helper de captura, drag-to-rect, marker via `apply_highlight`).

---

### 1.1 — Cleanup PDF (~30min)

Remove ~1MB do binário e simplifica codebase.

**Arquivos**
- Deletar [src-tauri/src/export/pdf.rs](steptrace/src-tauri/src/export/pdf.rs).
- [src-tauri/src/export/mod.rs](steptrace/src-tauri/src/export/mod.rs): remover `pub mod pdf;`.
- [src-tauri/Cargo.toml](steptrace/src-tauri/Cargo.toml): remover `printpdf = "0.7"` (e `lopdf` se entrou via printpdf — checar `cargo tree`).
- [src-tauri/src/lib.rs](steptrace/src-tauri/src/lib.rs:285): remover branch `"pdf" => { ... }` do match em `export_session`.
- [src/components/ExportDialog.tsx](steptrace/src/components/ExportDialog.tsx): remover state `exportPdf`, checkbox PDF, lógica de `formats.push('pdf')`.
- [README.md](steptrace/README.md): remover known issue de PDF + menções a "PDF" na seção de exportação.

**Validação**: `cargo check` + `npx tsc --noEmit`.

---

### 1.2 — Captura manual (~2h)

**Problema central**: clicar no botão "Capturar agora" muda o foreground para a janela do StepTrace. Precisamos capturar a janela que estava em foco ANTES.

**Backend** ([src-tauri/src/lib.rs](steptrace/src-tauri/src/lib.rs))

Adicionar em `AppState` ([src-tauri/src/session.rs](steptrace/src-tauri/src/session.rs)):

```rust
pub last_external_hwnd: Mutex<isize>,  // HWND da última janela NÃO-StepTrace em foco
```

Em [src-tauri/src/focus_watcher.rs](steptrace/src-tauri/src/focus_watcher.rs), além do canal mpsc atual, atualizar `last_external_hwnd` continuamente quando o HWND **não** pertence ao próprio processo. Para isso, comparar `GetWindowThreadProcessId(hwnd)` com `GetCurrentProcessId()` — código já existente em alguma forma no filtro de PID em [capture.rs](steptrace/src-tauri/src/capture.rs).

Refatorar a closure interna do `start_capture_thread` ([lib.rs:331](steptrace/src-tauri/src/lib.rs)) extraindo:

```rust
fn capture_step_for_hwnd(
    app_handle: &tauri::AppHandle,
    hwnd: isize,
    action_type: ActionType,
    click_marker: Option<(i32, i32)>,  // posição relativa do clique, se houver
) -> Result<Step, String>
```

Esse helper passa a ser usado por:
- Thread de captura existente (`action_type = Focus`, `click_marker = None`).
- Novo comando `capture_now`.
- Click marker (item 1.6) com `action_type = Click`, `click_marker = Some((x, y))`.

Novo comando:

```rust
#[tauri::command]
fn capture_now(state, app_handle) -> Result<Step, String> {
    let hwnd = *state.last_external_hwnd.lock().unwrap();
    if hwnd == 0 { return Err("Nenhuma janela externa em foco recente".into()); }
    capture_step_for_hwnd(&app_handle, hwnd, ActionType::Focus, None)
}
```

Hotkey `Win+Shift+C` registrada em `register_hotkeys` ([lib.rs:509](steptrace/src-tauri/src/lib.rs)):
- Quando acionada via hotkey, o foreground é a janela ATUAL (hotkey não muda foco). Então hotkey usa `GetForegroundWindow()` direto (mais preciso) em vez de `last_external_hwnd`.
- Diferenciação importante: `capture_now_via_hotkey()` vs `capture_now_via_button()`. Pode ser um param boolean ou dois comandos.

Adicionar em `AppConfig`: `hotkey_capture: String` (default `"Super+Shift+C"`).

**Frontend** ([src/App.tsx](steptrace/src/App.tsx))

Toolbar quando `status === 'recording'`:
- Novo `ToolbarButton` "Capturar" com tooltip `Capturar janela atual · Win+Shift+C`. Chama `invoke('capture_now', { fromButton: true })`.
- Feedback visual: animação de "flash" no botão por ~250ms após sucesso (CSS keyframe novo em [App.css](steptrace/src/App.css)).

[src/components/SettingsPanel.tsx](steptrace/src/components/SettingsPanel.tsx): exibir o novo hotkey junto com os existentes (linha 80).

**Riscos**
- Hotkey `Super+Shift+C` colide com nada conhecido no Windows. OK.
- Race: se `last_external_hwnd` = 0 (usuário acabou de abrir o app sem trocar de janela), `capture_now` via botão falha. Toast informativo: "Alterne para a janela alvo primeiro".

---

### 1.3 — Live capture log (~3h)

Painel inferior fixo, collapsible, aparece quando `isActive`.

**Layout** ([src/App.tsx](steptrace/src/App.tsx))

```
┌─────────────────────────────────────────┐
│ Toolbar                                 │ 48px
├─────────────────────────────────────────┤
│                                         │
│ Conteúdo principal (home/review/...)    │ flex:1
│                                         │
├─────────────────────────────────────────┤
│ Live log (collapsible, 140px)           │ 140px ou 32px collapsed
└─────────────────────────────────────────┘
```

Container raiz já é `flexDirection: 'column'`. Adicionar 4ª child condicional `{isActive && <LiveStepFeed ... collapsed={...} />}`.

**Componente novo** [src/components/LiveStepFeed.tsx](steptrace/src/components/LiveStepFeed.tsx)

Props: `steps: Step[]`, `sessionsDir: string`, `collapsed: boolean`, `onToggleCollapse`, `onItemClick(step)`.

Layout:
- Header (32px): botão minimizar/expandir + texto "Captura ao vivo · {N} passo(s)".
- Quando expandido (140px): scroll vertical, items mais recentes no topo.
- Cada item (card horizontal, 64px altura):
  - Thumb 96×56px à esquerda: `<img src={convertFileSrc(rawPath, 'asset')}>`. Border-radius 4. Object-fit: cover.
  - Coluna direita: `#{seq}` em badge pequeno, título da janela (truncado 1 linha), `processo · HH:MM:SS` em foreground3.
  - Hover: background neutralBackground3, cursor pointer.
  - Animação `steptrace-fadein` (já existe em [App.css](steptrace/src/App.css)) ao montar.
- Performance: `steps.slice(-50).reverse()` — visualmente último primeiro, máximo 50 (suficiente; sessões longas ainda mostram tudo na review).

**Onde reusar** vs **conflito com painel atual**

Hoje em [App.tsx:170](steptrace/src/App.tsx) há um painel "Aguardando próxima mudança…" no centro da home. Decisão:
- REMOVER esse painel central durante recording.
- Live log fica visível **em qualquer view** (home, review, settings) quando recording, fixo no rodapé. Dá feedback contínuo independente do que o usuário está olhando.
- Estado collapsed persiste em React state (não em config — é UX volátil).

---

### 1.4 — Clipboard refactor + LogSnippet com nota (~3h)

**Modelo** ([src-tauri/src/session.rs](steptrace/src-tauri/src/session.rs))

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogSnippet {
    pub text: String,
    pub note: Option<String>,
    pub captured_at: String,  // ISO 8601
}

pub struct Step {
    // ...
    pub log_snippet: Option<LogSnippet>,  // antes era Option<String>
}
```

**Migration**: como o app ainda não tem usuários instalados (sem release público), session.json antigos podem ser quebrados. Mas pelo ambiente do dev, vale fazer deserialização tolerante:

```rust
#[serde(deserialize_with = "log_snippet_compat")]
pub log_snippet: Option<LogSnippet>,
```

Custom deserializer aceita tanto `String` quanto `LogSnippet { ... }`. ~15 linhas.

**Comandos novos** ([lib.rs](steptrace/src-tauri/src/lib.rs))
- Modificar `add_log_snippet(step_id, log)` para criar `LogSnippet { text: log, note: None, captured_at: now }`.
- Novo `update_log_note(step_id, note: Option<String>)`.
- Novo `delete_log_snippet(step_id)` — limpa só o snippet, mantém o step.

**Hook novo** [src/hooks/useClipboardDetect.ts](steptrace/src/hooks/useClipboardDetect.ts)

Extrair lógica do `useEffect` em [App.tsx:48-86](steptrace/src/App.tsx). Assinatura:

```typescript
useClipboardDetect({
  onAttach: (logText: string) => Promise<void>,
  dispatchToast: ToastController['dispatchToast'],
});
```

Internamente: `lastLogRef`, `listen<string>('log-detected', ...)`, dispatch do toast com botão Anexar.

**UI** ([src/components/StepCard.tsx](steptrace/src/components/StepCard.tsx))

Atualmente o snippet aparece como `<pre>` read-only. Trocar por:
- `<pre>` com texto
- Botão `<X>` no canto pra `delete_log_snippet`
- Linha "Nota:" com texto inline + botão "Editar nota" → vira `<Textarea>` com Save/Cancel
- Mostrar `captured_at` em foreground3, formato `HH:MM:SS`

Type TypeScript ([src/types/index.ts](steptrace/src/types/index.ts)):

```typescript
export interface LogSnippet {
  text: string;
  note?: string;
  captured_at: string;
}

export interface Step {
  // ...
  log_snippet?: LogSnippet;
}
```

---

### 1.5 — Spotlight estratégia B, dim only (~5h)

**Modelo** ([src-tauri/src/session.rs](steptrace/src-tauri/src/session.rs))

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Spotlight {
    pub x: f32, pub y: f32, pub w: f32, pub h: f32,  // pixels da imagem original
}

pub struct Step {
    // ...
    pub spotlight: Option<Spotlight>,
}
```

**Comando novo** ([lib.rs](steptrace/src-tauri/src/lib.rs))
- `set_spotlight(step_id, spotlight: Option<Spotlight>)` — Some salva, None remove.

**Frontend — Review** ([src/components/StepCard.tsx](steptrace/src/components/StepCard.tsx))

Modo `spotlight` (botão dedicado, ícone `SpotlightRegular` ou similar):
- Mouse down/move/up sobre a `<img>` desenha retângulo (overlay `<div>` absoluto).
- Coordenadas escaladas com `naturalWidth / rect.width` (já tem essa lógica).
- Onmouseup: `invoke('set_spotlight', { stepId, spotlight: { x, y, w, h } })`.

Renderização do spotlight existente (não-destrutivo, CSS):

```jsx
<div style={{ position: 'relative' }}>
  <img src={imageSrc} ... />
  {step.spotlight && (
    <>
      {/* 4 retângulos escuros nas bordas */}
      <DimRect ... top />     {/* topo até y do retângulo */}
      <DimRect ... bottom />
      <DimRect ... left />
      <DimRect ... right />
      {/* ou: 1 div com clip-path */}
    </>
  )}
</div>
```

Implementação 4-retângulos é mais simples que clip-path e funciona em qualquer browser engine (importante para WebView2).

Botão "Remover spotlight" se `step.spotlight` existir.

**Backend — render no export** ([src-tauri/src/export/markdown.rs](steptrace/src-tauri/src/export/markdown.rs))

Nova função em [src-tauri/src/capture.rs](steptrace/src-tauri/src/capture.rs):

```rust
pub fn render_spotlight_to_bytes(image_path: &Path, spot: &Spotlight) -> Result<Vec<u8>, String> {
    let mut img = image::open(image_path)?.to_rgba8();
    let dim = Rgba([0u8, 0, 0, 102]);  // 40% alpha
    // pinta tudo de dim, depois copia o ROI original por cima
    let original = img.clone();
    image::imageops::overlay(&mut img, &SolidColor::new(img.dimensions(), dim), 0, 0);
    let roi = image::imageops::crop_imm(&original, spot.x as u32, spot.y as u32, spot.w as u32, spot.h as u32).to_image();
    image::imageops::overlay(&mut img, &roi, spot.x as i64, spot.y as i64);
    let mut bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)?;
    Ok(bytes)
}
```

(Pseudocódigo — `SolidColor` não existe; usar `ImageBuffer::from_pixel`.)

Em [markdown.rs](steptrace/src-tauri/src/export/markdown.rs), no loop por step:
- Se `step.spotlight.is_some()`: usar `render_spotlight_to_bytes(...)` em vez de `fs::read(image_full_path)`.
- Resto da lógica (base64 / cópia para `steps/`) idêntica.

Modo "embed images": vai direto pro base64.
Modo "imagens em pasta separada": salvar a versão renderizada em `steps/{step_id}.png` (sobrescreve a cópia).

**Compatibilidade com highlight existente**: highlight é destrutivo (já está no PNG). Spotlight é overlay. No export, primeiro lê PNG (que já tem highlight), depois aplica spotlight em cima. Ordem natural, sem conflito.

---

### 1.6 — Click marker (~10h)

**Hook global de mouse** — novo arquivo [src-tauri/src/mouse_watcher.rs](steptrace/src-tauri/src/mouse_watcher.rs).

```rust
#[cfg(target_os = "windows")]
pub mod windows_mouse {
    use std::sync::mpsc::Sender;
    use std::sync::OnceLock;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowsHookExW, CallNextHookEx, WH_MOUSE_LL,
        MSLLHOOKSTRUCT, WM_LBUTTONDOWN, WM_RBUTTONDOWN,
    };

    pub struct ClickEvent {
        pub screen_x: i32,
        pub screen_y: i32,
        pub button: ClickButton,
    }

    pub enum ClickButton { Left, Right, Middle }

    static SENDER: OnceLock<Sender<ClickEvent>> = OnceLock::new();
    static SHOULD_CAPTURE: AtomicBool = AtomicBool::new(false);

    unsafe extern "system" fn mouse_callback(code, wparam, lparam) -> LRESULT {
        if code >= 0 && SHOULD_CAPTURE.load(Ordering::Relaxed) {
            let hookstruct = *(lparam.0 as *const MSLLHOOKSTRUCT);
            let button = match wparam.0 as u32 {
                WM_LBUTTONDOWN => Some(ClickButton::Left),
                WM_RBUTTONDOWN => Some(ClickButton::Right),
                _ => None,
            };
            if let Some(button) = button {
                if let Some(tx) = SENDER.get() {
                    let _ = tx.send(ClickEvent {
                        screen_x: hookstruct.pt.x,
                        screen_y: hookstruct.pt.y,
                        button,
                    });
                }
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    pub fn start(tx: Sender<ClickEvent>) {
        SENDER.set(tx).ok();
        std::thread::spawn(|| unsafe {
            let _hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_callback), None, 0);
            // pump message loop (igual focus_watcher)
        });
    }

    pub fn set_capture_active(active: bool) {
        SHOULD_CAPTURE.store(active, Ordering::Relaxed);
    }
}
```

**CRÍTICO**: callback DEVE retornar em <200ms ou Windows desinstala o hook. Não fazer nenhum trabalho — só `tx.send()`.

**Thread consumidora** ([lib.rs](steptrace/src-tauri/src/lib.rs))

Análoga ao `start_capture_thread`, mas escutando `Receiver<ClickEvent>`:

```rust
fn start_click_capture_thread(app_handle, rx: Receiver<ClickEvent>) {
    std::thread::spawn(move || {
        let mut last_click = Instant::now() - Duration::from_secs(60);

        while let Ok(click) = rx.recv() {
            let state = app_handle.state::<AppState>();
            if *state.status.lock().unwrap() != AppStatus::Recording { continue; }

            // Debounce: 400ms entre clicks (evita duplo-clique gerar 2 steps)
            let now = Instant::now();
            if now.duration_since(last_click) < Duration::from_millis(400) { continue; }
            last_click = now;

            // Descobre HWND no ponto do clique
            let hwnd = unsafe { WindowFromPoint(POINT { x: click.screen_x, y: click.screen_y }) };
            let hwnd_isize = hwnd.0 as isize;
            if hwnd_isize == 0 { continue; }

            // Filtra próprio app
            if is_own_process(hwnd) { continue; }

            // Calcula posição relativa: precisa GetWindowRect(hwnd)
            let mut rect = RECT::default();
            unsafe { GetWindowRect(hwnd, &mut rect); }
            let rel_x = click.screen_x - rect.left;
            let rel_y = click.screen_y - rect.top;

            // Captura (reusa helper da fase 1.2)
            let _ = capture_step_for_hwnd(
                &app_handle, hwnd_isize,
                ActionType::Click,
                Some((rel_x, rel_y)),
            );
        }
    });
}
```

**Aplicar marker** dentro de `capture_step_for_hwnd` quando `click_marker.is_some()`:

```rust
if let Some((mx, my)) = click_marker {
    // Ajustar coordenadas se a captura tem um offset interno (xcap pode capturar com bordas)
    let highlight = Highlight {
        kind: HighlightKind::Point,
        x: mx as f32, y: my as f32,
        w: None, h: None,
        color: "#FF0000".to_string(),
    };
    capture::apply_highlight(&image_path, &highlight)?;
    step.highlight = Some(highlight);
}
```

Reutiliza `apply_highlight` que já existe e é testado. Cor vermelha (vs laranja `#FF6B35` do highlight manual da revisão) — diferenciação visual.

**Liga/desliga junto com session**:
- `start_session` → `mouse_watcher::set_capture_active(true)` (igual ao focus_watcher)
- `stop_session`, `pause_session` → `false`
- `resume_session` → `true`

**Setup** ([lib.rs](steptrace/src-tauri/src/lib.rs) `pub fn run`):

```rust
let (mouse_tx, mouse_rx) = std::sync::mpsc::channel::<ClickEvent>();
mouse_watcher::windows_mouse::start(mouse_tx);
start_click_capture_thread(app.handle().clone(), mouse_rx);
```

**Considerações finais click marker**

- **Coordenadas com DPI scaling**: `WindowFromPoint` retorna em coords lógicas (com DPI virtualization). `xcap` captura em pixels físicos. Pode dar offset em monitores HiDPI. Validar com smoke test em monitor 4K antes de fechar.
- **Janela não-cliente** (barra de título, bordas): `WindowFromPoint` retorna o HWND do filho clicado. Se for um child window, talvez queiramos o `GetAncestor(hwnd, GA_ROOT)`. Decisão: **sempre subir para root** — simplifica e evita capturar apenas um botão isolado.
- **Documentar no README**: nova seção "Como funciona o click marker" + atualizar "O que esta ferramenta NÃO faz" — agora ELE FAZ hook de mouse global, mas só registra (timestamp + janela) os cliques durante gravação. Transparência total.

---

## FASE 2 — Futuro

Para próxima sessão (ou quando o feedback da Fase 1 estabilizar):

| Item | Esforço | Origem |
|---|---|---|
| Crop de imagem por step | 4–6h | Feature #1 do usuário |
| AnnotationPopup hotkey-driven | 3h | Gap A do CLAUDE.md |
| CapsLock / hotkey de highlight durante gravação | 2h | Gap B (descartado pelo usuário, listar como nice-to-have) |
| Pulse no ícone do tray durante gravação | 1h + ícones | Gap C |
| Refactor TrayMenu.tsx (cosmético) | 2h | Gap estrutural |

---

## Validações ao final da Fase 1

- `cargo check` sem warnings.
- `npx tsc --noEmit` sem erros.
- Smoke test ampliado (atualizar checklist do CLAUDE.md seção 5.5):
  - Capturar manualmente via botão (com janela alvo previamente em foco).
  - Capturar manualmente via `Win+Shift+C` direto na janela alvo.
  - Painel de live log aparece, scrolla, colapsa.
  - Clicar 3x em janelas diferentes → 3 steps com marker vermelho.
  - Clicar duplo-rápido → 1 step (debounce 400ms).
  - Adicionar spotlight em um step → exportar markdown → verificar PNG renderizado tem dim aplicado.
  - Anexar log do clipboard → editar nota → deletar snippet → step continua íntegro.
- `npm run tauri build` final.

**Estimativa total Fase 1:** ~20h.

---

## Pontos abertos antes de executar

Nenhum. Todas as decisões de produto foram tomadas. Ao confirmar este plano, executo a Fase 1 na ordem listada (1.1 → 1.6).

# CLAUDE.md — StepTrace
> Instruções de implementação para o Claude Code.
> Leia este arquivo inteiro antes de executar qualquer comando.
> Execute apenas a Parte que o usuário indicar. Nunca avance para a próxima Parte sem instrução explícita.

---

## O que é o StepTrace

StepTrace é uma ferramenta desktop para Windows que grava sessões de navegação entre janelas, capturando screenshots da janela ativa a cada mudança de foco, com suporte a anotações, destaque de regiões e exportação em Markdown e PDF otimizados para leitura por agentes de IA.

**Stack:** Rust + Tauri 2 + React + TypeScript + Fluent UI React  
**Plataforma alvo:** Windows 10 (build 19041+) e Windows 11  
**Licença:** MIT

---

## Regras Gerais (leia antes de qualquer Parte)

1. **Nunca avance de Parte sem instrução do usuário.** Ao concluir uma Parte, liste o que foi feito e diga explicitamente: "Pronto para a Parte X. Aguardando sua confirmação para continuar."
2. **Prefira `tauri-plugin-screenshots` + `xcap` para toda captura de tela.** Não implemente captura manual com BitBlt ou GDI a não ser que o plugin falhe documentadamente.
3. **Todo código Rust de captura vai em `src-tauri/src/capture.rs`.** Toda lógica de sessão vai em `src-tauri/src/session.rs`. Toda exportação vai em `src-tauri/src/export/`.
4. **Nenhum hook global de teclado (`SetWindowsHookEx` para WH_KEYBOARD_LL).** Use apenas `RegisterHotKey` via `tauri-plugin-global-shortcut`. Isso é requisito de segurança não-negociável.
5. **Nenhum dado de rede.** Sem `reqwest`, sem `hyper`, sem qualquer crate HTTP. O app é 100% local.
6. **Nenhum conteúdo digitado é capturado jamais.** Se implementar clipboard detection, é sempre opt-in com confirmação do usuário via toast.
7. **Ao encontrar um erro de compilação, tente resolver até 3 vezes antes de pedir ajuda ao usuário.**
8. **Commits semânticos.** Use `feat:`, `fix:`, `chore:`, `docs:` nos commits.
9. **Após cada arquivo criado ou modificado, confirme o caminho completo no output.**
10. **Fluent UI React é o design system.** Use `@fluentui/react-components` com `FluentProvider`. Dark mode automático via `webDarkTheme` / `webLightTheme`.

---

## Estrutura Final Esperada do Projeto

```
steptrace/
├── CLAUDE.md                        ← este arquivo
├── README.md
├── LICENSE
├── .gitignore
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/                             ← Frontend React
│   ├── main.tsx
│   ├── App.tsx
│   ├── theme.ts                     ← FluentProvider config
│   ├── components/
│   │   ├── TrayMenu.tsx             ← controles principais
│   │   ├── ReviewPanel.tsx          ← tela de revisão pós-sessão
│   │   ├── StepCard.tsx             ← card de cada passo capturado
│   │   ├── ExportDialog.tsx         ← modal de exportação
│   │   ├── AnnotationPopup.tsx      ← popup de anotação rápida
│   │   └── StatusBadge.tsx          ← badge de status (gravando/pausado/idle)
│   ├── hooks/
│   │   ├── useSession.ts            ← estado global da sessão
│   │   └── useClipboardDetect.ts    ← detecção opt-in de logs
│   ├── types/
│   │   └── index.ts                 ← tipos compartilhados TS
│   └── utils/
│       └── format.ts                ← formatação de timestamps, nomes etc.
├── src-tauri/                       ← Backend Rust
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   └── src/
│       ├── main.rs                  ← entrypoint
│       ├── lib.rs                   ← registro de comandos Tauri
│       ├── capture.rs               ← captura de janela (xcap)
│       ├── session.rs               ← modelo de dados e estado
│       ├── focus_watcher.rs         ← WinEvent hook para foco de janela
│       ├── clipboard.rs             ← detecção de log no clipboard
│       ├── hotkeys.rs               ← registro de hotkeys globais
│       └── export/
│           ├── mod.rs
│           ├── markdown.rs          ← exportação para .md
│           └── pdf.rs               ← exportação para .pdf
```

---

## Modelo de Dados (referência para todas as Partes)

### Session
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,           // "sess_20260420_142305"
    pub started_at: String,   // ISO 8601 com timezone
    pub ended_at: Option<String>,
    pub steps: Vec<Step>,
}
```

### Step
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub id: String,             // "step_001"
    pub session_id: String,
    pub timestamp: String,      // ISO 8601
    pub sequence: u32,
    pub action_type: ActionType,
    pub process_name: String,   // "cursor.exe"
    pub window_title: String,   // "main.rs - projeto-x - Cursor"
    pub monitor_id: u32,
    pub monitor_label: String,  // "Monitor 1 (3840x2160)"
    pub image_path: String,     // caminho relativo ao diretório da sessão
    pub annotation: Option<String>,
    pub log_snippet: Option<String>,
    pub highlight: Option<Highlight>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    Focus,
    Click,
    Scroll,
    Drag,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub kind: HighlightKind,  // Point ou Rect
    pub x: f32,
    pub y: f32,
    pub w: Option<f32>,
    pub h: Option<f32>,
    pub color: String,        // hex, ex: "#FF6B35"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HighlightKind { Point, Rect }
```

---

## Comandos Tauri (IPC Frontend ↔ Backend)

```typescript
// Sessão
invoke('start_session') → Session
invoke('pause_session') → void
invoke('resume_session') → void
invoke('stop_session') → Session

// Steps
invoke('get_session_steps') → Step[]
invoke('delete_step', { stepId: string }) → void
invoke('add_annotation', { stepId: string, text: string }) → void
invoke('add_log_snippet', { stepId: string, log: string }) → void
invoke('add_highlight', { stepId: string, highlight: Highlight }) → void

// Exportação
invoke('export_markdown', { sessionId: string, embedImages: boolean, outputPath: string }) → string
invoke('export_pdf', { sessionId: string, outputPath: string }) → string

// Configurações
invoke('get_config') → AppConfig
invoke('save_config', { config: AppConfig }) → void

// Utilitários
invoke('open_sessions_folder') → void
invoke('get_all_sessions') → SessionMeta[]
```

---

## Hotkeys Padrão

| Ação | Hotkey padrão |
|---|---|
| Iniciar gravação | `Win+Shift+R` |
| Pausar / Retomar | `Win+Shift+P` |
| Parar gravação | `Win+Shift+S` |
| Anotar passo atual | `Win+Shift+A` |
| Toggle highlight mode | `CapsLock` (durante gravação) |

Todos configuráveis via tela de configurações.

---

## O que NUNCA fazer

- `SetWindowsHookEx` com `WH_KEYBOARD_LL` → proibido (parece keylogger)
- Qualquer crate com capacidade de rede (`reqwest`, `hyper`, `ureq`)
- Salvar conteúdo digitado pelo usuário
- Salvar dados do clipboard sem confirmação explícita do usuário
- Capturar tela inteira — sempre capturar apenas a janela ativa (bounding box)
- Usar `unwrap()` em código de produção sem tratar o erro

---

---

# PARTE 1 — Preparação do Ambiente

> **Objetivo:** Criar o projeto Tauri do zero, instalar todas as dependências, configurar o ambiente de desenvolvimento e validar que tudo compila e roda antes de escrever qualquer feature.

## Pré-requisitos (verificar antes de começar)

Execute os comandos abaixo e confirme que todos passam:

```bash
rustc --version        # deve ser >= 1.77
cargo --version
node --version         # deve ser >= 20
npm --version
```

Se qualquer um falhar, instale antes de continuar:
- Rust: https://rustup.rs
- Node: https://nodejs.org (LTS)

## Passo 1.1 — Criar o projeto Tauri

```bash
npm create tauri-app@latest steptrace -- --template react-ts --manager npm --tauri
cd steptrace
```

Se o comando interativo pedir escolhas:
- Framework: React
- Language: TypeScript
- Package manager: npm

## Passo 1.2 — Instalar dependências frontend

```bash
npm install
npm install @fluentui/react-components @fluentui/icons-react
npm install @tauri-apps/api @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-shell @tauri-apps/plugin-notification
```

## Passo 1.3 — Instalar dependências Rust

Edite `src-tauri/Cargo.toml` e adicione ao `[dependencies]`:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
tauri-plugin-notification = "2"

# Captura de janela — resolve DPI e múltiplos monitores
xcap = "0.4"

# Serialização
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Data/hora
chrono = { version = "0.4", features = ["serde"] }

# Imagens
image = "0.25"
base64 = "0.22"

# PDF
printpdf = "0.7"

# Logging interno (não exposto ao usuário)
log = "0.4"
env_logger = "0.11"

# Windows APIs para focus watcher
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [
    "Win32_Foundation",
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_Accessibility",
    "Win32_System_Threading",
]}
```

## Passo 1.4 — Configurar tauri.conf.json

Substitua o conteúdo de `src-tauri/tauri.conf.json` por:

```json
{
  "productName": "StepTrace",
  "version": "0.1.0",
  "identifier": "com.steptrace.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "label": "main",
        "title": "StepTrace",
        "width": 900,
        "height": 650,
        "minWidth": 700,
        "minHeight": 500,
        "resizable": true,
        "visible": false,
        "decorations": true,
        "center": true
      }
    ],
    "trayIcon": {
      "iconPath": "icons/tray-idle.png",
      "iconAsTemplate": true
    },
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "global-shortcut": {},
    "dialog": {},
    "fs": {
      "scope": ["$APPDATA/**", "$DOCUMENT/**", "$DOWNLOAD/**"]
    },
    "shell": {
      "open": true
    },
    "notification": {}
  }
}
```

## Passo 1.5 — Criar capabilities

Crie `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "StepTrace default capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister",
    "global-shortcut:allow-is-registered",
    "dialog:allow-save",
    "dialog:allow-open",
    "fs:allow-read-dir",
    "fs:allow-write-file",
    "fs:allow-create-dir",
    "fs:allow-read-file",
    "shell:allow-open",
    "notification:default"
  ]
}
```

## Passo 1.6 — Criar ícones placeholder

```bash
# Copie os ícones padrão do Tauri (já existem após create)
# Crie os ícones de tray específicos (PNG 22x22 ou 32x32)
# Por ora, use os ícones gerados pelo Tauri como placeholder
# Os ícones finais serão substituídos na Parte 5
```

Verifique que `src-tauri/icons/` contém pelo menos `32x32.png` e `icon.ico`.

## Passo 1.7 — Criar estrutura de pastas

```bash
mkdir -p src/components src/hooks src/types src/utils
mkdir -p src-tauri/src/export
```

## Passo 1.8 — Validar compilação inicial

```bash
npm run tauri dev
```

O app deve abrir (janela vazia com o template padrão do Tauri + React). Se compilar e abrir, a Parte 1 está concluída.

**Problemas comuns:**
- `error[E0463]: can't find crate` → rodar `cargo update` dentro de `src-tauri/`
- `xcap` não compila no Windows → verificar que Windows SDK está instalado (vem com Visual Studio Build Tools)
- Porta 1420 em uso → matar o processo ou mudar `devUrl` para 1421

## Entregáveis da Parte 1

- [ ] Projeto Tauri criando e compilando sem erros
- [ ] Janela abrindo (mesmo que vazia)
- [ ] Todas as dependências instaladas
- [ ] Estrutura de pastas criada

**Ao concluir:** liste os itens acima como ✅ ou ❌ e aguarde confirmação do usuário para a Parte 2.

---

# PARTE 2 — Fundação: Mecânicas Core e Estrutura de Telas

> **Objetivo:** Implementar todas as mecânicas fundamentais do backend (captura, sessão, focus watcher, hotkeys) e a estrutura de todas as telas do frontend — sem necessariamente tudo estar polido, mas tudo funcionando em termos de fluxo.

## Passo 2.1 — Tipos TypeScript compartilhados

Crie `src/types/index.ts`:

```typescript
export type ActionType = 'focus' | 'click' | 'scroll' | 'drag';

export interface Highlight {
  kind: 'point' | 'rect';
  x: number;
  y: number;
  w?: number;
  h?: number;
  color: string;
}

export interface Step {
  id: string;
  session_id: string;
  timestamp: string;
  sequence: number;
  action_type: ActionType;
  process_name: string;
  window_title: string;
  monitor_id: number;
  monitor_label: string;
  image_path: string;
  annotation?: string;
  log_snippet?: string;
  highlight?: Highlight;
}

export interface Session {
  id: string;
  started_at: string;
  ended_at?: string;
  steps: Step[];
}

export interface SessionMeta {
  id: string;
  started_at: string;
  ended_at?: string;
  step_count: number;
}

export type AppStatus = 'idle' | 'recording' | 'paused';

export interface AppConfig {
  sessions_dir: string;
  hotkey_start: string;
  hotkey_pause: string;
  hotkey_stop: string;
  hotkey_annotate: string;
  image_quality: 'high' | 'medium' | 'low';
  default_export_format: 'markdown' | 'pdf';
  embed_images_default: boolean;
}

export interface ExportOptions {
  format: 'markdown' | 'pdf';
  embed_images: boolean;
  output_path: string;
}
```

## Passo 2.2 — Backend: modelo de sessão

Crie `src-tauri/src/session.rs`:

```rust
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    Focus,
    Click,
    Scroll,
    Drag,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HighlightKind {
    Point,
    Rect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub kind: HighlightKind,
    pub x: f32,
    pub y: f32,
    pub w: Option<f32>,
    pub h: Option<f32>,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub id: String,
    pub session_id: String,
    pub timestamp: String,
    pub sequence: u32,
    pub action_type: ActionType,
    pub process_name: String,
    pub window_title: String,
    pub monitor_id: u32,
    pub monitor_label: String,
    pub image_path: String,
    pub annotation: Option<String>,
    pub log_snippet: Option<String>,
    pub highlight: Option<Highlight>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub steps: Vec<Step>,
}

impl Session {
    pub fn new() -> Self {
        let now = Local::now();
        Session {
            id: format!("sess_{}", now.format("%Y%m%d_%H%M%S")),
            started_at: now.to_rfc3339(),
            ended_at: None,
            steps: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum AppStatus {
    Idle,
    Recording,
    Paused,
}

pub struct AppState {
    pub status: Mutex<AppStatus>,
    pub current_session: Mutex<Option<Session>>,
    pub step_counter: Mutex<u32>,
    pub sessions_dir: Mutex<String>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            status: Mutex::new(AppStatus::Idle),
            current_session: Mutex::new(None),
            step_counter: Mutex::new(0),
            sessions_dir: Mutex::new(String::new()),
        }
    }
}
```

## Passo 2.3 — Backend: captura de janela

Crie `src-tauri/src/capture.rs`:

```rust
use xcap::Window;
use std::path::Path;
use image::DynamicImage;

#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub title: String,
    pub process_name: String,
    pub monitor_id: u32,
    pub monitor_label: String,
    pub width: u32,
    pub height: u32,
}

pub fn capture_focused_window(output_path: &Path) -> Result<WindowInfo, String> {
    let windows = Window::all().map_err(|e| format!("Falha ao listar janelas: {}", e))?;

    // Encontra a janela em foco (z-order, a primeira não minimizada em foco)
    let focused = windows
        .iter()
        .find(|w| {
            !w.is_minimized().unwrap_or(true)
                && w.title().unwrap_or_default() != ""
                && w.app_name().unwrap_or_default() != "steptrace" // ignora a própria app
        })
        .ok_or("Nenhuma janela em foco encontrada")?;

    let image = focused
        .capture_image()
        .map_err(|e| format!("Falha ao capturar janela: {}", e))?;

    let dynamic = DynamicImage::ImageRgba8(image);
    dynamic
        .save(output_path)
        .map_err(|e| format!("Falha ao salvar imagem: {}", e))?;

    Ok(WindowInfo {
        title: focused.title().unwrap_or_default(),
        process_name: focused.app_name().unwrap_or_default(),
        monitor_id: 0, // xcap não expõe monitor_id diretamente; derivar por posição
        monitor_label: "Monitor principal".to_string(),
        width: focused.width().unwrap_or(0),
        height: focused.height().unwrap_or(0),
    })
}
```

## Passo 2.4 — Backend: focus watcher (Windows)

Crie `src-tauri/src/focus_watcher.rs`:

```rust
// Monitora mudanças de foco entre janelas via WinEvent
// Usa SetWinEventHook com EVENT_SYSTEM_FOREGROUND (não é keylogger)

#[cfg(target_os = "windows")]
pub mod windows_focus {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
    use windows::Win32::UI::WindowsAndMessaging::{
        EVENT_SYSTEM_FOREGROUND, MSG, GetMessageW, TranslateMessage, DispatchMessageW,
        WINEVENT_OUTOFCONTEXT,
    };

    static SHOULD_CAPTURE: AtomicBool = AtomicBool::new(false);

    pub fn set_capture_active(active: bool) {
        SHOULD_CAPTURE.store(active, Ordering::SeqCst);
    }

    pub fn is_capture_active() -> bool {
        SHOULD_CAPTURE.load(Ordering::SeqCst)
    }

    // Callback chamado pelo Windows quando uma janela recebe foco
    unsafe extern "system" fn focus_callback(
        _hook: HWINEVENTHOOK,
        _event: u32,
        _hwnd: HWND,
        _id_object: i32,
        _id_child: i32,
        _id_event_thread: u32,
        _dwms_event_time: u32,
    ) {
        if SHOULD_CAPTURE.load(Ordering::SeqCst) {
            // Emite sinal para o thread principal capturar
            // (implementação via canal mpsc ou Tauri event)
            log::debug!("Foco detectado — captura agendada");
        }
    }

    pub fn start_focus_watcher(tx: std::sync::mpsc::Sender<()>) {
        std::thread::spawn(move || unsafe {
            let _hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(focus_callback),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }
}
```

> **Nota para Claude Code:** A integração do canal `tx` com o estado Tauri será feita na Parte 3. Na Parte 2, implemente o scaffold e garanta que compila. O callback pode ser um stub por ora.

## Passo 2.5 — Backend: comandos Tauri

Crie `src-tauri/src/lib.rs` com todos os comandos:

```rust
use tauri::State;
use crate::session::{AppState, AppStatus, Session, Step};

mod capture;
mod session;
mod focus_watcher;
mod clipboard;
mod hotkeys;
pub mod export;

#[tauri::command]
fn start_session(state: State<AppState>) -> Result<Session, String> {
    let mut status = state.status.lock().unwrap();
    if *status != AppStatus::Idle {
        return Err("Sessão já em andamento".to_string());
    }
    let new_session = Session::new();
    *state.current_session.lock().unwrap() = Some(new_session.clone());
    *state.step_counter.lock().unwrap() = 0;
    *status = AppStatus::Recording;
    log::info!("Sessão iniciada: {}", new_session.id);
    Ok(new_session)
}

#[tauri::command]
fn pause_session(state: State<AppState>) -> Result<(), String> {
    let mut status = state.status.lock().unwrap();
    if *status != AppStatus::Recording {
        return Err("Sessão não está gravando".to_string());
    }
    *status = AppStatus::Paused;
    Ok(())
}

#[tauri::command]
fn resume_session(state: State<AppState>) -> Result<(), String> {
    let mut status = state.status.lock().unwrap();
    if *status != AppStatus::Paused {
        return Err("Sessão não está pausada".to_string());
    }
    *status = AppStatus::Recording;
    Ok(())
}

#[tauri::command]
fn stop_session(state: State<AppState>) -> Result<Session, String> {
    let mut status = state.status.lock().unwrap();
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    session.ended_at = Some(chrono::Local::now().to_rfc3339());
    let finished = session.clone();
    *status = AppStatus::Idle;
    *session_lock = None;
    Ok(finished)
}

#[tauri::command]
fn get_session_steps(state: State<AppState>) -> Vec<Step> {
    let session_lock = state.current_session.lock().unwrap();
    session_lock
        .as_ref()
        .map(|s| s.steps.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn delete_step(state: State<AppState>, step_id: String) -> Result<(), String> {
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    session.steps.retain(|s| s.id != step_id);
    Ok(())
}

#[tauri::command]
fn add_annotation(
    state: State<AppState>,
    step_id: String,
    text: String,
) -> Result<(), String> {
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let step = session.steps.iter_mut().find(|s| s.id == step_id)
        .ok_or("Step não encontrado")?;
    step.annotation = Some(text);
    Ok(())
}

#[tauri::command]
fn capture_step_now(state: State<AppState>, sessions_dir: String) -> Result<Step, String> {
    // Captura manual de step — usado internamente e por hotkey
    let status = state.status.lock().unwrap().clone();
    if status != AppStatus::Recording {
        return Err("Não está gravando".to_string());
    }
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let mut counter = state.step_counter.lock().unwrap();
    *counter += 1;
    let seq = *counter;

    let step_id = format!("step_{:03}", seq);
    let image_filename = format!("{}.png", step_id);
    let image_path = std::path::Path::new(&sessions_dir)
        .join(&session.id)
        .join("steps")
        .join(&image_filename);

    std::fs::create_dir_all(image_path.parent().unwrap())
        .map_err(|e| format!("Erro ao criar diretório: {}", e))?;

    let info = capture::capture_focused_window(&image_path)?;

    let step = Step {
        id: step_id.clone(),
        session_id: session.id.clone(),
        timestamp: chrono::Local::now().to_rfc3339(),
        sequence: seq,
        action_type: crate::session::ActionType::Focus,
        process_name: info.process_name,
        window_title: info.title,
        monitor_id: info.monitor_id,
        monitor_label: info.monitor_label,
        image_path: format!("steps/{}", image_filename),
        annotation: None,
        log_snippet: None,
        highlight: None,
    };

    session.steps.push(step.clone());
    Ok(step)
}

#[tauri::command]
fn export_markdown(
    state: State<AppState>,
    session_id: String,
    embed_images: bool,
    output_path: String,
    sessions_dir: String,
) -> Result<String, String> {
    // Implementado na Parte 3
    Ok(output_path)
}

#[tauri::command]
fn export_pdf(
    session_id: String,
    output_path: String,
    sessions_dir: String,
) -> Result<String, String> {
    // Implementado na Parte 3
    Ok(output_path)
}

pub fn run() {
    let state = AppState::new();

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            start_session,
            pause_session,
            resume_session,
            stop_session,
            get_session_steps,
            delete_step,
            add_annotation,
            capture_step_now,
            export_markdown,
            export_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar StepTrace");
}
```

## Passo 2.6 — Frontend: theme e FluentProvider

Crie `src/theme.ts`:

```typescript
import {
  webDarkTheme,
  webLightTheme,
  Theme,
} from '@fluentui/react-components';

export function getTheme(): Theme {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? webDarkTheme : webLightTheme;
}
```

Atualize `src/main.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider } from '@fluentui/react-components';
import { getTheme } from './theme';
import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <FluentProvider theme={getTheme()}>
      <App />
    </FluentProvider>
  </React.StrictMode>
);
```

## Passo 2.7 — Frontend: hook de sessão

Crie `src/hooks/useSession.ts`:

```typescript
import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Session, Step, AppStatus } from '../types';

export function useSession() {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const newSession = await invoke<Session>('start_session');
      setSession(newSession);
      setSteps([]);
      setStatus('recording');
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const pauseRecording = useCallback(async () => {
    try {
      await invoke('pause_session');
      setStatus('paused');
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    try {
      await invoke('resume_session');
      setStatus('recording');
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      const finished = await invoke<Session>('stop_session');
      setSession(finished);
      setStatus('idle');
      return finished;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, []);

  const refreshSteps = useCallback(async () => {
    try {
      const currentSteps = await invoke<Step[]>('get_session_steps');
      setSteps(currentSteps);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const deleteStep = useCallback(async (stepId: string) => {
    try {
      await invoke('delete_step', { stepId });
      setSteps(prev => prev.filter(s => s.id !== stepId));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const addAnnotation = useCallback(async (stepId: string, text: string) => {
    try {
      await invoke('add_annotation', { stepId, text });
      setSteps(prev =>
        prev.map(s => s.id === stepId ? { ...s, annotation: text } : s)
      );
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return {
    status,
    session,
    steps,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    refreshSteps,
    deleteStep,
    addAnnotation,
  };
}
```

## Passo 2.8 — Frontend: componentes scaffold

### StatusBadge.tsx
```typescript
import { Badge } from '@fluentui/react-components';
import { AppStatus } from '../types';

interface Props { status: AppStatus; }

export function StatusBadge({ status }: Props) {
  const map = {
    idle: { color: 'subtle' as const, label: 'Pronto' },
    recording: { color: 'danger' as const, label: '● Gravando' },
    paused: { color: 'warning' as const, label: '⏸ Pausado' },
  };
  const { color, label } = map[status];
  return <Badge color={color} size="large">{label}</Badge>;
}
```

### StepCard.tsx
```typescript
import { Card, CardHeader, Button, Textarea, Text, Badge } from '@fluentui/react-components';
import { Delete24Regular, Note24Regular } from '@fluentui/icons-react';
import { useState } from 'react';
import { Step } from '../types';

interface Props {
  step: Step;
  onDelete: (id: string) => void;
  onAnnotate: (id: string, text: string) => void;
  sessionsDir: string;
}

export function StepCard({ step, onDelete, onAnnotate, sessionsDir }: Props) {
  const [editing, setEditing] = useState(false);
  const [annotation, setAnnotation] = useState(step.annotation ?? '');

  const imageSrc = `${sessionsDir}/${step.session_id}/${step.image_path}`;
  const time = new Date(step.timestamp).toLocaleTimeString('pt-BR');

  return (
    <Card style={{ marginBottom: 12 }}>
      <CardHeader
        header={<Text weight="semibold">{step.window_title}</Text>}
        description={
          <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
            {time} · {step.process_name} · {step.monitor_label}
          </Text>
        }
        action={
          <Button
            appearance="subtle"
            icon={<Delete24Regular />}
            onClick={() => onDelete(step.id)}
            title="Remover passo"
          />
        }
      />
      <img
        src={imageSrc}
        alt={`Passo ${step.sequence}`}
        style={{ width: '100%', borderRadius: 4, border: '1px solid var(--colorNeutralStroke1)' }}
      />
      {step.log_snippet && (
        <pre style={{
          background: 'var(--colorNeutralBackground3)',
          borderRadius: 4,
          padding: 8,
          fontSize: 12,
          overflowX: 'auto',
          marginTop: 8,
        }}>
          {step.log_snippet}
        </pre>
      )}
      {editing ? (
        <div style={{ marginTop: 8 }}>
          <Textarea
            value={annotation}
            onChange={(_, d) => setAnnotation(d.value)}
            placeholder="Adicione uma anotação..."
            style={{ width: '100%' }}
          />
          <Button
            appearance="primary"
            size="small"
            style={{ marginTop: 4 }}
            onClick={() => { onAnnotate(step.id, annotation); setEditing(false); }}
          >
            Salvar
          </Button>
        </div>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          {step.annotation && <Text size={200}>{step.annotation}</Text>}
          <Button
            appearance="subtle"
            icon={<Note24Regular />}
            size="small"
            onClick={() => setEditing(true)}
          >
            {step.annotation ? 'Editar anotação' : 'Anotar'}
          </Button>
        </div>
      )}
    </Card>
  );
}
```

### ReviewPanel.tsx
```typescript
import { Button, Title2, Text, Divider, Spinner } from '@fluentui/react-components';
import { ArrowExportRegular } from '@fluentui/icons-react';
import { Session, Step } from '../types';
import { StepCard } from './StepCard';

interface Props {
  session: Session;
  steps: Step[];
  sessionsDir: string;
  onDelete: (id: string) => void;
  onAnnotate: (id: string, text: string) => void;
  onExport: () => void;
}

export function ReviewPanel({ session, steps, sessionsDir, onDelete, onAnnotate, onExport }: Props) {
  const duration = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000)
    : 0;

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title2>Revisão da Sessão</Title2>
          <Text size={300} style={{ color: 'var(--colorNeutralForeground3)' }}>
            {steps.length} passos · {duration}s
          </Text>
        </div>
        <Button
          appearance="primary"
          icon={<ArrowExportRegular />}
          onClick={onExport}
        >
          Exportar
        </Button>
      </div>
      <Divider style={{ marginBottom: 16 }} />
      {steps.length === 0 && (
        <Text>Nenhum passo capturado nesta sessão.</Text>
      )}
      {steps.map(step => (
        <StepCard
          key={step.id}
          step={step}
          sessionsDir={sessionsDir}
          onDelete={onDelete}
          onAnnotate={onAnnotate}
        />
      ))}
    </div>
  );
}
```

### ExportDialog.tsx
```typescript
import {
  Dialog, DialogTrigger, DialogSurface, DialogTitle, DialogBody,
  DialogActions, DialogContent, Button, RadioGroup, Radio, Switch, Label,
} from '@fluentui/react-components';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionsDir: string;
}

export function ExportDialog({ open: isOpen, onClose, sessionId, sessionsDir }: Props) {
  const [format, setFormat] = useState<'markdown' | 'pdf'>('markdown');
  const [embedImages, setEmbedImages] = useState(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const outputPath = await open({
        directory: true,
        title: 'Escolha onde salvar',
      });
      if (!outputPath) return;

      if (format === 'markdown') {
        await invoke('export_markdown', {
          sessionId,
          embedImages,
          outputPath: String(outputPath),
          sessionsDir,
        });
      } else {
        await invoke('export_pdf', {
          sessionId,
          outputPath: String(outputPath),
          sessionsDir,
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogTitle>Exportar sessão</DialogTitle>
        <DialogBody>
          <DialogContent>
            <RadioGroup
              value={format}
              onChange={(_, d) => setFormat(d.value as any)}
            >
              <Radio value="markdown" label="Markdown (.md)" />
              <Radio value="pdf" label="PDF (.pdf)" />
            </RadioGroup>
            {format === 'markdown' && (
              <div style={{ marginTop: 16 }}>
                <Switch
                  checked={embedImages}
                  onChange={(_, d) => setEmbedImages(d.checked)}
                  label="Embutir imagens em base64 (recomendado para IA)"
                />
              </div>
            )}
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
```

## Passo 2.9 — Frontend: App.tsx principal

```typescript
import { useState, useEffect } from 'react';
import { Button, Toolbar, ToolbarButton, Text, Divider } from '@fluentui/react-components';
import { Record24Regular, Pause24Regular, Stop24Regular, Settings24Regular } from '@fluentui/icons-react';
import { StatusBadge } from './components/StatusBadge';
import { ReviewPanel } from './components/ReviewPanel';
import { ExportDialog } from './components/ExportDialog';
import { useSession } from './hooks/useSession';

const SESSIONS_DIR = ''; // será preenchido via invoke('get_config') na Parte 3

export default function App() {
  const {
    status, session, steps,
    startRecording, pauseRecording, resumeRecording, stopRecording,
    refreshSteps, deleteStep, addAnnotation,
  } = useSession();

  const [view, setView] = useState<'home' | 'review'>('home');
  const [exportOpen, setExportOpen] = useState(false);

  const handleStop = async () => {
    const finished = await stopRecording();
    if (finished) {
      await refreshSteps();
      setView('review');
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Toolbar style={{ padding: '8px 16px', borderBottom: '1px solid var(--colorNeutralStroke1)' }}>
        <StatusBadge status={status} />
        <div style={{ flex: 1 }} />
        {status === 'idle' && (
          <ToolbarButton icon={<Record24Regular />} onClick={startRecording}>
            Iniciar
          </ToolbarButton>
        )}
        {status === 'recording' && (
          <>
            <ToolbarButton icon={<Pause24Regular />} onClick={pauseRecording}>Pausar</ToolbarButton>
            <ToolbarButton icon={<Stop24Regular />} onClick={handleStop}>Parar</ToolbarButton>
          </>
        )}
        {status === 'paused' && (
          <>
            <ToolbarButton icon={<Record24Regular />} onClick={resumeRecording}>Retomar</ToolbarButton>
            <ToolbarButton icon={<Stop24Regular />} onClick={handleStop}>Parar</ToolbarButton>
          </>
        )}
      </Toolbar>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {view === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <Text size={500} weight="semibold">StepTrace</Text>
            <Text size={300} style={{ color: 'var(--colorNeutralForeground3)' }}>
              {status === 'idle' ? 'Clique em Iniciar para gravar uma sessão.' : `Gravando... ${steps.length} passos capturados.`}
            </Text>
          </div>
        )}
        {view === 'review' && session && (
          <ReviewPanel
            session={session}
            steps={steps}
            sessionsDir={SESSIONS_DIR}
            onDelete={deleteStep}
            onAnnotate={addAnnotation}
            onExport={() => setExportOpen(true)}
          />
        )}
      </div>

      {session && (
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          sessionId={session.id}
          sessionsDir={SESSIONS_DIR}
        />
      )}
    </div>
  );
}
```

## Passo 2.10 — Validar compilação

```bash
npm run tauri dev
```

O app deve abrir com toolbar, botão Iniciar e StatusBadge. Clicar em Iniciar deve chamar o backend e mudar o status. A janela de revisão pode aparecer sem imagens ainda — isso é esperado.

## Entregáveis da Parte 2

- [ ] Todos os tipos TypeScript definidos
- [ ] Backend compilando com todos os comandos Tauri registrados
- [ ] Frontend com todas as telas scaffolded (Home, Review, ExportDialog)
- [ ] FluentProvider configurado com dark mode automático
- [ ] `useSession` hook funcional
- [ ] Botões de controle (Iniciar, Pausar, Parar) respondem aos cliques
- [ ] App abre e não trava

**Ao concluir:** aguarde confirmação do usuário para a Parte 3.

---

# PARTE 3 — Versão Funcional para Teste Humano

> **Objetivo:** Fazer tudo funcionar de ponta a ponta. Captura real de janelas, focus watcher real, hotkeys registradas, exportação Markdown e PDF funcionais. Esta é a versão que o usuário vai testar pela primeira vez.

## Passo 3.1 — Integrar focus watcher com captura real

Atualize `focus_watcher.rs` para enviar eventos via Tauri:

```rust
// O focus watcher deve emitir um evento Tauri "window-focused" quando detectar mudança
// O evento é recebido no frontend que chama invoke('capture_step_now')
// Alternativa mais robusta: usar um channel mpsc para comunicar com o thread principal
```

Implementação detalhada:
1. No `main.rs`, criar um `std::sync::mpsc::channel::<()>()` 
2. Passar o `tx` para `focus_watcher::start_focus_watcher(tx)`
3. Em thread separado, receber do `rx` e chamar `capture_step_now` internamente
4. Emitir evento Tauri `"step-captured"` com o Step serializado para o frontend atualizar

## Passo 3.2 — Exportação Markdown real

Implemente `src-tauri/src/export/markdown.rs`:

```rust
use crate::session::{Session, Step};
use base64::{Engine, engine::general_purpose};
use std::fs;
use std::path::Path;

pub fn export(
    session: &Session,
    steps: &[Step],
    sessions_dir: &str,
    output_path: &str,
    embed_images: bool,
) -> Result<(), String> {
    let mut md = String::new();

    // Cabeçalho
    md.push_str(&format!("# Sessão StepTrace — {}\n\n", session.started_at));
    if let Some(end) = &session.ended_at {
        let duration_secs = {
            let start = chrono::DateTime::parse_from_rfc3339(&session.started_at).ok();
            let end = chrono::DateTime::parse_from_rfc3339(end).ok();
            match (start, end) {
                (Some(s), Some(e)) => (e - s).num_seconds(),
                _ => 0,
            }
        };
        md.push_str(&format!("**Duração:** {}min {}s  \n", duration_secs / 60, duration_secs % 60));
    }
    md.push_str(&format!("**Passos:** {}  \n", steps.len()));
    md.push_str("\n---\n\n");

    // Passos
    for step in steps {
        let time = chrono::DateTime::parse_from_rfc3339(&step.timestamp)
            .map(|d| d.format("%H:%M:%S").to_string())
            .unwrap_or_else(|_| step.timestamp.clone());

        md.push_str(&format!(
            "## Passo {} — {} | {} | {}\n\n",
            step.sequence, time, step.process_name, step.window_title
        ));
        md.push_str(&format!("**Ação:** {:?}  \n", step.action_type));
        md.push_str(&format!("**Monitor:** {}  \n\n", step.monitor_label));

        // Imagem
        let image_full_path = Path::new(sessions_dir)
            .join(&step.session_id)
            .join(&step.image_path);

        if embed_images {
            if let Ok(bytes) = fs::read(&image_full_path) {
                let b64 = general_purpose::STANDARD.encode(&bytes);
                md.push_str(&format!("![Passo {}](data:image/png;base64,{})\n\n", step.sequence, b64));
            }
        } else {
            md.push_str(&format!("![Passo {}](./steps/{:03}.png)\n\n", step.sequence, step.sequence));
        }

        // Anotação
        if let Some(annotation) = &step.annotation {
            md.push_str(&format!("> 💬 **Anotação:** {}\n\n", annotation));
        }

        // Log snippet
        if let Some(log) = &step.log_snippet {
            md.push_str("```log\n");
            md.push_str(log);
            md.push_str("\n```\n\n");
        }

        md.push_str("---\n\n");
    }

    // Rodapé
    md.push_str("*Gerado por [StepTrace](https://github.com/seu-usuario/steptrace)*\n");

    // Salvar
    let output_file = Path::new(output_path)
        .join(format!("{}.md", session.id));
    fs::write(&output_file, md)
        .map_err(|e| format!("Erro ao salvar Markdown: {}", e))?;

    // Se não embutindo imagens, copiar pasta de steps
    if !embed_images {
        let steps_src = Path::new(sessions_dir).join(&session.id).join("steps");
        let steps_dst = Path::new(output_path).join("steps");
        if steps_src.exists() {
            copy_dir_recursive(&steps_src, &steps_dst)?;
        }
    }

    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dst_path = dst.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dst_path)?;
        } else {
            fs::copy(entry.path(), dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
```

## Passo 3.3 — Exportação PDF básica

Implemente `src-tauri/src/export/pdf.rs`:

```rust
use printpdf::*;
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;
use crate::session::{Session, Step};

pub fn export(
    session: &Session,
    steps: &[Step],
    sessions_dir: &str,
    output_path: &str,
) -> Result<(), String> {
    let (doc, page1, layer1) = PdfDocument::new(
        &format!("StepTrace — {}", session.started_at),
        Mm(210.0),  // A4
        Mm(297.0),
        "Página 1",
    );

    let font = doc.add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let font_bold = doc.add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;

    // Página de capa
    let layer = doc.get_page(page1).get_layer(layer1);
    layer.use_text(
        format!("StepTrace — Sessão {}", &session.started_at[..10]),
        24.0, Mm(20.0), Mm(270.0), &font_bold,
    );
    layer.use_text(
        format!("{} passos capturados", steps.len()),
        12.0, Mm(20.0), Mm(255.0), &font,
    );

    // Um passo por página
    for step in steps {
        let (page_idx, layer_idx) = doc.add_page(Mm(210.0), Mm(297.0), "conteúdo");
        let layer = doc.get_page(page_idx).get_layer(layer_idx);

        layer.use_text(
            format!("Passo {} — {}", step.sequence, step.window_title),
            14.0, Mm(15.0), Mm(280.0), &font_bold,
        );
        layer.use_text(
            format!("{} · {}", step.process_name, &step.timestamp[..19]),
            10.0, Mm(15.0), Mm(272.0), &font,
        );

        if let Some(annotation) = &step.annotation {
            layer.use_text(
                format!("Anotação: {}", annotation),
                10.0, Mm(15.0), Mm(264.0), &font,
            );
        }

        // Inserir imagem se disponível
        let image_path = Path::new(sessions_dir)
            .join(&step.session_id)
            .join(&step.image_path);

        if let Ok(bytes) = std::fs::read(&image_path) {
            if let Ok(img) = image::load_from_memory(&bytes) {
                let img_rgb = img.to_rgb8();
                let (w, h) = img_rgb.dimensions();
                let pdf_image = Image::from_dynamic_image(&img.into());
                let scale = (180.0_f64 / w as f64).min(200.0 / h as f64);
                pdf_image.add_to_layer(
                    layer.clone(),
                    ImageTransform {
                        translate_x: Some(Mm(15.0)),
                        translate_y: Some(Mm(260.0 - (h as f64 * scale))),
                        scale_x: Some(scale),
                        scale_y: Some(scale),
                        ..Default::default()
                    },
                );
            }
        }
    }

    let output_file = Path::new(output_path)
        .join(format!("{}.pdf", session.id));
    doc.save(&mut BufWriter::new(
        File::create(output_file).map_err(|e| e.to_string())?
    )).map_err(|e| e.to_string())?;

    Ok(())
}
```

## Passo 3.4 — Registrar hotkeys globais

Atualize `src-tauri/src/main.rs`:

```rust
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

// No setup do Builder:
.setup(|app| {
    // Registrar hotkeys
    let app_handle = app.handle().clone();
    
    app.global_shortcut().on_shortcut("Super+Shift+R", move |_, _, _| {
        // start_session
    })?;
    app.global_shortcut().on_shortcut("Super+Shift+P", move |_, _, _| {
        // pause/resume
    })?;
    app.global_shortcut().on_shortcut("Super+Shift+S", move |_, _, _| {
        // stop_session
    })?;
    
    Ok(())
})
```

## Passo 3.5 — Clipboard detection (opt-in)

Implemente `src-tauri/src/clipboard.rs`:

```rust
// Polling do clipboard a cada 500ms quando status == Recording
// Heurística de log: texto contendo "[", "ERROR", "WARN", "$", ">" no início de linha
// Se detectado: emitir evento Tauri "log-detected" para o frontend
// Frontend mostra toast com opção "Anexar" ou "Ignorar"
// Só salva se usuário confirmar
```

## Passo 3.6 — Exibir imagens reais no ReviewPanel

Atualize `StepCard.tsx` para usar `convertFileSrc` do Tauri:

```typescript
import { convertFileSrc } from '@tauri-apps/api/core';
// ...
const imageSrc = convertFileSrc(`${sessionsDir}/${step.session_id}/${step.image_path}`);
```

## Passo 3.7 — Atualização em tempo real dos steps

No `App.tsx`, escutar o evento `"step-captured"` do backend:

```typescript
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
  const unlisten = listen<Step>('step-captured', (event) => {
    // adicionar step ao estado local sem precisar de invoke
    setSteps(prev => [...prev, event.payload]);
  });
  return () => { unlisten.then(f => f()); };
}, []);
```

## Entregáveis da Parte 3

- [ ] Captura real acontece quando janela ganha foco
- [ ] Screenshots aparecem no ReviewPanel
- [ ] Hotkeys Win+Shift+R / P / S funcionam
- [ ] Exportação Markdown gera arquivo .md válido
- [ ] Exportação PDF gera arquivo .pdf válido
- [ ] Clipboard detection mostra toast ao copiar log
- [ ] Imagens aparecem com qualidade legível para IA

> ⚠️ **Pausa para teste humano.** Após concluir, notifique o usuário que a versão está pronta para teste. Aguarde feedback antes de iniciar a Parte 4.

---

# PARTE 4 — Ajustes e Features Core Completas

> **Objetivo:** Incorporar o feedback do teste humano, implementar highlight mode, modo de anotação por hotkey, suporte a múltiplos monitores e polimento geral de UX.

## Pré-condição

Antes de iniciar, leia o feedback do usuário e liste:
1. Bugs reportados (corrigir primeiro, por ordem de gravidade)
2. Features incompletas que o usuário notou
3. Melhorias de UX solicitadas

## Passo 4.1 — Highlight mode (CapsLock toggle)

O highlight é desenhado sobre o screenshot **já salvo**, não sobre a tela ao vivo.

Implementação:
1. Registrar listener de tecla CapsLock apenas enquanto gravando (não usar hook global — usar estado interno de toggle via evento da janela Tauri)
2. Quando ativo, o próximo click capturado gera um overlay
3. Overlay é desenhado no Rust com a crate `image`:

```rust
use image::{DynamicImage, Rgba};
use imageproc::drawing::{draw_filled_circle_mut, draw_filled_rect_mut};
use imageproc::rect::Rect;

pub fn apply_highlight(image_path: &str, highlight: &Highlight) -> Result<(), String> {
    let mut img = image::open(image_path)
        .map_err(|e| format!("Erro ao abrir imagem: {}", e))?;
    
    let color = parse_hex_color(&highlight.color)?;
    let rgba = Rgba([color.0, color.1, color.2, 160u8]); // semi-transparente
    
    match highlight.kind {
        HighlightKind::Point => {
            draw_filled_circle_mut(&mut img, (highlight.x as i32, highlight.y as i32), 20, rgba);
        }
        HighlightKind::Rect => {
            let rect = Rect::at(highlight.x as i32, highlight.y as i32)
                .of_size(highlight.w.unwrap_or(100.0) as u32, highlight.h.unwrap_or(60.0) as u32);
            draw_filled_rect_mut(&mut img, rect, rgba);
        }
    }
    
    img.save(image_path).map_err(|e| format!("Erro ao salvar: {}", e))?;
    Ok(())
}
```

Adicionar `imageproc` ao `Cargo.toml`.

## Passo 4.2 — Popup de anotação por hotkey (Win+Shift+A)

Quando a hotkey é pressionada durante gravação:
1. A janela StepTrace ganha foco brevemente
2. Aparece um Dialog do Fluent UI com campo de texto
3. Usuário digita a anotação e pressiona Enter
4. A anotação é associada ao último step capturado
5. A janela StepTrace some e o foco retorna à janela anterior

## Passo 4.3 — Múltiplos monitores

Melhorar `capture.rs` para identificar corretamente em qual monitor a janela está:

```rust
// xcap::Monitor::all() retorna todos os monitores
// Cruzar a posição (x, y) da janela com os bounds de cada monitor
// Nomear como "Monitor 1 (3840x2160)" baseado na resolução e índice
```

## Passo 4.4 — Tela de configurações

Criar `src/components/SettingsPanel.tsx` com:
- Campo para diretório de sessões
- Campos para hotkeys (texto editável com formato "Win+Shift+R")
- Toggle de qualidade de imagem (Alta / Média)
- Botão "Restaurar padrões"

Persistir em `AppConfig` via `invoke('save_config')`.

## Passo 4.5 — System tray completo

Implementar menu no system tray com:
- Status atual (Idle / Gravando / Pausado)
- Botões Iniciar / Pausar / Parar
- "Abrir StepTrace" (mostra a janela)
- "Configurações"
- "Sair"

O ícone do tray muda de cor conforme o status.

## Passo 4.6 — Salvar e reabrir sessões

Implementar persistência completa:
1. Ao parar uma sessão, salvar `session.json` em `sessions_dir/{session_id}/`
2. Comando `get_all_sessions` → lê todos os `session.json` e retorna lista
3. Tela de sessões anteriores no frontend (lista simples com botão "Reabrir")

## Entregáveis da Parte 4

- [ ] Highlight mode funcionando (ponto e retângulo sobre screenshot)
- [ ] Popup de anotação por hotkey
- [ ] Múltiplos monitores identificados corretamente
- [ ] Tela de configurações com persistência
- [ ] System tray completo com ícone dinâmico
- [ ] Sessões salvas e reabertas corretamente
- [ ] Todos os bugs reportados na Parte 3 corrigidos

> ⚠️ **Segunda pausa para teste humano.** Notifique o usuário e aguarde feedback para a Parte 5.

---

# PARTE 5 — Fechamento do MVP

> **Objetivo:** Incorporar feedback final, corrigir bugs remanescentes, polir UX, preparar para distribuição como binário standalone.

## Passo 5.1 — Incorporar feedback da Parte 4

Mesma estrutura: listar bugs → corrigir → listar melhorias → implementar.

## Passo 5.2 — Polimento de UX

- Animação de "pulso" no ícone de tray durante gravação
- Toast de confirmação após exportação bem-sucedida com botão "Abrir pasta"
- Empty state com ilustração na tela de revisão quando não há passos
- Loading state enquanto captura está acontecendo
- Atalhos de teclado visíveis nos tooltips dos botões

## Passo 5.3 — README.md do repositório

Gerar `README.md` completo incluindo:
- Badges (MIT license, Windows only, Rust + Tauri)
- Screenshot da interface
- Seção "O que esta ferramenta NÃO faz" (sem keylogging, sem rede, sem captura de texto)
- Instruções de instalação (download do .exe)
- Instruções de compilação (para devs)
- Hotkeys de referência rápida
- Guia de uso em 3 passos

## Passo 5.4 — GitHub Actions para build

Criar `.github/workflows/build.yml`:

```yaml
name: Build StepTrace

on:
  push:
    tags: ['v*']

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm run tauri build
      - uses: actions/upload-artifact@v4
        with:
          name: steptrace-windows
          path: src-tauri/target/release/bundle/
```

## Passo 5.5 — Validação final

Checklist de smoke test que o usuário deve executar:

```
□ Abrir o app
□ Pressionar Win+Shift+R → status muda para "Gravando"
□ Alternar entre 3 janelas diferentes → 3 steps capturados
□ Pressionar CapsLock → modo highlight ativo
□ Clicar em uma região → highlight aparece no screenshot
□ Pressionar Win+Shift+A → popup de anotação aparece
□ Digitar anotação → salva no último step
□ Copiar um log do terminal → toast aparece → confirmar
□ Pressionar Win+Shift+S → abre tela de revisão
□ Deletar um step → some da lista
□ Exportar como Markdown com imagens embutidas → abrir .md no VS Code
□ Verificar que .md pode ser colado num agente de IA
□ Exportar como PDF → abrir e verificar legibilidade
□ Fechar o app → não aparece na barra de tarefas (fica no tray)
□ Clicar no tray → app abre
```

## Entregáveis da Parte 5

- [ ] Todos os bugs da Parte 4 corrigidos
- [ ] UX polida (animações, toasts, empty states)
- [ ] README.md completo
- [ ] GitHub Actions configurado
- [ ] Binário `.exe` standalone gerado via `npm run tauri build`
- [ ] Smoke test passando

---

# Modo de Melhoria Contínua (pós-MVP)

Após a Parte 5, cada nova sessão com o Claude Code segue este padrão:

1. Usuário descreve o que quer melhorar ou reporta um bug
2. Claude Code lê este CLAUDE.md para relembrar contexto
3. Claude Code propõe a abordagem antes de codar
4. Claude Code implementa, compila, e confirma
5. Usuário testa e devolve feedback

Backlog sugerido (em ordem de valor):
1. Template de prompt configurável para exportação ("Você é um engenheiro de UX, analise esta sessão...")
2. Export HTML standalone (galeria de passos navegável no browser)
3. Blur automático de regiões configuráveis (ex: barra de URL, campos de senha)
4. Sessões com tags e busca por processo ou título de janela
5. Contador de passos no ícone de tray (badge numérico)
6. Suporte a > 2 monitores
7. Reordenação de passos na revisão (drag and drop)

---

*StepTrace CLAUDE.md — Documento vivo. Atualize conforme o projeto evolui.*

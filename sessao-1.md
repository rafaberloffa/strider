# StepTrace — Sessão 1 (Partes 1 a 4)

**Data:** 2026-04-20  
**Participantes:** Rafael + Claude Code (claude-sonnet-4-6)  
**Projeto:** `d:\DEV\Step-Tracer\steptrace\`  
**Stack:** Rust + Tauri 2 + React + TypeScript + Fluent UI React  

---

## O que foi construído

StepTrace é uma ferramenta desktop Windows que grava sessões de navegação entre janelas, capturando screenshots da janela ativa a cada mudança de foco, com suporte a anotações, destaque de regiões e exportação em Markdown e PDF otimizados para leitura por agentes de IA.

---

## Parte 1 — Setup do ambiente

- Projeto criado com `npm create tauri-app@latest steptrace -- --template react-ts`
- Dependências frontend: `@fluentui/react-components`, `@tauri-apps/api`, plugins Tauri
- Dependências Rust: `xcap`, `serde`, `chrono`, `image`, `base64`, `printpdf`, `imageproc`, `windows`
- `tauri.conf.json` configurado (porta 1421, `assetProtocol` habilitado, sem `trayIcon` no JSON)
- `capabilities/default.json` com permissões de fs, dialog, shell, global-shortcut
- Estrutura de pastas criada: `src/components/`, `src/hooks/`, `src/types/`, `src/utils/`, `src-tauri/src/export/`

**Correções aplicadas na Parte 1:**
- Nome do pacote `@fluentui/icons-react` → `@fluentui/react-icons`
- Permissão `fs:allow-mkdir` → `fs:allow-create-dir`

---

## Parte 2 — Fundação e scaffold

### Arquivos criados

| Arquivo | Descrição |
|---|---|
| `src/types/index.ts` | Tipos TS: `Step`, `Session`, `SessionMeta`, `AppConfig`, `Highlight`, `AppStatus` |
| `src/utils/format.ts` | `renderTemplate()`, `sanitize()`, `formatDuration()` |
| `src/hooks/useSession.ts` | Hook central de estado: sessão, steps, config, recentSessions |
| `src/theme.ts` | `getTheme()` — dark/light automático via `prefers-color-scheme` |
| `src/main.tsx` | FluentProvider com `getTheme()` |
| `src/App.tsx` | App principal: toolbar, views home/review/settings, Toaster |
| `src/components/StatusBadge.tsx` | Badge colorido por status |
| `src/components/StepCard.tsx` | Card de passo: imagem, anotação, highlight mode |
| `src/components/ReviewPanel.tsx` | Tela de revisão pós-sessão |
| `src/components/ExportDialog.tsx` | Modal: MD + PDF simultâneos, template de nome, folder picker |
| `src/components/SessionsList.tsx` | Lista de sessões recentes na home |
| `src/components/SettingsPanel.tsx` | Configurações: sessions_dir, template, purge, qualidade |
| `src-tauri/src/session.rs` | Modelos Rust: `Session`, `Step`, `AppConfig`, `AppState`, helpers de disco |
| `src-tauri/src/capture.rs` | `capture_focused_window`, `apply_highlight`, `detect_monitor`, `is_blank` |
| `src-tauri/src/focus_watcher.rs` | `SetWinEventHook` com `EVENT_SYSTEM_FOREGROUND`, envia HWND via mpsc |
| `src-tauri/src/clipboard.rs` | Polling de clipboard a cada 500ms, heurística de log, evento `log-detected` |
| `src-tauri/src/hotkeys.rs` | Stub de hotkeys (implementado via `register_hotkeys` em lib.rs) |
| `src-tauri/src/export/markdown.rs` | Exportação `.md` com imagens base64 opcionais |
| `src-tauri/src/export/pdf.rs` | Exportação `.pdf` (texto-only por limitação do printpdf 0.7) |
| `src-tauri/src/lib.rs` | Todos os comandos Tauri, capture thread, tray, hotkeys globais |

### Comandos Tauri registrados

```
start_session, pause_session, resume_session, stop_session,
get_session_steps, delete_step, add_annotation, add_log_snippet,
add_highlight, set_highlight_mode, get_config, save_config,
get_all_sessions, load_session, delete_session, export_session,
open_sessions_folder, open_path
```

---

## Parte 3 — Integração ponta a ponta

### Funcionalidades implementadas

- **Focus watcher real:** `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` envia HWND via `mpsc::Sender<isize>`
- **Capture thread:** dedupe de HWND consecutivo + debounce 250ms + delay 80ms (DWM) + `is_blank()` check + filtro por PID próprio + detecção de monitor via `xcap::Monitor::all()`
- **Asset protocol:** `assetProtocol.enable = true` + `convertFileSrc(path, 'asset')` para exibir imagens locais
- **Hotkeys globais:** Win+Shift+R (start), Win+Shift+P (pause/resume), Win+Shift+S (stop), Win+Shift+A (annotate event)
- **Clipboard detection:** polling opt-in, toast com botão "Anexar" ao último step
- **Persistência:** `session.json` salvo em `$APPDATA/StepTrace/sessions/{session_id}/`
- **Auto-purge:** background thread a cada 5min, configurável (padrão 1h), roda também no startup
- **System tray:** menu com Show/Start/Pause/Stop/Quit, tooltip dinâmico por status
- **Exportação Markdown:** com imagens base64 embutidas ou referências relativas
- **Exportação PDF:** texto-only (título, processo, horário, monitor, anotação) — imagens pendentes

### Eventos Tauri (backend → frontend)

| Evento | Payload |
|---|---|
| `session-started` | `Session` |
| `session-stopped` | `Session` |
| `status-changed` | `"recording"` \| `"paused"` |
| `step-captured` | `Step` |
| `log-detected` | `string` (texto do clipboard) |
| `hotkey-annotate` | `()` |

---

## Parte 4 — Features completas e correção de bugs

### Bugs corrigidos (reportados no teste humano)

#### 1. Imagens não apareciam no Review
- **Causa:** `convertFileSrc` sem protocolo `'asset'` + `assetProtocol` não habilitado no `tauri.conf.json`
- **Fix:** `convertFileSrc(path, 'asset')` + adição de `assetProtocol: { enable: true, scope: { allow: [...] } }` no JSON

#### 2. Anotação salva não aparecia / highlight não funcionava
- **Causa:** `do_stop_session` zerava `*session_lock = None`. Após parar, todos os `add_annotation` / `add_highlight` retornavam `"Nenhuma sessão ativa"`. Frontend chamava `setEditing(false)` sem await → parecia salvar mas não salvava.
- **Fix:** `do_stop_session` não limpa mais `current_session`; mantém em memória para mutações de revisão. `load_session` agora popula `current_session` com a sessão carregada do disco.

#### 3. Botão "Voltar" redirecionava de volta para review
- **Causa:** Effect de auto-navegação em App.tsx disparava imediatamente ao mudar `view='home'` porque `session.ended_at` e `steps.length > 0` ainda estavam setados.
- **Fix:** `clearSession()` adicionado ao hook; chamado no onClick do "Voltar" antes de mudar a view.

#### 4. Export não salvava arquivo
- **Causa:** Código antigo passava diretório como `output_path` e tentava join com `session.id`, mas o diretório já existia. Novo código: usuário escolhe pasta + digita nome base; Rust escreve `output_dir/filename.md`.
- **Fix:** Reescrita completa do `ExportDialog.tsx` e unificação em `export_session` no Rust.

#### 5. Cache de imagem não atualizava após highlight
- **Causa:** `imageSrc` com `Date.now()` inline mudava a cada render (causando refetch desnecessário). Após fix do bug 2, o highlight passou a funcionar; o cache-bust foi refinado.
- **Fix:** `useMemo([rawPath, step.highlight])` → refetch apenas quando highlight muda.

### Features novas (Parte 4)

- **Highlight mode:** botão pincel no StepCard ativa crosshair; clique calcula coordenadas escaladas e chama `add_highlight`; backend usa `imageproc` para desenhar círculo laranja (`#FF6B35`) no PNG
- **Múltiplos monitores:** `capture.rs` usa `xcap::Monitor::all()` + interseção de bounding box para nomear "Monitor N (WxH)"
- **Settings panel:** sessions_dir (read-only), template de nome, auto-purge horas, qualidade de imagem, embed default
- **Sessões recentes:** `SessionsList` na home quando idle; `get_all_sessions` lê todos `session.json` do disco
- **Template de nome de exportação:** `{yyyy}{MM}{dd}_{HH}{mm}` renderizado no TS via `renderTemplate()`
- **Auto-purge configurável:** padrão 1 hora

---

## Arquitetura de dados

### `AppConfig` (persiste em `$APPDATA/StepTrace/config.json`)

```typescript
interface AppConfig {
  sessions_dir: string;
  hotkey_start: string;      // "Super+Shift+R"
  hotkey_pause: string;      // "Super+Shift+P"
  hotkey_stop: string;       // "Super+Shift+S"
  hotkey_annotate: string;   // "Super+Shift+A"
  image_quality: string;     // "high" | "medium" | "low"
  default_export_format: string;
  embed_images_default: boolean;
  export_name_template: string;  // "steptrace_{yyyy}-{MM}-{dd}_{HH}{mm}"
  auto_purge_hours: number;      // 1
}
```

### Estrutura de diretórios em disco

```
$APPDATA/StepTrace/
├── config.json
└── sessions/
    └── sess_20260420_182400/
        ├── session.json
        └── steps/
            ├── step_001.png
            ├── step_002.png
            └── ...
```

---

## Estado do build

```
cargo check  → OK (1 warning: register_hotkeys stub não usada)
tsc --noEmit → OK (zero erros)
npm run tauri dev → Roda em localhost:1421
```

---

## Pendências para Parte 5

### Bugs conhecidos
- **PDF sem imagens:** `printpdf 0.7` removeu `Image::from_dynamic_image`. Precisa reescrever `export/pdf.rs` lendo bytes PNG diretamente e usando a nova API.
- **Warning Rust:** `hotkeys.rs::register_hotkeys` nunca chamada externamente (stub). Pode deletar o arquivo e mover o conteúdo para lib.rs ou simplesmente suprimir com `#[allow(dead_code)]`.

### Features da Parte 5 (CLAUDE.md)

1. **UX polish:**
   - Empty state com ilustração no ReviewPanel quando sem passos
   - Loading state durante captura
   - Toast pós-exportação com botão "Abrir pasta" (chamar `invoke('open_path', { path: outputDir })`)
   - Atalhos de teclado visíveis nos tooltips

2. **README.md** completo:
   - Badges (MIT, Windows only, Rust + Tauri)
   - Screenshot da interface
   - Seção "O que esta ferramenta NÃO faz"
   - Instruções de instalação e compilação
   - Hotkeys de referência

3. **GitHub Actions** (`.github/workflows/build.yml`):
   - Trigger: push de tags `v*`
   - Runner: `windows-latest`
   - Steps: checkout → rust-toolchain → node 20 → npm install → `npm run tauri build` → upload artifact

4. **Build de distribuição:** `npm run tauri build` → gera `.exe` standalone em `src-tauri/target/release/bundle/`

5. **Smoke test** (checklist do CLAUDE.md seção 5.5)

---

## Decisões de design relevantes

| Decisão | Motivo |
|---|---|
| Sem `SetWindowsHookEx WH_KEYBOARD_LL` | Requisito de segurança — parece keylogger |
| Sem crates de rede | App 100% local, sem telemetria |
| Clipboard opt-in com toast | Usuário confirma antes de salvar |
| `current_session` mantido após stop | Permite mutações na tela de revisão sem recarregar do disco |
| `mpsc::Sender<isize>` (HWND) | Permite dedupe no capture thread sem lock adicional |
| Asset protocol em vez de fs read | Imagens PNG servidas diretamente pelo Tauri sem invoke |
| `useMemo` no imageSrc | Evita refetch de imagem a cada render; só recalcula quando highlight muda |

---

*Sessão encerrada em 2026-04-20. Próxima sessão: Parte 5 — Fechamento do MVP.*

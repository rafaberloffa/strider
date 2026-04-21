# Strider

> Ferramenta desktop para **Windows** que grava sessões de navegação entre janelas,
> capturando screenshots da janela ativa a cada mudança de foco — com anotações,
> destaque de regiões e exportação em **Markdown** e **PDF** otimizados para leitura por
> agentes de IA.

![License: GPLv3](https://img.shields.io/badge/license-GPLv3-blue)
![Platform: Windows 10/11](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4)
![Stack: Rust + Tauri 2 + React](https://img.shields.io/badge/stack-Rust%20%2B%20Tauri%202%20%2B%20React-orange)

<!-- TODO: substituir por screenshot real após build final -->
<!-- ![Strider](./docs/screenshot.png) -->

---

## Por que isso existe

Quando você precisa explicar um bug, um fluxo ou um processo para outra pessoa (ou
para um agente de IA), o ideal é ter uma trilha de screenshots **contextualizados**:
cada janela que foi aberta, em ordem, com timestamps, nome do processo, anotações
e destaque de onde você clicou.

O Strider gera exatamente isso, com zero atrito:

1. Você aperta `Win+Shift+R` e começa a trabalhar normalmente.
2. A cada mudança de janela, o Strider captura **só aquela janela** (não a tela toda).
3. Você aperta `Win+Shift+S` para parar.
4. Exporta como `.md` com as imagens embutidas em base64 → cola direto no ChatGPT /
   Claude / Cursor e pronto.

---

## O que esta ferramenta **NÃO** faz

Strider foi desenhado para ser **seguro de instalar**. Ele não:

- ✕ **Não registra teclas digitadas.** Nenhum `WH_KEYBOARD_LL`, nenhum keylogger.
  Apenas `RegisterHotKey` do Windows (as 4 combinações configuradas).
- ✕ **Não envia dados pela rede.** Não há `reqwest`, `hyper`, `ureq` ou qualquer
  crate HTTP no `Cargo.toml`. 100% local.
- ✕ **Não captura a tela inteira.** Só a bounding box da janela em foco.
- ✕ **Não lê conteúdo de campos de senha, credenciais, ou do que você digita.**
- ✕ **Não lê o clipboard silenciosamente.** A detecção de logs no clipboard é
  *opt-in* e cada trecho detectado pede confirmação explícita via toast antes
  de ser salvo.

Tudo fica em disco em `%APPDATA%\com.strider.app\Strider\sessions\`.

---

## Hotkeys

| Ação                           | Atalho          |
| ------------------------------ | --------------- |
| Iniciar gravação               | `Win+Shift+R`   |
| Pausar / Retomar               | `Win+Shift+P`   |
| Parar gravação                 | `Win+Shift+S`   |
| Anotar (evento)                | `Win+Shift+A`   |

---

## Uso em 3 passos

1. **Gravar** — `Win+Shift+R` e alterne entre janelas normalmente. A barra de tarefas
   mostra um indicador vermelho pulsante enquanto grava.
2. **Revisar** — `Win+Shift+S` abre a tela de revisão. Cada passo é um card com
   imagem, janela, timestamp e processo. Você pode:
   - Anotar um passo
   - Deletar passos irrelevantes
   - Marcar regiões com o pincel (clique na imagem para adicionar highlight laranja)
3. **Exportar** — botão **Exportar**, escolha formato (Markdown e/ou PDF), pasta
   destino e nome. Com `Embutir imagens em base64` ligado, o `.md` é um único
   arquivo autocontido, perfeito para colar em um agente de IA.

---

## Configurações

Disponíveis na tela de configurações (ícone de engrenagem):

- **Pasta de sessões** — onde as capturas ficam salvas (read-only, abre no Explorer).
- **Template de nome para exportação** — com placeholders `{yyyy} {MM} {dd} {HH} {mm} {ss}`.
- **Auto-remover sessões após N horas** — padrão `1h`, coloque `0` para nunca.
- **Qualidade da imagem** — Alta / Média / Baixa.
- **Embutir imagens por padrão no Markdown** — toggle.

---

## Instalação

### Binário pré-compilado

<!-- TODO: após primeiro release público, incluir link de download
Baixe o último `.exe` em **[Releases](https://github.com/SEU-USUARIO/strider/releases)**.
-->

> ⚠ Ainda sem release público. Compile localmente (veja abaixo).

### Compilar do código-fonte

**Pré-requisitos:**

- Rust ≥ 1.77 ([rustup.rs](https://rustup.rs))
- Node.js ≥ 20 LTS ([nodejs.org](https://nodejs.org))
- Visual Studio Build Tools (Windows SDK + MSVC C++)

```powershell
git clone <repo-url>
cd strider
npm install
npm run tauri dev          # desenvolvimento (hot reload)
npm run tauri build        # gera .exe em src-tauri\target\release\bundle\
```

O bundle gera um instalador `.msi` / `.exe` em
`src-tauri\target\release\bundle\nsis\` (ou `\msi\`).

---

## Arquitetura

**Stack:** Rust + Tauri 2 + React 19 + TypeScript + Fluent UI React

```
┌──────────────────────┐      invoke / events       ┌───────────────────────┐
│   React (Fluent UI)  │ ◄────────────────────────► │    Rust (Tauri 2)     │
│                      │                            │                       │
│  - Home / Review     │                            │  - AppState (Mutex)   │
│  - Export / Settings │                            │  - focus_watcher      │
│  - StatusBadge       │                            │    (SetWinEventHook)  │
│  - StepCard          │                            │  - capture (xcap)     │
└──────────────────────┘                            │  - export (md / pdf)  │
                                                    │  - clipboard watcher  │
                                                    │  - global hotkeys     │
                                                    │  - system tray        │
                                                    └───────────────────────┘
```

**Fluxo de captura:**

1. `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` dispara callback quando foco muda.
2. Callback envia `HWND` via `mpsc::Sender<isize>`.
3. Thread de captura faz dedupe consecutivo + debounce 250ms + delay de 80ms
   para o DWM compor a janela + `is_blank()` check + filtro de PID próprio.
4. `xcap::Window::capture_image()` captura apenas a bounding box da janela.
5. PNG salvo em disco + evento `step-captured` emitido ao frontend.

---

## Persistência

```
%APPDATA%\com.strider.app\Strider\
├── config.json
└── sessions\
    └── sess_20260420_182400\
        ├── session.json
        └── steps\
            ├── step_001.png
            └── step_002.png
```

Cada sessão é autocontida. Apagar a pasta `sess_*` apaga tudo daquela gravação.

---

## Known issues

- **Exportação PDF sai sem imagens.** Somente o texto (título, processo, timestamp,
  monitor, anotação) é incluído por página. A API de imagens do `printpdf 0.7`
  mudou de forma incompatível e a reescrita está pendente. Se precisar de imagens,
  use o **Markdown com embed base64** — abre perfeitamente em qualquer editor ou
  agente de IA.
- **Sem animação no ícone da tray.** O ícone do tray é estático; só o tooltip muda
  conforme o status.

---

## Licença

GPLv3 — veja [`LICENSE`](./LICENSE).

---

*Strider — construído para quem precisa explicar fluxos sem abrir a boca.*

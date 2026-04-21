# PRD — StepTrace
**Product Requirements Document v0.1**
Status: Draft | Autor: [seu nome] | Data: 2026-04-20

---

## 1. Visão Geral

### 1.1 O Problema

O Windows Steps Recorder (PSR) está sendo descontinuado. Para desenvolvedores e pesquisadores que usam múltiplas ferramentas de desenvolvimento simultâneas (Cursor, VS Code, Claude Code, Windsurf, terminais), não existe nenhuma ferramenta open-source que:

- Grave a sequência de ações do usuário entre janelas diferentes com foco automático
- Capture screenshots de qualidade suficiente para leitura por IA
- Permita anotar e destacar regiões durante a gravação
- Exporte para formatos amigáveis a agentes de IA (Markdown com imagens embutidas)
- Seja transparente e auditável sobre o que captura (sem comportamento de keylogger)

### 1.2 A Solução

**StepTrace** é uma ferramenta desktop open-source para Windows que grava sessões de navegação entre janelas, capturando screenshots com contexto da janela ativa, timestamps e anotações opcionais do usuário — exportando relatórios em Markdown e PDF otimizados para leitura humana e por agentes de IA.

### 1.3 Posicionamento

| | Steps Recorder (PSR) | Snipping Tool | StepTrace |
|---|---|---|---|
| Captura por clique | ✅ | ❌ | ✅ |
| Múltiplas janelas | ✅ | ❌ | ✅ |
| Múltiplos monitores | ❌ | ✅ | ✅ |
| Captura janela com foco | ❌ (tela inteira) | ✅ | ✅ |
| Anotações inline | ❌ | ❌ | ✅ |
| Export Markdown | ❌ | ❌ | ✅ |
| Export PDF | ❌ | ❌ | ✅ |
| Otimizado para IA | ❌ | ❌ | ✅ |
| Open-source | ❌ | ❌ | ✅ |

---

## 2. Público-Alvo

### 2.1 Usuário Primário (MVP)

**Desenvolvedor hobbysta / pesquisador de UX pessoal** que usa múltiplas ferramentas de desenvolvimento e quer documentar sessões de trabalho para:

- Reportar bugs e problemas de usabilidade em ferramentas de IA (Cursor, Claude Code, Windsurf etc.)
- Criar contexto rico para agentes de IA debugarem problemas
- Registrar fluxos de navegação entre janelas com anotações

### 2.2 Persona Principal

> **Lucas, 32 anos — Dev indie + entusiasta de ferramentas de IA**
> Setup: monitor 4K + FHD. Usa Cursor, VS Code, Claude Code e múltiplos terminais simultaneamente. Quer documentar problemas de usabilidade que encontra nessas ferramentas e gerar relatórios que possa colar direto em um agente de IA para debugging. Não quer instalar coisa pesada, não quer nada que pareça spyware.

---

## 3. Requisitos Funcionais

### 3.1 Controles de Sessão

**RF-01 — Iniciar gravação**
- Hotkey global configurável (padrão: `Win + Shift + R`)
- Ícone na system tray para controle rápido
- A ferramenta fica minimizada/em background durante a gravação

**RF-02 — Pausar / Retomar**
- Hotkey global (padrão: `Win + Shift + P`)
- Indicador visual de status na system tray (gravando / pausado / parado)

**RF-03 — Parar gravação**
- Hotkey global (padrão: `Win + Shift + S`) ou clique no tray
- Ao parar, abre a tela de Revisão automaticamente

---

### 3.2 Captura

**RF-04 — Captura por mudança de foco**
- Screenshot automático quando o usuário clica em qualquer janela que recebe foco
- Captura apenas a janela ativa (bounding box da janela), não a tela inteira
- Suporte a múltiplos monitores: identifica em qual monitor a janela está
- Metadados capturados por passo:
  - Timestamp ISO 8601 (com timezone)
  - Nome do processo (`cursor.exe`, `Code.exe`, `WindowsTerminal.exe` etc.)
  - Título da janela (ex: `main.rs - projeto-x - Cursor`)
  - Monitor de origem (Monitor 1, Monitor 2...)
  - Tipo de ação: `focus` | `click` | `scroll` | `drag` | `highlight`

**RF-05 — Captura de scroll e drag**
- Scroll registrado como evento (sem screenshot adicional, apenas log de evento)
- Drag-and-drop registrado como evento de início e fim
- Nenhum conteúdo de texto digitado é capturado em nenhum momento

**RF-06 — Qualidade da imagem**
- Resolução nativa da janela capturada (sem downscale no momento da captura)
- Formato: PNG lossless
- Opção de compressão na exportação (para reduzir tamanho do MD/PDF)

---

### 3.3 Anotação

**RF-07 — Modo de destaque (highlight)**
- Ativado por hotkey de toggle (padrão: `CapsLock` enquanto gravando)
- Enquanto ativo, o próximo clique ou área arrastada é marcada com overlay colorido no screenshot
- O overlay é desenhado sobre o screenshot salvo, não sobre a tela ao vivo
- Comportamento: clicar = destaca ponto com marcador circular; arrastar = destaca retângulo

**RF-08 — Anotação de texto**
- Hotkey para abrir popup de texto rápido (padrão: `Win + Shift + A`)
- Campo de texto simples que vira um bloco de anotação associado ao passo atual
- Também pode ser adicionado durante a Revisão

**RF-09 — Captura de log do clipboard**
- Detecção passiva: quando o usuário copia algo para o clipboard durante a gravação, a ferramenta verifica se parece um log de terminal (heurística: texto com `[`, timestamps, stack traces, linhas iniciadas com `$`, `>` ou `ERROR`)
- Se detectado, exibe toast discreto: "Log detectado — anexar ao passo atual? [Sim] [Ignorar]"
- Confirmado: o log é salvo como bloco de código associado ao passo
- Nenhum dado do clipboard é salvo sem confirmação explícita do usuário

---

### 3.4 Revisão

**RF-10 — Tela de revisão pós-gravação**
- Abre automaticamente ao parar a gravação
- Lista linear de todos os passos capturados, em ordem cronológica
- Cada passo mostra: thumbnail do screenshot + timestamp + nome da janela + tipo de ação
- Ações disponíveis por passo:
  - Deletar passo
  - Adicionar/editar anotação de texto
  - Ver screenshot em tamanho real

**RF-11 — Sem edição avançada no MVP**
- Sem reordenação de passos
- Sem merge de passos
- Sem edição das imagens capturadas

---

### 3.5 Exportação

**RF-12 — Export Markdown**
- Estrutura do arquivo:
  ```
  # Sessão StepTrace — [data e hora]
  **Duração:** X min
  **Passos:** N
  
  ---
  
  ## Passo 1 — 14:23:05 | Cursor | main.rs - projeto-x
  **Ação:** foco na janela
  **Monitor:** Monitor 1 (4K)
  
  ![Passo 1](./steps/step-001.png)
  
  > 💬 Anotação: erro aparece ao salvar o arquivo
  
  ```log
  ERROR: thread 'main' panicked at 'index out of bounds'
  ```
  
  ---
  ```
- Opção na exportação: imagens como arquivos externos (`./steps/`) ou embutidas em base64
- Padrão: base64 embutido (otimizado para colar em agentes de IA)

**RF-13 — Export PDF**
- PDF estruturado com as mesmas seções do Markdown
- Cada passo em sua própria área visual
- Cabeçalho com metadados da sessão
- Screenshots em resolução adequada para leitura

**RF-14 — Formato de sessão interno**
- Sessões ficam salvas automaticamente em diretório configurável
- Formato: JSON + pasta de imagens PNG
- Permite reabrir sessões anteriores para revisão e re-exportação
- Retenção: o usuário define (padrão: manter indefinidamente, sem limpeza automática)

---

## 4. Requisitos Não-Funcionais

### 4.1 Privacidade e Segurança

**RNF-01 — Zero captura de texto digitado**
- Nenhum hook de teclado para captura de conteúdo
- O hotkey global usa APIs do Windows de registro de teclas de atalho (RegisterHotKey), não hooks globais de teclado

**RNF-02 — Clipboard opt-in explícito**
- Nenhum dado do clipboard é salvo sem confirmação via toast

**RNF-03 — Local-only**
- Sem telemetria
- Sem conexão de rede em nenhuma circunstância
- Código aberto e auditável

**RNF-04 — Transparência de captura**
- Ícone de tray sempre visível e distinto enquanto gravando
- Cor do ícone muda visivelmente entre estados: idle / gravando / pausado

### 4.2 Performance

**RNF-05 — Impacto mínimo**
- Uso de CPU < 2% em idle (sem gravação ativa)
- Uso de CPU < 5% durante gravação ativa
- Captura assíncrona: não bloqueia o foco da janela do usuário

**RNF-06 — Latência de captura**
- Screenshot deve ser capturado em < 200ms após o evento de foco

### 4.3 Compatibilidade

**RNF-07 — Plataforma**
- Windows 10 (build 19041+) e Windows 11
- Suporte a múltiplos monitores com DPI diferentes (DPI awareness)
- Sem dependência de instalação de runtimes adicionais (binário standalone)

---

## 5. Stack Tecnológico

### 5.1 Linguagem e Runtime

| Componente | Tecnologia | Justificativa |
|---|---|---|
| Backend / lógica | **Rust** | Performance, safety, sem GC, excelente para APIs Win32 |
| Frontend / UI | **Tauri 2** | Rust backend + WebView frontend; binário compacto; sem Electron overhead |
| UI framework | **React + TypeScript** | Ecossistema rico, familiar, bom para UI reativa |
| Design system | **Fluent UI React** (`@fluentui/react-components`) | Nativo ao Windows, Fluent Design 2, dark mode automático |
| Win32 APIs | **windows-rs** | Bindings oficiais da Microsoft para Rust |

### 5.2 Bibliotecas Chave (Rust)

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "global-shortcut"] }
windows = { version = "0.58", features = [
    "Win32_UI_WindowsAndMessaging",
    "Win32_Graphics_Gdi",
    "Win32_Foundation",
    "Win32_System_DataExchange",   # clipboard
] }
screenshots = "0.8"               # captura de janela específica
image = "0.25"                    # processamento PNG
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
```

### 5.3 Bibliotecas Chave (Frontend)

```json
{
  "@fluentui/react-components": "^9",
  "@tauri-apps/api": "^2",
  "react": "^18",
  "typescript": "^5"
}
```

### 5.4 Exportação

| Formato | Abordagem |
|---|---|
| Markdown | Geração por template em Rust (string building, sem dependência externa) |
| PDF | `printpdf` crate (Rust, sem dependência de Chromium/LibreOffice) |
| Base64 inline | `base64` crate para embutir PNG no MD |

---

## 6. Arquitetura

```
StepTrace/
├── src-tauri/               # Backend Rust
│   ├── src/
│   │   ├── main.rs          # Entrypoint Tauri
│   │   ├── capture.rs       # Captura de screenshot (windows-rs)
│   │   ├── session.rs       # Gerenciamento de sessão e steps
│   │   ├── clipboard.rs     # Monitor de clipboard opt-in
│   │   ├── hotkeys.rs       # Registro de hotkeys globais
│   │   ├── export/
│   │   │   ├── markdown.rs
│   │   │   └── pdf.rs
│   │   └── storage.rs       # Serialização JSON + disco
│   └── Cargo.toml
├── src/                     # Frontend React
│   ├── App.tsx
│   ├── components/
│   │   ├── ReviewPanel.tsx  # Tela de revisão de passos
│   │   ├── StepCard.tsx     # Card individual de passo
│   │   ├── ExportDialog.tsx # Modal de exportação
│   │   └── TrayMenu.tsx     # Interface do system tray
│   └── main.tsx
└── package.json
```

### 6.1 Fluxo de Dados

```
[Evento Win32: WM_SETFOCUS / clique]
         ↓
[capture.rs: GetWindowRect → BitBlt → PNG buffer]
         ↓
[session.rs: cria Step { id, timestamp, process, title, monitor, image }]
         ↓
[storage.rs: salva PNG em /sessions/{id}/steps/ + atualiza session.json]
         ↓
[Tauri event → Frontend: atualiza contagem no tray]
```

---

## 7. Modelo de Dados

### 7.1 Session

```json
{
  "id": "sess_20260420_142305",
  "started_at": "2026-04-20T14:23:05-03:00",
  "ended_at": "2026-04-20T14:45:12-03:00",
  "steps": ["step_001", "step_002", "..."]
}
```

### 7.2 Step

```json
{
  "id": "step_001",
  "session_id": "sess_20260420_142305",
  "timestamp": "2026-04-20T14:23:05.412-03:00",
  "sequence": 1,
  "action_type": "focus",
  "process_name": "cursor.exe",
  "window_title": "main.rs - projeto-x - Cursor",
  "monitor_id": 1,
  "monitor_label": "Monitor 1 (3840x2160)",
  "image_path": "steps/step-001.png",
  "annotation": "Erro aparece ao salvar o arquivo",
  "log_snippet": null,
  "highlight": {
    "type": "rect",
    "x": 120, "y": 340, "w": 480, "h": 90,
    "color": "#FF6B35"
  }
}
```

---

## 8. UI/UX

### 8.1 Princípios de Design

- **Invisível durante uso** — a ferramenta não atrapalha o fluxo de trabalho
- **Fluent Design 2** — usa `@fluentui/react-components` com suporte a dark mode automático via `FluentProvider` + `webDarkTheme` / `webLightTheme`
- **Densidade informacional alta na revisão** — thumbnails + metadados legíveis sem abrir cada passo
- **Sem jargão** — "Passo", "Anotação", "Exportar" — não "frame", "annotation layer", "render"

### 8.2 Telas

| Tela | Trigger | Descrição |
|---|---|---|
| **Tray menu** | Clique no ícone | Estado atual + botões Iniciar / Pausar / Parar |
| **Revisão** | Ao parar a gravação | Lista de passos, delete, anotação, exportação |
| **Export dialog** | Botão "Exportar" na revisão | Escolha de formato, destino, opções de imagem |
| **Configurações** | Menu de configurações no tray | Hotkeys, pasta de sessões, qualidade de imagem |

### 8.3 Estados do Ícone de Tray

| Estado | Ícone | Tooltip |
|---|---|---|
| Idle | cinza | "StepTrace — Pronto" |
| Gravando | vermelho pulsante | "StepTrace — Gravando (N passos)" |
| Pausado | amarelo | "StepTrace — Pausado" |

---

## 9. Escopo do MVP

### 9.1 Incluído no MVP

- Gravação por mudança de foco (qualquer janela)
- Captura da janela ativa (não tela inteira)
- Suporte a 2 monitores
- Anotações de texto por passo
- Destaque de região (highlight) via CapsLock
- Detecção opt-in de log no clipboard
- Revisão pós-sessão (deletar passo, adicionar anotação)
- Export Markdown (imagens externas ou base64)
- Export PDF básico
- Sessões salvas localmente em JSON + PNG
- Hotkeys globais configuráveis
- UI em Fluent Design 2 com dark mode

### 9.2 Explicitamente Fora do MVP

| Feature | Motivo do adiamento |
|---|---|
| Captura de video | Complexidade significativa, fora do caso de uso principal |
| OCR nos screenshots | Custo de dependência; IA já consegue ler as imagens |
| Integração com Jira/Azure/GitHub | Fora do escopo hobbysta; adiciona superfície de ataque |
| Suporte a > 2 monitores | Edge case; implementar após validar arquitetura base |
| Blur automático de dados sensíveis | Útil, mas complexo; pós-MVP |
| Internacionalização (i18n) | PT-BR suficiente para MVP |
| Auto-update | Pós-MVP |

---

## 10. Considerações de Segurança e Privacidade

### 10.1 O que é capturado

| Dado | Capturado? | Condição |
|---|---|---|
| Screenshot da janela ativa | ✅ | A cada mudança de foco |
| Título da janela | ✅ | Sempre |
| Nome do processo | ✅ | Sempre |
| Timestamp | ✅ | Sempre |
| Monitor de origem | ✅ | Sempre |
| Texto digitado | ❌ | Nunca |
| Conteúdo do clipboard | ⚠️ | Apenas com confirmação explícita do usuário |
| Histórico de navegação | ❌ | Nunca |
| Dados de rede | ❌ | Nunca |

### 10.2 Mitigações

- **README explícito**: seção "O que esta ferramenta NÃO faz" no topo do repositório
- **Código auditável**: todo o código de captura em `capture.rs` e `clipboard.rs` é autocontido e comentado
- **Sem hooks de teclado globais**: uso de `RegisterHotKey` (Win32 API de atalhos), não `SetWindowsHookEx` para teclado
- **Sem transmissão de rede**: verificável no `Cargo.toml` pela ausência de dependências HTTP

---

## 11. Estrutura Open-Source

### 11.1 Repositório

```
github.com/[usuario]/steptrace
├── README.md          # Descrição, instalação, "o que NÃO captura"
├── LICENSE            # MIT
├── CONTRIBUTING.md
├── CHANGELOG.md
├── docs/
│   └── PRD.md         # Este documento
├── src-tauri/
├── src/
└── .github/
    └── workflows/
        └── build.yml  # CI: Windows build + release binário
```

### 11.2 Licença

**MIT** — permissiva, sem restrições para uso pessoal ou comercial futuro.

### 11.3 Release

- Binário `.exe` standalone via GitHub Releases
- Sem instalador no MVP (portable app)
- CI via GitHub Actions: `cargo build --release` + empacotamento Tauri

---

## 12. Métricas de Sucesso (Pessoal / MVP)

| Métrica | Meta |
|---|---|
| Gerar um relatório MD completo de sessão de debug | ✅ funcional |
| Colar o MD num agente de IA e ele entender o contexto | Feedback qualitativo positivo |
| Usar diariamente sem impacto perceptível na performance | CPU < 5% durante gravação |
| Tempo para exportar sessão de 30 passos | < 10 segundos |

---

## 13. Roadmap Pós-MVP

### v0.2
- Suporte a > 2 monitores
- Blur automático de regiões sensíveis (configurável)
- Reordenação de passos na revisão

### v0.3
- Template de prompt configurável para exportação (ex: "Você é um engenheiro de UX, analise esta sessão...")
- Export HTML standalone (página web com galeria de passos)
- Sessões com tags e busca

### v1.0 (se virar produto)
- Assinatura de código (signed binary)
- Instalador MSIX
- Suporte a múltiplos perfis/usuários
- Integração opcional com Jira / GitHub Issues

---

*StepTrace — Document the invisible. Feed the AI.*

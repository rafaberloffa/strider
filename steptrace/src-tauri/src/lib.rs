mod capture;
mod clipboard;
pub mod export;
mod focus_watcher;
mod mouse_watcher;
mod session;
mod tray;

use session::{
    delete_session_from_disk, list_sessions_on_disk, load_session_from_disk,
    purge_expired_sessions, save_session_to_disk, AppConfig, AppState, AppStatus, Highlight,
    LogSnippet, Session, SessionMeta, Spotlight, Step,
};
use tauri::{Emitter, Manager, State};

// ─── helper de captura compartilhado ─────────────────────────────────────────

fn do_capture_step(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    hwnd: isize,
    action_type: session::ActionType,
    click_pos: Option<(i32, i32)>,
    allow_fallback: bool,
) -> Result<Step, String> {
    let session_id = {
        let lock = state.current_session.lock().unwrap();
        lock.as_ref()
            .map(|s| s.id.clone())
            .ok_or("Nenhuma sessão ativa")?
    };

    let sessions_dir = state.sessions_dir.lock().unwrap().clone();

    let seq = {
        let mut c = state.step_counter.lock().unwrap();
        *c += 1;
        *c
    };

    let step_id = format!("step_{:03}", seq);
    let image_filename = format!("{}.png", step_id);
    let image_path = std::path::Path::new(&sessions_dir)
        .join(&session_id)
        .join("steps")
        .join(&image_filename);

    if let Err(e) = std::fs::create_dir_all(image_path.parent().unwrap()) {
        *state.step_counter.lock().unwrap() -= 1;
        return Err(format!("Criar dir falhou: {}", e));
    }

    let info = capture::capture_by_hwnd(hwnd, &image_path, allow_fallback).map_err(|e| {
        *state.step_counter.lock().unwrap() -= 1;
        e
    })?;

    let mut step = Step {
        id: step_id,
        session_id: session_id.clone(),
        timestamp: chrono::Local::now().to_rfc3339(),
        sequence: seq,
        action_type,
        process_name: info.process_name,
        window_title: info.title,
        monitor_id: info.monitor_id,
        monitor_label: info.monitor_label,
        image_path: format!("steps/{}", image_filename),
        annotation: None,
        log_snippet: None,
        highlight: None,
        spotlight: None,
    };

    // Aplica marcador de clique (bola vermelha ~70% opaca) se fornecido.
    // Usa apply_click_marker (alpha-blending) em vez de apply_highlight (sólido).
    if let Some((mx, my)) = click_pos {
        let color = "#FF0000";
        let opacity = 0.7;
        if capture::apply_click_marker(&image_path, mx, my, color, opacity).is_ok() {
            step.highlight = Some(Highlight {
                kind: session::HighlightKind::Point,
                x: mx as f32,
                y: my as f32,
                w: None,
                h: None,
                color: color.to_string(),
            });
        }
    }

    if let Some(s) = state.current_session.lock().unwrap().as_mut() {
        s.steps.push(step.clone());
    }
    persist_current(state);
    let _ = app_handle.emit("step-captured", &step);
    log::info!("Step {} capturado: {}", seq, step.window_title);
    Ok(step)
}

// ─── helpers de estado ───────────────────────────────────────────────────────

fn do_start_session(state: &AppState) -> Result<Session, String> {
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

fn do_stop_session(state: &AppState) -> Result<Session, String> {
    let mut status = state.status.lock().unwrap();
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    session.ended_at = Some(chrono::Local::now().to_rfc3339());
    let finished = session.clone();
    *status = AppStatus::Idle;
    // Mantém current_session em memória para mutações na tela de revisão.

    let sessions_dir = state.sessions_dir.lock().unwrap().clone();
    if let Err(e) = save_session_to_disk(&finished, &sessions_dir) {
        log::warn!("Falha ao persistir sessão: {}", e);
    }
    Ok(finished)
}

fn persist_current(state: &AppState) {
    let sessions_dir = state.sessions_dir.lock().unwrap().clone();
    if let Some(ref s) = *state.current_session.lock().unwrap() {
        let _ = save_session_to_disk(s, &sessions_dir);
    }
}

// ─── Windows: verifica se HWND pertence ao próprio processo ──────────────────

#[cfg(target_os = "windows")]
fn is_own_process_hwnd(hwnd_val: isize) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
    let own_pid = std::process::id();
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(HWND(hwnd_val as *mut _), Some(&mut pid)); }
    pid == own_pid
}

#[cfg(not(target_os = "windows"))]
fn is_own_process_hwnd(_hwnd_val: isize) -> bool { false }

// ─── Windows: HWND da janela em foreground neste momento ─────────────────────

#[cfg(target_os = "windows")]
fn get_foreground_hwnd() -> isize {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    unsafe { GetForegroundWindow().0 as isize }
}

#[cfg(not(target_os = "windows"))]
fn get_foreground_hwnd() -> isize { 0 }

// ─── comandos Tauri ──────────────────────────────────────────────────────────

#[tauri::command]
fn start_session(state: State<AppState>, app_handle: tauri::AppHandle) -> Result<Session, String> {
    let session = do_start_session(&state)?;
    #[cfg(target_os = "windows")]
    {
        focus_watcher::windows_focus::set_capture_active(true);
        mouse_watcher::windows_mouse::set_capture_active(true);
    }
    let _ = app_handle.emit("session-started", &session);
    tray::update_tray_icon(&app_handle, &AppStatus::Recording);
    Ok(session)
}

#[tauri::command]
fn pause_session(state: State<AppState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut status = state.status.lock().unwrap();
    if *status != AppStatus::Recording {
        return Err("Sessão não está gravando".to_string());
    }
    *status = AppStatus::Paused;
    drop(status);
    #[cfg(target_os = "windows")]
    {
        focus_watcher::windows_focus::set_capture_active(false);
        mouse_watcher::windows_mouse::set_capture_active(false);
    }
    let _ = app_handle.emit("status-changed", "paused");
    tray::update_tray_icon(&app_handle, &AppStatus::Paused);
    Ok(())
}

#[tauri::command]
fn resume_session(state: State<AppState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut status = state.status.lock().unwrap();
    if *status != AppStatus::Paused {
        return Err("Sessão não está pausada".to_string());
    }
    *status = AppStatus::Recording;
    drop(status);
    #[cfg(target_os = "windows")]
    {
        focus_watcher::windows_focus::set_capture_active(true);
        mouse_watcher::windows_mouse::set_capture_active(true);
    }
    let _ = app_handle.emit("status-changed", "recording");
    tray::update_tray_icon(&app_handle, &AppStatus::Recording);
    Ok(())
}

#[tauri::command]
fn stop_session(state: State<AppState>, app_handle: tauri::AppHandle) -> Result<Session, String> {
    #[cfg(target_os = "windows")]
    {
        focus_watcher::windows_focus::set_capture_active(false);
        mouse_watcher::windows_mouse::set_capture_active(false);
    }
    let session = do_stop_session(&state)?;
    let _ = app_handle.emit("session-stopped", &session);
    tray::update_tray_icon(&app_handle, &AppStatus::Idle);
    Ok(session)
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
    if let Some(session) = session_lock.as_mut() {
        session.steps.retain(|s| s.id != step_id);
    }
    drop(session_lock);
    persist_current(&state);
    Ok(())
}

#[tauri::command]
fn add_annotation(state: State<AppState>, step_id: String, text: String) -> Result<(), String> {
    let trimmed = text.trim().to_string();
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let step = session
        .steps
        .iter_mut()
        .find(|s| s.id == step_id)
        .ok_or("Step não encontrado")?;
    step.annotation = if trimmed.is_empty() { None } else { Some(trimmed) };
    drop(session_lock);
    persist_current(&state);
    Ok(())
}

#[tauri::command]
fn add_log_snippet(
    state: State<AppState>,
    step_id: String,
    log: String,
) -> Result<LogSnippet, String> {
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let step = session
        .steps
        .iter_mut()
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
    let step = session
        .steps
        .iter_mut()
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

#[tauri::command]
fn delete_log_snippet(state: State<AppState>, step_id: String) -> Result<(), String> {
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let step = session
        .steps
        .iter_mut()
        .find(|s| s.id == step_id)
        .ok_or("Step não encontrado")?;
    step.log_snippet = None;
    drop(session_lock);
    persist_current(&state);
    Ok(())
}

#[tauri::command]
fn add_highlight(
    state: State<AppState>,
    step_id: String,
    highlight: Highlight,
) -> Result<(), String> {
    let sessions_dir = state.sessions_dir.lock().unwrap().clone();
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let step = session
        .steps
        .iter_mut()
        .find(|s| s.id == step_id)
        .ok_or("Step não encontrado")?;
    let image_abs = std::path::Path::new(&sessions_dir)
        .join(&step.session_id)
        .join(&step.image_path);
    capture::apply_highlight(&image_abs, &highlight)?;
    step.highlight = Some(highlight);
    drop(session_lock);
    persist_current(&state);
    Ok(())
}

#[tauri::command]
fn set_spotlight(
    state: State<AppState>,
    step_id: String,
    spotlight: Option<Spotlight>,
) -> Result<(), String> {
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let step = session
        .steps
        .iter_mut()
        .find(|s| s.id == step_id)
        .ok_or("Step não encontrado")?;
    step.spotlight = spotlight;
    drop(session_lock);
    persist_current(&state);
    Ok(())
}

#[tauri::command]
fn crop_step_image(
    state: State<AppState>,
    step_id: String,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<(), String> {
    let sessions_dir = state.sessions_dir.lock().unwrap().clone();
    let mut session_lock = state.current_session.lock().unwrap();
    let session = session_lock.as_mut().ok_or("Nenhuma sessão ativa")?;
    let step = session
        .steps
        .iter_mut()
        .find(|s| s.id == step_id)
        .ok_or("Step não encontrado")?;
    let image_abs = std::path::Path::new(&sessions_dir)
        .join(&step.session_id)
        .join(&step.image_path);
    capture::crop_image(&image_abs, x, y, w, h)?;
    step.highlight = None;
    step.spotlight = None;
    drop(session_lock);
    persist_current(&state);
    Ok(())
}

#[tauri::command]
fn set_highlight_mode(state: State<AppState>, active: bool) {
    *state.highlight_mode.lock().unwrap() = active;
}

#[tauri::command]
fn capture_now(
    state: State<AppState>,
    app_handle: tauri::AppHandle,
    from_button: bool,
) -> Result<Step, String> {
    if *state.status.lock().unwrap() != AppStatus::Recording {
        return Err("Não está gravando".to_string());
    }

    let hwnd = if from_button {
        *state.last_external_hwnd.lock().unwrap()
    } else {
        get_foreground_hwnd()
    };

    if hwnd == 0 {
        return Err(
            "Nenhuma janela alvo encontrada. Alterne para a janela desejada primeiro.".to_string(),
        );
    }

    do_capture_step(&state, &app_handle, hwnd, session::ActionType::Focus, None, false)
}

#[tauri::command]
fn get_config(state: State<AppState>) -> AppConfig {
    let mut cfg = state.config.lock().unwrap().clone();
    cfg.sessions_dir = state.sessions_dir.lock().unwrap().clone();
    cfg
}

#[tauri::command]
fn save_config(state: State<AppState>, config: AppConfig) -> Result<(), String> {
    *state.config.lock().unwrap() = config.clone();
    let path = std::path::Path::new(&state.sessions_dir.lock().unwrap().clone())
        .parent()
        .map(|p| p.join("config.json"));
    if let Some(p) = path {
        let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        let _ = std::fs::write(p, json);
    }
    Ok(())
}

#[tauri::command]
fn get_all_sessions(state: State<AppState>) -> Vec<SessionMeta> {
    let sessions_dir = state.sessions_dir.lock().unwrap().clone();
    list_sessions_on_disk(&sessions_dir)
}

#[tauri::command]
fn load_session(state: State<AppState>, session_id: String) -> Result<Session, String> {
    let sessions_dir = state.sessions_dir.lock().unwrap().clone();
    let s = load_session_from_disk(&sessions_dir, &session_id)?;
    *state.current_session.lock().unwrap() = Some(s.clone());
    Ok(s)
}

#[tauri::command]
fn delete_session(state: State<AppState>, session_id: String) -> Result<(), String> {
    let sessions_dir = state.sessions_dir.lock().unwrap().clone();
    delete_session_from_disk(&sessions_dir, &session_id)
}

#[tauri::command]
fn export_session(
    state: State<AppState>,
    session_id: String,
    formats: Vec<String>,
    embed_images: bool,
    output_dir: String,
    filename_base: String,
) -> Result<Vec<String>, String> {
    let sessions_dir = state.sessions_dir.lock().unwrap().clone();

    let session = {
        let lock = state.current_session.lock().unwrap();
        match lock.as_ref() {
            Some(s) if s.id == session_id => s.clone(),
            _ => load_session_from_disk(&sessions_dir, &session_id)?,
        }
    };
    let steps = session.steps.clone();

    let base = if filename_base.trim().is_empty() {
        session.id.clone()
    } else {
        sanitize_filename(&filename_base)
    };

    let mut written = Vec::new();
    for fmt in &formats {
        match fmt.as_str() {
            "markdown" => {
                let out = std::path::Path::new(&output_dir).join(format!("{}.md", base));
                export::markdown::export(
                    &session,
                    &steps,
                    &sessions_dir,
                    out.to_str().unwrap_or(""),
                    &base,
                    embed_images,
                )?;
                written.push(out.to_string_lossy().to_string());
            }
            "pdf" => {
                return Err("Exportação PDF removida. Use Markdown.".to_string());
            }
            _ => {}
        }
    }
    Ok(written)
}

fn sanitize_filename(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

#[tauri::command]
fn open_sessions_folder(state: State<AppState>) -> Result<(), String> {
    let dir = state.sessions_dir.lock().unwrap().clone();
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── thread de captura por foco ───────────────────────────────────────────────

fn start_capture_thread(app_handle: tauri::AppHandle, rx: std::sync::mpsc::Receiver<isize>) {
    std::thread::spawn(move || {
        let mut last_hwnd: isize = 0;
        let mut last_capture = std::time::Instant::now()
            .checked_sub(std::time::Duration::from_secs(60))
            .unwrap_or_else(std::time::Instant::now);

        while let Ok(hwnd) = rx.recv() {
            let state = app_handle.state::<AppState>();

            // Atualiza last_external_hwnd sempre que recebe um HWND externo
            if !is_own_process_hwnd(hwnd) {
                *state.last_external_hwnd.lock().unwrap() = hwnd;
            }

            if *state.status.lock().unwrap() != AppStatus::Recording {
                continue;
            }

            let now = std::time::Instant::now();
            if hwnd == last_hwnd
                && now.duration_since(last_capture) < std::time::Duration::from_millis(250)
            {
                continue;
            }
            last_hwnd = hwnd;
            last_capture = now;

            std::thread::sleep(std::time::Duration::from_millis(80));

            // Re-verifica status após o delay
            if *state.status.lock().unwrap() != AppStatus::Recording {
                continue;
            }

            // Dedupe cross-thread: se um click foi processado há menos de 800ms,
            // o click-thread já capturou esta janela — evita duplicação.
            if let Some(ts) = *state.last_click_instant.lock().unwrap() {
                if ts.elapsed() < std::time::Duration::from_millis(800) {
                    continue;
                }
            }

            if let Err(e) = do_capture_step(
                &state,
                &app_handle,
                hwnd,
                session::ActionType::Focus,
                None,
                true,
            ) {
                log::warn!("Captura de foco falhou: {}", e);
            }
        }
    });
}

// ─── thread de captura por clique ─────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn start_click_capture_thread(
    app_handle: tauri::AppHandle,
    rx: std::sync::mpsc::Receiver<mouse_watcher::windows_mouse::ClickEvent>,
) {
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetAncestor, GetWindowRect, GetWindowThreadProcessId, WindowFromPoint, GA_ROOT,
    };

    std::thread::spawn(move || {
        let mut last_click = std::time::Instant::now()
            .checked_sub(std::time::Duration::from_secs(60))
            .unwrap_or_else(std::time::Instant::now);

        while let Ok(click) = rx.recv() {
            let state = app_handle.state::<AppState>();

            if *state.status.lock().unwrap() != AppStatus::Recording {
                continue;
            }

            let now = std::time::Instant::now();
            if now.duration_since(last_click) < std::time::Duration::from_millis(400) {
                continue;
            }
            last_click = now;

            let (hwnd_root, rel_x, rel_y) = unsafe {
                let pt = POINT { x: click.screen_x, y: click.screen_y };
                let hwnd_at = WindowFromPoint(pt);
                if hwnd_at == HWND::default() {
                    continue;
                }
                let root = GetAncestor(hwnd_at, GA_ROOT);
                let hwnd_use = if root != HWND::default() { root } else { hwnd_at };

                // Filtra próprio processo
                let own_pid = std::process::id();
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd_use, Some(&mut pid));
                if pid == own_pid {
                    continue;
                }

                let mut rect = RECT::default();
                let _ = GetWindowRect(hwnd_use, &mut rect);
                let rx = click.screen_x - rect.left;
                let ry = click.screen_y - rect.top;
                (hwnd_use.0 as isize, rx, ry)
            };

            std::thread::sleep(std::time::Duration::from_millis(80));

            if *state.status.lock().unwrap() != AppStatus::Recording {
                continue;
            }

            match do_capture_step(
                &state,
                &app_handle,
                hwnd_root,
                session::ActionType::Click,
                Some((rel_x, rel_y)),
                false,
            ) {
                Ok(_) => {
                    *state.last_click_instant.lock().unwrap() = Some(std::time::Instant::now());
                }
                Err(e) => log::warn!("Captura de clique falhou: {}", e),
            }
        }
    });
}

// ─── purge loop ──────────────────────────────────────────────────────────────

fn start_purge_loop(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        let state = app_handle.state::<AppState>();
        let sessions_dir = state.sessions_dir.lock().unwrap().clone();
        let hours = state.config.lock().unwrap().auto_purge_hours;
        if *state.status.lock().unwrap() == AppStatus::Idle && !sessions_dir.is_empty() {
            purge_expired_sessions(&sessions_dir, hours);
        }
        std::thread::sleep(std::time::Duration::from_secs(300));
    });
}

// ─── hotkeys ─────────────────────────────────────────────────────────────────

fn register_hotkeys(app: &tauri::App) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let shortcuts = [
        ("Super+Shift+R", "start"),
        ("Super+Shift+P", "pause_resume"),
        ("Super+Shift+S", "stop"),
        ("Super+Shift+A", "annotate"),
        ("Super+Shift+C", "capture"),
    ];

    for (shortcut_str, action) in shortcuts {
        let handle = app.handle().clone();
        let action = action.to_string();

        if let Err(e) = app.handle().global_shortcut().on_shortcut(
            shortcut_str,
            move |_app_handle, _shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                let state = handle.state::<AppState>();

                match action.as_str() {
                    "start" => {
                        if let Ok(session) = do_start_session(&state) {
                            #[cfg(target_os = "windows")]
                            {
                                focus_watcher::windows_focus::set_capture_active(true);
                                mouse_watcher::windows_mouse::set_capture_active(true);
                            }
                            let _ = handle.emit("session-started", &session);
                            tray::update_tray_icon(&handle, &AppStatus::Recording);
                        }
                    }
                    "pause_resume" => {
                        let mut status = state.status.lock().unwrap();
                        match *status {
                            AppStatus::Recording => {
                                *status = AppStatus::Paused;
                                drop(status);
                                #[cfg(target_os = "windows")]
                                {
                                    focus_watcher::windows_focus::set_capture_active(false);
                                    mouse_watcher::windows_mouse::set_capture_active(false);
                                }
                                let _ = handle.emit("status-changed", "paused");
                                tray::update_tray_icon(&handle, &AppStatus::Paused);
                            }
                            AppStatus::Paused => {
                                *status = AppStatus::Recording;
                                drop(status);
                                #[cfg(target_os = "windows")]
                                {
                                    focus_watcher::windows_focus::set_capture_active(true);
                                    mouse_watcher::windows_mouse::set_capture_active(true);
                                }
                                let _ = handle.emit("status-changed", "recording");
                                tray::update_tray_icon(&handle, &AppStatus::Recording);
                            }
                            _ => {}
                        }
                    }
                    "stop" => {
                        #[cfg(target_os = "windows")]
                        {
                            focus_watcher::windows_focus::set_capture_active(false);
                            mouse_watcher::windows_mouse::set_capture_active(false);
                        }
                        if let Ok(session) = do_stop_session(&state) {
                            let _ = handle.emit("session-stopped", &session);
                            tray::update_tray_icon(&handle, &AppStatus::Idle);
                        }
                    }
                    "annotate" => {
                        let _ = handle.emit("hotkey-annotate", ());
                    }
                    "capture" => {
                        if *state.status.lock().unwrap() != AppStatus::Recording {
                            let _ = handle.emit("capture-blocked", "Inicie uma gravação primeiro.");
                            return;
                        }
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
                            &state,
                            &handle,
                            hwnd,
                            session::ActionType::Focus,
                            None,
                            false,
                        ) {
                            let _ = handle.emit("capture-blocked", format!("Falha: {}", e));
                            log::warn!("capture hotkey falhou: {}", e);
                        }
                    }
                    _ => {}
                }
            },
        ) {
            log::warn!("Falha ao registrar hotkey {}: {}", shortcut_str, e);
        }
    }
}

// ─── entrypoint ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let base_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("StepTrace");
            let sessions_dir = base_dir.join("sessions");
            std::fs::create_dir_all(&sessions_dir).ok();
            let sessions_dir_str = sessions_dir.to_string_lossy().to_string();
            *app.state::<AppState>().sessions_dir.lock().unwrap() = sessions_dir_str.clone();
            log::info!("Sessões em: {}", sessions_dir_str);

            let config_path = base_dir.join("config.json");
            if let Ok(bytes) = std::fs::read(&config_path) {
                if let Ok(cfg) = serde_json::from_slice::<AppConfig>(&bytes) {
                    *app.state::<AppState>().config.lock().unwrap() = cfg;
                }
            }

            let hours = app.state::<AppState>().config.lock().unwrap().auto_purge_hours;
            purge_expired_sessions(&sessions_dir_str, hours);

            tray::init_icons();
            if let Err(e) = tray::build_tray(app) {
                log::warn!("Falha ao criar tray: {}", e);
            }

            if let Some(window) = app.get_webview_window("main") {
                window.show().ok();
            }

            #[cfg(target_os = "windows")]
            {
                let (focus_tx, focus_rx) = std::sync::mpsc::channel::<isize>();
                focus_watcher::windows_focus::start_focus_watcher(focus_tx);
                start_capture_thread(app.handle().clone(), focus_rx);

                let (mouse_tx, mouse_rx) =
                    std::sync::mpsc::channel::<mouse_watcher::windows_mouse::ClickEvent>();
                mouse_watcher::windows_mouse::start(mouse_tx);
                start_click_capture_thread(app.handle().clone(), mouse_rx);

                clipboard::start_clipboard_watcher(app.handle().clone());
            }
            start_purge_loop(app.handle().clone());
            register_hotkeys(app);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_session,
            pause_session,
            resume_session,
            stop_session,
            get_session_steps,
            delete_step,
            add_annotation,
            add_log_snippet,
            update_log_note,
            delete_log_snippet,
            add_highlight,
            set_spotlight,
            crop_step_image,
            set_highlight_mode,
            capture_now,
            get_config,
            save_config,
            get_all_sessions,
            load_session,
            delete_session,
            export_session,
            open_sessions_folder,
            open_path,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar StepTrace");
}

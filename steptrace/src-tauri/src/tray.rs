use std::sync::OnceLock;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    Emitter, Manager,
};

use crate::session::{AppState, AppStatus};

// ── Ícones pré-gerados por status (tint sobre tray-idle.png) ─────────────────

static ICON_IDLE: OnceLock<Vec<u8>> = OnceLock::new();
static ICON_RECORDING: OnceLock<Vec<u8>> = OnceLock::new();
static ICON_PAUSED: OnceLock<Vec<u8>> = OnceLock::new();

const TRAY_BASE: &[u8] = include_bytes!("../icons/tray-idle.png");

/// Deve ser chamado uma vez no setup, antes de `build_tray`.
pub fn init_icons() {
    ICON_IDLE.set(TRAY_BASE.to_vec()).ok();
    if let Some(rec) = tint_png(TRAY_BASE, [200, 40, 40]) {
        ICON_RECORDING.set(rec).ok();
    }
    if let Some(pau) = tint_png(TRAY_BASE, [200, 160, 30]) {
        ICON_PAUSED.set(pau).ok();
    }
}

fn tint_png(bytes: &[u8], tint: [u8; 3]) -> Option<Vec<u8>> {
    use image::DynamicImage;
    use std::io::Cursor;

    let img = image::load_from_memory(bytes).ok()?.to_rgba8();
    let (w, h) = img.dimensions();
    let mut raw = img.into_raw();
    for chunk in raw.chunks_mut(4) {
        if chunk[3] > 0 {
            chunk[0] = ((chunk[0] as u32 * tint[0] as u32) / 255) as u8;
            chunk[1] = ((chunk[1] as u32 * tint[1] as u32) / 255) as u8;
            chunk[2] = ((chunk[2] as u32 * tint[2] as u32) / 255) as u8;
        }
    }
    let rgba_img = image::RgbaImage::from_raw(w, h, raw)?;
    let mut buf = Vec::new();
    DynamicImage::ImageRgba8(rgba_img)
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .ok()?;
    Some(buf)
}

fn icon_from_bytes(bytes: &[u8]) -> Option<tauri::image::Image<'static>> {
    tauri::image::Image::from_bytes(bytes).ok()
}

// ── API pública ───────────────────────────────────────────────────────────────

pub fn update_tray_icon(app: &tauri::AppHandle, status: &AppStatus) {
    if let Some(tray) = app.tray_by_id("main") {
        let (label, icon_bytes) = match status {
            AppStatus::Idle => ("Strider — Pronto", ICON_IDLE.get()),
            AppStatus::Recording => ("Strider — ● Gravando", ICON_RECORDING.get()),
            AppStatus::Paused => ("Strider — ⏸ Pausado", ICON_PAUSED.get()),
        };
        let _ = tray.set_tooltip(Some(label));
        if let Some(bytes) = icon_bytes {
            if let Some(icon) = icon_from_bytes(bytes) {
                let _ = tray.set_icon(Some(icon));
            }
        }
    }
}

pub fn build_tray(app: &tauri::App) -> tauri::Result<TrayIcon> {
    let show_item = MenuItem::with_id(app, "show", "Abrir Strider", true, None::<&str>)?;
    let start_item = MenuItem::with_id(app, "start", "Iniciar gravação", true, None::<&str>)?;
    let pause_item = MenuItem::with_id(app, "pause", "Pausar / Retomar", true, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", "Parar gravação", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show_item, &start_item, &pause_item, &stop_item, &quit_item],
    )?;

    let base_icon = ICON_IDLE
        .get()
        .and_then(|b| icon_from_bytes(b))
        .unwrap_or_else(|| app.default_window_icon().unwrap().clone());

    TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("Strider — Pronto")
        .icon(base_icon)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "start" => {
                let state = app.state::<AppState>();
                if let Ok(session) = super::do_start_session(&state) {
                    #[cfg(target_os = "windows")]
                    {
                        crate::focus_watcher::windows_focus::set_capture_active(true);
                        crate::mouse_watcher::windows_mouse::set_capture_active(true);
                    }
                    let _ = app.emit("session-started", &session);
                    update_tray_icon(app, &AppStatus::Recording);
                }
            }
            "pause" => {
                let state = app.state::<AppState>();
                let mut status = state.status.lock().unwrap();
                match *status {
                    AppStatus::Recording => {
                        *status = AppStatus::Paused;
                        #[cfg(target_os = "windows")]
                        {
                            crate::focus_watcher::windows_focus::set_capture_active(false);
                            crate::mouse_watcher::windows_mouse::set_capture_active(false);
                        }
                        let _ = app.emit("status-changed", "paused");
                        drop(status);
                        update_tray_icon(app, &AppStatus::Paused);
                    }
                    AppStatus::Paused => {
                        *status = AppStatus::Recording;
                        #[cfg(target_os = "windows")]
                        {
                            crate::focus_watcher::windows_focus::set_capture_active(true);
                            crate::mouse_watcher::windows_mouse::set_capture_active(true);
                        }
                        let _ = app.emit("status-changed", "recording");
                        drop(status);
                        update_tray_icon(app, &AppStatus::Recording);
                    }
                    _ => {}
                }
            }
            "stop" => {
                let state = app.state::<AppState>();
                #[cfg(target_os = "windows")]
                {
                    crate::focus_watcher::windows_focus::set_capture_active(false);
                    crate::mouse_watcher::windows_mouse::set_capture_active(false);
                }
                if let Ok(session) = super::do_stop_session(&state) {
                    let _ = app.emit("session-stopped", &session);
                    update_tray_icon(app, &AppStatus::Idle);
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
}

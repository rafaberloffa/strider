use chrono::Local;
use serde::{Deserialize, Serialize};
use std::path::Path;
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
pub struct LogSnippet {
    pub text: String,
    pub note: Option<String>,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Spotlight {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
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
    #[serde(
        default,
        deserialize_with = "deser_log_snippet",
        skip_serializing_if = "Option::is_none"
    )]
    pub log_snippet: Option<LogSnippet>,
    pub highlight: Option<Highlight>,
    pub spotlight: Option<Spotlight>,
}

// Tolerante a sessions antigas onde log_snippet era Option<String>
fn deser_log_snippet<'de, D>(d: D) -> Result<Option<LogSnippet>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    let v: Option<serde_json::Value> = Option::deserialize(d)?;
    match v {
        None => Ok(None),
        Some(serde_json::Value::String(s)) => Ok(Some(LogSnippet {
            text: s,
            note: None,
            captured_at: String::new(),
        })),
        Some(obj) => serde_json::from_value::<LogSnippet>(obj)
            .map(Some)
            .map_err(Error::custom),
    }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub step_count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum AppStatus {
    Idle,
    Recording,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub sessions_dir: String,
    pub hotkey_start: String,
    pub hotkey_pause: String,
    pub hotkey_stop: String,
    pub hotkey_annotate: String,
    pub hotkey_capture: String,
    pub image_quality: String,
    pub default_export_format: String,
    pub embed_images_default: bool,
    pub export_name_template: String,
    pub auto_purge_hours: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            sessions_dir: String::new(),
            hotkey_start: "Super+Shift+R".to_string(),
            hotkey_pause: "Super+Shift+P".to_string(),
            hotkey_stop: "Super+Shift+S".to_string(),
            hotkey_annotate: "Super+Shift+A".to_string(),
            hotkey_capture: "Super+Shift+C".to_string(),
            image_quality: "high".to_string(),
            default_export_format: "markdown".to_string(),
            embed_images_default: true,
            export_name_template: "steptrace_{yyyy}-{MM}-{dd}_{HH}{mm}".to_string(),
            auto_purge_hours: 1,
        }
    }
}

pub struct AppState {
    pub status: Mutex<AppStatus>,
    pub current_session: Mutex<Option<Session>>,
    pub step_counter: Mutex<u32>,
    pub sessions_dir: Mutex<String>,
    pub config: Mutex<AppConfig>,
    pub highlight_mode: Mutex<bool>,
    pub last_external_hwnd: Mutex<isize>,
    /// Timestamp do último clique capturado. Usado pelo focus watcher para
    /// evitar duplicação quando um click já disparou captura há pouco.
    pub last_click_instant: Mutex<Option<std::time::Instant>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            status: Mutex::new(AppStatus::Idle),
            current_session: Mutex::new(None),
            step_counter: Mutex::new(0),
            sessions_dir: Mutex::new(String::new()),
            config: Mutex::new(AppConfig::default()),
            highlight_mode: Mutex::new(false),
            last_external_hwnd: Mutex::new(0),
            last_click_instant: Mutex::new(None),
        }
    }
}

// ─── Persistência em disco ───────────────────────────────────────────────────

pub fn save_session_to_disk(session: &Session, sessions_dir: &str) -> Result<(), String> {
    let dir = Path::new(sessions_dir).join(&session.id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;
    let path = dir.join("session.json");
    let json = serde_json::to_string_pretty(session).map_err(|e| format!("serialize: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("write: {}", e))?;
    Ok(())
}

pub fn load_session_from_disk(sessions_dir: &str, session_id: &str) -> Result<Session, String> {
    let path = Path::new(sessions_dir).join(session_id).join("session.json");
    let bytes = std::fs::read(&path).map_err(|e| format!("read: {}", e))?;
    serde_json::from_slice::<Session>(&bytes).map_err(|e| format!("parse: {}", e))
}

pub fn list_sessions_on_disk(sessions_dir: &str) -> Vec<SessionMeta> {
    let mut result = Vec::new();
    let Ok(entries) = std::fs::read_dir(sessions_dir) else {
        return result;
    };
    for entry in entries.flatten() {
        let p = entry.path().join("session.json");
        if !p.exists() {
            continue;
        }
        if let Ok(bytes) = std::fs::read(&p) {
            if let Ok(s) = serde_json::from_slice::<Session>(&bytes) {
                result.push(SessionMeta {
                    id: s.id,
                    started_at: s.started_at,
                    ended_at: s.ended_at,
                    step_count: s.steps.len(),
                });
            }
        }
    }
    result.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    result
}

pub fn purge_expired_sessions(sessions_dir: &str, max_age_hours: u32) {
    if max_age_hours == 0 {
        return;
    }
    let cutoff = chrono::Local::now() - chrono::Duration::hours(max_age_hours as i64);
    let Ok(entries) = std::fs::read_dir(sessions_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        let session_file = dir.join("session.json");
        if !session_file.exists() {
            continue;
        }
        let Ok(bytes) = std::fs::read(&session_file) else {
            continue;
        };
        let Ok(s) = serde_json::from_slice::<Session>(&bytes) else {
            continue;
        };
        let reference = s.ended_at.as_deref().unwrap_or(&s.started_at);
        let Ok(dt) = chrono::DateTime::parse_from_rfc3339(reference) else {
            continue;
        };
        if dt < cutoff {
            let _ = std::fs::remove_dir_all(&dir);
            log::info!("Sessão {} removida (auto-purge)", s.id);
        }
    }
}

pub fn delete_session_from_disk(sessions_dir: &str, session_id: &str) -> Result<(), String> {
    let dir = Path::new(sessions_dir).join(session_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

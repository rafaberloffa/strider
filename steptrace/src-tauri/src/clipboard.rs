// Detecta logs no clipboard de forma opt-in — confirmação do usuário via evento Tauri

#[cfg(target_os = "windows")]
pub fn start_clipboard_watcher(app_handle: tauri::AppHandle) {
    use std::time::Duration;
    use tauri::{Emitter, Manager};
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};

    // CF_UNICODETEXT = 13
    const CF_UNICODE: u32 = 13;

    std::thread::spawn(move || {
        let mut last_content = String::new();

        loop {
            std::thread::sleep(Duration::from_millis(600));

            {
                let state = app_handle.state::<crate::session::AppState>();
                if *state.status.lock().unwrap() != crate::session::AppStatus::Recording {
                    continue;
                }
            }

            let content = unsafe {
                if OpenClipboard(None).is_err() {
                    continue;
                }
                let available = IsClipboardFormatAvailable(CF_UNICODE).is_ok();
                if !available {
                    let _ = CloseClipboard();
                    continue;
                }
                let h = match GetClipboardData(CF_UNICODE) {
                    Ok(h) => h,
                    Err(_) => {
                        let _ = CloseClipboard();
                        continue;
                    }
                };
                let hglobal = HGLOBAL(h.0 as *mut _);
                let ptr = GlobalLock(hglobal) as *const u16;
                let text = if ptr.is_null() {
                    String::new()
                } else {
                    let mut len = 0usize;
                    while *ptr.add(len) != 0 {
                        len += 1;
                    }
                    let slice = std::slice::from_raw_parts(ptr, len);
                    String::from_utf16_lossy(slice)
                };
                if !ptr.is_null() {
                    let _ = GlobalUnlock(hglobal);
                }
                let _ = CloseClipboard();
                text
            };

            if content == last_content || content.is_empty() {
                continue;
            }
            last_content = content.clone();

            if looks_like_log(&content) {
                let _ = app_handle.emit("log-detected", &content);
            }
        }
    });
}

fn looks_like_log(text: &str) -> bool {
    let indicators = ["ERROR", "WARN", "INFO", "DEBUG", " at ", "Exception", "Traceback"];
    text.lines().count() >= 2 && indicators.iter().any(|i| text.contains(i))
}

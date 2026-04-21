#[cfg(target_os = "windows")]
pub mod windows_focus {
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, TranslateMessage, EVENT_SYSTEM_FOREGROUND, MSG,
        WINEVENT_OUTOFCONTEXT,
    };

    static SHOULD_CAPTURE: AtomicBool = AtomicBool::new(false);
    static SENDER: std::sync::OnceLock<std::sync::mpsc::Sender<isize>> = std::sync::OnceLock::new();

    pub fn set_capture_active(active: bool) {
        SHOULD_CAPTURE.store(active, Ordering::SeqCst);
    }

    unsafe extern "system" fn focus_callback(
        _hook: HWINEVENTHOOK,
        _event: u32,
        hwnd: HWND,
        _id_object: i32,
        _id_child: i32,
        _id_event_thread: u32,
        _dwms_event_time: u32,
    ) {
        if SHOULD_CAPTURE.load(Ordering::SeqCst) {
            if let Some(tx) = SENDER.get() {
                let _ = tx.send(hwnd.0 as isize);
            }
        }
    }

    pub fn start_focus_watcher(tx: std::sync::mpsc::Sender<isize>) {
        let _ = SENDER.set(tx);
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
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }
}

#[cfg(target_os = "windows")]
pub mod windows_mouse {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, WH_MOUSE_LL,
        WM_LBUTTONDOWN, MSLLHOOKSTRUCT, MSG, HHOOK,
    };

    pub struct ClickEvent {
        pub screen_x: i32,
        pub screen_y: i32,
    }

    static SHOULD_CAPTURE: AtomicBool = AtomicBool::new(false);
    static SENDER: OnceLock<std::sync::mpsc::Sender<ClickEvent>> = OnceLock::new();
    static HOOK_HANDLE: OnceLock<isize> = OnceLock::new();

    pub fn set_capture_active(active: bool) {
        SHOULD_CAPTURE.store(active, Ordering::Relaxed);
    }

    unsafe extern "system" fn mouse_callback(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code >= 0 && SHOULD_CAPTURE.load(Ordering::Relaxed) {
            if wparam.0 as u32 == WM_LBUTTONDOWN {
                let hs = &*(lparam.0 as *const MSLLHOOKSTRUCT);
                if let Some(tx) = SENDER.get() {
                    let _ = tx.send(ClickEvent {
                        screen_x: hs.pt.x,
                        screen_y: hs.pt.y,
                    });
                }
            }
        }
        let hook = HOOK_HANDLE.get().copied().unwrap_or(0);
        CallNextHookEx(HHOOK(hook as *mut _), code, wparam, lparam)
    }

    pub fn start(tx: std::sync::mpsc::Sender<ClickEvent>) {
        let _ = SENDER.set(tx);
        std::thread::spawn(move || unsafe {
            let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_callback), None, 0)
                .unwrap_or(HHOOK::default());
            let _ = HOOK_HANDLE.set(hook.0 as isize);

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
                let _ = DispatchMessageW(&msg);
            }
        });
    }
}

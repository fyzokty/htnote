//! Windows 11 Snap Layouts desteği (D29).
//!
//! Dekorasyonsuz pencerede istemci alanını WebView2'nin başka süreçteki alt pencereleri kaplar;
//! bu yüzden üst pencerenin `WM_NCHITTEST` yanıtı hiç sorulmaz. Özel başlık çubuğundaki
//! "Ekranı kapla" düğmesinin tam üzerine boyama yapmayan, aynı süreçte bir alt pencere konur.
//! Bu pencere `HTMAXBUTTON` döndürür; sistem snap düzeni menüsünü gösterir. Tıklama yerel olarak
//! büyütür/geri alır, üzerine gelme ve basılı durumu ön yüze olay olarak bildirilir.
//! Diğer platformlarda bu modül yalnızca geometri testleri için derlenir.

/// Ön yüzün dinlediği olay; yükü `"idle" | "hover" | "pressed"`.
#[cfg(windows)]
pub const MAXIMIZE_STATE_EVENT: &str = "titlebar:maximize-state";

/// `src/index.css` içindeki `--app-titlebar-height` ile aynı olmalıdır (CSS piksel).
#[cfg(any(windows, test))]
const TITLEBAR_HEIGHT: f64 = 48.0;
/// `src/index.css` içindeki `--app-caption-button-width` ile aynı olmalıdır (CSS piksel).
#[cfg(any(windows, test))]
const CAPTION_BUTTON_WIDTH: f64 = 46.0;

/// İstemci koordinatlarında fiziksel piksel dikdörtgeni.
#[cfg(any(windows, test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct OverlayRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

/// Sağdan ikinci düğme (Küçült · Ekranı kapla · Kapat) "Ekranı kapla"dır. Kesirli ölçeklerde
/// WebView'in yerleşimiyle aynı sınırlara oturması için kenarlar ayrı ayrı yuvarlanır.
#[cfg(any(windows, test))]
fn maximize_button_rect(client_width: i32, dpi: u32) -> OverlayRect {
    let scale = f64::from(dpi.max(1)) / 96.0;
    let right = client_width - (CAPTION_BUTTON_WIDTH * scale).round() as i32;
    let left = client_width - (CAPTION_BUTTON_WIDTH * 2.0 * scale).round() as i32;
    OverlayRect {
        x: left.max(0),
        y: 0,
        width: (right - left.max(0)).max(0),
        height: (TITLEBAR_HEIGHT * scale).round() as i32,
    }
}

#[cfg(windows)]
pub use self::win::install;

#[cfg(windows)]
mod win {
    use super::{maximize_button_rect, MAXIMIZE_STATE_EVENT};

    use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Input::KeyboardAndMouse::{TrackMouseEvent, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT};
    use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::*;

    const CLASS_NAME: PCWSTR = w!("HTNOTE_SNAP_LAYOUT_OVERLAY");
    const WINDOW_NAME: PCWSTR = w!("HTNOTE_SNAP_LAYOUT_OVERLAY");
    /// Tauri'nin dekorasyonsuz pencere için kenar yeniden boyutlandırma alt penceresi.
    const TAURI_RESIZE_CLASS: PCWSTR = w!("TAURI_DRAG_RESIZE_BORDERS");
    const SUBCLASS_ID: usize = 0x4854_4e53; // "HTNS"
    const USER_DEFAULT_SCREEN_DPI: u32 = 96;

    struct OverlayData {
        app: AppHandle,
        label: String,
        tracking: bool,
        pressed: bool,
    }

    /// Ana pencereye snap düzeni katmanını ekler. Yalnızca dekorasyonsuz pencerede anlamlıdır.
    pub fn install(window: &WebviewWindow) -> Result<(), String> {
        let parent = window.hwnd().map_err(|error| error.to_string())?;
        // SAFETY: Win32 çağrıları ana iş parçacığında (Tauri setup) geçerli bir üst HWND ile yapılır;
        // pencere verisi kutusu WM_NCDESTROY'da serbest bırakılır.
        unsafe {
            if FindWindowExW(Some(parent), None, CLASS_NAME, WINDOW_NAME).is_ok() {
                return Ok(());
            }
            let instance = HINSTANCE(GetModuleHandleW(None).map_err(|error| error.to_string())?.0);
            let class = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                lpfnWndProc: Some(overlay_proc),
                hInstance: instance,
                hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
                lpszClassName: CLASS_NAME,
                ..Default::default()
            };
            // Sınıf zaten kayıtlıysa 0 döner; CreateWindowExW yine çalışır.
            RegisterClassExW(&class);

            let data = Box::into_raw(Box::new(OverlayData {
                app: window.app_handle().clone(),
                label: window.label().to_string(),
                tracking: false,
                pressed: false,
            }));
            // Boyama yapmayan, katmansız alt pencere: HTML altından görünür ama isabet testini kazanır.
            let overlay = match CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                CLASS_NAME,
                WINDOW_NAME,
                WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
                0,
                0,
                0,
                0,
                Some(parent),
                None,
                Some(instance),
                Some(data as _),
            ) {
                Ok(overlay) => overlay,
                Err(error) => {
                    drop(Box::from_raw(data));
                    return Err(error.to_string());
                }
            };
            position_overlay(parent, overlay);
            if !SetWindowSubclass(parent, Some(parent_subclass), SUBCLASS_ID, overlay.0 as usize).as_bool() {
                let _ = DestroyWindow(overlay);
                return Err("SetWindowSubclass failed".into());
            }
        }
        Ok(())
    }

    /// Katmanı düğme konumuna taşır; Tauri'nin kenar boyutlandırma penceresinin hemen altında,
    /// WebView'in üstünde tutar. Büyütülmüş pencerede de aynı geometri geçerlidir.
    unsafe fn position_overlay(parent: HWND, overlay: HWND) {
        unsafe {
            let mut client = RECT::default();
            if GetClientRect(parent, &mut client).is_err() {
                return;
            }
            let dpi = match GetDpiForWindow(parent) {
                0 => USER_DEFAULT_SCREEN_DPI,
                dpi => dpi,
            };
            let rect = maximize_button_rect(client.right - client.left, dpi);
            let insert_after = FindWindowExW(Some(parent), None, TAURI_RESIZE_CLASS, PCWSTR::null())
                .ok()
                .filter(|resize| *resize != overlay)
                .unwrap_or(HWND_TOP);
            let _ = SetWindowPos(
                overlay,
                Some(insert_after),
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW,
            );
        }
    }

    unsafe extern "system" fn parent_subclass(
        parent: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        overlay: usize,
    ) -> LRESULT {
        unsafe {
            // Önce Tauri/tao işlesin; böylece kenar boyutlandırma penceresi en üste alındıktan sonra
            // katman onun altına yerleşir.
            let result = DefSubclassProc(parent, msg, wparam, lparam);
            let overlay = HWND(overlay as _);
            match msg {
                WM_SIZE | WM_DPICHANGED => position_overlay(parent, overlay),
                WM_NCDESTROY => {
                    let _ = RemoveWindowSubclass(parent, Some(parent_subclass), SUBCLASS_ID);
                }
                _ => {}
            }
            result
        }
    }

    unsafe fn overlay_data<'a>(overlay: HWND) -> Option<&'a mut OverlayData> {
        unsafe { (GetWindowLongPtrW(overlay, GWLP_USERDATA) as *mut OverlayData).as_mut() }
    }

    fn emit_state(data: &OverlayData, state: &str) {
        let _ = data.app.emit_to(data.label.as_str(), MAXIMIZE_STATE_EVENT, state);
    }

    unsafe extern "system" fn overlay_proc(overlay: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        unsafe {
            match msg {
                WM_NCCREATE => {
                    let create = lparam.0 as *const CREATESTRUCTW;
                    SetWindowLongPtrW(overlay, GWLP_USERDATA, (*create).lpCreateParams as isize);
                }
                // Snap Layouts yalnızca bu yanıtı görünce açılır.
                WM_NCHITTEST => return LRESULT(HTMAXBUTTON as isize),
                WM_NCMOUSEMOVE => {
                    if let Some(data) = overlay_data(overlay) {
                        if !data.tracking {
                            let mut track = TRACKMOUSEEVENT {
                                cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                                dwFlags: TME_LEAVE | TME_NONCLIENT,
                                hwndTrack: overlay,
                                dwHoverTime: 0,
                            };
                            data.tracking = TrackMouseEvent(&mut track).is_ok();
                            emit_state(data, if data.pressed { "pressed" } else { "hover" });
                        }
                    }
                }
                WM_NCMOUSELEAVE => {
                    if let Some(data) = overlay_data(overlay) {
                        data.tracking = false;
                        data.pressed = false;
                        emit_state(data, "idle");
                    }
                }
                WM_NCLBUTTONDOWN | WM_NCLBUTTONDBLCLK => {
                    if let Some(data) = overlay_data(overlay) {
                        data.pressed = true;
                        emit_state(data, "pressed");
                    }
                    // Varsayılan işleyici alt pencereye SC_MAXIMIZE gönderirdi; tıklama burada biter.
                    return LRESULT(0);
                }
                WM_NCLBUTTONUP => {
                    if let Some(data) = overlay_data(overlay) {
                        if data.pressed {
                            data.pressed = false;
                            emit_state(data, "hover");
                            if let Ok(parent) = GetParent(overlay) {
                                let command = if IsZoomed(parent).as_bool() { SC_RESTORE } else { SC_MAXIMIZE };
                                let _ = PostMessageW(Some(parent), WM_SYSCOMMAND, WPARAM(command as usize), LPARAM(0));
                            }
                        }
                    }
                    return LRESULT(0);
                }
                WM_NCDESTROY => {
                    let data = GetWindowLongPtrW(overlay, GWLP_USERDATA) as *mut OverlayData;
                    SetWindowLongPtrW(overlay, GWLP_USERDATA, 0);
                    if !data.is_null() {
                        drop(Box::from_raw(data));
                    }
                }
                _ => {}
            }
            DefWindowProcW(overlay, msg, wparam, lparam)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maximize_rect_sits_left_of_close_button_at_100_percent() {
        assert_eq!(maximize_button_rect(1280, 96), OverlayRect { x: 1188, y: 0, width: 46, height: 48 });
    }

    #[test]
    fn maximize_rect_scales_with_dpi() {
        assert_eq!(maximize_button_rect(1920, 144), OverlayRect { x: 1782, y: 0, width: 69, height: 72 });
        // 125%: 57.5 px düğmeler; kenarlar WebView yerleşimiyle aynı şekilde yuvarlanır.
        assert_eq!(maximize_button_rect(1600, 120), OverlayRect { x: 1485, y: 0, width: 57, height: 60 });
    }

    #[test]
    fn maximize_rect_never_goes_negative() {
        let rect = maximize_button_rect(50, 96);
        assert_eq!(rect.x, 0);
        assert!(rect.width >= 0);
    }
}

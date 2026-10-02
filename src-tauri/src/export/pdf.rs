use std::path::Path;
#[cfg(any(windows, test))]
use std::path::PathBuf;
#[cfg(any(windows, test))]
use std::sync::{mpsc, Mutex};
#[cfg(any(windows, test))]
use std::time::{Duration, Instant};

use crate::error::AppError;
use crate::export::ExportResult;

#[cfg(any(windows, test))]
static EXPORT_LOCK: Mutex<()> = Mutex::new(());
#[cfg(any(windows, test))]
const TIMEOUT: Duration = Duration::from_secs(30);

#[cfg(any(windows, test))]
trait PdfRunner {
    type Window;

    fn open(&self, url: &str) -> Result<(Self::Window, mpsc::Receiver<()>), AppError>;
    fn print(&self, window: &Self::Window, path: &Path) -> Result<mpsc::Receiver<Result<(), AppError>>, AppError>;
    fn close(&self, window: Self::Window);
}

#[cfg(any(windows, test))]
struct WindowGuard<'a, R: PdfRunner> {
    runner: &'a R,
    window: Option<R::Window>,
}

#[cfg(any(windows, test))]
impl<R: PdfRunner> Drop for WindowGuard<'_, R> {
    fn drop(&mut self) {
        if let Some(window) = self.window.take() {
            self.runner.close(window);
        }
    }
}

#[cfg(any(windows, test))]
struct TempGuard(PathBuf);

#[cfg(any(windows, test))]
impl Drop for TempGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(any(windows, test))]
fn wait<T>(receiver: mpsc::Receiver<T>, deadline: Instant) -> Result<T, AppError> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    receiver.recv_timeout(remaining).map_err(|error| AppError::Internal(format!("PDF export wait failed: {error}")))
}

#[cfg(any(windows, test))]
fn export_with_runner<R: PdfRunner>(runner: &R, url: &str, target: &Path, timeout: Duration) -> Result<ExportResult, AppError> {
    let _single_flight = EXPORT_LOCK.try_lock().map_err(|_| AppError::Busy("PDF export already running".into()))?;
    let deadline = Instant::now() + timeout;
    let temp = target.with_file_name(format!(".pdf-export-{}.tmp", uuid::Uuid::new_v4()));
    let temp_guard = TempGuard(temp.clone());
    let (window, loaded) = runner.open(url)?;
    let window_guard = WindowGuard { runner, window: Some(window) };
    wait(loaded, deadline)?;
    // Not JavaScript'inin DOM'u tamamlaması için kısa bir süre tanınır.
    let settle = Duration::from_millis(500);
    if deadline.saturating_duration_since(Instant::now()) < settle {
        return Err(AppError::Internal("PDF export timed out".into()));
    }
    std::thread::sleep(settle);
    let completion = runner.print(window_guard.window.as_ref().ok_or_else(|| AppError::Internal("PDF window closed".into()))?, &temp)?;
    wait(completion, deadline)??;
    // Pencere PDF dosyasını bırakmadan taşınmamalı.
    drop(window_guard);
    crate::fs_util::replace_file(&temp, target)?;
    drop(temp_guard);
    Ok(ExportResult { warnings: Vec::new() })
}

#[cfg(windows)]
pub fn export(app: tauri::AppHandle, id: uuid::Uuid, target: &Path) -> Result<ExportResult, AppError> {
    use tauri::Manager;
    let state = app.state::<crate::state::AppState>();
    if state.note_index.read().map_err(|error| AppError::Internal(error.to_string()))?.resolve(id).is_none() {
        return Err(AppError::NotFound(id.to_string()));
    }
    let origin = state.note_origin.read().map_err(|error| AppError::Internal(error.to_string()))?.clone();
    let url = format!("{origin}/{id}/index.html?print=1");
    export_with_runner(&WindowsRunner(app), &url, target, TIMEOUT)
}

#[cfg(windows)]
struct WindowsRunner(tauri::AppHandle);

#[cfg(windows)]
impl PdfRunner for WindowsRunner {
    type Window = tauri::WebviewWindow;

    fn open(&self, url: &str) -> Result<(Self::Window, mpsc::Receiver<()>), AppError> {
        use tauri::webview::PageLoadEvent;
        let (sender, receiver) = mpsc::channel();
        let url = tauri::Url::parse(url).map_err(|error| AppError::Internal(error.to_string()))?;
        let label = format!("pdf-export-{}", uuid::Uuid::new_v4());
        let window = tauri::WebviewWindowBuilder::new(&self.0, &label, tauri::WebviewUrl::External(url))
            .visible(false)
            .focused(false)
            .skip_taskbar(true)
            .on_page_load(move |_, payload| {
                if payload.event() == PageLoadEvent::Finished {
                    let _ = sender.send(());
                }
            })
            .build().map_err(|error| AppError::Internal(error.to_string()))?;
        Ok((window, receiver))
    }

    fn print(&self, window: &Self::Window, path: &Path) -> Result<mpsc::Receiver<Result<(), AppError>>, AppError> {
        use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7};
        use webview2_com::PrintToPdfCompletedHandler;
        use windows::core::{Interface, PCWSTR};
        use std::os::windows::ffi::OsStrExt;

        let (sender, receiver) = mpsc::channel();
        let path: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        window.with_webview(move |webview| {
            fn com<T>(result: windows::core::Result<T>) -> Result<T, AppError> {
                result.map_err(|error| AppError::Internal(error.to_string()))
            }
            let completed_sender = sender.clone();
            let result = (|| -> Result<(), AppError> {
                let core = unsafe { webview.controller().CoreWebView2() }.map_err(|error| AppError::Internal(error.to_string()))?;
                let core: ICoreWebView2_7 = core.cast().map_err(|error| AppError::Internal(error.to_string()))?;
                let environment: ICoreWebView2Environment6 = webview.environment().cast().map_err(|error| AppError::Internal(error.to_string()))?;
                let settings = unsafe { environment.CreatePrintSettings() }.map_err(|error| AppError::Internal(error.to_string()))?;
                unsafe {
                    com(settings.SetPageWidth(8.27))?;
                    com(settings.SetPageHeight(11.69))?;
                    com(settings.SetMarginTop(0.4))?;
                    com(settings.SetMarginBottom(0.4))?;
                    com(settings.SetMarginLeft(0.4))?;
                    com(settings.SetMarginRight(0.4))?;
                    com(settings.SetShouldPrintBackgrounds(true))?;
                    com(settings.SetShouldPrintHeaderAndFooter(false))?;
                }
                let completed = PrintToPdfCompletedHandler::create(Box::new(move |status, success| {
                    let result = if status.is_ok() && success { Ok(()) } else { Err(AppError::Internal(format!("PrintToPdf failed: {status:?}"))) };
                    let _ = completed_sender.send(result);
                    Ok(())
                }));
                unsafe { core.PrintToPdf(PCWSTR(path.as_ptr()), &settings, &completed) }
                    .map_err(|error| AppError::Internal(error.to_string()))?;
                Ok(())
            })();
            if let Err(error) = result {
                // Eşzamanlı COM hatası da bekleyen iş parçacığını uyandırmalıdır.
                let _ = sender.send(Err(error));
            }
        }).map_err(|error| AppError::Internal(error.to_string()))?;
        Ok(receiver)
    }

    fn close(&self, window: Self::Window) {
        let _ = window.destroy();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[cfg(not(windows))]
    #[test]
    fn native_pdf_is_unsupported_on_unix() {
        assert!(matches!(unsupported_pdf_export(), Err(AppError::UnsupportedPlatform(_))));
    }

    struct MockRunner {
        closes: AtomicUsize,
        outcome: bool,
        loaded: bool,
        print_completed: bool,
        load_sender: Mutex<Option<mpsc::Sender<()>>>,
        print_sender: Mutex<Option<mpsc::Sender<Result<(), AppError>>>>,
    }

    impl MockRunner {
        fn new(outcome: bool, loaded: bool, print_completed: bool) -> Self {
            Self {
                closes: AtomicUsize::new(0),
                outcome,
                loaded,
                print_completed,
                load_sender: Mutex::new(None),
                print_sender: Mutex::new(None),
            }
        }
    }

    impl PdfRunner for MockRunner {
        type Window = ();

        fn open(&self, _: &str) -> Result<(Self::Window, mpsc::Receiver<()>), AppError> {
            let (sender, receiver) = mpsc::channel();
            if self.loaded { sender.send(()).unwrap(); }
            else { *self.load_sender.lock().unwrap() = Some(sender); }
            Ok(((), receiver))
        }

        fn print(&self, _: &Self::Window, path: &Path) -> Result<mpsc::Receiver<Result<(), AppError>>, AppError> {
            std::fs::write(path, b"%PDF-mock")?;
            let (sender, receiver) = mpsc::channel();
            if self.print_completed {
                sender.send(if self.outcome { Ok(()) } else { Err(AppError::Internal("print failed".into())) }).unwrap();
            } else {
                *self.print_sender.lock().unwrap() = Some(sender);
            }
            Ok(receiver)
        }

        fn close(&self, _: Self::Window) { self.closes.fetch_add(1, Ordering::SeqCst); }
    }

    #[test]
    fn success_error_and_timeout_close_window_and_remove_temp() {
        let _test_lock = TEST_LOCK.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("note.pdf");
        let runner = MockRunner::new(true, true, true);
        assert!(export_with_runner(&runner, "note", &target, TIMEOUT).is_ok());
        assert_eq!(runner.closes.load(Ordering::SeqCst), 1);
        assert_eq!(std::fs::read(&target).unwrap(), b"%PDF-mock");
        std::fs::remove_file(&target).unwrap();
        let runner = MockRunner::new(false, true, true);
        assert!(export_with_runner(&runner, "note", &target, TIMEOUT).is_err());
        assert_eq!(runner.closes.load(Ordering::SeqCst), 1);
        assert!(std::fs::read_dir(dir.path()).unwrap().next().is_none());
        let runner = MockRunner::new(true, false, true);
        let result = export_with_runner(&runner, "note", &target, Duration::ZERO);
        assert!(matches!(result, Err(AppError::Internal(message)) if message.contains("timed out")));
        assert_eq!(runner.closes.load(Ordering::SeqCst), 1);
        assert!(std::fs::read_dir(dir.path()).unwrap().next().is_none());
        let runner = MockRunner::new(true, true, false);
        let result = export_with_runner(&runner, "note", &target, Duration::from_millis(750));
        assert!(matches!(result, Err(AppError::Internal(message)) if message.contains("timed out")));
        assert_eq!(runner.closes.load(Ordering::SeqCst), 1);
        assert!(std::fs::read_dir(dir.path()).unwrap().next().is_none());
    }

    #[test]
    fn concurrent_export_is_busy() {
        let _test_lock = TEST_LOCK.lock().unwrap();
        let _lock = EXPORT_LOCK.lock().unwrap();
        let runner = MockRunner::new(true, true, true);
        let result = export_with_runner(&runner, "note", Path::new("unused.pdf"), TIMEOUT);
        assert!(matches!(result, Err(AppError::Busy(_))));
        assert_eq!(runner.closes.load(Ordering::SeqCst), 0);
    }
}

#[cfg(not(windows))]
pub fn export(_app: tauri::AppHandle, _id: uuid::Uuid, _target: &Path) -> Result<ExportResult, AppError> {
    unsupported_pdf_export()
}

#[cfg(not(windows))]
fn unsupported_pdf_export() -> Result<ExportResult, AppError> {
    Err(AppError::UnsupportedPlatform("PDF export requires Windows".into()))
}

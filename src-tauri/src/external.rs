//! All OS open operations pass here; release builds cannot enable recording.
use crate::error::AppError;
use std::path::Path;
use tauri_plugin_opener::OpenerExt;

pub fn validate_url(target: &str) -> Result<(), AppError> {
    let lower = target.to_ascii_lowercase();
    if !(lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:"))
    {
        return Err(AppError::InvalidName(
            "Unsupported external URL scheme".into(),
        ));
    }
    let url =
        tauri::Url::parse(target).map_err(|error| AppError::InvalidName(error.to_string()))?;
    if !matches!(url.scheme(), "http" | "https" | "mailto") {
        return Err(AppError::InvalidName(
            "Unsupported external URL scheme".into(),
        ));
    }
    Ok(())
}

#[cfg(debug_assertions)]
fn log_override() -> Option<std::path::PathBuf> {
    std::env::var_os("HTNOTE_EXTERNAL_OPEN_LOG")
        .filter(|value| !value.is_empty())
        .map(Into::into)
}

#[cfg(debug_assertions)]
fn with_log(
    log: Option<&Path>,
    kind: &str,
    target: &str,
    action: impl FnOnce() -> Result<(), AppError>,
) -> Result<(), AppError> {
    use std::io::Write;
    // Serialize append operations across URL/asset/reveal commands.
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    if let Some(path) = log {
        let _guard = LOCK
            .lock()
            .map_err(|error| AppError::Internal(error.to_string()))?;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;
        let mut line = serde_json::to_vec(&serde_json::json!({ "kind": kind, "target": target }))?;
        line.push(b'\n');
        file.write_all(&line)?;
        return Ok(());
    }
    action()
}

fn perform(
    _kind: &str,
    _target: &str,
    action: impl FnOnce() -> Result<(), AppError>,
) -> Result<(), AppError> {
    #[cfg(debug_assertions)]
    {
        with_log(log_override().as_deref(), _kind, _target, action)
    }
    #[cfg(not(debug_assertions))]
    {
        action()
    }
}

pub fn open_url(app: &tauri::AppHandle, target: &str) -> Result<(), AppError> {
    validate_url(target)?;
    perform("url", target, || {
        app.opener()
            .open_url(target, None::<&str>)
            .map_err(|error| AppError::Io(std::io::Error::other(error)))
    })
}

pub fn open_path(app: &tauri::AppHandle, path: &Path) -> Result<(), AppError> {
    let display_path = crate::fs_util::display_path(path);
    let target = display_path.to_string_lossy();
    perform("path", &target, || {
        app.opener()
            .open_path(target.as_ref(), None::<&str>)
            .map_err(|error| AppError::Io(std::io::Error::other(error)))
    })
}

pub fn reveal_in_dir(path: &Path) -> Result<(), AppError> {
    perform("reveal", &path.to_string_lossy(), || {
        tauri_plugin_opener::reveal_item_in_dir(path)
            .map_err(|error| AppError::Io(std::io::Error::other(error)))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_explicit_supported_url_schemes_are_allowed() {
        for target in [
            "http://example.com",
            "https://example.com",
            "HTTPS://example.com",
            "mailto:user@example.com",
        ] {
            validate_url(target).unwrap();
        }
        for target in [
            "javascript:alert(1)",
            "file:///C:/secret",
            "data:text/html,attack",
            "https:example.com",
            "//example.com",
            " https://example.com",
            "https://",
        ] {
            assert!(validate_url(target).is_err(), "{target}");
        }
    }

    #[cfg(debug_assertions)]
    #[test]
    fn log_appends_json_lines_without_calling_os_and_propagates_io_errors() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("external.jsonl");
        let target = "C:\\Export\\quoted\"\nfile.html";
        for kind in ["url", "path", "reveal"] {
            with_log(Some(&log), kind, target, || panic!("OS operation ran")).unwrap();
        }
        let contents = std::fs::read_to_string(&log).unwrap();
        let rows: Vec<serde_json::Value> = contents
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(rows.len(), 3);
        for (row, kind) in rows.iter().zip(["url", "path", "reveal"]) {
            assert_eq!(*row, serde_json::json!({ "kind": kind, "target": target }));
        }
        assert!(
            with_log(Some(dir.path()), "url", "https://example.com", || panic!(
                "must not fall back to OS"
            ))
            .is_err()
        );
        let called = std::cell::Cell::new(false);
        with_log(None, "url", "https://example.com", || {
            called.set(true);
            Ok(())
        })
        .unwrap();
        assert!(called.get());
    }
}

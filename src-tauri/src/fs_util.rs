use std::ffi::OsString;
use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::error::AppError;

/// Returns a path suitable for display to external applications.
/// Windows canonical paths may use the verbatim namespace, which some openers do not accept.
pub(crate) fn display_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};

        let mut components = path.components();
        if let Some(Component::Prefix(prefix)) = components.next() {
            let root = match prefix.kind() {
                Prefix::VerbatimDisk(letter) => Some(PathBuf::from(format!("{}:\\", letter as char))),
                Prefix::VerbatimUNC(server, share) => {
                    Some(PathBuf::from(format!(
                        r"\\{}\{}\",
                        server.to_string_lossy(),
                        share.to_string_lossy()
                    )))
                }
                _ => None,
            };
            if let Some(mut display) = root {
                display.extend(components.skip(1));
                return display;
            }
        }
    }

    path.to_path_buf()
}

pub(crate) fn write_file_atomic(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let (temporary, mut file) = loop {
        let mut temporary_name: OsString = path.as_os_str().to_owned();
        temporary_name.push(format!(".{}.tmp", Uuid::new_v4()));
        let temporary = PathBuf::from(temporary_name);
        match OpenOptions::new().write(true).create_new(true).open(&temporary) {
            Ok(file) => break (TemporaryFile(temporary), file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    };
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    replace_file(&temporary.0, path)?;
    Ok(())
}

struct TemporaryFile(PathBuf);

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        // Taşıma başarılıysa dosya artık yoktur; hata durumunda geçici dosya temizlenir.
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(not(windows))]
pub(crate) fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    std::fs::rename(source, destination)
}

#[cfg(windows)]
pub(crate) fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(source: *const u16, destination: *const u16, flags: u32) -> i32;
    }

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination.as_os_str().encode_wide().chain(Some(0)).collect();
    // Geçici dosya aynı dizindedir; Windows'ta mevcut hedef tek taşıma işleminde değiştirilir.
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_path_preserves_paths_without_verbatim_prefix() {
        let path = Path::new(r"C:\notes\report.pdf");
        assert_eq!(display_path(path), path);
    }

    #[cfg(windows)]
    #[test]
    fn display_path_strips_verbatim_drive_prefix() {
        assert_eq!(display_path(Path::new(r"\\?\C:\notes\report.pdf")), PathBuf::from(r"C:\notes\report.pdf"));
    }

    #[cfg(windows)]
    #[test]
    fn display_path_converts_verbatim_unc_prefix() {
        assert_eq!(display_path(Path::new(r"\\?\UNC\server\share\report.pdf")), PathBuf::from(r"\\server\share\report.pdf"));
    }

    #[test]
    fn failed_replace_removes_temporary_file() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("metadata.json");
        std::fs::create_dir(&destination).unwrap();

        assert!(write_file_atomic(&destination, b"contents").is_err());
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn replace_file_overwrites_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source");
        let destination = directory.path().join("destination");
        std::fs::write(&source, b"new").unwrap();
        std::fs::write(&destination, b"old").unwrap();
        replace_file(&source, &destination).unwrap();
        assert_eq!(std::fs::read(&destination).unwrap(), b"new");
        assert!(!source.exists());
    }
}

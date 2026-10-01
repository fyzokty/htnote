use std::ffi::OsString;
use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::error::AppError;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_replace_removes_temporary_file() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("metadata.json");
        std::fs::create_dir(&destination).unwrap();

        assert!(write_file_atomic(&destination, b"contents").is_err());
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }
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

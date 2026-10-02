use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Seek, Write};
use std::path::{Path, PathBuf};

use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::error::AppError;

fn zip_error(error: zip::result::ZipError) -> AppError {
    AppError::Io(io::Error::other(error))
}

fn utf8_name(path: &Path) -> Result<&str, AppError> {
    path.file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::InvalidName(path.display().to_string()))
}

pub fn zip_note_dir<W: Write + Seek>(note_dir: &Path, writer: W) -> Result<W, AppError> {
    zip_note_dir_excluding(note_dir, writer, None)
}

fn zip_note_dir_excluding<W: Write + Seek>(note_dir: &Path, writer: W, excluded: Option<&Path>) -> Result<W, AppError> {
    if !fs::symlink_metadata(note_dir)?.file_type().is_dir() {
        return Err(AppError::InvalidName(note_dir.display().to_string()));
    }
    let root = utf8_name(note_dir)?;
    let mut archive = ZipWriter::new(writer);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    archive.add_directory(format!("{root}/"), options).map_err(zip_error)?;
    add_entries(&mut archive, note_dir, root, options, excluded)?;
    archive.finish().map_err(zip_error)
}

fn add_entries<W: Write + Seek>(
    archive: &mut ZipWriter<W>,
    directory: &Path,
    prefix: &str,
    options: SimpleFileOptions,
    excluded: Option<&Path>,
) -> Result<(), AppError> {
    let mut entries = fs::read_dir(directory)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let kind = entry.file_type()?;
        // Linklerin hedefi not kökünün dışında olabilir; hiçbir linki açmayız.
        if kind.is_symlink() {
            continue;
        }
        let path = entry.path();
        if excluded == Some(path.as_path()) {
            continue;
        }
        let name = format!("{prefix}/{}", utf8_name(&path)?);
        if kind.is_dir() {
            archive.add_directory(format!("{name}/"), options).map_err(zip_error)?;
            add_entries(archive, &path, &name, options, excluded)?;
        } else if kind.is_file() {
            archive.start_file(name, options).map_err(zip_error)?;
            io::copy(&mut File::open(&path)?, archive)?;
        }
    }
    Ok(())
}

struct TemporaryFile(PathBuf);

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

pub fn export_zip_to(note_dir: &Path, target: &Path) -> Result<(), AppError> {
    if !target.is_absolute() {
        return Err(AppError::InvalidName("Export target must be absolute".into()));
    }
    let (temporary, file) = loop {
        let mut name: OsString = target.as_os_str().to_owned();
        name.push(format!(".{}.tmp", Uuid::new_v4()));
        let path = PathBuf::from(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => break (TemporaryFile(path), file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    };
    if !fs::symlink_metadata(note_dir)?.file_type().is_dir() {
        return Err(AppError::InvalidName(note_dir.display().to_string()));
    }
    let note_dir = fs::canonicalize(note_dir)?;
    let temporary_path = fs::canonicalize(&temporary.0)?;
    let file = if temporary_path.starts_with(&note_dir) {
        zip_note_dir_excluding(&note_dir, file, Some(&temporary_path))?
    } else {
        zip_note_dir(&note_dir, file)?
    };
    file.sync_all()?;
    drop(file);
    crate::fs_util::replace_file(&temporary.0, target)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn archives_turkish_names_nested_assets_and_empty_directories() {
        let temp = tempfile::tempdir().unwrap();
        let note = temp.path().join("Örnek Not");
        fs::create_dir_all(note.join("assets/iç")).unwrap();
        fs::create_dir(note.join("boş")).unwrap();
        fs::write(note.join("index.html"), b"<p>hello</p>").unwrap();
        let bytes = [0, 1, 255, 42];
        fs::write(note.join("assets/iç/görsel.png"), bytes).unwrap();

        let output = temp.path().join("export.zip");
        export_zip_to(&note, &output).unwrap();
        let mut archive = zip::ZipArchive::new(File::open(output).unwrap()).unwrap();
        let mut names = (0..archive.len()).map(|i| archive.by_index(i).unwrap().name().to_owned()).collect::<Vec<_>>();
        names.sort();
        assert_eq!(names, ["Örnek Not/", "Örnek Not/assets/", "Örnek Not/assets/iç/", "Örnek Not/assets/iç/görsel.png", "Örnek Not/boş/", "Örnek Not/index.html"]);
        let mut content = Vec::new();
        archive.by_name("Örnek Not/assets/iç/görsel.png").unwrap().read_to_end(&mut content).unwrap();
        assert_eq!(content, bytes);
        content.clear();
        archive.by_name("Örnek Not/index.html").unwrap().read_to_end(&mut content).unwrap();
        assert_eq!(content, b"<p>hello</p>");
        assert_eq!(archive.by_name("Örnek Not/boş/").unwrap().size(), 0);

        // Merkez dizindeki 11. bit UTF-8 adlarını Windows Explorer'a bildirir.
        let raw = fs::read(temp.path().join("export.zip")).unwrap();
        let marker = b"PK\x01\x02";
        let utf8_entries = raw.windows(marker.len()).enumerate()
            .filter(|(_, window)| *window == marker)
            .map(|(offset, _)| u16::from_le_bytes([raw[offset + 8], raw[offset + 9]]));
        assert!(utf8_entries.into_iter().any(|flags| flags & (1 << 11) != 0));
    }

    #[test]
    fn failed_export_keeps_target_absent_and_cleans_temp() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("export.zip");
        assert!(export_zip_to(&temp.path().join("missing"), &target).is_err());
        assert!(!target.exists());
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);

        let note = temp.path().join("Note");
        fs::create_dir(&note).unwrap();
        fs::create_dir(&target).unwrap();
        assert!(export_zip_to(&note, &target).is_err());
        assert!(target.is_dir());
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 2);
    }

    #[test]
    fn target_inside_note_does_not_include_temporary_archive() {
        let temp = tempfile::tempdir().unwrap();
        let note = temp.path().join("Note");
        fs::create_dir(&note).unwrap();
        fs::write(note.join("index.html"), b"note").unwrap();
        let target = note.join("export.zip");
        export_zip_to(&note, &target).unwrap();
        let mut archive = zip::ZipArchive::new(File::open(target).unwrap()).unwrap();
        assert_eq!(archive.len(), 2);
        assert!(archive.by_name("Note/index.html").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn skips_symlinks() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let note = temp.path().join("Note");
        fs::create_dir(&note).unwrap();
        fs::write(temp.path().join("secret"), b"outside").unwrap();
        symlink(temp.path().join("secret"), note.join("linked")).unwrap();
        let file = zip_note_dir(&note, io::Cursor::new(Vec::new())).unwrap();
        let archive = zip::ZipArchive::new(file).unwrap();
        assert_eq!(archive.len(), 1);
    }

    #[cfg(windows)]
    #[test]
    fn skips_symlinks_when_creatable() {
        use std::os::windows::fs::symlink_file;

        let temp = tempfile::tempdir().unwrap();
        let note = temp.path().join("Note");
        fs::create_dir(&note).unwrap();
        let outside = temp.path().join("secret");
        fs::write(&outside, b"outside").unwrap();
        if symlink_file(&outside, note.join("linked")).is_err() {
            return;
        }
        let file = zip_note_dir(&note, io::Cursor::new(Vec::new())).unwrap();
        let archive = zip::ZipArchive::new(file).unwrap();
        assert_eq!(archive.len(), 1);
    }
}

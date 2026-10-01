use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::AppError;
use crate::notes::naming::sanitize_name;

const MAX_ASSET_BYTES: usize = 52_428_800;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    pub rel_path: String,
    pub kind: &'static str,
    pub mime: String,
}

pub fn copy_asset(note_dir: &Path, source: &Path) -> Result<AssetInfo, AppError> {
    let name = source.file_name().and_then(|name| name.to_str())
        .ok_or_else(|| AppError::InvalidName(source.display().to_string()))?;
    let file = File::open(source)?;
    let size = file.metadata()?.len();
    if size > MAX_ASSET_BYTES as u64 {
        return Err(AppError::PayloadTooLarge(size.try_into().unwrap_or(usize::MAX)));
    }
    // Okuma sırasında büyüyen kaynak dosya da bellek sınırını aşamaz.
    let mut bytes = Vec::new();
    file.take(MAX_ASSET_BYTES as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(AppError::PayloadTooLarge(bytes.len()));
    }
    save_asset_bytes(note_dir, name, &bytes)
}

pub fn save_asset_bytes(note_dir: &Path, suggested_name: &str, bytes: &[u8]) -> Result<AssetInfo, AppError> {
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(AppError::PayloadTooLarge(bytes.len()));
    }
    let file_name = suggested_name.rsplit(['/', '\\']).next().unwrap_or("");
    let (raw_stem, extension) = match file_name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() && !extension.is_empty() => (stem, Some(extension)),
        _ => (file_name, None),
    };
    if raw_stem.trim_matches(|ch: char| ch.is_whitespace() || ch == '.').is_empty()
        || extension.is_some_and(|value| value.trim_matches(|ch: char| ch.is_whitespace() || ch == '.').is_empty()) {
        return Err(AppError::InvalidName(suggested_name.into()));
    }
    let stem = sanitize_name(raw_stem);
    let extension = extension.map(|extension| sanitize_name(extension).to_lowercase());
    let note_dir = note_dir.canonicalize()?;
    let assets = note_dir.join("assets");
    // create_dir_all mevcut sembolik bağları izler; yalnızca doğrulanmış not altında oluştururuz.
    match fs::symlink_metadata(&assets) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err(AppError::PathOutsideRoot(assets.display().to_string()));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            match fs::create_dir(&assets) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
        }
        Err(error) => return Err(error.into()),
    }
    let metadata = fs::symlink_metadata(&assets)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir()
        || !assets.canonicalize()?.starts_with(&note_dir) {
        return Err(AppError::PathOutsideRoot(assets.display().to_string()));
    }
    let incoming_hash = Sha256::digest(bytes);
    for number in 1.. {
        let suffix = if number == 1 { String::new() } else { format!("-{number}") };
        let name = match &extension {
            Some(extension) => format!("{stem}{suffix}.{extension}"),
            None => format!("{stem}{suffix}"),
        };
        let target = assets.join(&name);
        match fs::symlink_metadata(&target) {
            Ok(metadata) => {
                validate_existing_target(&target, &metadata)?;
                if hash_file(&target)? == incoming_hash.as_slice() {
                    return Ok(asset_info(name));
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                match write_new_atomic(&assets, &target, bytes) {
                    Ok(()) => return Ok(asset_info(name)),
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                        // Aynı ad eşzamanlı oluşturulduysa içeriği tekrar karşılaştırırız.
                        let metadata = fs::symlink_metadata(&target)?;
                        validate_existing_target(&target, &metadata)?;
                        if hash_file(&target)? == incoming_hash.as_slice() {
                            return Ok(asset_info(name));
                        }
                    }
                    Err(error) => return Err(error.into()),
                }
            }
            Err(error) => return Err(error.into()),
        }
    }
    unreachable!()
}

fn validate_existing_target(path: &Path, metadata: &fs::Metadata) -> Result<(), AppError> {
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AppError::PathOutsideRoot(path.display().to_string()));
    }
    Ok(())
}

fn hash_file(path: &Path) -> Result<Vec<u8>, AppError> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut chunk = [0; 8192];
    loop {
        let count = file.read(&mut chunk)?;
        if count == 0 { break; }
        hasher.update(&chunk[..count]);
    }
    Ok(hasher.finalize().to_vec())
}

fn write_new_atomic(assets: &Path, target: &Path, bytes: &[u8]) -> io::Result<()> {
    let temporary = assets.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary)?;
    let result = (|| {
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::hard_link(&temporary, target)
    })();
    drop(file);
    let _ = fs::remove_file(&temporary);
    result
}

fn asset_info(name: String) -> AssetInfo {
    let extension = Path::new(&name).extension().and_then(|value| value.to_str()).unwrap_or("");
    let kind = match extension {
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "avif" => "image",
        "mp3" | "wav" | "ogg" | "m4a" => "audio",
        "mp4" | "webm" => "video",
        _ => "file",
    };
    AssetInfo {
        rel_path: format!("./assets/{name}"),
        kind,
        mime: mime_guess::from_path(&name).first_or_octet_stream().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_collision_and_reuse() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("resim.png");
        let note = dir.path().join("note");
        fs::create_dir(&note).unwrap();
        fs::write(&source, b"first").unwrap();
        let first = copy_asset(&note, &source).unwrap();
        assert_eq!(first.rel_path, "./assets/resim.png");
        assert_eq!(first.kind, "image");
        assert_eq!(first.mime, "image/png");
        assert_eq!(copy_asset(&note, &source).unwrap(), first);
        fs::write(&source, b"second").unwrap();
        assert_eq!(copy_asset(&note, &source).unwrap().rel_path, "./assets/resim-2.png");
        assert_eq!(copy_asset(&note, &source).unwrap().rel_path, "./assets/resim-2.png");
        assert_eq!(fs::read(note.join("assets/resim.png")).unwrap(), b"first");
    }

    #[test]
    fn names_and_kinds() {
        let dir = tempfile::tempdir().unwrap();
        let cases = [
            ("İstanbul resim.PNG", "İstanbul resim.png", "image", "image/png"),
            ("a/b/klip.MP4", "klip.mp4", "video", "video/mp4"),
            ("ses.MP3", "ses.mp3", "audio", "audio/mpeg"),
            ("uzantısız", "uzantısız", "file", "application/octet-stream"),
            ("sayfa.svg", "sayfa.svg", "image", "image/svg+xml"),
        ];
        for (input, name, kind, mime) in cases {
            let info = save_asset_bytes(dir.path(), input, input.as_bytes()).unwrap();
            assert_eq!(info.rel_path, format!("./assets/{name}"));
            assert_eq!(info.kind, kind);
            assert_eq!(info.mime, mime);
        }
    }

    #[test]
    fn size_limit_and_missing_source() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(save_asset_bytes(dir.path(), "big.png", &vec![0; MAX_ASSET_BYTES + 1]), Err(AppError::PayloadTooLarge(_))));
        assert!(matches!(copy_asset(dir.path(), &dir.path().join("missing.png")), Err(AppError::Io(_))));
        let source = dir.path().join("large.png");
        File::create(&source).unwrap().set_len(MAX_ASSET_BYTES as u64 + 1).unwrap();
        assert!(matches!(copy_asset(dir.path(), &source), Err(AppError::PayloadTooLarge(_))));
        assert!(!dir.path().join("assets").exists());
    }

    #[test]
    fn dot_only_name_is_invalid() {
        let dir = tempfile::tempdir().unwrap();
        for name in [".", "..", " . ", "image. "] {
            assert!(matches!(save_asset_bytes(dir.path(), name, b"x"), Err(AppError::InvalidName(_))));
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_assets_and_collision_are_rejected() {
        use std::os::unix::fs::symlink;

        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("note");
        let outside = dir.path().join("outside");
        fs::create_dir(&note).unwrap();
        fs::create_dir(&outside).unwrap();
        symlink(&outside, note.join("assets")).unwrap();
        assert!(matches!(save_asset_bytes(&note, "asset.txt", b"x"), Err(AppError::PathOutsideRoot(_))));
        assert!(!outside.join("asset.txt").exists());

        fs::remove_file(note.join("assets")).unwrap();
        fs::create_dir(note.join("assets")).unwrap();
        let outside_file = outside.join("asset.txt");
        fs::write(&outside_file, b"x").unwrap();
        symlink(&outside_file, note.join("assets/asset.txt")).unwrap();
        assert!(matches!(save_asset_bytes(&note, "asset.txt", b"x"), Err(AppError::PathOutsideRoot(_))));
    }

    #[test]
    fn suggested_path_cannot_escape_assets() {
        let dir = tempfile::tempdir().unwrap();
        let info = save_asset_bytes(dir.path(), "../../outside.txt", b"safe").unwrap();
        assert_eq!(info.rel_path, "./assets/outside.txt");
        assert!(!dir.path().join("outside.txt").exists());
    }

    #[test]
    fn known_extensions_have_expected_kind() {
        let cases = [
            ("jpg", "image"), ("jpeg", "image"), ("gif", "image"),
            ("webp", "image"), ("avif", "image"), ("wav", "audio"),
            ("ogg", "audio"), ("m4a", "audio"), ("webm", "video"),
            ("txt", "file"),
        ];
        for (extension, kind) in cases {
            let info = asset_info(format!("asset.{extension}"));
            assert_eq!(info.kind, kind);
            assert!(!info.mime.is_empty());
        }
    }
}

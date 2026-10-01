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
    let bytes = fs::read(source)?;
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
    let stem = sanitize_name(raw_stem);
    let extension = extension.map(|extension| sanitize_name(extension).to_lowercase());
    let assets = note_dir.join("assets");
    fs::create_dir_all(&assets)?;
    // Sembolik bağ üzerinden not klasörü dışına yazılmasını engelleriz.
    if fs::symlink_metadata(&assets)?.file_type().is_symlink() {
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
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err(AppError::PathOutsideRoot(target.display().to_string()));
                }
                if hash_file(&target)? == incoming_hash.as_slice() {
                    return Ok(asset_info(name));
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                match write_new_atomic(&assets, &target, bytes) {
                    Ok(()) => return Ok(asset_info(name)),
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                        // Aynı ad eşzamanlı oluşturulduysa içeriği tekrar karşılaştırırız.
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

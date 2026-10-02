use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::AppError;
use crate::notes::naming::sanitize_name;

const MAX_ASSET_BYTES: usize = 52_428_800;
const OPENABLE_EXTENSIONS: &[&str] = &[
    "pdf", "txt", "md", "csv", "rtf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "odt", "ods", "odp", "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp",
    "mp3", "wav", "ogg", "m4a", "flac", "mp4", "webm", "mov", "zip",
];

pub fn open_asset(
    note_dir: &Path,
    rel_path: &str,
    open: impl FnOnce(&Path) -> Result<(), AppError>,
) -> Result<(), AppError> {
    let path = resolve_openable_asset(note_dir, rel_path)?;
    open(&path)
}

fn resolve_openable_asset(note_dir: &Path, rel_path: &str) -> Result<PathBuf, AppError> {
    let invalid = || AppError::PathOutsideRoot(rel_path.into());
    if rel_path.is_empty() || rel_path.encode_utf16().count() > 4096 || rel_path.contains(['?', '#']) {
        return Err(invalid());
    }
    // percent_decode_str bozuk yüzde dizilerini korur; URL girdisi için bunları reddederiz.
    let bytes = rel_path.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'%' && (bytes.get(index + 1).is_none_or(|byte| !byte.is_ascii_hexdigit())
            || bytes.get(index + 2).is_none_or(|byte| !byte.is_ascii_hexdigit())) {
            return Err(invalid());
        }
    }
    let decoded = percent_encoding::percent_decode_str(rel_path).decode_utf8().map_err(|_| invalid())?;
    let relative = decoded.strip_prefix("./").unwrap_or(&decoded);
    if !relative.starts_with("assets/") || relative.contains(['\\', ':'])
        || relative.chars().any(char::is_control)
        || relative.split('/').any(|part| part.is_empty() || part == "." || part == ".." || part.ends_with(['.', ' '])) {
        return Err(invalid());
    }
    check_openable_extension(Path::new(relative))?;
    let note_dir = note_dir.canonicalize()?;
    let assets_path = note_dir.join("assets");
    let assets = assets_path.canonicalize().map_err(|error| asset_io_error(error, rel_path))?;
    if !assets.starts_with(&note_dir) || fs::symlink_metadata(&assets_path)?.file_type().is_symlink() {
        return Err(invalid());
    }
    let path = note_dir.join(relative).canonicalize().map_err(|error| asset_io_error(error, rel_path))?;
    if !path.starts_with(&assets) {
        return Err(invalid());
    }
    if !path.is_file() {
        return Err(AppError::AssetNotFound(rel_path.into()));
    }
    // İzinli bir adın çalıştırılabilir dosyaya sembolik bağ olması da kabul edilmez.
    check_openable_extension(&path)?;
    Ok(path)
}

fn check_openable_extension(path: &Path) -> Result<(), AppError> {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if !OPENABLE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(AppError::AssetTypeBlocked(path.display().to_string()));
    }
    Ok(())
}

fn asset_io_error(error: io::Error, rel_path: &str) -> AppError {
    if error.kind() == io::ErrorKind::NotFound {
        AppError::AssetNotFound(rel_path.into())
    } else {
        error.into()
    }
}

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
    fn open_assets_decodes_names_once_and_allows_only_listed_extensions() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("assets")).unwrap();
        let mut opened = Vec::new();
        for extension in OPENABLE_EXTENSIONS {
            let name = format!("İstanbul rapor.{}", extension.to_uppercase());
            let path = dir.path().join("assets").join(&name);
            fs::write(&path, b"attachment").unwrap();
            let rel_path = format!("./assets/%C4%B0stanbul%20rapor.{}", extension.to_uppercase());
            open_asset(dir.path(), &rel_path, |target| {
                opened.push(target.to_path_buf());
                Ok(())
            }).unwrap();
            assert_eq!(opened.last(), Some(&path.canonicalize().unwrap()));
        }
        fs::write(dir.path().join("assets/a%20b#c.txt"), b"text").unwrap();
        open_asset(dir.path(), "assets/a%2520b%23c.txt", |_| Ok(())).unwrap();
        assert_eq!(opened.len(), OPENABLE_EXTENSIONS.len());
    }

    #[test]
    fn unsafe_missing_and_non_file_assets_never_reach_opener() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("assets")).unwrap();
        fs::write(dir.path().join("outside.pdf"), b"outside").unwrap();
        fs::create_dir(dir.path().join("assets/folder.pdf")).unwrap();
        let never_open = |_: &Path| -> Result<(), AppError> { panic!("invalid asset reached opener") };
        for path in [
            "", "assets/", "assets/../outside.pdf", "../outside.pdf", "./outside.pdf",
            "/assets/file.pdf", "C:/assets/file.pdf", "//server/assets/file.pdf", "file:///assets/file.pdf",
            "assets/a\\file.pdf", "assets/a%5cfile.pdf", "assets/a\0file.pdf", "assets/a%00file.pdf",
            "assets/%2e%2e/outside.pdf", "assets/a/%2E%2E/outside.pdf", "assets/%2F..%2Foutside.pdf",
            "assets/C:file.pdf", "assets/file.pdf:stream", "assets/file.pdf.", "assets/file.pdf%20",
            "assets/./file.pdf", "assets//file.pdf", "assets/file.pdf#page=1", "assets/file.pdf?x=1",
            "assets/%zz.pdf", "assets/%.pdf", "assets/%FF.pdf",
        ] {
            assert!(matches!(open_asset(dir.path(), path, never_open), Err(AppError::PathOutsideRoot(_))), "{path}");
        }
        assert!(matches!(open_asset(dir.path(), &format!("assets/{}.pdf", "a".repeat(4096)), never_open), Err(AppError::PathOutsideRoot(_))));
        for extension in ["exe", "bat", "cmd", "ps1", "lnk", "url", "html", "js", "vbs", "msi", "scr", "unknown"] {
            let path = format!("assets/file.{}", extension.to_uppercase());
            fs::write(dir.path().join(&path), b"blocked").unwrap();
            assert!(matches!(open_asset(dir.path(), &path, never_open), Err(AppError::AssetTypeBlocked(_))));
        }
        assert!(matches!(open_asset(dir.path(), "assets/no-extension", never_open), Err(AppError::AssetTypeBlocked(_))));
        for path in ["assets/missing.pdf", "assets/folder.pdf"] {
            assert!(matches!(open_asset(dir.path(), path, never_open), Err(AppError::AssetNotFound(_))));
        }
        let empty_note = tempfile::tempdir().unwrap();
        assert!(matches!(open_asset(empty_note.path(), "assets/missing.pdf", never_open), Err(AppError::AssetNotFound(_))));
    }

    #[test]
    fn open_assets_propagates_opener_errors() {
        let dir = tempfile::tempdir().unwrap();
        save_asset_bytes(dir.path(), "report.pdf", b"pdf").unwrap();
        assert!(matches!(open_asset(dir.path(), "assets/report.pdf", |_| Err(AppError::Io(io::Error::other("no association")))), Err(AppError::Io(_))));
    }

    #[cfg(any(unix, windows))]
    fn link_directory(target: &Path, link: &Path) {
        #[cfg(unix)]
        std::os::unix::fs::symlink(target, link).unwrap();
        #[cfg(windows)]
        {
            let output = std::process::Command::new("cmd")
                .args(["/c", "mklink", "/J"])
                .arg(link).arg(target).output().unwrap();
            assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        }
    }

    #[cfg(any(unix, windows))]
    fn unlink_directory(link: &Path) {
        #[cfg(unix)]
        fs::remove_file(link).unwrap();
        #[cfg(windows)]
        fs::remove_dir(link).unwrap();
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn open_assets_rejects_symlink_and_junction_directory_escapes() {
        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("note");
        let outside = dir.path().join("outside");
        fs::create_dir(&note).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("file.pdf"), b"outside").unwrap();
        let assets = note.join("assets");
        let never_open = |_: &Path| -> Result<(), AppError> { panic!("escaped asset reached opener") };
        link_directory(&outside, &assets);
        let result = open_asset(&note, "assets/file.pdf", never_open);
        unlink_directory(&assets);
        assert!(matches!(result, Err(AppError::PathOutsideRoot(_))));

        fs::create_dir(&assets).unwrap();
        let nested = assets.join("linked");
        link_directory(&outside, &nested);
        let result = open_asset(&note, "assets/linked/file.pdf", never_open);
        unlink_directory(&nested);
        assert!(matches!(result, Err(AppError::PathOutsideRoot(_))));
    }

    #[cfg(unix)]
    #[test]
    fn open_assets_rejects_symlinked_files_outside_assets_or_with_blocked_target_types() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("assets")).unwrap();
        fs::write(dir.path().join("outside.pdf"), b"outside").unwrap();
        fs::write(dir.path().join("assets/program.exe"), b"blocked").unwrap();
        std::os::unix::fs::symlink(dir.path().join("outside.pdf"), dir.path().join("assets/outside.pdf")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("assets/program.exe"), dir.path().join("assets/alias.pdf")).unwrap();
        let never_open = |_: &Path| -> Result<(), AppError> { panic!("unsafe symlink reached opener") };
        assert!(matches!(open_asset(dir.path(), "assets/outside.pdf", never_open), Err(AppError::PathOutsideRoot(_))));
        assert!(matches!(open_asset(dir.path(), "assets/alias.pdf", never_open), Err(AppError::AssetTypeBlocked(_))));
    }

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

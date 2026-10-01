use std::fs::File;
use std::cell::Cell;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::rc::Rc;

use percent_encoding::percent_decode_str;
use lol_html::{element, rewrite_str, Settings};
use tauri::http::StatusCode;
use uuid::Uuid;

use crate::index::note_index::NoteIndex;
use std::sync::{Arc, RwLock};

const BRIDGE_JS: &str = include_str!("../../../src/bridge/bridge.js");
const BRIDGE_TAG: &str = "<script src=\"/__htnote/bridge.js\"></script>";

struct NoteRequest {
    id: Uuid,
    relative: PathBuf,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Served {
    pub status: StatusCode,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

impl Served {
    pub(crate) fn new(status: StatusCode) -> Self {
        Self {
            status,
            headers: vec![
                ("Cache-Control", "no-store".into()),
                ("X-Content-Type-Options", "nosniff".into()),
                ("Accept-Ranges", "bytes".into()),
            ],
            body: Vec::new(),
        }
    }

    fn header(&mut self, name: &'static str, value: impl Into<String>) {
        self.headers.push((name, value.into()));
    }

}

fn parse_note_path(path: &str) -> Result<NoteRequest, StatusCode> {
    let path = path.strip_prefix('/').unwrap_or(path);
    let (id, rel) = path.split_once('/').unwrap_or((path, ""));
    let id = Uuid::parse_str(id).map_err(|_| StatusCode::NOT_FOUND)?;
    let rel = if rel.is_empty() { "index.html" } else { rel };
    // Yalnızca bir kez decode edilir; ikinci kez çözülecek yüzde dizileri dosya adıdır.
    let decoded = percent_decode_str(rel).decode_utf8().map_err(|_| StatusCode::FORBIDDEN)?;
    let rel = decoded.as_ref();
    let nested_trailing_slash = rel.ends_with('/');
    let last_segment = rel.split('/').count() - 1;
    if rel.starts_with('/')
        || rel.contains('\\')
        || rel.contains(':')
        || rel.contains('\0')
        || rel.split('/').enumerate().any(|(index, part)| {
            let dots: String = part.chars().map(|ch| match ch {
                '\u{ff0e}' | '\u{2024}' | '\u{fe52}' => '.',
                _ => ch,
            }).collect();
            (part.is_empty() && !(nested_trailing_slash && index == last_segment)) || dots == "." || dots == ".."
        })
        || Path::new(rel).is_absolute()
    {
        return Err(StatusCode::FORBIDDEN);
    }
    if nested_trailing_slash {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(NoteRequest { id, relative: PathBuf::from(rel) })
}


fn serve_bridge(method: &str) -> Served {
    if method != "GET" && method != "HEAD" {
        let mut response = Served::new(StatusCode::METHOD_NOT_ALLOWED);
        response.header("Allow", "GET, HEAD");
        return response;
    }
    let mut response = Served::new(StatusCode::OK);
    response.header("Content-Type", "application/javascript; charset=utf-8");
    response.header("Content-Length", BRIDGE_JS.len().to_string());
    if method == "GET" {
        response.body = BRIDGE_JS.as_bytes().to_vec();
    }
    response
}


fn fallback_position(html: &str) -> usize {
    let mut position = if html.starts_with('\u{feff}') { '\u{feff}'.len_utf8() } else { 0 };
    let rest = &html[position..];
    if rest.get(..9).is_some_and(|prefix| prefix.eq_ignore_ascii_case("<!doctype")) {
        if let Some(end) = rest.find('>') {
            position += end + 1;
        }
    }
    position
}

fn inject_bridge(body: &[u8]) -> Vec<u8> {
    let html = String::from_utf8_lossy(body);
    let found_head = Rc::new(Cell::new(false));
    let matched = Rc::clone(&found_head);
    let rewritten = rewrite_str(
        &html,
        Settings {
            element_content_handlers: vec![element!("head", move |head| {
                matched.set(true);
                head.prepend(BRIDGE_TAG, lol_html::html_content::ContentType::Html);
                Ok(())
            })],
            ..Settings::default()
        },
    );
    if found_head.get() {
        if let Ok(result) = rewritten {
            return result.into_bytes();
        }
    }
    // Head eksik veya HTML bozuksa BOM/DOCTYPE sonrasına ekle.
    let position = fallback_position(&html);
    let mut result = html.into_owned();
    result.insert_str(position, BRIDGE_TAG);
    result.into_bytes()
}

fn parse_request(method: &str, path: &str) -> Result<NoteRequest, StatusCode> {
    if method != "GET" && method != "HEAD" {
        return Err(StatusCode::METHOD_NOT_ALLOWED);
    }
    parse_note_path(path)
}

fn resolve_file(note_dir: &Path, relative: &Path) -> Result<PathBuf, StatusCode> {
    let root = note_dir.canonicalize().map_err(|_| StatusCode::NOT_FOUND)?;
    let candidate = root.join(relative);
    let file = candidate.canonicalize().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            StatusCode::NOT_FOUND
        } else {
            StatusCode::FORBIDDEN
        }
    })?;
    if !file.starts_with(&root) {
        return Err(StatusCode::FORBIDDEN);
    }
    if !file.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(file)
}

fn parse_range(value: &str, len: u64) -> Result<(u64, u64), ()> {
    let first = value.strip_prefix("bytes=").ok_or(())?.split(',').next().ok_or(())?.trim();
    let (start, end) = first.split_once('-').ok_or(())?;
    if len == 0 {
        return Err(());
    }
    if start.is_empty() {
        let suffix: u64 = end.parse().map_err(|_| ())?;
        if suffix == 0 {
            return Err(());
        }
        return Ok((len.saturating_sub(suffix), len - 1));
    }
    let start: u64 = start.parse().map_err(|_| ())?;
    let end: u64 = if end.is_empty() { len - 1 } else { end.parse().map_err(|_| ())? };
    if start >= len || end < start {
        return Err(());
    }
    Ok((start, end.min(len - 1)))
}

fn serve(method: &str, note_dir: &Path, relative: &Path, range: Option<&str>) -> Served {
    if method != "GET" && method != "HEAD" {
        let mut response = Served::new(StatusCode::METHOD_NOT_ALLOWED);
        response.header("Allow", "GET, HEAD");
        return response;
    }
    let file_path = match resolve_file(note_dir, relative) {
        Ok(path) => path,
        Err(status) => return Served::new(status),
    };
    let mut file = match File::open(&file_path) {
        Ok(file) => file,
        Err(_) => return Served::new(StatusCode::NOT_FOUND),
    };
    let len = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => return Served::new(StatusCode::NOT_FOUND),
    };
    let mime = mime_guess::from_path(&file_path).first_or_octet_stream();
    let is_html = mime.essence_str() == "text/html";
    if is_html {
        let mut body = Vec::new();
        if file.read_to_end(&mut body).is_err() {
            return Served::new(StatusCode::NOT_FOUND);
        }
        let injected = inject_bridge(&body);
        let mut response = Served::new(StatusCode::OK);
        response.header("Content-Type", "text/html; charset=utf-8");
        response.header("Content-Length", injected.len().to_string());
        if method == "GET" {
            response.body = injected;
        }
        return response;
    }
    let selected = match range {
        Some(value) => match parse_range(value, len) {
            Ok(selected) => Some(selected),
            Err(()) => {
                let mut response = Served::new(StatusCode::RANGE_NOT_SATISFIABLE);
                response.header("Content-Range", format!("bytes */{len}"));
                return response;
            }
        },
        None => None,
    };
    let mut response = Served::new(if selected.is_some() { StatusCode::PARTIAL_CONTENT } else { StatusCode::OK });
    let mut content_type = mime.essence_str().to_string();
    if matches!(content_type.as_str(), "text/html" | "text/css" | "text/javascript" | "application/javascript") {
        content_type.push_str("; charset=utf-8");
    }
    response.header("Content-Type", content_type);
    let (start, size) = if let Some((start, end)) = selected {
        response.header("Content-Range", format!("bytes {start}-{end}/{len}"));
        (start, end - start + 1)
    } else {
        (0, len)
    };
    response.header("Content-Length", size.to_string());
    if method == "HEAD" {
        return response;
    }
    if file.seek(SeekFrom::Start(start)).is_err() {
        return Served::new(StatusCode::NOT_FOUND);
    }
    // Tauri Vec gövdesi ister; aralıklar yalnızca istenen baytları okur.
    if file.take(size).read_to_end(&mut response.body).is_err() {
        return Served::new(StatusCode::NOT_FOUND);
    }
    response
}

pub(crate) fn handle(method: &str, path: &str, range: Option<&str>, note_index: &Arc<RwLock<NoteIndex>>) -> Served {
    if path == "/__htnote/bridge.js" {
        return serve_bridge(method);
    }
    let parsed = parse_request(method, path);
    let note_dir = match &parsed {
        Ok(parsed) => {
            note_index.read().ok().and_then(|index| index.resolve(parsed.id))
        }
        Err(_) => None,
    };
        if parsed.as_ref().err() == Some(&StatusCode::METHOD_NOT_ALLOWED) {
            let mut response = Served::new(StatusCode::METHOD_NOT_ALLOWED);
            response.header("Allow", "GET, HEAD");
            response
        } else {
            match (parsed, note_dir) {
                (Err(status), _) => Served::new(status),
                (Ok(_), None) => Served::new(StatusCode::NOT_FOUND),
                (Ok(parsed), Some(dir)) => serve(method, &dir, &parsed.relative, range),
            }
        }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "123e4567-e89b-12d3-a456-426614174000";

    #[test]
    fn rejects_traversal_and_unsupported_methods() {
        for segment in ["..", "%2e%2e", ".%2e", "%2e."] {
            assert_eq!(parse_request("GET", &format!("/{ID}/{segment}/index.html")).err(), Some(StatusCode::FORBIDDEN));
        }
        assert_eq!(parse_request("POST", &format!("/{ID}/index.html")).err(), Some(StatusCode::METHOD_NOT_ALLOWED));
    }

    #[test]
    fn paths_and_attacks() {
        for path in [format!("/{ID}"), format!("/{ID}/"), format!("/{ID}/assets/x.png")] {
            assert!(parse_note_path(&path).is_ok(), "{path}");
        }
        assert_eq!(parse_note_path(&format!("/{ID}")).unwrap().relative, Path::new("index.html"));
        assert_eq!(parse_note_path(&format!("/{ID}/")).unwrap().relative, Path::new("index.html"));
        assert_eq!(parse_note_path(&format!("/{ID}/assets/")).err(), Some(StatusCode::NOT_FOUND));
        for path in ["../other/index.html", "%2e%2e/other", "..%5c..%5cWindows", "%2fabs", "C:/x", "%5c%5c%3f%5c", "a//b", "a/%00"] {
            assert_eq!(parse_note_path(&format!("/{ID}/{path}")).err(), Some(StatusCode::FORBIDDEN), "{path}");
        }
        assert_eq!(parse_note_path(&format!("/{ID}/assets//")).err(), Some(StatusCode::FORBIDDEN));
        assert_eq!(parse_note_path(&format!("/{ID}/../")).err(), Some(StatusCode::FORBIDDEN));
        assert_eq!(parse_note_path(&format!("/{ID}/%252e%252e")).unwrap().relative, Path::new("%2e%2e"));
        assert_eq!(parse_note_path(&format!("/{ID}/．．/x")).err(), Some(StatusCode::FORBIDDEN));
        assert_eq!(parse_note_path("/unknown/x").err(), Some(StatusCode::NOT_FOUND));
    }

    #[test]
    fn ranges() {
        for (value, expected) in [("bytes=2-4", (2, 4)), ("bytes=2-", (2, 9)), ("bytes=-3", (7, 9)), ("bytes=8-100", (8, 9)), ("bytes=0-1,4-5", (0, 1))] {
            assert_eq!(parse_range(value, 10), Ok(expected));
        }
        for value in ["bytes=10-", "bytes=4-2", "bytes=-0", "bytes=x-y", "items=0-1"] {
            assert_eq!(parse_range(value, 10), Err(()));
        }
    }

    #[test]
    fn serves_files_and_headers() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("asset.txt"), "abcdef").unwrap();
        let full = serve("GET", dir.path(), Path::new("asset.txt"), None);
        assert_eq!(full.status, StatusCode::OK);
        assert_eq!(full.body, b"abcdef");
        assert!(full.headers.contains(&("Content-Type", "text/plain".into())));
        for (name, value) in [("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"), ("Accept-Ranges", "bytes")] {
            assert!(full.headers.contains(&(name, value.into())));
        }
        let partial = serve("GET", dir.path(), Path::new("asset.txt"), Some("bytes=2-3"));
        assert_eq!(partial.status, StatusCode::PARTIAL_CONTENT);
        assert_eq!(partial.body, b"cd");
        assert!(partial.headers.contains(&("Content-Range", "bytes 2-3/6".into())));
        assert!(partial.headers.contains(&("Accept-Ranges", "bytes".into())));
        assert!(serve("HEAD", dir.path(), Path::new("asset.txt"), None).body.is_empty());
        assert_eq!(serve("POST", dir.path(), Path::new("asset.txt"), None).status, StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(serve("GET", dir.path(), Path::new("missing"), None).status, StatusCode::NOT_FOUND);
        let invalid_range = serve("GET", dir.path(), Path::new("asset.txt"), Some("bytes=20-"));
        assert_eq!(invalid_range.status, StatusCode::RANGE_NOT_SATISFIABLE);
        assert!(invalid_range.headers.contains(&("Accept-Ranges", "bytes".into())));
    }

    #[test]
    fn injects_before_head_content_and_after_document_prefix() {
        for input in [
            "<html><head><script>user()</script></head></html>",
            "<!DOCTYPE html><html><head><title>T</title></head></html>",
            "<HTML><HEAD><SCRIPT>user()</SCRIPT></HEAD></HTML>",
            "<!-- <head><script>fake()</script></head> --><html><head><script>user()</script></head></html>",
        ] {
            let result = String::from_utf8(inject_bridge(input.as_bytes())).unwrap();
            let head_end = result.to_ascii_lowercase().rfind("<head>").unwrap() + 6;
            assert!(result[head_end..].starts_with(BRIDGE_TAG));
        }
        for (input, prefix) in [
            ("<html><body>hi</body></html>", ""),
            ("<!DOCTYPE html><body>hi</body>", "<!DOCTYPE html>"),
            ("\u{feff}<!DOCTYPE html><body>hi</body>", "\u{feff}<!DOCTYPE html>"),
        ] {
            let result = String::from_utf8(inject_bridge(input.as_bytes())).unwrap();
            assert!(result.starts_with(&format!("{prefix}{BRIDGE_TAG}")));
        }
    }

    #[test]
    fn serves_bridge_and_full_html_for_ranges() {
        let bridge = serve_bridge("GET");
        assert_eq!(bridge.status, StatusCode::OK);
        assert_eq!(bridge.body, BRIDGE_JS.as_bytes());
        assert!(bridge.headers.contains(&("Content-Type", "application/javascript; charset=utf-8".into())));
        assert!(bridge.headers.contains(&("X-Content-Type-Options", "nosniff".into())));
        assert!(serve_bridge("HEAD").body.is_empty());
        assert_eq!(serve_bridge("POST").status, StatusCode::METHOD_NOT_ALLOWED);
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), "<head><title>T</title></head>").unwrap();
        let served = serve("GET", dir.path(), Path::new("index.html"), Some("bytes=0-2"));
        assert_eq!(served.status, StatusCode::OK);
        assert!(String::from_utf8(served.body).unwrap().contains(BRIDGE_TAG));
        assert!(!served.headers.iter().any(|(name, _)| *name == "Content-Range"));
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), "hidden").unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret"), dir.path().join("link")).unwrap();
        assert_eq!(serve("GET", dir.path(), Path::new("link"), None).status, StatusCode::FORBIDDEN);
    }

    #[cfg(windows)]
    #[test]
    fn symlink_escape_when_permitted() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), "hidden").unwrap();
        if std::os::windows::fs::symlink_file(outside.path().join("secret"), dir.path().join("link")).is_ok() {
            assert_eq!(serve("GET", dir.path(), Path::new("link"), None).status, StatusCode::FORBIDDEN);
        }
    }
}

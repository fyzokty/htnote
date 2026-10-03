use std::sync::{Arc, RwLock};
use std::thread;

use tauri::http::StatusCode;
use tiny_http::{Header, Request, Response, Server};

use crate::error::AppError;
use crate::index::note_index::NoteIndex;
use crate::protocol::{self, Served};
use crate::state::PreviewDrafts;

pub fn start(note_index: Arc<RwLock<NoteIndex>>, preview_drafts: PreviewDrafts) -> Result<String, AppError> {
    let server = Arc::new(Server::http("127.0.0.1:0")
        .map_err(|error| AppError::Internal(error.to_string()))?);
    let port = server.server_addr().to_ip()
        .ok_or_else(|| AppError::Internal("Loopback address unavailable".into()))?.port();
    let host = format!("127.0.0.1:{port}");
    for _ in 0..4 {
        let server = Arc::clone(&server);
        let index = Arc::clone(&note_index);
        let drafts = Arc::clone(&preview_drafts);
        let host = host.clone();
        thread::Builder::new().name("htnote-note-http".into()).spawn(move || {
            for request in server.incoming_requests() {
                respond(request, &host, &index, &drafts);
            }
        }).map_err(|error| AppError::Internal(error.to_string()))?;
    }
    Ok(format!("http://{host}"))
}

fn respond(request: Request, host: &str, index: &Arc<RwLock<NoteIndex>>, drafts: &PreviewDrafts) {
    // DNS yeniden bağlama için Host tam olarak dinlenen adresle eşleşmelidir.
    let valid_host = request.headers().iter()
        .filter(|header| header.field.equiv("Host"))
        .map(|header| header.value.as_str())
        .collect::<Vec<_>>();
    let served = if valid_host.as_slice() != [host] {
        Served::new(StatusCode::FORBIDDEN)
    } else {
        let path = request.url().split('?').next().unwrap_or("");
        let range = request.headers().iter().find(|header| header.field.equiv("Range"))
            .map(|header| header.value.as_str());
        protocol::handle(request.method().as_str(), path, range, index, drafts)
    };
    let mut response = Response::from_data(served.body)
        .with_status_code(served.status.as_u16() as i32);
    for (name, value) in served.headers {
        if let Ok(header) = Header::from_bytes(name.as_bytes(), value.as_bytes()) {
            response.add_header(header);
        }
    }
    let _ = request.respond(response);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use crate::notes::model::{write_metadata_atomic, NoteMetadata};

    fn request(origin: &str, host: &str, method: &str, path: &str, range: Option<&str>) -> (u16, String) {
        let address = origin.strip_prefix("http://").unwrap();
        let mut socket = TcpStream::connect(address).unwrap();
        socket.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
        let range = range.map(|value| format!("Range: {value}\r\n")).unwrap_or_default();
        write!(socket, "{method} {path} HTTP/1.1\r\nHost: {host}\r\n{range}Connection: close\r\n\r\n").unwrap();
        let mut data = String::new();
        socket.read_to_string(&mut data).unwrap();
        let status = data.split_whitespace().nth(1).unwrap().parse().unwrap();
        (status, data)
    }

    #[test]
    fn serves_index_range_and_rejects_unsafe_requests() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("Note");
        std::fs::create_dir(&dir).unwrap();
        let metadata = NoteMetadata::new("Note");
        write_metadata_atomic(&dir.join("metadata.json"), &metadata).unwrap();
        std::fs::write(dir.join("index.html"), "<head></head><body>ok</body>").unwrap();
        std::fs::write(dir.join("audio.bin"), "abcdef").unwrap();
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path d=\"M0 0h32v32H0z\"/></svg>";
        std::fs::write(dir.join("diagram.svg"), svg).unwrap();
        std::fs::write(dir.join("asset.txt"), "disk asset").unwrap();
        let mut index = NoteIndex::new(root.path().to_path_buf());
        index.refresh_readonly().unwrap();
        let drafts: PreviewDrafts = Arc::new(std::sync::Mutex::new(Default::default()));
        drafts.lock().unwrap().insert(metadata.id, crate::state::PreviewDraft {
            rev: 1, html: "<head></head><body>preview</body>".into(),
            css: "body { color: red }".into(), js: "window.preview = true".into(),
        });
        let origin = start(Arc::new(RwLock::new(index)), drafts).unwrap();
        let host = origin.strip_prefix("http://").unwrap();
        let id = metadata.id;
        let (status, body) = request(&origin, host, "GET", &format!("/{id}/"), None);
        assert_eq!(status, 200);
        assert!(body.contains("/__htnote/bridge.js"));
        let (head_status, head_response) = request(&origin, host, "HEAD", &format!("/{id}/"), None);
        assert_eq!(head_status, 200);
        assert_eq!(head_response.split_once("\r\n\r\n").unwrap().1, "");
        assert_eq!(request(&origin, host, "GET", &format!("/{id}/audio.bin"), Some("bytes=1-2")).0, 206);
        let (svg_status, svg_response) = request(&origin, host, "GET", &format!("/{id}/diagram.svg"), None);
        assert_eq!(svg_status, 200);
        assert!(svg_response.to_ascii_lowercase().contains("content-type: image/svg+xml"));
        assert_eq!(svg_response.split_once("\r\n\r\n").unwrap().1, svg);
        assert_eq!(request(&origin, host, "GET", &format!("/{id}/%2e%2e/x"), None).0, 403);
        assert_eq!(request(&origin, "evil.localhost", "GET", &format!("/{id}/"), None).0, 403);
        assert_eq!(request(&origin, "evil.localhost", "GET", &format!("/{id}/__draft/1/index.html"), None).0, 403);
        assert!(request(&origin, host, "GET", &format!("/{id}/__draft/1/index.html"), None).1.contains("preview"));
        let preview = request(&origin, host, "GET", &format!("/{id}/__draft/1/index.html"), None).1;
        assert!(preview.contains("./style.css"));
        assert!(preview.contains("./script.js"));
        assert!(request(&origin, host, "GET", &format!("/{id}/__draft/1/style.css"), None).1.contains("body { color: red }"));
        assert!(request(&origin, host, "GET", &format!("/{id}/__draft/1/script.js"), None).1.contains("window.preview = true"));
        assert!(request(&origin, host, "GET", &format!("/{id}/__draft/1/asset.txt"), None).1.contains("disk asset"));
        assert_eq!(request(&origin, host, "GET", "/00000000-0000-4000-8000-000000000000/", None).0, 404);
        assert_eq!(request(&origin, host, "POST", &format!("/{id}/"), None).0, 405);
        assert_eq!(request(&origin, host, "GET", "/__htnote/bridge.js", None).0, 200);
    }
}

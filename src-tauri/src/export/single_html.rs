use std::cell::RefCell;
use std::fs;
use std::path::Path;
use std::rc::Rc;

use base64::Engine;
use lol_html::html_content::ContentType;
use lol_html::{element, rewrite_str, text, Settings};
use percent_encoding::percent_decode_str;

use crate::error::AppError;
use crate::index::resolve_in_root;

const OUTPUT_LIMIT: usize = 20 * 1024 * 1024;

pub struct BuiltHtml {
    pub html: String,
    pub warnings: Vec<String>,
}

pub fn build_single_html(note_dir: &Path) -> Result<BuiltHtml, AppError> {
    build_single_html_with_limit(note_dir, OUTPUT_LIMIT)
}

fn build_single_html_with_limit(note_dir: &Path, limit: usize) -> Result<BuiltHtml, AppError> {
    let html = fs::read_to_string(note_dir.join("index.html"))?;
    let context = Rc::new(RefCell::new(Context { note_dir, warnings: Vec::new() }));
    let style_context = Rc::clone(&context);
    let script_context = Rc::clone(&context);
    let asset_context = Rc::clone(&context);
    let attribute_context = Rc::clone(&context);
    let css_context = Rc::clone(&context);
    let inline_style_context = Rc::clone(&context);
    let style_buffer = Rc::new(RefCell::new(String::new()));
    let rewritten = rewrite_str(&html, Settings {
        element_content_handlers: vec![
            element!("link[href]", move |el| {
                let href = el.get_attribute("href").unwrap_or_default();
                let rel = el.get_attribute("rel").unwrap_or_default();
                if rel.split_ascii_whitespace().any(|part| part.eq_ignore_ascii_case("stylesheet")) && href == "./style.css" {
                    let css = style_context.borrow_mut().read_managed("./style.css");
                    if let Some(css) = css {
                        let css = rewrite_css(&css, &mut style_context.borrow_mut());
                        el.replace(&format!("<style>{}</style>", escape_end_tag(&css, "style")), ContentType::Html);
                    }
                } else if rel.split_ascii_whitespace().any(|part| part.eq_ignore_ascii_case("icon")) {
                    let value = asset_context.borrow_mut().embed(&href);
                    if value != href { el.set_attribute("href", &value)?; }
                }
                Ok(())
            }),
            element!("script[src]", move |el| {
                if el.get_attribute("src").as_deref() == Some("./script.js") {
                    let js = script_context.borrow_mut().read_managed("./script.js");
                    if let Some(js) = js {
                        el.remove_attribute("src");
                        el.set_inner_content(&escape_end_tag(&js, "script"), ContentType::Html);
                    }
                }
                Ok(())
            }),
            element!("img, audio, video, source", move |el| {
                let tag = el.tag_name();
                let attributes: &[&str] = match tag.as_str() {
                    "img" => &["src", "srcset"],
                    "video" => &["src", "poster"],
                    _ => &["src"],
                };
                for attribute in attributes {
                    if let Some(value) = el.get_attribute(attribute) {
                        let rewritten = if *attribute == "srcset" {
                            rewrite_srcset(&value, &mut attribute_context.borrow_mut())
                        } else {
                            attribute_context.borrow_mut().embed(&value)
                        };
                        if rewritten != value { el.set_attribute(attribute, &rewritten)?; }
                    }
                }
                Ok(())
            }),
            element!("[style]", move |el| {
                if let Some(style) = el.get_attribute("style") {
                    let rewritten = rewrite_css(&style, &mut css_context.borrow_mut());
                    if rewritten != style { el.set_attribute("style", &rewritten)?; }
                }
                Ok(())
            }),
            text!("style", move |chunk| {
            // lol_html metni parçalara ayırabilir; son parçada bütün CSS'i işleriz.
            let mut buffer = style_buffer.borrow_mut();
            buffer.push_str(chunk.as_str());
            if chunk.last_in_text_node() {
                let rewritten = rewrite_css(&buffer, &mut inline_style_context.borrow_mut());
                chunk.replace(&escape_end_tag(&rewritten, "style"), ContentType::Html);
                buffer.clear();
            } else {
                chunk.remove();
            }
            Ok(())
            }),
        ],
        ..Settings::default()
    }).map_err(|error| AppError::Internal(error.to_string()))?;
    let mut warnings = context.borrow().warnings.clone();
    if rewritten.len() > limit { warnings.push("LARGE_OUTPUT".into()); }
    Ok(BuiltHtml { html: rewritten, warnings })
}

struct Context<'a> {
    note_dir: &'a Path,
    warnings: Vec<String>,
}

impl Context<'_> {
    fn read_managed(&mut self, reference: &str) -> Option<String> {
        let path = resolve_in_root(self.note_dir, reference).ok()?;
        match fs::read_to_string(path) {
            Ok(content) => Some(content),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.warn_missing(reference);
                None
            }
            Err(_) => None,
        }
    }

    fn warn_missing(&mut self, reference: &str) {
        let warning = format!("MISSING_ASSET:{reference}");
        if !self.warnings.contains(&warning) { self.warnings.push(warning); }
    }

    fn embed(&mut self, reference: &str) -> String {
        let value = reference.trim();
        if value.is_empty() || value.starts_with(['/', '\\', '#']) || value.starts_with("//")
            || value.split('/').next().is_some_and(|part| part.contains(':'))
        {
            return reference.into();
        }
        let path = value.split(['?', '#']).next().unwrap_or(value);
        let Ok(decoded) = percent_decode_str(path).decode_utf8() else { return reference.into() };
        let Ok(resolved) = resolve_in_root(self.note_dir, &decoded) else { return reference.into() };
        match fs::read(&resolved) {
            Ok(bytes) => {
                let mime = mime_guess::from_path(&resolved).first_or_octet_stream();
                format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.warn_missing(reference);
                reference.into()
            }
            Err(_) => reference.into(),
        }
    }
}

fn escape_end_tag(value: &str, tag: &str) -> String {
    let needle = format!("</{tag}");
    let mut output = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(index) = rest.to_ascii_lowercase().find(&needle) {
        output.push_str(&rest[..index]);
        output.push_str("<\\/");
        rest = &rest[index + 2..];
    }
    output.push_str(rest);
    output
}

fn rewrite_srcset(value: &str, context: &mut Context<'_>) -> String {
    value.split(',').map(|candidate| {
        let trimmed = candidate.trim_start();
        let leading = &candidate[..candidate.len() - trimmed.len()];
        let end = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
        format!("{leading}{}{}", context.embed(&trimmed[..end]), &trimmed[end..])
    }).collect::<Vec<_>>().join(",")
}

fn rewrite_css(css: &str, context: &mut Context<'_>) -> String {
    let bytes = css.as_bytes();
    let mut output = String::with_capacity(css.len());
    let mut copy_from = 0;
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index..].starts_with(b"/*") {
            index += 2;
            while index + 1 < bytes.len() && !bytes[index..].starts_with(b"*/") { index += 1; }
            index = (index + 2).min(bytes.len());
            continue;
        }
        if bytes[index] == b'\'' || bytes[index] == b'"' {
            let quote = bytes[index];
            index += 1;
            while index < bytes.len() {
                if bytes[index] == b'\\' { index = (index + 2).min(bytes.len()); }
                else if bytes[index] == quote { index += 1; break; }
                else { index += 1; }
            }
            continue;
        }
        if index + 4 > bytes.len() || !bytes[index..index + 4].eq_ignore_ascii_case(b"url(")
            || (index > 0 && (bytes[index - 1].is_ascii_alphanumeric() || bytes[index - 1] == b'-')) {
            index += 1;
            continue;
        }
        let start = index + 4;
        let mut cursor = start;
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() { cursor += 1; }
        let quote = if cursor < bytes.len() && (bytes[cursor] == b'\'' || bytes[cursor] == b'"') {
            let found = bytes[cursor]; cursor += 1; Some(found)
        } else { None };
        let value_start = cursor;
        while cursor < bytes.len() {
            if bytes[cursor] == b'\\' { cursor = (cursor + 2).min(bytes.len()); }
            else if quote.is_some_and(|q| bytes[cursor] == q) || (quote.is_none() && bytes[cursor] == b')') { break; }
            else { cursor += 1; }
        }
        let value_end = if quote.is_none() {
            let mut end = cursor;
            while end > value_start && bytes[end - 1].is_ascii_whitespace() { end -= 1; }
            end
        } else { cursor };
        if let Some(q) = quote {
            if cursor >= bytes.len() || bytes[cursor] != q { index = cursor; continue; }
            cursor += 1;
            while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() { cursor += 1; }
        }
        if cursor >= bytes.len() || bytes[cursor] != b')' { index = cursor; continue; }
        let reference = &css[value_start..value_end];
        let embedded = context.embed(reference);
        if embedded != reference {
            output.push_str(&css[copy_from..value_start]);
            output.push_str(&embedded);
            copy_from = value_end;
        }
        index = cursor + 1;
    }
    output.push_str(&css[copy_from..]);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_all_local_references_and_warnings() {
        let root = tempfile::tempdir().unwrap();
        let note = root.path().join("note");
        fs::create_dir(&note).unwrap();
        fs::write(root.path().join("outside.png"), b"secret").unwrap();
        fs::write(note.join("a.png"), b"png").unwrap();
        fs::write(note.join("sound.mp3"), b"mp3").unwrap();
        fs::write(note.join("style.css"), "x{background:url('a.png')} y{background:url(a.png)} z{background:url(data:image/png;base64,AA)} q{background:url(https://example.com/a.png)} /* url(missing-comment.png) */").unwrap();
        fs::write(note.join("script.js"), "const x = '</script>'; console.log(x);").unwrap();
        fs::write(note.join("index.html"), r#"<!doctype html><html><head><link rel="stylesheet" href="./style.css"><link rel="icon" href="a.png"><style>b{background:url("a.png")}</style></head><body><img src="a.png" srcset="a.png 1x, a.png 2x"><audio src="sound.mp3"></audio><video src="a.png" poster="a.png"><source src="sound.mp3"></video><div style="background:url(a.png)"></div><img src="a.png?size=1#preview"><img src="missing.png"><img src="../outside.png"><img src="%2e%2e/outside.png"><img src="htnote://note/id"><script src="./script.js"></script></body></html>"#).unwrap();
        let built = build_single_html_with_limit(&note, 10).unwrap();
        assert!(built.html.contains("<style>"));
        assert!(!built.html.contains("./style.css"));
        assert!(!built.html.contains("./script.js"));
        assert!(built.html.contains("<\\/script>"));
        assert!(built.html.matches("data:image/png;base64,cG5n").count() >= 8);
        assert!(built.html.contains("data:audio/mpeg;base64,bXAz"));
        assert!(built.html.contains("url(data:image/png;base64,AA)"));
        assert!(built.html.contains("url(https://example.com/a.png)"));
        assert!(!built.warnings.iter().any(|warning| warning.contains("missing-comment")));
        assert!(built.html.contains("../outside.png"));
        assert!(built.html.contains("%2e%2e/outside.png"));
        assert!(!built.html.contains("c2VjcmV0"));
        assert!(built.html.contains("htnote://note/id"));
        assert!(built.html.contains("missing.png"));
        assert!(built.warnings.contains(&"MISSING_ASSET:missing.png".into()));
        assert!(built.warnings.contains(&"LARGE_OUTPUT".into()));
    }
}

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use chrono::SecondsFormat;
use lol_html::html_content::ContentType;
use lol_html::{element, end, end_tag, rewrite_str, Settings};

use super::model::NoteMetadata;

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn metadata_values(meta: &NoteMetadata) -> [(&'static str, String); 3] {
    [
        (
            "htnote-created-at",
            meta.created_at.to_rfc3339_opts(SecondsFormat::Millis, true),
        ),
        (
            "htnote-updated-at",
            meta.updated_at.to_rfc3339_opts(SecondsFormat::Millis, true),
        ),
        ("htnote-tags", meta.tags.join(", ")),
    ]
}

fn meta_tags(meta: &NoteMetadata) -> String {
    metadata_values(meta)
        .iter()
        .map(|(name, value)| format!("<meta name=\"{name}\" content=\"{}\">", escape_html(value)))
        .collect::<Vec<_>>()
        .join("\n    ")
}

pub fn render_new_note_html(meta: &NoteMetadata) -> String {
    render_note_template(include_str!("../../templates/note.html"), meta)
}

// Only built-in templates are expanded; existing notes keep their original bytes.
pub fn render_note_template(template: &str, meta: &NoteMetadata) -> String {
    template
        .trim_end()
        .split("{{HTNOTE_METADATA}}")
        .map(|part| part.replace("{{HTNOTE_TITLE}}", &escape_html(&meta.title)))
        .collect::<Vec<_>>()
        .join(&meta_tags(meta))
}

#[derive(Default)]
struct Found {
    html: bool,
    head: bool,
    body: bool,
    title: bool,
    meta: [bool; 3],
    css: bool,
}

fn scan(html: &str) -> Found {
    let found = Rc::new(RefCell::new(Found::default()));
    let html_found = Rc::clone(&found);
    let head_found = Rc::clone(&found);
    let body_found = Rc::clone(&found);
    let title_found = Rc::clone(&found);
    let meta_found = Rc::clone(&found);
    let css_found = Rc::clone(&found);
    if let Err(error) = rewrite_str(
        html,
        Settings {
            element_content_handlers: vec![
                element!("html", move |_| { html_found.borrow_mut().html = true; Ok(()) }),
                element!("head", move |_| { head_found.borrow_mut().head = true; Ok(()) }),
                element!("body", move |_| { body_found.borrow_mut().body = true; Ok(()) }),
                element!("head title", move |_| { title_found.borrow_mut().title = true; Ok(()) }),
                element!("head meta[name]", move |el| {
                    let mut found = meta_found.borrow_mut();
                    for (index, name) in ["htnote-created-at", "htnote-updated-at", "htnote-tags"].iter().enumerate() {
                        if el.get_attribute("name").as_deref() == Some(*name) {
                            found.meta[index] = true;
                        }
                    }
                    Ok(())
                }),
                element!("head link[href]", move |el| {
                    if el.get_attribute("href").as_deref() == Some("./style.css") {
                        css_found.borrow_mut().css = true;
                    }
                    Ok(())
                }),
            ],
            ..Settings::default()
        },
    ) {
        panic!("HTML taraması başarısız: {error}");
    }
    Rc::try_unwrap(found).unwrap_or_else(|_| unreachable!()).into_inner()
}

pub fn sync_head(html: &str, meta: &NoteMetadata, has_css: bool, has_js: bool) -> String {
    let found = scan(html);
    if !found.html {
        let wrapped = if found.body {
            format!("<!DOCTYPE html>\n<html lang=\"tr\">\n{html}\n</html>")
        } else {
            format!("<!DOCTYPE html>\n<html lang=\"tr\">\n<head></head>\n<body>{html}</body>\n</html>")
        };
        return sync_head(&wrapped, meta, has_css, has_js);
    }
    if !found.head || !found.body {
        let add_head = !found.head;
        let add_body = !found.body;
        let repaired = rewrite_str(
            html,
            Settings {
                element_content_handlers: vec![
                    element!("html", move |el| {
                        if add_head {
                            let prefix = if add_body { "<head></head><body>" } else { "<head></head>" };
                            el.prepend(prefix, ContentType::Html);
                        }
                        if add_body {
                            el.append("</body>", ContentType::Html);
                        }
                        Ok(())
                    }),
                    element!("head", move |el| {
                        if add_body && !add_head {
                            el.after("<body>", ContentType::Html);
                        }
                        Ok(())
                    }),
                ],
                ..Settings::default()
            },
        )
        .unwrap_or_else(|error| panic!("HTML iskeleti oluşturulamadı: {error}"));
        return sync_head(&repaired, meta, has_css, has_js);
    }

    let values = metadata_values(meta);
    let mut missing = String::new();
    if !found.title {
        missing.push_str(&format!("\n  <title>{}</title>", escape_html(&meta.title)));
    }
    for (index, (name, value)) in values.iter().enumerate() {
        if !found.meta[index] {
            missing.push_str(&format!("\n  <meta name=\"{name}\" content=\"{}\">", escape_html(value)));
        }
    }
    if has_css && !found.css {
        missing.push_str("\n  <link rel=\"stylesheet\" href=\"./style.css\">");
    }
    let title = escape_html(&meta.title);
    let mut seen_title = false;
    let mut seen_meta = [false; 3];
    let mut seen_css = false;
    let script_inserted = Rc::new(Cell::new(false));
    let script_inserted_at_body_end = Rc::clone(&script_inserted);
    let script_inserted_at_document_end = Rc::clone(&script_inserted);
    let main_depth = Rc::new(Cell::new(0usize));
    let main_depth_for_main = Rc::clone(&main_depth);
    let main_depth_for_script = Rc::clone(&main_depth);
    rewrite_str(
        html,
        Settings {
            element_content_handlers: vec![
                element!("head", move |el| {
                    if !missing.is_empty() {
                        el.append(&missing, ContentType::Html);
                    }
                    Ok(())
                }),
                element!("head title", move |el| {
                    if seen_title {
                        el.remove();
                    } else {
                        seen_title = true;
                        el.set_inner_content(&title, ContentType::Html);
                    }
                    Ok(())
                }),
                element!("head meta[name]", move |el| {
                    for (index, (name, value)) in values.iter().enumerate() {
                        if el.get_attribute("name").as_deref() == Some(*name) {
                            if seen_meta[index] {
                                el.remove();
                            } else {
                                seen_meta[index] = true;
                                if el.get_attribute("content").as_deref() != Some(value.as_str()) {
                                    // lol_html set_attribute ham özel karakterleri kaçırmaz.
                                    el.set_attribute("content", &escape_html(value))?;
                                }
                            }
                            break;
                        }
                    }
                    Ok(())
                }),
                element!("head link[href]", move |el| {
                    if el.get_attribute("href").as_deref() == Some("./style.css") {
                        if !has_css || seen_css {
                            el.remove();
                        } else {
                            seen_css = true;
                            if el.get_attribute("rel").as_deref() != Some("stylesheet") {
                                el.set_attribute("rel", "stylesheet")?;
                            }
                        }
                    }
                    Ok(())
                }),
                element!("main", move |el| {
                    main_depth_for_main.set(main_depth_for_main.get() + 1);
                    let depth = Rc::clone(&main_depth_for_main);
                    el.on_end_tag(end_tag!(move |_| {
                        depth.set(depth.get() - 1);
                        Ok(())
                    }))
                }),
                element!("script[src]", move |el| {
                    if main_depth_for_script.get() == 0
                        && el.get_attribute("src").as_deref() == Some("./script.js")
                    {
                        // İçerik dışındaki yönetilen script body sonunda yeniden oluşturulur.
                        el.remove();
                    }
                    Ok(())
                }),
                element!("body", move |el| {
                    let inserted = Rc::clone(&script_inserted_at_body_end);
                    el.on_end_tag(end_tag!(move |tag| {
                        if has_js && !inserted.get() {
                            tag.before("<script src=\"./script.js\"></script>", ContentType::Html);
                            inserted.set(true);
                        }
                        Ok(())
                    }))
                }),
            ],
            document_content_handlers: vec![end!(move |document_end| {
                // Kapanış etiketi yoksa script belge sonunda eklenir.
                if has_js && !script_inserted_at_document_end.get() {
                    document_end.append("<script src=\"./script.js\"></script>", ContentType::Html);
                }
                Ok(())
            })],
            ..Settings::default()
        },
    )
    .unwrap_or_else(|error| panic!("HTML head senkronizasyonu başarısız: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_meta() -> NoteMetadata {
        let mut meta = NoteMetadata::new("A <B> & \"C\"");
        meta.tags = vec!["rust".into(), "a<&\"".into()];
        meta
    }

    #[test]
    fn new_note_is_escaped_and_already_synchronized() {
        let meta = fixture_meta();
        let html = render_new_note_html(&meta);
        assert!(html.contains("<html lang=\"tr\">"));
        assert!(html.contains("<style data-htnote=\"base\">"));
        assert!(html.contains(":where(#htnote-content p) { margin: 0.3em 0; min-height: 1lh; }"));
        assert!(html.contains("<main id=\"htnote-content\">\n      <h1>A &lt;B&gt; &amp; &quot;C&quot;</h1>\n      <p></p>\n    </main>"));
        assert!(html.contains("content=\"rust, a&lt;&amp;&quot;\""));
        assert_eq!(sync_head(&html, &meta, false, false), html);
    }

    #[test]
    fn crlf_template_preserves_new_note_content_indentation() {
        let meta = fixture_meta();
        let template = include_str!("../../templates/note.html").replace("\r\n", "\n");
        let lf = render_note_template(&template, &meta);
        let crlf = render_note_template(&template.replace('\n', "\r\n"), &meta);
        assert!(crlf.contains("<main id=\"htnote-content\">\r\n      <h1>"));
        assert_eq!(crlf.replace("\r\n", "\n"), lf);
        assert_eq!(sync_head(&crlf, &meta, false, false), crlf);
    }

    #[test]
    fn new_note_uses_two_space_document_and_content_indentation() {
        let html = render_new_note_html(&NoteMetadata::new("Title"));
        assert!(html.starts_with("<!DOCTYPE html>\n<html lang=\"tr\">\n  <head>\n    <meta"));
        assert!(html.contains("\n  <body>\n    <main id=\"htnote-content\">\n      <h1>Title</h1>\n      <p></p>\n    </main>\n  </body>\n</html>"));
        assert!(!html.contains("{{HTNOTE_"));
    }

    #[test]
    fn full_document_preserves_unmanaged_bytes() {
        let meta = fixture_meta();
        let body = "<body>\n<main id='htnote-content'>  <!-- keep -->\n<script>if (a < b) { x = '&'; }</script>\n</main>\n<aside>outside</aside>\n</body>";
        let input = format!("<!DOCTYPE html>\n<html><head><!--head--><meta name='author' content='Me'><link rel='preconnect' href='https://example.com'><title>Old</title></head>{body}</html>");
        let output = sync_head(&input, &meta, false, false);
        assert!(output.contains(body));
        assert!(output.contains("<!--head--><meta name='author' content='Me'><link rel='preconnect' href='https://example.com'>"));
        assert!(output.contains("<title>A &lt;B&gt; &amp; &quot;C&quot;</title>"));
        assert_eq!(sync_head(&output, &meta, false, false), output);
    }

    #[test]
    fn headless_document_and_fragment_get_a_head() {
        let meta = fixture_meta();
        for input in [
            "<!DOCTYPE html><html><body><main><!-- body --><p>Hi</p></main></body></html>",
            "<main><!-- fragment --><p>Hi</p></main>",
        ] {
            let output = sync_head(input, &meta, false, false);
            assert!(output.contains("<head>"));
            assert!(output.contains("<title>A &lt;B&gt; &amp; &quot;C&quot;</title>"));
            assert!(output.contains("<main>"));
            assert_eq!(sync_head(&output, &meta, false, false), output);
        }
    }

    #[test]
    fn incomplete_html_places_existing_content_inside_body() {
        let meta = fixture_meta();
        for input in [
            "<html><main><!-- keep --><p>Hi</p></main></html>",
            "<html><head><meta name='author' content='Me'></head><main><!-- keep --><p>Hi</p></main></html>",
        ] {
            let output = sync_head(input, &meta, false, true);
            let head_end = output.find("</head>").unwrap();
            let body_start = output.find("<body>").unwrap();
            let content_start = output.find("<main><!-- keep --><p>Hi</p></main>").unwrap();
            let script_start = output.find("<script src=\"./script.js\"></script>").unwrap();
            let body_end = output.find("</body>").unwrap();
            assert!(head_end < body_start && body_start < content_start);
            assert!(content_start < script_start && script_start < body_end);
            assert_eq!(sync_head(&output, &meta, false, true), output);
        }
    }

    #[test]
    fn css_and_js_are_each_kept_once_or_removed() {
        let meta = fixture_meta();
        let input = "<html><head><link href='./style.css'><link href='./style.css'><link href='external.css'></head><body><main><script>keep()</script></main><script src='./script.js'></script><script src='./script.js'></script><script src='external.js'></script></body></html>";
        for has_css in [false, true] {
            for has_js in [false, true] {
                let output = sync_head(input, &meta, has_css, has_js);
                assert_eq!(output.matches("href='./style.css'").count() + output.matches("href=\"./style.css\"").count(), usize::from(has_css));
                assert_eq!(output.matches("src='./script.js'").count() + output.matches("src=\"./script.js\"").count(), usize::from(has_js));
                assert!(output.contains("href='external.css'"));
                assert!(output.contains("src='external.js'"));
                assert!(output.contains("<main><script>keep()</script></main>"));
                assert_eq!(sync_head(&output, &meta, has_css, has_js), output);
            }
        }
    }

    #[test]
    fn existing_meta_values_update_without_touching_user_meta() {
        let meta = fixture_meta();
        let input = "<html><head><meta name='other' content='&amp;'><meta name='htnote-tags' content='old'><meta name='htnote-tags' content='duplicate'></head><body><!--keep--></body></html>";
        let output = sync_head(input, &meta, false, false);
        assert!(output.contains("<meta name='other' content='&amp;'>"));
        assert_eq!(output.matches("name='htnote-tags'").count(), 1);
        assert!(output.contains("content=\"rust, a&lt;&amp;&quot;\""), "{output}");
        assert!(output.contains("<!--keep-->"));
        assert_eq!(sync_head(&output, &meta, false, false), output);
    }

    #[test]
    fn managed_script_inside_main_is_preserved() {
        let meta = fixture_meta();
        let protected = "<main id='htnote-content'>\n<!-- keep -->\n<script src='./script.js'></script>\n</main>";
        let input = format!("<html><head></head><body>{protected}<aside><script src='./script.js'></script></aside></body></html>");
        for has_js in [false, true] {
            let output = sync_head(&input, &meta, false, has_js);
            assert!(output.contains(protected));
            assert_eq!(output.matches("./script.js").count(), 1 + usize::from(has_js));
            assert_eq!(sync_head(&output, &meta, false, has_js), output);
        }
    }

    #[test]
    fn managed_script_is_placed_before_body_end() {
        let meta = fixture_meta();
        let body = "<main><p>first</p></main><!-- keep --><aside><p>last</p></aside>";
        let input = format!("<html><head><script src='./script.js'></script></head><body>{body}</body></html>");
        let output = sync_head(&input, &meta, false, true);
        assert_eq!(output.matches("./script.js").count(), 1);
        assert!(output.contains(&format!("<body>{body}<script src=\"./script.js\"></script></body>")));
        assert_eq!(sync_head(&output, &meta, false, true), output);
    }

    #[test]
    fn managed_script_is_placed_at_document_end_without_body_end_tag() {
        let meta = fixture_meta();
        let input = "<html><head></head><body><main><p>first</p></main><aside>last</aside>";
        let output = sync_head(input, &meta, false, true);
        assert!(output.ends_with("<aside>last</aside><script src=\"./script.js\"></script>"));
        assert_eq!(output.matches("./script.js").count(), 1);
        assert_eq!(sync_head(&output, &meta, false, true), output);
    }
}

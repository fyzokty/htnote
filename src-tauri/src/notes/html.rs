use std::cell::RefCell;
use std::rc::Rc;

use chrono::SecondsFormat;
use lol_html::html_content::ContentType;
use lol_html::{element, rewrite_str, Settings};

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
        .join("\n  ")
}

pub fn render_new_note_html(meta: &NoteMetadata) -> String {
    let title = escape_html(&meta.title);
    format!(
        "<!DOCTYPE html>\n<html lang=\"tr\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>{title}</title>\n  {}\n  <style data-htnote=\"base\">\n    body {{\n      font-family: var(--ht-font, system-ui, -apple-system, sans-serif);\n      color: var(--ht-text, #222);\n      background-color: var(--ht-bg, #fff);\n      line-height: 1.6;\n      max-width: 800px;\n      margin: 0 auto;\n      padding: 2rem 1rem;\n    }}\n    img {{ max-width: 100%; height: auto; border-radius: 8px; }}\n    audio {{ width: 100%; margin: 1rem 0; }}\n  </style>\n</head>\n<body>\n  <main id=\"htnote-content\"><h1>{title}</h1><p></p></main>\n</body>\n</html>\n",
        meta_tags(meta)
    )
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
    let _ = rewrite_str(
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
    );
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
                element_content_handlers: vec![element!("html", move |el| {
                    if add_head {
                        el.prepend("<head></head>", ContentType::Html);
                    }
                    if add_body {
                        el.append("<body></body>", ContentType::Html);
                    }
                    Ok(())
                })],
                ..Settings::default()
            },
        )
        .unwrap_or_else(|_| html.to_owned());
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
                                    el.set_attribute("content", value)?;
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
                element!("script[src]", move |el| {
                    if el.get_attribute("src").as_deref() == Some("./script.js") {
                        // Yönetilen script her zaman body sonunda tek kez yer alır.
                        el.remove();
                    }
                    Ok(())
                }),
                element!("body", move |el| {
                    if has_js {
                        el.append("<script src=\"./script.js\"></script>", ContentType::Html);
                    }
                    Ok(())
                }),
            ],
            ..Settings::default()
        },
    )
    .unwrap_or_else(|_| html.to_owned())
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
        assert!(html.contains("<main id=\"htnote-content\"><h1>A &lt;B&gt; &amp; &quot;C&quot;</h1><p></p></main>"));
        assert!(html.contains("content=\"rust, a&lt;&amp;&quot;\""));
        assert_eq!(sync_head(&html, &meta, false, false), html);
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
        assert!(output.contains("<!--keep-->"));
        assert_eq!(sync_head(&output, &meta, false, false), output);
    }

    #[test]
    fn managed_script_is_placed_before_body_end() {
        let meta = fixture_meta();
        let input = "<html><head><script src='./script.js'></script></head><body><p>keep</p></body></html>";
        let output = sync_head(input, &meta, false, true);
        assert_eq!(output.matches("./script.js").count(), 1);
        assert!(output.contains("<p>keep</p><script src=\"./script.js\"></script></body>"));
        assert_eq!(sync_head(&output, &meta, false, true), output);
    }
}

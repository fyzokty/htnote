use scraper::{node::Node, Html};

pub fn extract_text(html: &str) -> String {
    let document = Html::parse_document(html);
    let mut output = String::new();
    fn visit(node: scraper::ElementRef<'_>, output: &mut String) {
        let name = node.value().name();
        if matches!(name, "script" | "style" | "template" | "noscript" | "head") { return; }
        let block = matches!(
            name,
            "address"
                | "article"
                | "aside"
                | "blockquote"
                | "br"
                | "button"
                | "caption"
                | "dd"
                | "details"
                | "dialog"
                | "div"
                | "dl"
                | "dt"
                | "fieldset"
                | "figcaption"
                | "figure"
                | "footer"
                | "form"
                | "h1"
                | "h2"
                | "h3"
                | "h4"
                | "h5"
                | "h6"
                | "header"
                | "hgroup"
                | "hr"
                | "li"
                | "main"
                | "menu"
                | "nav"
                | "ol"
                | "optgroup"
                | "option"
                | "p"
                | "pre"
                | "section"
                | "select"
                | "summary"
                | "table"
                | "tbody"
                | "td"
                | "textarea"
                | "tfoot"
                | "th"
                | "thead"
                | "tr"
                | "ul"
        );
        if block { output.push(' '); }
        for child in node.children() {
            match child.value() {
                Node::Text(text) => output.push_str(text),
                Node::Element(_) => if let Some(element) = scraper::ElementRef::wrap(child) { visit(element, output); },
                _ => (),
            }
        }
        if block { output.push(' '); }
    }
    visit(document.root_element(), &mut output);
    let mut result = String::with_capacity(output.len());
    let mut words = output.split_whitespace();
    if let Some(first) = words.next() {
        result.push_str(first);
        for word in words {
            result.push(' ');
            result.push_str(word);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_visible_blocks_and_entities() {
        assert_eq!(extract_text("<head><title>hidden</title><style>x</style></head><main><div>Bir <b>ve</b></div><p>iki &amp; üç</p><script>bad</script><template>bad</template><noscript>bad</noscript></main>"), "Bir ve iki & üç");
    }

    #[test]
    fn separates_table_cells_and_headers() {
        assert_eq!(
            extract_text("<table><thead><tr><th>Gün</th><th>Durum</th></tr></thead><tbody><tr><td>0</td><td>Oturum</td></tr><tr><td>1</td><td>Aktif</td></tr></tbody></table>"),
            "Gün Durum 0 Oturum 1 Aktif"
        );
    }

    #[test]
    fn separates_list_items() {
        assert_eq!(
            extract_text("<ul><li>Birinci</li><li>İkinci</li></ul><ol><li>Adım 1</li><li>Adım 2</li></ol>"),
            "Birinci İkinci Adım 1 Adım 2"
        );
    }

    #[test]
    fn separates_headings_and_paragraphs() {
        assert_eq!(
            extract_text("<h1>Başlık</h1><p>İlk paragraf.</p><h2>Alt Başlık</h2><p>İkinci paragraf.</p>"),
            "Başlık İlk paragraf. Alt Başlık İkinci paragraf."
        );
    }

    #[test]
    fn separates_line_breaks_and_rules() {
        assert_eq!(
            extract_text("<p>Satır 1<br>Satır 2<br/>Satır 3</p><hr><p>Sonraki</p>"),
            "Satır 1 Satır 2 Satır 3 Sonraki"
        );
    }

    #[test]
    fn preserves_inline_element_spacing_without_artificial_spaces() {
        assert_eq!(
            extract_text("<p><b>Kalın</b><i>İtalik</i><code>kod</code></p>"),
            "Kalınİtalikkod"
        );
        assert_eq!(
            extract_text("<p><span>ön</span><span>ek</span> ve <em>vurgulu</em></p>"),
            "önek ve vurgulu"
        );
        assert_eq!(
            extract_text("<p><a href=\"#\">bağ</a><a href=\"#\">lantı</a></p>"),
            "bağlantı"
        );
    }

    #[test]
    fn separates_buttons_and_figure_elements() {
        assert_eq!(
            extract_text("<div><span>0</span><button type=\"button\">Oturum ekle</button></div>"),
            "0 Oturum ekle"
        );
        assert_eq!(
            extract_text("<figure><img src=\"a.png\"><figcaption>Görsel Açıklaması</figcaption></figure><p>İçerik</p>"),
            "Görsel Açıklaması İçerik"
        );
        assert_eq!(
            extract_text("<dl><dt>Terim</dt><dd>Tanım</dd></dl>"),
            "Terim Tanım"
        );
    }
}


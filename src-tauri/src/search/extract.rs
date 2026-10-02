use scraper::{node::Node, Html};

pub fn extract_text(html: &str) -> String {
    let document = Html::parse_document(html);
    let mut output = String::new();
    fn visit(node: scraper::ElementRef<'_>, output: &mut String) {
        let name = node.value().name();
        if matches!(name, "script" | "style" | "template" | "noscript" | "head") { return; }
        let block = matches!(name, "address" | "article" | "aside" | "blockquote" | "br" | "div" | "dl" | "dt" | "dd" | "footer" | "form" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "header" | "hr" | "li" | "main" | "nav" | "ol" | "p" | "pre" | "section" | "table" | "td" | "th" | "tr" | "ul");
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
}

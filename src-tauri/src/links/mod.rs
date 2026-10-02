use std::collections::HashMap;

use scraper::{Html, Selector};
use serde::Serialize;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct LinkInfo {
    pub text: String,
    pub snippet: String,
}

#[derive(Default)]
pub struct LinkIndex {
    outgoing: HashMap<Uuid, HashMap<Uuid, LinkInfo>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkItem {
    pub id: Uuid,
    pub title: String,
    pub rel_path: String,
    pub snippet: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrokenLinkItem {
    pub target_id: Uuid,
    pub text: String,
}

pub fn extract_links(html: &str) -> HashMap<Uuid, LinkInfo> {
    let document = Html::parse_document(html);
    let selector = Selector::parse("a[href^='htnote://note/']").expect("static selector");
    let mut links = HashMap::new();
    for anchor in document.select(&selector) {
        let Some(target) = anchor.value().attr("href")
            .and_then(|href| href.strip_prefix("htnote://note/"))
            .and_then(|id| Uuid::parse_str(id).ok()) else { continue };
        links.entry(target).or_insert_with(|| {
            let text = anchor.text().collect::<String>();
            let context = anchor.parent().and_then(scraper::ElementRef::wrap)
                .map(|parent| parent.text().collect::<String>()).unwrap_or_else(|| text.clone());
            let snippet = context.find(&text).map(|offset| {
                let start = context[..offset].chars().count().saturating_sub(40);
                let end = (context[..offset].chars().count() + text.chars().count() + 40)
                    .min(context.chars().count());
                context.chars().skip(start).take(end - start).collect()
            }).unwrap_or_else(|| text.clone());
            LinkInfo { text, snippet }
        });
    }
    links
}

impl LinkIndex {
    pub fn clear(&mut self) { self.outgoing.clear(); }
    pub fn upsert(&mut self, source: Uuid, html: &str) {
        self.outgoing.insert(source, extract_links(html));
    }
    pub fn remove(&mut self, source: Uuid) { self.outgoing.remove(&source); }
    pub fn backlinks(&self, target: Uuid) -> Vec<(Uuid, String)> {
        self.outgoing.iter().filter_map(|(source, links)| {
            if *source == target { return None; }
            links.get(&target).map(|info| (*source, info.snippet.clone()))
        }).collect()
    }
    pub fn broken(&self, source: Uuid, exists: impl Fn(Uuid) -> bool) -> Vec<BrokenLinkItem> {
        let mut items = self.outgoing.get(&source).into_iter().flat_map(|links| links.iter())
            .filter(|(target, _)| !exists(**target))
            .map(|(target, info)| BrokenLinkItem { target_id: *target, text: info.text.clone() })
            .collect::<Vec<_>>();
        items.sort_by_key(|item| item.target_id);
        items
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extraction_normalizes_deduplicates_and_keeps_unicode_boundaries() {
        let id = Uuid::new_v4();
        let html = format!("<p>{}<a href='htnote://note/{}'>bağlantı</a>{}<a href='htnote://note/{id}'>ikinci</a><a href='htnote://note/nope'>geçersiz</a></p>", "😀".repeat(45), id.to_string().to_uppercase(), "é".repeat(45));
        let links = extract_links(&html);
        assert_eq!(links.len(), 1);
        assert_eq!(links[&id].text, "bağlantı");
        assert_eq!(links[&id].snippet.chars().count(), 88);
        assert!(links[&id].snippet.starts_with('😀'));
    }

    #[test]
    fn updates_removals_broken_links_and_self_links() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let mut index = LinkIndex::default();
        index.upsert(a, &format!("<a href='htnote://note/{b}'>B</a><a href='htnote://note/{a}'>self</a>"));
        assert_eq!(index.backlinks(b).len(), 1);
        assert!(index.backlinks(a).is_empty());
        assert_eq!(index.broken(a, |id| id == a), vec![BrokenLinkItem { target_id: b, text: "B".into() }]);
        index.upsert(a, "<p>removed</p>");
        assert!(index.backlinks(b).is_empty());
        index.upsert(a, &format!("<a href='htnote://note/{b}'>B</a>"));
        index.remove(a);
        assert!(index.backlinks(b).is_empty());
    }
}

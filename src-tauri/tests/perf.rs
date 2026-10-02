use std::{fs, time::Instant};

use htnote_lib::index::{note_index::NoteIndex, scan};

#[test]
#[ignore]
fn collection_timings() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/perf-fixture");
    let root = fixture.as_path();
    let start = Instant::now();
    let result = scan::scan(root).unwrap();
    println!("scan_ms={:.2}", start.elapsed().as_secs_f64() * 1000.0);
    assert_eq!(result.notes.len(), 2000);
    let start = Instant::now();
    let bytes = serde_json::to_vec(&result.tree).unwrap();
    println!("tree_serialize_ms={:.2} tree_bytes={}", start.elapsed().as_secs_f64() * 1000.0, bytes.len());
    let mut index = NoteIndex::new(root.to_path_buf());
    index.replace_all(result);
    let mut search = htnote_lib::search::SearchIndex::default();
    let mut links = htnote_lib::links::LinkIndex::default();
    let start = Instant::now();
    for note in index.by_id.values() {
        let html = fs::read_to_string(root.join(&note.rel_path).join("index.html")).unwrap();
        search.upsert(note, &html);
        links.upsert(note.metadata.id, &html);
    }
    println!("search_link_build_ms={:.2}", start.elapsed().as_secs_f64() * 1000.0);
    for query in ["İstanbul", "yazılım", "araştırması", "bulunmayan ifade"] {
        let mut times = Vec::new();
        for _ in 0..5 {
            let start = Instant::now();
            let _ = search.search(query, 100);
            times.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        times.sort_by(f64::total_cmp);
        println!("search query={query:?} p50_ms={:.2} max_ms={:.2}", times[2], times[4]);
    }
}

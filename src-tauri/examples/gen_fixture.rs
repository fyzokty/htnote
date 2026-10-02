use std::{env, fs, path::PathBuf};

use htnote_lib::notes::model::NoteMetadata;
use uuid::Uuid;

fn option(args: &[String], name: &str, default: usize) -> usize {
    args.windows(2).find(|pair| pair[0] == name)
        .and_then(|pair| pair[1].parse().ok()).unwrap_or(default)
}

fn next(seed: &mut u64) -> u64 {
    *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    *seed
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args().collect();
    let root = args.get(1).ok_or("usage: gen_fixture <dir> --notes N --folders F --depth D --seed S")?;
    let root = PathBuf::from(root);
    let notes = option(&args, "--notes", 2000);
    let folders = option(&args, "--folders", 150);
    let depth = option(&args, "--depth", 5).max(1);
    let mut seed = option(&args, "--seed", 707) as u64;
    fs::create_dir_all(&root)?;
    let mut paths = vec![PathBuf::new()];
    let mut depths = vec![0];
    for i in 0..folders {
        let available: Vec<_> = depths.iter().enumerate().filter(|(_, level)| **level < depth).map(|(index, _)| index).collect();
        let parent = if i < depth { i } else { available[(next(&mut seed) as usize) % available.len()] };
        let path = paths[parent].join(format!("Klasör {i:03}"));
        fs::create_dir_all(root.join(&path))?;
        paths.push(path);
        depths.push(depths[parent] + 1);
    }
    for i in 0..notes {
        let folder = (next(&mut seed) as usize) % paths.len();
        let dir = root.join(&paths[folder]).join(format!("Not {i:04}"));
        fs::create_dir_all(&dir)?;
        let mut metadata = NoteMetadata::new(format!("Türkçe çalışma notu {i:04}"));
        metadata.id = Uuid::from_u128(0x70700000000040008000000000000000u128 + i as u128);
        metadata.created_at = chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z")?.with_timezone(&chrono::Utc);
        metadata.updated_at = metadata.created_at;
        metadata.tags = vec!["araştırma".into(), format!("konu-{}", i % 20)];
        fs::write(dir.join("metadata.json"), serde_json::to_vec_pretty(&metadata)?)?;
        let target = Uuid::from_u128(0x70700000000040008000000000000000u128 + ((i + 1) % notes.max(1)) as u128);
        let intro = format!("<p>İstanbul'da yazılım araştırması, günlük fikirler ve öğrenme notları. <a href=\"htnote://note/{target}\">İlgili not</a></p>");
        let paragraph = "<p>Bu bölümde toplantı kararları, uygulama örnekleri, çalışma adımları ve sonraki değerlendirmeler açıklanır.</p>";
        let size = 2048 + (next(&mut seed) as usize % 47_000);
        let html = format!("<!doctype html><html lang=\"tr\"><body><h1>{}</h1>{intro}{}</body></html>", metadata.title, paragraph.repeat(size / paragraph.len() + 1));
        fs::write(dir.join("index.html"), html)?;
        if i % 10 == 0 {
            fs::create_dir_all(dir.join("assets"))?;
            fs::write(dir.join("assets").join("diagram.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>")?;
        }
    }
    Ok(())
}

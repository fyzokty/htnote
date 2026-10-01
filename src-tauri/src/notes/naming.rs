use std::collections::HashSet;

use unicode_segmentation::UnicodeSegmentation;

const MAX_NAME_LENGTH: usize = 120;

pub fn sanitize_name(title: &str) -> String {
    let replaced: String = title
        .chars()
        .map(|ch| {
            if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control() {
                '-'
            } else {
                ch
            }
        })
        .collect();
    finish_name(&replaced)
}

fn finish_name(name: &str) -> String {
    let trimmed = name.trim_matches(|ch| ch == ' ' || ch == '.');
    let shortened: String = trimmed.graphemes(true).take(MAX_NAME_LENGTH).collect();
    let shortened = shortened.trim_matches(|ch| ch == ' ' || ch == '.');
    if shortened.is_empty() {
        return "Adsız Not".into();
    }

    let stem = shortened.split('.').next().unwrap_or(shortened);
    let reserved = matches!(stem.to_ascii_uppercase().as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.len() == 4) && (stem.to_ascii_uppercase().starts_with("COM") || stem.to_ascii_uppercase().starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'));
    if reserved {
        // Ayrılmış gövde uzantıdan önce değiştirilir; toplam sınır korunur.
        let mut base: String = stem.graphemes(true).take(MAX_NAME_LENGTH - 1).collect();
        base.push('_');
        base.push_str(&shortened[stem.len()..]);
        let limited: String = base.graphemes(true).take(MAX_NAME_LENGTH).collect();
        limited.trim_end_matches([' ', '.']).into()
    } else {
        shortened.into()
    }
}

pub fn unique_name(desired: &str, existing: impl Fn(&str) -> bool) -> String {
    let desired = sanitize_name(desired);
    if !exists_ignoring_case(&desired, &existing) {
        return desired;
    }
    for number in 2.. {
        let suffix = format!(" ({number})");
        let base: String = desired.graphemes(true).take(MAX_NAME_LENGTH - suffix.len()).collect();
        let base = base.trim_end_matches([' ', '.']);
        let candidate = format!("{base}{suffix}");
        if !exists_ignoring_case(&candidate, &existing) {
            return candidate;
        }
    }
    unreachable!()
}

fn exists_ignoring_case(name: &str, existing: &impl Fn(&str) -> bool) -> bool {
    if existing(name) || existing(&name.to_lowercase()) || existing(&name.to_uppercase())
        || existing(&turkish_lowercase(name)) {
        return true;
    }

    // Kısa adlarda karışık büyük/küçük harf biçimleri de tam eşleşen sorgularla bulunur.
    let letters: Vec<usize> = name.char_indices()
        .filter_map(|(index, ch)| ch.is_ascii_alphabetic().then_some(index))
        .collect();
    if letters.len() > 12 {
        return false;
    }
    let mut variant = name.as_bytes().to_vec();
    for mask in 0..(1usize << letters.len()) {
        for (bit, index) in letters.iter().enumerate() {
            variant[*index] = if mask & (1 << bit) == 0 {
                name.as_bytes()[*index].to_ascii_lowercase()
            } else {
                name.as_bytes()[*index].to_ascii_uppercase()
            };
        }
        if let Ok(value) = std::str::from_utf8(&variant) {
            if existing(value) {
                return true;
            }
        }
    }
    false
}

pub fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    tags.into_iter()
        .map(|tag| tag.trim().to_owned())
        .filter(|tag| !tag.is_empty() && seen.insert(turkish_lowercase(tag)))
        .collect()
}

fn turkish_lowercase(value: &str) -> String {
    let mut result = String::new();
    for ch in value.chars() {
        match ch {
            'İ' => result.push('i'),
            'I' => result.push('ı'),
            _ => result.extend(ch.to_lowercase()),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_name_cases() {
        let cases = [
            ("React/Hooks: Notlar?", "React-Hooks- Notlar-"),
            ("CON", "CON_"),
            ("com1", "com1_"),
            ("LPT9.txt", "LPT9_.txt"),
            ("nul.", "nul_"),
            ("PRN.md", "PRN_.md"),
            ("AUX", "AUX_"),
            ("  . ", "Adsız Not"),
            ("", "Adsız Not"),
            ("Not.", "Not"),
            ("  Not  ", "Not"),
            ("📝 Not", "📝 Not"),
            ("İstanbul Türkçe", "İstanbul Türkçe"),
            ("a\nb", "a-b"),
            ("a\\b|c", "a-b-c"),
            ("COM0", "COM0"),
            ("CON.txt", "CON_.txt"),
        ];
        for (input, expected) in cases {
            assert_eq!(sanitize_name(input), expected, "{input:?}");
        }
        assert_eq!(sanitize_name(&"a".repeat(200)), "a".repeat(120));
        assert_eq!(sanitize_name(&format!("{}e\u{301}", "a".repeat(119))), format!("{}e\u{301}", "a".repeat(119)));
        assert_eq!(sanitize_name(&format!("{} .ignored", "a".repeat(118))), "a".repeat(118));
    }

    #[test]
    fn unique_name_uses_suffixes_and_ignores_case() {
        let occupied = ["not", "not (2)"];
        assert_eq!(unique_name("Not", |name| occupied.iter().any(|item| item.eq_ignore_ascii_case(name))), "Not (3)");
        assert_eq!(unique_name(&"a".repeat(120), |name| name == "a".repeat(120)), format!("{} (2)", "a".repeat(116)));
        assert_eq!(unique_name("Straße", |name| name.replace('ß', "ss").eq_ignore_ascii_case("STRASSE")), "Straße (2)");
        assert_eq!(unique_name("Not", |name| name == "NOT"), "Not (2)");
        assert_eq!(unique_name("Not", |name| name == "nOt"), "Not (2)");
    }

    #[test]
    fn normalize_tags_preserves_first_spelling_and_order() {
        assert_eq!(normalize_tags(vec![" İstanbul ".into(), "istanbul".into(), "Işık".into(), "ışık".into(), " ".into(), "Diğer".into()]), vec!["İstanbul", "Işık", "Diğer"]);
    }
}

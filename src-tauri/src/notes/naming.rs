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
    finish_name(&replaced, MAX_NAME_LENGTH)
}

fn finish_name(name: &str, limit: usize) -> String {
    let trimmed = name.trim_matches(|ch| ch == ' ' || ch == '.');
    let shortened: String = trimmed.graphemes(true).take(limit).collect();
    let shortened = shortened.trim_matches(|ch| ch == ' ' || ch == '.');
    if shortened.is_empty() {
        return "Adsız Not".into();
    }

    let stem = shortened.split('.').next().unwrap_or(shortened);
    if is_reserved_stem(stem) {
        // Uzantı çok baytlı olsa da gövdeyi karakter sınırından ayırarak ekleriz.
        let mut base = stem.to_owned();
        base.push('_');
        base.push_str(&shortened[stem.len()..]);
        let limited: String = base.graphemes(true).take(limit).collect();
        limited.trim_end_matches([' ', '.']).into()
    } else {
        shortened.into()
    }
}

fn is_reserved_stem(stem: &str) -> bool {
    let upper = stem.to_ascii_uppercase();
    matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (upper.len() == 4
            && (upper.starts_with("COM") || upper.starts_with("LPT"))
            && matches!(upper.as_bytes()[3], b'1'..=b'9'))
}

/// `existing` sağlanan adları büyük/küçük harf duyarsız karşılaştırmalıdır.
pub fn unique_name(desired: &str, existing: impl Fn(&str) -> bool) -> String {
    let desired = sanitize_name(desired);
    if !existing(&desired) {
        return desired;
    }
    for number in 2.. {
        let suffix = format!(" ({number})");
        let base = finish_name(&desired, MAX_NAME_LENGTH - suffix.graphemes(true).count());
        let candidate = format!("{base}{suffix}");
        if !existing(&candidate) {
            return candidate;
        }
    }
    unreachable!()
}

pub fn names_equal_ci(left: &str, right: &str) -> bool {
    left.to_lowercase() == right.to_lowercase()
}

pub fn exists_ci(names: &[String]) -> impl Fn(&str) -> bool + '_ {
    |name| names.iter().any(|existing| names_equal_ci(existing, name))
}

pub fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    tags.into_iter()
        .map(|tag| tag.trim().to_owned())
        .filter(|tag| !tag.is_empty() && seen.insert(turkish_lowercase(tag)))
        .collect()
}

pub(crate) fn turkish_lowercase(value: &str) -> String {
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
            ("COM9", "COM9_"),
            ("LPT9.txt", "LPT9_.txt"),
            ("lpt9", "lpt9_"),
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
        let occupied = vec!["Not".into(), "NOT (2)".into(), "not (3)".into()];
        assert!(names_equal_ci("Not", "nOT"));
        assert!(!names_equal_ci("Not", "Notlar"));
        let contains = exists_ci(&occupied);
        assert!(contains("NOT"));
        assert!(contains("not (2)"));
        assert!(contains("NOT (3)"));
        assert!(!contains("not (4)"));
        assert_eq!(unique_name("not", exists_ci(&occupied)), "not (4)");
        assert_eq!(unique_name("CON", exists_ci(&["CON_".into()])), "CON_ (2)");
        assert_eq!(unique_name(&"a".repeat(120), exists_ci(&["a".repeat(120)])), format!("{} (2)", "a".repeat(116)));
        let long_reserved = format!("CON.{}📝", "é".repeat(115));
        let sanitized = sanitize_name(&long_reserved);
        assert_eq!(sanitized.graphemes(true).count(), MAX_NAME_LENGTH);
        let unique = unique_name(&long_reserved, exists_ci(&[sanitized]));
        assert!(unique.starts_with("CON_."));
        assert!(unique.ends_with(" (2)"));
        assert!(unique.graphemes(true).count() <= MAX_NAME_LENGTH);
        assert_eq!(unique, format!("CON_.{} (2)", "é".repeat(111)));
        assert!(names_equal_ci("İstanbul", "i\u{307}stanbul"));
    }

    #[test]
    fn normalize_tags_preserves_first_spelling_and_order() {
        assert_eq!(normalize_tags(vec![" İstanbul ".into(), "istanbul".into(), "Işık".into(), "ışık".into(), " ".into(), "Diğer".into()]), vec!["İstanbul", "Işık", "Diğer"]);
    }
}

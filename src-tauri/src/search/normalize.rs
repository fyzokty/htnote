pub struct Folded {
    pub text: String,
    pub map: Vec<usize>,
}

pub fn tr_fold(value: &str) -> Folded {
    let mut text = String::new();
    let mut map = Vec::new();
    for (index, ch) in value.chars().enumerate() {
        let folded = match ch {
            'İ' => "i".to_string(),
            'I' => "ı".to_string(),
            _ => ch.to_lowercase().collect::<String>(),
        };
        for lowered in folded.chars() {
            text.push(lowered);
            map.push(index);
        }
    }
    Folded { text, map }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_turkish_and_multibyte_chars() {
        let folded = tr_fold("İ I Ğ i\u{307}");
        assert_eq!(folded.text, "i ı ğ i\u{307}");
        assert_eq!(folded.map, (0..8).collect::<Vec<_>>());
        assert_eq!(tr_fold("ILIK").text, "ılık");
    }
}

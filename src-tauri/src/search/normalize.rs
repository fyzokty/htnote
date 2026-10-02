pub struct Folded {
    pub text: String,
    pub map: Vec<(usize, usize)>,
}

pub fn tr_fold(value: &str) -> Folded {
    let mut text = String::with_capacity(value.len());
    let mut map = Vec::with_capacity(value.len());
    for (index, ch) in value.chars().enumerate() {
        match ch {
            'İ' => {
                text.push('i');
                map.push((index, index + 1));
            }
            'I' => {
                text.push('ı');
                map.push((index, index + 1));
            }
            _ => {
                for lowered in ch.to_lowercase() {
                    text.push(lowered);
                    map.push((index, index + 1));
                }
            }
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
        assert_eq!(folded.map, (0..8).map(|index| (index, index + 1)).collect::<Vec<_>>());
        assert_eq!(tr_fold("ILIK").text, "ılık");
        let dotted = tr_fold("İ\u{307}x");
        assert_eq!(dotted.text, "i\u{307}x");
        assert_eq!(dotted.map, vec![(0, 1), (1, 2), (2, 3)]);
    }
}

use crate::error::AppError;

pub fn clean_font_names(names: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut names: Vec<_> = names.into_iter().map(|name| name.trim().to_owned())
        .filter(|name| !name.is_empty() && !name.starts_with('@') &&
            !name.chars().any(|c| c.is_control() || matches!(c, '"' | '\'' | ';' | '{' | '}' | '\\' | ',')) &&
            seen.insert(name.to_lowercase())).collect();
    names.sort_by_key(|name| name.to_lowercase());
    names
}

#[cfg(any(not(windows), test))]
pub fn parse_fontconfig(output: &str) -> Vec<String> {
    clean_font_names(output.lines().flat_map(|line| line.split(',')).map(str::to_owned))
}

#[cfg(windows)]
fn is_scalable_font(font_type: u32) -> bool {
    font_type & windows::Win32::Graphics::Gdi::RASTER_FONTTYPE == 0
}

#[cfg(windows)]
pub fn list() -> Result<Vec<String>, AppError> {
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::Graphics::Gdi::{EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW};
    use windows::Win32::Globalization::{CompareStringEx, COMPARE_STRING_FLAGS};
    unsafe extern "system" fn collect(font: *const LOGFONTW, _: *const TEXTMETRICW, font_type: u32, data: LPARAM) -> i32 {
        // Raster ailelerini toplama; diğer aileleri taramaya devam et.
        if !is_scalable_font(font_type) { return 1; }
        // GDI işaretçileri yalnız senkron EnumFontFamiliesExW çağrısı boyunca geçerlidir.
        let face = unsafe { &(*font).lfFaceName };
        let end = face.iter().position(|c| *c == 0).unwrap_or(face.len());
        unsafe { &mut *(data.0 as *mut Vec<String>) }.push(String::from_utf16_lossy(&face[..end]));
        1
    }
    let mut names = Vec::<String>::new();
    unsafe {
        let dc = GetDC(None);
        if dc.0.is_null() { return Err(AppError::Internal("Font device context unavailable".into())); }
        let font = LOGFONTW { lfCharSet: DEFAULT_CHARSET, ..Default::default() };
        EnumFontFamiliesExW(dc, &font, Some(collect), LPARAM(&mut names as *mut _ as isize), 0);
        ReleaseDC(None, dc);
    }
    let mut names = clean_font_names(names);
    names.sort_by(|a, b| {
        let a16: Vec<_> = a.encode_utf16().collect();
        let b16: Vec<_> = b.encode_utf16().collect();
        let comparison = unsafe { CompareStringEx(windows::core::PCWSTR::null(), COMPARE_STRING_FLAGS(0), &a16, &b16, None, None, None) }.0;
        match comparison { 1 => std::cmp::Ordering::Less, 3 => std::cmp::Ordering::Greater, 2 => std::cmp::Ordering::Equal, _ => a.cmp(b) }
    });
    if names.is_empty() { return Err(AppError::Internal("No system font families found".into())); }
    Ok(names)
}

#[cfg(not(windows))]
pub fn list() -> Result<Vec<String>, AppError> {
    use std::process::Command;
    let mut names = Command::new("fc-list").args([":", "family"]).output().ok()
        .filter(|output| output.status.success())
        .map(|output| parse_fontconfig(&String::from_utf8_lossy(&output.stdout))).unwrap_or_default();
    if names.is_empty() {
        names = clean_font_names(["Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New", "Verdana"].map(str::to_owned));
    }
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn filters_raster_font_types_before_cleaning_names() {
        use windows::Win32::Graphics::Gdi::{RASTER_FONTTYPE, TRUETYPE_FONTTYPE, DEVICE_FONTTYPE};
        let fonts = [("8514oem", RASTER_FONTTYPE), ("Fixedsys", RASTER_FONTTYPE),
            ("Terminal", RASTER_FONTTYPE | DEVICE_FONTTYPE), ("Small Fonts", RASTER_FONTTYPE),
            ("System", RASTER_FONTTYPE | TRUETYPE_FONTTYPE), (" Arial ", TRUETYPE_FONTTYPE),
            ("arial", TRUETYPE_FONTTYPE), ("Georgia", 0)];
        assert_eq!(clean_font_names(fonts.into_iter().filter(|(_, kind)| is_scalable_font(*kind))
            .map(|(name, _)| name.to_owned())), ["Arial", "Georgia"]);
    }
    #[test]
    fn cleans_unsafe_vertical_empty_and_duplicate_names() {
        let names = [" Arial ", "arial", "", "@Vertical", "bad;name", "bad\"name", "bad'name", "bad{name}", "bad\\name", "bad\nname", "Georgia"];
        assert_eq!(clean_font_names(names.map(str::to_owned)), ["Arial", "Georgia"]);
    }
    #[test]
    fn parses_fontconfig_aliases_and_unicode() {
        assert_eq!(parse_fontconfig("Noto Sans, Noto Sans Turkish\nGeorgia\nNoto Sans\n 日本語 \n"), ["Georgia", "Noto Sans", "Noto Sans Turkish", "日本語"]);
    }
}

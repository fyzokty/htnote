use tauri::{webview::Color, WebviewWindow};

use crate::settings::Theme;

fn background_color(theme: &Theme, system_theme: tauri::Theme) -> Color {
    let dark = match theme {
        Theme::Dark => true,
        Theme::Light => false,
        Theme::System => system_theme == tauri::Theme::Dark,
    };
    if dark { Color(0x17, 0x16, 0x2e, 255) } else { Color(0xee, 0xed, 0xff, 255) }
}

pub fn prepare(window: WebviewWindow, theme: &Theme) {
    let system_theme = window.theme().unwrap_or(tauri::Theme::Light);
    if let Err(error) = window.set_background_color(Some(background_color(theme, system_theme))) {
        eprintln!("Startup background unavailable: {error}");
    }
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        show_if_hidden(&window);
    });
}

pub fn show_if_hidden(window: &WebviewWindow) {
    if window.is_visible().is_ok_and(|visible| !visible) {
        if let Err(error) = window.show() {
            eprintln!("Startup window could not be shown: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_color_respects_explicit_and_system_themes() {
        for (theme, system, expected) in [
            (Theme::Light, tauri::Theme::Dark, Color(0xee, 0xed, 0xff, 255)),
            (Theme::Dark, tauri::Theme::Light, Color(0x17, 0x16, 0x2e, 255)),
            (Theme::System, tauri::Theme::Light, Color(0xee, 0xed, 0xff, 255)),
            (Theme::System, tauri::Theme::Dark, Color(0x17, 0x16, 0x2e, 255)),
        ] {
            assert_eq!(background_color(&theme, system), expected);
        }
    }
}

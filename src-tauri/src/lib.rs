mod commands;
pub mod error;
mod state;

/// Uygulama sürümü; tek kaynak `Cargo.toml`'dur.
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![commands::app_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `tauri.conf.json` ile `Cargo.toml` sürümleri ayrışırsa paketler yanlış sürümle çıkar.
    #[test]
    fn tauri_conf_version_matches_cargo_version() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("geçerli JSON");
        assert_eq!(conf["version"].as_str(), Some(app_version()));
    }
}

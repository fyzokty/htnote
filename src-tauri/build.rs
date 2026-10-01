fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["set_preview_draft", "clear_preview_draft"]),
        ),
    ).expect("Tauri build failed");
}

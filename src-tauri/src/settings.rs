use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::fs_util::{replace_file, write_file_atomic};

#[cfg(debug_assertions)]
fn directory_override(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).filter(|value| !value.is_empty()).map(PathBuf::from)
}

#[cfg(debug_assertions)]
pub fn root_override() -> Option<PathBuf> {
    directory_override("HTNOTE_ROOT_OVERRIDE")
}

#[cfg(not(debug_assertions))]
pub fn root_override() -> Option<PathBuf> {
    None
}

#[cfg(debug_assertions)]
pub fn config_dir_override() -> Option<PathBuf> {
    directory_override("HTNOTE_CONFIG_DIR_OVERRIDE")
}

#[cfg(not(debug_assertions))]
pub fn config_dir_override() -> Option<PathBuf> {
    None
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Tr,
    En,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub root_dir: Option<String>,
    pub theme: Theme,
    pub language: Option<Language>,
    pub sidebar_width: u32,
    pub sidebar_visible: bool,
    #[serde(default = "default_editor_split_ratio")]
    pub editor_split_ratio: u8,
    #[serde(default = "default_editor_live_preview")]
    pub editor_live_preview: bool,
    #[serde(default = "default_backlinks_expanded")]
    pub backlinks_expanded: bool,
    #[serde(default)]
    pub open_tabs: Vec<String>,
    #[serde(default)]
    pub active_tab: Option<String>,
    #[serde(default)]
    pub expanded_folders: Vec<String>,
    #[serde(default)]
    pub onboarding_done: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            root_dir: None,
            theme: Theme::System,
            language: None,
            sidebar_width: 260,
            sidebar_visible: true,
            editor_split_ratio: default_editor_split_ratio(),
            editor_live_preview: default_editor_live_preview(),
            backlinks_expanded: default_backlinks_expanded(),
            open_tabs: Vec::new(),
            active_tab: None,
            expanded_folders: Vec::new(),
            onboarding_done: false,
        }
    }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsPatch {
    #[serde(default, deserialize_with = "nullable_field")]
    pub root_dir: Option<Option<String>>,
    pub theme: Option<Theme>,
    #[serde(default, deserialize_with = "nullable_field")]
    pub language: Option<Option<Language>>,
    pub sidebar_width: Option<u32>,
    pub sidebar_visible: Option<bool>,
    pub editor_split_ratio: Option<u8>,
    pub editor_live_preview: Option<bool>,
    pub backlinks_expanded: Option<bool>,
    pub open_tabs: Option<Vec<String>>,
    #[serde(default, deserialize_with = "nullable_field")]
    pub active_tab: Option<Option<String>>,
    pub expanded_folders: Option<Vec<String>>,
}

fn nullable_field<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

fn default_editor_split_ratio() -> u8 {
    50
}

fn default_editor_live_preview() -> bool {
    true
}

fn default_backlinks_expanded() -> bool { true }

pub fn apply_patch(settings: &Settings, patch: SettingsPatch) -> Settings {
    Settings {
        root_dir: patch.root_dir.unwrap_or_else(|| settings.root_dir.clone()),
        theme: patch.theme.unwrap_or_else(|| settings.theme.clone()),
        language: patch.language.unwrap_or_else(|| settings.language.clone()),
        sidebar_width: patch.sidebar_width.unwrap_or(settings.sidebar_width),
        sidebar_visible: patch.sidebar_visible.unwrap_or(settings.sidebar_visible),
        editor_split_ratio: patch.editor_split_ratio.unwrap_or(settings.editor_split_ratio).clamp(20, 80),
        editor_live_preview: patch.editor_live_preview.unwrap_or(settings.editor_live_preview),
        backlinks_expanded: patch.backlinks_expanded.unwrap_or(settings.backlinks_expanded),
        open_tabs: patch.open_tabs.unwrap_or_else(|| settings.open_tabs.clone()),
        active_tab: patch.active_tab.unwrap_or_else(|| settings.active_tab.clone()),
        expanded_folders: patch
            .expanded_folders
            .unwrap_or_else(|| settings.expanded_folders.clone()),
        onboarding_done: settings.onboarding_done,
    }
}

pub fn load_settings(config_dir: &Path) -> Result<Settings, AppError> {
    let path = config_dir.join("settings.json");
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(settings) => Ok(settings),
            Err(_) => {
                replace_file(&path, &config_dir.join("settings.json.bak"))?;
                let settings = Settings::default();
                save_settings_atomic(config_dir, &settings)?;
                Ok(settings)
            }
        },
        Err(error) if error.kind() == ErrorKind::NotFound => {
            let settings = Settings::default();
            save_settings_atomic(config_dir, &settings)?;
            Ok(settings)
        }
        Err(error) => Err(error.into()),
    }
}

pub fn save_settings_atomic(config_dir: &Path, settings: &Settings) -> Result<(), AppError> {
    fs::create_dir_all(config_dir)?;
    let mut bytes = serde_json::to_vec_pretty(settings)?;
    bytes.push(b'\n');
    write_file_atomic(&config_dir.join("settings.json"), &bytes)
}

pub fn resolve_root_dir(settings: &Settings, fallback: &Path) -> Result<PathBuf, AppError> {
    let root = settings
        .root_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| fallback.join("HTNote"));
    fs::create_dir_all(&root)?;
    Ok(root.canonicalize()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn overrides_are_only_active_in_debug_builds() {
        let dir = tempdir().unwrap();
        let name = "HTNOTE_TEST_ONLY_OVERRIDE";
        std::env::set_var(name, dir.path());
        #[cfg(debug_assertions)]
        assert_eq!(directory_override(name), Some(dir.path().to_path_buf()));
        #[cfg(not(debug_assertions))]
        {
            assert!(root_override().is_none());
            assert!(config_dir_override().is_none());
        }
        std::env::remove_var(name);
    }

    #[test]
    fn missing_file_creates_defaults() {
        let dir = tempdir().unwrap();
        let settings = load_settings(dir.path()).unwrap();
        assert_eq!(settings, Settings::default());
        assert!(dir.path().join("settings.json").exists());
    }

    #[test]
    fn missing_expanded_folders_uses_empty_list() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("expandedFolders");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert!(settings.expanded_folders.is_empty());
    }

    #[test]
    fn missing_tab_fields_use_defaults() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        let object = value.as_object_mut().unwrap();
        object.remove("openTabs");
        object.remove("activeTab");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert!(settings.open_tabs.is_empty());
        assert_eq!(settings.active_tab, None);
    }

    #[test]
    fn missing_onboarding_flag_defaults_to_false() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("onboardingDone");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert!(!settings.onboarding_done);
    }

    #[test]
    fn split_settings_default_and_clamp() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        let object = value.as_object_mut().unwrap();
        object.remove("editorSplitRatio");
        object.remove("editorLivePreview");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert_eq!(settings.editor_split_ratio, 50);
        assert!(settings.editor_live_preview);
        let patch: SettingsPatch = serde_json::from_str(r#"{"editorSplitRatio":99,"editorLivePreview":false}"#).unwrap();
        let changed = apply_patch(&settings, patch);
        assert_eq!(changed.editor_split_ratio, 80);
        assert!(!changed.editor_live_preview);
    }

    #[test]
    fn backlinks_panel_setting_defaults_and_persists() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("backlinksExpanded");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert!(settings.backlinks_expanded);
        let patch: SettingsPatch = serde_json::from_str(r#"{"backlinksExpanded":false}"#).unwrap();
        let changed = apply_patch(&settings, patch);
        assert!(!changed.backlinks_expanded);
        let dir = tempdir().unwrap();
        save_settings_atomic(dir.path(), &changed).unwrap();
        assert!(!load_settings(dir.path()).unwrap().backlinks_expanded);
    }

    #[test]
    fn patch_preserves_unset_fields_and_accepts_null() {
        let original = Settings { active_tab: Some("note".into()), ..Settings::default() };
        let patch: SettingsPatch = serde_json::from_str(r#"{"theme":"dark","activeTab":null}"#).unwrap();
        let changed = apply_patch(&original, patch);
        assert_eq!(changed.theme, Theme::Dark);
        assert_eq!(changed.sidebar_width, original.sidebar_width);
        assert_eq!(changed.active_tab, None);
    }

    #[test]
    fn corrupt_file_is_backed_up() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("settings.json"), "not json").unwrap();
        assert_eq!(load_settings(dir.path()).unwrap(), Settings::default());
        assert_eq!(fs::read_to_string(dir.path().join("settings.json.bak")).unwrap(), "not json");
    }

    #[test]
    fn repeated_corruption_replaces_previous_backup() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "first invalid file").unwrap();
        load_settings(dir.path()).unwrap();
        fs::write(&path, "second invalid file").unwrap();
        assert_eq!(load_settings(dir.path()).unwrap(), Settings::default());
        assert_eq!(
            fs::read_to_string(dir.path().join("settings.json.bak")).unwrap(),
            "second invalid file"
        );
    }

    #[test]
    fn save_replaces_file_without_leaving_temporary_file() {
        let dir = tempdir().unwrap();
        let mut settings = Settings::default();
        save_settings_atomic(dir.path(), &settings).unwrap();
        settings.theme = Theme::Dark;
        save_settings_atomic(dir.path(), &settings).unwrap();
        assert_eq!(load_settings(dir.path()).unwrap(), settings);
        assert!(!dir.path().join("settings.json.tmp").exists());
    }

    #[test]
    fn root_dir_is_created_and_absolute() {
        let dir = tempdir().unwrap();
        let default_root = resolve_root_dir(&Settings::default(), dir.path()).unwrap();
        assert!(default_root.is_absolute());
        assert!(default_root.is_dir());
        let settings = Settings { root_dir: Some(dir.path().join("other").to_string_lossy().into_owned()), ..Settings::default() };
        assert!(resolve_root_dir(&settings, dir.path()).unwrap().ends_with("other"));
    }
}

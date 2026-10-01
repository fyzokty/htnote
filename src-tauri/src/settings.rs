use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::fs_util::{replace_file, write_file_atomic};

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
    pub open_tabs: Vec<String>,
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

pub fn apply_patch(settings: &Settings, patch: SettingsPatch) -> Settings {
    Settings {
        root_dir: patch.root_dir.unwrap_or_else(|| settings.root_dir.clone()),
        theme: patch.theme.unwrap_or_else(|| settings.theme.clone()),
        language: patch.language.unwrap_or_else(|| settings.language.clone()),
        sidebar_width: patch.sidebar_width.unwrap_or(settings.sidebar_width),
        sidebar_visible: patch.sidebar_visible.unwrap_or(settings.sidebar_visible),
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
    fn missing_onboarding_flag_defaults_to_false() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("onboardingDone");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert!(!settings.onboarding_done);
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

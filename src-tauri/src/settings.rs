use std::collections::BTreeMap;
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

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Motion {
    #[default]
    System,
    On,
    Off,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Tr,
    En,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TabSizing {
    #[default]
    Fixed,
    Fit,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ContentWidth {
    Narrow,
    #[default]
    Comfortable,
    Wide,
    Full,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub tag_colors: BTreeMap<String, String>,
    pub root_dir: Option<String>,
    #[serde(default)]
    pub last_export_dir: Option<String>,
    pub theme: Theme,
    #[serde(default)]
    pub motion: Motion,
    pub language: Option<Language>,
    pub sidebar_width: u32,
    pub sidebar_visible: bool,
    #[serde(default)]
    pub tab_sizing: TabSizing,
    #[serde(default)]
    pub content_width: ContentWidth,
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
            tag_colors: BTreeMap::new(),
            root_dir: None,
            last_export_dir: None,
            theme: Theme::System,
            motion: Motion::System,
            language: None,
            sidebar_width: 260,
            sidebar_visible: true,
            tab_sizing: TabSizing::default(),
            content_width: ContentWidth::default(),
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
    pub tag_colors: Option<BTreeMap<String, String>>,
    #[serde(default, deserialize_with = "nullable_field")]
    pub root_dir: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable_field")]
    pub last_export_dir: Option<Option<String>>,
    pub theme: Option<Theme>,
    pub motion: Option<Motion>,
    #[serde(default, deserialize_with = "nullable_field")]
    pub language: Option<Option<Language>>,
    pub sidebar_width: Option<u32>,
    pub sidebar_visible: Option<bool>,
    pub tab_sizing: Option<TabSizing>,
    pub content_width: Option<ContentWidth>,
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
        tag_colors: patch.tag_colors.map(|colors| {
            colors.into_iter().filter(|(_, color)| {
                ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"].contains(&color.as_str())
            }).collect()
        }).unwrap_or_else(|| settings.tag_colors.clone()),
        root_dir: patch.root_dir.unwrap_or_else(|| settings.root_dir.clone()),
        last_export_dir: patch.last_export_dir.unwrap_or_else(|| settings.last_export_dir.clone()),
        theme: patch.theme.unwrap_or_else(|| settings.theme.clone()),
        motion: patch.motion.unwrap_or_else(|| settings.motion.clone()),
        language: patch.language.unwrap_or_else(|| settings.language.clone()),
        sidebar_width: patch.sidebar_width.unwrap_or(settings.sidebar_width),
        sidebar_visible: patch.sidebar_visible.unwrap_or(settings.sidebar_visible),
        tab_sizing: patch.tab_sizing.unwrap_or_else(|| settings.tab_sizing.clone()),
        content_width: patch.content_width.unwrap_or_else(|| settings.content_width.clone()),
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

pub fn validate_new_root(path: &Path) -> Result<PathBuf, AppError> {
    validate_root_dir(path)?;
    if !path.is_absolute() {
        return Err(AppError::InvalidName(path.display().to_string()));
    }
    // Oluşturmadan önce mevcut üst dizinleri ve sembolik bağların hedeflerini denetle.
    for ancestor in path.ancestors() {
        if ancestor.exists() {
            let resolved = ancestor.canonicalize()?;
            for parent in resolved.ancestors() {
                if is_note_package(parent) {
                    return Err(AppError::NotAFolder(parent.display().to_string()));
                }
            }
        }
    }
    let mut missing = Vec::new();
    let mut existing = path;
    while !existing.exists() {
        missing.push(existing.to_path_buf());
        existing = existing.parent().ok_or_else(|| AppError::InvalidName(path.display().to_string()))?;
    }

    // Yeni dizinler oluşturulmadan önce üst dizinde dosya açılabildiğini doğrula.
    probe_writable_dir(existing)?;
    let mut created = Vec::new();
    let result = (|| {
        for directory in missing.iter().rev() {
            fs::create_dir(directory)?;
            created.push(directory.to_path_buf());
        }
        let root = path.canonicalize()?;
        for parent in root.ancestors() {
            if is_note_package(parent) {
                return Err(AppError::NotAFolder(parent.display().to_string()));
            }
        }
        probe_writable_dir(&root)?;
        fs::create_dir_all(root.join(".trash"))?;
        Ok(root)
    })();
    if result.is_err() {
        // Yalnızca bu doğrulamanın oluşturduğu boş dizinleri geri al.
        for directory in created.iter().rev() {
            let _ = fs::remove_dir(directory);
        }
    }
    result
}

/// Checks whether a path can be used as a root without creating directories or files.
pub fn validate_root_dir(path: &Path) -> Result<(), AppError> {
    if !path.is_absolute() {
        return Err(AppError::InvalidName(path.display().to_string()));
    }
    for ancestor in path.ancestors() {
        if ancestor.exists() {
            let resolved = ancestor.canonicalize()?;
            if !resolved.is_dir() {
                return Err(AppError::Io(std::io::Error::new(ErrorKind::NotADirectory, "root path is not a directory")));
            }
            for parent in resolved.ancestors() {
                if is_note_package(parent) {
                    return Err(AppError::NotAFolder(parent.display().to_string()));
                }
            }
        }
    }
    Ok(())
}

fn is_note_package(path: &Path) -> bool {
    path.join("metadata.json").is_file() && path.join("index.html").is_file()
}

fn probe_writable_dir(directory: &Path) -> Result<(), AppError> {
    let probe = directory.join(format!(".htnote-write-probe-{}", uuid::Uuid::new_v4()));
    let file = fs::OpenOptions::new().write(true).create_new(true).open(&probe)?;
    drop(file);
    fs::remove_file(probe)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn tag_colors_round_trip_and_legacy_defaults() {
        let dir = tempdir().unwrap();
        let settings = Settings::default();
        let patch = serde_json::from_str(r#"{"tagColors":{"iş":"blue","invalid":"url(bad)"}}"#).unwrap();
        let colored = apply_patch(&settings, patch);
        assert_eq!(colored.tag_colors.len(), 1);
        save_settings_atomic(dir.path(), &colored).unwrap();
        assert_eq!(load_settings(dir.path()).unwrap().tag_colors.get("iş").unwrap(), "blue");
        let mut legacy = serde_json::to_value(settings).unwrap();
        legacy.as_object_mut().unwrap().remove("tagColors");
        assert!(serde_json::from_value::<Settings>(legacy).unwrap().tag_colors.is_empty());
    }

    #[test]
    fn new_root_rejects_relative_and_note_paths_before_creation() {
        let dir = tempdir().unwrap();
        assert!(matches!(validate_new_root(Path::new("relative")), Err(AppError::InvalidName(_))));
        let note = dir.path().join("Note");
        fs::create_dir(&note).unwrap();
        fs::write(note.join("metadata.json"), "{}").unwrap();
        fs::write(note.join("index.html"), "").unwrap();
        assert!(matches!(validate_new_root(&note), Err(AppError::NotAFolder(_))));
        let child = note.join("nested");
        assert!(matches!(validate_new_root(&child), Err(AppError::NotAFolder(_))));
        assert!(!child.exists());
    }

    #[test]
    fn validate_root_dir_rejects_note_package_without_side_effects() {
        let dir = tempdir().unwrap();
        let note = dir.path().join("Note");
        fs::create_dir(&note).unwrap();
        fs::write(note.join("metadata.json"), "{}").unwrap();
        fs::write(note.join("index.html"), "").unwrap();
        let child = note.join("nested");

        assert!(matches!(validate_root_dir(&note), Err(AppError::NotAFolder(_))));
        assert!(matches!(validate_root_dir(&child), Err(AppError::NotAFolder(_))));
        assert!(!child.exists());
        assert!(!note.join(".trash").exists());
        assert!(!fs::read_dir(&note).unwrap().any(|entry| entry.unwrap().file_name().to_string_lossy().starts_with(".htnote-write-probe")));
    }

    #[test]
    fn new_root_creates_missing_folder_and_trash() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("new").join("root");
        let validated = validate_new_root(&root).unwrap();
        assert_eq!(validated, root.canonicalize().unwrap());
        assert!(validated.join(".trash").is_dir());
        assert!(!fs::read_dir(&validated).unwrap().any(|entry| entry.unwrap().file_name().to_string_lossy().starts_with(".htnote-write-probe")));
    }

    #[test]
    fn metadata_without_html_is_not_a_note_package() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("metadata.json"), "{}").unwrap();
        let root = validate_new_root(&dir.path().join("nested")).unwrap();
        assert!(root.join(".trash").is_dir());
    }

    #[test]
    fn new_root_rejects_file_as_directory() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("file");
        fs::write(&file, "content").unwrap();
        assert!(matches!(validate_new_root(&file), Err(AppError::Io(_))));
        let child = file.join("missing").join("root");
        assert!(matches!(validate_new_root(&child), Err(AppError::Io(_))));
        assert!(!child.exists());
    }

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
    fn motion_defaults_and_round_trip() {
        let mut legacy = serde_json::to_value(Settings::default()).unwrap();
        legacy.as_object_mut().unwrap().remove("motion");
        assert_eq!(serde_json::from_value::<Settings>(legacy).unwrap().motion, Motion::System);
        for (name, motion) in [("system", Motion::System), ("on", Motion::On), ("off", Motion::Off)] {
            let patch = serde_json::from_value(serde_json::json!({"motion": name})).unwrap();
            let updated = apply_patch(&Settings::default(), patch);
            assert_eq!(updated.motion, motion);
            let value = serde_json::to_value(&updated).unwrap();
            assert_eq!(value["motion"], name);
            assert_eq!(serde_json::from_value::<Settings>(value).unwrap(), updated);
            assert_eq!(apply_patch(&updated, SettingsPatch::default()).motion, motion);
        }
        assert!(serde_json::from_value::<SettingsPatch>(serde_json::json!({"motion": "invalid"})).is_err());
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
    fn tab_sizing_defaults_patches_and_persists() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("tabSizing");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert_eq!(settings.tab_sizing, TabSizing::Fixed);
        for (value, expected) in [("fit", TabSizing::Fit), ("fixed", TabSizing::Fixed)] {
            let patch: SettingsPatch = serde_json::from_value(serde_json::json!({ "tabSizing": value })).unwrap();
            let changed = apply_patch(&settings, patch);
            assert_eq!(changed.tab_sizing, expected);
            assert_eq!(changed.sidebar_width, settings.sidebar_width);
            let dir = tempdir().unwrap();
            save_settings_atomic(dir.path(), &changed).unwrap();
            assert_eq!(load_settings(dir.path()).unwrap().tab_sizing, expected);
        }
        assert!(serde_json::from_str::<SettingsPatch>(r#"{"tabSizing":"invalid"}"#).is_err());
    }

    #[test]
    fn content_width_defaults_patches_and_persists() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("contentWidth");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert_eq!(settings.content_width, ContentWidth::Comfortable);
        for (value, expected) in [
            ("narrow", ContentWidth::Narrow),
            ("comfortable", ContentWidth::Comfortable),
            ("wide", ContentWidth::Wide),
            ("full", ContentWidth::Full),
        ] {
            let patch: SettingsPatch = serde_json::from_value(serde_json::json!({ "contentWidth": value })).unwrap();
            let changed = apply_patch(&settings, patch);
            assert_eq!(changed.content_width, expected);
            let dir = tempdir().unwrap();
            save_settings_atomic(dir.path(), &changed).unwrap();
            assert_eq!(load_settings(dir.path()).unwrap().content_width, expected);
        }
        assert!(serde_json::from_str::<SettingsPatch>(r#"{"contentWidth":"invalid"}"#).is_err());
    }

    #[test]
    fn export_folder_defaults_and_persists() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("lastExportDir");
        let settings: Settings = serde_json::from_value(value).unwrap();
        assert_eq!(settings.last_export_dir, None);
        let patch: SettingsPatch = serde_json::from_str(r#"{"lastExportDir":"C:/Exports"}"#).unwrap();
        let changed = apply_patch(&settings, patch);
        assert_eq!(changed.last_export_dir.as_deref(), Some("C:/Exports"));
        let dir = tempdir().unwrap();
        save_settings_atomic(dir.path(), &changed).unwrap();
        assert_eq!(load_settings(dir.path()).unwrap().last_export_dir, changed.last_export_dir);
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

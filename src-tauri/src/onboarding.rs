use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::fs_util::write_file_atomic;
use crate::notes::create::create_note_in;
use crate::notes::html::sync_head;
use crate::notes::model::write_metadata_atomic;
use crate::settings::{save_settings_atomic, Language};
use crate::state::AppState;

struct Templates {
    welcome: &'static str,
    interactive: &'static str,
    css: &'static str,
    js: &'static str,
    welcome_title: &'static str,
    interactive_title: &'static str,
}

fn templates(language: &Language) -> Templates {
    match language {
        Language::Tr => Templates {
            welcome: include_str!("../templates/onboarding/tr/welcome.html"),
            interactive: include_str!("../templates/onboarding/tr/interactive.html"),
            css: include_str!("../templates/onboarding/tr/style.css"),
            js: include_str!("../templates/onboarding/tr/script.js"),
            welcome_title: "HTNote'a Hoş Geldiniz",
            interactive_title: "İnteraktif Not Örneği",
        },
        Language::En => Templates {
            welcome: include_str!("../templates/onboarding/en/welcome.html"),
            interactive: include_str!("../templates/onboarding/en/interactive.html"),
            css: include_str!("../templates/onboarding/en/style.css"),
            js: include_str!("../templates/onboarding/en/script.js"),
            welcome_title: "Welcome to HTNote",
            interactive_title: "Interactive Note Example",
        },
    }
}

#[cfg(windows)]
fn system_language() -> Language {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetUserDefaultUILanguage() -> u16;
    }
    if unsafe { GetUserDefaultUILanguage() } & 0x03ff == 0x001f {
        Language::Tr
    } else {
        Language::En
    }
}

#[cfg(not(windows))]
fn system_language() -> Language {
    let locale = std::env::var("LC_ALL")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| std::env::var("LC_MESSAGES").ok().filter(|value| !value.is_empty()))
        .or_else(|| std::env::var("LANG").ok())
        .unwrap_or_default();
    if locale.to_ascii_lowercase().starts_with("tr") {
        Language::Tr
    } else {
        Language::En
    }
}

fn root_is_empty(root: &Path) -> Result<bool, AppError> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if !entry.file_name().to_string_lossy().starts_with('.') {
            return Ok(false);
        }
    }
    Ok(true)
}

pub fn run(state: &AppState) -> Result<(), AppError> {
    let mut settings = state.settings.lock().map_err(|error| AppError::Internal(error.to_string()))?;
    if settings.onboarding_done {
        return Ok(());
    }
    let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?;
    let marker = root.join(".htnote-onboarding-in-progress");
    let empty = root_is_empty(&root)?;
    if marker.exists() && !empty {
        // Geri alma başarısız olduysa kısmi notları tamamlanmış sayma.
        return Err(AppError::Internal("Incomplete onboarding examples remain in the note root".into()));
    }
    if empty {
        let language = settings.language.clone().unwrap_or_else(system_language);
        write_file_atomic(&marker, b"")?;
        let mut updated = settings.clone();
        updated.onboarding_done = true;
        let result = with_example_rollback(|created| {
            create_examples(&root, &language, created)?;
            save_settings_atomic(&state.config_dir, &updated)
        });
        if let Err(error) = result {
            if root_is_empty(&root).unwrap_or(false) {
                let _ = fs::remove_file(&marker);
            }
            return Err(error);
        }
        *settings = updated;
        fs::remove_file(&marker)?;
        return Ok(());
    }
    let mut updated = settings.clone();
    updated.onboarding_done = true;
    save_settings_atomic(&state.config_dir, &updated)?;
    *settings = updated;
    Ok(())
}

fn with_example_rollback(action: impl FnOnce(&mut Vec<PathBuf>) -> Result<(), AppError>) -> Result<(), AppError> {
    let mut created = Vec::new();
    if let Err(error) = action(&mut created) {
        for path in created.iter().rev() {
            fs::remove_dir_all(path).map_err(|rollback| {
                AppError::Internal(format!("Onboarding failed: {error}; rollback failed for {}: {rollback}", path.display()))
            })?;
        }
        return Err(error);
    }
    Ok(())
}

fn create_examples(root: &Path, language: &Language, created: &mut Vec<PathBuf>) -> Result<(), AppError> {
    let templates = templates(language);
    let (_, mut interactive) = create_note_in(root, "", Some(templates.interactive_title))?;
    let interactive_dir = root.join(&interactive.rel_path);
    created.push(interactive_dir.clone());
    interactive.metadata.has_custom_css = true;
    interactive.metadata.has_custom_js = true;
    write_file_atomic(&interactive_dir.join("style.css"), templates.css.as_bytes())?;
    write_file_atomic(&interactive_dir.join("script.js"), templates.js.as_bytes())?;
    let html = sync_head(templates.interactive, &interactive.metadata, true, true);
    write_file_atomic(&interactive_dir.join("index.html"), html.as_bytes())?;
    write_metadata_atomic(&interactive_dir.join("metadata.json"), &interactive.metadata)?;

    let (_, welcome) = create_note_in(root, "", Some(templates.welcome_title))?;
    created.push(root.join(&welcome.rel_path));
    let html = templates.welcome.replace("{{NOTE_ID}}", &interactive.metadata.id.to_string());
    let html = sync_head(&html, &welcome.metadata, false, false);
    write_file_atomic(&root.join(&welcome.rel_path).join("index.html"), html.as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::model::read_metadata;
    use crate::settings::Settings;
    use tempfile::tempdir;

    fn state(root: &Path, language: Language) -> AppState {
        let config = root.parent().unwrap().join("config");
        AppState::new(config, Settings { language: Some(language), ..Settings::default() }, root.to_path_buf())
    }

    #[test]
    fn empty_root_creates_linked_interactive_examples_once() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("notes");
        fs::create_dir(&root).unwrap();
        fs::create_dir(root.join(".trash")).unwrap();
        let state = state(&root, Language::Tr);
        run(&state).unwrap();
        let interactive = root.join("İnteraktif Not Örneği");
        let welcome = root.join("HTNote'a Hoş Geldiniz");
        let metadata = read_metadata(&interactive.join("metadata.json")).unwrap();
        assert!(metadata.has_custom_css && metadata.has_custom_js);
        assert!(interactive.join("style.css").is_file());
        assert!(interactive.join("script.js").is_file());
        let html = fs::read_to_string(interactive.join("index.html")).unwrap();
        assert!(html.contains("./style.css") && html.contains("./script.js"));
        assert!(fs::read_to_string(welcome.join("index.html")).unwrap().contains(&format!("htnote://note/{}", metadata.id)));
        assert!(state.settings.lock().unwrap().onboarding_done);
        assert!(crate::settings::load_settings(&state.config_dir).unwrap().onboarding_done);
        fs::remove_dir_all(interactive).unwrap();
        fs::remove_dir_all(welcome).unwrap();
        run(&state).unwrap();
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        let reopened = AppState::new(state.config_dir.clone(), crate::settings::load_settings(&state.config_dir).unwrap(), root.clone());
        run(&reopened).unwrap();
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    }

    #[test]
    fn occupied_root_is_marked_done_without_creating_notes() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("notes");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("existing.txt"), "keep").unwrap();
        let state = state(&root, Language::Tr);
        run(&state).unwrap();
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        assert!(state.settings.lock().unwrap().onboarding_done);
    }

    #[test]
    fn english_templates_are_selected() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("notes");
        fs::create_dir(&root).unwrap();
        let state = state(&root, Language::En);
        run(&state).unwrap();
        let metadata = read_metadata(&root.join("Interactive Note Example/metadata.json")).unwrap();
        assert!(fs::read_to_string(root.join("Welcome to HTNote/index.html")).unwrap().contains(&format!("htnote://note/{}", metadata.id)));
    }

    #[test]
    fn failed_example_write_rolls_back_and_allows_retry() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("notes");
        fs::create_dir(&root).unwrap();
        let result = with_example_rollback(|created| {
            let (_, note) = create_note_in(&root, "", Some("Partial"))?;
            created.push(root.join(note.rel_path));
            Err(AppError::Internal("simulated template write failure".into()))
        });
        assert!(result.is_err());
        assert!(root_is_empty(&root).unwrap());
        let state = state(&root, Language::En);
        run(&state).unwrap();
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
    }

    #[test]
    fn failed_settings_save_rolls_back_both_examples() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("notes");
        fs::create_dir(&root).unwrap();
        let state = state(&root, Language::En);
        fs::write(&state.config_dir, "blocks settings directory").unwrap();
        assert!(run(&state).is_err());
        assert!(root_is_empty(&root).unwrap());
        assert!(!root.join(".htnote-onboarding-in-progress").exists());
        assert!(!state.settings.lock().unwrap().onboarding_done);
        fs::remove_file(&state.config_dir).unwrap();
        run(&state).unwrap();
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
    }

    #[test]
    fn incomplete_marker_prevents_silent_completion() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("notes");
        fs::create_dir(&root).unwrap();
        fs::write(root.join(".htnote-onboarding-in-progress"), "").unwrap();
        fs::create_dir(root.join("Partial")).unwrap();
        let state = state(&root, Language::En);
        assert!(run(&state).is_err());
        assert!(!state.settings.lock().unwrap().onboarding_done);
    }
}

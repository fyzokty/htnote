use std::fs;
use std::path::Path;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::fs_util::write_file_atomic;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMetadata {
    pub id: Uuid,
    pub title: String,
    #[serde(with = "utc_millis")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "utc_millis")]
    pub updated_at: DateTime<Utc>,
    pub is_favorite: bool,
    pub tags: Vec<String>,
    pub has_custom_css: bool,
    pub has_custom_js: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl NoteMetadata {
    pub fn new(title: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            title: title.into(),
            created_at: now,
            updated_at: now,
            is_favorite: false,
            tags: Vec::new(),
            has_custom_css: false,
            has_custom_js: false,
            extra: Map::new(),
        }
    }
}

pub fn read_metadata(path: &Path) -> Result<NoteMetadata, AppError> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

pub fn write_metadata_atomic(path: &Path, metadata: &NoteMetadata) -> Result<(), AppError> {
    let mut bytes = serde_json::to_vec_pretty(metadata)?;
    bytes.push(b'\n');
    write_file_atomic(path, &bytes)
}

mod utc_millis {
    use chrono::{DateTime, SecondsFormat, Utc};
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(date: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&date.to_rfc3339_opts(SecondsFormat::Millis, true))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        DateTime::parse_from_rfc3339(&value)
            .map(|date| date.with_timezone(&Utc))
            .map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn metadata_round_trip_preserves_extra_fields_and_date_format() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("metadata.json");
        fs::write(
            &path,
            r#"{"id":"3f6c2a9e-8b1d-4c57-9e0a-2d4b7f1c5e88","title":"Not","createdAt":"2026-03-15T09:30:00.000Z","updatedAt":"2026-03-15T09:30:00.000Z","isFavorite":false,"tags":[],"hasCustomCss":false,"hasCustomJs":false,"future":{"enabled":true}}"#,
        )
        .unwrap();

        let mut metadata = read_metadata(&path).unwrap();
        metadata.title = "Yeni başlık".into();
        write_metadata_atomic(&path, &metadata).unwrap();
        let written = fs::read_to_string(&path).unwrap();
        assert!(written.contains("\n  \"title\": \"Yeni başlık\""));
        assert!(written.contains("\"createdAt\": \"2026-03-15T09:30:00.000Z\""));
        assert_eq!(read_metadata(&path).unwrap().extra["future"], serde_json::json!({"enabled": true}));
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn new_metadata_uses_v4_uuid_and_matching_dates() {
        let metadata = NoteMetadata::new("Başlık");
        assert_eq!(metadata.id.get_version_num(), 4);
        assert_eq!(metadata.created_at, metadata.updated_at);
        assert_eq!(metadata.title, "Başlık");
    }
}

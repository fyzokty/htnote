use serde::ser::{Serialize, SerializeStruct, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Note not found: {0}")]
    NotFound(String),
    #[error("Name conflict: {0}")]
    NameConflict(String),
    #[error("Invalid name: {0}")]
    InvalidName(String),
    #[error("Path outside root: {0}")]
    PathOutsideRoot(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Internal error: {0}")]
    Internal(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "NOTE_NOT_FOUND",
            Self::NameConflict(_) => "NAME_CONFLICT",
            Self::InvalidName(_) => "INVALID_NAME",
            Self::PathOutsideRoot(_) => "PATH_OUTSIDE_ROOT",
            Self::Io(_) => "IO_ERROR",
            Self::Json(_) => "JSON_ERROR",
            Self::Internal(_) => "INTERNAL",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut error = serializer.serialize_struct("AppError", 2)?;
        error.serialize_field("code", self.code())?;
        error.serialize_field("message", &self.to_string())?;
        error.end()
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn each_variant_serializes_with_its_code_and_message() {
        let cases = [
            (AppError::NotFound("missing".into()), "NOTE_NOT_FOUND"),
            (AppError::NameConflict("used".into()), "NAME_CONFLICT"),
            (AppError::InvalidName("bad".into()), "INVALID_NAME"),
            (
                AppError::PathOutsideRoot("outside".into()),
                "PATH_OUTSIDE_ROOT",
            ),
            (
                AppError::Io(std::io::Error::other("disk")),
                "IO_ERROR",
            ),
            (
                AppError::Json(serde_json::from_str::<serde_json::Value>("{").unwrap_err()),
                "JSON_ERROR",
            ),
            (AppError::Internal("failed".into()), "INTERNAL"),
        ];

        for (error, code) in cases {
            let message = error.to_string();
            let serialized = serde_json::to_value(error).expect("hata serileşmeli");
            assert_eq!(serialized, serde_json::json!({ "code": code, "message": message }));
        }
    }

    #[test]
    fn standard_errors_convert_to_app_error() {
        let io: AppError = std::io::Error::other("disk").into();
        let json: AppError = serde_json::from_str::<serde_json::Value>("{")
            .unwrap_err()
            .into();

        assert!(matches!(io, AppError::Io(_)));
        assert!(matches!(json, AppError::Json(_)));
    }
}

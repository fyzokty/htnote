use serde::ser::{Serialize, SerializeStruct, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Note not found: {0}")]
    NotFound(String),
    #[error("Not a folder: {0}")]
    NotAFolder(String),
    #[error("Name conflict: {0}")]
    NameConflict(String),
    #[error("Content conflict: {0}")]
    Conflict(String),
    #[error("Invalid name: {0}")]
    InvalidName(String),
    #[error("Invalid move: {0}")]
    InvalidMove(String),
    #[error("Invalid trash ID: {0}")]
    InvalidTrashId(String),
    #[error("File locked: {0}")]
    Locked(String),
    #[error("Path outside root: {0}")]
    PathOutsideRoot(String),
    #[error("Payload too large: {0} bytes")]
    PayloadTooLarge(usize),
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
            Self::NotAFolder(_) => "NOT_A_FOLDER",
            Self::NameConflict(_) => "NAME_CONFLICT",
            Self::Conflict(_) => "CONFLICT",
            Self::InvalidName(_) => "INVALID_NAME",
            Self::InvalidMove(_) => "INVALID_MOVE",
            Self::InvalidTrashId(_) => "INVALID_TRASH_ID",
            Self::Locked(_) => "FILE_LOCKED",
            Self::PathOutsideRoot(_) => "PATH_OUTSIDE_ROOT",
            Self::PayloadTooLarge(_) => "PAYLOAD_TOO_LARGE",
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
            (AppError::NotAFolder("note".into()), "NOT_A_FOLDER"),
            (AppError::NameConflict("used".into()), "NAME_CONFLICT"),
            (AppError::Conflict("changed".into()), "CONFLICT"),
            (AppError::InvalidName("bad".into()), "INVALID_NAME"),
            (AppError::InvalidMove("nested".into()), "INVALID_MOVE"),
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
            (AppError::PayloadTooLarge(52_428_801), "PAYLOAD_TOO_LARGE"),
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

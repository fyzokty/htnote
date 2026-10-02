pub mod single_html;
pub mod zip;
pub mod pdf;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub warnings: Vec<String>,
}

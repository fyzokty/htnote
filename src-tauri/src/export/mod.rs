pub mod single_html;
pub mod zip;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub warnings: Vec<String>,
}

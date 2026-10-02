pub mod single_html;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub warnings: Vec<String>,
}

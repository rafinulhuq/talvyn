//! Client-side PDF/DOCX text extraction, compiled to WebAssembly.
//!
//! Mirrors backend/app/services/parser_service.py so admins get the same
//! extracted text whether parsing happens in the browser or on the server
//! (the server-side path remains the fallback — see useJdParser.ts).

use std::io::{Cursor, Read};

use quick_xml::events::Event;
use quick_xml::reader::Reader;
use wasm_bindgen::prelude::*;
use zip::ZipArchive;

#[wasm_bindgen]
pub fn extract_pdf_text(bytes: &[u8]) -> Result<String, JsValue> {
    pdf_extract::extract_text_from_mem(bytes).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn extract_docx_text(bytes: &[u8]) -> Result<String, JsValue> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| JsValue::from_str(&format!("Cannot open DOCX (not a valid zip): {e}")))?;

    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|e| JsValue::from_str(&format!("Missing word/document.xml: {e}")))?
        .read_to_string(&mut xml)
        .map_err(|e| JsValue::from_str(&format!("Cannot read word/document.xml: {e}")))?;

    Ok(parse_document_xml(&xml))
}

/// Walks the WordprocessingML body in document order, mirroring the Python
/// `_extract_docx` logic: paragraphs become one block each, table rows are
/// joined with " | " and rows within a table joined with newlines.
fn parse_document_xml(xml: &str) -> String {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut parts: Vec<String> = Vec::new();

    // Paragraph state
    let mut in_paragraph = false;
    let mut para_text = String::new();

    // Table state — rows of cells, current row's cells, current cell text
    let mut in_table = false;
    let mut table_rows: Vec<Vec<String>> = Vec::new();
    let mut in_row = false;
    let mut row_cells: Vec<String> = Vec::new();
    let mut in_cell = false;
    let mut cell_text = String::new();

    let mut in_text_node = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = e.name();
                let local = local_name(name.as_ref());
                match local {
                    "tbl" => {
                        in_table = true;
                        table_rows.clear();
                    }
                    "tr" if in_table => {
                        in_row = true;
                        row_cells.clear();
                    }
                    "tc" if in_row => {
                        in_cell = true;
                        cell_text.clear();
                    }
                    "p" if !in_table => {
                        in_paragraph = true;
                        para_text.clear();
                    }
                    "t" => in_text_node = true,
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if in_text_node {
                    let text = String::from_utf8_lossy(e.as_ref());
                    if in_cell {
                        cell_text.push_str(&text);
                    } else if in_paragraph {
                        para_text.push_str(&text);
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = e.name();
                let local = local_name(name.as_ref());
                match local {
                    "t" => in_text_node = false,
                    "tc" if in_cell => {
                        in_cell = false;
                        let trimmed = cell_text.trim();
                        if !trimmed.is_empty() {
                            row_cells.push(trimmed.to_string());
                        }
                    }
                    "tr" if in_row => {
                        in_row = false;
                        if !row_cells.is_empty() {
                            table_rows.push(row_cells.clone());
                        }
                    }
                    "tbl" if in_table => {
                        in_table = false;
                        if !table_rows.is_empty() {
                            let joined = table_rows
                                .iter()
                                .map(|row| row.join(" | "))
                                .collect::<Vec<_>>()
                                .join("\n");
                            parts.push(joined);
                        }
                    }
                    "p" if in_paragraph => {
                        in_paragraph = false;
                        let trimmed = para_text.trim();
                        if !trimmed.is_empty() {
                            parts.push(trimmed.to_string());
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    parts.join("\n\n")
}

fn local_name(qname: &[u8]) -> &str {
    let s = std::str::from_utf8(qname).unwrap_or("");
    match s.rsplit_once(':') {
        Some((_, local)) => local,
        None => s,
    }
}

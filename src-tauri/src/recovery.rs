use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::Manager;

const RECOVERY_MAGIC: &[u8; 13] = b"ESE-RECOVERY\x01";
const RECOVERY_DIRECTORY: &str = "recovery";
const RECOVERY_FILENAME: &str = "last-session.bin";
const MAX_METADATA_STRING_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySession {
    archive_bytes: Vec<u8>,
    current_path: Option<String>,
    current_page_id: String,
    dirty: bool,
    edit_mode: bool,
    selected_circuit_id: Option<String>,
}

fn write_string(output: &mut Vec<u8>, value: Option<&str>) -> Result<(), String> {
    let Some(value) = value else {
        output.extend_from_slice(&u32::MAX.to_le_bytes());
        return Ok(());
    };
    let bytes = value.as_bytes();
    let length =
        u32::try_from(bytes.len()).map_err(|_| "Métadonnée de session trop longue".to_string())?;
    output.extend_from_slice(&length.to_le_bytes());
    output.extend_from_slice(bytes);
    Ok(())
}

fn read_u32(bytes: &[u8], cursor: &mut usize) -> Result<u32, String> {
    let end = cursor
        .checked_add(4)
        .ok_or("Session de récupération invalide")?;
    let raw: [u8; 4] = bytes
        .get(*cursor..end)
        .ok_or("Session de récupération tronquée")?
        .try_into()
        .map_err(|_| "Session de récupération invalide")?;
    *cursor = end;
    Ok(u32::from_le_bytes(raw))
}

fn read_string(bytes: &[u8], cursor: &mut usize) -> Result<Option<String>, String> {
    let length = read_u32(bytes, cursor)?;
    if length == u32::MAX {
        return Ok(None);
    }
    let length = length as usize;
    if length > MAX_METADATA_STRING_BYTES {
        return Err("Métadonnée de session anormalement longue".to_string());
    }
    let end = cursor
        .checked_add(length)
        .ok_or("Session de récupération invalide")?;
    let value = std::str::from_utf8(
        bytes
            .get(*cursor..end)
            .ok_or("Session de récupération tronquée")?,
    )
    .map_err(|_| "Métadonnée de session non UTF-8")?
    .to_string();
    *cursor = end;
    Ok(Some(value))
}

fn encode_recovery_session(session: &RecoverySession) -> Result<Vec<u8>, String> {
    let mut output = Vec::with_capacity(RECOVERY_MAGIC.len() + session.archive_bytes.len() + 128);
    output.extend_from_slice(RECOVERY_MAGIC);
    output.push(u8::from(session.dirty) | (u8::from(session.edit_mode) << 1));
    write_string(&mut output, session.current_path.as_deref())?;
    write_string(&mut output, Some(&session.current_page_id))?;
    write_string(&mut output, session.selected_circuit_id.as_deref())?;
    output.extend_from_slice(&session.archive_bytes);
    Ok(output)
}

fn decode_recovery_session(bytes: &[u8]) -> Result<RecoverySession, String> {
    if !bytes.starts_with(RECOVERY_MAGIC) {
        return Err("Signature de session de récupération inconnue".to_string());
    }
    let mut cursor = RECOVERY_MAGIC.len();
    let flags = *bytes
        .get(cursor)
        .ok_or("Session de récupération tronquée")?;
    cursor += 1;
    let current_path = read_string(bytes, &mut cursor)?;
    let current_page_id = read_string(bytes, &mut cursor)?.unwrap_or_default();
    let selected_circuit_id = read_string(bytes, &mut cursor)?;
    let archive_bytes = bytes
        .get(cursor..)
        .filter(|value| !value.is_empty())
        .ok_or("Archive du projet absente de la session")?
        .to_vec();
    Ok(RecoverySession {
        archive_bytes,
        current_path,
        current_page_id,
        dirty: flags & 1 != 0,
        edit_mode: flags & 2 != 0,
        selected_circuit_id,
    })
}

fn recovery_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Dossier privé ESE introuvable : {error}"))?;
    path.push(RECOVERY_DIRECTORY);
    path.push(RECOVERY_FILENAME);
    Ok(path)
}

#[tauri::command]
pub fn save_recovery_session(
    app: tauri::AppHandle,
    archive_bytes: Vec<u8>,
    current_path: Option<String>,
    current_page_id: String,
    dirty: bool,
    edit_mode: bool,
    selected_circuit_id: Option<String>,
) -> Result<(), String> {
    let session = RecoverySession {
        archive_bytes,
        current_path,
        current_page_id,
        dirty,
        edit_mode,
        selected_circuit_id,
    };
    let bytes = encode_recovery_session(&session)?;
    let target = recovery_path(&app)?;
    let parent = target.parent().ok_or("Dossier privé ESE invalide")?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Création du dossier de récupération impossible : {error}"))?;

    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Création de la récupération temporaire impossible : {error}"))?;
    temporary
        .write_all(&bytes)
        .map_err(|error| format!("Écriture de la récupération impossible : {error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("Synchronisation de la récupération impossible : {error}"))?;
    temporary.persist(&target).map_err(|error| {
        format!(
            "Remplacement de la récupération {} impossible : {}",
            target.display(),
            error.error
        )
    })?;
    Ok(())
}

#[tauri::command]
pub fn load_recovery_session(app: tauri::AppHandle) -> Result<Option<RecoverySession>, String> {
    let target = recovery_path(&app)?;
    if !target.exists() {
        return Ok(None);
    }
    let mut file = File::open(&target)
        .map_err(|error| format!("Ouverture de la récupération impossible : {error}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("Lecture de la récupération impossible : {error}"))?;
    decode_recovery_session(&bytes).map(Some)
}

#[tauri::command]
pub fn clear_recovery_session(app: tauri::AppHandle) -> Result<(), String> {
    let target = recovery_path(&app)?;
    match fs::remove_file(&target) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Suppression de la récupération impossible : {error}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_session_round_trip_preserves_project_and_context() {
        let session = RecoverySession {
            archive_bytes: vec![0x50, 0x4b, 3, 4, 9, 8, 7],
            current_path: Some("E:\\Documents\\moto.ese".to_string()),
            current_page_id: "page-111".to_string(),
            dirty: true,
            edit_mode: true,
            selected_circuit_id: Some("circuit-y-gr".to_string()),
        };
        let encoded = encode_recovery_session(&session).unwrap();
        assert_eq!(decode_recovery_session(&encoded).unwrap(), session);
    }

    #[test]
    fn corrupt_or_truncated_recovery_is_rejected() {
        assert!(decode_recovery_session(b"not-an-ese-session").is_err());
        assert!(decode_recovery_session(RECOVERY_MAGIC).is_err());
    }
}

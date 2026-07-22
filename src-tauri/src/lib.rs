use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

mod recovery;
mod share;

#[tauri::command]
fn read_binary(app: tauri::AppHandle, path: String) -> Result<Vec<u8>, String> {
    if path.starts_with("content://") {
        let file_path = path
            .parse::<FilePath>()
            .map_err(|error| format!("URI Android invalide : {error}"))?;
        return app
            .fs()
            .read(file_path)
            .map_err(|error| format!("Lecture Android impossible : {error}"));
    }

    let path = PathBuf::from(path);
    let mut file = File::open(&path).map_err(|error| format!("{}: {error}", path.display()))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("{}: {error}", path.display()))?;
    Ok(bytes)
}

#[tauri::command]
fn atomic_write(app: tauri::AppHandle, path: String, bytes: Vec<u8>) -> Result<(), String> {
    if path.starts_with("content://") {
        let file_path = path
            .parse::<FilePath>()
            .map_err(|error| format!("URI Android invalide : {error}"))?;
        let mut options = OpenOptions::new();
        options.write(true).truncate(true);
        let mut file = app
            .fs()
            .open(file_path, options)
            .map_err(|error| format!("Ouverture Android en écriture impossible : {error}"))?;
        file.write_all(&bytes)
            .map_err(|error| format!("Écriture Android impossible : {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Synchronisation Android impossible : {error}"))?;
        return Ok(());
    }

    let target = PathBuf::from(path);
    let parent = target
        .parent()
        .filter(|value| !value.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));

    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Création du fichier temporaire impossible : {error}"))?;
    temporary
        .write_all(&bytes)
        .map_err(|error| format!("Écriture impossible : {error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("Synchronisation impossible : {error}"))?;
    temporary.persist(&target).map_err(|error| {
        format!(
            "Remplacement de {} impossible : {}",
            target.display(),
            error.error
        )
    })?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(share::ShareManager::default())
        .setup(|_app| {
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings5;
                use windows_core::Interface;

                let window = _app
                    .get_webview_window("main")
                    .ok_or("Fenêtre principale ESE introuvable")?;
                window.with_webview(|webview| unsafe {
                    if let Ok(core_webview) = webview.controller().CoreWebView2() {
                        if let Ok(settings) = core_webview.Settings() {
                            if let Ok(settings5) = settings.cast::<ICoreWebView2Settings5>() {
                                // Tauri désactive cette option avec les raccourcis de zoom.
                                // ESE la réactive seule pour recevoir les gestes, tandis que
                                // le zoom de page WebView2 reste désactivé.
                                let _ = settings5.SetIsPinchZoomEnabled(true);
                            }
                        }
                    }
                })?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            read_binary,
            atomic_write,
            recovery::save_recovery_session,
            recovery::load_recovery_session,
            recovery::clear_recovery_session,
            share::share_network_capabilities,
            share::start_html_share,
            share::get_share_status,
            share::stop_html_share
        ])
        .run(tauri::generate_context!())
        .expect("ESE n’a pas pu démarrer");
}

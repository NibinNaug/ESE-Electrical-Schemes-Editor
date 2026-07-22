use serde::Serialize;
use std::sync::Mutex;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

const RELEASE_PATH_PREFIX: &str = "/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/";

#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    version: String,
    current_version: String,
    body: Option<String>,
    date: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum DownloadEvent {
    Started {
        #[serde(rename = "contentLength")]
        content_length: Option<u64>,
    },
    Progress {
        #[serde(rename = "chunkLength")]
        chunk_length: usize,
    },
    Finished,
}

fn validated_manifest_endpoint(endpoint: &str) -> Result<Url, String> {
    let url = Url::parse(endpoint).map_err(|error| format!("URL de mise à jour invalide : {error}"))?;
    let trusted = url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.path().starts_with(RELEASE_PATH_PREFIX)
        && url.path().ends_with("/latest.json")
        && url.query().is_none()
        && url.fragment().is_none();
    if !trusted {
        return Err("Le manifeste de mise à jour ne provient pas du dépôt GitHub officiel d’ESE.".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn check_desktop_update(
    app: AppHandle,
    endpoint: String,
    pending_update: State<'_, PendingUpdate>,
) -> Result<Option<UpdateMetadata>, String> {
    let endpoint = validated_manifest_endpoint(&endpoint)?;
    let update = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;

    let metadata = update.as_ref().map(|value| UpdateMetadata {
        version: value.version.clone(),
        current_version: value.current_version.clone(),
        body: value.body.clone(),
        date: value.date.map(|date| date.to_string()),
    });
    let mut slot = pending_update
        .0
        .lock()
        .map_err(|_| "L’état de mise à jour est indisponible.".to_string())?;
    *slot = update;
    Ok(metadata)
}

#[tauri::command]
pub async fn install_desktop_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let update = pending_update
        .0
        .lock()
        .map_err(|_| "L’état de mise à jour est indisponible.".to_string())?
        .take()
        .ok_or_else(|| "Aucune mise à jour vérifiée n’est en attente.".to_string())?;

    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    let _ = on_event.send(DownloadEvent::Started {
                        content_length,
                    });
                    started = true;
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|error| error.to_string())?;

    app.restart();
    #[allow(unreachable_code)]
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validated_manifest_endpoint;

    #[test]
    fn only_accepts_the_official_release_manifest() {
        assert!(validated_manifest_endpoint(
            "https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.2.0/latest.json"
        )
        .is_ok());
        assert!(validated_manifest_endpoint("https://example.com/latest.json").is_err());
        assert!(validated_manifest_endpoint(
            "https://github.com/NibinNaug/ESE-Electrical-Schemes-Editor/releases/download/v0.2.0/update.exe"
        )
        .is_err());
    }
}

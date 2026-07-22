use serde::Serialize;
use std::collections::HashSet;
use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::State;

const SINGLE_SHARE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const MAX_REQUEST_HEADER: usize = 8 * 1024;

#[derive(Default)]
pub struct ShareManager {
    active: Mutex<Option<Arc<ShareSession>>>,
}

struct ShareSession {
    session_id: String,
    token: String,
    url: String,
    filename: String,
    html: Arc<Vec<u8>>,
    multiple: bool,
    last_activity: Mutex<Instant>,
    active_connections: AtomicUsize,
    stop: AtomicBool,
    running: AtomicBool,
    completed_transfers: AtomicUsize,
    file_deliveries: AtomicUsize,
    bytes_sent: AtomicU64,
    acknowledged_clients: Mutex<HashSet<String>>,
    stop_reason: Mutex<Option<String>>,
    last_error: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareNetworkCapabilities {
    platform: &'static str,
    automatic_hotspot: bool,
    can_start_server: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareStartResult {
    session_id: String,
    url: String,
    multiple: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareStatus {
    session_id: String,
    url: String,
    running: bool,
    multiple: bool,
    completed_transfers: usize,
    file_deliveries: usize,
    bytes_sent: u64,
    stop_reason: Option<String>,
    last_error: Option<String>,
}

#[tauri::command]
pub fn share_network_capabilities() -> ShareNetworkCapabilities {
    ShareNetworkCapabilities {
        platform: std::env::consts::OS,
        // Android delegates hotspot ownership to the native LocalOnlyHotspot
        // adapter. Other platforms retain the existing manual-network workflow.
        automatic_hotspot: cfg!(target_os = "android"),
        can_start_server: true,
    }
}

#[tauri::command]
pub fn start_html_share(
    state: State<'_, ShareManager>,
    session_id: String,
    token: String,
    html: String,
    filename: String,
    multiple: bool,
    address_override: Option<String>,
) -> Result<ShareStartResult, String> {
    start_html_share_inner(
        &state,
        session_id,
        token,
        html,
        filename,
        multiple,
        address_override,
    )
}

#[tauri::command]
pub fn get_share_status(
    state: State<'_, ShareManager>,
    session_id: String,
) -> Result<ShareStatus, String> {
    let active = state
        .active
        .lock()
        .map_err(|_| "État du partage inaccessible.".to_string())?;
    let session = active
        .as_ref()
        .filter(|session| session.session_id == session_id)
        .ok_or_else(|| "Session de partage introuvable.".to_string())?;
    Ok(session.status())
}

#[tauri::command]
pub fn stop_html_share(
    state: State<'_, ShareManager>,
    session_id: String,
) -> Result<ShareStatus, String> {
    let active = state
        .active
        .lock()
        .map_err(|_| "État du partage inaccessible.".to_string())?;
    let session = active
        .as_ref()
        .filter(|session| session.session_id == session_id)
        .ok_or_else(|| "Session de partage introuvable.".to_string())?;
    session.request_stop("manual");
    Ok(session.status())
}

fn start_html_share_inner(
    manager: &ShareManager,
    session_id: String,
    token: String,
    html: String,
    filename: String,
    multiple: bool,
    address_override: Option<String>,
) -> Result<ShareStartResult, String> {
    validate_identifier(&session_id, "Identifiant de session")?;
    validate_identifier(&token, "Jeton de partage")?;
    if html.is_empty() {
        return Err("Le fichier HTML à partager est vide.".to_string());
    }

    let mut active = manager
        .active
        .lock()
        .map_err(|_| "État du partage inaccessible.".to_string())?;
    if active
        .as_ref()
        .is_some_and(|session| session.running.load(Ordering::Acquire))
    {
        return Err(
            "Un partage est déjà en cours. Termine-le avant d’en démarrer un autre.".to_string(),
        );
    }

    let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))
        .map_err(|error| format!("Démarrage du serveur local impossible : {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Configuration du serveur local impossible : {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Adresse du serveur local inaccessible : {error}"))?
        .port();
    let address = match address_override {
        Some(value) if !value.trim().is_empty() => validate_share_address(&value)?,
        _ => discover_lan_ipv4()?,
    };
    let url = format!("http://{address}:{port}/s/{token}");
    let filename = safe_filename(&filename);

    let session = Arc::new(ShareSession {
        session_id: session_id.clone(),
        token,
        url: url.clone(),
        filename,
        html: Arc::new(html.into_bytes()),
        multiple,
        last_activity: Mutex::new(Instant::now()),
        active_connections: AtomicUsize::new(0),
        stop: AtomicBool::new(false),
        running: AtomicBool::new(true),
        completed_transfers: AtomicUsize::new(0),
        file_deliveries: AtomicUsize::new(0),
        bytes_sent: AtomicU64::new(0),
        acknowledged_clients: Mutex::new(HashSet::new()),
        stop_reason: Mutex::new(None),
        last_error: Mutex::new(None),
    });
    *active = Some(Arc::clone(&session));
    drop(active);

    thread::spawn(move || run_server(listener, session));

    Ok(ShareStartResult {
        session_id,
        url,
        multiple,
    })
}

impl ShareSession {
    fn status(&self) -> ShareStatus {
        ShareStatus {
            session_id: self.session_id.clone(),
            url: self.url.clone(),
            running: self.running.load(Ordering::Acquire),
            multiple: self.multiple,
            completed_transfers: self.completed_transfers.load(Ordering::Acquire),
            file_deliveries: self.file_deliveries.load(Ordering::Acquire),
            bytes_sent: self.bytes_sent.load(Ordering::Acquire),
            stop_reason: self.stop_reason.lock().ok().and_then(|value| value.clone()),
            last_error: self.last_error.lock().ok().and_then(|value| value.clone()),
        }
    }

    fn request_stop(&self, reason: &str) {
        if let Ok(mut current) = self.stop_reason.lock() {
            if current.is_none() {
                *current = Some(reason.to_string());
            }
        }
        self.stop.store(true, Ordering::Release);
    }

    fn record_error(&self, error: String) {
        if let Ok(mut current) = self.last_error.lock() {
            *current = Some(error);
        }
        self.request_stop("error");
    }

    fn acknowledge(&self, client: String) {
        let inserted = self
            .acknowledged_clients
            .lock()
            .map(|mut clients| clients.insert(client))
            .unwrap_or(false);
        if inserted {
            self.completed_transfers.fetch_add(1, Ordering::AcqRel);
        }
        if !self.multiple {
            self.request_stop("completed");
        }
    }
}

fn run_server(listener: TcpListener, session: Arc<ShareSession>) {
    while !session.stop.load(Ordering::Acquire) {
        if !session.multiple
            && session.completed_transfers.load(Ordering::Acquire) == 0
            && session.active_connections.load(Ordering::Acquire) == 0
            && session
                .last_activity
                .lock()
                .map(|last_activity| last_activity.elapsed() >= SINGLE_SHARE_TIMEOUT)
                .unwrap_or(false)
        {
            session.request_stop("timeout");
            break;
        }

        match listener.accept() {
            Ok((stream, _)) => {
                if let Ok(mut last_activity) = session.last_activity.lock() {
                    *last_activity = Instant::now();
                }
                session.active_connections.fetch_add(1, Ordering::AcqRel);
                let session = Arc::clone(&session);
                thread::spawn(move || {
                    if let Err(error) = handle_connection(stream, &session) {
                        // A malformed or interrupted receiver must not kill a
                        // multi-recipient session. Only surface the latest error.
                        if let Ok(mut current) = session.last_error.lock() {
                            *current = Some(error);
                        }
                    }
                    if let Ok(mut last_activity) = session.last_activity.lock() {
                        *last_activity = Instant::now();
                    }
                    session.active_connections.fetch_sub(1, Ordering::AcqRel);
                });
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(25));
            }
            Err(error) => {
                session.record_error(format!("Erreur du serveur local : {error}"));
                break;
            }
        }
    }
    session.running.store(false, Ordering::Release);
}

fn handle_connection(mut stream: TcpStream, session: &ShareSession) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(8)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(60)))
        .map_err(|error| error.to_string())?;
    let request = read_request_head(&mut stream)?;
    let first_line = request
        .lines()
        .next()
        .ok_or_else(|| "Requête HTTP vide.".to_string())?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    let (path, query) = target.split_once('?').unwrap_or((target, ""));

    let shell_path = format!("/s/{}", session.token);
    let file_path = format!("/f/{}", session.token);
    let ack_path = format!("/a/{}", session.token);

    match (method, path) {
        ("GET", value) if value == shell_path => {
            let shell = receiver_shell(&session.token, &session.filename);
            write_response(
                &mut stream,
                "200 OK",
                "text/html; charset=utf-8",
                shell.as_bytes(),
                None,
            )?;
        }
        ("GET", value) if value == file_path => {
            write_response(
                &mut stream,
                "200 OK",
                "text/html; charset=utf-8",
                session.html.as_slice(),
                Some(&session.filename),
            )?;
            session.file_deliveries.fetch_add(1, Ordering::AcqRel);
            session
                .bytes_sent
                .fetch_add(session.html.len() as u64, Ordering::AcqRel);
        }
        ("POST", value) if value == ack_path => {
            let client = query_value(query, "client")
                .filter(|value| valid_client_identifier(value))
                .unwrap_or_else(|| "anonymous".to_string());
            write_response(
                &mut stream,
                "204 No Content",
                "text/plain; charset=utf-8",
                &[],
                None,
            )?;
            session.acknowledge(client);
        }
        _ => {
            write_response(
                &mut stream,
                "404 Not Found",
                "text/plain; charset=utf-8",
                b"Not found",
                None,
            )?;
        }
    }
    Ok(())
}

fn read_request_head(stream: &mut TcpStream) -> Result<String, String> {
    let mut bytes = Vec::with_capacity(1024);
    let mut chunk = [0_u8; 1024];
    while bytes.len() < MAX_REQUEST_HEADER {
        let read = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..read]);
        if bytes.windows(4).any(|value| value == b"\r\n\r\n") {
            return String::from_utf8(bytes).map_err(|_| "En-tête HTTP invalide.".to_string());
        }
    }
    Err("En-tête HTTP trop long ou incomplet.".to_string())
}

fn write_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
    download_name: Option<&str>,
) -> Result<(), String> {
    let disposition = download_name
        .map(|name| {
            format!(
                "Content-Disposition: inline; filename=\"{}\"\r\n",
                header_filename(name)
            )
        })
        .unwrap_or_default();
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n{disposition}Connection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(header.as_bytes())
        .and_then(|_| stream.write_all(body))
        .and_then(|_| stream.flush())
        .map_err(|error| format!("Envoi interrompu : {error}"))
}

fn receiver_shell(token: &str, filename: &str) -> String {
    let title = html_escape(filename);
    let file_url = js_string(&format!("/f/{token}"));
    let ack_url = js_string(&format!("/a/{token}"));
    let filename_js = js_string(filename);
    RECEIVER_TEMPLATE
        .replace("__TITLE__", &title)
        .replace("__FILE_URL__", &file_url)
        .replace("__ACK_URL__", &ack_url)
        .replace("__FILENAME__", &filename_js)
}

const RECEIVER_TEMPLATE: &str = r#"<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Réception de __TITLE__</title>
<style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:dark;background:#11151d;color:#eef2f8}*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;grid-template-rows:auto 1fr}.bar{display:flex;align-items:center;gap:.7rem;min-height:58px;padding:.65rem max(.8rem,env(safe-area-inset-right)) .65rem max(.8rem,env(safe-area-inset-left));background:#1b2230;border-bottom:1px solid #354054;box-shadow:0 2px 12px #0006;z-index:2}.state{min-width:0;flex:1}.state strong,.state span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.state span{margin-top:.15rem;color:#aeb8ca;font-size:.82rem}.actions{display:flex;gap:.45rem}a,button{border:1px solid #506078;border-radius:.55rem;padding:.55rem .75rem;background:#283347;color:#f7f9fc;font:inherit;text-decoration:none;cursor:pointer}a[aria-disabled=true],button:disabled{opacity:.45;pointer-events:none}.primary{background:#2773d7;border-color:#4b91ed}.viewer{width:100%;height:100%;border:0;background:#fff}.waiting{display:grid;place-items:center;padding:2rem;text-align:center;color:#b7c1d2}.progress{width:min(420px,80vw);height:8px;margin:1rem auto 0;overflow:hidden;border-radius:99px;background:#303a4c}.progress>i{display:block;width:5%;height:100%;background:#4b91ed;transition:width .15s}.hidden{display:none}@media(max-width:620px){.bar{align-items:stretch;flex-wrap:wrap}.state{flex-basis:100%}.actions{width:100%}.actions>*{flex:1;text-align:center}}
</style>
</head>
<body>
<header class="bar">
  <div class="state"><strong id="headline">Réception du schéma…</strong><span id="detail">Connexion à ESE</span></div>
  <div class="actions"><a id="download" class="primary" aria-disabled="true">Télécharger</a><button id="open" type="button" disabled>Nouvel onglet</button></div>
</header>
<main id="waiting" class="waiting"><div><strong>Le fichier est copié intégralement sur cet appareil.</strong><div class="progress"><i id="progress"></i></div></div></main>
<iframe id="viewer" class="viewer hidden" title="Schéma ESE reçu"></iframe>
<script>
(()=>{const fileUrl=__FILE_URL__,ackUrl=__ACK_URL__,filename=__FILENAME__;const id=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;const headline=document.querySelector('#headline'),detail=document.querySelector('#detail'),progress=document.querySelector('#progress'),waiting=document.querySelector('#waiting'),viewer=document.querySelector('#viewer'),download=document.querySelector('#download'),open=document.querySelector('#open');let blobUrl='';const fail=e=>{headline.textContent='Transfert interrompu';detail.textContent=e instanceof Error?e.message:String(e);progress.style.background='#e05263'};const receive=async()=>{const response=await fetch(`${fileUrl}?client=${encodeURIComponent(id)}`,{cache:'no-store'});if(!response.ok)throw new Error(`ESE a répondu ${response.status}`);const total=Number(response.headers.get('content-length'))||0;let bytes;if(response.body){const reader=response.body.getReader(),parts=[];let received=0;for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);received+=value.byteLength;detail.textContent=total?`${Math.round(received/total*100)} % · ${received.toLocaleString()} / ${total.toLocaleString()} octets`:`${received.toLocaleString()} octets`;progress.style.width=total?`${Math.min(100,received/total*100)}%`:'65%'}bytes=new Blob(parts,{type:'text/html;charset=utf-8'})}else{bytes=new Blob([await response.arrayBuffer()],{type:'text/html;charset=utf-8'})}blobUrl=URL.createObjectURL(bytes);download.href=blobUrl;download.download=filename;download.removeAttribute('aria-disabled');open.disabled=false;open.addEventListener('click',()=>window.open(blobUrl,'_blank','noopener'));viewer.addEventListener('load',async()=>{headline.textContent='Schéma reçu';detail.textContent=`${bytes.size.toLocaleString()} octets · disponible hors connexion`;progress.style.width='100%';try{await fetch(`${ackUrl}?client=${encodeURIComponent(id)}`,{method:'POST',cache:'no-store',keepalive:true})}catch{}},{once:true});viewer.src=blobUrl;waiting.classList.add('hidden');viewer.classList.remove('hidden')};receive().catch(fail);window.addEventListener('pagehide',()=>{if(blobUrl)URL.revokeObjectURL(blobUrl)},{once:true})})();
</script>
</body>
</html>"#;

fn discover_lan_ipv4() -> Result<Ipv4Addr, String> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .map_err(|error| format!("Détection du réseau local impossible : {error}"))?;
    socket
        .connect((Ipv4Addr::new(192, 0, 2, 1), 80))
        .map_err(|error| format!("Aucun réseau local utilisable : {error}"))?;
    match socket.local_addr() {
        Ok(SocketAddr::V4(address)) if !address.ip().is_loopback() && !address.ip().is_unspecified() => {
            Ok(*address.ip())
        }
        _ => Err("Aucune adresse IPv4 locale partageable n’a été trouvée. Connecte d’abord les appareils au même Wi‑Fi ou point d’accès.".to_string()),
    }
}

fn validate_share_address(value: &str) -> Result<Ipv4Addr, String> {
    let address = value
        .trim()
        .parse::<Ipv4Addr>()
        .map_err(|_| "Adresse IPv4 de partage invalide.".to_string())?;
    if address.is_loopback()
        || address.is_unspecified()
        || address.is_multicast()
        || address.is_link_local()
        || address.octets() == [255, 255, 255, 255]
    {
        Err("Adresse IPv4 de partage inutilisable.".to_string())
    } else {
        Ok(address)
    }
}

fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    if valid_client_identifier(value) && value.len() >= 16 && value.len() <= 200 {
        Ok(())
    } else {
        Err(format!("{label} invalide."))
    }
}

fn valid_client_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn safe_filename(value: &str) -> String {
    let value = value.trim();
    let mut filename: String = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect();
    if filename.is_empty() {
        filename = "schema-ESE.html".to_string();
    }
    if !filename.to_ascii_lowercase().ends_with(".html") {
        filename.push_str(".html");
    }
    filename
}

fn header_filename(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii() && character != '"' && character != '\\' {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn query_value(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (name, value) = pair.split_once('=')?;
        (name == key).then(|| value.to_string())
    })
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn js_string(value: &str) -> String {
    let mut result = String::from("\"");
    for character in value.chars() {
        match character {
            '\\' => result.push_str("\\\\"),
            '"' => result.push_str("\\\""),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            '<' => result.push_str("\\u003c"),
            '>' => result.push_str("\\u003e"),
            '&' => result.push_str("\\u0026"),
            value if value.is_control() => result.push_str(&format!("\\u{:04x}", value as u32)),
            value => result.push(value),
        }
    }
    result.push('"');
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Shutdown;

    fn test_session(token: &str, html: &str) -> Arc<ShareSession> {
        Arc::new(ShareSession {
            session_id: "12345678-1234-1234-1234-123456789abc".to_string(),
            token: token.to_string(),
            url: format!("http://127.0.0.1/s/{token}"),
            filename: "schema.html".to_string(),
            html: Arc::new(html.as_bytes().to_vec()),
            multiple: false,
            last_activity: Mutex::new(Instant::now()),
            active_connections: AtomicUsize::new(0),
            stop: AtomicBool::new(false),
            running: AtomicBool::new(true),
            completed_transfers: AtomicUsize::new(0),
            file_deliveries: AtomicUsize::new(0),
            bytes_sent: AtomicU64::new(0),
            acknowledged_clients: Mutex::new(HashSet::new()),
            stop_reason: Mutex::new(None),
            last_error: Mutex::new(None),
        })
    }

    fn request(address: SocketAddr, value: &str) -> String {
        let mut stream = TcpStream::connect(address).expect("test server connection");
        stream.write_all(value.as_bytes()).expect("write request");
        stream.shutdown(Shutdown::Write).expect("finish request");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("read response");
        response
    }

    #[test]
    fn sanitises_shared_filename() {
        assert_eq!(safe_filename("  Diagram: 111  "), "Diagram_ 111.html");
        assert_eq!(safe_filename("plan.html"), "plan.html");
    }

    #[test]
    fn receiver_shell_uses_private_routes_and_safe_literals() {
        let shell = receiver_shell("0123456789abcdef", "Diagram <111>.html");
        assert!(shell.contains("\"/f/0123456789abcdef\""));
        assert!(shell.contains("\"/a/0123456789abcdef\""));
        assert!(shell.contains("Diagram &lt;111&gt;.html"));
        assert!(shell.contains("Diagram \\u003c111\\u003e.html"));
        assert!(!shell.contains("__FILE_URL__"));
    }

    #[test]
    fn validates_unreserved_random_identifiers() {
        assert!(validate_identifier("12345678-1234-1234-1234-123456789abc", "id").is_ok());
        assert!(validate_identifier("short", "id").is_err());
        assert!(validate_identifier("123456789012345!", "id").is_err());
    }

    #[test]
    fn accepts_only_shareable_ipv4_overrides() {
        assert_eq!(
            validate_share_address("192.168.43.1").expect("private hotspot address"),
            Ipv4Addr::new(192, 168, 43, 1)
        );
        assert!(validate_share_address("127.0.0.1").is_err());
        assert!(validate_share_address("169.254.1.2").is_err());
        assert!(validate_share_address("not-an-address").is_err());
    }

    #[test]
    fn extracts_query_values_without_accepting_other_keys() {
        assert_eq!(
            query_value("foo=1&client=abc-123", "client"),
            Some("abc-123".to_string())
        );
        assert_eq!(query_value("foo=1", "client"), None);
    }

    #[test]
    fn serves_shell_file_and_stops_only_after_receiver_acknowledges() {
        let token = "0123456789abcdef";
        let html = "<!doctype html><title>ESE test</title>";
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("bind test server");
        listener
            .set_nonblocking(true)
            .expect("nonblocking test server");
        let address = listener.local_addr().expect("server address");
        let session = test_session(token, html);
        let server_session = Arc::clone(&session);
        let server = thread::spawn(move || run_server(listener, server_session));

        let shell = request(
            address,
            &format!("GET /s/{token} HTTP/1.1\r\nHost: localhost\r\n\r\n"),
        );
        assert!(shell.starts_with("HTTP/1.1 200 OK"));
        assert!(shell.contains(&format!("/f/{token}")));
        assert!(session.running.load(Ordering::Acquire));

        let file = request(
            address,
            &format!("GET /f/{token}?client=test-client HTTP/1.1\r\nHost: localhost\r\n\r\n"),
        );
        assert!(file.starts_with("HTTP/1.1 200 OK"));
        assert!(file.ends_with(html));
        assert_eq!(session.file_deliveries.load(Ordering::Acquire), 1);
        assert!(session.running.load(Ordering::Acquire));

        let ack = request(
            address,
            &format!("POST /a/{token}?client=test-client HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n"),
        );
        assert!(ack.starts_with("HTTP/1.1 204 No Content"));
        server.join().expect("server thread");
        assert!(!session.running.load(Ordering::Acquire));
        assert_eq!(session.completed_transfers.load(Ordering::Acquire), 1);
        assert_eq!(
            session.stop_reason.lock().unwrap().as_deref(),
            Some("completed")
        );
    }
}

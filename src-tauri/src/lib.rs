use tauri::{
    webview::{NewWindowResponse, WebviewWindowBuilder},
    WebviewUrl,
};

const APP_URL: &str = "https://www.deeptrans.studio/dashboard?desktop=1";
const DESKTOP_INIT_SCRIPT: &str = include_str!("desktop-init.js");

fn is_app_url(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("www.deeptrans.studio")
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
}

fn open_external_url(url: &tauri::Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
    }
}

#[cfg(test)]
mod tests {
    use super::is_app_url;

    #[test]
    fn allows_only_the_production_https_origin() {
        let allowed = tauri::Url::parse("https://www.deeptrans.studio/dashboard").unwrap();
        let http = tauri::Url::parse("http://www.deeptrans.studio/dashboard").unwrap();
        let lookalike =
            tauri::Url::parse("https://www.deeptrans.studio.example/dashboard").unwrap();
        let custom_port = tauri::Url::parse("https://www.deeptrans.studio:444/dashboard").unwrap();
        let user_info =
            tauri::Url::parse("https://attacker@www.deeptrans.studio/dashboard").unwrap();

        assert!(is_app_url(&allowed));
        assert!(!is_app_url(&http));
        assert!(!is_app_url(&lookalike));
        assert!(!is_app_url(&custom_port));
        assert!(!is_app_url(&user_info));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_url = APP_URL.parse().expect("DeepTrans Studio URL must be valid");

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url))
                .title("DeepTrans Studio")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1080.0, 700.0)
                .center()
                .resizable(true)
                .focused(true)
                .incognito(false)
                .devtools(cfg!(debug_assertions))
                .initialization_script(DESKTOP_INIT_SCRIPT)
                .disable_drag_drop_handler()
                .on_navigation(|url| {
                    if is_app_url(url) {
                        true
                    } else {
                        open_external_url(url);
                        false
                    }
                })
                .on_new_window(|url, _features| {
                    open_external_url(&url);
                    NewWindowResponse::Deny
                })
                .on_download(|_webview, _event| true)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run DeepTrans Studio desktop client");
}

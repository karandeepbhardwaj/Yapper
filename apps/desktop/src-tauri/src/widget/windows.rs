use tauri::Manager;

pub fn setup(app: &tauri::App) {
    if let Some(widget) = app.get_webview_window("widget") {
        if let Ok(Some(monitor)) = app.primary_monitor() {
            let sf = monitor.scale_factor();
            let sw = monitor.size().width as f64 / sf;
            let sh = monitor.size().height as f64 / sf;
            let win_size = 110.0;
            let _ = widget.set_position(tauri::LogicalPosition::new(
                (sw - win_size) / 2.0,
                sh - win_size - 80.0,
            ));
        }
    }
}

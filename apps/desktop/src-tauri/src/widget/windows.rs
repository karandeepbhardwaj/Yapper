use tauri::Manager;

struct WidgetCenter {
    x: std::sync::atomic::AtomicU64,
    y: std::sync::atomic::AtomicU64,
}

impl WidgetCenter {
    const fn new() -> Self {
        Self {
            x: std::sync::atomic::AtomicU64::new(0),
            y: std::sync::atomic::AtomicU64::new(0),
        }
    }
    fn store_pos(&self, x: f64, y: f64) {
        self.x.store(x.to_bits(), std::sync::atomic::Ordering::Relaxed);
        self.y.store(y.to_bits(), std::sync::atomic::Ordering::Relaxed);
    }
    fn load_pos(&self) -> (f64, f64) {
        (
            f64::from_bits(self.x.load(std::sync::atomic::Ordering::Relaxed)),
            f64::from_bits(self.y.load(std::sync::atomic::Ordering::Relaxed)),
        )
    }
}

static WIDGET_CENTER: WidgetCenter = WidgetCenter::new();

/// Cached scale factor (updated whenever we query the monitor DPI).
static WIDGET_SCALE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn store_scale(sf: f64) {
    WIDGET_SCALE.store(sf.to_bits(), std::sync::atomic::Ordering::Relaxed);
}

fn load_scale() -> f64 {
    let bits = WIDGET_SCALE.load(std::sync::atomic::Ordering::Relaxed);
    if bits == 0 { 1.0 } else { f64::from_bits(bits) }
}

/// Get widget position centered horizontally above the taskbar on the monitor
/// where the cursor currently is.
///
/// `w` and `h` are the widget's **logical** size. The function converts them
/// to physical pixels using the monitor's DPI and returns **(x, y) in physical
/// pixels**, top-left origin. Also updates the cached scale factor.
fn get_widget_position(w: f64, h: f64) -> Option<(f64, f64)> {
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows::Win32::Foundation::POINT;

    unsafe {
        let mut cursor = POINT::default();
        if GetCursorPos(&mut cursor).is_err() {
            return None;
        }

        let hmonitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };

        if !GetMonitorInfoW(hmonitor, &mut info).as_bool() {
            return None;
        }

        // Determine the scale factor for this monitor
        let mut dpi_x = 0u32;
        let mut dpi_y = 0u32;
        let sf = if GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y).is_ok() && dpi_x > 0 {
            dpi_x as f64 / 96.0
        } else {
            1.0
        };
        store_scale(sf);

        // Convert logical widget size to physical pixels
        let w_phys = w * sf;
        let h_phys = h * sf;

        // rcWork is in physical pixels and excludes the taskbar
        let work = info.rcWork;
        let work_w = (work.right - work.left) as f64;
        let x = work.left as f64 + (work_w - w_phys) / 2.0;
        // Position 4px (scaled) above the bottom of the work area
        let y = work.bottom as f64 - h_phys - 4.0 * sf;

        Some((x, y))
    }
}

fn is_mouse_near(center_x: f64, center_y: f64, radius: f64) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    use windows::Win32::Foundation::POINT;

    unsafe {
        let mut cursor = POINT::default();
        if GetCursorPos(&mut cursor).is_err() {
            return false;
        }
        let dx = cursor.x as f64 - center_x;
        let dy = cursor.y as f64 - center_y;
        (dx * dx + dy * dy).sqrt() <= radius
    }
}

fn is_left_mouse_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;

    // VK_LBUTTON = 0x01
    unsafe { GetAsyncKeyState(0x01) < 0 }
}

fn start_hover_thread(app_handle: tauri::AppHandle) {
    let hover_handle = app_handle.clone();
    std::thread::spawn(move || {
        use std::sync::atomic::{AtomicBool, Ordering};
        static WAS_HOVERING: AtomicBool = AtomicBool::new(false);
        static WAS_MOUSE_DOWN: AtomicBool = AtomicBool::new(false);

        // Wait for widget to be ready
        std::thread::sleep(std::time::Duration::from_secs(3));

        let mut last_x = 0.0f64;
        let mut last_y = 0.0f64;
        let mut tick = 0u32;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(80));
            tick = tick.wrapping_add(1);

            // Reposition widget every ~480ms
            if tick % 6 == 0 {
                let panel_w = 180.0;
                let panel_h = 34.0;
                if let Some((x, y)) = get_widget_position(panel_w, panel_h) {
                    if (x - last_x).abs() > 2.0 || (y - last_y).abs() > 2.0 {
                        if let Some(widget) = hover_handle.get_webview_window("widget") {
                            let _ = widget.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                        }
                        last_x = x;
                        last_y = y;
                        let sf = load_scale();
                        WIDGET_CENTER.store_pos(x + panel_w * sf / 2.0, y + panel_h * sf / 2.0);
                    }
                }
            }

            // Hover + click detection every tick (all in physical pixels)
            let (cx, cy) = WIDGET_CENTER.load_pos();
            if cx == 0.0 && cy == 0.0 { continue; }

            let sf = load_scale();
            let is_active = crate::stt::get_state() != crate::stt::State::Idle;
            let hovering = is_mouse_near(cx, cy, 40.0 * sf);
            let should_expand = hovering || is_active;
            let was = WAS_HOVERING.load(Ordering::Relaxed);
            if should_expand != was {
                WAS_HOVERING.store(should_expand, Ordering::Relaxed);

                if let Some(w) = hover_handle.get_webview_window("widget") {
                    let js = format!(
                        "window.dispatchEvent(new CustomEvent('yapper-hover', {{detail: {}}}))",
                        should_expand
                    );
                    let _ = w.eval(&js);
                }
            }

            // Click detection via polling GetAsyncKeyState
            let mouse_down = is_left_mouse_down();
            let was_down = WAS_MOUSE_DOWN.swap(mouse_down, Ordering::Relaxed);
            if mouse_down && !was_down && is_mouse_near(cx, cy, 35.0 * sf) {
                let h = hover_handle.clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::toggle_recording(&h).await;
                });
            }
        }
    });
}

pub fn setup(app: &tauri::App) {
    if let Some(widget) = app.get_webview_window("widget") {
        log::info!("[Widget] Windows setup starting");

        let _ = widget.set_size(tauri::LogicalSize::new(180.0, 34.0));

        // Set initial position (physical pixels)
        let panel_w = 180.0;
        let panel_h = 34.0;
        if let Some((x, y)) = get_widget_position(panel_w, panel_h) {
            let sf = load_scale();
            log::info!("[Widget] Positioning at ({}, {}), scale={}", x, y, sf);
            let _ = widget.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
            WIDGET_CENTER.store_pos(x + panel_w * sf / 2.0, y + panel_h * sf / 2.0);
        } else {
            log::warn!("[Widget] Could not determine widget position, using center fallback");
            // Fallback: center of primary monitor (use physical coordinates)
            if let Ok(Some(monitor)) = app.primary_monitor() {
                let sf = monitor.scale_factor();
                store_scale(sf);
                let sw = monitor.size().width as f64;
                let sh = monitor.size().height as f64;
                let phys_w = panel_w * sf;
                let phys_h = panel_h * sf;
                let x = (sw - phys_w) / 2.0;
                let y = sh - phys_h - 50.0 * sf;
                let _ = widget.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                WIDGET_CENTER.store_pos(x + phys_w / 2.0, y + phys_h / 2.0);
            }
        }

        // Ensure widget is visible and on top
        let _ = widget.show();
        let _ = widget.set_always_on_top(true);

        log::info!("[Widget] Windows setup complete");

        // Start hover/click/reposition thread
        start_hover_thread(app.handle().clone());
    } else {
        log::error!("[Widget] Could not find 'widget' window");
    }
}

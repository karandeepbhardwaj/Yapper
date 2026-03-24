use tauri::Manager;

// Global state for widget click detection from NSEvent callback
static mut GLOBAL_APP_HANDLE: Option<tauri::AppHandle> = None;

// Store the native NSPanel pointer for positioning from background threads
static WIDGET_PANEL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn store_panel(panel: cocoa::base::id) {
    WIDGET_PANEL.store(panel as u64, std::sync::atomic::Ordering::Relaxed);
}

fn load_panel() -> cocoa::base::id {
    WIDGET_PANEL.load(std::sync::atomic::Ordering::Relaxed) as cocoa::base::id
}

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

#[allow(deprecated)]
fn get_primary_screen_height() -> f64 {
    unsafe {
        use objc::*;
        let screens: cocoa::base::id = msg_send![class!(NSScreen), screens];
        let main_screen: cocoa::base::id = msg_send![screens, objectAtIndex: 0_usize];
        let frame: cocoa::foundation::NSRect = msg_send![main_screen, frame];
        frame.size.height
    }
}

#[allow(deprecated)]
fn get_widget_position(w: f64, h: f64) -> Option<(f64, f64)> {
    use cocoa::foundation::{NSPoint, NSRect};
    use objc::*;

    unsafe {
        let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];
        let screens: cocoa::base::id = msg_send![class!(NSScreen), screens];
        let count: usize = msg_send![screens, count];
        let primary_height = get_primary_screen_height();

        for i in 0..count {
            let screen: cocoa::base::id = msg_send![screens, objectAtIndex: i];
            let frame: NSRect = msg_send![screen, frame];
            let visible: NSRect = msg_send![screen, visibleFrame];

            if mouse_loc.x >= frame.origin.x
                && mouse_loc.x < frame.origin.x + frame.size.width
                && mouse_loc.y >= frame.origin.y
                && mouse_loc.y < frame.origin.y + frame.size.height
            {
                let x_bl = visible.origin.x + (visible.size.width - w) / 2.0;
                let y_bl = frame.origin.y + 4.0;

                let x_tl = x_bl;
                let y_tl = primary_height - y_bl - h;

                return Some((x_tl, y_tl));
            }
        }
    }
    None
}

#[allow(deprecated)]
fn is_mouse_near(center_x_logical: f64, center_y_logical: f64, radius_logical: f64) -> bool {
    use cocoa::foundation::NSPoint;
    use objc::*;

    unsafe {
        let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];
        let primary_height = get_primary_screen_height();

        let center_y_bl = primary_height - center_y_logical;

        let dx = mouse_loc.x - center_x_logical;
        let dy = mouse_loc.y - center_y_bl;

        (dx * dx + dy * dy).sqrt() <= radius_logical
    }
}

#[allow(deprecated)]
fn create_panel(handle: &tauri::AppHandle) {
    let Some(widget) = handle.get_webview_window("widget") else { return };
    let ns_window = widget.ns_window().unwrap() as cocoa::base::id;

    unsafe {
        use objc::*;
        use cocoa::foundation::NSPoint;

        let content_view: cocoa::base::id = msg_send![ns_window, contentView];
        let _: () = msg_send![content_view, retain];
        let frame: cocoa::foundation::NSRect = msg_send![ns_window, frame];

        let panel: cocoa::base::id = msg_send![class!(NSPanel), alloc];
        let panel: cocoa::base::id = msg_send![panel,
            initWithContentRect: frame
            styleMask: (1u64 << 7)
            backing: 2u64
            defer: false
        ];

        let _: () = msg_send![panel, setContentView: content_view];
        let _: () = msg_send![content_view, release];

        let _: () = msg_send![panel, setHidesOnDeactivate: false];
        let _: () = msg_send![panel, setAcceptsMouseMovedEvents: true];
        let _: () = msg_send![panel, setFloatingPanel: true];
        let _: () = msg_send![panel, setLevel: 25_i64];
        let _: () = msg_send![panel, setOpaque: false];
        let bg: cocoa::base::id = msg_send![class!(NSColor), clearColor];
        let _: () = msg_send![panel, setBackgroundColor: bg];
        let _: () = msg_send![panel, setHasShadow: false];
        let _: () = msg_send![panel, setCollectionBehavior:
            (1u64 | (1u64 << 4) | (1u64 << 6) | (1u64 << 8))];

        let panel_w = 180.0;
        let panel_h = 34.0;
        if let Some((x, y)) = get_widget_position(panel_w, panel_h) {
            let primary_h = get_primary_screen_height();
            let origin = NSPoint { x, y: primary_h - y - panel_h };
            let new_frame = cocoa::foundation::NSRect {
                origin,
                size: cocoa::foundation::NSSize { width: panel_w, height: panel_h },
            };
            let _: () = msg_send![panel, setFrame: new_frame display: true animate: false];
            WIDGET_CENTER.store_pos(x + panel_w / 2.0, y + panel_h / 2.0);
        }

        let _: () = msg_send![panel, orderFrontRegardless];
        let _: () = msg_send![ns_window, orderOut: cocoa::base::nil];

        let _: () = msg_send![panel, retain];
        store_panel(panel);
    }
}

#[allow(deprecated)]
fn swizzle_accepts_first_mouse(ns_window: cocoa::base::id) {
    unsafe {
        use objc::*;
        use objc::runtime::{Object, Sel, BOOL, YES};

        extern "C" fn accepts_first_mouse(_this: &Object, _cmd: Sel, _event: cocoa::base::id) -> BOOL {
            YES
        }

        let content_view: cocoa::base::id = msg_send![ns_window, contentView];
        let class = (*content_view).class();
        let sel = sel!(acceptsFirstMouse:);

        let method_added = class_addMethod(
            class as *const _ as *mut _,
            sel,
            accepts_first_mouse as extern "C" fn(&Object, Sel, cocoa::base::id) -> BOOL as *const _,
            b"B@:@\0".as_ptr() as *const _,
        );

        if !method_added {
            let _old = class_replaceMethod(
                class as *const _ as *mut _,
                sel,
                accepts_first_mouse as extern "C" fn(&Object, Sel, cocoa::base::id) -> BOOL as *const _,
                b"B@:@\0".as_ptr() as *const _,
            );
        }

        swizzle_subviews(content_view);
    }

    extern "C" {
        fn class_addMethod(
            cls: *mut std::ffi::c_void,
            name: objc::runtime::Sel,
            imp: *const std::ffi::c_void,
            types: *const std::ffi::c_char,
        ) -> bool;
        fn class_replaceMethod(
            cls: *mut std::ffi::c_void,
            name: objc::runtime::Sel,
            imp: *const std::ffi::c_void,
            types: *const std::ffi::c_char,
        ) -> *const std::ffi::c_void;
    }
}

#[allow(deprecated)]
fn swizzle_subviews(view: cocoa::base::id) {
    unsafe {
        use objc::*;
        use objc::runtime::{Object, Sel, BOOL, YES};

        extern "C" fn afm(_this: &Object, _cmd: Sel, _event: cocoa::base::id) -> BOOL {
            YES
        }

        extern "C" {
            fn class_addMethod(
                cls: *mut std::ffi::c_void,
                name: objc::runtime::Sel,
                imp: *const std::ffi::c_void,
                types: *const std::ffi::c_char,
            ) -> bool;
            fn class_replaceMethod(
                cls: *mut std::ffi::c_void,
                name: objc::runtime::Sel,
                imp: *const std::ffi::c_void,
                types: *const std::ffi::c_char,
            ) -> *const std::ffi::c_void;
        }

        let class = (*view).class();
        let sel = sel!(acceptsFirstMouse:);
        let added = class_addMethod(
            class as *const _ as *mut _,
            sel,
            afm as extern "C" fn(&Object, Sel, cocoa::base::id) -> BOOL as *const _,
            b"B@:@\0".as_ptr() as *const _,
        );
        if !added {
            let _ = class_replaceMethod(
                class as *const _ as *mut _,
                sel,
                afm as extern "C" fn(&Object, Sel, cocoa::base::id) -> BOOL as *const _,
                b"B@:@\0".as_ptr() as *const _,
            );
        }

        let subviews: cocoa::base::id = msg_send![view, subviews];
        let count: usize = msg_send![subviews, count];
        for i in 0..count {
            let subview: cocoa::base::id = msg_send![subviews, objectAtIndex: i];
            swizzle_subviews(subview);
        }
    }
}

fn start_hover_thread(app_handle: tauri::AppHandle) {
    let hover_handle = app_handle.clone();
    std::thread::spawn(move || {
        use std::sync::atomic::{AtomicBool, Ordering};
        static WAS_HOVERING: AtomicBool = AtomicBool::new(false);

        // Wait for panel to be created
        std::thread::sleep(std::time::Duration::from_secs(3));

        let mut last_x = 0.0f64;
        let mut last_y = 0.0f64;
        let mut tick = 0u32;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(80));
            tick = tick.wrapping_add(1);

            // Reposition panel every ~480ms
            if tick % 6 == 0 {
                let panel_w = 180.0;
                let panel_h = 34.0;
                if let Some((x, y)) = get_widget_position(panel_w, panel_h) {
                    if (x - last_x).abs() > 2.0 || (y - last_y).abs() > 2.0 {
                        let panel = load_panel();
                        if !panel.is_null() {
                            let _ = hover_handle.run_on_main_thread(move || {
                                let panel = load_panel();
                                if !panel.is_null() {
                                    #[allow(deprecated)]
                                    unsafe {
                                        use objc::*;
                                        use cocoa::foundation::NSPoint;
                                        let primary_h = get_primary_screen_height();
                                        let origin = NSPoint { x, y: primary_h - y - panel_h };
                                        let _: () = msg_send![panel, setFrameOrigin: origin];
                                    }
                                }
                            });
                        }
                        last_x = x;
                        last_y = y;
                        WIDGET_CENTER.store_pos(x + panel_w / 2.0, y + panel_h / 2.0);
                    }
                }
            }

            // Hover detection every tick
            let (cx, cy) = WIDGET_CENTER.load_pos();
            if cx == 0.0 && cy == 0.0 { continue; }

            let is_active = crate::stt::get_state() != crate::stt::State::Idle;
            let hovering = is_mouse_near(cx, cy, 40.0);
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
        }
    });
}

#[allow(deprecated)]
fn start_click_monitor(app_handle: tauri::AppHandle) {
    use block::ConcreteBlock;
    use std::sync::atomic::{AtomicBool, Ordering};

    static CLICK_READY: AtomicBool = AtomicBool::new(false);

    let click_handle = app_handle;

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(2));
        CLICK_READY.store(true, Ordering::Relaxed);

        unsafe {
            GLOBAL_APP_HANDLE = Some(click_handle);
        }

        unsafe {
            use objc::*;
            let mask: u64 = 1 << 1;

            let block = ConcreteBlock::new(move |event: cocoa::base::id| {
                if !CLICK_READY.load(Ordering::Relaxed) { return; }

                let loc: cocoa::foundation::NSPoint = msg_send![event, locationInWindow];
                let (cx, cy) = WIDGET_CENTER.load_pos();
                if cx == 0.0 && cy == 0.0 { return; }

                let screens: cocoa::base::id = msg_send![class!(NSScreen), screens];
                let main_screen: cocoa::base::id = msg_send![screens, objectAtIndex: 0_usize];
                let frame: cocoa::foundation::NSRect = msg_send![main_screen, frame];
                let screen_height = frame.size.height;
                let cy_bl = screen_height - cy;

                let dx = loc.x - cx;
                let dy = loc.y - cy_bl;
                let dist = (dx * dx + dy * dy).sqrt();

                if dist <= 35.0 {
                    if let Some(ref handle) = GLOBAL_APP_HANDLE {
                        let h = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            crate::commands::toggle_recording(&h).await;
                        });
                    }
                }
            });
            let block = block.copy();

            let _monitor: cocoa::base::id = msg_send![
                class!(NSEvent),
                addGlobalMonitorForEventsMatchingMask: mask
                handler: &*block
            ];

            std::mem::forget(block);
        }
    });
}

pub fn setup(app: &tauri::App) {
    if let Some(widget) = app.get_webview_window("widget") {
        // Hide original widget — panel will replace it
        let _ = widget.hide();

        // Create NSPanel after webview loads (must be on main thread)
        let panel_handle = app.handle().clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let h = panel_handle.clone();
            let _ = panel_handle.run_on_main_thread(move || {
                create_panel(&h);
            });
        });

        // Swizzle acceptsFirstMouse on the content view
        #[allow(deprecated)]
        {
            let ns_window = widget.ns_window().unwrap() as cocoa::base::id;
            swizzle_accepts_first_mouse(ns_window);
        }

        let app_handle = app.handle().clone();

        // Start hover/reposition thread
        start_hover_thread(app_handle.clone());

        // Start click detection
        start_click_monitor(app_handle);
    }
}

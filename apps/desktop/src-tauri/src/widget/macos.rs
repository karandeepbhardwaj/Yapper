use std::ptr::NonNull;
use tauri::Manager;

use objc2::{MainThreadMarker, MainThreadOnly};
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Sel};
use objc2_app_kit::{
    NSBackingStoreType, NSColor, NSEvent, NSEventMask, NSPanel, NSWindowCollectionBehavior,
    NSWindowStyleMask,
};
use objc2_foundation::{NSPoint, NSRect, NSSize};
use block2::RcBlock;

// Global state for widget click detection from NSEvent callback
static mut GLOBAL_APP_HANDLE: Option<tauri::AppHandle> = None;

// Store the native NSPanel for positioning from background threads.
// We store a raw pointer as usize in an atomic because Retained<NSPanel>
// is not Send. We manually retain/release to manage the reference count.
static WIDGET_PANEL: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

fn store_panel(panel: &Retained<NSPanel>) {
    let ptr = Retained::as_ptr(panel) as usize;
    // Extra retain so the panel stays alive when stored as raw pointer
    let _extra: Retained<NSPanel> = panel.clone();
    std::mem::forget(_extra);
    WIDGET_PANEL.store(ptr, std::sync::atomic::Ordering::Relaxed);
}

/// Load the panel pointer. Returns None if no panel stored.
/// SAFETY: The caller must ensure AppKit operations happen on the main thread.
fn load_panel_ptr() -> Option<*const NSPanel> {
    let ptr = WIDGET_PANEL.load(std::sync::atomic::Ordering::Relaxed);
    if ptr == 0 { None } else { Some(ptr as *const NSPanel) }
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

fn get_primary_screen_height() -> f64 {
    // We call this from background threads, so use new_unchecked
    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let screens = objc2_app_kit::NSScreen::screens(mtm);
    if screens.count() == 0 {
        return 0.0;
    }
    let main_screen = screens.objectAtIndex(0);
    main_screen.frame().size.height
}

fn get_widget_position(w: f64, h: f64) -> Option<(f64, f64)> {
    let mouse_loc = NSEvent::mouseLocation();
    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let screens = objc2_app_kit::NSScreen::screens(mtm);
    let primary_height = get_primary_screen_height();

    // Detect full-screen mode via presentation options.
    // In full-screen, dock is hidden even if pinned — position widget at screen bottom.
    // NSApplicationPresentationAutoHideDock = 1, NSApplicationPresentationHideDock = 2
    let dock_overridden = unsafe {
        let ns_app = AnyClass::get(c"NSApplication").unwrap();
        let app: *mut AnyObject = objc2::msg_send![ns_app, sharedApplication];
        let options: usize = objc2::msg_send![&*app, currentSystemPresentationOptions];
        (options & 0b11) != 0
    };

    for i in 0..screens.count() {
        let screen = screens.objectAtIndex(i);
        let frame = screen.frame();
        let visible = screen.visibleFrame();

        if mouse_loc.x >= frame.origin.x
            && mouse_loc.x < frame.origin.x + frame.size.width
            && mouse_loc.y >= frame.origin.y
            && mouse_loc.y < frame.origin.y + frame.size.height
        {
            let x_bl = visible.origin.x + (visible.size.width - w) / 2.0;
            let y_bl = if dock_overridden {
                // Full-screen or app-driven auto-hide: dock not visible, go to bottom
                frame.origin.y + 4.0
            } else {
                // Normal mode: visibleFrame excludes pinned dock, equals frame for auto-hide
                visible.origin.y + 4.0
            };

            let x_tl = x_bl;
            let y_tl = primary_height - y_bl - h;

            return Some((x_tl, y_tl));
        }
    }
    None
}

fn is_mouse_near(center_x_logical: f64, center_y_logical: f64, radius_logical: f64) -> bool {
    let mouse_loc = NSEvent::mouseLocation();
    let primary_height = get_primary_screen_height();

    let center_y_bl = primary_height - center_y_logical;
    let dx = mouse_loc.x - center_x_logical;
    let dy = mouse_loc.y - center_y_bl;

    (dx * dx + dy * dy).sqrt() <= radius_logical
}

fn create_panel(handle: &tauri::AppHandle) {
    let Some(widget) = handle.get_webview_window("widget") else { return };
    let ns_window_ptr = widget.ns_window().unwrap() as *mut AnyObject;
    // SAFETY: ns_window is a valid NSWindow pointer from Tauri
    let ns_window: &objc2_app_kit::NSWindow = unsafe { &*(ns_window_ptr as *const objc2_app_kit::NSWindow) };

    let content_view = ns_window.contentView().expect("widget has no content view");
    let frame = ns_window.frame();

    let mtm = MainThreadMarker::from(ns_window);

    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
        NSPanel::alloc(mtm),
        frame,
        NSWindowStyleMask::NonactivatingPanel,
        NSBackingStoreType(2), // NSBackingStoreBuffered
        false,
    );

    // Move webview into panel
    panel.setContentView(Some(&content_view));

    // Configure for cross-Space visibility
    panel.setHidesOnDeactivate(false);
    panel.setAcceptsMouseMovedEvents(true);
    panel.setFloatingPanel(true);
    panel.setLevel(25);
    panel.setOpaque(false);
    let clear = NSColor::clearColor();
    panel.setBackgroundColor(Some(&clear));
    panel.setHasShadow(false);

    let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::IgnoresCycle
        | NSWindowCollectionBehavior::FullScreenAuxiliary;
    panel.setCollectionBehavior(behavior);

    // Position above dock — panel is tall (300px) but pill sits at bottom
    let panel_w = 220.0;
    let panel_h = 80.0;
    if let Some((x, y)) = get_widget_position(panel_w, panel_h) {
        let primary_h = get_primary_screen_height();
        let origin = NSPoint::new(x, primary_h - y - panel_h);
        let new_frame = NSRect::new(origin, NSSize::new(panel_w, panel_h));
        panel.setFrame_display_animate(new_frame, true, false);
        // Hover center is at the pill at the bottom of the panel
        WIDGET_CENTER.store_pos(x + panel_w / 2.0, y + panel_h - 17.0);
    }

    // Start with mouse events ignored — clicks pass through to dock/desktop
    // Hover thread will enable them when user hovers near the pill
    unsafe { objc2::msg_send![&panel, setIgnoresMouseEvents: true] }

    // Show panel, hide original window
    panel.orderFrontRegardless();
    ns_window.orderOut(None);

    // Store panel (retains it)
    store_panel(&panel);
}

fn swizzle_accepts_first_mouse(ns_window_ptr: *mut std::ffi::c_void) {
    // The swizzle code uses raw ObjC runtime functions because objc2 doesn't
    // wrap method swizzling. We use objc2's msg_send! for safety where possible.
    unsafe {
        let ns_window = ns_window_ptr as *mut AnyObject;
        let content_view: *mut AnyObject = objc2::msg_send![&*ns_window, contentView];
        if content_view.is_null() { return; }

        swizzle_view_recursive(&*content_view);
    }
}

unsafe fn swizzle_view_recursive(view: &AnyObject) {
    extern "C" fn accepts_first_mouse(
        _this: &AnyObject,
        _cmd: Sel,
        _event: *mut AnyObject,
    ) -> objc2::runtime::Bool {
        objc2::runtime::Bool::YES
    }

    extern "C" {
        fn class_addMethod(
            cls: *mut std::ffi::c_void,
            name: Sel,
            imp: *const std::ffi::c_void,
            types: *const std::ffi::c_char,
        ) -> bool;
        fn class_replaceMethod(
            cls: *mut std::ffi::c_void,
            name: Sel,
            imp: *const std::ffi::c_void,
            types: *const std::ffi::c_char,
        ) -> *const std::ffi::c_void;
    }

    let class = view.class() as *const _ as *mut std::ffi::c_void;
    let sel = objc2::sel!(acceptsFirstMouse:);
    let imp = accepts_first_mouse as *const std::ffi::c_void;
    let types = b"B@:@\0".as_ptr() as *const std::ffi::c_char;

    let added = class_addMethod(class, sel, imp, types);
    if !added {
        let _ = class_replaceMethod(class, sel, imp, types);
    }

    // Recurse into subviews
    let subviews: *mut AnyObject = objc2::msg_send![view, subviews];
    if !subviews.is_null() {
        let count: usize = objc2::msg_send![&*subviews, count];
        for i in 0..count {
            let subview: *mut AnyObject = objc2::msg_send![&*subviews, objectAtIndex: i];
            if !subview.is_null() {
                swizzle_view_recursive(&*subview);
            }
        }
    }
}

fn start_hover_thread(app_handle: tauri::AppHandle) {
    let hover_handle = app_handle.clone();
    std::thread::spawn(move || {
        use std::sync::atomic::{AtomicBool, Ordering};
        static WAS_HOVERING: AtomicBool = AtomicBool::new(false);

        std::thread::sleep(std::time::Duration::from_secs(3));

        let mut tick = 0u32;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(80));
            tick = tick.wrapping_add(1);

            if tick % 6 == 0 {
                let _ = hover_handle.run_on_main_thread(move || {
                    let panel_w = 220.0;
                    let panel_h = 300.0;
                    if let Some((x, y)) = get_widget_position(panel_w, panel_h) {
                        if let Some(panel_ptr) = load_panel_ptr() {
                            let panel: &NSPanel = unsafe { &*panel_ptr };
                            let primary_h = get_primary_screen_height();
                            let origin = NSPoint::new(x, primary_h - y - panel_h);
                            panel.setFrameOrigin(origin);
                        }
                        WIDGET_CENTER.store_pos(x + panel_w / 2.0, y + panel_h - 17.0);
                    }
                });
            }

            let (cx, cy) = WIDGET_CENTER.load_pos();
            if cx == 0.0 && cy == 0.0 { continue; }

            let is_active = crate::stt::get_state() != crate::stt::State::Idle;
            let hovering = is_mouse_near(cx, cy, 50.0);
            let should_expand = hovering || is_active;
            let was = WAS_HOVERING.load(Ordering::Relaxed);
            if should_expand != was {
                WAS_HOVERING.store(should_expand, Ordering::Relaxed);

                // Toggle mouse event passthrough — ignore when not hovering
                let ignore_mouse = !should_expand;
                let toggle_handle = hover_handle.clone();
                let _ = hover_handle.run_on_main_thread(move || {
                    if let Some(panel_ptr) = load_panel_ptr() {
                        let panel: &NSPanel = unsafe { &*panel_ptr };
                        unsafe { objc2::msg_send![panel, setIgnoresMouseEvents: ignore_mouse] }
                    }
                });

                if let Some(w) = toggle_handle.get_webview_window("widget") {
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

fn start_click_monitor(app_handle: tauri::AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static CLICK_READY: AtomicBool = AtomicBool::new(false);

    let click_handle = app_handle;

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(2));
        CLICK_READY.store(true, Ordering::Relaxed);

        unsafe {
            GLOBAL_APP_HANDLE = Some(click_handle);
        }

        let mask = NSEventMask::LeftMouseDown;
        let block = RcBlock::new(|event: NonNull<NSEvent>| {
            if !CLICK_READY.load(Ordering::Relaxed) { return; }

            // For global events, locationInWindow is screen location
            let event_ref = unsafe { event.as_ref() };
            let loc = event_ref.locationInWindow();
            let (cx, cy) = WIDGET_CENTER.load_pos();
            if cx == 0.0 && cy == 0.0 { return; }

            let screen_height = get_primary_screen_height();
            let cy_bl = screen_height - cy;

            let dx = loc.x - cx;
            let dy = loc.y - cy_bl;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist <= 35.0 {
                unsafe {
                    if let Some(ref handle) = GLOBAL_APP_HANDLE {
                        let h = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            crate::commands::toggle_recording(&h).await;
                        });
                    }
                }
            }
        });

        let _monitor = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &block);

        // Keep block and monitor alive forever
        std::mem::forget(block);
        if let Some(monitor) = _monitor {
            std::mem::forget(monitor);
        }
    });
}

pub fn setup(app: &tauri::App) {
    if let Some(widget) = app.get_webview_window("widget") {
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
        let ns_window = widget.ns_window().unwrap();
        swizzle_accepts_first_mouse(ns_window);

        let app_handle = app.handle().clone();
        start_hover_thread(app_handle.clone());
        start_click_monitor(app_handle);
    }
}

pub fn capture_full_screen() -> Result<Vec<u8>, String> {
    Err("Screen capture on Windows not yet implemented".to_string())
}

pub fn capture_region(_x: i32, _y: i32, _width: u32, _height: u32) -> Result<Vec<u8>, String> {
    Err("Screen capture on Windows not yet implemented".to_string())
}

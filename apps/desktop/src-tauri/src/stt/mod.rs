use std::sync::Mutex;
use once_cell::sync::Lazy;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum State {
    Idle,
    Recording,
    Processing,
}

static STATE: Lazy<Mutex<State>> = Lazy::new(|| Mutex::new(State::Idle));

pub fn get_state() -> State {
    *STATE.lock().unwrap()
}

pub fn set_state(new: State) {
    *STATE.lock().unwrap() = new;
}

/// Try to transition from expected → new. Returns true if successful.
pub fn transition(expected: State, new: State) -> bool {
    let mut state = STATE.lock().unwrap();
    if *state == expected {
        *state = new;
        true
    } else {
        false
    }
}

use std::process::{Command, Stdio};

use crate::runtime::RUNTIME;

pub fn execute(python_code: &str) -> Result<(), String> {
    let full = format!("{}\n{}", RUNTIME, python_code);

    let status = Command::new("python3")
        .arg("-c")
        .arg(&full)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("Failed to run python3: {}", e))?;

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        return Err(format!("python3 exited with code {}", code));
    }

    Ok(())
}

#[allow(dead_code)]
pub fn compile_only(python_code: &str) {
    println!("{}", python_code);
}

use std::process::{Command, Stdio};

use crate::runtime::RUNTIME;

pub fn execute(python_code: &str) -> Result<(), String> {
    let wrapped = format!(
        "{}try:\n{}\nexcept BaseException:\n    sys.exit(1)\n",
        RUNTIME,
        python_code
            .lines()
            .map(|l| format!("    {}", l))
            .collect::<Vec<_>>()
            .join("\n"),
    );

    let mut child = Command::new("python3")
        .arg("-c")
        .arg(&wrapped)
        .stdout(Stdio::inherit())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to run python3: {}", e))?;

    let status = child.wait().map_err(|e| format!("Failed to wait for python3: {}", e))?;

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        return Err(format!("runtime error (code {})", code));
    }

    Ok(())
}

#[allow(dead_code)]
pub fn compile_only(python_code: &str) {
    println!("{}", python_code);
}

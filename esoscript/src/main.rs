mod ast;
mod parser;
mod transpiler;
mod runtime;
mod executor;

use std::fs;
use std::process;
use clap::{Parser as ClapParser, Subcommand};

#[derive(ClapParser)]
#[command(name = "esc", version = "0.1.0")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Execute script
    Run {
        #[arg(value_name = "FILE")]
        file: String,
        #[arg(long, hide = true)]
        experiment: bool,
        #[arg(long, hide = true)]
        reveal: bool,
    },
    /// List available stdlib functions
    Stdlib,
}

fn transpile(file: &str, experiment: bool) -> (String, Vec<String>) {
    let source = fs::read_to_string(file).unwrap_or_else(|e| {
        eprintln!("error: cannot read '{}': {}", file, e);
        process::exit(1);
    });

    let mut parser = parser::Parser::new(&source);
    let program = parser.parse();

    let mut transpiler = transpiler::Transpiler::new(experiment);
    let python = transpiler.transpile_program(&program);

    (python, transpiler.trace)
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Run {
            file,
            experiment,
            reveal,
        } => {
            let (python, trace) = transpile(&file, experiment);

            if experiment {
                for line in &trace {
                    eprintln!("{}", line);
                }
            }

            if reveal {
                println!("{}", python);
            } else {
                if let Err(e) = executor::execute(&python) {
                    eprintln!("error: {}", e);
                    process::exit(1);
                }
            }
        }
        Commands::Stdlib => {
            println!("respire");
            println!("anchor");
            println!("trace_ox");
            println!("mirror");
            println!("is_zero");
            println!("heavy");
        }
    }
}

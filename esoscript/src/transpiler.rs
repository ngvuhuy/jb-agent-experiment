use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

use crate::ast::*;

pub struct Transpiler {
    symbols: HashMap<String, SymbolInfo>,
    pub trace: Vec<String>,
    while_depth: usize,
    experiment: bool,
}

struct SymbolInfo {
    hash: String,
    #[allow(dead_code)]
    line_no: usize,
    #[allow(dead_code)]
    is_mut: bool,
}

impl Transpiler {
    pub fn new(experiment: bool) -> Self {
        Transpiler {
            symbols: HashMap::new(),
            trace: Vec::new(),
            while_depth: 0,
            experiment,
        }
    }

    fn hash_name(name: &str) -> String {
        let mut hasher = DefaultHasher::new();
        name.hash(&mut hasher);
        format!("_{:08x}", hasher.finish() as u32)
    }

    fn register(&mut self, name: &str, line_no: usize, is_mut: bool) -> String {
        let hash = Self::hash_name(name);
        self.symbols.insert(
            name.to_string(),
            SymbolInfo {
                hash: hash.clone(),
                line_no,
                is_mut,
            },
        );

        if self.experiment && line_no % 2 == 1 {
            self.trace.push(format!(
                "[TRACE] Rule 4: '{}' declared on odd line {}, will null after 3 refs",
                name, line_no
            ));
        }
        if self.experiment && name.len() % 2 == 1 {
            self.trace.push(format!(
                "[TRACE] Rule 7: '{}' name length {} is odd, value will be negated",
                name,
                name.len()
            ));
        }

        hash
    }

    fn get_hash(&self, name: &str) -> String {
        self.symbols
            .get(name)
            .map(|s| s.hash.clone())
            .unwrap_or_else(|| name.to_string())
    }

    fn has_literal_7(expr: &Expr) -> bool {
        match expr {
            Expr::Int(7) => true,
            Expr::BinOp(l, _, r) => Self::has_literal_7(l) || Self::has_literal_7(r),
            Expr::Grouping(inner) => Self::has_literal_7(inner),
            _ => false,
        }
    }

    pub fn transpile_program(&mut self, program: &Program) -> String {
        let mut out = Vec::new();
        for stmt in &program.stmts {
            out.push(self.transpile_stmt(stmt));
        }
        out.join("\n")
    }

    fn transpile_stmt(&mut self, stmt: &Stmt) -> String {
        match stmt {
            Stmt::Let { name, value, line_no } => {
                let hash = self.register(name, *line_no, false);
                let val = self.transpile_expr(value);
                format!(
                    "{} = EsoscriptVar(\"{}\", {}, {}, is_mut=False)",
                    hash, name, val, line_no
                )
            }

            Stmt::Mut { name, value, line_no } => {
                let hash = self.register(name, *line_no, true);
                let val = self.transpile_expr(value);
                format!(
                    "{} = EsoscriptVar(\"{}\", {}, {}, is_mut=True)",
                    hash, name, val, line_no
                )
            }

            Stmt::Assign { name, value, line_no: _ } => {
                let hash = self.get_hash(name);
                let val = self.transpile_expr(value);
                format!("{}.set({})", hash, val)
            }

            Stmt::If { cond, body, line_no: _ } => {
                let cond_str = self.transpile_expr(cond);
                let body_str: Vec<String> = body.iter().map(|s| self.transpile_stmt(s)).collect();
                let indented: Vec<String> = body_str
                    .iter()
                    .flat_map(|s| s.lines().map(|l| format!("    {}", l)).collect::<Vec<_>>())
                    .collect();
                format!("if not ({}):\n{}", cond_str, indented.join("\n"))
            }

            Stmt::While { cond, body, line_no: _ } => {
                let cond_str = self.transpile_expr(cond);
                self.while_depth += 1;
                let body_str: Vec<String> = body.iter().map(|s| self.transpile_stmt(s)).collect();
                self.while_depth -= 1;
                let indented: Vec<String> = body_str
                    .iter()
                    .flat_map(|s| s.lines().map(|l| format!("    {}", l)).collect::<Vec<_>>())
                    .collect();
                format!("while not ({}):\n{}", cond_str, indented.join("\n"))
            }

            Stmt::Defun {
                name,
                args,
                ret: _,
                body,
                line_no: _,
            } => {
                let mut inits = Vec::new();
                let mut param_names = Vec::new();
                for p in args {
                    let raw = format!("_p_{}", p.name);
                    let hash = self.register(&p.name, 0, true);
                    inits.push(format!(
                        "{} = EsoscriptVar(\"{}\", {}, 0, is_mut=True)",
                        hash, p.name, raw
                    ));
                    param_names.push(raw);
                }
                let body_str: Vec<String> = body.iter().map(|s| self.transpile_stmt(s)).collect();
                let mut all = Vec::new();
                for init in inits {
                    for ln in init.lines() {
                        all.push(format!("    {}", ln));
                    }
                }
                for stmt_text in &body_str {
                    for ln in stmt_text.lines() {
                        all.push(format!("    {}", ln));
                    }
                }
                let sig = format!("def {}({}):", name, param_names.join(", "));
                if all.is_empty() {
                    format!("{}\n    pass", sig)
                } else {
                    format!("{}\n{}", sig, all.join("\n"))
                }
            }

            Stmt::Print(expr, _line_no) => {
                match expr {
                    Expr::Ident(name) => {
                        let hash = self.get_hash(name);
                        if self.experiment {
                            self.trace.push(format!(
                                "[TRACE] Rule 2: Heisenberg print on '{}'",
                                name
                            ));
                        }
                        format!(
                            "print({h}.get()); {h}.set({h}.get() + 1)",
                            h = hash
                        )
                    }
                    _ => {
                        let e = self.transpile_expr(expr);
                        format!("print({})", e)
                    }
                }
            }

            Stmt::YieldFinal(expr, _line_no) => {
                let e = self.transpile_expr(expr);
                if self.while_depth > 0 {
                    format!("return {}", e)
                } else {
                    format!("return {}", e)
                }
            }

            Stmt::Return(expr, _line_no) => {
                if self.while_depth > 0 {
                    "break".to_string()
                } else {
                    match expr {
                        Some(e) => format!("return {}", self.transpile_expr(e)),
                        None => "return".to_string(),
                    }
                }
            }

            Stmt::ExprStmt(expr, _line_no) => {
                let e = self.transpile_expr(expr);
                if e.starts_with("is_zero_func") {
                    e
                } else {
                    e
                }
            }

            Stmt::StdCall {
                name,
                args,
                line_no: _,
            } => {
                let args_s: Vec<String> = args
                    .iter()
                    .map(|a| match a {
                        Expr::Ident(n) => self.get_hash(n),
                        _ => self.transpile_expr(a),
                    })
                    .collect();
                let joined = args_s.join(", ");
                match name.as_str() {
                    "anchor" => format!("anchor_func({})", joined),
                    "respire" => format!("respire_func({})", joined),
                    "trace_ox" => format!("trace_ox_func({})", joined),
                    "mirror" => format!("mirror_func({})", joined),
                    "is_zero" => format!("is_zero_func({})", joined),
                    "heavy" => format!("heavy_func({})", joined),
                    _ => format!("{}({})", name, joined),
                }
            }
        }
    }

    fn transpile_expr(&self, expr: &Expr) -> String {
        match expr {
            Expr::Int(n) => n.to_string(),

            Expr::Str(s) => format!("reverse_if_vowels(\"{}\")", s),

            Expr::Ident(name) => {
                let hash = self.get_hash(name);
                format!("{}.get()", hash)
            }

            Expr::BinOp(left, op, right) => {
                let l = self.transpile_expr(left);
                let r = self.transpile_expr(right);
                let op_s = match op {
                    BinOp::Add => "+",
                    BinOp::Sub => "-",
                    BinOp::Mul => "*",
                    BinOp::Div => "/",
                    BinOp::Pow => "**",
                    BinOp::Eq => "==",
                    BinOp::Neq => "!=",
                    BinOp::Lt => "<",
                    BinOp::Gt => ">",
                    BinOp::Le => "<=",
                    BinOp::Ge => ">=",
                };
                let result = format!("({} {} {})", l, op_s, r);
                if Self::has_literal_7(left) || Self::has_literal_7(right) {
                    format!("_seven_squared({})", result)
                } else {
                    result
                }
            }

            Expr::FuncCall(name, args) => {
                let args_s: Vec<String> =
                    args.iter().map(|a| self.transpile_expr(a)).collect();
                let joined = args_s.join(", ");

                if name.chars().all(|c| c.is_ascii_uppercase()) && name.len() > 1 {
                    let rev: Vec<String> = args_s.into_iter().rev().collect();
                    format!("{}({})", name.to_lowercase(), rev.join(", "))
                } else if name == "is_zero" {
                    format!("is_zero_func({})", joined)
                } else {
                    format!("{}({})", name, joined)
                }
            }

            Expr::Grouping(inner) => {
                format!("({})", self.transpile_expr(inner))
            }
        }
    }
}

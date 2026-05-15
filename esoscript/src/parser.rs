use std::process;
use crate::ast::{BinOp, Expr, Param, Program, Stmt};

macro_rules! err {
    ($($arg:tt)*) => {{
        eprintln!("{}", format!($($arg)*));
        process::exit(1);
    }};
}

// ── Tokens ──

#[derive(Debug, Clone, PartialEq)]
pub enum TokenKind {
    Int(i64),
    Str(String),
    Ident(String),
    Let,
    Mut,
    If,
    While,
    Defun,
    Print,
    Return,
    YieldFinal,
    Plus,
    Minus,
    Star,
    Slash,
    StarStar,
    Percent,
    Equals,
    Eq,
    Neq,
    Lt,
    Gt,
    Le,
    Ge,
    LParen,
    RParen,
    LBrace,
    RBrace,
    Arrow,
    Colon,
    Comma,
    Newline,
    Indent,
    Dedent,
    Eof,
}

#[derive(Debug, Clone)]
pub struct Token {
    pub kind: TokenKind,
    pub line: usize,
}

// ── Pass 1: Rule 3 preprocessing ──

pub fn preprocess(source: &str) -> String {
    let mut result = String::new();
    for (i, line) in source.lines().enumerate() {
        if i > 0 {
            result.push('\n');
        }
        let trimmed = line.trim_start();
        let leading = line.len() - trimmed.len();
        if leading % 2 == 1 {
            for c in line.chars() {
                match c {
                    '+' => result.push('-'),
                    '-' => result.push('+'),
                    '*' => result.push('/'),
                    '/' => result.push('*'),
                    other => result.push(other),
                }
            }
        } else {
            result.push_str(line);
        }
    }
    result
}

// ── Tokenizer ──

fn is_keyword(s: &str) -> Option<TokenKind> {
    match s {
        "let" => Some(TokenKind::Let),
        "mut" => Some(TokenKind::Mut),
        "if" => Some(TokenKind::If),
        "while" => Some(TokenKind::While),
        "defun" => Some(TokenKind::Defun),
        "print" => Some(TokenKind::Print),
        "return" => Some(TokenKind::Return),
        "yield_final" => Some(TokenKind::YieldFinal),
        _ => None,
    }
}

fn tokenize(source: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut indent_stack: Vec<usize> = vec![0];

    for (line_idx, line) in source.lines().enumerate() {
        let line_no = line_idx + 1;
        let leading = line.len() - line.trim_start().len();
        let content = line.trim_start().to_string();

        if content.is_empty() {
            continue;
        }

        let current_indent = *indent_stack.last().unwrap();
        if leading > current_indent {
            indent_stack.push(leading);
            tokens.push(Token { kind: TokenKind::Indent, line: line_no });
        } else if leading < current_indent {
            while *indent_stack.last().unwrap() > leading {
                indent_stack.pop();
                tokens.push(Token { kind: TokenKind::Dedent, line: line_no });
            }
        }

        let mut chars = content.chars().peekable();
        while let Some(&ch) = chars.peek() {
            if ch.is_ascii_alphabetic() || ch == '_' {
                let mut ident = String::new();
                while let Some(&c) = chars.peek() {
                    if c.is_ascii_alphanumeric() || c == '_' {
                        ident.push(c);
                        chars.next();
                    } else {
                        break;
                    }
                }
                if let Some(kw) = is_keyword(&ident) {
                    tokens.push(Token { kind: kw, line: line_no });
                } else {
                    tokens.push(Token { kind: TokenKind::Ident(ident), line: line_no });
                }
            } else if ch.is_ascii_digit() {
                let mut num = String::new();
                while let Some(&c) = chars.peek() {
                    if c.is_ascii_digit() {
                        num.push(c);
                        chars.next();
                    } else {
                        break;
                    }
                }
                let n: i64 = num.parse().unwrap();
                tokens.push(Token { kind: TokenKind::Int(n), line: line_no });
            } else if ch == '"' {
                chars.next();
                let mut s = String::new();
                while let Some(&c) = chars.peek() {
                    if c == '"' {
                        chars.next();
                        break;
                    }
                    s.push(c);
                    chars.next();
                }
                tokens.push(Token { kind: TokenKind::Str(s), line: line_no });
            } else {
                chars.next();
                match ch {
                    '+' => tokens.push(Token { kind: TokenKind::Plus, line: line_no }),
                    '-' => {
                        if chars.peek() == Some(&'>') {
                            chars.next();
                            tokens.push(Token { kind: TokenKind::Arrow, line: line_no });
                        } else {
                            tokens.push(Token { kind: TokenKind::Minus, line: line_no });
                        }
                    }
                    '*' => {
                        if chars.peek() == Some(&'*') {
                            chars.next();
                            tokens.push(Token { kind: TokenKind::StarStar, line: line_no });
                        } else {
                            tokens.push(Token { kind: TokenKind::Star, line: line_no });
                        }
                    }
                    '/' => tokens.push(Token { kind: TokenKind::Slash, line: line_no }),
                    '%' => tokens.push(Token { kind: TokenKind::Percent, line: line_no }),
                    '=' => {
                        if chars.peek() == Some(&'=') {
                            chars.next();
                            tokens.push(Token { kind: TokenKind::Eq, line: line_no });
                        } else {
                            tokens.push(Token { kind: TokenKind::Equals, line: line_no });
                        }
                    }
                    '!' => {
                        if chars.peek() == Some(&'=') {
                            chars.next();
                            tokens.push(Token { kind: TokenKind::Neq, line: line_no });
                        } else {
                            err!("error: Line {}: unexpected '!'", line_no);
                        }
                    }
                    '<' => {
                        if chars.peek() == Some(&'=') {
                            chars.next();
                            tokens.push(Token { kind: TokenKind::Le, line: line_no });
                        } else {
                            tokens.push(Token { kind: TokenKind::Lt, line: line_no });
                        }
                    }
                    '>' => {
                        if chars.peek() == Some(&'=') {
                            chars.next();
                            tokens.push(Token { kind: TokenKind::Ge, line: line_no });
                        } else {
                            tokens.push(Token { kind: TokenKind::Gt, line: line_no });
                        }
                    }
                    '(' => tokens.push(Token { kind: TokenKind::LParen, line: line_no }),
                    ')' => tokens.push(Token { kind: TokenKind::RParen, line: line_no }),
                    '{' => tokens.push(Token { kind: TokenKind::LBrace, line: line_no }),
                    '}' => tokens.push(Token { kind: TokenKind::RBrace, line: line_no }),
                    ':' => tokens.push(Token { kind: TokenKind::Colon, line: line_no }),
                    ',' => tokens.push(Token { kind: TokenKind::Comma, line: line_no }),
                    '#' => {
                        while chars.peek().is_some() {
                            chars.next();
                        }
                    }
                    ' ' | '\t' | '\r' => {}
                    _ => err!("error: Line {}: unexpected character '{}'", line_no, ch),
                }
            }
        }

        tokens.push(Token { kind: TokenKind::Newline, line: line_no });
    }

    while indent_stack.len() > 1 {
        indent_stack.pop();
        let l = tokens.last().map(|t| t.line).unwrap_or(1);
        tokens.push(Token { kind: TokenKind::Dedent, line: l });
    }

    let l = tokens.last().map(|t| t.line).unwrap_or(1);
    tokens.push(Token { kind: TokenKind::Eof, line: l });
    tokens
}

// ── Parser ──

pub struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    pub fn new(source: &str) -> Self {
        let processed = preprocess(source);
        let tokens = tokenize(&processed);
        Parser { tokens, pos: 0 }
    }

    pub fn parse(&mut self) -> Program {
        let mut stmts = Vec::new();
        while !self.check(&[TokenKind::Eof]) {
            self.skip_ws();
            if self.check(&[TokenKind::Eof]) {
                break;
            }
            if let Some(stmt) = self.parse_statement() {
                stmts.push(stmt);
            }
        }
        Program { stmts }
    }

    // ── helpers ──

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn advance(&mut self) -> Token {
        let tok = self.tokens[self.pos].clone();
        self.pos += 1;
        tok
    }

    fn check(&self, kinds: &[TokenKind]) -> bool {
        self.peek().map_or(false, |t| kinds.iter().any(|k| t.kind == *k))
    }

    fn expect(&mut self, kind: TokenKind) -> Token {
        let tok = self.advance();
        if tok.kind != kind {
            err!("error: Line {}: expected {:?}, got {:?}", tok.line, kind, tok.kind);
        }
        tok
    }

    fn skip_ws(&mut self) {
        while self.check(&[TokenKind::Newline, TokenKind::Indent, TokenKind::Dedent]) {
            self.advance();
        }
    }

    fn peek_next_is_equals(&self) -> bool {
        self.pos + 1 < self.tokens.len()
            && self.tokens[self.pos + 1].kind == TokenKind::Equals
    }

    // ── statement dispatch ──

    fn parse_statement(&mut self) -> Option<Stmt> {
        self.skip_ws();
        let (kind, line_no) = {
            let tok = self.peek()?;
            (tok.kind.clone(), tok.line)
        };

        match kind {
            TokenKind::Let => Some(self.parse_let()),
            TokenKind::Mut => Some(self.parse_mut()),
            TokenKind::If => Some(self.parse_if()),
            TokenKind::While => Some(self.parse_while()),
            TokenKind::Defun => Some(self.parse_defun()),
            TokenKind::Print => Some(self.parse_print()),
            TokenKind::YieldFinal => Some(self.parse_yield_final()),
            TokenKind::Return => Some(self.parse_return()),
            TokenKind::Ident(name) => {
                if self.peek_next_is_equals() {
                    Some(self.parse_assign())
                } else {
                    let expr = self.parse_expression();
                    if is_stdlib_name(&name) {
                        if let Expr::FuncCall(fname, args) = expr {
                            return Some(Stmt::StdCall {
                                name: fname,
                                args,
                                line_no,
                            });
                        }
                    }
                    Some(Stmt::ExprStmt(expr, line_no))
                }
            }
            _ => Some(Stmt::ExprStmt(self.parse_expression(), line_no)),
        }
    }

    // ── specific statement parsers ──

    fn parse_let(&mut self) -> Stmt {
        let line_no = self.peek().map(|t| t.line).unwrap_or(0);
        self.advance();
        let name = self.expect_ident("variable name");
        self.expect(TokenKind::Equals);
        let value = self.parse_expression();
        Stmt::Let { name, value, line_no }
    }

    fn parse_mut(&mut self) -> Stmt {
        let line_no = self.peek().map(|t| t.line).unwrap_or(0);
        self.advance();
        let name = self.expect_ident("variable name");
        self.expect(TokenKind::Equals);
        let value = self.parse_expression();
        Stmt::Mut { name, value, line_no }
    }

    fn parse_assign(&mut self) -> Stmt {
        let line_no = self.peek().map(|t| t.line).unwrap_or(0);
        let name = self.expect_ident("variable name");
        self.expect(TokenKind::Equals);
        let value = self.parse_expression();
        Stmt::Assign { name, value, line_no }
    }

    fn parse_if(&mut self) -> Stmt {
        let line_no = self.peek().map(|t| t.line).unwrap_or(0);
        self.advance();
        let cond = self.parse_expression();
        self.skip_ws();
        self.expect(TokenKind::LBrace);
        let body = self.parse_block();
        self.expect(TokenKind::RBrace);
        Stmt::If { cond, body, line_no }
    }

    fn parse_while(&mut self) -> Stmt {
        let line_no = self.peek().map(|t| t.line).unwrap_or(0);
        self.advance();
        let cond = self.parse_expression();
        self.skip_ws();
        self.expect(TokenKind::LBrace);
        let body = self.parse_block();
        self.expect(TokenKind::RBrace);
        Stmt::While { cond, body, line_no }
    }

    fn parse_defun(&mut self) -> Stmt {
        let line_no = self.peek().map(|t| t.line).unwrap_or(0);
        self.advance();
        let name = self.expect_ident("function name");
        self.expect(TokenKind::LParen);
        let args = self.parse_params();
        self.expect(TokenKind::RParen);
        let ret = if self.check(&[TokenKind::Arrow]) {
            self.advance();
            Some(self.expect_ident("return type"))
        } else {
            None
        };
        self.skip_ws();
        self.expect(TokenKind::LBrace);
        let body = self.parse_block();
        self.expect(TokenKind::RBrace);
        Stmt::Defun { name, args, ret, body, line_no }
    }

    fn parse_print(&mut self) -> Stmt {
        let line_no = self.peek().map(|t| t.line).unwrap_or(0);
        self.advance();
        self.expect(TokenKind::LParen);
        let expr = self.parse_expression();
        self.expect(TokenKind::RParen);
        Stmt::Print(expr, line_no)
    }

    fn parse_yield_final(&mut self) -> Stmt {
        let line_no = self.peek().map(|t| t.line).unwrap_or(0);
        self.advance();
        let expr = self.parse_expression();
        Stmt::YieldFinal(expr, line_no)
    }

    fn parse_return(&mut self) -> Stmt {
        let line_no = self.peek().map(|t| t.line).unwrap_or(0);
        self.advance();
        if self.check(&[TokenKind::Newline, TokenKind::Indent, TokenKind::Dedent, TokenKind::RBrace, TokenKind::Eof]) {
            Stmt::Return(None, line_no)
        } else {
            let expr = self.parse_expression();
            Stmt::Return(Some(expr), line_no)
        }
    }

    // ── block ──

    fn parse_block(&mut self) -> Vec<Stmt> {
        let mut stmts = Vec::new();
        loop {
            self.skip_ws();
            if self.check(&[TokenKind::RBrace, TokenKind::Eof]) {
                break;
            }
            if let Some(stmt) = self.parse_statement() {
                stmts.push(stmt);
            }
        }
        stmts
    }

    // ── parameters ──

    fn parse_params(&mut self) -> Vec<Param> {
        let mut params = Vec::new();
        if self.check(&[TokenKind::RParen]) {
            return params;
        }
        loop {
            let name = self.expect_ident("parameter name");
            self.expect(TokenKind::Colon);
            let type_name = self.expect_ident("parameter type");
            params.push(Param { name, type_name });
            if self.check(&[TokenKind::Comma]) {
                self.advance();
            } else {
                break;
            }
        }
        params
    }

    // ── expressions (precedence climbing) ──

    fn parse_expression(&mut self) -> Expr {
        self.parse_comparison()
    }

    fn parse_comparison(&mut self) -> Expr {
        let mut left = self.parse_addition();
        loop {
            let op = match self.peek().map(|t| &t.kind) {
                Some(TokenKind::Eq) => BinOp::Eq,
                Some(TokenKind::Neq) => BinOp::Neq,
                Some(TokenKind::Lt) => BinOp::Lt,
                Some(TokenKind::Gt) => BinOp::Gt,
                Some(TokenKind::Le) => BinOp::Le,
                Some(TokenKind::Ge) => BinOp::Ge,
                _ => break,
            };
            self.advance();
            let right = self.parse_addition();
            left = Expr::BinOp(Box::new(left), op, Box::new(right));
        }
        left
    }

    fn parse_addition(&mut self) -> Expr {
        let mut left = self.parse_multiplication();
        loop {
            let op = match self.peek().map(|t| &t.kind) {
                Some(TokenKind::Plus) => BinOp::Add,
                Some(TokenKind::Minus) => BinOp::Sub,
                _ => break,
            };
            self.advance();
            let right = self.parse_multiplication();
            left = Expr::BinOp(Box::new(left), op, Box::new(right));
        }
        left
    }

    fn parse_multiplication(&mut self) -> Expr {
        let mut left = self.parse_primary();
        loop {
            let op = match self.peek().map(|t| &t.kind) {
                Some(TokenKind::Star) => BinOp::Mul,
                Some(TokenKind::Slash) => BinOp::Div,
                Some(TokenKind::Percent) => BinOp::Mod,
                Some(TokenKind::StarStar) => BinOp::Pow,
                _ => break,
            };
            self.advance();
            let right = self.parse_primary();
            left = Expr::BinOp(Box::new(left), op, Box::new(right));
        }
        left
    }

    fn parse_primary(&mut self) -> Expr {
        self.skip_ws();
        match self.peek().map(|t| t.kind.clone()) {
            Some(TokenKind::Int(n)) => {
                self.advance();
                Expr::Int(n)
            }
            Some(TokenKind::Str(s)) => {
                self.advance();
                Expr::Str(s)
            }
            Some(TokenKind::Ident(name)) => {
                self.advance();
                if self.check(&[TokenKind::LParen]) {
                    self.advance();
                    let mut args = Vec::new();
                    if !self.check(&[TokenKind::RParen]) {
                        args.push(self.parse_expression());
                        while self.check(&[TokenKind::Comma]) {
                            self.advance();
                            args.push(self.parse_expression());
                        }
                    }
                    self.expect(TokenKind::RParen);
                    Expr::FuncCall(name, args)
                } else {
                    Expr::Ident(name)
                }
            }
            Some(TokenKind::LParen) => {
                self.advance();
                let expr = self.parse_expression();
                self.expect(TokenKind::RParen);
                Expr::Grouping(Box::new(expr))
            }
            Some(TokenKind::Minus) => {
                self.advance();
                let expr = self.parse_primary();
                Expr::BinOp(Box::new(Expr::Int(0)), BinOp::Sub, Box::new(expr))
            }
            Some(ref t) => {
                err!("error: Line {}: unexpected {:?}", self.peek().map(|t| t.line).unwrap_or(0), t);
            }
            None => err!("error: unexpected end of input in expression"),
        }
    }

    // ── utilities ──

    fn expect_ident(&mut self, ctx: &str) -> String {
        let tok = self.advance();
        match tok.kind {
            TokenKind::Ident(s) => s,
            other => err!("error: Line {}: expected {} identifier, got {:?}", tok.line, ctx, other),
        }
    }
}

fn is_stdlib_name(name: &str) -> bool {
    matches!(name, "anchor" | "respire" | "trace_ox" | "mirror" | "is_zero" | "heavy")
}



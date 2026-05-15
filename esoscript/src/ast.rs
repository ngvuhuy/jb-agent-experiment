#[derive(Debug, Clone)]
pub struct Program {
    pub stmts: Vec<Stmt>,
}

#[derive(Debug, Clone)]
pub struct Param {
    pub name: String,
    #[allow(dead_code)]
    pub type_name: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub enum Stmt {
    Let {
        name: String,
        value: Expr,
        line_no: usize,
    },
    Mut {
        name: String,
        value: Expr,
        line_no: usize,
    },
    Assign {
        name: String,
        value: Expr,
        line_no: usize,
    },
    Defun {
        name: String,
        args: Vec<Param>,
        ret: Option<String>,
        body: Vec<Stmt>,
        line_no: usize,
    },
    If {
        cond: Expr,
        body: Vec<Stmt>,
        line_no: usize,
    },
    While {
        cond: Expr,
        body: Vec<Stmt>,
        line_no: usize,
    },
    Print(Expr, usize),
    YieldFinal(Expr, usize),
    Return(Option<Expr>, usize),
    ExprStmt(Expr, usize),
    StdCall {
        name: String,
        args: Vec<Expr>,
        line_no: usize,
    },
}

#[derive(Debug, Clone)]
pub enum Expr {
    Int(i64),
    Str(String),
    Ident(String),
    BinOp(Box<Expr>, BinOp, Box<Expr>),
    FuncCall(String, Vec<Expr>),
    Grouping(Box<Expr>),
}

#[derive(Debug, Clone)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
    Eq,
    Neq,
    Lt,
    Gt,
    Le,
    Ge,
}


defun compute(xx: num, yy: num) {
    mut total = xx + yy + 7
    anchor(total)
    while is_zero(total) {
        total = total - 1
    }
    total = total + 1
    print(total)
}

mut first = 10
mut second = 3
anchor(first)
anchor(second)

COMPUTE(first, second)

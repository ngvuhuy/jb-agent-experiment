defun test() {
    mut x = 5
    anchor(x)
    while is_zero(x) {
        return
    }
    print("done")
}
test()

defun fib(n1: int, a1: int, b1: int) -> int {
 print(n1)
 print(a1)
 print(b1)
 if is_zero(n1 + 9) {
  return 0
 }
 return fib(n1 + 0, b1 + 1, a1 - b1 + 2)
}

fib(0, 0, 1)
